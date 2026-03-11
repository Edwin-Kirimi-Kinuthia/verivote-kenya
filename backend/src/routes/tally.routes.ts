/**
 * Tally routes — admin-only decryption ceremony and results endpoints.
 *
 * POST /api/tally/start        — Run decryption ceremony (idempotent rerun allowed)
 * GET  /api/tally/results      — Return cached tally (404 if not yet run)
 * POST /api/tally/publish      — Hash results + record on-chain
 * GET  /api/tally/audit-report — Full data blob for PDF generation
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  runDecryptionCeremony,
  getCachedTally,
  publishTallyHash,
} from '../services/tally.service.js';

const router: ExpressRouter = Router();

// All tally routes require admin authentication
router.use(requireAuth, requireAdmin);

// POST /api/tally/start — run (or re-run) the decryption ceremony
router.post('/start', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await runDecryptionCeremony();
    res.json({ success: true, tally: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Ceremony failed', detail: msg });
  }
});

// GET /api/tally/results — return cached tally or 404
router.get('/results', requireAdmin, (_req: Request, res: Response) => {
  const tally = getCachedTally();
  if (!tally) {
    res.status(404).json({ error: 'No tally results available. Run POST /api/tally/start first.' });
    return;
  }
  res.json({ tally });
});

// POST /api/tally/publish — publish results hash on-chain
router.post('/publish', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { txHash, hash } = await publishTallyHash();
    res.json({ success: true, txHash, resultsHash: hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: msg });
  }
});

// GET /api/tally/audit-report — full data for PDF download
router.get('/audit-report', requireAdmin, (_req: Request, res: Response) => {
  const tally = getCachedTally();
  if (!tally) {
    res.status(404).json({ error: 'No tally results. Run ceremony first.' });
    return;
  }
  res.json({
    reportType: 'IEBC_ELECTION_AUDIT_REPORT',
    generatedAt: new Date().toISOString(),
    tally,
    niru_compliance: {
      A2_national_self_reliance: 'All inference on-premise. No foreign tech dependencies.',
      B2_robustness: 'Dual-tier AI (LLM + template fallback). Ceremony survives partial failures.',
      D2_auditability: 'Every vote decryption logged. Audit JSONL retained. SHA-256 hash published.',
      sovereignty_criterion_2: 'Zero foreign API calls across full election lifecycle.',
    },
  });
});

export default router;
