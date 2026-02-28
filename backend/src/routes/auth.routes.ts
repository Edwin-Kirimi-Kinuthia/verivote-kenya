import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { passwordAuthService } from '../services/password-auth.service.js';
import { otpService } from '../services/otp.service.js';
import { authService } from '../services/auth.service.js';
import { voterRepository } from '../repositories/index.js';
import { ServiceError } from '../services/voter.service.js';
import { requireAuth, authRateLimiter, otpRateLimiter } from '../middleware/index.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

// ── Shared password schema (complexity enforced here and at registration) ─────

const KEYBOARD_SEQUENCES = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
];

function hasConsecutiveSequence(pw: string): boolean {
  const lower = pw.toLowerCase();
  for (const seq of KEYBOARD_SEQUENCES) {
    const rev = seq.split('').reverse().join('');
    for (let i = 0; i <= seq.length - 4; i++) {
      if (lower.includes(seq.slice(i, i + 4))) return true;
      if (lower.includes(rev.slice(i, i + 4))) return true;
    }
  }
  return false;
}

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
  .refine((pw) => !hasConsecutiveSequence(pw), {
    message: 'Password must not contain more than 3 consecutive keyboard or sequential characters (e.g. "qwer", "1234", "abcd")',
  });

const loginSchema = z.object({
  identifier: z.string().min(1, 'identifier is required'),
  password: z.string().min(1, 'password is required'),
});

const setPasswordSchema = z.object({
  newPassword: passwordSchema,
  currentPassword: z.string().optional(),
});

const otpRequestSchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be 8 digits'),
  purpose: z.enum(['LOGIN', 'CONTACT_VERIFY', 'CREDENTIAL_RESET']).default('LOGIN'),
});

const otpVerifySchema = z.object({
  nationalId: z.string().regex(/^\d{8}$/, 'National ID must be 8 digits'),
  code: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  purpose: z.enum(['LOGIN', 'CONTACT_VERIFY', 'CREDENTIAL_RESET']).default('LOGIN'),
});

// ── Password login ────────────────────────────────────────────────────────────

// POST /api/auth/login
// Accepts nationalId | email | phoneNumber + password → JWT
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const result = await passwordAuthService.login(parsed.data.identifier, parsed.data.password);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /api/auth/set-password
// Set or change password. Requires JWT. If already set, currentPassword must match.
router.post('/set-password', requireAuth, async (req: Request, res: Response) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const voterId = (req as AuthenticatedRequest).voter.sub;
    const result = await passwordAuthService.setPassword(
      voterId,
      parsed.data.newPassword,
      parsed.data.currentPassword,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to set password' });
  }
});

// ── OTP login ─────────────────────────────────────────────────────────────────

// POST /api/auth/request-otp
// Step 1 of OTP login: send a 6-digit code to the voter's phone or email.
// Body: { nationalId, purpose? }
router.post('/request-otp', otpRateLimiter, async (req: Request, res: Response) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const result = await otpService.requestOtp(parsed.data.nationalId, parsed.data.purpose);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp
// Step 2 of OTP login: verify the 6-digit code → JWT (for LOGIN purpose)
// or mark contact as verified (for CONTACT_VERIFY purpose).
// Body: { nationalId, code, purpose? }
router.post('/verify-otp', otpRateLimiter, async (req: Request, res: Response) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const { nationalId, code, purpose } = parsed.data;
    const voterId = await otpService.verifyOtp(nationalId, purpose, code);

    if (purpose === 'CONTACT_VERIFY') {
      await otpService.markContactVerified(voterId);
      res.json({ success: true, data: { message: 'Contact verified successfully' } });
      return;
    }

    // LOGIN / CREDENTIAL_RESET → issue a JWT
    const voter = await voterRepository.findById(voterId);
    if (!voter) {
      res.status(404).json({ success: false, error: 'Voter not found' });
      return;
    }

    const token = authService.generateToken({
      sub: voter.id,
      nationalId: voter.nationalId,
      status: voter.status,
      role: voter.role,
      isDistress: false,
    });

    res.json({
      success: true,
      data: {
        auth: {
          token,
          expiresIn: authService.getExpiresIn(),
          voter: {
            id: voter.id,
            nationalId: voter.nationalId,
            status: voter.status,
            role: voter.role,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
});

export default router;
