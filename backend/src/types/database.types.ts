/**
 * VeriVote Kenya - Database Type Definitions
 * Standalone types - NO @prisma/client imports
 */

// ============================================================================
// ENUMS
// ============================================================================

export type VoterStatus = 
  | 'REGISTERED'
  | 'VOTED'
  | 'REVOTED'
  | 'DISTRESS_FLAGGED'
  | 'SUSPENDED';

export type VoteStatus = 
  | 'PENDING'
  | 'CONFIRMED'
  | 'SUPERSEDED'
  | 'INVALIDATED';

export type PrintStatus = 
  | 'PENDING'
  | 'PRINTING'
  | 'PRINTED'
  | 'FAILED'
  | 'CANCELLED';

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface Voter {
  id: string;
  nationalId: string;
  sbtAddress: string | null;
  sbtTokenId: string | null;
  sbtMintedAt: Date | null;
  pinHash: string | null;
  distressPinHash: string | null;
  status: VoterStatus;
  voteCount: number;
  lastVotedAt: Date | null;
  pollingStationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vote {
  id: string;
  encryptedVoteHash: string;
  encryptedVoteData: string | null;
  serialNumber: string;
  zkpProof: string | null;
  blockchainTxHash: string | null;
  blockNumber: bigint | null;
  confirmedAt: Date | null;
  status: VoteStatus;
  pollingStationId: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  previousVoteId: string | null;
}

export interface PollingStation {
  id: string;
  code: string;
  name: string;
  county: string;
  constituency: string;
  ward: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  registeredVoters: number;
  isActive: boolean;
  openingTime: Date | null;
  closingTime: Date | null;
  deviceCount: number;
  printerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrintQueue {
  id: string;
  voteId: string;
  pollingStationId: string;
  status: PrintStatus;
  priority: number;
  printerId: string | null;
  printedAt: Date | null;
  printAttempts: number;
  lastError: string | null;
  ballotNumber: string | null;
  qrCodeData: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateVoterInput {
  nationalId: string;
  pollingStationId?: string;
}

export interface UpdateVoterInput {
  sbtAddress?: string;
  sbtTokenId?: string;
  sbtMintedAt?: Date;
  pinHash?: string;
  distressPinHash?: string;
  status?: VoterStatus;
  voteCount?: number;
  lastVotedAt?: Date;
  pollingStationId?: string;
}

export interface CreateVoteInput {
  encryptedVoteHash: string;
  encryptedVoteData?: string;
  serialNumber: string;
  zkpProof?: string;
  pollingStationId: string;
  previousVoteId?: string;
}

export interface UpdateVoteInput {
  blockchainTxHash?: string;
  blockNumber?: bigint;
  confirmedAt?: Date;
  status?: VoteStatus;
}

export interface CreatePollingStationInput {
  code: string;
  name: string;
  county: string;
  constituency: string;
  ward: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  registeredVoters?: number;
  deviceCount?: number;
  printerCount?: number;
}

export interface UpdatePollingStationInput {
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  registeredVoters?: number;
  isActive?: boolean;
  openingTime?: Date;
  closingTime?: Date;
  deviceCount?: number;
  printerCount?: number;
}

export interface CreatePrintQueueInput {
  voteId: string;
  pollingStationId: string;
  priority?: number;
}

export interface UpdatePrintQueueInput {
  status?: PrintStatus;
  printerId?: string;
  printedAt?: Date;
  printAttempts?: number;
  lastError?: string;
  ballotNumber?: string;
  qrCodeData?: string;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface VoterQueryParams extends PaginationParams {
  status?: VoterStatus;
  pollingStationId?: string;
  hasSbt?: boolean;
  hasVoted?: boolean;
}

export interface VoteQueryParams extends PaginationParams {
  status?: VoteStatus;
  pollingStationId?: string;
  fromDate?: Date;
  toDate?: Date;
  confirmedOnly?: boolean;
}

export interface PollingStationQueryParams extends PaginationParams {
  county?: string;
  constituency?: string;
  ward?: string;
  isActive?: boolean;
}

export interface PrintQueueQueryParams extends PaginationParams {
  status?: PrintStatus;
  pollingStationId?: string;
  printerId?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

export interface VoterStats {
  total: number;
  byStatus: {
    registered: number;
    voted: number;
    revoted: number;
    distressFlagged: number;
    suspended: number;
  };
  withSbt: number;
  turnoutPercentage: number;
}

export interface VoteStats {
  total: number;
  byStatus: {
    pending: number;
    confirmed: number;
    superseded: number;
    invalidated: number;
  };
  confirmedOnBlockchain: number;
  averageConfirmationTime?: number;
}

export interface PollingStationStats {
  totalStations: number;
  activeStations: number;
  totalRegisteredVoters: number;
  totalVotesCast: number;
  overallTurnout: number;
  byCounty: {
    county: string;
    stations: number;
    voters: number;
    votes: number;
    turnout: number;
  }[];
}

export interface PrintQueueStats {
  total: number;
  byStatus: {
    pending: number;
    printing: number;
    printed: number;
    failed: number;
    cancelled: number;
  };
  averagePrintTime?: number;
  failureRate: number;
}

// ============================================================================
// COMPOSITE TYPES
// ============================================================================

export interface VoterWithStation extends Voter {
  pollingStation: PollingStation | null;
}

export interface VoteWithStation extends Vote {
  pollingStation: PollingStation;
}

export interface VoteWithPrintStatus extends Vote {
  pollingStation: PollingStation;
  printQueue: PrintQueue | null;
}

export interface PrintQueueWithDetails extends PrintQueue {
  vote: Vote;
  pollingStation: PollingStation;
}
