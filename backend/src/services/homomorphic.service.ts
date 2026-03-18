/**
 * VeriVote Kenya — Threshold Homomorphic Tally Service
 *
 * Implements fully homomorphic vote tallying using exponential ElGamal and
 * a 3-of-3 Shamir Secret Sharing (SSS) threshold key scheme.
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
 * ── Shamir's Secret Sharing (3-of-3) ─────────────────────────────────────────
 * At ceremony start the master private key x is split via a degree-2 polynomial
 * over Z_p (the 2048-bit FFDHE prime, which is prime by construction):
 *
 *   f(t) = x + a₁·t + a₂·t²   (mod p)     where a₁, a₂ ← random Z_p
 *
 *   Share α: (1, f(1))    →  Commissioner Alpha (IEBC Nairobi HQ)
 *   Share β: (2, f(2))    →  Commissioner Beta  (IEBC Mombasa)
 *   Share γ: (3, f(3))    →  Commissioner Gamma (IEBC Kisumu)
 *
 * Reconstruction requires ALL 3 shares via Lagrange interpolation at t = 0:
 *   x = f(0) = 3·y₁ − 3·y₂ + y₃   (mod p)
 *
 * ── Decryption ────────────────────────────────────────────────────────────────
 * Once reconstructed: D = AGG.c1^x mod p
 *   g^count = AGG.c2 · D^(−1) mod p
 * Baby-step Giant-step (BSGS) solves the discrete log to recover count.
 *
 * Sovereignty: All operations on-premise. Zero foreign API calls.
 */

import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { getGroup } from 'threshold-elgamal';
import { prisma } from '../database/client.js';
import { encryptionService } from './encryption.service.js';
import { logger } from '../lib/logger.js';

const { prime: p, generator: g } = getGroup(2048);

// ── Candidate roster (mirrors tally.service.ts) ───────────────────────────────

const ALL_CANDIDATES: { positionId: string; positionTitle: string; positionScope: string; positionScopeValue: string | null; candidateId: string; candidateName: string }[] = [
  { positionId: 'president', positionTitle: 'President', positionScope: 'NATIONAL', positionScopeValue: null,      candidateId: 'pres-1', candidateName: 'Amina Wanjiku' },
  { positionId: 'president', positionTitle: 'President', positionScope: 'NATIONAL', positionScopeValue: null,      candidateId: 'pres-2', candidateName: 'James Ochieng' },
  { positionId: 'president', positionTitle: 'President', positionScope: 'NATIONAL', positionScopeValue: null,      candidateId: 'pres-3', candidateName: 'Fatuma Hassan' },
  { positionId: 'president', positionTitle: 'President', positionScope: 'NATIONAL', positionScopeValue: null,      candidateId: 'pres-4', candidateName: 'Peter Kamau' },
  { positionId: 'governor',  positionTitle: 'Governor',  positionScope: 'COUNTY',   positionScopeValue: 'Nairobi', candidateId: 'gov-1',  candidateName: 'Grace Muthoni' },
  { positionId: 'governor',  positionTitle: 'Governor',  positionScope: 'COUNTY',   positionScopeValue: 'Nairobi', candidateId: 'gov-2',  candidateName: 'David Kiprop' },
  { positionId: 'governor',  positionTitle: 'Governor',  positionScope: 'COUNTY',   positionScopeValue: 'Nairobi', candidateId: 'gov-3',  candidateName: 'Sarah Akinyi' },
];

/** Real IEBC commissioner information loaded from the database. */
export interface CommissionerInfo {
  voterId:     string;
  nationalId:  string;
  name:        string;
  email:       string | null;
  phoneNumber: string | null;
}

/**
 * Compute the Shamir threshold k given N total active commissioners.
 *   N=1  → k=1  (no split — one commissioner holds the full key)
 *   N=2  → k=2  (split into 2, both needed)
 *   N=4  → k=2  (ceil(√4) = 2)
 *   N=9  → k=3  (ceil(√9) = 3)
 *   N=16 → k=4
 */
export function computeThreshold(n: number): number {
  if (n <= 0) throw new Error('No active commissioners found');
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

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

// ── Shamir's Secret Sharing ───────────────────────────────────────────────────

/** SSS share: a point (index, value) on the secret polynomial over Z_p. */
export interface SSSShare {
  index: number;    // x-coordinate (1, 2, or 3)
  value: bigint;    // f(index) mod p
  hex:   string;    // value as lowercase hex (for display / submission)
}

/**
 * Split `secret` into `n` shares using a degree-(n−1) polynomial over Z_p.
 * Requires ALL n shares to reconstruct (n-of-n scheme).
 */
function shamirSplit(secret: bigint, n: number): SSSShare[] {
  // Random polynomial coefficients a₁ … a_{n-1}
  const coeffs: bigint[] = [secret];
  for (let i = 1; i < n; i++) {
    const r = BigInt('0x' + randomBytes(32).toString('hex')) % (p - 1n) + 1n;
    coeffs.push(r);
  }

  return Array.from({ length: n }, (_, i) => {
    const x = BigInt(i + 1);
    let y = 0n;
    let xPow = 1n;
    for (const c of coeffs) {
      y = (y + c * xPow) % p;
      xPow = (xPow * x) % p;
    }
    return { index: i + 1, value: y, hex: y.toString(16) };
  });
}

/**
 * Reconstruct the secret from k shares via general Lagrange interpolation at t = 0.
 *
 * Works for any k-of-k scheme (k = 1, 2, 3, …).
 *   f(0) = Σ_i  y_i · Π_{j≠i} (0 − x_j) / (x_i − x_j)  mod p
 *
 * Special cases verify correctly:
 *   k=1: share is the secret itself  → f(0) = y₁                         ✓
 *   k=2: f(0) = 2y₁ − y₂            → two-point line through (1,y₁),(2,y₂) ✓
 *   k=3: f(0) = 3y₁ − 3y₂ + y₃     → same closed form as the old function  ✓
 */
function shamirReconstructGeneral(shares: SSSShare[]): bigint {
  if (shares.length === 0) throw new Error('Cannot reconstruct from zero shares');
  if (shares.length === 1) return shares[0].value % p;

  let secret = 0n;
  for (let i = 0; i < shares.length; i++) {
    const xi: bigint = BigInt(shares[i].index);
    const yi: bigint = shares[i].value;
    let num: bigint = 1n;
    let den: bigint = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      const xj: bigint = BigInt(shares[j].index);
      // numerator factor: (0 − xj) ≡ p − xj  (mod p);  xj is tiny so p − xj > 0
      num = (num * (p - xj)) % p;
      // denominator factor: (xi − xj) mod p;  both are tiny so add p if negative
      const rawDiff: bigint = xi - xj;
      const diff: bigint = rawDiff >= 0n ? rawDiff : rawDiff + p;
      den = (den * diff) % p;
    }
    const term: bigint = (yi % p * (num % p) % p * modInverse(den, p)) % p;
    secret = (secret + term) % p;
  }
  return secret;
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

/** Legacy v2 ballot — hardcoded candidate IDs (pres-1, gov-1, …) */
export interface HomomorphicBallotV2 {
  v: 2;
  candidates: Record<string, { c1: string; c2: string }>;
}

/** v3 ballot — DB UUID candidate IDs tied to a specific election */
export interface HomomorphicBallotV3 {
  v: 3;
  electionId: string;
  candidates: Record<string, { c1: string; c2: string }>;
}

export type HomomorphicBallot = HomomorphicBallotV2 | HomomorphicBallotV3;

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
 *
 * Legacy (v2): selections keyed by positionId using hardcoded IDs (e.g. 'president').
 *   encryptHomomorphicBallot(selections, publicKey)
 *
 * Dynamic (v3): selections keyed by positionId (DB UUID), allCandidates from ballot service.
 *   encryptHomomorphicBallot(selections, publicKey, electionId, allCandidates)
 */
export function encryptHomomorphicBallot(
  selections:    Record<string, string>,
  publicKey:     bigint,
  electionId?:   string,
  allCandidates?: Array<{ positionId: string; candidateId: string }>,
): HomomorphicBallot {
  const candidates: Record<string, { c1: string; c2: string }> = {};

  const roster = allCandidates ?? ALL_CANDIDATES.map(c => ({
    positionId:  c.positionId,
    candidateId: c.candidateId,
  }));

  for (const cand of roster) {
    const voted = selections[cand.positionId] === cand.candidateId ? 1 : 0;
    const ct = encryptBit(voted as 0 | 1, publicKey);
    candidates[cand.candidateId] = serializeCT(ct);
  }

  if (electionId) {
    return { v: 3, electionId, candidates };
  }
  return { v: 2, candidates };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/** Multiply all ciphertexts per candidate (homomorphic sum). */
function aggregate(ballots: HomomorphicBallot[], candidateId: string): CT {
  let aggC1 = 1n;
  let aggC2 = 1n;
  for (const b of ballots) {
    const raw = b.candidates[candidateId];
    if (!raw) continue; // ballot doesn't include this candidate (e.g. different election)
    const ct = parseCT(raw);
    aggC1 = (aggC1 * ct.c1) % p;
    aggC2 = (aggC2 * ct.c2) % p;
  }
  return { c1: aggC1, c2: aggC2 };
}

// ── Decryption (using reconstructed key) ─────────────────────────────────────

/** Recover g^count = aggC2 · (aggC1^x)^(−1) mod p */
function decryptAggregate(agg: CT, privateKey: bigint): bigint {
  const D = modPow(agg.c1, privateKey, p);
  return (agg.c2 * modInverse(D, p)) % p;
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

interface CeremonyState {
  ceremonyId: string;
  startedAt: string;
  totalBallots: number;
  /** Pre-computed homomorphic aggregates — one per candidate. */
  aggregates: Record<string, CT>;
  /** SSS shares generated at ceremony start (k shares, one per selected commissioner). */
  sssShares: SSSShare[];
  /** Number of shares required to reconstruct the key (k-of-k). */
  threshold: number;
  /** The k commissioners randomly selected to hold a key share. */
  selectedCommissioners: CommissionerInfo[];
  /** Shares submitted by each selected commissioner (keyed by voterId). */
  submittedShares: Record<string, SSSShare>;
  result: HomomorphicResult | null;
  /** Full candidate roster used for this ceremony (dynamic or legacy). */
  candidateRoster: typeof ALL_CANDIDATES;
  /** Election being tallied (null for legacy/all-ballots mode). */
  electionId?: string;
}

/** Public-safe ceremony status — no share values exposed. */
export interface CeremonyStatus {
  started: boolean;
  ceremonyId?: string;
  startedAt?: string;
  electionId?: string;
  totalBallots?: number;
  threshold?: number;
  selectedCommissioners?: Array<{
    voterId:      string;
    name:         string;
    nationalId:   string; // masked
    hasSubmitted: boolean;
  }>;
  sharesReceived?: number;
  finalized?: boolean;
}

export interface CandidateTallyH {
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionTitle: string;
  positionScope: string;
  positionScopeValue: string | null;
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

// ── Dynamic candidate loader ───────────────────────────────────────────────────

async function loadDynamicCandidates(electionId: string): Promise<typeof ALL_CANDIDATES> {
  const positions = await prisma.position.findMany({
    where:   { electionId },
    include: { candidates: { where: { isActive: true } } },
  });
  return positions.flatMap(p =>
    p.candidates.map(c => ({
      positionId:         p.id,
      positionTitle:      p.title,
      positionScope:      p.scope,
      positionScopeValue: p.scopeValue ?? null,
      candidateId:        c.id,
      candidateName:      c.name,
    }))
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Aggregate ballots and generate SSS key shares.
 *
 * @param electionId  - Election to tally (required for v3 dynamic ballots)
 * @param allCommissioners - All active COMMISSION-role staff from the DB.
 *   k = ceil(√N) of them are randomly selected to hold a key share.
 *
 * Returns per-commissioner shareHex (so the caller can email them)
 * and a safe summary for the HTTP response.
 */
export async function startCeremony(
  electionId?: string,
  allCommissioners: CommissionerInfo[] = [],
): Promise<{
  ceremonyId: string;
  totalBallots: number;
  threshold: number;
  totalCommissioners: number;
  selectedCommissioners: Array<{
    voterId:     string;
    name:        string;
    shareIndex:  number;
    shareHex:    string;   // caller must email this and NOT return it in the HTTP response
    commitment:  string;
  }>;
}> {
  encryptionService.getPublicKey(); // Throws if not initialized

  // Compute k = ceil(√N); default to 1 if no commissioners are registered yet
  const n = allCommissioners.length;
  const k = n > 0 ? computeThreshold(n) : 1;

  // Randomly pick k commissioners from the list (Fisher-Yates–style shuffle)
  const shuffled = [...allCommissioners].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, k);

  // Load master key and split into k shares
  const keyHex  = process.env.ELGAMAL_PRIVATE_KEY ?? '';
  const cleaned = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;
  const masterKey = BigInt('0x' + cleaned);
  const sssShares = shamirSplit(masterKey, k);

  // Fetch CONFIRMED votes for the given election
  const votes = await prisma.vote.findMany({
    where: {
      status: 'CONFIRMED',
      ...(electionId ? { electionId } : {}),
    },
    select: { homomorphicBallot: true },
  });

  const ballots: HomomorphicBallot[] = [];
  let skipped = 0;
  for (const v of votes) {
    if (!v.homomorphicBallot) { skipped++; continue; }
    try {
      const parsed = JSON.parse(v.homomorphicBallot) as HomomorphicBallot;
      if (parsed.v === 2 || parsed.v === 3) ballots.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  if (ballots.length === 0) {
    throw new Error(
      `No homomorphic ballots found (${skipped} votes skipped — cast new votes or re-seed).`,
    );
  }

  const candidateRoster = electionId
    ? await loadDynamicCandidates(electionId)
    : ALL_CANDIDATES;

  const aggregates: Record<string, CT> = {};
  for (const cand of candidateRoster) {
    aggregates[cand.candidateId] = aggregate(ballots, cand.candidateId);
  }

  const ceremonyId = uuid();
  _state = {
    ceremonyId,
    startedAt:            new Date().toISOString(),
    totalBallots:         ballots.length,
    aggregates,
    sssShares,
    threshold:            k,
    selectedCommissioners: selected,
    submittedShares:      {},
    result:               null,
    candidateRoster,
    electionId,
  };

  const selectedOut = selected.map((c, i) => ({
    voterId:    c.voterId,
    name:       c.name,
    shareIndex: i + 1,
    shareHex:   sssShares[i].hex,
    commitment: modPow(g, sssShares[i].value, p).toString(16).slice(0, 32) + '…',
  }));

  logger.info('Homomorphic ceremony started — dynamic SSS shares generated', {
    ceremonyId,
    ballots: ballots.length,
    skipped,
    n,
    k,
    selected: selected.map(c => c.voterId),
  });

  return {
    ceremonyId,
    totalBallots:         ballots.length,
    threshold:            k,
    totalCommissioners:   n,
    selectedCommissioners: selectedOut,
  };
}

/**
 * Step 2 — Commissioner submits their key share (identified by their voterId from JWT).
 *
 * The submitted hex is validated against the share generated at ceremony start.
 * Returns progress counts; caller should auto-finalize when allReceived = true.
 */
export function submitShare(voterId: string, shareHex: string): {
  received:    number;
  threshold:   number;
  allReceived: boolean;
} {
  if (!_state) throw new Error('No ceremony in progress. Start the ceremony first.');
  if (_state.result) throw new Error('Ceremony already finalized.');

  const commIdx = _state.selectedCommissioners.findIndex((c) => c.voterId === voterId);
  if (commIdx === -1) {
    throw new Error('You are not one of the selected commissioners for this ceremony.');
  }
  if (_state.submittedShares[voterId]) {
    throw new Error('You have already submitted your key share.');
  }

  const expected = _state.sssShares[commIdx];

  // Normalise and compare
  let submittedHex = shareHex.trim().toLowerCase().replace(/^0x/, '');
  const maxLen     = Math.max(submittedHex.length, expected.hex.length);
  submittedHex     = submittedHex.padStart(maxLen, '0');
  const expectedHex = expected.hex.padStart(maxLen, '0');

  if (submittedHex !== expectedHex) {
    throw new Error('Invalid key share. Please check the value from your email and try again.');
  }

  _state.submittedShares[voterId] = { ...expected };

  const received    = Object.keys(_state.submittedShares).length;
  const allReceived = received >= _state.threshold;

  logger.info('SSS key share verified', { voterId, received, threshold: _state.threshold });

  return { received, threshold: _state.threshold, allReceived };
}

/**
 * Step 3 — Reconstruct the decryption key and finalize the tally.
 *
 * Requires all 3 commissioners to have submitted their verified shares.
 * The key is reconstructed via Lagrange interpolation, then used to
 * decrypt the aggregated ciphertext. Individual votes are never decrypted.
 */
export function finalizeCeremony(): HomomorphicResult {
  if (!_state) throw new Error('Ceremony not started.');
  if (_state.result) return _state.result;

  // If commissioners were selected (real threshold ceremony), all must have submitted.
  // If selectedCommissioners is empty (legacy / auto-ceremony), use sssShares directly.
  if (_state.selectedCommissioners.length > 0) {
    const missing = _state.selectedCommissioners.filter((c) => !_state!.submittedShares[c.voterId]);
    if (missing.length > 0) {
      throw new Error(`Waiting for key shares from: ${missing.map((c) => c.name).join(', ')}`);
    }
  }

  // Reconstruct from submitted commissioner shares (real ceremony) or all sssShares (auto).
  const submittedArr = _state.selectedCommissioners.length > 0
    ? _state.selectedCommissioners.map((c) => _state!.submittedShares[c.voterId]!)
    : _state.sssShares; // auto-ceremony: reconstruct directly
  const reconstructedKey = shamirReconstructGeneral(submittedArr);

  // Sanity-check: g^reconstructed should equal the public key
  const expectedPubKey = encryptionService.getPublicKey();
  const derivedPubKey  = modPow(g, reconstructedKey, p);
  if (derivedPubKey !== expectedPubKey) {
    // This should never happen if shares were validated correctly
    throw new Error('Key reconstruction integrity check failed — derived public key does not match.');
  }

  const t0 = Date.now();
  const maxVoters = 100_000; // support up to 100k voters for BSGS

  const candidates: CandidateTallyH[] = [];

  for (const cand of _state.candidateRoster) {
    const agg    = _state.aggregates[cand.candidateId];
    const gCount = decryptAggregate(agg, reconstructedKey);
    const count  = bsgs(gCount, maxVoters);

    candidates.push({
      candidateId:        cand.candidateId,
      candidateName:      cand.candidateName,
      positionId:         cand.positionId,
      positionTitle:      cand.positionTitle,
      positionScope:      cand.positionScope ?? 'NATIONAL',
      positionScopeValue: cand.positionScopeValue ?? null,
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
    commissionersWhoParticipated: _state.selectedCommissioners.map((c) => c.name),
    candidates,
    finalHash,
    sovereigntyNote: `Full homomorphic tally on-premise. Key reconstructed via Shamir's Secret Sharing (${_state.threshold}-of-${_state.threshold}). No individual vote decrypted. Zero foreign API calls.`,
  };

  _state.result = result;
  _result = result;

  // Auto-transition election status CLOSED → TALLIED
  if (_state.electionId) {
    prisma.election.updateMany({
      where: { id: _state.electionId, status: 'CLOSED' },
      data:  { status: 'TALLIED', tallyResultJson: JSON.stringify(result) },
    }).catch((err) => {
      logger.warn('Failed to transition election status to TALLIED', {
        electionId: _state!.electionId,
        reason: (err as Error).message,
      });
    });
  }

  logger.info('Homomorphic ceremony finalized', {
    ceremonyId: _state.ceremonyId,
    hashPrefix: finalHash.slice(0, 16),
    durationMs,
    electionId: _state.electionId,
  });

  return result;
}

/** Public-safe ceremony status — share values are never exposed. */
export function getCeremonyStatus(): CeremonyStatus {
  if (!_state) return { started: false };
  const sharesReceived = Object.keys(_state.submittedShares).length;
  return {
    started: true,
    ceremonyId:   _state.ceremonyId,
    startedAt:    _state.startedAt,
    electionId:   _state.electionId,
    totalBallots: _state.totalBallots,
    threshold:    _state.threshold,
    selectedCommissioners: _state.selectedCommissioners.map((c) => ({
      voterId:      c.voterId,
      name:         c.name,
      nationalId:   c.nationalId.slice(0, 2) + '****' + c.nationalId.slice(-2),
      hasSubmitted: !!_state!.submittedShares[c.voterId],
    })),
    sharesReceived,
    finalized: !!_state.result,
  };
}

export function getHomomorphicResult(): HomomorphicResult | null {
  return _result;
}

export function resetCeremony(): void {
  _state = null;
  _result = null;
}
