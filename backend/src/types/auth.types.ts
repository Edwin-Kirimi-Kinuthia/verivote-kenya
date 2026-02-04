import type { Request } from 'express';
import type { VoterStatus } from './database.types.js';

export interface JwtPayload {
  sub: string;
  nationalId: string;
  status: VoterStatus;
  isDistress: boolean;
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
