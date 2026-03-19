/**
 * VeriVote Kenya — Result Declaration Service
 *
 * Handles the formal declaration of election results by returning officers.
 * Each declaration is scoped to a position + election + jurisdiction.
 *
 * Declaration lifecycle:
 *   DRAFT → DECLARED → CONTESTED (optional) → ANNULLED (optional)
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type {
  ResultDeclarationRecord, CreateDeclarationInput, DeclarationStatus,
} from '../types/database.types.js';
import { logger } from '../lib/logger.js';

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createDeclaration(
  input: CreateDeclarationInput,
): Promise<ResultDeclarationRecord> {
  // Validate election exists and is in CLOSED or TALLIED state
  const election = await prisma.election.findUnique({ where: { id: input.electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (!['CLOSED', 'TALLIED'].includes(election.status)) {
    throw new ServiceError('Declarations can only be made for CLOSED or TALLIED elections', 400);
  }

  // Validate position belongs to election
  const position = await prisma.position.findUnique({ where: { id: input.positionId } });
  if (!position) throw new ServiceError('Position not found', 404);
  if (position.electionId !== input.electionId) {
    throw new ServiceError('Position does not belong to this election', 400);
  }

  // ── Jurisdiction hierarchy enforcement ──────────────────────────────────────
  // If the position is linked to a jurisdiction node, the declaring officer must
  // either be the personInCharge of that node (or an ancestor), or hold a
  // commission-tier / NATIONAL_RO role that supersedes all geographic scoping.
  if (position.jurisdictionId) {
    const staff = await prisma.iebcStaff.findUnique({
      where:  { id: input.staffId },
      select: { staffRole: true, jurisdictionLevel: true, jurisdictionValue: true },
    });
    if (!staff) throw new ServiceError('Staff record not found', 404);

    const commissionTier = new Set([
      'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
    ]);

    if (!commissionTier.has(staff.staffRole) && staff.staffRole !== 'NATIONAL_RO') {
      // Walk up the node tree checking if this officer is personInCharge of any ancestor
      let nodeId: string | null = position.jurisdictionId;
      let authorized = false;
      while (nodeId && !authorized) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const node: { personInChargeId: string | null; parentId: string | null; level: string; name: string } | null = await (prisma as any).electionJurisdiction.findUnique({
          where:  { id: nodeId },
          select: { personInChargeId: true, parentId: true, level: true, name: true },
        });
        if (!node) break;
        if (node.personInChargeId === input.staffId) {
          authorized = true;
        } else {
          nodeId = node.parentId;
        }
      }

      if (!authorized) {
        // Fallback: allow if officer's jurisdictionLevel + jurisdictionValue covers the position scope
        const levelOrder = ['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION'];
        const officerIdx = levelOrder.indexOf(staff.jurisdictionLevel ?? 'NATIONAL');
        const posScope   = position.scope; // NATIONAL | COUNTY | CONSTITUENCY | WARD | CUSTOM
        const posScopeIdx = levelOrder.indexOf(posScope);
        const scopeMatches = !position.scopeValue
          || !staff.jurisdictionValue
          || position.scopeValue.toLowerCase() === staff.jurisdictionValue.toLowerCase();

        if (officerIdx > posScopeIdx || !scopeMatches) {
          throw new ServiceError(
            'You are not authorized to declare results for this position. ' +
            'Only the person-in-charge of the position\'s jurisdiction node (or a higher-level officer) may declare.',
            403,
          );
        }
      }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      electionId:        input.electionId,
      positionId:        input.positionId,
      staffId:           input.staffId,
      jurisdictionLevel: input.jurisdictionLevel as any,
      jurisdictionValue: input.jurisdictionValue ?? null,
      tallySnapshot:     input.tallySnapshot ?? null,
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
  // Single fetch — reuse result for ownership + status check
  const decl = await prisma.resultDeclaration.findUnique({ where: { id: declarationId } });
  if (!decl) throw new ServiceError('Declaration not found', 404);
  if (decl.staffId !== staffId) throw new ServiceError('You do not own this declaration', 403);
  if (decl.status !== 'DRAFT') {
    throw new ServiceError(`Cannot declare — current status is ${decl.status}`, 400);
  }

  const updated = await prisma.resultDeclaration.update({
    where: { id: declarationId },
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
  if (filter.electionId)        where.electionId       = filter.electionId;
  if (filter.positionId)        where.positionId       = filter.positionId;
  if (filter.staffId)           where.staffId          = filter.staffId;
  if (filter.status)            where.status           = filter.status;
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

/**
 * Get positions that an officer can declare for a given election.
 * Returns only positions in the officer's scope that haven't been declared yet.
 */
export async function getPendingDeclarations(
  electionId: string,
  staffId: string,
  jurisdictionLevel: string,
  jurisdictionValue: string | null,
) {
  // Fetch the election to determine whether geographic filtering applies
  const election = await prisma.election.findUnique({
    where:  { id: electionId },
    select: { type: true },
  });
  if (!election) throw new ServiceError('Election not found', 404);

  const isGovernment = election.type === 'GOVERNMENT';

  // Get all positions for this election
  const positions = await prisma.position.findMany({
    where:   { electionId },
    include: { candidates: { where: { isActive: true } } },
    orderBy: { orderIndex: 'asc' },
  });

  // Get existing declarations by this officer
  const existing = await prisma.resultDeclaration.findMany({
    where: { electionId, staffId },
    select: { positionId: true, status: true, id: true },
  });

  // For INSTITUTIONAL / CORPORATE / CUSTOM elections there is no geographic
  // jurisdiction — every authorized officer sees all positions.
  // For GOVERNMENT elections, apply the standard geographic scope filter.
  const eligible = isGovernment
    ? positions
        .filter(pos => {
          if (jurisdictionLevel === 'NATIONAL') return true;
          if (jurisdictionLevel === 'COUNTY')        return pos.scope === 'NATIONAL' || pos.scope === 'COUNTY';
          if (jurisdictionLevel === 'CONSTITUENCY')  return pos.scope === 'CONSTITUENCY';
          if (jurisdictionLevel === 'WARD')          return pos.scope === 'WARD';
          return false;
        })
        .filter(pos => {
          if (!jurisdictionValue) return true;
          // Template positions (no scopeValue): eligible, candidates filtered later
          if (!pos.scopeValue) return true;
          return pos.scopeValue === jurisdictionValue;
        })
    : positions; // Non-government: all positions visible to any authorized officer

  return eligible.map(pos => {
    // For GOVERNMENT template positions, narrow candidate list to officer's area
    let candidates = pos.candidates;
    if (isGovernment && !pos.scopeValue && jurisdictionValue) {
      if (['COUNTY', 'CONSTITUENCY', 'WARD'].includes(jurisdictionLevel)) {
        candidates = candidates.filter(c => !c.scopeValue || c.scopeValue === jurisdictionValue);
      }
    }
    const decl = existing.find(d => d.positionId === pos.id);
    return {
      positionId:    pos.id,
      positionTitle: pos.title,
      scope:         pos.scope,
      scopeValue:    pos.scopeValue,
      candidates:    candidates.map(c => ({ id: c.id, name: c.name, party: c.party, scopeValue: c.scopeValue })),
      declaration:   decl ?? null,
    };
  });
}
