/**
 * ============================================================================
 * VeriVote Kenya - Vote Repository
 * ============================================================================
 * 
 * Handles all database operations for votes.
 * 
 * KEY PRIVACY PRINCIPLE:
 * Votes are NEVER linked to voters in the database. We link to polling
 * stations (for logistics) but not to individual voters (for anonymity).
 * 
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import { VoteStatus } from '@prisma/client';
import type {
  Vote,
  CreateVoteInput,
  UpdateVoteInput,
  VoteQueryParams,
  VoteStats,
  VoteWithStation,
  VoteWithPrintStatus,
  PaginatedResponse,
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
    });
  }

  /**
   * Find vote by serial number (for voter verification)
   * 
   * This is how voters verify their vote was recorded:
   * They enter their serial number and see the vote status.
   */
  async findBySerialNumber(serialNumber: string): Promise<Vote | null> {
    return prisma.vote.findUnique({
      where: { serialNumber },
    });
  }

  /**
   * Find vote by blockchain transaction hash
   */
  async findByTxHash(blockchainTxHash: string): Promise<Vote | null> {
    return prisma.vote.findFirst({
      where: { blockchainTxHash },
    });
  }

  async findMany(params: VoteQueryParams = {}): Promise<PaginatedResponse<Vote>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: any = {};
    
    if (params.status) {
      where.status = params.status;
    }
    
    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }
    
    // Date range filter
    if (params.fromDate || params.toDate) {
      where.timestamp = {};
      if (params.fromDate) where.timestamp.gte = params.fromDate;
      if (params.toDate) where.timestamp.lte = params.toDate;
    }
    
    if (params.confirmedOnly) {
      where.status = VoteStatus.CONFIRMED;
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
    
    const where: any = { pollingStationId };
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

    return this.buildPaginatedResponse(data, total, page, limit);
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

  /**
   * Confirm vote was recorded on blockchain
   * 
   * Call this after the blockchain transaction is confirmed.
   */
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
        status: VoteStatus.CONFIRMED,
      },
    });
  }

  /**
   * Get votes pending blockchain submission
   */
  async getPendingVotes(limit = 100): Promise<Vote[]> {
    return prisma.vote.findMany({
      where: { status: VoteStatus.PENDING },
      take: limit,
      orderBy: { timestamp: 'asc' },  // Oldest first (FIFO)
    });
  }

  // ==========================================================================
  // REVOTE OPERATIONS
  // ==========================================================================

  /**
   * Mark a vote as superseded (replaced by revote)
   */
  async markSuperseded(id: string): Promise<Vote> {
    return prisma.vote.update({
      where: { id },
      data: { status: VoteStatus.SUPERSEDED },
    });
  }

  /**
   * Cast a revote (new vote replaces old)
   * 
   * This uses a transaction to ensure both operations succeed or fail together.
   */
  async castRevote(
    previousVoteId: string,
    newVoteData: Omit<CreateVoteInput, 'previousVoteId'>
  ): Promise<{ newVote: Vote; previousVote: Vote }> {
    return prisma.$transaction(async (tx) => {
      // Mark previous vote as superseded
      const previousVote = await tx.vote.update({
        where: { id: previousVoteId },
        data: { status: VoteStatus.SUPERSEDED },
      });

      // Create new vote linking to previous
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

  /**
   * Verify a vote by serial number (public API)
   * 
   * Returns minimal info for voter verification:
   * - Does the vote exist?
   * - What's its status?
   * - When was it confirmed?
   * 
   * Does NOT return the actual vote content (it's encrypted anyway).
   */
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
      status: vote.status,
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
      switch (item.status) {
        case VoteStatus.PENDING:
          byStatus.pending = item._count;
          break;
        case VoteStatus.CONFIRMED:
          byStatus.confirmed = item._count;
          break;
        case VoteStatus.SUPERSEDED:
          byStatus.superseded = item._count;
          break;
        case VoteStatus.INVALIDATED:
          byStatus.invalidated = item._count;
          break;
      }
    }

    return {
      total,
      byStatus,
      confirmedOnBlockchain: byStatus.confirmed,
    };
  }

  /**
   * Get voting activity over time
   * 
   * Useful for:
   * - Detecting unusual patterns (AI fraud detection)
   * - Dashboard charts
   * - Capacity planning
   */
  async getVotesPerHour(
    fromDate: Date,
    toDate: Date,
    pollingStationId?: string
  ): Promise<{ hour: Date; count: number }[]> {
    const where: any = {
      timestamp: { gte: fromDate, lte: toDate },
    };

    if (pollingStationId) {
      where.pollingStationId = pollingStationId;
    }

    const votes = await prisma.vote.findMany({
      where,
      select: { timestamp: true },
    });

    // Group by hour
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
