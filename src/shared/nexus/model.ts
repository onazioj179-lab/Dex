// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus memory model (NEX-059/060/063/066/067) — the pure entity + relation
 * graph behind the memory-first views defined in `memoryViews.ts`. Nexus today
 * renders a Canvas2D graph with no shared model; this is the data layer the
 * memory-first sidebar (Projects / Ideas / People / Files / Assets / Sessions /
 * Research / Conversations) reads from, fed incrementally by ContextBus events
 * and Rewind sessions.
 *
 * Pure: no DOM, no IO, no timers. Persistence (sqlite) and ingestion live above.
 */

/** Entity kinds align with the memory views in `memoryViews.ts`. */
export type NexusEntityKind =
  | 'project' | 'idea' | 'person' | 'file'
  | 'asset' | 'session' | 'research' | 'conversation';

export interface NexusEntity {
  id: string;
  kind: NexusEntityKind;
  label: string;
  /** Last-touched epoch ms (drives recency ordering). */
  ts: number;
  /** Optional free-form tags for filtering/search. */
  tags?: string[];
}

export interface NexusRelation {
  from: string;
  to: string;
  /** e.g. 'contains' | 'mentions' | 'co-occurs' | 'authored'. */
  kind: string;
  /** Strength; higher sorts first. Co-occurrence accumulates here. */
  weight: number;
}

interface ModelState {
  entities: Map<string, NexusEntity>;
  // Adjacency: from -> (to -> relation)
  relations: Map<string, Map<string, NexusRelation>>;
}

export class NexusModel {
  private state: ModelState = { entities: new Map(), relations: new Map() };

  /** Insert or update an entity (merges label/ts/tags; ts only moves forward). */
  upsertEntity(e: NexusEntity): NexusEntity {
    const existing = this.state.entities.get(e.id);
    const merged: NexusEntity = existing
      ? {
          ...existing,
          label: e.label || existing.label,
          ts: Math.max(existing.ts, e.ts),
          tags: e.tags ?? existing.tags,
          kind: e.kind,
        }
      : { ...e };
    this.state.entities.set(e.id, merged);
    return merged;
  }

  getEntity(id: string): NexusEntity | undefined {
    return this.state.entities.get(id);
  }

  hasEntity(id: string): boolean {
    return this.state.entities.has(id);
  }

  /** All entities of a kind, most-recently-touched first. */
  byKind(kind: NexusEntityKind): NexusEntity[] {
    const out: NexusEntity[] = [];
    this.state.entities.forEach((e) => { if (e.kind === kind) out.push(e); });
    return out.sort((a, b) => b.ts - a.ts);
  }

  entityCount(): number {
    return this.state.entities.size;
  }

  /** Create/strengthen a directed relation (weight accumulates). */
  link(from: string, to: string, kind = 'related', weight = 1): void {
    if (from === to) return;
    let row = this.state.relations.get(from);
    if (!row) { row = new Map(); this.state.relations.set(from, row); }
    const key = `${to}:${kind}`;
    const existing = row.get(key);
    if (existing) existing.weight += weight;
    else row.set(key, { from, to, kind, weight });
  }

  /** Relations leaving `id`, strongest first. */
  relationsFrom(id: string): NexusRelation[] {
    const row = this.state.relations.get(id);
    if (!row) return [];
    return Array.from(row.values()).sort((a, b) => b.weight - a.weight);
  }

  /** Entities related to `id` (resolved + de-duped), strongest first. */
  relatedTo(id: string, limit = 10): NexusEntity[] {
    const seen = new Set<string>();
    const out: NexusEntity[] = [];
    for (const rel of this.relationsFrom(id)) {
      if (seen.has(rel.to)) continue;
      seen.add(rel.to);
      const ent = this.state.entities.get(rel.to);
      if (ent) out.push(ent);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Infer co-occurrence relations from a group of entity ids that appeared
   * together (e.g. open at the same time / in the same session). Every pair gets
   * a symmetric 'co-occurs' link strengthened by `weight`.
   */
  inferCoOccurrence(ids: readonly string[], weight = 1): void {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        this.link(ids[i], ids[j], 'co-occurs', weight);
        this.link(ids[j], ids[i], 'co-occurs', weight);
      }
    }
  }

  /** Remove an entity and any relations referencing it (GC). */
  removeEntity(id: string): void {
    this.state.entities.delete(id);
    this.state.relations.delete(id);
    this.state.relations.forEach((row) => {
      for (const key of Array.from(row.keys())) {
        if (row.get(key)!.to === id) row.delete(key);
      }
    });
  }

  /** Drop entities not touched since `cutoffTs` (and their relations). */
  gcOlderThan(cutoffTs: number): number {
    const stale: string[] = [];
    this.state.entities.forEach((e) => { if (e.ts < cutoffTs) stale.push(e.id); });
    stale.forEach((id) => this.removeEntity(id));
    return stale.length;
  }

  clear(): void {
    this.state.entities.clear();
    this.state.relations.clear();
  }
}
