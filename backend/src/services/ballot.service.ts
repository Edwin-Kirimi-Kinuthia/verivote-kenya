/**
 * VeriVote Kenya — Ballot Service
 *
 * Generates the personalised ballot each voter sees when they vote.
 *
 * Geographic eligibility (GOVERNMENT elections):
 *   voter.pollingStation.county       → COUNTY-scoped positions
 *   voter.pollingStation.constituency → CONSTITUENCY-scoped positions
 *   voter.pollingStation.ward         → WARD-scoped positions
 *   NATIONAL                          → always included
 *
 * Membership eligibility (INSTITUTIONAL / CORPORATE):
 *   voter must have an ElectionEnrollment row for the election.
 *   All CUSTOM-scoped positions are included for enrolled voters.
 */

import { prisma } from '../database/client.js';
import { ServiceError } from './voter.service.js';
import type { PositionScope } from '@prisma/client';

// ── Public types ──────────────────────────────────────────────────────────────

export interface BallotCandidate {
  candidateId:  string;
  name:         string;
  party:        string | null;
  description:  string | null;
  photoUrl:     string | null;
  ballotNumber: number | null;
}

export interface BallotPosition {
  positionId:       string;
  title:            string;
  description:      string | null;
  scope:            PositionScope;
  maxVotesPerVoter: number;
  orderIndex:       number;
  candidates:       BallotCandidate[];
}

export interface VoterBallot {
  electionId:   string;
  electionName: string;
  electionType: string;
  positions:    BallotPosition[];
}

export interface ActiveElectionSummary {
  electionId:   string;
  name:         string;
  type:         string;
  orgName:      string | null;
  startDate:    string | null;
  endDate:      string | null;
  positionCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine whether a position is shown on the voter's ballot.
 *
 * Two modes:
 *  - Position has scopeValue ("Nairobi"): legacy / single-area — only voters in
 *    that exact area see the position. Works as before.
 *  - Position has no scopeValue (template): the position is shown to any voter
 *    in any county/constituency/ward, but candidates are then filtered by their
 *    own scopeValue so each voter sees only their local candidates.
 */
function isEligiblePosition(
  scope: PositionScope,
  positionScopeValue: string | null,
  county: string,
  constituency: string,
  ward: string,
): boolean {
  switch (scope) {
    case 'NATIONAL':     return true;
    // Template (null scopeValue): always include — candidates filtered below
    case 'COUNTY':       return !positionScopeValue || positionScopeValue === county;
    case 'CONSTITUENCY': return !positionScopeValue || positionScopeValue === constituency;
    case 'WARD':         return !positionScopeValue || positionScopeValue === ward;
    case 'CUSTOM':       return false; // handled separately via enrollment
  }
}

/**
 * Filter candidates for a position to only those representing the voter's area.
 *
 * - If the position itself has a scopeValue (single-area position), all its
 *   candidates are already for that area — no candidate-level filtering needed.
 * - If the position is a template (no scopeValue), filter by candidate.scopeValue.
 *   Candidates with no scopeValue are treated as visible to all (national-level
 *   party-list candidates, running-mates, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterCandidatesForVoter(
  scope: PositionScope,
  positionScopeValue: string | null,
  candidates: any[],
  county: string,
  constituency: string,
  ward: string,
): any[] {
  // Position has its own area — all candidates belong to that area already
  if (positionScopeValue) return candidates;

  switch (scope) {
    case 'COUNTY':
      return candidates.filter(c => !c.scopeValue || c.scopeValue === county);
    case 'CONSTITUENCY':
      return candidates.filter(c => !c.scopeValue || c.scopeValue === constituency);
    case 'WARD':
      return candidates.filter(c => !c.scopeValue || c.scopeValue === ward);
    default:
      return candidates;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function getActiveElectionsForVoter(voterId: string): Promise<ActiveElectionSummary[]> {
  const voter = await prisma.voter.findUnique({
    where:   { id: voterId },
    include: { pollingStation: true },
  });
  if (!voter) throw new ServiceError('Voter not found', 404);

  // All ACTIVE elections
  const elections = await prisma.election.findMany({
    where:   { status: 'ACTIVE' },
    include: { _count: { select: { positions: true } }, enrollments: { where: { voterId } } },
  });

  return elections
    .filter(e => {
      if (e._count.positions === 0) return false;        // no positions = nothing to vote on
      if (e.type === 'GOVERNMENT') return true;          // all gov elections visible
      return e.enrollments.length > 0;                  // must be enrolled for others
    })
    .map(e => ({
      electionId:    e.id,
      name:          e.name,
      type:          e.type,
      orgName:       e.orgName,
      startDate:     e.startDate?.toISOString() ?? null,
      endDate:       e.endDate?.toISOString()   ?? null,
      positionCount: e._count.positions,
    }));
}

export async function getVoterBallot(voterId: string, electionId: string): Promise<VoterBallot> {
  const voter = await prisma.voter.findUnique({
    where:   { id: voterId },
    include: { pollingStation: true },
  });
  if (!voter) throw new ServiceError('Voter not found', 404);

  const election = await prisma.election.findUnique({
    where:   { id: electionId },
    include: {
      positions: {
        orderBy:  { orderIndex: 'asc' },
        include:  {
          candidates: {
            where:   { isActive: true },
            orderBy: { ballotNumber: 'asc' },
          },
        },
      },
      enrollments: { where: { voterId } },
    },
  });
  if (!election) throw new ServiceError('Election not found', 404);
  if (election.status !== 'ACTIVE') {
    throw new ServiceError('This election is not currently active', 400);
  }

  // For non-government elections, voter must be enrolled
  if (election.type !== 'GOVERNMENT' && election.enrollments.length === 0) {
    throw new ServiceError('You are not enrolled in this election', 403);
  }

  const county       = voter.pollingStation?.county       ?? '';
  const constituency = voter.pollingStation?.constituency ?? '';
  const ward         = voter.pollingStation?.ward         ?? '';
  const isEnrolled   = election.enrollments.length > 0;

  // Diaspora voters at embassy stations see only NATIONAL-scoped positions
  // (they cannot vote for Governor, MP, etc. for a specific geographic area)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDiaspora = (voter.pollingStation as any)?.isDiaspora === true;

  const eligiblePositions: BallotPosition[] = election.positions
    .filter(pos => {
      if (isDiaspora && election.type === 'GOVERNMENT') {
        return pos.scope === 'NATIONAL';
      }
      if (pos.scope === 'CUSTOM') return isEnrolled;
      return isEligiblePosition(pos.scope, pos.scopeValue, county, constituency, ward);
    })
    .map(pos => {
      const localCandidates = filterCandidatesForVoter(
        pos.scope, pos.scopeValue, pos.candidates, county, constituency, ward,
      );
      return {
        positionId:       pos.id,
        title:            pos.title,
        description:      pos.description,
        scope:            pos.scope,
        maxVotesPerVoter: pos.maxVotesPerVoter,
        orderIndex:       pos.orderIndex,
        candidates:       localCandidates.map(c => ({
          candidateId:  c.id,
          name:         c.name,
          party:        c.party,
          description:  c.description,
          photoUrl:     c.photoUrl,
          ballotNumber: c.ballotNumber,
        })),
      };
    })
    // Drop template positions that have no candidates for this voter's area
    .filter(pos => pos.candidates.length > 0);

  return {
    electionId:   election.id,
    electionName: election.name,
    electionType: election.type,
    positions:    eligiblePositions,
  };
}

/**
 * Validates that:
 * - every positionId in selections exists in the voter's ballot
 * - every candidateId is valid for its position
 * - all required positions are filled
 * Throws ServiceError if invalid.
 */
export async function validateSelections(
  voterId:    string,
  electionId: string,
  selections: Record<string, string>,
): Promise<void> {
  const ballot = await getVoterBallot(voterId, electionId);

  const positionMap = new Map(ballot.positions.map(p => [p.positionId, p]));

  for (const [positionId, candidateId] of Object.entries(selections)) {
    const position = positionMap.get(positionId);
    if (!position) {
      throw new ServiceError(`Position ${positionId} is not on your ballot`, 400);
    }
    const validCandidate = position.candidates.some(c => c.candidateId === candidateId);
    if (!validCandidate) {
      throw new ServiceError(`Candidate ${candidateId} is not valid for position ${positionId}`, 400);
    }
  }

  // All positions must have exactly one selection
  for (const position of ballot.positions) {
    if (!selections[position.positionId]) {
      throw new ServiceError(`Missing selection for position: ${position.title}`, 400);
    }
  }
}

/**
 * Returns a flat list of all candidates for an election, suitable for
 * passing to encryptHomomorphicBallot as the allCandidates argument.
 */
export async function getAllCandidatesForElection(
  electionId: string,
): Promise<Array<{ positionId: string; candidateId: string }>> {
  const positions = await prisma.position.findMany({
    where:   { electionId },
    include: { candidates: { where: { isActive: true } } },
  });

  return positions.flatMap(p =>
    p.candidates.map(c => ({ positionId: p.id, candidateId: c.id })),
  );
}
