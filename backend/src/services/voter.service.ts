import argon2 from 'argon2';
import { randomInt } from 'crypto';
import { ethers } from 'ethers';
import { voterRepository } from '../repositories/index.js';
import { prisma } from '../database/client.js';
import { blockchainService } from './blockchain.service.js';
import { notificationService } from './notification.service.js';
import { personaService } from './persona.service.js';
import { authService } from './auth.service.js';
import { logger } from '../lib/logger.js';

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
      idDocumentType?: string;
      electionId?: string;
    }
  ) {
    // Determine whether this election requires Persona KYC.
    // GOVERNMENT elections require full KYC by default; all others use OTP-only.
    let kycRequired = true;
    if (contactInfo?.electionId) {
      const election = await prisma.election.findUnique({
        where: { id: contactInfo.electionId },
        select: { requiresKyc: true },
      });
      if (election) kycRequired = election.requiresKyc;
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
        if (contactInfo.idDocumentType) updates.idDocumentType = contactInfo.idDocumentType;
      }
      await voterRepository.update(existing.id, updates);

      if (!kycRequired) {
        // Non-KYC election: clear any stale persona inquiry, OTP verify is sufficient
        await voterRepository.update(existing.id, { personaInquiryId: null, personaStatus: null });
        return { voterId: existing.id, kycRequired: false };
      }

      // KYC election: issue a fresh Persona inquiry
      const { inquiryId, url } = await personaService.createInquiry(nationalId, existing.id);
      await voterRepository.updatePersonaStatus(existing.id, inquiryId, 'created');
      return { voterId: existing.id, kycRequired: true, inquiryId, personaUrl: url };
    }

    // New voter — hash password if provided, then create record
    const { password, electionId: _eid, ...restContact } = contactInfo ?? {};
    const passwordHash = password
      ? await argon2.hash(password, { type: argon2.argon2id })
      : undefined;

    const voter = await voterRepository.create({
      nationalId,
      pollingStationId,
      ...restContact,
      passwordHash,
    });

    if (!kycRequired) {
      // Non-KYC election: voter created, OTP verify will complete registration
      return { voterId: voter.id, kycRequired: false };
    }

    // KYC election: create Persona inquiry for identity verification
    const { inquiryId, url } = await personaService.createInquiry(nationalId, voter.id);
    await voterRepository.updatePersonaStatus(voter.id, inquiryId, 'created');
    return { voterId: voter.id, kycRequired: true, inquiryId, personaUrl: url };
  }

  /**
   * Complete registration for a non-KYC election after the voter has verified
   * their contact (OTP). Marks the voter REGISTERED and mints their SBT.
   */
  async completeContactVerification(voterId: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    if (voter.status === 'REGISTERED') {
      // Idempotent — already registered; just return a fresh setup token
      const setupToken = authService.generateToken({
        sub: voter.id, nationalId: voter.nationalId, status: voter.status, role: voter.role, isDistress: false,
      });
      return { voterId: voter.id, status: 'REGISTERED', setupToken };
    }

    if (voter.status !== 'PENDING_VERIFICATION') {
      throw new ServiceError('Voter is not in a state that allows contact-only registration', 409);
    }

    // Non-KYC voters must NOT have a persona inquiry (they took the OTP path)
    if (voter.personaInquiryId) {
      throw new ServiceError('This voter requires full identity verification (Persona KYC)', 409);
    }

    // Contact must have been verified via OTP before we mark them registered
    if (!voter.phoneVerifiedAt && !voter.emailVerifiedAt) {
      throw new ServiceError('Please verify your contact (email or phone) before completing registration', 400);
    }

    // Mint SBT (non-fatal: registration succeeds even if blockchain is offline)
    const wallet = ethers.Wallet.createRandom();
    let tokenId = `pending-sbt-${Date.now()}`;
    let txHash   = '0x' + '0'.repeat(64);
    try {
      const sbtResult = await blockchainService.mintSBT(wallet.address, voter.nationalId);
      tokenId = sbtResult.tokenId;
      txHash  = sbtResult.txHash;
    } catch (blockchainErr) {
      logger.warn('SBT mint failed — blockchain unavailable, proceeding with pending token', {
        voterId: voter.id,
        error: blockchainErr instanceof Error ? blockchainErr.message : String(blockchainErr),
      });
    }

    await voterRepository.registerWithSbt(voter.id, wallet.address, tokenId);
    await voterRepository.update(voter.id, { status: 'REGISTERED' });

    const setupToken = authService.generateToken({
      sub: voter.id, nationalId: voter.nationalId, status: 'REGISTERED', role: voter.role, isDistress: false,
    });

    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
      status: 'REGISTERED',
      setupToken,
      nextStep: 'enroll_fingerprint',
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

    // Verification passed — mint SBT (non-fatal: registration succeeds even when Hardhat is offline)
    const wallet = ethers.Wallet.createRandom();
    let tokenId = `pending-sbt-${Date.now()}`;
    let txHash   = '0x' + '0'.repeat(64);
    try {
      const sbtResult = await blockchainService.mintSBT(wallet.address, voter.nationalId);
      tokenId = sbtResult.tokenId;
      txHash  = sbtResult.txHash;
    } catch (blockchainErr) {
      logger.warn('SBT mint failed — blockchain unavailable, proceeding with pending token', {
        voterId: voter.id,
        error:   blockchainErr instanceof Error ? blockchainErr.message : String(blockchainErr),
      });
    }

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
  async setVoterPin(voterId: string, pin: string, distressPinInput?: string) {
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

    // Resolve distress PIN — either user-provided or auto-generated
    let distressPin: string;
    if (distressPinInput) {
      // Validate user-provided distress PIN
      if (!/^\d{4}$/.test(distressPinInput)) {
        throw new ServiceError('Distress PIN must be exactly 4 digits', 400);
      }
      if (/^(\d)\1{3}$/.test(distressPinInput)) {
        throw new ServiceError('Distress PIN cannot be all the same digit (e.g. 1111)', 400);
      }
      const dDigits = distressPinInput.split('').map(Number);
      const dAsc = dDigits.every((d, i) => i === 0 || d === dDigits[i - 1]! + 1);
      const dDesc = dDigits.every((d, i) => i === 0 || d === dDigits[i - 1]! - 1);
      if (dAsc || dDesc) {
        throw new ServiceError('Distress PIN cannot be a sequential number (e.g. 1234)', 400);
      }
      const diffPositions = distressPinInput.split('').filter((d, i) => d !== pin[i]).length;
      if (diffPositions < 2) {
        throw new ServiceError('Distress PIN must differ from your normal PIN in at least 2 digit positions', 400);
      }
      distressPin = distressPinInput;
    } else {
      // Auto-generate a distress PIN that differs in ≥2 positions and is not trivial
      let attempts = 0;
      distressPin = '';
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
    }

    const distressPinHash = await argon2.hash(distressPin, { type: argon2.argon2id });

    // Persist both hashes
    await voterRepository.update(voterId, {
      normalPinHash,
      distressPinHash,
      pinSetAt: new Date(),
    });

    // If distress PIN was auto-generated, deliver it to the voter via their registered contact
    if (!distressPinInput && voter.preferredContact && (voter.phoneNumber || voter.email)) {
      await notificationService.sendDistressPin({
        channel: voter.preferredContact as 'SMS' | 'EMAIL',
        recipient: voter.preferredContact === 'SMS' ? voter.phoneNumber! : voter.email!,
        nationalId: voter.nationalId,
        distressPin,
        context: 'REGISTRATION',
      });
    } else if (!distressPinInput) {
      logger.warn('Distress PIN could not be delivered — voter has no registered contact', { voterId });
    }

    return {
      voterId,
      pinSet: true,
      userSetDistressPin: !!distressPinInput,
      message: distressPinInput
        ? 'Your voting PIN and distress PIN have been set successfully.'
        : 'Your voting PIN has been set. Your distress PIN has been sent to your registered contact.',
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
