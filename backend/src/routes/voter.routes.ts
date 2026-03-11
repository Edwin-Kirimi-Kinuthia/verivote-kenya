import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { voterService, ServiceError } from '../services/voter.service.js';
import { personaService } from '../services/persona.service.js';
import { voterRepository } from '../repositories/index.js';
import { authService } from '../services/auth.service.js';
import { registrationRateLimiter, requireAuth, requireAdmin, requireSelf, adminRateLimiter } from '../middleware/index.js';
import { passwordSchema } from './auth.routes.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

const registerSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be exactly 8 digits'),
  pollingStationId: z.string().uuid('Invalid polling station ID'),
  phoneNumber: z.string().regex(/^\+\d{7,15}$/, 'Phone must be in E.164 format, e.g. +254712345678').optional(),
  email: z.string().email('Invalid email address').optional(),
  preferredContact: z.enum(['SMS', 'EMAIL']).optional(),
  fingerprintHash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-char hex SHA-256').optional(),
  password: passwordSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.preferredContact === 'SMS' && !data.phoneNumber) {
    ctx.addIssue({
      path: ['phoneNumber'],
      code: z.ZodIssueCode.custom,
      message: 'phoneNumber required when preferredContact is SMS',
    });
  }
  if (data.preferredContact === 'EMAIL' && !data.email) {
    ctx.addIssue({
      path: ['email'],
      code: z.ZodIssueCode.custom,
      message: 'email required when preferredContact is EMAIL',
    });
  }
});

// POST /api/voters/register
router.post('/register', registrationRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const { nationalId, pollingStationId, phoneNumber, email, preferredContact, fingerprintHash, password } = parsed.data;
    const result = await voterService.registerVoter(nationalId, pollingStationId, {
      phoneNumber,
      email,
      preferredContact,
      fingerprintHash,
      password,
    });

    // In mock mode, Persona completes inline and returns notificationSent (201)
    // In live mode, returns inquiry info for the frontend to redirect (202)
    const statusCode = personaService.isMockMode() ? 201 : 202;

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

// POST /api/voters/mock-verify - Simulate a completed Persona verification (MOCK MODE ONLY)
// Allows developers to drive the registration workflow end-to-end without real KYC.
router.post('/mock-verify', async (req: Request, res: Response) => {
  if (!personaService.isMockMode()) {
    res.status(403).json({ success: false, error: 'This endpoint is only available in mock mode' });
    return;
  }

  const { inquiryId } = req.body;
  if (!inquiryId) {
    res.status(400).json({ success: false, error: 'inquiryId is required' });
    return;
  }

  try {
    const result = await voterService.completeVerification(inquiryId, 'completed');
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Mock verification failed',
    });
  }
});

// POST /api/voters/persona-webhook
router.post('/persona-webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['persona-signature'] as string || '';
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

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

    // When the voter has just been approved, issue a setup JWT so the frontend
    // can immediately call /api/webauthn/register/options and /api/voters/set-pin
    // without requiring a separate password login step.
    let setupToken: string | undefined;
    if (result.status === 'REGISTERED' && result.voterId) {
      const voter = await voterRepository.findById(result.voterId);
      if (voter) {
        setupToken = authService.generateToken({
          sub: voter.id,
          nationalId: voter.nationalId,
          status: voter.status,
          role: voter.role,
          isDistress: false,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: { ...result, setupToken },
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
const manualReviewSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be exactly 8 digits'),
  reason: z.string().trim().max(500, 'Reason must be 500 characters or fewer').optional(),
});

router.post('/request-manual-review', async (req: Request, res: Response) => {
  const parsed = manualReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors.map(e => e.message).join(', ') });
    return;
  }
  try {
    const { nationalId, reason } = parsed.data;
    const result = await voterService.requestManualReview(nationalId, reason ?? '');

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

// POST /api/voters/set-pin - Set voter's normal PIN (distress PIN is auto-generated and delivered)
router.post('/set-pin', requireAuth, async (req: Request, res: Response) => {
  const pinSchema = z.object({
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  });

  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors.map(e => e.message).join(', ') });
    return;
  }

  try {
    const voterId = (req as AuthenticatedRequest).voter.sub;
    const result = await voterService.setVoterPin(voterId, parsed.data.pin);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set PIN',
    });
  }
});

// GET /api/voters/:id/status - Get voter status (authenticated, self only)
router.get('/:id/status', requireAuth, requireSelf, async (req: Request, res: Response) => {
  try {
    const voter = await voterRepository.findById(req.params.id);
    if (!voter) {
      res.status(404).json({ success: false, error: 'Voter not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        voterId: voter.id,
        status: voter.status,
        voteCount: voter.voteCount,
        isRegistered: voter.status === 'REGISTERED' || voter.status === 'VOTED' || voter.status === 'REVOTED',
        hasVoted: voter.voteCount > 0,
        lastVotedAt: voter.lastVotedAt,
        registeredAt: voter.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch voter status',
    });
  }
});

const voterListQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(20),
  nationalId: z.string().regex(/^\d{8}$/).optional(),
});

// GET /api/voters - List voters with pagination (admin only — prevents voter enumeration)
router.get('/', adminRateLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = voterListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors.map(e => e.message).join(', ') });
    return;
  }
  try {
    const { page, limit, nationalId } = parsed.data;
    const result = await voterRepository.findMany({ page, limit, nationalId });

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
