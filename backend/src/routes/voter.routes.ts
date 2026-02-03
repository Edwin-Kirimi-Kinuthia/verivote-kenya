import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { voterService, ServiceError } from '../services/voter.service.js';
import { personaService } from '../services/persona.service.js';
import { voterRepository } from '../repositories/index.js';

const router: Router = Router();

const registerSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be exactly 8 digits'),
  pollingStationId: z.string().uuid('Invalid polling station ID'),
});

const verifyPinSchema = z.object({
  nationalId: z.string().min(1, 'National ID is required'),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

// POST /api/voters/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await voterService.registerVoter(parsed.data.nationalId, parsed.data.pollingStationId);

    // In mock mode, completeVerification runs inline and returns PINs (201)
    // In live mode, returns inquiry info for the frontend to redirect (202)
    const statusCode = 'pin' in result ? 201 : 202;

    res.status(statusCode).json({
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
      error: error instanceof Error ? error.message : 'Registration failed',
    });
  }
});

// POST /api/voters/persona-webhook
router.post('/persona-webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['persona-signature'] as string || '';
    const rawBody = JSON.stringify(req.body);

    if (!personaService.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body;
    const inquiryId = payload?.data?.attributes?.payload?.data?.id
      || payload?.data?.id;
    const status = payload?.data?.attributes?.payload?.data?.attributes?.status
      || payload?.data?.attributes?.status;

    if (!inquiryId || !status) {
      res.status(400).json({ success: false, error: 'Missing inquiry ID or status' });
      return;
    }

    await voterService.completeVerification(inquiryId, status);

    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
});

// GET /api/voters/registration-status/:inquiryId
router.get('/registration-status/:inquiryId', async (req: Request, res: Response) => {
  try {
    const result = await voterService.getRegistrationStatus(req.params.inquiryId);

    res.status(200).json({
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
      error: error instanceof Error ? error.message : 'Status check failed',
    });
  }
});

// POST /api/voters/request-manual-review - Request manual IEBC verification
router.post('/request-manual-review', async (req: Request, res: Response) => {
  try {
    const { nationalId, reason } = req.body;

    if (!nationalId) {
      res.status(400).json({ success: false, error: 'National ID is required' });
      return;
    }

    const result = await voterService.requestManualReview(nationalId, reason || '');

    res.status(200).json({
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
      error: error instanceof Error ? error.message : 'Failed to request manual review',
    });
  }
});

// POST /api/voters/verify-pin
router.post('/verify-pin', async (req: Request, res: Response) => {
  try {
    const parsed = verifyPinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await voterService.verifyPin(parsed.data.nationalId, parsed.data.pin);

    res.status(200).json({
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
      error: error instanceof Error ? error.message : 'PIN verification failed',
    });
  }
});

// GET /api/voters - List voters with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await voterRepository.findMany({ page, limit });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch voters',
    });
  }
});

export default router;
