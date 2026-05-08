// =============================================================================
// DEX Platform — Wave 1.1 Imosion: sidechain & bus routing
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * SidechainRouter — pure logic for resolving the audio routing graph.
 *
 * Tracks declare:
 *   - input source (`audio-in:N`, `instrument:M`, `bus:K`, `sidechain:T`)
 *   - sends (pre/post fader, target bus, send level)
 *   - sidechain key source (per insert that consumes one)
 *
 * The router topologically sorts the routing graph and detects feedback
 * loops. Sidechain feeds are reported as auxiliary edges so the audio engine
 * can pre-buffer the key signal one block before processing the consumer.
 */

export type BusId = string;
export type TrackId = string;

export type RouteSource =
  | { kind: 'input'; id: string }
  | { kind: 'instrument'; id: string }
  | { kind: 'bus'; id: BusId };

export interface SendDescriptor {
  toBus: BusId;
  /** Linear amplitude 0..1. */
  level: number;
  /** Pre-fader if true, else post. */
  pre: boolean;
  /** -1 (full left) .. +1 (full right). */
  pan: number;
}

export interface InsertSidechainKey {
  /** Insert index (per track) that consumes a key signal. */
  insertIndex: number;
  /** Key source — usually a bus or another track. */
  source: RouteSource;
}

export interface RoutingTrack {
  id: TrackId;
  source: RouteSource;
  sends: SendDescriptor[];
  /** Output bus (master by default). */
  outputBus: BusId;
  /** Sidechain inputs consumed by this track's inserts. */
  sidechains: InsertSidechainKey[];
  /** VCA group id (master fader controlling this track), if any. */
  vca?: string;
  /** Frozen-track audio cache id (renders bypassed when set). */
  frozenCacheId?: string;
}

export interface RoutingBus {
  id: BusId;
  /** Where this bus outputs to (another bus or 'master'). */
  output: BusId | 'master';
}

export interface RoutingGraph {
  buses: RoutingBus[];
  tracks: RoutingTrack[];
  master: BusId;
}

export interface RoutingPlan {
  /** Order in which signal must be processed (inputs first). */
  processOrder: TrackId[];
  /** For each track, the sidechain keys to capture this block (one block lag). */
  sidechainKeys: Map<TrackId, RouteSource[]>;
  /** Detected feedback cycles (signal-flow cycles only — sidechain edges are allowed). */
  cycles: TrackId[][];
  /** Tracks marked frozen and bypassed. */
  frozen: TrackId[];
}

export function planRouting(graph: RoutingGraph): RoutingPlan {
  // Build adjacency for the audio dependency: track depends on its source bus
  // (if any) and sends produce dependencies on the bus they target only for
  // ordering downstream consumers, not upstream of the producer.

  const trackById = new Map(graph.tracks.map(t => [t.id, t]));
  const busById = new Map(graph.buses.map(b => [b.id, b]));

  // Producers per bus: tracks whose output is this bus, plus tracks that
  // send to this bus.
  const producersFor = new Map<BusId, TrackId[]>();
  for (const t of graph.tracks) {
    push(producersFor, t.outputBus, t.id);
    for (const s of t.sends) push(producersFor, s.toBus, t.id);
  }

  // Track ordering: a track that sources from a bus must come AFTER all
  // producers of that bus (they need to fill it first).
  const inDeg = new Map<TrackId, number>();
  const outEdges = new Map<TrackId, Set<TrackId>>();
  for (const t of graph.tracks) { inDeg.set(t.id, 0); outEdges.set(t.id, new Set()); }

  for (const t of graph.tracks) {
    if (t.source.kind === 'bus') {
      const producers = producersFor.get(t.source.id) ?? [];
      for (const p of producers) {
        if (p === t.id) continue;
        const set = outEdges.get(p)!;
        if (!set.has(t.id)) {
          set.add(t.id);
          inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1);
        }
      }
    }
  }

  // Kahn topo sort
  const order: TrackId[] = [];
  const queue: TrackId[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outEdges.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  // Detect cycles: any track not yet in order is part of a cycle.
  const cycles: TrackId[][] = [];
  const remaining = graph.tracks.filter(t => !order.includes(t.id)).map(t => t.id);
  if (remaining.length > 0) {
    cycles.push(remaining);
    // Append in arbitrary order so the engine can still process them with
    // the standard one-block delay.
    order.push(...remaining);
  }

  // Sidechain keys per track — these introduce a 1-block latency, not a
  // hard topo dependency.
  const sidechainKeys = new Map<TrackId, RouteSource[]>();
  for (const t of graph.tracks) {
    if (t.sidechains.length > 0) {
      sidechainKeys.set(t.id, t.sidechains.map(s => s.source));
    }
  }

  // Sanity: master bus exists
  if (!busById.has(graph.master)) {
    throw new Error(`SidechainRouter: master bus "${graph.master}" not in graph`);
  }

  const frozen = graph.tracks.filter(t => t.frozenCacheId).map(t => t.id);

  return { processOrder: order, sidechainKeys, cycles, frozen };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
