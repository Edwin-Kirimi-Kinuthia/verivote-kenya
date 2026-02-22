import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = authService.verifyToken(token);
    (req as AuthenticatedRequest).voter = payload;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    res.status(401).json({ success: false, error: message });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = authService.verifyToken(token);
    (req as AuthenticatedRequest).voter = payload;
  } catch {
    // Token invalid/expired — proceed without auth
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.voter) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (authReq.voter.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  next();
}

export function requireSelf(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.voter) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (authReq.voter.sub !== req.params.id) {
    res.status(403).json({ success: false, error: 'Access denied: you can only access your own data' });
    return;
  }

  next();
}

/**
 * Middleware to validate mobile API keys sent via X-API-Key header.
 *
 * Valid keys are stored in the MOBILE_API_KEYS environment variable as a
 * comma-separated list.  If the env var is absent all keys are rejected, so
 * this middleware effectively blocks mobile access until keys are provisioned.
 *
 * Usage: apply to any route group that should accept mobile clients.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key) {
    res.status(401).json({ success: false, error: 'X-API-Key header is required for mobile access' });
    return;
  }

  const validKeys = (process.env.MOBILE_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (!validKeys.includes(key)) {
    res.status(403).json({ success: false, error: 'Invalid API key' });
    return;
  }

  next();
}
