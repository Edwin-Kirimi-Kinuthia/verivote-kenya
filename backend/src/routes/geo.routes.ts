/**
 * VeriVote Kenya — Geographic Areas API
 *
 * Derives Kenya's electoral hierarchy from polling station data.
 * No new tables — purely aggregated from existing polling_stations.
 *
 * GET /api/geo/counties
 * GET /api/geo/constituencies?county=Nairobi
 * GET /api/geo/wards?constituency=Westlands
 * GET /api/geo/stations?ward=Parklands
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { prisma } from '../database/client.js';

const router: Router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/geo/counties — all 47 counties
router.get('/counties', async (_req: Request, res: Response) => {
  const rows = await prisma.pollingStation.findMany({
    select: { county: true },
    distinct: ['county'],
    orderBy: { county: 'asc' },
  });
  res.json({ success: true, data: rows.map(r => r.county) });
});

// GET /api/geo/constituencies?county=Nairobi
router.get('/constituencies', async (req: Request, res: Response) => {
  const { county } = req.query as { county?: string };
  const where = county ? { county } : {};
  const rows = await prisma.pollingStation.findMany({
    where,
    select: { county: true, constituency: true },
    distinct: ['county', 'constituency'],
    orderBy: { constituency: 'asc' },
  });
  res.json({ success: true, data: rows.map(r => ({ county: r.county, constituency: r.constituency })) });
});

// GET /api/geo/wards?constituency=Westlands
router.get('/wards', async (req: Request, res: Response) => {
  const { constituency, county } = req.query as { constituency?: string; county?: string };
  const where: Record<string, string> = {};
  if (county)        where.county       = county;
  if (constituency)  where.constituency = constituency;
  const rows = await prisma.pollingStation.findMany({
    where,
    select: { county: true, constituency: true, ward: true },
    distinct: ['county', 'constituency', 'ward'],
    orderBy: { ward: 'asc' },
  });
  res.json({ success: true, data: rows.map(r => ({ county: r.county, constituency: r.constituency, ward: r.ward })) });
});

// GET /api/geo/stations?ward=Parklands&constituency=Westlands
router.get('/stations', async (req: Request, res: Response) => {
  const { ward, constituency, county } = req.query as { ward?: string; constituency?: string; county?: string };
  const where: Record<string, string> = {};
  if (county)        where.county       = county;
  if (constituency)  where.constituency = constituency;
  if (ward)          where.ward         = ward;
  const rows = await prisma.pollingStation.findMany({
    where,
    select: { id: true, name: true, code: true, county: true, constituency: true, ward: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  res.json({ success: true, data: rows });
});

export default router;
