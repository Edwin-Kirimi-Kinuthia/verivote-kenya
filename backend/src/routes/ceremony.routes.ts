/**
 * Threshold Homomorphic Ceremony routes.
 *
 * POST /api/ceremony/start        — admin: load ballots, aggregate, init ceremony
 * POST /api/ceremony/partial/:id  — admin: commissioner submits partial decryption
 * POST /api/ceremony/finalize     — admin: combine partials, BSGS, get results
 * GET  /api/ceremony/status       — admin: current ceremony state
 * GET  /api/ceremony/result       — admin: final tally
 * POST /api/ceremony/reset        — admin: clear ceremony state
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  startCeremony,
  submitPartial,
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
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const info = await startCeremony();
    res.json({ success: true, ...info });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// POST /api/ceremony/partial/:commissionerId
router.post('/partial/:commissionerId', (req: Request, res: Response) => {
  const { commissionerId } = req.params;
  if (!COMMISSIONER_IDS.includes(commissionerId as CommissionerId)) {
    res.status(400).json({ error: `Invalid commissioner ID. Must be one of: ${COMMISSIONER_IDS.join(', ')}` });
    return;
  }
  try {
    const { received, remaining } = submitPartial(commissionerId as CommissionerId);
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
    ceremonyId: state.ceremonyId,
    startedAt: state.startedAt,
    totalBallots: state.totalBallots,
    partialsReceived: Object.keys(state.partials),
    partialsRemaining: COMMISSIONER_IDS.filter((id) => !state.partials[id]),
    finalized: !!state.result,
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
