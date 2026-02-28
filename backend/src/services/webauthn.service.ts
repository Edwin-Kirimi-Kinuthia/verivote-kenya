import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '../database/client.js';
import { authService } from './auth.service.js';
import { ServiceError } from './voter.service.js';
import { voterRepository } from '../repositories/index.js';

const RP_NAME = process.env.RP_NAME || 'VeriVote Kenya';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ChallengeEntry { challenge: string; expiresAt: number; }

// Short-lived in-memory challenge store.
// Key: "reg:<voterId>" | "auth:<nationalId>"
// For production, replace with Redis using the existing redis config.
const challengeStore = new Map<string, ChallengeEntry>();

// Purge expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of challengeStore) {
    if (val.expiresAt < now) challengeStore.delete(key);
  }
}, 60_000);

export class WebAuthnService {

  // ── REGISTRATION ──────────────────────────────────────────────────────────

  async getRegistrationOptions(voterId: string) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    if (!['REGISTERED', 'VOTED', 'REVOTED', 'DISTRESS_FLAGGED'].includes(voter.status)) {
      throw new ServiceError('Only verified voters can enroll a credential', 403);
    }

    const existing = await prisma.webAuthnCredential.findMany({
      where: { voterId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: voter.nationalId,
      userDisplayName: voter.nationalId,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
        authenticatorAttachment: 'platform', // fingerprint / Face ID on the voter's device
      },
      excludeCredentials: existing.map(c => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
    });

    challengeStore.set(`reg:${voterId}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    return options;
  }

  async verifyRegistration(voterId: string, response: RegistrationResponseJSON) {
    const voter = await voterRepository.findById(voterId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    const stored = challengeStore.get(`reg:${voterId}`);
    if (!stored || stored.expiresAt < Date.now()) {
      challengeStore.delete(`reg:${voterId}`);
      throw new ServiceError('Registration challenge expired. Please start again.', 400);
    }

    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    challengeStore.delete(`reg:${voterId}`);

    if (!verified || !registrationInfo) {
      throw new ServiceError('WebAuthn registration verification failed', 400);
    }

    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    await prisma.webAuthnCredential.create({
      data: {
        voterId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
      },
    });

    return { verified: true, credentialId: credential.id };
  }

  // ── AUTHENTICATION ─────────────────────────────────────────────────────────

  async getAuthenticationOptions(nationalId: string) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { voterId: voter.id },
      select: { credentialId: true, transports: true },
    });

    if (credentials.length === 0) {
      throw new ServiceError(
        'No credentials enrolled. Please register your fingerprint first.',
        400
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: credentials.map(c => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
    });

    challengeStore.set(`auth:${nationalId}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    return options;
  }

  async verifyAuthentication(nationalId: string, response: AuthenticationResponseJSON) {
    const voter = await voterRepository.findByNationalId(nationalId);
    if (!voter) throw new ServiceError('Voter not found', 404);

    if (voter.status === 'SUSPENDED') {
      throw new ServiceError('Voter account is suspended', 403);
    }
    if (voter.status === 'VERIFICATION_FAILED') {
      throw new ServiceError('Voter identity verification failed', 403);
    }
    if (voter.status === 'PENDING_VERIFICATION' || voter.status === 'PENDING_MANUAL_REVIEW') {
      throw new ServiceError('Voter registration is not yet complete', 403);
    }

    const stored = challengeStore.get(`auth:${nationalId}`);
    if (!stored || stored.expiresAt < Date.now()) {
      challengeStore.delete(`auth:${nationalId}`);
      throw new ServiceError('Authentication challenge expired. Please start again.', 400);
    }

    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });

    if (!storedCredential || storedCredential.voterId !== voter.id) {
      throw new ServiceError('Credential not found or does not belong to this voter', 400);
    }

    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCredential.credentialId,
        publicKey: new Uint8Array(storedCredential.publicKey),
        counter: Number(storedCredential.counter),
        transports: storedCredential.transports
          ? (JSON.parse(storedCredential.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
      requireUserVerification: true,
    });

    challengeStore.delete(`auth:${nationalId}`);

    if (!verified) {
      throw new ServiceError('Fingerprint authentication failed', 401);
    }

    // Update counter to prevent replay attacks
    await prisma.webAuthnCredential.update({
      where: { credentialId: storedCredential.credentialId },
      data: { counter: authenticationInfo.newCounter },
    });

    const token = authService.generateToken({
      sub: voter.id,
      nationalId: voter.nationalId,
      status: voter.status,
      role: voter.role,
      isDistress: false,
    });

    return {
      verified: true,
      auth: {
        token,
        expiresIn: authService.getExpiresIn(),
        voter: {
          id: voter.id,
          nationalId: voter.nationalId,
          status: voter.status,
          role: voter.role,
        },
      },
    };
  }

  // ── CREDENTIAL MANAGEMENT ─────────────────────────────────────────────────

  async listCredentials(voterId: string) {
    return prisma.webAuthnCredential.findMany({
      where: { voterId },
      select: {
        id: true,
        credentialId: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteCredentials(voterId: string) {
    const { count } = await prisma.webAuthnCredential.deleteMany({ where: { voterId } });
    return { deleted: count };
  }
}

export const webAuthnService = new WebAuthnService();
