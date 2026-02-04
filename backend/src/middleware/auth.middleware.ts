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
