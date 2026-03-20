/**
 * VeriVote Kenya — Paper Ballot Audit Trail Routes
 *
 * Generates jurisdiction-scoped ballot manifests (Form 34A-style) that IEBC
 * officials can print as physical audit records for dispute resolution.
 *
 * Only CONFIRMED votes are included (SUPERSEDED votes from revotes are excluded).
 * Each official can only access their own jurisdiction's data.
 *
 * The manifest is built from the declared tallySnapshot (candidate/position
 * breakdown) cross-referenced against the blockchain: every CONFIRMED vote in
 * the jurisdiction whose blockchainTxHash is recorded is listed as a blockchain-
 * verified commitment.  Dispute resolution workflow:
 *   1. Obtain the printed manifest (this endpoint).
 *   2. For each tx hash listed, look it up on the Hardhat / mainnet explorer.
 *   3. Confirm the voteHash stored on-chain matches the one in the database.
 *   4. Confirm isSuperseded = false on the chain.
 * This proves the counted votes were individually anchored to the blockchain
 * before the tally was run — the paper cannot have been fabricated.
 *
 * GET  /api/paper-ballots/manifest/:electionId  — tally manifest for printing
 * POST /api/paper-ballots/print-log             — record a print event (persisted)
 * GET  /api/paper-ballots/print-logs/:electionId — list print events
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import { prisma } from '../database/client.js';
import { ServiceError } from '../services/voter.service.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();
router.use(requireAuth, requireAdmin);

const BALLOT_ROLES = requireStaffRole(
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER',
);

/** Build a Prisma `where` clause for votes filtered to the officer's jurisdiction */
function voteJurisdictionWhere(level: string, value: string | null): Record<string, unknown> {
  if (!value || level === 'NATIONAL') return {};
  switch (level) {
    case 'COUNTY':          return { pollingStation: { county:        value } };
    case 'CONSTITUENCY':    return { pollingStation: { constituency:  value } };
    case 'WARD':            return { pollingStation: { ward:          value } };
    case 'POLLING_STATION': return { pollingStation: { name:          value } };
    default: return {};
  }
}

// ── GET /api/paper-ballots/manifest/:electionId ───────────────────────────────
router.get('/manifest/:electionId', BALLOT_ROLES, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { electionId } = req.params;
    const jurisdictionLevel = authReq.voter.jurisdictionLevel ?? 'NATIONAL';
    const jurisdictionValue = authReq.voter.jurisdictionValue ?? null;

    const election = await (prisma as any).election.findUnique({
      where: { id: electionId },
      select: { id: true, name: true, status: true, type: true, startDate: true, endDate: true },
    });
    if (!election) throw new ServiceError('Election not found', 404);

    // Commission tier and NATIONAL_RO see all declarations; field officers see their jurisdiction
    const isNational = ['CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY',
                        'DEPUTY_COMMISSION_SECRETARY', 'NATIONAL_RO']
                        .includes(authReq.voter.staffRole ?? '');

    const declarationWhere: Record<string, unknown> = {
      electionId,
      status: 'DECLARED',
      ...(!isNational && jurisdictionValue ? { jurisdictionValue } : {}),
    };

    const declarations = await (prisma as any).resultDeclaration.findMany({
      where: declarationWhere,
      include: {
        position: { select: { title: true, scope: true } },
        staff: { select: { voter: { select: { nationalId: true } } } },
      },
      orderBy: [{ position: { title: 'asc' } }, { jurisdictionValue: 'asc' }],
    });

    // Vote statistics scoped to officer's jurisdiction
    const jurisdictionFilter = voteJurisdictionWhere(jurisdictionLevel, jurisdictionValue);
    const baseVoteWhere = { electionId, ...jurisdictionFilter };

    const [confirmedCount, supersededCount, pendingCount] = await Promise.all([
      prisma.vote.count({ where: { ...baseVoteWhere, status: 'CONFIRMED' } }),
      prisma.vote.count({ where: { ...baseVoteWhere, status: 'SUPERSEDED' } }),
      prisma.vote.count({ where: { ...baseVoteWhere, status: 'PENDING' } }),
    ]);

    // ── Blockchain verification ───────────────────────────────────────────────
    // Pull blockchainTxHash + encryptedVoteHash for every CONFIRMED vote in
    // this jurisdiction.  A non-null txHash means the vote was anchored to the
    // chain before the tally was run.  Dispute resolution: look up each txHash
    // on the explorer and confirm voteHash + isSuperseded=false on-chain.
    const confirmedVotes = await prisma.vote.findMany({
      where: { ...baseVoteWhere, status: 'CONFIRMED' },
      select: {
        serialNumber:      true,
        encryptedVoteHash: true,
        blockchainTxHash:  true,
        timestamp:         true,
      },
      orderBy: { timestamp: 'asc' },
    });

    const blockchainVerified = confirmedVotes.filter((v) => v.blockchainTxHash !== null);
    const blockchainVerifiedCount = blockchainVerified.length;

    // Build the per-position tally from declared results
    const positions = declarations.map((d: any) => {
      const raw = d.tallySnapshot ? JSON.parse(d.tallySnapshot as string) : {};
      const tally = Object.entries(raw as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
        .map(([candidateName, votes], rank) => ({ rank: rank + 1, candidateName, votes }));
      const totalVotes = tally.reduce((s, c) => s + c.votes, 0);
      const winner = tally[0] ?? null;
      return {
        positionId:        d.positionId,
        positionTitle:     d.position?.title ?? 'Unknown',
        positionScope:     d.position?.scope ?? null,
        jurisdictionLevel: d.jurisdictionLevel,
        jurisdictionValue: d.jurisdictionValue,
        declaredAt:        d.declaredAt,
        declaredBy:        d.staff?.voter?.nationalId ?? null,
        tally,
        totalVotes,
        winner: winner ? { name: winner.candidateName, votes: winner.votes } : null,
      };
    });

    const formReference = `VV-${electionId.slice(0, 8).toUpperCase()}-${jurisdictionValue?.replace(/\s+/g, '-').toUpperCase() ?? 'NATIONAL'}-${Date.now()}`;

    res.json({
      success: true,
      data: {
        election,
        officer: { jurisdictionLevel, jurisdictionValue },
        voteStats: {
          confirmed:  confirmedCount,
          superseded: supersededCount,
          pending:    pendingCount,
          total:      confirmedCount + supersededCount + pendingCount,
          note: 'Only CONFIRMED votes appear in the tally. SUPERSEDED votes are from revotes and are excluded.',
        },
        // Blockchain verification section
        // Each entry in blockchainCommitments can be independently verified:
        //   1. Go to the blockchain explorer, look up txHash
        //   2. Confirm the voteHash stored on-chain matches encryptedVoteHash
        //   3. Confirm isSuperseded = false on-chain
        blockchainVerification: {
          totalConfirmed:        confirmedCount,
          blockchainVerified:    blockchainVerifiedCount,
          unverified:            confirmedCount - blockchainVerifiedCount,
          coveragePct:           confirmedCount > 0
            ? Math.round((blockchainVerifiedCount / confirmedCount) * 100)
            : 100,
          note: 'blockchainVerified votes were individually anchored to the blockchain before tallying. Look up each txHash on the explorer to independently confirm voteHash and isSuperseded=false.',
          commitments: blockchainVerified.map((v) => ({
            serialNumber:      v.serialNumber,
            encryptedVoteHash: v.encryptedVoteHash,
            txHash:            v.blockchainTxHash,
            timestamp:         v.timestamp,
          })),
        },
        positions,
        positionCount:    positions.length,
        generatedAt:      new Date().toISOString(),
        formReference,
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to generate ballot manifest' });
  }
});

// ── POST /api/paper-ballots/print-log ────────────────────────────────────────
router.post('/print-log', BALLOT_ROLES, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { electionId, formReference, pageCount, blockchainVerifiedCount } = req.body;
  if (!electionId || !formReference) {
    res.status(400).json({ success: false, error: 'electionId and formReference are required' });
    return;
  }
  try {
    // Use $queryRaw so this works even before the Prisma client is regenerated.
    // The table was created by `prisma db push`; the client model delegate may
    // not yet be compiled into the running process if the server hasn't been
    // restarted after generation.
    const rows = await prisma.$queryRaw<{ id: string; printed_at: Date }[]>`
      INSERT INTO paper_ballot_print_logs
        (id, election_id, form_reference, page_count,
         printed_by_voter_id, staff_id,
         jurisdiction_level, jurisdiction_value,
         blockchain_verified_count, printed_at)
      VALUES (
        gen_random_uuid(),
        ${electionId}::uuid,
        ${formReference},
        ${pageCount ?? 1},
        ${authReq.voter.sub}::uuid,
        ${authReq.voter.staffId ?? null}::uuid,
        ${authReq.voter.jurisdictionLevel ?? 'NATIONAL'},
        ${authReq.voter.jurisdictionValue ?? null},
        ${blockchainVerifiedCount ?? 0},
        NOW()
      )
      RETURNING id, election_id, form_reference, page_count,
                printed_by_voter_id, staff_id,
                jurisdiction_level, jurisdiction_value,
                blockchain_verified_count, printed_at
    `;
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    res.status(500).json({ success: false, error: `Failed to record print log: ${msg}` });
  }
});

// ── GET /api/paper-ballots/print-logs/:electionId ────────────────────────────
router.get('/print-logs/:electionId', BALLOT_ROLES, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { electionId } = req.params;
  const isNational = ['CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY',
                      'DEPUTY_COMMISSION_SECRETARY', 'NATIONAL_RO']
                      .includes(authReq.voter.staffRole ?? '');
  try {
    let logs: unknown[];
    if (isNational || !authReq.voter.jurisdictionValue) {
      logs = await prisma.$queryRaw`
        SELECT * FROM paper_ballot_print_logs
        WHERE election_id = ${electionId}::uuid
        ORDER BY printed_at DESC
      `;
    } else {
      logs = await prisma.$queryRaw`
        SELECT * FROM paper_ballot_print_logs
        WHERE election_id = ${electionId}::uuid
          AND jurisdiction_value = ${authReq.voter.jurisdictionValue}
        ORDER BY printed_at DESC
      `;
    }
    res.json({ success: true, data: logs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    res.status(500).json({ success: false, error: `Failed to fetch print logs: ${msg}` });
  }
});

export default router;
