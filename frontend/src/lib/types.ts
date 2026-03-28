export type VoterStatus =
  | "PENDING_VERIFICATION"
  | "PENDING_MANUAL_REVIEW"
  | "REGISTERED"
  | "VERIFICATION_FAILED"
  | "VOTED"
  | "REVOTED"
  | "DISTRESS_FLAGGED"
  | "SUSPENDED"
  | "DECEASED";

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
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  isDiaspora: boolean;
  country: string | null;
  registeredVoters: number;
  isActive: boolean;
  openingTime: string | null;
  closingTime: string | null;
  deviceCount: number;
  printerCount: number;
}

export interface StationStaff {
  id: string;
  staffRole: string;
  jurisdictionValue: string | null;
  voter: { nationalId: string; email: string | null };
}

export interface PollingStationDetail extends PollingStation {
  iebcStaff: StationStaff[];
  _count: { voters: number; votes: number };
}

export interface NearbyStation extends PollingStation {
  distanceKm: number;
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

export interface AdminRegisterResult {
  voterId: string;
  nationalId: string;
}

export interface SetupLinkResult {
  contact: string;
  channel: 'SMS' | 'EMAIL';
}

export interface RegisterLiveResult {
  voterId: string;
  inquiryId: string;
  personaUrl: string;
}

export type StaffRole =
  // Commission
  | "CHAIRPERSON" | "COMMISSIONER" | "COMMISSION_SECRETARY" | "DEPUTY_COMMISSION_SECRETARY"
  // Secretariat
  | "DIRECTOR" | "MANAGER" | "NATIONAL_RO" | "ICT_ADMIN"
  // Field
  | "REGIONAL_COORDINATOR" | "COUNTY_RO" | "CONSTITUENCY_RO"
  // Station
  | "PRESIDING_OFFICER" | "DEPUTY_PRESIDING_OFFICER" | "POLLING_CLERK" | "SECURITY_OFFICER"
  // Special
  | "OBSERVER";

export type JurisdictionLevel =
  | "NATIONAL" | "COUNTY" | "CONSTITUENCY" | "WARD" | "POLLING_STATION";

export type DeclarationStatus = "DRAFT" | "DECLARED" | "CONTESTED" | "ANNULLED";

export interface IebcStaffMember {
  id: string;
  voterId: string;
  staffRole: StaffRole;
  jurisdictionLevel: JurisdictionLevel;
  jurisdictionValue: string | null;
  department: string | null;
  pollingStationId: string | null;
  isActive: boolean;
  createdByStaffId: string | null;
  createdAt: string;
  updatedAt: string;
  voter?: { id: string; nationalId: string; email?: string | null; phoneNumber?: string | null };
}

export interface ResultDeclaration {
  id: string;
  electionId: string;
  positionId: string;
  staffId: string;
  status: DeclarationStatus;
  jurisdictionLevel: JurisdictionLevel;
  jurisdictionValue: string | null;
  tallySnapshot: string | null;
  declaredAt: string | null;
  contestedAt: string | null;
  contestReason: string | null;
  createdAt: string;
  updatedAt: string;
  election?: { id: string; name: string; status: string };
  position?: { id: string; title: string; scope: string; scopeValue: string | null };
  staff?: { voter: { nationalId: string } };
}

export interface AuthData {
  token: string;
  expiresIn: string;
  voter: {
    id: string;
    nationalId: string;
    status: VoterStatus;
    role: string;
    staffId?: string;
    staffRole?: StaffRole;
    jurisdictionLevel?: JurisdictionLevel;
    jurisdictionValue?: string | null;
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

export interface KycStartResult {
  appointmentId: string;
  voterId: string;
  nationalId: string;
  inquiryId: string;
  personaUrl: string;
}

export interface ApproveResult {
  voterId: string;
  nationalId: string;
  walletAddress: string;
  sbtTokenId: string;
  txHash: string;
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
  nationalId: string | undefined;
  message: string;
  clearedAt: string;
  verifiedBy: string;
  verificationNotes?: string;
  verificationType: string;
  linkSent?: { contact: string; channel: 'SMS' | 'EMAIL' };
}

// ============================================================================
// DYNAMIC ELECTION TYPES (API-returned shapes)
// ============================================================================

export type ElectionType = 'GOVERNMENT' | 'INSTITUTIONAL' | 'CORPORATE' | 'CUSTOM';
export type ElectionStatus = 'DRAFT' | 'NOMINATIONS' | 'ACTIVE' | 'CLOSED' | 'TALLIED' | 'ARCHIVED';
export type PositionScope = 'NATIONAL' | 'COUNTY' | 'CONSTITUENCY' | 'WARD' | 'CUSTOM';

// Matches ActiveElectionSummary from ballot.service.ts
export interface ElectionSummary {
  electionId: string;
  name: string;
  type: string;
  orgName: string | null;
  startDate: string | null;
  endDate: string | null;
  positionCount: number;
}

// Matches BallotCandidate from ballot.service.ts
export interface DynamicCandidate {
  candidateId: string;
  name: string;
  party: string | null;
  ballotNumber: number | null;
  photoUrl: string | null;
}

// Matches BallotPosition from ballot.service.ts
export interface DynamicPosition {
  positionId: string;
  title: string;
  description: string | null;
  scope: PositionScope;
  scopeValue?: string | null;
  maxVotesPerVoter: number;
  orderIndex: number;
  candidates: DynamicCandidate[];
}

// Matches VoterBallot from ballot.service.ts
export interface DynamicBallot {
  electionId: string;
  electionName: string;
  electionType: string;
  positions: DynamicPosition[];
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
