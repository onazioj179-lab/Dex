// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Performance Integration Hook
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ===========================================================================
// Renderer-side integration with all performance systems
// ===========================================================================

import { useEffect, useCallback, useRef, useState } from 'react';

// ===========================================================================
// TYPES
// ===========================================================================

interface PerformanceState {
  isReady: boolean;
  displayMode: '60hz' | '120hz' | '144hz' | 'variable';
  is120Hz: boolean;
  is4K: boolean;
  motionState: 'full' | 'reduced' | 'disabled';
  isResponsive: boolean;
  throttleLevel: string;
  isIdle: boolean;
  memoryMB: number;
  cpuUsage: number;
  backgroundTasksRunning: number;
  optimizationEnabled: boolean;
}

interface FrameMetrics {
  timestamp: number;
  frameTime: number;
  paintTime: number;
  layoutTime: number;
  styleTime: number;
  inputLatency: number;
  jank: boolean;
}

// ===========================================================================
// MAIN PERFORMANCE HOOK
// ===========================================================================

export function usePerformance() {
  const [state, setState] = useState<PerformanceState>({
    isReady: false,
    displayMode: '60hz',
    is120Hz: false,
    is4K: false,
    motionState: 'full',
    isResponsive: true,
    throttleLevel: 'none',
    isIdle: true,
    memoryMB: 0,
    cpuUsage: 0,
    backgroundTasksRunning: 0,
    optimizationEnabled: false,
  });
  
  // Frame timing
  const lastFrameTime = useRef(performance.now());
  const frameCallbackId = useRef<number | null>(null);
  const isMonitoring = useRef(false);
  
  // Input tracking
  const lastInputTime = useRef(0);
  const inputIdleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  useEffect(() => {
    const init = async () => {
      if (!window.dex) return;
      
      try {
        // Get render config
        const renderConfig = await window.dex.render?.getConfig();
        
        // Get motion config
        const motionConfig = await window.dex.motion?.getConfig();
        
        setState(prev => ({
          ...prev,
          isReady: true,
          displayMode: renderConfig?.displayMode || '60hz',
          is120Hz: renderConfig?.is120Hz || false,
          is4K: renderConfig?.is4K || false,
          motionState: motionConfig?.state || 'full',
        }));
        
        // Check and report reduced motion preference
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.dex.motion?.reportPrefersReduced(prefersReduced);
        
        // Start frame monitoring
        startFrameMonitoring();
        
        // Setup input tracking
        setupInputTracking();
        
      } catch (err) {
        console.error('[Performance] Init error:', err);
      }
    };
    
    init();
    
    return () => {
      stopFrameMonitoring();
      cleanupInputTracking();
    };
  }, []);

  // -------------------------------------------------------------------------
  // FRAME MONITORING
  // -------------------------------------------------------------------------

  const lastReportTime = useRef(0);
  const REPORT_INTERVAL = 2000; // Only report metrics once every 2 seconds

  const startFrameMonitoring = useCallback(() => {
    if (isMonitoring.current) return;
    isMonitoring.current = true;
    
    // Intermittent sampling: measure for 300ms every 4s, not continuously
    let sampleInterval: ReturnType<typeof setInterval> | null = null;
    
    const runSample = () => {
      let sampling = true;
      const measureFrame = (timestamp: number) => {
        const frameTime = timestamp - lastFrameTime.current;
        lastFrameTime.current = timestamp;
        
        if (frameTime > 0 && frameTime < 1000) {
          const isJank = frameTime > 16.67 * 2;
          const shouldReport = isJank || (timestamp - lastReportTime.current > REPORT_INTERVAL);

          if (shouldReport) {
            lastReportTime.current = timestamp;
            const metrics: FrameMetrics = {
              timestamp,
              frameTime,
              paintTime: 0,
              layoutTime: 0,
              styleTime: 0,
              inputLatency: lastInputTime.current ? timestamp - lastInputTime.current : 0,
              jank: isJank,
            };
            window.dex?.render?.reportFrameMetrics(metrics);
            window.dex?.stability?.reportFrameTime(frameTime);
            window.dex?.enforce?.reportMetrics({
              frameTime,
              isIdle: state.isIdle,
            });
          }
        }
        
        if (sampling && isMonitoring.current) {
          frameCallbackId.current = requestAnimationFrame(measureFrame);
        }
      };
      frameCallbackId.current = requestAnimationFrame(measureFrame);
      setTimeout(() => { sampling = false; }, 300);
    };
    
    runSample();
    sampleInterval = setInterval(runSample, 4000);
    
    // Store interval for cleanup
    (startFrameMonitoring as any)._interval = sampleInterval;
  }, [state.isIdle]);

  const stopFrameMonitoring = useCallback(() => {
    if (frameCallbackId.current) {
      cancelAnimationFrame(frameCallbackId.current);
      frameCallbackId.current = null;
    }
    const interval = (startFrameMonitoring as any)?._interval;
    if (interval) clearInterval(interval);
    isMonitoring.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // INPUT TRACKING
  // -------------------------------------------------------------------------

  const setupInputTracking = useCallback(() => {
    let lastMoveTime = 0;
    const MOVE_THROTTLE = 250; // Only track mousemove every 250ms for performance

    const handleInput = (event: Event) => {
      // Throttle mousemove events heavily - they fire constantly
      if (event.type === 'mousemove') {
        const now = performance.now();
        if (now - lastMoveTime < MOVE_THROTTLE) return;
        lastMoveTime = now;
      }

      const now = performance.now();
      lastInputTime.current = now;
      
      // Record activity
      window.dex?.resource?.recordActivity();
      window.dex?.render?.reportInputEvent();
      
      // Determine input type
      let inputType: 'keyboard' | 'pointer' | 'scroll' | 'touch' | 'other' = 'other';
      let priority: 1 | 2 | 3 | 10 = 10;
      
      if (event instanceof KeyboardEvent) {
        inputType = 'keyboard';
        priority = 1;
      } else if (event instanceof MouseEvent || event instanceof PointerEvent) {
        inputType = 'pointer';
        priority = 2;
      } else if (event.type === 'scroll' || event.type === 'wheel') {
        inputType = 'scroll';
        priority = 2;
      } else if (event instanceof TouchEvent) {
        inputType = 'touch';
        priority = 2;
      }
      
      window.dex?.input?.reportEvent({
        type: inputType,
        timestamp: now,
        priority,
      });
      
      // Update idle state
      setState(prev => ({ ...prev, isIdle: false }));
      window.dex?.render?.reportStateChange('active');
      
      // Set idle timeout
      if (inputIdleTimeout.current) {
        clearTimeout(inputIdleTimeout.current);
      }
      inputIdleTimeout.current = setTimeout(() => {
        setState(prev => ({ ...prev, isIdle: true }));
        window.dex?.render?.reportStateChange('idle');
        window.dex?.stability?.reportIdle();
      }, 100);
    };
    
    // Passive listeners for performance
    const options = { passive: true, capture: true };
    
    document.addEventListener('keydown', handleInput, options);
    document.addEventListener('keyup', handleInput, options);
    document.addEventListener('mousedown', handleInput, options);
    document.addEventListener('mouseup', handleInput, options);
    document.addEventListener('mousemove', handleInput, options);
    document.addEventListener('wheel', handleInput, options);
    document.addEventListener('touchstart', handleInput, options);
    document.addEventListener('touchmove', handleInput, options);
    document.addEventListener('touchend', handleInput, options);
    
    return () => {
      document.removeEventListener('keydown', handleInput, options as any);
      document.removeEventListener('keyup', handleInput, options as any);
      document.removeEventListener('mousedown', handleInput, options as any);
      document.removeEventListener('mouseup', handleInput, options as any);
      document.removeEventListener('mousemove', handleInput, options as any);
      document.removeEventListener('wheel', handleInput, options as any);
      document.removeEventListener('touchstart', handleInput, options as any);
      document.removeEventListener('touchmove', handleInput, options as any);
      document.removeEventListener('touchend', handleInput, options as any);
    };
  }, []);

  const cleanupInputTracking = useCallback(() => {
    if (inputIdleTimeout.current) {
      clearTimeout(inputIdleTimeout.current);
    }
  }, []);

  // -------------------------------------------------------------------------
  // ANIMATION HELPERS
  // -------------------------------------------------------------------------

  const requestAnimation = useCallback(async (
    type: 'fade' | 'slide' | 'scale-subtle' | 'focus-ring',
    durationMs: number
  ): Promise<{ approved: boolean; duration: number; easing: string }> => {
    if (!window.dex?.motion) {
      return { approved: true, duration: durationMs, easing: 'ease-out' };
    }
    
    try {
      const result = await window.dex.motion.requestAnimation({
        type,
        durationMs,
      });
      
      return {
        approved: result.approved,
        duration: result.adjustedDuration,
        easing: result.easing,
      };
    } catch {
      return { approved: true, duration: durationMs, easing: 'ease-out' };
    }
  }, []);

  const animationStart = useCallback(() => {
    window.dex?.motion?.reportAnimationStart();
    window.dex?.resource?.reportRenderStart();
  }, []);

  const animationEnd = useCallback(() => {
    window.dex?.motion?.reportAnimationEnd();
    window.dex?.resource?.reportRenderEnd();
  }, []);

  // -------------------------------------------------------------------------
  // RENDER HELPERS
  // -------------------------------------------------------------------------

  const shouldRender = useCallback(async (): Promise<boolean> => {
    if (!window.dex?.resource) return true;
    try {
      return await window.dex.resource.shouldRender();
    } catch {
      return true;
    }
  }, []);

  const reportInputLatency = useCallback((inputTime: number, renderTime: number) => {
    const latency = renderTime - inputTime;
    
    window.dex?.input?.reportLatency({
      type: 'keyboard', // default to keyboard for simplicity
      inputTime,
      renderTime,
      latencyMs: latency,
    });
    
    window.dex?.stability?.reportLatency(latency);
    
    window.dex?.enforce?.reportMetrics({
      inputLatency: latency,
    });
  }, []);

  // -------------------------------------------------------------------------
  // EVENT HANDLERS
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!window.dex?.on) return;
    
    const handleMotionChange = (config: any) => {
      setState(prev => ({
        ...prev,
        motionState: config.state,
      }));
      
      // Update body class for CSS
      document.body.classList.remove('motion-full', 'motion-reduced', 'motion-disabled');
      document.body.classList.add(`motion-${config.state}`);
    };
    
    const handleRenderChange = (data: any) => {
      setState(prev => ({
        ...prev,
        isIdle: data.current === 'idle',
      }));
      
      // Update body class
      document.body.classList.remove('render-idle', 'render-active');
      document.body.classList.add(`render-${data.current}`);
    };
    
    const handleEnforceAction = (action: string) => {
      if (action === 'reduce-motion') {
        document.body.classList.add('motion-reduced');
      } else if (action === 'emergency') {
        document.body.classList.add('motion-disabled');
      }
    };
    
    window.dex.on('motion:stateChanged', handleMotionChange);
    window.dex.on('render:stateChanged', handleRenderChange);
    window.dex.on('enforce:action', handleEnforceAction);
    
    return () => {
      window.dex?.off?.('motion:stateChanged', handleMotionChange);
      window.dex?.off?.('render:stateChanged', handleRenderChange);
      window.dex?.off?.('enforce:action', handleEnforceAction);
    };
  }, []);

  // -------------------------------------------------------------------------
  // RETURN
  // -------------------------------------------------------------------------

  return {
    // State
    ...state,
    
    // Animation
    requestAnimation,
    animationStart,
    animationEnd,
    
    // Render
    shouldRender,
    reportInputLatency,
    
    // Motion helpers
    isMotionAllowed: state.motionState !== 'disabled',
    isMotionReduced: state.motionState === 'reduced',
    
    // Display helpers
    targetFrameTime: state.is120Hz ? 8.33 : 16.67,
  };
}

// ===========================================================================
// MOTION-SAFE ANIMATION HOOK
// ===========================================================================

export function useMotionSafeAnimation() {
  const { requestAnimation, animationStart, animationEnd, isMotionAllowed } = usePerformance();
  
  const animate = useCallback(async (
    element: HTMLElement,
    type: 'fade' | 'slide' | 'scale-subtle' | 'focus-ring',
    baseDuration: number,
    properties: { [key: string]: string }
  ): Promise<void> => {
    if (!isMotionAllowed) {
      // Apply instantly without animation
      Object.entries(properties).forEach(([prop, value]) => {
        element.style.setProperty(prop, value);
      });
      return;
    }
    
    const { approved, duration, easing } = await requestAnimation(type, baseDuration);
    
    if (!approved) {
      Object.entries(properties).forEach(([prop, value]) => {
        element.style.setProperty(prop, value);
      });
      return;
    }
    
    animationStart();
    
    element.style.transition = `all ${duration}ms ${easing}`;
    Object.entries(properties).forEach(([prop, value]) => {
      element.style.setProperty(prop, value);
    });
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    animationEnd();
    element.style.transition = '';
  }, [requestAnimation, animationStart, animationEnd, isMotionAllowed]);
  
  return { animate, isMotionAllowed };
}

export default usePerformance;
