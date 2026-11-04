#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Post-build check on the artifacts we actually ship.
//
// The v6.0.x installers were built with the GNU Rust toolchain, so dex-tauri.exe
// imported WebView2Loader.dll dynamically — and the bundler never shipped that
// DLL. Installed copies failed to start with "WebView2Loader.dll was not found"
// even though the WebView2 runtime was installed. src-tauri/build.rs now refuses
// GNU release builds; this script proves it on the binary itself by reading the
// PE import tables, and confirms the installers were produced.
//
// Usage:  node scripts/verify-tauri-bundle.js [path/to/dex-tauri.exe]
// Exit 1 on any failure.
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = path.join(ROOT, 'src-tauri', 'target', 'release');
// DLLs that are NOT part of Windows and would have to ship beside the exe.
const MUST_NOT_IMPORT = ['webview2loader.dll'];
const RENDERER_DIST = path.join(ROOT, 'dist', 'renderer');
// Development files that must never reach users through the packaged frontend.
const FORBIDDEN_IN_DIST = [/\.map$/i, /(^|[\\/])\.env(\.|$)/i, /\.(test|spec)\.[jt]sx?$/i, /(^|[\\/])__fixtures__([\\/]|$)/i];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Authenticode status via PowerShell; null when it can't be read (non-Windows). */
function signatureStatus(file) {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    `(Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}').Status`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Return the imported DLL names (regular + delay-load) of a PE file. */
function peImports(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file (no MZ)');
  const pe = b.readUInt32LE(0x3c);
  if (b.readUInt32LE(pe) !== 0x00004550) throw new Error('not a PE file (no PE sig)');
  const coff = pe + 4;
  const nSections = b.readUInt16LE(coff + 2);
  const optSize = b.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = b.readUInt16LE(opt);
  const dataDirs = opt + (magic === 0x20b ? 112 : 96); // PE32+ : PE32
  const sections = [];
  for (let i = 0, s = opt + optSize; i < nSections; i++, s += 40) {
    sections.push({ va: b.readUInt32LE(s + 12), size: Math.max(b.readUInt32LE(s + 8), b.readUInt32LE(s + 16)), raw: b.readUInt32LE(s + 20) });
  }
  const off = (rva) => {
    const sec = sections.find((x) => rva >= x.va && rva < x.va + x.size);
    if (!sec) throw new Error(`RVA 0x${rva.toString(16)} outside all sections`);
    return rva - sec.va + sec.raw;
  };
  const cstr = (o) => b.toString('latin1', o, b.indexOf(0, o));
  const names = new Set();
  // [directory index, descriptor size, offset of the Name RVA in the descriptor]
  for (const [dir, stride, nameAt] of [[1, 20, 12], [13, 32, 4]]) {
    const rva = b.readUInt32LE(dataDirs + dir * 8);
    if (!rva) continue;
    for (let d = off(rva); ; d += stride) {
      const nameRva = b.readUInt32LE(d + nameAt);
      if (!nameRva) break;
      names.add(cstr(off(nameRva)));
    }
  }
  return [...names];
}

function main() {
  const exe = path.resolve(process.argv[2] || path.join(RELEASE, 'dex-tauri.exe'));
  const failures = [];
  if (!fs.existsSync(exe)) {
    console.error(`[verify-bundle] missing ${exe} — run \`npm run build:tauri\` first`);
    process.exit(1);
  }

  const imports = peImports(exe);
  const bad = imports.filter((n) => MUST_NOT_IMPORT.includes(n.toLowerCase()));
  console.log(`[verify-bundle] ${path.basename(exe)} imports ${imports.length} DLLs`);
  if (bad.length) {
    failures.push(
      `${path.basename(exe)} imports ${bad.join(', ')} dynamically. The installer does not ship it, so the ` +
        'installed app will not start. Rebuild with the MSVC Rust toolchain (static WebView2 loader).',
    );
  } else {
    console.log('[verify-bundle] OK  WebView2 loader is statically linked (no WebView2Loader.dll import)');
  }

  // The packaged frontend must not carry source maps, env files or test code.
  const leaked = walk(RENDERER_DIST).filter((f) => FORBIDDEN_IN_DIST.some((re) => re.test(path.relative(RENDERER_DIST, f))));
  if (leaked.length) failures.push(`development files in dist/renderer: ${leaked.slice(0, 5).map((f) => path.relative(ROOT, f)).join(', ')}`);
  else console.log('[verify-bundle] OK  no source maps, env files or tests in dist/renderer');

  // Installers only exist after a full `tauri build` (skip when checking a bare exe).
  // Match the CURRENT version so stale bundles from older builds can't satisfy it.
  if (!process.argv[2]) {
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const shipped = [];
    // One official Windows setup (NSIS). A leftover MSI from an older build
    // config is reported so it never gets attached to a release by hand.
    const msiDir = path.join(RELEASE, 'bundle', 'msi');
    if (fs.existsSync(msiDir) && fs.readdirSync(msiDir).some((f) => f.includes(`_${version}_`))) {
      console.warn(`[verify-bundle] WARN stale MSI for v${version} in ${msiDir}; it is not a release asset`);
    }
    for (const [dir, suffix] of [['nsis', '-setup.exe']]) {
      const d = path.join(RELEASE, 'bundle', dir);
      const hits = fs.existsSync(d)
        ? fs.readdirSync(d).filter((f) => f.includes(`_${version}_`) && f.toLowerCase().endsWith(suffix))
        : [];
      if (!hits.length) failures.push(`no ${dir.toUpperCase()} installer for v${version} in ${d}`);
      for (const f of hits) {
        const full = path.join(d, f);
        const mb = (fs.statSync(full).size / 1048576).toFixed(1);
        const sig = signatureStatus(full);
        console.log(`[verify-bundle] OK  ${dir}/${f} (${mb} MB)${sig ? ` signature: ${sig}` : ''}`);
        shipped.push(full);
      }
    }
    // Checksums for release integrity: publish this file next to the installers
    // so a corrupted or substituted download can be detected.
    if (shipped.length) {
      const sums = shipped.map((f) => `${sha256(f)}  ${path.basename(f)}\n`).join('');
      const out = path.join(RELEASE, 'bundle', `SHA256SUMS-${version}.txt`);
      fs.writeFileSync(out, sums);
      console.log(`[verify-bundle] OK  wrote ${path.relative(ROOT, out)}`);
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`[verify-bundle] FAIL ${f}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { peImports, sha256, FORBIDDEN_IN_DIST };
