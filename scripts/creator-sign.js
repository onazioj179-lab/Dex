#!/usr/bin/env node
// Owner-only signer for DEX Creator Access challenges.
//
// The challenge contains newlines, so it cannot be passed safely as a single
// CLI argument. Use one of:
//
//   1. Pipe (recommended):
//        Get-Clipboard -Raw | node scripts/creator-sign.js | Set-Clipboard
//      Then paste the signature into the Settings panel.
//
//   2. From a file:
//        node scripts/creator-sign.js --file challenge.txt
//
//   3. From an env var (whole challenge as one string with literal \n):
//        $env:DEX_CHALLENGE = (Get-Clipboard -Raw); node scripts/creator-sign.js
//
// The seed below NEVER leaves this file. If this repo is public, set
// DEX_CREATOR_SEED in your environment instead and remove the inline value.

const crypto = require('crypto');
const fs = require('fs');

const PRIVATE_SEED_HEX =
  process.env.DEX_CREATOR_SEED ||
  'REDACTED';

function readChallenge() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      return fs.readFileSync(args[i + 1], 'utf8');
    }
  }
  if (process.env.DEX_CHALLENGE) return process.env.DEX_CHALLENGE;
  return fs.readFileSync(0, 'utf8');
}

let challenge = readChallenge();
// Strip a single trailing newline that pipes / clipboard often append, but
// preserve internal newlines that are part of the canonical challenge.
if (challenge.endsWith('\r\n')) challenge = challenge.slice(0, -2);
else if (challenge.endsWith('\n')) challenge = challenge.slice(0, -1);

if (!challenge) {
  console.error('error: empty challenge. Pipe it on stdin or pass --file <path>.');
  process.exit(1);
}

const seed = Buffer.from(PRIVATE_SEED_HEX, 'hex');
if (seed.length !== 32) {
  console.error('error: PRIVATE_SEED_HEX must be 32 bytes (64 hex chars)');
  process.exit(1);
}

// PKCS8 DER wrapper for an Ed25519 raw seed.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const pkcs8 = Buffer.concat([PKCS8_PREFIX, seed]);
const key = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });

const sig = crypto.sign(null, Buffer.from(challenge, 'utf8'), key);
process.stdout.write(sig.toString('hex'));
