// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 5 - Creative ecosystem shared primitives.
 *
 * Shared timeline runtime + cross-app asset graph. Pure TS; no canvas/audio
 * I/O. Existing creative apps adopt these as their authoritative model.
 */

export interface TimelineClip {
  readonly id: string;
  readonly trackId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly assetId?: string;
}

export interface TimelineTrack {
  readonly id: string;
  readonly kind: 'video' | 'audio' | 'subtitle' | 'effect';
  readonly muted?: boolean;
}

export class SharedTimeline {
  private readonly tracks = new Map<string, TimelineTrack>();
  private readonly clips = new Map<string, TimelineClip>();
  private playhead = 0;

  addTrack(track: TimelineTrack): void {
    if (this.tracks.has(track.id)) throw new Error(`track ${track.id} exists`);
    this.tracks.set(track.id, track);
  }

  removeTrack(id: string): void {
    if (!this.tracks.delete(id)) return;
    for (const [cid, c] of this.clips) if (c.trackId === id) this.clips.delete(cid);
  }

  addClip(clip: TimelineClip): void {
    if (!this.tracks.has(clip.trackId)) throw new Error(`unknown track ${clip.trackId}`);
    if (this.clips.has(clip.id)) throw new Error(`clip ${clip.id} exists`);
    if (clip.durationMs <= 0) throw new Error('durationMs must be > 0');
    if (clip.startMs < 0) throw new Error('startMs must be >= 0');
    if (this.overlaps(clip)) throw new Error(`clip ${clip.id} overlaps existing clip on ${clip.trackId}`);
    this.clips.set(clip.id, clip);
  }

  removeClip(id: string): void {
    this.clips.delete(id);
  }

  listTracks(): TimelineTrack[] { return Array.from(this.tracks.values()); }
  listClips(trackId?: string): TimelineClip[] {
    const all = Array.from(this.clips.values());
    return trackId ? all.filter((c) => c.trackId === trackId) : all;
  }

  duration(): number {
    let max = 0;
    for (const c of this.clips.values()) max = Math.max(max, c.startMs + c.durationMs);
    return max;
  }

  scrub(timeMs: number): number {
    if (!Number.isFinite(timeMs)) throw new Error('timeMs must be finite');
    this.playhead = Math.max(0, Math.min(this.duration(), timeMs));
    return this.playhead;
  }

  position(): number { return this.playhead; }

  clipsAt(timeMs: number): TimelineClip[] {
    const out: TimelineClip[] = [];
    for (const c of this.clips.values()) {
      if (timeMs >= c.startMs && timeMs < c.startMs + c.durationMs) out.push(c);
    }
    return out;
  }

  private overlaps(c: TimelineClip): boolean {
    for (const other of this.clips.values()) {
      if (other.trackId !== c.trackId) continue;
      const aEnd = c.startMs + c.durationMs;
      const bEnd = other.startMs + other.durationMs;
      if (c.startMs < bEnd && other.startMs < aEnd) return true;
    }
    return false;
  }
}

export interface AssetNode {
  readonly id: string;
  readonly kind: 'image' | 'video' | 'audio' | 'doc' | 'project';
  readonly bytes: number;
  readonly path?: string;
}

export type AssetEdgeKind = 'embeds' | 'references' | 'derives-from';

export interface AssetEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: AssetEdgeKind;
}

export class AssetGraph {
  private readonly nodes = new Map<string, AssetNode>();
  private readonly outgoing = new Map<string, Map<string, AssetEdgeKind>>();
  private readonly incoming = new Map<string, Map<string, AssetEdgeKind>>();

  addAsset(node: AssetNode): void {
    if (this.nodes.has(node.id)) throw new Error(`asset ${node.id} exists`);
    this.nodes.set(node.id, node);
    this.outgoing.set(node.id, new Map());
    this.incoming.set(node.id, new Map());
  }

  removeAsset(id: string): void {
    if (!this.nodes.delete(id)) return;
    for (const target of this.outgoing.get(id)?.keys() ?? []) {
      this.incoming.get(target)?.delete(id);
    }
    for (const source of this.incoming.get(id)?.keys() ?? []) {
      this.outgoing.get(source)?.delete(id);
    }
    this.outgoing.delete(id);
    this.incoming.delete(id);
  }

  link(edge: AssetEdge): void {
    if (!this.nodes.has(edge.from)) throw new Error(`unknown asset ${edge.from}`);
    if (!this.nodes.has(edge.to)) throw new Error(`unknown asset ${edge.to}`);
    if (edge.from === edge.to) throw new Error('self-link not allowed');
    this.outgoing.get(edge.from)!.set(edge.to, edge.kind);
    this.incoming.get(edge.to)!.set(edge.from, edge.kind);
  }

  unlink(from: string, to: string): void {
    this.outgoing.get(from)?.delete(to);
    this.incoming.get(to)?.delete(from);
  }

  hasAsset(id: string): boolean { return this.nodes.has(id); }
  getAsset(id: string): AssetNode | undefined { return this.nodes.get(id); }
  list(): AssetNode[] { return Array.from(this.nodes.values()); }

  dependencies(id: string): AssetEdge[] {
    const m = this.outgoing.get(id);
    if (!m) return [];
    return Array.from(m, ([to, kind]) => ({ from: id, to, kind }));
  }

  dependents(id: string): AssetEdge[] {
    const m = this.incoming.get(id);
    if (!m) return [];
    return Array.from(m, ([from, kind]) => ({ from, to: id, kind }));
  }

  orphans(): AssetNode[] {
    const out: AssetNode[] = [];
    for (const node of this.nodes.values()) {
      const inc = this.incoming.get(node.id);
      const outg = this.outgoing.get(node.id);
      if ((inc?.size ?? 0) === 0 && (outg?.size ?? 0) === 0) out.push(node);
    }
    return out;
  }

  totalBytes(): number {
    let n = 0;
    for (const node of this.nodes.values()) n += node.bytes;
    return n;
  }
}
