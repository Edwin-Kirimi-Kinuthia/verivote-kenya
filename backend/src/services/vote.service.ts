import { randomBytes } from 'crypto';
import { voterRepository, voteRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { encryptionService } from './encryption.service.js';
import { ServiceError } from './voter.service.js';
import type { JwtPayload } from '../types/auth.types.js';
import type { VerifyVoteResult } from '../types/database.types.js';

interface CastVoteInput {
  selections: Record<string, string>;
  pollingStationId?: string;
}

interface CastVoteResult {
  serialNumber: string;
  voteId: string;
  blockchainTxHash: string | null;
  timestamp: Date;
}

function generateSerialNumber(): string {
  return randomBytes(8).toString('hex').toUpperCase().slice(0, 16);
}

export class VoteService {
  async castVote(voter: JwtPayload, input: CastVoteInput): Promise<CastVoteResult> {
    const ELIGIBLE_STATUSES = ['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'];

    if (!ELIGIBLE_STATUSES.includes(voter.status)) {
      throw new ServiceError('Voter is not eligible to vote', 403);
    }

    // Look up voter to get polling station and vote count
    const voterRecord = await voterRepository.findById(voter.sub);
    if (!voterRecord) {
      throw new ServiceError('Voter not found', 404);
    }

    const pollingStationId = input.pollingStationId || voterRecord.pollingStationId;
    if (!pollingStationId) {
      throw new ServiceError('Polling station is required', 400);
    }

    // Encrypt selections and hash the ciphertext
    const encryptedData = encryptionService.encryptVote(input.selections);
    const voteHash = encryptionService.hashEncryptedData(encryptedData);
    const serialNumber = generateSerialNumber();
    const isRevote = voterRecord.voteCount > 0;

    let voteId: string;

    if (isRevote) {
      // Find the last active vote to supersede
      const votes = await voteRepository.findMany({
        page: 1,
        limit: 1,
        status: 'PENDING',
      });
      // Also check CONFIRMED votes
      const confirmedVotes = await voteRepository.findMany({
        page: 1,
        limit: 1,
        status: 'CONFIRMED',
      });

      const lastVote = votes.data[0] || confirmedVotes.data[0];
      if (!lastVote) {
        throw new ServiceError('Previous vote not found for revote', 404);
      }

      const { newVote } = await voteRepository.castRevote(lastVote.id, {
        encryptedVoteHash: voteHash,
        encryptedVoteData: encryptedData,
        serialNumber,
        pollingStationId,
      });
      voteId = newVote.id;
    } else {
      const vote = await voteRepository.create({
        encryptedVoteHash: voteHash,
        encryptedVoteData: encryptedData,
        serialNumber,
        pollingStationId,
      });
      voteId = vote.id;
    }

    // Attempt blockchain recording (non-fatal)
    let blockchainTxHash: string | null = null;
    try {
      const result = await blockchainService.recordVote(voteHash, serialNumber);
      blockchainTxHash = result.txHash;
      await voteRepository.confirmOnBlockchain(voteId, blockchainTxHash, 0n);
    } catch (error) {
      console.warn('Blockchain recording failed (non-fatal):', error instanceof Error ? error.message : error);
    }

    // Update voter status
    await voterRepository.recordVote(voter.sub, isRevote);

    return {
      serialNumber,
      voteId,
      blockchainTxHash,
      timestamp: new Date(),
    };
  }

  async verifyVote(serial: string): Promise<VerifyVoteResult> {
    const vote = await voteRepository.findBySerialNumber(serial);

    if (!vote) {
      return {
        verified: false,
        serialNumber: serial,
        status: 'PENDING',
        timestamp: new Date(),
        confirmedAt: null,
        cryptographicVerification: { hashValid: false, checkedAt: new Date() },
        blockchainConfirmation: {
          confirmed: false,
          txHash: null,
          confirmedAt: null,
          blockchainTimestamp: null,
          isSuperseded: null,
        },
        message: 'not_found',
      };
    }

    const checkedAt = new Date();
    let hashValid = false;
    if (vote.encryptedVoteData) {
      const computedHash = encryptionService.hashEncryptedData(vote.encryptedVoteData);
      hashValid = computedHash === vote.encryptedVoteHash;
    }

    let blockchainRecord = null;
    try {
      blockchainRecord = await blockchainService.getVoteRecord(serial);
    } catch (err) {
      console.warn('Blockchain query failed (non-fatal):', err instanceof Error ? err.message : err);
    }

    let message: string;
    if (!hashValid) {
      message = 'integrity_warning';
    } else if (blockchainRecord) {
      message = 'verified';
    } else {
      message = 'verified_no_blockchain';
    }

    return {
      verified: hashValid,
      serialNumber: serial,
      status: vote.status,
      timestamp: vote.timestamp,
      confirmedAt: vote.confirmedAt,
      cryptographicVerification: { hashValid, checkedAt },
      blockchainConfirmation: {
        confirmed: blockchainRecord !== null,
        txHash: vote.blockchainTxHash,
        confirmedAt: vote.confirmedAt,
        blockchainTimestamp: blockchainRecord?.timestamp ?? null,
        isSuperseded: blockchainRecord?.isSuperseded ?? null,
      },
      message,
    };
  }
}

export const voteService = new VoteService();
