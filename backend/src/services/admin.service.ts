import { ethers } from 'ethers';
import { voterRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { authService } from './auth.service.js';
import { notificationService } from './notification.service.js';
import { ServiceError } from './voter.service.js';

export class AdminService {
  /**
   * Register a voter in-person (admin-assisted). Bypasses Persona KYC since the
   * officer has physically verified the voter's identity. Returns a setupToken so
   * the voter can set their own PIN on-screen — admin never sees either PIN.
   */
  async registerVoter(data: {
    nationalId: string;
    pollingStationId: string;
    preferredContact: 'SMS' | 'EMAIL';
    phoneNumber?: string;
    email?: string;
  }) {
    const existing = await voterRepository.findByNationalId(data.nationalId);
    if (existing) {
      throw new ServiceError('A voter with this National ID is already registered', 409);
    }

    const voter = await voterRepository.create({
      nationalId: data.nationalId,
      pollingStationId: data.pollingStationId,
      preferredContact: data.preferredContact,
      phoneNumber: data.preferredContact === 'SMS' ? data.phoneNumber : undefined,
      email: data.preferredContact === 'EMAIL' ? data.email : undefined,
    });

    // Mint SBT — in-person verification counts as approved identity check
    const wallet = ethers.Wallet.createRandom();
    const { tokenId, txHash } = await blockchainService.mintSBT(wallet.address, data.nationalId);
    await voterRepository.registerWithSbt(voter.id, wallet.address, tokenId);
    await voterRepository.update(voter.id, {
      status: 'REGISTERED',
      personaVerifiedAt: new Date(),
    });

    // Fingerprint will be enrolled next (WebAuthn on officer's device).
    // PIN setup link is sent only AFTER successful fingerprint enrollment,
    // via the separate sendSetupLink() method below.
    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
    };
  }

  /**
   * Generate a short-lived PIN-setup JWT and deliver the link to the voter's
   * registered contact (email or SMS). Called by the admin after fingerprint
   * enrollment is complete so the PIN link is only sent once biometrics are
   * confirmed.  The admin never sees the token — it travels only to the voter.
   */
  async sendSetupLink(voterId: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);
    const linkAllowedStatuses = ['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'];
    if (!linkAllowedStatuses.includes(voter.status)) {
      throw new ServiceError('Voter is not eligible for a PIN setup link', 400);
    }

    const setupToken = authService.generateToken({
      sub: voter.id,
      nationalId: voter.nationalId,
      status: 'REGISTERED',
      role: voter.role,
      isDistress: false,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const setupUrl = `${frontendUrl}/setup-pin?token=${setupToken}`;
    const channel: 'SMS' | 'EMAIL' = voter.preferredContact ?? (voter.phoneNumber ? 'SMS' : 'EMAIL');
    const recipient = channel === 'SMS' ? voter.phoneNumber! : voter.email!;

    await notificationService.sendPinSetupLink({
      channel,
      recipient,
      nationalId: voter.nationalId,
      setupUrl,
    });

    return { contact: recipient, channel };
  }

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

    // Mark review complete and set status to REGISTERED
    await voterRepository.approveManualReview(voter.id, reviewerId, notes);
    await voterRepository.update(voter.id, {
      status: 'REGISTERED',
      personaVerifiedAt: new Date(),
    });

    // Voter must now enroll a WebAuthn credential via POST /api/webauthn/register/options
    return {
      voterId: voter.id,
      nationalId: voter.nationalId,
      walletAddress: wallet.address,
      sbtTokenId: tokenId,
      txHash,
      reviewedBy: reviewerId,
      nextStep: 'enroll_fingerprint',
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
      distressFlagged: stats.byStatus.distressFlagged,
    };
  }

  async getDistressVotes(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const { prisma } = await import('../database/client.js');
    const [data, total] = await Promise.all([
      prisma.vote.findMany({
        where: { isDistressFlagged: true },
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          serialNumber: true,
          isDistressFlagged: true,
          status: true,
          timestamp: true,
          pollingStation: { select: { name: true, code: true } },
        },
      }),
      prisma.vote.count({ where: { isDistressFlagged: true } }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getOfficials(page = 1, limit = 20) {
    return voterRepository.findAdmins(page, limit);
  }

  async addOfficial(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) {
      throw new ServiceError('Voter not found. They must be a registered voter first.', 404);
    }
    if (voter.role === 'ADMIN') {
      throw new ServiceError('This voter is already an IEBC official', 409);
    }
    if (voter.status !== 'REGISTERED') {
      throw new ServiceError('Only fully registered voters can be granted official access', 400);
    }
    const updated = await voterRepository.update(voter.id, { role: 'ADMIN' });
    return {
      voterId: updated.id,
      nationalId: updated.nationalId,
      role: updated.role,
    };
  }

  async removeOfficial(voterId: string, requesterId: string) {
    if (voterId === requesterId) {
      throw new ServiceError('You cannot remove your own admin access', 400);
    }
    const voter = await voterRepository.findById(voterId);
    if (!voter) {
      throw new ServiceError('Official not found', 404);
    }
    if (voter.role !== 'ADMIN') {
      throw new ServiceError('This voter is not an IEBC official', 400);
    }
    const updated = await voterRepository.update(voter.id, { role: 'VOTER' });
    return {
      voterId: updated.id,
      nationalId: updated.nationalId,
      role: updated.role,
    };
  }
}

export const adminService = new AdminService();
