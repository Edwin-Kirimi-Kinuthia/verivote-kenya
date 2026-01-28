/**
 * VeriVote Kenya - Print Queue Repository
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
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
  
  async findById(id: string): Promise<PrintQueue | null> {
    return prisma.printQueue.findUnique({
      where: { id },
    }) as Promise<PrintQueue | null>;
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
    }) as Promise<PrintQueue | null>;
  }

  async findByBallotNumber(ballotNumber: string): Promise<PrintQueue | null> {
    return prisma.printQueue.findUnique({
      where: { ballotNumber },
    }) as Promise<PrintQueue | null>;
  }

  async findMany(params: PrintQueueQueryParams = {}): Promise<PaginatedResponse<PrintQueue>> {
    const { page, limit, skip } = this.getPagination(params);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
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

    return this.buildPaginatedResponse(data as PrintQueue[], total, page, limit);
  }

  async findByPollingStation(
    pollingStationId: string,
    params: PrintQueueQueryParams = {}
  ): Promise<PaginatedResponse<PrintQueueWithDetails>> {
    const { page, limit, skip } = this.getPagination(params);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { pollingStationId };
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
    }) as Promise<PrintQueue>;
  }

  async update(id: string, data: UpdatePrintQueueInput): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data,
    }) as Promise<PrintQueue>;
  }

  async delete(id: string): Promise<PrintQueue> {
    return prisma.printQueue.delete({
      where: { id },
    }) as Promise<PrintQueue>;
  }

  async count(): Promise<number> {
    return prisma.printQueue.count();
  }

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
    }) as Promise<PrintQueue>;
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
    }) as Promise<PrintQueue>;
  }

  async cancel(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: { status: 'CANCELLED' },
    }) as Promise<PrintQueue>;
  }

  async retry(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: {
        status: 'PENDING',
        lastError: null,
        printerId: null,
      },
    }) as Promise<PrintQueue>;
  }

  async setPriority(id: string, priority: number): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: { priority },
    }) as Promise<PrintQueue>;
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
      switch (item.status) {
        case 'PENDING':
          byStatus.pending = item._count;
          break;
        case 'PRINTING':
          byStatus.printing = item._count;
          break;
        case 'PRINTED':
          byStatus.printed = item._count;
          break;
        case 'FAILED':
          byStatus.failed = item._count;
          break;
        case 'CANCELLED':
          byStatus.cancelled = item._count;
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
