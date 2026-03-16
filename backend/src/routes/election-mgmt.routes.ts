import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { adminRateLimiter } from '../middleware/rate-limit.middleware.js';
import { ServiceError } from '../services/voter.service.js';
import * as svc from '../services/election-mgmt.service.js';

const router: Router = Router();
router.use(adminRateLimiter, requireAuth, requireAdmin);

// ── Validation schemas ────────────────────────────────────────────────────────

const electionSchema = z.object({
  name:        z.string().min(3).max(255),
  description: z.string().optional(),
  type:        z.enum(['GOVERNMENT', 'INSTITUTIONAL', 'CORPORATE', 'CUSTOM']),
  orgName:     z.string().optional(),
  startDate:   z.string().datetime({ offset: true }).optional(),
  endDate:     z.string().datetime({ offset: true }).optional(),
});

const positionSchema = z.object({
  title:            z.string().min(2).max(255),
  description:      z.string().optional(),
  scope:            z.enum(['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'CUSTOM']),
  scopeValue:       z.string().optional(),
  maxVotesPerVoter: z.number().int().min(1).default(1),
  orderIndex:       z.number().int().min(0).default(0),
});

const candidateSchema = z.object({
  name:         z.string().min(2).max(255),
  party:        z.string().max(255).optional(),
  description:  z.string().optional(),
  photoUrl:     z.string().url().optional(),
  ballotNumber: z.number().int().min(1).optional(),
  scopeValue:   z.string().max(255).optional(),
});

function handleError(err: unknown, res: Response) {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}

// ── Elections ─────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const parsed = electionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.status(201).json({ success: true, data: await svc.createElection(parsed.data) }); }
  catch (e) { handleError(e, res); }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await svc.listElections({
      type:   req.query.type   as string | undefined as any,
      status: req.query.status as string | undefined as any,
      page:   req.query.page   ? Number(req.query.page)  : undefined,
      limit:  req.query.limit  ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) { handleError(e, res); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.getElection(req.params.id) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.updateElection(req.params.id, req.body) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  const parsed = z.object({ status: z.enum(['DRAFT','NOMINATIONS','ACTIVE','CLOSED','TALLIED','ARCHIVED']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Invalid status' }); return; }
  try { res.json({ success: true, data: await svc.transitionElectionStatus(req.params.id, parsed.data.status) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try { await svc.deleteElection(req.params.id); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

// ── Positions ─────────────────────────────────────────────────────────────────

router.post('/:id/positions', async (req: Request, res: Response) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.status(201).json({ success: true, data: await svc.createPosition(req.params.id, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/positions/:posId', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.updatePosition(req.params.posId, req.body) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/positions/:posId', async (req: Request, res: Response) => {
  try { await svc.deletePosition(req.params.posId); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

// ── Candidates ────────────────────────────────────────────────────────────────

router.post('/positions/:posId/candidates', async (req: Request, res: Response) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.status(201).json({ success: true, data: await svc.createCandidate(req.params.posId, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/candidates/:candId', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.updateCandidate(req.params.candId, req.body) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/candidates/:candId/deactivate', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.updateCandidate(req.params.candId, { isActive: false }) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/candidates/:candId', async (req: Request, res: Response) => {
  try { await svc.deleteCandidate(req.params.candId); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

// ── Enrollments ───────────────────────────────────────────────────────────────

router.post('/:id/enrollments', async (req: Request, res: Response) => {
  const parsed = z.object({ voterId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'voterId must be a valid UUID' }); return; }
  try { res.status(201).json({ success: true, data: await svc.enrollVoter(req.params.id, parsed.data.voterId) }); }
  catch (e) { handleError(e, res); }
});

router.post('/:id/enrollments/bulk', async (req: Request, res: Response) => {
  const parsed = z.object({ voterIds: z.array(z.string().uuid()).min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.json({ success: true, data: await svc.bulkEnrollVoters(req.params.id, parsed.data.voterIds) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/:id/enrollments/:voterId', async (req: Request, res: Response) => {
  try { await svc.unenrollVoter(req.params.id, req.params.voterId); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

router.get('/:id/enrollments', async (req: Request, res: Response) => {
  try {
    const result = await svc.listEnrollments(
      req.params.id,
      req.query.page  ? Number(req.query.page)  : 1,
      req.query.limit ? Number(req.query.limit) : 50,
    );
    res.json({ success: true, data: result });
  } catch (e) { handleError(e, res); }
});

export default router;
