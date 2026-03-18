/**
 * AI fraud detection proxy routes.
 * Forwards requests to the Python FastAPI microservice on port 8000.
 * All processing is on-premise — no external API calls.
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

const router: ExpressRouter = Router();
const AI_SERVICE = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

async function proxyToAI(path: string, method: 'GET' | 'POST', body?: unknown) {
  const url = `${AI_SERVICE}${path}`;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(url, init);
  const data = await res.json();
  return { status: res.status, data };
}

// POST /api/ai/analyze-voting-pattern — admin only
router.post('/analyze-voting-pattern', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/analyze-voting-pattern', 'POST', req.body);
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable', sovereignty: 'on-premise service at localhost:8000' });
  }
});

// GET /api/ai/health — public (for system health dashboard)
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/health', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ status: 'unavailable', model_loaded: false });
  }
});

// GET /api/ai/audit/recent — admin only
router.get('/audit/recent', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const { status, data } = await proxyToAI(`/api/ai/audit/recent?limit=${limit}`, 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/model-info — admin only
router.get('/model-info', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/model-info', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/llm-status — admin only
router.get('/llm-status', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/llm-status', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// ── Continuous monitoring endpoints ──────────────────────────────────────────

// GET /api/ai/monitor/status — monitoring engine heartbeat
router.get('/monitor/status', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/monitor/status', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/monitor/scores — latest per-station anomaly scores
router.get('/monitor/scores', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const limit      = Math.min(Number(req.query.limit) || 100, 500);
  const alertLevel = req.query.alert_level as string | undefined;
  const qs         = `limit=${limit}${alertLevel ? `&alert_level=${alertLevel}` : ''}`;
  try {
    const { status, data } = await proxyToAI(`/api/ai/monitor/scores?${qs}`, 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/monitor/station/:id — score history for one station
router.get('/monitor/station/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const { status, data } = await proxyToAI(`/api/ai/monitor/station/${req.params.id}?limit=${limit}`, 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/reports/fraud — fraud activity report
router.get('/reports/fraud', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const hours = Math.min(Number(req.query.hours) || 24, 168);
  try {
    const { status, data } = await proxyToAI(`/api/ai/reports/fraud?hours=${hours}`, 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/reports/integrity — blockchain vs tally integrity report
router.get('/reports/integrity', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/reports/integrity', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/reports/security — security events report
router.get('/reports/security', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/reports/security', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/reports/health — combined system health
router.get('/reports/health', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/reports/health', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

export default router;
