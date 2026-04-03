import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { voterService, ServiceError } from '../services/voter.service.js';
import { personaService } from '../services/persona.service.js';
import { voterRepository } from '../repositories/index.js';
import { authService } from '../services/auth.service.js';
import { prisma } from '../database/client.js';
import { registrationRateLimiter, requireAuth, requireAdmin, requireSelf, adminRateLimiter } from '../middleware/index.js';
import { passwordSchema } from './auth.routes.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

const ID_DOCUMENT_TYPES = ['NATIONAL_ID', 'PASSPORT'] as const;

function validateDocumentNumber(id: string, type: typeof ID_DOCUMENT_TYPES[number]): string | null {
  switch (type) {
    case 'NATIONAL_ID': return /^\d{5,9}$/.test(id) ? null : 'National ID must be 5–9 digits';
    case 'PASSPORT':    return /^[A-Z0-9]{6,12}$/i.test(id) ? null : 'Passport must be 6–12 alphanumeric characters';
  }
}

const registerSchema = z.object({
  nationalId: z.string().min(1).max(20).optional(),
  idDocumentType: z.enum(ID_DOCUMENT_TYPES).default('NATIONAL_ID'),
  pollingStationId: z.string().uuid('Invalid polling station ID').optional(),
  electionId: z.string().uuid('Invalid election ID').optional(),
  phoneNumber: z.string().regex(/^\+254\d{9,10}$|^\+(?!254)\d{8,15}$/, 'For Kenya (+254): 9–10 digits. Other countries: 8–15 digits. E.g. +254712345678').optional(),
  email: z.string().email('Invalid email address').optional(),
  preferredContact: z.enum(['SMS', 'EMAIL']).optional(),
  fingerprintHash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-char hex SHA-256').optional(),
  password: passwordSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.nationalId) {
    const idError = validateDocumentNumber(data.nationalId, data.idDocumentType);
    if (idError) {
      ctx.addIssue({ path: ['nationalId'], code: z.ZodIssueCode.custom, message: idError });
    }
  }
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

    const { nationalId, idDocumentType, pollingStationId, electionId, phoneNumber, email, preferredContact, fingerprintHash, password } = parsed.data;

    // Determine election auth method to decide whether nationalId/pollingStation are required
    let electionAuthMethod: 'PERSONA_KYC' | 'EMAIL_DOMAIN' | 'OTP_ONLY' = 'PERSONA_KYC';
    if (electionId) {
      const election = await prisma.election.findUnique({ where: { id: electionId }, select: { authMethod: true, status: true } });
      if (!election) {
        res.status(404).json({ success: false, error: 'Election not found' });
        return;
      }
      if (!['NOMINATIONS', 'ACTIVE'].includes(election.status)) {
        res.status(400).json({ success: false, error: 'This election is not currently accepting registrations' });
        return;
      }
      electionAuthMethod = election.authMethod as typeof electionAuthMethod;
    }

    let effectiveNationalId = nationalId;

    if (electionAuthMethod === 'PERSONA_KYC') {
      // KYC elections require national ID; polling station only required when registering for a specific election
      if (!effectiveNationalId) {
        res.status(400).json({ success: false, error: 'nationalId is required for government (KYC) elections' });
        return;
      }
      if (electionId && !pollingStationId) {
        res.status(400).json({ success: false, error: 'pollingStationId is required when registering for a government (KYC) election' });
        return;
      }
    } else {
      // Non-KYC elections: require at least one contact method to identify the voter.
      // Derive a deterministic synthetic ID from email (preferred) or phone number.
      if (!email && !phoneNumber) {
        res.status(400).json({ success: false, error: 'An email address or phone number is required for this election' });
        return;
      }
      if (!effectiveNationalId) {
        // Prefer email for the synthetic ID so re-registration with the same email is idempotent.
        const seed = email ? email.toLowerCase() : phoneNumber!;
        const hash = crypto.createHash('sha256').update(seed).digest('hex');
        effectiveNationalId = `E-${hash.slice(0, 16)}`; // 18 chars, fits VarChar(20)
      }
    }

    // If electionId + pollingStationId both provided, verify the station is linked to the
    // election's jurisdiction tree. If not linked, the voter can still register but will only
    // see NATIONAL-scope positions (jurisdiction-tree scoped positions require a linked station).
    if (electionId && pollingStationId) {
      const linkedNode = await prisma.electionJurisdiction.findFirst({
        where: { electionId, pollingStationId },
        select: { id: true },
      });
      if (!linkedNode) {
        // Non-fatal: log warning so operators can link the station, but allow registration
        console.warn(
          `[voter/register] WARN: pollingStationId=${pollingStationId} is not linked to ` +
          `any jurisdiction node in election ${electionId}. Voter will only see NATIONAL ` +
          `positions for jurisdiction-tree elections. Use ` +
          `PATCH /api/elections/${electionId}/jurisdictions/:nodeId/link-station to fix this.`,
        );
      }
    }

    const result = await voterService.registerVoter(effectiveNationalId, pollingStationId, {
      phoneNumber,
      email,
      preferredContact,
      fingerprintHash,
      password,
      idDocumentType,
      electionId,
    });

    // Create election enrollment when electionId is present:
    //   • New PERSONA_KYC voter — pre-enroll now (safe: can't log in until Persona passes)
    //   • Already-KYC-verified voter re-enrolling in OTP_ONLY or KYC election — KYC is
    //     stronger than OTP, so no second OTP round is needed.
    //   • Already-KYC-verified voter + EMAIL_DOMAIN election — enrollment deferred until OTP
    //     confirms they own the institutional email (complete-contact-verification).
    //   • New non-KYC voter — enrollment created after OTP in complete-contact-verification.
    let shouldEnrollNow = false;
    if (electionId) {
      if (result.kycRequired) {
        shouldEnrollNow = true;
      } else if (result.alreadyRegistered) {
        // Defer EMAIL_DOMAIN so we still verify institutional email ownership via OTP
        shouldEnrollNow = (electionAuthMethod as string) !== 'EMAIL_DOMAIN';
      }
    }
    if (shouldEnrollNow) {
      await prisma.electionEnrollment.upsert({
        where:  { electionId_voterId: { electionId: electionId!, voterId: result.voterId } },
        create: { electionId: electionId!, voterId: result.voterId },
        update: {},
      });
    }

    // 202 = KYC redirect (live Persona). 201 = everything else (OTP next, or already done).
    // Already-registered + EMAIL_DOMAIN: OTP still required to prove institutional email ownership.
    const needsPersonaRedirect = result.kycRequired && !result.alreadyRegistered && !personaService.isMockMode();
    const statusCode = needsPersonaRedirect ? 202 : 201;

    res.status(statusCode).json({
      success: true,
      data: { ...result, nationalId: effectiveNationalId },
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

// POST /api/voters/persona-retry — create a new Persona inquiry for a retry attempt
// Used when the previous inquiry is in a terminal (failed) state and the voter wants to try again.
router.post('/persona-retry', registrationRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({ nationalId: z.string().min(1).max(20) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const voter = await voterRepository.findByNationalId(parsed.data.nationalId);
    if (!voter) {
      res.status(404).json({ success: false, error: 'Voter not found' });
      return;
    }
    const retriableStatuses = ['PENDING_VERIFICATION', 'PENDING_MANUAL_REVIEW', 'VERIFICATION_FAILED'];
    if (!retriableStatuses.includes(voter.status)) {
      res.status(409).json({ success: false, error: 'Voter is not in a retryable KYC state' });
      return;
    }
    if (personaService.isMockMode()) {
      res.status(200).json({ success: true, data: { inquiryId: `inq_mock_retry_${voter.id}`, sessionToken: null } });
      return;
    }
    const { inquiryId, sessionToken } = await personaService.createInquiry(voter.nationalId, `retry_${voter.id}_${Date.now()}`);
    await voterRepository.update(voter.id, {
      personaInquiryId: inquiryId,
      status: 'PENDING_VERIFICATION',
      personaStatus: null,
    });
    res.json({ success: true, data: { inquiryId, sessionToken } });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create retry inquiry' });
  }
});

// POST /api/voters/request-manual-review - Request manual IEBC verification
const manualReviewSchema = z.object({
  nationalId: z.string().min(1).max(20),
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

// POST /api/voters/set-pin - Set voter's normal PIN and distress PIN
router.post('/set-pin', requireAuth, async (req: Request, res: Response) => {
  const pinSchema = z.object({
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
    distressPin: z.string().regex(/^\d{4}$/, 'Distress PIN must be exactly 4 digits').optional(),
  });

  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors.map(e => e.message).join(', ') });
    return;
  }

  try {
    const voterId = (req as AuthenticatedRequest).voter.sub;
    const result = await voterService.setVoterPin(voterId, parsed.data.pin, parsed.data.distressPin);
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

const VOTER_STATUSES = [
  'PENDING_VERIFICATION', 'PENDING_MANUAL_REVIEW', 'VERIFICATION_FAILED',
  'REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED', 'SUSPENDED', 'DECEASED',
] as const;

const voterListQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(20),
  nationalId: z.string().min(1).max(20).optional(),
  status:     z.enum(VOTER_STATUSES).optional(),
});

// GET /api/voters - List voters with pagination (admin only — prevents voter enumeration)
router.get('/', adminRateLimiter, requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const parsed = voterListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors.map(e => e.message).join(', ') });
    return;
  }
  try {
    const { page, limit, nationalId, status } = parsed.data;
    const result = await voterRepository.findMany({ page, limit, nationalId, status });

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

// POST /api/voters/complete-contact-verification
// Completes registration for non-KYC elections after the voter has verified their contact via OTP.
// No JWT required — the voter proves their identity by the fact that markContactVerified was called.
// Returns { setupToken } so the frontend can immediately call WebAuthn + PIN setup endpoints.
// Optionally accepts electionId to auto-enroll the voter in a non-GOVERNMENT election.
router.post('/complete-contact-verification', registrationRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({
    voterId:    z.string().uuid(),
    electionId: z.string().uuid().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const result = await voterService.completeContactVerification(parsed.data.voterId);

    // Enroll voter in the election — all election types now require enrollment
    if (parsed.data.electionId) {
      await prisma.electionEnrollment.upsert({
        where:  { electionId_voterId: { electionId: parsed.data.electionId, voterId: parsed.data.voterId } },
        create: { electionId: parsed.data.electionId, voterId: parsed.data.voterId },
        update: {},
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Registration completion failed' });
  }
});

export default router;
