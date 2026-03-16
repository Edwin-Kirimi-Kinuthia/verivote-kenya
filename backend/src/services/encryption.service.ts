import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { getGroup } from 'threshold-elgamal';

// 2048-bit FFDHE group (RFC 7919) via threshold-elgamal
const { prime: p, generator: g } = getGroup(2048);

// --- BigInt math helpers ---

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

function extGcd(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  let oldR = a, r = b;
  let oldS = 1n, s = 0n;
  let oldT = 0n, t = 1n;

  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }

  return { gcd: oldR, x: oldS, y: oldT };
}

function modInverse(a: bigint, mod: bigint): bigint {
  const { gcd, x } = extGcd(((a % mod) + mod) % mod, mod);
  if (gcd !== 1n) throw new Error('Modular inverse does not exist');
  return ((x % mod) + mod) % mod;
}

// --- Encryption Service ---

class EncryptionService {
  private privateKey: bigint | null = null;
  private publicKey: bigint | null = null;
  private initialized = false;

  /**
   * Initialize from environment. Call after dotenv.config().
   * Fails fast if ELGAMAL_PRIVATE_KEY is missing or malformed.
   */
  init(): void {
    const keyHex = process.env.ELGAMAL_PRIVATE_KEY;
    if (!keyHex) {
      throw new Error('ELGAMAL_PRIVATE_KEY environment variable is required');
    }

    const cleaned = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
      throw new Error('ELGAMAL_PRIVATE_KEY must be a hex string');
    }

    this.privateKey = BigInt('0x' + cleaned);

    if (this.privateKey <= 1n || this.privateKey >= p - 1n) {
      throw new Error('ELGAMAL_PRIVATE_KEY is out of valid range (must be in 2..p-2)');
    }

    // Derive public key: h = g^x mod p
    this.publicKey = modPow(g, this.privateKey, p);
    this.initialized = true;
  }

  /** Returns the derived public key h = g^x mod p. Required by external services. */
  getPublicKey(): bigint {
    this.ensureInitialized();
    return this.publicKey!;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('EncryptionService not initialized. Call init() first.');
    }
  }

  /**
   * Derive a 32-byte AES-256 key from the ElGamal private key using SHA-256.
   * This ties the symmetric key to the same root of trust as the asymmetric key.
   */
  private deriveAesKey(): Buffer {
    const privateKeyHex = this.privateKey!.toString(16).padStart(512, '0');
    return createHash('sha256').update(privateKeyHex).digest();
  }

  /**
   * Encrypt vote selections using AES-256-GCM.
   * Handles arbitrary-size ballots (including 6+ UUID-keyed positions).
   * Output format version 2 — backward-compatible with v1 ElGamal decryption.
   */
  encryptVote(selections: Record<string, string>): string {
    this.ensureInitialized();

    const sorted = JSON.stringify(selections, Object.keys(selections).sort());
    if (!sorted || sorted === '{}') {
      throw new Error('Vote data cannot be empty');
    }

    const aesKey = this.deriveAesKey();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(sorted, 'utf-8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
      v: 2,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    });
  }

  /**
   * Decrypt ciphertext envelope back to original selections.
   * Supports both v1 (ElGamal — legacy small ballots) and v2 (AES-256-GCM).
   */
  decryptVote(serializedCiphertext: string): Record<string, string> {
    this.ensureInitialized();

    const envelope = JSON.parse(serializedCiphertext) as { v: number; [key: string]: unknown };

    if (envelope.v === 2) {
      const aesKey = this.deriveAesKey();
      const iv = Buffer.from(envelope.iv as string, 'hex');
      const tag = Buffer.from(envelope.tag as string, 'hex');
      const data = Buffer.from(envelope.data as string, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
    }

    if (envelope.v === 1) {
      // Legacy ElGamal decryption (small ballots with short string keys)
      const c1 = BigInt('0x' + (envelope.c1 as string));
      const c2 = BigInt('0x' + (envelope.c2 as string));

      const s = modPow(c1, this.privateKey!, p);
      const sInv = modInverse(s, p);
      const m = (c2 * sInv) % p;

      let hex = m.toString(16);
      if (hex.length % 2 !== 0) hex = '0' + hex;
      const decoded = Buffer.from(hex, 'hex').toString('utf-8');
      return JSON.parse(decoded) as Record<string, string>;
    }

    throw new Error(`Unsupported ciphertext version: ${envelope.v}`);
  }

  /**
   * SHA-256 hash of the encrypted ciphertext string.
   * The hash is over the ciphertext, not the plaintext.
   */
  hashEncryptedData(serializedCiphertext: string): string {
    return createHash('sha256').update(serializedCiphertext).digest('hex');
  }
}

export const encryptionService = new EncryptionService();
