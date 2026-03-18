/**
 * VeriVote Kenya — Polling Station Routes
 * GET    /api/polling-stations        — paginated list with optional filters & text search
 * GET    /api/polling-stations/nearby — nearest N stations to (lat, lng)
 * GET    /api/polling-stations/countries — distinct countries for diaspora stations
 * GET    /api/polling-stations/counties  — distinct counties (domestic)
 * GET    /api/polling-stations/all    — full list (admin, includes inactive)
 * POST   /api/polling-stations        — create new station (admin)
 * PATCH  /api/polling-stations/:id   — update station details (admin, jurisdiction-scoped)
 * DELETE /api/polling-stations/:id   — delete station (admin, only if no voters/votes)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pollingStationRepository } from '../repositories/index.js';
import { prisma } from '../database/client.js';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// ── Validation schemas ─────────────────────────────────────────────────────────

const createSchema = z.object({
  code:             z.string().min(1).max(20),
  name:             z.string().min(1).max(255),
  county:           z.string().min(1).max(100),
  constituency:     z.string().min(1).max(100),
  ward:             z.string().min(1).max(100),
  address:          z.string().optional(),
  latitude:         z.number().min(-90).max(90).optional(),
  longitude:        z.number().min(-180).max(180).optional(),
  isDiaspora:       z.boolean().optional(),
  country:          z.string().max(100).optional(),
  registeredVoters: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  name:             z.string().min(1).max(255).optional(),
  address:          z.string().nullable().optional(),
  latitude:         z.number().min(-90).max(90).nullable().optional(),
  longitude:        z.number().min(-180).max(180).nullable().optional(),
  county:           z.string().min(1).max(100).optional(),
  constituency:     z.string().min(1).max(100).optional(),
  ward:             z.string().min(1).max(100).optional(),
  country:          z.string().max(100).nullable().optional(),
  isActive:         z.boolean().optional(),
  registeredVoters: z.number().int().min(0).optional(),
  deviceCount:      z.number().int().min(0).optional(),
  printerCount:     z.number().int().min(0).optional(),
  openingTime:      z.coerce.date().nullable().optional(),
  closingTime:      z.coerce.date().nullable().optional(),
});

// GET /api/polling-stations
router.get('/', async (req: Request, res: Response) => {
  try {
    const page  = parseInt(req.query.page  as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const county       = req.query.county       as string | undefined;
    const constituency = req.query.constituency as string | undefined;
    const ward         = req.query.ward         as string | undefined;
    const q            = req.query.q            as string | undefined;
    const country      = req.query.country      as string | undefined;

    const isDiaspora =
      req.query.isDiaspora === 'true'  ? true :
      req.query.isDiaspora === 'false' ? false : undefined;

    const result = await pollingStationRepository.findMany({
      page, limit, county, constituency, ward, q, isDiaspora, country,
      isActive: true,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stations',
    });
  }
});

// GET /api/polling-stations/nearby?lat=...&lng=...&limit=5&isDiaspora=true
router.get('/nearby', async (req: Request, res: Response): Promise<void> => {
  const lat   = parseFloat(req.query.lat   as string);
  const lng   = parseFloat(req.query.lng   as string);
  const limit = parseInt  (req.query.limit as string) || 5;
  const isDiaspora = req.query.isDiaspora === 'true';
  const country    = req.query.country as string | undefined;

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ success: false, error: 'lat and lng are required numbers' });
    return;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ success: false, error: 'Invalid coordinates' });
    return;
  }

  try {
    const stations = await pollingStationRepository.findNearby(lat, lng, Math.min(limit, 20), isDiaspora, country);
    res.json({ success: true, data: stations });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find nearby stations',
    });
  }
});

// GET /api/polling-stations/countries — distinct countries (diaspora)
router.get('/countries', async (_req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (prisma.pollingStation as any).findMany({
      where:    { isDiaspora: true, isActive: true, country: { not: null } },
      select:   { country: true },
      distinct: ['country'],
      orderBy:  { country: 'asc' },
    }) as Array<{ country: string | null }>;
    res.json({ success: true, data: result.map((r) => r.country) });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch countries',
    });
  }
});

// GET /api/polling-stations/counties — distinct domestic counties
router.get('/counties', async (_req: Request, res: Response) => {
  try {
    const counties = await pollingStationRepository.getCounties();
    res.json({ success: true, data: counties });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch counties',
    });
  }
});

// ── Admin write endpoints ──────────────────────────────────────────────────────
// All write operations require ADMIN + an IEBC staff role

const WRITE_ROLES = requireStaffRole(
  'COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER', 'ICT_ADMIN',
);

// GET /api/polling-stations/all — full list including inactive (admin only)
router.get('/all', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page  = parseInt(req.query.page  as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const county       = req.query.county       as string | undefined;
    const constituency = req.query.constituency as string | undefined;
    const ward         = req.query.ward         as string | undefined;
    const q            = req.query.q            as string | undefined;

    const result = await pollingStationRepository.findMany({ page, limit, county, constituency, ward, q });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
  }
});

// GET /api/polling-stations/:id — single station with assigned IEBC staff
router.get('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const station = await (prisma.pollingStation as any).findUnique({
      where: { id: req.params.id },
      include: {
        iebcStaff: {
          where:  { isActive: true },
          select: {
            id: true, staffRole: true, jurisdictionValue: true,
            voter: { select: { nationalId: true, email: true } },
          },
        },
        _count: { select: { voters: true, votes: true } },
      },
    });
    if (!station) { res.status(404).json({ success: false, error: 'Station not found' }); return; }
    res.json({ success: true, data: station });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
  }
});

// POST /api/polling-stations — create new station
router.post('/', requireAuth, requireAdmin, WRITE_ROLES, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  // Jurisdiction check: County/Constituency ROs can only create in their area
  const authReq = req as AuthenticatedRequest;
  const { staffRole, jurisdictionLevel, jurisdictionValue } = authReq.voter;
  if (staffRole === 'COUNTY_RO' && jurisdictionLevel === 'COUNTY') {
    if (parsed.data.county.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
      res.status(403).json({ success: false, error: `You can only create stations in ${jurisdictionValue}` });
      return;
    }
  }
  if (staffRole === 'CONSTITUENCY_RO' && jurisdictionLevel === 'CONSTITUENCY') {
    if (parsed.data.constituency.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
      res.status(403).json({ success: false, error: `You can only create stations in ${jurisdictionValue}` });
      return;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const station = await (prisma.pollingStation as any).create({
      data: {
        code:             parsed.data.code,
        name:             parsed.data.name,
        county:           parsed.data.county,
        constituency:     parsed.data.constituency,
        ward:             parsed.data.ward,
        address:          parsed.data.address ?? null,
        latitude:         parsed.data.latitude ?? null,
        longitude:        parsed.data.longitude ?? null,
        isDiaspora:       parsed.data.isDiaspora ?? false,
        country:          parsed.data.country ?? null,
        registeredVoters: parsed.data.registeredVoters ?? 0,
      },
    });
    res.status(201).json({ success: true, data: station });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create station';
    if (msg.includes('Unique constraint') || msg.includes('unique')) {
      res.status(409).json({ success: false, error: `Station code "${parsed.data.code}" already exists` });
      return;
    }
    res.status(500).json({ success: false, error: msg });
  }
});

// PATCH /api/polling-stations/:id — update station details
router.patch('/:id', requireAuth, requireAdmin, WRITE_ROLES, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  let station: { id: string; county: string; constituency: string } | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    station = await (prisma.pollingStation as any).findUnique({ where: { id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Database error' });
    return;
  }
  if (!station) {
    res.status(404).json({ success: false, error: 'Station not found' });
    return;
  }

  // Jurisdiction check
  const authReq = req as AuthenticatedRequest;
  const { staffRole, jurisdictionLevel, jurisdictionValue } = authReq.voter;
  if (staffRole === 'PRESIDING_OFFICER') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffRecord = await (prisma.iebcStaff as any).findUnique({
      where: { voterId: authReq.voter.sub },
    });
    if (!staffRecord || staffRecord.pollingStationId !== req.params.id) {
      res.status(403).json({ success: false, error: 'You can only update your own assigned polling station' });
      return;
    }
  } else if (staffRole === 'COUNTY_RO' && jurisdictionLevel === 'COUNTY') {
    if (station.county.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
      res.status(403).json({ success: false, error: `You can only update stations in ${jurisdictionValue}` });
      return;
    }
  } else if (staffRole === 'CONSTITUENCY_RO' && jurisdictionLevel === 'CONSTITUENCY') {
    if (station.constituency.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
      res.status(403).json({ success: false, error: `You can only update stations in ${jurisdictionValue}` });
      return;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.pollingStation as any).update({
      where: { id: req.params.id },
      data:  parsed.data,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to update' });
  }
});

// DELETE /api/polling-stations/:id — delete station (only if no voters or votes assigned)
router.delete('/:id', requireAuth, requireAdmin,
  requireStaffRole('COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO'),
  async (req: Request, res: Response) => {
    let station: { name: string; county: string; constituency: string; _count: { voters: number; votes: number } } | null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      station = await (prisma.pollingStation as any).findUnique({
        where:   { id: req.params.id },
        include: { _count: { select: { voters: true, votes: true } } },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Database error' });
      return;
    }

    if (!station) {
      res.status(404).json({ success: false, error: 'Station not found' });
      return;
    }

    // Jurisdiction check for county/constituency ROs
    const authReq = req as AuthenticatedRequest;
    const { staffRole, jurisdictionLevel, jurisdictionValue } = authReq.voter;
    if (staffRole === 'COUNTY_RO' && jurisdictionLevel === 'COUNTY') {
      if (station.county.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
        res.status(403).json({ success: false, error: `You can only delete stations in ${jurisdictionValue}` });
        return;
      }
    } else if (staffRole === 'CONSTITUENCY_RO' && jurisdictionLevel === 'CONSTITUENCY') {
      if (station.constituency.toLowerCase() !== (jurisdictionValue ?? '').toLowerCase()) {
        res.status(403).json({ success: false, error: `You can only delete stations in ${jurisdictionValue}` });
        return;
      }
    }

    // Prevent deletion if voters or votes are linked
    const voterCount = (station._count as { voters: number; votes: number }).voters;
    const voteCount  = (station._count as { voters: number; votes: number }).votes;
    if (voterCount > 0 || voteCount > 0) {
      res.status(409).json({
        success: false,
        error: `Cannot delete: station has ${voterCount} registered voter(s) and ${voteCount} vote(s). Mark it inactive instead.`,
      });
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.pollingStation as any).delete({ where: { id: req.params.id } });
      res.json({ success: true, message: `Station "${station.name}" deleted` });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete' });
    }
  },
);

export default router;
