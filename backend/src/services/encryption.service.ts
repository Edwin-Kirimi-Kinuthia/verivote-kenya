import { createHash, randomBytes } from 'crypto';
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

// --- Envelope format ---

interface ElGamalEnvelope {
  v: number;
  c1: string;
  c2: string;
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
    console.log('Encryption service initialized (ElGamal 2048-bit)');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('EncryptionService not initialized. Call init() first.');
    }
  }

  /**
   * Encrypt vote selections using standard ElGamal.
   * selections -> sorted JSON -> BigInt -> (c1, c2) -> JSON envelope string
   */
  encryptVote(selections: Record<string, string>): string {
    this.ensureInitialized();

    const sorted = JSON.stringify(selections, Object.keys(selections).sort());
    const messageBytes = Buffer.from(sorted, 'utf-8');
    const m = BigInt('0x' + messageBytes.toString('hex'));

    if (m === 0n) {
      throw new Error('Vote data cannot be empty');
    }
    if (m >= p) {
      throw new Error('Vote data too large for encryption parameters');
    }

    // Random nonce r in [2, p-2]
    const rBytes = randomBytes(256);
    let r = BigInt('0x' + rBytes.toString('hex')) % (p - 3n) + 2n;

    // Standard ElGamal: c1 = g^r mod p, c2 = m * h^r mod p
    const c1 = modPow(g, r, p);
    const c2 = (m * modPow(this.publicKey!, r, p)) % p;

    // Zero out r (best-effort in JS)
    r = 0n;

    const envelope: ElGamalEnvelope = {
      v: 1,
      c1: c1.toString(16),
      c2: c2.toString(16),
    };

    return JSON.stringify(envelope);
  }

  /**
   * Decrypt ciphertext envelope back to original selections.
   * Used for tallying by authorized key holders.
   */
  decryptVote(serializedCiphertext: string): Record<string, string> {
    this.ensureInitialized();

    const envelope: ElGamalEnvelope = JSON.parse(serializedCiphertext);

    if (envelope.v !== 1) {
      throw new Error(`Unsupported ciphertext version: ${envelope.v}`);
    }

    const c1 = BigInt('0x' + envelope.c1);
    const c2 = BigInt('0x' + envelope.c2);

    // Decrypt: m = c2 * (c1^x)^(-1) mod p
    const s = modPow(c1, this.privateKey!, p);
    const sInv = modInverse(s, p);
    const m = (c2 * sInv) % p;

    // Convert BigInt back to UTF-8
    let hex = m.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const decoded = Buffer.from(hex, 'hex').toString('utf-8');

    return JSON.parse(decoded) as Record<string, string>;
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
