// =============================================================================
// DEX Platform — Wave 7.4 perf tier persistence
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Persisted user preferences for compute tier + per-feature ML toggles.
 * Stored at `~/.dex/perf.json`. Survives reinstall.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { type PerfTier, getPerfTier } from './PerfTier';

export type FeatureToggle = 'auto' | 'cpu' | 'gpu' | 'npu' | 'off';

export interface PerfPrefs {
  /** User-forced tier; null = auto. */
  override: PerfTier | null;
  /** Per-feature ML preference. */
  features: {
    upscale?: FeatureToggle;
    denoise?: FeatureToggle;
    transcribe?: FeatureToggle;
    bgRemove?: FeatureToggle;
    detect?: FeatureToggle;
    embed?: FeatureToggle;
    colorize?: FeatureToggle;
  };
  /** Allow ONNX downloads on metered networks. */
  allowMeteredDownloads: boolean;
}

const DEFAULTS: PerfPrefs = {
  override: null,
  features: {},
  allowMeteredDownloads: false,
};

function prefsPath(): string {
  const dir = process.env.DEX_HOME ?? path.join(os.homedir(), '.dex');
  return path.join(dir, 'perf.json');
}

export async function loadPrefs(): Promise<PerfPrefs> {
  try {
    const raw = await fs.readFile(prefsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, features: { ...DEFAULTS.features, ...(parsed.features ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrefs(prefs: PerfPrefs): Promise<void> {
  const file = prefsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(prefs, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** Resolve effective tier (override > auto). */
export async function getEffectiveTier(): Promise<PerfTier> {
  const prefs = await loadPrefs();
  return prefs.override ?? getPerfTier();
}
