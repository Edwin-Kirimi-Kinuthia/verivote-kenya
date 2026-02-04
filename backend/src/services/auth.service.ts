import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/auth.types.js';
import { ServiceError } from './voter.service.js';

const JWT_SECRET: jwt.Secret = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret') {
  throw new Error('JWT_SECRET must not be the default dev secret in production');
}

export class AuthService {
  generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new ServiceError('Token expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ServiceError('Invalid token', 401);
      }
      throw new ServiceError('Token verification failed', 401);
    }
  }

  getExpiresIn(): string {
    return JWT_EXPIRES_IN;
  }
}

export const authService = new AuthService();
