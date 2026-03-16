/**
 * Threshold Homomorphic Ceremony routes.
 *
 * POST /api/ceremony/start        — admin: aggregate ballots + generate SSS key shares
 * POST /api/ceremony/partial/:id  — admin: commissioner submits their SSS key share
 * POST /api/ceremony/finalize     — admin: reconstruct key (Lagrange), decrypt aggregates, BSGS
 * GET  /api/ceremony/status       — admin: current ceremony state
 * GET  /api/ceremony/result       — admin: final tally
 * POST /api/ceremony/reset        — admin: clear ceremony state
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  startCeremony,
  submitShare,
  finalizeCeremony,
  getCeremonyState,
  getHomomorphicResult,
  resetCeremony,
  COMMISSIONER_IDS,
  type CommissionerId,
} from '../services/homomorphic.service.js';

const router: ExpressRouter = Router();

// All ceremony routes require admin
router.use(requireAuth, requireAdmin);

// POST /api/ceremony/start
// Body: { electionId?: string }  — omit to use legacy ALL_CANDIDATES (v2 ballots)
router.post('/start', async (req: Request, res: Response) => {
  try {
    const electionId = (req.body as { electionId?: string })?.electionId;
    const info = await startCeremony(electionId);
    res.json({ success: true, ...info });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// POST /api/ceremony/partial/:commissionerId
// Body: { share: string }  — the commissioner's SSS key share (hex)
router.post('/partial/:commissionerId', (req: Request, res: Response) => {
  const { commissionerId } = req.params;
  if (!COMMISSIONER_IDS.includes(commissionerId as CommissionerId)) {
    res.status(400).json({ error: `Invalid commissioner ID. Must be one of: ${COMMISSIONER_IDS.join(', ')}` });
    return;
  }

  const { share } = req.body as { share?: string };
  if (!share || typeof share !== 'string' || share.trim() === '') {
    res.status(400).json({ error: 'Request body must include a non-empty "share" field (hex string).' });
    return;
  }

  try {
    const { received, remaining } = submitShare(commissionerId as CommissionerId, share);
    res.json({ success: true, received, remaining, allReceived: remaining.length === 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// POST /api/ceremony/finalize
router.post('/finalize', (_req: Request, res: Response) => {
  try {
    const result = finalizeCeremony();
    res.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// GET /api/ceremony/status
router.get('/status', (_req: Request, res: Response) => {
  const state = getCeremonyState();
  if (!state) {
    res.status(404).json({ started: false });
    return;
  }
  res.json({
    started: true,
    ceremonyId:        state.ceremonyId,
    startedAt:         state.startedAt,
    totalBallots:      state.totalBallots,
    partialsReceived:  Object.keys(state.submittedShares),
    partialsRemaining: COMMISSIONER_IDS.filter((id) => !state.submittedShares[id]),
    finalized:         !!state.result,
  });
});

// GET /api/ceremony/result
router.get('/result', (_req: Request, res: Response) => {
  const result = getHomomorphicResult();
  if (!result) {
    res.status(404).json({ error: 'No ceremony result yet. Run the ceremony first.' });
    return;
  }
  res.json(result);
});

// POST /api/ceremony/reset
router.post('/reset', (_req: Request, res: Response) => {
  resetCeremony();
  res.json({ success: true, message: 'Ceremony state cleared.' });
});

export default router;
