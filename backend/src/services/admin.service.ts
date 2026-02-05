import { randomInt } from 'crypto';
import argon2 from 'argon2';
import { ethers } from 'ethers';
import { voterRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { ServiceError } from './voter.service.js';

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export class AdminService {
  async getPendingReviews(page = 1, limit = 20) {
    return voterRepository.findPendingManualReview({ page, limit });
  }

  async getReviewDetails(voterId: string) {
    const voter = await voterRepository.findByIdWithStation(voterId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      status: voter.status,
      pollingStation: voter.pollingStation,
      verificationFailureReason: voter.verificationFailureReason,
      manualReviewRequestedAt: voter.manualReviewRequestedAt,
      createdAt: voter.createdAt,
      sbtAddress: voter.sbtAddress,
      sbtTokenId: voter.sbtTokenId,
      sbtMintedAt: voter.sbtMintedAt,
    };
  }

  async approveVoter(voterId: string, reviewerId: string, notes?: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (voter.status !== 'PENDING_MANUAL_REVIEW') {
      throw new ServiceError('Voter is not pending manual review', 409);
    }

    // Generate wallet and mint SBT
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

    // Mark review complete and set status to REGISTERED
    await voterRepository.approveManualReview(voter.id, reviewerId, notes);
    await voterRepository.update(voter.id, {
      status: 'REGISTERED',
      personaVerifiedAt: new Date(), // Use this field for manual verification time too
    });

    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
      pin,
      distressPin,
      reviewedBy: reviewerId,
    };
  }

  async rejectVoter(voterId: string, reviewerId: string, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new ServiceError('Rejection reason is required', 400);
    }

    const voter = await voterRepository.findById(voterId);
    if (!voter) {
      throw new ServiceError('Voter not found', 404);
    }

    if (voter.status !== 'PENDING_MANUAL_REVIEW') {
      throw new ServiceError('Voter is not pending manual review', 409);
    }

    await voterRepository.rejectManualReview(voter.id, reviewerId, reason);

    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      status: 'VERIFICATION_FAILED',
      rejectionReason: reason,
      reviewedBy: reviewerId,
    };
  }

  async getReviewStats() {
    const stats = await voterRepository.getStats();
    return {
      pendingReviews: stats.byStatus.pendingManualReview,
      totalRegistered: stats.byStatus.registered,
      totalFailed: stats.byStatus.verificationFailed,
      totalVoters: stats.total,
    };
  }
}

export const adminService = new AdminService();
