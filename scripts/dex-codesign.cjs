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

// Forbidden code patterns — mirror src/main/plugins/PluginPublisher.ts.
const FORBIDDEN_PATTERNS = [
  [/\beval\s*\(/, 'eval() is forbidden'],
  [/\bnew\s+Function\s*\(/, 'new Function() is forbidden'],
  [/child_process/, 'child_process is not allowed'],
  [/process\.binding\s*\(/, 'process.binding() is not allowed'],
  [/__proto__\s*=/, 'prototype mutation is not allowed'],
  [/Object\.setPrototypeOf\s*\(/, 'setPrototypeOf is not allowed'],
];
function isTextFile(p) { return /\.(js|ts|tsx|jsx|json|md|css|html|txt|yml|yaml)$/i.test(p); }
function scanFiles(files) {
  const issues = [];
  for (const [p, b64] of Object.entries(files)) {
    if (!isTextFile(p)) continue;
    let text = '';
    try { text = Buffer.from(b64, 'base64').toString('utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const [re, reason] of FORBIDDEN_PATTERNS) if (re.test(lines[i])) issues.push({ file: p, line: i + 1, reason });
    }
  }
  return issues;
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
  // Accept either v1 (id/version) or v2 (packageId/packageVersion) manifests so a
  // DexPkgManifestV2 (formatVersion 2) signs without aliasing fields by hand.
  const mfId = manifest.id || manifest.packageId;
  const mfVersion = manifest.version || manifest.packageVersion;
  if (!mfId || !manifest.name || !mfVersion) {
    throw new Error('Manifest must include id/packageId, name, and version/packageVersion');
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
    published: { author, version: mfVersion, sha256: hashFiles(files), publishedAt: Date.now(), downloads: 0 },
    signature: { keyId, algorithm: 'ed25519', digest, signature, signedAt: Date.now() },
  };

  const out = flags['--out'] || path.join(process.cwd(), `${mfId}-${mfVersion}.dexplug`);
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
  console.log('OK: signature valid. keyId', block.keyId, ' app', (env.manifest && (env.manifest.id || env.manifest.packageId)) || '?', (env.manifest && (env.manifest.version || env.manifest.packageVersion)) || '');
}

// Developer pre-flight: the publish checklist a package must pass. Mirrors the
// in-app gate (src/shared/store/validationGate.ts) — block fail => rejected.
// Shared checklist evaluation — used by both `validate` and `publish`.
function evaluateEnvelopeCli(env, flags) {
  const block = env && env.signature;
  const manifest = env && env.manifest;
  const files = (env && env.files) || {};
  const checks = [];

  let sigOk = false; let sigReason = '';
  if (!block || !block.signature || !block.keyId) { sigReason = 'no signature block'; }
  else {
    let pubHex = flags['--pub'];
    if (!pubHex && flags['--trust']) {
      try {
        const trust = JSON.parse(fs.readFileSync(flags['--trust'], 'utf8'));
        const entry = (trust.keys || []).find((k) => k.keyId === block.keyId);
        if (!entry) sigReason = `key ${block.keyId} not in trust store`;
        else if (entry.status === 'revoked') sigReason = `key ${block.keyId} revoked`;
        else pubHex = entry.publicKey;
      } catch { sigReason = 'trust file unreadable'; }
    }
    if (pubHex && !sigReason) {
      const digest = computeBundleDigest(manifest, files);
      if (digest !== block.digest) sigReason = 'digest mismatch (tampered)';
      else {
        try { sigOk = crypto.verify(null, Buffer.from(digest, 'hex'), publicKeyFromHex(pubHex), Buffer.from(block.signature, 'hex')); } catch { sigOk = false; }
        if (!sigOk) sigReason = 'signature does not verify';
      }
    } else if (!sigReason) { sigReason = 'no key (pass --pub or --trust)'; }
  }
  checks.push(['signed by a trusted key', sigOk, 'block', sigReason]);

  // Integrity is a function of the bundle bytes alone — independent of whether a
  // signature is present (the signature check above reports that separately).
  const haveSha = !!(env.published && env.published.sha256);
  const integrityOk = haveSha && hashFiles(files) === env.published.sha256;
  checks.push(['bundle integrity (sha256)', integrityOk, 'block', integrityOk ? '' : (haveSha ? 'file hash mismatch' : 'no published.sha256 to compare')]);

  const issues = scanFiles(files);
  checks.push(['no forbidden code patterns', issues.length === 0, 'block', issues[0] ? `${issues[0].file}:${issues[0].line} ${issues[0].reason}` : '']);

  const manifestOk = !!(manifest && (manifest.id || manifest.packageId) && manifest.name && (manifest.version || manifest.packageVersion));
  checks.push(['manifest fields (id/name/version)', manifestOk, 'block', manifestOk ? '' : 'missing fields']);

  const totalBytes = Object.values(files).reduce((n, b) => n + Buffer.from(b, 'base64').length, 0);
  const maxMb = Number(flags['--max-mb'] || 50);
  const sizeOk = totalBytes <= maxMb * 1024 * 1024;
  checks.push([`bundle <= ${maxMb}MB`, sizeOk, 'block', sizeOk ? '' : `${(totalBytes / 1048576).toFixed(1)}MB`]);

  checks.push(['has description', !!(manifest && manifest.description), 'warn', '']);

  let blocked = false; let warned = false;
  for (const [, passed, sev] of checks) {
    if (!passed && sev === 'block') blocked = true;
    if (!passed && sev === 'warn') warned = true;
  }
  return { checks, status: blocked ? 'rejected' : warned ? 'pending' : 'approved', manifest, totalBytes };
}

function cmdValidate(pkgPath, flags) {
  if (!pkgPath) throw new Error('usage: validate <app.dexplug> [--pub <hex> | --trust trust.json] [--max-mb N]');
  const env = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const { checks, status, manifest } = evaluateEnvelopeCli(env, flags);
  console.log('Validation:', (manifest && manifest.id) || pkgPath);
  for (const [label, passed, sev, detail] of checks) {
    const mark = passed ? 'PASS' : sev === 'block' ? 'FAIL' : 'WARN';
    console.log(`  [${mark}] ${label}${detail ? ' - ' + detail : ''}`);
  }
  console.log('STATUS:', status);
  if (status === 'rejected') process.exitCode = 1;
}

// Emit a store catalog-entry stub for a validated package. The in-app
// PublishService is the authoritative path; this is the publisher-side helper.
function cmdPublish(pkgPath, flags) {
  if (!pkgPath) throw new Error('usage: publish <app.dexplug> [--pub <hex> | --trust trust.json] [--bundle-url URL] [--out entry.json]');
  const env = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const { status, manifest, totalBytes } = evaluateEnvelopeCli(env, flags);
  if (status === 'rejected') { fail('cannot publish: validation rejected (run `validate` for details)'); return; }
  const entry = {
    manifest,
    bundleUrl: flags['--bundle-url'] || '',
    bundleBytes: totalBytes,
    bundleSha256: (env.published && env.published.sha256) || '',
    publisherId: manifest && manifest.publisherId,
    validationStatus: status,
  };
  const out = flags['--out'] || path.join(process.cwd(), `${(manifest && manifest.id) || 'app'}-catalog-entry.json`);
  fs.writeFileSync(out, JSON.stringify(entry, null, 2), 'utf8');
  console.log('Catalog entry written to', out, '(status:', status + ')');
  if (!flags['--bundle-url']) console.log('  note: no --bundle-url; entry is validated but not installable until a bundle is hosted.');
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
    if (cmd === 'validate') return cmdValidate(positional[0], flags);
    if (cmd === 'publish') return cmdPublish(positional[0], flags);
    console.log('dex-codesign — DEX publisher signing tool');
    console.log('  keygen   [--out priv.key]');
    console.log('  sign     <appdir> [--key priv.key] [--out app.dexplug]   (or DEX_SIGNING_KEY[_FILE] env)');
    console.log('  verify   <app.dexplug> [--pub <hex> | --trust trust.json]');
    console.log('  validate <app.dexplug> [--pub <hex> | --trust trust.json] [--max-mb N]   (publish pre-flight)');
    console.log('  publish  <app.dexplug> [--pub <hex> | --trust trust.json] [--bundle-url URL] [--out entry.json]');
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e));
    process.exitCode = 1;
  }
}

main();
