/**
 * VeriVote Kenya — Secure Admin Authentication (Multi-step)
 *
 * Login flow:
 *   Step 1 — Password  POST /api/admin-auth/login
 *              Validates credentials, checks ADMIN role, auto-sends OTP,
 *              returns a short-lived step token (5 min). No session yet.
 *
 *   Step 2a — OTP      POST /api/admin-auth/verify-otp
 *              Validates step token + 6-digit OTP → issues full session JWT.
 *
 *   Step 2b — Biometric (if enrolled)
 *              POST /api/admin-auth/webauthn-options → challenge options
 *              POST /api/admin-auth/webauthn-verify  → assertion → full JWT
 *
 * The step token ensures biometric/OTP cannot be used without completing
 * the password step first (prevents single-factor bypass).
 */

import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { passwordAuthService } from '../services/password-auth.service.js';
import { otpService } from '../services/otp.service.js';
import { webAuthnService } from '../services/webauthn.service.js';
import { authService } from '../services/auth.service.js';
import { voterRepository } from '../repositories/index.js';
import { prisma } from '../database/client.js';
import { ServiceError } from '../services/voter.service.js';
import { authRateLimiter, otpRateLimiter } from '../middleware/index.js';
import { logger } from '../lib/logger.js';
import type { StaffRole, JurisdictionLevel } from '../types/auth.types.js';

const router: Router = Router();

// ── Step-token helpers ────────────────────────────────────────────────────────

const STEP_SECRET = process.env.JWT_SECRET!;
const STEP_TTL    = 5 * 60; // 5 minutes

interface StepTokenPayload {
  sub: string;
  nationalId: string;
  purpose: 'admin-step';
}

function signStepToken(voterId: string, nationalId: string): string {
  return jwt.sign(
    { sub: voterId, nationalId, purpose: 'admin-step' } satisfies StepTokenPayload,
    STEP_SECRET,
    { expiresIn: STEP_TTL },
  );
}

function verifyStepToken(token: string): StepTokenPayload {
  const payload = jwt.verify(token, STEP_SECRET) as StepTokenPayload;
  if (payload.purpose !== 'admin-step') {
    throw new Error('Token purpose mismatch');
  }
  return payload;
}

/** Mask a contact string for display: "user@example.com" → "us**@example.com" */
function maskContact(value: string | null | undefined): string {
  if (!value) return '(no contact on file)';
  const atIdx = value.indexOf('@');
  if (atIdx > 0) {
    // Email
    const local  = value.slice(0, atIdx);
    const domain = value.slice(atIdx);
    return local.slice(0, 2).padEnd(local.length, '*') + domain;
  }
  // Phone
  return value.slice(0, 4) + '****' + value.slice(-2);
}

// ── Step 1: Password ──────────────────────────────────────────────────────────

router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({
    identifier: z.string().min(1, 'identifier is required'),
    password:   z.string().min(1, 'password is required'),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  try {
    const authResult = await passwordAuthService.login(
      parsed.data.identifier,
      parsed.data.password,
    );

    if (authResult.voter.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Access denied. This portal is for IEBC officials only.',
      });
      return;
    }

    const voter = await voterRepository.findById(authResult.voter.id);
    if (!voter) {
      res.status(404).json({ success: false, error: 'Voter not found' });
      return;
    }

    // Auto-send OTP to admin's registered contact
    const otpResult = await otpService.requestOtp(voter.nationalId, 'LOGIN');

    // Check for enrolled WebAuthn credentials
    const credCount = await prisma.webAuthnCredential.count({
      where: { voterId: voter.id },
    });

    const stepToken = signStepToken(voter.id, voter.nationalId);
    const contactHint = maskContact(voter.email ?? voter.phoneNumber);

    logger.info('Admin login step 1 passed', { voterId: voter.id, hasWebAuthn: credCount > 0 });

    // In non-production, expose OTP code so devs can log in without checking Mailtrap
    const devData = process.env.NODE_ENV !== 'production' && otpResult.mockCode
      ? { mockCode: otpResult.mockCode }
      : {};

    res.json({
      success: true,
      data: { stepToken, contactHint, hasWebAuthn: credCount > 0, ...devData },
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    logger.error('Admin login step 1 failed', { error: (err as Error).message });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ── Step 2a: OTP verification ─────────────────────────────────────────────────

router.post('/verify-otp', otpRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({
    stepToken: z.string().min(1, 'stepToken is required'),
    code:      z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  let payload: StepTokenPayload;
  try {
    payload = verifyStepToken(parsed.data.stepToken);
  } catch {
    res.status(401).json({
      success: false,
      error: 'Session expired. Please enter your password again.',
    });
    return;
  }

  try {
    await otpService.verifyOtp(payload.nationalId, 'LOGIN', parsed.data.code);

    const voter = await voterRepository.findById(payload.sub);
    if (!voter || voter.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied.' });
      return;
    }

    // Look up IebcStaff record for this voter (may not exist for legacy admins)
    const staffRecord = await prisma.iebcStaff.findUnique({
      where: { voterId: voter.id },
    });

    const token = authService.generateToken({
      sub:               voter.id,
      nationalId:        voter.nationalId,
      status:            voter.status,
      role:              voter.role,
      isDistress:        false,
      staffId:           staffRecord?.id,
      staffRole:         staffRecord?.staffRole as StaffRole | undefined,
      jurisdictionLevel: staffRecord?.jurisdictionLevel as JurisdictionLevel | undefined,
      jurisdictionValue: staffRecord?.jurisdictionValue ?? undefined,
    });

    logger.info('Admin login complete via OTP', { voterId: voter.id, staffRole: staffRecord?.staffRole });

    res.json({
      success: true,
      data: {
        token,
        expiresIn: authService.getExpiresIn(),
        voter: {
          id:                voter.id,
          nationalId:        voter.nationalId,
          status:            voter.status,
          role:              voter.role,
          staffId:           staffRecord?.id,
          staffRole:         staffRecord?.staffRole,
          jurisdictionLevel: staffRecord?.jurisdictionLevel,
          jurisdictionValue: staffRecord?.jurisdictionValue ?? null,
        },
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
});

// ── Step 2b: WebAuthn options (biometric alternative to OTP) ──────────────────

router.post('/webauthn-options', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({
    stepToken: z.string().min(1, 'stepToken is required'),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  let payload: StepTokenPayload;
  try {
    payload = verifyStepToken(parsed.data.stepToken);
  } catch {
    res.status(401).json({
      success: false,
      error: 'Session expired. Please enter your password again.',
    });
    return;
  }

  try {
    const options = await webAuthnService.getAuthenticationOptions(payload.nationalId);
    res.json({ success: true, data: options });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to generate biometric challenge' });
  }
});

// ── Step 2b: WebAuthn assertion verify ───────────────────────────────────────

router.post('/webauthn-verify', authRateLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({
    stepToken: z.string().min(1, 'stepToken is required'),
    response:  z.record(z.unknown()),  // AuthenticationResponseJSON — validated by webauthn lib
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  let payload: StepTokenPayload;
  try {
    payload = verifyStepToken(parsed.data.stepToken);
  } catch {
    res.status(401).json({
      success: false,
      error: 'Session expired. Please enter your password again.',
    });
    return;
  }

  try {
    // Verify the biometric assertion (we only need it to succeed; we regenerate the token below)
    await webAuthnService.verifyAuthentication(
      payload.nationalId,
      parsed.data.response as unknown as AuthenticationResponseJSON,
    );

    // Double-check admin role — webAuthnService doesn't enforce it
    const voter = await voterRepository.findById(payload.sub);
    if (!voter || voter.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied.' });
      return;
    }

    const staffRecord = await prisma.iebcStaff.findUnique({
      where: { voterId: voter.id },
    });

    // Regenerate the token with staff fields — webAuthnService issues a token
    // without them, so we must replace it here.
    const staffToken = authService.generateToken({
      sub:               voter.id,
      nationalId:        voter.nationalId,
      status:            voter.status,
      role:              voter.role,
      isDistress:        false,
      staffId:           staffRecord?.id,
      staffRole:         staffRecord?.staffRole as StaffRole | undefined,
      jurisdictionLevel: staffRecord?.jurisdictionLevel as JurisdictionLevel | undefined,
      jurisdictionValue: staffRecord?.jurisdictionValue ?? undefined,
    });

    logger.info('Admin login complete via biometric', { voterId: voter.id, staffRole: staffRecord?.staffRole });

    const enrichedAuth = {
      token:     staffToken,
      expiresIn: authService.getExpiresIn(),
      voter: {
        id:                voter.id,
        nationalId:        voter.nationalId,
        status:            voter.status,
        role:              voter.role,
        staffId:           staffRecord?.id,
        staffRole:         staffRecord?.staffRole,
        jurisdictionLevel: staffRecord?.jurisdictionLevel,
        jurisdictionValue: staffRecord?.jurisdictionValue ?? null,
      },
    };
    res.json({ success: true, data: enrichedAuth });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Biometric verification failed' });
  }
});

export default router;
