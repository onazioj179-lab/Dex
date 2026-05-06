// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Native Module Guards (Item 265)
 * Null-guard wrappers for native module calls to prevent crashes
 */

type NativeResult<T> = { success: true; data: T } | { success: false; error: string };

// ============================================================================
// Safe Native Wrapper
// ============================================================================

/**
 * Safely invoke a native module function with error handling and timeout
 */
export function safeNativeCall<T>(
  fn: () => T | Promise<T>,
  fallback: T,
  options?: { timeout?: number; label?: string }
): T | Promise<T> {
  const { timeout = 5000, label = 'native call' } = options || {};

  try {
    const result = fn();

    if (result instanceof Promise) {
      return Promise.race([
        result.catch(err => {
          console.warn(`[NativeGuard] Async ${label} failed:`, err);
          return fallback;
        }),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timeout`)), timeout)
        ).catch(() => {
          console.warn(`[NativeGuard] ${label} timed out after ${timeout}ms`);
          return fallback;
        }),
      ]);
    }

    return result;
  } catch (err) {
    console.warn(`[NativeGuard] Sync ${label} failed:`, err);
    return fallback;
  }
}

/**
 * Create a guarded version of any native module
 */
export function guardNativeModule<T extends object>(
  module: T | null | undefined,
  fallbacks: T
): T {
  if (!module) {
    console.warn('[NativeGuard] Native module is null, using fallbacks');
    return fallbacks as T;
  }

  const handler: ProxyHandler<T> = {
    get(target, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop);
      }

      const value = Reflect.get(target, prop);
      const fallbackValue = Reflect.get(fallbacks, prop);

      if (typeof value === 'function') {
        return function guardedFn(...args: unknown[]) {
          try {
            const result = (value as Function).apply(target, args);

            if (result instanceof Promise) {
              return result.catch(err => {
                console.warn(`[NativeGuard] Method ${prop} failed:`, err);
                if (typeof fallbackValue === 'function') {
                  return fallbackValue(...args);
                }
                return fallbackValue;
              });
            }

            return result;
          } catch (err) {
            console.warn(`[NativeGuard] Method ${prop} threw:`, err);
            if (typeof fallbackValue === 'function') {
              return fallbackValue(...args);
            }
            return fallbackValue;
          }
        };
      }

      return value ?? fallbackValue;
    },
  };

  return new Proxy(module, handler);
}

// ============================================================================
// Specific Native Module Guards
// ============================================================================

export interface SafeAudioModule {
  getInputDevices(): Promise<Array<{ id: string; name: string }>>;
  getOutputDevices(): Promise<Array<{ id: string; name: string }>>;
  getVolume(): Promise<number>;
  setVolume(level: number): Promise<void>;
  getMuted(): Promise<boolean>;
  setMuted(muted: boolean): Promise<void>;
}

export function createSafeAudioModule(nativeAudio: unknown): SafeAudioModule {
  const fallback: SafeAudioModule = {
    getInputDevices: async () => [],
    getOutputDevices: async () => [],
    getVolume: async () => 100,
    setVolume: async () => {},
    getMuted: async () => false,
    setMuted: async () => {},
  };

  if (!nativeAudio || typeof nativeAudio !== 'object') {
    return fallback;
  }

  return guardNativeModule(nativeAudio as SafeAudioModule, fallback);
}

export interface SafeImageModule {
  getMetadata(path: string): Promise<{ width: number; height: number; format: string } | null>;
  resize(path: string, width: number, height: number): Promise<Buffer | null>;
  convert(path: string, format: string): Promise<Buffer | null>;
  compress(path: string, quality: number): Promise<Buffer | null>;
}

export function createSafeImageModule(nativeImage: unknown): SafeImageModule {
  const fallback: SafeImageModule = {
    getMetadata: async () => null,
    resize: async () => null,
    convert: async () => null,
    compress: async () => null,
  };

  if (!nativeImage || typeof nativeImage !== 'object') {
    return fallback;
  }

  return guardNativeModule(nativeImage as SafeImageModule, fallback);
}

export interface SafeVideoModule {
  getMetadata(path: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
  } | null>;
  extractFrame(path: string, time: number): Promise<Buffer | null>;
  extractAudio(path: string): Promise<Buffer | null>;
}

export function createSafeVideoModule(nativeVideo: unknown): SafeVideoModule {
  const fallback: SafeVideoModule = {
    getMetadata: async () => null,
    extractFrame: async () => null,
    extractAudio: async () => null,
  };

  if (!nativeVideo || typeof nativeVideo !== 'object') {
    return fallback;
  }

  return guardNativeModule(nativeVideo as SafeVideoModule, fallback);
}

export interface SafeSystemModule {
  getCpuUsage(): Promise<number>;
  getMemoryUsage(): Promise<{ total: number; used: number; free: number }>;
  getBatteryInfo(): Promise<{ level: number; charging: boolean } | null>;
  getProcessList(): Promise<Array<{ pid: number; name: string; cpu: number; memory: number }>>;
}

export function createSafeSystemModule(nativeSystem: unknown): SafeSystemModule {
  const fallback: SafeSystemModule = {
    getCpuUsage: async () => 0,
    getMemoryUsage: async () => ({ total: 0, used: 0, free: 0 }),
    getBatteryInfo: async () => null,
    getProcessList: async () => [],
  };

  if (!nativeSystem || typeof nativeSystem !== 'object') {
    return fallback;
  }

  return guardNativeModule(nativeSystem as SafeSystemModule, fallback);
}

// ============================================================================
// Retry Wrapper
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoff: 'linear' | 'exponential';
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 100,
  backoff: 'exponential',
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, delayMs, backoff } = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[NativeGuard] Attempt ${attempt}/${maxAttempts} failed:`, err);

      if (attempt < maxAttempts) {
        const delay = backoff === 'exponential' 
          ? delayMs * Math.pow(2, attempt - 1)
          : delayMs * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeMs: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeMs: 30000,
};

export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: T,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const { failureThreshold, resetTimeMs } = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: 'closed' };
    circuits.set(key, circuit);
  }

  const now = Date.now();

  // Check if circuit should transition from open to half-open
  if (circuit.state === 'open' && now - circuit.lastFailure >= resetTimeMs) {
    circuit.state = 'half-open';
  }

  // If circuit is open, return fallback immediately
  if (circuit.state === 'open') {
    console.warn(`[CircuitBreaker] Circuit ${key} is open, returning fallback`);
    return fallback;
  }

  try {
    const result = await fn();
    
    // Success - reset circuit
    circuit.failures = 0;
    circuit.state = 'closed';
    
    return result;
  } catch (err) {
    circuit.failures++;
    circuit.lastFailure = now;
    
    console.warn(`[CircuitBreaker] ${key} failed (${circuit.failures}/${failureThreshold}):`, err);

    if (circuit.failures >= failureThreshold) {
      circuit.state = 'open';
      console.warn(`[CircuitBreaker] Circuit ${key} opened after ${failureThreshold} failures`);
    }

    return fallback;
  }
}

// ============================================================================
// Health Check
// ============================================================================

export interface ModuleHealth {
  name: string;
  available: boolean;
  lastCheck: number;
  responseTimeMs: number;
  error?: string;
}

export async function checkModuleHealth(
  name: string,
  checkFn: () => Promise<boolean>
): Promise<ModuleHealth> {
  const start = Date.now();
  
  try {
    const available = await Promise.race([
      checkFn(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      ),
    ]);
    
    return {
      name,
      available,
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      available: false,
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
