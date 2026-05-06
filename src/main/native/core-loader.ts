// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Core -- TypeScript Loader for dex-core Rust addon
// Loads the dex-core NAPI-RS native module. Falls back gracefully.
// ===========================================================================

import * as path from 'path';
import * as os from 'os';
import type { DexCoreModule } from './core-types';
import log from 'electron-log';

let coreModule: DexCoreModule | null = null;
let loadAttempted = false;

function loadCoreModule(): DexCoreModule | null {
  if (loadAttempted) return coreModule;
  loadAttempted = true;

  const platform = os.platform();
  const arch = os.arch();

  const candidates = [
    // Dev build -- src/native/dex-core/ output
    path.join(__dirname, '..', '..', '..', 'src', 'native', 'dex-core', `dex-core.${platform}-${arch}-gnu.node`),
    path.join(__dirname, '..', '..', '..', 'src', 'native', 'dex-core', `dex-core.${platform}-${arch}-msvc.node`),
    path.join(__dirname, '..', '..', '..', 'src', 'native', 'dex-core', `dex-core.${platform}-${arch}.node`),
    path.join(__dirname, '..', '..', '..', 'src', 'native', 'dex-core', 'dex-core.node'),
    // Production build (bundled in app resources)
    path.join(process.resourcesPath || '', 'native', `dex-core.${platform}-${arch}-gnu.node`),
    path.join(process.resourcesPath || '', 'native', `dex-core.${platform}-${arch}-msvc.node`),
    path.join(process.resourcesPath || '', 'native', `dex-core.${platform}-${arch}.node`),
    path.join(process.resourcesPath || '', 'native', 'dex-core.node'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = require(candidate) as DexCoreModule;
      log.info(`[DexCore] Loaded dex-core from: ${candidate}`);
      coreModule = mod;
      return mod;
    } catch {
      // Try next candidate
    }
  }

  log.warn('[DexCore] dex-core native module not found -- using JS fallbacks');
  return null;
}

export function isCoreAvailable(): boolean {
  return loadCoreModule() !== null;
}

export function getCoreModule(): DexCoreModule | null {
  return loadCoreModule();
}

export type { DexCoreModule } from './core-types';
