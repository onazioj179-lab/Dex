/**
 * DEX Platform - FLUX Motion Graphics
 * Copyright (c) 2026 DEX. All rights reserved.
 * Professional motion graphics and visual effects
 */
import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { useRunningApps } from '../store/runningApps';
import { useBeginnerMode } from '../components/Onboarding';
import {
  EASING_PRESETS,
  COMPOSITION_PRESETS,
  EXPRESSION_TEMPLATES,
  EFFECT_DEFAULTS,
  getEasingFunction,
  interpolate as fluxInterpolate,
  cubicBezier,
} from './FluxFeatures';
import type { EasingPreset, CompositionSettings } from './FluxFeatures';

// ═══════════════════════════════════════════════════════════════════════════
// DEX FLUX - Professional Motion Graphics
// Apple Motion / After Effects alternative with animations, particles, behaviors
// ═══════════════════════════════════════════════════════════════════════════

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
  content?: string | HTMLImageElement | HTMLVideoElement;  // For text, image, video layers
  textStyle?: { fontSize: number; fontFamily: string; color: string; align: 'left' | 'center' | 'right' };
  shapeStyle?: { fill: string; stroke: string; strokeWidth: number; type: 'rectangle' | 'ellipse' | 'polygon' | 'star' };
  particleEmitter?: { birthRate: number; life: number; lifeRange: number; speed: number; speedRange: number; angle: number; angleRange: number; spin: number; spinRange: number; scale: number; scaleRange: number; color: string; colorRange: number; opacity: number; shape: 'circle' | 'point' | 'rectangle' | 'line' };
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
  { id: 'soft-glow', name: 'Soft Glow', category: 'glow', filters: [{ id: '1', type: 'glow', enabled: true, settings: { radius: 20, intensity: 0.6, color: '#ffffff' } }] },
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
  { id: 'snow', name: 'Snow', category: 'nature', emitter: { birthRate: 50, life: 5, lifeRange: 2, speed: 30, speedRange: 10, angle: -90, angleRange: 20, spin: 0, spinRange: 1, scale: 0.3, scaleRange: 0.2, color: '#ffffff', colorRange: 0, opacity: 0.8, shape: 'circle' } },
  { id: 'rain', name: 'Rain', category: 'nature', emitter: { birthRate: 100, life: 2, lifeRange: 0.5, speed: 200, speedRange: 50, angle: -90, angleRange: 5, spin: 0, spinRange: 0, scale: 0.1, scaleRange: 0.05, color: '#87ceeb', colorRange: 0.1, opacity: 0.6, shape: 'line' } },
  { id: 'fire', name: 'Fire', category: 'energy', emitter: { birthRate: 80, life: 1.5, lifeRange: 0.5, speed: 60, speedRange: 20, angle: -90, angleRange: 30, spin: 0, spinRange: 2, scale: 0.5, scaleRange: 0.3, color: '#ff6600', colorRange: 0.2, opacity: 0.9, shape: 'circle' } },
  { id: 'sparks', name: 'Sparks', category: 'energy', emitter: { birthRate: 40, life: 1, lifeRange: 0.3, speed: 150, speedRange: 80, angle: -90, angleRange: 60, spin: 0, spinRange: 5, scale: 0.15, scaleRange: 0.1, color: '#ffff00', colorRange: 0.1, opacity: 1, shape: 'point' } },
  { id: 'smoke', name: 'Smoke', category: 'nature', emitter: { birthRate: 20, life: 4, lifeRange: 1, speed: 20, speedRange: 10, angle: -90, angleRange: 15, spin: 0.1, spinRange: 0.2, scale: 0.8, scaleRange: 0.4, color: '#666666', colorRange: 0.1, opacity: 0.4, shape: 'circle' } },
  { id: 'confetti', name: 'Confetti', category: 'celebration', emitter: { birthRate: 60, life: 3, lifeRange: 1, speed: 80, speedRange: 40, angle: -90, angleRange: 45, spin: 2, spinRange: 3, scale: 0.4, scaleRange: 0.2, color: '#ff00ff', colorRange: 1, opacity: 1, shape: 'rectangle' } },
  { id: 'stars', name: 'Stars', category: 'abstract', emitter: { birthRate: 30, life: 2, lifeRange: 1, speed: 40, speedRange: 20, angle: 0, angleRange: 180, spin: 0.5, spinRange: 1, scale: 0.3, scaleRange: 0.15, color: '#ffffff', colorRange: 0.2, opacity: 0.9, shape: 'circle' } },
  { id: 'bubbles', name: 'Bubbles', category: 'nature', emitter: { birthRate: 25, life: 4, lifeRange: 2, speed: 40, speedRange: 15, angle: -90, angleRange: 20, spin: 0, spinRange: 0.5, scale: 0.5, scaleRange: 0.3, color: '#88ccff', colorRange: 0.1, opacity: 0.5, shape: 'circle' } },
  { id: 'dust', name: 'Dust', category: 'nature', emitter: { birthRate: 15, life: 6, lifeRange: 2, speed: 10, speedRange: 8, angle: -45, angleRange: 90, spin: 0.05, spinRange: 0.1, scale: 0.2, scaleRange: 0.15, color: '#d4a574', colorRange: 0.1, opacity: 0.3, shape: 'circle' } },
  { id: 'magic', name: 'Magic', category: 'energy', emitter: { birthRate: 35, life: 1.5, lifeRange: 0.5, speed: 50, speedRange: 30, angle: 0, angleRange: 180, spin: 1, spinRange: 2, scale: 0.25, scaleRange: 0.15, color: '#aa66ff', colorRange: 0.3, opacity: 0.8, shape: 'circle' } },
];

// ==================== COMPONENT ====================
const Flux: React.FC = () => {
  // ===== RUNNING APPS =====
  const { closeApp, setCurrentApp } = useRunningApps();

  // ===== BEGINNER MODE =====
  const { isBeginnerMode: beginnerMode } = useBeginnerMode('flux');
  const [activeTool, setActiveTool] = useState<string>('pointer');
  // Start empty - user creates their own content
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  
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
  
  // Panels
  const [activeTab, setActiveTab] = useState<'library' | 'behaviors' | 'filters' | 'inspector' | 'presets' | 'history'>('library');
  const [showTimeline, setShowTimeline] = useState(true);
  const [presetCategory, setPresetCategory] = useState<'animations' | 'effects' | 'particles' | 'easings'>('animations');
  
  // History
  const [history, setHistory] = useState<Array<{ layers: Layer[]; timestamp: number; description: string }>>([]);
  const isRestoringRef = useRef(false);
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Error states
  const [initError, setInitError] = React.useState<string | null>(null);
  const [canvasError, setCanvasError] = React.useState(false);

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
        if (data.is3DMode !== undefined) setIs3DMode(data.is3DMode);
        if (data.activeTab) setActiveTab(data.activeTab);
        if (data.showTimeline !== undefined) setShowTimeline(data.showTimeline);
        if (data.zoom) setZoom(data.zoom);
      } catch (e) {
        // Workspace JSON is corrupt — clear it so user starts fresh next time
        try { localStorage.removeItem('flux-workspace'); } catch {}
        setInitError('Could not restore the last project (file may be corrupt). Starting fresh.');
      }
    }
  }, []);

  useEffect(() => {
    try {
      const data = {
        activeTool, fps, duration, canvasSize, viewScale,
        is3DMode, activeTab, showTimeline, zoom,
      };
      localStorage.setItem('flux-workspace', JSON.stringify(data));
    } catch (e) { console.warn('[Flux] Failed to save workspace:', e); }
  }, [activeTool, fps, duration, canvasSize, viewScale, is3DMode, activeTab, showTimeline, zoom]);

  // ===== HISTORY TRACKING =====
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    setHistory(prev => {
      if (layers.length === 0 && prev.length === 0) return prev;
      return [...prev.slice(-49), {
        layers: layers.map(l => ({ ...l, content: typeof l.content === 'string' ? l.content : undefined })),
        timestamp: Date.now(),
        description: layers.length === 0 ? 'Cleared' : `${layers.length} layer${layers.length > 1 ? 's' : ''}`,
      }];
    });
  }, [layers]);

  // ===== EMPTY STATE =====
  const renderWelcome = () => (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      height: '100%', gap: '12px', textAlign: 'center',
    }}>
      <div style={{ color: 'var(--color-text-muted)', opacity: 0.3 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Add a layer to start</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => addLayer('shape')} aria-label="Add shape layer" style={{ 
          padding: '6px 14px', 
          background: 'rgba(10,132,255,0.12)', 
          border: '1px solid rgba(10,132,255,0.2)', borderRadius: '6px', color: '#0a84ff', fontSize: '11px', fontWeight: 500, 
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          </svg>
          Shape
        </button>
        <button onClick={() => addLayer('text')} aria-label="Add text layer" style={{ 
          padding: '6px 14px', 
          background: 'rgba(255,255,255,0.04)', 
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', 
          color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 500, 
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

    const frameDuration = 1000 / fps;
    
    const animate = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }
      
      const elapsed = timestamp - lastFrameTimeRef.current;
      
      if (elapsed >= frameDuration) {
        setCurrentTime(prev => {
          const next = prev + 1;
          if (next >= duration) {
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
        setPlayheadPosition(prev => {
          const next = prev + 1;
          return next >= duration ? 0 : next;
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
  }, [isPlaying, fps, duration]);

  // ===== CANVAS RENDERING =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      setCanvasError(true);
      return;
    }
    
    // High-quality rendering settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Clear canvas with background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    
    // Render layers from bottom to top (reversed order)
    const visibleLayers = layers.filter(l => l.visible && currentTime >= l.inPoint && currentTime <= l.outPoint).reverse();
    
    for (const layer of visibleLayers) {
      ctx.save();
      
      // Compute local time for this layer
      const localTime = currentTime - layer.inPoint;
      
      // Apply transform
      const { x, y, scaleX, scaleY, rotationZ, opacity, anchorX, anchorY } = layer.transform;
      ctx.globalAlpha = opacity / 100;
      ctx.translate(x, y);
      ctx.rotate((rotationZ * Math.PI) / 180);
      ctx.scale(scaleX / 100, scaleY / 100);
      ctx.translate(-anchorX, -anchorY);
      
      // Apply behaviors (calculate animated values)
      const animatedTransform = applyBehaviors(layer, currentTime);
      if (animatedTransform.x) ctx.translate(animatedTransform.x, 0);
      if (animatedTransform.y) ctx.translate(0, animatedTransform.y);
      if (animatedTransform.rotation) ctx.rotate((animatedTransform.rotation * Math.PI) / 180);
      if (animatedTransform.scale) ctx.scale(animatedTransform.scale, animatedTransform.scale);
      if (animatedTransform.opacity !== undefined) ctx.globalAlpha *= animatedTransform.opacity;
      
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
          gradient.addColorStop(0, '#1a1a2e');
          gradient.addColorStop(1, '#16213e');
          ctx.fillStyle = gradient;
          ctx.fillRect(-canvasSize.width / 2, -canvasSize.height / 2, canvasSize.width, canvasSize.height);
          break;
          
        case 'shape':
          const style = layer.shapeStyle || { fill: '#0a84ff', stroke: '#0a84ff', strokeWidth: 2, type: 'rectangle' as const };
          ctx.fillStyle = style.fill;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.strokeWidth;
          
          if (style.type === 'rectangle') {
            ctx.fillRect(-50, -50, 100, 100);
            ctx.strokeRect(-50, -50, 100, 100);
          } else if (style.type === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(0, 0, 50, 50, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          break;
          
        case 'text':
          const textStyle = layer.textStyle || { fontSize: 48, fontFamily: 'Arial', color: '#ffffff', align: 'center' as const };
          ctx.font = `${textStyle.fontSize}px ${textStyle.fontFamily}`;
          ctx.fillStyle = textStyle.color;
          ctx.textAlign = textStyle.align;
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.content as string || 'Text', 0, 0);
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
          // Real particle system using emitter settings
          const emitter = layer.particleEmitter || { birthRate: 20, life: 60, lifeRange: 20, speed: 2, speedRange: 1, angle: 270, angleRange: 30, spin: 0, spinRange: 0, scale: 1, scaleRange: 0.5, color: '#0a84ff', colorRange: 0, opacity: 1, shape: 'circle' as const };
          const particleCount = Math.min(emitter.birthRate * (emitter.life / fps), 500);
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
            
            const px = Math.cos(angle) * speed * particleAge;
            const py = Math.sin(angle) * speed * particleAge;
            const rotation = emitter.spin * particleAge + Math.sin(seed * 4.1) * emitter.spinRange * particleAge;
            const fadeOut = lifeProgress > 0.7 ? 1 - (lifeProgress - 0.7) / 0.3 : 1;
            const fadeIn = lifeProgress < 0.1 ? lifeProgress / 0.1 : 1;
            
            ctx.save();
            ctx.translate(px, py);
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
      
      // Reset filter after each layer
      ctx.filter = 'none';
      ctx.restore();
    }
  }, [layers, currentTime, canvasSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, layers, history, currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

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
    { id: 'pointer', icon: Icons.pointer, name: 'Select/Transform' },
    { id: 'move', icon: Icons.move, name: 'Move' },
    { id: 'rotate', icon: Icons.rotate, name: 'Rotate' },
    { id: 'scale', icon: Icons.scale, name: 'Scale' },
    { id: 'text', icon: Icons.text, name: 'Text' },
    { id: 'shape', icon: Icons.shape, name: 'Shape' },
    { id: 'pen', icon: Icons.pen, name: 'Bezier' },
    { id: 'particle', icon: Icons.particle, name: 'Particle' },
    { id: 'camera', icon: Icons.camera, name: 'Camera' },
    { id: 'light', icon: Icons.light, name: 'Light' },
    { id: 'hand', icon: Icons.hand, name: 'Pan' },
    { id: 'zoom', icon: Icons.zoom, name: 'Zoom' },
  ], []);

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
  const addLayer = useCallback((type: Layer['type']) => {
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
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
  }, [layers.length, currentTime, canvasSize]);

  const deleteLayer = useCallback((id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id && layers.length > 1) {
      setSelectedLayerId(layers[0]?.id || '');
    }
  }, [layers, selectedLayerId]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
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
    setLayers(prev => prev.map(l =>
      l.id === selectedLayerId ? { ...l, transform: { ...l.transform, ...updates } } : l
    ));
  }, [selectedLayerId]);

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
          if (data.settings.is3DMode !== undefined) setIs3DMode(data.settings.is3DMode);
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
      URL.revokeObjectURL(url);
    };

    // Store ref so the animation loop stops recording when done
    mediaRecorderRef.current = recorder;

    // Reset to start, begin recording, then play
    setCurrentTime(0);
    setPlayheadPosition(0);
    recorder.start();
    setIsPlaying(true);
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
    }, 'image/png', 1.0);
    
    console.info('Frame exported successfully. For video export, use Pro mode with sequence export.');
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
    container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '11px', overflow: 'hidden', transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', height: '36px', minHeight: '36px' },
    logo: { fontSize: '12px', fontWeight: 600, color: '#bf5af2', letterSpacing: '1px' },
    headerCenter: { display: 'flex', alignItems: 'center', gap: '6px' },
    btn: { padding: '5px 10px', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500 },
    btnPrimary: { background: 'linear-gradient(135deg, #bf5af2, #bf5af2)', color: '#fff', border: '1px solid rgba(191,90,242,0.5)' },
    workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
    toolbar: { width: '40px', background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '8px 4px', gap: '2px' },
    toolBtn: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '4px', color: 'var(--color-text-muted)', cursor: 'pointer' },
    toolBtnActive: { background: '#bf5af2', color: '#fff' },
    mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    canvasArea: { flex: 1, display: 'flex', overflow: 'hidden' },
    canvasContainer: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-inset)', position: 'relative' },
    canvas: { background: '#000', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: '2px' },
    sidebar: { width: '220px', background: 'var(--color-bg-secondary)', borderLeft: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
    tab: { flex: 1, padding: '8px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' },
    tabActive: { color: '#bf5af2', borderBottom: '2px solid #bf5af2' },
    panelContent: { flex: 1, padding: '10px', overflow: 'auto' },
    timeline: { height: showTimeline ? '200px' : '32px', background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', transition: 'height 0.2s ease' },
    timelineHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)' },
    transportControls: { display: 'flex', alignItems: 'center', gap: '2px' },
    transportBtn: { width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', color: 'var(--color-text-primary)', cursor: 'pointer' },
    timeDisplay: { fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px 8px', background: 'var(--color-bg-inset)', borderRadius: '4px', color: '#bf5af2', border: '1px solid var(--color-border-subtle)', fontWeight: 600 },
    timelineTracks: { flex: 1, display: 'flex', overflow: 'hidden' },
    layerList: { width: '170px', background: 'var(--color-bg-inset)', borderRight: '1px solid var(--color-border-subtle)', overflow: 'auto' },
    layerItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' },
    layerItemSelected: { background: 'rgba(191,90,242,0.1)', borderLeft: '2px solid #bf5af2' },
    layerIcon: { width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' },
    layerName: { flex: 1, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
    trackArea: { flex: 1, overflow: 'auto', position: 'relative', background: 'var(--color-bg-inset)' },
    track: { height: '28px', position: 'relative', borderBottom: '1px solid var(--color-border-subtle)' },
    trackClip: { position: 'absolute', top: '3px', height: '22px', background: 'linear-gradient(135deg, #bf5af2, #bf5af2)', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '9px', cursor: 'grab', fontWeight: 500, color: '#fff', boxShadow: '0 1px 4px rgba(191,90,242,0.3)' },
    playhead: { position: 'absolute', top: 0, width: '1px', background: '#ff453a', zIndex: 100 },
    ruler: { height: '20px', background: 'var(--color-bg-inset)', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'flex-end' },
    behaviorItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-bg-hover)', borderRadius: '4px', marginBottom: '4px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    iconBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' },
    statusBar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 12px', background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border)', fontSize: '10px', color: 'var(--color-text-muted)' },
    modeToggle: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--color-bg-hover)', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', border: '1px solid var(--color-border-subtle)', fontWeight: 500 },
    libraryGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' },
    libraryItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', background: 'var(--color-bg-hover)', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--color-border-subtle)' },
    sliderRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
    sliderLabel: { width: '70px', fontSize: '10px', color: 'var(--color-text-tertiary)', fontWeight: 500 },
    slider: { flex: 1, accentColor: '#bf5af2' },
    sliderValue: { width: '36px', fontSize: '10px', textAlign: 'right', color: '#bf5af2', fontFamily: 'var(--font-mono)', fontWeight: 600 },
  }), [showTimeline]);

  return (
    <div style={styles.container}>
      <style>{`
        /* === FLUX - PROFESSIONAL UI POLISH === */
        button { font-family: inherit; transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
        button:active { transform: scale(0.98); }
        .flux-btn-primary:hover {
          background: linear-gradient(145deg, #bf5af2 0%, #bf5af2 50%, #bf5af2 100%) !important;
          box-shadow: 0 8px 28px rgba(191,90,242,0.5) !important;
        }
        .flux-layer-item:hover {
          border-color: rgba(191,90,242,0.4) !important;
          background: rgba(191,90,242,0.08) !important;
        }
        .flux-tool-btn:hover {
          background: rgba(191,90,242,0.15) !important;
          color: #bf5af2 !important;
        }
        .flux-behavior-item:hover {
          border-color: rgba(191,90,242,0.3) !important;
          background: rgba(191,90,242,0.06) !important;
        }
        ::-webkit-scrollbar { width: 7px; height: 7px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(191,90,242,0.2); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(191,90,242,0.4); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { 
          -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; 
          background: linear-gradient(145deg, #bf5af2, #bf5af2); cursor: pointer; margin-top: -6px;
          box-shadow: 0 2px 8px rgba(191,90,242,0.4);
          transition: all 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(191,90,242,0.5); }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(191,90,242,0.15); border-radius: 2px; }
        .flux-tab:hover { color: rgba(191,90,242,0.9) !important; background: rgba(191,90,242,0.05) !important; }
        .flux-transport-btn:hover { background: rgba(191,90,242,0.2) !important; border-color: rgba(191,90,242,0.3) !important; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.logo}>FLUX</div>
        </div>
        <div style={styles.headerCenter}>
          <button style={styles.btn} onClick={importMedia} aria-label="Import media">{Icons.upload} Import</button>
          <button style={styles.btn} onClick={openProject} aria-label="Open project">{Icons.folder} Open</button>
          <button style={styles.btn} onClick={saveProject} aria-label="Save project">{Icons.save} Save</button>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={exportProject} aria-label="Export project">{Icons.download} Export</button>
          <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
          <select
            style={{ fontSize: '11px', background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-subtle)', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}
            value=""
            onChange={(e) => {
              const preset = COMPOSITION_PRESETS.find(p => p.name === e.target.value);
              if (preset) { setCanvasSize({ width: preset.width, height: preset.height }); setFps(preset.frameRate); }
            }}
          >
            <option value="" disabled>{canvasSize.width} × {canvasSize.height}</option>
            {COMPOSITION_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name} ({p.width}×{p.height})</option>
            ))}
          </select>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{fps} fps</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        </div>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          {tools.map(tool => (
            <button
              key={tool.id}
              style={{ ...styles.toolBtn, ...(activeTool === tool.id ? styles.toolBtnActive : {}) }}
              onClick={() => setActiveTool(tool.id)}
              title={tool.name}
              aria-label={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        {/* Main Canvas Area */}
        <div style={styles.mainArea}>
          {layers.length === 0 ? renderWelcome() : (
          <div style={styles.canvasArea}
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
                  <span style={{ fontSize: 12, color: '#ff9f0a' }}>{initError}</span>
                  <button onClick={() => setInitError(null)} aria-label="Dismiss error" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff9f0a', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              )}
              {isDragOver && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(191,90,242,0.1)', border: '2px dashed rgba(191,90,242,0.5)', borderRadius: '8px', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ color: '#bf5af2', fontSize: '14px', fontWeight: 600 }}>Drop media here</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                style={{ ...styles.canvas, transform: `scale(${viewScale / 100})` }}
              />
              {canvasError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', gap: 12 }}>
                  <span style={{ fontSize: 32, opacity: 0.4 }}>alert-triangle</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 260 }}>Canvas unavailable. Try restarting DEX or updating your graphics driver.</span>
                </div>
              )}
              {/* Overlay UI - Canvas Zoom Controls */}
              <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '10px', padding: '6px 12px' }}>
                <button style={{ ...styles.btn, padding: '4px 8px', fontSize: '12px' }} onClick={() => setViewScale(Math.max(10, viewScale - 10))} title="Zoom Out" aria-label="Zoom out">−</button>
                <input 
                  type="range" 
                  min="10" 
                  max="200" 
                  value={viewScale} 
                  onChange={(e) => setViewScale(Number(e.target.value))} 
                  style={{ width: '100px', accentColor: '#bf5af2', cursor: 'pointer' }} 
                  title={`Canvas scale: ${Math.round(viewScale)}%`}
                />
                <button style={{ ...styles.btn, padding: '4px 8px', fontSize: '12px' }} onClick={() => setViewScale(Math.min(200, viewScale + 10))} title="Zoom In" aria-label="Zoom in">+</button>
                <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '11px', fontWeight: 500, minWidth: '40px', textAlign: 'center' }}>{Math.round(viewScale)}%</span>
                <button style={{ ...styles.btn, padding: '4px 8px', fontSize: '10px' }} onClick={() => setViewScale(50)} title="Reset to 50%" aria-label="Fit to view">Fit</button>
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

              <div style={styles.panelContent}>
                {/* Presets Panel */}
                {activeTab === 'presets' && (
                  <div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                      {(['animations', 'effects', 'particles', 'easings'] as const).map(cat => (
                        <button key={cat} onClick={() => setPresetCategory(cat)} aria-label={`${cat} presets`} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: 'none', background: presetCategory === cat ? '#0a84ff' : 'var(--color-bg-tertiary)', color: presetCategory === cat ? 'white' : 'var(--color-text-secondary)', fontSize: '10px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>{cat}</button>
                      ))}
                    </div>
                    
                    {presetCategory === 'animations' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Intro</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'intro').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Outro</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'outro').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Emphasis</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'emphasis').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.zap}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Loop</div>
                        {ANIMATION_PRESETS.filter(p => p.category === 'loop').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.behaviors.forEach(b => addBehavior(selectedLayerId, b.type))}>
                            {Icons.loop}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {presetCategory === 'effects' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Glow</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'glow').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.sparkle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Blur</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'blur').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.filter}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Color</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'color').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.sliders}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Other</div>
                        {EFFECT_PRESETS.filter(p => p.category === 'distort' || p.category === 'stylize').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => selectedLayerId && preset.filters.forEach(f => addFilter(selectedLayerId, f.type))}>
                            {Icons.wand}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {presetCategory === 'particles' && (
                      <>
                        <div style={{ marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Nature</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'nature').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => addLayer('particle')}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Energy</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'energy').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => addLayer('particle')}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Celebration</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'celebration').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => addLayer('particle')}>
                            {Icons.particle}<span style={{ fontSize: '11px' }}>{preset.name}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '12px', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Abstract</div>
                        {PARTICLE_PRESETS.filter(p => p.category === 'abstract').map(preset => (
                          <div key={preset.id} style={styles.behaviorItem} onClick={() => addLayer('particle')}>
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
                              <div style={{ marginTop: cat !== 'basic' ? '12px' : '0', marginBottom: '8px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{cat}</div>
                              {items.map(preset => (
                                <div key={preset.id} style={{ ...styles.behaviorItem, flexDirection: 'column' as const, alignItems: 'flex-start', gap: '2px' }}>
                                  <span style={{ fontSize: '11px' }}>{preset.name}</span>
                                  <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>cubic-bezier({preset.bezier.join(', ')})</span>
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
                      <div style={{ color: '#30d158', marginBottom: '4px' }}>{Icons.image}</div>
                      <span style={{ fontSize: '10px' }}>Image</span>
                    </div>
                    <div style={styles.libraryItem} onClick={importMedia}>
                      <div style={{ color: '#ff375f', marginBottom: '4px' }}>{Icons.video}</div>
                      <span style={{ fontSize: '10px' }}>Video</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('text')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.text}</div>
                      <span style={{ fontSize: '10px' }}>Text</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('shape')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.shape}</div>
                      <span style={{ fontSize: '10px' }}>Shape</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('particle')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.particle}</div>
                      <span style={{ fontSize: '10px' }}>Particles</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('generator')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.grid}</div>
                      <span style={{ fontSize: '10px' }}>Generator</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('camera')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.camera}</div>
                      <span style={{ fontSize: '10px' }}>Camera</span>
                    </div>
                    <div style={styles.libraryItem} onClick={() => addLayer('light')}>
                      <div style={{ color: '#0a84ff', marginBottom: '4px' }}>{Icons.light}</div>
                      <span style={{ fontSize: '10px' }}>Light</span>
                    </div>
                  </div>
                )}

                {/* Behaviors Panel */}
                {activeTab === 'behaviors' && (
                  <div>
                    <div style={{ marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Basic Behaviors</div>
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
                    
                    <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Motion</div>
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
                    
                    <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Simulation</div>
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
                    <div style={{ marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Transform</div>
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
                      <span style={styles.sliderValue}>{selectedLayer.transform.rotationZ}°</span>
                    </div>
                    <div style={styles.sliderRow}>
                      <span style={styles.sliderLabel}>Opacity</span>
                      <input type="range" min="0" max="100" value={selectedLayer.transform.opacity} style={styles.slider} onChange={(e) => updateLayerTransform({ opacity: Number(e.target.value) })} />
                      <span style={styles.sliderValue}>{selectedLayer.transform.opacity}%</span>
                    </div>
                    
                    {selectedLayer.behaviors.length > 0 && (
                      <>
                        <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Applied Behaviors</div>
                        {selectedLayer.behaviors.map(b => (
                          <div key={b.id} style={{ ...styles.behaviorItem, background: 'rgba(10, 132, 255, 0.2)' }}>
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
                    <div style={{ marginBottom: '12px', fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>History ({history.length})</div>
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
                          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
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
          )}

          {/* Timeline */}
          <div style={styles.timeline}>
            <div style={styles.timelineHeader}>
              <button style={styles.iconBtn} onClick={() => setShowTimeline(!showTimeline)} aria-label="Toggle timeline">
                {showTimeline ? Icons.chevronDown : Icons.chevronRight}
              </button>
              <div style={styles.transportControls}>
                <button style={styles.transportBtn} onClick={goToStart} aria-label="Skip to start">{Icons.skipBack}</button>
                <button style={{ ...styles.transportBtn, ...(isPlaying ? { background: '#0a84ff' } : {}) }} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? Icons.pause : Icons.play}
                </button>
                <button style={styles.transportBtn} onClick={goToEnd} aria-label="Skip to end">{Icons.skipForward}</button>
              </div>
              <div style={styles.timeDisplay}>{formatTime(currentTime)}</div>
              <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
              <button style={styles.iconBtn} title="Loop" onClick={() => { /* toggle timeline loop */ }} aria-label="Toggle loop">{Icons.loop}</button>
              <button style={styles.iconBtn} title="Add Keyframe" onClick={() => { /* insert keyframe at currentTime */ }} aria-label="Add keyframe">{Icons.keyframe}</button>
              <div style={{ flex: 1 }} />
              {/* Timeline Zoom */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button style={{ ...styles.iconBtn, fontSize: '10px' }} onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} aria-label="Zoom out timeline">−</button>
                <input type="range" min="25" max="400" value={zoom * 100} onChange={(e) => setZoom(Number(e.target.value) / 100)} style={{ width: '80px', accentColor: '#bf5af2' }} title={`Timeline zoom: ${Math.round(zoom * 100)}%`} />
                <button style={{ ...styles.iconBtn, fontSize: '10px' }} onClick={() => setZoom(z => Math.min(4, z + 0.25))} aria-label="Zoom in timeline">+</button>
                <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', minWidth: '32px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
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
                  {/* Ruler */}
                  <div style={styles.ruler}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0);
                      const totalWidth = (duration / fps + 1) * 100 * zoom;
                      const clickedTime = Math.round((x / totalWidth) * duration);
                      setCurrentTime(Math.max(0, Math.min(duration, clickedTime)));
                    }}
                  >
                    {Array.from({ length: Math.ceil(duration / fps) + 1 }).map((_, i) => (
                      <div key={i} style={{ width: `${100 * zoom}px`, fontSize: '9px', color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: '4px', cursor: 'pointer', flexShrink: 0 }}>
                        {formatTime(i * fps)}
                      </div>
                    ))}
                  </div>
                  
                  {/* Tracks */}
                  {layers.map(layer => (
                    <div key={layer.id} style={styles.track}>
                      <div
                        style={{
                          ...styles.trackClip,
                          left: `${(layer.inPoint / duration) * 100}%`,
                          width: `${((layer.outPoint - layer.inPoint) / duration) * 100}%`,
                          opacity: selectedLayerId === layer.id ? 1 : 0.7,
                        }}
                      >
                        {layer.name}
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

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{layers.length} layers</span>
        <span>|</span>
        <span>Duration: {formatTime(duration)}</span>
        <span>|</span>
        <span>{is3DMode ? '3D' : '2D'} Mode</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--color-text-muted)' }}>Ready</span>
      </div>
    </div>
  );
};

// Memoize entire component for multi-window performance
Flux.displayName = 'Flux';
export default memo(Flux);
