/**
 * VeriVote Kenya - Voter Repository
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import type {
  Voter,
  CreateVoterInput,
  UpdateVoterInput,
  VoterQueryParams,
  VoterStats,
  VoterWithStation,
  PaginatedResponse,
} from '../types/database.types.js';

export class VoterRepository extends BaseRepository<Voter, CreateVoterInput, UpdateVoterInput> {
  
  async findById(id: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { id },
    }) as Promise<Voter | null>;
  }

  async findByIdWithStation(id: string): Promise<VoterWithStation | null> {
    return prisma.voter.findUnique({
      where: { id },
      include: { pollingStation: true },
    }) as Promise<VoterWithStation | null>;
  }

  async findByNationalId(nationalId: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { nationalId },
    }) as Promise<Voter | null>;
  }

  async findByInquiryId(inquiryId: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { personaInquiryId: inquiryId },
    }) as Promise<Voter | null>;
  }

  async updatePersonaStatus(id: string, inquiryId: string, status: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: { personaInquiryId: inquiryId, personaStatus: status },
    }) as Promise<Voter>;
  }

  async findBySbtAddress(sbtAddress: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { sbtAddress },
    }) as Promise<Voter | null>;
  }

  async findMany(params: VoterQueryParams = {}): Promise<PaginatedResponse<Voter>> {
    const { page, limit, skip } = this.getPagination(params);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    if (params.status) {
      where.status = params.status;
    }
    
    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }
    
    if (params.hasSbt !== undefined) {
      where.sbtAddress = params.hasSbt ? { not: null } : null;
    }
    
    if (params.hasVoted !== undefined) {
      if (params.hasVoted) {
        where.status = { in: ['VOTED', 'REVOTED'] };
      } else {
        where.status = 'REGISTERED';
      }
    }

    if (params.nationalId) {
      where.nationalId = { startsWith: params.nationalId };
    }

    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.voter.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as Voter[], total, page, limit);
  }

  async findByPollingStation(
    pollingStationId: string,
    params: VoterQueryParams = {}
  ): Promise<PaginatedResponse<Voter>> {
    return this.findMany({ ...params, pollingStationId });
  }

  async create(data: CreateVoterInput): Promise<Voter> {
    return prisma.voter.create({
      data: {
        nationalId: data.nationalId,
        pollingStationId: data.pollingStationId,
      },
    }) as Promise<Voter>;
  }

  async update(id: string, data: UpdateVoterInput): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data,
    }) as Promise<Voter>;
  }

  async delete(id: string): Promise<Voter> {
    return prisma.voter.delete({
      where: { id },
    }) as Promise<Voter>;
  }

  async count(): Promise<number> {
    return prisma.voter.count();
  }

  async registerWithSbt(
    id: string,
    sbtAddress: string,
    sbtTokenId: string
  ): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        sbtAddress,
        sbtTokenId,
        sbtMintedAt: new Date(),
      },
    }) as Promise<Voter>;
  }

  async setPins(id: string, pinHash: string, distressPinHash: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        pinHash,
        distressPinHash,
      },
    }) as Promise<Voter>;
  }

  async recordVote(id: string, isRevote = false): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: isRevote ? 'REVOTED' : 'VOTED',
        voteCount: { increment: 1 },
        lastVotedAt: new Date(),
      },
    }) as Promise<Voter>;
  }

  async flagDistress(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'DISTRESS_FLAGGED',
      },
    }) as Promise<Voter>;
  }

  async suspend(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
      },
    }) as Promise<Voter>;
  }

  async findAdmins(page = 1, limit = 20): Promise<PaginatedResponse<Voter>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where: { role: 'ADMIN' },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.voter.count({ where: { role: 'ADMIN' } }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: data as Voter[],
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async nationalIdExists(nationalId: string): Promise<boolean> {
    const count = await prisma.voter.count({
      where: { nationalId },
    });
    return count > 0;
  }

  async hasVoted(id: string): Promise<boolean> {
    const voter = await prisma.voter.findUnique({
      where: { id },
      select: { status: true },
    });
    return voter?.status === 'VOTED' || voter?.status === 'REVOTED';
  }

  async getStats(): Promise<VoterStats> {
    const [total, statusCounts, withSbt] = await Promise.all([
      prisma.voter.count(),
      prisma.voter.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.voter.count({
        where: { sbtAddress: { not: null } },
      }),
    ]);

    const byStatus = {
      pendingVerification: 0,
      pendingManualReview: 0,
      registered: 0,
      verificationFailed: 0,
      voted: 0,
      revoted: 0,
      distressFlagged: 0,
      suspended: 0,
    };

    for (const item of statusCounts) {
      switch (item.status) {
        case 'PENDING_VERIFICATION':
          byStatus.pendingVerification = item._count;
          break;
        case 'PENDING_MANUAL_REVIEW':
          byStatus.pendingManualReview = item._count;
          break;
        case 'REGISTERED':
          byStatus.registered = item._count;
          break;
        case 'VERIFICATION_FAILED':
          byStatus.verificationFailed = item._count;
          break;
        case 'VOTED':
          byStatus.voted = item._count;
          break;
        case 'REVOTED':
          byStatus.revoted = item._count;
          break;
        case 'DISTRESS_FLAGGED':
          byStatus.distressFlagged = item._count;
          break;
        case 'SUSPENDED':
          byStatus.suspended = item._count;
          break;
      }
    }

    const votedCount = byStatus.voted + byStatus.revoted;
    const turnoutPercentage = total > 0 ? (votedCount / total) * 100 : 0;

    return {
      total,
      byStatus,
      withSbt,
      turnoutPercentage: Math.round(turnoutPercentage * 100) / 100,
    };
  }

  async findPendingManualReview(params: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<Voter>> {
    const { page, limit, skip } = this.getPagination(params);

    const where = { status: 'PENDING_MANUAL_REVIEW' as const };

    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { manualReviewRequestedAt: 'asc' },
      }),
      prisma.voter.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as Voter[], total, page, limit);
  }

  async requestManualReview(id: string, failureReason: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'PENDING_MANUAL_REVIEW',
        verificationFailureReason: failureReason,
        manualReviewRequestedAt: new Date(),
      },
    }) as Promise<Voter>;
  }

  async approveManualReview(id: string, reviewerId: string, notes?: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        manualReviewedAt: new Date(),
        manualReviewedBy: reviewerId,
        manualReviewNotes: notes,
      },
    }) as Promise<Voter>;
  }

  async rejectManualReview(id: string, reviewerId: string, notes: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'VERIFICATION_FAILED',
        manualReviewedAt: new Date(),
        manualReviewedBy: reviewerId,
        manualReviewNotes: notes,
      },
    }) as Promise<Voter>;
  }
}

export const voterRepository = new VoterRepository();
