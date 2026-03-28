import type { Request } from 'express';
import type { VoterStatus } from './database.types.js';

export type StaffRole =
  // Commission
  | 'CHAIRPERSON'                   // Presidential Returning Officer — highest authority
  | 'COMMISSIONER'                  // IEBC Commissioner — policy & oversight
  | 'COMMISSION_SECRETARY'          // CEO — day-to-day operations
  | 'DEPUTY_COMMISSION_SECRETARY'   // Deputy CEO
  // Secretariat
  | 'DIRECTOR'                      // Functional director (see department field)
  | 'MANAGER'                       // Functional manager (see department field)
  | 'NATIONAL_RO'                   // National Returning Officer
  | 'ICT_ADMIN'                     // ICT systems administrator
  // Field
  | 'REGIONAL_COORDINATOR'          // One of 17 regional coordinators
  | 'COUNTY_RO'                     // County Election Manager / Returning Officer
  | 'CONSTITUENCY_RO'               // Constituency Election Coordinator
  // Polling station
  | 'PRESIDING_OFFICER'             // Presiding Officer — in charge of station
  | 'DEPUTY_PRESIDING_OFFICER'      // Deputy Presiding Officer
  | 'POLLING_CLERK'                 // Polling Clerk — voter verification
  | 'SECURITY_OFFICER'              // Security Officer — read-only
  // Special
  | 'OBSERVER';                     // Read-only observer

export type JurisdictionLevel =
  | 'NATIONAL' | 'COUNTY' | 'CONSTITUENCY' | 'WARD' | 'POLLING_STATION';

// ── Role tier groupings ────────────────────────────────────────────────────────

/** Commission & senior secretariat — full system access */
export const COMMISSION_TIER: StaffRole[] = [
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
];
/** Secretariat staff — operational access */
export const SECRETARIAT_TIER: StaffRole[] = [
  'DIRECTOR', 'MANAGER', 'NATIONAL_RO', 'ICT_ADMIN',
];
/** National-level access (commission + secretariat) */
export const NATIONAL_TIER: StaffRole[] = [...COMMISSION_TIER, ...SECRETARIAT_TIER];
/** Regional level */
export const REGIONAL_TIER: StaffRole[] = ['REGIONAL_COORDINATOR'];
/** County level */
export const COUNTY_TIER: StaffRole[] = ['COUNTY_RO'];
/** Constituency level */
export const CONSTITUENCY_TIER: StaffRole[] = ['CONSTITUENCY_RO'];
/** Polling station level */
export const STATION_TIER: StaffRole[] = [
  'PRESIDING_OFFICER', 'DEPUTY_PRESIDING_OFFICER', 'POLLING_CLERK', 'SECURITY_OFFICER',
];

/** Roles that can perform decryption ceremony operations */
export const CEREMONY_ROLES: StaffRole[] = [
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'NATIONAL_RO', 'ICT_ADMIN',
];
/** Roles that can formally declare results */
export const DECLARATION_ROLES: StaffRole[] = [
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
  'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO',
  'PRESIDING_OFFICER',  // Declares results at polling station level
];
/** Roles with read access to results */
export const RESULTS_READ_ROLES: StaffRole[] = [
  ...NATIONAL_TIER, 'REGIONAL_COORDINATOR', 'COUNTY_RO', 'CONSTITUENCY_RO', 'OBSERVER',
];
/** Roles that can manage staff records */
export const STAFF_MANAGE_ROLES: StaffRole[] = [
  'CHAIRPERSON', 'COMMISSIONER', 'COMMISSION_SECRETARY', 'DEPUTY_COMMISSION_SECRETARY',
];

export interface JwtPayload {
  sub: string;
  nationalId: string;
  status: VoterStatus;
  role: string;
  isDistress: boolean;
  // IEBC staff fields — present only for users with an IebcStaff record
  staffId?: string;
  staffRole?: StaffRole;
  jurisdictionLevel?: JurisdictionLevel;
  jurisdictionValue?: string | null;
  department?: string | null;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  voter: JwtPayload;
}

export interface AuthResponse {
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
    department?: string | null;
  };
}

export interface VoterStatusResponse {
  voterId: string;
  status: VoterStatus;
  voteCount: number;
  isRegistered: boolean;
  hasVoted: boolean;
  lastVotedAt: Date | null;
  registeredAt: Date;
}
