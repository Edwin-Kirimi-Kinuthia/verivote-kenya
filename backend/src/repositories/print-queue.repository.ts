/**
 * ============================================================================
 * VeriVote Kenya - Print Queue Repository
 * ============================================================================
 * 
 * Manages the centralized ballot printing queue.
 * 
 * The system prints paper ballots AFTER the election as an audit trail.
 * This allows:
 * - Manual recounts if needed
 * - Verification by election observers
 * - Paper backup of the digital record
 * 
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import { PrintStatus } from '@prisma/client';
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
    });
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
          { priority: 'desc' },   // High priority first
          { createdAt: 'asc' },   // Then oldest first (FIFO)
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

    return this.buildPaginatedResponse(data, total, page, limit);
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

  /**
   * Get the next print job for a printer
   * 
   * 1. Finds highest priority pending job
   * 2. Marks it as PRINTING
   * 3. Assigns the printer ID
   * 
   * Called by printer service when ready for next job.
   */
  async getNextJob(printerId: string): Promise<PrintQueueWithDetails | null> {
    const job = await prisma.printQueue.findFirst({
      where: { status: PrintStatus.PENDING },
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
          status: PrintStatus.PRINTING,
          printerId,
          printAttempts: { increment: 1 },
        },
      });
    }

    return job;
  }

  /**
   * Mark job as successfully printed
   */
  async markPrinted(id: string, ballotNumber: string, qrCodeData: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: {
        status: PrintStatus.PRINTED,
        printedAt: new Date(),
        ballotNumber,
        qrCodeData,
      },
    });
  }

  /**
   * Mark job as failed
   * 
   * If under max attempts, resets to PENDING for retry.
   * If at max attempts, stays FAILED.
   */
  async markFailed(id: string, error: string): Promise<PrintQueue> {
    const job = await prisma.printQueue.findUnique({ where: { id } });
    const maxAttempts = 3;
    
    const newStatus = (job?.printAttempts || 0) >= maxAttempts
      ? PrintStatus.FAILED
      : PrintStatus.PENDING;

    return prisma.printQueue.update({
      where: { id },
      data: {
        status: newStatus,
        lastError: error,
        printerId: newStatus === PrintStatus.PENDING ? null : undefined,
      },
    });
  }

  async cancel(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: { status: PrintStatus.CANCELLED },
    });
  }

  async retry(id: string): Promise<PrintQueue> {
    return prisma.printQueue.update({
      where: { id },
      data: {
        status: PrintStatus.PENDING,
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
      where: { status: PrintStatus.PENDING },
    });
  }

  /**
   * Reset jobs stuck in PRINTING state
   * 
   * Called periodically to handle crashed printers.
   * Jobs in PRINTING for too long are reset to PENDING.
   */
  async resetStuckJobs(stuckThresholdMinutes = 5): Promise<number> {
    const threshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000);

    const result = await prisma.printQueue.updateMany({
      where: {
        status: PrintStatus.PRINTING,
        updatedAt: { lt: threshold },
      },
      data: {
        status: PrintStatus.PENDING,
        printerId: null,
      },
    });

    return result.count;
  }

  /**
   * Bulk add votes to print queue
   * 
   * Used after election ends to queue all votes for printing.
   */
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
      skipDuplicates: true,  // Don't fail if vote already queued
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
      switch (item.status) {
        case PrintStatus.PENDING:
          byStatus.pending = item._count;
          break;
        case PrintStatus.PRINTING:
          byStatus.printing = item._count;
          break;
        case PrintStatus.PRINTED:
          byStatus.printed = item._count;
          break;
        case PrintStatus.FAILED:
          byStatus.failed = item._count;
          break;
        case PrintStatus.CANCELLED:
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
