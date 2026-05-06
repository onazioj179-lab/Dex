// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Misc Systems
// ==========================================================================
// Feature 63: Plugin Verification Cache
// Feature 64: On-Demand Asset Loading
// Feature 65: Background Task Framework
// Feature 66: Extension Watchdog
// Feature 67: Conflict Resolution
// Feature 68: Predictive Asset Pre-Fetching
// Feature 69: Credential Storage
// Feature 70: Session Migration
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { app, ipcMain, BrowserWindow, safeStorage } from 'electron';

// ---------------------------------------------------------------------------
// Feature 63: Plugin Verification Cache
// ---------------------------------------------------------------------------

export interface PluginVerificationEntry {
  pluginId: string;
  version: string;
  hash: string;
  verified: boolean;
  verifiedAt: number;
  expiresAt: number;
  signature?: string;
}

class PluginVerificationCache {
  private cache: Map<string, PluginVerificationEntry> = new Map();
  private cachePath = '';
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  initialize(): void {
    this.cachePath = path.join(app.getPath('userData'), 'plugin-verification-cache.json');
    this.load();
    this.pruneExpired();
    log.info(`[PluginVerify] Feature 63: Plugin verification cache initialized (${this.cache.size} entries)`);
  }

  private load(): void {
    if (fs.existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
        if (Array.isArray(data)) {
          for (const entry of data) {
            this.cache.set(this.cacheKey(entry.pluginId, entry.version), entry);
          }
        }
      } catch { /* ok */ }
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(Array.from(this.cache.values()), null, 2), 'utf-8');
    } catch { /* ok */ }
  }

  private cacheKey(pluginId: string, version: string): string {
    return `${pluginId}@${version}`;
  }

  private pruneExpired(): void {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) this.save();
  }

  isVerified(pluginId: string, version: string, currentHash: string): boolean {
    const key = this.cacheKey(pluginId, version);
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return entry.verified && entry.hash === currentHash;
  }

  recordVerification(pluginId: string, version: string, hash: string, verified: boolean, signature?: string): void {
    const key = this.cacheKey(pluginId, version);
    this.cache.set(key, {
      pluginId,
      version,
      hash,
      verified,
      verifiedAt: Date.now(),
      expiresAt: Date.now() + this.defaultTTL,
      signature,
    });
    this.save();
  }

  async verifyPlugin(pluginPath: string, pluginId: string, version: string): Promise<boolean> {
    if (!fs.existsSync(pluginPath)) return false;

    const content = await fs.promises.readFile(pluginPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Check cache first
    if (this.isVerified(pluginId, version, hash)) {
      return true;
    }

    // Perform verification: check file integrity
    const verified = content.length > 0; // Basic check; real implementation checks signatures
    this.recordVerification(pluginId, version, hash, verified);
    return verified;
  }

  invalidate(pluginId: string, version?: string): void {
    if (version) {
      this.cache.delete(this.cacheKey(pluginId, version));
    } else {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(`${pluginId}@`)) {
          this.cache.delete(key);
        }
      }
    }
    this.save();
  }

  getStats(): { total: number; verified: number; expired: number } {
    const now = Date.now();
    let verified = 0;
    let expired = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt < now) expired++;
      else if (entry.verified) verified++;
    }
    return { total: this.cache.size, verified, expired };
  }
}

// ---------------------------------------------------------------------------
// Feature 64: On-Demand Asset Loading
// ---------------------------------------------------------------------------

export interface AssetDescriptor {
  id: string;
  type: 'image' | 'font' | 'script' | 'style' | 'data' | 'model';
  path: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  sizeHint?: number;
  loaded?: boolean;
}

class OnDemandAssetLoader {
  private loadedAssets: Map<string, { data: Buffer; loadedAt: number; accessCount: number }> = new Map();
  private pendingLoads: Map<string, Promise<Buffer>> = new Map();
  private maxCacheSize = 100 * 1024 * 1024; // 100MB
  private currentCacheSize = 0;

  initialize(): void {
    ipcMain.handle('assets:load', async (_event, descriptor: AssetDescriptor) => {
      return this.loadAsset(descriptor);
    });

    ipcMain.handle('assets:preload', async (_event, descriptors: AssetDescriptor[]) => {
      await this.preloadAssets(descriptors);
    });

    ipcMain.handle('assets:unload', (_event, assetId: string) => {
      this.unloadAsset(assetId);
    });

    log.info('[AssetLoader] Feature 64: On-demand asset loader initialized');
  }

  async loadAsset(descriptor: AssetDescriptor): Promise<Buffer | null> {
    // Check cache
    const cached = this.loadedAssets.get(descriptor.id);
    if (cached) {
      cached.accessCount++;
      return cached.data;
    }

    // Check for pending load
    const pending = this.pendingLoads.get(descriptor.id);
    if (pending) {
      return pending;
    }

    // Load the asset
    const loadPromise = this.performLoad(descriptor);
    this.pendingLoads.set(descriptor.id, loadPromise);

    try {
      const data = await loadPromise;
      this.pendingLoads.delete(descriptor.id);

      // Cache the result
      if (data) {
        this.cacheAsset(descriptor.id, data);
      }

      return data;
    } catch {
      this.pendingLoads.delete(descriptor.id);
      return null;
    }
  }

  private async performLoad(descriptor: AssetDescriptor): Promise<Buffer> {
    const resolvedPath = path.isAbsolute(descriptor.path)
      ? descriptor.path
      : path.join(app.getPath('userData'), descriptor.path);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Asset not found: ${resolvedPath}`);
    }

    return fs.promises.readFile(resolvedPath);
  }

  private cacheAsset(id: string, data: Buffer): void {
    // Evict if necessary
    while (this.currentCacheSize + data.length > this.maxCacheSize && this.loadedAssets.size > 0) {
      this.evictLeastUsed();
    }

    this.loadedAssets.set(id, {
      data,
      loadedAt: Date.now(),
      accessCount: 1,
    });
    this.currentCacheSize += data.length;
  }

  private evictLeastUsed(): void {
    let leastUsedId = '';
    let leastUsedCount = Infinity;

    for (const [id, entry] of this.loadedAssets) {
      if (entry.accessCount < leastUsedCount) {
        leastUsedCount = entry.accessCount;
        leastUsedId = id;
      }
    }

    if (leastUsedId) {
      this.unloadAsset(leastUsedId);
    }
  }

  unloadAsset(id: string): void {
    const entry = this.loadedAssets.get(id);
    if (entry) {
      this.currentCacheSize -= entry.data.length;
      this.loadedAssets.delete(id);
    }
  }

  async preloadAssets(descriptors: AssetDescriptor[]): Promise<void> {
    // Sort by priority
    const sorted = [...descriptors].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const descriptor of sorted) {
      if (!this.loadedAssets.has(descriptor.id)) {
        await this.loadAsset(descriptor);
      }
    }
  }

  isLoaded(id: string): boolean {
    return this.loadedAssets.has(id);
  }

  getCacheStats(): { size: number; maxSize: number; assetCount: number } {
    return {
      size: this.currentCacheSize,
      maxSize: this.maxCacheSize,
      assetCount: this.loadedAssets.size,
    };
  }

  shutdown(): void {
    this.loadedAssets.clear();
    this.currentCacheSize = 0;
    try {
      ipcMain.removeHandler('assets:load');
      ipcMain.removeHandler('assets:preload');
      ipcMain.removeHandler('assets:unload');
    } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Feature 65: Background Task Framework
// ---------------------------------------------------------------------------

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

export interface BackgroundTask {
  id: string;
  name: string;
  priority: TaskPriority;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
}

class BackgroundTaskFramework {
  private tasks: Map<string, BackgroundTask> = new Map();
  private taskQueue: Array<{ task: BackgroundTask; executor: () => Promise<unknown> }> = [];
  private maxConcurrent = 3;
  private activeCount = 0;
  private running = false;
  private listeners: Map<string, Array<(task: BackgroundTask) => void>> = new Map();

  initialize(): void {
    this.running = true;

    ipcMain.handle('tasks:submit', async (_event, data: { name: string; priority: TaskPriority }) => {
      // Note: from IPC we can't pass executor functions, so this returns the task ID for tracking
      return data.name;
    });

    ipcMain.handle('tasks:status', (_event, taskId: string) => {
      return this.getTask(taskId);
    });

    ipcMain.handle('tasks:cancel', (_event, taskId: string) => {
      return this.cancel(taskId);
    });

    log.info('[TaskFramework] Feature 65: Background task framework initialized');
  }

  submit(name: string, priority: TaskPriority, executor: () => Promise<unknown>): string {
    const id = `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const task: BackgroundTask = {
      id,
      name,
      priority,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.taskQueue.push({ task, executor });

    // Sort by priority
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3, idle: 4 };
    this.taskQueue.sort((a, b) => priorityOrder[a.task.priority] - priorityOrder[b.task.priority]);

    this.processQueue();
    return id;
  }

  private processQueue(): void {
    if (!this.running) return;

    while (this.activeCount < this.maxConcurrent && this.taskQueue.length > 0) {
      const next = this.taskQueue.shift();
      if (!next || next.task.status === 'cancelled') continue;

      this.activeCount++;
      this.executeTask(next.task, next.executor);
    }
  }

  private async executeTask(task: BackgroundTask, executor: () => Promise<unknown>): Promise<void> {
    task.status = 'running';
    task.startedAt = Date.now();
    this.notifyListeners(task);

    try {
      task.result = await executor();
      task.status = 'completed';
      task.progress = 1.0;
      task.completedAt = Date.now();
    } catch (err: unknown) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
    } finally {
      this.activeCount--;
      this.notifyListeners(task);
      this.processQueue();
    }
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'completed' || task.status === 'failed') return false;

    task.status = 'cancelled';
    task.completedAt = Date.now();
    this.taskQueue = this.taskQueue.filter(t => t.task.id !== taskId);
    this.notifyListeners(task);
    return true;
  }

  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.progress = Math.max(0, Math.min(1, progress));
      this.notifyListeners(task);
    }
  }

  onTaskUpdate(taskId: string, callback: (task: BackgroundTask) => void): () => void {
    const existing = this.listeners.get(taskId) || [];
    existing.push(callback);
    this.listeners.set(taskId, existing);
    return () => {
      const list = this.listeners.get(taskId) || [];
      this.listeners.set(taskId, list.filter(cb => cb !== callback));
    };
  }

  private notifyListeners(task: BackgroundTask): void {
    const callbacks = this.listeners.get(task.id) || [];
    for (const cb of callbacks) {
      try { cb(task); } catch { /* ok */ }
    }
  }

  getTask(taskId: string): BackgroundTask | null {
    return this.tasks.get(taskId) || null;
  }

  getActiveTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running');
  }

  getQueuedTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'queued');
  }

  getStats(): { total: number; active: number; queued: number; completed: number; failed: number } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      active: tasks.filter(t => t.status === 'running').length,
      queued: tasks.filter(t => t.status === 'queued').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  shutdown(): void {
    this.running = false;
    // Cancel all queued tasks
    for (const { task } of this.taskQueue) {
      task.status = 'cancelled';
      task.completedAt = Date.now();
    }
    this.taskQueue = [];
    this.listeners.clear();

    try {
      ipcMain.removeHandler('tasks:submit');
      ipcMain.removeHandler('tasks:status');
      ipcMain.removeHandler('tasks:cancel');
    } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Feature 66: Extension Watchdog
// ---------------------------------------------------------------------------

export interface ExtensionHealth {
  extensionId: string;
  status: 'healthy' | 'degraded' | 'unresponsive' | 'crashed';
  lastHeartbeat: number;
  crashCount: number;
  memoryUsage: number;
  cpuTime: number;
  restartCount: number;
}

class ExtensionWatchdog {
  private extensions: Map<string, ExtensionHealth> = new Map();
  private heartbeatTimeout = 30_000; // 30 seconds
  private maxCrashCount = 3;
  private checkInterval: NodeJS.Timeout | null = null;
  private restartCallbacks: Map<string, () => Promise<void>> = new Map();

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkExtensions();
    }, 10_000);

    log.info('[Watchdog] Feature 66: Extension watchdog initialized');
  }

  register(extensionId: string, restartFn: () => Promise<void>): void {
    this.extensions.set(extensionId, {
      extensionId,
      status: 'healthy',
      lastHeartbeat: Date.now(),
      crashCount: 0,
      memoryUsage: 0,
      cpuTime: 0,
      restartCount: 0,
    });
    this.restartCallbacks.set(extensionId, restartFn);
  }

  heartbeat(extensionId: string, metrics?: { memoryUsage?: number; cpuTime?: number }): void {
    const health = this.extensions.get(extensionId);
    if (!health) return;

    health.lastHeartbeat = Date.now();
    health.status = 'healthy';
    if (metrics) {
      if (metrics.memoryUsage !== undefined) health.memoryUsage = metrics.memoryUsage;
      if (metrics.cpuTime !== undefined) health.cpuTime = metrics.cpuTime;
    }
  }

  reportCrash(extensionId: string): void {
    const health = this.extensions.get(extensionId);
    if (!health) return;

    health.crashCount++;
    health.status = 'crashed';
    log.warn(`[Watchdog] Extension ${extensionId} crashed (count: ${health.crashCount})`);

    if (health.crashCount < this.maxCrashCount) {
      this.attemptRestart(extensionId);
    } else {
      log.error(`[Watchdog] Extension ${extensionId} exceeded max crash count, disabling`);
    }
  }

  private checkExtensions(): void {
    const now = Date.now();

    for (const [id, health] of this.extensions) {
      if (health.status === 'crashed') continue;

      const elapsed = now - health.lastHeartbeat;

      if (elapsed > this.heartbeatTimeout * 2) {
        if (health.status !== 'unresponsive') {
          health.status = 'unresponsive';
          log.warn(`[Watchdog] Extension ${id} is unresponsive`);
          this.attemptRestart(id);
        }
      } else if (elapsed > this.heartbeatTimeout) {
        if (health.status !== 'degraded') {
          health.status = 'degraded';
          log.info(`[Watchdog] Extension ${id} is degraded`);
        }
      }
    }
  }

  private async attemptRestart(extensionId: string): Promise<void> {
    const health = this.extensions.get(extensionId);
    const restartFn = this.restartCallbacks.get(extensionId);
    if (!health || !restartFn) return;

    if (health.crashCount >= this.maxCrashCount) return;

    try {
      health.restartCount++;
      await restartFn();
      health.status = 'healthy';
      health.lastHeartbeat = Date.now();
      log.info(`[Watchdog] Extension ${extensionId} restarted successfully`);
    } catch (err: unknown) {
      health.status = 'crashed';
      log.error(`[Watchdog] Failed to restart extension ${extensionId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  unregister(extensionId: string): void {
    this.extensions.delete(extensionId);
    this.restartCallbacks.delete(extensionId);
  }

  getHealth(extensionId: string): ExtensionHealth | null {
    return this.extensions.get(extensionId) || null;
  }

  getAllHealth(): ExtensionHealth[] {
    return Array.from(this.extensions.values());
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.extensions.clear();
    this.restartCallbacks.clear();
  }
}

// ---------------------------------------------------------------------------
// Feature 67: Conflict Resolution
// ---------------------------------------------------------------------------

export type ConflictStrategy = 'last-write-wins' | 'first-write-wins' | 'merge' | 'manual';

export interface ConflictRecord {
  id: string;
  resourceId: string;
  timestamp: number;
  strategy: ConflictStrategy;
  resolved: boolean;
  localVersion: unknown;
  remoteVersion: unknown;
  resolvedVersion?: unknown;
  resolvedBy?: string;
}

class ConflictResolver {
  private conflicts: Map<string, ConflictRecord> = new Map();
  private strategies: Map<string, ConflictStrategy> = new Map();
  private mergeHandlers: Map<string, (local: unknown, remote: unknown) => unknown> = new Map();

  initialize(): void {
    log.info('[ConflictResolver] Feature 67: Conflict resolver initialized');
  }

  setStrategy(resourceType: string, strategy: ConflictStrategy): void {
    this.strategies.set(resourceType, strategy);
  }

  registerMergeHandler(resourceType: string, handler: (local: unknown, remote: unknown) => unknown): void {
    this.mergeHandlers.set(resourceType, handler);
  }

  detect(resourceId: string, resourceType: string, localVersion: unknown, remoteVersion: unknown): ConflictRecord {
    const id = `conflict-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const strategy = this.strategies.get(resourceType) || 'last-write-wins';

    const record: ConflictRecord = {
      id,
      resourceId,
      timestamp: Date.now(),
      strategy,
      resolved: false,
      localVersion,
      remoteVersion,
    };

    // Auto-resolve based on strategy
    switch (strategy) {
      case 'last-write-wins':
        record.resolvedVersion = remoteVersion;
        record.resolved = true;
        record.resolvedBy = 'auto:last-write-wins';
        break;

      case 'first-write-wins':
        record.resolvedVersion = localVersion;
        record.resolved = true;
        record.resolvedBy = 'auto:first-write-wins';
        break;

      case 'merge': {
        const mergeHandler = this.mergeHandlers.get(resourceType);
        if (mergeHandler) {
          try {
            record.resolvedVersion = mergeHandler(localVersion, remoteVersion);
            record.resolved = true;
            record.resolvedBy = 'auto:merge';
          } catch {
            record.resolved = false;
          }
        }
        break;
      }

      case 'manual':
        // Leave unresolved for manual intervention
        break;
    }

    this.conflicts.set(id, record);
    return record;
  }

  resolve(conflictId: string, resolvedVersion: unknown, resolvedBy: string): boolean {
    const record = this.conflicts.get(conflictId);
    if (!record) return false;

    record.resolvedVersion = resolvedVersion;
    record.resolved = true;
    record.resolvedBy = resolvedBy;
    return true;
  }

  getUnresolved(): ConflictRecord[] {
    return Array.from(this.conflicts.values()).filter(c => !c.resolved);
  }

  getConflict(id: string): ConflictRecord | null {
    return this.conflicts.get(id) || null;
  }

  clearResolved(): number {
    let count = 0;
    for (const [id, record] of this.conflicts) {
      if (record.resolved) {
        this.conflicts.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Deep merge utility for JSON-like objects.
   */
  static deepMerge(local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...local };

    for (const key of Object.keys(remote)) {
      if (key in result) {
        const localVal = result[key];
        const remoteVal = remote[key];

        if (
          localVal && remoteVal &&
          typeof localVal === 'object' && typeof remoteVal === 'object' &&
          !Array.isArray(localVal) && !Array.isArray(remoteVal)
        ) {
          result[key] = ConflictResolver.deepMerge(
            localVal as Record<string, unknown>,
            remoteVal as Record<string, unknown>,
          );
        } else {
          // Remote wins for non-object conflicts
          result[key] = remoteVal;
        }
      } else {
        result[key] = remote[key];
      }
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Feature 68: Predictive Asset Pre-Fetching
// ---------------------------------------------------------------------------

interface AssetAccess {
  assetId: string;
  timestamp: number;
  context: string; // e.g., page name, feature name
}

class PredictiveAssetPreFetcher {
  private accessLog: AssetAccess[] = [];
  private maxLogSize = 5000;
  private contextToAssets: Map<string, Map<string, number>> = new Map(); // context -> assetId -> count
  private prefetchCallbacks: Map<string, (assetId: string) => Promise<void>> = new Map();
  private prefetchThreshold = 3; // Minimum access count before prefetching

  initialize(): void {
    const dataPath = path.join(app.getPath('userData'), 'asset-access-log.json');
    if (fs.existsSync(dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        if (data.contextToAssets) {
          for (const [ctx, assets] of Object.entries(data.contextToAssets)) {
            this.contextToAssets.set(ctx, new Map(Object.entries(assets as Record<string, number>)));
          }
        }
      } catch { /* ok */ }
    }

    log.info('[AssetPreFetch] Feature 68: Predictive asset pre-fetcher initialized');
  }

  recordAccess(assetId: string, context: string): void {
    this.accessLog.push({ assetId, timestamp: Date.now(), context });
    if (this.accessLog.length > this.maxLogSize) {
      this.accessLog = this.accessLog.slice(-this.maxLogSize / 2);
    }

    // Update context -> asset mapping
    const assets = this.contextToAssets.get(context) || new Map();
    assets.set(assetId, (assets.get(assetId) || 0) + 1);
    this.contextToAssets.set(context, assets);
  }

  registerPrefetcher(assetType: string, callback: (assetId: string) => Promise<void>): void {
    this.prefetchCallbacks.set(assetType, callback);
  }

  async prefetchForContext(context: string): Promise<string[]> {
    const assets = this.contextToAssets.get(context);
    if (!assets) return [];

    const sorted = Array.from(assets.entries())
      .filter(([, count]) => count >= this.prefetchThreshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10

    const prefetched: string[] = [];

    for (const [assetId] of sorted) {
      // Determine asset type from ID
      const assetType = assetId.split(':')[0] || 'default';
      const callback = this.prefetchCallbacks.get(assetType);

      if (callback) {
        try {
          await callback(assetId);
          prefetched.push(assetId);
        } catch { /* ok */ }
      }
    }

    return prefetched;
  }

  getTopAssets(context: string, count: number = 5): Array<{ assetId: string; accessCount: number }> {
    const assets = this.contextToAssets.get(context);
    if (!assets) return [];

    return Array.from(assets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([assetId, accessCount]) => ({ assetId, accessCount }));
  }

  persist(): void {
    const dataPath = path.join(app.getPath('userData'), 'asset-access-log.json');
    const serialized: Record<string, Record<string, number>> = {};
    for (const [ctx, assets] of this.contextToAssets) {
      serialized[ctx] = Object.fromEntries(assets);
    }
    try {
      fs.writeFileSync(dataPath, JSON.stringify({ contextToAssets: serialized }), 'utf-8');
    } catch { /* ok */ }
  }

  shutdown(): void {
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Feature 69: Credential Storage
// ---------------------------------------------------------------------------

export interface StoredCredential {
  service: string;
  account: string;
  encryptedData: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, string>;
}

class CredentialStorage {
  private credentials: Map<string, StoredCredential> = new Map();
  private storagePath = '';

  initialize(): void {
    this.storagePath = path.join(app.getPath('userData'), 'credential-store.enc');
    this.load();
    log.info('[CredentialStore] Feature 69: Credential storage initialized');
  }

  private credKey(service: string, account: string): string {
    return `${service}::${account}`;
  }

  private load(): void {
    if (!fs.existsSync(this.storagePath)) return;

    try {
      const encrypted = fs.readFileSync(this.storagePath);
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encrypted);
        const data = JSON.parse(decrypted);
        if (Array.isArray(data)) {
          for (const cred of data) {
            this.credentials.set(this.credKey(cred.service, cred.account), cred);
          }
        }
      }
    } catch { /* ok: may be first run or corrupted, start fresh */ }
  }

  private save(): void {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const data = JSON.stringify(Array.from(this.credentials.values()));
        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(this.storagePath, encrypted);
      }
    } catch { /* ok */ }
  }

  store(service: string, account: string, secret: string, metadata?: Record<string, string>): void {
    const key = this.credKey(service, account);
    const now = Date.now();

    // Double-encrypt the secret itself
    let encryptedSecret = secret;
    if (safeStorage.isEncryptionAvailable()) {
      encryptedSecret = safeStorage.encryptString(secret).toString('base64');
    }

    const existing = this.credentials.get(key);
    this.credentials.set(key, {
      service,
      account,
      encryptedData: encryptedSecret,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      metadata,
    });

    this.save();
  }

  retrieve(service: string, account: string): string | null {
    const key = this.credKey(service, account);
    const cred = this.credentials.get(key);
    if (!cred) return null;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(cred.encryptedData, 'base64');
        return safeStorage.decryptString(buf);
      }
      return cred.encryptedData;
    } catch { return null; }
  }

  remove(service: string, account: string): boolean {
    const key = this.credKey(service, account);
    const removed = this.credentials.delete(key);
    if (removed) this.save();
    return removed;
  }

  listServices(): string[] {
    const services = new Set<string>();
    for (const cred of this.credentials.values()) {
      services.add(cred.service);
    }
    return Array.from(services);
  }

  listAccounts(service: string): string[] {
    const accounts: string[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.service === service) accounts.push(cred.account);
    }
    return accounts;
  }

  has(service: string, account: string): boolean {
    return this.credentials.has(this.credKey(service, account));
  }
}

// ---------------------------------------------------------------------------
// Feature 70: Session Migration
// ---------------------------------------------------------------------------

export interface SessionState {
  id: string;
  createdAt: number;
  windows: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    url: string;
    title: string;
    state: Record<string, unknown>;
  }>;
  activePage: string;
  scrollPositions: Map<string, number>;
  formData: Map<string, Record<string, string>>;
  customState: Record<string, unknown>;
}

class SessionMigrator {
  private sessionDir = '';
  private currentSession: SessionState | null = null;

  initialize(): void {
    this.sessionDir = path.join(app.getPath('userData'), 'sessions');
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.currentSession = this.createEmptySession();

    ipcMain.handle('session:save', async () => {
      return this.captureCurrentSession();
    });

    ipcMain.handle('session:restore', async (_event, sessionId: string) => {
      return this.restoreSession(sessionId);
    });

    ipcMain.handle('session:list', async () => {
      return this.listSessions();
    });

    ipcMain.handle('session:update-state', (_event, data: { key: string; value: unknown }) => {
      if (this.currentSession) {
        this.currentSession.customState[data.key] = data.value;
      }
    });

    log.info('[SessionMigrator] Feature 70: Session migrator initialized');
  }

  private createEmptySession(): SessionState {
    return {
      id: `session-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      createdAt: Date.now(),
      windows: [],
      activePage: '',
      scrollPositions: new Map(),
      formData: new Map(),
      customState: {},
    };
  }

  async captureCurrentSession(): Promise<string> {
    const session = this.currentSession || this.createEmptySession();
    session.windows = [];

    // Capture all windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        const bounds = win.getBounds();
        session.windows.push({
          bounds,
          url: win.webContents.getURL(),
          title: win.webContents.getTitle(),
          state: {},
        });
      } catch { /* ok */ }
    }

    // Serialize to disk
    const filePath = path.join(this.sessionDir, `${session.id}.json`);
    const serializable = {
      ...session,
      scrollPositions: Object.fromEntries(session.scrollPositions),
      formData: Object.fromEntries(session.formData),
    };

    await fs.promises.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
    log.info(`[SessionMigrator] Session captured: ${session.id}`);
    return session.id;
  }

  async restoreSession(sessionId: string): Promise<boolean> {
    const filePath = path.join(this.sessionDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return false;

    try {
      const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));

      // Restore window states
      for (const winState of data.windows) {
        try {
          const existingWindows = BrowserWindow.getAllWindows();
          if (existingWindows.length > 0) {
            const win = existingWindows[0];
            win.setBounds(winState.bounds);
          }
        } catch { /* ok */ }
      }

      // Restore custom state
      this.currentSession = {
        ...data,
        scrollPositions: new Map(Object.entries(data.scrollPositions || {})),
        formData: new Map(Object.entries(data.formData || {})),
      };

      // Notify renderers
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send('session:restored', {
            activePage: data.activePage,
            customState: data.customState,
          });
        } catch { /* ok */ }
      }

      log.info(`[SessionMigrator] Session restored: ${sessionId}`);
      return true;
    } catch (err: unknown) {
      log.error(`[SessionMigrator] Failed to restore session ${sessionId}: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  async listSessions(): Promise<Array<{ id: string; createdAt: number; windowCount: number }>> {
    const files = await fs.promises.readdir(this.sessionDir);
    const sessions: Array<{ id: string; createdAt: number; windowCount: number }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await fs.promises.readFile(path.join(this.sessionDir, file), 'utf-8'));
        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          windowCount: data.windows?.length || 0,
        });
      } catch { /* ok */ }
    }

    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const filePath = path.join(this.sessionDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return false;
    await fs.promises.unlink(filePath);
    return true;
  }

  getCurrentSession(): SessionState | null {
    return this.currentSession;
  }

  setActivePage(page: string): void {
    if (this.currentSession) {
      this.currentSession.activePage = page;
    }
  }

  setScrollPosition(page: string, position: number): void {
    if (this.currentSession) {
      this.currentSession.scrollPositions.set(page, position);
    }
  }

  setFormData(formId: string, data: Record<string, string>): void {
    if (this.currentSession) {
      this.currentSession.formData.set(formId, data);
    }
  }

  shutdown(): void {
    // Auto-save on shutdown
    if (this.currentSession) {
      try {
        const filePath = path.join(this.sessionDir, 'last-session.json');
        const serializable = {
          ...this.currentSession,
          scrollPositions: Object.fromEntries(this.currentSession.scrollPositions),
          formData: Object.fromEntries(this.currentSession.formData),
        };
        fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
      } catch { /* ok */ }
    }

    try {
      ipcMain.removeHandler('session:save');
      ipcMain.removeHandler('session:restore');
      ipcMain.removeHandler('session:list');
      ipcMain.removeHandler('session:update-state');
    } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const pluginVerificationCache = new PluginVerificationCache();
export const onDemandAssetLoader = new OnDemandAssetLoader();
export const backgroundTaskFramework = new BackgroundTaskFramework();
export const extensionWatchdog = new ExtensionWatchdog();
export const conflictResolver = new ConflictResolver();
export const predictiveAssetPreFetcher = new PredictiveAssetPreFetcher();
export const credentialStorage = new CredentialStorage();
export const sessionMigrator = new SessionMigrator();

export function initializeMiscSystems(): void {
  pluginVerificationCache.initialize();
  onDemandAssetLoader.initialize();
  backgroundTaskFramework.initialize();
  extensionWatchdog.initialize();
  conflictResolver.initialize();
  predictiveAssetPreFetcher.initialize();
  credentialStorage.initialize();
  sessionMigrator.initialize();
  log.info('[MiscSystems] Features 63-70: Misc systems initialized');
}

export function shutdownMiscSystems(): void {
  sessionMigrator.shutdown();
  predictiveAssetPreFetcher.shutdown();
  extensionWatchdog.shutdown();
  backgroundTaskFramework.shutdown();
  onDemandAssetLoader.shutdown();
}
