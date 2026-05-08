// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Hardware Compatibility & Stability Layer
// Ensures DEX works smoothly on all hardware, including older computers
// =============================================================================

// =============================================================================
// FEATURE DETECTION
// =============================================================================

export interface BrowserFeatures {
  // Core APIs
  webGL: boolean;
  webGL2: boolean;
  webGPU: boolean;
  webWorkers: boolean;
  sharedWorkers: boolean;
  serviceWorkers: boolean;
  webAssembly: boolean;
  
  // Storage
  indexedDB: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  cacheAPI: boolean;
  
  // Media
  webAudio: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  webRTC: boolean;
  
  // Performance
  performanceObserver: boolean;
  requestIdleCallback: boolean;
  intersectionObserver: boolean;
  resizeObserver: boolean;
  mutationObserver: boolean;
  
  // Hardware Access
  vibration: boolean;
  battery: boolean;
  bluetooth: boolean;
  usb: boolean;
  midi: boolean;
  gamepad: boolean;
  
  // Modern CSS
  cssGrid: boolean;
  cssCustomProperties: boolean;
  cssBackdropFilter: boolean;
  cssContainerQueries: boolean;
  
  // Other
  webAnimationsAPI: boolean;
  clipboardAPI: boolean;
  speechSynthesis: boolean;
  speechRecognition: boolean;
  geolocation: boolean;
  notifications: boolean;
  fullscreen: boolean;
  pointerEvents: boolean;
  touchEvents: boolean;
}

/**
 * Detect available browser features with safe checks
 */
export function detectFeatures(): BrowserFeatures {
  const features: BrowserFeatures = {
    // Core APIs
    webGL: detectWebGL(1),
    webGL2: detectWebGL(2),
    webGPU: 'gpu' in navigator,
    webWorkers: typeof Worker !== 'undefined',
    sharedWorkers: typeof SharedWorker !== 'undefined',
    serviceWorkers: 'serviceWorker' in navigator,
    webAssembly: typeof WebAssembly !== 'undefined',
    
    // Storage
    indexedDB: 'indexedDB' in window,
    localStorage: testLocalStorage(),
    sessionStorage: testSessionStorage(),
    cacheAPI: 'caches' in window,
    
    // Media
    webAudio: typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined',
    mediaDevices: 'mediaDevices' in navigator,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    webRTC: 'RTCPeerConnection' in window,
    
    // Performance
    performanceObserver: typeof PerformanceObserver !== 'undefined',
    requestIdleCallback: 'requestIdleCallback' in window,
    intersectionObserver: typeof IntersectionObserver !== 'undefined',
    resizeObserver: typeof ResizeObserver !== 'undefined',
    mutationObserver: typeof MutationObserver !== 'undefined',
    
    // Hardware Access
    vibration: 'vibrate' in navigator,
    battery: 'getBattery' in navigator,
    bluetooth: 'bluetooth' in navigator,
    usb: 'usb' in navigator,
    midi: 'requestMIDIAccess' in navigator,
    gamepad: 'getGamepads' in navigator,
    
    // Modern CSS
    cssGrid: CSS.supports('display', 'grid'),
    cssCustomProperties: CSS.supports('--test', '0'),
    cssBackdropFilter: CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),
    cssContainerQueries: CSS.supports('container-type', 'inline-size'),
    
    // Other
    webAnimationsAPI: typeof Element.prototype.animate === 'function',
    clipboardAPI: 'clipboard' in navigator,
    speechSynthesis: 'speechSynthesis' in window,
    speechRecognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    geolocation: 'geolocation' in navigator,
    notifications: 'Notification' in window,
    fullscreen: 'fullscreenEnabled' in document || 'webkitFullscreenEnabled' in document,
    pointerEvents: 'PointerEvent' in window,
    touchEvents: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };
  
  return features;
}

function detectWebGL(version: 1 | 2): boolean {
  try {
    const canvas = document.createElement('canvas');
    const contextName = version === 2 ? 'webgl2' : 'webgl';
    const context = canvas.getContext(contextName) || canvas.getContext('experimental-webgl');
    return context !== null;
  } catch {
    return false;
  }
}

function testLocalStorage(): boolean {
  try {
    const test = '__dex_storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function testSessionStorage(): boolean {
  try {
    const test = '__dex_storage_test__';
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PERFORMANCE TIER DETECTION
// =============================================================================

export type PerformanceTier = 'high' | 'medium' | 'low' | 'minimal';

export interface HardwareProfile {
  tier: PerformanceTier;
  cores: number;
  memory: number; // in GB, estimated
  gpu: 'high' | 'medium' | 'low' | 'unknown';
  connection: 'fast' | 'slow' | 'offline' | 'unknown';
  isLowEndDevice: boolean;
  isMobile: boolean;
  hasTouchScreen: boolean;
  prefersReducedMotion: boolean;
  prefersReducedData: boolean;
  colorScheme: 'light' | 'dark';
}

/**
 * Detect hardware capabilities and assign performance tier
 */
export function detectHardwareProfile(): HardwareProfile {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 4;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Estimate GPU capability
  const gpu = estimateGPUTier();
  
  // Check connection
  const connection = getConnectionType();
  
  // Calculate performance tier
  let tier: PerformanceTier = 'high';
  
  if (cores <= 1 || memory <= 1) {
    tier = 'minimal';
  } else if (cores <= 2 || memory <= 2 || gpu === 'low') {
    tier = 'low';
  } else if (cores <= 4 || memory <= 4 || gpu === 'medium') {
    tier = 'medium';
  }
  
  // Further downgrade for slow connections
  if (connection === 'slow' && tier === 'high') {
    tier = 'medium';
  }
  
  const isLowEndDevice = tier === 'low' || tier === 'minimal';
  
  return {
    tier,
    cores,
    memory,
    gpu,
    connection,
    isLowEndDevice,
    isMobile,
    hasTouchScreen: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefersReducedData: (navigator as any).connection?.saveData || false,
    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  };
}

function estimateGPUTier(): 'high' | 'medium' | 'low' | 'unknown' {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) return 'low';
    
    const glContext = gl as WebGLRenderingContext;
    const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
    
    if (debugInfo) {
      const renderer = glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
      
      // High-end GPUs
      if (renderer.includes('nvidia') || renderer.includes('geforce') ||
          renderer.includes('radeon rx') || renderer.includes('rtx')) {
        return 'high';
      }
      
      // Medium GPUs
      if (renderer.includes('intel') && (renderer.includes('iris') || renderer.includes('uhd'))) {
        return 'medium';
      }
      
      // Low-end integrated
      if (renderer.includes('intel hd') || renderer.includes('mesa') || 
          renderer.includes('swiftshader') || renderer.includes('llvmpipe')) {
        return 'low';
      }
    }
    
    // Test GPU capabilities
    const maxTextureSize = glContext.getParameter(glContext.MAX_TEXTURE_SIZE);
    const maxRenderbufferSize = glContext.getParameter(glContext.MAX_RENDERBUFFER_SIZE);
    
    if (maxTextureSize >= 16384 && maxRenderbufferSize >= 16384) {
      return 'high';
    } else if (maxTextureSize >= 8192) {
      return 'medium';
    }
    
    return 'low';
  } catch {
    return 'unknown';
  }
}

function getConnectionType(): 'fast' | 'slow' | 'offline' | 'unknown' {
  if (!navigator.onLine) return 'offline';
  
  const connection = (navigator as any).connection;
  if (!connection) return 'unknown';
  
  const effectiveType = connection.effectiveType;
  
  if (effectiveType === '4g') return 'fast';
  if (effectiveType === '3g') return 'slow';
  if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'slow';
  
  return 'unknown';
}

// =============================================================================
// ADAPTIVE SETTINGS
// =============================================================================

export interface AdaptiveSettings {
  // Animations
  enableAnimations: boolean;
  animationDuration: number; // multiplier
  enableParticles: boolean;
  maxParticles: number;
  enableBlur: boolean;
  blurQuality: 'high' | 'medium' | 'low';
  
  // Visual Effects
  enableShadows: boolean;
  shadowQuality: 'high' | 'medium' | 'low';
  enableGlassEffect: boolean;
  enableGradients: boolean;
  enableTransitions: boolean;
  
  // Performance
  virtualListOverscan: number;
  imageLazyLoadThreshold: number;
  debounceDelay: number;
  throttleDelay: number;
  batchSize: number;
  
  // Media
  imageQuality: 'high' | 'medium' | 'low';
  videoQuality: 'high' | 'medium' | 'low' | 'auto';
  enablePreloading: boolean;
  
  // Features
  enableWebGL: boolean;
  enableWebWorkers: boolean;
  enableOffscreenCanvas: boolean;
}

/**
 * Generate adaptive settings based on hardware profile
 */
export function getAdaptiveSettings(profile: HardwareProfile): AdaptiveSettings {
  const { tier, prefersReducedMotion, prefersReducedData } = profile;
  
  // Base settings for each tier
  const tierSettings: Record<PerformanceTier, AdaptiveSettings> = {
    high: {
      enableAnimations: !prefersReducedMotion,
      animationDuration: 1,
      enableParticles: true,
      maxParticles: 1000,
      enableBlur: true,
      blurQuality: 'high',
      enableShadows: true,
      shadowQuality: 'high',
      enableGlassEffect: true,
      enableGradients: true,
      enableTransitions: !prefersReducedMotion,
      virtualListOverscan: 5,
      imageLazyLoadThreshold: 300,
      debounceDelay: 150,
      throttleDelay: 16,
      batchSize: 50,
      imageQuality: prefersReducedData ? 'medium' : 'high',
      videoQuality: prefersReducedData ? 'medium' : 'high',
      enablePreloading: !prefersReducedData,
      enableWebGL: true,
      enableWebWorkers: true,
      enableOffscreenCanvas: true,
    },
    medium: {
      enableAnimations: !prefersReducedMotion,
      animationDuration: 0.8,
      enableParticles: true,
      maxParticles: 300,
      enableBlur: true,
      blurQuality: 'medium',
      enableShadows: true,
      shadowQuality: 'medium',
      enableGlassEffect: true,
      enableGradients: true,
      enableTransitions: !prefersReducedMotion,
      virtualListOverscan: 3,
      imageLazyLoadThreshold: 200,
      debounceDelay: 200,
      throttleDelay: 32,
      batchSize: 30,
      imageQuality: 'medium',
      videoQuality: 'medium',
      enablePreloading: !prefersReducedData,
      enableWebGL: true,
      enableWebWorkers: true,
      enableOffscreenCanvas: false,
    },
    low: {
      enableAnimations: false,
      animationDuration: 0.5,
      enableParticles: false,
      maxParticles: 0,
      enableBlur: false,
      blurQuality: 'low',
      enableShadows: false,
      shadowQuality: 'low',
      enableGlassEffect: false,
      enableGradients: false,
      enableTransitions: false,
      virtualListOverscan: 2,
      imageLazyLoadThreshold: 100,
      debounceDelay: 300,
      throttleDelay: 50,
      batchSize: 20,
      imageQuality: 'low',
      videoQuality: 'low',
      enablePreloading: false,
      enableWebGL: false,
      enableWebWorkers: true,
      enableOffscreenCanvas: false,
    },
    minimal: {
      enableAnimations: false,
      animationDuration: 0,
      enableParticles: false,
      maxParticles: 0,
      enableBlur: false,
      blurQuality: 'low',
      enableShadows: false,
      shadowQuality: 'low',
      enableGlassEffect: false,
      enableGradients: false,
      enableTransitions: false,
      virtualListOverscan: 1,
      imageLazyLoadThreshold: 50,
      debounceDelay: 500,
      throttleDelay: 100,
      batchSize: 10,
      imageQuality: 'low',
      videoQuality: 'low',
      enablePreloading: false,
      enableWebGL: false,
      enableWebWorkers: false,
      enableOffscreenCanvas: false,
    },
  };
  
  return tierSettings[tier];
}

// =============================================================================
// SAFE API WRAPPERS
// =============================================================================

/**
 * Safely access localStorage with fallback
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      console.warn('[DEX] localStorage not available');
      return null;
    }
  },
  
  setItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('[DEX] Failed to save to localStorage:', e);
      return false;
    }
  },
  
  removeItem(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  
  clear(): boolean {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Safe requestAnimationFrame with fallback
 */
export function safeRAF(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

/**
 * Safe cancelAnimationFrame with fallback
 */
export function safeCancelRAF(id: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Safe requestIdleCallback with fallback
 */
export function safeIdleCallback(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
): number {
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(callback, options);
  }
  
  // Fallback: use setTimeout with delay
  const timeout = options?.timeout || 50;
  return globalThis.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (performance.now() % 50)),
    });
  }, 1) as unknown as number;
}

/**
 * Safe cancelIdleCallback with fallback
 */
export function safeCancelIdleCallback(id: number): void {
  if ('cancelIdleCallback' in window) {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Safe IntersectionObserver with fallback
 */
export function createSafeIntersectionObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') {
    console.warn('[DEX] IntersectionObserver not supported');
    return null;
  }
  
  try {
    return new IntersectionObserver(callback, options);
  } catch (e) {
    console.error('[DEX] Failed to create IntersectionObserver:', e);
    return null;
  }
}

/**
 * Safe ResizeObserver with fallback
 */
export function createSafeResizeObserver(
  callback: ResizeObserverCallback
): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') {
    console.warn('[DEX] ResizeObserver not supported');
    return null;
  }
  
  try {
    return new ResizeObserver(callback);
  } catch (e) {
    console.error('[DEX] Failed to create ResizeObserver:', e);
    return null;
  }
}

/**
 * Safe MutationObserver
 */
export function createSafeMutationObserver(
  callback: MutationCallback
): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') {
    console.warn('[DEX] MutationObserver not supported');
    return null;
  }
  
  try {
    return new MutationObserver(callback);
  } catch (e) {
    console.error('[DEX] Failed to create MutationObserver:', e);
    return null;
  }
}

// =============================================================================
// ERROR BOUNDARIES & RECOVERY
// =============================================================================

export interface ErrorInfo {
  message: string;
  stack?: string;
  component?: string;
  timestamp: number;
  recovered: boolean;
}

const errorLog: ErrorInfo[] = [];
const MAX_ERROR_LOG = 50;

/**
 * Log and track errors
 */
export function logError(error: Error, component?: string): ErrorInfo {
  const info: ErrorInfo = {
    message: error.message,
    stack: error.stack,
    component,
    timestamp: Date.now(),
    recovered: false,
  };
  
  errorLog.push(info);
  
  // Keep log size manageable
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift();
  }
  
  // Store in localStorage for crash analysis
  try {
    const stored = JSON.parse(localStorage.getItem('dex_error_log') || '[]');
    stored.push(info);
    if (stored.length > MAX_ERROR_LOG) stored.shift();
    localStorage.setItem('dex_error_log', JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
  
  return info;
}

/**
 * Get recent errors
 */
export function getRecentErrors(): ErrorInfo[] {
  return [...errorLog];
}

/**
 * Clear error log
 */
export function clearErrorLog(): void {
  errorLog.length = 0;
  try {
    localStorage.removeItem('dex_error_log');
  } catch {
    // Ignore
  }
}

/**
 * Safe function execution with error handling
 */
export function safeExecute<T>(
  fn: () => T,
  fallback: T,
  errorHandler?: (error: Error) => void
): T {
  try {
    return fn();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logError(error);
    errorHandler?.(error);
    return fallback;
  }
}

/**
 * Safe async function execution with error handling
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  errorHandler?: (error: Error) => void
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logError(error);
    errorHandler?.(error);
    return fallback;
  }
}

/**
 * Create a safe version of any function
 */
export function makeSafe<T extends (...args: any[]) => any>(
  fn: T,
  fallbackValue?: ReturnType<T>
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      
      // Handle promises
      if (result instanceof Promise) {
        return result.catch((e: unknown) => {
          logError(e instanceof Error ? e : new Error(String(e)));
          return fallbackValue;
        });
      }
      
      return result;
    } catch (e) {
      logError(e instanceof Error ? e : new Error(String(e)));
      return fallbackValue;
    }
  }) as T;
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

export interface FrameMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
  isJanky: boolean;
}

let frameMetrics: FrameMetrics = {
  fps: 60,
  frameTime: 16.67,
  droppedFrames: 0,
  isJanky: false,
};

let metricsCallbacks: ((metrics: FrameMetrics) => void)[] = [];
let metricsInterval: number | null = null;

/**
 * Start performance monitoring
 */
export function startPerformanceMonitoring(): void {
  if (metricsInterval) return;
  
  let lastTime = performance.now();
  let frameCount = 0;
  let droppedFrames = 0;
  
  const measure = () => {
    const now = performance.now();
    const delta = now - lastTime;
    
    if (delta >= 1000) {
      const fps = Math.round((frameCount * 1000) / delta);
      const frameTime = delta / frameCount;
      const isJanky = fps < 30 || droppedFrames > 5;
      
      frameMetrics = {
        fps,
        frameTime,
        droppedFrames,
        isJanky,
      };
      
      metricsCallbacks.forEach(cb => cb(frameMetrics));
      
      lastTime = now;
      frameCount = 0;
      droppedFrames = 0;
    }
    
    // Detect dropped frames (more than 50ms since last frame)
    if (delta > 50) {
      droppedFrames++;
    }
    
    frameCount++;
    metricsInterval = safeRAF(measure) as unknown as number;
  };
  
  metricsInterval = safeRAF(measure) as unknown as number;
}

/**
 * Stop performance monitoring
 */
export function stopPerformanceMonitoring(): void {
  if (metricsInterval) {
    safeCancelRAF(metricsInterval);
    metricsInterval = null;
  }
}

/**
 * Subscribe to performance metrics
 */
export function onPerformanceMetrics(callback: (metrics: FrameMetrics) => void): () => void {
  metricsCallbacks.push(callback);
  return () => {
    metricsCallbacks = metricsCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Get current frame metrics
 */
export function getFrameMetrics(): FrameMetrics {
  return { ...frameMetrics };
}

// =============================================================================
// MEMORY MANAGEMENT
// =============================================================================

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercent: number;
  isUnderPressure: boolean;
}

/**
 * Get memory info if available
 */
export function getMemoryInfo(): MemoryInfo | null {
  const memory = (performance as any).memory;
  
  if (!memory) return null;
  
  const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
  
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    usagePercent,
    isUnderPressure: usagePercent > 80,
  };
}

/**
 * Suggest garbage collection (if available)
 */
export function suggestGC(): void {
  // Check if gc is available (Node.js with --expose-gc flag)
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
  }
}

/**
 * Clean up resources when memory is low
 */
export function cleanupOnMemoryPressure(cleanup: () => void): () => void {
  // Check if memory pressure API is available
  if ('memory' in performance) {
    const checkMemory = () => {
      const info = getMemoryInfo();
      if (info?.isUnderPressure) {
        cleanup();
      }
    };
    
    const interval = setInterval(checkMemory, 10000);
    return () => clearInterval(interval);
  }
  
  return () => {};
}

// =============================================================================
// GRACEFUL DEGRADATION HELPERS
// =============================================================================

/**
 * CSS fallback for backdrop-filter
 */
export function applyBlurFallback(element: HTMLElement, blur: number): void {
  const features = detectFeatures();
  
  if (features.cssBackdropFilter) {
    element.style.backdropFilter = `blur(${blur}px)`;
    (element.style as unknown as Record<string, unknown>)['webkitBackdropFilter'] = `blur(${blur}px)`;
  } else {
    // Fallback: semi-transparent solid background
    element.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  }
}

/**
 * Animation fallback
 */
export function animateWithFallback(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | null {
  const features = detectFeatures();
  const profile = detectHardwareProfile();
  
  // Skip animation entirely on low-end devices or reduced motion
  if (!features.webAnimationsAPI || profile.prefersReducedMotion || profile.tier === 'low') {
    // Apply final state immediately
    const finalFrame = keyframes[keyframes.length - 1];
    Object.assign(element.style, finalFrame);
    return null;
  }
  
  // Reduce duration on medium tier
  if (profile.tier === 'medium' && options.duration) {
    options.duration = (options.duration as number) * 0.7;
  }
  
  return element.animate(keyframes, options);
}

/**
 * WebGL with canvas2D fallback
 */
export function getGraphicsContext(
  canvas: HTMLCanvasElement,
  preferWebGL: boolean = true
): WebGLRenderingContext | WebGL2RenderingContext | CanvasRenderingContext2D | null {
  const features = detectFeatures();
  const profile = detectHardwareProfile();
  
  if (preferWebGL && features.webGL2 && profile.gpu !== 'low') {
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return gl2;
  }
  
  if (preferWebGL && features.webGL && profile.gpu !== 'low') {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) return gl as WebGLRenderingContext;
  }
  
  // Fallback to 2D context
  return canvas.getContext('2d');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let _features: BrowserFeatures | null = null;
let _profile: HardwareProfile | null = null;
let _settings: AdaptiveSettings | null = null;

/**
 * Initialize compatibility layer
 */
export function initCompatibility(): {
  features: BrowserFeatures;
  profile: HardwareProfile;
  settings: AdaptiveSettings;
} {
  if (!_features) {
    _features = detectFeatures();
  }
  
  if (!_profile) {
    _profile = detectHardwareProfile();
  }
  
  if (!_settings) {
    _settings = getAdaptiveSettings(_profile);
  }
  
  // Apply CSS custom properties for adaptive settings
  applyCSSAdaptations(_settings);
  
  // Start monitoring on high-end devices only
  if (_profile.tier === 'high') {
    startPerformanceMonitoring();
  }
  
  return {
    features: _features,
    profile: _profile,
    settings: _settings,
  };
}

/**
 * Apply CSS custom properties based on settings
 */
function applyCSSAdaptations(settings: AdaptiveSettings): void {
  const root = document.documentElement;
  
  // Animation settings
  root.style.setProperty('--dex-animation-enabled', settings.enableAnimations ? '1' : '0');
  root.style.setProperty('--dex-animation-duration', `${settings.animationDuration}`);
  root.style.setProperty('--dex-transitions-enabled', settings.enableTransitions ? '1' : '0');
  
  // Effects
  root.style.setProperty('--dex-blur-enabled', settings.enableBlur ? '1' : '0');
  root.style.setProperty('--dex-shadows-enabled', settings.enableShadows ? '1' : '0');
  root.style.setProperty('--dex-glass-enabled', settings.enableGlassEffect ? '1' : '0');
  
  // Performance hints
  if (!settings.enableAnimations) {
    root.classList.add('dex-reduced-motion');
  }
  
  if (!settings.enableBlur) {
    root.classList.add('dex-no-blur');
  }
  
  if (!settings.enableShadows) {
    root.classList.add('dex-no-shadows');
  }
}

/**
 * Get cached features
 */
export function getFeatures(): BrowserFeatures {
  if (!_features) {
    _features = detectFeatures();
  }
  return _features;
}

/**
 * Get cached hardware profile
 */
export function getHardwareProfile(): HardwareProfile {
  if (!_profile) {
    _profile = detectHardwareProfile();
  }
  return _profile;
}

/**
 * Get cached adaptive settings
 */
export function getSettings(): AdaptiveSettings {
  if (!_settings) {
    const profile = getHardwareProfile();
    _settings = getAdaptiveSettings(profile);
  }
  return _settings;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Detection
  detectFeatures,
  detectHardwareProfile,
  getAdaptiveSettings,
  
  // Safe APIs
  safeStorage,
  safeRAF,
  safeCancelRAF,
  safeIdleCallback,
  safeCancelIdleCallback,
  createSafeIntersectionObserver,
  createSafeResizeObserver,
  createSafeMutationObserver,
  
  // Error handling
  logError,
  getRecentErrors,
  clearErrorLog,
  safeExecute,
  safeExecuteAsync,
  makeSafe,
  
  // Performance
  startPerformanceMonitoring,
  stopPerformanceMonitoring,
  onPerformanceMetrics,
  getFrameMetrics,
  getMemoryInfo,
  suggestGC,
  cleanupOnMemoryPressure,
  
  // Graceful degradation
  applyBlurFallback,
  animateWithFallback,
  getGraphicsContext,
  
  // Initialization
  initCompatibility,
  getFeatures,
  getHardwareProfile,
  getSettings,
};
