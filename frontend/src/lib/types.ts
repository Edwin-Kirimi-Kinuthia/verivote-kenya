export type VoterStatus =
  | "PENDING_VERIFICATION"
  | "PENDING_MANUAL_REVIEW"
  | "REGISTERED"
  | "VERIFICATION_FAILED"
  | "VOTED"
  | "REVOTED"
  | "DISTRESS_FLAGGED"
  | "SUSPENDED";

export interface Voter {
  id: string;
  nationalId: string;
  sbtAddress: string | null;
  sbtTokenId: string | null;
  sbtMintedAt: string | null;
  status: VoterStatus;
  voteCount: number;
  lastVotedAt: string | null;
  pollingStationId: string | null;
  manualReviewRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PollingStation {
  id: string;
  code: string;
  name: string;
  county: string;
  constituency: string;
  ward: string;
  isActive: boolean;
}

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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ReviewStats {
  pendingReviews: number;
  totalRegistered: number;
  totalFailed: number;
  totalVoters: number;
  distressFlagged: number;
}

export interface ReviewDetails {
  voterId: string;
  nationalId: string;
  status: VoterStatus;
  pollingStation: PollingStation | null;
  verificationFailureReason: string | null;
  manualReviewRequestedAt: string | null;
  createdAt: string;
  sbtAddress: string | null;
  sbtTokenId: string | null;
  sbtMintedAt: string | null;
}

export interface RegisterResult {
  voterId: string;
  nationalId: string;
  walletAddress: string;
  sbtTokenId: string;
  txHash: string;
  pin: string;
  distressPin: string;
}

export interface RegisterLiveResult {
  voterId: string;
  inquiryId: string;
  personaUrl: string;
}

export interface AuthData {
  token: string;
  expiresIn: string;
  voter: {
    id: string;
    nationalId: string;
    status: VoterStatus;
    role: string;
  };
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

export type AppointmentStatus =
  | "AVAILABLE"
  | "BOOKED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED";

export type AppointmentPurpose = "REGISTRATION" | "PIN_RESET";

export interface Appointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  pollingStationId: string;
  status: AppointmentStatus;
  purpose?: AppointmentPurpose;
  voterId: string | null;
  assignedOfficerId: string | null;
  assignedOfficerName: string | null;
  bookedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  voter?: { id: string; nationalId: string } | null;
}

export interface SlotCreationResult {
  slotsCreated: number;
  pollingStationId: string;
  fromDate: string;
  toDate: string;
  daysOfWeek?: number[];
  startHour: number;
  endHour: number;
  slotDurationMinutes: number;
}

export interface BookedAppointmentResult {
  appointmentId: string;
  scheduledAt: string;
  pollingStationId: string;
  pollingStationName?: string;
  durationMinutes: number;
  purpose: AppointmentPurpose;
  message: string;
}

export interface SlotDeletionResult {
  deletedCount: number;
}

export interface ApproveResult {
  voterId: string;
  nationalId: string;
  walletAddress: string;
  sbtTokenId: string;
  txHash: string;
  pin: string;
  distressPin: string;
  reviewedBy: string;
}

export interface RejectResult {
  voterId: string;
  nationalId: string;
  status: string;
  rejectionReason: string;
  reviewedBy: string;
}

export interface PendingReset {
  id: string;
  nationalId: string;
  pinResetRequestedAt: string;
  pollingStationId: string;
  pollingStation: { name: string; code: string };
}

export interface PinResetResult {
  voterId: string;
  nationalId: string;
  pin: string;
  distressPin: string;
  message: string;
  resetAt: string;
  verifiedBy: string;
  verificationNotes?: string;
  verificationType: string;
}

// ============================================================================
// VOTING TYPES
// ============================================================================

export interface Candidate {
  id: string;
  name: string;
  party: string;
  partyAbbreviation: string;
  photoPlaceholder: string;
  position: string;
}

export interface BallotPosition {
  id: string;
  title: string;
  titleKey: string;
  candidates: Candidate[];
}

export type BallotSelection = Record<string, string>;

export interface VoteSubmission {
  selections: BallotSelection;
  pollingStationId?: string;
}

export interface VoteReceipt {
  serialNumber: string;
  voteId: string;
  blockchainTxHash: string | null;
  timestamp: string;
}

export type VoteStatus = 'PENDING' | 'CONFIRMED' | 'SUPERSEDED' | 'INVALIDATED';

export interface DistressVote {
  id: string;
  serialNumber: string;
  isDistressFlagged: boolean;
  status: VoteStatus;
  timestamp: string;
  pollingStation: { name: string; code: string } | null;
}

export interface VerifyVoteResult {
  verified: boolean;
  serialNumber: string;
  status: VoteStatus;
  timestamp: string;
  confirmedAt: string | null;
  cryptographicVerification: { hashValid: boolean; checkedAt: string; };
  blockchainConfirmation: {
    confirmed: boolean;
    txHash: string | null;
    confirmedAt: string | null;
    blockchainTimestamp: number | null;
    isSuperseded: boolean | null;
  };
  message: string;
}
