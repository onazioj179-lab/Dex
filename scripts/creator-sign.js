#!/usr/bin/env node
// Owner-only signer for DEX Creator Access challenges.
//
// Usage:
//   1. Open DEX -> Settings -> Creator Access -> "Generate challenge"
//   2. Copy the challenge string
//   3. Run:  node scripts/creator-sign.js "<challenge>"
//   4. Paste the printed signature back into the panel and click "Verify & unlock"
//
// The private seed below NEVER leaves this file. Do not commit a populated
// PRIVATE_SEED_HEX to a public repo. If you need to rotate, regenerate a
// keypair and update both this file and CREATOR_PUBKEY_HEX in
// native/src/creator_key.rs.

const crypto = require('crypto');

const PRIVATE_SEED_HEX =
  process.env.DEX_CREATOR_SEED ||
  'REDACTED';

const challenge = process.argv[2];
if (!challenge) {
  console.error('usage: node scripts/creator-sign.js "<challenge>"');
  process.exit(1);
}

// Build PKCS8 DER for an Ed25519 raw seed: 16-byte fixed prefix + 32-byte seed.
const PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const seed = Buffer.from(PRIVATE_SEED_HEX, 'hex');
if (seed.length !== 32) {
  console.error('PRIVATE_SEED_HEX must be 32 bytes (64 hex chars)');
  process.exit(1);
}
const pkcs8 = Buffer.concat([PKCS8_PREFIX, seed]);
const key = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });

const sig = crypto.sign(null, Buffer.from(challenge, 'utf8'), key);
console.log(sig.toString('hex'));
