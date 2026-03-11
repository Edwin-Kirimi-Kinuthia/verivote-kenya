/**
 * AI fraud detection proxy routes.
 * Forwards requests to the Python FastAPI microservice on port 8000.
 * All processing is on-premise — no external API calls.
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { requireAdmin } from '../middleware/auth.middleware.js';

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
router.post('/analyze-voting-pattern', requireAdmin, async (req: Request, res: Response) => {
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
router.get('/audit/recent', requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const { status, data } = await proxyToAI(`/api/ai/audit/recent?limit=${limit}`, 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/model-info — admin only
router.get('/model-info', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/model-info', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

// GET /api/ai/llm-status — admin only
router.get('/llm-status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { status, data } = await proxyToAI('/api/ai/llm-status', 'GET');
    res.status(status).json(data);
  } catch {
    res.status(503).json({ error: 'AI service unavailable' });
  }
});

export default router;
