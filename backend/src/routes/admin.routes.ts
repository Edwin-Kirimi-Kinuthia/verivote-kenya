import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { adminService } from '../services/admin.service.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, requireAdmin, adminRateLimiter } from '../middleware/index.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// Apply auth, admin role check, and rate limiting to all admin routes
router.use(adminRateLimiter);
router.use(requireAuth, requireAdmin);

const approveSchema = z.object({
  reviewerId: z.string().min(1, 'Reviewer ID is required'),
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  reviewerId: z.string().min(1, 'Reviewer ID is required'),
  reason: z.string().min(1, 'Rejection reason is required'),
});

// GET /api/admin/pending-reviews - List voters awaiting manual verification
router.get('/pending-reviews', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await adminService.getPendingReviews(page, limit);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch pending reviews',
    });
  }
});

// GET /api/admin/review-stats - Get review statistics
router.get('/review-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await adminService.getReviewStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    });
  }
});

// GET /api/admin/review/:voterId - Get details for a specific voter pending review
router.get('/review/:voterId', async (req: Request, res: Response) => {
  try {
    const result = await adminService.getReviewDetails(req.params.voterId);

    res.json({
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
      error: error instanceof Error ? error.message : 'Failed to fetch review details',
    });
  }
});

// POST /api/admin/approve/:voterId - Approve voter after physical verification
router.post('/approve/:voterId', async (req: Request, res: Response) => {
  try {
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await adminService.approveVoter(
      req.params.voterId,
      parsed.data.reviewerId,
      parsed.data.notes
    );

    res.status(200).json({
      success: true,
      message: 'Voter approved and registered successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve voter',
    });
  }
});

// GET /api/admin/distress-votes - List votes cast using a distress PIN
router.get('/distress-votes', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await adminService.getDistressVotes(page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch distress votes',
    });
  }
});

// GET /api/admin/officials - List all IEBC officials (ADMIN-role voters)
router.get('/officials', async (_req: Request, res: Response) => {
  try {
    const result = await adminService.getOfficials();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch officials',
    });
  }
});

// POST /api/admin/officials - Promote a registered voter to IEBC official
router.post('/officials', async (req: Request, res: Response) => {
  try {
    const { nationalId } = req.body;
    if (!nationalId) {
      res.status(400).json({ success: false, error: 'nationalId is required' });
      return;
    }
    const result = await adminService.addOfficial(nationalId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add official',
    });
  }
});

// DELETE /api/admin/officials/:voterId - Remove IEBC official status
router.delete('/officials/:voterId', async (req: Request, res: Response) => {
  try {
    // Pass requester ID so they cannot remove themselves
    const requesterId = (req as AuthenticatedRequest).voter?.sub ?? '';
    const result = await adminService.removeOfficial(req.params.voterId, requesterId);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove official',
    });
  }
});

// POST /api/admin/reject/:voterId - Reject voter with reason
router.post('/reject/:voterId', async (req: Request, res: Response) => {
  try {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await adminService.rejectVoter(
      req.params.voterId,
      parsed.data.reviewerId,
      parsed.data.reason
    );

    res.status(200).json({
      success: true,
      message: 'Voter verification rejected',
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject voter',
    });
  }
});

export default router;
