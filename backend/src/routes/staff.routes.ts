/**
 * VeriVote Kenya — IEBC Staff Management Routes
 *
 * POST   /api/staff           — Create staff member (senior commission roles)
 * GET    /api/staff           — List staff (all ADMIN users)
 * GET    /api/staff/me        — Get current user's staff record
 * GET    /api/staff/dashboard — Get role-scoped dashboard data for logged-in staff
 * GET    /api/staff/:id       — Get single staff record
 * PATCH  /api/staff/:id       — Update role/jurisdiction (senior commission roles)
 * DELETE /api/staff/:id       — Deactivate (senior commission roles)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import {
  createStaff, getStaffById, getStaffByVoterId, listStaff, updateStaff, deactivateStaff,
  getStaffDashboard,
} from '../services/staff.service.js';
import { ServiceError } from '../services/voter.service.js';
import { prisma } from '../database/client.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';
import { STAFF_MANAGE_ROLES } from '../types/auth.types.js';

const router: Router = Router();
router.use(requireAuth, requireAdmin);

const ALL_ROLES = [
  'CHAIRPERSON','COMMISSIONER','COMMISSION_SECRETARY','DEPUTY_COMMISSION_SECRETARY',
  'DIRECTOR','MANAGER','NATIONAL_RO','ICT_ADMIN',
  'REGIONAL_COORDINATOR','COUNTY_RO','CONSTITUENCY_RO',
  'PRESIDING_OFFICER','DEPUTY_PRESIDING_OFFICER','POLLING_CLERK','SECURITY_OFFICER',
  'OBSERVER',
] as const;

const staffSchema = z.object({
  nationalId:        z.string().min(1),
  staffRole:         z.enum(ALL_ROLES),
  jurisdictionLevel: z.enum(['NATIONAL','COUNTY','CONSTITUENCY','WARD','POLLING_STATION']),
  jurisdictionValue: z.string().optional(),
  department:        z.string().max(100).optional(),
  pollingStationId:  z.string().uuid().optional(),
});

const updateSchema = z.object({
  staffRole:         z.enum(ALL_ROLES).optional(),
  jurisdictionLevel: z.enum(['NATIONAL','COUNTY','CONSTITUENCY','WARD','POLLING_STATION']).optional(),
  jurisdictionValue: z.string().nullable().optional(),
  department:        z.string().max(100).nullable().optional(),
  isActive:          z.boolean().optional(),
});

// GET /api/staff/dashboard — role-scoped dashboard data for the logged-in staff member
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.voter.staffRole) {
      res.status(403).json({ success: false, error: 'No staff role assigned' });
      return;
    }
    // Fetch pollingStationId from the DB record (not in JWT) to get fresh data
    const staffRecord = await prisma.iebcStaff.findUnique({ where: { voterId: authReq.voter.sub } });
    const data = await getStaffDashboard(
      authReq.voter.staffRole,
      authReq.voter.jurisdictionValue ?? null,
      staffRecord?.pollingStationId ?? null,
      (staffRecord as any)?.department ?? authReq.voter.department ?? null,
    );
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/staff/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const record = await getStaffByVoterId(authReq.voter.sub);
    res.json({ success: true, data: record ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/staff
router.get('/', async (req: Request, res: Response) => {
  try {
    const staffRole         = req.query.staffRole         as string | undefined;
    const jurisdictionLevel = req.query.jurisdictionLevel as string | undefined;
    const jurisdictionValue = req.query.jurisdictionValue as string | undefined;
    const isActive          = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    const list = await listStaff({ staffRole, jurisdictionLevel, jurisdictionValue, isActive } as any);
    res.json({ success: true, data: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/staff/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const record = await getStaffById(req.params.id);
    if (!record) { res.status(404).json({ success: false, error: 'Staff not found' }); return; }
    res.json({ success: true, data: record });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/staff  — senior commission roles
router.post('/', requireStaffRole(...STAFF_MANAGE_ROLES), async (req: Request, res: Response) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const authReq = req as AuthenticatedRequest;
    // Look up creator's staff record fresh from DB (JWT may be stale after re-seed)
    const creatorRecord = await prisma.iebcStaff.findUnique({ where: { voterId: authReq.voter.sub } });
    const creatorStaff = creatorRecord?.id ?? null;
    // Look up voter by nationalId
    const voter = await prisma.voter.findUnique({ where: { nationalId: parsed.data.nationalId } });
    if (!voter) { res.status(404).json({ success: false, error: 'Voter not found with that national ID' }); return; }
    // Promote to ADMIN if needed
    if (voter.role !== 'ADMIN') {
      await prisma.voter.update({ where: { id: voter.id }, data: { role: 'ADMIN' as any } });
    }
    const staff = await createStaff({
      voterId:           voter.id,
      staffRole:         parsed.data.staffRole as any,
      jurisdictionLevel: parsed.data.jurisdictionLevel as any,
      jurisdictionValue: parsed.data.jurisdictionValue,
      department:        parsed.data.department,
      pollingStationId:  parsed.data.pollingStationId,
      createdByStaffId:  creatorStaff ?? undefined,
    });
    res.status(201).json({ success: true, data: staff });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

const COMMISSION_TIER_ROLES = new Set([
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
]);

/** Returns 403 if the requester is not CHAIRPERSON and the target is a commission-tier member. */
async function guardCommissionTier(req: Request, res: Response, targetStaffId: string): Promise<boolean> {
  const authReq = req as AuthenticatedRequest;
  const requesterRole = authReq.voter?.staffRole ?? '';
  if (requesterRole === 'CHAIRPERSON') return false; // chairperson may proceed

  const target = await prisma.iebcStaff.findUnique({
    where: { id: targetStaffId },
    select: { staffRole: true },
  });
  if (target && COMMISSION_TIER_ROLES.has(target.staffRole)) {
    res.status(403).json({
      success: false,
      error: 'Only the Chairperson can modify or deactivate commission-tier members.',
    });
    return true; // blocked
  }
  return false;
}

// PATCH /api/staff/:id  — senior commission roles
router.patch('/:id', requireStaffRole(...STAFF_MANAGE_ROLES), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    if (await guardCommissionTier(req, res, req.params.id)) return;
    const updated = await updateStaff(req.params.id, parsed.data as any);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/staff/:id  — senior commission roles; only CHAIRPERSON may deactivate commission-tier members
router.delete('/:id', requireStaffRole(...STAFF_MANAGE_ROLES), async (req: Request, res: Response) => {
  try {
    if (await guardCommissionTier(req, res, req.params.id)) return;
    await deactivateStaff(req.params.id);
    res.json({ success: true, message: 'Staff member deactivated' });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
