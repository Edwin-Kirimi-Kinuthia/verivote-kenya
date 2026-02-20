/**
 * VeriVote Kenya - Database Type Definitions
 * Standalone types - NO @prisma/client imports
 */

// ============================================================================
// ENUMS
// ============================================================================

export type VoterStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_MANUAL_REVIEW'
  | 'REGISTERED'
  | 'VERIFICATION_FAILED'
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

export type UserRole = 'VOTER' | 'ADMIN';

export type AppointmentStatus =
  | 'AVAILABLE'
  | 'BOOKED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentPurpose = 'REGISTRATION' | 'PIN_RESET';

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface Voter {
  id: string;
  role: UserRole;
  nationalId: string;
  sbtAddress: string | null;
  sbtTokenId: string | null;
  sbtMintedAt: Date | null;
  pinHash: string | null;
  distressPinHash: string | null;
  personaInquiryId: string | null;
  personaStatus: string | null;
  personaVerifiedAt: Date | null;
  verificationFailureReason: string | null;
  manualReviewRequestedAt: Date | null;
  manualReviewedAt: Date | null;
  manualReviewedBy: string | null;
  manualReviewNotes: string | null;
  pinResetRequested: boolean;
  pinResetRequestedAt: Date | null;
  pinResetInquiryId: string | null;
  pinLastResetAt: Date | null;
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
  isDistressFlagged: boolean;
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

export interface ManualReviewAppointment {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  pollingStationId: string;
  status: AppointmentStatus;
  purpose: AppointmentPurpose;
  voterId: string | null;
  assignedOfficerId: string | null;
  assignedOfficerName: string | null;
  bookedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookedAppointmentResult {
  appointmentId: string;
  scheduledAt: Date;
  pollingStationId: string;
  pollingStationName?: string;
  durationMinutes: number;
  purpose: AppointmentPurpose;
  message: string;
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
  personaInquiryId?: string;
  personaStatus?: string;
  personaVerifiedAt?: Date;
  verificationFailureReason?: string;
  manualReviewRequestedAt?: Date;
  manualReviewedAt?: Date;
  manualReviewedBy?: string;
  manualReviewNotes?: string;
  pinResetRequested?: boolean;
  pinResetRequestedAt?: Date;
  pinResetInquiryId?: string;
  pinLastResetAt?: Date;
  status?: VoterStatus;
  role?: UserRole;
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
  isDistressFlagged?: boolean;
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

export interface CreateAppointmentInput {
  scheduledAt: Date;
  durationMinutes?: number;
  pollingStationId: string;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  purpose?: AppointmentPurpose;
}

export interface UpdateAppointmentInput {
  status?: AppointmentStatus;
  voterId?: string;
  bookedAt?: Date;
  notes?: string;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
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
  nationalId?: string;
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
    pendingVerification: number;
    pendingManualReview: number;
    registered: number;
    verificationFailed: number;
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

export interface VerifyVoteResult {
  verified: boolean;
  serialNumber: string;
  status: VoteStatus;
  timestamp: Date;
  confirmedAt: Date | null;
  cryptographicVerification: { hashValid: boolean; checkedAt: Date; };
  blockchainConfirmation: {
    confirmed: boolean;
    txHash: string | null;
    confirmedAt: Date | null;
    blockchainTimestamp: number | null;
    isSuperseded: boolean | null;
  };
  message: string;
}
