import { randomInt } from 'crypto';
import argon2 from 'argon2';
import { ethers } from 'ethers';
import { voterRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { personaService } from './persona.service.js';

function generatePin(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export class VoterService {
  async registerVoter(nationalId: string, pollingStationId: string) {
    // Validate national ID format (8 digits, Kenyan format)
    if (!/^\d{8}$/.test(nationalId)) {
      throw new ServiceError('National ID must be exactly 8 digits', 400);
    }

    // Check if already registered
    const exists = await voterRepository.nationalIdExists(nationalId);
    if (exists) {
      throw new ServiceError('National ID is already registered', 409);
    }

    // Create voter record with PENDING_VERIFICATION status
    const voter = await voterRepository.create({ nationalId, pollingStationId });

    // Create Persona inquiry for identity verification
    const { inquiryId, url } = await personaService.createInquiry(nationalId, voter.id);

    // Store the Persona inquiry ID on the voter
    await voterRepository.updatePersonaStatus(voter.id, inquiryId, 'created');

    // In mock mode, auto-complete verification so local dev gets PINs immediately
    if (personaService.isMockMode()) {
      const result = await this.completeVerification(inquiryId, 'completed');
      return result;
    }

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

    // If verification failed, update status and return
    if (personaStatus !== 'completed') {
      await voterRepository.update(voter.id, {
        status: 'VERIFICATION_FAILED',
        personaStatus,
      });
      return { voterId: voter.id, status: 'VERIFICATION_FAILED' };
    }

    // Verification passed — mint SBT, generate PINs
    const wallet = ethers.Wallet.createRandom();
    const { tokenId, txHash } = await blockchainService.mintSBT(wallet.address, voter.nationalId);

    await voterRepository.registerWithSbt(voter.id, wallet.address, tokenId);

    // Generate PINs
    const pin = generatePin();
    let distressPin = generatePin();
    while (distressPin === pin) {
      distressPin = generatePin();
    }

    const [pinHash, distressPinHash] = await Promise.all([
      argon2.hash(pin, { type: argon2.argon2id }),
      argon2.hash(distressPin, { type: argon2.argon2id }),
    ]);

    await voterRepository.setPins(voter.id, pinHash, distressPinHash);

    // Mark as registered with verification timestamp
    await voterRepository.update(voter.id, {
      status: 'REGISTERED',
      personaStatus: 'completed',
      personaVerifiedAt: new Date(),
    });

    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
      pin,
      distressPin,
    };
  }

  async getRegistrationStatus(inquiryId: string) {
    const voter = await voterRepository.findByInquiryId(inquiryId);
    if (!voter) {
      throw new ServiceError('No registration found for this inquiry', 404);
    }

    return {
      voterId: voter.id,
      status: voter.status,
      personaStatus: voter.personaStatus,
    };
  }

  async verifyPin(nationalId: string, pin: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (voter.status === 'PENDING_VERIFICATION') {
      throw new ServiceError('Voter identity verification is still pending', 403);
    }

    if (voter.status === 'VERIFICATION_FAILED') {
      throw new ServiceError('Voter identity verification failed', 403);
    }

    if (!voter.pinHash || !voter.distressPinHash) {
      throw new ServiceError('Voter PINs not set', 400);
    }

    // Check normal PIN
    const normalMatch = await argon2.verify(voter.pinHash, pin);
    if (normalMatch) {
      return { valid: true, isDistress: false };
    }

    // Check distress PIN
    const distressMatch = await argon2.verify(voter.distressPinHash, pin);
    if (distressMatch) {
      await voterRepository.flagDistress(voter.id);
      return { valid: true, isDistress: true };
    }

    return { valid: false, isDistress: false };
  }
}

export class ServiceError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const voterService = new VoterService();
