import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { voteService } from '../services/vote.service.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, voteRateLimiter } from '../middleware/index.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

const castVoteSchema = z.object({
  selections: z.record(z.string(), z.string()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'At least one selection is required' }
  ),
  pollingStationId: z.string().uuid('Invalid polling station ID').optional(),
});

// POST /api/votes/cast
router.post('/cast', requireAuth, voteRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = castVoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const result = await voteService.castVote(authReq.voter, parsed.data);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Vote casting failed',
    });
  }
});

export default router;
