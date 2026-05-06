// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX -- Build script for the dex-core Rust native addon
// Runs `cargo build --release` in src/native/dex-core, then copies the
// resulting .node file to the expected location.
// ===========================================================================

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const CRATE_DIR = path.join(ROOT, 'src', 'native', 'dex-core');

// NAPI-RS output name follows: <crate>.<platform>-<arch>-<toolchain>.node
const platform = os.platform();  // win32, darwin, linux
const arch = os.arch();          // x64, arm64

function main() {
  console.log('[build-dex-core] Building dex-core native addon...');
  console.log(`[build-dex-core] Platform: ${platform}, Arch: ${arch}`);
  console.log(`[build-dex-core] Crate dir: ${CRATE_DIR}`);

  if (!fs.existsSync(path.join(CRATE_DIR, 'Cargo.toml'))) {
    console.error('[build-dex-core] Cargo.toml not found in', CRATE_DIR);
    process.exit(1);
  }

  // Step 1: Run napi build for the crate
  const napiCmd = `npx napi build --platform --release --cargo-cwd "${CRATE_DIR}"`;
  console.log(`[build-dex-core] Running: ${napiCmd}`);
  try {
    execSync(napiCmd, {
      cwd: CRATE_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (e) {
    // If napi CLI isn't available, fall back to raw cargo
    console.log('[build-dex-core] napi CLI failed, falling back to cargo build...');
    try {
      execSync('cargo build --release', {
        cwd: CRATE_DIR,
        stdio: 'inherit',
        env: { ...process.env },
      });
    } catch (cargoErr) {
      console.error('[build-dex-core] cargo build failed:', cargoErr.message);
      process.exit(1);
    }
  }

  // Step 2: Copy .node file to expected locations
  const possibleOutputs = [
    path.join(CRATE_DIR, `dex-core.${platform}-${arch}-gnu.node`),
    path.join(CRATE_DIR, `dex-core.${platform}-${arch}-msvc.node`),
    path.join(CRATE_DIR, `dex-core.${platform}-${arch}.node`),
    path.join(CRATE_DIR, 'dex-core.node'),
    // cargo output directory
    path.join(CRATE_DIR, 'target', 'release', 'dex_core.dll'),
    path.join(CRATE_DIR, 'target', 'release', 'libdex_core.dylib'),
    path.join(CRATE_DIR, 'target', 'release', 'libdex_core.so'),
  ];

  let found = false;
  for (const outputPath of possibleOutputs) {
    if (fs.existsSync(outputPath)) {
      console.log(`[build-dex-core] Found output: ${outputPath}`);
      found = true;

      // Copy to resources for production packaging
      const resourceDir = path.join(ROOT, 'release', 'win-unpacked', 'resources', 'native');
      if (fs.existsSync(path.dirname(resourceDir))) {
        fs.mkdirSync(resourceDir, { recursive: true });
        const destName = path.basename(outputPath).endsWith('.node')
          ? path.basename(outputPath)
          : `dex-core.${platform}-${arch}-gnu.node`;
        const dest = path.join(resourceDir, destName);
        fs.copyFileSync(outputPath, dest);
        console.log(`[build-dex-core] Copied to: ${dest}`);
      }
      break;
    }
  }

  if (!found) {
    console.warn('[build-dex-core] No .node output found. The build may have failed silently.');
    console.warn('[build-dex-core] DEX will use JS fallbacks for all native functions.');
  } else {
    console.log('[build-dex-core] Build complete.');
  }
}

main();
