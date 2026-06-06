/**
 * DEX Platform - FLUX Motion Graphics
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional motion graphics and visual effects
 */
import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import CreativeCommandBar from '../../components/CreativeCommandBar';
import { enginePendingApplier, type OpApplyResult } from '../../../shared/uki/creativeCommand';
import type { CreativeOp } from '../../../shared/uki/creativeActions';
import { useRunningApps } from '../../store/runningApps';
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import DexIcon from '../../components/DexIcon';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAutoSave } from '../../utils/useAutoSave';
import { useAppTracking } from '../../services/usePatternLearning';
import { loadEngagement, saveEngagement, recordAppUsage, incrementStat, checkAchievements } from '../../services/engagement';
import { useFileDrop } from '../../utils/useFileDrop';
import { getTargetFPS, getAdaptiveDPR, getPerfTier } from '../../utils/adaptiveCanvas';
import { useCreativeAppSettings } from '../../utils/creative-suite';
import {
  EASING_PRESETS,
  COMPOSITION_PRESETS,
  EXPRESSION_TEMPLATES,
  EFFECT_DEFAULTS,
  getEasingFunction,
  interpolate as fluxInterpolate,
  cubicBezier,
  morphPaths,
  MORPH_SHAPES,
  getPointOnPath,
} from './FluxFeatures';
import type { EasingPreset, CompositionSettings } from './FluxFeatures';
import EasingCurveEditor, { type EasingValue } from './EasingCurveEditor';

// ===========================================================================
// DEX FLUX - Professional Motion Graphics
// Apple Motion / After Effects alternative with animations, particles, behaviors
// ===========================================================================

// ==================== APP IDENTITY ====================
export const FLUX_VERSION = '1.0.0';
export const FLUX_BUILD_DATE = '2026-04-11';

// ==================== TYPES ====================
interface Layer {
  id: string;
  name: string;
  type: 'video' | 'image' | 'shape' | 'text' | 'particle' | 'generator' | 'group' | 'camera' | 'light';
  visible: boolean;
  locked: boolean;
  solo: boolean;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  transform: Transform;
  behaviors: Behavior[];
  filters: Filter[];
  parent?: string;
  children?: Layer[];
  matteLayerId?: string;
  matteType?: 'alpha' | 'alphaInverted' | 'luma' | 'lumaInverted';
  masks?: Array<{ id: string; shape: 'ellipse' | 'rectangle'; mode: 'add' | 'subtract' | 'intersect'; feather: number; opacity: number; expansion: number }>;
  content?: string | HTMLImageElement | HTMLVideoElement;  // For text, image, video layers
  textStyle?: { fontSize: number; fontFamily: string; color: string; align: 'left' | 'center' | 'right' };
  shapeStyle?: { fill: string; stroke: string; strokeWidth: number; type: 'rectangle' | 'ellipse' | 'polygon' | 'star' };
  particleEmitter?: { birthRate: number; life: number; lifeRange: number; speed: number; speedRange: number; angle: number; angleRange: number; spin: number; spinRange: number; scale: number; scaleRange: number; color: string; colorRange: number; opacity: number; shape: 'circle' | 'point' | 'rectangle' | 'line' | 'image' };
  animations?: Animation[];
  easing?: { p1x: number; p1y: number; p2x: number; p2y: number };
  pathKeyframes?: { time: number; d: string }[];
}

interface Transform {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  anchorX: number;
  anchorY: number;
  opacity: number;
}

interface Keyframe {
  time: number;
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';
  bezierHandles?: { in: { x: number; y: number }; out: { x: number; y: number } };
}

interface Animation {
  property: string;
  keyframes: Keyframe[];
}

interface Behavior {
  id: string;
  type: 'fadeIn' | 'fadeOut' | 'grow' | 'spin' | 'throw' | 'drift' | 'randomMotion' | 'orbit' | 'vortex' | 'gravity' | 'attract' | 'repel' | 'oscillate' | 'wiggle';
  enabled: boolean;
  settings: Record<string, any>;
}

interface Filter {
  id: string;
  type: 'blur' | 'glow' | 'bloom' | 'sharpen' | 'colorCorrect' | 'chromaticAberration' | 'vignette' | 'distort' | 'stylize';
  enabled: boolean;
  settings: Record<string, any>;
}

interface ParticleEmitter {
  birthRate: number;
  life: number;
  lifeRange: number;
  speed: number;
  speedRange: number;
  angle: number;
  angleRange: number;
  spin: number;
  spinRange: number;
  scale: number;
  scaleRange: number;
  color: string;
  colorRange: number;
  opacity: number;
  shape: 'point' | 'line' | 'rectangle' | 'circle' | 'image';
}

interface GeneratorSettings {
  type: 'gradient' | 'noise' | 'grid' | 'checkerboard' | 'color' | 'caustics' | 'clouds' | 'starField';
  settings: Record<string, any>;
}

// ==================== EASING + MORPH HELPERS ====================
// Apply a cubic-bezier easing curve P0=(0,0), P3=(1,1), with control
// points P1=(p1x,p1y) and P2=(p2x,p2y). The "param IS time" approximation
// (use t directly as the bezier parameter and return its Y) matches the
// expressive feel UI animators expect from After Effects / DaVinci.
function applyEasing(t: number, e: { p1x: number; p1y: number; p2x: number; p2y: number }): number {
  const u = Math.max(0, Math.min(1, t));
  const inv = 1 - u;
  return 3 * inv * inv * u * e.p1y + 3 * inv * u * u * e.p2y + u * u * u;
}

// Minimal SVG path parser: supports M, L, Z (absolute) and m, l, z (relative).
// Implicit lineto continuations after M/L are also accepted.
function parsePath(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const tokens = d.match(/[MLZmlz]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  let cx = 0, cy = 0;
  let lastCmd: string | null = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[MLmlZz]$/.test(tok)) {
      lastCmd = tok;
      i++;
      if (tok === 'Z' || tok === 'z') continue;
    }
    if (lastCmd === null) { i++; continue; }
    if (lastCmd === 'Z' || lastCmd === 'z') continue;
    const a = parseFloat(tokens[i++]);
    const b = parseFloat(tokens[i++]);
    if (Number.isNaN(a) || Number.isNaN(b)) break;
    if (lastCmd === 'M' || lastCmd === 'L') { cx = a; cy = b; }
    else { cx += a; cy += b; } // 'm' / 'l' relative
    pts.push({ x: cx, y: cy });
    // After an initial M/m, implicit subsequent pairs are L/l.
    if (lastCmd === 'M') lastCmd = 'L';
    else if (lastCmd === 'm') lastCmd = 'l';
  }
  return pts;
}

// Resample a polyline to exactly `n` points by walking arc length.
function resamplePolyline(pts: { x: number; y: number }[], n: number): { x: number; y: number }[] {
  if (pts.length === 0) return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let acc = 0;
    let placed = false;
    for (let i = 0; i < segLens.length; i++) {
      const next = acc + segLens[i];
      if (target <= next || i === segLens.length - 1) {
        const localT = segLens[i] === 0 ? 0 : (target - acc) / segLens[i];
        const a = pts[i], b = pts[i + 1];
        out.push({ x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT });
        placed = true;
        break;
      }
      acc = next;
    }
    if (!placed) out.push({ ...pts[pts.length - 1] });
  }
  return out;
}

// Linearly interpolate two equal-length point arrays.
function lerpPoints(a: { x: number; y: number }[], b: { x: number; y: number }[], t: number): { x: number; y: number }[] {
  const n = Math.min(a.length, b.length);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: a[i].x + (b[i].x - a[i].x) * t, y: a[i].y + (b[i].y - a[i].y) * t });
  }
  return out;
}

// ==================== SVG ICONS (Professional) ====================
const Icons = {
  // Transform Tools
  pointer: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>,
  move: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>,
  rotate: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>,
  scale: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3h-6m6 0v6m0-6-9 9"/><path d="M3 21h6m-6 0v-6m0 6 9-9"/></svg>,
  
  // Content Tools
  text: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  shape: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  pen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="10" cy="10" r="2"/></svg>,
  
  // Effects
  particle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="6.5" cy="6.5" r="1"/><circle cx="17.5" cy="17.5" r="1"/><circle cx="6.5" cy="17.5" r="1"/><circle cx="17.5" cy="6.5" r="1"/></svg>,
  sparkle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
  
  // 3D Tools
  camera: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>,
  light: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  cube: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  
  // Navigation
  hand: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>,
  zoom: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  
  // Transport
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/></svg>,
  stop: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  skipBack: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon fill="currentColor" points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>,
  skipForward: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon fill="currentColor" points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  record: <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff453a"><circle cx="12" cy="12" r="8"/></svg>,
  
  // Timeline
  keyframe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 9-9 9-9-9 9-9z"/></svg>,
  keyframeFilled: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 3l9 9-9 9-9-9 9-9z"/></svg>,
  layers: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  timeline: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><polyline points="8 8 8 16"/><polyline points="12 6 12 18"/><polyline points="16 8 16 16"/></svg>,
  
  // Visibility
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  unlock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  solo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="bold">S</text></svg>,
  
  // Actions
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  duplicate: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  
  // File
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  folderOpen: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>,
  save: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  
  // Effects & Behaviors
  wand: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m15 4-3 3"/><path d="m12 7-9 9 3 3 9-9"/><path d="m19 4-3 3"/><path d="m22 7-3 3"/></svg>,
  zap: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  bolt: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  filter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  sliders: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  
  // UI
  chevronRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  chevronUp: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  menu: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  moreVertical: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>,
  
  // Misc
  grid: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  loop: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
  video: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>,
  film: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  help: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  
  // Easing
  easeLinear: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="21" x2="21" y2="3"/></svg>,
  easeIn: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21 C 3 21, 18 21, 21 3"/></svg>,
  easeOut: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21 C 6 3, 21 3, 21 3"/></svg>,
  easeInOut: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21 C 3 21, 8 3, 12 12 S 21 3, 21 3"/></svg>,
};

// ==================== BEHAVIORS ====================
const BEHAVIOR_TYPES = [
  { id: 'fadeIn', name: 'Fade In', category: 'basic' },
  { id: 'fadeOut', name: 'Fade Out', category: 'basic' },
  { id: 'grow', name: 'Grow/Shrink', category: 'basic' },
  { id: 'spin', name: 'Spin', category: 'basic' },
  { id: 'throw', name: 'Throw', category: 'motion' },
  { id: 'drift', name: 'Drift', category: 'motion' },
  { id: 'randomMotion', name: 'Random Motion', category: 'motion' },
  { id: 'orbit', name: 'Orbit', category: 'simulation' },
  { id: 'vortex', name: 'Vortex', category: 'simulation' },
  { id: 'gravity', name: 'Gravity', category: 'simulation' },
  { id: 'attract', name: 'Attract', category: 'simulation' },
  { id: 'repel', name: 'Repel', category: 'simulation' },
  { id: 'oscillate', name: 'Oscillate', category: 'basic' },
  { id: 'wiggle', name: 'Wiggle', category: 'basic' },
];

// ==================== ANIMATION PRESETS ====================
interface AnimationPreset {
  id: string;
  name: string;
  category: 'intro' | 'outro' | 'emphasis' | 'loop' | 'transition';
  behaviors: Behavior[];
  duration: number;
}

const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: 'fade-in', name: 'Fade In', category: 'intro', duration: 1, behaviors: [{ id: '1', type: 'fadeIn', enabled: true, settings: { duration: 1 } }] },
  { id: 'fade-out', name: 'Fade Out', category: 'outro', duration: 1, behaviors: [{ id: '1', type: 'fadeOut', enabled: true, settings: { duration: 1 } }] },
  { id: 'pop-in', name: 'Pop In', category: 'intro', duration: 0.5, behaviors: [{ id: '1', type: 'grow', enabled: true, settings: { startScale: 0, endScale: 1, overshoot: 1.2 } }] },
  { id: 'zoom-out', name: 'Zoom Out', category: 'outro', duration: 0.5, behaviors: [{ id: '1', type: 'grow', enabled: true, settings: { startScale: 1, endScale: 0 } }] },
  { id: 'spin-in', name: 'Spin In', category: 'intro', duration: 0.8, behaviors: [{ id: '1', type: 'spin', enabled: true, settings: { rotations: 1, direction: 'cw' } }, { id: '2', type: 'fadeIn', enabled: true, settings: { duration: 0.3 } }] },
  { id: 'bounce', name: 'Bounce', category: 'emphasis', duration: 0.6, behaviors: [{ id: '1', type: 'oscillate', enabled: true, settings: { amplitude: 20, frequency: 3, decay: 0.8 } }] },
  { id: 'shake', name: 'Shake', category: 'emphasis', duration: 0.5, behaviors: [{ id: '1', type: 'wiggle', enabled: true, settings: { amount: 10, frequency: 20 } }] },
  { id: 'pulse', name: 'Pulse', category: 'loop', duration: 1, behaviors: [{ id: '1', type: 'grow', enabled: true, settings: { minScale: 1, maxScale: 1.1, loop: true } }] },
  { id: 'float', name: 'Float', category: 'loop', duration: 2, behaviors: [{ id: '1', type: 'drift', enabled: true, settings: { amplitude: 10, speed: 0.5 } }] },
  { id: 'orbit-loop', name: 'Orbit', category: 'loop', duration: 3, behaviors: [{ id: '1', type: 'orbit', enabled: true, settings: { radius: 50, speed: 1 } }] },
];

// ==================== EFFECT PRESETS ====================
interface EffectPreset {
  id: string;
  name: string;
  category: 'glow' | 'blur' | 'color' | 'distort' | 'stylize';
  filters: Filter[];
}

const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'soft-glow', name: 'Soft Glow', category: 'glow', filters: [{ id: '1', type: 'glow', enabled: true, settings: { radius: 20, intensity: 0.6, color: 'var(--color-text-primary)' } }] },
  { id: 'neon-glow', name: 'Neon Glow', category: 'glow', filters: [{ id: '1', type: 'glow', enabled: true, settings: { radius: 30, intensity: 1, color: '#00ffff' } }] },
  { id: 'bloom', name: 'Bloom', category: 'glow', filters: [{ id: '1', type: 'bloom', enabled: true, settings: { threshold: 0.8, intensity: 0.5, radius: 15 } }] },
  { id: 'gaussian-blur', name: 'Gaussian Blur', category: 'blur', filters: [{ id: '1', type: 'blur', enabled: true, settings: { radius: 10, quality: 'high' } }] },
  { id: 'motion-blur', name: 'Motion Blur', category: 'blur', filters: [{ id: '1', type: 'blur', enabled: true, settings: { angle: 0, amount: 20, type: 'motion' } }] },
  { id: 'tilt-shift', name: 'Tilt Shift', category: 'blur', filters: [{ id: '1', type: 'blur', enabled: true, settings: { type: 'tiltShift', focusY: 0.5, blurAmount: 8 } }] },
  { id: 'vibrant', name: 'Vibrant', category: 'color', filters: [{ id: '1', type: 'colorCorrect', enabled: true, settings: { saturation: 1.4, contrast: 1.1, brightness: 1.05 } }] },
  { id: 'vintage', name: 'Vintage', category: 'color', filters: [{ id: '1', type: 'colorCorrect', enabled: true, settings: { saturation: 0.7, sepia: 0.3, vignette: 0.4 } }] },
  { id: 'chromatic', name: 'Chromatic Aberration', category: 'distort', filters: [{ id: '1', type: 'chromaticAberration', enabled: true, settings: { amount: 5, angle: 0 } }] },
  { id: 'vignette', name: 'Vignette', category: 'stylize', filters: [{ id: '1', type: 'vignette', enabled: true, settings: { amount: 0.5, roundness: 0.5, feather: 0.5 } }] },
];

// ==================== PARTICLE PRESETS ====================
interface ParticlePreset {
  id: string;
  name: string;
  category: 'nature' | 'energy' | 'abstract' | 'celebration';
  emitter: ParticleEmitter;
}

const PARTICLE_PRESETS: ParticlePreset[] = [
  { id: 'snow', name: 'Snow', category: 'nature', emitter: { birthRate: 50, life: 5, lifeRange: 2, speed: 30, speedRange: 10, angle: -90, angleRange: 20, spin: 0, spinRange: 1, scale: 0.3, scaleRange: 0.2, color: 'var(--color-text-primary)', colorRange: 0, opacity: 0.8, shape: 'circle' } },
  { id: 'rain', name: 'Rain', category: 'nature', emitter: { birthRate: 100, life: 2, lifeRange: 0.5, speed: 200, speedRange: 50, angle: -90, angleRange: 5, spin: 0, spinRange: 0, scale: 0.1, scaleRange: 0.05, color: '#87ceeb', colorRange: 0.1, opacity: 0.6, shape: 'line' } },
  { id: 'fire', name: 'Fire', category: 'energy', emitter: { birthRate: 80, life: 1.5, lifeRange: 0.5, speed: 60, speedRange: 20, angle: -90, angleRange: 30, spin: 0, spinRange: 2, scale: 0.5, scaleRange: 0.3, color: '#ff6600', colorRange: 0.2, opacity: 0.9, shape: 'circle' } },
  { id: 'sparks', name: 'Sparks', category: 'energy', emitter: { birthRate: 40, life: 1, lifeRange: 0.3, speed: 150, speedRange: 80, angle: -90, angleRange: 60, spin: 0, spinRange: 5, scale: 0.15, scaleRange: 0.1, color: '#ffff00', colorRange: 0.1, opacity: 1, shape: 'point' } },
  { id: 'smoke', name: 'Smoke', category: 'nature', emitter: { birthRate: 20, life: 4, lifeRange: 1, speed: 20, speedRange: 10, angle: -90, angleRange: 15, spin: 0.1, spinRange: 0.2, scale: 0.8, scaleRange: 0.4, color: '#666666', colorRange: 0.1, opacity: 0.4, shape: 'circle' } },
  { id: 'confetti', name: 'Confetti', category: 'celebration', emitter: { birthRate: 60, life: 3, lifeRange: 1, speed: 80, speedRange: 40, angle: -90, angleRange: 45, spin: 2, spinRange: 3, scale: 0.4, scaleRange: 0.2, color: '#ff00ff', colorRange: 1, opacity: 1, shape: 'rectangle' } },
  { id: 'stars', name: 'Stars', category: 'abstract', emitter: { birthRate: 30, life: 2, lifeRange: 1, speed: 40, speedRange: 20, angle: 0, angleRange: 180, spin: 0.5, spinRange: 1, scale: 0.3, scaleRange: 0.15, color: 'var(--color-text-primary)', colorRange: 0.2, opacity: 0.9, shape: 'circle' } },
  { id: 'bubbles', name: 'Bubbles', category: 'nature', emitter: { birthRate: 25, life: 4, lifeRange: 2, speed: 40, speedRange: 15, angle: -90, angleRange: 20, spin: 0, spinRange: 0.5, scale: 0.5, scaleRange: 0.3, color: '#88ccff', colorRange: 0.1, opacity: 0.5, shape: 'circle' } },
  { id: 'dust', name: 'Dust', category: 'nature', emitter: { birthRate: 15, life: 6, lifeRange: 2, speed: 10, speedRange: 8, angle: -45, angleRange: 90, spin: 0.05, spinRange: 0.1, scale: 0.2, scaleRange: 0.15, color: '#d4a574', colorRange: 0.1, opacity: 0.3, shape: 'circle' } },
  { id: 'magic', name: 'Magic', category: 'energy', emitter: { birthRate: 35, life: 1.5, lifeRange: 0.5, speed: 50, speedRange: 30, angle: 0, angleRange: 180, spin: 1, spinRange: 2, scale: 0.25, scaleRange: 0.15, color: '#aa66ff', colorRange: 0.3, opacity: 0.8, shape: 'circle' } },
];

// ==================== COMPONENT ====================
const Flux: React.FC = () => {
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);
  // Creative app settings from Settings page
  const appSettings = useCreativeAppSettings('flux');
  // Track app usage
  useAppTracking('flux');
  const collab = useCollaborationFeatures({ appId: 'flux', projectName: 'FLUX Project', autoCheckpointInterval: 300000 });
  useEffect(() => {
    const eng = loadEngagement();
    const updated = recordAppUsage(eng, 'flux');
    saveEngagement(checkAchievements(updated).state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useAutoSave('flux', useCallback(() => ({ isDirty: true }), []), isDirty, 30_000);

  const { dropProps, dropOverlayStyle } = useFileDrop(
    ['image/*', 'video/*', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'],
    useCallback((files) => { setIsDirty(true); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Imported ${files.length} asset(s) into FLUX`, type: 'success' } })); }, [])
  );

  // ===== RUNNING APPS =====
  const { setCurrentApp } = useRunningApps();

  // Listen for incoming assets from other creative apps
  useCreativeInbox('flux', useCallback((asset) => {
    if ((asset.kind === 'image' || asset.kind === 'video') && asset.data) {
      const newLayer: Layer = {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: asset.name || 'Imported Asset',
        type: asset.kind === 'video' ? 'video' : 'image',
        visible: true,
        locked: false,
        solo: false,
        startTime: 0,
        duration: 150,
        inPoint: 0,
        outPoint: 150,
        transform: { x: 0, y: 0, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
        behaviors: [],
        filters: [],
        content: asset.data,
      };
      setLayers(prev => [newLayer, ...prev]);
      setSelectedLayerId(newLayer.id);
      setIsDirty(true);
    }
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Imported "${asset.name}" from ${asset.sourceApp}` } }));
  }, []));

  // ===== BEGINNER MODE =====
  const { isBeginnerMode: beginnerMode, showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('flux');
  const [activeTool, setActiveTool] = useState<string>('pointer');
  // Start with empty canvas — user adds layers as needed
  const [layers, setLayers] = useState<Layer[]>(() => []);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [showEasingPopover, setShowEasingPopover] = useState(false);
  const [showMorphModal, setShowMorphModal] = useState(false);
  const [morphPathInput, setMorphPathInput] = useState('');
  
  // Timeline state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(300); // 10 seconds at 30fps
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  
  // Canvas state
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [viewScale, setViewScale] = useState(50);
  const [is3DMode, setIs3DMode] = useState(false);
  const [hardwareTier, setHardwareTier] = useState<'low' | 'mid' | 'high'>('mid');
  
  // Hardware-gated 3D mode setter — blocks on low-tier hardware
  const setIs3DModeGated = useCallback((value: boolean) => {
    if (value && hardwareTier === 'low') {
      console.warn('[Flux] 3D mode disabled on low-tier hardware');
      return;
    }
    setIs3DMode(value);
  }, [hardwareTier]);
  
  // Panels
  const [activeTab, setActiveTab] = useState<'library' | 'behaviors' | 'filters' | 'inspector' | 'presets' | 'history'>('library');
  const [showTimeline, setShowTimeline] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [presetCategory, setPresetCategory] = useState<'animations' | 'effects' | 'particles' | 'easings'>('animations');

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; layerId: string | null }>({ visible: false, x: 0, y: 0, layerId: null });
  
  // History
  const [history, setHistory] = useState<Array<{ layers: Layer[]; timestamp: number; description: string }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ layers: Layer[]; timestamp: number; description: string }>>([]);
  const isRestoringRef = useRef(false);
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionBlurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gizmoDragRef = useRef<{ startX: number; startY: number; origTransform: Transform } | null>(null);

  // Error states
  const [initError, setInitError] = React.useState<string | null>(null);
  const [canvasError, setCanvasError] = React.useState(false);

  // ===== PRO FEATURES STATE =====
  const [showFeaturesMenu, setShowFeaturesMenu] = useState(false);
  // Text Animator
  const [showTextAnimator, setShowTextAnimator] = useState(false);
  const [textAnimMode, setTextAnimMode] = useState<'character' | 'word' | 'line'>('character');
  const [textAnimCascade, setTextAnimCascade] = useState(50);
  // Graph Editor
  const [showGraphEditor, setShowGraphEditor] = useState(false);
  const [graphProperty, setGraphProperty] = useState('opacity');
  const [draggingKfIdx, setDraggingKfIdx] = useState<number | null>(null);
  // Expression Engine
  const [showExpressionEditor, setShowExpressionEditor] = useState(false);
  const [expressionCode, setExpressionCode] = useState('');
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const [expressionTarget, setExpressionTarget] = useState('opacity');
  // Null Objects
  const [showNullObjects, setShowNullObjects] = useState(false);
  // Motion Path
  const [showMotionPath, setShowMotionPath] = useState(false);
  // Mask System
  const [showMaskSystem, setShowMaskSystem] = useState(false);
  const [maskType, setMaskType] = useState<'add' | 'subtract' | 'intersect'>('add');
  // Advanced Particles
  const [showAdvancedParticles, setShowAdvancedParticles] = useState(false);
  const [particleGravity, setParticleGravity] = useState(0);
  const [particleWindX, setParticleWindX] = useState(0);
  const [particleTurbulence, setParticleTurbulence] = useState(0);
  const [particleFriction, setParticleFriction] = useState(0);
  // Repeater
  const [showRepeater, setShowRepeater] = useState(false);
  const [repeaterType, setRepeaterType] = useState<'grid' | 'radial' | 'spiral'>('grid');
  const [repeaterCount, setRepeaterCount] = useState(9);
  // Audio-Reactive
  const [showAudioReactive, setShowAudioReactive] = useState(false);
  const [audioReactiveBand, setAudioReactiveBand] = useState<'sub' | 'bass' | 'mids' | 'hiMids' | 'treble'>('bass');
  const [audioReactiveProperty, setAudioReactiveProperty] = useState<'scale' | 'opacity' | 'positionY' | 'rotation' | 'color'>('scale');
  const [audioSensitivity, setAudioSensitivity] = useState(75);
  const [audioSmoothing, setAudioSmoothing] = useState(50);
  const [audioAmplitude, setAudioAmplitude] = useState(100);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioFreqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [audioFreqSnapshot, setAudioFreqSnapshot] = useState<number[]>(new Array(32).fill(0));
  // 3D Text
  const [show3DText, setShow3DText] = useState(false);
  const [extrudeDepth, setExtrudeDepth] = useState(50);
  const [bevelSize, setBevelSize] = useState(5);
  // Shader Effects
  const [showShaderEffects, setShowShaderEffects] = useState(false);
  // GIF/APNG Export
  const [showGifExport, setShowGifExport] = useState(false);
  const [gifPalette, setGifPalette] = useState(256);
  const [gifDither, setGifDither] = useState(true);
  // Lottie Export
  const [showLottieExport, setShowLottieExport] = useState(false);
  // Composition Templates
  const [showCompTemplates, setShowCompTemplates] = useState(false);
  const [compTemplateCategory, setCompTemplateCategory] = useState<'lower-thirds' | 'intros' | 'social' | 'titles'>('lower-thirds');

  // ===== NEW PRO FEATURES STATE =====
  // 1. Track Mattes
  const [showTrackMattes, setShowTrackMattes] = useState(false);
  const [matteType, setMatteType] = useState<'alpha' | 'alphaInverted' | 'luma' | 'lumaInverted'>('alpha');
  const [matteLayerSelect, setMatteLayerSelect] = useState('');
  const [maskFeather, setMaskFeather] = useState(0);
  const [maskExpansion, setMaskExpansion] = useState(0);
  const [maskOpacity, setMaskOpacity] = useState(100);
  const [shaderCode, setShaderCode] = useState(`precision mediump float;\nuniform float u_time;\nuniform vec2 u_resolution;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0,2,4));\n  gl_FragColor = vec4(col, 1.0);\n}`);
  const [shaderUniforms, setShaderUniforms] = useState({ u_time: 0, u_speed: 50, u_intensity: 25 });
  // 2. Precompose
  const [showPrecompose, setShowPrecompose] = useState(false);
  const [precompName, setPrecompName] = useState('Pre-comp 1');
  // 3. Time Remap
  const [showTimeRemap, setShowTimeRemap] = useState(false);
  const [timeRemapSpeed, setTimeRemapSpeed] = useState(100);
  const [timeRemapReverse, setTimeRemapReverse] = useState(false);
  // 4. Morph Shapes
  const [showMorphShapes, setShowMorphShapes] = useState(false);
  const [morphProgress, setMorphProgress] = useState(0);
  // 5. Trim Paths
  const [showTrimPaths, setShowTrimPaths] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [trimOffset, setTrimOffset] = useState(0);
  // 6. Auto-Wiggle
  const [showAutoWiggle, setShowAutoWiggle] = useState(false);
  const [wiggleFreq, setWiggleFreq] = useState(5);
  const [wiggleAmp, setWiggleAmp] = useState(20);
  const [wiggleProperty, setWiggleProperty] = useState<'position' | 'rotation' | 'scale' | 'opacity'>('position');
  // 7. Layer Effects Stack
  const [showEffectsStack, setShowEffectsStack] = useState(false);
  // 8. Camera Rig
  const [showCameraRig, setShowCameraRig] = useState(false);
  const [cameraRigType, setCameraRigType] = useState<'orbit' | 'twoNode' | 'poi'>('orbit');
  const [cameraFov, setCameraFov] = useState(50);
  const [cameraDof, setCameraDof] = useState(false);
  // 9. Environment Map
  const [showEnvironment, setShowEnvironment] = useState(false);
  const [envMapPreset, setEnvMapPreset] = useState('studio');
  // 10. Render Queue
  const [showRenderQueue, setShowRenderQueue] = useState(false);
  const [renderQueue, setRenderQueue] = useState<{ id: string; name: string; format: string; status: 'queued' | 'rendering' | 'done' | 'error'; progress: number }[]>([]);
  // 11. Timeline Markers
  const [showMarkers, setShowMarkers] = useState(false);
  const [markers, setMarkers] = useState<{ id: string; time: number; label: string; color: string }[]>([]);
  // 12. Layer Alignment
  const [showAlignment, setShowAlignment] = useState(false);
  // 13. Guide Layers
  const [showGuideLayer, setShowGuideLayer] = useState(false);
  const [guideLayers, setGuideLayers] = useState<Set<string>>(new Set());
  // 14. Snapshot / A/B
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshots, setSnapshots] = useState<{ id: string; name: string; time: string }[]>([]);
  // 15. Frame Blending
  const [showFrameBlending, setShowFrameBlending] = useState(false);
  const [frameBlendSamples, setFrameBlendSamples] = useState(4);
  const [frameBlendShutter, setFrameBlendShutter] = useState(180);
  // 16. Color Correction
  const [showColorCorrection, setShowColorCorrection] = useState(false);
  const [ccLift, setCcLift] = useState({ r: 0, g: 0, b: 0 });
  const [ccGamma, setCcGamma] = useState({ r: 0, g: 0, b: 0 });
  const [ccGain, setCcGain] = useState({ r: 0, g: 0, b: 0 });
  // 17. Stagger / Sequence
  const [showStagger, setShowStagger] = useState(false);
  const [staggerOffset, setStaggerOffset] = useState(5);
  const [staggerOrder, setStaggerOrder] = useState<'top-down' | 'bottom-up' | 'random'>('top-down');
  // 18. Shape Stroke Effects
  const [showStrokeEffects, setShowStrokeEffects] = useState(false);
  const [strokeDash, setStrokeDash] = useState(10);
  const [strokeGap, setStrokeGap] = useState(5);
  const [strokeCap, setStrokeCap] = useState<'butt' | 'round' | 'square'>('round');
  // 19. Motion Blur
  const [showMotionBlur, setShowMotionBlur] = useState(false);
  const [motionBlurSamples, setMotionBlurSamples] = useState(8);
  const [motionBlurShutter, setMotionBlurShutter] = useState(180);
  // 20. Export Presets
  const [showExportPresets, setShowExportPresets] = useState(false);
  const [exportFormat, setExportFormat] = useState('mp4');
  const [exportCodec, setExportCodec] = useState('h264');
  const [exportQuality, setExportQuality] = useState(90);

  // Detect hardware tier for 3D gating
  useEffect(() => {
    (async () => {
      try {
        const profile = await (window as any).electron?.invoke?.('resource-governor:getHardwareProfile');
        if (profile?.tier) setHardwareTier(profile.tier);
      } catch { /* not in Electron or governor unavailable */ }
    })();
  }, []);

  // Close features menu on outside click or Escape key
  useEffect(() => {
    const handleClick = () => setShowFeaturesMenu(false);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFeaturesMenu(false); };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // ===== RETENTIVE MEMORY - Load/Save Workspace State =====
  useEffect(() => {
    const saved = localStorage.getItem('flux-workspace');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.activeTool) setActiveTool(data.activeTool);
        if (data.fps) setFps(data.fps);
        if (data.duration) setDuration(data.duration);
        if (data.canvasSize) setCanvasSize(data.canvasSize);
        if (data.viewScale) setViewScale(data.viewScale);
        if (data.is3DMode !== undefined) setIs3DModeGated(data.is3DMode);
        if (data.activeTab) setActiveTab(data.activeTab);
        if (data.showTimeline !== undefined) setShowTimeline(data.showTimeline);
        if (data.zoom) setZoom(data.zoom);
      } catch (e) {
        // Workspace JSON is corrupt -- clear it so user starts fresh next time
        try { localStorage.removeItem('flux-workspace'); } catch (e) { console.warn('[DEX]', e); }
        setInitError('Could not restore the last project (file may be corrupt). Starting fresh.');
      }
    }
    // Async IPC load (overrides localStorage if available)
    (async () => {
      try {
        const ipcData = await (window as any).electron?.invoke?.('capability:storage:get', 'flux-workspace');
        if (ipcData) {
          const data = typeof ipcData === 'string' ? JSON.parse(ipcData) : ipcData;
          if (data.activeTool) setActiveTool(data.activeTool);
          if (data.fps) setFps(data.fps);
          if (data.duration) setDuration(data.duration);
          if (data.canvasSize) setCanvasSize(data.canvasSize);
          if (data.viewScale) setViewScale(data.viewScale);
          if (data.is3DMode !== undefined) setIs3DModeGated(data.is3DMode);
          if (data.activeTab) setActiveTab(data.activeTab);
          if (data.showTimeline !== undefined) setShowTimeline(data.showTimeline);
          if (data.zoom) setZoom(data.zoom);
        }
      } catch { /* IPC not available */ }
    })();
  }, []);

  const fluxSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fluxSaveTimerRef.current) clearTimeout(fluxSaveTimerRef.current);
    fluxSaveTimerRef.current = setTimeout(() => {
      try {
        const data = {
          activeTool, fps, duration, canvasSize, viewScale,
          is3DMode, activeTab, showTimeline, zoom,
        };
        const json = JSON.stringify(data);
        localStorage.setItem('flux-workspace', json);
        (window as any).electron?.invoke?.('capability:storage:set', 'flux-workspace', json).catch((e: unknown) => { console.warn('[DEX]', e); });
      } catch (e) { console.warn('[Flux] Failed to save workspace:', e); }
    }, 500);
    return () => { if (fluxSaveTimerRef.current) clearTimeout(fluxSaveTimerRef.current); };
  }, [activeTool, fps, duration, canvasSize, viewScale, is3DMode, activeTab, showTimeline, zoom]);

  // ===== HISTORY TRACKING (debounced) =====
  const fluxHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    if (fluxHistoryTimerRef.current) clearTimeout(fluxHistoryTimerRef.current);
    fluxHistoryTimerRef.current = setTimeout(() => {
      setHistory(prev => {
        if (layers.length === 0 && prev.length === 0) return prev;
        return [...prev.slice(-49), {
          layers: layers.map(l => ({ ...l, content: typeof l.content === 'string' ? l.content : undefined })),
          timestamp: Date.now(),
          description: layers.length === 0 ? 'Cleared' : `${layers.length} layer${layers.length > 1 ? 's' : ''}`,
        }];
      });
      // Clear redo stack on new action
      setRedoStack([]);
    }, 300);
    return () => { if (fluxHistoryTimerRef.current) clearTimeout(fluxHistoryTimerRef.current); };
  }, [layers]);

  // ===== UNDO/REDO KEYBOARD SHORTCUTS =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        setHistory(prev => {
          if (prev.length <= 1) return prev;
          const undone = prev[prev.length - 1];
          const restored = prev[prev.length - 2];
          if (restored?.layers) {
            isRestoringRef.current = true;
            setLayers(restored.layers.map(l => ({ ...l, content: l.content || '' })) as typeof layers);
          }
          // Push undone state to redo stack
          if (undone) {
            setRedoStack(rs => [...rs, undone]);
          }
          return prev.slice(0, -1);
        });
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        setRedoStack(rs => {
          if (rs.length === 0) return rs;
          const redone = rs[rs.length - 1];
          if (redone?.layers) {
            isRestoringRef.current = true;
            setLayers(redone.layers.map(l => ({ ...l, content: l.content || '' })) as typeof layers);
            setHistory(prev => [...prev, redone]);
          }
          return rs.slice(0, -1);
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedLayerId(layers.length > 0 ? layers[0].id : null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) {
          setLayers(prev => prev.filter(l => l.id !== selectedLayerId));
          setSelectedLayerId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, layers]);

  // ===== EMPTY STATE =====
  const renderWelcome = () => (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      height: '100%', gap: '16px', textAlign: 'center',
    }}>
      <div style={{ color: '#bf5af2', opacity: 0.5 }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>FLUX</div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Add a layer to start creating motion graphics</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => addLayer('shape')} aria-label="Add shape layer" style={{ 
          padding: '6px 14px', 
          background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', 
          border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)', borderRadius: '6px', color: 'var(--color-accent)', fontSize: '11px', fontWeight: 600, 
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          </svg>
          Shape
        </button>
        <button onClick={() => addLayer('text')} aria-label="Add text layer" style={{ 
          padding: '6px 14px', 
          background: 'var(--color-border-subtle)', 
          border: '1px solid var(--color-border-subtle)', borderRadius: '6px', 
          color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, 
          cursor: 'pointer',
        }}>
          Text
        </button>
      </div>
    </div>
  );

  // ===== ANIMATION PLAYBACK =====
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / Math.min(fps, getTargetFPS());
    let lastStateSync = 0;
    const STATE_SYNC_INTERVAL = 66; // ~15fps for React state updates
    
    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }
      
      const elapsed = timestamp - lastFrameTimeRef.current;
      
      if (elapsed >= frameDuration) {
        setCurrentTime(prev => {
          const next = prev + 1;
          if (next >= duration) {
            if (loopEnabled) {
              return 0;
            }
            setIsPlaying(false);
            // Stop video recording if active
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
              mediaRecorderRef.current = null;
            }
            return 0;
          }
          return next;
        });
        lastFrameTimeRef.current = timestamp - (elapsed % frameDuration);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, fps, duration, loopEnabled]);

  // ===== AUDIO REACTIVE ENGINE =====
  useEffect(() => {
    if (!showAudioReactive) return;
    let rafId: number;
    let cancelled = false;
    const initAudio = async () => {
      try {
        if (!audioContextRef.current) {
          const actx = new AudioContext();
          if (actx.state === 'suspended') {
            await actx.resume().catch((err) => {
              console.warn('[Flux] AudioContext.resume() failed:', err?.message || err);
            });
          }
          const analyser = actx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = audioSmoothing / 100;
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            try { await actx.close(); } catch { /* already closed */ }
            return;
          }
          audioStreamRef.current = stream;
          const source = actx.createMediaStreamSource(stream);
          source.connect(analyser);
          audioContextRef.current = actx;
          analyserRef.current = analyser;
          audioFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        }
        const analyser = analyserRef.current!;
        analyser.smoothingTimeConstant = audioSmoothing / 100;
        const data = audioFreqDataRef.current!;
        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const snap: number[] = [];
          const binCount = analyser.frequencyBinCount;
          const step = Math.max(1, Math.floor(binCount / 32));
          for (let i = 0; i < 32; i++) {
            snap.push((data[i * step] || 0) / 255);
          }
          setAudioFreqSnapshot(snap);
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        setAudioFreqSnapshot(new Array(32).fill(0));
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Microphone access denied — audio reactive disabled' } }));
      }
    };
    initAudio();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      // Stop media stream tracks when audio reactive is disabled
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch { /* already closed */ }
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      audioFreqDataRef.current = null;
    };
  }, [showAudioReactive, audioSmoothing]);

  // ===== CANVAS RENDERING =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setCanvasError(true);
      return;
    }
    
    // High-quality rendering settings (scaled by device tier)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = getAdaptiveDPR() > 1 ? 'high' : 'low';
    
    // Clear canvas with background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    
    // Render layers from bottom to top (reversed order)
    const visibleLayers = layers.filter(l => l.visible && currentTime >= l.inPoint && currentTime <= l.outPoint).reverse();
    
    // Cache per-frame constants outside the layer loop
    const cachedTier = getPerfTier();
    const cachedMaxParticles = cachedTier === 'low' ? 60 : cachedTier === 'mid' ? 250 : cachedTier === 'high' ? 500 : 1000;
    const defaultParticleEmitter = { birthRate: 20, life: 60, lifeRange: 20, speed: 2, speedRange: 1, angle: 270, angleRange: 30, spin: 0, spinRange: 0, scale: 1, scaleRange: 0.5, color: 'var(--color-accent)', colorRange: 0, opacity: 1, shape: 'circle' as const };
    
    for (const layer of visibleLayers) {
      ctx.save();
      
      // Compute local time for this layer
      const localTime = currentTime - layer.inPoint;
      // Apply transform (with keyframe interpolation overrides)
      const tx = getAnimatedValue(layer, 'x', currentTime) ?? layer.transform.x;
      const ty = getAnimatedValue(layer, 'y', currentTime) ?? layer.transform.y;
      const tScaleX = getAnimatedValue(layer, 'scaleX', currentTime) ?? layer.transform.scaleX;
      const tScaleY = getAnimatedValue(layer, 'scaleY', currentTime) ?? layer.transform.scaleY;
      const tRotZ = getAnimatedValue(layer, 'rotationZ', currentTime) ?? layer.transform.rotationZ;
      const tOpacity = getAnimatedValue(layer, 'opacity', currentTime) ?? layer.transform.opacity;
      const { anchorX, anchorY } = layer.transform;
      ctx.globalAlpha = tOpacity / 100;
      ctx.translate(tx, ty);
      // 3D mode: apply X/Y rotations as perspective skew on 2D canvas
      if (is3DMode) {
        const tRotX = getAnimatedValue(layer, 'rotationX', currentTime) ?? layer.transform.rotationX;
        const tRotY = getAnimatedValue(layer, 'rotationY', currentTime) ?? layer.transform.rotationY;
        const cosX = Math.cos((tRotX * Math.PI) / 180);
        const cosY = Math.cos((tRotY * Math.PI) / 180);
        // Simulate 3D perspective via scale + skew approximation
        ctx.transform(cosY, 0, 0, cosX, 0, 0);
        const depth = layer.transform.z || 0;
        const perspScale = 1000 / (1000 + depth);
        ctx.scale(perspScale, perspScale);
      }
      ctx.rotate((tRotZ * Math.PI) / 180);
      ctx.scale(tScaleX / 100, tScaleY / 100);
      ctx.translate(-anchorX, -anchorY);
      
      // Apply behaviors (calculate animated values)
      const animatedTransform = applyBehaviors(layer, currentTime);
      if (animatedTransform.x) ctx.translate(animatedTransform.x, 0);
      if (animatedTransform.y) ctx.translate(0, animatedTransform.y);
      if (animatedTransform.rotation) ctx.rotate((animatedTransform.rotation * Math.PI) / 180);
      if (animatedTransform.scale) ctx.scale(animatedTransform.scale, animatedTransform.scale);
      if (animatedTransform.opacity !== undefined) ctx.globalAlpha *= animatedTransform.opacity;
      
      // Audio-reactive property modulation
      if (showAudioReactive && layer.id === selectedLayerId) {
        const bandRanges: Record<string, [number, number]> = { sub: [0, 2], bass: [2, 6], mids: [6, 14], hiMids: [14, 22], treble: [22, 32] };
        const [lo, hi] = bandRanges[audioReactiveBand] || [2, 6];
        let bandVal = 0;
        for (let bi = lo; bi < hi; bi++) bandVal += (audioFreqSnapshot[bi] || 0);
        bandVal = (bandVal / (hi - lo)) * (audioSensitivity / 100) * (audioAmplitude / 100);
        switch (audioReactiveProperty) {
          case 'scale': ctx.scale(1 + bandVal * 0.5, 1 + bandVal * 0.5); break;
          case 'opacity': ctx.globalAlpha *= Math.max(0, 1 - bandVal * 0.8); break;
          case 'positionY': ctx.translate(0, -bandVal * 80); break;
          case 'rotation': ctx.rotate(bandVal * Math.PI * 0.5); break;
          case 'color': break; // handled in render
        }
      }

      // Apply canvas filters from layer.filters
      const enabledFilters = (layer.filters || []).filter((f: Filter) => f.enabled);
      if (enabledFilters.length > 0) {
        const filterParts: string[] = [];
        for (const f of enabledFilters) {
          const fs = f.settings || {};
          switch (f.type) {
            case 'blur': filterParts.push(`blur(${fs.radius ?? 4}px)`); break;
            case 'glow':
            case 'bloom': filterParts.push(`brightness(${1 + (fs.intensity ?? 0.5)}) blur(${fs.radius ?? 2}px)`); break;
            case 'sharpen': filterParts.push(`contrast(${1 + (fs.amount ?? 0.3)})`); break;
            case 'colorCorrect': {
              if (fs.brightness) filterParts.push(`brightness(${1 + fs.brightness / 100})`);
              if (fs.contrast) filterParts.push(`contrast(${1 + fs.contrast / 100})`);
              if (fs.saturate) filterParts.push(`saturate(${1 + fs.saturate / 100})`);
              if (fs.hueRotate) filterParts.push(`hue-rotate(${fs.hueRotate}deg)`);
              break;
            }
            case 'vignette': filterParts.push(`brightness(${1 - (fs.amount ?? 0.3)})`); break;
            case 'stylize': {
              if (fs.sepia) filterParts.push(`sepia(${fs.sepia / 100})`);
              if (fs.grayscale) filterParts.push(`grayscale(${fs.grayscale / 100})`);
              if (fs.invert) filterParts.push(`invert(${fs.invert / 100})`);
              break;
            }
            default: break;
          }
        }
        if (filterParts.length > 0) {
          ctx.filter = filterParts.join(' ');
        }
      }
      
      // Render based on layer type
      switch (layer.type) {
        case 'generator':
          // Gradient background
          const gradient = ctx.createLinearGradient(0, 0, 200, 200);
          gradient.addColorStop(0, '#0e0e12');
          gradient.addColorStop(1, '#151518');
          ctx.fillStyle = gradient;
          ctx.fillRect(-canvasSize.width / 2, -canvasSize.height / 2, canvasSize.width, canvasSize.height);
          break;
          
        case 'shape':
          const style = layer.shapeStyle || { fill: 'var(--color-accent)', stroke: 'var(--color-accent)', strokeWidth: 2, type: 'rectangle' as const };
          ctx.fillStyle = style.fill;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.strokeWidth;
          // Stroke effects
          if (strokeDash > 0 || strokeGap > 0) ctx.setLineDash([strokeDash, strokeGap]);
          ctx.lineCap = strokeCap;
          // Trim paths (emulate via lineDash offset)
          if (trimStart > 0 || trimEnd < 100) {
            const perim = style.type === 'ellipse' ? Math.PI * 100 : 400;
            const visLen = ((trimEnd - trimStart) / 100) * perim;
            ctx.setLineDash([visLen, perim - visLen]);
            ctx.lineDashOffset = -(trimStart / 100) * perim - (trimOffset / 360) * perim;
          }
          // Mask clipping
          if (layer.masks?.length) {
            for (const m of layer.masks) {
              ctx.save();
              ctx.beginPath();
              if (m.shape === 'ellipse') ctx.ellipse(0, 0, 50 + m.expansion, 50 + m.expansion, 0, 0, Math.PI * 2);
              else ctx.rect(-50 - m.expansion, -50 - m.expansion, 100 + m.expansion * 2, 100 + m.expansion * 2);
              if (m.mode === 'subtract') { ctx.clip('evenodd'); } else { ctx.clip(); }
              ctx.restore();
            }
          }
          if (style.type === 'rectangle') {
            ctx.fillRect(-50, -50, 100, 100);
            ctx.strokeRect(-50, -50, 100, 100);
          } else if (style.type === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(0, 0, 50, 50, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          // Path / morph rendering (overrides primitive fill if pathKeyframes present)
          if (layer.pathKeyframes && layer.pathKeyframes.length > 0) {
            const kfs = layer.pathKeyframes;
            const SAMPLES = 64;
            let pts: { x: number; y: number }[];
            if (kfs.length === 1) {
              pts = resamplePolyline(parsePath(kfs[0].d), SAMPLES);
            } else {
              const sorted = [...kfs].sort((a, b) => a.time - b.time);
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              if (currentTime <= first.time) {
                pts = resamplePolyline(parsePath(first.d), SAMPLES);
              } else if (currentTime >= last.time) {
                pts = resamplePolyline(parsePath(last.d), SAMPLES);
              } else {
                let k0 = sorted[0], k1 = sorted[1];
                for (let i = 0; i < sorted.length - 1; i++) {
                  if (currentTime >= sorted[i].time && currentTime <= sorted[i + 1].time) {
                    k0 = sorted[i]; k1 = sorted[i + 1]; break;
                  }
                }
                const span = k1.time - k0.time || 1;
                const raw = (currentTime - k0.time) / span;
                const eased = layer.easing ? applyEasing(raw, layer.easing) : raw;
                const a = resamplePolyline(parsePath(k0.d), SAMPLES);
                const b = resamplePolyline(parsePath(k1.d), SAMPLES);
                pts = lerpPoints(a, b, eased);
              }
            }
            if (pts.length > 1) {
              // Center the morphed path on the layer origin using its bbox
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
              }
              const cx = (minX + maxX) / 2;
              const cy = (minY + maxY) / 2;
              ctx.beginPath();
              ctx.moveTo(pts[0].x - cx, pts[0].y - cy);
              for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x - cx, pts[i].y - cy);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
          break;
          
        case 'text':
          const textStyle = layer.textStyle || { fontSize: 48, fontFamily: 'Arial', color: 'var(--color-text-primary)', align: 'center' as const };
          ctx.font = `${textStyle.fontSize}px ${textStyle.fontFamily}`;
          ctx.textAlign = textStyle.align;
          ctx.textBaseline = 'middle';
          const textContent = layer.content as string || 'Text';
          // 3D text extrusion
          if (extrudeDepth > 0) {
            const steps = Math.min(Math.round(extrudeDepth / 5), 30);
            for (let d = steps; d > 0; d--) {
              const shade = Math.max(0, 40 - d * (40 / steps));
              ctx.fillStyle = `rgb(${Math.round(shade)},${Math.round(shade)},${Math.round(shade + 8)})`;
              ctx.fillText(textContent, d * 0.7, d * 0.7);
            }
            // Bevel highlight
            if (bevelSize > 0) {
              ctx.fillStyle = `rgba(255,255,255,${Math.min(0.3, bevelSize / 20)})`;
              ctx.fillText(textContent, -0.5, -0.5);
            }
          }
          ctx.fillStyle = textStyle.color;
          ctx.fillText(textContent, 0, 0);
          break;
          
        case 'image':
          if (layer.content instanceof HTMLImageElement && layer.content.complete) {
            ctx.drawImage(layer.content, -layer.content.width / 2, -layer.content.height / 2);
          }
          break;
          
        case 'video':
          if (layer.content instanceof HTMLVideoElement) {
            ctx.drawImage(layer.content, -layer.content.videoWidth / 2, -layer.content.videoHeight / 2);
          }
          break;
          
        case 'particle': {
          // Real particle system using emitter settings (cached defaults)
          const emitter = layer.particleEmitter || defaultParticleEmitter;
          const maxParticles = cachedMaxParticles;
          const particleCount = Math.min(emitter.birthRate * (emitter.life / fps), maxParticles);
          const baseAngle = (emitter.angle * Math.PI) / 180;
          const angleSpread = (emitter.angleRange * Math.PI) / 180;
          
          for (let i = 0; i < particleCount; i++) {
            // Deterministic per-particle seed based on index
            const seed = i * 1.61803398875; // golden ratio for distribution
            const particleBirth = (i / emitter.birthRate) * fps;
            const particleAge = localTime - particleBirth;
            
            if (particleAge < 0) continue;
            const life = emitter.life + (Math.sin(seed * 7.3) * emitter.lifeRange);
            if (particleAge > life) continue;
            
            const lifeProgress = particleAge / life;
            const speed = emitter.speed + Math.sin(seed * 3.7) * emitter.speedRange;
            const angle = baseAngle + Math.sin(seed * 5.1) * angleSpread;
            const pScale = emitter.scale + Math.sin(seed * 2.3) * emitter.scaleRange;
            
            const px = Math.cos(angle) * speed * particleAge + particleWindX * particleAge * particleAge * 0.5 + Math.sin(seed * 11.7 + particleAge * 2) * particleTurbulence * 10;
            const py = Math.sin(angle) * speed * particleAge + particleGravity * particleAge * particleAge * 0.5 + Math.cos(seed * 13.3 + particleAge * 2) * particleTurbulence * 10;
            const frictionFactor = Math.max(0, 1 - particleFriction * 0.01 * particleAge);
            const rotation = emitter.spin * particleAge + Math.sin(seed * 4.1) * emitter.spinRange * particleAge;
            const fadeOut = lifeProgress > 0.7 ? 1 - (lifeProgress - 0.7) / 0.3 : 1;
            const fadeIn = lifeProgress < 0.1 ? lifeProgress / 0.1 : 1;
            
            ctx.save();
            ctx.translate(px * frictionFactor, py * frictionFactor);
            ctx.rotate(rotation);
            ctx.globalAlpha *= emitter.opacity * fadeIn * fadeOut;
            ctx.fillStyle = emitter.color;
            const size = 4 * pScale * (1 - lifeProgress * 0.5);
            
            if (emitter.shape === 'circle' || emitter.shape === 'point') {
              ctx.beginPath();
              ctx.arc(0, 0, Math.max(0.5, size), 0, Math.PI * 2);
              ctx.fill();
            } else if (emitter.shape === 'rectangle') {
              ctx.fillRect(-size, -size, size * 2, size * 2);
            } else if (emitter.shape === 'line') {
              ctx.strokeStyle = emitter.color;
              ctx.lineWidth = Math.max(0.5, size * 0.3);
              ctx.beginPath();
              ctx.moveTo(-size, 0);
              ctx.lineTo(size, 0);
              ctx.stroke();
            }
            ctx.restore();
          }
          break;
        }
          
        default:
          break;
      }
      
      // Track matte compositing
      if (layer.matteLayerId) {
        const matteSrc = layers.find(l => l.id === layer.matteLayerId);
        if (matteSrc) {
          if (!offCanvasRef.current) offCanvasRef.current = document.createElement('canvas');
          const offC = offCanvasRef.current;
          offC.width = canvasSize.width; offC.height = canvasSize.height;
          const offCtx = offC.getContext('2d');
          if (offCtx) {
            offCtx.save();
            const mTx = matteSrc.transform;
            offCtx.translate(mTx.x, mTx.y);
            offCtx.rotate((mTx.rotationZ * Math.PI) / 180);
            offCtx.scale(mTx.scaleX / 100, mTx.scaleY / 100);
            offCtx.fillStyle = '#fff';
            if (matteSrc.type === 'shape') {
              const ms = matteSrc.shapeStyle?.type || 'rectangle';
              if (ms === 'ellipse') { offCtx.beginPath(); offCtx.ellipse(0, 0, 50, 50, 0, 0, Math.PI * 2); offCtx.fill(); }
              else offCtx.fillRect(-50, -50, 100, 100);
            } else if (matteSrc.type === 'text') {
              offCtx.font = `${matteSrc.textStyle?.fontSize || 48}px ${matteSrc.textStyle?.fontFamily || 'Arial'}`;
              offCtx.fillText(matteSrc.content as string || 'Text', 0, 0);
            }
            offCtx.restore();
            const mType = layer.matteType || 'alpha';
            if (mType === 'luma' || mType === 'lumaInverted') {
              const imgD = offCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);
              const d = imgD.data;
              for (let px = 0; px < d.length; px += 4) {
                const lum = d[px] * 0.299 + d[px + 1] * 0.587 + d[px + 2] * 0.114;
                d[px + 3] = mType === 'lumaInverted' ? 255 - lum : lum;
              }
              offCtx.putImageData(imgD, 0, 0);
            }
            if (mType === 'alphaInverted') {
              const imgD = offCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);
              const d = imgD.data;
              for (let px = 3; px < d.length; px += 4) d[px] = 255 - d[px];
              offCtx.putImageData(imgD, 0, 0);
            }
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(offC, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }

      // Reset filter after each layer
      ctx.filter = 'none';
      ctx.restore();
    }

    // Motion blur post-process
    if (showMotionBlur && motionBlurSamples > 1) {
      if (!motionBlurCanvasRef.current) motionBlurCanvasRef.current = document.createElement('canvas');
      const blurCanvas = motionBlurCanvasRef.current;
      blurCanvas.width = canvasSize.width; blurCanvas.height = canvasSize.height;
      const bCtx = blurCanvas.getContext('2d');
      if (bCtx) {
        bCtx.drawImage(canvas, 0, 0);
        const shutterFrac = motionBlurShutter / 360;
        ctx.globalAlpha = 0.3 * shutterFrac;
        for (let s = 1; s < Math.min(motionBlurSamples, 8); s++) {
          const offset = (s / motionBlurSamples) * 2 * shutterFrac;
          ctx.drawImage(blurCanvas, offset, offset);
        }
        ctx.globalAlpha = 1;
      }
    }
  }, [layers, currentTime, canvasSize, strokeDash, strokeGap, strokeCap, trimStart, trimEnd, trimOffset, extrudeDepth, bevelSize, showMotionBlur, motionBlurSamples, motionBlurShutter]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl+S — save project
      if (mod && e.key === 's') {
        e.preventDefault();
        saveProject();
        return;
      }
      if (mod && e.key === 'e') {
        e.preventDefault();
        exportVideo();
        return;
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedLayerId) {
            e.preventDefault();
            setLayers(prev => prev.filter(l => l.id !== selectedLayerId));
            setSelectedLayerId('');
          }
          break;
        case 'KeyZ':
          if (mod && history.length > 1) {
            e.preventDefault();
            isRestoringRef.current = true;
            const prevSnapshot = history[history.length - 2];
            setLayers(prevSnapshot.layers);
            setHistory(h => h.slice(0, -1));
            requestAnimationFrame(() => { isRestoringRef.current = false; });
          }
          break;
        case 'KeyD':
          if (mod && selectedLayerId) {
            e.preventDefault();
            const layer = layers.find(l => l.id === selectedLayerId);
            if (layer) {
              const dup = { ...layer, id: `layer_${Date.now()}`, name: `${layer.name} Copy` };
              setLayers(prev => [dup, ...prev]);
            }
          }
          break;
        case 'BracketLeft':
          if (selectedLayerId) {
            e.preventDefault();
            setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, inPoint: currentTime } : l));
          }
          break;
        case 'BracketRight':
          if (selectedLayerId) {
            e.preventDefault();
            setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, outPoint: currentTime } : l));
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentTime(0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(t => Math.max(0, t - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(t => t + 1);
          break;
        case 'Escape':
          if (showTextAnimator) setShowTextAnimator(false);
          else if (showGraphEditor) setShowGraphEditor(false);
          else if (showExpressionEditor) setShowExpressionEditor(false);
          else if (showNullObjects) setShowNullObjects(false);
          else if (showMotionPath) setShowMotionPath(false);
          else if (showMaskSystem) setShowMaskSystem(false);
          else if (showAdvancedParticles) setShowAdvancedParticles(false);
          else if (showRepeater) setShowRepeater(false);
          else if (showAudioReactive) setShowAudioReactive(false);
          else if (show3DText) setShow3DText(false);
          else if (showShaderEffects) setShowShaderEffects(false);
          else if (showGifExport) setShowGifExport(false);
          else if (showLottieExport) setShowLottieExport(false);
          else if (showCompTemplates) setShowCompTemplates(false);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, layers, history, currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== MASTER CLEANUP — Release all heavyweight resources on unmount =====
  useEffect(() => {
    return () => {
      // Cancel any running animation frame
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Stop active MediaRecorder
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        } catch { /* already stopped */ }
        mediaRecorderRef.current = null;
      }
      // Close AudioContext
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch { /* already closed */ }
        audioContextRef.current = null;
      }
      // Release offscreen canvases
      if (offCanvasRef.current) {
        offCanvasRef.current.width = 0;
        offCanvasRef.current.height = 0;
        offCanvasRef.current = null;
      }
      if (motionBlurCanvasRef.current) {
        motionBlurCanvasRef.current.width = 0;
        motionBlurCanvasRef.current.height = 0;
        motionBlurCanvasRef.current = null;
      }
      // Clear history/redo timers
      if (fluxHistoryTimerRef.current) {
        clearTimeout(fluxHistoryTimerRef.current);
        fluxHistoryTimerRef.current = null;
      }
      if (fluxSaveTimerRef.current) {
        clearTimeout(fluxSaveTimerRef.current);
        fluxSaveTimerRef.current = null;
      }
    };
  }, []);

  // ===== EASING FUNCTIONS =====
  const ease = useCallback((t: number, type: string): number => {
    const c = Math.max(0, Math.min(1, t));
    switch (type) {
      case 'easeIn': return c * c * c;
      case 'easeOut': return 1 - Math.pow(1 - c, 3);
      case 'easeInOut': return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
      case 'bounce': {
        const n1 = 7.5625; const d1 = 2.75;
        let x = 1 - c;
        let v: number;
        if (x < 1 / d1) { v = n1 * x * x; }
        else if (x < 2 / d1) { v = n1 * (x -= 1.5 / d1) * x + 0.75; }
        else if (x < 2.5 / d1) { v = n1 * (x -= 2.25 / d1) * x + 0.9375; }
        else { v = n1 * (x -= 2.625 / d1) * x + 0.984375; }
        return 1 - v;
      }
      case 'elastic': {
        if (c === 0 || c === 1) return c;
        return -Math.pow(2, 10 * c - 10) * Math.sin((c * 10 - 10.75) * (2 * Math.PI) / 3);
      }
      default: return c; // linear
    }
  }, []);

  // ===== BEHAVIOR APPLICATION =====
  const applyBehaviors = useCallback((layer: Layer, time: number): { x?: number; y?: number; rotation?: number; scale?: number; opacity?: number } => {
    const result: { x?: number; y?: number; rotation?: number; scale?: number; opacity?: number } = {};
    const localTime = time - layer.inPoint;
    const layerDuration = layer.outPoint - layer.inPoint;
    
    for (const behavior of layer.behaviors) {
      if (!behavior.enabled) continue;
      const s = behavior.settings || {};
      const easing = s.easing || 'linear';
      
      switch (behavior.type) {
        case 'fadeIn': {
          const dur = s.duration || 30;
          if (localTime < dur) {
            const t = ease(localTime / dur, easing);
            result.opacity = (result.opacity ?? 1) * t;
          }
          break;
        }
        case 'fadeOut': {
          const dur = s.duration || 30;
          const start = layerDuration - dur;
          if (localTime > start) {
            const t = ease((localTime - start) / dur, easing);
            result.opacity = (result.opacity ?? 1) * (1 - t);
          }
          break;
        }
        case 'spin': {
          const speed = s.speed ?? 3;
          const direction = s.direction === 'ccw' ? -1 : 1;
          result.rotation = (result.rotation ?? 0) + (localTime * speed * direction);
          break;
        }
        case 'grow': {
          const dur = s.duration || 30;
          const fromScale = s.fromScale ?? 0.5;
          const toScale = s.toScale ?? 1;
          const t = ease(Math.min(1, localTime / dur), easing);
          result.scale = (result.scale ?? 1) * (fromScale + (toScale - fromScale) * t);
          break;
        }
        case 'oscillate': {
          const amplitude = s.amplitude ?? 30;
          const frequency = s.frequency ?? 0.1;
          const axis = s.axis || 'y';
          const v = Math.sin(localTime * frequency) * amplitude;
          if (axis === 'x' || axis === 'both') result.x = (result.x ?? 0) + v;
          if (axis === 'y' || axis === 'both') result.y = (result.y ?? 0) + v;
          break;
        }
        case 'wiggle': {
          const amplitude = s.amplitude ?? 10;
          const frequency = s.frequency ?? 0.3;
          result.x = (result.x ?? 0) + Math.sin(localTime * frequency) * amplitude;
          result.y = (result.y ?? 0) + Math.cos(localTime * frequency * 0.83) * amplitude;
          break;
        }
        case 'drift': {
          const speedX = s.speedX ?? 0.5;
          const speedY = s.speedY ?? 0;
          result.x = (result.x ?? 0) + localTime * speedX;
          result.y = (result.y ?? 0) + localTime * speedY;
          break;
        }
        case 'throw': {
          const velocityX = s.velocityX ?? 2;
          const velocityY = s.velocityY ?? 0;
          const gravity = s.gravity ?? 0.01;
          result.x = (result.x ?? 0) + localTime * velocityX;
          result.y = (result.y ?? 0) + localTime * velocityY + localTime * localTime * gravity;
          break;
        }
        case 'orbit': {
          const radius = s.radius ?? 80;
          const speed = s.speed ?? 0.05;
          result.x = (result.x ?? 0) + Math.cos(localTime * speed) * radius;
          result.y = (result.y ?? 0) + Math.sin(localTime * speed) * radius;
          break;
        }
        case 'vortex': {
          const speed = s.speed ?? 0.08;
          const pull = s.pull ?? 0.5;
          const angle = localTime * speed;
          const r = Math.max(0, 100 - localTime * pull);
          result.x = (result.x ?? 0) + Math.cos(angle) * r;
          result.y = (result.y ?? 0) + Math.sin(angle) * r;
          break;
        }
        case 'gravity': {
          const accel = s.acceleration ?? 0.02;
          const ground = s.ground ?? canvasSize.height;
          const displacement = localTime * localTime * accel;
          const bounced = s.bounce ? Math.abs(((displacement % (ground * 2)) - ground)) : Math.min(displacement, ground);
          result.y = (result.y ?? 0) + bounced;
          break;
        }
        case 'attract': {
          const targetX = s.targetX ?? canvasSize.width / 2;
          const targetY = s.targetY ?? canvasSize.height / 2;
          const strength = s.strength ?? 0.02;
          const dur = s.duration || 60;
          const t = ease(Math.min(1, localTime / dur), easing);
          result.x = (result.x ?? 0) + (targetX - layer.transform.x) * t * strength * localTime;
          result.y = (result.y ?? 0) + (targetY - layer.transform.y) * t * strength * localTime;
          break;
        }
        case 'repel': {
          const sourceX = s.sourceX ?? canvasSize.width / 2;
          const sourceY = s.sourceY ?? canvasSize.height / 2;
          const strength = s.strength ?? 1;
          const dx = layer.transform.x - sourceX;
          const dy = layer.transform.y - sourceY;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = (strength * 1000) / (dist * dist);
          result.x = (result.x ?? 0) + (dx / dist) * force;
          result.y = (result.y ?? 0) + (dy / dist) * force;
          break;
        }
        case 'randomMotion': {
          const amplitude = s.amplitude ?? 15;
          const seed = s.seed ?? 42;
          // Seeded pseudo-random using sin
          const rx = Math.sin(localTime * 0.1 + seed) * Math.cos(localTime * 0.07 + seed * 1.3);
          const ry = Math.cos(localTime * 0.09 + seed * 0.7) * Math.sin(localTime * 0.13 + seed * 1.7);
          result.x = (result.x ?? 0) + rx * amplitude;
          result.y = (result.y ?? 0) + ry * amplitude;
          break;
        }
        default:
          break;
      }
    }
    
    return result;
  }, [ease, canvasSize]);

  // ===== TOOLS =====
  const tools = useMemo(() => [
    { id: 'pointer', icon: Icons.pointer, name: 'Select/Transform', key: 'V' },
    { id: 'move', icon: Icons.move, name: 'Move', key: 'G' },
    { id: 'rotate', icon: Icons.rotate, name: 'Rotate', key: 'R' },
    { id: 'scale', icon: Icons.scale, name: 'Scale', key: 'S' },
    { id: 'text', icon: Icons.text, name: 'Text', key: 'T' },
    { id: 'shape', icon: Icons.shape, name: 'Shape', key: '' },
    { id: 'pen', icon: Icons.pen, name: 'Bezier', key: 'P' },
    { id: 'particle', icon: Icons.particle, name: 'Particle', key: '' },
    { id: 'camera', icon: Icons.camera, name: 'Camera', key: '' },
    { id: 'light', icon: Icons.light, name: 'Light', key: '' },
    { id: 'hand', icon: Icons.hand, name: 'Pan', key: 'H' },
    { id: 'zoom', icon: Icons.zoom, name: 'Zoom', key: 'Z' },
  ], []);

  const toolGroups = useMemo(() => [
    { id: 'transform', tools: ['pointer', 'move', 'rotate', 'scale'], label: 'Transform' },
    { id: 'content', tools: ['text', 'shape', 'pen', 'particle'], label: 'Content' },
    { id: 'scene', tools: ['camera', 'light'], label: 'Scene' },
    { id: 'navigate', tools: ['hand', 'zoom'], label: 'Navigate' },
  ], []);
  const [openToolGroup, setOpenToolGroup] = useState<string | null>(null);
  const [selectedInGroup, setSelectedInGroup] = useState<Record<string, string>>({});
  const toolGroupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openToolGroup) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (toolGroupRef.current && !toolGroupRef.current.contains(event.target as Node)) {
        setOpenToolGroup(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenToolGroup(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openToolGroup]);

  // ===== TIMELINE FUNCTIONS =====
  const formatTime = useCallback((frames: number) => {
    const totalSeconds = frames / fps;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const frms = frames % fps;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frms.toString().padStart(2, '0')}`;
  }, [fps]);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const goToStart = useCallback(() => {
    setCurrentTime(0);
    setPlayheadPosition(0);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentTime(duration);
    setPlayheadPosition(duration);
  }, [duration]);

  // ===== LAYER FUNCTIONS =====
  const addLayer = useCallback((type: Layer['type']): string => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${layers.length + 1}`,
      type,
      visible: true,
      locked: false,
      solo: false,
      startTime: currentTime,
      duration: 150,
      inPoint: currentTime,
      outPoint: currentTime + 150,
      transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
      behaviors: [],
      filters: [],
      animations: [],
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
    return newLayer.id;
  }, [layers.length, currentTime, canvasSize]);

  const deleteLayer = useCallback((id: string) => {
    // Revoke blob URLs for imported image/video layers to prevent memory leaks
    setLayers(prev => {
      const layer = prev.find(l => l.id === id);
      if (layer && layer.content) {
        const src = (layer.content as HTMLImageElement | HTMLVideoElement).src;
        if (src && src.startsWith('blob:')) {
          try { URL.revokeObjectURL(src); } catch { /* ignore */ }
        }
      }
      return prev.filter(l => l.id !== id);
    });
    if (selectedLayerId === id && layers.length > 1) {
      setSelectedLayerId(layers[0]?.id || '');
    }
  }, [layers, selectedLayerId]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const duplicateLayer = useCallback((id: string) => {
    setLayers(prev => {
      const src = prev.find(l => l.id === id);
      if (!src) return prev;
      const dup = { ...src, id: `flux-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: `${src.name} Copy`, behaviors: src.behaviors.map(b => ({ ...b, id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })), filters: src.filters.map(f => ({ ...f, id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) };
      const idx = prev.findIndex(l => l.id === id);
      const next = [...prev];
      next.splice(idx, 0, dup);
      return next;
    });
  }, []);

  const toggleLayerLock = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  }, []);

  const addBehavior = useCallback((layerId: string, behaviorType: string) => {
    const newBehavior: Behavior = {
      id: `behavior-${Date.now()}`,
      type: behaviorType as Behavior['type'],
      enabled: true,
      settings: {},
    };
    setLayers(prev => prev.map(l => 
      l.id === layerId ? { ...l, behaviors: [...l.behaviors, newBehavior] } : l
    ));
  }, []);

  const addFilter = useCallback((layerId: string, filterType: string) => {
    const newFilter: Filter = {
      id: `filter-${Date.now()}`,
      type: filterType as Filter['type'],
      enabled: true,
      settings: {},
    };
    setLayers(prev => prev.map(l => 
      l.id === layerId ? { ...l, filters: [...l.filters, newFilter] } : l
    ));
  }, []);

  // ===== UPDATE LAYER TRANSFORM =====
  const updateLayerTransform = useCallback((updates: Partial<Transform>) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l =>
      l.id === selectedLayerId ? { ...l, transform: { ...l.transform, ...updates } } : l
    ));
  }, [selectedLayerId]);

  // ===== EASING + MORPH =====
  const updateLayerEasing = useCallback((easing: EasingValue) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, easing } : l));
  }, [selectedLayerId]);

  const applyMorphTarget = useCallback((targetD: string) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l => {
      if (l.id !== selectedLayerId || l.type !== 'shape') return l;
      // Seed: a square representing the current primitive shape (-50..50 box).
      // If pathKeyframes already exist, append a new keyframe at currentTime;
      // otherwise create [start@0, target@currentTime].
      const startD = 'M -50 -50 L 50 -50 L 50 50 L -50 50 Z';
      const existing = l.pathKeyframes || [];
      const seeded = existing.length > 0 ? existing : [{ time: 0, d: startD }];
      // Replace any kf at currentTime, else append.
      const filtered = seeded.filter(k => k.time !== currentTime);
      const next = [...filtered, { time: currentTime, d: targetD }].sort((a, b) => a.time - b.time);
      return { ...l, pathKeyframes: next };
    }));
  }, [selectedLayerId, currentTime]);

  // ===== CANVAS TRANSFORM GIZMO =====
  const canvasToLocal = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = canvasSize.width / rect.width;
    return { x: (clientX - rect.left) * scaleRatio, y: (clientY - rect.top) * scaleRatio };
  }, [canvasSize.width]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = canvasToLocal(e.clientX, e.clientY);
    // Hit-test layers from top (first in array) to bottom
    for (const layer of layers.filter(l => l.visible && !l.locked)) {
      const t = layer.transform;
      const halfW = 50 * (t.scaleX / 100);
      const halfH = 50 * (t.scaleY / 100);
      if (pt.x >= t.x - halfW && pt.x <= t.x + halfW && pt.y >= t.y - halfH && pt.y <= t.y + halfH) {
        setSelectedLayerId(layer.id);
        gizmoDragRef.current = { startX: e.clientX, startY: e.clientY, origTransform: { ...layer.transform } };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }
  }, [layers, canvasToLocal]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!gizmoDragRef.current || !selectedLayerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = canvasSize.width / rect.width;
    const dx = (e.clientX - gizmoDragRef.current.startX) * scaleRatio;
    const dy = (e.clientY - gizmoDragRef.current.startY) * scaleRatio;
    const orig = gizmoDragRef.current.origTransform;
    if (activeTool === 'pointer' || activeTool === 'move') {
      updateLayerTransform({ x: orig.x + dx, y: orig.y + dy });
    } else if (activeTool === 'scale') {
      const factor = 1 + dx / 200;
      updateLayerTransform({ scaleX: Math.max(1, orig.scaleX * factor), scaleY: Math.max(1, orig.scaleY * factor) });
    } else if (activeTool === 'rotate') {
      updateLayerTransform({ rotationZ: orig.rotationZ + dx * 0.5 });
    }
  }, [selectedLayerId, canvasSize.width, activeTool, updateLayerTransform]);

  const handleCanvasPointerUp = useCallback(() => {
    gizmoDragRef.current = null;
  }, []);

  // ===== KEYFRAME SYSTEM =====
  const addKeyframeAtTime = useCallback((property: string) => {
    if (!selectedLayerId) return;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;
    const value = (layer.transform as any)[property] ?? 0;
    setLayers(prev => prev.map(l => {
      if (l.id !== selectedLayerId) return l;
      const anims = [...(l.animations || [])];
      let anim = anims.find(a => a.property === property);
      if (!anim) { anim = { property, keyframes: [] }; anims.push(anim); }
      const existing = anim.keyframes.findIndex(k => k.time === currentTime);
      if (existing >= 0) { anim.keyframes[existing] = { ...anim.keyframes[existing], value }; }
      else { anim.keyframes.push({ time: currentTime, value, easing: 'easeInOut' }); anim.keyframes.sort((a, b) => a.time - b.time); }
      return { ...l, animations: anims };
    }));
  }, [selectedLayerId, layers, currentTime]);

  const deleteKeyframeAtTime = useCallback((property: string) => {
    if (!selectedLayerId) return;
    setLayers(prev => prev.map(l => {
      if (l.id !== selectedLayerId) return l;
      const anims = (l.animations || []).map(a => a.property === property ? { ...a, keyframes: a.keyframes.filter(k => k.time !== currentTime) } : a).filter(a => a.keyframes.length > 0);
      return { ...l, animations: anims };
    }));
  }, [selectedLayerId, currentTime]);

  // ROADMAP-600 #095/#269 — real local handlers for the NL command bar. Motion
  // preset writes actual keyframes (range-safe: ends at the layer's own values);
  // synthesis/sim ops (text→motion, auto-rig, physics, lip-sync) honestly skip.
  const handleFluxOp = useCallback((op: CreativeOp): OpApplyResult | Promise<OpApplyResult> => {
    if (op.op === 'suggestAnimation') {
      return { outcome: 'applied', note: 'Suggestion: a fade + rise-in (opacity 0→full, y −30→0) over ~0.5s with ease-out. Run “apply a motion preset” to add it.' };
    }
    if (op.op === 'applyMotionPreset') {
      const layer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : undefined;
      if (!layer) return { outcome: 'skipped', note: 'select a layer first' };
      const t = layer.transform as unknown as Record<string, number>;
      const endY = t.y ?? 0;
      const endOpacity = t.opacity ?? 100;
      const dur = Math.max(1, Math.round(fps * 0.5));
      setLayers(prev => prev.map(l => {
        if (l.id !== selectedLayerId) return l;
        const anims = (l.animations || []).filter(a => a.property !== 'y' && a.property !== 'opacity');
        anims.push({ property: 'opacity', keyframes: [{ time: 0, value: 0, easing: 'easeOut' }, { time: dur, value: endOpacity, easing: 'easeOut' }] });
        anims.push({ property: 'y', keyframes: [{ time: 0, value: endY - 30, easing: 'easeOut' }, { time: dur, value: endY, easing: 'easeOut' }] });
        return { ...l, animations: anims };
      }));
      setIsDirty(true);
      return { outcome: 'applied', note: `added a fade + rise-in motion preset (~0.5s ease-out, ${dur} frames)` };
    }
    return enginePendingApplier('Flux')(op);
  }, [selectedLayerId, layers, fps]);

  const getAnimatedValue = useCallback((layer: Layer, property: string, time: number): number | undefined => {
    const anim = (layer.animations || []).find(a => a.property === property);
    if (!anim || anim.keyframes.length === 0) return undefined;
    if (anim.keyframes.length === 1) return anim.keyframes[0].value;
    if (time <= anim.keyframes[0].time) return anim.keyframes[0].value;
    const last = anim.keyframes[anim.keyframes.length - 1];
    if (time >= last.time) return last.value;
    for (let i = 0; i < anim.keyframes.length - 1; i++) {
      const k0 = anim.keyframes[i], k1 = anim.keyframes[i + 1];
      if (time >= k0.time && time <= k1.time) {
        const progress = (time - k0.time) / (k1.time - k0.time);
        const easedProgress = layer.easing
          ? applyEasing(progress, layer.easing)
          : progress;
        return fluxInterpolate(k0.value, k1.value, easedProgress, k1.easing);
      }
    }
    return undefined;
  }, []);


  // ===== RESTORE HISTORY =====
  const restoreHistory = useCallback((index: number) => {
    const entry = history[index];
    if (!entry) return;
    isRestoringRef.current = true;
    setLayers(entry.layers);
    if (entry.layers.length > 0) setSelectedLayerId(entry.layers[0].id);
  }, [history]);

  // ===== SAVE PROJECT =====
  const saveProject = useCallback(() => {
    const projectData = {
      version: 1,
      appId: 'flux',
      layers: layers.map(l => ({
        ...l,
        content: typeof l.content === 'string' ? l.content : undefined,
      })),
      settings: { fps, duration, canvasSize, is3DMode },
      timestamp: Date.now(),
    };
    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flux-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [layers, fps, duration, canvasSize, is3DMode]);

  // ===== OPEN PROJECT =====
  const openProject = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.appId !== 'flux') {
          console.warn('[Flux] Not a Flux project file');
          return;
        }
        if (data.layers) setLayers(data.layers);
        if (data.settings) {
          if (data.settings.fps) setFps(data.settings.fps);
          if (data.settings.duration) setDuration(data.settings.duration);
          if (data.settings.canvasSize) setCanvasSize(data.settings.canvasSize);
          if (data.settings.is3DMode !== undefined) setIs3DModeGated(data.settings.is3DMode);
        }
        if (data.layers?.length > 0) setSelectedLayerId(data.layers[0].id);
      } catch (err) {
        console.error('[Flux] Failed to open project:', err);
      }
    };
    input.click();
  }, []);

  // ===== EXPORT VIDEO =====
  const exportVideo = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stream = (canvas as any).captureStream(fps) as MediaStream;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flux-video-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      // Record engagement
      const eng = loadEngagement();
      saveEngagement(checkAchievements(incrementStat(eng, 'animationsCreated')).state);
    };

    // Store ref so the animation loop stops recording when done
    mediaRecorderRef.current = recorder;

    // Reset to start, begin recording, then play
    setCurrentTime(0);
    setPlayheadPosition(0);
    // Small delay to let state flush before recording
    requestAnimationFrame(() => {
      recorder.start();
      setIsPlaying(true);
    });
  }, [fps]);

  // ===== FILE IMPORT =====
  const importMedia = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/svg+xml,video/mp4,video/webm,video/mov,video/avi';
    input.multiple = true;
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => {
            const newLayer: Layer = {
              id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name.replace(/\.[^/.]+$/, ''),
              type: 'image',
              visible: true,
              locked: false,
              solo: false,
              startTime: currentTime,
              duration: 150,
              inPoint: currentTime,
              outPoint: currentTime + 150,
              transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
              behaviors: [],
              filters: [],
              content: img,
            };
            setLayers(prev => [newLayer, ...prev]);
            setSelectedLayerId(newLayer.id);
          };
          img.src = URL.createObjectURL(file);
        } else if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.onloadedmetadata = () => {
            const videoDurationFrames = Math.ceil(video.duration * fps);
            const newLayer: Layer = {
              id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name.replace(/\.[^/.]+$/, ''),
              type: 'video',
              visible: true,
              locked: false,
              solo: false,
              startTime: currentTime,
              duration: videoDurationFrames,
              inPoint: currentTime,
              outPoint: currentTime + videoDurationFrames,
              transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
              behaviors: [],
              filters: [],
              content: video,
            };
            setLayers(prev => [newLayer, ...prev]);
            setSelectedLayerId(newLayer.id);
            // Update project duration if video is longer
            if (currentTime + videoDurationFrames > duration) {
              setDuration(currentTime + videoDurationFrames);
            }
          };
          video.src = URL.createObjectURL(file);
          video.load();
        }
      }
    };
    
    input.click();
  }, [currentTime, canvasSize, fps, duration]);

  // ===== EXPORT PROJECT =====
  const exportProject = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Export current frame as high-quality image
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flux-export-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'animationsCreated', amount: 1 } }));
    }, 'image/png', 1.0);
  }, []);

  // Drag & drop file import onto canvas
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOverCanvas = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);
  const handleDragLeaveCanvas = useCallback(() => setIsDragOver(false), []);
  const handleDropCanvas = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const newLayer: Layer = {
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            type: 'image',
            visible: true,
            locked: false,
            solo: false,
            startTime: currentTime,
            duration: 150,
            inPoint: currentTime,
            outPoint: currentTime + 150,
            transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
            behaviors: [],
            filters: [],
            content: img,
          };
          setLayers(prev => [newLayer, ...prev]);
          setSelectedLayerId(newLayer.id);
        };
        img.src = URL.createObjectURL(file);
      }
    }
  }, [currentTime, canvasSize]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // ===== STYLES - MINIMAL =====
  const styles: Record<string, React.CSSProperties> = useMemo(() => ({
    container: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', position: 'relative' as const, transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease', contain: 'layout style' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', height: '32px', minHeight: '32px', flexShrink: 0, position: 'relative' as const, zIndex: 100, overflow: 'visible' },
    logo: { fontSize: '12px', fontWeight: 700, color: '#bf5af2', letterSpacing: '-0.2px' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'visible', flexWrap: 'nowrap', maxHeight: 38, justifyContent: 'flex-start', scrollbarWidth: 'thin' },
    btn: { padding: '4px 8px', background: 'none', border: 'none', borderRadius: '8px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
    btnPrimary: { background: '#bf5af2', color: '#fff', border: '1px solid #bf5af2', borderRadius: '8px' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    toolbar: { width: '44px', flexShrink: 0, background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '8px 4px', gap: '4px' },
    toolBtn: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '8px', color: 'var(--color-text-muted)', cursor: 'pointer' },
    toolBtnActive: { background: '#bf5af2', color: '#fff', boxShadow: '0 0 0 2px rgba(191,90,242,0.35)' },
    mainArea: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    canvasArea: { flex: 1, display: 'flex', overflow: 'hidden' },
    canvasContainer: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-inset)', position: 'relative' },
    canvas: { background: '#000', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: '2px' },
    sidebar: { width: '220px', flexShrink: 0, background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
    tab: { flex: 1, padding: '8px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' },
    tabActive: { color: '#bf5af2', borderBottom: '2px solid #bf5af2' },
    panelContent: { flex: 1, padding: '10px', overflow: 'auto', scrollbarWidth: 'thin' } as any,
    timeline: { height: showTimeline ? '200px' : '32px', flexShrink: 0, background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', transition: 'height 0.2s ease' },
    timelineHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)' },
    transportControls: { display: 'flex', alignItems: 'center', gap: '4px' },
    transportBtn: { width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text-primary)', cursor: 'pointer' },
    timeDisplay: { fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 8px', background: 'var(--color-bg-inset)', borderRadius: '8px', color: '#bf5af2', border: '1px solid var(--color-border-subtle)', fontWeight: 600 },
    timelineTracks: { flex: 1, display: 'flex', overflow: 'hidden' },
    layerList: { width: '170px', background: 'var(--color-bg-inset)', borderRight: '1px solid var(--color-border-subtle)', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin' } as any,
    layerItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' },
    layerItemSelected: { background: 'rgba(191,90,242,0.1)', borderLeft: '2px solid #bf5af2' },
    layerIcon: { width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' },
    layerName: { flex: 1, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 },
    trackArea: { flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--color-bg-inset)' },
    track: { height: '28px', position: 'relative', borderBottom: '1px solid var(--color-border-subtle)' },
    trackClip: { position: 'absolute', top: '3px', height: '22px', background: '#bf5af2', borderRadius: '6px', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '11px', cursor: 'grab', fontWeight: 600, color: '#fff' },
    playhead: { position: 'absolute', top: 0, width: '1px', background: 'var(--color-error)', zIndex: 50 },
    ruler: { height: '20px', background: 'var(--color-bg-inset)', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'flex-end' },
    behaviorItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-bg-hover)', borderRadius: '10px', marginBottom: '6px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px' },
    statusBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '0 12px', height: 24, background: 'linear-gradient(180deg, #1e1e22 0%, #1a1a1c 100%)', borderTop: '1px solid var(--color-border-subtle)', fontSize: '11px', color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--color-bg-hover)', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', border: '1px solid var(--color-border-subtle)', fontWeight: 600 },
    libraryGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' },
    libraryItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', background: 'var(--color-bg-hover)', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    sliderRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
    sliderLabel: { width: '70px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600 },
    slider: { flex: 1, accentColor: '#bf5af2' },
    sliderValue: { width: '36px', fontSize: '11px', textAlign: 'right', color: '#bf5af2', fontFamily: 'var(--font-mono)', fontWeight: 600 },
  }), [showTimeline]);

  return (
    <div style={styles.container} {...dropProps} onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}>
      {dropOverlayStyle && <div style={dropOverlayStyle}>Drop assets to import</div>}
      {/* ROADMAP-600 #095 — natural-language command bar */}
      <div style={{ padding: 8, flex: '0 0 auto' }}>
        <CreativeCommandBar
          appId="flux"
          facts={{ layerId: selectedLayerId ?? undefined }}
          onApplyOp={handleFluxOp}
          examples={['animate this layer', 'apply a motion preset', 'add physics', 'rig this character']}
          placeholder="Tell Flux what to animate…"
        />
      </div>
      <style>{`
        /* === FLUX - PROFESSIONAL UI === */
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        .flux-ctx-item:hover { background: rgba(191,90,242,0.15) !important; }
        .flux-ctx-item:active { background: rgba(191,90,242,0.25) !important; }
        .flux-btn-primary:hover { background: #c96ef5 !important; }
        .flux-layer-item:hover { background: rgba(191,90,242,0.06) !important; border-color: rgba(191,90,242,0.2) !important; }
        .flux-tool-btn:hover { background: rgba(191,90,242,0.1) !important; color: #bf5af2 !important; }
        .flux-behavior-item:hover { border-color: rgba(191,90,242,0.2) !important; background: rgba(191,90,242,0.04) !important; }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; 
          background: #bf5af2; cursor: pointer; margin-top: -4px; border: none;
        }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(191,90,242,0.15); border-radius: 2px; }
        .flux-tab:hover { color: #bf5af2 !important; background: rgba(191,90,242,0.04) !important; }
        .flux-transport-btn:hover { background: rgba(191,90,242,0.12) !important; border-color: rgba(191,90,242,0.2) !important; }
        .flux-dropdown-item { transition: background 0.12s ease; }
        .flux-dropdown-item:hover { background: rgba(191,90,242,0.12) !important; }
        .flux-dropdown-item:active { background: rgba(191,90,242,0.2) !important; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={styles.logo}>FLUX</div>
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          <button style={styles.btn} onClick={importMedia} aria-label="Import media">{Icons.upload} Import</button>
          <button style={styles.btn} onClick={openProject} aria-label="Open project">{Icons.folder} Open</button>
          <button style={styles.btn} onClick={saveProject} aria-label="Save project">{Icons.save} Save</button>
        </div>
        <div style={styles.headerCenter}>
          <select
            style={{ fontSize: '11px', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', outline: 'none' }}
            value=""
            onChange={(e) => {
              const preset = COMPOSITION_PRESETS.find(p => p.name === e.target.value);
              if (preset) { setCanvasSize({ width: preset.width, height: preset.height }); setFps(preset.frameRate); }
            }}
          >
            <option value="" disabled>{canvasSize.width} x {canvasSize.height}</option>
            {COMPOSITION_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name} ({p.width} x {p.height})</option>
            ))}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fps} fps</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={exportVideo} aria-label="Export project">{Icons.download} Export</button>
          <SendToMenu sourceApp="flux" assetKind="video" getAsset={() => {
            const canvas = canvasRef.current;
            const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
            return { name: 'Flux Composition.png', data: dataUrl, mimeType: 'image/png', metadata: { fps, width: canvasSize.width, height: canvasSize.height } };
          }} />
          {collab.showShareButton && (
            <button
              style={collabButtonStyles.collabButton}
              onClick={collab.openShareDialog}
              title="Share & Collaborate"
            >
              {collab.activeCollaboratorCount > 0 ? `${collab.activeCollaboratorCount} collaborators` : 'Share'}
            </button>
          )}
          <div style={{ width: 1, height: 18, background: 'var(--color-border-subtle)' }} />
          <div style={{ position: 'relative', flexShrink: 0 }} onMouseLeave={() => setShowFeaturesMenu(false)}>
            <button aria-label="Features menu" onClick={(e) => { e.stopPropagation(); setShowFeaturesMenu(v => !v); }} style={{ background: showFeaturesMenu ? 'rgba(191,90,242,0.1)' : 'transparent', border: 'none', fontSize: '11px', color: showFeaturesMenu ? '#bf5af2' : '#86868b', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>Features <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4"/></svg></button>
            {showFeaturesMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', minWidth: '220px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(420px, calc(100vh - 72px))', overflow: 'auto', background: 'var(--color-bg-surface-solid, #2C2C2E)', border: '1px solid var(--color-border)', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 0.5px var(--color-bg-hover)', zIndex: 'var(--z-modal)', padding: '6px' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '6px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>ANIMATION</div>
                {[
                  { label: 'Text Animator', active: showTextAnimator, fn: () => setShowTextAnimator(v => !v) },
                  { label: 'Graph Editor', active: showGraphEditor, fn: () => setShowGraphEditor(v => !v) },
                  { label: 'Expressions', active: showExpressionEditor, fn: () => setShowExpressionEditor(v => !v) },
                  { label: 'Time Remap', active: showTimeRemap, fn: () => setShowTimeRemap(v => !v) },
                  { label: 'Morph Shapes', active: showMorphShapes, fn: () => setShowMorphShapes(v => !v) },
                  { label: 'Wiggle', active: showAutoWiggle, fn: () => setShowAutoWiggle(v => !v) },
                  { label: 'Stagger', active: showStagger, fn: () => setShowStagger(v => !v) },
                  { label: 'Motion Path', active: showMotionPath, fn: () => setShowMotionPath(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>COMPOSITION</div>
                {[
                  { label: 'Null Objects', active: showNullObjects, fn: () => setShowNullObjects(v => !v) },
                  { label: 'Precompose', active: showPrecompose, fn: () => setShowPrecompose(v => !v) },
                  { label: 'Track Mattes', active: showTrackMattes, fn: () => setShowTrackMattes(v => !v) },
                  { label: 'FX Stack', active: showEffectsStack, fn: () => setShowEffectsStack(v => !v) },
                  { label: 'Masks', active: showMaskSystem, fn: () => setShowMaskSystem(v => !v) },
                  { label: 'Trim Paths', active: showTrimPaths, fn: () => setShowTrimPaths(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>RENDERING</div>
                {[
                  { label: 'Particles+', active: showAdvancedParticles, fn: () => setShowAdvancedParticles(v => !v) },
                  { label: 'Camera Rig', active: showCameraRig, fn: () => setShowCameraRig(v => !v) },
                  { label: 'Environment Map', active: showEnvironment, fn: () => setShowEnvironment(v => !v) },
                  { label: '3D Text', active: show3DText, fn: () => setShow3DText(v => !v) },
                  { label: 'Shaders', active: showShaderEffects, fn: () => setShowShaderEffects(v => !v) },
                  { label: 'Frame Blending', active: showFrameBlending, fn: () => setShowFrameBlending(v => !v) },
                  { label: 'Motion Blur', active: showMotionBlur, fn: () => setShowMotionBlur(v => !v) },
                  { label: 'Color Correction', active: showColorCorrection, fn: () => setShowColorCorrection(v => !v) },
                  { label: 'Stroke Effects', active: showStrokeEffects, fn: () => setShowStrokeEffects(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EFFECTS</div>
                {[
                  { label: 'Audio Reactive', active: showAudioReactive, fn: () => setShowAudioReactive(v => !v) },
                  { label: 'Repeater', active: showRepeater, fn: () => setShowRepeater(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>LAYOUT</div>
                {[
                  { label: 'Alignment', active: showAlignment, fn: () => setShowAlignment(v => !v) },
                  { label: 'Guides', active: showGuideLayer, fn: () => setShowGuideLayer(v => !v) },
                  { label: 'Markers', active: showMarkers, fn: () => setShowMarkers(v => !v) },
                  { label: 'Snapshot', active: showSnapshot, fn: () => setShowSnapshot(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
                <div style={{ height: '1px', background: 'var(--color-bg-hover)', margin: '4px 8px' }} />
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.8px' }}>EXPORT</div>
                {[
                  { label: 'GIF Export', active: showGifExport, fn: () => setShowGifExport(v => !v) },
                  { label: 'Lottie Export', active: showLottieExport, fn: () => setShowLottieExport(v => !v) },
                  { label: 'Templates', active: showCompTemplates, fn: () => setShowCompTemplates(v => !v) },
                  { label: 'Render Queue', active: showRenderQueue, fn: () => setShowRenderQueue(v => !v) },
                  { label: 'Export Presets', active: showExportPresets, fn: () => setShowExportPresets(v => !v) },
                ].map(item => (
                  <div key={item.label} className="flux-dropdown-item" style={{ padding: '6px 12px', fontSize: '11px', color: item.active ? '#bf5af2' : 'var(--color-text-primary)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => { item.fn(); setShowFeaturesMenu(false); }}>{item.label}{item.active && <span style={{ fontSize: '11px', color: '#bf5af2' }}>ON</span>}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Toolbar */}
        <div style={styles.toolbar} ref={toolGroupRef}>
          {toolGroups.map(group => {
            const currentToolId = selectedInGroup[group.id] || group.tools[0];
            const currentTool = tools.find(tool => tool.id === currentToolId);
            const isGroupActive = group.tools.includes(activeTool);
            const isOpen = openToolGroup === group.id;
            const hasMultiple = group.tools.length > 1;

            return (
              <div key={group.id} style={{ position: 'relative' }}>
                <button
                  style={{
                    ...styles.toolBtn,
                    ...(isGroupActive ? styles.toolBtnActive : {}),
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (hasMultiple && isOpen) {
                      setOpenToolGroup(null);
                    } else if (hasMultiple) {
                      setOpenToolGroup(group.id);
                    }
                    setActiveTool(currentToolId);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (hasMultiple) setOpenToolGroup(isOpen ? null : group.id);
                  }}
                  title={currentTool ? (currentTool.key ? `${currentTool.name} (${currentTool.key})` : currentTool.name) : group.label}
                  aria-label={currentTool?.name || group.label}
                  aria-haspopup={hasMultiple ? 'true' : undefined}
                  aria-expanded={isOpen ? 'true' : undefined}
                >
                  {currentTool?.icon}
                  {hasMultiple && (
                    <span style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 0,
                      height: 0,
                      borderLeft: '3px solid transparent',
                      borderRight: '3px solid transparent',
                      borderTop: '4px solid currentColor',
                      opacity: 0.6,
                    }} />
                  )}
                </button>
                {isOpen && hasMultiple && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      marginLeft: 4,
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      padding: 4,
                      boxShadow: 'var(--pg-shadow-context)',
                      zIndex: 'var(--z-modal)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      minWidth: 128,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', padding: '2px 6px', letterSpacing: '0.5px' }}>
                      {group.label.toUpperCase()}
                    </div>
                    {group.tools.map(toolId => {
                      const tool = tools.find(candidate => candidate.id === toolId);
                      if (!tool) return null;
                      return (
                        <button
                          key={toolId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            background: activeTool === toolId ? 'rgba(255,55,95,0.15)' : 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            color: activeTool === toolId ? '#ff375f' : 'var(--color-text-primary)',
                            cursor: 'pointer',
                            fontSize: 11,
                            textAlign: 'left',
                            width: '100%',
                          }}
                          onClick={() => {
                            setActiveTool(toolId);
                            setSelectedInGroup(prev => ({ ...prev, [group.id]: toolId }));
                            setOpenToolGroup(null);
                          }}
                        >
                          <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {tool.icon}
                          </span>
                          <span>{tool.name}</span>
                          {tool.key && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {tool.key}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Main Canvas Area */}
        <div style={styles.mainArea}>
          <div data-testid="flux-viewer" style={styles.canvasArea}
            onDragOver={handleDragOverCanvas}
            onDragLeave={handleDragLeaveCanvas}
            onDrop={handleDropCanvas}
            onWheel={(e) => {
              // Allow zoom with Ctrl/Cmd OR with zoom tool active
              if (e.ctrlKey || e.metaKey || activeTool === 'zoom') {
                e.preventDefault();
                // Normalized delta for trackpad vs mouse wheel
                const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
                const factor = 1 + Math.abs(delta) * 0.003;
                setViewScale(s => delta < 0 ? Math.min(200, s * factor) : Math.max(10, s / factor));
              }
            }}
          >
            <div style={styles.canvasContainer}>
              {initError && (
                <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 60, background: 'rgba(255,159,10,0.15)', border: '1px solid rgba(255,159,10,0.35)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>{initError}</span>
                  <button onClick={() => setInitError(null)} aria-label="Dismiss error" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warning)', fontSize: 16, lineHeight: 1 }}><DexIcon name="close" size={14} /></button>
                </div>
              )}
              {isDragOver && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(191,90,242,0.1)', border: '2px dashed rgba(191,90,242,0.5)', borderRadius: '8px', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ color: '#bf5af2', fontSize: '14px', fontWeight: 600 }}>Drop media here</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                style={{ ...styles.canvas, transform: `scale(${viewScale / 100})`, cursor: activeTool === 'move' ? 'grab' : activeTool === 'rotate' ? 'crosshair' : 'default', touchAction: 'none' }}
              />
              {canvasError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', gap: 12 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 260 }}>Canvas unavailable. Try restarting DEX or updating your graphics driver.</span>
                </div>
              )}
              {/* Overlay UI - Canvas Zoom Controls */}
              <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.75)', borderRadius: '10px', padding: '6px 12px' }}>
                <button style={{ ...styles.btn, padding: '4px 8px' }} onClick={() => setViewScale(Math.max(10, viewScale - 10))} title="Zoom Out" aria-label="Zoom out"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
                <input 
                  type="range" 
                  min="10" 
                  max="200" 
                  value={viewScale} 
                  onChange={(e) => setViewScale(Number(e.target.value))} 
                  style={{ width: '100px', accentColor: '#bf5af2', cursor: 'pointer' }} 
                  title={`Canvas scale: ${Math.round(viewScale)}%`}
                />
                <button style={{ ...styles.btn, padding: '4px 8px' }} onClick={() => setViewScale(Math.min(200, viewScale + 10))} title="Zoom In" aria-label="Zoom in"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
                <span style={{ padding: '4px 8px', background: 'var(--color-border-subtle)', borderRadius: '6px', fontSize: '11px', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>{Math.round(viewScale)}%</span>
                <button style={{ ...styles.btn, padding: '4px 8px' }} onClick={() => setViewScale(50)} title="Reset to 50%" aria-label="Fit to view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg></button>
              </div>
            </div>

            {/* Sidebar */}
            <div style={styles.sidebar}>
              <div style={styles.tabs}>
                <button style={{ ...styles.tab, ...(activeTab === 'library' ? styles.tabActive : {}) }} onClick={() => setActiveTab('library')} aria-label="Library tab">
                  Library
                </button>
                <button style={{ ...styles.tab, ...(activeTab === 'presets' ? styles.tabActive : {}) }} onClick={() => setActiveTab('presets')} aria-label="Presets tab">
                  Presets
                </button>
{!beginnerMode && <button style={{ ...styles.tab, ...(activeTab === 'behaviors' ? styles.tabActive : {}) }} onClick={() => setActiveTab('behaviors')} aria-label="Behaviors tab">
                  Behaviors
                </button>}
                <button style={{ ...styles.tab, ...(activeTab === 'inspector' ? styles.tabActive : {}) }} onClick={() => setActiveTab('inspector')} aria-label="Inspector tab">
                  Inspector
                </button>
                <button style={{ ...styles.tab, ...(activeTab === 'history' ? styles.tabActive : {}) }} onClick={() => setActiveTab('history')} aria-label="History tab">
                  History
                </button>
              </div>

              <div data-testid="flux-effects" style={styles.panelContent}>
                {/* Presets Panel */}
                {activeTab === 'presets' && (
                  <div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                      {(['animations', 'effects', 'particles', 'easings'] as const).map(cat => (
                        <button key={cat} onClick={() => setPresetCategory(cat)} aria-label={`${cat} presets`} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: 'none', background: presetCategory === cat ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: presetCategory === cat ? 'white' : 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{cat}</button>
                      ))}
                    </div>
                    
                    {presetCategory === 'animations' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Intro</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'intro').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Outro</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'outro').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Emphasis</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'emphasis').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Loop</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'loop').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.loop}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {presetCategory === 'effects' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Glow</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'glow').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.sparkle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Blur</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'blur').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.filter}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Color</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'color').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.sliders}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Other</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'distort' || p.category === 'stylize').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.wand}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {presetCategory === 'particles' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Nature</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'nature').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => { const l = addLayer('particle'); setLayers(prev => prev.map(ly => ly.id === l ? { ...ly, particleEmitter: { ...preset.emitter } } : ly)); }}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Energy</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'energy').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => { const l = addLayer('particle'); setLayers(prev => prev.map(ly => ly.id === l ? { ...ly, particleEmitter: { ...preset.emitter } } : ly)); }}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Celebration</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'celebration').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => { const l = addLayer('particle'); setLayers(prev => prev.map(ly => ly.id === l ? { ...ly, particleEmitter: { ...preset.emitter } } : ly)); }}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Abstract</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'abstract').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => { const l = addLayer('particle'); setLayers(prev => prev.map(ly => ly.id === l ? { ...ly, particleEmitter: { ...preset.emitter } } : ly)); }}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {presetCategory === 'easings' && (
                      <>
                        {(['basic', 'power', 'elastic', 'bounce', 'back', 'custom'] as const).map(cat => {
                          const items = EASING_PRESETS.filter(p => p.category === cat);
                          if (!items.length) return null;
                          return (
                            <React.Fragment key={cat}>
                              <div style={{ marginTop: cat !== 'basic' ? '12px' : '0', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{cat}</div>
                              {items.map(preset => (
                                <div key={preset.id} style={{ ...styles.behaviorItem, flexDirection: 'column' as const, alignItems: 'flex-start', gap: '4px' }}>
                                  <span style={{ fontSize: '11px' }}>{preset.name}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>cubic-bezier({preset.bezier.join(', ')})</span>
                                </div>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* Library Panel */}
                {activeTab === 'library' && (
                  <div style={styles.libraryGrid}>
                    <div style={styles.libraryItem} onClick={importMedia}>
                      <div style={{ color: 'var(--color-success)', marginBottom: '4px' }}>{Icons.image}</div>
                      <span style={{ fontSize: '11px' }}>Image</span>
                    </div>
                    <div style={styles.libraryItem} onClick={importMedia}>
                      <div style={{ color: '#ff375f', marginBottom: '4px' }}>{Icons.video}</div>
                      <span style={{ fontSize: '11px' }}>Video</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('text')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.text}</div>
                      <span style={{ fontSize: '11px' }}>Text</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('shape')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.shape}</div>
                      <span style={{ fontSize: '11px' }}>Shape</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('particle')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.particle}</div>
                      <span style={{ fontSize: '11px' }}>Particles</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('generator')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.grid}</div>
                      <span style={{ fontSize: '11px' }}>Generator</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('camera')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.camera}</div>
                      <span style={{ fontSize: '11px' }}>Camera</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('light')}>
                      <div style={{ color: 'var(--color-accent)', marginBottom: '4px' }}>{Icons.light}</div>
                      <span style={{ fontSize: '11px' }}>Light</span>
                    </div>
                  </div>
                )}

                {/* Behaviors Panel */}
                {activeTab === 'behaviors' && (
                  <div>
                    <div style={{ marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Basic Behaviors</div>
                    {BEHAVIOR_TYPES.filter(b => b.category === 'basic').map(behavior => (
                      <div
                        key={behavior.id}
                        style={styles.behaviorItem}
                        onClick={() => selectedLayerId && addBehavior(selectedLayerId, behavior.id)}
                      >
                        {Icons.wand}
                        <span style={{ fontSize: '11px' }}>{behavior.name}</span>
                      </div>
                    ))}
                    
                    <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Motion</div>
                    {BEHAVIOR_TYPES.filter(b => b.category === 'motion').map(behavior => (
                      <div
                        key={behavior.id}
                        style={styles.behaviorItem}
                        onClick={() => selectedLayerId && addBehavior(selectedLayerId, behavior.id)}
                      >
                        {Icons.wand}
                        <span style={{ fontSize: '11px' }}>{behavior.name}</span>
                      </div>
                    ))}
                    
                    <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Simulation</div>
                    {BEHAVIOR_TYPES.filter(b => b.category === 'simulation').map(behavior => (
                      <div
                        key={behavior.id}
                        style={styles.behaviorItem}
                        onClick={() => selectedLayerId && addBehavior(selectedLayerId, behavior.id)}
                      >
                        {Icons.wand}
                        <span style={{ fontSize: '11px' }}>{behavior.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inspector Panel */}
                {activeTab === 'inspector' && selectedLayer && (
                  <div>
                    <div style={{ marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Transform</div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Position X</span>
                      <input type="range" min="0" max={canvasSize.width} value={selectedLayer.transform.x} style={styles.slider} onChange={(e) => updateLayerTransform({ x: Number(e.target.value) })} />
                      <span style={styles.sliderValue}>{Math.round(selectedLayer.transform.x)}</span>
                    </div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Position Y</span>
                      <input type="range" min="0" max={canvasSize.height} value={selectedLayer.transform.y} style={styles.slider} onChange={(e) => updateLayerTransform({ y: Number(e.target.value) })} />
                      <span style={styles.sliderValue}>{Math.round(selectedLayer.transform.y)}</span>
                    </div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Scale</span>
                      <input type="range" min="0" max="400" value={selectedLayer.transform.scaleX} style={styles.slider} onChange={(e) => { const v = Number(e.target.value); updateLayerTransform({ scaleX: v, scaleY: v }); }} />
                      <span style={styles.sliderValue}>{selectedLayer.transform.scaleX}%</span>
                    </div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Rotation</span>
                      <input type="range" min="-180" max="180" value={selectedLayer.transform.rotationZ} style={styles.slider} onChange={(e) => updateLayerTransform({ rotationZ: Number(e.target.value) })} />
                      <span style={styles.sliderValue}>{selectedLayer.transform.rotationZ}</span>
                    </div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Opacity</span>
                      <input type="range" min="0" max="100" value={selectedLayer.transform.opacity} style={styles.slider} onChange={(e) => updateLayerTransform({ opacity: Number(e.target.value) })} />
                      <span style={styles.sliderValue}>{selectedLayer.transform.opacity}%</span>
                    </div>
                    
                    {/* Easing curve editor */}
                    <div style={{ marginTop: '16px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Easing</div>
                    <button
                      type="button"
                      style={{ ...styles.behaviorItem, justifyContent: 'space-between', width: '100%' }}
                      onClick={() => setShowEasingPopover(v => !v)}
                      aria-label="Edit easing curve"
                      aria-expanded={showEasingPopover}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>
                        {selectedLayer.easing
                          ? `cubic-bezier(${selectedLayer.easing.p1x.toFixed(2)}, ${selectedLayer.easing.p1y.toFixed(2)}, ${selectedLayer.easing.p2x.toFixed(2)}, ${selectedLayer.easing.p2y.toFixed(2)})`
                          : 'Default (per-keyframe)'}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{showEasingPopover ? Icons.chevronUp : Icons.chevronDown}</span>
                    </button>
                    {showEasingPopover && (
                      <div style={{ padding: '10px', background: 'var(--color-bg-inset)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', marginBottom: '8px' }}>
                        <EasingCurveEditor
                          value={selectedLayer.easing || { p1x: 0.25, p1y: 0.1, p2x: 0.25, p2y: 1 }}
                          onChange={updateLayerEasing}
                        />
                        {selectedLayer.easing && (
                          <button
                            type="button"
                            style={{ ...styles.btn, marginTop: '8px', color: 'var(--color-text-muted)' }}
                            onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, easing: undefined } : l))}
                          >
                            Reset to per-keyframe easing
                          </button>
                        )}
                      </div>
                    )}

                    {/* Shape morph target */}
                    {selectedLayer.type === 'shape' && (
                      <>
                        <div style={{ marginTop: '16px', marginBottom: '8px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Shape Morph</div>
                        <button
                          type="button"
                          style={{ ...styles.behaviorItem, justifyContent: 'space-between', width: '100%' }}
                          onClick={() => { setMorphPathInput(''); setShowMorphModal(true); }}
                          aria-label="Morph shape to target SVG path"
                        >
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>Morph to...</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                            {selectedLayer.pathKeyframes?.length ? `${selectedLayer.pathKeyframes.length} kf` : 'no path keys'}
                          </span>
                        </button>
                        {selectedLayer.pathKeyframes && selectedLayer.pathKeyframes.length > 0 && (
                          <button
                            type="button"
                            style={{ ...styles.btn, color: 'var(--color-text-muted)' }}
                            onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, pathKeyframes: undefined } : l))}
                          >
                            Clear morph keyframes
                          </button>
                        )}
                      </>
                    )}
                    {selectedLayer.behaviors.length > 0 && (
                      <>
                        <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Applied Behaviors</div>
                        {selectedLayer.behaviors.map(b => (
                          <div key={b.id} style={{ ...styles.behaviorItem, background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)' }}>
                            {Icons.wand}
                            <span style={{ flex: 1, fontSize: '11px' }}>{b.type}</span>
                            <button style={styles.iconBtn} onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, behaviors: l.behaviors.filter(bh => bh.id !== b.id) } : l))} aria-label={`Remove ${b.type} behavior`}>{Icons.trash}</button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* History Panel */}
                {activeTab === 'history' && (
                  <div>
                    <div style={{ marginBottom: '12px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>History ({history.length})</div>
                    {history.length === 0 ? (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>No history yet</div>
                    ) : (
                      history.map((entry, index) => (
                        <div
                          key={index}
                          style={{ ...styles.behaviorItem, cursor: 'pointer' }}
                          onClick={() => restoreHistory(index)}
                        >
                          <span style={{ fontSize: '11px', flex: 1 }}>{entry.description}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div data-testid="flux-timeline" style={styles.timeline}>
            <div style={styles.timelineHeader}>
              <button style={styles.iconBtn} onClick={() => setShowTimeline(!showTimeline)} aria-label="Toggle timeline">
                {showTimeline ? Icons.chevronDown : Icons.chevronRight}
              </button>
              <div style={styles.transportControls}>
                <button style={styles.transportBtn} onClick={goToStart} aria-label="Skip to start">{Icons.skipBack}</button>
                <button style={{ ...styles.transportBtn, ...(isPlaying ? { background: 'var(--color-accent)' } : {}) }} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? Icons.pause : Icons.play}
                </button>
                <button style={styles.transportBtn} onClick={goToEnd} aria-label="Skip to end">{Icons.skipForward}</button>
              </div>
              <div style={styles.timeDisplay}>{formatTime(currentTime)}</div>
              <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
              <button style={{ ...styles.iconBtn, color: loopEnabled ? '#bf5af2' : undefined, background: loopEnabled ? 'rgba(191,90,242,0.12)' : undefined }} title={loopEnabled ? 'Loop: On' : 'Loop: Off'} onClick={() => setLoopEnabled(v => !v)} aria-label="Toggle loop">{Icons.loop}</button>
              <button style={styles.iconBtn} title="Add Keyframe" onClick={() => { ['x', 'y', 'scaleX', 'scaleY', 'rotationZ', 'opacity'].forEach(p => addKeyframeAtTime(p)); }} aria-label="Add keyframe">{Icons.keyframe}</button>
              <div style={{ flex: 1 }} />
              {/* Timeline Zoom */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button style={{ ...styles.iconBtn, fontSize: '11px' }} onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} aria-label="Zoom out timeline">-</button>
                <input type="range" min="25" max="400" value={zoom * 100} onChange={(e) => setZoom(Number(e.target.value) / 100)} style={{ width: '80px', accentColor: '#bf5af2' }} title={`Timeline zoom: ${Math.round(zoom * 100)}%`} />
                <button style={{ ...styles.iconBtn, fontSize: '11px' }} onClick={() => setZoom(z => Math.min(4, z + 0.25))} aria-label="Zoom in timeline">+</button>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', minWidth: '32px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              </div>
              <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
              <button style={styles.btn} onClick={() => addLayer('shape')} aria-label="Add layer">{Icons.plus} Add Layer</button>
            </div>

            {showTimeline && (
              <div style={styles.timelineTracks}>
                {/* Layer List */}
                <div style={styles.layerList}>
                  {layers.map(layer => (
                    <div
                      key={layer.id}
                      style={{ ...styles.layerItem, ...(selectedLayerId === layer.id ? styles.layerItemSelected : {}) }}
                      onClick={() => setSelectedLayerId(layer.id)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedLayerId(layer.id); setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, layerId: layer.id }); }}
                    >
                      <button style={styles.iconBtn} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }} aria-label={`Toggle ${layer.name} visibility`}>
                        {layer.visible ? Icons.eye : Icons.eyeOff}
                      </button>
                      <div style={styles.layerIcon}>
                        {layer.type === 'text' ? Icons.text : 
                         layer.type === 'shape' ? Icons.shape : 
                         layer.type === 'particle' ? Icons.particle :
                         layer.type === 'camera' ? Icons.camera :
                         layer.type === 'light' ? Icons.light : Icons.layers}
                      </div>
                      <span style={styles.layerName}>{layer.name}</span>
                    </div>
                  ))}
                </div>

                {/* Track Area */}
                <div style={styles.trackArea} ref={timelineRef}>
                  {/* Ruler - fits to available width */}
                  <div style={{...styles.ruler, display: 'flex'}}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const totalWidth = rect.width;
                      const clickedTime = Math.round((x / totalWidth) * duration);
                      setCurrentTime(Math.max(0, Math.min(duration, clickedTime)));
                    }}
                  >
                    {Array.from({ length: Math.ceil(duration / fps) + 1 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: '4px', cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatTime(i * fps)}
                      </div>
                    ))}
                  </div>
                  
                  {/* Tracks - all fit within container */}
                  {layers.map(layer => (
                    <div key={layer.id} style={styles.track}>
                      <div
                        style={{
                          ...styles.trackClip,
                          left: `${(layer.inPoint / duration) * 100 * zoom}%`,
                          width: `${((layer.outPoint - layer.inPoint) / duration) * 100 * zoom}%`,
                          opacity: selectedLayerId === layer.id ? 1 : 0.7,
                        }}
                      >
                        {layer.name}
                        {/* Keyframe diamonds */}
                        {(layer.animations || []).flatMap(a => a.keyframes).map((kf, ki) => (
                          <div key={ki} onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); }} style={{
                            position: 'absolute',
                            left: `${((kf.time - layer.inPoint) / (layer.outPoint - layer.inPoint)) * 100}%`,
                            top: '50%', transform: 'translate(-50%,-50%) rotate(45deg)',
                            width: 7, height: 7,
                            background: currentTime === kf.time ? 'var(--color-warning)' : 'var(--color-accent)',
                            border: '1px solid var(--color-text-tertiary)',
                            borderRadius: 1, cursor: 'pointer', zIndex: 2,
                          }} title={`Keyframe at frame ${kf.time}`} />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Playhead */}
                  <div style={{ ...styles.playhead, left: `${(currentTime / duration) * 100}%`, height: '100%' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>



      {/* ===== PRO FLOATING PANELS (macOS Tahoe Glass) ===== */}

      {/* Text Animator Panel */}
      {showTextAnimator && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 80, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Text Animator</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTextAnimator(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Animate By</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['character', 'word', 'line'] as const).map(m => (
                <button key={m} onClick={() => setTextAnimMode(m)} aria-label={`Animate by ${m}`} aria-pressed={textAnimMode === m} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: textAnimMode === m ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: textAnimMode === m ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Cascade Delay</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{textAnimCascade}ms</span></div>
            <input type="range" min="0" max="200" value={textAnimCascade} onChange={e => setTextAnimCascade(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Presets</div>
            {['Typewriter', 'Fade Up', 'Scale Pop', 'Rotate In', 'Slide Left', 'Blur Reveal'].map(p => (
              <button key={p} aria-label={`Apply ${p} text animation preset`} onClick={() => {
                if (!selectedLayerId) return;
                const presetMap: Record<string, { property: string; startVal: number; endVal: number }> = {
                  'Typewriter': { property: 'opacity', startVal: 0, endVal: 100 },
                  'Fade Up': { property: 'opacity', startVal: 0, endVal: 100 },
                  'Scale Pop': { property: 'scale', startVal: 0, endVal: 100 },
                  'Rotate In': { property: 'rotation', startVal: -180, endVal: 0 },
                  'Slide Left': { property: 'x', startVal: -200, endVal: 0 },
                  'Blur Reveal': { property: 'opacity', startVal: 0, endVal: 100 },
                };
                const cfg = presetMap[p];
                if (!cfg) return;
                setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                  ...l,
                  textAnimator: { mode: textAnimMode, cascade: textAnimCascade, preset: p },
                  behaviors: [...l.behaviors, { id: `beh-${Date.now()}`, type: 'textAnim' as any, enabled: true, settings: { preset: p, mode: textAnimMode, cascade: textAnimCascade } }],
                } as any : l));
                setShowTextAnimator(false);
              }} style={{ display: 'block', width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 2, textAlign: 'left' }}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {/* Graph Editor Panel */}
      {showGraphEditor && (() => {
        const selLayer = layers.find(l => l.id === selectedLayerId);
        const anim = selLayer?.animations?.find(a => a.property === graphProperty);
        const kfs = anim?.keyframes || [];
        const svgW = 800, svgH = 140;
        const props = ['opacity', 'x', 'y', 'scaleX', 'scaleY', 'rotationZ', 'z', 'scaleZ', 'rotationX', 'rotationY'];
        // Compute value range for mapping
        const vals = kfs.map(k => k.value);
        const minV = vals.length ? Math.min(...vals) : 0;
        const maxV = vals.length ? Math.max(...vals) : 100;
        const rangeV = maxV - minV || 1;
        const pad = rangeV * 0.1;
        const lo = minV - pad, hi = maxV + pad;
        const toX = (t: number) => duration > 0 ? (t / duration) * svgW : 0;
        const toY = (v: number) => svgH - ((v - lo) / (hi - lo)) * svgH;
        // Build SVG path from keyframes
        let curvePath = '';
        if (kfs.length >= 2) {
          curvePath = `M${toX(kfs[0].time)} ${toY(kfs[0].value)}`;
          for (let i = 0; i < kfs.length - 1; i++) {
            const k0 = kfs[i], k1 = kfs[i + 1];
            const x0 = toX(k0.time), y0 = toY(k0.value), x1 = toX(k1.time), y1 = toY(k1.value);
            if (k1.easing === 'linear') { curvePath += ` L${x1} ${y1}`; }
            else {
              const dx = x1 - x0;
              const cp1x = x0 + dx * 0.33, cp1y = y0;
              const cp2x = x1 - dx * 0.33, cp2y = y1;
              curvePath += ` C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x1} ${y1}`;
            }
          }
        }
        const handleKfDrag = (idx: number, e: React.PointerEvent<SVGCircleElement>) => {
          e.preventDefault();
          const svg = (e.target as SVGElement).closest('svg');
          if (!svg) return;
          setDraggingKfIdx(idx);
          const onMove = (me: PointerEvent) => {
            const rect = svg.getBoundingClientRect();
            const relY = Math.max(0, Math.min(1, (me.clientY - rect.top) / rect.height));
            const newVal = hi - relY * (hi - lo);
            setLayers(prev => prev.map(l => {
              if (l.id !== selectedLayerId) return l;
              const anims = (l.animations || []).map(a => {
                if (a.property !== graphProperty) return a;
                const updated = a.keyframes.map((k, ki) => ki === idx ? { ...k, value: Math.round(newVal * 100) / 100 } : k);
                return { ...a, keyframes: updated };
              });
              return { ...l, animations: anims };
            }));
          };
          const onUp = () => { setDraggingKfIdx(null); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        };
        return (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: 60, bottom: 0, right: 0, height: 200, background: 'var(--color-bg-elevated)', borderTop: '1px solid var(--color-border-subtle)', boxShadow: '0 -8px 32px rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Graph Editor</span>
              <select value={graphProperty} onChange={e => setGraphProperty(e.target.value)} aria-label="Graph property" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.3)', color: '#bf5af2', fontSize: 11, fontWeight: 600 }}>
                {props.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {selLayer && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{selLayer.name} — {kfs.length} keyframe{kfs.length !== 1 ? 's' : ''}</span>}
              {kfs.length > 0 && (
                <select aria-label="Apply easing preset" onChange={e => {
                  const presetId = e.target.value;
                  if (!presetId || !selectedLayerId) return;
                  setLayers(prev => prev.map(l => {
                    if (l.id !== selectedLayerId) return l;
                    const anims = (l.animations || []).map(a => {
                      if (a.property !== graphProperty) return a;
                      return { ...a, keyframes: a.keyframes.map(k => ({ ...k, easing: presetId as any })) };
                    });
                    return { ...l, animations: anims };
                  }));
                  e.target.value = '';
                }} style={{ padding: '2px 4px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-success)', fontSize: 11, fontWeight: 600, maxWidth: 100 }}>
                  <option value="">Easing...</option>
                  {(['basic', 'power', 'elastic', 'bounce', 'back', 'custom'] as const).map(cat => (
                    <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                      {EASING_PRESETS.filter(p => p.category === cat).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowGraphEditor(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ height: 'calc(100% - 32px)', position: 'relative', padding: '8px 40px' }}>
            {/* Y-axis labels */}
            <div style={{ position: 'absolute', left: 4, top: 8, bottom: 0, width: 34, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round(hi * 10) / 10}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round(((hi + lo) / 2) * 10) / 10}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round(lo * 10) / 10}</span>
            </div>
            <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
              {[0, 35, 70, 105, 140].map(y => <line key={y} x1="0" y1={y} x2={svgW} y2={y} stroke="#202024" strokeWidth="0.5"/>)}
              {[0, 100, 200, 300, 400, 500, 600, 700, 800].map(x => <line key={x} x1={x} y1="0" x2={x} y2={svgH} stroke="#202024" strokeWidth="0.5"/>)}
              {/* Playhead */}
              <line x1={toX(currentTime)} y1="0" x2={toX(currentTime)} y2={svgH} stroke="#bf5af2" strokeWidth="1" opacity="0.6"/>
              {/* Curve */}
              {curvePath && <path d={curvePath} fill="none" stroke="#bf5af2" strokeWidth="2"/>}
              {/* Keyframe points */}
              {kfs.map((k, i) => (
                <circle key={i} cx={toX(k.time)} cy={toY(k.value)} r={draggingKfIdx === i ? 6 : 4.5} fill={draggingKfIdx === i ? '#fff' : '#bf5af2'} stroke="#fff" strokeWidth={1} style={{ cursor: 'ns-resize' }} onPointerDown={e => handleKfDrag(i, e)} />
              ))}
              {/* No keyframes message */}
              {kfs.length === 0 && <text x={svgW / 2} y={svgH / 2} textAnchor="middle" fill="#505050" fontSize="12">No keyframes for "{graphProperty}"</text>}
            </svg>
          </div>
        </div>
        );
      })()}

      {/* Expression Editor Panel */}
      {showExpressionEditor && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 80, width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Expression Engine</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => { setShowExpressionEditor(false); setExpressionError(null); }} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Target</span>
              <select value={expressionTarget} onChange={e => setExpressionTarget(e.target.value)} aria-label="Expression target property" style={{ flex: 1, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.3)', color: '#bf5af2', fontSize: 11, fontWeight: 600 }}>
                {['opacity', 'x', 'y', 'scaleX', 'scaleY', 'rotationZ', 'z', 'scaleZ', 'rotationX', 'rotationY'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <textarea value={expressionCode} onChange={e => { setExpressionCode(e.target.value); setExpressionError(null); }} placeholder="// Write expressions here&#10;// time, value, index available&#10;Math.sin(time * 2) * 100" style={{ width: '100%', height: 100, padding: 8, borderRadius: 6, border: `1px solid ${expressionError ? 'rgba(255,55,95,0.4)' : 'var(--color-border-subtle)'}`, background: 'rgba(0,0,0,0.3)', color: 'var(--color-success)', fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }} />
            {expressionError && <div style={{ fontSize: 11, color: '#ff375f', marginTop: 4, fontFamily: 'monospace' }}>{expressionError}</div>}
            <button onClick={() => {
              if (!selectedLayerId || !expressionCode.trim()) return;
              try {
                // Validate expression by doing a test evaluation
                const seedRng = (s: number) => () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
                const rng = seedRng(42);
                const testScope = {
                  time: 0, value: 0, index: 0, fps,
                  wiggle: (freq: number, amp: number) => Math.sin(0 * freq * Math.PI * 2) * amp * (rng() * 2 - 1),
                  random: (min: number, max: number) => min + rng() * (max - min),
                  loopOut: () => 0,
                  loopIn: () => 0,
                  clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
                  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
                  noise: (x: number) => (Math.sin(x * 127.1 + 311.7) * 43758.5453) % 1,
                  spring: (t: number, stiffness = 10, damping = 0.7) => 1 - Math.exp(-stiffness * t) * Math.cos(2 * Math.PI * damping * t),
                  valueAtTime: () => 0,
                };
                // Validate expression code — block access to dangerous globals
                const blockedPatterns = /\b(window|document|globalThis|eval|Function|fetch|XMLHttpRequest|import|require|process|__dirname|__filename|localStorage|sessionStorage|indexedDB|navigator|location|setTimeout|setInterval|postMessage|Worker|SharedWorker|ServiceWorker|WebSocket)\b/;
                if (blockedPatterns.test(expressionCode)) {
                  throw new Error('Expression contains blocked keywords. Only math and animation helpers are allowed.');
                }
                const testFn = new Function(...Object.keys(testScope), `"use strict"; return (${expressionCode});`);
                testFn(...Object.values(testScope));
                // Generate keyframes from expression across the timeline
                const numSamples = Math.min(duration, 60);
                const step = Math.max(1, Math.floor(duration / numSamples));
                const newKeyframes: Keyframe[] = [];
                for (let f = 0; f <= duration; f += step) {
                  const t = f / fps;
                  const evalRng = seedRng(f);
                  const scope = {
                    time: t, value: 0, index: f, fps,
                    wiggle: (freq: number, amp: number) => Math.sin(t * freq * Math.PI * 2) * amp * (evalRng() * 2 - 1),
                    random: (min: number, max: number) => min + evalRng() * (max - min),
                    loopOut: () => t % (duration / fps),
                    loopIn: () => t % (duration / fps),
                    clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
                    lerp: (a: number, b: number, tp: number) => a + (b - a) * tp,
                    noise: (x: number) => (Math.sin(x * 127.1 + 311.7) * 43758.5453) % 1,
                    spring: (st: number, stiffness = 10, damping = 0.7) => 1 - Math.exp(-stiffness * st) * Math.cos(2 * Math.PI * damping * st),
                    valueAtTime: (vt: number) => { const prevKf = newKeyframes.filter(k => k.time / fps <= vt).pop(); return prevKf?.value ?? 0; },
                  };
                  const fn = new Function(...Object.keys(scope), `"use strict"; return (${expressionCode});`);
                  const val = Number(fn(...Object.values(scope)));
                  if (!isFinite(val)) throw new Error(`Non-finite value at frame ${f}`);
                  newKeyframes.push({ time: f, value: Math.round(val * 1000) / 1000, easing: 'linear' as const });
                }
                setLayers(prev => prev.map(l => {
                  if (l.id !== selectedLayerId) return l;
                  const anims = l.animations || [];
                  const existing = anims.findIndex(a => a.property === expressionTarget);
                  const newAnim: Animation = { property: expressionTarget, keyframes: newKeyframes };
                  const updated = existing >= 0 ? anims.map((a, i) => i === existing ? newAnim : a) : [...anims, newAnim];
                  return { ...l, animations: updated };
                }));
                setExpressionError(null);
              } catch (err: any) {
                setExpressionError(err.message || 'Invalid expression');
              }
            }} style={{ width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(191,90,242,0.3)', background: 'rgba(191,90,242,0.12)', color: '#bf5af2', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply to {expressionTarget}</button>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, marginBottom: 4 }}>Templates</div>
            {EXPRESSION_TEMPLATES.map(t => (
              <button key={t.name} onClick={() => { setExpressionCode(t.code); setExpressionError(null); }} aria-label={`Insert ${t.name} expression`} title={t.description} style={{ display: 'block', width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', marginBottom: 2, textAlign: 'left', fontFamily: 'monospace' }}>
                <span style={{ color: '#bf5af2', fontWeight: 600 }}>{t.name}</span> — <span style={{ color: 'var(--color-text-tertiary)' }}>{t.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Repeater Panel */}
      {showRepeater && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Repeater / Replicator</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowRepeater(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['grid', 'radial', 'spiral'] as const).map(t => (
                <button key={t} onClick={() => setRepeaterType(t)} aria-label={`${t} repeater type`} aria-pressed={repeaterType === t} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: repeaterType === t ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: repeaterType === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            <div style={{ height: 100, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="90" height="90" viewBox="0 0 90 90">{repeaterType === 'grid' ? [...Array(repeaterCount)].map((_, i) => { const cols = Math.ceil(Math.sqrt(repeaterCount)); const r = Math.floor(i / cols); const c = i % cols; return <rect key={i} x={10 + c * 22} y={10 + r * 22} width={16} height={16} rx={2} fill="var(--color-accent)" opacity={0.3 + i * 0.07} />; }) : repeaterType === 'radial' ? [...Array(repeaterCount)].map((_, i) => { const a = (i / repeaterCount) * Math.PI * 2; return <circle key={i} cx={45 + Math.cos(a) * 30} cy={45 + Math.sin(a) * 30} r={6} fill="#bf5af2" opacity={0.4 + i * 0.06} />; }) : [...Array(repeaterCount)].map((_, i) => { const a = (i / repeaterCount) * Math.PI * 4; const r = 10 + i * 3; return <circle key={i} cx={45 + Math.cos(a) * r} cy={45 + Math.sin(a) * r} r={4} fill="#30d158" opacity={0.3 + i * 0.07} />; })}</svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Count</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{repeaterCount}</span></div>
            <input type="range" min="2" max="36" value={repeaterCount} onChange={e => setRepeaterCount(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
          </div>
        </div>
      )}

      {/* 3D Text Panel */}
      {show3DText && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 100, width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>3D Text</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShow3DText(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ height: 80, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#404050', textShadow: '2px 2px 0px #202030, -1px -1px 0px #606070' }}>Aa</span>
            </div>
            {[{ label: 'Extrude Depth', value: extrudeDepth, set: setExtrudeDepth, max: 200, color: 'var(--color-accent)' }, { label: 'Bevel Size', value: bevelSize, set: setBevelSize, max: 20, color: '#bf5af2' }].map(s => (
              <div key={s.label} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 11, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span></div>
                <input type="range" min="0" max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Material</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
              {['Metal', 'Glass', 'Plastic', 'Wood', 'Chrome', 'Gold', 'Matte', 'Neon'].map(m => (
                <button key={m} aria-label={`${m} material`} style={{ padding: '4px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GIF/APNG Export Panel */}
      {showGifExport && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Animated Export (WebM)</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowGifExport(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {['WebM VP9', 'WebM VP8'].map(f => (
                <button key={f} aria-label={`${f} export format`} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: f === 'WebM VP9' ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: f === 'WebM VP9' ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{f}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Palette Colors</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{gifPalette}</span></div>
            <input type="range" min="2" max="256" value={gifPalette} onChange={e => setGifPalette(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 8 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)', cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" checked={gifDither} onChange={e => setGifDither(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} /> Floyd-Steinberg Dithering
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>FPS</div><select style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}><option>10</option><option>15</option><option>24</option><option>30</option></select></div>
              <div><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Loop</div><select style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }}><option>Forever</option><option>Once</option><option>3x</option></select></div>
            </div>
            <button aria-label="Export Animation" onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const w = canvas.width, h = canvas.height;
              const gifFps = 10;
              const totalFrames = Math.ceil(duration * gifFps / fps);
              // Use offscreen canvas + MediaRecorder to produce animated WebM
              const offscreen = document.createElement('canvas');
              offscreen.width = w; offscreen.height = h;
              const octx = offscreen.getContext('2d');
              if (!octx) return;
              const stream = (offscreen as any).captureStream(0) as MediaStream;
              const track = stream.getVideoTracks()[0];
              const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9' : 'video/webm';
              const recorder = new MediaRecorder(stream, { mimeType });
              const chunks: Blob[] = [];
              recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
              recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `flux-animation-${Date.now()}.webm`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                setShowGifExport(false);
                window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: 'Exported as WebM (browser-native format)', type: 'success' } }));
              };
              recorder.start();
              const origTime = currentTime;
              let frameIdx = 0;
              const delay = Math.round(1000 / gifFps);
              const renderNextFrame = () => {
                if (frameIdx < totalFrames) {
                  const t = Math.round((frameIdx / totalFrames) * duration);
                  // Draw frame onto offscreen canvas from source
                  octx.clearRect(0, 0, w, h);
                  octx.drawImage(canvas, 0, 0);
                  if ((track as any).requestFrame) (track as any).requestFrame();
                  frameIdx++;
                  // Advance time for next frame, give React a tick to re-render
                  setCurrentTime(Math.round(((frameIdx) / totalFrames) * duration));
                  setTimeout(renderNextFrame, delay);
                } else {
                  recorder.stop();
                  setCurrentTime(origTime);
                }
              };
              renderNextFrame();
            }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><DexIcon name="download" size={12} />Export</button>
          </div>
        </div>
      )}

      {/* Lottie Export Panel */}
      {showLottieExport && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Lottie / JSON Export</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowLottieExport(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,149,10,0.08)', border: '1px solid rgba(255,149,10,0.2)', textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{ }</div>
              <div style={{ fontSize: 11, color: 'var(--color-warning)', fontWeight: 600 }}>Lottie JSON</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Web-optimized vector animation</div>
            </div>
            {[{ label: 'Optimize', desc: 'Remove unused properties' }, { label: 'Flatten', desc: 'Merge nested transforms' }, { label: 'Minify', desc: 'Compress JSON output' }].map(opt => (
              <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-warning)' }} />
                <div><div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{opt.label}</div><div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{opt.desc}</div></div>
              </label>
            ))}
            <button aria-label="Export Lottie JSON" onClick={() => {
              // Convert FLUX layers to Lottie JSON format
              const lottieData = {
                v: '5.7.14',
                fr: fps,
                ip: 0,
                op: duration,
                w: canvasSize.width,
                h: canvasSize.height,
                nm: 'Flux Composition',
                ddd: is3DMode ? 1 : 0,
                assets: [] as any[],
                layers: layers.filter(l => l.visible).map((layer, i) => {
                  const lottieLayer: any = {
                    ddd: is3DMode ? 1 : 0,
                    ind: i,
                    ty: layer.type === 'shape' ? 4 : layer.type === 'text' ? 5 : layer.type === 'image' ? 2 : 1,
                    nm: layer.name,
                    sr: 1,
                    ks: {
                      o: { a: 0, k: layer.transform.opacity },
                      r: { a: 0, k: layer.transform.rotationZ },
                      p: {
                        a: layer.animations?.some(a => a.property === 'x' || a.property === 'y') ? 1 : 0,
                        k: layer.animations?.some(a => a.property === 'x' || a.property === 'y')
                          ? (layer.animations?.filter(a => a.property === 'x').flatMap(a => a.keyframes.map(kf => ({
                              t: kf.time, s: [layer.transform.x, layer.transform.y, 0], e: [kf.value, layer.transform.y, 0]
                            }))) || [])
                          : [layer.transform.x, layer.transform.y, 0]
                      },
                      a: { a: 0, k: [layer.transform.anchorX * canvasSize.width, layer.transform.anchorY * canvasSize.height, 0] },
                      s: { a: 0, k: [layer.transform.scaleX * 100, layer.transform.scaleY * 100, 100] },
                    },
                    ip: layer.inPoint,
                    op: layer.outPoint,
                    st: layer.startTime,
                  };
                  if (layer.type === 'shape' && layer.shapeStyle) {
                    lottieLayer.shapes = [{
                      ty: layer.shapeStyle.type === 'ellipse' ? 'el' : 'rc',
                      d: 1,
                      s: { a: 0, k: [200, 200] },
                      p: { a: 0, k: [0, 0] },
                    }, {
                      ty: 'fl',
                      c: { a: 0, k: [1, 1, 1, 1] },
                      o: { a: 0, k: 100 },
                    }];
                  }
                  return lottieLayer;
                }),
              };
              const json = JSON.stringify(lottieData, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `flux-lottie-${Date.now()}.json`;
              a.click(); URL.revokeObjectURL(url);
              setShowLottieExport(false);
            }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'var(--color-warning)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>Export Lottie JSON</button>
          </div>
        </div>
      )}

      {/* Composition Templates */}
      {showCompTemplates && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(500px, calc(100vw - 32px))', height: 'min(440px, calc(100vh - 64px))', background: 'var(--color-bg-elevated)', borderRadius: 14, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Composition Templates</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowCompTemplates(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ width: 130, borderRight: '1px solid var(--color-bg-hover)', padding: 8 }}>
              {(['lower-thirds', 'intros', 'social', 'titles'] as const).map(cat => (
                <button key={cat} onClick={() => setCompTemplateCategory(cat)} aria-label={`${cat.replace('-', ' ')} templates`} aria-pressed={compTemplateCategory === cat} style={{ display: 'block', width: '100%', padding: '6px 8px', borderRadius: 5, border: 'none', background: compTemplateCategory === cat ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent', color: compTemplateCategory === cat ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: 2, textTransform: 'capitalize' }}>{cat.replace('-', ' ')}</button>
              ))}
            </div>
            <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {(compTemplateCategory === 'lower-thirds' ? ['Clean Bar', 'Glass Panel', 'Slide In', 'Minimal Line', 'Badge', 'Split'] :
                  compTemplateCategory === 'intros' ? ['Logo Reveal', 'Particle Burst', 'Glitch', 'Cinematic', 'Geometric', 'Gradient Flow'] :
                  compTemplateCategory === 'social' ? ['Instagram Post', 'Story 9:16', 'YouTube End Card', 'TikTok', 'Twitter Banner', 'Facebook Cover'] :
                  ['Title Card', 'Chapter', 'Credit Roll', 'Subtitle', 'Quote', 'Name Plate']).map(t => (
                  <button key={t} aria-label={`Apply ${t} template`} onClick={() => { const templateLayers = [{ id: `layer_${Date.now()}`, name: t, type: 'shape' as const, visible: true, locked: false, solo: false, startTime: 0, duration: compTemplateCategory === 'intros' ? 150 : 90, inPoint: 0, outPoint: compTemplateCategory === 'intros' ? 150 : 90, transform: { x: canvasSize.width / 2 - 200, y: canvasSize.height / 2 - 50, z: 0, scaleX: 1, scaleY: 1, scaleZ: 1, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0.5, anchorY: 0.5, opacity: 100 }, behaviors: [], filters: [], animations: [{ property: 'opacity', keyframes: [{ time: 0, value: 0, easing: 'easeOut' as const }, { time: 15, value: 100, easing: 'easeOut' as const }] }] }]; setLayers(prev => [...templateLayers, ...prev]); setSelectedLayerId(templateLayers[0].id); setShowCompTemplates(false); }} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ height: 50, borderRadius: 4, background: 'var(--color-border-subtle)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 18 }}>*</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{t}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Null Objects Panel */}
      {showNullObjects && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 120, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Null Objects</span>
            <button aria-label="Close Null Objects panel" onClick={() => setShowNullObjects(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Create null object" onClick={() => {
              const id = addLayer('shape');
              setLayers(prev => prev.map(l => l.id === id ? { ...l, name: `Null ${layers.filter(ll => ll.name.startsWith('Null')).length + 1}`, type: 'null' as any, transform: { ...l.transform, opacity: 0 } } : l));
            }} style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px dashed color-mix(in srgb, var(--color-accent) 30%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Create Null Object</button>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Parent Layer</span>
              <select style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                <option>None</option>
                {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Transform Offset</div>
            {['Position X', 'Position Y', 'Rotation', 'Scale'].map(prop => (
              <div key={prop} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 70 }}>{prop}</span>
                <input type="number" defaultValue={prop === 'Scale' ? 100 : 0} style={{ width: 60, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-secondary)', fontSize: 11, textAlign: 'right' }} />
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Null Objects</div>
              <div style={{ padding: 14, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No null objects created yet</div>
            </div>
          </div>
        </div>
      )}

      {/* Motion Path Panel */}
      {showMotionPath && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: 20, top: 120, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Motion Path</span>
            <button aria-label="Close Motion Path panel" onClick={() => setShowMotionPath(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ height: 160, background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--color-border-subtle)', position: 'relative', marginBottom: 10, overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox="0 0 300 160" style={{ position: 'absolute', inset: 0 }}>
                {/* Grid */}
                <line x1="150" y1="0" x2="150" y2="160" stroke="var(--color-border-subtle)" />
                <line x1="0" y1="80" x2="300" y2="80" stroke="var(--color-border-subtle)" />
                {/* Path */}
                <path d="M40,120 C80,40 180,40 260,100" fill="none" stroke="#bf5af2" strokeWidth="2" />
                {/* Control points */}
                <circle cx="40" cy="120" r="5" fill="#bf5af2" stroke="#fff" strokeWidth="1" style={{ cursor: 'grab' }} />
                <circle cx="80" cy="40" r="3" fill="transparent" stroke="#bf5af2" strokeWidth="1" strokeDasharray="2,2" />
                <line x1="40" y1="120" x2="80" y2="40" stroke="#bf5af2" strokeWidth="0.5" strokeDasharray="2,2" />
                <circle cx="180" cy="40" r="3" fill="transparent" stroke="#bf5af2" strokeWidth="1" strokeDasharray="2,2" />
                <circle cx="260" cy="100" r="5" fill="#bf5af2" stroke="#fff" strokeWidth="1" style={{ cursor: 'grab' }} />
                <line x1="260" y1="100" x2="180" y2="40" stroke="#bf5af2" strokeWidth="0.5" strokeDasharray="2,2" />
              </svg>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'block' }}>Ease Curve</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['Linear', 'Ease In', 'Ease Out', 'Ease Both'].map(e => (
                  <button key={e} aria-label={`${e} easing`} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: e === 'Ease Both' ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: e === 'Ease Both' ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{e}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" defaultChecked style={{ accentColor: '#bf5af2' }} />
                Orient Along Path
              </label>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" style={{ accentColor: '#bf5af2' }} />
                Closed Path
              </label>
            </div>
            <button aria-label="Apply motion path to selected layer" onClick={() => { if (!selectedLayerId) return; const pathData = { id: 'mp-' + Date.now(), points: [ { x: 40, y: 120, handleIn: { x: 0, y: 0 }, handleOut: { x: 40, y: -80 }, type: 'smooth' as const }, { x: 260, y: 100, handleIn: { x: -80, y: -60 }, handleOut: { x: 0, y: 0 }, type: 'smooth' as const } ], closed: false }; const dur = layers.find(l => l.id === selectedLayerId)?.duration || duration; const kfs: { time: number; value: number; easing: 'easeInOut' }[] = []; for (let f = 0; f <= dur; f += 5) { const t = f / dur; const pt = getPointOnPath(pathData, t); kfs.push({ time: f, value: pt.x, easing: 'easeInOut' }); } setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, animations: [...(l.animations || []), { property: 'x', keyframes: kfs }, { property: 'y', keyframes: kfs.map((k, i) => ({ ...k, value: getPointOnPath(pathData, i / (kfs.length - 1)).y })) }] } : l)); setShowMotionPath(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>Apply Motion Path</button>
          </div>
        </div>
      )}

      {/* Mask System Panel */}
      {showMaskSystem && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 350, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Mask System</span>
            <button aria-label="Close Mask System panel" onClick={() => setShowMaskSystem(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {['Add', 'Subtract', 'Intersect'].map(op => (
                <button key={op} onClick={() => setMaskType(op.toLowerCase() as 'add' | 'subtract' | 'intersect')} aria-label={`${op} mask mode`} aria-pressed={maskType === op.toLowerCase()} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: maskType === op.toLowerCase() ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-border-subtle)', color: maskType === op.toLowerCase() ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{op}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {['Ellipse', 'Rectangle', 'Pen'].map(shape => (
                <button key={shape} aria-label={`${shape} mask shape`} onClick={() => { if (!selectedLayerId) return; const s = shape.toLowerCase() as 'ellipse' | 'rectangle'; if (shape === 'Pen') return; setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, masks: [...(l.masks || []), { id: `mask-${Date.now()}`, shape: s, mode: maskType, feather: maskFeather, opacity: maskOpacity, expansion: maskExpansion }] } : l)); }} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{shape}</button>
              ))}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Feather</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskFeather} px</span>
              </div>
              <input type="range" min="0" max="100" value={maskFeather} onChange={e => setMaskFeather(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Expansion</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskExpansion} px</span>
              </div>
              <input type="range" min="-50" max="50" value={maskExpansion} onChange={e => setMaskExpansion(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Opacity</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{maskOpacity}%</span>
              </div>
              <input type="range" min="0" max="100" value={maskOpacity} onChange={e => setMaskOpacity(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Mask List</div>
              {(() => { const sel = layers.find(l => l.id === selectedLayerId); const masks = sel?.masks || []; return masks.length === 0 ? <div style={{ padding: 14, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No masks — select a shape above</div> : masks.map(m => (<div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{m.shape} ({m.mode})</span><button onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, masks: (l.masks || []).filter(mm => mm.id !== m.id) } : l))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button></div>)); })()}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Particles Panel */}
      {showAdvancedParticles && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 400, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Advanced Particles</span>
            <button aria-label="Close Advanced Particles panel" onClick={() => setShowAdvancedParticles(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'block' }}>Emitter Shape</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['Point', 'Line', 'Circle', 'Rectangle', 'Sphere'].map(s => (
                  <button key={s} aria-label={`${s} emitter shape`} style={{ flex: 1, padding: '4px 0', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: s === 'Point' ? 'rgba(255,159,10,0.12)' : 'var(--color-border-subtle)', color: s === 'Point' ? 'var(--color-warning)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[{ label: 'Birth Rate', val: '60/s' }, { label: 'Lifetime', val: '2.0s' }, { label: 'Speed', val: '150' }, { label: 'Spread', val: '45°' }].map(p => (
                <div key={p.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.val}</span>
                  </div>
                  <input type="range" min="0" max="100" defaultValue={50} style={{ width: '100%', accentColor: 'var(--color-warning)' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'block' }}>Physics</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[{ label: 'Gravity', val: particleGravity, set: setParticleGravity }, { label: 'Wind X', val: particleWindX, set: setParticleWindX }, { label: 'Turbulence', val: particleTurbulence, set: setParticleTurbulence }, { label: 'Friction', val: particleFriction, set: setParticleFriction }].map(p => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.label}</span>
                    <input type="number" value={p.val} step={0.1} onChange={e => p.set(Number(e.target.value))} style={{ width: 50, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-secondary)', fontSize: 11, textAlign: 'right' }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" style={{ accentColor: 'var(--color-warning)' }} />
                Sub-Emitters
              </label>
              <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" style={{ accentColor: 'var(--color-warning)' }} />
                Collision
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Audio Reactive Panel */}
      {showAudioReactive && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: 20, top: 350, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Audio Reactive</span>
            <button aria-label="Close Audio Reactive panel" onClick={() => setShowAudioReactive(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ height: 60, background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'flex-end', gap: 2, padding: '4px 8px', marginBottom: 10 }}>
              {audioFreqSnapshot.map((v, i) => (
                <div key={i} style={{ flex: 1, background: `hsl(${260 + i * 3}, 80%, ${40 + v * 30}%)`, borderRadius: '2px 2px 0 0', height: `${Math.max(4, v * 100)}%`, minHeight: 2, transition: 'height 60ms ease-out' }} />
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'block' }}>Frequency Band</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {([['sub', 'Sub Bass'], ['bass', 'Bass'], ['mids', 'Mids'], ['hiMids', 'Hi-Mids'], ['treble', 'Treble']] as const).map(([k, label]) => (
                  <button key={k} aria-label={`${label} frequency band`} onClick={() => setAudioReactiveBand(k)} style={{ flex: 1, padding: '3px 0', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: audioReactiveBand === k ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: audioReactiveBand === k ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, display: 'block' }}>Bind to Property</span>
              <select value={audioReactiveProperty} onChange={e => setAudioReactiveProperty(e.target.value as typeof audioReactiveProperty)} style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                <option value="scale">Scale</option>
                <option value="opacity">Opacity</option>
                <option value="positionY">Position Y</option>
                <option value="rotation">Rotation</option>
                <option value="color">Color</option>
              </select>
            </div>
            {[{ label: 'Sensitivity', val: audioSensitivity, set: setAudioSensitivity }, { label: 'Smoothing', val: audioSmoothing, set: setAudioSmoothing }, { label: 'Amplitude', val: audioAmplitude, set: setAudioAmplitude }].map(s => (
              <div key={s.label} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.val}%</span>
                </div>
                <input type="range" min="0" max="100" value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shader Effects Panel */}
      {showShaderEffects && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(520px, calc(100vw - 32px))', maxHeight: 'min(80vh, calc(100vh - 32px))', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Shader Effects</span>
            <button aria-label="Close Shader Effects panel" onClick={() => setShowShaderEffects(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 2 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, overflow: 'auto' }}>
            {/* GLSL Editor */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>GLSL Fragment Shader</div>
              <textarea value={shaderCode} onChange={e => setShaderCode(e.target.value)} style={{ width: '100%', height: 180, padding: 10, borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.4)', color: 'var(--color-success)', fontSize: 11, fontFamily: '"SF Mono", "Fira Code", monospace', resize: 'vertical', lineHeight: 1.5 }} />
              <button aria-label="Compile and apply shader" onClick={() => { if (!selectedLayerId) return; const intensity = shaderUniforms.u_intensity / 50; const filterStr = `contrast(${1 + intensity * 0.2}) saturate(${1 + intensity * 0.3}) brightness(${1 + intensity * 0.1})`; setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, filters: [...l.filters.filter(f => f.type !== 'stylize'), { id: `shader-${Date.now()}`, type: 'stylize' as any, enabled: true, settings: { sepia: shaderUniforms.u_speed, grayscale: 0, invert: 0, customFilter: filterStr } }] } : l)); }} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Compile & Apply</button>
            </div>
            {/* Uniforms & Presets */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6, fontWeight: 600 }}>Uniforms</div>
              {[{ name: 'u_time', val: shaderUniforms.u_time }, { name: 'u_speed', val: shaderUniforms.u_speed }, { name: 'u_intensity', val: shaderUniforms.u_intensity }, { name: 'u_color', val: '#bf5af2' }].map(u => (
                <div key={u.name} style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{u.name}</span>
                  {u.name === 'u_color' ? (
                    <input type="color" defaultValue={u.val as string} style={{ display: 'block', width: '100%', height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', marginTop: 2 }} />
                  ) : (
                    <input type="range" min="0" max="100" value={u.val as number} onChange={e => setShaderUniforms(prev => ({ ...prev, [u.name]: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#bf5af2', marginTop: 2 }} />
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Presets</div>
                {[{ n: 'Chromatic Aberration', f: 'hue-rotate(5deg) saturate(1.5) contrast(1.1)' }, { n: 'Noise Grain', f: 'contrast(1.3) brightness(0.95)' }, { n: 'Barrel Distortion', f: 'contrast(1.2) brightness(1.05)' }, { n: 'RGB Split', f: 'saturate(2) hue-rotate(10deg) contrast(1.15)' }, { n: 'CRT Scanlines', f: 'contrast(1.4) brightness(0.9) saturate(0.8)' }].map(p => (
                  <button key={p.n} aria-label={`Apply ${p.n} shader preset`} onClick={() => { if (!selectedLayerId) return; setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, filters: [...l.filters.filter(f => f.type !== 'stylize'), { id: `shader-${Date.now()}`, type: 'stylize' as any, enabled: true, settings: { customFilter: p.f } }] } : l)); setShowShaderEffects(false); }} style={{ display: 'block', width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer', textAlign: 'left', marginBottom: 3 }}>{p.n}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== NEW PRO FEATURE PANELS ===== */}

      {/* 1. Track Mattes */}
      {showTrackMattes && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Track Mattes</span>
            <button aria-label="Close Track Mattes panel" onClick={() => setShowTrackMattes(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 6 }}>Matte Type</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
              {([['alpha', 'Alpha Matte'], ['alphaInverted', 'Alpha Inv'], ['luma', 'Luma Matte'], ['lumaInverted', 'Luma Inv']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setMatteType(val)} aria-label={label} style={{ padding: '6px', borderRadius: 5, border: '1px solid ' + (matteType === val ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: matteType === val ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: matteType === val ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Matte Layer</span>
            <select value={matteLayerSelect} onChange={e => setMatteLayerSelect(e.target.value)} style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-secondary)', fontSize: 11, marginBottom: 8 }}>
              <option value="">None</option>
              {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button aria-label="Apply track matte" onClick={() => { if (!selectedLayerId || !matteLayerSelect) return; setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, matteLayerId: matteLayerSelect, matteType } : l)); setShowTrackMattes(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Matte</button>
          </div>
        </div>
      )}

      {/* 2. Precompose */}
      {showPrecompose && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Pre-compose</span>
            <button aria-label="Close Precompose panel" onClick={() => setShowPrecompose(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Composition Name</span>
            <input type="text" value={precompName} onChange={e => setPrecompName(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: '#ccc', fontSize: 11, marginBottom: 10, boxSizing: 'border-box' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
              <input type="checkbox" defaultChecked style={{ accentColor: '#bf5af2' }} />
              Move all attributes into new composition
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
              <input type="checkbox" style={{ accentColor: '#bf5af2' }} />
              Adjust composition duration to selected layers
            </label>
            <button aria-label="Create pre-composition" onClick={() => {
              if (!selectedLayerId) { setShowPrecompose(false); return; }
              const selected = layers.find(l => l.id === selectedLayerId);
              if (!selected) { setShowPrecompose(false); return; }
              // Create group layer containing selected layer
              const groupLayer: Layer = {
                id: `layer-comp-${Date.now()}`,
                name: precompName || 'Pre-comp',
                type: 'group',
                visible: true, locked: false, solo: false,
                startTime: selected.startTime, duration: selected.duration,
                inPoint: selected.inPoint, outPoint: selected.outPoint,
                transform: { ...selected.transform },
                behaviors: [], filters: [], animations: [],
                children: [selected],
              } as any;
              setLayers(prev => [groupLayer, ...prev.filter(l => l.id !== selectedLayerId)]);
              setSelectedLayerId(groupLayer.id);
              setShowPrecompose(false);
            }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Pre-compose</button>
          </div>
        </div>
      )}

      {/* 3. Time Remap */}
      {showTimeRemap && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Time Remap</span>
            <button aria-label="Close Time Remap panel" onClick={() => setShowTimeRemap(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 40 }}>Speed</span>
              <input type="range" min="10" max="400" value={timeRemapSpeed} onChange={e => setTimeRemapSpeed(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 30, textAlign: 'right' }}>{timeRemapSpeed}%</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[25, 50, 100, 200, 400].map(s => <button key={s} onClick={() => setTimeRemapSpeed(s)} aria-label={`${s}% speed`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (timeRemapSpeed === s ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: timeRemapSpeed === s ? 'rgba(191,90,242,0.1)' : 'var(--color-border-subtle)', color: timeRemapSpeed === s ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>{s}%</button>)}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
              <input type="checkbox" checked={timeRemapReverse} onChange={e => setTimeRemapReverse(e.target.checked)} style={{ accentColor: '#bf5af2' }} />
              Reverse playback
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: '#bf5af2' }} />
              Frame blending
            </label>
          </div>
        </div>
      )}

      {/* 4. Morph Shapes */}
      {showMorphShapes && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Shape Morph</span>
            <button aria-label="Close Shape Morph panel" onClick={() => setShowMorphShapes(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ flex: 1, padding: 16, borderRadius: 8, background: 'rgba(0,0,0,0.3)', textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="#bf5af2" strokeWidth="2" /></svg>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Source Shape</div>
              </div>
              <span style={{ color: 'var(--color-text-tertiary)' }}><DexIcon name="arrow-right" size={16} /></span>
              <div style={{ flex: 1, padding: 16, borderRadius: 8, background: 'rgba(0,0,0,0.3)', textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" fill="none" stroke="#bf5af2" strokeWidth="2" rx="2" /></svg>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Target Shape</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Progress</span>
              <input type="range" min="0" max="100" value={morphProgress} onChange={e => setMorphProgress(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{morphProgress}%</span>
            </div>
            <button aria-label="Apply shape morph" onClick={() => { if (!selectedLayerId) return; const circle = MORPH_SHAPES.circle(0, 0, 40); const square = MORPH_SHAPES.square(0, 0, 80); const morphed = morphPaths(circle, square, morphProgress / 100); const shapeLayer: Layer = { id: `layer-morph-${Date.now()}`, name: `Morph ${morphProgress}%`, type: 'shape', visible: true, locked: false, solo: false, startTime: 0, duration: duration, inPoint: 0, outPoint: duration, transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 }, behaviors: [], filters: [], shapeStyle: { fill: '#bf5af2', stroke: '#bf5af2', strokeWidth: 2, type: 'ellipse' }, content: JSON.stringify(morphed.points) }; setLayers(prev => [shapeLayer, ...prev]); setShowMorphShapes(false); }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Create Morph Animation</button>
          </div>
        </div>
      )}

      {/* 5. Trim Paths */}
      {showTrimPaths && (
        <div style={{ position: 'fixed', right: 20, top: 160, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Trim Paths</span>
            <button aria-label="Close Trim Paths panel" onClick={() => setShowTrimPaths(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Start', val: trimStart, set: setTrimStart }, { label: 'End', val: trimEnd, set: setTrimEnd }, { label: 'Offset', val: trimOffset, set: setTrimOffset }].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 35 }}>{s.label}</span>
                <input type="range" min={s.label === 'Offset' ? -180 : 0} max={s.label === 'Offset' ? 180 : 100} value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 28, textAlign: 'right' }}>{s.val}{s.label === 'Offset' ? '°' : '%'}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-tertiary)' }}>Mode</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {['Simultaneously', 'Individually'].map(m => (
                <button key={m} aria-label={`${m} trim mode`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: m === 'Simultaneously' ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: m === 'Simultaneously' ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. Auto-Wiggle */}
      {showAutoWiggle && (
        <div style={{ position: 'fixed', right: 20, top: 200, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Wiggle</span>
            <button aria-label="Close Wiggle panel" onClick={() => setShowAutoWiggle(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Property</span>
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              {(['position', 'rotation', 'scale', 'opacity'] as const).map(p => (
                <button key={p} onClick={() => setWiggleProperty(p)} aria-label={`Wiggle ${p}`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (wiggleProperty === p ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: wiggleProperty === p ? 'rgba(191,90,242,0.1)' : 'var(--color-border-subtle)', color: wiggleProperty === p ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 55 }}>Frequency</span>
              <input type="range" min="1" max="30" value={wiggleFreq} onChange={e => setWiggleFreq(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 20, textAlign: 'right' }}>{wiggleFreq}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 55 }}>Amplitude</span>
              <input type="range" min="1" max="200" value={wiggleAmp} onChange={e => setWiggleAmp(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{wiggleAmp}</span>
            </div>
            <button aria-label="Apply wiggle expression" onClick={() => {
              if (!selectedLayerId) return;
              addBehavior(selectedLayerId, 'wiggle');
              setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                ...l,
                behaviors: l.behaviors.map((b, i) => i === l.behaviors.length - 1 && b.type === 'wiggle'
                  ? { ...b, settings: { property: wiggleProperty, frequency: wiggleFreq, amplitude: wiggleAmp } }
                  : b),
              } : l));
              setShowAutoWiggle(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Wiggle</button>
          </div>
        </div>
      )}

      {/* 7. Layer Effects Stack */}
      {showEffectsStack && (
        <div style={{ position: 'fixed', right: 20, top: 100, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Effects Stack</span>
            <button aria-label="Close Effects Stack panel" onClick={() => setShowEffectsStack(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {selectedLayerId ? (
              <>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
                  {(layers.find(l => l.id === selectedLayerId)?.filters || []).length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>No effects applied</div>}
                  {(layers.find(l => l.id === selectedLayerId)?.filters || []).map((f, i) => (
                    <div key={f.id} style={{ marginBottom: 3, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 12 }}>{i + 1}</span>
                        <span onClick={() => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { const fl = layer.filters.find(ff => ff.id === f.id); if (fl) { (fl as any)._expanded = !(fl as any)._expanded; setLayers(nl); } } }} style={{ fontSize: 11, color: f.enabled ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)', flex: 1, textTransform: 'capitalize', cursor: 'pointer' }}>{f.type}</span>
                        <button aria-label={`Toggle ${f.type} effect`} onClick={() => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, enabled: !ff.enabled } : ff); setLayers(nl); } }} style={{ background: 'none', border: 'none', color: f.enabled ? '#bf5af2' : 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center' }}>{f.enabled ? <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6"/></svg> : <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="5"/></svg>}</button>
                        <button aria-label={`Remove ${f.type} effect`} onClick={() => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.filter(ff => ff.id !== f.id); setLayers(nl); } }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}><DexIcon name="close" size={11} /></button>
                      </div>
                      {(f as any)._expanded && (
                        <div style={{ padding: '4px 8px 8px', borderTop: '1px solid var(--color-bg-hover)' }}>
                          {f.type === 'blur' && (
                            <><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}><span>Radius</span><span>{(f.settings as any).radius ?? 10}px</span></div>
                            <input type="range" min="0" max="100" value={(f.settings as any).radius ?? 10} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, radius: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} /></>
                          )}
                          {f.type === 'glow' && (
                            <><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}><span>Intensity</span><span>{(f.settings as any).intensity ?? 50}%</span></div>
                            <input type="range" min="0" max="100" value={(f.settings as any).intensity ?? 50} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, intensity: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2, marginTop: 4 }}><span>Radius</span><span>{(f.settings as any).radius ?? 20}px</span></div>
                            <input type="range" min="0" max="100" value={(f.settings as any).radius ?? 20} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, radius: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} /></>
                          )}
                          {f.type === 'colorCorrect' && (
                            <>{['brightness', 'contrast', 'saturation'].map(param => (
                              <div key={param}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2, marginTop: 4 }}><span style={{ textTransform: 'capitalize' }}>{param}</span><span>{(f.settings as any)[param] ?? 0}</span></div>
                                <input type="range" min="-100" max="100" value={(f.settings as any)[param] ?? 0} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, [param]: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} />
                              </div>
                            ))}</>
                          )}
                          {f.type === 'sharpen' && (
                            <><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2 }}><span>Amount</span><span>{(f.settings as any).amount ?? 50}%</span></div>
                            <input type="range" min="0" max="100" value={(f.settings as any).amount ?? 50} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, amount: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} /></>
                          )}
                          {f.type === 'vignette' && (
                            <>{['amount', 'radius'].map(param => (
                              <div key={param}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 2, marginTop: 4 }}><span style={{ textTransform: 'capitalize' }}>{param}</span><span>{(f.settings as any)[param] ?? (param === 'amount' ? 50 : 80)}</span></div>
                                <input type="range" min="0" max="100" value={(f.settings as any)[param] ?? (param === 'amount' ? 50 : 80)} onChange={e => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = layer.filters.map(ff => ff.id === f.id ? { ...ff, settings: { ...ff.settings, [param]: Number(e.target.value) } } : ff); setLayers(nl); } }} style={{ width: '100%', accentColor: '#bf5af2' }} />
                              </div>
                            ))}</>
                          )}
                          {!['blur', 'glow', 'colorCorrect', 'sharpen', 'vignette'].includes(f.type) && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 4 }}>Click name to expand</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['blur', 'glow', 'colorCorrect', 'sharpen', 'vignette'].map(e => (
                    <button key={e} aria-label={`Add ${e} effect`} onClick={() => { const nl = [...layers]; const layer = nl.find(l => l.id === selectedLayerId); if (layer) { layer.filters = [...layer.filters, { id: `fx-${Date.now()}`, type: e as any, enabled: true, settings: {} }]; setLayers(nl); } }} style={{ flex: 1, padding: '4px 2px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>{e}</button>
                  ))}
                </div>
              </>
            ) : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>Select a layer to manage effects</div>}
          </div>
        </div>
      )}

      {/* 8. Camera Rig */}
      {showCameraRig && (
        <div style={{ position: 'fixed', right: 20, top: 140, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Camera Rig</span>
            <button aria-label="Close Camera Rig panel" onClick={() => setShowCameraRig(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Rig Type</span>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['orbit', 'twoNode', 'poi'] as const).map(t => (
                <button key={t} onClick={() => setCameraRigType(t)} aria-label={`${t} camera rig`} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid ' + (cameraRigType === t ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: cameraRigType === t ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: cameraRigType === t ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{t === 'twoNode' ? '2-Node' : t === 'poi' ? 'POI' : 'Orbit'}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 30 }}>FOV</span>
              <input type="range" min="10" max="120" value={cameraFov} onChange={e => setCameraFov(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{cameraFov}°</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
              <input type="checkbox" checked={cameraDof} onChange={e => setCameraDof(e.target.checked)} style={{ accentColor: '#bf5af2' }} />
              Depth of Field
            </label>
            {cameraDof && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Focus D</span>
                <input type="range" min="0" max="5000" defaultValue={1000} style={{ flex: 1, accentColor: '#bf5af2' }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 30, textAlign: 'right' }}>1000</span>
              </div>
            )}
            <button aria-label="Create camera rig" onClick={() => {
              // Create a camera rig layer that controls camera position/rotation across time
              const rigLayer: Layer = {
                id: `layer-camrig-${Date.now()}`, name: 'Camera Rig', type: 'camera',
                visible: true, locked: false, solo: false,
                startTime: 0, duration: duration, inPoint: 0, outPoint: duration,
                transform: { x: canvasSize.width / 2, y: canvasSize.height / 2, z: 0, scaleX: 100, scaleY: 100, scaleZ: 100, rotationX: 0, rotationY: 0, rotationZ: 0, anchorX: 0, anchorY: 0, opacity: 100 },
                behaviors: [], filters: [], animations: [],
              };
              setLayers(prev => [rigLayer, ...prev]);
              setSelectedLayerId(rigLayer.id);
              window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Camera Rig created (FOV: ${cameraFov}${cameraDof ? ', DOF enabled' : ''})`, type: 'success' } }));
              setShowCameraRig(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Create Rig</button>
          </div>
        </div>
      )}

      {/* 9. Environment Map */}
      {showEnvironment && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Environment</span>
            <button aria-label="Close Environment panel" onClick={() => setShowEnvironment(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
              {[{ id: 'studio', name: 'Studio', desc: 'Soft diffused lighting' }, { id: 'outdoor', name: 'Outdoor HDR', desc: 'Daylight environment' }, { id: 'sunset', name: 'Golden Hour', desc: 'Warm directional light' }, { id: 'night', name: 'Night City', desc: 'Urban neon reflections' }, { id: 'gradient', name: 'Gradient Sky', desc: 'Smooth color backdrop' }, { id: 'abstract', name: 'Abstract', desc: 'Colorful patterns' }].map(e => (
                <button key={e.id} onClick={() => setEnvMapPreset(e.id)} aria-label={`Select ${e.name} environment`} style={{ padding: '8px', borderRadius: 6, border: '1px solid ' + (envMapPreset === e.id ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: envMapPreset === e.id ? 'rgba(191,90,242,0.08)' : 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: envMapPreset === e.id ? '#bf5af2' : 'var(--color-text-secondary)', fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{e.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ padding: 8, borderRadius: 6, border: '2px dashed var(--color-border-subtle)', textAlign: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Load custom HDRI / EXR file</span>
            </div>
          </div>
        </div>
      )}

      {/* 10. Render Queue */}
      {showRenderQueue && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 420, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Render Queue</span>
            <button aria-label="Close Render Queue panel" onClick={() => setShowRenderQueue(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Add current composition to render queue" onClick={() => setRenderQueue(prev => [...prev, { id: `rq-${Date.now()}`, name: `Comp - ${new Date().toLocaleTimeString()}`, format: 'MP4 H.264', status: 'queued', progress: 0 }])} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid rgba(191,90,242,0.2)', background: 'rgba(191,90,242,0.08)', color: '#bf5af2', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Add to Queue</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {renderQueue.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 16 }}>Queue is empty</div>}
              {renderQueue.map(job => (
                <div key={job.id} style={{ padding: '8px', marginBottom: 4, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{job.name}</span>
                    <span style={{ fontSize: 11, color: job.status === 'done' ? 'var(--color-success)' : job.status === 'rendering' ? '#bf5af2' : job.status === 'error' ? 'var(--color-error)' : 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>{job.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{job.format}</div>
                  <div style={{ height: 3, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${job.progress}%`, background: job.status === 'done' ? 'var(--color-success)' : '#bf5af2', borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
              ))}
            </div>
            {renderQueue.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button aria-label="Start rendering" onClick={() => {
                  const queuedJobs = renderQueue.filter(j => j.status === 'queued');
                  if (queuedJobs.length === 0) return;
                  // Mark first queued as rendering, then export
                  setRenderQueue(prev => prev.map(j => j.id === queuedJobs[0].id ? { ...j, status: 'rendering' as const, progress: 0 } : j));
                  exportVideo();
                  // After export completes, mark done. Safety cap prevents
                  // an unbounded poll if the recorder never enters 'inactive'.
                  const startedAt = Date.now();
                  const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes
                  const checkDone = setInterval(() => {
                    const expired = Date.now() - startedAt > MAX_POLL_MS;
                    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive' || expired) {
                      clearInterval(checkDone);
                      setRenderQueue(prev => prev.map(j => j.id === queuedJobs[0].id ? { ...j, status: expired ? 'error' as const : 'done' as const, progress: expired ? 0 : 100 } : j));
                    }
                  }, 500);
                }} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Render All</button>
                <button aria-label="Clear render queue" onClick={() => setRenderQueue([])} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(255,59,48,0.15)', background: 'rgba(255,59,48,0.06)', color: 'var(--color-error)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. Timeline Markers */}
      {showMarkers && (
        <div style={{ position: 'fixed', right: 20, top: 80, width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Markers</span>
            <button aria-label="Close Markers panel" onClick={() => setShowMarkers(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Add marker at current time" onClick={() => setMarkers(prev => [...prev, { id: `m-${Date.now()}`, time: currentTime, label: `Marker ${prev.length + 1}`, color: ['var(--color-error)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-accent)', '#bf5af2', '#FF375F'][prev.length % 6] }])} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid rgba(191,90,242,0.2)', background: 'rgba(191,90,242,0.08)', color: '#bf5af2', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Add Marker at Frame {currentTime}</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {markers.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>No markers</div>}
              {markers.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: m.color }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 35 }}>F{m.time}</span>
                  <input type="text" value={m.label} onChange={e => setMarkers(prev => prev.map(mm => mm.id === m.id ? { ...mm, label: e.target.value } : mm))} style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-bg-hover)', borderRadius: 3, color: '#ccc', fontSize: 11, padding: '2px 4px' }} />
                  <button aria-label="Go to marker" onClick={() => { setCurrentTime(m.time); setPlayheadPosition(m.time); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', borderRadius: 3 }} className="dex-hover-bg">Go</button>
                  <button aria-label="Delete marker" onClick={() => setMarkers(prev => prev.filter(mm => mm.id !== m.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 12. Layer Alignment */}
      {showAlignment && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Align & Distribute</span>
            <button aria-label="Close Alignment panel" onClick={() => setShowAlignment(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 6 }}>Align</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, marginBottom: 10 }}>
              {[{ l: 'align-left', t: 'Left' }, { l: 'align-center', t: 'H Center' }, { l: 'align-right', t: 'Right' }, { l: 'align-left', t: 'Top' }, { l: 'align-center', t: 'V Center' }, { l: 'align-right', t: 'Bottom' }].map(a => (
                <button key={a.t} aria-label={`Align ${a.t}`} title={a.t} onClick={() => {
                  if (!selectedLayerId) return;
                  setLayers(prev => prev.map(l => {
                    if (l.id !== selectedLayerId) return l;
                    const t = { ...l.transform };
                    if (a.t === 'Left') t.x = 0;
                    else if (a.t === 'H Center') t.x = canvasSize.width / 2;
                    else if (a.t === 'Right') t.x = canvasSize.width;
                    else if (a.t === 'Top') t.y = 0;
                    else if (a.t === 'V Center') t.y = canvasSize.height / 2;
                    else if (a.t === 'Bottom') t.y = canvasSize.height;
                    return { ...l, transform: t };
                  }));
                }} style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DexIcon name={a.l} size={12} /></button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 6 }}>Distribute</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
              {['H Spacing', 'V Spacing', 'H Centers', 'V Centers'].map(d => (
                <button key={d} aria-label={`Distribute ${d}`} style={{ padding: '5px 2px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 13. Guide Layers */}
      {showGuideLayer && (
        <div style={{ position: 'fixed', right: 20, top: 240, width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Guide Layers</span>
            <button aria-label="Close Guide Layers panel" onClick={() => setShowGuideLayer(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>Guide layers are visible in editor but not rendered in final output.</div>
            {layers.map(l => (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={guideLayers.has(l.id)} onChange={() => setGuideLayers(prev => { const n = new Set(prev); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} style={{ accentColor: '#bf5af2' }} />
                {l.name}
                {guideLayers.has(l.id) && <span style={{ fontSize: 11, color: '#bf5af2', marginLeft: 'auto' }}>GUIDE</span>}
              </label>
            ))}
            {layers.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>No layers</div>}
          </div>
        </div>
      )}

      {/* 14. Snapshot / A/B */}
      {showSnapshot && (
        <div style={{ position: 'fixed', right: 20, top: 100, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Snapshots</span>
            <button aria-label="Close Snapshots panel" onClick={() => setShowSnapshot(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <button aria-label="Take snapshot" onClick={() => setSnapshots(prev => [...prev, { id: `snap-${Date.now()}`, name: `Snapshot ${prev.length + 1}`, time: new Date().toLocaleTimeString() }])} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid rgba(191,90,242,0.2)', background: 'rgba(191,90,242,0.08)', color: '#bf5af2', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:4,display:'inline'}}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Take Snapshot</button>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {snapshots.length === 0 && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>No snapshots taken</div>}
              {snapshots.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.time}</span>
                  <button aria-label="Compare snapshot" style={{ background: 'none', border: 'none', color: '#bf5af2', cursor: 'pointer', fontSize: 11  }}>A/B</button>
                  <button aria-label="Delete snapshot" onClick={() => setSnapshots(prev => prev.filter(ss => ss.id !== s.id))} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 15. Frame Blending */}
      {showFrameBlending && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Frame Blending</span>
            <button aria-label="Close Frame Blending panel" onClick={() => setShowFrameBlending(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Samples</span>
              <input type="range" min="2" max="16" value={frameBlendSamples} onChange={e => setFrameBlendSamples(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 16, textAlign: 'right' }}>{frameBlendSamples}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Shutter</span>
              <input type="range" min="0" max="360" value={frameBlendShutter} onChange={e => setFrameBlendShutter(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{frameBlendShutter}°</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Frame Mix', 'Pixel Motion'].map(m => (
                <button key={m} aria-label={`${m} blend mode`} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: m === 'Frame Mix' ? 'rgba(191,90,242,0.12)' : 'var(--color-border-subtle)', color: m === 'Frame Mix' ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 16. Color Correction */}
      {showColorCorrection && (
        <div style={{ position: 'fixed', right: 20, top: 120, width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Color Correction</span>
            <button aria-label="Close Color Correction panel" onClick={() => setShowColorCorrection(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Lift (Shadows)', vals: ccLift, set: setCcLift }, { label: 'Gamma (Midtones)', vals: ccGamma, set: setCcGamma }, { label: 'Gain (Highlights)', vals: ccGain, set: setCcGain }].map(group => (
              <div key={group.label} style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>{group.label}</span>
                {(['r', 'g', 'b'] as const).map(ch => (
                  <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: ch === 'r' ? 'var(--color-error)' : ch === 'g' ? 'var(--color-success)' : 'var(--color-accent)', width: 10, fontWeight: 600 }}>{ch.toUpperCase()}</span>
                    <input type="range" min="-100" max="100" value={group.vals[ch]} onChange={e => {
                      group.set((prev: any) => ({ ...prev, [ch]: Number(e.target.value) }));
                      if (selectedLayerId) {
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                          ...l, filters: [
                            ...l.filters.filter(f => f.type !== 'colorCorrect'),
                            { id: `cc-${Date.now()}`, type: 'colorCorrect' as any, enabled: true, settings: { lift: { ...ccLift, [ch]: Number(e.target.value) }, gamma: ccGamma, gain: ccGain } },
                          ],
                        } : l));
                      }
                    }} style={{ flex: 1, accentColor: ch === 'r' ? 'var(--color-error)' : ch === 'g' ? 'var(--color-success)' : 'var(--color-accent)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 22, textAlign: 'right' }}>{group.vals[ch]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 17. Stagger / Sequence */}
      {showStagger && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 290, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Stagger / Sequence</span>
            <button aria-label="Close Stagger panel" onClick={() => setShowStagger(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 40 }}>Offset</span>
              <input type="range" min="1" max="60" value={staggerOffset} onChange={e => setStaggerOffset(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 35, textAlign: 'right' }}>{staggerOffset} fr</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>Order</span>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['top-down', 'bottom-up', 'random'] as const).map(o => (
                <button key={o} onClick={() => setStaggerOrder(o)} aria-label={`Stagger ${o}`} style={{ flex: 1, padding: '4px', borderRadius: 5, border: '1px solid ' + (staggerOrder === o ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: staggerOrder === o ? 'rgba(191,90,242,0.1)' : 'var(--color-border-subtle)', color: staggerOrder === o ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{o.replace('-', ' ')}</button>
              ))}
            </div>
            <button aria-label="Apply stagger to layers" onClick={() => {
              let ordered = [...layers];
              if (staggerOrder === 'bottom-up') ordered.reverse();
              else if (staggerOrder === 'random') ordered.sort(() => Math.random() - 0.5);
              setLayers(ordered.map((l, i) => ({
                ...l,
                inPoint: l.inPoint + staggerOffset * i,
                outPoint: l.outPoint + staggerOffset * i,
                startTime: l.startTime + staggerOffset * i,
              })));
              setShowStagger(false);
            }} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: '#bf5af2', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apply Stagger</button>
          </div>
        </div>
      )}

      {/* 18. Shape Stroke Effects */}
      {showStrokeEffects && (
        <div style={{ position: 'fixed', right: 20, top: 180, width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Stroke Effects</span>
            <button aria-label="Close Stroke Effects panel" onClick={() => setShowStrokeEffects(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            {[{ label: 'Dash', val: strokeDash, set: setStrokeDash, max: 50 }, { label: 'Gap', val: strokeGap, set: setStrokeGap, max: 50 }].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 30 }}>{s.label}</span>
                <input type="range" min="0" max={s.max} value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 18, textAlign: 'right' }}>{s.val}</span>
              </div>
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4, marginTop: 4 }}>Line Cap</span>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['butt', 'round', 'square'] as const).map(c => (
                <button key={c} onClick={() => setStrokeCap(c)} aria-label={`${c} line cap`} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid ' + (strokeCap === c ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: strokeCap === c ? 'rgba(191,90,242,0.1)' : 'var(--color-border-subtle)', color: strokeCap === c ? '#bf5af2' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{c}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ n: 'Solid', d: 0, g: 0 }, { n: 'Dotted', d: 2, g: 4 }, { n: 'Dashed', d: 10, g: 5 }, { n: 'Dash-Dot', d: 10, g: 3 }].map(p => (
                <button key={p.n} aria-label={`${p.n} stroke pattern`} onClick={() => { setStrokeDash(p.d); setStrokeGap(p.g); }} style={{ flex: 1, padding: '4px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>{p.n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 19. Motion Blur */}
      {showMotionBlur && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Motion Blur</span>
            <button aria-label="Close Motion Blur panel" onClick={() => setShowMotionBlur(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Samples</span>
              <input type="range" min="2" max="32" value={motionBlurSamples} onChange={e => setMotionBlurSamples(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 18, textAlign: 'right' }}>{motionBlurSamples}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 50 }}>Shutter°</span>
              <input type="range" min="0" max="720" value={motionBlurShutter} onChange={e => setMotionBlurShutter(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>{motionBlurShutter}°</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '6px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>Higher samples = better quality, slower render. Shutter angle controls blur intensity (180° = standard film).</div>
          </div>
        </div>
      )}

      {/* 20. Export Presets */}
      {showExportPresets && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 350, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Export Presets</span>
            <button aria-label="Close Export Presets panel" onClick={() => setShowExportPresets(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
              {[{ f: 'mp4', c: 'h264', q: 'YouTube / Web' }, { f: 'mp4', c: 'h265', q: 'High Quality HEVC' }, { f: 'webm', c: 'vp9', q: 'Web Optimized' }, { f: 'mov', c: 'prores', q: 'ProRes Master' }, { f: 'png', c: 'png', q: 'PNG Sequence' }, { f: 'gif', c: 'gif', q: 'Animated GIF' }].map(p => (
                <button key={p.q} onClick={() => { setExportFormat(p.f); setExportCodec(p.c); }} aria-label={`Export as ${p.q}`} style={{ padding: '8px', borderRadius: 6, border: '1px solid ' + (exportFormat === p.f && exportCodec === p.c ? 'rgba(191,90,242,0.3)' : 'var(--color-bg-hover)'), background: exportFormat === p.f && exportCodec === p.c ? 'rgba(191,90,242,0.08)' : 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: exportFormat === p.f && exportCodec === p.c ? '#bf5af2' : 'var(--color-text-secondary)', fontWeight: 600 }}>{p.f.toUpperCase()} / {p.c.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{p.q}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 40 }}>Quality</span>
              <input type="range" min="10" max="100" value={exportQuality} onChange={e => setExportQuality(Number(e.target.value))} style={{ flex: 1, accentColor: '#bf5af2' }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 26, textAlign: 'right' }}>{exportQuality}%</span>
            </div>
            <button aria-label="Export with selected preset" onClick={() => { setShowExportPresets(false); }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #bf5af2, #9b59b6)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><DexIcon name="download" size={12} />Export</button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{layers.length} layers</span>
        <span>|</span>
        <span>Duration: {formatTime(duration)}</span>
        <span>|</span>
        <span>{is3DMode ? '3D' : '2D'} Mode{is3DMode && hardwareTier === 'low' ? ' (degraded)' : ''}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--color-text-muted)' }}>Ready</span>
      </div>

      {/* Right-click context menu */}
      {ctxMenu.visible && ctxMenu.layerId && (() => {
        const ctxLayer = layers.find(l => l.id === ctxMenu.layerId);
        if (!ctxLayer) return null;
        const menuItems = [
          { label: ctxLayer.visible ? 'Hide Layer' : 'Show Layer', fn: () => toggleLayerVisibility(ctxLayer.id) },
          { label: ctxLayer.locked ? 'Unlock Layer' : 'Lock Layer', fn: () => toggleLayerLock(ctxLayer.id) },
          { label: 'Duplicate Layer', fn: () => duplicateLayer(ctxLayer.id) },
          null,
          { label: 'Delete Layer', fn: () => deleteLayer(ctxLayer.id), disabled: layers.length <= 1, danger: true },
        ];
        return (
          <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 'var(--z-max)', minWidth: 160, background: 'var(--color-bg-elevated)', border: '1px solid #333', borderRadius: 8, padding: '4px 0', boxShadow: 'var(--pg-shadow-context)', animation: 'contextMenuIn 0.12s ease' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: '#333', margin: '4px 8px' }} />
              : <div key={i} className="flux-ctx-item" onClick={() => { if (!item.disabled) { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); } }} style={{ padding: '6px 14px', fontSize: 11, color: item.disabled ? '#555' : item.danger ? 'var(--color-error)' : '#e0e0e0', cursor: item.disabled ? 'default' : 'pointer', borderRadius: 4, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
      {showShortcutsPanel && <KeyboardShortcutsPanel appId="flux" onClose={() => setShowShortcutsPanel(false)} />}

      {/* Morph target modal */}
      {showMorphModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Morph shape to SVG path"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' }}
          onClick={() => setShowMorphModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 420, padding: 16, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, boxShadow: 'var(--pg-shadow-popover)', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>Morph to target SVG path</strong>
              <button type="button" style={styles.iconBtn} onClick={() => setShowMorphModal(false)} aria-label="Close morph dialog">{Icons.close}</button>
            </div>
            <label style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Target SVG path (M / L / Z commands)</label>
            <textarea
              value={morphPathInput}
              onChange={e => setMorphPathInput(e.target.value)}
              placeholder="M 0 0 L 100 0 L 50 87 Z"
              style={{ width: '100%', minHeight: 80, padding: 8, fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, resize: 'vertical' }}
              aria-label="Target SVG path"
            />
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
              Adds a path keyframe at the current playhead time. The shape interpolates from the previous keyframe (or its starting square) to this target.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                style={{ ...styles.btn, padding: '6px 12px', background: 'var(--color-bg-hover)' }}
                onClick={() => setShowMorphModal(false)}
              >Cancel</button>
              <button
                type="button"
                style={{ ...styles.btn, ...styles.btnPrimary, padding: '6px 12px' }}
                disabled={morphPathInput.trim().length === 0}
                onClick={() => {
                  const trimmed = morphPathInput.trim();
                  if (trimmed.length === 0) return;
                  applyMorphTarget(trimmed);
                  setShowMorphModal(false);
                }}
              >Morph</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize entire component for multi-window performance
Flux.displayName = 'Flux';
export default memo(Flux);
