/**
 * ============================================================================
 * VeriVote Kenya - Voter Repository
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import type { Prisma } from '@prisma/client';
import type {
  Voter,
  CreateVoterInput,
  UpdateVoterInput,
  VoterQueryParams,
  VoterStats,
  VoterWithStation,
  PaginatedResponse,
  VoterStatus,
} from '../types/database.types.js';

export class VoterRepository extends BaseRepository<Voter, CreateVoterInput, UpdateVoterInput> {
  
  // ==========================================================================
  // BASIC CRUD OPERATIONS
  // ==========================================================================

  async findById(id: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { id },
    });
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
    });
  }

  async findBySbtAddress(sbtAddress: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { sbtAddress },
    });
  }

  async findMany(params: VoterQueryParams = {}): Promise<PaginatedResponse<Voter>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: Prisma.VoterWhereInput = {};
    
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

    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.voter.count({ where }),
    ]);

    return this.buildPaginatedResponse(data, total, page, limit);
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
    });
  }

  async update(id: string, data: UpdateVoterInput): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Voter> {
    return prisma.voter.delete({
      where: { id },
    });
  }

  async count(): Promise<number> {
    return prisma.voter.count();
  }

  // ==========================================================================
  // SPECIALIZED OPERATIONS
  // ==========================================================================

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
    });
  }

  async setPins(id: string, pinHash: string, distressPinHash: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        pinHash,
        distressPinHash,
      },
    });
  }

  async recordVote(id: string, isRevote = false): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: isRevote ? 'REVOTED' : 'VOTED',
        voteCount: { increment: 1 },
        lastVotedAt: new Date(),
      },
    });
  }

  async flagDistress(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'DISTRESS_FLAGGED',
      },
    });
  }

  async suspend(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
      },
    });
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

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

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
      registered: 0,
      voted: 0,
      revoted: 0,
      distressFlagged: 0,
      suspended: 0,
    };

    for (const item of statusCounts) {
      const statusItem = item as { status: string; _count: number };
      switch (statusItem.status) {
        case 'REGISTERED':
          byStatus.registered = statusItem._count;
          break;
        case 'VOTED':
          byStatus.voted = statusItem._count;
          break;
        case 'REVOTED':
          byStatus.revoted = statusItem._count;
          break;
        case 'DISTRESS_FLAGGED':
          byStatus.distressFlagged = statusItem._count;
          break;
        case 'SUSPENDED':
          byStatus.suspended = statusItem._count;
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
}

export const voterRepository = new VoterRepository();
