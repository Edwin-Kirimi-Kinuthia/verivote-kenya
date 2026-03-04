import argon2 from 'argon2';
import { randomInt } from 'crypto';
import { ethers } from 'ethers';
import { voterRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { notificationService } from './notification.service.js';
import { personaService } from './persona.service.js';

export class VoterService {
  async registerVoter(
    nationalId: string,
    pollingStationId: string,
    contactInfo?: {
      phoneNumber?: string;
      email?: string;
      preferredContact?: 'SMS' | 'EMAIL';
      fingerprintHash?: string;
      password?: string;
    }
  ) {
    // Validate national ID format (8 digits, Kenyan format)
    if (!/^\d{8}$/.test(nationalId)) {
      throw new ServiceError('National ID must be exactly 8 digits', 400);
    }

    // Check if a record already exists for this national ID
    const existing = await voterRepository.findByNationalId(nationalId);
    if (existing) {
      if (existing.status === 'REGISTERED') {
        throw new ServiceError('National ID is already registered', 409);
      }
      if (existing.status === 'VERIFICATION_FAILED') {
        throw new ServiceError(
          'Your registration was previously rejected. Please contact your local IEBC office.',
          409
        );
      }

      // PENDING_VERIFICATION or PENDING_MANUAL_REVIEW: allow the voter to retry.
      // Reset to PENDING_VERIFICATION so a Persona webhook can fire correctly.
      const updates: Record<string, unknown> = { status: 'PENDING_VERIFICATION' };
      if (pollingStationId && pollingStationId !== existing.pollingStationId) {
        updates.pollingStationId = pollingStationId;
      }
      if (contactInfo) {
        if (contactInfo.phoneNumber) updates.phoneNumber = contactInfo.phoneNumber;
        if (contactInfo.email) updates.email = contactInfo.email;
        if (contactInfo.preferredContact) updates.preferredContact = contactInfo.preferredContact;
        if (contactInfo.fingerprintHash) {
          updates.fingerprintHash = contactInfo.fingerprintHash;
          updates.fingerprintCapturedAt = new Date();
        }
        if (contactInfo.password) {
          updates.passwordHash = await argon2.hash(contactInfo.password, { type: argon2.argon2id });
        }
      }
      await voterRepository.update(existing.id, updates);

      // Issue a fresh Persona inquiry so they can re-attempt online verification
      const { inquiryId, url } = await personaService.createInquiry(nationalId, existing.id);
      await voterRepository.updatePersonaStatus(existing.id, inquiryId, 'created');

      return {
        voterId: existing.id,
        inquiryId,
        personaUrl: url,
      };
    }

    // New voter — hash password if provided, then create record
    const { password, ...restContact } = contactInfo ?? {};
    const passwordHash = password
      ? await argon2.hash(password, { type: argon2.argon2id })
      : undefined;

    const voter = await voterRepository.create({
      nationalId,
      pollingStationId,
      ...restContact,
      passwordHash,
    });

    // Create Persona inquiry for identity verification
    const { inquiryId, url } = await personaService.createInquiry(nationalId, voter.id);

    // Store the Persona inquiry ID on the voter
    await voterRepository.updatePersonaStatus(voter.id, inquiryId, 'created');

    return {
      voterId: voter.id,
      inquiryId,
      personaUrl: url,
    };
  }

  async completeVerification(inquiryId: string, personaStatus: string) {
    const voter = await voterRepository.findByInquiryId(inquiryId);
    if (!voter) {
      throw new ServiceError('Voter not found for inquiry', 404);
    }

    if (voter.status !== 'PENDING_VERIFICATION') {
      throw new ServiceError('Voter is not pending verification', 409);
    }

    // If verification failed, route to manual review instead of outright rejection
    const PERSONA_SUCCESS = ['completed', 'approved'];
    if (!PERSONA_SUCCESS.includes(personaStatus)) {
      const failureReason = `Automated verification failed: Persona status "${personaStatus}"`;
      await voterRepository.requestManualReview(voter.id, failureReason);
      await voterRepository.update(voter.id, { personaStatus });
      return {
        voterId: voter.id,
        status: 'PENDING_MANUAL_REVIEW',
        message: 'Automated verification failed. Your application has been sent for manual review by IEBC officials.',
      };
    }

    // Verification passed — mint SBT, generate PINs
    const wallet = ethers.Wallet.createRandom();
    const { tokenId, txHash } = await blockchainService.mintSBT(wallet.address, voter.nationalId);

    await voterRepository.registerWithSbt(voter.id, wallet.address, tokenId);

    // Mark as registered with verification timestamp
    await voterRepository.update(voter.id, {
      status: 'REGISTERED',
      personaStatus: 'completed',
      personaVerifiedAt: new Date(),
    });

    // Voter must now enroll a WebAuthn credential via POST /api/webauthn/register/options
    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
      nextStep: 'enroll_fingerprint',
    };
  }

  async getRegistrationStatus(inquiryId: string) {
    const voter = await voterRepository.findByInquiryId(inquiryId);
    if (!voter) {
      throw new ServiceError('No registration found for this inquiry', 404);
    }

    // If still waiting, actively poll Persona API to detect completion without relying on webhook
    if (voter.status === 'PENDING_VERIFICATION') {
      try {
        const { personaService } = await import('./persona.service.js');
        const inquiry = await personaService.getInquiry(inquiryId);
        const PERSONA_SUCCESS = ['completed', 'approved'];
        const PERSONA_FAILED = ['failed', 'declined', 'expired'];
        if (PERSONA_SUCCESS.includes(inquiry.status)) {
          // Trigger the full completion flow (mint SBT, generate PINs, notify voter)
          const result = await this.completeVerification(inquiryId, inquiry.status);
          return { status: 'REGISTERED', ...result };
        }
        if (PERSONA_FAILED.includes(inquiry.status)) {
          await voterRepository.update(voter.id, {
            status: 'PENDING_MANUAL_REVIEW',
            verificationFailureReason: `Persona status: ${inquiry.status}`,
          });
          return { voterId: voter.id, status: 'PENDING_MANUAL_REVIEW', personaStatus: inquiry.status };
        }
      } catch {
        // Persona API unavailable or mock mode — fall through to DB status
      }
    }

    return {
      voterId: voter.id,
      status: voter.status,
      personaStatus: voter.personaStatus,
      manualReviewRequestedAt: voter.manualReviewRequestedAt,
      verificationFailureReason: voter.verificationFailureReason,
    };
  }

  /**
   * Set the voter's normal PIN (user-chosen) and generate a server-side distress PIN.
   * The distress PIN is delivered via SMS/email so the voter knows it, but an
   * attacker watching the setup screen cannot identify which PIN triggers the alert.
   */
  async setVoterPin(voterId: string, pin: string) {
    // Validate format: exactly 4 digits
    if (!/^\d{4}$/.test(pin)) {
      throw new ServiceError('PIN must be exactly 4 digits', 400);
    }
    // Reject all-same-digit PINs (1111, 2222, …)
    if (/^(\d)\1{3}$/.test(pin)) {
      throw new ServiceError('PIN cannot be all the same digit (e.g. 1111)', 400);
    }
    // Reject sequential PINs (1234, 4321, …)
    const digits = pin.split('').map(Number);
    const isAsc = digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1);
    const isDesc = digits.every((d, i) => i === 0 || d === digits[i - 1]! - 1);
    if (isAsc || isDesc) {
      throw new ServiceError('PIN cannot be a sequential number (e.g. 1234)', 400);
    }

    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    const pinAllowedStatuses = ['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'];
    if (!pinAllowedStatuses.includes(voter.status)) {
      throw new ServiceError('PIN setup is not available for this voter status', 400);
    }

    // Hash the normal PIN
    const normalPinHash = await argon2.hash(pin, { type: argon2.argon2id });

    // Generate a distress PIN that:
    //  • differs from the normal PIN in at least 2 digit positions
    //  • is not all-same or sequential
    let distressPin: string;
    let attempts = 0;
    do {
      distressPin = Array.from({ length: 4 }, () => randomInt(0, 10)).join('');
      const diffPositions = distressPin.split('').filter((d, i) => d !== pin[i]).length;
      const dDigits = distressPin.split('').map(Number);
      const dAllSame = /^(\d)\1{3}$/.test(distressPin);
      const dAsc = dDigits.every((d, i) => i === 0 || d === dDigits[i - 1]! + 1);
      const dDesc = dDigits.every((d, i) => i === 0 || d === dDigits[i - 1]! - 1);
      if (diffPositions >= 2 && !dAllSame && !dAsc && !dDesc) break;
      attempts++;
    } while (attempts < 100);

    const distressPinHash = await argon2.hash(distressPin, { type: argon2.argon2id });

    // Persist both hashes
    await voterRepository.update(voterId, {
      normalPinHash,
      distressPinHash,
      pinSetAt: new Date(),
    });

    // Deliver the distress PIN to the voter (they already know their normal PIN)
    if (voter.preferredContact && (voter.phoneNumber || voter.email)) {
      await notificationService.sendDistressPin({
        channel: voter.preferredContact as 'SMS' | 'EMAIL',
        recipient: voter.preferredContact === 'SMS' ? voter.phoneNumber! : voter.email!,
        nationalId: voter.nationalId,
        distressPin,
        context: 'REGISTRATION',
      });
    } else {
      // Fallback: log so devs can still test without contact info configured
      console.log(`[PIN DEV] distressPin=${distressPin} for voter ${voterId}`);
    }

    return {
      voterId,
      pinSet: true,
      distressPinDelivered: !!(voter.preferredContact),
      message: 'Your voting PIN has been set. Your distress PIN has been sent to your registered contact.',
    };
  }

  async requestManualReview(nationalId: string, reason: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (voter.status === 'REGISTERED') {
      throw new ServiceError('Voter is already registered', 409);
    }

    if (voter.status === 'PENDING_MANUAL_REVIEW') {
      // Idempotent — already in manual review queue, let them proceed to booking
      return {
        voterId: voter.id,
        status: 'PENDING_MANUAL_REVIEW',
        message: 'Your application is already pending manual review. Please book an appointment at your polling station.',
      };
    }

    if (voter.status !== 'PENDING_VERIFICATION' && voter.status !== 'VERIFICATION_FAILED') {
      throw new ServiceError('Cannot request manual review for this voter status', 400);
    }

    const failureReason = reason || 'Voter requested manual review (Persona verification not supported for their document)';
    await voterRepository.requestManualReview(voter.id, failureReason);

    return {
      voterId: voter.id,
      status: 'PENDING_MANUAL_REVIEW',
      message: 'Your request for manual review has been submitted. Please visit your polling station with your ID for physical verification.',
    };
  }

}


export class ServiceError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const voterService = new VoterService();
