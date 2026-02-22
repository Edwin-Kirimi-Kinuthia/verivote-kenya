/**
 * VeriVote Kenya - Print Queue Routes
 *
 * Admin-only endpoints for the centralized vote printing system.
 *
 * All routes require:
 *   - Bearer JWT with ADMIN role
 *   - adminRateLimiter (200 req / 15 min)
 *
 * Endpoints:
 *   POST   /api/print-queue/add              Add single vote to queue
 *   POST   /api/print-queue/batch            Batch add votes to queue
 *   GET    /api/print-queue                  List / filter queue
 *   GET    /api/print-queue/stats            Queue statistics
 *   GET    /api/print-queue/reconcile        Run reconciliation report
 *   GET    /api/print-queue/:id              Get single job detail
 *   POST   /api/print-queue/process          Claim + process next job
 *   PATCH  /api/print-queue/:id/cancel       Cancel a job
 *   PATCH  /api/print-queue/:id/retry        Retry a failed job
 *   PATCH  /api/print-queue/:id/priority     Update job priority
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { printQueueService } from '../services/print-queue.service.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, requireAdmin, adminRateLimiter } from '../middleware/index.js';

const router: Router = Router();

// Apply auth + admin check + rate-limit to every print-queue route
router.use(adminRateLimiter);
router.use(requireAuth, requireAdmin);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const addSchema = z.object({
  voteId: z.string().uuid('Invalid vote ID'),
  pollingStationId: z.string().uuid('Invalid polling station ID'),
  priority: z.number().int().min(0).max(100).optional(),
});

const batchAddSchema = z.object({
  voteIds: z
    .array(z.string().uuid('Invalid vote ID'))
    .min(1, 'At least one vote ID is required')
    .max(500, 'Batch size cannot exceed 500'),
  pollingStationId: z.string().uuid('Invalid polling station ID'),
  priority: z.number().int().min(0).max(100).optional(),
});

const processSchema = z.object({
  printerId: z.string().min(1).max(100),
});

const prioritySchema = z.object({
  priority: z.number().int().min(0).max(100),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED'])
    .optional(),
  pollingStationId: z.string().uuid().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/print-queue/add
 * Add a single vote to the print queue.
 */
router.post('/add', async (req: Request, res: Response) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
    return;
  }

  try {
    const job = await printQueueService.addToQueue(parsed.data);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to add print job' });
  }
});

/**
 * POST /api/print-queue/batch
 * Bulk-add multiple votes to the print queue.
 */
router.post('/batch', async (req: Request, res: Response) => {
  const parsed = batchAddSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
    return;
  }

  try {
    const result = await printQueueService.batchAdd(parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Batch add failed' });
  }
});

/**
 * POST /api/print-queue/process
 * Claim and process the next pending job for a specific printer.
 * Returns the secure print format ready for the printer driver.
 */
router.post('/process', async (req: Request, res: Response) => {
  const parsed = processSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
    return;
  }

  try {
    const result = await printQueueService.processNextJob(parsed.data.printerId);
    if (!result) {
      res.status(200).json({ success: true, data: null, message: 'No pending jobs' });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Print processing failed' });
  }
});

/**
 * GET /api/print-queue/stats
 * Aggregate statistics for the print queue.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await printQueueService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/print-queue/reconcile
 * Reset stuck PRINTING jobs and return a reconciliation report.
 * Optional query param: ?stuckMinutes=5
 */
router.get('/reconcile', async (req: Request, res: Response) => {
  const minutes = Math.max(1, parseInt(req.query.stuckMinutes as string) || 5);

  try {
    const report = await printQueueService.reconcile(minutes);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Reconciliation failed' });
  }
});

/**
 * GET /api/print-queue
 * List print jobs with optional filtering and pagination.
 */
router.get('/', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
    return;
  }

  try {
    const result = await printQueueService.getQueue(parsed.data);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch queue' });
  }
});

/**
 * GET /api/print-queue/:id
 * Get a single print job with vote and polling station details.
 */
router.get('/:id', async (req: Request, res: Response) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid job ID format' });
    return;
  }

  try {
    const job = await printQueueService.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to fetch job' });
  }
});

/**
 * PATCH /api/print-queue/:id/cancel
 * Cancel a queued or printing job.
 */
router.patch('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const job = await printQueueService.cancelJob(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to cancel job' });
  }
});

/**
 * PATCH /api/print-queue/:id/retry
 * Reset a failed job back to PENDING so it will be retried.
 */
router.patch('/:id/retry', async (req: Request, res: Response) => {
  try {
    const job = await printQueueService.retryJob(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to retry job' });
  }
});

/**
 * PATCH /api/print-queue/:id/priority
 * Update the priority of a pending job (0 = low, 100 = urgent).
 */
router.patch('/:id/priority', async (req: Request, res: Response) => {
  const parsed = prioritySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
    return;
  }

  try {
    const job = await printQueueService.setPriority(req.params.id, parsed.data.priority);
    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to update priority' });
  }
});

export default router;
