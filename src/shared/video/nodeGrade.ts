// =============================================================================
// DEX Platform — Wave 2.1 VINX: node-based color grading graph
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * NodeGrade — DAG of color-grading operations applied per pixel.
 *
 * Each node is a pure function (rgba in -> rgba out). The graph supports
 * branching (split/merge nodes) and is topologically sorted before evaluation.
 *
 * Built-in node kinds:
 *   - 'input'      : marker for the pipeline source
 *   - 'lift-gamma-gain' : 3-axis SDR primary
 *   - 'curves'     : per-channel curve (RGB + master)
 *   - 'lut3d'      : applies a registered LUT
 *   - 'saturation' : HSV saturation scaler
 *   - 'temperature': white-balance temp/tint
 *   - 'split'      : branches into N
 *   - 'output'     : terminal sink
 *
 * Power-window/tracker nodes are typed but evaluated by a separate masked
 * compositor, not this CPU evaluator.
 */

import type { LUT3D } from './lut3d';

export type NodeKind =
  | 'input' | 'output' | 'lift-gamma-gain' | 'curves' | 'lut3d'
  | 'saturation' | 'temperature' | 'split' | 'merge'
  | 'power-window';

export interface NodeId { id: string }

export interface BaseNode extends NodeId {
  kind: NodeKind;
  inputs: string[];   // upstream node ids
  enabled: boolean;
}

export interface LiftGammaGainNode extends BaseNode {
  kind: 'lift-gamma-gain';
  lift:  [number, number, number]; // -1..+1 each channel
  gamma: [number, number, number]; // 0.1..10
  gain:  [number, number, number]; // 0..4
}

export interface CurvesNode extends BaseNode {
  kind: 'curves';
  /** master + r/g/b lookup tables (256 entries 0..1) — generated from control points elsewhere. */
  master: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export interface Lut3dNode extends BaseNode {
  kind: 'lut3d';
  lut: LUT3D;
  amount: number; // 0..1 mix
}

export interface SaturationNode extends BaseNode {
  kind: 'saturation';
  amount: number; // 0..2 (1 = unity)
}

export interface TemperatureNode extends BaseNode {
  kind: 'temperature';
  /** -100..+100 — negative cools, positive warms. */
  temp: number;
  /** -100..+100 — negative magenta, positive green. */
  tint: number;
}

export type GradeNode = BaseNode | LiftGammaGainNode | CurvesNode | Lut3dNode | SaturationNode | TemperatureNode;

export interface GradeGraph {
  nodes: GradeNode[];
  output: string;
}

/** Topologically order nodes so each node's inputs come first. */
export function topoSort(graph: GradeGraph): GradeNode[] {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const visited = new Set<string>();
  const order: GradeNode[] = [];
  const stack = new Set<string>();
  function visit(id: string): void {
    if (visited.has(id)) return;
    if (stack.has(id)) throw new Error(`NodeGrade: cycle detected at "${id}"`);
    const node = byId.get(id);
    if (!node) throw new Error(`NodeGrade: missing node "${id}"`);
    stack.add(id);
    for (const inp of node.inputs) visit(inp);
    stack.delete(id);
    visited.add(id);
    order.push(node);
  }
  visit(graph.output);
  return order;
}

/** Apply graph to a single RGBA pixel (values 0..1). Returns RGB out. */
export function evalPixel(graph: GradeGraph, rgba: [number, number, number]): [number, number, number] {
  const order = topoSort(graph);
  const cache = new Map<string, [number, number, number]>();
  for (const n of order) {
    if (!n.enabled || n.kind === 'input') {
      cache.set(n.id, n.kind === 'input' ? rgba : (cache.get(n.inputs[0] ?? '') ?? rgba));
      continue;
    }
    const src = cache.get(n.inputs[0] ?? '') ?? rgba;
    cache.set(n.id, evalNode(n, src, cache));
  }
  return cache.get(graph.output) ?? rgba;
}

function evalNode(n: GradeNode, src: [number, number, number], _cache: Map<string, [number, number, number]>): [number, number, number] {
  switch (n.kind) {
    case 'output':
      return src;
    case 'lift-gamma-gain': {
      const k = n as LiftGammaGainNode;
      const out: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        let v = src[i];
        v = v + k.lift[i] * (1 - v);
        v = Math.pow(Math.max(v, 0), 1 / Math.max(0.001, k.gamma[i]));
        v = v * k.gain[i];
        out[i] = clamp01(v);
      }
      return out;
    }
    case 'curves': {
      const k = n as CurvesNode;
      const r = lookupCurve(k.r, src[0]);
      const g = lookupCurve(k.g, src[1]);
      const b = lookupCurve(k.b, src[2]);
      return [
        lookupCurve(k.master, r),
        lookupCurve(k.master, g),
        lookupCurve(k.master, b),
      ];
    }
    case 'lut3d': {
      // Lazy-import to keep the engine self-contained for tests.
      const { sampleLut } = require('./lut3d') as typeof import('./lut3d');
      const k = n as Lut3dNode;
      const out = sampleLut(k.lut, src[0], src[1], src[2]);
      const a = clamp01(k.amount);
      return [
        src[0] * (1 - a) + out[0] * a,
        src[1] * (1 - a) + out[1] * a,
        src[2] * (1 - a) + out[2] * a,
      ];
    }
    case 'saturation': {
      const k = n as SaturationNode;
      const lum = 0.2126 * src[0] + 0.7152 * src[1] + 0.0722 * src[2];
      return [
        clamp01(lum + (src[0] - lum) * k.amount),
        clamp01(lum + (src[1] - lum) * k.amount),
        clamp01(lum + (src[2] - lum) * k.amount),
      ];
    }
    case 'temperature': {
      const k = n as TemperatureNode;
      // Coarse: temp shifts blue<->red, tint shifts green<->magenta.
      const t = k.temp / 100;
      const ti = k.tint / 100;
      return [
        clamp01(src[0] + 0.1 * t),
        clamp01(src[1] - 0.05 * ti),
        clamp01(src[2] - 0.1 * t + 0.05 * ti),
      ];
    }
    default:
      return src;
  }
}

function lookupCurve(curve: Float32Array, v: number): number {
  const N = curve.length;
  const x = clamp01(v) * (N - 1);
  const i0 = Math.floor(x), i1 = Math.min(i0 + 1, N - 1);
  const f = x - i0;
  return curve[i0]! * (1 - f) + curve[i1]! * f;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Identity 256-entry curve (passthrough). */
export function identityCurve(): Float32Array {
  const c = new Float32Array(256);
  for (let i = 0; i < 256; i++) c[i] = i / 255;
  return c;
}
