import type { Request } from 'express';
import type { VoterStatus } from './database.types.js';

export type StaffRole =
  | 'COMMISSIONER' | 'NATIONAL_RO' | 'COUNTY_RO'
  | 'CONSTITUENCY_RO' | 'PRESIDING_OFFICER' | 'ICT_ADMIN' | 'OBSERVER';

export type JurisdictionLevel =
  | 'NATIONAL' | 'COUNTY' | 'CONSTITUENCY' | 'WARD' | 'POLLING_STATION';

/** Roles that can perform ceremony operations */
export const CEREMONY_ROLES: StaffRole[] = ['COMMISSIONER', 'NATIONAL_RO', 'ICT_ADMIN'];
/** Roles that can declare results at any level */
export const DECLARATION_ROLES: StaffRole[] = ['COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO'];
/** Roles with read-only access to results */
export const RESULTS_READ_ROLES: StaffRole[] = ['COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'ICT_ADMIN', 'OBSERVER'];

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
