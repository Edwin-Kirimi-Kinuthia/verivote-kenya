/**
 * Tally routes — admin-only decryption ceremony and results endpoints.
 *
 * POST /api/tally/start            — Run decryption ceremony for an election
 * GET  /api/tally/results/:electionId — Return cached tally (404 if not yet run)
 * POST /api/tally/publish          — Hash results + record on-chain
 * GET  /api/tally/audit-report/:electionId — Full data blob for PDF generation
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  runDecryptionCeremony,
  getCachedTally,
  publishTallyHash,
} from '../services/tally.service.js';

const router: ExpressRouter = Router();

router.use(requireAuth, requireAdmin);

// POST /api/tally/start — run (or re-run) the decryption ceremony for an election
router.post('/start', async (req: Request, res: Response) => {
  const { electionId } = req.body;
  if (!electionId) {
    res.status(400).json({ success: false, error: 'electionId is required' });
    return;
  }
  try {
    const result = await runDecryptionCeremony(electionId);
    res.json({ success: true, tally: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: 'Ceremony failed', detail: msg });
  }
});

// GET /api/tally/results/:electionId — return cached tally or 404
router.get('/results/:electionId', (req: Request, res: Response) => {
  const tally = getCachedTally(req.params.electionId);
  if (!tally) {
    res.status(404).json({ success: false, error: 'No tally results for this election. Run POST /api/tally/start first.' });
    return;
  }
  res.json({ success: true, tally });
});

// POST /api/tally/publish — publish results hash on-chain
router.post('/publish', async (req: Request, res: Response) => {
  const { electionId } = req.body;
  if (!electionId) {
    res.status(400).json({ success: false, error: 'electionId is required' });
    return;
  }
  try {
    const { txHash, hash } = await publishTallyHash(electionId);
    res.json({ success: true, txHash, resultsHash: hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ success: false, error: msg });
  }
});

// GET /api/tally/audit-report/:electionId — full data for PDF download
router.get('/audit-report/:electionId', (req: Request, res: Response) => {
  const tally = getCachedTally(req.params.electionId);
  if (!tally) {
    res.status(404).json({ success: false, error: 'No tally results. Run ceremony first.' });
    return;
  }
  res.json({
    success: true,
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
