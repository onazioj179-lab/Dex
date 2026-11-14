// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Renderer Performance Optimization Hook
// ==========================================================================
// Client-side Zustand store that receives optimization directives from the
// main process. Every inner app subscribes to this store and adjusts its
// quality settings in real time. Also handles canvas context safety and RAF
// cleanup tracking. (The GPU/memory reporters and the tier/directive fetch
// called channels native never had and were never started; removed.)
// ==========================================================================

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CapabilityTierName =
  | 'tier-1-premium'
  | 'tier-1'
  | 'tier-2'
  | 'tier-3-standard'
  | 'tier-3-critical';

export type MemoryPressureLevel = 'normal' | 'moderate' | 'high' | 'critical' | 'emergency';

export interface AppDirective {
  documentChunkSize: number;
  undoHistoryDepth: number;
  virtualizationBuffer: number;
  thumbnailCacheSize: number;
  previewResolution: string;
  animationDurationScale: number;
  backgroundGenerationRate: number;
  maxVisibleColumns: number;
  particleScale: number;
  writeCoalesceMs: number;
}

export interface GameSettings {
  targetFPS: number;
  frameBudgetMs: number;
  renderResolutionPercent: number;
  particlePercent: number;
  shadowQuality: string;
  postProcessEffects: string[];
  maxEnemyCount: number;
  audioSampleRate: number;
  useCanvas2DOnly: boolean;
  simulationHz: number;
  simulationStepMs: number;
  inputBufferSize: number;
}

export interface ThermalState {
  state: 'cool' | 'warm' | 'hot' | 'critical';
  animationScale: number;
  gameFrameCap: number;
  gameResolutionStep: number;
  writeCoalesceMs: number;
}

export interface PowerState {
  state: string;
  batteryPercent: number;
  isCharging: boolean;
}

interface PerformanceOptimizationState {
  tier: CapabilityTierName;
  tierNumeric: number;
  directive: AppDirective;
  gameSettings: GameSettings | null;
  thermalState: ThermalState;
  powerState: PowerState;
  memoryPressure: MemoryPressureLevel;
  gpuDetected: boolean;
  isIdle: boolean;
  notifications: Array<{ type: string; message: string; key: string; timestamp: number }>;
}

interface PerformanceOptimizationActions {
  setTier: (tier: CapabilityTierName, tierNumeric: number) => void;
  setDirective: (directive: AppDirective) => void;
  setGameSettings: (settings: GameSettings) => void;
  setThermalState: (state: ThermalState) => void;
  setPowerState: (state: PowerState) => void;
  setMemoryPressure: (level: MemoryPressureLevel) => void;
  setIdle: (idle: boolean) => void;
  addNotification: (n: { type: string; message: string; key: string }) => void;
  dismissNotification: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_DIRECTIVE: AppDirective = {
  documentChunkSize: 5000,
  undoHistoryDepth: 50,
  virtualizationBuffer: 50,
  thumbnailCacheSize: 500,
  previewResolution: '1080p',
  animationDurationScale: 1,
  backgroundGenerationRate: 1,
  maxVisibleColumns: 20,
  particleScale: 1,
  writeCoalesceMs: 100,
};

const DEFAULT_THERMAL: ThermalState = {
  state: 'cool',
  animationScale: 1,
  gameFrameCap: 0,
  gameResolutionStep: 0,
  writeCoalesceMs: 100,
};

const DEFAULT_POWER: PowerState = {
  state: 'ac',
  batteryPercent: 100,
  isCharging: false,
};



// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePerformanceOptimization = create<PerformanceOptimizationState & PerformanceOptimizationActions>(
  (set, get) => ({
    tier: 'tier-2',
    tierNumeric: 2,
    directive: DEFAULT_DIRECTIVE,
    gameSettings: null,
    thermalState: DEFAULT_THERMAL,
    powerState: DEFAULT_POWER,
    memoryPressure: 'normal',
    gpuDetected: false,
    isIdle: false,
    notifications: [],

    setTier: (tier, tierNumeric) => set(state => {
      // User directive: never let runtime power/thermal changes downgrade
      // the renderer tier. Allow the initial bootstrap (when tierNumeric is
      // still at the default 2/'high' or below the incoming value) to lift
      // us up, but reject any later downgrades from the main process.
      if (tierNumeric < state.tierNumeric) {
        // eslint-disable-next-line no-console
        console.debug(`[DEX] Ignoring tier downgrade ${state.tier} -> ${tier} (locked at max per user setting)`);
        return state;
      }
      return { tier, tierNumeric };
    }),
    setDirective: (directive) => set({ directive }),
    setGameSettings: (gameSettings) => set({ gameSettings }),
    setThermalState: (thermalState) => set({ thermalState }),
    setPowerState: (powerState) => set({ powerState }),
    setMemoryPressure: (memoryPressure) => set({ memoryPressure }),
    setIdle: (isIdle) => set({ isIdle }),

    addNotification: (n) => {
      const existing = get().notifications;
      if (existing.some(e => e.key === n.key)) return;
      set({ notifications: [...existing, { ...n, timestamp: Date.now() }] });
    },

    dismissNotification: (key) => {
      set({ notifications: get().notifications.filter(n => n.key !== key) });
    },

  })
);


// ---------------------------------------------------------------------------
// Selector-based subscriptions (item 146) — minimize re-renders
// ---------------------------------------------------------------------------
export const useCapabilityTier = () => usePerformanceOptimization(s => s.tier);
export const useTierNumeric = () => usePerformanceOptimization(s => s.tierNumeric);
export const useAppDirective = () => usePerformanceOptimization(s => s.directive);
export const useMemoryPressure = () => usePerformanceOptimization(s => s.memoryPressure);
export const useThermalState = () => usePerformanceOptimization(s => s.thermalState);
export const useIsIdle = () => usePerformanceOptimization(s => s.isIdle);
export const useParticleScale = () => usePerformanceOptimization(s => s.directive.particleScale);
export const useAnimationScale = () => usePerformanceOptimization(s => s.directive.animationDurationScale);

// ---------------------------------------------------------------------------
// Canvas context safety utilities
// ---------------------------------------------------------------------------

export function safeGetContext2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export function safeGetWebGLContext(
  canvas: HTMLCanvasElement,
  powerPreference: 'low-power' | 'high-performance' = 'low-power'
): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    const attrs: WebGLContextAttributes = {
      powerPreference,
      failIfMajorPerformanceCaveat: false,
      antialias: false,
      preserveDrawingBuffer: false,
    };
    return (canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs)) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

export function registerContextLossHandlers(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void
): () => void {
  const handleLost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  const handleRestored = () => {
    onRestored();
  };

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}

// ---------------------------------------------------------------------------
// RAF cleanup helper
// ---------------------------------------------------------------------------

export function createManagedRAF(): {
  start: (callback: (dt: number) => void) => void;
  stop: () => void;
} {
  let frameId = 0;
  let running = false;
  let lastTime = 0;

  return {
    start(callback) {
      if (running) return;
      running = true;
      lastTime = performance.now();
      const loop = (now: number) => {
        if (!running) return;
        const dt = now - lastTime;
        lastTime = now;
        callback(dt);
        frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    },
  };
}

