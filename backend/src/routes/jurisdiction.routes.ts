/**
 * VeriVote Kenya — Election Jurisdiction Tree Routes
 *
 * GET    /api/jurisdictions/:electionId                  — full tree for an election
 * POST   /api/jurisdictions/:electionId                  — create a tree node
 * PATCH  /api/jurisdictions/node/:jid                    — update node (name, level, order, person-in-charge, polling station)
 * DELETE /api/jurisdictions/node/:jid                    — delete leaf node
 * POST   /api/jurisdictions/:electionId/:jid/positions   — add a position to a node
 * PATCH  /api/jurisdictions/node/:jid/assign-officer     — assign/remove person in charge
 * PATCH  /api/jurisdictions/node/:jid/assign-station     — link a PollingStation to a leaf node
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import { adminRateLimiter } from '../middleware/rate-limit.middleware.js';
import { ServiceError } from '../services/voter.service.js';
import * as svc from '../services/election-mgmt.service.js';
import type { AuthenticatedRequest, StaffRole } from '../types/auth.types.js';

const router: Router = Router();
router.use(adminRateLimiter, requireAuth, requireAdmin);

// Commission + all RO roles can read/write ballot structures
const ballotWrite = requireStaffRole(
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO',
);

/**
 * Scope-based permission check for ballot operations.
 * Returns an error string if denied, null if allowed.
 */
function checkScopePermission(req: Request, scope: string, scopeValue?: string | null): string | null {
  const authReq = req as AuthenticatedRequest;
  const role    = authReq.voter?.staffRole ?? '';
  const jv      = authReq.voter?.jurisdictionValue ?? null;

  const commissionTier = new Set<StaffRole>([
    'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  ]);
  if (commissionTier.has(role as StaffRole) || role === 'NATIONAL_RO') return null;

  if (role === 'COUNTY_RO') {
    if (!['COUNTY', 'CONSTITUENCY', 'WARD', 'CUSTOM'].includes(scope))
      return 'County Returning Officers can only manage county-level or lower scope positions.';
    if (!jv)
      return 'Your account has no jurisdiction assigned. Contact your administrator.';
    if (scope === 'COUNTY') {
      if (!scopeValue)
        return 'County-scope positions require an explicit county name (scopeValue).';
      if (scopeValue.toLowerCase() !== jv.toLowerCase())
        return `You can only manage positions in your county (${jv}).`;
    }
    return null;
  }

  if (role === 'CONSTITUENCY_RO') {
    if (!['CONSTITUENCY', 'WARD', 'CUSTOM'].includes(scope))
      return 'Constituency Returning Officers can only manage constituency or ward scope positions.';
    if (!jv)
      return 'Your account has no jurisdiction assigned. Contact your administrator.';
    if (scope === 'CONSTITUENCY') {
      if (!scopeValue)
        return 'Constituency-scope positions require an explicit constituency name (scopeValue).';
      if (scopeValue.toLowerCase() !== jv.toLowerCase())
        return `You can only manage positions in your constituency (${jv}).`;
    }
    return null;
  }

  return 'Insufficient permissions for this ballot operation.';
}

function handleError(err: unknown, res: Response) {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}

const JURISDICTION_LEVELS = ['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION'] as const;

const nodeSchema = z.object({
  name:             z.string().min(1).max(255),
  level:            z.enum(JURISDICTION_LEVELS).optional(),
  parentId:         z.string().uuid().optional(),
  orderIndex:       z.number().int().min(0).optional(),
  personInChargeId: z.string().uuid().nullable().optional(),
  pollingStationId: z.string().uuid().nullable().optional(),
});

const positionSchema = z.object({
  title:            z.string().min(2).max(255),
  description:      z.string().optional(),
  scope:            z.enum(['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'CUSTOM']),
  scopeValue:       z.string().optional(),
  maxVotesPerVoter: z.number().int().min(1).default(1),
  orderIndex:       z.number().int().min(0).default(0),
});

// GET /api/jurisdictions/:electionId — full tree including person-in-charge and polling station
router.get('/:electionId', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await svc.listJurisdictions(req.params.electionId) });
  } catch (e) { handleError(e, res); }
});

// POST /api/jurisdictions/:electionId — create node
router.post('/:electionId', ballotWrite, async (req: Request, res: Response) => {
  const parsed = nodeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    res.status(201).json({ success: true, data: await svc.createJurisdiction(req.params.electionId, parsed.data) });
  } catch (e) { handleError(e, res); }
});

// PATCH /api/jurisdictions/node/:jid — update name, level, order, person-in-charge, or polling station link
router.patch('/node/:jid', ballotWrite, async (req: Request, res: Response) => {
  const parsed = z.object({
    name:             z.string().min(1).max(255).optional(),
    level:            z.enum(JURISDICTION_LEVELS).nullable().optional(),
    orderIndex:       z.number().int().min(0).optional(),
    personInChargeId: z.string().uuid().nullable().optional(),
    pollingStationId: z.string().uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    res.json({ success: true, data: await svc.updateJurisdiction(req.params.jid, parsed.data) });
  } catch (e) { handleError(e, res); }
});

// PATCH /api/jurisdictions/node/:jid/assign-officer — assign or remove person in charge
router.patch('/node/:jid/assign-officer', ballotWrite, async (req: Request, res: Response) => {
  const parsed = z.object({
    // null = remove assignment, string UUID = assign this staff member
    personInChargeId: z.string().uuid().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    const node = await svc.updateJurisdiction(req.params.jid, { personInChargeId: parsed.data.personInChargeId });
    res.json({ success: true, data: node });
  } catch (e) { handleError(e, res); }
});

// PATCH /api/jurisdictions/node/:jid/assign-station — link a PollingStation to a leaf node
router.patch('/node/:jid/assign-station', ballotWrite, async (req: Request, res: Response) => {
  const parsed = z.object({
    pollingStationId: z.string().uuid().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    const node = await svc.updateJurisdiction(req.params.jid, { pollingStationId: parsed.data.pollingStationId });
    res.json({ success: true, data: node });
  } catch (e) { handleError(e, res); }
});

// DELETE /api/jurisdictions/node/:jid — delete leaf node (must have no children or positions)
router.delete('/node/:jid', ballotWrite, async (req: Request, res: Response) => {
  try {
    await svc.deleteJurisdiction(req.params.jid);
    res.json({ success: true });
  } catch (e) { handleError(e, res); }
});

// POST /api/jurisdictions/:electionId/:jid/positions — add position to a node
router.post('/:electionId/:jid/positions', ballotWrite, async (req: Request, res: Response) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const scopeErr = checkScopePermission(req, parsed.data.scope, parsed.data.scopeValue);
  if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
  try {
    res.status(201).json({
      success: true,
      data: await svc.createPositionInJurisdiction(req.params.electionId, req.params.jid, parsed.data),
    });
  } catch (e) { handleError(e, res); }
});

export default router;
