import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pinResetService } from '../services/pin-reset.service.js';
import { personaService } from '../services/persona.service.js';
import { ServiceError } from '../services/voter.service.js';

const router: Router = Router();

const requestResetSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be exactly 8 digits'),
});

const inPersonResetSchema = z.object({
  officerId: z.string().min(1, 'Officer ID is required'),
  notes: z.string().optional(),
});

// ============================================
// VOTER ENDPOINTS
// ============================================

// POST /api/pin-reset/request - Voter requests PIN reset
router.post('/request', async (req: Request, res: Response) => {
  try {
    const parsed = requestResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await pinResetService.requestPinReset(parsed.data.nationalId);

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
      error: error instanceof Error ? error.message : 'Failed to request PIN reset',
    });
  }
});

// POST /api/pin-reset/cancel - Cancel PIN reset request
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const parsed = requestResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await pinResetService.cancelPinReset(parsed.data.nationalId);

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
      error: error instanceof Error ? error.message : 'Failed to cancel PIN reset',
    });
  }
});

// GET /api/pin-reset/status - Check PIN reset status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const nationalId = req.query.nationalId as string;
    if (!nationalId) {
      res.status(400).json({ success: false, error: 'nationalId is required' });
      return;
    }

    const result = await pinResetService.getResetStatus(nationalId);

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
      error: error instanceof Error ? error.message : 'Failed to get reset status',
    });
  }
});

// POST /api/pin-reset/biometric-webhook - Persona webhook for biometric verification
router.post('/biometric-webhook', async (req: Request, res: Response) => {
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

    const result = await pinResetService.completeBiometricReset(inquiryId, status);

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
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
});

// ============================================
// IEBC ADMIN ENDPOINTS
// ============================================

// GET /api/pin-reset/pending - List pending PIN reset requests
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const pollingStationId = req.query.pollingStationId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await pinResetService.getPendingResets({
      pollingStationId,
      page,
      limit,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch pending resets',
    });
  }
});

// POST /api/pin-reset/verify/:voterId - IEBC completes in-person verification
router.post('/verify/:voterId', async (req: Request, res: Response) => {
  try {
    const parsed = inPersonResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const result = await pinResetService.completeInPersonReset(
      req.params.voterId,
      parsed.data.officerId,
      parsed.data.notes
    );

    res.status(200).json({
      success: true,
      message: 'PIN reset completed successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete PIN reset',
    });
  }
});

export default router;
