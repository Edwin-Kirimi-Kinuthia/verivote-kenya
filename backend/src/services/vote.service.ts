import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { voterRepository, voteRepository, pollingStationRepository } from '../repositories/index.js';
import { blockchainService } from './blockchain.service.js';
import { encryptionService } from './encryption.service.js';
import { notificationService } from './notification.service.js';
import { emitVoteUpdate, emitDistressAlert } from '../lib/socket.js';
import { ServiceError } from './voter.service.js';
import type { JwtPayload } from '../types/auth.types.js';
import type { VerifyVoteResult } from '../types/database.types.js';

/**
 * Returns the voting window state based on ELECTION_VOTING_OPENS_AT and
 * ELECTION_VOTING_CLOSES_AT env vars. If neither is set, voting is always open.
 * Freeze period: voting is locked 2 hours before the close time.
 */
function checkVotingWindow() {
  const opensAt = process.env.ELECTION_VOTING_OPENS_AT
    ? new Date(process.env.ELECTION_VOTING_OPENS_AT) : null;
  const closesAt = process.env.ELECTION_VOTING_CLOSES_AT
    ? new Date(process.env.ELECTION_VOTING_CLOSES_AT) : null;
  const now = new Date();

  if (opensAt && now < opensAt) {
    throw new ServiceError(
      `Voting has not opened yet. Opens at ${opensAt.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`,
      403
    );
  }

  if (closesAt) {
    const freezeAt = new Date(closesAt.getTime() - 2 * 60 * 60 * 1000); // 2 hrs before close
    if (now >= freezeAt) {
      throw new ServiceError(
        'Voting is now closed. No further votes can be cast.',
        403
      );
    }
  }
}

interface CastVoteInput {
  selections: Record<string, string>;
  pollingStationId?: string;
  pin?: string;
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
    // Enforce voting window time-lock (no-op when env vars not set)
    checkVotingWindow();

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

    // ── PIN verification ────────────────────────────────────────────────────
    // PIN setup is mandatory before voting. Block if it was never set.
    let isDistressVote = voter.isDistress;
    if (!voterRecord.normalPinHash) {
      throw new ServiceError(
        'Your voting PIN has not been set. Please contact your IEBC officer to complete registration.',
        403
      );
    }

    if (!input.pin) {
      throw new ServiceError('PIN is required to cast your vote', 400);
    }

    let pinValid = false;
    try {
      pinValid = await argon2.verify(voterRecord.normalPinHash, input.pin);
    } catch { /* hash format mismatch → invalid */ }

    if (!pinValid && voterRecord.distressPinHash) {
      try {
        const distressMatch = await argon2.verify(voterRecord.distressPinHash, input.pin);
        if (distressMatch) {
          isDistressVote = true;
          pinValid = true;
        }
      } catch { /* hash format mismatch → invalid */ }
    }

    if (!pinValid) {
      throw new ServiceError('Invalid PIN', 401);
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
        isDistressFlagged: isDistressVote,
      });
      voteId = newVote.id;
    } else {
      const vote = await voteRepository.create({
        encryptedVoteHash: voteHash,
        encryptedVoteData: encryptedData,
        serialNumber,
        pollingStationId,
        isDistressFlagged: isDistressVote,
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

    const castAt = new Date();

    // Real-time dashboard update via socket.io (non-fatal)
    try {
      const voterStats = await voterRepository.getStats();
      emitVoteUpdate({
        totalVotes: voterStats.byStatus.voted + voterStats.byStatus.revoted,
        turnout: voterStats.turnoutPercentage,
        lastVoteAt: castAt.toISOString(),
      });
    } catch { /* non-fatal */ }

    // Distress PIN: emit socket alert + send SMS to coordinator (non-fatal)
    if (isDistressVote) {
      try {
        const station = pollingStationId
          ? await pollingStationRepository.findById(pollingStationId)
          : null;
        const stationName = station?.name ?? 'Unknown Station';
        const stationCode = station?.code ?? 'UNK';

        emitDistressAlert({ serial: serialNumber, stationName, stationCode, timestamp: castAt.toISOString() });

        // Notify all admin voters via their registered contacts
        const adminVoters = await voterRepository.findAdmins(1, 50);
        const adminAlerts = adminVoters.data
          .filter((a) => a.phoneNumber || a.email)
          .map((a) =>
            notificationService.sendDistressAlert({
              serialNumber,
              stationName,
              stationCode,
              timestamp: castAt,
              recipientPhone: a.phoneNumber ?? undefined,
              recipientEmail: a.email ?? undefined,
            }).catch(() => { /* non-fatal per admin */ })
          );
        // Also notify env-var coordinator contacts if configured
        if (process.env.DISTRESS_ALERT_PHONE || process.env.DISTRESS_ALERT_EMAIL) {
          adminAlerts.push(
            notificationService.sendDistressAlert({
              serialNumber,
              stationName,
              stationCode,
              timestamp: castAt,
            }).catch(() => { /* non-fatal */ })
          );
        }
        await Promise.all(adminAlerts);
      } catch { /* non-fatal */ }
    }

    return {
      serialNumber,
      voteId,
      blockchainTxHash,
      timestamp: castAt,
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
