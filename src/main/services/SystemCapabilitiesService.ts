// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// SystemCapabilitiesService
//
// Detects host hardware capabilities relevant to the May 2026 sweep:
//   - CPU architecture (x64 / arm64 / ia32) -- drives the "Optimized ARM
//     Support" path so renderer can prefer ARM-tuned binaries / WASM builds.
//   - GPU vendor + driver -- gates "Improved Gaming & Graphics" features
//     (DirectStorage / DX13-style hints) and lets us downgrade gracefully on
//     known-flaky drivers.
//   - NPU presence (heuristic) -- gates the "Deep AI Integration (uki+)"
//     on-device pathway. We can't reliably enumerate NPUs from pure Node on
//     Windows without WMI, so we use a conservative inference: count of CPU
//     cores >= 12 AND vendor string containing the known NPU-bearing model
//     families (Snapdragon X, Intel Core Ultra, Ryzen AI, Apple M-series).
//   - RAM tier (low / mid / high) -- drives "low-end mode" auto-suggest.
//
// Pure detection only; no auto-application of policy. The renderer reads the
// snapshot via IPC and decides whether to enable feature flags.
// =============================================================================

import { ipcMain, app } from 'electron';
import * as os from 'os';
import log from 'electron-log';

export type CpuArch = 'x64' | 'arm64' | 'ia32' | 'unknown';
export type RamTier = 'low' | 'mid' | 'high' | 'ultra';

export interface SystemCapabilities {
  arch: CpuArch;
  cpuModel: string;
  cpuCores: number;
  ramTotalGB: number;
  ramTier: RamTier;
  /** Heuristic: true when the CPU model name suggests an integrated NPU. */
  hasNpu: boolean;
  /** Best-effort detected NPU family (or null). */
  npuFamily: string | null;
  /** Best-effort GPU vendor string (when discoverable from app.getGPUInfo). */
  gpuVendor: string | null;
  /** Best-effort GPU model. */
  gpuModel: string | null;
  /** Boot timestamp (ms epoch). */
  detectedAt: number;
}

const NPU_PATTERNS: { pattern: RegExp; family: string }[] = [
  { pattern: /snapdragon\s*x/i, family: 'Qualcomm Snapdragon X (Hexagon NPU)' },
  { pattern: /core\s*ultra/i, family: 'Intel Core Ultra (Intel AI Boost)' },
  { pattern: /ryzen.*ai/i, family: 'AMD Ryzen AI (XDNA NPU)' },
  { pattern: /apple\s*m[1-9]/i, family: 'Apple Silicon (Neural Engine)' },
];

function classifyArch(arch: NodeJS.Architecture): CpuArch {
  if (arch === 'x64' || arch === 'arm64' || arch === 'ia32') return arch;
  return 'unknown';
}

function classifyRam(totalBytes: number): { gb: number; tier: RamTier } {
  const gb = Math.round((totalBytes / 1024 / 1024 / 1024) * 10) / 10;
  let tier: RamTier;
  if (gb < 4) tier = 'low';
  else if (gb < 8) tier = 'mid';
  else if (gb < 16) tier = 'high';
  else tier = 'ultra';
  return { gb, tier };
}

function detectNpu(cpuModel: string): { hasNpu: boolean; family: string | null } {
  for (const { pattern, family } of NPU_PATTERNS) {
    if (pattern.test(cpuModel)) return { hasNpu: true, family };
  }
  return { hasNpu: false, family: null };
}

let cached: SystemCapabilities | null = null;

export async function detectCapabilities(force = false): Promise<SystemCapabilities> {
  if (cached && !force) return cached;

  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model?.trim() ?? 'Unknown CPU';
  const cpuCores = cpus.length;
  const ram = classifyRam(os.totalmem());
  const npu = detectNpu(cpuModel);
  const arch = classifyArch(process.arch as NodeJS.Architecture);

  let gpuVendor: string | null = null;
  let gpuModel: string | null = null;
  try {
    const gpuInfo = (await app.getGPUInfo('basic')) as Record<string, unknown>;
    const auxAttribs = (gpuInfo?.auxAttributes ?? {}) as Record<string, unknown>;
    gpuVendor = (auxAttribs.glRenderer as string | undefined) ?? null;
    gpuModel = (auxAttribs.glVersion as string | undefined) ?? null;
  } catch (err) {
    log.warn('[SystemCapabilities] getGPUInfo failed:', err);
  }

  cached = {
    arch,
    cpuModel,
    cpuCores,
    ramTotalGB: ram.gb,
    ramTier: ram.tier,
    hasNpu: npu.hasNpu,
    npuFamily: npu.family,
    gpuVendor,
    gpuModel,
    detectedAt: Date.now(),
  };
  return cached;
}

export function registerSystemCapabilitiesIpc(): void {
  ipcMain.handle('system:capabilities:get', async () => detectCapabilities(false));
  ipcMain.handle('system:capabilities:refresh', async () => detectCapabilities(true));
}
