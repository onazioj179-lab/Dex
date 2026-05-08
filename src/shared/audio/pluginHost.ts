// =============================================================================
// DEX Platform — Wave 1.3 Imosion: plugin host (.dexplugin manifest schema)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Plugin manifest format for the `.dexplugin` AudioWorklet plugin SDK.
 *
 * A plugin ships as:
 *   <name>.dexplugin/
 *     manifest.json   — DexPluginManifest
 *     processor.js    — AudioWorkletProcessor source
 *     ui.js           — optional renderer-side UI module (lazy loaded)
 *     dsp.wasm        — optional WASM blob loaded from processor
 *     presets/        — optional preset bank
 *
 * The host validates the manifest at load time, refuses unsigned plugins
 * unless trust-on-first-use is allowed, then spins up an AudioWorklet node
 * with the declared parameter set. Parameters become AudioParams for
 * sample-accurate automation.
 */

export type PluginCategory =
  | 'eq' | 'compressor' | 'limiter' | 'gate' | 'expander'
  | 'reverb' | 'delay' | 'modulation' | 'distortion' | 'saturation'
  | 'utility' | 'analyzer' | 'instrument' | 'midi-effect' | 'other';

export interface PluginParameter {
  /** Stable id (used in automation paths). */
  id: string;
  /** Human label. */
  label: string;
  /** Min / max in user units. */
  min: number;
  max: number;
  /** Default value. */
  default: number;
  /** Curve mapping for UI: 'linear' | 'log' | 'exp'. */
  curve?: 'linear' | 'log' | 'exp';
  /** Suffix for display ('dB', 'Hz', 'ms'...). */
  unit?: string;
  /** If true, parameter is sample-accurate (k-rate vs a-rate). */
  audioRate?: boolean;
  /** Optional discrete steps. */
  steps?: { value: number; label: string }[];
}

export interface DexPluginManifest {
  /** Reverse-DNS plugin id. */
  id: string;
  /** Display name. */
  name: string;
  /** Vendor/author. */
  vendor: string;
  /** SemVer. */
  version: string;
  /** Category for browsing. */
  category: PluginCategory;
  /** Number of audio channels in/out. */
  audio: { inputs: number; outputs: number };
  /** Has sidechain key input. */
  sidechain?: boolean;
  /** Latency in samples introduced by the plugin. */
  latencySamples?: number;
  /** Tail in samples (reverbs etc.). */
  tailSamples?: number;
  /** Parameter set. */
  parameters: PluginParameter[];
  /** Entry-point JS file (relative to plugin dir). */
  processor: string;
  /** UI module (optional, relative). */
  ui?: string;
  /** WASM blobs to preload (optional). */
  wasm?: string[];
  /** Signature (Ed25519 hex). Empty/missing => unsigned. */
  signature?: string;
  /** SHA256 of processor + ui + wasm (verified before load). */
  contentSha256: string;
  /** Min host SDK version required. */
  minSdkVersion: string;
}

export const SDK_VERSION = '1.0.0';

/** Validate a manifest for shape + safety. Returns array of issues. */
export function validateManifest(m: unknown): string[] {
  const issues: string[] = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  const x = m as Record<string, unknown>;
  for (const f of ['id', 'name', 'vendor', 'version', 'category', 'processor', 'contentSha256', 'minSdkVersion'] as const) {
    if (typeof x[f] !== 'string' || (x[f] as string).length === 0) issues.push(`missing or invalid field: ${f}`);
  }
  if (!x.audio || typeof x.audio !== 'object') issues.push('missing audio section');
  else {
    const a = x.audio as Record<string, unknown>;
    if (typeof a.inputs !== 'number' || a.inputs < 0 || a.inputs > 32) issues.push('audio.inputs out of range');
    if (typeof a.outputs !== 'number' || a.outputs < 0 || a.outputs > 32) issues.push('audio.outputs out of range');
  }
  if (!Array.isArray(x.parameters)) issues.push('parameters must be an array');
  else {
    const seen = new Set<string>();
    for (const p of x.parameters as PluginParameter[]) {
      if (!p.id || seen.has(p.id)) issues.push(`duplicate or missing parameter id: ${p.id}`);
      else seen.add(p.id);
      if (typeof p.min !== 'number' || typeof p.max !== 'number' || p.min >= p.max) {
        issues.push(`parameter ${p.id}: invalid min/max`);
      }
      if (typeof p.default !== 'number' || p.default < p.min || p.default > p.max) {
        issues.push(`parameter ${p.id}: default out of range`);
      }
    }
  }
  if (typeof x.contentSha256 === 'string' && !/^[0-9a-f]{64}$/.test(x.contentSha256)) {
    issues.push('contentSha256 must be 64-char hex');
  }
  if (typeof x.signature === 'string' && x.signature.length > 0 && !/^[0-9a-f]{128}$/.test(x.signature)) {
    issues.push('signature must be 128-char hex Ed25519 sig');
  }
  return issues;
}

export function isValidManifest(m: unknown): m is DexPluginManifest {
  return validateManifest(m).length === 0;
}

/** Compare SDK versions semver-ish (major.minor.patch). */
export function sdkSatisfies(required: string, current: string = SDK_VERSION): boolean {
  const [rMaj, rMin] = required.split('.').map(n => parseInt(n, 10));
  const [cMaj, cMin] = current.split('.').map(n => parseInt(n, 10));
  if (Number.isNaN(rMaj) || Number.isNaN(cMaj)) return false;
  if (cMaj !== rMaj) return false;
  return cMin >= (rMin ?? 0);
}

/**
 * Built-in plugin descriptors that ship with DEX Imosion. Concrete processor
 * code lives elsewhere; this is the registry the host shows in the browser.
 */
export const BUILTIN_PLUGINS: DexPluginManifest[] = [
  {
    id: 'dex.builtin.eq.parametric4',
    name: '4-Band Parametric EQ', vendor: 'DEX', version: '1.0.0', category: 'eq',
    audio: { inputs: 1, outputs: 1 },
    parameters: bandsToParams(4),
    processor: 'processor.js', contentSha256: '0'.repeat(64), minSdkVersion: '1.0',
  },
  {
    id: 'dex.builtin.dyn.glue',
    name: 'Glue Compressor', vendor: 'DEX', version: '1.0.0', category: 'compressor',
    audio: { inputs: 1, outputs: 1 }, sidechain: true,
    parameters: [
      { id: 'threshold', label: 'Threshold', min: -60, max: 0, default: -18, unit: 'dB' },
      { id: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4, curve: 'log' },
      { id: 'attack', label: 'Attack', min: 0.1, max: 100, default: 10, unit: 'ms', curve: 'log' },
      { id: 'release', label: 'Release', min: 10, max: 2000, default: 200, unit: 'ms', curve: 'log' },
      { id: 'makeup', label: 'Makeup', min: 0, max: 24, default: 0, unit: 'dB' },
      { id: 'knee', label: 'Knee', min: 0, max: 12, default: 6, unit: 'dB' },
    ],
    processor: 'processor.js', contentSha256: '0'.repeat(64), minSdkVersion: '1.0',
  },
  {
    id: 'dex.builtin.dyn.limiter',
    name: 'True-Peak Limiter', vendor: 'DEX', version: '1.0.0', category: 'limiter',
    audio: { inputs: 1, outputs: 1 }, latencySamples: 64,
    parameters: [
      { id: 'ceiling', label: 'Ceiling', min: -3, max: 0, default: -0.3, unit: 'dB' },
      { id: 'release', label: 'Release', min: 1, max: 500, default: 50, unit: 'ms', curve: 'log' },
    ],
    processor: 'processor.js', contentSha256: '0'.repeat(64), minSdkVersion: '1.0',
  },
  {
    id: 'dex.builtin.fx.convreverb',
    name: 'Convolution Reverb', vendor: 'DEX', version: '1.0.0', category: 'reverb',
    audio: { inputs: 1, outputs: 1 }, tailSamples: 96000,
    parameters: [
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.3 },
      { id: 'predelay', label: 'Pre-delay', min: 0, max: 500, default: 0, unit: 'ms' },
    ],
    processor: 'processor.js', contentSha256: '0'.repeat(64), minSdkVersion: '1.0',
  },
];

function bandsToParams(n: number): PluginParameter[] {
  const out: PluginParameter[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      { id: `b${i}.freq`, label: `Band ${i+1} Freq`, min: 20, max: 20000, default: [80, 400, 2400, 8000][i] ?? 1000, curve: 'log', unit: 'Hz' },
      { id: `b${i}.gain`, label: `Band ${i+1} Gain`, min: -24, max: 24, default: 0, unit: 'dB' },
      { id: `b${i}.q`, label: `Band ${i+1} Q`, min: 0.1, max: 10, default: 1, curve: 'log' },
    );
  }
  return out;
}
