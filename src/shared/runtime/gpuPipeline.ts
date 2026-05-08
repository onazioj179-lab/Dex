// =============================================================================
// DEX Platform — Track A3: GPU pipeline tier selection
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Picks WebGPU / WebGL2 / CPU based on capability + per-app GPU budget +
 * required features. Pure function so tests can drive every branch.
 */

export type GpuTier = 'webgpu' | 'webgl2' | 'cpu';

export interface GpuCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  /** Reported VRAM in MB; 0 means unknown. */
  vramMb: number;
  /** Driver blocklist hit (force fallback even if API reports available). */
  blocklisted?: { webgpu?: boolean; webgl2?: boolean };
}

export interface GpuRequest {
  /** Memory we expect to need. */
  estVramMb: number;
  /** Required feature flags. */
  requireCompute?: boolean;
  requireFloat32Filterable?: boolean;
  /** If true, allow CPU fallback at any cost (background tasks). */
  allowCpu?: boolean;
}

export interface GpuDecision {
  tier: GpuTier;
  /** Why this tier was picked. */
  reason: string;
}

export function pickTier(caps: GpuCapabilities, req: GpuRequest, gpuBudgetMb: number): GpuDecision {
  const blockedGpu = caps.blocklisted?.webgpu === true;
  const blockedGl  = caps.blocklisted?.webgl2 === true;

  const fitsBudget = req.estVramMb <= gpuBudgetMb || gpuBudgetMb <= 0;

  if (caps.webgpu && !blockedGpu && fitsBudget) {
    return { tier: 'webgpu', reason: 'webgpu available, fits budget' };
  }
  if (caps.webgl2 && !blockedGl && !req.requireCompute) {
    if (req.requireFloat32Filterable) {
      // WebGL2 lacks guaranteed float32 filterable textures; degrade.
      if (req.allowCpu !== false) return { tier: 'cpu', reason: 'webgl2 lacks required float32 filterable' };
    }
    return { tier: 'webgl2', reason: 'webgl2 fallback (no compute required)' };
  }
  if (req.allowCpu === false) {
    // No suitable GPU and CPU disallowed — caller must downscale.
    return { tier: 'cpu', reason: 'no GPU, cpu fallback forced' };
  }
  return { tier: 'cpu', reason: 'cpu fallback' };
}

/** Choose tile size that respects GPU budget. Returns 0 to mean "stream tiny". */
export function chooseTileSize(estPixelBytes: number, gpuBudgetMb: number): number {
  const bytes = gpuBudgetMb * 1024 * 1024;
  if (bytes <= 0) return 256;
  const max = Math.floor(Math.sqrt(bytes / Math.max(1, estPixelBytes)));
  // Clamp to power of two between 64 and 4096.
  const clamped = Math.max(64, Math.min(4096, max));
  let p = 64;
  while (p * 2 <= clamped) p *= 2;
  return p;
}
