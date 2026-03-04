// ═══════════════════════════════════════════════════════════════════════════
// DEX - State Accuracy Layer
// Phase 69: System Intelligence & Accuracy
// Single-source-of-truth, deterministic state, zero race conditions
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// STATE DOMAIN TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type StateDomain = 
  | 'ui'           // UI state (views, panels, selections)
  | 'search'       // Search state (query, results, filters)
  | 'actions'      // Action state (running, queue, history)
  | 'media'        // Media state (playback, position, queue)
  | 'editor'       // Editor state (content, cursor, dirty)
  | 'files'        // File state (selected, watched, operations)
  | 'transfers'    // Transfer state (uploads, downloads, progress)
  | 'system'       // System state (status, resources, health)
  | 'settings'     // Settings state (preferences, config)
  | 'session';     // Session state (context, recent, workspace)

export interface StateEntry<T = unknown> {
  domain: StateDomain;
  key: string;
  value: T;
  version: number;
  timestamp: number;
  source: 'main' | 'renderer' | 'sync';
}

export interface StateChange<T = unknown> {
  domain: StateDomain;
  key: string;
  previousValue: T | undefined;
  newValue: T;
  version: number;
  timestamp: number;
  source: 'main' | 'renderer' | 'sync';
  transactionId?: string;
}

export interface StateTransaction {
  id: string;
  changes: StateChange[];
  status: 'pending' | 'committed' | 'rolled-back';
  startedAt: number;
  completedAt?: number;
}

export interface StateSnapshot {
  domain: StateDomain;
  entries: Map<string, StateEntry>;
  version: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE ACCURACY LAYER
// ═══════════════════════════════════════════════════════════════════════════

class StateAccuracyLayerClass extends EventEmitter {
  private state: Map<StateDomain, Map<string, StateEntry>> = new Map();
  private versions: Map<string, number> = new Map(); // key -> version
  private transactions: Map<string, StateTransaction> = new Map();
  private subscribers: Map<string, Set<(change: StateChange) => void>> = new Map();
  private transactionCounter = 0;
  private syncLock = false;
  private pendingSync: StateChange[] = [];
  
  // Conflict resolution strategy
  private conflictStrategy: 'last-write-wins' | 'version-check' = 'version-check';

  constructor() {
    super();
    this.initializeDomains();
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  private initializeDomains(): void {
    const domains: StateDomain[] = [
      'ui', 'search', 'actions', 'media', 'editor',
      'files', 'transfers', 'system', 'settings', 'session'
    ];
    
    for (const domain of domains) {
      this.state.set(domain, new Map());
    }
    
    log.info('[StateAccuracy] Initialized all state domains');
  }

  private setupIPC(): void {
    // Receive state updates from renderer
    ipcMain.handle('state:get', (_event, domain: StateDomain, key: string) => {
      return this.get(domain, key);
    });

    ipcMain.handle('state:set', (_event, domain: StateDomain, key: string, value: unknown) => {
      return this.set(domain, key, value, 'renderer');
    });

    ipcMain.handle('state:getAll', (_event, domain: StateDomain) => {
      return this.getAllInDomain(domain);
    });

    ipcMain.handle('state:subscribe', (_event, pattern: string) => {
      // Subscription is handled via events, return current state
      return this.getSnapshot(pattern.split(':')[0] as StateDomain);
    });

    ipcMain.handle('state:transaction', (_event, changes: Array<{ domain: StateDomain; key: string; value: unknown }>) => {
      return this.transact(changes, 'renderer');
    });

    // Sync state to renderer on request
    ipcMain.handle('state:sync', (_event, domains?: StateDomain[]) => {
      return this.getSyncPayload(domains);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CORE STATE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a value from state
   */
  get<T>(domain: StateDomain, key: string): T | undefined {
    const domainState = this.state.get(domain);
    if (!domainState) return undefined;
    
    const entry = domainState.get(key);
    return entry?.value as T | undefined;
  }

  /**
   * Set a value in state with version tracking
   */
  set<T>(domain: StateDomain, key: string, value: T, source: 'main' | 'renderer' | 'sync' = 'main'): boolean {
    const domainState = this.state.get(domain);
    if (!domainState) {
      log.warn(`[StateAccuracy] Unknown domain: ${domain}`);
      return false;
    }

    const fullKey = `${domain}:${key}`;
    const currentVersion = this.versions.get(fullKey) ?? 0;
    const newVersion = currentVersion + 1;
    
    const previousEntry = domainState.get(key);
    const previousValue = previousEntry?.value as T | undefined;
    
    // Skip if value hasn't changed (deep equality check for objects)
    if (this.isEqual(previousValue, value)) {
      return true;
    }

    const entry: StateEntry<T> = {
      domain,
      key,
      value,
      version: newVersion,
      timestamp: Date.now(),
      source
    };

    domainState.set(key, entry);
    this.versions.set(fullKey, newVersion);

    const change: StateChange<T> = {
      domain,
      key,
      previousValue,
      newValue: value,
      version: newVersion,
      timestamp: entry.timestamp,
      source
    };

    // Notify subscribers
    this.notifySubscribers(change);
    
    // Broadcast to renderer
    this.broadcastChange(change);
    
    this.emit('change', change);
    
    return true;
  }

  /**
   * Atomic transaction - all changes succeed or none do
   */
  transact(
    changes: Array<{ domain: StateDomain; key: string; value: unknown }>,
    source: 'main' | 'renderer' | 'sync' = 'main'
  ): { success: boolean; transactionId: string; error?: string } {
    const transactionId = `tx-${Date.now()}-${++this.transactionCounter}`;
    const stateChanges: StateChange[] = [];
    
    const transaction: StateTransaction = {
      id: transactionId,
      changes: [],
      status: 'pending',
      startedAt: Date.now()
    };
    
    this.transactions.set(transactionId, transaction);

    try {
      // Validate all changes first
      for (const change of changes) {
        const domainState = this.state.get(change.domain);
        if (!domainState) {
          throw new Error(`Unknown domain: ${change.domain}`);
        }
        
        const fullKey = `${change.domain}:${change.key}`;
        const currentVersion = this.versions.get(fullKey) ?? 0;
        const previousEntry = domainState.get(change.key);
        
        stateChanges.push({
          domain: change.domain,
          key: change.key,
          previousValue: previousEntry?.value,
          newValue: change.value,
          version: currentVersion + 1,
          timestamp: Date.now(),
          source,
          transactionId
        });
      }

      // Apply all changes
      for (const stateChange of stateChanges) {
        const domainState = this.state.get(stateChange.domain)!;
        const fullKey = `${stateChange.domain}:${stateChange.key}`;
        
        const entry: StateEntry = {
          domain: stateChange.domain,
          key: stateChange.key,
          value: stateChange.newValue,
          version: stateChange.version,
          timestamp: stateChange.timestamp,
          source
        };
        
        domainState.set(stateChange.key, entry);
        this.versions.set(fullKey, stateChange.version);
        
        transaction.changes.push(stateChange);
      }

      transaction.status = 'committed';
      transaction.completedAt = Date.now();

      // Broadcast all changes
      for (const change of stateChanges) {
        this.notifySubscribers(change);
        this.broadcastChange(change);
      }
      
      this.emit('transaction', transaction);

      return { success: true, transactionId };

    } catch (error) {
      // Rollback
      transaction.status = 'rolled-back';
      transaction.completedAt = Date.now();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[StateAccuracy] Transaction ${transactionId} failed: ${errorMessage}`);
      
      return { success: false, transactionId, error: errorMessage };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTION & BROADCAST
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to state changes
   */
  subscribe(pattern: string, callback: (change: StateChange) => void): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    this.subscribers.get(pattern)!.add(callback);
    
    return () => {
      this.subscribers.get(pattern)?.delete(callback);
    };
  }

  private notifySubscribers(change: StateChange): void {
    const patterns = [
      '*',                                    // All changes
      `${change.domain}:*`,                   // All in domain
      `${change.domain}:${change.key}`        // Exact key
    ];

    for (const pattern of patterns) {
      const callbacks = this.subscribers.get(pattern);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback(change);
          } catch (error) {
            log.error('[StateAccuracy] Subscriber error:', error);
          }
        }
      }
    }
  }

  private broadcastChange(change: StateChange): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('state:changed', change);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SNAPSHOT & SYNC
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a snapshot of a domain
   */
  getSnapshot(domain: StateDomain): StateSnapshot | null {
    const domainState = this.state.get(domain);
    if (!domainState) return null;
    
    let maxVersion = 0;
    domainState.forEach(entry => {
      if (entry.version > maxVersion) maxVersion = entry.version;
    });

    return {
      domain,
      entries: new Map(domainState),
      version: maxVersion,
      timestamp: Date.now()
    };
  }

  /**
   * Get all values in a domain
   */
  getAllInDomain(domain: StateDomain): Record<string, unknown> {
    const domainState = this.state.get(domain);
    if (!domainState) return {};
    
    const result: Record<string, unknown> = {};
    domainState.forEach((entry, key) => {
      result[key] = entry.value;
    });
    return result;
  }

  /**
   * Get sync payload for renderer
   */
  getSyncPayload(domains?: StateDomain[]): Record<StateDomain, Record<string, unknown>> {
    const targetDomains = domains || Array.from(this.state.keys());
    const payload: Partial<Record<StateDomain, Record<string, unknown>>> = {};
    
    for (const domain of targetDomains) {
      payload[domain] = this.getAllInDomain(domain);
    }
    
    return payload as Record<StateDomain, Record<string, unknown>>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFLICT RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handle potential conflict between main and renderer state
   */
  resolveConflict<T>(
    domain: StateDomain,
    key: string,
    localValue: T,
    remoteValue: T,
    localVersion: number,
    remoteVersion: number
  ): T {
    if (this.conflictStrategy === 'last-write-wins') {
      return remoteValue;
    }
    
    // Version check - higher version wins
    if (remoteVersion > localVersion) {
      return remoteValue;
    }
    return localValue;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Deep equality check
   */
  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object);
      const bKeys = Object.keys(b as object);
      
      if (aKeys.length !== bKeys.length) return false;
      
      for (const key of aKeys) {
        if (!this.isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
          return false;
        }
      }
      return true;
    }
    
    return false;
  }

  /**
   * Get version for a key
   */
  getVersion(domain: StateDomain, key: string): number {
    return this.versions.get(`${domain}:${key}`) ?? 0;
  }

  /**
   * Check if state is stale
   */
  isStale(domain: StateDomain, key: string, compareVersion: number): boolean {
    const currentVersion = this.getVersion(domain, key);
    return compareVersion < currentVersion;
  }

  /**
   * Clear old transactions
   */
  pruneTransactions(maxAge: number = 60000): void {
    const now = Date.now();
    for (const [id, tx] of this.transactions) {
      if (tx.completedAt && (now - tx.completedAt) > maxAge) {
        this.transactions.delete(id);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEBUG & MONITORING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get stats for monitoring
   */
  getStats(): {
    domains: number;
    totalEntries: number;
    entriesPerDomain: Record<string, number>;
    pendingTransactions: number;
    activeSubscribers: number;
  } {
    let totalEntries = 0;
    const entriesPerDomain: Record<string, number> = {};
    
    for (const [domain, entries] of this.state) {
      entriesPerDomain[domain] = entries.size;
      totalEntries += entries.size;
    }
    
    let activeSubscribers = 0;
    for (const callbacks of this.subscribers.values()) {
      activeSubscribers += callbacks.size;
    }

    return {
      domains: this.state.size,
      totalEntries,
      entriesPerDomain,
      pendingTransactions: Array.from(this.transactions.values())
        .filter(tx => tx.status === 'pending').length,
      activeSubscribers
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const StateAccuracyLayer = new StateAccuracyLayerClass();
export default StateAccuracyLayer;
