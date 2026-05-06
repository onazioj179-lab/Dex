// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
#!/usr/bin/env node

/**
 * ===========================================================================
 * DEX - Production Release Pipeline
 * ===========================================================================
 * Automated 16-step release process: clean, check, test, build, package,
 * verify, checksum, and tag.
 *
 * Usage:
 *   node scripts/release.js                    # dry-run (no publish)
 *   node scripts/release.js --publish          # full release
 *   node scripts/release.js --platform win     # windows only
 *   node scripts/release.js --skip-tests       # skip test suite
 * ===========================================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const VERSION = PKG.version;
const RELEASE_DIR = path.join(ROOT, 'release');
const DIST_DIR = path.join(ROOT, 'dist');
const CHECKSUM_FILE = path.join(RELEASE_DIR, `checksums-${VERSION}.txt`);
const BIN = path.join(ROOT, 'node_modules', '.bin');
const TSC = path.join(BIN, 'tsc');
const VITE = path.join(BIN, 'vite');
const EB = path.join(BIN, 'electron-builder');

const args = process.argv.slice(2);
const FLAGS = {
  publish: args.includes('--publish'),
  skipTests: args.includes('--skip-tests'),
  platform: (() => {
    const idx = args.indexOf('--platform');
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : 'current';
  })(),
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

let stepNum = 0;

function step(name) {
  stepNum++;
  const prefix = `[${String(stepNum).padStart(2, '0')}/16]`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${prefix} ${name}`);
  console.log(`${'='.repeat(60)}\n`);
}

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  try {
    const env = { ...process.env };
    // Only set NODE_ENV=production for build steps, not for npm install
    if (!cmd.startsWith('npm install') && !cmd.startsWith('npm ci')) {
      env.NODE_ENV = 'production';
    }
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'inherit',
      env,
      ...opts,
    });
  } catch (err) {
    console.error(`\n  FAILED: ${cmd}`);
    if (!opts.allowFailure) {
      process.exit(1);
    }
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Release Steps
// ---------------------------------------------------------------------------

function main() {
  const startTime = Date.now();

  console.log(`\n  DEX Release Pipeline v${VERSION}`);
  console.log(`  Platform: ${FLAGS.platform}`);
  console.log(`  Publish: ${FLAGS.publish}`);
  console.log(`  Skip Tests: ${FLAGS.skipTests}\n`);

  // Step 1: Pre-flight checks
  step('Pre-flight checks');
  if (!fileExists(path.join(ROOT, 'package.json'))) {
    console.error('  Not in DEX root directory');
    process.exit(1);
  }
  console.log(`  Version: ${VERSION}`);
  console.log(`  Node: ${process.version}`);
  console.log(`  Platform: ${process.platform}-${process.arch}`);

  // Validate code signing credentials when publishing
  if (FLAGS.publish) {
    const platform = process.platform;
    const errors = [];
    if (platform === 'win32') {
      if (!process.env.CSC_LINK) errors.push('CSC_LINK (Windows code signing certificate path)');
      if (!process.env.CSC_KEY_PASSWORD) errors.push('CSC_KEY_PASSWORD (Windows certificate password)');
    } else if (platform === 'darwin') {
      if (!process.env.APPLE_ID) errors.push('APPLE_ID (Apple notarization account)');
      if (!process.env.APPLE_APP_SPECIFIC_PASSWORD) errors.push('APPLE_APP_SPECIFIC_PASSWORD (notarization password)');
      if (!process.env.APPLE_TEAM_ID) errors.push('APPLE_TEAM_ID (Apple Developer Team ID)');
    }
    if (errors.length > 0) {
      console.error('\n  ERROR: Missing code signing credentials (required for --publish):');
      for (const e of errors) {
        console.error(`    - ${e}`);
      }
      console.error('\n  Unsigned builds will be flagged as malware by antivirus software.');
      console.error('  Set env vars or remove --publish to create an unsigned dev build.\n');
      process.exit(1);
    } else {
      console.log('  Code signing credentials: OK');
    }
  }

  // Step 2: Clean previous build artifacts
  step('Clean build artifacts');
  run('npx rimraf dist');
  if (fs.existsSync(RELEASE_DIR)) {
    // Keep previous releases, only clean build intermediaries
    const intermediaries = ['win-unpacked', 'mac', 'mac-arm64', 'linux-unpacked', '__snap-amd64'];
    for (const dir of intermediaries) {
      const p = path.join(RELEASE_DIR, dir);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`  Cleaned ${dir}/`);
      }
    }
  }

  // Step 3: Install dependencies
  step('Verify dependencies');
  run('npm install --ignore-scripts', { allowFailure: true });
  run(`"${EB}" install-app-deps`, { allowFailure: true });

  // Step 4: TypeScript type check
  step('TypeScript type check');
  run(`"${TSC}" --noEmit`);

  // Step 4b: Main type check
  run(`"${TSC}" -p tsconfig.main.json --noEmit`);

  // Step 5: Lint check
  step('Lint check');
  console.log('  Using tsc --noEmit as linter (no separate lint config)');

  // Step 6: Run test suite
  step('Run test suite');
  if (FLAGS.skipTests) {
    console.log('  Skipped (--skip-tests flag)');
  } else {
    run('npx vitest run');
  }

  // Step 7: Build renderer (Vite)
  step('Build renderer (Vite)');
  run(`"${VITE}" build`);

  // Step 8: Build main process (TypeScript)
  step('Build main process (TypeScript)');
  run(`"${TSC}" -p tsconfig.main.json`);

  // Step 9: Verify build output
  step('Verify build output');
  const requiredFiles = [
    'dist/renderer/index.html',
    'dist/main/main.js',
    'dist/main/preload.js',
  ];
  let allPresent = true;
  for (const f of requiredFiles) {
    const full = path.join(ROOT, f);
    if (fileExists(full)) {
      const size = fs.statSync(full).size;
      console.log(`  OK: ${f} (${formatBytes(size)})`);
    } else {
      console.error(`  MISSING: ${f}`);
      allPresent = false;
    }
  }
  if (!allPresent) {
    console.error('\n  Build verification failed - missing required files');
    process.exit(1);
  }

  // Step 10: Write VERSION.txt for runtime fallback
  step('Write VERSION.txt');
  const versionFile = path.join(DIST_DIR, 'VERSION.txt');
  fs.writeFileSync(versionFile, VERSION, 'utf-8');
  console.log(`  Wrote ${VERSION} to dist/VERSION.txt`);

  // Step 11: Package application
  step('Package application');
  const platformFlag = FLAGS.platform === 'current'
    ? (process.platform === 'win32' ? '--win' :
       process.platform === 'darwin' ? '--mac' : '--linux')
    : `--${FLAGS.platform}`;
  run(`"${EB}" ${platformFlag} --config`);

  // Step 12: Verify packaged output
  step('Verify packaged output');
  if (fs.existsSync(RELEASE_DIR)) {
    const artifacts = fs.readdirSync(RELEASE_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.exe', '.dmg', '.appimage', '.deb', '.rpm', '.snap', '.blockmap', '.yml'].includes(ext);
    });
    if (artifacts.length === 0) {
      console.warn('  WARNING: No installer artifacts found in release/');
    } else {
      for (const a of artifacts) {
        const size = fs.statSync(path.join(RELEASE_DIR, a)).size;
        console.log(`  ${a} (${formatBytes(size)})`);
      }
    }
  }

  // Step 13: Generate checksums
  step('Generate checksums');
  if (fs.existsSync(RELEASE_DIR)) {
    const checksumLines = [];
    const files = fs.readdirSync(RELEASE_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.exe', '.dmg', '.appimage', '.deb', '.rpm', '.snap', '.zip', '.tar.gz'].includes(ext);
    });
    for (const f of files) {
      const hash = sha256(path.join(RELEASE_DIR, f));
      checksumLines.push(`${hash}  ${f}`);
      console.log(`  ${f}: ${hash.slice(0, 16)}...`);
    }
    if (checksumLines.length > 0) {
      fs.writeFileSync(CHECKSUM_FILE, checksumLines.join('\n') + '\n', 'utf-8');
      console.log(`  Wrote ${path.basename(CHECKSUM_FILE)}`);
    } else {
      console.log('  No installable artifacts to checksum');
    }
  }

  // Step 14: Generate release notes
  step('Generate release notes');
  const changelogPath = path.join(ROOT, 'docs', 'CHANGELOG.md');
  if (fileExists(changelogPath)) {
    console.log('  CHANGELOG.md found -- will be included in release');
  } else {
    console.log('  No CHANGELOG.md found');
  }

  // Step 15: Validate release integrity
  step('Validate release integrity');
  console.log('  Checking for debug artifacts...');
  const distFiles = [];
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(p);
      else distFiles.push(p);
    }
  }
  walkDir(DIST_DIR);
  const sourceMaps = distFiles.filter(f => f.endsWith('.map'));
  if (sourceMaps.length > 0) {
    console.log(`  WARNING: ${sourceMaps.length} source maps found (excluded from asar)`);
  } else {
    console.log('  No source maps in dist -- clean');
  }
  console.log(`  Total dist files: ${distFiles.length}`);

  // Step 16: Summary
  step('Release Summary');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Product: DEX v${VERSION}`);
  console.log(`  Platform: ${FLAGS.platform}`);
  console.log(`  Build time: ${elapsed}s`);
  console.log(`  Publish: ${FLAGS.publish ? 'YES' : 'DRY RUN'}`);
  if (FLAGS.publish) {
    console.log('\n  Creating release tag...');
    try {
      execSync(`git tag -a v${VERSION} -m "DEX v${VERSION}"`, { cwd: ROOT, stdio: 'pipe' });
      console.log(`  Tagged v${VERSION}`);
    } catch (tagErr) {
      const msg = tagErr.stderr ? tagErr.stderr.toString() : tagErr.message;
      if (msg.includes('already exists')) {
        console.log(`  Tag v${VERSION} already exists -- skipping`);
      } else {
        console.warn(`  WARNING: Could not create tag: ${msg.trim()}`);
      }
    }
    console.log(`\n  Push tag and upload artifacts to publish:`);
    console.log(`  git push origin v${VERSION}`);
  }
  console.log(`\n  Release pipeline complete.\n`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main();
