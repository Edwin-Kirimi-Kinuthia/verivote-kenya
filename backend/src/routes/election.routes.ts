import { Router, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { runElectionCeremony, getLastElectionResult } from '../services/election.service.js';
import { prisma } from '../database/client.js';

const router: Router = Router();

/**
 * POST /api/election/ceremony
 * Run the full election ceremony: Mixnet → Threshold Homomorphic Tally.
 * Admin only. May take several seconds on large vote sets.
 */
router.post(
  '/ceremony',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const electionId = (req.body as { electionId?: string })?.electionId;
      const result = await runElectionCeremony(electionId);

      // Persist tally result to the election record so declarations page can read vote counts
      if (electionId) {
        const tallyResultJson = JSON.stringify({ candidates: result.tally.candidates });
        // Save tally result JSON; advance status to TALLIED only if currently CLOSED
        await prisma.election.updateMany({
          where: { id: electionId },
          data:  { tallyResultJson },
        });
        await prisma.election.updateMany({
          where: { id: electionId, status: 'CLOSED' },
          data:  { status: 'TALLIED' },
        });
      }

      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ceremony failed';
      res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /api/election/result
 * Return the most recent ceremony result (404 if never run).
 * Admin only.
 */
router.get(
  '/result',
  requireAuth,
  requireAdmin,
  (_req: Request, res: Response) => {
    const result = getLastElectionResult();
    if (!result) {
      res.status(404).json({ error: 'No election ceremony has been run yet.' });
      return;
    }
    res.json(result);
  },
);

export default router;
