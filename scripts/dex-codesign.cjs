#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// dex-codesign: the publisher-side signing tool. Separate from the DEX app.
// The private signing key is supplied by the publisher via --key <path> or the
// DEX_SIGNING_KEY / DEX_SIGNING_KEY_FILE env vars. It is NEVER read from, written
// to, or embedded in the DEX repo/build/runtime.
//
//   node scripts/dex-codesign.cjs keygen [--out priv.key]
//   node scripts/dex-codesign.cjs sign  <appdir> [--key priv.key] [--out app.dexplug]
//   node scripts/dex-codesign.cjs verify <app.dexplug> [--pub <hex> | --trust trust.json]
//
// The digest + signature algorithm here MUST match src/main/security/codesign.ts
// (DIGEST_VERSION 'dexsig-v1'); tests/unit/codesign.test.ts pins a shared vector.
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIGEST_VERSION = 'dexsig-v1';
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const MANIFEST_NAMES = ['manifest.json', 'plugin.json', 'package.json'];

function publicKeyFromHex(hex) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}
function privateKeyFromHex(hex) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) throw new Error('ed25519 private key seed must be 32 bytes');
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
}
function keyIdForPublicKey(pubHex) {
  return crypto.createHash('sha256').update(Buffer.from(pubHex, 'hex')).digest('hex').slice(0, 16);
}
function pubHexFromPrivHex(privHex) {
  const pub = crypto.createPublicKey(privateKeyFromHex(privHex));
  return Buffer.from(pub.export({ format: 'der', type: 'spki' })).subarray(-32).toString('hex');
}

function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k]);
    return out;
  }
  return v;
}

// Canonical bundle digest — identical to computeBundleDigest in codesign.ts.
function computeBundleDigest(manifest, files) {
  const h = crypto.createHash('sha256');
  h.update(DIGEST_VERSION);
  h.update('\n');
  h.update('manifest\0');
  h.update(JSON.stringify(canonicalize(manifest)));
  h.update('\0');
  for (const p of Object.keys(files).sort()) {
    const fileHash = crypto.createHash('sha256').update(Buffer.from(files[p], 'base64')).digest('hex');
    h.update(p); h.update('\0'); h.update(fileHash); h.update('\0');
  }
  return h.digest('hex');
}

// published.sha256 — identical to hashFiles in PluginPublisher.ts (integrity layer).
function hashFiles(files) {
  const h = crypto.createHash('sha256');
  for (const p of Object.keys(files).sort()) {
    h.update(p); h.update('\0'); h.update(files[p]); h.update('\0');
  }
  return h.digest('hex');
}

function collectFiles(rootDir, relPrefix, out) {
  const dir = relPrefix ? path.join(rootDir, relPrefix) : rootDir;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.' || name === '..' || name.startsWith('.git') || name === 'node_modules') continue;
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    const full = path.join(rootDir, rel);
    const st = fs.statSync(full);
    if (st.isDirectory()) collectFiles(rootDir, rel, out);
    else if (st.isFile()) out[rel] = fs.readFileSync(full).toString('base64');
  }
}

function loadManifest(appdir) {
  for (const name of MANIFEST_NAMES) {
    const p = path.join(appdir, name);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error('No manifest.json / plugin.json / package.json found in ' + appdir);
}

function readPrivateKey(args) {
  const keyPath = args['--key'] || process.env.DEX_SIGNING_KEY_FILE;
  if (keyPath) return fs.readFileSync(keyPath, 'utf8').trim();
  if (process.env.DEX_SIGNING_KEY) return process.env.DEX_SIGNING_KEY.trim();
  throw new Error('No signing key: pass --key <path> or set DEX_SIGNING_KEY / DEX_SIGNING_KEY_FILE');
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i]] = argv[i + 1]; i++; }
    else positional.push(argv[i]);
  }
  return { positional, flags };
}

function cmdKeygen(flags) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).subarray(-32).toString('hex');
  const seed = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' })).subarray(-32).toString('hex');
  const keyId = keyIdForPublicKey(pub);
  if (flags['--out']) {
    fs.writeFileSync(flags['--out'], seed + '\n', { mode: 0o600 });
    console.log('Private key written to', flags['--out'], '(keep this secret, never commit)');
  } else {
    console.log('PRIVATE KEY (keep secret, never commit):', seed);
  }
  console.log('PUBLIC KEY  (add to trust store):', pub);
  console.log('KEY ID:', keyId);
}

function cmdSign(appdir, flags) {
  if (!appdir) throw new Error('usage: sign <appdir> [--key priv.key] [--out app.dexplug]');
  const privHex = readPrivateKey(flags);
  const pubHex = pubHexFromPrivHex(privHex);
  const keyId = keyIdForPublicKey(pubHex);

  const manifest = loadManifest(appdir);
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('Manifest must include id, name, and version');
  }
  const files = {};
  collectFiles(appdir, '', files);

  const digest = computeBundleDigest(manifest, files);
  const signature = crypto.sign(null, Buffer.from(digest, 'hex'), privateKeyFromHex(privHex)).toString('hex');
  const author = typeof manifest.author === 'string' ? manifest.author : (manifest.author && manifest.author.name) || 'unknown';

  const envelope = {
    format: 'dexplug-v1',
    manifest,
    files,
    published: { author, version: manifest.version, sha256: hashFiles(files), publishedAt: Date.now(), downloads: 0 },
    signature: { keyId, algorithm: 'ed25519', digest, signature, signedAt: Date.now() },
  };

  const out = flags['--out'] || path.join(process.cwd(), `${manifest.id}-${manifest.version}.dexplug`);
  fs.writeFileSync(out, JSON.stringify(envelope), 'utf8');
  console.log('Signed package written to', out);
  console.log('  keyId:', keyId, ' files:', Object.keys(files).length, ' digest:', digest.slice(0, 16) + '...');
}

function cmdVerify(pkgPath, flags) {
  if (!pkgPath) throw new Error('usage: verify <app.dexplug> [--pub <hex> | --trust trust.json]');
  const env = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const block = env && env.signature;
  if (!block || !block.signature || !block.keyId) { fail('unsigned: no signature block'); return; }

  let pubHex = flags['--pub'];
  if (!pubHex && flags['--trust']) {
    const trust = JSON.parse(fs.readFileSync(flags['--trust'], 'utf8'));
    const entry = (trust.keys || []).find((k) => k.keyId === block.keyId);
    if (!entry) { fail(`untrusted-key: ${block.keyId} not in trust store`); return; }
    if (entry.status === 'revoked') { fail(`revoked-key: ${block.keyId}`); return; }
    pubHex = entry.publicKey;
  }
  if (!pubHex) { fail('cannot verify: pass --pub <hex> or --trust <trust.json>'); return; }

  const digest = computeBundleDigest(env.manifest, env.files);
  if (digest !== block.digest) { fail('tampered-bundle: recomputed digest does not match'); return; }
  let ok = false;
  try { ok = crypto.verify(null, Buffer.from(digest, 'hex'), publicKeyFromHex(pubHex), Buffer.from(block.signature, 'hex')); } catch { ok = false; }
  if (!ok) { fail('bad-signature: signature does not verify'); return; }
  console.log('OK: signature valid. keyId', block.keyId, ' app', (env.manifest && env.manifest.id) || '?', (env.manifest && env.manifest.version) || '');
}

function fail(msg) {
  console.error('REJECTED ->', msg);
  process.exitCode = 1;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  try {
    if (cmd === 'keygen') return cmdKeygen(flags);
    if (cmd === 'sign') return cmdSign(positional[0], flags);
    if (cmd === 'verify') return cmdVerify(positional[0], flags);
    console.log('dex-codesign — DEX publisher signing tool');
    console.log('  keygen [--out priv.key]');
    console.log('  sign  <appdir> [--key priv.key] [--out app.dexplug]   (or DEX_SIGNING_KEY[_FILE] env)');
    console.log('  verify <app.dexplug> [--pub <hex> | --trust trust.json]');
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e));
    process.exitCode = 1;
  }
}

main();
