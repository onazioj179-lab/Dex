// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pure helpers for the Nexus uplift wave (no React, no D3 import). Covers
 *
 *   - confidence-coloured node tinting
 *   - time-scrub timeline math (snapshot index lookup)
 *   - filter-chip predicate composition
 *   - 3D orbit camera matrix-free helpers (yaw/pitch + projection)
 *   - collab cursor LWW reducer
 *
 * Each helper is independently importable and self-tested.
 */

// DEX v3.8.9 wave C - Nexus uplift helpers

import { confidenceLabel, type ConfidenceLabel } from '../uki/confidence';

// ---------------- Confidence-coloured nodes ----------------

export interface NexusNodeColorTokens {
  high: string;
  medium: string;
  low: string;
  unknown: string;
}

export const DEFAULT_NEXUS_COLORS: NexusNodeColorTokens = {
  high: '#34C759',
  medium: '#FF9F0A',
  low: '#FF453A',
  unknown: '#8E8E93',
};

/**
 * Map a confidence score to a node colour. Returns the unknown colour for
 * non-numeric / out-of-range input so the caller never sees undefined.
 */
export function confidenceColor(
  score: number | undefined,
  tokens: NexusNodeColorTokens = DEFAULT_NEXUS_COLORS,
): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return tokens.unknown;
  const clamped = Math.max(0, Math.min(1, score));
  const lbl: ConfidenceLabel = confidenceLabel(clamped);
  return tokens[lbl];
}

// ---------------- Time-scrub timeline ----------------

export interface GraphSnapshot {
  /** ISO ms timestamp of when the snapshot was captured. */
  takenAt: number;
  /** Caller-defined data — usually an array of nodes/links. */
  data: unknown;
}

export interface TimelineRange {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** Compute the [start, end] range of a sorted snapshot list. */
export function snapshotRange(snapshots: GraphSnapshot[]): TimelineRange | null {
  if (snapshots.length === 0) return null;
  const startMs = snapshots[0].takenAt;
  const endMs = snapshots[snapshots.length - 1].takenAt;
  return { startMs, endMs, durationMs: Math.max(0, endMs - startMs) };
}

/**
 * Return the snapshot index whose `takenAt` is the latest <= cursorMs.
 * Returns 0 if cursor precedes everything, length-1 if it follows.
 * Snapshots MUST be sorted ascending by takenAt.
 */
export function snapshotIndexAt(snapshots: GraphSnapshot[], cursorMs: number): number {
  if (snapshots.length === 0) return -1;
  if (cursorMs <= snapshots[0].takenAt) return 0;
  if (cursorMs >= snapshots[snapshots.length - 1].takenAt) return snapshots.length - 1;
  // Binary search.
  let lo = 0; let hi = snapshots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (snapshots[mid].takenAt <= cursorMs) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Convert a [0..1] scrubber value into a snapshot index. */
export function scrubberToIndex(snapshots: GraphSnapshot[], t: number): number {
  if (snapshots.length === 0) return -1;
  const range = snapshotRange(snapshots)!;
  if (range.durationMs === 0) return 0;
  const cursor = range.startMs + Math.max(0, Math.min(1, t)) * range.durationMs;
  return snapshotIndexAt(snapshots, cursor);
}

// ---------------- Filter chip predicates ----------------

export interface NexusFilterableNode {
  id: string;
  category?: string;
  /** Last-touched timestamp ms. */
  updatedAt?: number;
  /** Confidence score in [0,1]. */
  confidence?: number;
}

export type ConfidenceBand = 'low' | 'medium' | 'high' | 'any';
export type RecencyBand = 'last-hour' | 'last-day' | 'last-week' | 'older' | 'any';

export interface NexusFilters {
  categories?: string[];
  confidence?: ConfidenceBand;
  recency?: RecencyBand;
  /** "now" override (ms) for deterministic recency calc. */
  nowMs?: number;
}

/** Build a single predicate from the chip selections. Pure. */
export function buildNodeFilter(filters: NexusFilters): (n: NexusFilterableNode) => boolean {
  const now = filters.nowMs ?? Date.now();
  const cats = filters.categories && filters.categories.length > 0
    ? new Set(filters.categories) : null;
  return (n) => {
    if (cats && (!n.category || !cats.has(n.category))) return false;
    if (filters.confidence && filters.confidence !== 'any') {
      if (typeof n.confidence !== 'number') return false;
      const lbl = confidenceLabel(Math.max(0, Math.min(1, n.confidence)));
      if (lbl !== filters.confidence) return false;
    }
    if (filters.recency && filters.recency !== 'any') {
      if (typeof n.updatedAt !== 'number') return false;
      const ageMs = now - n.updatedAt;
      switch (filters.recency) {
        case 'last-hour': if (ageMs > 3_600_000) return false; break;
        case 'last-day': if (ageMs > 86_400_000) return false; break;
        case 'last-week': if (ageMs > 604_800_000) return false; break;
        case 'older': if (ageMs <= 604_800_000) return false; break;
      }
    }
    return true;
  };
}

/** Convenience: apply filters to a list. */
export function applyNodeFilter<T extends NexusFilterableNode>(
  nodes: T[], filters: NexusFilters,
): T[] {
  const pred = buildNodeFilter(filters);
  return nodes.filter(pred);
}

// ---------------- 3D orbit camera ----------------

export interface OrbitCamera {
  /** Azimuth (around Y) in radians. */
  yaw: number;
  /** Elevation in radians, clamped to (-π/2 + ε, π/2 - ε). */
  pitch: number;
  /** Distance from target. */
  distance: number;
  /** Target point in world coords. */
  target: { x: number; y: number; z: number };
}

export function createOrbitCamera(over: Partial<OrbitCamera> = {}): OrbitCamera {
  return {
    yaw: 0, pitch: 0, distance: 500, target: { x: 0, y: 0, z: 0 },
    ...over,
  };
}

const PITCH_LIMIT = Math.PI / 2 - 0.01;

/** Rotate camera by deltas, clamping pitch. Returns a new camera. */
export function orbitRotate(cam: OrbitCamera, dYaw: number, dPitch: number): OrbitCamera {
  const yaw = (cam.yaw + dYaw) % (Math.PI * 2);
  const pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dPitch));
  return { ...cam, yaw, pitch };
}

/** Zoom by multiplier. min/max default to sensible Nexus bounds. */
export function orbitZoom(cam: OrbitCamera, factor: number, opts: { min?: number; max?: number } = {}): OrbitCamera {
  const min = opts.min ?? 80;
  const max = opts.max ?? 5000;
  const distance = Math.max(min, Math.min(max, cam.distance * factor));
  return { ...cam, distance };
}

/** Compute camera world-position from yaw/pitch/distance. */
export function cameraPosition(cam: OrbitCamera): { x: number; y: number; z: number } {
  const cp = Math.cos(cam.pitch);
  const x = cam.target.x + cam.distance * cp * Math.sin(cam.yaw);
  const y = cam.target.y + cam.distance * Math.sin(cam.pitch);
  const z = cam.target.z + cam.distance * cp * Math.cos(cam.yaw);
  return { x, y, z };
}

/**
 * Project a world point into camera-local space (z forward) without a full
 * matrix lib. Returns { x, y, depth } where depth is distance along view.
 */
export function projectPoint(cam: OrbitCamera, p: { x: number; y: number; z: number }): { x: number; y: number; depth: number } {
  // Translate to camera local.
  const dx = p.x - cam.target.x;
  const dy = p.y - cam.target.y;
  const dz = p.z - cam.target.z;
  // Rotate around Y by -yaw, then around X by -pitch.
  const cy = Math.cos(-cam.yaw); const sy = Math.sin(-cam.yaw);
  const x1 = dx * cy + dz * sy;
  const z1 = -dx * sy + dz * cy;
  const cp = Math.cos(-cam.pitch); const sp = Math.sin(-cam.pitch);
  const y1 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;
  // Push back by distance so camera sits at -distance along view axis.
  const depth = z2 + cam.distance;
  return { x: x1, y: y1, depth };
}

// ---------------- Collab cursor LWW reducer ----------------

export interface NexusCursorState {
  peerId: string;
  /** Node the peer's cursor is hovering, or null if off-graph. */
  nodeId: string | null;
  /** Last-write timestamp (ms). LWW resolution. */
  ts: number;
  nick?: string;
}

export interface CursorMap {
  cursors: Map<string, NexusCursorState>;
}

export function createCursorMap(): CursorMap { return { cursors: new Map() }; }

/**
 * Apply a cursor update with last-write-wins semantics. Older updates are
 * silently dropped (idempotent on replay).
 */
export function applyCursorUpdate(map: CursorMap, update: NexusCursorState): boolean {
  const existing = map.cursors.get(update.peerId);
  if (existing && existing.ts >= update.ts) return false;
  map.cursors.set(update.peerId, { ...update });
  return true;
}

/** Drop cursors that haven't moved within staleAfterMs. */
export function pruneStaleCursors(map: CursorMap, staleAfterMs: number, now: number = Date.now()): number {
  let removed = 0;
  for (const [peer, c] of map.cursors) {
    if (now - c.ts > staleAfterMs) { map.cursors.delete(peer); removed += 1; }
  }
  return removed;
}

/** All cursors on a given node (for stacking visual badges). */
export function cursorsOnNode(map: CursorMap, nodeId: string): NexusCursorState[] {
  return Array.from(map.cursors.values()).filter((c) => c.nodeId === nodeId);
}
