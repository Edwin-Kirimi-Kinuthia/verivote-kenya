/**
 * VeriVote Kenya — Result Declaration Service
 *
 * Handles the formal declaration of election results by returning officers.
 * Each declaration is scoped to a position + election + jurisdiction.
 *
 * Declaration lifecycle:
 *   DRAFT → DECLARED → CONTESTED (optional) → ANNULLED (optional)
 *
 * Authorization rules:
 *   - Commission tier (CHAIRPERSON, COMMISSIONER, COMMISSION_SECRETARY,
 *     DEPUTY_COMMISSION_SECRETARY) and NATIONAL_RO may declare any position.
 *   - All other officers may declare ONLY positions whose jurisdictionId
 *     exactly matches a node they are personInCharge of.
 *   - Positions with no jurisdictionId are commission-tier only.
 *   - An officer may VIEW (but not declare) positions in descendant nodes.
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type {
  ResultDeclarationRecord, CreateDeclarationInput, DeclarationStatus,
} from '../types/database.types.js';
import { logger } from '../lib/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMMISSION_TIER = new Set([
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY', 'NATIONAL_RO',
]);

/**
 * Collect all descendant node IDs for a set of parent node IDs (BFS).
 * Used to determine which positions are "viewable below" an officer.
 */
async function getDescendantNodeIds(parentIds: string[]): Promise<string[]> {
  if (parentIds.length === 0) return [];
  const result: string[] = [];
  let frontier = [...parentIds];
  while (frontier.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: { id: string }[] = await (prisma as any).electionJurisdiction.findMany({
      where:  { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    result.push(...frontier);
  }
  return result;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createDeclaration(
  input: CreateDeclarationInput,
): Promise<ResultDeclarationRecord> {
  // Validate election exists and is CLOSED or TALLIED
  const election = await prisma.election.findUnique({ where: { id: input.electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (!['CLOSED', 'TALLIED'].includes(election.status)) {
    throw new ServiceError('Declarations can only be made for CLOSED or TALLIED elections', 400);
  }

  // Validate position belongs to this election
  const position = await prisma.position.findUnique({ where: { id: input.positionId } });
  if (!position) throw new ServiceError('Position not found', 404);
  if (position.electionId !== input.electionId) {
    throw new ServiceError('Position does not belong to this election', 400);
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  const staff = await prisma.iebcStaff.findUnique({
    where:  { id: input.staffId },
    select: { staffRole: true },
  });
  if (!staff) throw new ServiceError('Staff record not found', 404);

  if (!COMMISSION_TIER.has(staff.staffRole)) {
    // Non-commission officers may only declare for positions attached to a
    // jurisdiction node they are DIRECTLY in charge of (exact match — no
    // ancestor walk, because an ancestor officer declares ancestor positions,
    // not the positions of nodes below them).
    if (!position.jurisdictionId) {
      throw new ServiceError(
        'This position is not attached to any jurisdiction node. Only commission-tier officers may declare it.',
        403,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node: { personInChargeId: string | null } | null = await (prisma as any).electionJurisdiction.findUnique({
      where:  { id: position.jurisdictionId },
      select: { personInChargeId: true },
    });

    if (!node || node.personInChargeId !== input.staffId) {
      throw new ServiceError(
        'You are not authorised to declare results for this position. ' +
        'Only the person-in-charge of the exact jurisdiction node this position belongs to may declare it.',
        403,
      );
    }
  }

  // Check for duplicate (same officer + position + election)
  const dup = await prisma.resultDeclaration.findUnique({
    where: { electionId_positionId_staffId: {
      electionId: input.electionId,
      positionId: input.positionId,
      staffId:    input.staffId,
    }},
  });
  if (dup) throw new ServiceError('You have already created a declaration for this position', 409);

  const decl = await prisma.resultDeclaration.create({
    data: {
      electionId:        input.electionId,
      positionId:        input.positionId,
      staffId:           input.staffId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jurisdictionLevel: input.jurisdictionLevel as any,
      jurisdictionValue: input.jurisdictionValue ?? null,
      tallySnapshot:     input.tallySnapshot ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status:            'DRAFT' as any,
    },
  });

  logger.info('Result declaration created', { declarationId: decl.id, positionId: input.positionId });
  return decl as unknown as ResultDeclarationRecord;
}

export async function formallyDeclare(
  declarationId: string,
  staffId: string,
): Promise<ResultDeclarationRecord> {
  const decl = await prisma.resultDeclaration.findUnique({ where: { id: declarationId } });
  if (!decl) throw new ServiceError('Declaration not found', 404);
  if (decl.staffId !== staffId) throw new ServiceError('You do not own this declaration', 403);
  if (decl.status !== 'DRAFT') {
    throw new ServiceError(`Cannot declare — current status is ${decl.status}`, 400);
  }

  const updated = await prisma.resultDeclaration.update({
    where: { id: declarationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data:  { status: 'DECLARED' as any, declaredAt: new Date() },
  });

  logger.info('Result formally declared', { declarationId, staffId });
  return updated as unknown as ResultDeclarationRecord;
}

export async function contestDeclaration(
  declarationId: string,
  reason: string,
): Promise<ResultDeclarationRecord> {
  const decl = await prisma.resultDeclaration.findUnique({ where: { id: declarationId } });
  if (!decl) throw new ServiceError('Declaration not found', 404);
  if (decl.status !== 'DECLARED') {
    throw new ServiceError('Only DECLARED declarations can be contested', 400);
  }

  const updated = await prisma.resultDeclaration.update({
    where: { id: declarationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data:  { status: 'CONTESTED' as any, contestedAt: new Date(), contestReason: reason },
  });

  logger.info('Declaration contested', { declarationId });
  return updated as unknown as ResultDeclarationRecord;
}

export async function listDeclarations(filter: {
  electionId?: string;
  positionId?: string;
  staffId?: string;
  jurisdictionValue?: string;
  status?: DeclarationStatus;
}): Promise<Array<ResultDeclarationRecord & {
  position: { title: string; scope: string; scopeValue: string | null };
  staff: { voter: { nationalId: string } };
}>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (filter.electionId)        where.electionId        = filter.electionId;
  if (filter.positionId)        where.positionId        = filter.positionId;
  if (filter.staffId)           where.staffId           = filter.staffId;
  if (filter.status)            where.status            = filter.status;
  if (filter.jurisdictionValue) where.jurisdictionValue = { contains: filter.jurisdictionValue, mode: 'insensitive' };

  const records = await prisma.resultDeclaration.findMany({
    where,
    include: {
      election: { select: { id: true, name: true, status: true } },
      position: { select: { title: true, scope: true, scopeValue: true } },
      staff:    { include: { voter: { select: { nationalId: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return records as unknown as any[];
}

export async function getDeclaration(declarationId: string) {
  const decl = await prisma.resultDeclaration.findUnique({
    where: { id: declarationId },
    include: {
      election: { select: { id: true, name: true, status: true } },
      position: { select: { id: true, title: true, scope: true, scopeValue: true } },
      staff:    { include: { voter: { select: { nationalId: true } } } },
    },
  });
  if (!decl) throw new ServiceError('Declaration not found', 404);
  return decl;
}

// ── Pending / scope view ──────────────────────────────────────────────────────

interface PendingEntry {
  positionId:    string;
  positionTitle: string;
  scope:         string;
  scopeValue:    string | null;
  jurisdictionNodeId:   string | null;
  jurisdictionNodeName: string | null;
  candidates:    { id: string; name: string; party: string | null }[];
  canDeclare:    boolean; // false = read-only (position belongs to a descendant node)
  declaration:   { id: string; positionId: string; status: string } | null;
}

/**
 * Returns positions visible to this officer for a given election.
 *
 * canDeclare = true  → position's jurisdictionNode.personInChargeId === staffId
 *                       (or officer is commission-tier, who can declare anything)
 * canDeclare = false → position belongs to a descendant node (read-only view)
 *
 * Positions with no jurisdictionId are only shown to commission-tier officers.
 */
export async function getPendingDeclarations(
  electionId: string,
  staffId: string,
): Promise<PendingEntry[]> {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);

  const staff = await prisma.iebcStaff.findUnique({
    where:  { id: staffId },
    select: { staffRole: true },
  });
  if (!staff) throw new ServiceError('Staff record not found', 404);

  // Existing declarations by this officer for this election
  const existing = await prisma.resultDeclaration.findMany({
    where:  { electionId, staffId },
    select: { id: true, positionId: true, status: true },
  });

  type NodeRow = { id: string; name: string; level: string };

  if (COMMISSION_TIER.has(staff.staffRole)) {
    // Commission tier: all positions, all declarable
    const positions = await prisma.position.findMany({
      where:   { electionId },
      include: { candidates: { where: { isActive: true } } },
      orderBy: { orderIndex: 'asc' },
    });

    // Fetch node names in one batch
    const nodeIds = positions.map((p) => p.jurisdictionId).filter(Boolean) as string[];
    const nodes: NodeRow[] = nodeIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (prisma as any).electionJurisdiction.findMany({
          where:  { id: { in: nodeIds } },
          select: { id: true, name: true, level: true },
        })
      : [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return positions.map((pos) => {
      const node = pos.jurisdictionId ? nodeMap.get(pos.jurisdictionId) : undefined;
      return {
        positionId:           pos.id,
        positionTitle:        pos.title,
        scope:                pos.scope,
        scopeValue:           pos.scopeValue,
        jurisdictionNodeId:   pos.jurisdictionId ?? null,
        jurisdictionNodeName: node?.name ?? null,
        candidates:           pos.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party })),
        canDeclare:           true,
        declaration:          existing.find((d) => d.positionId === pos.id) ?? null,
      };
    });
  }

  // Non-commission: derive scope from node tree
  // Find nodes this officer is directly in charge of (within this election)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myNodes: NodeRow[] = await (prisma as any).electionJurisdiction.findMany({
    where:  { personInChargeId: staffId, electionId },
    select: { id: true, name: true, level: true },
  });

  if (myNodes.length === 0) {
    // Officer exists but has no node assignment in this election
    return [];
  }

  const myNodeIds = myNodes.map((n) => n.id);
  const descendantIds = await getDescendantNodeIds(myNodeIds);

  // Build maps for node name lookup
  const allNodeIds = [...myNodeIds, ...descendantIds];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allNodes: NodeRow[] = await (prisma as any).electionJurisdiction.findMany({
    where:  { id: { in: allNodeIds } },
    select: { id: true, name: true, level: true },
  });
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const myNodeSet = new Set(myNodeIds);

  // Fetch positions for own nodes (declarable) + descendant nodes (viewable)
  const positions = await prisma.position.findMany({
    where:   { electionId, jurisdictionId: { in: allNodeIds } },
    include: { candidates: { where: { isActive: true } } },
    orderBy: { orderIndex: 'asc' },
  });

  return positions.map((pos) => {
    const node = pos.jurisdictionId ? nodeMap.get(pos.jurisdictionId) : undefined;
    return {
      positionId:           pos.id,
      positionTitle:        pos.title,
      scope:                pos.scope,
      scopeValue:           pos.scopeValue,
      jurisdictionNodeId:   pos.jurisdictionId ?? null,
      jurisdictionNodeName: node?.name ?? null,
      candidates:           pos.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party })),
      canDeclare:           pos.jurisdictionId ? myNodeSet.has(pos.jurisdictionId) : false,
      declaration:          existing.find((d) => d.positionId === pos.id) ?? null,
    };
  });
}
