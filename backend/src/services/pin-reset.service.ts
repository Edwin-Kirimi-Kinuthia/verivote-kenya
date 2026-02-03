import { randomInt } from 'crypto';
import argon2 from 'argon2';
import { voterRepository } from '../repositories/index.js';
import { personaService } from './persona.service.js';
import { ServiceError } from './voter.service.js';

function generatePin(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export class PinResetService {
  /**
   * Voter requests a PIN reset
   * Returns options for verification (in-person or biometric)
   */
  async requestPinReset(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    // Only registered voters who have voted or are ready to vote can reset PINs
    const allowedStatuses = ['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'];
    if (!allowedStatuses.includes(voter.status)) {
      throw new ServiceError('PIN reset is only available for registered voters', 400);
    }

    if (voter.pinResetRequested) {
      throw new ServiceError('PIN reset already requested. Please complete verification.', 409);
    }

    // Mark PIN reset as requested
    await voterRepository.update(voter.id, {
      pinResetRequested: true,
      pinResetRequestedAt: new Date(),
    });

    // Create Persona inquiry for biometric verification option
    let personaOption = null;
    if (!personaService.isMockMode()) {
      const { inquiryId, url } = await personaService.createInquiry(nationalId, `reset_${voter.id}`);
      await voterRepository.update(voter.id, { pinResetInquiryId: inquiryId });
      personaOption = { inquiryId, url };
    }

    return {
      voterId: voter.id,
      message: 'PIN reset requested. Choose a verification method.',
      verificationOptions: {
        inPerson: {
          description: 'Visit your polling station with your national ID for physical verification',
          pollingStationId: voter.pollingStationId,
        },
        biometric: personaService.isMockMode()
          ? { description: 'Biometric verification (disabled in mock mode)' }
          : {
              description: 'Complete identity verification online',
              ...personaOption,
            },
      },
    };
  }

  /**
   * Cancel a pending PIN reset request
   */
  async cancelPinReset(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (!voter.pinResetRequested) {
      throw new ServiceError('No pending PIN reset request', 400);
    }

    await voterRepository.update(voter.id, {
      pinResetRequested: false,
      pinResetRequestedAt: undefined,
      pinResetInquiryId: undefined,
    });

    return { message: 'PIN reset request cancelled' };
  }

  /**
   * Complete PIN reset via biometric verification (Persona webhook)
   */
  async completeBiometricReset(inquiryId: string, personaStatus: string) {
    // Find voter by reset inquiry ID
    const voter = await this.findVoterByResetInquiryId(inquiryId);
    if (!voter) {
      throw new ServiceError('No PIN reset request found for this inquiry', 404);
    }

    if (!voter.pinResetRequested) {
      throw new ServiceError('No pending PIN reset request', 400);
    }

    if (personaStatus !== 'completed') {
      // Verification failed - cancel the reset request
      await voterRepository.update(voter.id, {
        pinResetRequested: false,
        pinResetInquiryId: undefined,
      });
      return {
        voterId: voter.id,
        success: false,
        message: 'Biometric verification failed. Please try again or visit a polling station.',
      };
    }

    // Generate new PINs
    return this.generateNewPins(voter.id);
  }

  /**
   * Complete PIN reset via in-person verification (IEBC official)
   */
  async completeInPersonReset(voterId: string, officerId: string, notes?: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (!voter.pinResetRequested) {
      throw new ServiceError('No pending PIN reset request for this voter', 400);
    }

    // Generate new PINs
    const result = await this.generateNewPins(voter.id);

    // Add audit info
    return {
      ...result,
      verifiedBy: officerId,
      verificationNotes: notes,
      verificationType: 'in-person',
    };
  }

  /**
   * Generate new PINs for a voter (internal method)
   */
  private async generateNewPins(voterId: string) {
    const pin = generatePin();
    let distressPin = generatePin();
    while (distressPin === pin) {
      distressPin = generatePin();
    }

    const [pinHash, distressPinHash] = await Promise.all([
      argon2.hash(pin, { type: argon2.argon2id }),
      argon2.hash(distressPin, { type: argon2.argon2id }),
    ]);

    // Update voter with new PINs and clear reset request
    await voterRepository.update(voterId, {
      pinResetRequested: false,
      pinResetRequestedAt: undefined,
      pinResetInquiryId: undefined,
      pinLastResetAt: new Date(),
    });

    await voterRepository.setPins(voterId, pinHash, distressPinHash);

    const voter = await voterRepository.findById(voterId);

    return {
      voterId,
      nationalId: voter?.nationalId,
      pin,
      distressPin,
      message: 'PINs reset successfully. Please store these securely.',
      resetAt: new Date().toISOString(),
    };
  }

  /**
   * Find voter by PIN reset inquiry ID
   */
  private async findVoterByResetInquiryId(inquiryId: string) {
    // Use raw query since we don't have a specific method
    const { prisma } = await import('../database/client.js');
    return prisma.voter.findFirst({
      where: { pinResetInquiryId: inquiryId },
    });
  }

  /**
   * Get pending PIN reset requests for IEBC review
   */
  async getPendingResets(params: { pollingStationId?: string; page?: number; limit?: number }) {
    const { prisma } = await import('../database/client.js');

    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: { pinResetRequested: boolean; pollingStationId?: string } = {
      pinResetRequested: true,
    };

    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }

    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { pinResetRequestedAt: 'asc' },
        select: {
          id: true,
          nationalId: true,
          pinResetRequestedAt: true,
          pollingStationId: true,
          pollingStation: {
            select: { name: true, code: true },
          },
        },
      }),
      prisma.voter.count({ where }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Check PIN reset status for a voter
   */
  async getResetStatus(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    return {
      voterId: voter.id,
      pinResetRequested: voter.pinResetRequested,
      pinResetRequestedAt: voter.pinResetRequestedAt,
      pinLastResetAt: voter.pinLastResetAt,
    };
  }
}

export const pinResetService = new PinResetService();
