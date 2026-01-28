/**
 * ============================================================================
 * VeriVote Kenya - Print Queue Repository
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import type { Prisma } from '@prisma/client';
import type {
  PrintQueue,
  CreatePrintQueueInput,
  UpdatePrintQueueInput,
  PrintQueueQueryParams,
  PrintQueueStats,
  PrintQueueWithDetails,
  PaginatedResponse,
} from '../types/database.types.js';

export class PrintQueueRepository extends BaseRepository<
  PrintQueue,
  CreatePrintQueueInput,
  UpdatePrintQueueInput
> {
  
  // ==========================================================================
  // BASIC CRUD
  // ==========================================================================

  async findById(id: string): Promise<PrintQueue | null> {
    return prisma.printQueue.findUnique({
      where: { id },
    });
  }

  async findByIdWithDetails(id: string): Promise<PrintQueueWithDetails | null> {
    return prisma.printQueue.findUnique({
      where: { id },
      include: {
        vote: true,
        pollingStation: true,
      },
    }) as Promise<PrintQueueWithDetails | null>;
  }

  async findByVoteId(voteId: string): Promise<PrintQueue | null> {
    return prisma.printQueue.findUnique({
      where: { voteId },
    });
  }

  async findByBallotNumber(ballotNumber: string): Promise<PrintQueue | null> {
    return prisma.printQueue.findUnique({
      where: { ballotNumber },
    });
  }

  async findMany(params: PrintQueueQueryParams = {}): Promise<PaginatedResponse<PrintQueue>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: Prisma.PrintQueueWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.pollingStationId) where.pollingStationId = params.pollingStationId;
    if (params.printerId) where.printerId = params.printerId;

    const [data, total] = await Promise.all([
      prisma.printQueue.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
      }),
      prisma.printQueue.count({ where }),
    ]);

    return this.buildPaginatedResponse(data, total, page, limit);
  }

  async findByPollingStation(
    pollingStationId: string,
    params: PrintQueueQueryParams = {}
  ): Promise<PaginatedResponse<PrintQueueWithDetails>> {
    const { page, limit, skip } = this.getPagination(params);
    
    const where: Prisma.PrintQueueWhereInput = { pollingStationId };
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      prisma.printQueue.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { vote: true, pollingStation: true },
      }),
      prisma.printQueue.count({ where }),
    ]);

    return this.buildPaginatedResponse(data as PrintQueueWithDetails[], total, page, limit);
  }

  async create(data: CreatePrintQueueInput): Promise<PrintQueue> {
    return prisma.printQueue.create({
      data: {
        voteId: data.voteId,
        pollingStationId: data.pollingStationId,
        priority: data.priority || 0,
      },
    });
  }

  async update(id: string, data: UpdatePrintQueueInput): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<PrintQueue> {
    return prisma.printQueue.delete({
      where: { id },
    });
  }

  async count(): Promise<number> {
    return prisma.printQueue.count();
  }

  // ==========================================================================
  // PRINT JOB OPERATIONS
  // ==========================================================================

  async getNextJob(printerId: string): Promise<PrintQueueWithDetails | null> {
    const job = await prisma.printQueue.findFirst({
      where: { status: 'PENDING' },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        vote: true,
        pollingStation: true,
      },
    });

    if (job) {
      await prisma.printQueue.update({
        where: { id: job.id },
        data: {
          status: 'PRINTING',
          printerId,
          printAttempts: { increment: 1 },
        },
      });
    }

    return job as PrintQueueWithDetails | null;
  }

  async markPrinted(id: string, ballotNumber: string, qrCodeData: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: {
        status: 'PRINTED',
        printedAt: new Date(),
        ballotNumber,
        qrCodeData,
      },
    });
  }

  async markFailed(id: string, error: string): Promise<PrintQueue> {
    const job = await prisma.printQueue.findUnique({ where: { id } });
    const maxAttempts = 3;
    
    const newStatus = (job?.printAttempts || 0) >= maxAttempts
      ? 'FAILED'
      : 'PENDING';

    return prisma.printQueue.update({
      where: { id },
      data: {
        status: newStatus,
        lastError: error,
        printerId: newStatus === 'PENDING' ? null : undefined,
      },
    });
  }

  async cancel(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async retry(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: {
        status: 'PENDING',
        lastError: null,
        printerId: null,
      },
    });
  }

  async setPriority(id: string, priority: number): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: { priority },
    });
  }

  async getPendingCount(): Promise<number> {
    return prisma.printQueue.count({
      where: { status: 'PENDING' },
    });
  }

  async resetStuckJobs(stuckThresholdMinutes = 5): Promise<number> {
    const threshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);

    const result = await prisma.printQueue.updateMany({
      where: {
        status: 'PRINTING',
        updatedAt: { lt: threshold },
      },
      data: {
        status: 'PENDING',
        printerId: null,
      },
    });

    return result.count;
  }

  async bulkCreate(
    voteIds: string[],
    pollingStationId: string,
    priority = 0
  ): Promise<number> {
    const data = voteIds.map((voteId) => ({
      voteId,
      pollingStationId,
      priority,
    }));

    const result = await prisma.printQueue.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getStats(): Promise<PrintQueueStats> {
    const [total, statusCounts] = await Promise.all([
      prisma.printQueue.count(),
      prisma.printQueue.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    const byStatus = {
      pending: 0,
      printing: 0,
      printed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const item of statusCounts) {
      const statusItem = item as { status: string; _count: number };
      switch (statusItem.status) {
        case 'PENDING':
          byStatus.pending = statusItem._count;
          break;
        case 'PRINTING':
          byStatus.printing = statusItem._count;
          break;
        case 'PRINTED':
          byStatus.printed = statusItem._count;
          break;
        case 'FAILED':
          byStatus.failed = statusItem._count;
          break;
        case 'CANCELLED':
          byStatus.cancelled = statusItem._count;
          break;
      }
    }

    const totalAttempted = byStatus.printed + byStatus.failed;
    const failureRate = totalAttempted > 0
      ? Math.round((byStatus.failed / totalAttempted) * 10000) / 100
      : 0;

    return {
      total,
      byStatus,
      failureRate,
    };
  }
}

export const printQueueRepository = new PrintQueueRepository();
