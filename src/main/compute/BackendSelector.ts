// =============================================================================
// DEX Platform — Wave 0.1
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * BackendSelector — for each compute operation (FFT, blur, matmul, etc.),
 * pick the fastest backend the host can run.
 *
 * Backends in order of preference vary per-operation. The selector keeps a
 * static registry plus a runtime override map (e.g. user disabled WebGPU
 * because their driver crashed).
 *
 * No work is done here — this is the policy layer. ComputeRouter is the
 * mechanism layer that dispatches to the picked backend.
 */

import { detectHost, type HostInfo, type PerfTier, getPerfTier } from './PerfTier';

export type Backend =
  | 'native-rust'      // NAPI Rust kernel (CPU SIMD)
  | 'webgpu'           // WGSL compute shader
  | 'webgl2'           // GL fallback (renderer only)
  | 'wasm-simd'        // Pure WASM with SIMD
  | 'js'               // Plain JS (last-resort)
  | 'onnx-cpu'         // ONNX Runtime CPU EP
  | 'onnx-cuda'        // ONNX Runtime CUDA EP (NVIDIA)
  | 'onnx-directml'    // ONNX Runtime DirectML EP (Windows)
  | 'onnx-coreml'      // ONNX Runtime CoreML EP (Apple)
  | 'onnx-qnn'         // ONNX Runtime QNN EP (Qualcomm Hexagon NPU)
  | 'onnx-openvino'    // ONNX Runtime OpenVINO EP (Intel CPU/GPU/NPU)
  | 'onnx-webgpu';     // ONNX Runtime WebGPU EP (renderer)

export type Operation =
  // DSP
  | 'fft' | 'ifft' | 'fir' | 'iir' | 'resample' | 'pitch-shift' | 'time-stretch'
  // Image / video
  | 'blur-gaussian' | 'blur-bilateral' | 'unsharp' | 'convolve-2d'
  | 'lut-3d' | 'colorspace' | 'sobel' | 'optical-flow' | 'warp-mesh'
  // Geometry / CAD
  | 'mesh-boolean' | 'bvh-build' | 'bvh-query' | 'constraint-solve'
  // ML
  | 'ml-stem-sep' | 'ml-upscale' | 'ml-denoise-audio' | 'ml-denoise-image'
  | 'ml-detect' | 'ml-segment' | 'ml-embed' | 'ml-colorize' | 'ml-style-transfer';

export type Side = 'main' | 'renderer';

export interface SelectionContext {
  /** Where the call is being made from. */
  side: Side;
  /** Force a specific backend for this op (user override). */
  override?: Backend;
  /** Renderer-side WebGPU adapter availability. */
  webgpuAvailable?: boolean;
  /** Optional explicit host (otherwise detected). */
  host?: HostInfo;
  /** Optional explicit tier (otherwise computed from host). */
  tier?: PerfTier;
}

/** Per-op preference order. First available wins. */
const PREF: Record<Operation, Backend[]> = {
  // DSP — Rust SIMD beats WebGPU latency-wise for small windows
  'fft':            ['native-rust', 'wasm-simd', 'js'],
  'ifft':           ['native-rust', 'wasm-simd', 'js'],
  'fir':            ['native-rust', 'wasm-simd', 'js'],
  'iir':            ['native-rust', 'wasm-simd', 'js'],
  'resample':       ['native-rust', 'wasm-simd', 'js'],
  'pitch-shift':    ['native-rust', 'wasm-simd', 'js'],
  'time-stretch':   ['native-rust', 'wasm-simd', 'js'],
  // Image — WebGPU dominates large images, Rust dominates small/CPU-only
  'blur-gaussian':  ['webgpu', 'native-rust', 'wasm-simd', 'js'],
  'blur-bilateral': ['webgpu', 'native-rust', 'js'],
  'unsharp':        ['webgpu', 'native-rust', 'js'],
  'convolve-2d':    ['webgpu', 'native-rust', 'js'],
  'lut-3d':         ['webgpu', 'native-rust', 'js'],
  'colorspace':     ['webgpu', 'native-rust', 'js'],
  'sobel':          ['webgpu', 'native-rust', 'js'],
  'optical-flow':   ['native-rust', 'webgpu', 'js'],
  'warp-mesh':      ['webgpu', 'native-rust', 'js'],
  // Geometry — pure CPU, Rust only
  'mesh-boolean':   ['native-rust', 'js'],
  'bvh-build':      ['native-rust', 'js'],
  'bvh-query':      ['native-rust', 'js'],
  'constraint-solve': ['native-rust', 'js'],
  // ML — best EP per host
  'ml-stem-sep':    ['onnx-cuda', 'onnx-coreml', 'onnx-directml', 'onnx-qnn', 'onnx-openvino', 'onnx-webgpu', 'onnx-cpu'],
  'ml-upscale':     ['onnx-cuda', 'onnx-coreml', 'onnx-directml', 'onnx-webgpu', 'onnx-qnn', 'onnx-cpu'],
  'ml-denoise-audio': ['onnx-cpu'], // DeepFilterNet runs best CPU (low latency)
  'ml-denoise-image': ['onnx-cuda', 'onnx-directml', 'onnx-coreml', 'onnx-webgpu', 'onnx-cpu'],
  'ml-detect':      ['onnx-coreml', 'onnx-qnn', 'onnx-cuda', 'onnx-directml', 'onnx-webgpu', 'onnx-cpu'],
  'ml-segment':     ['onnx-cuda', 'onnx-coreml', 'onnx-directml', 'onnx-webgpu', 'onnx-cpu'],
  'ml-embed':       ['onnx-cpu'],
  'ml-colorize':    ['onnx-cuda', 'onnx-coreml', 'onnx-directml', 'onnx-webgpu', 'onnx-cpu'],
  'ml-style-transfer': ['onnx-cuda', 'onnx-coreml', 'onnx-directml', 'onnx-webgpu', 'onnx-cpu'],
};

/** Backends explicitly disabled by user. */
const disabled = new Set<Backend>();

export function disableBackend(b: Backend): void { disabled.add(b); }
export function enableBackend(b: Backend): void { disabled.delete(b); }
export function isDisabled(b: Backend): boolean { return disabled.has(b); }

/** Probe whether a backend is available given the host context. */
export function isAvailable(b: Backend, ctx: SelectionContext): boolean {
  if (disabled.has(b)) return false;
  const host = ctx.host ?? detectHost();
  switch (b) {
    case 'js':
    case 'wasm-simd':
      return true;
    case 'native-rust':
      // Only available main-side (NAPI). Renderer must round-trip via IPC.
      return ctx.side === 'main';
    case 'webgpu':
      return ctx.side === 'renderer' && (ctx.webgpuAvailable ?? false);
    case 'webgl2':
      return ctx.side === 'renderer';
    case 'onnx-cpu':
      return true;
    case 'onnx-cuda':
      // NVIDIA on Linux/Windows. Rough heuristic — real check requires probing.
      return host.hasDiscreteGpu && (host.platform === 'win32' || host.platform === 'linux');
    case 'onnx-directml':
      return host.platform === 'win32';
    case 'onnx-coreml':
      return host.platform === 'darwin';
    case 'onnx-qnn':
      return host.platform === 'win32' && host.arch === 'arm64';
    case 'onnx-openvino':
      // Intel platform — coarse: x64 on Win/Linux. Real probe needed.
      return host.arch === 'x64' && host.platform !== 'darwin';
    case 'onnx-webgpu':
      return ctx.side === 'renderer' && (ctx.webgpuAvailable ?? false);
  }
}

/** Pick the best backend for an operation given context. */
export function pickBackend(op: Operation, ctx: SelectionContext): Backend {
  if (ctx.override && isAvailable(ctx.override, ctx)) return ctx.override;
  const tier = ctx.tier ?? getPerfTier(ctx.host);
  const order = adjustForTier(PREF[op], tier);
  for (const b of order) if (isAvailable(b, ctx)) return b;
  return 'js';
}

function adjustForTier(order: readonly Backend[], tier: PerfTier): Backend[] {
  // ultra-low: skip WebGPU (often crashes on weak iGPUs); skip CUDA (no GPU)
  if (tier === 'ultra-low') {
    return order.filter(b => b !== 'webgpu' && b !== 'onnx-cuda' && b !== 'onnx-webgpu');
  }
  return [...order];
}

/** Returns full ranked list of available backends for an op (debug/UI). */
export function availableBackends(op: Operation, ctx: SelectionContext): Backend[] {
  return PREF[op].filter(b => isAvailable(b, ctx));
}
