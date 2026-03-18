/**
 * Threshold Homomorphic Ceremony routes.
 *
 * POST /api/ceremony/start        — Commissioner: run mixnet, aggregate ballots, split key
 *                                    dynamically based on active commissioner count,
 *                                    email each selected commissioner their share.
 * POST /api/ceremony/partial      — Commissioner: submit own SSS key share (identified via JWT)
 * POST /api/ceremony/finalize     — Manual override: reconstruct key + finalize tally
 * GET  /api/ceremony/status       — Any admin: current ceremony state (no share values)
 * GET  /api/ceremony/result       — Any admin: final tally result
 * POST /api/ceremony/reset        — Commissioner: clear ceremony state
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin, requireStaffRole } from '../middleware/auth.middleware.js';
import { prisma } from '../database/client.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../lib/logger.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';
import {
  startCeremony,
  submitShare,
  finalizeCeremony,
  getCeremonyStatus,
  getHomomorphicResult,
  resetCeremony,
  computeThreshold,
  type CommissionerInfo,
} from '../services/homomorphic.service.js';

const router: ExpressRouter = Router();

// All ceremony routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// Only COMMISSION-tier roles may initiate or reset the ceremony
const commissionOnly = requireStaffRole(
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
);

// ── POST /api/ceremony/start ───────────────────────────────────────────────────
// Runs the homomorphic ballot aggregation, computes dynamic k = ceil(√N) where
// N = number of active COMMISSION staff, splits the decryption key via Shamir's
// Secret Sharing, and emails each selected commissioner their share.
router.post('/start', commissionOnly, async (req: Request, res: Response) => {
  try {
    const electionId = (req.body as { electionId?: string })?.electionId;

    // ── Validate election is CLOSED ───────────────────────────────────────────
    if (electionId) {
      const election = await prisma.election.findUnique({
        where: { id: electionId },
        select: { id: true, status: true, name: true },
      });
      if (!election) {
        res.status(404).json({ success: false, error: 'Election not found.' });
        return;
      }
      if (election.status !== 'CLOSED') {
        res.status(400).json({
          success: false,
          error: `Election must be CLOSED before starting the ceremony. Current status: ${election.status}.`,
        });
        return;
      }
    }

    // ── Load all active COMMISSION-role staff ─────────────────────────────────
    const staffRows = await prisma.iebcStaff.findMany({
      where: {
        isActive: true,
        staffRole: {
          in: ['CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY'],
        },
      },
      include: {
        voter: {
          select: {
            id: true, nationalId: true,
            email: true, phoneNumber: true,
            status: true, passwordHash: true,
          },
        },
      },
    });

    // Only include staff whose voter account can log in (has password + active status)
    const activeStaff = staffRows.filter((s) =>
      s.voter?.passwordHash && ['REGISTERED', 'VOTED', 'REVOTED'].includes(s.voter.status),
    );

    const allCommissioners: CommissionerInfo[] = activeStaff.map((s) => ({
      voterId:     s.voter.id,
      nationalId:  s.voter.nationalId,
      name:        s.voter.email?.split('@')[0] ?? `Commissioner ${s.voter.nationalId}`,
      email:       s.voter.email,
      phoneNumber: s.voter.phoneNumber,
    }));

    const n = allCommissioners.length;
    const k = n > 0 ? computeThreshold(n) : 1;

    logger.info('Ceremony start requested', {
      electionId,
      totalCommissioners: n,
      threshold: k,
      initiatedBy: (req as AuthenticatedRequest).voter?.sub,
    });

    // ── Aggregate ballots and generate SSS shares ─────────────────────────────
    const info = await startCeremony(electionId, allCommissioners);

    // ── Email each selected commissioner their share ──────────────────────────
    const electionName = electionId
      ? (await prisma.election.findUnique({ where: { id: electionId }, select: { name: true } }))?.name ?? 'Unknown Election'
      : 'Legacy Ceremony';

    const mockShares: Record<string, string> = {};
    const isDev = process.env.NODE_ENV !== 'production';

    for (const sc of info.selectedCommissioners) {
      const comm = allCommissioners.find((c) => c.voterId === sc.voterId);
      if (!comm) continue;

      const contact = comm.email ?? comm.phoneNumber;
      const channel = comm.email ? 'EMAIL' : 'SMS';

      if (isDev) {
        // In development expose shares in the response (like mockCode in OTP)
        mockShares[sc.voterId] = sc.shareHex;
      }

      if (contact) {
        try {
          await notificationService.sendCeremonyKeyShare({
            channel:         channel as 'EMAIL' | 'SMS',
            recipient:       contact,
            nationalId:      comm.nationalId,
            commissionerName: sc.name,
            electionName,
            shareIndex:      sc.shareIndex,
            threshold:       info.threshold,
            shareHex:        sc.shareHex,
            commitment:      sc.commitment,
            ceremonyId:      info.ceremonyId,
          });
        } catch (emailErr) {
          logger.warn('Failed to deliver key share to commissioner', {
            voterId: sc.voterId,
            reason: (emailErr as Error).message,
          });
        }
      }
    }

    // Return ceremony info — share hex values are NOT included in the HTTP response
    // (they were emailed); only included in mockShares for non-production testing.
    res.json({
      success: true,
      ceremonyId:         info.ceremonyId,
      totalBallots:       info.totalBallots,
      threshold:          info.threshold,
      totalCommissioners: info.totalCommissioners,
      selectedCommissioners: info.selectedCommissioners.map((sc) => ({
        voterId:    sc.voterId,
        name:       sc.name,
        shareIndex: sc.shareIndex,
        commitment: sc.commitment,
      })),
      ...(isDev && Object.keys(mockShares).length > 0 ? { mockShares } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/ceremony/partial ────────────────────────────────────────────────
// The authenticated commissioner submits their key share.
// If this brings the count to the threshold, tally is auto-finalized.
router.post('/partial', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const voterId = authReq.voter?.sub;
  const { share } = req.body as { share?: string };

  if (!voterId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (!share || typeof share !== 'string' || share.trim() === '') {
    res.status(400).json({ error: 'Request body must include a non-empty "share" field (hex string).' });
    return;
  }

  try {
    const { received, threshold, allReceived } = submitShare(voterId, share);

    // Auto-finalize when all k shares have been collected
    if (allReceived) {
      try {
        finalizeCeremony();
        logger.info('Ceremony auto-finalized after threshold reached', { voterId, received, threshold });
        res.json({ success: true, received, threshold, allReceived: true, finalized: true });
        return;
      } catch (finalErr) {
        logger.error('Auto-finalize failed', { reason: (finalErr as Error).message });
        res.status(500).json({ error: `Share accepted but finalization failed: ${(finalErr as Error).message}` });
        return;
      }
    }

    res.json({ success: true, received, threshold, allReceived: false, finalized: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// ── POST /api/ceremony/finalize ───────────────────────────────────────────────
// Manual override — auto-triggered after the last share is submitted.
router.post('/finalize', commissionOnly, (_req: Request, res: Response) => {
  try {
    const result = finalizeCeremony();
    res.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// ── GET /api/ceremony/status ──────────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
  const status = getCeremonyStatus();
  if (!status.started) {
    res.status(404).json({ started: false });
    return;
  }
  res.json(status);
});

// ── GET /api/ceremony/result ──────────────────────────────────────────────────
router.get('/result', (_req: Request, res: Response) => {
  const result = getHomomorphicResult();
  if (!result) {
    res.status(404).json({ error: 'No ceremony result yet. Run the ceremony first.' });
    return;
  }
  res.json(result);
});

// ── POST /api/ceremony/reset ──────────────────────────────────────────────────
router.post('/reset', commissionOnly, (_req: Request, res: Response) => {
  resetCeremony();
  res.json({ success: true, message: 'Ceremony state cleared.' });
});

export default router;
