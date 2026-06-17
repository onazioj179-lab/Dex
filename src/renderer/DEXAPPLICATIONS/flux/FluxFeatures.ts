// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Flux Motion Graphics Feature Enhancements
 * Shape Morphing, Path Animation, Easing, Graph Editor
 */

// ==================== EASING PRESETS ====================
export interface EasingPreset {
  id: string;
  name: string;
  category: 'basic' | 'power' | 'elastic' | 'bounce' | 'back' | 'custom';
  bezier: [number, number, number, number]; // cubic-bezier values
  description: string;
}

export const EASING_PRESETS: EasingPreset[] = [
  // Basic
  { id: 'linear', name: 'Linear', category: 'basic', bezier: [0, 0, 1, 1], description: 'Constant speed' },
  { id: 'ease', name: 'Ease', category: 'basic', bezier: [0.25, 0.1, 0.25, 1], description: 'Smooth start and end' },
  { id: 'ease-in', name: 'Ease In', category: 'basic', bezier: [0.42, 0, 1, 1], description: 'Slow start' },
  { id: 'ease-out', name: 'Ease Out', category: 'basic', bezier: [0, 0, 0.58, 1], description: 'Slow end' },
  { id: 'ease-in-out', name: 'Ease In Out', category: 'basic', bezier: [0.42, 0, 0.58, 1], description: 'Slow start and end' },
  
  // Power (Quad, Cubic, Quart, Quint)
  { id: 'power1-in', name: 'Power1 In', category: 'power', bezier: [0.55, 0.085, 0.68, 0.53], description: 'Gentle acceleration' },
  { id: 'power1-out', name: 'Power1 Out', category: 'power', bezier: [0.25, 0.46, 0.45, 0.94], description: 'Gentle deceleration' },
  { id: 'power2-in', name: 'Power2 In', category: 'power', bezier: [0.55, 0.055, 0.675, 0.19], description: 'Medium acceleration' },
  { id: 'power2-out', name: 'Power2 Out', category: 'power', bezier: [0.215, 0.61, 0.355, 1], description: 'Medium deceleration' },
  { id: 'power3-in', name: 'Power3 In', category: 'power', bezier: [0.895, 0.03, 0.685, 0.22], description: 'Strong acceleration' },
  { id: 'power3-out', name: 'Power3 Out', category: 'power', bezier: [0.165, 0.84, 0.44, 1], description: 'Strong deceleration' },
  { id: 'power4-in', name: 'Power4 In', category: 'power', bezier: [0.755, 0.05, 0.855, 0.06], description: 'Very strong acceleration' },
  { id: 'power4-out', name: 'Power4 Out', category: 'power', bezier: [0.23, 1, 0.32, 1], description: 'Very strong deceleration' },
  
  // Elastic
  { id: 'elastic-in', name: 'Elastic In', category: 'elastic', bezier: [0.5, -0.5, 0.75, 1.5], description: 'Elastic start' },
  { id: 'elastic-out', name: 'Elastic Out', category: 'elastic', bezier: [0.25, -0.5, 0.5, 1.5], description: 'Elastic end' },
  { id: 'elastic-in-out', name: 'Elastic In Out', category: 'elastic', bezier: [0.5, -0.25, 0.5, 1.25], description: 'Elastic both' },
  
  // Bounce
  { id: 'bounce-in', name: 'Bounce In', category: 'bounce', bezier: [0.6, -0.28, 0.735, 0.045], description: 'Bounce start' },
  { id: 'bounce-out', name: 'Bounce Out', category: 'bounce', bezier: [0.34, 1.56, 0.64, 1], description: 'Bounce end' },
  { id: 'bounce-in-out', name: 'Bounce In Out', category: 'bounce', bezier: [0.68, -0.55, 0.265, 1.55], description: 'Bounce both' },
  
  // Back (Overshoot)
  { id: 'back-in', name: 'Back In', category: 'back', bezier: [0.6, -0.28, 0.735, 0.045], description: 'Pull back then forward' },
  { id: 'back-out', name: 'Back Out', category: 'back', bezier: [0.175, 0.885, 0.32, 1.275], description: 'Overshoot then settle' },
  { id: 'back-in-out', name: 'Back In Out', category: 'back', bezier: [0.68, -0.55, 0.265, 1.55], description: 'Pull back, overshoot, settle' },
  
  // Motion Design Favorites
  { id: 'smooth', name: 'Smooth', category: 'custom', bezier: [0.4, 0, 0.2, 1], description: 'Material Design smooth' },
  { id: 'snappy', name: 'Snappy', category: 'custom', bezier: [0.2, 0, 0, 1], description: 'Quick and responsive' },
  { id: 'anticipate', name: 'Anticipate', category: 'custom', bezier: [0.68, -0.6, 0.32, 1.6], description: 'Build up then snap' },
  { id: 'overshoot', name: 'Overshoot', category: 'custom', bezier: [0.34, 1.56, 0.64, 1], description: 'Go past then back' },
  { id: 'spring', name: 'Spring', category: 'custom', bezier: [0.5, 1.8, 0.5, 0.8], description: 'Spring physics feel' },
];

// ==================== GRAPH EDITOR ====================
export interface GraphEditorSettings {
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showHandles: boolean;
  showCurve: boolean;
  showKeyframes: boolean;
  autoZoom: boolean;
  separateXY: boolean;
}

export const DEFAULT_GRAPH_SETTINGS: GraphEditorSettings = {
  showGrid: true,
  snapToGrid: true,
  gridSize: 10,
  showHandles: true,
  showCurve: true,
  showKeyframes: true,
  autoZoom: true,
  separateXY: false,
};

export interface KeyframeHandle {
  type: 'in' | 'out';
  x: number;
  y: number;
  length: number;
  angle: number;
  linked: boolean;
}

export interface GraphKeyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingPreset['id'];
  handleIn: KeyframeHandle;
  handleOut: KeyframeHandle;
  selected: boolean;
}

// ==================== SHAPE MORPHING ====================
export interface MorphSettings {
  enabled: boolean;
  startShape: PathData;
  endShape: PathData;
  morphType: 'linear' | 'angular' | 'radial';
  preserveCorners: boolean;
  addPoints: boolean;
}

export interface PathData {
  id: string;
  points: PathPoint[];
  closed: boolean;
}

export interface PathPoint {
  x: number;
  y: number;
  handleIn: { x: number; y: number };
  handleOut: { x: number; y: number };
  type: 'corner' | 'smooth' | 'symmetric';
}

// Shape presets for morphing
export const MORPH_SHAPES = {
  circle: (cx: number, cy: number, r: number): PathData => ({
    id: 'circle',
    closed: true,
    points: [
      { x: cx, y: cy - r, handleIn: { x: -r * 0.55, y: 0 }, handleOut: { x: r * 0.55, y: 0 }, type: 'smooth' },
      { x: cx + r, y: cy, handleIn: { x: 0, y: -r * 0.55 }, handleOut: { x: 0, y: r * 0.55 }, type: 'smooth' },
      { x: cx, y: cy + r, handleIn: { x: r * 0.55, y: 0 }, handleOut: { x: -r * 0.55, y: 0 }, type: 'smooth' },
      { x: cx - r, y: cy, handleIn: { x: 0, y: r * 0.55 }, handleOut: { x: 0, y: -r * 0.55 }, type: 'smooth' },
    ],
  }),
  square: (cx: number, cy: number, size: number): PathData => ({
    id: 'square',
    closed: true,
    points: [
      { x: cx - size / 2, y: cy - size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
      { x: cx + size / 2, y: cy - size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
      { x: cx + size / 2, y: cy + size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
      { x: cx - size / 2, y: cy + size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
    ],
  }),
  triangle: (cx: number, cy: number, size: number): PathData => ({
    id: 'triangle',
    closed: true,
    points: [
      { x: cx, y: cy - size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
      { x: cx + size / 2, y: cy + size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
      { x: cx - size / 2, y: cy + size / 2, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' },
    ],
  }),
  star: (cx: number, cy: number, outerR: number, innerR: number, points: number = 5): PathData => {
    const pathPoints: PathPoint[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * i / points) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pathPoints.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        handleIn: { x: 0, y: 0 },
        handleOut: { x: 0, y: 0 },
        type: 'corner',
      });
    }
    return { id: 'star', closed: true, points: pathPoints };
  },
  polygon: (cx: number, cy: number, r: number, sides: number): PathData => {
    const pathPoints: PathPoint[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i / sides) - Math.PI / 2;
      pathPoints.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        handleIn: { x: 0, y: 0 },
        handleOut: { x: 0, y: 0 },
        type: 'corner',
      });
    }
    return { id: 'polygon', closed: true, points: pathPoints };
  },
};

// ==================== PATH ANIMATION ====================
export interface PathAnimation {
  id: string;
  pathData: PathData;
  progress: number; // 0-1
  alignToPath: boolean;
  autoRotate: boolean;
  loop: boolean;
  pingPong: boolean;
  startOffset: number;
  endOffset: number;
}

export interface PathAnimationSettings {
  followPath: boolean;
  orientToPath: boolean;
  perpendicular: boolean;
  forceAlignment: boolean;
  autoReverse: boolean;
  easing: EasingPreset['id'];
}

export const DEFAULT_PATH_ANIMATION: PathAnimationSettings = {
  followPath: true,
  orientToPath: true,
  perpendicular: false,
  forceAlignment: true,
  autoReverse: false,
  easing: 'ease-in-out',
};

// ==================== ANIMATION EXPRESSIONS ====================
export interface Expression {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  error?: string;
}

export const EXPRESSION_TEMPLATES: { name: string; description: string; code: string }[] = [
  { name: 'Wiggle', description: 'Random oscillation', code: 'wiggle(5, 20)' },
  { name: 'Loop Out', description: 'Loop after last keyframe', code: 'loopOut("cycle")' },
  { name: 'Loop In', description: 'Loop before first keyframe', code: 'loopIn("cycle")' },
  { name: 'Bounce', description: 'Ping-pong loop', code: 'loopOut("pingpong")' },
  { name: 'Time', description: 'Current time value', code: 'time * 100' },
  { name: 'Sin Wave', description: 'Sine wave motion', code: 'Math.sin(time * 3) * 50' },
  { name: 'Cos Wave', description: 'Cosine wave motion', code: 'Math.cos(time * 3) * 50' },
  { name: 'Random', description: 'Random value each frame', code: 'random(0, 100)' },
  { name: 'Smooth Random', description: 'Smooth random motion', code: 'noise(time) * 100' },
  { name: 'Delay', description: 'Delayed value', code: 'valueAtTime(time - 0.1)' },
  { name: 'Spring', description: 'Spring physics', code: 'spring(10, 0.5)' },
  { name: 'Decay', description: 'Exponential decay', code: 'velocity * Math.exp(-time * 3)' },
];

// ==================== LAYER EFFECTS ====================
export interface LayerEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
  expanded: boolean;
  params: Record<string, number | string | boolean>;
}

export type EffectType = 
  | 'drop-shadow'
  | 'inner-shadow'
  | 'outer-glow'
  | 'inner-glow'
  | 'bevel'
  | 'stroke'
  | 'gradient-overlay'
  | 'color-overlay'
  | 'blur'
  | 'motion-blur';

export const EFFECT_DEFAULTS: Record<EffectType, Record<string, number | string | boolean>> = {
  'drop-shadow': { color: '#000000', opacity: 0.5, angle: 135, distance: 5, blur: 10, spread: 0 },
  'inner-shadow': { color: '#000000', opacity: 0.5, angle: 135, distance: 5, blur: 10, choke: 0 },
  'outer-glow': { color: '#ffff00', opacity: 0.75, blur: 10, spread: 0 },
  'inner-glow': { color: '#ffff00', opacity: 0.75, blur: 10, choke: 0, source: 'edge' },
  'bevel': { style: 'outer', depth: 100, direction: 'up', size: 5, soften: 0, angle: 135 },
  'stroke': { color: '#000000', size: 1, position: 'outside', opacity: 1 },
  'gradient-overlay': { type: 'linear', angle: 90, scale: 100, opacity: 1 },
  'color-overlay': { color: '#ff0000', opacity: 0.5, blendMode: 'normal' },
  'blur': { radius: 10, quality: 'high' },
  'motion-blur': { angle: 0, distance: 10 },
};

// ==================== COMPOSITION SETTINGS ====================
export interface CompositionSettings {
  width: number;
  height: number;
  frameRate: number;
  duration: number; // in seconds
  backgroundColor: string;
  motionBlur: boolean;
  motionBlurSamples: number;
  renderer: '2d' | 'webgl';
}

export const COMPOSITION_PRESETS = [
  { name: '1080p 30fps', width: 1920, height: 1080, frameRate: 30, duration: 10 },
  { name: '1080p 60fps', width: 1920, height: 1080, frameRate: 60, duration: 10 },
  { name: '4K 30fps', width: 3840, height: 2160, frameRate: 30, duration: 10 },
  { name: 'Instagram Story', width: 1080, height: 1920, frameRate: 30, duration: 15 },
  { name: 'Instagram Post', width: 1080, height: 1080, frameRate: 30, duration: 60 },
  { name: 'YouTube Shorts', width: 1080, height: 1920, frameRate: 30, duration: 60 },
  { name: 'Twitter', width: 1280, height: 720, frameRate: 30, duration: 140 },
  { name: 'TikTok', width: 1080, height: 1920, frameRate: 30, duration: 60 },
  { name: 'Facebook Cover', width: 820, height: 312, frameRate: 30, duration: 20 },
  { name: 'Web Banner', width: 728, height: 90, frameRate: 30, duration: 15 },
];

// ==================== UTILITY FUNCTIONS ====================

// Generate unique ID -- thin app default over the shared canonical
import { generateId as sharedGenerateId } from '../../../shared/util/id';
export const generateId = (prefix: string = 'id'): string => sharedGenerateId(prefix);

// Calculate bezier curve value
export const cubicBezier = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

// Get easing function from preset
export const getEasingFunction = (presetId: string): ((t: number) => number) => {
  const preset = EASING_PRESETS.find(p => p.id === presetId);
  if (!preset) return (t) => t; // linear fallback
  
  const [x1, y1, x2, y2] = preset.bezier;
  
  return (t: number) => {
    // Approximate bezier curve
    let start = 0, end = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (start + end) / 2;
      const x = cubicBezier(mid, 0, x1, x2, 1);
      if (x < t) start = mid;
      else end = mid;
    }
    const finalT = (start + end) / 2;
    return cubicBezier(finalT, 0, y1, y2, 1);
  };
};

// Interpolate between values
export const interpolate = (
  from: number,
  to: number,
  progress: number,
  easingId: string = 'linear'
): number => {
  const easing = getEasingFunction(easingId);
  const t = easing(Math.max(0, Math.min(1, progress)));
  return from + (to - from) * t;
};

// Calculate point on path
export const getPointOnPath = (path: PathData, progress: number): { x: number; y: number; angle: number } => {
  if (path.points.length < 2) return { x: 0, y: 0, angle: 0 };
  
  const totalSegments = path.closed ? path.points.length : path.points.length - 1;
  const segmentProgress = progress * totalSegments;
  const segmentIndex = Math.floor(segmentProgress);
  const t = segmentProgress - segmentIndex;
  
  const p0 = path.points[segmentIndex % path.points.length];
  const p1 = path.points[(segmentIndex + 1) % path.points.length];
  
  // Cubic bezier interpolation
  const x = cubicBezier(t, p0.x, p0.x + p0.handleOut.x, p1.x + p1.handleIn.x, p1.x);
  const y = cubicBezier(t, p0.y, p0.y + p0.handleOut.y, p1.y + p1.handleIn.y, p1.y);
  
  // Calculate tangent angle
  const dx = 3 * (1 - t) * (1 - t) * (p0.x + p0.handleOut.x - p0.x) +
             6 * (1 - t) * t * (p1.x + p1.handleIn.x - p0.x - p0.handleOut.x) +
             3 * t * t * (p1.x - p1.x - p1.handleIn.x);
  const dy = 3 * (1 - t) * (1 - t) * (p0.y + p0.handleOut.y - p0.y) +
             6 * (1 - t) * t * (p1.y + p1.handleIn.y - p0.y - p0.handleOut.y) +
             3 * t * t * (p1.y - p1.y - p1.handleIn.y);
  
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  return { x, y, angle };
};

// Morph between two paths
export const morphPaths = (pathA: PathData, pathB: PathData, progress: number): PathData => {
  // Ensure both paths have the same number of points
  const maxPoints = Math.max(pathA.points.length, pathB.points.length);
  
  const normalizePoints = (path: PathData, count: number): PathPoint[] => {
    if (path.points.length >= count) return path.points.slice(0, count);
    
    const result = [...path.points];
    while (result.length < count) {
      // Duplicate last point
      result.push({ ...result[result.length - 1] });
    }
    return result;
  };
  
  const pointsA = normalizePoints(pathA, maxPoints);
  const pointsB = normalizePoints(pathB, maxPoints);
  
  const morphedPoints: PathPoint[] = pointsA.map((pA, i) => {
    const pB = pointsB[i];
    return {
      x: interpolate(pA.x, pB.x, progress),
      y: interpolate(pA.y, pB.y, progress),
      handleIn: {
        x: interpolate(pA.handleIn.x, pB.handleIn.x, progress),
        y: interpolate(pA.handleIn.y, pB.handleIn.y, progress),
      },
      handleOut: {
        x: interpolate(pA.handleOut.x, pB.handleOut.x, progress),
        y: interpolate(pA.handleOut.y, pB.handleOut.y, progress),
      },
      type: progress < 0.5 ? pA.type : pB.type,
    };
  });
  
  return {
    id: `morph-${pathA.id}-${pathB.id}`,
    points: morphedPoints,
    closed: progress < 0.5 ? pathA.closed : pathB.closed,
  };
};

// Save custom easings
export const saveCustomEasings = (easings: EasingPreset[]) => {
  try {
    const custom = easings.filter(e => e.category === 'custom');
    localStorage.setItem('dex-flux-easings', JSON.stringify(custom));
  } catch { /* storage unavailable */ }
};

// Load custom easings
export const loadCustomEasings = (): EasingPreset[] => {
  try {
    const saved = localStorage.getItem('dex-flux-easings');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Get all easings (built-in + custom)
export const getAllEasings = (): EasingPreset[] => {
  return [...EASING_PRESETS, ...loadCustomEasings()];
};

// ===========================================================================
// ITEMS 181-185: ANIMATION PRESETS
// ===========================================================================

export interface AnimationPreset {
  id: string;
  name: string;
  category: 'entrance' | 'exit' | 'emphasis' | 'motion-path' | 'loop';
  duration: number;
  keyframes: AnimationKeyframe[];
  description: string;
  thumbnail?: string;
}

export interface AnimationKeyframe {
  time: number; // 0-1 normalized
  properties: Record<string, number>;
  easing: string;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // Entrance
  {
    id: 'fade-in',
    name: 'Fade In',
    category: 'entrance',
    duration: 500,
    description: 'Simple opacity fade',
    keyframes: [
      { time: 0, properties: { opacity: 0 }, easing: 'ease-out' },
      { time: 1, properties: { opacity: 1 }, easing: 'ease-out' },
    ],
  },
  {
    id: 'slide-in-left',
    name: 'Slide In Left',
    category: 'entrance',
    duration: 600,
    description: 'Slide from left with fade',
    keyframes: [
      { time: 0, properties: { opacity: 0, translateX: -100 }, easing: 'power2-out' },
      { time: 1, properties: { opacity: 1, translateX: 0 }, easing: 'power2-out' },
    ],
  },
  {
    id: 'slide-in-up',
    name: 'Slide In Up',
    category: 'entrance',
    duration: 600,
    description: 'Slide from below with fade',
    keyframes: [
      { time: 0, properties: { opacity: 0, translateY: 50 }, easing: 'power2-out' },
      { time: 1, properties: { opacity: 1, translateY: 0 }, easing: 'power2-out' },
    ],
  },
  {
    id: 'scale-in',
    name: 'Scale In',
    category: 'entrance',
    duration: 500,
    description: 'Scale from small with fade',
    keyframes: [
      { time: 0, properties: { opacity: 0, scale: 0.5 }, easing: 'back-out' },
      { time: 1, properties: { opacity: 1, scale: 1 }, easing: 'back-out' },
    ],
  },
  {
    id: 'pop-in',
    name: 'Pop In',
    category: 'entrance',
    duration: 400,
    description: 'Bouncy pop entrance',
    keyframes: [
      { time: 0, properties: { opacity: 0, scale: 0 }, easing: 'elastic-out' },
      { time: 1, properties: { opacity: 1, scale: 1 }, easing: 'elastic-out' },
    ],
  },
  {
    id: 'reveal-left',
    name: 'Reveal Left',
    category: 'entrance',
    duration: 800,
    description: 'Mask reveal from left',
    keyframes: [
      { time: 0, properties: { clipX: 0 }, easing: 'power2-out' },
      { time: 1, properties: { clipX: 100 }, easing: 'power2-out' },
    ],
  },
  
  // Exit
  {
    id: 'fade-out',
    name: 'Fade Out',
    category: 'exit',
    duration: 500,
    description: 'Simple opacity fade',
    keyframes: [
      { time: 0, properties: { opacity: 1 }, easing: 'ease-in' },
      { time: 1, properties: { opacity: 0 }, easing: 'ease-in' },
    ],
  },
  {
    id: 'slide-out-right',
    name: 'Slide Out Right',
    category: 'exit',
    duration: 600,
    description: 'Slide to right with fade',
    keyframes: [
      { time: 0, properties: { opacity: 1, translateX: 0 }, easing: 'power2-in' },
      { time: 1, properties: { opacity: 0, translateX: 100 }, easing: 'power2-in' },
    ],
  },
  {
    id: 'scale-out',
    name: 'Scale Out',
    category: 'exit',
    duration: 400,
    description: 'Scale to large with fade',
    keyframes: [
      { time: 0, properties: { opacity: 1, scale: 1 }, easing: 'power2-in' },
      { time: 1, properties: { opacity: 0, scale: 1.5 }, easing: 'power2-in' },
    ],
  },
  
  // Emphasis
  {
    id: 'pulse',
    name: 'Pulse',
    category: 'emphasis',
    duration: 600,
    description: 'Pulsing scale',
    keyframes: [
      { time: 0, properties: { scale: 1 }, easing: 'ease-in-out' },
      { time: 0.5, properties: { scale: 1.1 }, easing: 'ease-in-out' },
      { time: 1, properties: { scale: 1 }, easing: 'ease-in-out' },
    ],
  },
  {
    id: 'shake',
    name: 'Shake',
    category: 'emphasis',
    duration: 500,
    description: 'Horizontal shake',
    keyframes: [
      { time: 0, properties: { translateX: 0 }, easing: 'linear' },
      { time: 0.1, properties: { translateX: -10 }, easing: 'linear' },
      { time: 0.3, properties: { translateX: 10 }, easing: 'linear' },
      { time: 0.5, properties: { translateX: -10 }, easing: 'linear' },
      { time: 0.7, properties: { translateX: 10 }, easing: 'linear' },
      { time: 0.9, properties: { translateX: -10 }, easing: 'linear' },
      { time: 1, properties: { translateX: 0 }, easing: 'linear' },
    ],
  },
  {
    id: 'bounce',
    name: 'Bounce',
    category: 'emphasis',
    duration: 800,
    description: 'Bouncy jump',
    keyframes: [
      { time: 0, properties: { translateY: 0 }, easing: 'ease-out' },
      { time: 0.3, properties: { translateY: -30 }, easing: 'ease-out' },
      { time: 0.5, properties: { translateY: 0 }, easing: 'bounce-out' },
      { time: 0.7, properties: { translateY: -10 }, easing: 'ease-out' },
      { time: 1, properties: { translateY: 0 }, easing: 'bounce-out' },
    ],
  },
  
  // Loop
  {
    id: 'rotate-loop',
    name: 'Rotate Loop',
    category: 'loop',
    duration: 2000,
    description: 'Continuous rotation',
    keyframes: [
      { time: 0, properties: { rotation: 0 }, easing: 'linear' },
      { time: 1, properties: { rotation: 360 }, easing: 'linear' },
    ],
  },
  {
    id: 'float',
    name: 'Float',
    category: 'loop',
    duration: 3000,
    description: 'Gentle floating motion',
    keyframes: [
      { time: 0, properties: { translateY: 0 }, easing: 'ease-in-out' },
      { time: 0.5, properties: { translateY: -15 }, easing: 'ease-in-out' },
      { time: 1, properties: { translateY: 0 }, easing: 'ease-in-out' },
    ],
  },
  {
    id: 'breathe',
    name: 'Breathe',
    category: 'loop',
    duration: 4000,
    description: 'Breathing scale effect',
    keyframes: [
      { time: 0, properties: { scale: 1 }, easing: 'ease-in-out' },
      { time: 0.5, properties: { scale: 1.05 }, easing: 'ease-in-out' },
      { time: 1, properties: { scale: 1 }, easing: 'ease-in-out' },
    ],
  },
];

// ===========================================================================
// ITEMS 186-190: MOTION TEMPLATES
// ===========================================================================

export interface MotionTemplate {
  id: string;
  name: string;
  category: 'title' | 'lower-third' | 'transition' | 'social' | 'logo';
  duration: number;
  layers: TemplateLayer[];
  editableFields: EditableField[];
  thumbnail?: string;
}

export interface TemplateLayer {
  id: string;
  name: string;
  type: 'text' | 'shape' | 'image' | 'video';
  animations: string[]; // Animation preset IDs
  properties: Record<string, unknown>;
}

export interface EditableField {
  id: string;
  layerId: string;
  property: string;
  label: string;
  type: 'text' | 'color' | 'image' | 'number';
  defaultValue: unknown;
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
  {
    id: 'minimal-title',
    name: 'Minimal Title',
    category: 'title',
    duration: 4000,
    layers: [
      { id: 'l1', name: 'Title', type: 'text', animations: ['slide-in-up', 'fade-out'], properties: { text: 'TITLE', fontSize: 72, fontWeight: 700 } },
      { id: 'l2', name: 'Subtitle', type: 'text', animations: ['slide-in-up', 'fade-out'], properties: { text: 'Subtitle', fontSize: 24, fontWeight: 400 } },
      { id: 'l3', name: 'Line', type: 'shape', animations: ['scale-in', 'fade-out'], properties: { width: 100, height: 2, color: '#ffffff' } },
    ],
    editableFields: [
      { id: 'f1', layerId: 'l1', property: 'text', label: 'Title', type: 'text', defaultValue: 'TITLE' },
      { id: 'f2', layerId: 'l2', property: 'text', label: 'Subtitle', type: 'text', defaultValue: 'Subtitle' },
      { id: 'f3', layerId: 'l3', property: 'color', label: 'Accent Color', type: 'color', defaultValue: '#ffffff' },
    ],
  },
  {
    id: 'lower-third-basic',
    name: 'Basic Lower Third',
    category: 'lower-third',
    duration: 5000,
    layers: [
      { id: 'l1', name: 'Background', type: 'shape', animations: ['reveal-left'], properties: { width: 400, height: 60, color: '#000000cc' } },
      { id: 'l2', name: 'Name', type: 'text', animations: ['slide-in-left'], properties: { text: 'Name', fontSize: 24, fontWeight: 600 } },
      { id: 'l3', name: 'Title', type: 'text', animations: ['slide-in-left'], properties: { text: 'Title', fontSize: 16, fontWeight: 400 } },
    ],
    editableFields: [
      { id: 'f1', layerId: 'l2', property: 'text', label: 'Name', type: 'text', defaultValue: 'Name' },
      { id: 'f2', layerId: 'l3', property: 'text', label: 'Title', type: 'text', defaultValue: 'Title' },
      { id: 'f3', layerId: 'l1', property: 'color', label: 'Background Color', type: 'color', defaultValue: '#000000cc' },
    ],
  },
  {
    id: 'social-youtube',
    name: 'YouTube Subscribe',
    category: 'social',
    duration: 4000,
    layers: [
      { id: 'l1', name: 'Bell', type: 'shape', animations: ['pop-in', 'shake'], properties: { icon: 'bell' } },
      { id: 'l2', name: 'Subscribe Button', type: 'shape', animations: ['slide-in-left', 'pulse'], properties: { width: 120, height: 40, color: '#ff0000', borderRadius: 3 } },
      { id: 'l3', name: 'Text', type: 'text', animations: ['fade-in'], properties: { text: 'SUBSCRIBE', fontSize: 14, fontWeight: 600, color: '#ffffff' } },
    ],
    editableFields: [
      { id: 'f1', layerId: 'l3', property: 'text', label: 'Button Text', type: 'text', defaultValue: 'SUBSCRIBE' },
    ],
  },
  {
    id: 'logo-reveal',
    name: 'Logo Reveal',
    category: 'logo',
    duration: 3000,
    layers: [
      { id: 'l1', name: 'Logo', type: 'image', animations: ['scale-in'], properties: { width: 200, height: 200 } },
      { id: 'l2', name: 'Glow', type: 'shape', animations: ['fade-in', 'pulse'], properties: { width: 250, height: 250, blur: 30, color: '#ffffff33' } },
    ],
    editableFields: [
      { id: 'f1', layerId: 'l1', property: 'src', label: 'Logo Image', type: 'image', defaultValue: '' },
      { id: 'f2', layerId: 'l2', property: 'color', label: 'Glow Color', type: 'color', defaultValue: '#ffffff33' },
    ],
  },
];

// ===========================================================================
// ITEMS 191-195: PARTICLE SYSTEM
// ===========================================================================

export interface ParticleSystem {
  id: string;
  name: string;
  emitter: EmitterConfig;
  particle: ParticleConfig;
  physics: PhysicsConfig;
}

export interface EmitterConfig {
  type: 'point' | 'line' | 'circle' | 'rectangle';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rate: number; // particles per second
  burst: number; // particles per burst
  duration: number; // -1 for infinite
}

export interface ParticleConfig {
  shape: 'circle' | 'square' | 'triangle' | 'star' | 'image';
  size: { min: number; max: number };
  life: { min: number; max: number }; // seconds
  color: { start: string; end: string };
  opacity: { start: number; end: number };
  rotation: { min: number; max: number };
  rotationSpeed: { min: number; max: number };
  imageSrc?: string;
}

export interface PhysicsConfig {
  gravity: { x: number; y: number };
  velocity: { min: number; max: number };
  angle: { min: number; max: number };
  acceleration: { x: number; y: number };
  friction: number;
  bounce: number;
}

export const PARTICLE_PRESETS: ParticleSystem[] = [
  {
    id: 'confetti',
    name: 'Confetti',
    emitter: { type: 'line', position: { x: 0, y: -20 }, size: { width: 100, height: 0 }, rate: 50, burst: 0, duration: -1 },
    particle: { shape: 'square', size: { min: 5, max: 10 }, life: { min: 2, max: 4 }, color: { start: '#ff0000', end: '#ffff00' }, opacity: { start: 1, end: 0 }, rotation: { min: 0, max: 360 }, rotationSpeed: { min: -180, max: 180 } },
    physics: { gravity: { x: 0, y: 100 }, velocity: { min: 50, max: 150 }, angle: { min: -30, max: 30 }, acceleration: { x: 0, y: 0 }, friction: 0.98, bounce: 0 },
  },
  {
    id: 'snow',
    name: 'Snow',
    emitter: { type: 'line', position: { x: 0, y: -20 }, size: { width: 100, height: 0 }, rate: 20, burst: 0, duration: -1 },
    particle: { shape: 'circle', size: { min: 2, max: 5 }, life: { min: 4, max: 8 }, color: { start: '#ffffff', end: '#ffffff' }, opacity: { start: 1, end: 0.5 }, rotation: { min: 0, max: 0 }, rotationSpeed: { min: 0, max: 0 } },
    physics: { gravity: { x: 0, y: 30 }, velocity: { min: 10, max: 30 }, angle: { min: 85, max: 95 }, acceleration: { x: 0, y: 0 }, friction: 0.99, bounce: 0 },
  },
  {
    id: 'fire',
    name: 'Fire',
    emitter: { type: 'point', position: { x: 50, y: 90 }, size: { width: 20, height: 0 }, rate: 40, burst: 0, duration: -1 },
    particle: { shape: 'circle', size: { min: 5, max: 15 }, life: { min: 0.5, max: 1.5 }, color: { start: '#ff6600', end: '#ff0000' }, opacity: { start: 1, end: 0 }, rotation: { min: 0, max: 0 }, rotationSpeed: { min: 0, max: 0 } },
    physics: { gravity: { x: 0, y: -80 }, velocity: { min: 20, max: 50 }, angle: { min: -20, max: 20 }, acceleration: { x: 0, y: 0 }, friction: 0.95, bounce: 0 },
  },
  {
    id: 'sparkles',
    name: 'Sparkles',
    emitter: { type: 'rectangle', position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, rate: 10, burst: 0, duration: -1 },
    particle: { shape: 'star', size: { min: 3, max: 8 }, life: { min: 0.5, max: 1.5 }, color: { start: '#ffff00', end: '#ffffff' }, opacity: { start: 1, end: 0 }, rotation: { min: 0, max: 360 }, rotationSpeed: { min: -90, max: 90 } },
    physics: { gravity: { x: 0, y: 0 }, velocity: { min: 0, max: 20 }, angle: { min: 0, max: 360 }, acceleration: { x: 0, y: 0 }, friction: 0.98, bounce: 0 },
  },
];

// ===========================================================================
// ITEMS 196-200: EXPORT PRESETS
// ===========================================================================

export interface ExportPreset {
  id: string;
  name: string;
  category: 'video' | 'gif' | 'image-sequence' | 'lottie';
  format: string;
  settings: ExportSettings;
}

export interface ExportSettings {
  width?: number;
  height?: number;
  fps?: number;
  quality?: number;
  codec?: string;
  transparent?: boolean;
  loop?: boolean;
  optimize?: boolean;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'mp4-hd', name: 'MP4 HD (1080p)', category: 'video', format: 'mp4', settings: { width: 1920, height: 1080, fps: 30, quality: 90, codec: 'h264' } },
  { id: 'mp4-4k', name: 'MP4 4K', category: 'video', format: 'mp4', settings: { width: 3840, height: 2160, fps: 30, quality: 90, codec: 'h264' } },
  { id: 'webm-hd', name: 'WebM HD (1080p)', category: 'video', format: 'webm', settings: { width: 1920, height: 1080, fps: 30, quality: 85, codec: 'vp9', transparent: true } },
  { id: 'gif-high', name: 'GIF High Quality', category: 'gif', format: 'gif', settings: { width: 800, height: 600, fps: 15, quality: 90, loop: true, optimize: true } },
  { id: 'gif-social', name: 'GIF Social Media', category: 'gif', format: 'gif', settings: { width: 480, height: 480, fps: 12, quality: 80, loop: true, optimize: true } },
  { id: 'png-sequence', name: 'PNG Sequence', category: 'image-sequence', format: 'png', settings: { fps: 30, transparent: true } },
  { id: 'lottie', name: 'Lottie JSON', category: 'lottie', format: 'json', settings: { fps: 60, optimize: true } },
];

export default {
  EASING_PRESETS,
  DEFAULT_GRAPH_SETTINGS,
  MORPH_SHAPES,
  DEFAULT_PATH_ANIMATION,
  EXPRESSION_TEMPLATES,
  EFFECT_DEFAULTS,
  COMPOSITION_PRESETS,
  ANIMATION_PRESETS,
  MOTION_TEMPLATES,
  PARTICLE_PRESETS,
  EXPORT_PRESETS,
  generateId,
  cubicBezier,
  getEasingFunction,
  interpolate,
  getPointOnPath,
  morphPaths,
  saveCustomEasings,
  loadCustomEasings,
  getAllEasings,
};
