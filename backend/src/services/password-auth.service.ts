import argon2 from 'argon2';
import { voterRepository } from '../repositories/index.js';
import { authService } from './auth.service.js';
import { ServiceError } from './voter.service.js';
import type { Voter } from '../types/database.types.js';

const BLOCKED_STATUSES = new Set([
  'PENDING_VERIFICATION',
  'PENDING_MANUAL_REVIEW',
  'VERIFICATION_FAILED',
  'SUSPENDED',
]);

export class PasswordAuthService {

  /**
   * Login with nationalId, email, or phoneNumber + password.
   * Returns a JWT on success.
   */
  async login(identifier: string, password: string) {
    const voter = await this.findByIdentifier(identifier);
    if (!voter) {
      // Constant-time guard — don't reveal whether the voter exists
      await argon2.hash('dummy-timing-guard');
      throw new ServiceError('Invalid credentials', 401);
    }

    if (BLOCKED_STATUSES.has(voter.status)) {
      throw new ServiceError('Account is not eligible to vote yet', 403);
    }

    if (!voter.passwordHash) {
      throw new ServiceError(
        'Password login is not set up for this account. Please use fingerprint login or set a password first.',
        403
      );
    }

    const valid = await argon2.verify(voter.passwordHash, password);
    if (!valid) {
      throw new ServiceError('Invalid credentials', 401);
    }

    const token = authService.generateToken({
      sub: voter.id,
      nationalId: voter.nationalId,
      status: voter.status,
      role: voter.role,
      isDistress: false,
    });

    return {
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
    };
  }

  /**
   * Set or change password for an authenticated voter.
   * If the voter already has a password, currentPassword must match it.
   */
  async setPassword(voterId: string, newPassword: string, currentPassword?: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    if (voter.passwordHash) {
      if (!currentPassword) {
        throw new ServiceError('Current password is required to change your password', 400);
      }
      const valid = await argon2.verify(voter.passwordHash, currentPassword);
      if (!valid) {
        throw new ServiceError('Current password is incorrect', 401);
      }
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await voterRepository.update(voterId, { passwordHash });

    return { message: 'Password updated successfully' };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async findByIdentifier(identifier: string): Promise<Voter | null> {
    // nationalId: exactly 8 digits
    if (/^\d{8}$/.test(identifier)) {
      return voterRepository.findByNationalId(identifier);
    }
    // phone: +254XXXXXXXXX
    if (/^\+254\d{9}$/.test(identifier)) {
      return voterRepository.findByPhone(identifier);
    }
    // anything with @ — treat as email
    if (identifier.includes('@')) {
      return voterRepository.findByEmail(identifier);
    }
    return null;
  }
}

export const passwordAuthService = new PasswordAuthService();
