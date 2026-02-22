/**
 * VeriVote Kenya - Print Queue Service
 *
 * Business logic for the centralized vote printing system.
 * Generates secure ballot formats with vote hash, serial number, and timestamps.
 * Manages batch printing, status tracking, and reconciliation.
 */

import { createHash, randomBytes } from 'crypto';
import { printQueueRepository, voteRepository } from '../repositories/index.js';
import { ServiceError } from './voter.service.js';
import type {
  PrintQueue,
  PrintQueueWithDetails,
  PaginatedResponse,
  PrintQueueStats,
} from '../types/database.types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AddToPrintQueueInput {
  voteId: string;
  pollingStationId: string;
  priority?: number;
}

export interface BatchAddInput {
  voteIds: string[];
  pollingStationId: string;
  priority?: number;
}

export interface ProcessPrintJobResult {
  jobId: string;
  ballotNumber: string;
  qrCodeData: string;
  printFormat: SecurePrintFormat;
}

export interface SecurePrintFormat {
  ballotNumber: string;
  serialNumber: string;
  voteHash: string;
  pollingStation: string;
  timestamp: string;
  verificationCode: string;
  isDistress: boolean;
}

export interface PrintReconciliationReport {
  totalJobs: number;
  printed: number;
  pending: number;
  failed: number;
  cancelled: number;
  failureRate: number;
  stuckJobsReset: number;
  generatedAt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a unique ballot number: BAL-<station_prefix>-<random_hex>
 */
function generateBallotNumber(pollingStationCode: string): string {
  const prefix = pollingStationCode.slice(0, 4).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `BAL-${prefix}-${timestamp}-${random}`;
}

/**
 * Generate QR code data payload (JSON string to be encoded as QR by the printer).
 */
function generateQrCodeData(format: SecurePrintFormat): string {
  return JSON.stringify({
    b: format.ballotNumber,
    s: format.serialNumber,
    h: format.voteHash.slice(0, 16), // first 16 chars for compact QR
    t: format.timestamp,
    v: format.verificationCode,
  });
}

/**
 * Derive a short verification code from vote hash + ballot number.
 * Allows physical audit matching without revealing the full hash.
 */
function deriveVerificationCode(voteHash: string, ballotNumber: string): string {
  return createHash('sha256')
    .update(`${voteHash}:${ballotNumber}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PrintQueueService {

  // --------------------------------------------------------------------------
  // ADD TO QUEUE
  // --------------------------------------------------------------------------

  /**
   * Add a single vote to the print queue.
   * Idempotent — if the vote is already queued, returns the existing job.
   */
  async addToQueue(input: AddToPrintQueueInput): Promise<PrintQueue> {
    // Confirm vote exists
    const vote = await voteRepository.findById(input.voteId);
    if (!vote) {
      throw new ServiceError('Vote not found', 404);
    }

    // Check for duplicate (one print job per vote enforced by DB unique constraint)
    const existing = await printQueueRepository.findByVoteId(input.voteId);
    if (existing) {
      return existing;
    }

    return printQueueRepository.create({
      voteId: input.voteId,
      pollingStationId: input.pollingStationId,
      priority: input.priority ?? 0,
    });
  }

  // --------------------------------------------------------------------------
  // BATCH ADD
  // --------------------------------------------------------------------------

  /**
   * Bulk-add multiple votes to the print queue for a given polling station.
   * Skips duplicates automatically.
   */
  async batchAdd(input: BatchAddInput): Promise<{ added: number; skipped: number }> {
    if (!input.voteIds.length) {
      throw new ServiceError('At least one voteId is required', 400);
    }

    if (input.voteIds.length > 500) {
      throw new ServiceError('Batch size cannot exceed 500 votes', 400);
    }

    const totalRequested = input.voteIds.length;
    const added = await printQueueRepository.bulkCreate(
      input.voteIds,
      input.pollingStationId,
      input.priority ?? 0,
    );

    return {
      added,
      skipped: totalRequested - added,
    };
  }

  // --------------------------------------------------------------------------
  // PROCESS / PRINT
  // --------------------------------------------------------------------------

  /**
   * Claim and process the next pending print job for a given printer.
   * Returns the secure print format to be rendered by the printer driver.
   */
  async processNextJob(printerId: string): Promise<ProcessPrintJobResult | null> {
    const job = await printQueueRepository.getNextJob(printerId);
    if (!job) return null;

    try {
      const format = this.buildSecurePrintFormat(job);
      const ballotNumber = generateBallotNumber(job.pollingStation.code);
      const qrCodeData = generateQrCodeData(format);

      // Update format with the final ballot number
      format.ballotNumber = ballotNumber;
      format.verificationCode = deriveVerificationCode(format.voteHash, ballotNumber);

      await printQueueRepository.markPrinted(job.id, ballotNumber, qrCodeData);

      return {
        jobId: job.id,
        ballotNumber,
        qrCodeData,
        printFormat: format,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print processing error';
      await printQueueRepository.markFailed(job.id, message);
      throw new ServiceError(`Print job failed: ${message}`, 500);
    }
  }

  /**
   * Build the secure print format struct from a print job with its relations.
   */
  private buildSecurePrintFormat(job: PrintQueueWithDetails): SecurePrintFormat {
    const tempBallot = `TEMP-${randomBytes(4).toString('hex').toUpperCase()}`;
    const verificationCode = deriveVerificationCode(job.vote.encryptedVoteHash, tempBallot);

    return {
      ballotNumber: tempBallot,
      serialNumber: job.vote.serialNumber,
      voteHash: job.vote.encryptedVoteHash,
      pollingStation: `${job.pollingStation.name} (${job.pollingStation.code})`,
      timestamp: job.vote.timestamp.toISOString(),
      verificationCode,
      isDistress: job.vote.isDistressFlagged,
    };
  }

  // --------------------------------------------------------------------------
  // QUEUE MANAGEMENT
  // --------------------------------------------------------------------------

  async getQueue(params: {
    page?: number;
    limit?: number;
    status?: string;
    pollingStationId?: string;
  }): Promise<PaginatedResponse<PrintQueue>> {
    return printQueueRepository.findMany({
      page: params.page,
      limit: params.limit,
      status: params.status as never,
      pollingStationId: params.pollingStationId,
    });
  }

  async getJobById(id: string): Promise<PrintQueueWithDetails> {
    const job = await printQueueRepository.findByIdWithDetails(id);
    if (!job) throw new ServiceError('Print job not found', 404);
    return job;
  }

  async cancelJob(id: string): Promise<PrintQueue> {
    const job = await printQueueRepository.findById(id);
    if (!job) throw new ServiceError('Print job not found', 404);

    if (job.status === 'PRINTED') {
      throw new ServiceError('Cannot cancel a completed print job', 409);
    }
    if (job.status === 'CANCELLED') {
      throw new ServiceError('Print job is already cancelled', 409);
    }

    return printQueueRepository.cancel(id);
  }

  async retryJob(id: string): Promise<PrintQueue> {
    const job = await printQueueRepository.findById(id);
    if (!job) throw new ServiceError('Print job not found', 404);

    if (job.status !== 'FAILED') {
      throw new ServiceError('Only failed jobs can be retried', 409);
    }

    return printQueueRepository.retry(id);
  }

  async setPriority(id: string, priority: number): Promise<PrintQueue> {
    const job = await printQueueRepository.findById(id);
    if (!job) throw new ServiceError('Print job not found', 404);

    if (priority < 0 || priority > 100) {
      throw new ServiceError('Priority must be between 0 and 100', 400);
    }

    return printQueueRepository.setPriority(id, priority);
  }

  // --------------------------------------------------------------------------
  // STATS & RECONCILIATION
  // --------------------------------------------------------------------------

  async getStats(): Promise<PrintQueueStats> {
    return printQueueRepository.getStats();
  }

  /**
   * Run reconciliation: reset stuck PRINTING jobs and return a summary report.
   */
  async reconcile(stuckThresholdMinutes = 5): Promise<PrintReconciliationReport> {
    const stuckJobsReset = await printQueueRepository.resetStuckJobs(stuckThresholdMinutes);
    const stats = await printQueueRepository.getStats();

    return {
      totalJobs: stats.total,
      printed: stats.byStatus.printed,
      pending: stats.byStatus.pending,
      failed: stats.byStatus.failed,
      cancelled: stats.byStatus.cancelled,
      failureRate: stats.failureRate,
      stuckJobsReset,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const printQueueService = new PrintQueueService();
