/**
 * ============================================================================
 * VeriVote Kenya - Vote Repository
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import type { Prisma } from '@prisma/client';
import type {
  Vote,
  CreateVoteInput,
  UpdateVoteInput,
  VoteQueryParams,
  VoteStats,
  VoteWithStation,
  VoteWithPrintStatus,
  PaginatedResponse,
  VoteStatus,
} from '../types/database.types.js';

export class VoteRepository extends BaseRepository<Vote, CreateVoteInput, UpdateVoteInput> {
  
  // ==========================================================================
  // BASIC CRUD
  // ==========================================================================

  async findById(id: string): Promise<Vote | null> {
    return prisma.vote.findUnique({
      where: { id },
    });
  }

  async findByIdWithDetails(id: string): Promise<VoteWithPrintStatus | null> {
    return prisma.vote.findUnique({
      where: { id },
      include: {
        pollingStation: true,
        printQueue: true,
      },
    }) as Promise<VoteWithPrintStatus | null>;
  }

  async findBySerialNumber(serialNumber: string): Promise<Vote | null> {
    return prisma.vote.findUnique({
      where: { serialNumber },
    });
  }

  async findByTxHash(blockchainTxHash: string): Promise<Vote | null> {
    return prisma.vote.findFirst({
      where: { blockchainTxHash },
    });
  }

  async findMany(params: VoteQueryParams = {}): Promise<PaginatedResponse<Vote>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: Prisma.VoteWhereInput = {};
    
    if (params.status) {
      where.status = params.status;
    }
    
    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }
    
    if (params.fromDate || params.toDate) {
      where.timestamp = {};
      if (params.fromDate) (where.timestamp as Prisma.DateTimeFilter).gte = params.fromDate;
      if (params.toDate) (where.timestamp as Prisma.DateTimeFilter).lte = params.toDate;
    }
    
    if (params.confirmedOnly) {
      where.status = 'CONFIRMED';
    }

    const [data, total] = await Promise.all([
      prisma.vote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.vote.count({ where }),
    ]);

    return this.buildPaginatedResponse(data, total, page, limit);
  }

  async findByPollingStation(
    pollingStationId: string,
    params: VoteQueryParams = {}
  ): Promise<PaginatedResponse<VoteWithStation>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: Prisma.VoteWhereInput = { pollingStationId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      prisma.vote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { pollingStation: true },
      }),
      prisma.vote.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as VoteWithStation[], total, page, limit);
  }

  async create(data: CreateVoteInput): Promise<Vote> {
    return prisma.vote.create({
      data: {
        encryptedVoteHash: data.encryptedVoteHash,
        encryptedVoteData: data.encryptedVoteData,
        serialNumber: data.serialNumber,
        zkpProof: data.zkpProof,
        pollingStationId: data.pollingStationId,
        previousVoteId: data.previousVoteId,
      },
    });
  }

  async update(id: string, data: UpdateVoteInput): Promise<Vote> {
    return prisma.vote.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Vote> {
    return prisma.vote.delete({
      where: { id },
    });
  }

  async count(): Promise<number> {
    return prisma.vote.count();
  }

  // ==========================================================================
  // BLOCKCHAIN OPERATIONS
  // ==========================================================================

  async confirmOnBlockchain(
    id: string,
    txHash: string,
    blockNumber: bigint
  ): Promise<Vote> {
    return prisma.vote.update({
      where: { id },
      data: {
        blockchainTxHash: txHash,
        blockNumber,
        confirmedAt: new Date(),
        status: 'CONFIRMED',
      },
    });
  }

  async getPendingVotes(limit = 100): Promise<Vote[]> {
    return prisma.vote.findMany({
      where: { status: 'PENDING' },
      take: limit,
      orderBy: { timestamp: 'asc' },
    });
  }

  // ==========================================================================
  // REVOTE OPERATIONS
  // ==========================================================================

  async markSuperseded(id: string): Promise<Vote> {
    return prisma.vote.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });
  }

  async castRevote(
    previousVoteId: string,
    newVoteData: Omit<CreateVoteInput, 'previousVoteId'>
  ): Promise<{ newVote: Vote; previousVote: Vote }> {
    return prisma.$transaction(async (tx) => {
      const previousVote = await tx.vote.update({
        where: { id: previousVoteId },
        data: { status: 'SUPERSEDED' },
      });

      const newVote = await tx.vote.create({
        data: {
          ...newVoteData,
          previousVoteId,
        },
      });

      return { newVote, previousVote };
    });
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  async verifyBySerialNumber(serialNumber: string): Promise<{
    exists: boolean;
    status?: VoteStatus;
    confirmedAt?: Date | null;
    blockchainTxHash?: string | null;
  }> {
    const vote = await prisma.vote.findUnique({
      where: { serialNumber },
      select: {
        status: true,
        confirmedAt: true,
        blockchainTxHash: true,
      },
    });

    if (!vote) {
      return { exists: false };
    }

    return {
      exists: true,
      status: vote.status as VoteStatus,
      confirmedAt: vote.confirmedAt,
      blockchainTxHash: vote.blockchainTxHash,
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getStats(): Promise<VoteStats> {
    const [total, statusCounts] = await Promise.all([
      prisma.vote.count(),
      prisma.vote.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    const byStatus = {
      pending: 0,
      confirmed: 0,
      superseded: 0,
      invalidated: 0,
    };

    for (const item of statusCounts) {
      const statusItem = item as { status: string; _count: number };
      switch (statusItem.status) {
        case 'PENDING':
          byStatus.pending = statusItem._count;
          break;
        case 'CONFIRMED':
          byStatus.confirmed = statusItem._count;
          break;
        case 'SUPERSEDED':
          byStatus.superseded = statusItem._count;
          break;
        case 'INVALIDATED':
          byStatus.invalidated = statusItem._count;
          break;
      }
    }

    return {
      total,
      byStatus,
      confirmedOnBlockchain: byStatus.confirmed,
    };
  }

  async getVotesPerHour(
    fromDate: Date,
    toDate: Date,
    pollingStationId?: string
  ): Promise<{ hour: Date; count: number }[]> {
    const where: Prisma.VoteWhereInput = {
      timestamp: { gte: fromDate, lte: toDate },
    };

    if (pollingStationId) {
      where.pollingStationId = pollingStationId;
    }

    const votes = await prisma.vote.findMany({
      where,
      select: { timestamp: true },
    });

    const hourMap = new Map<string, number>();
    for (const vote of votes) {
      const hourKey = new Date(vote.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
      hourMap.set(hourKey, (hourMap.get(hourKey) || 0) + 1);
    }

    return Array.from(hourMap.entries())
      .map(([hour, count]) => ({ hour: new Date(hour), count }))
      .sort((a, b) => a.hour.getTime() - b.hour.getTime());
  }
}

export const voteRepository = new VoteRepository();
