// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Native -- TypeScript Loader
// Loads the Rust NAPI-RS native module and provides a typed interface.
// Falls back to JS implementations if the native module isn't available.
// ===========================================================================

import * as path from 'path';
import * as os from 'os';
import type { DexNativeModule } from './types';
import log from 'electron-log';

// -------------------------------------------------------------------------
// Module Loading
// -------------------------------------------------------------------------

let nativeModule: DexNativeModule | null = null;
let loadAttempted = false;

/**
 * Attempt to load the native Rust module.
 * Returns the module if available, null otherwise.
 */
function loadNativeModule(): DexNativeModule | null {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;

  // Construct platform-specific .node filename
  const platform = os.platform();    // win32, darwin, linux
  const arch = os.arch();            // x64, arm64
  const platformMap: Record<string, string> = {
    win32: 'win32',
    darwin: 'darwin',
    linux: 'linux-gnu',
  };
  const archMap: Record<string, string> = {
    x64: 'x86_64',
    arm64: 'aarch64',
  };

  const platformStr = platformMap[platform] || platform;
  const archStr = archMap[arch] || arch;

  // NAPI-RS generates: dex-native.<platform>.node
  // With GNU toolchain on Windows: dex-native.win32-x64-gnu.node
  const candidates = [
    // Dev build (in native/ directory) -- GNU toolchain (default on Windows without MSVC)
    path.join(__dirname, '..', '..', '..', 'native', `dex-native.${platform}-${arch}-gnu.node`),
    // Dev build - MSVC toolchain
    path.join(__dirname, '..', '..', '..', 'native', `dex-native.${platformStr}-${archStr}-msvc.node`),
    // Dev build - generic name
    path.join(__dirname, '..', '..', '..', 'native', `dex-native.${platformStr}-${archStr}.node`),
    path.join(__dirname, '..', '..', '..', 'native', 'dex-native.node'),
    // Production build (bundled in app resources)
    path.join(process.resourcesPath || '', 'native', `dex-native.${platform}-${arch}-gnu.node`),
    path.join(process.resourcesPath || '', 'native', `dex-native.${platformStr}-${archStr}-msvc.node`),
    path.join(process.resourcesPath || '', 'native', `dex-native.${platformStr}-${archStr}.node`),
    path.join(process.resourcesPath || '', 'native', 'dex-native.node'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(candidate) as DexNativeModule;
      log.info(`[Native] Loaded Rust module from: ${candidate}`);
      nativeModule = mod;
      return mod;
    } catch {
      // Try next candidate
    }
  }

  log.warn('[Native] Rust native module not found -- using JS fallback');
  return null;
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Check if the native Rust module is available.
 */
export function isNativeAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Get the native module instance (null if not available).
 */
export function getNativeModule(): DexNativeModule | null {
  return loadNativeModule();
}

/**
 * Get the native module, throwing if not available.
 */
export function requireNative(): DexNativeModule {
  const mod = loadNativeModule();
  if (!mod) {
    throw new Error('Native Rust module is not available. Build it with: cd native && npm run build');
  }
  return mod;
}

// -------------------------------------------------------------------------
// Re-export types
// -------------------------------------------------------------------------

export type {
  SystemStats,
  DiskInfo,
  NetworkInfo,
  ProcessInfo,
  CloseProcessResult,
  PowerProfile,
  PowerResult,
  PowerStatus,
  FileEntry,
  ScanResult,
  DirectorySize,
  HealthStatus,
  Suggestion,
  ColorInfo,
  BatchHashResult,
  ProjectStats,
  KernelSchedulerStats,
  KernelMemoryStats,
  KernelIOStats,
  KernelIPCStats,
  KernelCPUStats,
  KernelStartupStats,
  KernelPerfStats,
  DexNativeModule,
  LoudnessResult,
  WaveformPeaksFlat,
  ExportProgressSnapshot,
} from './types';
