// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave D v4.0.1 - Prism non-destructive image stack.
// Pure layer/blend/mask graph; no canvas/DOM.

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion';

export type AdjustmentKind =
  | 'exposure' | 'contrast' | 'saturation' | 'hue-rotate'
  | 'levels' | 'curves' | 'gamma' | 'temperature' | 'tint'
  | 'invert' | 'grayscale' | 'sepia' | 'sharpen' | 'blur';

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  amount: number;
  enabled: boolean;
  parameters?: Record<string, number>;
}

export interface MaskRef { id: string; type: 'pixel' | 'vector' | 'luma' | 'channel'; inverted: boolean }

export interface Layer {
  id: string;
  name: string;
  kind: 'pixel' | 'adjustment' | 'group' | 'text' | 'shape' | 'smart';
  visible: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  adjustments: Adjustment[];
  mask?: MaskRef;
  children?: Layer[];
  locked: boolean;
}

export interface LayerStack { layers: Layer[] }

export function newLayer(partial: Partial<Layer> & Pick<Layer, 'id' | 'name'>): Layer {
  return {
    kind: 'pixel', visible: true, opacity: 1, blendMode: 'normal',
    adjustments: [], locked: false, ...partial,
  };
}

export function moveLayer(stack: LayerStack, id: string, toIndex: number): LayerStack {
  const idx = stack.layers.findIndex(l => l.id === id);
  if (idx < 0) return stack;
  const layers = [...stack.layers];
  const [layer] = layers.splice(idx, 1);
  layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, layer);
  return { layers };
}

export function setLayerProp<K extends keyof Layer>(
  stack: LayerStack, id: string, key: K, value: Layer[K],
): LayerStack {
  return { layers: stack.layers.map(l => l.id === id ? { ...l, [key]: value } : l) };
}

export function addAdjustment(stack: LayerStack, layerId: string, adj: Adjustment): LayerStack {
  return {
    layers: stack.layers.map(l =>
      l.id === layerId ? { ...l, adjustments: [...l.adjustments, adj] } : l,
    ),
  };
}

export function reorderAdjustment(
  stack: LayerStack, layerId: string, adjId: string, toIndex: number,
): LayerStack {
  return {
    layers: stack.layers.map(l => {
      if (l.id !== layerId) return l;
      const idx = l.adjustments.findIndex(a => a.id === adjId);
      if (idx < 0) return l;
      const adj = [...l.adjustments];
      const [item] = adj.splice(idx, 1);
      adj.splice(Math.max(0, Math.min(adj.length, toIndex)), 0, item);
      return { ...l, adjustments: adj };
    }),
  };
}

export function flattenForExport(stack: LayerStack): Layer[] {
  const out: Layer[] = [];
  const walk = (layers: ReadonlyArray<Layer>) => {
    for (const l of layers) {
      if (!l.visible) continue;
      if (l.kind === 'group' && l.children) walk(l.children);
      else out.push(l);
    }
  };
  walk(stack.layers);
  return out;
}

// ---------- Blend math (0..1 floats per channel) ----------

export function blendPixel(
  base: { r: number; g: number; b: number; a: number },
  src: { r: number; g: number; b: number; a: number },
  mode: BlendMode,
  opacity: number,
): { r: number; g: number; b: number; a: number } {
  const a = src.a * Math.max(0, Math.min(1, opacity));
  const blend = (b: number, s: number): number => {
    switch (mode) {
      case 'normal': return s;
      case 'multiply': return b * s;
      case 'screen': return 1 - (1 - b) * (1 - s);
      case 'overlay': return b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case 'darken': return Math.min(b, s);
      case 'lighten': return Math.max(b, s);
      case 'color-dodge': return s >= 1 ? 1 : Math.min(1, b / (1 - s));
      case 'color-burn': return s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
      case 'hard-light': return s < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case 'soft-light':
        if (s < 0.5) return b - (1 - 2 * s) * b * (1 - b);
        return b + (2 * s - 1) * ((b < 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
      case 'difference': return Math.abs(b - s);
      case 'exclusion': return b + s - 2 * b * s;
    }
  };
  return {
    r: base.r * (1 - a) + blend(base.r, src.r) * a,
    g: base.g * (1 - a) + blend(base.g, src.g) * a,
    b: base.b * (1 - a) + blend(base.b, src.b) * a,
    a: base.a + a - base.a * a,
  };
}

// ---------- Color conversions ----------

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (h / 360 + 1) % 1;
  const tc = [hk + 1 / 3, hk, hk - 1 / 3].map(t => (t + 1) % 1);
  const conv = (t: number) => {
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: conv(tc[0]), g: conv(tc[1]), b: conv(tc[2]) };
}

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ---------- Adjustment evaluators ----------

export function applyExposure(value: number, stops: number): number {
  return value * Math.pow(2, stops);
}

export function applyContrast(value: number, amount: number): number {
  return (value - 0.5) * (1 + amount) + 0.5;
}

export function applyGamma(value: number, gamma: number): number {
  return Math.pow(Math.max(0, value), 1 / Math.max(0.01, gamma));
}

export function applyLevels(value: number, blackIn: number, whiteIn: number, gamma: number, blackOut: number, whiteOut: number): number {
  const t = Math.max(0, Math.min(1, (value - blackIn) / Math.max(1e-9, whiteIn - blackIn)));
  const g = Math.pow(t, 1 / Math.max(0.01, gamma));
  return blackOut + g * (whiteOut - blackOut);
}

export function buildLut1d(
  size: number, transform: (v: number) => number,
): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = transform(i / (size - 1));
  return out;
}

export function evaluateLut1d(lut: Float32Array, value: number): number {
  const v = Math.max(0, Math.min(1, value));
  const idx = v * (lut.length - 1);
  const a = Math.floor(idx);
  const b = Math.min(lut.length - 1, a + 1);
  return lut[a] + (lut[b] - lut[a]) * (idx - a);
}

// ---------- Tile & smart-object cache key ----------

export function tileKey(layerId: string, x: number, y: number, level: number, version: number): string {
  return `${layerId}|${level}|${x}|${y}|v${version}`;
}

// ---------- Histogram ----------

export interface ImageHistogram { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array }

export function buildHistogram(rgba: Uint8Array | Uint8ClampedArray): ImageHistogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    r[rgba[i]]++; g[rgba[i + 1]]++; b[rgba[i + 2]]++;
    const y = Math.min(255, Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]));
    luma[y]++;
  }
  return { r, g, b, luma };
}

// ---------- Auto color analysis ----------

export interface AutoCorrectAdvice {
  exposure: number;
  contrast: number;
  whiteBalanceShift: number;
  reason: string;
}

export function analyseAutoCorrect(hist: ImageHistogram): AutoCorrectAdvice {
  const total = hist.luma.reduce((a, b) => a + b, 0) || 1;
  let cum = 0;
  let lowPercentile = 0;
  let highPercentile = 255;
  for (let i = 0; i < 256; i++) {
    cum += hist.luma[i];
    if (cum / total > 0.005 && lowPercentile === 0) lowPercentile = i;
    if (cum / total > 0.995) { highPercentile = i; break; }
  }
  const range = highPercentile - lowPercentile;
  let exposure = 0;
  let contrast = 0;
  if (range < 200) contrast = (200 - range) / 255;
  const meanLuma = hist.luma.reduce((acc, c, i) => acc + c * i, 0) / total;
  if (meanLuma < 90) exposure = 0.5;
  if (meanLuma > 170) exposure = -0.4;
  const meanR = hist.r.reduce((a, c, i) => a + c * i, 0) / total;
  const meanB = hist.b.reduce((a, c, i) => a + c * i, 0) / total;
  const wb = (meanB - meanR) / 255;
  return {
    exposure, contrast, whiteBalanceShift: wb,
    reason: `range=${range} mean=${meanLuma.toFixed(1)} wbBias=${wb.toFixed(2)}`,
  };
}
