// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Renderer Safety Utilities
// ==========================================================================
// Canvas context safety, cleanup tracking, memory leak prevention, and
// event listener lifecycle management for all inner apps. Every React
// component uses these utilities to ensure proper cleanup on unmount.
// ==========================================================================

import { useEffect, useRef, useCallback } from 'react';
import { usePerformanceOptimization } from '../services/PerformanceOptimization';

// ---------------------------------------------------------------------------
// IPC helper
// ---------------------------------------------------------------------------

function getIPC(): any {
  const w = window as unknown as Record<string, unknown>;
  return w.electron || w.api || null;
}

function ipcSend(channel: string, data?: any): void {
  const ipc = getIPC();
  if (ipc && typeof ipc.send === 'function') {
    ipc.send(channel, data);
  }
}

// ---------------------------------------------------------------------------
// Canvas safety hook
// ---------------------------------------------------------------------------

export function useCanvasSafety(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options?: {
    useWebGL?: boolean;
    powerPreference?: 'low-power' | 'high-performance';
    onContextLost?: () => void;
    onContextRestored?: () => void;
  }
): {
  getContext: () => CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext | null;
  isContextLost: React.MutableRefObject<boolean>;
} {
  const isContextLost = useRef(false);
  const ctxRef = useRef<CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleLost = (e: Event) => {
      e.preventDefault();
      isContextLost.current = true;
      ctxRef.current = null;
      options?.onContextLost?.();
    };

    const handleRestored = () => {
      isContextLost.current = false;
      options?.onContextRestored?.();
    };

    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [canvasRef, options?.onContextLost, options?.onContextRestored]);

  const getContext = useCallback(() => {
    if (isContextLost.current) return null;
    if (ctxRef.current) return ctxRef.current;

    const canvas = canvasRef.current;
    if (!canvas) return null;

    if (options?.useWebGL) {
      const attrs: WebGLContextAttributes = {
        powerPreference: options.powerPreference ?? 'low-power',
        failIfMajorPerformanceCaveat: false,
        antialias: false,
        preserveDrawingBuffer: false,
      };
      const gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
      ctxRef.current = gl as WebGLRenderingContext | WebGL2RenderingContext | null;
    } else {
      ctxRef.current = canvas.getContext('2d');
    }

    return ctxRef.current;
  }, [canvasRef, options?.useWebGL, options?.powerPreference]);

  return { getContext, isContextLost };
}

// ---------------------------------------------------------------------------
// Managed RAF hook
// ---------------------------------------------------------------------------

export function useManagedRAF(
  callback: (dt: number) => void,
  deps: any[] = []
): {
  start: () => void;
  stop: () => void;
  isRunning: React.MutableRefObject<boolean>;
} {
  const frameIdRef = useRef(0);
  const isRunning = useRef(false);
  const lastTimeRef = useRef(0);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const start = useCallback(() => {
    if (isRunning.current) return;
    isRunning.current = true;
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      if (!isRunning.current) return;
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      cbRef.current(dt);
      frameIdRef.current = requestAnimationFrame(loop);
    };
    frameIdRef.current = requestAnimationFrame(loop);
  }, []);

  const stop = useCallback(() => {
    isRunning.current = false;
    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, deps);

  return { start, stop, isRunning };
}

// ---------------------------------------------------------------------------
// Event listener cleanup hook
// ---------------------------------------------------------------------------

export function useEventCleanup(): {
  addListener: (target: EventTarget, event: string, handler: EventListener, options?: boolean | AddEventListenerOptions) => void;
  addIPC: (channel: string, handler: (...args: any[]) => void) => void;
} {
  const listenersRef = useRef<Array<{ target: EventTarget; event: string; handler: EventListener; options?: boolean | AddEventListenerOptions }>>([]);
  const ipcHandlersRef = useRef<Array<{ channel: string; handler: (...args: any[]) => void }>>([]);

  useEffect(() => {
    return () => {
      for (const { target, event, handler, options } of listenersRef.current) {
        target.removeEventListener(event, handler, options);
      }
      listenersRef.current = [];

      const ipc = getIPC();
      if (ipc && typeof ipc.removeListener === 'function') {
        for (const { channel, handler } of ipcHandlersRef.current) {
          ipc.removeListener(channel, handler);
        }
      }
      ipcHandlersRef.current = [];
    };
  }, []);

  const addListener = useCallback((
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ) => {
    target.addEventListener(event, handler, options);
    listenersRef.current.push({ target, event, handler, options });
  }, []);

  const addIPC = useCallback((channel: string, handler: (...args: any[]) => void) => {
    const ipc = getIPC();
    if (ipc && typeof ipc.on === 'function') {
      ipc.on(channel, handler);
      ipcHandlersRef.current.push({ channel, handler });
    }
  }, []);

  return { addListener, addIPC };
}

// ---------------------------------------------------------------------------
// Directive consumer hook (for inner apps)
// ---------------------------------------------------------------------------

export function useAppDirective() {
  const directive = usePerformanceOptimization(s => s.directive);
  const tier = usePerformanceOptimization(s => s.tier);
  const thermalState = usePerformanceOptimization(s => s.thermalState);
  const memoryPressure = usePerformanceOptimization(s => s.memoryPressure);
  const isIdle = usePerformanceOptimization(s => s.isIdle);

  return {
    directive,
    tier,
    thermalState: thermalState.state,
    memoryPressure,
    isIdle,
    shouldReduceAnimations: thermalState.animationScale < 0.5 || memoryPressure === 'high' || memoryPressure === 'critical',
    shouldPauseBackground: thermalState.state === 'critical' || memoryPressure === 'critical' || memoryPressure === 'emergency',
    isLowEnd: tier === 'tier-3-standard' || tier === 'tier-3-critical',
    isCritical: tier === 'tier-3-critical',
  };
}

// ---------------------------------------------------------------------------
// Game frame reporter hook
// ---------------------------------------------------------------------------

export function useGameFrameReporter(): (frameTimeMs: number) => void {
  const throttleRef = useRef(0);

  return useCallback((frameTimeMs: number) => {
    const now = Date.now();
    if (now - throttleRef.current > 100) {
      throttleRef.current = now;
      ipcSend('game-perf:reportFrame', frameTimeMs);
    }
  }, []);
}
