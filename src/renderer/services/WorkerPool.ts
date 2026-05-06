// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Worker Pool Service
// Phase H: Performance Foundations (Items 426-445)
// Offload heavy computation to workers, never block main thread
// =============================================================================

// ---------------------------------------------------------------------------
// 426-430. Worker Pool Core
// ---------------------------------------------------------------------------

interface WorkerTask<T = unknown, R = unknown> {
  id: string;
  type: string;
  payload: T;
  priority: number;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timeout?: number;
  startTime?: number;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  currentTask: string | null;
}

interface WorkerPoolOptions {
  /** Maximum number of workers (default: navigator.hardwareConcurrency) */
  maxWorkers?: number;
  /** Worker script URL or blob */
  workerUrl?: string;
  /** Task timeout in ms */
  taskTimeout?: number;
  /** Enable task priority queue */
  enablePriority?: boolean;
}

class WorkerPool {
  private workers: PooledWorker[] = [];
  private taskQueue: WorkerTask[] = [];
  private maxWorkers: number;
  private workerUrl: string;
  private taskTimeout: number;
  private enablePriority: boolean;
  private idCounter = 0;
  private initialized = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers || Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    this.workerUrl = options.workerUrl || '';
    this.taskTimeout = options.taskTimeout || 30000;
    this.enablePriority = options.enablePriority ?? true;
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // Create default worker blob if no URL provided
    if (!this.workerUrl) {
      this.workerUrl = this.createDefaultWorkerBlob();
    }

    // Pre-spawn one worker for immediate use
    this.spawnWorker();
    this.initialized = true;
  }

  /**
   * Create default worker with common operations
   */
  private createDefaultWorkerBlob(): string {
    const workerCode = `
      // DEX Worker Pool - Default Worker
      
      // Task handlers
      const handlers = {
        // JSON parsing (for large files)
        'json-parse': (data) => JSON.parse(data),
        'json-stringify': (data) => JSON.stringify(data),
        
        // Image processing
        'resize-image': async ({ imageData, width, height }) => {
          const bitmap = await createImageBitmap(imageData, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: 'high',
          });
          const canvas = new OffscreenCanvas(width, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, width, height);
        },
        
        // Hash computation
        'hash-file': async ({ buffer, algorithm = 'SHA-256' }) => {
          const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        },
        
        // Search/filter
        'filter-array': ({ array, predicate }) => {
          const fn = new Function('item', 'index', 'return ' + predicate);
          return array.filter(fn);
        },
        
        // Sort
        'sort-array': ({ array, comparator }) => {
          const fn = new Function('a', 'b', 'return ' + comparator);
          return [...array].sort(fn);
        },
        
        // Text search
        'search-text': ({ text, query, caseSensitive = false }) => {
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(query, flags);
          const matches = [];
          let match;
          while ((match = regex.exec(text)) !== null) {
            matches.push({ index: match.index, text: match[0] });
          }
          return matches;
        },
        
        // Math operations
        'compute': ({ expression, variables = {} }) => {
          const keys = Object.keys(variables);
          const values = Object.values(variables);
          const fn = new Function(...keys, 'return ' + expression);
          return fn(...values);
        },
      };
      
      // Message handler
      self.onmessage = async (e) => {
        const { id, type, payload } = e.data;
        
        try {
          const handler = handlers[type];
          if (!handler) {
            throw new Error('Unknown task type: ' + type);
          }
          
          const result = await handler(payload);
          self.postMessage({ id, success: true, result });
        } catch (error) {
          self.postMessage({ id, success: false, error: error.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  /**
   * Spawn a new worker
   */
  private spawnWorker(): PooledWorker | null {
    if (this.workers.length >= this.maxWorkers) return null;

    try {
      const worker = new Worker(this.workerUrl);
      const pooled: PooledWorker = {
        worker,
        busy: false,
        currentTask: null,
      };

      worker.onmessage = (e) => this.handleWorkerMessage(pooled, e);
      worker.onerror = (e) => this.handleWorkerError(pooled, e);

      this.workers.push(pooled);
      return pooled;
    } catch (error) {
      console.error('[WorkerPool] Failed to spawn worker:', error);
      return null;
    }
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(pooled: PooledWorker, e: MessageEvent): void {
    const { id, success, result, error } = e.data;
    
    // Find and complete the task
    const task = this.taskQueue.find(t => t.id === id);
    if (task) {
      const index = this.taskQueue.indexOf(task);
      if (index > -1) this.taskQueue.splice(index, 1);

      if (success) {
        task.resolve(result);
      } else {
        task.reject(new Error(error || 'Task failed'));
      }
    }

    // Mark worker as available
    pooled.busy = false;
    pooled.currentTask = null;

    // Process next task
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(pooled: PooledWorker, e: ErrorEvent): void {
    console.error('[WorkerPool] Worker error:', e.message);

    // Fail current task
    if (pooled.currentTask) {
      const task = this.taskQueue.find(t => t.id === pooled.currentTask);
      if (task) {
        task.reject(new Error(e.message || 'Worker error'));
        const index = this.taskQueue.indexOf(task);
        if (index > -1) this.taskQueue.splice(index, 1);
      }
    }

    // Terminate and replace worker
    const index = this.workers.indexOf(pooled);
    if (index > -1) {
      pooled.worker.terminate();
      this.workers.splice(index, 1);
    }

    // Spawn replacement if needed
    if (this.taskQueue.length > 0) {
      this.spawnWorker();
      this.processQueue();
    }
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    let worker = this.workers.find(w => !w.busy);

    // Spawn new worker if possible
    if (!worker && this.workers.length < this.maxWorkers) {
      worker = this.spawnWorker() || undefined;
    }

    if (!worker) return;

    // Sort by priority if enabled
    if (this.enablePriority) {
      this.taskQueue.sort((a, b) => b.priority - a.priority);
    }

    // Get next task
    const task = this.taskQueue.find(t => !t.startTime);
    if (!task) return;

    // Execute task
    task.startTime = Date.now();
    worker.busy = true;
    worker.currentTask = task.id;

    worker.worker.postMessage({
      id: task.id,
      type: task.type,
      payload: task.payload,
    });

    // Set timeout
    if (task.timeout || this.taskTimeout) {
      setTimeout(() => {
        if (worker?.currentTask === task.id) {
          task.reject(new Error('Task timeout'));
          worker.busy = false;
          worker.currentTask = null;
          
          const index = this.taskQueue.indexOf(task);
          if (index > -1) this.taskQueue.splice(index, 1);
          
          this.processQueue();
        }
      }, task.timeout || this.taskTimeout);
    }
  }

  // ---------------------------------------------------------------------------
  // 431-435. Task Submission
  // ---------------------------------------------------------------------------

  /**
   * Submit a task to the worker pool
   */
  async submit<T = unknown, R = unknown>(
    type: string,
    payload: T,
    options: { priority?: number; timeout?: number } = {}
  ): Promise<R> {
    if (!this.initialized) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const task: WorkerTask<T, R> = {
        id: `task-${++this.idCounter}`,
        type,
        payload,
        priority: options.priority ?? 0,
        timeout: options.timeout,
        resolve,
        reject,
      };

      this.taskQueue.push(task as WorkerTask);
      this.processQueue();
    });
  }

  /**
   * Submit high-priority task
   */
  async submitUrgent<T = unknown, R = unknown>(type: string, payload: T): Promise<R> {
    return this.submit(type, payload, { priority: 100 });
  }

  /**
   * Submit low-priority background task
   */
  async submitBackground<T = unknown, R = unknown>(type: string, payload: T): Promise<R> {
    return this.submit(type, payload, { priority: -10 });
  }

  // ---------------------------------------------------------------------------
  // 436-440. Convenience Methods
  // ---------------------------------------------------------------------------

  /**
   * Parse JSON in worker
   */
  async parseJSON<T>(json: string): Promise<T> {
    return this.submit('json-parse', json);
  }

  /**
   * Stringify to JSON in worker
   */
  async stringifyJSON(data: unknown): Promise<string> {
    return this.submit('json-stringify', data);
  }

  /**
   * Hash file/buffer in worker
   */
  async hashBuffer(buffer: ArrayBuffer, algorithm = 'SHA-256'): Promise<string> {
    return this.submit('hash-file', { buffer, algorithm });
  }

  /**
   * Search text in worker
   */
  async searchText(text: string, query: string, caseSensitive = false): Promise<Array<{ index: number; text: string }>> {
    return this.submit('search-text', { text, query, caseSensitive });
  }

  /**
   * Filter array in worker
   */
  async filterArray<T>(array: T[], predicate: string): Promise<T[]> {
    return this.submit('filter-array', { array, predicate });
  }

  /**
   * Sort array in worker
   */
  async sortArray<T>(array: T[], comparator: string): Promise<T[]> {
    return this.submit('sort-array', { array, comparator });
  }

  // ---------------------------------------------------------------------------
  // 441-445. Pool Management
  // ---------------------------------------------------------------------------

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    pendingTasks: number;
    maxWorkers: number;
  } {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      pendingTasks: this.taskQueue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  /**
   * Pause processing (keeps workers alive)
   */
  pause(): void {
    // Tasks stay in queue but aren't processed
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.processQueue();
  }

  /**
   * Terminate all workers and clear queue
   */
  terminate(): void {
    // Reject pending tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Pool terminated'));
    }
    this.taskQueue = [];

    // Terminate workers
    for (const pooled of this.workers) {
      pooled.worker.terminate();
    }
    this.workers = [];

    // Revoke blob URL if we created it
    if (this.workerUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.workerUrl);
    }

    this.initialized = false;
  }

  /**
   * Scale workers based on load
   */
  autoScale(): void {
    const stats = this.getStats();
    
    // Scale up if all workers busy and tasks pending
    if (stats.busyWorkers === stats.totalWorkers && stats.pendingTasks > 0) {
      this.spawnWorker();
    }
    
    // Scale down if workers idle
    if (stats.busyWorkers === 0 && stats.totalWorkers > 1) {
      const idle = this.workers.find(w => !w.busy);
      if (idle) {
        idle.worker.terminate();
        this.workers.splice(this.workers.indexOf(idle), 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

export const workerPool = new WorkerPool();

// Auto-initialize
if (typeof window !== 'undefined') {
  workerPool.init().catch(console.error);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { WorkerPool };
export default workerPool;
