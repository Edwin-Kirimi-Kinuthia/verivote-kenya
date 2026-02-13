#!/usr/bin/env node

/**
 * Generate an ElGamal key pair for VeriVote vote encryption.
 *
 * Usage:
 *   node backend/scripts/generate-elgamal-keys.js
 *
 * Copy the ELGAMAL_PRIVATE_KEY value into your backend/.env file.
 * The public key is derived automatically at server startup.
 */

import { randomBytes } from 'crypto';

const privateKeyHex = randomBytes(128).toString('hex');

console.log('=== ElGamal Key Pair (2048-bit FFDHE group) ===\n');
console.log('Add this to your backend/.env:\n');
console.log(`ELGAMAL_PRIVATE_KEY=${privateKeyHex}\n`);
console.log('The public key is derived from the private key at startup.');
console.log('Keep the private key SECRET. Never commit it to version control.');
