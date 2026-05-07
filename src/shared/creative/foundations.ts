// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave A — Creative foundations.
// Pure helpers: capped undo history, autosave snapshots, project health,
// export validation, missing-asset recovery, queue tracking, performance
// budgets. Zero Electron/React dependency, fully deterministic.

// ---------------------------------------------------------------------------
// Capped Undo History
// ---------------------------------------------------------------------------

export interface UndoEntry<T> {
  id: string;
  timestamp: number;
  label: string;
  state: T;
  byteSize: number;
}

export interface UndoStackOptions {
  maxEntries: number;
  maxBytes: number;
}

export interface UndoStack<T> {
  past: ReadonlyArray<UndoEntry<T>>;
  future: ReadonlyArray<UndoEntry<T>>;
  totalBytes: number;
}

export function createUndoStack<T>(): UndoStack<T> {
  return { past: [], future: [], totalBytes: 0 };
}

export function pushUndo<T>(
  stack: UndoStack<T>,
  entry: UndoEntry<T>,
  options: UndoStackOptions,
): UndoStack<T> {
  let past = [...stack.past, entry];
  let totalBytes = stack.totalBytes + entry.byteSize;
  while (past.length > options.maxEntries || totalBytes > options.maxBytes) {
    const dropped = past.shift();
    if (!dropped) break;
    totalBytes -= dropped.byteSize;
  }
  return { past, future: [], totalBytes };
}

export function undo<T>(stack: UndoStack<T>): { stack: UndoStack<T>; entry: UndoEntry<T> | null } {
  if (stack.past.length === 0) return { stack, entry: null };
  const past = stack.past.slice(0, -1);
  const entry = stack.past[stack.past.length - 1];
  return {
    stack: {
      past,
      future: [entry, ...stack.future],
      totalBytes: stack.totalBytes - entry.byteSize,
    },
    entry,
  };
}

export function redo<T>(stack: UndoStack<T>): { stack: UndoStack<T>; entry: UndoEntry<T> | null } {
  if (stack.future.length === 0) return { stack, entry: null };
  const [entry, ...future] = stack.future;
  return {
    stack: {
      past: [...stack.past, entry],
      future,
      totalBytes: stack.totalBytes + entry.byteSize,
    },
    entry,
  };
}

// ---------------------------------------------------------------------------
// Autosave Scheduler
// ---------------------------------------------------------------------------

export interface AutosavePolicy {
  /** Minimum interval between snapshots, ms. */
  minIntervalMs: number;
  /** Save immediately after this many edits regardless of interval. */
  burstThreshold: number;
  /** Save immediately if user has been idle for this many ms. */
  idleSaveMs: number;
}

export interface AutosaveState {
  lastSavedAt: number;
  lastEditAt: number;
  pendingEdits: number;
}

export const DEFAULT_AUTOSAVE: AutosavePolicy = {
  minIntervalMs: 30_000,
  burstThreshold: 25,
  idleSaveMs: 5_000,
};

export function createAutosaveState(now: number): AutosaveState {
  return { lastSavedAt: now, lastEditAt: now, pendingEdits: 0 };
}

export function recordEdit(state: AutosaveState, now: number): AutosaveState {
  return { ...state, lastEditAt: now, pendingEdits: state.pendingEdits + 1 };
}

export function shouldAutosave(
  state: AutosaveState,
  policy: AutosavePolicy,
  now: number,
): boolean {
  if (state.pendingEdits === 0) return false;
  if (state.pendingEdits >= policy.burstThreshold) return true;
  if (now - state.lastEditAt >= policy.idleSaveMs) return true;
  if (now - state.lastSavedAt >= policy.minIntervalMs) return true;
  return false;
}

export function markSaved(state: AutosaveState, now: number): AutosaveState {
  return { ...state, lastSavedAt: now, pendingEdits: 0 };
}

// ---------------------------------------------------------------------------
// Project Health Check
// ---------------------------------------------------------------------------

export type HealthSeverity = 'info' | 'warning' | 'error';

export interface HealthIssue {
  id: string;
  severity: HealthSeverity;
  message: string;
  fixHint?: string;
}

export interface ProjectStats {
  totalAssets: number;
  missingAssets: number;
  totalDurationMs: number;
  trackCount: number;
  unsavedSeconds: number;
  unusedAssetCount: number;
  estimatedExportBytes: number;
  diskFreeBytes: number;
}

export function checkProjectHealth(stats: ProjectStats): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (stats.missingAssets > 0) {
    issues.push({
      id: 'missing-assets',
      severity: 'error',
      message: `${stats.missingAssets} asset${stats.missingAssets === 1 ? '' : 's'} missing.`,
      fixHint: 'Open the relink wizard to locate the files.',
    });
  }
  if (stats.unsavedSeconds > 120) {
    issues.push({
      id: 'unsaved-changes',
      severity: 'warning',
      message: `Unsaved for ${Math.round(stats.unsavedSeconds)}s.`,
      fixHint: 'Trigger autosave or save manually.',
    });
  }
  if (stats.unusedAssetCount > 50) {
    issues.push({
      id: 'unused-assets',
      severity: 'info',
      message: `${stats.unusedAssetCount} unused assets in project.`,
      fixHint: 'Run "Consolidate media" to slim the project.',
    });
  }
  if (stats.estimatedExportBytes > stats.diskFreeBytes) {
    issues.push({
      id: 'disk-full',
      severity: 'error',
      message: 'Estimated export exceeds free disk space.',
      fixHint: 'Free at least the difference or pick another drive.',
    });
  }
  if (stats.trackCount > 200) {
    issues.push({
      id: 'too-many-tracks',
      severity: 'warning',
      message: 'Track count over 200 may impact playback performance.',
      fixHint: 'Group tracks into busses or freeze unused ones.',
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Export Validation
// ---------------------------------------------------------------------------

export interface ExportSpec {
  format: string;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  bitrateKbps?: number;
  codec?: string;
}

export interface ExportValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const KNOWN_VIDEO_FORMATS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'prores', 'dnxhr']);
const KNOWN_AUDIO_FORMATS = new Set(['wav', 'aiff', 'flac', 'mp3', 'ogg', 'aac', 'opus']);
const KNOWN_IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'gif']);

export function validateExport(spec: ExportSpec): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fmt = spec.format.toLowerCase();
  const isVideo = KNOWN_VIDEO_FORMATS.has(fmt);
  const isAudio = KNOWN_AUDIO_FORMATS.has(fmt);
  const isImage = KNOWN_IMAGE_FORMATS.has(fmt);
  if (!isVideo && !isAudio && !isImage) {
    errors.push(`Unknown format "${spec.format}".`);
  }
  if (isVideo || isImage) {
    if (!spec.width || !spec.height) errors.push('Width and height are required.');
    if (spec.width && spec.width % 2 !== 0) warnings.push('Width is odd; some codecs require even.');
    if (spec.height && spec.height % 2 !== 0) warnings.push('Height is odd; some codecs require even.');
    if (spec.width && spec.width < 16) errors.push('Width below minimum (16px).');
    if (spec.height && spec.height < 16) errors.push('Height below minimum (16px).');
    if (spec.width && spec.width > 16384) warnings.push('Width above 16K may not decode everywhere.');
  }
  if (isVideo) {
    if (!spec.fps || spec.fps <= 0) errors.push('FPS must be > 0.');
    if (spec.fps && spec.fps > 240) warnings.push('FPS above 240 is unusual.');
  }
  if (isAudio || isVideo) {
    if (spec.sampleRate !== undefined) {
      if (spec.sampleRate < 8000) errors.push('Sample rate below 8 kHz.');
      if (spec.sampleRate > 384000) errors.push('Sample rate above 384 kHz.');
    }
    if (spec.bitDepth !== undefined && ![8, 16, 24, 32].includes(spec.bitDepth)) {
      errors.push('Bit depth must be 8, 16, 24, or 32.');
    }
    if (spec.channels !== undefined && (spec.channels < 1 || spec.channels > 24)) {
      errors.push('Channel count out of range (1–24).');
    }
  }
  if (spec.bitrateKbps !== undefined && spec.bitrateKbps <= 0) {
    errors.push('Bitrate must be positive.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Missing-Asset Recovery (relink heuristic)
// ---------------------------------------------------------------------------

export interface AssetRef {
  id: string;
  originalPath: string;
  byteSize: number;
  hash?: string;
}

export interface CandidatePath {
  path: string;
  byteSize: number;
  hash?: string;
}

export interface RelinkSuggestion {
  assetId: string;
  candidate: CandidatePath;
  confidence: number; // 0..1
  reason: string;
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function suggestRelinks(
  missing: AssetRef[],
  candidates: CandidatePath[],
): RelinkSuggestion[] {
  const out: RelinkSuggestion[] = [];
  for (const m of missing) {
    const mName = basename(m.originalPath).toLowerCase();
    let best: RelinkSuggestion | null = null;
    for (const c of candidates) {
      const cName = basename(c.path).toLowerCase();
      let confidence = 0;
      let reason = '';
      if (m.hash && c.hash && m.hash === c.hash) {
        confidence = 1;
        reason = 'Exact hash match.';
      } else if (cName === mName && c.byteSize === m.byteSize) {
        confidence = 0.9;
        reason = 'Same name and size.';
      } else if (cName === mName) {
        confidence = 0.7;
        reason = 'Same filename.';
      } else if (c.byteSize === m.byteSize && m.byteSize > 0) {
        confidence = 0.4;
        reason = 'Same byte size.';
      }
      if (confidence > 0 && (!best || confidence > best.confidence)) {
        best = { assetId: m.id, candidate: c, confidence, reason };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Render / Export Queue Tracker
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueJob<T = unknown> {
  id: string;
  status: JobStatus;
  progress: number; // 0..1
  enqueuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  payload: T;
}

export interface QueueStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  averageDurationMs: number | null;
  estimatedRemainingMs: number | null;
}

export function summariseQueue<T>(jobs: ReadonlyArray<QueueJob<T>>, now: number): QueueStats {
  const stats: QueueStats = {
    total: jobs.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    averageDurationMs: null,
    estimatedRemainingMs: null,
  };
  let durSum = 0;
  let durCount = 0;
  for (const j of jobs) {
    stats[j.status]++;
    if (j.status === 'completed' && j.startedAt !== null && j.finishedAt !== null) {
      durSum += j.finishedAt - j.startedAt;
      durCount++;
    }
  }
  if (durCount > 0) stats.averageDurationMs = durSum / durCount;
  if (stats.averageDurationMs !== null) {
    const runningRemaining = jobs
      .filter(j => j.status === 'running' && j.startedAt !== null)
      .reduce((acc, j) => {
        const elapsed = now - (j.startedAt as number);
        const expected = stats.averageDurationMs as number;
        const left = Math.max(0, expected * (1 - j.progress) - 0);
        return acc + Math.max(0, left, expected - elapsed);
      }, 0);
    stats.estimatedRemainingMs = runningRemaining + stats.queued * (stats.averageDurationMs ?? 0);
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Performance Budget
// ---------------------------------------------------------------------------

export type PerfTier = 'low' | 'mid' | 'high';

export interface PerfBudget {
  tier: PerfTier;
  maxFrameMs: number;
  maxAudioBufferMs: number;
  maxConcurrentRenders: number;
  maxLayers: number;
  maxParticles: number;
  blurAllowed: boolean;
  shadowsAllowed: boolean;
}

export function defaultBudget(tier: PerfTier): PerfBudget {
  switch (tier) {
    case 'low':
      return {
        tier,
        maxFrameMs: 33,
        maxAudioBufferMs: 20,
        maxConcurrentRenders: 1,
        maxLayers: 24,
        maxParticles: 500,
        blurAllowed: false,
        shadowsAllowed: false,
      };
    case 'mid':
      return {
        tier,
        maxFrameMs: 22,
        maxAudioBufferMs: 10,
        maxConcurrentRenders: 2,
        maxLayers: 80,
        maxParticles: 5000,
        blurAllowed: true,
        shadowsAllowed: true,
      };
    case 'high':
      return {
        tier,
        maxFrameMs: 16,
        maxAudioBufferMs: 5,
        maxConcurrentRenders: 4,
        maxLayers: 256,
        maxParticles: 50000,
        blurAllowed: true,
        shadowsAllowed: true,
      };
  }
}

export function pickTierFromHeuristics(input: {
  cores: number;
  ramGb: number;
  hasGpu: boolean;
  onBattery: boolean;
}): PerfTier {
  if (input.onBattery) return input.cores >= 8 && input.ramGb >= 16 ? 'mid' : 'low';
  if (input.cores >= 8 && input.ramGb >= 16 && input.hasGpu) return 'high';
  if (input.cores >= 4 && input.ramGb >= 8) return 'mid';
  return 'low';
}
