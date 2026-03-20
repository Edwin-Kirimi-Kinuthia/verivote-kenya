/**
 * VeriVote Kenya — AI Service Internal Data Endpoint
 *
 * Provides aggregated election monitoring data for the on-premise AI service.
 * Authentication: X-AI-Service-Key header (AI_INTERNAL_KEY env var).
 *
 * GET /api/ai-internal/monitoring-data
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../database/client.js';

const router: Router = Router();

function requireAiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-ai-service-key'];
  const expected = process.env.AI_INTERNAL_KEY;
  if (!expected || key !== expected) {
    res.status(401).json({ error: 'Invalid or missing AI service key' });
    return;
  }
  next();
}

router.use(requireAiKey);

router.get('/monitoring-data', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const oneHourAgo    = new Date(now.getTime() - 60 * 60 * 1000);
    const thirtyMinAgo  = new Date(now.getTime() - 30 * 60 * 1000);
    const twentyFourHAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── Active elections ─────────────────────────────────────────────────────
    const activeElections = await prisma.election.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, type: true, startDate: true, endDate: true },
    });

    // ── Tallied elections (for blockchain/tally integrity check) ─────────────
    const talliedElections = await prisma.election.findMany({
      where: { status: 'TALLIED' },
      select: { id: true, name: true, tallyResultJson: true },
    });

    // ── Polling stations (all, for name/location lookup) ─────────────────────
    const allStations = await prisma.pollingStation.findMany({
      select: { id: true, name: true, county: true, constituency: true, ward: true },
    });
    const stationMap = new Map(allStations.map(s => [s.id, s]));

    // ── Active election data ──────────────────────────────────────────────────
    const activeElectionData = await Promise.all(activeElections.map(async election => {
      const eid = election.id;

      // Aggregate vote counts per station for different time windows
      const [
        votesHour,
        votes30Min,
        distress30Min,
        totalPerStation,
        confirmedPerStation,
      ] = await Promise.all([
        prisma.vote.groupBy({
          by: ['pollingStationId'],
          where: { electionId: eid, createdAt: { gte: oneHourAgo } },
          _count: true,
        }),
        prisma.vote.groupBy({
          by: ['pollingStationId'],
          where: { electionId: eid, createdAt: { gte: thirtyMinAgo } },
          _count: true,
        }),
        prisma.vote.groupBy({
          by: ['pollingStationId'],
          where: { electionId: eid, isDistressFlagged: true, createdAt: { gte: thirtyMinAgo } },
          _count: true,
        }),
        prisma.vote.groupBy({
          by: ['pollingStationId'],
          where: { electionId: eid },
          _count: true,
        }),
        prisma.vote.groupBy({
          by: ['pollingStationId'],
          where: { electionId: eid, blockchainTxHash: { not: null } },
          _count: true,
        }),
      ]);

      const hourMap      = new Map(votesHour.map(v => [v.pollingStationId, v._count]));
      const min30Map     = new Map(votes30Min.map(v => [v.pollingStationId, v._count]));
      const distressMap  = new Map(distress30Min.map(v => [v.pollingStationId, v._count]));
      const totalMap     = new Map(totalPerStation.map(v => [v.pollingStationId, v._count]));
      const confirmedMap = new Map(confirmedPerStation.map(v => [v.pollingStationId, v._count]));

      const stationIds = new Set([...totalMap.keys(), ...hourMap.keys()]);

      const stations = Array.from(stationIds).map(sid => {
        const info    = stationMap.get(sid);
        const total   = totalMap.get(sid) ?? 0;
        const confirmed = confirmedMap.get(sid) ?? 0;
        return {
          id:           sid,
          name:         info?.name ?? 'Unknown',
          county:       info?.county ?? '',
          constituency: info?.constituency ?? '',
          ward:         info?.ward ?? '',
          stats: {
            totalVotes:        total,
            votesLastHour:     hourMap.get(sid)    ?? 0,
            votesLast30Min:    min30Map.get(sid)   ?? 0,
            distressLast30Min: distressMap.get(sid) ?? 0,
            blockchainConfirmed: confirmed,
            blockchainPending:   total - confirmed,
          },
        };
      });

      // Election-level aggregates
      const [totalVotes, totalConfirmed, distress30, distressTotal] = await Promise.all([
        prisma.vote.count({ where: { electionId: eid } }),
        prisma.vote.count({ where: { electionId: eid, blockchainTxHash: { not: null } } }),
        prisma.vote.count({ where: { electionId: eid, isDistressFlagged: true, createdAt: { gte: thirtyMinAgo } } }),
        prisma.vote.count({ where: { electionId: eid, isDistressFlagged: true } }),
      ]);

      return {
        id:        election.id,
        name:      election.name,
        type:      election.type,
        startDate: election.startDate,
        endDate:   election.endDate,
        stations,
        electionStats: {
          totalVotes,
          blockchainConfirmed:  totalConfirmed,
          blockchainPending:    totalVotes - totalConfirmed,
          distressTotal,
          distressLast30Min:    distress30,
        },
      };
    }));

    // ── Tallied election integrity data ───────────────────────────────────────
    const talliedElectionData = await Promise.all(talliedElections.map(async election => {
      const eid = election.id;
      const [blockchainCount, totalCount, homomorphicBallotCount] = await Promise.all([
        // Only CONFIRMED votes — SUPERSEDED votes also carry a txHash (from before
        // they were replaced) and must be excluded or the AI checker sees a false
        // "blockchain > tally" discrepancy.
        prisma.vote.count({ where: { electionId: eid, status: 'CONFIRMED', blockchainTxHash: { not: null } } }),
        // Exclude SUPERSEDED so totalCount matches what the tally actually counted.
        prisma.vote.count({ where: { electionId: eid, status: { not: 'SUPERSEDED' } } }),
        // Count CONFIRMED votes that actually had homomorphic ballot data —
        // the tally can only process these, so this is the correct denominator
        // for comparing against totalBallotsProcessed in the integrity check.
        prisma.vote.count({ where: { electionId: eid, status: 'CONFIRMED', homomorphicBallot: { not: null } } }),
      ]);
      let tallyResult: unknown = null;
      if (election.tallyResultJson) {
        try { tallyResult = JSON.parse(election.tallyResultJson); } catch { /* ignore */ }
      }
      return {
        id:                     election.id,
        name:                   election.name,
        blockchainCount,
        totalCount,
        unconfirmedCount:       totalCount - blockchainCount,
        homomorphicBallotCount,
        tallyResult,
      };
    }));

    // ── System stats ──────────────────────────────────────────────────────────
    const totalDistress24h = await prisma.vote.count({
      where: { isDistressFlagged: true, createdAt: { gte: twentyFourHAgo } },
    });

    res.json({
      timestamp: now.toISOString(),
      activeElections: activeElectionData,
      talliedElections: talliedElectionData,
      systemStats: {
        totalActiveElections: activeElections.length,
        totalDistress24h,
        recentDistressLast30Min: activeElectionData.reduce(
          (sum, e) => sum + e.electionStats.distressLast30Min, 0,
        ),
      },
    });
  } catch (err) {
    console.error('AI internal monitoring-data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
