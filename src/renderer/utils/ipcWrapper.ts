// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 30: Async IPC Wrapper
// Non-blocking IPC communication with timeouts, retries, and cancellation
// ═══════════════════════════════════════════════════════════════════════════

import { coalesceRequest, LRUCache, scheduleIdleWork } from './performance';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export interface IPCConfig {
  /** Default timeout for IPC calls (ms) */
  defaultTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay between retries (ms) */
  retryBaseDelay: number;
  /** Whether to cache successful responses */
  enableCache: boolean;
  /** Cache TTL (ms) */
  cacheTTL: number;
}

const DEFAULT_CONFIG: IPCConfig = {
  defaultTimeout: 5000,
  maxRetries: 2,
  retryBaseDelay: 100,
  enableCache: true,
  cacheTTL: 30000, // 30 seconds
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface IPCCallOptions {
  /** Timeout for this specific call (ms) */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Whether to use cached response */
  useCache?: boolean;
  /** Cache key (defaults to channel + args hash) */
  cacheKey?: string;
  /** Priority for request coalescing */
  priority?: 'high' | 'normal' | 'low';
  /** Signal to abort the request */
  signal?: AbortSignal;
}

export interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  duration?: number;
}

interface CachedResponse<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────

const responseCache = new LRUCache<string, CachedResponse<unknown>>(200);

function getCacheKey(channel: string, args: unknown[]): string {
  return `${channel}:${JSON.stringify(args)}`;
}

function getCachedResponse<T>(key: string, ttl: number): T | null {
  const cached = responseCache.get(key);
  if (!cached) return null;
  
  // Check if cache entry has expired
  if (Date.now() - cached.timestamp > (cached.ttl || ttl)) {
    responseCache.delete(key);
    return null;
  }
  
  return cached.data as T;
}

function setCachedResponse<T>(key: string, data: T, ttl: number): void {
  responseCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMEOUT PROMISE
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Handle abort signal
    if (signal?.aborted) {
      reject(new Error('Request aborted'));
      return;
    }
    
    const timeoutId = setTimeout(() => {
      reject(new Error(`IPC call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Listen for abort
    const abortHandler = () => {
      clearTimeout(timeoutId);
      reject(new Error('Request aborted'));
    };
    
    signal?.addEventListener('abort', abortHandler);
    
    promise
      .then((result) => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);
        reject(error);
      });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY LOGIC
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelay: number,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }
    
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on timeout or abort
      if (lastError.message.includes('timed out') || lastError.message.includes('aborted')) {
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt < retries) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Unknown error');
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC WRAPPER CLASS
// ─────────────────────────────────────────────────────────────────────────────

class IPCWrapper {
  private config: IPCConfig;
  private pendingRequests = new Map<string, Promise<unknown>>();
  private metrics = {
    totalCalls: 0,
    cacheHits: 0,
    errors: 0,
    averageLatency: 0,
    latencySum: 0,
  };
  
  constructor(config: Partial<IPCConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Make an IPC call with timeout, retry, and caching
   */
  async call<T = unknown>(
    channel: string,
    args: unknown[] = [],
    options: IPCCallOptions = {}
  ): Promise<IPCResult<T>> {
    const startTime = performance.now();
    this.metrics.totalCalls++;
    
    const {
      timeout = this.config.defaultTimeout,
      retries = this.config.maxRetries,
      useCache = this.config.enableCache,
      cacheKey = getCacheKey(channel, args),
      signal,
    } = options;
    
    // Check cache first
    if (useCache) {
      const cached = getCachedResponse<T>(cacheKey, this.config.cacheTTL);
      if (cached !== null) {
        this.metrics.cacheHits++;
        return {
          success: true,
          data: cached,
          cached: true,
          duration: performance.now() - startTime,
        };
      }
    }
    
    // Coalesce duplicate in-flight requests
    const existingRequest = this.pendingRequests.get(cacheKey);
    if (existingRequest) {
      try {
        const data = await existingRequest as T;
        return {
          success: true,
          data,
          cached: false,
          duration: performance.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: performance.now() - startTime,
        };
      }
    }
    
    // Make the actual IPC call
    const request = withRetry(
      () => withTimeout(this.invoke<T>(channel, args), timeout, signal),
      retries,
      this.config.retryBaseDelay,
      signal
    );
    
    this.pendingRequests.set(cacheKey, request);
    
    try {
      const data = await request;
      
      // Cache successful response
      if (useCache) {
        setCachedResponse(cacheKey, data, this.config.cacheTTL);
      }
      
      const duration = performance.now() - startTime;
      this.updateLatencyMetrics(duration);
      
      return {
        success: true,
        data,
        cached: false,
        duration,
      };
    } catch (error) {
      this.metrics.errors++;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: performance.now() - startTime,
      };
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }
  
  /**
   * Make a fire-and-forget IPC call
   */
  send(channel: string, args: unknown[] = []): void {
    // Schedule for idle time to avoid blocking UI
    scheduleIdleWork(() => {
      this.invoke(channel, args).catch((error) => {
        console.error(`[IPC] Send failed for ${channel}:`, error);
      });
    }, 2);
  }
  
  /**
   * Clear the response cache
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      // Clear matching entries
      for (const [key] of responseCache.entries()) {
        if (key.includes(pattern)) {
          responseCache.delete(key);
        }
      }
    } else {
      responseCache.clear();
    }
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalCalls > 0 
        ? (this.metrics.cacheHits / this.metrics.totalCalls * 100).toFixed(1) + '%'
        : '0%',
      errorRate: this.metrics.totalCalls > 0
        ? (this.metrics.errors / this.metrics.totalCalls * 100).toFixed(1) + '%'
        : '0%',
    };
  }
  
  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    this.metrics.latencySum += latency;
    this.metrics.averageLatency = this.metrics.latencySum / (this.metrics.totalCalls - this.metrics.cacheHits);
  }
  
  /**
   * Internal invoke method - override for testing
   */
  private async invoke<T>(channel: string, args: unknown[]): Promise<T> {
    // Access the actual Electron IPC
    if (typeof window !== 'undefined' && window.dex) {
      // Navigate through dex object to find the channel
      const parts = channel.split('.');
      let obj: any = window.dex;
      
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
        if (!obj) {
          throw new Error(`Invalid channel: ${channel}`);
        }
      }
      
      const method = parts[parts.length - 1];
      if (typeof obj[method] !== 'function') {
        throw new Error(`Method not found: ${channel}`);
      }
      
      return await obj[method](...args);
    }
    
    throw new Error('IPC not available');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const ipc = new IPCWrapper();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Make a cached IPC call
 */
export async function cachedCall<T>(
  channel: string,
  args: unknown[] = [],
  ttl?: number
): Promise<T> {
  const result = await ipc.call<T>(channel, args, {
    useCache: true,
    timeout: ttl,
  });
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.data!;
}

/**
 * Make an uncached IPC call
 */
export async function directCall<T>(
  channel: string,
  args: unknown[] = []
): Promise<T> {
  const result = await ipc.call<T>(channel, args, {
    useCache: false,
  });
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.data!;
}

/**
 * Make a fire-and-forget IPC call
 */
export function sendAsync(channel: string, args: unknown[] = []): void {
  ipc.send(channel, args);
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOK
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIPCOptions<T> extends IPCCallOptions {
  /** Initial data before fetch completes */
  initialData?: T;
  /** Skip initial fetch */
  skip?: boolean;
  /** Refetch on window focus */
  refetchOnFocus?: boolean;
  /** Polling interval (ms), 0 to disable */
  pollingInterval?: number;
}

interface UseIPCResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isCached: boolean;
}

/**
 * React hook for IPC calls with caching and loading state
 */
export function useIPC<T>(
  channel: string,
  args: unknown[] = [],
  options: UseIPCOptions<T> = {}
): UseIPCResult<T> {
  const {
    initialData,
    skip = false,
    refetchOnFocus = false,
    pollingInterval = 0,
    ...ipcOptions
  } = options;
  
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const mountedRef = useRef(true);
  const argsRef = useRef(args);
  argsRef.current = args;
  
  const fetch = useCallback(async () => {
    if (!mountedRef.current) return;
    
    setLoading(true);
    setError(null);
    
    const result = await ipc.call<T>(channel, argsRef.current, ipcOptions);
    
    if (!mountedRef.current) return;
    
    if (result.success) {
      setData(result.data);
      setIsCached(result.cached ?? false);
    } else {
      setError(result.error ?? 'Unknown error');
    }
    
    setLoading(false);
  }, [channel, ipcOptions]);
  
  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    
    if (!skip) {
      fetch();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [skip, channel, JSON.stringify(args)]);
  
  // Refetch on focus
  useEffect(() => {
    if (!refetchOnFocus) return;
    
    const handleFocus = () => {
      if (!skip) fetch();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchOnFocus, skip, fetch]);
  
  // Polling
  useEffect(() => {
    if (pollingInterval <= 0 || skip) return;
    
    const interval = setInterval(fetch, pollingInterval);
    return () => clearInterval(interval);
  }, [pollingInterval, skip, fetch]);
  
  return {
    data,
    loading,
    error,
    refetch: fetch,
    isCached,
  };
}

/**
 * React hook for lazy IPC calls (only fetch when called)
 */
export function useLazyIPC<T, Args extends unknown[] = unknown[]>(
  channel: string,
  options: IPCCallOptions = {}
): [(args?: Args) => Promise<T>, UseIPCResult<T>] {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  
  const execute = useCallback(async (args: Args = [] as unknown as Args): Promise<T> => {
    setLoading(true);
    setError(null);
    
    const result = await ipc.call<T>(channel, args, options);
    
    if (result.success) {
      setData(result.data);
      setIsCached(result.cached ?? false);
      setLoading(false);
      return result.data!;
    } else {
      setError(result.error ?? 'Unknown error');
      setLoading(false);
      throw new Error(result.error);
    }
  }, [channel, options]);
  
  const refetch = useCallback(async () => {
    await execute();
  }, [execute]);
  
  return [
    execute,
    { data, loading, error, refetch, isCached }
  ];
}
