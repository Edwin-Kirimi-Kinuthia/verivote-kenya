import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { adminService } from '../services/admin.service.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, requireAdmin, adminRateLimiter } from '../middleware/index.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';
import { personaService } from '../services/persona.service.js';
import { voterRepository } from '../repositories/index.js';
import { blockchainService } from '../services/blockchain.service.js';
import { prisma } from '../database/client.js';
import { STAFF_MANAGE_ROLES } from '../types/auth.types.js';
import { requireStaffRole } from '../middleware/auth.middleware.js';

const router: Router = Router();

// Apply auth, admin role check, and rate limiting to all admin routes
router.use(adminRateLimiter);
router.use(requireAuth, requireAdmin);

const ID_DOCUMENT_TYPES = ['NATIONAL_ID', 'PASSPORT'] as const;

const registerVoterSchema = z.object({
  nationalId: z.string().min(1).max(20),
  idDocumentType: z.enum(ID_DOCUMENT_TYPES).default('NATIONAL_ID'),
  pollingStationId: z.string().uuid('Invalid polling station ID'),
  preferredContact: z.enum(['SMS', 'EMAIL']),
  phoneNumber: z.string().regex(/^\+254\d{9,10}$|^\+(?!254)\d{8,15}$/, 'For Kenya (+254): 9–10 digits. Other countries: 8–15 digits. E.g. +254712345678').optional(),
  email: z.string().email('Invalid email address').optional(),
}).superRefine((data, ctx) => {
  if (data.preferredContact === 'SMS' && !data.phoneNumber) {
    ctx.addIssue({ path: ['phoneNumber'], code: z.ZodIssueCode.custom, message: 'phoneNumber is required for SMS contact' });
  }
  if (data.preferredContact === 'EMAIL' && !data.email) {
    ctx.addIssue({ path: ['email'], code: z.ZodIssueCode.custom, message: 'email is required for EMAIL contact' });
  }
});

// POST /api/admin/register-voter — in-person registration (bypasses Persona KYC)
// Returns setupToken for immediate PIN setup; never returns the PINs themselves.
router.post('/register-voter', async (req: Request, res: Response) => {
  const parsed = registerVoterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const result = await adminService.registerVoter(parsed.data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// POST /api/admin/send-setup-link — Send PIN setup link after fingerprint enrolled
router.post('/send-setup-link', async (req: Request, res: Response) => {
  const parsed = z.object({ voterId: z.string().uuid('Invalid voter ID') }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  try {
    const result = await adminService.sendSetupLink(parsed.data.voterId);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to send setup link' });
  }
});

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

// POST /api/admin/start-kyc/:voterId — Start a Persona KYC inquiry for a voter pending manual review
router.post('/start-kyc/:voterId', async (req: Request, res: Response) => {
  try {
    const voter = await voterRepository.findById(req.params.voterId);
    if (!voter) {
      res.status(404).json({ success: false, error: 'Voter not found' });
      return;
    }
    if (!['PENDING_MANUAL_REVIEW', 'PENDING_VERIFICATION'].includes(voter.status)) {
      res.status(400).json({ success: false, error: 'Voter is not pending manual review' });
      return;
    }
    const { inquiryId, url } = await personaService.createInquiry(voter.nationalId, voter.id);
    res.json({
      success: true,
      data: {
        voterId: voter.id,
        nationalId: voter.nationalId,
        inquiryId,
        personaUrl: url,
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to start KYC' });
  }
});

// GET /api/admin/kyc-status?inquiryId=xxx — Poll Persona for KYC completion
router.get('/kyc-status', async (req: Request, res: Response) => {
  const { inquiryId } = req.query;
  if (!inquiryId || typeof inquiryId !== 'string') {
    res.status(400).json({ success: false, error: 'inquiryId is required' });
    return;
  }
  try {
    const { status } = await personaService.getInquiry(inquiryId);
    res.json({
      success: true,
      data: {
        inquiryId,
        status,
        completed: ['completed', 'approved'].includes(status),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to check KYC status' });
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

/**
 * POST /api/admin/create-officer-account
 *
 * Creates a voter+staff record for an IEBC officer who does not self-register.
 * Only commission-tier officers may use this endpoint.
 * The voter is created with REGISTERED status and the supplied password;
 * the officer can then log in through the normal admin-auth flow.
 */
router.post(
  '/create-officer-account',
  requireStaffRole(...STAFF_MANAGE_ROLES),
  async (req: Request, res: Response) => {
    const schema = z.object({
      nationalId:        z.string().min(1).max(20),
      fullName:          z.string().min(2).max(255),
      email:             z.string().email(),
      password:          z.string().min(8),
      phoneNumber:       z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    try {
      const passwordHash = await argon2.hash(parsed.data.password);

      // Upsert: create if new, or update status+password if the account exists but is blocked
      const existing = await prisma.voter.findUnique({ where: { nationalId: parsed.data.nationalId } });
      let voter;
      if (existing) {
        voter = await prisma.voter.update({
          where: { nationalId: parsed.data.nationalId },
          data: {
            passwordHash,
            email:          parsed.data.email,
            emailVerifiedAt: new Date(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status:         'REGISTERED' as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            role:           'ADMIN' as any,
          },
        });
      } else {
        voter = await prisma.voter.create({
          data: {
            nationalId:      parsed.data.nationalId,
            email:           parsed.data.email,
            phoneNumber:     parsed.data.phoneNumber ?? null,
            passwordHash,
            preferredContact: 'EMAIL',
            emailVerifiedAt: new Date(), // pre-verified — admin vouches for this account
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status:          'REGISTERED' as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            role:            'ADMIN' as any,
          },
        });
      }

      res.status(existing ? 200 : 201).json({
        success: true,
        data: { voterId: voter.id, nationalId: voter.nationalId, email: voter.email },
      });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: msg });
    }
  },
);

/**
 * POST /api/admin/voters/:voterId/mark-deceased
 *
 * Marks a voter as DECEASED:
 *   1. Validates the voter exists and is not already DECEASED.
 *   2. Revokes their SBT on-chain (if minted), which prevents any future
 *      hasToken() check from succeeding.
 *   3. Sets status = DECEASED + records deceasedAt / sbtRevokedAt timestamps.
 *
 * Votes already cast before this action are NOT touched — they remain CONFIRMED
 * and count in the tally. Only future login and voting attempts are blocked.
 *
 * Restricted to COMMISSIONER and commission-equivalent roles.
 */
router.post(
  '/voters/:voterId/mark-deceased',
  requireStaffRole('COMMISSIONER', 'CHAIRPERSON', 'COMMISSION_SECRETARY'),
  async (req: Request, res: Response) => {
    try {
      const voter = await voterRepository.findById(req.params.voterId);
      if (!voter) {
        res.status(404).json({ success: false, error: 'Voter not found' });
        return;
      }
      if (voter.status === 'DECEASED') {
        res.status(409).json({ success: false, error: 'Voter is already marked as deceased' });
        return;
      }

      // Revoke SBT on-chain if one was minted
      let sbtRevokedAt: Date | null = null;
      let sbtRevokeTxHash: string | null = null;
      if (voter.sbtTokenId) {
        const { txHash } = await blockchainService.revokeSBT(voter.sbtTokenId);
        sbtRevokedAt = new Date();
        sbtRevokeTxHash = txHash;
      }

      const updated = await voterRepository.markDeceased(voter.id, sbtRevokedAt);

      res.json({
        success: true,
        data: {
          voterId:         updated.id,
          nationalId:      updated.nationalId,
          status:          updated.status,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          deceasedAt:      (updated as any).deceasedAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sbtRevokedAt:    (updated as any).sbtRevokedAt,
          sbtRevokeTxHash: sbtRevokeTxHash,
          note:            voter.sbtTokenId
            ? 'SBT revoked on-chain. Login and voting permanently blocked. Past votes unaffected.'
            : 'No SBT was minted. Login and voting permanently blocked. Past votes unaffected.',
        },
      });
    } catch (err) {
      if (err instanceof ServiceError) { res.status(err.statusCode).json({ success: false, error: err.message }); return; }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ success: false, error: msg });
    }
  },
);

/**
 * POST /api/admin/voters/:voterId/initiate-escorted-revote
 *
 * Notifies a DISTRESS_FLAGGED voter that IEBC has reviewed their case and
 * arranged a safe escorted revote. Sends an SMS or email with instructions
 * to return to their polling station with their National ID.
 *
 * The actual revote uses the existing POST /api/votes/cast endpoint — the
 * voter simply casts a new vote with their normal PIN and the distress vote
 * is superseded automatically.
 */
router.post(
  '/voters/:voterId/initiate-escorted-revote',
  async (req: Request, res: Response) => {
    try {
      const requesterId = (req as AuthenticatedRequest).voter?.sub ?? '';
      const result = await adminService.initiateEscortedRevote(req.params.voterId, requesterId);
      res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof ServiceError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate escorted revote',
      });
    }
  }
);

export default router;
