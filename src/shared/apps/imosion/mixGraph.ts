// =============================================================================
// DEX Platform — Track G2: Imosion mixing engine (logic-only)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Bus/send graph + gain/pan/peak math for the DAW. The audio thread (in
 * native) calls into this for plan resolution, then runs the DSP block.
 */

export interface MixBus {
  id: string;
  name: string;
  /** Linear gain (0..2). */
  gain: number;
  /** -1..+1, with 0 = center. */
  pan: number;
  /** True when muted. */
  mute: boolean;
  /** True when solo'd; if any bus is solo'd, others are muted. */
  solo: boolean;
  /** Output destination — bus id or 'master'. */
  output: string;
}

export interface MixSend {
  fromBusId: string;
  toBusId: string;
  /** 0..2. */
  gain: number;
  /** Pre/post fader. */
  prefader: boolean;
}

export interface MixGraph {
  buses: MixBus[];
  sends: MixSend[];
}

export type ResolvedRoute = {
  busId: string;
  /** Linear contribution to the master bus. */
  contribution: number;
  /** Pan position propagated. */
  pan: number;
  /** True if this bus is currently silenced by mute/solo logic. */
  silenced: boolean;
};

/** Compute effective contribution to master for each bus, accounting for solo logic. */
export function resolveRouting(graph: MixGraph): ResolvedRoute[] {
  const anySolo = graph.buses.some(b => b.solo);
  const silenceMap = new Map<string, boolean>();
  for (const b of graph.buses) {
    if (b.mute) silenceMap.set(b.id, true);
    else if (anySolo && !b.solo) silenceMap.set(b.id, true);
    else silenceMap.set(b.id, false);
  }
  // Walk graph: bus -> output until 'master', accumulating gain.
  const out: ResolvedRoute[] = [];
  for (const start of graph.buses) {
    let cursor = start;
    let g = 1;
    let pan = 0;
    let silenced = silenceMap.get(start.id) ?? false;
    let safety = 0;
    while (cursor && cursor.output !== 'master' && safety < graph.buses.length + 1) {
      g *= cursor.gain;
      pan = clamp(pan + cursor.pan, -1, 1);
      if (silenceMap.get(cursor.id)) silenced = true;
      const nxt = graph.buses.find(b => b.id === cursor.output);
      if (!nxt) { silenced = true; break; }
      cursor = nxt;
      safety += 1;
    }
    if (cursor) {
      g *= cursor.gain;
      pan = clamp(pan + cursor.pan, -1, 1);
      if (silenceMap.get(cursor.id)) silenced = true;
    }
    out.push({ busId: start.id, contribution: silenced ? 0 : g, pan, silenced });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** dBFS conversion. */
export function linearToDb(x: number): number { return x > 0 ? 20 * Math.log10(x) : -Infinity; }
export function dbToLinear(db: number): number { return Math.pow(10, db / 20); }

/** Equal-power pan law: returns left/right gain pair for pan in [-1,1]. */
export function panGains(pan: number): { l: number; r: number } {
  const p = clamp(pan, -1, 1);
  const angle = ((p + 1) * Math.PI) / 4; // 0..pi/2
  return { l: Math.cos(angle), r: Math.sin(angle) };
}

export interface MidiNote {
  /** 0..127 */
  note: number;
  velocity: number;
  /** Beats. */
  start: number;
  duration: number;
  channel: number;
}

/** Quantize a note start time to a beat grid. */
export function quantize(beats: number, gridDenominator: 4 | 8 | 16 | 32 | 64, strength = 1): number {
  const grid = 4 / gridDenominator; // beats per grid unit
  const snapped = Math.round(beats / grid) * grid;
  return beats + (snapped - beats) * clamp(strength, 0, 1);
}
