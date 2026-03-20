import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import { adminRateLimiter } from '../middleware/rate-limit.middleware.js';
import { ServiceError } from '../services/voter.service.js';
import * as svc from '../services/election-mgmt.service.js';
import { prisma } from '../database/client.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// ── PUBLIC endpoints (no auth required) ───────────────────────────────────────
// Returns limited fields for non-DRAFT elections (public-facing voter portal)

router.get('/public', async (req: Request, res: Response) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await svc.listElections({ status: req.query.status as string | undefined as any });
    // Filter to non-DRAFT and expose only public-safe fields
    const publicElections = result.items
      .filter(e => e.status !== 'DRAFT')
      .map(e => ({
        id:            e.id,
        name:          e.name,
        description:   e.description,
        type:          e.type,
        status:        e.status,
        orgName:       e.orgName,
        authMethod:      (e as Record<string, unknown>).authMethod,
        allowedDomains:  (e as Record<string, unknown>).allowedDomains,
        countryCode:     (e as Record<string, unknown>).countryCode,
        eligibilityNote: (e as Record<string, unknown>).eligibilityNote,
        startDate:       e.startDate,
        endDate:         e.endDate,
        _count:          e._count,
      }));
    res.json({ success: true, data: publicElections });
  } catch (e) { handleError(e, res); }
});

router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const election = await svc.getElection(req.params.id);
    if (election.status === 'DRAFT') {
      res.status(404).json({ success: false, error: 'Election not found' });
      return;
    }
    // Expose only public-safe fields (no internal position/candidate admin data)
    const e = election as Record<string, unknown>;
    res.json({
      success: true,
      data: {
        id:              election.id,
        name:            election.name,
        description:     election.description,
        type:            election.type,
        status:          election.status,
        orgName:         election.orgName,
        authMethod:      e.authMethod,
        allowedDomains:  e.allowedDomains,
        countryCode:     e.countryCode,
        eligibilityNote: e.eligibilityNote,
        startDate:       election.startDate,
        endDate:         election.endDate,
        positions:       election.positions?.map((p: Record<string, unknown>) => ({
          id:       p.id,
          title:    p.title,
          scope:    p.scope,
          candidates: (p.candidates as Record<string, unknown>[])?.map(c => ({
            id:   c.id,
            name: c.name,
            party: c.party,
          })),
        })),
        _count: election._count,
      },
    });
  } catch (e) { handleError(e, res); }
});

// GET /api/elections/:id/stations — polling stations linked to this election's jurisdiction tree
// Returns stations that have been explicitly linked to a node via pollingStationId.
// Supports filtering by county, constituency, and proximity (lat/lng/radius in km).
router.get('/:id/stations', async (req: Request, res: Response) => {
  try {
    const electionId = req.params.id;
    const { county, constituency, lat, lng, radius } = req.query as Record<string, string | undefined>;

    // Fetch all jurisdiction nodes for this election that have a pollingStationId set
    const nodes = await prisma.electionJurisdiction.findMany({
      where: { electionId, pollingStationId: { not: null } },
      include: {
        pollingStation: {
          select: { id: true, code: true, name: true, county: true, constituency: true, ward: true, latitude: true, longitude: true },
        },
      },
      orderBy: [{ depth: 'asc' }, { orderIndex: 'asc' }, { name: 'asc' }],
    });

    // Build a nodeId → full ancestor name path for each linked node
    // Fetch ALL nodes for this election so we can build paths
    const allNodes = await prisma.electionJurisdiction.findMany({
      where: { electionId },
      select: { id: true, name: true, parentId: true, depth: true },
      orderBy: { depth: 'asc' },
    });
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    function buildPath(nodeId: string): string[] {
      const path: string[] = [];
      let cur: string | null = nodeId;
      while (cur) {
        const n = nodeMap.get(cur);
        if (!n) break;
        path.unshift(n.name);
        cur = n.parentId ?? null;
      }
      return path;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let results: any[] = nodes
      .filter(n => n.pollingStation != null)
      .map(n => ({
        stationId:     n.pollingStation!.id,
        stationCode:   n.pollingStation!.code,
        stationName:   n.pollingStation!.name,
        county:        n.pollingStation!.county,
        constituency:  n.pollingStation!.constituency,
        ward:          n.pollingStation!.ward,
        latitude:      n.pollingStation!.latitude ?? null,
        longitude:     n.pollingStation!.longitude ?? null,
        nodeId:        n.id,
        nodePath:      buildPath(n.id),
      }));

    // Apply optional filters
    if (county) {
      results = results.filter(r => r.county.toLowerCase() === county.toLowerCase());
    }
    if (constituency) {
      results = results.filter(r => r.constituency.toLowerCase() === constituency.toLowerCase());
    }
    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      const radiusKm = radius ? parseFloat(radius) : 10;

      if (!isNaN(latNum) && !isNaN(lngNum) && !isNaN(radiusKm)) {
        // Haversine distance filter
        results = results.filter(r => {
          if (r.latitude == null || r.longitude == null) return false;
          const R = 6371; // Earth radius in km
          const dLat = ((r.latitude - latNum) * Math.PI) / 180;
          const dLng = ((r.longitude - lngNum) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((latNum * Math.PI) / 180) *
              Math.cos((r.latitude * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return distKm <= radiusKm;
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (e) { handleError(e, res); }
});

// All following routes require admin auth
router.use(adminRateLimiter, requireAuth, requireAdmin);

// Commission-only: election lifecycle (create, status, delete)
const commissionOnly = requireStaffRole(
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
);

// Ballot write: commission + RO roles that can manage positions/candidates/jurisdictions
const ballotWrite = requireStaffRole(
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO',
);

/**
 * Scope-based permission check for ballot operations.
 * Returns an error string if denied, null if allowed.
 *
 * Scope hierarchy:
 *   NATIONAL_RO       → all scopes
 *   COUNTY_RO         → COUNTY, CONSTITUENCY, WARD (within their jurisdictionValue)
 *   CONSTITUENCY_RO   → CONSTITUENCY, WARD (within their jurisdictionValue)
 *   Commission tier   → all scopes (already passed commissionOnly or ballotWrite)
 */
function checkScopePermission(
  req: Request,
  scope: string,
  scopeValue?: string | null,
): string | null {
  const authReq   = req as AuthenticatedRequest;
  const role      = authReq.voter?.staffRole ?? '';
  const jv        = authReq.voter?.jurisdictionValue ?? null;

  const commissionTier = new Set([
    'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  ]);
  if (commissionTier.has(role) || role === 'NATIONAL_RO') return null;

  if (role === 'COUNTY_RO') {
    if (!['COUNTY', 'CONSTITUENCY', 'WARD', 'CUSTOM'].includes(scope))
      return 'County Returning Officers can only manage county-level or lower scope positions.';
    if (!jv)
      return 'Your account has no jurisdiction assigned. Contact your administrator.';
    // County-scope positions must be explicitly assigned to their county
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
    // Constituency-scope positions must be explicitly assigned to their constituency
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

// ── Validation schemas ────────────────────────────────────────────────────────

const electionSchema = z.object({
  name:            z.string().min(3).max(255),
  description:     z.string().optional(),
  type:            z.enum(['GOVERNMENT', 'INSTITUTIONAL', 'CORPORATE', 'CUSTOM']),
  orgName:         z.string().optional(),
  startDate:       z.string().datetime({ offset: true }).optional(),
  endDate:         z.string().datetime({ offset: true }).optional(),
  authMethod:      z.enum(['PERSONA_KYC', 'EMAIL_DOMAIN', 'OTP_ONLY']).optional(),
  allowedDomains:  z.array(z.string().min(1).max(255)).optional(),
  countryCode:     z.string().length(2).toUpperCase().optional(),
  eligibilityNote: z.string().max(500).optional(),
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

router.post('/', commissionOnly, async (req: Request, res: Response) => {
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

router.patch('/:id', commissionOnly, async (req: Request, res: Response) => {
  const parsed = z.object({
    name:            z.string().min(3).max(255).optional(),
    description:     z.string().nullable().optional(),
    orgName:         z.string().nullable().optional(),
    startDate:       z.string().datetime({ offset: true }).nullable().optional(),
    endDate:         z.string().datetime({ offset: true }).nullable().optional(),
    authMethod:      z.enum(['PERSONA_KYC', 'EMAIL_DOMAIN', 'OTP_ONLY']).optional(),
    allowedDomains:  z.array(z.string().min(1).max(255)).optional(),
    countryCode:     z.string().length(2).nullable().optional(),
    eligibilityNote: z.string().max(500).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.json({ success: true, data: await svc.updateElection(req.params.id, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/:id/status', commissionOnly, async (req: Request, res: Response) => {
  const parsed = z.object({ status: z.enum(['DRAFT','NOMINATIONS','ACTIVE','CLOSED','TALLIED','ARCHIVED']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Invalid status' }); return; }
  try { res.json({ success: true, data: await svc.transitionElectionStatus(req.params.id, parsed.data.status) }); }
  catch (e) { handleError(e, res); }
});

// Commission-only: force-reopen an election (back to DRAFT / NOMINATIONS / ACTIVE)
// Used to correct test/demo elections or handle extraordinary circumstances.
router.patch('/:id/reopen', commissionOnly, async (req: Request, res: Response) => {
  const parsed = z.object({ status: z.enum(['DRAFT', 'NOMINATIONS', 'ACTIVE']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'status must be DRAFT, NOMINATIONS, or ACTIVE' }); return; }
  try { res.json({ success: true, data: await svc.forceReopenElection(req.params.id, parsed.data.status) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/:id', commissionOnly, async (req: Request, res: Response) => {
  const force = req.query.force === 'true';
  try { await svc.deleteElection(req.params.id, force); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

// ── Positions ─────────────────────────────────────────────────────────────────

router.post('/:id/positions', ballotWrite, async (req: Request, res: Response) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const scopeErr = checkScopePermission(req, parsed.data.scope, parsed.data.scopeValue);
  if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
  try { res.status(201).json({ success: true, data: await svc.createPosition(req.params.id, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

router.patch('/positions/:posId', ballotWrite, async (req: Request, res: Response) => {
  try {
    // Fetch current position scope to validate before update
    const pos = await prisma.position.findUnique({ where: { id: req.params.posId }, select: { scope: true, scopeValue: true } });
    const scope = (req.body as any).scope ?? pos?.scope ?? 'NATIONAL';
    const scopeValue = (req.body as any).scopeValue ?? pos?.scopeValue;
    const scopeErr = checkScopePermission(req, scope, scopeValue);
    if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    res.json({ success: true, data: await svc.updatePosition(req.params.posId, req.body) });
  }
  catch (e) { handleError(e, res); }
});

router.delete('/positions/:posId', ballotWrite, async (req: Request, res: Response) => {
  try {
    const pos = await prisma.position.findUnique({ where: { id: req.params.posId }, select: { scope: true, scopeValue: true } });
    if (pos) {
      const scopeErr = checkScopePermission(req, pos.scope, pos.scopeValue);
      if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    }
    await svc.deletePosition(req.params.posId);
    res.json({ success: true });
  }
  catch (e) { handleError(e, res); }
});

// ── Candidates ────────────────────────────────────────────────────────────────

router.post('/positions/:posId/candidates', ballotWrite, async (req: Request, res: Response) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    // Derive scope from the parent position
    const pos = await prisma.position.findUnique({ where: { id: req.params.posId }, select: { scope: true, scopeValue: true } });
    const scopeErr = checkScopePermission(req, pos?.scope ?? 'NATIONAL', parsed.data.scopeValue ?? pos?.scopeValue);
    if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    res.status(201).json({ success: true, data: await svc.createCandidate(req.params.posId, parsed.data) });
  }
  catch (e) { handleError(e, res); }
});

router.patch('/candidates/:candId', ballotWrite, async (req: Request, res: Response) => {
  try {
    const cand = await prisma.candidate.findUnique({ where: { id: req.params.candId }, include: { position: { select: { scope: true, scopeValue: true } } } });
    if (cand?.position) {
      const scopeErr = checkScopePermission(req, cand.position.scope, cand.position.scopeValue);
      if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    }
    res.json({ success: true, data: await svc.updateCandidate(req.params.candId, req.body) });
  }
  catch (e) { handleError(e, res); }
});

router.patch('/candidates/:candId/deactivate', ballotWrite, async (req: Request, res: Response) => {
  try {
    const cand = await prisma.candidate.findUnique({ where: { id: req.params.candId }, include: { position: { select: { scope: true, scopeValue: true } } } });
    if (cand?.position) {
      const scopeErr = checkScopePermission(req, cand.position.scope, cand.position.scopeValue);
      if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    }
    res.json({ success: true, data: await svc.updateCandidate(req.params.candId, { isActive: false }) });
  }
  catch (e) { handleError(e, res); }
});

router.delete('/candidates/:candId', ballotWrite, async (req: Request, res: Response) => {
  try {
    const cand = await prisma.candidate.findUnique({ where: { id: req.params.candId }, include: { position: { select: { scope: true, scopeValue: true } } } });
    if (cand?.position) {
      const scopeErr = checkScopePermission(req, cand.position.scope, cand.position.scopeValue);
      if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
    }
    await svc.deleteCandidate(req.params.candId);
    res.json({ success: true });
  }
  catch (e) { handleError(e, res); }
});

// ── Jurisdiction tree ─────────────────────────────────────────────────────────

const jurisdictionSchema = z.object({
  name:             z.string().min(1).max(255),
  level:            z.enum(['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION']).optional(),
  parentId:         z.string().uuid().optional(),
  orderIndex:       z.number().int().min(0).optional(),
  pollingStationId: z.string().uuid().optional(),
});

// GET /api/elections/:id/jurisdictions — full flat list
router.get('/:id/jurisdictions', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await svc.listJurisdictions(req.params.id) }); }
  catch (e) { handleError(e, res); }
});

// POST /api/elections/:id/jurisdictions — create a node (all ballot-write roles)
router.post('/:id/jurisdictions', ballotWrite, async (req: Request, res: Response) => {
  const parsed = jurisdictionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.status(201).json({ success: true, data: await svc.createJurisdiction(req.params.id, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

// PATCH /api/elections/jurisdictions/:jid — update a node
router.patch('/jurisdictions/:jid', ballotWrite, async (req: Request, res: Response) => {
  const parsed = z.object({ name: z.string().min(1).max(255).optional(), level: z.enum(['NATIONAL','COUNTY','CONSTITUENCY','WARD']).nullable().optional(), orderIndex: z.number().int().min(0).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.json({ success: true, data: await svc.updateJurisdiction(req.params.jid, parsed.data) }); }
  catch (e) { handleError(e, res); }
});

// DELETE /api/elections/jurisdictions/:jid — delete a leaf node
router.delete('/jurisdictions/:jid', ballotWrite, async (req: Request, res: Response) => {
  try { await svc.deleteJurisdiction(req.params.jid); res.json({ success: true }); }
  catch (e) { handleError(e, res); }
});

// PATCH /api/elections/:id/jurisdictions/:nodeId/link-station
// Link a physical PollingStation to a jurisdiction node (leaf typically).
// Prevents double-linking: a station can only be linked to one node per election.
router.patch('/:id/jurisdictions/:nodeId/link-station', ballotWrite, async (req: Request, res: Response) => {
  const parsed = z.object({ pollingStationId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try {
    const { pollingStationId } = parsed.data;
    const electionId = req.params.id;
    const nodeId = req.params.nodeId;

    // Verify the polling station exists
    const station = await prisma.pollingStation.findUnique({ where: { id: pollingStationId } });
    if (!station) {
      res.status(404).json({ success: false, error: 'Polling station not found' });
      return;
    }

    // Verify the node exists and belongs to this election
    const node = await prisma.electionJurisdiction.findUnique({ where: { id: nodeId } });
    if (!node || node.electionId !== electionId) {
      res.status(404).json({ success: false, error: 'Jurisdiction node not found in this election' });
      return;
    }

    // Prevent double-linking: check if any OTHER node in this election is already linked to this station
    const existingLink = await prisma.electionJurisdiction.findFirst({
      where: { electionId, pollingStationId, NOT: { id: nodeId } },
    });
    if (existingLink) {
      res.status(409).json({
        success: false,
        error: `Station "${station.name}" is already linked to another node (${existingLink.id}) in this election.`,
      });
      return;
    }

    const updated = await svc.updateJurisdiction(nodeId, { pollingStationId });
    res.json({ success: true, data: updated });
  } catch (e) { handleError(e, res); }
});

// POST /api/elections/:id/jurisdictions/:jid/positions — create position in jurisdiction
router.post('/:id/jurisdictions/:jid/positions', ballotWrite, async (req: Request, res: Response) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const scopeErr = checkScopePermission(req, parsed.data.scope, parsed.data.scopeValue);
  if (scopeErr) { res.status(403).json({ success: false, error: scopeErr }); return; }
  try {
    res.status(201).json({
      success: true,
      data: await svc.createPositionInJurisdiction(req.params.id, req.params.jid, parsed.data),
    });
  }
  catch (e) { handleError(e, res); }
});

// ── Enrollments ───────────────────────────────────────────────────────────────

router.post('/:id/enrollments', commissionOnly, async (req: Request, res: Response) => {
  const parsed = z.object({ voterId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'voterId must be a valid UUID' }); return; }
  try { res.status(201).json({ success: true, data: await svc.enrollVoter(req.params.id, parsed.data.voterId) }); }
  catch (e) { handleError(e, res); }
});

router.post('/:id/enrollments/bulk', commissionOnly, async (req: Request, res: Response) => {
  const parsed = z.object({ voterIds: z.array(z.string().uuid()).min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  try { res.json({ success: true, data: await svc.bulkEnrollVoters(req.params.id, parsed.data.voterIds) }); }
  catch (e) { handleError(e, res); }
});

router.delete('/:id/enrollments/:voterId', commissionOnly, async (req: Request, res: Response) => {
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
