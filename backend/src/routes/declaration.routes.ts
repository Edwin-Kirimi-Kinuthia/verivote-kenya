/**
 * VeriVote Kenya — Result Declaration Routes
 *
 * POST  /api/declarations                — Create a draft declaration
 * POST  /api/declarations/:id/declare   — Formally declare results
 * POST  /api/declarations/:id/contest   — Contest a declaration (COMMISSIONER only)
 * GET   /api/declarations               — List declarations (filtered)
 * GET   /api/declarations/:id           — Get single declaration
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import {
  createDeclaration, formallyDeclare, contestDeclaration, listDeclarations, getDeclaration, getPendingDeclarations,
} from '../services/declaration.service.js';
import { ServiceError } from '../services/voter.service.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// ── PUBLIC endpoint — declared results for a given election ───────────────────
// Returns only DECLARED declarations (not DRAFT/CONTESTED/ANNULLED).
// Exposed without auth so the public voter portal can show official results.
router.get('/public/:electionId', async (req: Request, res: Response) => {
  try {
    const declarations = await listDeclarations({
      electionId: req.params.electionId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status:     'DECLARED' as any,
    });
    // Return minimal public-safe fields: position title, scope, candidates, tally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicData = declarations.map((d: any) => ({
      id:                d.id,
      positionId:        d.positionId,
      positionTitle:     d.position?.title,
      positionScope:     d.position?.scope,
      positionScopeValue: d.position?.scopeValue,
      tallySnapshot:     d.tallySnapshot ? JSON.parse(d.tallySnapshot) : null,
      declaredAt:        d.declaredAt,
      jurisdictionLevel: d.jurisdictionLevel,
      jurisdictionValue: d.jurisdictionValue,
    }));
    res.json({ success: true, data: publicData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

router.use(requireAuth, requireAdmin);

// GET /api/declarations
router.get('/', async (req: Request, res: Response) => {
  try {
    const { electionId, positionId, status, jurisdictionValue } = req.query as Record<string, string | undefined>;
    const staffId   = req.query.staffId as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await listDeclarations({ electionId, positionId, staffId, status: status as any, jurisdictionValue });
    res.json({ success: true, data: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/declarations/pending/:electionId — MUST be before /:id to avoid shadowing
router.get(
  '/pending/:electionId',
  requireStaffRole('CHAIRPERSON', 'COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.voter.staffId) {
        res.status(403).json({ success: false, error: 'No staff record found' });
        return;
      }
      const pending = await getPendingDeclarations(
        req.params.electionId,
        authReq.voter.staffId,
      );
      res.json({ success: true, data: pending });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// GET /api/declarations/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const decl = await getDeclaration(req.params.id);
    res.json({ success: true, data: decl });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/declarations
router.post(
  '/',
  requireStaffRole('CHAIRPERSON', 'COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER'),
  async (req: Request, res: Response) => {
    const schema = z.object({
      electionId:    z.string().uuid(),
      positionId:    z.string().uuid(),
      tallySnapshot: z.record(z.number()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.voter.staffId) {
        res.status(403).json({ success: false, error: 'No staff record found for your account' });
        return;
      }
      const decl = await createDeclaration({
        electionId:        parsed.data.electionId,
        positionId:        parsed.data.positionId,
        staffId:           authReq.voter.staffId,
        jurisdictionLevel: authReq.voter.jurisdictionLevel ?? 'NATIONAL',
        jurisdictionValue: authReq.voter.jurisdictionValue ?? null,
        tallySnapshot:     parsed.data.tallySnapshot ? JSON.stringify(parsed.data.tallySnapshot) : undefined,
      });
      res.status(201).json({ success: true, data: decl });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: msg });
    }
  },
);

// POST /api/declarations/:id/declare
router.post(
  '/:id/declare',
  requireStaffRole('CHAIRPERSON', 'COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.voter.staffId) {
        res.status(403).json({ success: false, error: 'No staff record found' });
        return;
      }
      const decl = await formallyDeclare(req.params.id, authReq.voter.staffId);
      res.json({ success: true, data: decl });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: msg });
    }
  },
);

// POST /api/declarations/:id/contest  — COMMISSIONER only
router.post(
  '/:id/contest',
  requireStaffRole('COMMISSIONER'),
  async (req: Request, res: Response) => {
    const parsed = z.object({ reason: z.string().min(10) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'reason must be at least 10 characters' });
      return;
    }
    try {
      const decl = await contestDeclaration(req.params.id, parsed.data.reason);
      res.json({ success: true, data: decl });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: msg });
    }
  },
);

export default router;
