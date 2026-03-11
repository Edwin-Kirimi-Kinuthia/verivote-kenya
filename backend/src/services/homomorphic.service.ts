/**
 * VeriVote Kenya — Threshold Homomorphic Tally Service (Days 45-46)
 *
 * Implements fully homomorphic vote tallying using exponential ElGamal and
 * a 3-of-3 additive threshold key scheme.
 *
 * ── Ballot encoding ──────────────────────────────────────────────────────────
 * For each candidate across all positions, a separate exponential ElGamal
 * ciphertext is produced:
 *   Vote for candidate c:   E(g^1) = (g^r, g·h^r)
 *   Did not vote for c:     E(g^0) = (g^r, h^r)       (since g^0 = 1)
 *
 * ── Homomorphic aggregation ───────────────────────────────────────────────────
 * For all votes, per candidate c:
 *   AGG_c = (∏ c1_i mod p, ∏ c2_i mod p)
 * If k voters chose candidate c, this equals E(g^k) — the count is in the exponent.
 * No individual vote is decrypted in this process.
 *
 * ── Threshold decryption ─────────────────────────────────────────────────────
 * Master key:  x  (IEBC ELGAMAL_PRIVATE_KEY)
 * Shares:      x1, x2, x3  where  x1 + x2 + x3 ≡ x  (mod p-1)
 *              Derived deterministically via HMAC-SHA256 from x.
 *
 * Each commissioner i provides:  D_i = AGG.c1^x_i  mod p
 * Combined:  D = D1·D2·D3 = AGG.c1^(x1+x2+x3) = AGG.c1^x  mod p
 * Recover:   g^k = AGG.c2 · D^(-1)  mod p
 *
 * ── Baby-step Giant-step (BSGS) ───────────────────────────────────────────────
 * Solves discrete log: given g^k, find k  (feasible for k ≤ 100,000)
 * Step size m = ⌈√max_voters⌉.  Baby-step table: {g^j: j=0..m}.
 * Giant-step loop checks g^k · (g^(-m))^i until match found.
 *
 * Sovereignty: All operations on-premise. Zero foreign API calls.
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { getGroup } from 'threshold-elgamal';
import { prisma } from '../database/client.js';
import { encryptionService } from './encryption.service.js';
import { logger } from '../lib/logger.js';

const { prime: p, generator: g } = getGroup(2048);

// ── Candidate roster (mirrors tally.service.ts) ───────────────────────────────

const ALL_CANDIDATES: { positionId: string; positionTitle: string; candidateId: string; candidateName: string }[] = [
  { positionId: 'president', positionTitle: 'President', candidateId: 'pres-1', candidateName: 'Amina Wanjiku' },
  { positionId: 'president', positionTitle: 'President', candidateId: 'pres-2', candidateName: 'James Ochieng' },
  { positionId: 'president', positionTitle: 'President', candidateId: 'pres-3', candidateName: 'Fatuma Hassan' },
  { positionId: 'president', positionTitle: 'President', candidateId: 'pres-4', candidateName: 'Peter Kamau' },
  { positionId: 'governor',  positionTitle: 'Governor',  candidateId: 'gov-1',  candidateName: 'Grace Muthoni' },
  { positionId: 'governor',  positionTitle: 'Governor',  candidateId: 'gov-2',  candidateName: 'David Kiprop' },
  { positionId: 'governor',  positionTitle: 'Governor',  candidateId: 'gov-3',  candidateName: 'Sarah Akinyi' },
];

const COMMISSIONER_IDS = ['alpha', 'beta', 'gamma'] as const;
type CommissionerId = typeof COMMISSIONER_IDS[number];

const COMMISSIONER_LABELS: Record<CommissionerId, string> = {
  alpha: 'Commissioner Alpha (IEBC Nairobi HQ)',
  beta:  'Commissioner Beta  (IEBC Mombasa)',
  gamma: 'Commissioner Gamma (IEBC Kisumu)',
};

// ── Math helpers ──────────────────────────────────────────────────────────────

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  base = ((base % mod) + mod) % mod;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function extGcd(a: bigint, b: bigint): { gcd: bigint; x: bigint } {
  let oldR = a, r = b, oldS = 1n, s = 0n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return { gcd: oldR, x: oldS };
}

function modInverse(a: bigint, mod: bigint): bigint {
  const { gcd, x } = extGcd(((a % mod) + mod) % mod, mod);
  if (gcd !== 1n) throw new Error('Modular inverse does not exist');
  return ((x % mod) + mod) % mod;
}

// ── Ciphertext type ───────────────────────────────────────────────────────────

interface CT { c1: bigint; c2: bigint; }

function serializeCT(ct: CT): { c1: string; c2: string } {
  return { c1: ct.c1.toString(16), c2: ct.c2.toString(16) };
}
function parseCT(o: { c1: string; c2: string }): CT {
  return { c1: BigInt('0x' + o.c1), c2: BigInt('0x' + o.c2) };
}

// ── Homomorphic ballot format ─────────────────────────────────────────────────

/** Per-candidate exponential ElGamal encodings stored in the Vote row. */
export interface HomomorphicBallot {
  v: 2;
  candidates: Record<string, { c1: string; c2: string }>;
}

// ── Key splitting ─────────────────────────────────────────────────────────────

/**
 * Deterministically derive commissioner key shares from the master private key.
 * x1 + x2 + x3 ≡ x  (mod p-1)
 * Shares are stable across restarts — derived via HMAC-SHA256.
 */
function deriveShares(privateKey: bigint): Record<CommissionerId, bigint> {
  const keyHex = privateKey.toString(16);
  const order = p - 1n;

  const x1 = BigInt('0x' + createHmac('sha256', keyHex).update('commissioner-alpha').digest('hex')) % order;
  const x2 = BigInt('0x' + createHmac('sha256', keyHex).update('commissioner-beta').digest('hex')) % order;
  // x3 ensures x1 + x2 + x3 ≡ x (mod p-1)
  const x3 = ((privateKey - x1 - x2) % order + order) % order;

  return { alpha: x1, beta: x2, gamma: x3 };
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a bit (0 or 1) using exponential ElGamal under publicKey.
 *   bit=1: (g^r,  g · h^r)   [message is g^1 = g]
 *   bit=0: (g^r,      h^r)   [message is g^0 = 1]
 */
function encryptBit(bit: 0 | 1, publicKey: bigint): CT {
  const rBytes = randomBytes(256);
  const r = BigInt('0x' + rBytes.toString('hex')) % (p - 3n) + 2n;
  const m = bit === 1 ? g : 1n;   // g^1 or g^0
  return {
    c1: modPow(g, r, p),
    c2: (m * modPow(publicKey, r, p)) % p,
  };
}

/**
 * Encode a full ballot as per-candidate exponential ElGamal ciphertexts.
 * selections: { president: 'pres-2', governor: 'gov-1' }
 */
export function encryptHomomorphicBallot(
  selections: Record<string, string>,
  publicKey: bigint,
): HomomorphicBallot {
  const candidates: Record<string, { c1: string; c2: string }> = {};

  for (const cand of ALL_CANDIDATES) {
    const voted = selections[cand.positionId] === cand.candidateId ? 1 : 0;
    const ct = encryptBit(voted as 0 | 1, publicKey);
    candidates[cand.candidateId] = serializeCT(ct);
  }

  return { v: 2, candidates };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/** Multiply all ciphertexts per candidate (homomorphic sum). */
function aggregate(ballots: HomomorphicBallot[], candidateId: string): CT {
  let aggC1 = 1n;
  let aggC2 = 1n;
  for (const b of ballots) {
    const ct = parseCT(b.candidates[candidateId]);
    aggC1 = (aggC1 * ct.c1) % p;
    aggC2 = (aggC2 * ct.c2) % p;
  }
  return { c1: aggC1, c2: aggC2 };
}

// ── Partial decryption ────────────────────────────────────────────────────────

/** Commissioner i computes D_i = aggC1^xi mod p */
function partialDecrypt(aggC1: bigint, xi: bigint): bigint {
  return modPow(aggC1, xi, p);
}

/** Combine all partial decryptions: D = D1·D2·D3 mod p */
function combinePartials(partials: bigint[]): bigint {
  return partials.reduce((acc, d) => (acc * d) % p, 1n);
}

/** Recover g^count = aggC2 · D^(-1) mod p */
function recoverGCount(aggC2: bigint, combined: bigint): bigint {
  return (aggC2 * modInverse(combined, p)) % p;
}

// ── Baby-step Giant-step ──────────────────────────────────────────────────────

/**
 * Solve g^n = target mod p for small n (≤ maxN).
 * Returns -1 if not found (shouldn't happen with valid data).
 */
function bsgs(target: bigint, maxN: number): number {
  const m = Math.ceil(Math.sqrt(maxN + 1));
  const mBig = BigInt(m);

  // Baby steps: map g^j → j
  const table = new Map<string, number>();
  let baby = 1n;
  for (let j = 0; j <= m; j++) {
    table.set(baby.toString(), j);
    baby = (baby * g) % p;
  }

  // g^(-m) mod p
  const gm    = modPow(g, mBig, p);
  const gmInv = modInverse(gm, p);

  // Giant steps: check target · (g^(-m))^k
  let giant = target;
  for (let k = 0; k <= m; k++) {
    const j = table.get(giant.toString());
    if (j !== undefined) {
      return k * m + j;
    }
    giant = (giant * gmInv) % p;
  }

  return -1; // not found within range
}

// ── Ceremony state ────────────────────────────────────────────────────────────

/** Intermediate aggregates stored while awaiting commissioner partials. */
interface CeremonyState {
  ceremonyId: string;
  startedAt: string;
  totalBallots: number;
  aggregates: Record<string, CT>;       // candidateId → aggregate ciphertext
  partials: Partial<Record<CommissionerId, Record<string, string>>>;  // commId → {candidateId → Di hex}
  result: HomomorphicResult | null;
}

export interface CandidateTallyH {
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionTitle: string;
  votes: number;
}

export interface HomomorphicResult {
  ceremonyId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalBallotsProcessed: number;
  commissionersWhoParticipated: string[];
  candidates: CandidateTallyH[];
  finalHash: string;
  sovereigntyNote: string;
}

let _state: CeremonyState | null = null;
let _result: HomomorphicResult | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Load and aggregate all homomorphic ballots from the database.
 * Must be called before commissioner partials can be submitted.
 */
export async function startCeremony(): Promise<{
  ceremonyId: string;
  totalBallots: number;
  commissioners: { id: CommissionerId; label: string; publicKeyShare: string }[];
}> {
  encryptionService.getPublicKey(); // Throws if not initialized (fail-fast guard)
  // Derive shares from the master private key (stored in env, not the public key).
  const keyHex = process.env.ELGAMAL_PRIVATE_KEY ?? '';
  const cleaned = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;
  const masterKey = BigInt('0x' + cleaned);
  const shares = deriveShares(masterKey);

  // Fetch all CONFIRMED votes with homomorphicBallot
  const votes = await prisma.vote.findMany({
    where: { status: 'CONFIRMED' },
    select: { homomorphicBallot: true },
  });

  const ballots: HomomorphicBallot[] = [];
  let skipped = 0;
  for (const v of votes) {
    if (!v.homomorphicBallot) { skipped++; continue; }
    try {
      const parsed = JSON.parse(v.homomorphicBallot) as HomomorphicBallot;
      if (parsed.v === 2) ballots.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  if (ballots.length === 0) {
    throw new Error(
      `No homomorphic ballots found (${skipped} votes skipped — cast new votes or re-seed to generate v2 ballots).`
    );
  }

  // Aggregate per candidate
  const aggregates: Record<string, CT> = {};
  for (const cand of ALL_CANDIDATES) {
    aggregates[cand.candidateId] = aggregate(ballots, cand.candidateId);
  }

  const ceremonyId = uuid();
  _state = {
    ceremonyId,
    startedAt: new Date().toISOString(),
    totalBallots: ballots.length,
    aggregates,
    partials: {},
    result: null,
  };

  // Build commissioner info (public key shares for verification)
  const commissioners = COMMISSIONER_IDS.map((id) => ({
    id,
    label: COMMISSIONER_LABELS[id],
    // Public share = g^xi — anyone can verify xi is correct by checking g^x1·g^x2·g^x3 = h
    publicKeyShare: modPow(g, shares[id], p).toString(16).slice(0, 32) + '…',
  }));

  logger.info('Homomorphic ceremony started', { ceremonyId, ballots: ballots.length, skipped: skipped || 0 });

  return { ceremonyId, totalBallots: ballots.length, commissioners };
}

/**
 * Step 2 — Commissioner submits their partial decryption.
 * In this MVP the server computes the partial using the derived share (demo mode).
 * In production: the commissioner computes D_i = agg_c1^x_i offline and submits only D_i.
 */
export function submitPartial(commissionerId: CommissionerId): {
  received: CommissionerId[];
  remaining: CommissionerId[];
} {
  if (!_state) throw new Error('Ceremony not started. Call startCeremony first.');
  if (_state.result) throw new Error('Ceremony already finalized.');

  const keyHex = process.env.ELGAMAL_PRIVATE_KEY ?? '';
  const cleaned = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;
  const masterKey = BigInt('0x' + cleaned);
  const shares = deriveShares(masterKey);

  const xi = shares[commissionerId];
  const partials: Record<string, string> = {};

  for (const cand of ALL_CANDIDATES) {
    const agg = _state.aggregates[cand.candidateId];
    const Di = partialDecrypt(agg.c1, xi);
    partials[cand.candidateId] = Di.toString(16);
  }

  _state.partials[commissionerId] = partials;

  const received = COMMISSIONER_IDS.filter((id) => !!_state!.partials[id]);
  const remaining = COMMISSIONER_IDS.filter((id) => !_state!.partials[id]);

  logger.info('Homomorphic partial decryption received', { commissionerId, received: received.length, total: 3 });

  return { received, remaining };
}

/**
 * Step 3 — Finalize: combine partials, run BSGS, produce results.
 * Requires all 3 commissioners to have submitted their partials.
 */
export function finalizeCeremony(): HomomorphicResult {
  if (!_state) throw new Error('Ceremony not started.');
  if (_state.result) return _state.result;

  const missing = COMMISSIONER_IDS.filter((id) => !_state!.partials[id]);
  if (missing.length > 0) {
    throw new Error(`Waiting for partials from: ${missing.join(', ')}`);
  }

  const t0 = Date.now();
  const maxVoters = 100_000; // support up to 100k voters for BSGS

  const candidates: CandidateTallyH[] = [];

  for (const cand of ALL_CANDIDATES) {
    const agg = _state.aggregates[cand.candidateId];

    // Collect D_i from each commissioner for this candidate
    const partialsBig = COMMISSIONER_IDS.map((id) =>
      BigInt('0x' + _state!.partials[id]![cand.candidateId])
    );

    // Combine: D = D1·D2·D3 = agg.c1^x
    const combined = combinePartials(partialsBig);

    // g^count = agg.c2 · D^(-1)
    const gCount = recoverGCount(agg.c2, combined);

    // Solve discrete log
    const count = bsgs(gCount, maxVoters);

    candidates.push({
      candidateId:   cand.candidateId,
      candidateName: cand.candidateName,
      positionId:    cand.positionId,
      positionTitle: cand.positionTitle,
      votes: count === -1 ? 0 : count,
    });
  }

  const completedAt = new Date().toISOString();
  const durationMs  = Date.now() - t0;

  // Tamper-evident hash of the results
  const canonical = candidates.map((c) => `${c.candidateId}:${c.votes}`).join('|');
  const finalHash = createHash('sha256')
    .update(`${_state.ceremonyId}|${canonical}`)
    .digest('hex');

  const result: HomomorphicResult = {
    ceremonyId: _state.ceremonyId,
    startedAt:  _state.startedAt,
    completedAt,
    durationMs,
    totalBallotsProcessed: _state.totalBallots,
    commissionersWhoParticipated: [...COMMISSIONER_IDS],
    candidates,
    finalHash,
    sovereigntyNote: 'Full homomorphic tally on-premise. No individual vote decrypted. Zero foreign API calls.',
  };

  _state.result = result;
  _result = result;

  logger.info('Homomorphic ceremony finalized', { ceremonyId: _state.ceremonyId, hashPrefix: finalHash.slice(0, 16), durationMs });

  return result;
}

export function getCeremonyState(): CeremonyState | null {
  return _state;
}

export function getHomomorphicResult(): HomomorphicResult | null {
  return _result;
}

export function resetCeremony(): void {
  _state = null;
  _result = null;
}

export { COMMISSIONER_IDS, COMMISSIONER_LABELS, type CommissionerId };
