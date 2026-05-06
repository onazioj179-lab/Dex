// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Visual Effects System
// 10 effects: frosted glass, depth shadows, particles, depth of field,
// ambient glow, color transitions, surface reflection, motion blur,
// scroll trail, focus ring pulse.
// All effects respect prefers-reduced-motion and degrade gracefully.
// ===========================================================================

import { isReduceMotion } from '../utils/MotionController';
import { getAdaptiveDPR } from '../utils/adaptiveCanvas';
import { unifiedMotionSystem } from '../services/UnifiedMotionSystem';

// ---------------------------------------------------------------------------
// Performance Tier Detection (renderer-side, no native dependency)
// ---------------------------------------------------------------------------

type EffectTier = 'high' | 'medium' | 'low';

function detectTier(): EffectTier {
  if (typeof navigator === 'undefined') return 'low';
  const cores = navigator.hardwareConcurrency || 2;
  if (cores >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

const TIER: EffectTier = detectTier();

const TIER_CONFIG = {
  high:   { maxParticles: 200, maxBlurSurfaces: 10, motionBlur: true,  particleBurst: 30, shadowLayers: 3, backdropFilter: true,  particles: true  },
  medium: { maxParticles: 50,  maxBlurSurfaces: 4,  motionBlur: false, particleBurst: 15, shadowLayers: 2, backdropFilter: true,  particles: true  },
  low:    { maxParticles: 20,  maxBlurSurfaces: 1,  motionBlur: false, particleBurst: 8,  shadowLayers: 1, backdropFilter: false, particles: false },
} as const;

function config() { return TIER_CONFIG[TIER]; }

// ---------------------------------------------------------------------------
// Auto-disable backdrop-filter & particles on low-end (items 134-135)
// Injects a style sheet that strips blur/particles on tier=low or when the
// PerformanceOptimization store tier drops to tier-3-standard/critical.
// ---------------------------------------------------------------------------

let lowEndStyleInjected = false;

function injectLowEndOverrides(): void {
  if (lowEndStyleInjected) return;
  lowEndStyleInjected = true;

  const style = document.createElement('style');
  style.id = 'dex-low-end-overrides';
  style.textContent = `
    body.dex-low-end *,
    body.dex-low-end *::before,
    body.dex-low-end *::after {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    body.dex-low-end canvas[style*="pointer-events: none"] {
      display: none !important;
    }
    body.dex-medium-tier .dex-frosted-glass,
    body.dex-medium-tier .dex-frosted-glass::before,
    body.dex-medium-tier .dex-frosted-glass::after {
      backdrop-filter: blur(12px) saturate(150%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(150%) !important;
    }
  `;
  document.head.appendChild(style);
}

export function applyTierOverrides(): void {
  injectLowEndOverrides();
  if (!config().backdropFilter) {
    document.body.classList.add('dex-low-end');
    document.body.classList.remove('dex-medium-tier');
  } else if (TIER === 'medium') {
    document.body.classList.remove('dex-low-end');
    document.body.classList.add('dex-medium-tier');
  } else {
    document.body.classList.remove('dex-low-end');
    document.body.classList.remove('dex-medium-tier');
  }
}

// Run on init — components can re-call after tier changes
applyTierOverrides();

// ---------------------------------------------------------------------------
// 1. Frosted Glass
// ---------------------------------------------------------------------------

let frostedStyleInjected = false;

function injectFrostedStyles(): void {
  if (frostedStyleInjected) return;
  frostedStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-frosted-glass {
      background: var(--color-border-subtle);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid var(--color-border);
      transition: backdrop-filter 0.3s ease;
    }
    .dex-frosted-glass--light {
      background: var(--color-text-secondary);
      backdrop-filter: blur(24px) saturate(200%);
      -webkit-backdrop-filter: blur(24px) saturate(200%);
      border: 1px solid var(--color-text-tertiary);
    }
    .dex-frosted-glass--dark {
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(16px) saturate(150%);
      -webkit-backdrop-filter: blur(16px) saturate(150%);
      border: 1px solid var(--color-bg-hover);
    }
    .dex-frosted-glass--subtle {
      background: var(--color-border-subtle);
      backdrop-filter: blur(8px) saturate(120%);
      -webkit-backdrop-filter: blur(8px) saturate(120%);
      border: 1px solid var(--color-bg-hover);
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-frosted-glass,
      .dex-frosted-glass--light,
      .dex-frosted-glass--dark,
      .dex-frosted-glass--subtle {
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        background: rgba(30, 30, 30, 0.95);
      }
    }
  `;
  document.head.appendChild(style);
}

export type FrostedVariant = 'default' | 'light' | 'dark' | 'subtle';

export function applyFrostedGlass(el: HTMLElement, variant: FrostedVariant = 'default'): void {
  injectFrostedStyles();
  // On low-end devices, skip backdrop-filter — use solid fallback
  if (!config().backdropFilter) {
    el.style.background = 'rgba(30, 30, 30, 0.95)';
    return;
  }
  el.classList.remove(
    'dex-frosted-glass',
    'dex-frosted-glass--light',
    'dex-frosted-glass--dark',
    'dex-frosted-glass--subtle',
  );
  if (variant === 'default') {
    el.classList.add('dex-frosted-glass');
  } else {
    el.classList.add(`dex-frosted-glass--${variant}`);
  }
}

export function removeFrostedGlass(el: HTMLElement): void {
  el.classList.remove(
    'dex-frosted-glass',
    'dex-frosted-glass--light',
    'dex-frosted-glass--dark',
    'dex-frosted-glass--subtle',
  );
}

// ---------------------------------------------------------------------------
// 2. Depth Shadows
// ---------------------------------------------------------------------------

let shadowStyleInjected = false;

function injectShadowStyles(): void {
  if (shadowStyleInjected) return;
  shadowStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-depth-shadow--1 {
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.12),
        0 1px 2px rgba(0, 0, 0, 0.24);
    }
    .dex-depth-shadow--2 {
      box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.16),
        0 3px 6px rgba(0, 0, 0, 0.23);
    }
    .dex-depth-shadow--3 {
      box-shadow:
        0 10px 20px rgba(0, 0, 0, 0.19),
        0 6px 6px rgba(0, 0, 0, 0.23);
    }
    .dex-depth-shadow--4 {
      box-shadow:
        0 14px 28px rgba(0, 0, 0, 0.25),
        0 10px 10px rgba(0, 0, 0, 0.22);
    }
    .dex-depth-shadow--5 {
      box-shadow:
        0 19px 38px rgba(0, 0, 0, 0.30),
        0 15px 12px rgba(0, 0, 0, 0.22);
    }
    .dex-depth-shadow--floating {
      box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.35),
        0 8px 20px rgba(0, 0, 0, 0.2),
        0 0 1px rgba(0, 0, 0, 0.15);
    }
  `;
  document.head.appendChild(style);
}

export type ShadowDepth = 1 | 2 | 3 | 4 | 5 | 'floating';

export function applyDepthShadow(el: HTMLElement, depth: ShadowDepth = 2): void {
  injectShadowStyles();
  for (let i = 1; i <= 5; i++) {
    el.classList.remove(`dex-depth-shadow--${i}`);
  }
  el.classList.remove('dex-depth-shadow--floating');
  el.classList.add(`dex-depth-shadow--${depth}`);
}

export function removeDepthShadow(el: HTMLElement): void {
  for (let i = 1; i <= 5; i++) {
    el.classList.remove(`dex-depth-shadow--${i}`);
  }
  el.classList.remove('dex-depth-shadow--floating');
}

// ---------------------------------------------------------------------------
// 3. Particle System (JS fallback)
// ---------------------------------------------------------------------------

interface JsParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  life: number;
  maxLife: number;
  size: number;
}

let particlePool: JsParticle[] = [];
let particleCanvas: HTMLCanvasElement | null = null;
let particleCtx: CanvasRenderingContext2D | null = null;
let particleRaf: number | null = null;
let particleLastTime = 0;
let _particleResizeHandler: (() => void) | null = null;

function ensureParticleCanvas(): CanvasRenderingContext2D | null {
  if (particleCtx) return particleCtx;
  if (typeof document === 'undefined') return null;

  particleCanvas = document.createElement('canvas');
  particleCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: var(--z-emergency, 50000);
  `;
  particleCanvas.width = window.innerWidth * getAdaptiveDPR();
  particleCanvas.height = window.innerHeight * getAdaptiveDPR();
  document.body.appendChild(particleCanvas);

  const ctx = particleCanvas.getContext('2d');
  if (ctx) {
    ctx.scale(getAdaptiveDPR(), getAdaptiveDPR());
    particleCtx = ctx;
  }

  const resizeHandler = () => {
    if (!particleCanvas) return;
    const dpr = getAdaptiveDPR();
    particleCanvas.width = window.innerWidth * dpr;
    particleCanvas.height = window.innerHeight * dpr;
    if (particleCtx) {
      particleCtx.scale(dpr, dpr);
    }
  };
  _particleResizeHandler = resizeHandler;
  window.addEventListener('resize', resizeHandler);

  return particleCtx;
}

function tickParticles(): void {
  const ctx = ensureParticleCanvas();
  if (!ctx || !particleCanvas) return;

  const now = performance.now();
  const dt = Math.min((now - particleLastTime) / 1000, 0.064);
  particleLastTime = now;

  ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  let alive = 0;
  for (let i = particlePool.length - 1; i >= 0; i--) {
    const p = particlePool[i];
    p.vy += 120 * dt; // gravity
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (p.life <= 0) {
      particlePool.splice(i, 1);
      continue;
    }

    alive++;
    const lifeRatio = p.life / p.maxLife;
    const alpha = lifeRatio;
    const size = p.size * Math.max(0.2, lifeRatio);

    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.round(p.r * 255)}, ${Math.round(p.g * 255)}, ${Math.round(p.b * 255)}, ${alpha})`;
    ctx.fill();
  }

  if (alive > 0) {
    particleRaf = requestAnimationFrame(tickParticles);
  } else {
    particleRaf = null;
  }
}

export function spawnParticleBurst(
  x: number,
  y: number,
  count?: number,
  color?: { r: number; g: number; b: number },
): void {
  if (isReduceMotion()) return;
  if (!config().particles) return; // auto-disable on low-end tier

  const maxCount = count ?? config().particleBurst;
  const c = color ?? { r: 0.4, g: 0.6, b: 1.0 };
  const maxTotal = config().maxParticles;

  for (let i = 0; i < maxCount && particlePool.length < maxTotal; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;
    const life = 0.4 + Math.random() * 0.8;
    particlePool.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: c.r, g: c.g, b: c.b,
      alpha: 1,
      life,
      maxLife: life,
      size: 2 + Math.random() * 6,
    });
  }

  if (particleRaf === null) {
    particleLastTime = performance.now();
    particleRaf = requestAnimationFrame(tickParticles);
  }
}

export function clearParticles(): void {
  particlePool = [];
  if (particleRaf !== null) {
    cancelAnimationFrame(particleRaf);
    particleRaf = null;
  }
  if (particleCtx && particleCanvas) {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  }
  // Remove resize listener to prevent leak on HMR/cleanup
  if (_particleResizeHandler) {
    window.removeEventListener('resize', _particleResizeHandler);
    _particleResizeHandler = null;
  }
}

// ---------------------------------------------------------------------------
// 4. Depth of Field
// ---------------------------------------------------------------------------

let dofStyleInjected = false;

function injectDofStyles(): void {
  if (dofStyleInjected) return;
  dofStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-dof-background {
      filter: blur(4px);
      transition: filter 0.3s ease;
    }
    .dex-dof-background--heavy {
      filter: blur(8px);
    }
    .dex-dof-foreground {
      filter: none;
      z-index: 1;
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-dof-background,
      .dex-dof-background--heavy {
        filter: none;
        opacity: 0.5;
      }
    }
  `;
  document.head.appendChild(style);
}

export function applyDepthOfField(foreground: HTMLElement, background: HTMLElement, heavy = false): void {
  injectDofStyles();
  background.classList.add('dex-dof-background');
  if (heavy) background.classList.add('dex-dof-background--heavy');
  foreground.classList.add('dex-dof-foreground');
}

export function removeDepthOfField(foreground: HTMLElement, background: HTMLElement): void {
  background.classList.remove('dex-dof-background', 'dex-dof-background--heavy');
  foreground.classList.remove('dex-dof-foreground');
}

// ---------------------------------------------------------------------------
// 5. Ambient Glow
// ---------------------------------------------------------------------------

let glowStyleInjected = false;

function injectGlowStyles(): void {
  if (glowStyleInjected) return;
  glowStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-ambient-glow {
      position: relative;
    }
    .dex-ambient-glow::after {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: inherit;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
      z-index: -1;
    }
    .dex-ambient-glow--active::after {
      opacity: 1;
    }
    .dex-ambient-glow--blue::after {
      box-shadow: 0 0 30px rgba(59, 130, 246, 0.4), 0 0 60px rgba(59, 130, 246, 0.2);
    }
    .dex-ambient-glow--purple::after {
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2);
    }
    .dex-ambient-glow--green::after {
      box-shadow: 0 0 30px rgba(34, 197, 94, 0.4), 0 0 60px rgba(34, 197, 94, 0.2);
    }
    .dex-ambient-glow--amber::after {
      box-shadow: 0 0 30px rgba(245, 158, 11, 0.4), 0 0 60px rgba(245, 158, 11, 0.2);
    }
    .dex-ambient-glow--red::after {
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.4), 0 0 60px rgba(239, 68, 68, 0.2);
    }
    .dex-ambient-glow--white::after {
      box-shadow: 0 0 30px var(--color-text-tertiary), 0 0 60px var(--color-border);
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-ambient-glow::after {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

export type GlowColor = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'white';

export function applyAmbientGlow(el: HTMLElement, color: GlowColor = 'blue', active = true): void {
  injectGlowStyles();
  el.classList.add('dex-ambient-glow', `dex-ambient-glow--${color}`);
  if (active) {
    el.classList.add('dex-ambient-glow--active');
  } else {
    el.classList.remove('dex-ambient-glow--active');
  }
}

export function removeAmbientGlow(el: HTMLElement): void {
  el.classList.remove(
    'dex-ambient-glow', 'dex-ambient-glow--active',
    'dex-ambient-glow--blue', 'dex-ambient-glow--purple',
    'dex-ambient-glow--green', 'dex-ambient-glow--amber',
    'dex-ambient-glow--red', 'dex-ambient-glow--white',
  );
}

// ---------------------------------------------------------------------------
// 6. Color Transitions
// ---------------------------------------------------------------------------

let colorTransitionStyleInjected = false;

function injectColorTransitionStyles(): void {
  if (colorTransitionStyleInjected) return;
  colorTransitionStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-color-transition {
      transition: background-color 0.4s ease, color 0.4s ease, border-color 0.4s ease;
    }
    .dex-color-transition--fast {
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .dex-color-transition--slow {
      transition: background-color 0.8s ease, color 0.8s ease, border-color 0.8s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-color-transition,
      .dex-color-transition--fast,
      .dex-color-transition--slow {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

export type TransitionSpeed = 'default' | 'fast' | 'slow';

export function applyColorTransition(el: HTMLElement, speed: TransitionSpeed = 'default'): void {
  injectColorTransitionStyles();
  el.classList.remove('dex-color-transition', 'dex-color-transition--fast', 'dex-color-transition--slow');
  if (speed === 'default') {
    el.classList.add('dex-color-transition');
  } else {
    el.classList.add(`dex-color-transition--${speed}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Surface Reflection
// ---------------------------------------------------------------------------

let reflectionStyleInjected = false;

function injectReflectionStyles(): void {
  if (reflectionStyleInjected) return;
  reflectionStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-surface-reflection {
      position: relative;
      overflow: hidden;
    }
    .dex-surface-reflection::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        115deg,
        transparent 40%,
        var(--color-bg-hover) 45%,
        var(--color-border) 50%,
        var(--color-bg-hover) 55%,
        transparent 60%
      );
      transform: translateX(-100%) rotate(0deg);
      pointer-events: none;
      z-index: 1;
    }
    .dex-surface-reflection--shimmer::before {
      animation: dex-shimmer 3s ease-in-out infinite;
    }
    @keyframes dex-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-surface-reflection::before {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

export function applySurfaceReflection(el: HTMLElement, shimmer = false): void {
  injectReflectionStyles();
  el.classList.add('dex-surface-reflection');
  if (shimmer) {
    el.classList.add('dex-surface-reflection--shimmer');
  }
}

export function removeSurfaceReflection(el: HTMLElement): void {
  el.classList.remove('dex-surface-reflection', 'dex-surface-reflection--shimmer');
}

// ---------------------------------------------------------------------------
// 8. Motion Blur
// ---------------------------------------------------------------------------

let motionBlurStyleInjected = false;

function injectMotionBlurStyles(): void {
  if (motionBlurStyleInjected) return;
  motionBlurStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-motion-blur--x {
      filter: blur(0px);
      transition: filter 0.1s linear;
    }
    .dex-motion-blur--x.dex-motion-blur--active {
      filter: blur(2px);
    }
    .dex-motion-blur--y {
      filter: blur(0px);
      transition: filter 0.1s linear;
    }
    .dex-motion-blur--y.dex-motion-blur--active {
      filter: blur(2px);
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-motion-blur--x,
      .dex-motion-blur--y {
        filter: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export type BlurAxis = 'x' | 'y';

export function applyMotionBlur(el: HTMLElement, axis: BlurAxis, velocityPx: number): void {
  if (!config().motionBlur || isReduceMotion()) return;
  injectMotionBlurStyles();

  el.classList.add(`dex-motion-blur--${axis}`);
  const intensity = Math.min(Math.abs(velocityPx) / 500, 1);

  if (intensity > 0.1) {
    el.classList.add('dex-motion-blur--active');
    el.style.filter = `blur(${intensity * 4}px)`;
  } else {
    el.classList.remove('dex-motion-blur--active');
    el.style.filter = '';
  }
}

export function removeMotionBlur(el: HTMLElement): void {
  el.classList.remove('dex-motion-blur--x', 'dex-motion-blur--y', 'dex-motion-blur--active');
  el.style.filter = '';
}

// ---------------------------------------------------------------------------
// 9. Scroll Trail
// ---------------------------------------------------------------------------

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  time: number;
}

let trailCanvas: HTMLCanvasElement | null = null;
let trailCtx: CanvasRenderingContext2D | null = null;
let trailPoints: TrailPoint[] = [];
let trailRaf: number | null = null;
const TRAIL_MAX_POINTS = 20;
const TRAIL_LIFETIME_MS = 300;

function ensureTrailCanvas(): CanvasRenderingContext2D | null {
  if (trailCtx) return trailCtx;
  if (typeof document === 'undefined') return null;

  trailCanvas = document.createElement('canvas');
  trailCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: var(--z-crash-recovery, 40000);
  `;
  trailCanvas.width = window.innerWidth * getAdaptiveDPR();
  trailCanvas.height = window.innerHeight * getAdaptiveDPR();
  document.body.appendChild(trailCanvas);

  const ctx = trailCanvas.getContext('2d');
  if (ctx) {
    ctx.scale(getAdaptiveDPR(), getAdaptiveDPR());
    trailCtx = ctx;
  }

  return trailCtx;
}

function tickTrail(): void {
  const ctx = ensureTrailCanvas();
  if (!ctx || !trailCanvas) return;

  const now = performance.now();
  ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  trailPoints = trailPoints.filter(p => now - p.time < TRAIL_LIFETIME_MS);

  if (trailPoints.length < 2) {
    trailRaf = null;
    return;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < trailPoints.length; i++) {
    const prev = trailPoints[i - 1];
    const curr = trailPoints[i];
    const age = (now - curr.time) / TRAIL_LIFETIME_MS;
    const alpha = (1 - age) * 0.3;
    const width = (1 - age) * 3 + 1;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = `rgba(120, 160, 255, ${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  trailRaf = requestAnimationFrame(tickTrail);
}

export function addScrollTrailPoint(x: number, y: number): void {
  if (isReduceMotion()) return;

  trailPoints.push({ x, y, alpha: 1, time: performance.now() });
  if (trailPoints.length > TRAIL_MAX_POINTS) {
    trailPoints.shift();
  }

  if (trailRaf === null) {
    trailRaf = requestAnimationFrame(tickTrail);
  }
}

export function clearScrollTrail(): void {
  trailPoints = [];
  if (trailRaf !== null) {
    cancelAnimationFrame(trailRaf);
    trailRaf = null;
  }
  if (trailCtx && trailCanvas) {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  }
}

// ---------------------------------------------------------------------------
// 10. Focus Ring Pulse
// ---------------------------------------------------------------------------

let focusRingStyleInjected = false;

function injectFocusRingStyles(): void {
  if (focusRingStyleInjected) return;
  focusRingStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .dex-focus-ring {
      outline: none;
      position: relative;
    }
    .dex-focus-ring::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: inherit;
      border: 2px solid rgba(59, 130, 246, 0.6);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .dex-focus-ring:focus-visible::after,
    .dex-focus-ring--active::after {
      opacity: 1;
      animation: dex-focus-pulse 2s ease-in-out infinite;
    }
    @keyframes dex-focus-pulse {
      0%, 100% {
        border-color: rgba(59, 130, 246, 0.6);
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
      }
      50% {
        border-color: rgba(59, 130, 246, 0.9);
        box-shadow: 0 0 8px 2px rgba(59, 130, 246, 0.3);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dex-focus-ring:focus-visible::after,
      .dex-focus-ring--active::after {
        animation: none;
        opacity: 1;
        border-color: rgba(59, 130, 246, 0.8);
      }
    }
  `;
  document.head.appendChild(style);
}

export function applyFocusRing(el: HTMLElement): void {
  injectFocusRingStyles();
  el.classList.add('dex-focus-ring');
}

export function removeFocusRing(el: HTMLElement): void {
  el.classList.remove('dex-focus-ring', 'dex-focus-ring--active');
}

export function setFocusRingActive(el: HTMLElement, active: boolean): void {
  injectFocusRingStyles();
  el.classList.add('dex-focus-ring');
  if (active) {
    el.classList.add('dex-focus-ring--active');
  } else {
    el.classList.remove('dex-focus-ring--active');
  }
}

// ---------------------------------------------------------------------------
// Master Effect Controller
// ---------------------------------------------------------------------------

export interface VisualEffectsConfig {
  tier: EffectTier;
  frostedGlass: boolean;
  depthShadows: boolean;
  particles: boolean;
  depthOfField: boolean;
  ambientGlow: boolean;
  colorTransitions: boolean;
  surfaceReflection: boolean;
  motionBlur: boolean;
  scrollTrail: boolean;
  focusRingPulse: boolean;
}

const defaultConfig: VisualEffectsConfig = {
  tier: TIER,
  frostedGlass: true,
  depthShadows: true,
  particles: true,
  depthOfField: true,
  ambientGlow: true,
  colorTransitions: true,
  surfaceReflection: true,
  motionBlur: TIER === 'high',
  scrollTrail: TIER !== 'low',
  focusRingPulse: true,
};

let activeConfig = { ...defaultConfig };

export function getEffectsConfig(): VisualEffectsConfig {
  return { ...activeConfig };
}

export function setEffectsConfig(partial: Partial<VisualEffectsConfig>): void {
  activeConfig = { ...activeConfig, ...partial };
}

export function isEffectEnabled(effect: keyof Omit<VisualEffectsConfig, 'tier'>): boolean {
  // Respect both OS prefers-reduced-motion and UnifiedMotionSystem tier
  const motionTier = unifiedMotionSystem?.getTier?.() ?? 1;
  if (isReduceMotion() || motionTier >= 3) {
    const safeEffects = new Set(['depthShadows', 'focusRingPulse']);
    if (!safeEffects.has(effect)) return false;
  }
  // On tier 2 (mid), disable the heaviest effects
  if (motionTier >= 2) {
    const heavyEffects = new Set(['particles', 'motionBlur', 'scrollTrail']);
    if (heavyEffects.has(effect)) return false;
  }
  return activeConfig[effect];
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let initialized = false;

export function initVisualEffects(): void {
  if (initialized) return;
  initialized = true;

  // Pre-inject all stylesheets so they're ready when effects are applied
  injectFrostedStyles();
  injectShadowStyles();
  injectDofStyles();
  injectGlowStyles();
  injectColorTransitionStyles();
  injectReflectionStyles();
  injectMotionBlurStyles();
  injectFocusRingStyles();
}

export function destroyVisualEffects(): void {
  clearParticles();
  clearScrollTrail();

  if (_particleResizeHandler) {
    window.removeEventListener('resize', _particleResizeHandler);
    _particleResizeHandler = null;
  }
  if (particleCanvas && particleCanvas.parentNode) {
    particleCanvas.parentNode.removeChild(particleCanvas);
    particleCanvas = null;
    particleCtx = null;
  }
  if (trailCanvas && trailCanvas.parentNode) {
    trailCanvas.parentNode.removeChild(trailCanvas);
    trailCanvas = null;
    trailCtx = null;
  }

  initialized = false;
}
