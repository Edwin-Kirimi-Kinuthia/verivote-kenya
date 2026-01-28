/**
 * ============================================================================
 * VeriVote Kenya - Voter Repository
 * ============================================================================
 * 
 * Handles all database operations for voters.
 * 
 * MAIN RESPONSIBILITIES:
 * ----------------------
 * 1. CRUD operations (Create, Read, Update, Delete)
 * 2. Authentication helpers (find by national ID, check if voted)
 * 3. SBT registration (link blockchain wallet to voter)
 * 4. Status tracking (register, vote, flag distress, suspend)
 * 5. Statistics (counts, turnout, breakdowns)
 * 
 * USAGE IN ROUTES:
 * ----------------
 * ```typescript
 * import { voterRepository } from './repositories/index.js';
 * 
 * app.post('/api/voters/register', async (req, res) => {
 *   const voter = await voterRepository.create({
 *     nationalId: req.body.nationalId
 *   });
 *   res.json(voter);
 * });
 * ```
 * 
 * ============================================================================
 */

import { prisma } from '../database/client.js';
import { BaseRepository } from './base.repository.js';
import { VoterStatus } from '@prisma/client';
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
  
  // ==========================================================================
  // BASIC CRUD OPERATIONS
  // ==========================================================================

  /**
   * Find a voter by their UUID
   * 
   * @param id - Voter UUID
   * @returns Voter or null if not found
   * 
   * Example:
   *   const voter = await voterRepository.findById('123e4567-e89b...');
   */
  async findById(id: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { id },
    });
  }

  /**
   * Find a voter by ID and include their polling station details
   * 
   * This uses Prisma's `include` to do an automatic JOIN.
   * Without this, you'd need two queries or a manual JOIN.
   * 
   * @param id - Voter UUID
   * @returns Voter with station details or null
   */
  async findByIdWithStation(id: string): Promise<VoterWithStation | null> {
    return prisma.voter.findUnique({
      where: { id },
      include: { pollingStation: true },  // JOIN polling_stations table
    });
  }

  /**
   * Find a voter by their national ID
   * 
   * This is the primary lookup method during authentication.
   * National ID is unique, so we use findUnique.
   * 
   * @param nationalId - Kenya national ID (e.g., "12345678")
   * @returns Voter or null
   * 
   * Example:
   *   const voter = await voterRepository.findByNationalId('12345678');
   *   if (!voter) {
   *     return res.status(404).json({ error: 'Voter not found' });
   *   }
   */
  async findByNationalId(nationalId: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { nationalId },
    });
  }

  /**
   * Find a voter by their blockchain SBT address
   * 
   * Used for blockchain-based lookups and verification.
   * 
   * @param sbtAddress - Ethereum address (e.g., "0x1234...")
   * @returns Voter or null
   */
  async findBySbtAddress(sbtAddress: string): Promise<Voter | null> {
    return prisma.voter.findUnique({
      where: { sbtAddress },
    });
  }

  /**
   * Find multiple voters with filters and pagination
   * 
   * This is the main list endpoint. It supports:
   * - Filtering by status, station, etc.
   * - Pagination (page, limit)
   * - Sorting (newest first by default)
   * 
   * @param params - Query parameters
   * @returns Paginated list of voters
   * 
   * Example:
   *   // Get page 2 of voted voters, 50 per page
   *   const result = await voterRepository.findMany({
   *     page: 2,
   *     limit: 50,
   *     status: 'VOTED'
   *   });
   *   
   *   console.log(result.data);        // Array of voters
   *   console.log(result.pagination);  // { total: 150, page: 2, ... }
   */
  async findMany(params: VoterQueryParams = {}): Promise<PaginatedResponse<Voter>> {
    const { page, limit, skip } = this.getPagination(params);
    
    // Build the WHERE clause dynamically based on provided filters
    const where: any = {};
    
    // Filter by status
    if (params.status) {
      where.status = params.status;
    }
    
    // Filter by polling station
    if (params.pollingStationId) {
      where.pollingStationId = params.pollingStationId;
    }
    
    // Filter by SBT presence
    if (params.hasSbt !== undefined) {
      where.sbtAddress = params.hasSbt ? { not: null } : null;
    }
    
    // Filter by voting status
    if (params.hasVoted !== undefined) {
      if (params.hasVoted) {
        // Has voted = status is VOTED or REVOTED
        where.status = { in: [VoterStatus.VOTED, VoterStatus.REVOTED] };
      } else {
        // Hasn't voted = status is REGISTERED
        where.status = VoterStatus.REGISTERED;
      }
    }

    // Execute two queries in parallel:
    // 1. Get the data for this page
    // 2. Get the total count for pagination
    const [data, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip,           // Offset for pagination
        take: limit,    // Limit for pagination
        orderBy: { createdAt: 'desc' },  // Newest first
      }),
      prisma.voter.count({ where }),
    ]);

    return this.buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Find voters assigned to a specific polling station
   * 
   * Convenience method that wraps findMany with station filter.
   */
  async findByPollingStation(
    pollingStationId: string,
    params: VoterQueryParams = {}
  ): Promise<PaginatedResponse<Voter>> {
    return this.findMany({ ...params, pollingStationId });
  }

  /**
   * Create a new voter record
   * 
   * This is the first step in registration. After this:
   * 1. Generate and set PINs
   * 2. Mint SBT on blockchain
   * 3. Update voter with SBT address
   * 
   * @param data - Voter creation data
   * @returns Created voter
   */
  async create(data: CreateVoterInput): Promise<Voter> {
    return prisma.voter.create({
      data: {
        nationalId: data.nationalId,
        pollingStationId: data.pollingStationId,
      },
    });
  }

  /**
   * Update a voter by ID
   * 
   * General-purpose update method. Use specific methods below
   * for common operations (setPins, registerWithSbt, etc.)
   */
  async update(id: string, data: UpdateVoterInput): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a voter by ID
   * 
   * ⚠️ Use with caution! In production, consider soft-delete instead.
   */
  async delete(id: string): Promise<Voter> {
    return prisma.voter.delete({
      where: { id },
    });
  }

  /**
   * Count total voters in database
   */
  async count(): Promise<number> {
    return prisma.voter.count();
  }

  // ==========================================================================
  // SPECIALIZED OPERATIONS
  // ==========================================================================

  /**
   * Register a voter's SBT details after minting
   * 
   * Call this after successfully minting the SBT on blockchain.
   * 
   * @param id - Voter UUID
   * @param sbtAddress - Ethereum wallet address
   * @param sbtTokenId - Token ID on the SBT contract
   * @returns Updated voter
   * 
   * Example:
   *   // After minting SBT on blockchain
   *   const txReceipt = await sbtContract.mint(voterWallet.address);
   *   const tokenId = txReceipt.events[0].args.tokenId;
   *   
   *   await voterRepository.registerWithSbt(
   *     voter.id,
   *     voterWallet.address,
   *     tokenId.toString()
   *   );
   */
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

  /**
   * Store hashed PINs for a voter
   * 
   * ⚠️ IMPORTANT: Only store hashed PINs, never raw PINs!
   * Use Argon2 for hashing (see argon2 npm package).
   * 
   * @param id - Voter UUID
   * @param pinHash - Argon2 hash of normal PIN
   * @param distressPinHash - Argon2 hash of distress PIN
   * 
   * Example:
   *   import argon2 from 'argon2';
   *   
   *   const pinHash = await argon2.hash(rawPin);
   *   const distressPinHash = await argon2.hash(distressPin);
   *   
   *   await voterRepository.setPins(voter.id, pinHash, distressPinHash);
   */
  async setPins(id: string, pinHash: string, distressPinHash: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        pinHash,
        distressPinHash,
      },
    });
  }

  /**
   * Record that a voter has cast a vote
   * 
   * Updates:
   * - status: VOTED or REVOTED
   * - voteCount: increments by 1
   * - lastVotedAt: current timestamp
   * 
   * @param id - Voter UUID
   * @param isRevote - Is this a replacement vote?
   */
  async recordVote(id: string, isRevote = false): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: isRevote ? VoterStatus.REVOTED : VoterStatus.VOTED,
        voteCount: { increment: 1 },  // Prisma's atomic increment
        lastVotedAt: new Date(),
      },
    });
  }

  /**
   * Flag a voter for distress PIN usage
   * 
   * Called when voter uses their distress PIN.
   * This silently flags the vote for official review.
   * The vote is still recorded but may be investigated.
   */
  async flagDistress(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: VoterStatus.DISTRESS_FLAGGED,
      },
    });
  }

  /**
   * Suspend a voter account
   * 
   * Used by admins for fraud prevention or investigation.
   * Suspended voters cannot vote.
   */
  async suspend(id: string): Promise<Voter> {
    return prisma.voter.update({
      where: { id },
      data: {
        status: VoterStatus.SUSPENDED,
      },
    });
  }

  /**
   * Check if a national ID is already registered
   * 
   * Use before creating a new voter to prevent duplicates.
   * 
   * @param nationalId - Kenya national ID
   * @returns true if exists, false otherwise
   */
  async nationalIdExists(nationalId: string): Promise<boolean> {
    const count = await prisma.voter.count({
      where: { nationalId },
    });
    return count > 0;
  }

  /**
   * Check if a voter has already voted
   * 
   * @param id - Voter UUID
   * @returns true if voter has voted (or revoted)
   */
  async hasVoted(id: string): Promise<boolean> {
    const voter = await prisma.voter.findUnique({
      where: { id },
      select: { status: true },  // Only fetch status field
    });
    return voter?.status === VoterStatus.VOTED || 
           voter?.status === VoterStatus.REVOTED;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get comprehensive voter statistics
   * 
   * Returns:
   * - Total voters
   * - Count by status (registered, voted, etc.)
   * - Count with SBT assigned
   * - Turnout percentage
   * 
   * @returns VoterStats object
   * 
   * Example:
   *   const stats = await voterRepository.getStats();
   *   console.log(`Turnout: ${stats.turnoutPercentage}%`);
   */
  async getStats(): Promise<VoterStats> {
    // Execute multiple queries in parallel for efficiency
    const [total, statusCounts, withSbt] = await Promise.all([
      // Total voter count
      prisma.voter.count(),
      
      // Group by status and count each
      prisma.voter.groupBy({
        by: ['status'],
        _count: true,
      }),
      
      // Count voters with SBT assigned
      prisma.voter.count({
        where: { sbtAddress: { not: null } },
      }),
    ]);

    // Initialize status breakdown
    const byStatus = {
      registered: 0,
      voted: 0,
      revoted: 0,
      distressFlagged: 0,
      suspended: 0,
    };

    // Populate status counts
    for (const item of statusCounts) {
      switch (item.status) {
        case VoterStatus.REGISTERED:
          byStatus.registered = item._count;
          break;
        case VoterStatus.VOTED:
          byStatus.voted = item._count;
          break;
        case VoterStatus.REVOTED:
          byStatus.revoted = item._count;
          break;
        case VoterStatus.DISTRESS_FLAGGED:
          byStatus.distressFlagged = item._count;
          break;
        case VoterStatus.SUSPENDED:
          byStatus.suspended = item._count;
          break;
      }
    }

    // Calculate turnout percentage
    const votedCount = byStatus.voted + byStatus.revoted;
    const turnoutPercentage = total > 0 ? (votedCount / total) * 100 : 0;

    return {
      total,
      byStatus,
      withSbt,
      turnoutPercentage: Math.round(turnoutPercentage * 100) / 100,  // 2 decimal places
    };
  }
}

// Export singleton instance
// This ensures all parts of the app use the same repository instance
export const voterRepository = new VoterRepository();
