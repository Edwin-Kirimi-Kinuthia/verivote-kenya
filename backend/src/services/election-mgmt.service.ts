/**
 * VeriVote Kenya — Election Management Service
 *
 * CRUD operations for Elections, Positions, Candidates, and Enrollments.
 * This is the admin-facing service; voter-facing ballot generation lives in
 * ballot.service.ts.
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type {
  ElectionType,
  ElectionStatus,
  PositionScope,
} from '@prisma/client';

// ── Status transition graph ───────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ElectionStatus, ElectionStatus[]> = {
  DRAFT:       ['NOMINATIONS', 'ARCHIVED'],
  NOMINATIONS: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  ACTIVE:      ['CLOSED'],
  CLOSED:      [],  // TALLIED only via homomorphic ceremony — no manual transition
  TALLIED:     ['ARCHIVED'],
  ARCHIVED:    [],
};

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateElectionInput {
  name: string;
  description?: string;
  type: ElectionType;
  orgName?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateElectionInput {
  name?: string;
  description?: string;
  orgName?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreatePositionInput {
  title: string;
  description?: string;
  scope: PositionScope;
  scopeValue?: string;
  maxVotesPerVoter?: number;
  orderIndex?: number;
}

export interface UpdatePositionInput {
  title?: string;
  description?: string;
  scope?: PositionScope;
  scopeValue?: string;
  maxVotesPerVoter?: number;
  orderIndex?: number;
}

export interface CreateCandidateInput {
  name: string;
  party?: string;
  description?: string;
  photoUrl?: string;
  ballotNumber?: number;
  /** Geographic area (county / constituency / ward) for template positions */
  scopeValue?: string;
}

export interface UpdateCandidateInput {
  name?: string;
  party?: string;
  description?: string;
  photoUrl?: string;
  ballotNumber?: number;
  isActive?: boolean;
  scopeValue?: string;
}

// ── Election CRUD ─────────────────────────────────────────────────────────────

export async function createElection(input: CreateElectionInput) {
  return prisma.election.create({
    data: {
      name:        input.name,
      description: input.description,
      type:        input.type,
      orgName:     input.orgName,
      startDate:   input.startDate ? new Date(input.startDate) : undefined,
      endDate:     input.endDate   ? new Date(input.endDate)   : undefined,
    },
  });
}

export async function listElections(params: {
  type?:   ElectionType;
  status?: ElectionStatus;
  page?:   number;
  limit?:  number;
}) {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, params.limit ?? 20);
  const skip  = (page - 1) * limit;

  const where = {
    ...(params.type   ? { type:   params.type   } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.election.count({ where }),
    prisma.election.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { positions: true, votes: true, enrollments: true } },
      },
    }),
  ]);

  return { total, page, limit, items };
}

export async function getElection(id: string) {
  const election = await prisma.election.findUnique({
    where: { id },
    include: {
      positions: {
        orderBy: { orderIndex: 'asc' },
        include: {
          candidates: {
            where:   { isActive: true },
            orderBy: { ballotNumber: 'asc' },
          },
        },
      },
      _count: { select: { votes: true, enrollments: true } },
    },
  });
  if (!election) throw new ServiceError('Election not found', 404);
  return election;
}

export async function updateElection(id: string, input: UpdateElectionInput) {
  const election = await prisma.election.findUnique({ where: { id } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(election.status)) {
    throw new ServiceError('Cannot edit an election that is already active or completed', 409);
  }
  return prisma.election.update({
    where: { id },
    data: {
      ...(input.name        !== undefined && { name:        input.name        }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.orgName     !== undefined && { orgName:     input.orgName     }),
      ...(input.startDate   !== undefined && { startDate:   input.startDate ? new Date(input.startDate) : null }),
      ...(input.endDate     !== undefined && { endDate:     input.endDate   ? new Date(input.endDate)   : null }),
    },
  });
}

export async function transitionElectionStatus(id: string, nextStatus: ElectionStatus) {
  const election = await prisma.election.findUnique({ where: { id } });
  if (!election) throw new ServiceError('Election not found', 404);

  const allowed = ALLOWED_TRANSITIONS[election.status];
  if (!allowed.includes(nextStatus)) {
    throw new ServiceError(
      `Cannot transition from ${election.status} to ${nextStatus}. ` +
      `Allowed: ${allowed.join(', ') || 'none'}`,
      409,
    );
  }

  return prisma.election.update({ where: { id }, data: { status: nextStatus } });
}

export async function deleteElection(id: string) {
  const election = await prisma.election.findUnique({ where: { id } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (election.status !== 'DRAFT') {
    throw new ServiceError('Only DRAFT elections can be deleted', 409);
  }
  await prisma.election.delete({ where: { id } });
}

// ── Position CRUD ─────────────────────────────────────────────────────────────

export async function createPosition(electionId: string, input: CreatePositionInput) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(election.status)) {
    throw new ServiceError('Cannot add positions to an active or completed election', 409);
  }

  return prisma.position.create({
    data: {
      electionId,
      title:            input.title,
      description:      input.description,
      scope:            input.scope,
      scopeValue:       input.scopeValue,
      maxVotesPerVoter: input.maxVotesPerVoter ?? 1,
      orderIndex:       input.orderIndex       ?? 0,
    },
    include: { candidates: true },
  });
}

export async function updatePosition(id: string, input: UpdatePositionInput) {
  const position = await prisma.position.findUnique({
    where:   { id },
    include: { election: true },
  });
  if (!position) throw new ServiceError('Position not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(position.election.status)) {
    throw new ServiceError('Cannot edit positions in an active or completed election', 409);
  }

  return prisma.position.update({
    where: { id },
    data: {
      ...(input.title            !== undefined && { title:            input.title            }),
      ...(input.description      !== undefined && { description:      input.description      }),
      ...(input.scope            !== undefined && { scope:            input.scope            }),
      ...(input.scopeValue       !== undefined && { scopeValue:       input.scopeValue       }),
      ...(input.maxVotesPerVoter !== undefined && { maxVotesPerVoter: input.maxVotesPerVoter }),
      ...(input.orderIndex       !== undefined && { orderIndex:       input.orderIndex       }),
    },
    include: { candidates: true },
  });
}

export async function deletePosition(id: string) {
  const position = await prisma.position.findUnique({
    where:   { id },
    include: { election: true },
  });
  if (!position) throw new ServiceError('Position not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(position.election.status)) {
    throw new ServiceError('Cannot delete positions in an active or completed election', 409);
  }
  await prisma.position.delete({ where: { id } }); // candidates cascade
}

// ── Candidate CRUD ────────────────────────────────────────────────────────────

export async function createCandidate(positionId: string, input: CreateCandidateInput) {
  const position = await prisma.position.findUnique({
    where:   { id: positionId },
    include: { election: true },
  });
  if (!position) throw new ServiceError('Position not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(position.election.status)) {
    throw new ServiceError('Cannot add candidates to an active or completed election', 409);
  }

  return prisma.candidate.create({
    data: {
      positionId,
      name:         input.name,
      party:        input.party,
      description:  input.description,
      photoUrl:     input.photoUrl,
      ballotNumber: input.ballotNumber,
      scopeValue:   input.scopeValue,
    },
  });
}

export async function updateCandidate(id: string, input: UpdateCandidateInput) {
  const candidate = await prisma.candidate.findUnique({
    where:   { id },
    include: { position: { include: { election: true } } },
  });
  if (!candidate) throw new ServiceError('Candidate not found', 404);

  return prisma.candidate.update({
    where: { id },
    data: {
      ...(input.name         !== undefined && { name:         input.name         }),
      ...(input.party        !== undefined && { party:        input.party        }),
      ...(input.description  !== undefined && { description:  input.description  }),
      ...(input.photoUrl     !== undefined && { photoUrl:     input.photoUrl     }),
      ...(input.ballotNumber !== undefined && { ballotNumber: input.ballotNumber }),
      ...(input.isActive     !== undefined && { isActive:     input.isActive     }),
      ...(input.scopeValue   !== undefined && { scopeValue:   input.scopeValue   }),
    },
  });
}

export async function deleteCandidate(id: string) {
  const candidate = await prisma.candidate.findUnique({
    where:   { id },
    include: { position: { include: { election: true } } },
  });
  if (!candidate) throw new ServiceError('Candidate not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(candidate.position.election.status)) {
    throw new ServiceError('Cannot delete candidates in an active or completed election', 409);
  }
  await prisma.candidate.delete({ where: { id } });
}

// ── Jurisdiction tree ─────────────────────────────────────────────────────────

export interface CreateJurisdictionInput {
  name:       string;
  level?:     'NATIONAL' | 'COUNTY' | 'CONSTITUENCY' | 'WARD';
  parentId?:  string;
  orderIndex?: number;
}

export interface UpdateJurisdictionInput {
  name?:       string;
  level?:      'NATIONAL' | 'COUNTY' | 'CONSTITUENCY' | 'WARD' | null;
  orderIndex?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jurisdictionModel = () => (prisma as any).electionJurisdiction;

/** Returns the full tree for an election as a flat array (sorted depth-first by depth, then orderIndex). */
export async function listJurisdictions(electionId: string) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);

  return jurisdictionModel().findMany({
    where:   { electionId },
    orderBy: [{ depth: 'asc' }, { orderIndex: 'asc' }, { name: 'asc' }],
    include: {
      _count:    { select: { children: true, positions: true } },
      positions: { orderBy: { orderIndex: 'asc' }, include: { candidates: { where: { isActive: true } } } },
    },
  });
}

export async function createJurisdiction(electionId: string, input: CreateJurisdictionInput) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(election.status)) {
    throw new ServiceError('Cannot modify jurisdictions on an active or completed election', 409);
  }

  // Determine depth from parent
  let depth = 0;
  if (input.parentId) {
    const parent = await jurisdictionModel().findUnique({ where: { id: input.parentId } });
    if (!parent) throw new ServiceError('Parent jurisdiction not found', 404);
    if (parent.electionId !== electionId) throw new ServiceError('Parent belongs to a different election', 400);
    depth = parent.depth + 1;
  }

  return jurisdictionModel().create({
    data: {
      electionId,
      parentId:   input.parentId ?? null,
      name:       input.name,
      level:      input.level ?? null,
      depth,
      orderIndex: input.orderIndex ?? 0,
    },
  });
}

export async function updateJurisdiction(id: string, input: UpdateJurisdictionInput) {
  const node = await jurisdictionModel().findUnique({
    where:   { id },
    include: { election: true },
  });
  if (!node) throw new ServiceError('Jurisdiction not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(node.election.status)) {
    throw new ServiceError('Cannot modify jurisdictions on an active or completed election', 409);
  }

  return jurisdictionModel().update({
    where: { id },
    data: {
      ...(input.name       !== undefined && { name:       input.name       }),
      ...(input.level      !== undefined && { level:      input.level      }),
      ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
    },
  });
}

export async function deleteJurisdiction(id: string) {
  const node = await jurisdictionModel().findUnique({
    where:   { id },
    include: { election: true, _count: { select: { children: true } } },
  });
  if (!node) throw new ServiceError('Jurisdiction not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(node.election.status)) {
    throw new ServiceError('Cannot modify jurisdictions on an active or completed election', 409);
  }
  if (node._count.children > 0) {
    throw new ServiceError('Cannot delete a jurisdiction that has children. Delete children first.', 409);
  }
  await jurisdictionModel().delete({ where: { id } });
}

/** Create a position linked to a jurisdiction node (in addition to the election). */
export async function createPositionInJurisdiction(
  electionId:     string,
  jurisdictionId: string,
  input:          CreatePositionInput,
) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (['ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'].includes(election.status)) {
    throw new ServiceError('Cannot add positions to an active or completed election', 409);
  }
  const node = await jurisdictionModel().findUnique({ where: { id: jurisdictionId } });
  if (!node) throw new ServiceError('Jurisdiction not found', 404);
  if (node.electionId !== electionId) throw new ServiceError('Jurisdiction belongs to a different election', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.position as any).create({
    data: {
      electionId,
      jurisdictionId,
      title:            input.title,
      description:      input.description,
      scope:            input.scope,
      scopeValue:       input.scopeValue,
      maxVotesPerVoter: input.maxVotesPerVoter ?? 1,
      orderIndex:       input.orderIndex       ?? 0,
    },
    include: { candidates: true },
  });
}

// ── Enrollment (INSTITUTIONAL / CORPORATE) ────────────────────────────────────

export async function enrollVoter(electionId: string, voterId: string) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (election.type === 'GOVERNMENT') {
    throw new ServiceError('Government elections use geographic eligibility, not enrollments', 400);
  }

  return prisma.electionEnrollment.upsert({
    where:  { electionId_voterId: { electionId, voterId } },
    create: { electionId, voterId },
    update: {},
  });
}

export async function bulkEnrollVoters(electionId: string, voterIds: string[]) {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) throw new ServiceError('Election not found', 404);
  if (election.type === 'GOVERNMENT') {
    throw new ServiceError('Government elections use geographic eligibility, not enrollments', 400);
  }

  const result = await prisma.electionEnrollment.createMany({
    data:           voterIds.map(voterId => ({ electionId, voterId })),
    skipDuplicates: true,
  });
  return { enrolled: result.count, skipped: voterIds.length - result.count };
}

export async function unenrollVoter(electionId: string, voterId: string) {
  await prisma.electionEnrollment.deleteMany({ where: { electionId, voterId } });
}

export async function listEnrollments(electionId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [total, items] = await Promise.all([
    prisma.electionEnrollment.count({ where: { electionId } }),
    prisma.electionEnrollment.findMany({
      where:   { electionId },
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        election: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { total, page, limit, items };
}
