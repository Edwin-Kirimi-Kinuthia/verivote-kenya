import crypto from 'crypto';
import { prisma } from '../database/client.js';
import { notificationService } from './notification.service.js';
import { voterRepository } from '../repositories/index.js';
import { ServiceError } from './voter.service.js';

export type OtpPurpose = 'LOGIN' | 'CONTACT_VERIFY' | 'CREDENTIAL_RESET';

const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_ATTEMPTS = 3;               // lock after 3 wrong guesses
const RESEND_COOLDOWN_MS = 60 * 1000; // min 60 s between requests

// ── Internal helpers ─────────────────────────────────────────────────────────

function generateCode(): string {
  // crypto.randomInt uses CSPRNG — no Math.random()
  return crypto.randomInt(100_000, 1_000_000).toString();
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ── OtpService ────────────────────────────────────────────────────────────────

export class OtpService {

  /**
   * Generate a 6-digit OTP, store its SHA-256 hash, and deliver it to the
   * voter's registered phone (SMS) or email address.
   *
   * Returns the channel used. In NOTIFICATION_MOCK mode the code is also
   * returned in `mockCode` so tests can consume it without reading logs.
   */
  async requestOtp(
    nationalId: string,
    purpose: OtpPurpose,
  ): Promise<{ sent: boolean; channel: string; mockCode?: string }> {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      // Constant-time guard — same delay whether voter exists or not
      await new Promise(r => setTimeout(r, 200));
      throw new ServiceError('Invalid credentials', 401);
    }

    if (purpose === 'LOGIN') {
      const blocked = new Set(['PENDING_VERIFICATION', 'PENDING_MANUAL_REVIEW', 'SUSPENDED', 'VERIFICATION_FAILED']);
      if (blocked.has(voter.status)) {
        throw new ServiceError('Account is not eligible to vote yet', 403);
      }
    }

    if (!voter.phoneNumber && !voter.email) {
      throw new ServiceError(
        'No contact information on file. Please register with a phone number or email.',
        400,
      );
    }

    // Enforce resend cooldown — prevent OTP flooding
    const recentOtp = await prisma.otpCode.findFirst({
      where: {
        voterId: voter.id,
        purpose,
        usedAt: null,
        createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      throw new ServiceError(
        'Please wait 60 seconds before requesting another OTP.',
        429,
      );
    }

    // Invalidate all previous unused OTPs for this voter + purpose
    await prisma.otpCode.updateMany({
      where: { voterId: voter.id, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpCode.create({
      data: { voterId: voter.id, purpose, codeHash, expiresAt },
    });

    // Prefer SMS (SIM-bound = harder to intercept); fallback to email
    const channel: 'SMS' | 'EMAIL' = voter.phoneNumber ? 'SMS' : 'EMAIL';
    const recipient = channel === 'SMS' ? voter.phoneNumber! : voter.email!;

    await notificationService.sendOtp({
      channel,
      recipient,
      nationalId: voter.nationalId,
      code,
      purpose,
    });

    const result: { sent: boolean; channel: string; mockCode?: string } = {
      sent: true,
      channel: channel.toLowerCase(),
    };

    // In mock mode, expose the OTP in the response to aid testing
    if (notificationService.isMockMode()) {
      result.mockCode = code;
    }

    return result;
  }

  /**
   * Verify a voter-submitted OTP code.
   * Uses constant-time comparison (crypto.timingSafeEqual) and increments
   * the attempt counter before checking so brute-force is rate-limited even
   * when attempts and the DB update run concurrently.
   *
   * On success: marks the OTP as used and returns the voterId.
   * On failure: throws ServiceError (401 / 429).
   */
  async verifyOtp(nationalId: string, purpose: OtpPurpose, code: string): Promise<string> {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      await new Promise(r => setTimeout(r, 200));
      throw new ServiceError('Invalid credentials', 401);
    }

    const record = await prisma.otpCode.findFirst({
      where: {
        voterId: voter.id,
        purpose,
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new ServiceError('No valid OTP found. Please request a new one.', 400);
    }

    // Increment attempt BEFORE checking the code to prevent race-condition brute-force
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });

    if (updated.attempts > MAX_ATTEMPTS) {
      await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      throw new ServiceError('Maximum OTP attempts exceeded. Please request a new OTP.', 429);
    }

    // Constant-time comparison — prevents timing side-channels
    const expectedHash = hashCode(code);
    const storedBuf   = Buffer.from(record.codeHash, 'hex');
    const expectedBuf = Buffer.from(expectedHash,    'hex');
    const match = storedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(storedBuf, expectedBuf);

    if (!match) {
      const remaining = MAX_ATTEMPTS - updated.attempts;
      if (remaining <= 0) {
        await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
        throw new ServiceError('Invalid OTP. No attempts remaining. Please request a new one.', 401);
      }
      throw new ServiceError(
        `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        401,
      );
    }

    // One-time use — mark consumed
    await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    return voter.id;
  }

  /**
   * Mark the voter's phone or email as verified.
   * Called after a successful CONTACT_VERIFY OTP flow.
   */
  async markContactVerified(voterId: string): Promise<void> {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    const now = new Date();
    // Mark whichever contact exists (prefer phone)
    if (voter.phoneNumber) {
      await prisma.voter.update({
        where: { id: voterId },
        data: { phoneVerifiedAt: now },
      });
    } else if (voter.email) {
      await prisma.voter.update({
        where: { id: voterId },
        data: { emailVerifiedAt: now },
      });
    }
  }
}

export const otpService = new OtpService();
