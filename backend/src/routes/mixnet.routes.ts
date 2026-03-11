/**
 * Mixnet routes — re-encryption mixnet ceremony endpoints.
 *
 * POST /api/mixnet/run          — admin: run the mixnet ceremony
 * GET  /api/mixnet/status       — admin: full ceremony result (no ciphertexts)
 * GET  /api/mixnet/log          — admin: full ceremony log
 * GET  /api/mixnet/proof        — public: cryptographic proof commitments only
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  runMixnet,
  getCachedMixnet,
  getMixnetPublicProof,
} from '../services/mixnet.service.js';

const router: ExpressRouter = Router();

// POST /api/mixnet/run — trigger ceremony (admin only)
router.post('/run', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await runMixnet();
    const { mixedVotes: _mv, log: _log, ...summary } = result;
    res.json({ success: true, result: { ...summary, logLines: result.log.length } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Mixnet ceremony failed', detail: msg });
  }
});

// GET /api/mixnet/status — full summary, no raw ciphertexts (admin only)
router.get('/status', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  const cached = getCachedMixnet();
  if (!cached) {
    res.status(404).json({ error: 'No mixnet run yet. POST /api/mixnet/run first.' });
    return;
  }
  const { mixedVotes: _mv, ...rest } = cached;
  res.json(rest);
});

// GET /api/mixnet/log — ceremony log (admin only)
router.get('/log', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  const cached = getCachedMixnet();
  if (!cached) {
    res.status(404).json({ error: 'No mixnet run yet.' });
    return;
  }
  res.json({ ceremonyId: cached.ceremonyId, log: cached.log });
});

// GET /api/mixnet/proof — proof commitments only, no ciphertext data (public)
router.get('/proof', (_req: Request, res: Response) => {
  const proof = getMixnetPublicProof();
  if (!proof) {
    res.status(404).json({ available: false, message: 'Mixnet has not been run yet.' });
    return;
  }
  res.json({ available: true, proof });
});

export default router;
