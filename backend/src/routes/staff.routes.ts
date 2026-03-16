/**
 * VeriVote Kenya — IEBC Staff Management Routes
 *
 * POST   /api/staff           — Create staff member (COMMISSIONER only)
 * GET    /api/staff           — List staff (all ADMIN users)
 * GET    /api/staff/me        — Get current user's staff record
 * GET    /api/staff/:id       — Get single staff record
 * PATCH  /api/staff/:id       — Update role/jurisdiction (COMMISSIONER only)
 * DELETE /api/staff/:id       — Deactivate (COMMISSIONER only)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import {
  createStaff, getStaffById, getStaffByVoterId, listStaff, updateStaff, deactivateStaff,
} from '../services/staff.service.js';
import { ServiceError } from '../services/voter.service.js';
import { prisma } from '../database/client.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const staffSchema = z.object({
  nationalId:        z.string().min(1),
  staffRole:         z.enum(['COMMISSIONER','NATIONAL_RO','COUNTY_RO','CONSTITUENCY_RO','PRESIDING_OFFICER','ICT_ADMIN','OBSERVER']),
  jurisdictionLevel: z.enum(['NATIONAL','COUNTY','CONSTITUENCY','WARD','POLLING_STATION']),
  jurisdictionValue: z.string().optional(),
  pollingStationId:  z.string().uuid().optional(),
});

const updateSchema = z.object({
  staffRole:         z.enum(['COMMISSIONER','NATIONAL_RO','COUNTY_RO','CONSTITUENCY_RO','PRESIDING_OFFICER','ICT_ADMIN','OBSERVER']).optional(),
  jurisdictionLevel: z.enum(['NATIONAL','COUNTY','CONSTITUENCY','WARD','POLLING_STATION']).optional(),
  jurisdictionValue: z.string().nullable().optional(),
  isActive:          z.boolean().optional(),
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

// POST /api/staff  — COMMISSIONER only
router.post('/', requireStaffRole('COMMISSIONER'), async (req: Request, res: Response) => {
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

// PATCH /api/staff/:id  — COMMISSIONER only
router.patch('/:id', requireStaffRole('COMMISSIONER'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const updated = await updateStaff(req.params.id, parsed.data as any);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/staff/:id  — COMMISSIONER only
router.delete('/:id', requireStaffRole('COMMISSIONER'), async (req: Request, res: Response) => {
  try {
    await deactivateStaff(req.params.id);
    res.json({ success: true, message: 'Staff member deactivated' });
  } catch (err) {
    if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
