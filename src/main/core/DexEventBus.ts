// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Dex Event Bus
// ==========================================================================
// Central event router on the main process. Apps subscribe to typed
// events; the bus routes them with fire-and-forget semantics. Unready
// subscribers get events queued and delivered once they report ready.
// Cross-app reactions (focus session start, capability tier change, etc.)
// are wired through this single hub.
// ==========================================================================

import * as log from 'electron-log';
import { ipcMain, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DexEventType =
  | 'app-ready'
  | 'app-focus'
  | 'app-blur'
  | 'app-closed'
  | 'app-switched'
  | 'project-opened'
  | 'project-saved'
  | 'project-closed'
  | 'file-created'
  | 'file-modified'
  | 'file-deleted'
  | 'file-renamed'
  | 'task-created'
  | 'task-completed'
  | 'task-deleted'
  | 'plugin-loaded'
  | 'plugin-unloaded'
  | 'plugin-event'
  | 'focus-session-start'
  | 'focus-session-end'
  | 'idle-start'
  | 'idle-end'
  | 'capability-tier-change'
  | 'theme-change'
  | 'shortcut-triggered'
  | 'notification-shown'
  | 'notification-dismissed'
  | 'search-executed'
  | 'media-play'
  | 'media-pause'
  | 'media-stop'
  | 'system-warning'
  | 'system-error'
  | 'performance-violation'
  | 'rewind-snapshot'
  | 'backup-completed'
  | 'sync-completed'
  | 'user-preference-changed'
  | 'item-renamed'
  | 'item-created'
  | 'item-deleted'
  | 'color-label-changed'
  | 'dependency-added'
  | 'reminder-fired'
  | 'bulk-operation-completed'
  | 'project-locked'
  | 'project-unlocked'
  | 'project-created'
  | 'project-updated'
  | 'project-deleted'
  | 'note-created'
  | 'note-updated'
  | 'media-added'
  | 'media-removed'
  | 'version-saved'
  | 'version-restored'
  | 'memory-pressure-moderate'
  | 'memory-pressure-high'
  | 'memory-pressure-critical'
  | 'thermal-hot'
  | 'thermal-critical';

export interface DexEvent {
  type: DexEventType;
  source: string;
  payload: any;
  timestamp: number;
  id: string;
}

type EventHandler = (event: DexEvent) => void;

interface Subscription {
  id: string;
  source: string;
  eventTypes: DexEventType[] | '*';
  handler: EventHandler;
  once: boolean;
}

interface QueuedEvent {
  event: DexEvent;
  targetSource: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_QUEUED_EVENTS = 200;
const MAX_EVENT_HISTORY = 500;
const EVENT_DELIVERY_TIMEOUT_MS = 100;
const TRACER_BUFFER_SIZE = 1000;

let _eventIdCounter = 0;

function createEventId(): string {
  _eventIdCounter = (_eventIdCounter + 1) & 0x7fffffff;
  return `evt-${Date.now().toString(36)}-${_eventIdCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Event Tracer (development-only diagnostic tool)
// ---------------------------------------------------------------------------

interface TraceEntry {
  eventId: string;
  eventType: DexEventType;
  emitter: string;
  subscribers: string[];
  errors: string[];
  emitTimestamp: number;
  deliveryDurationMs: number;
}

class EventTracer {
  private buffer: TraceEntry[] = [];
  private enabled = false;

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

  record(entry: TraceEntry): void {
    if (!this.enabled) return;
    this.buffer.push(entry);
    if (this.buffer.length > TRACER_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-TRACER_BUFFER_SIZE);
    }
  }

  getEntries(limit: number = 100): TraceEntry[] {
    return this.buffer.slice(-limit);
  }

  getErrorEntries(limit: number = 50): TraceEntry[] {
    return this.buffer.filter(e => e.errors.length > 0).slice(-limit);
  }

  clear(): void {
    this.buffer = [];
  }
}

// ---------------------------------------------------------------------------
// Dex Event Bus
// ---------------------------------------------------------------------------

class DexEventBus {
  private subscriptions = new Map<string, Subscription>();
  private readySources = new Set<string>();
  private eventQueue: QueuedEvent[] = [];
  private eventHistory: DexEvent[] = [];
  private eventCounts = new Map<DexEventType, number>();
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;
  private tracer = new EventTracer();

  initialize(win: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = win;
    this.registerIPC();
    this.initialized = true;
    log.info('[DexEventBus] Initialized');
  }

  // ---------------------------------------------------------------------------
  // Subscription management
  // ---------------------------------------------------------------------------

  subscribe(source: string, eventTypes: DexEventType[] | '*', handler: EventHandler, once: boolean = false): string {
    const id = `sub-${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.subscriptions.set(id, { id, source, eventTypes, handler, once });
    return id;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  unsubscribeAll(source: string): void {
    for (const [id, sub] of this.subscriptions) {
      if (sub.source === source) {
        this.subscriptions.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Source readiness
  // ---------------------------------------------------------------------------

  markReady(source: string): void {
    this.readySources.add(source);
    this.drainQueueForSource(source);
  }

  markNotReady(source: string): void {
    this.readySources.delete(source);
  }

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  emit(type: DexEventType, source: string, payload: any = {}): void {
    const event: DexEvent = {
      type,
      source,
      payload,
      timestamp: Date.now(),
      id: createEventId(),
    };

    // Track in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > MAX_EVENT_HISTORY) {
      this.eventHistory = this.eventHistory.slice(-MAX_EVENT_HISTORY);
    }

    // Count
    this.eventCounts.set(type, (this.eventCounts.get(type) ?? 0) + 1);

    // Tracer tracking
    const traceSubscribers: string[] = [];
    const traceErrors: string[] = [];
    const traceStart = performance.now();

    // Deliver to matching subscriptions
    const toRemove: string[] = [];

    for (const [id, sub] of this.subscriptions) {
      // Skip self-delivery (a source does not receive its own events)
      if (sub.source === source) continue;

      const matches = sub.eventTypes === '*' || sub.eventTypes.includes(type);
      if (!matches) continue;

      if (!this.readySources.has(sub.source)) {
        // Queue for delivery when source becomes ready
        this.queueEvent(event, sub.source);
        traceSubscribers.push(`${sub.source}(queued)`);
        continue;
      }

      try {
        sub.handler(event);
        traceSubscribers.push(sub.source);
      } catch (err) {
        log.warn(`[DexEventBus] Handler error for ${sub.source} on ${type}:`, err);
        traceSubscribers.push(`${sub.source}(error)`);
        traceErrors.push(`${sub.source}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (sub.once) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.subscriptions.delete(id);
    }

    // Record trace entry
    this.tracer.record({
      eventId: event.id,
      eventType: type,
      emitter: source,
      subscribers: traceSubscribers,
      errors: traceErrors,
      emitTimestamp: event.timestamp,
      deliveryDurationMs: performance.now() - traceStart,
    });

    // Forward to renderer
    this.forwardToRenderer(event);
  }

  // ---------------------------------------------------------------------------
  // Cross-app reaction helpers
  // ---------------------------------------------------------------------------

  emitAppSwitch(fromApp: string, toApp: string): void {
    this.emit('app-switched', 'system', { from: fromApp, to: toApp });
  }

  emitFocusSessionStart(durationMinutes: number): void {
    this.emit('focus-session-start', 'system', { durationMinutes });
  }

  emitFocusSessionEnd(): void {
    this.emit('focus-session-end', 'system', {});
  }

  emitCapabilityTierChange(tier: number, reason: string): void {
    this.emit('capability-tier-change', 'system', { tier, reason });
  }

  emitPerformanceViolation(operation: string, budgetMs: number, actualMs: number): void {
    this.emit('performance-violation', 'performance-instrument', { operation, budgetMs, actualMs });
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  getRecentEvents(limit: number = 50): DexEvent[] {
    return this.eventHistory.slice(-limit);
  }

  getEventsByType(type: DexEventType, limit: number = 50): DexEvent[] {
    return this.eventHistory.filter(e => e.type === type).slice(-limit);
  }

  getEventCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [type, count] of this.eventCounts) {
      counts[type] = count;
    }
    return counts;
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  getReadySources(): string[] {
    return Array.from(this.readySources);
  }

  getQueueLength(): number {
    return this.eventQueue.length;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private queueEvent(event: DexEvent, targetSource: string): void {
    this.eventQueue.push({ event, targetSource });
    if (this.eventQueue.length > MAX_QUEUED_EVENTS) {
      this.eventQueue = this.eventQueue.slice(-MAX_QUEUED_EVENTS);
    }
  }

  private drainQueueForSource(source: string): void {
    const toDeliver: QueuedEvent[] = [];
    const remaining: QueuedEvent[] = [];

    for (const queued of this.eventQueue) {
      if (queued.targetSource === source) {
        toDeliver.push(queued);
      } else {
        remaining.push(queued);
      }
    }

    this.eventQueue = remaining;

    for (const queued of toDeliver) {
      for (const [, sub] of this.subscriptions) {
        if (sub.source !== source) continue;
        const matches = sub.eventTypes === '*' || sub.eventTypes.includes(queued.event.type);
        if (!matches) continue;

        try {
          sub.handler(queued.event);
        } catch (err) {
          log.warn(`[DexEventBus] Queued handler error for ${source}:`, err);
        }
      }
    }
  }

  private forwardToRenderer(event: DexEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      this.mainWindow.webContents.send('event-bus:event', {
        type: event.type,
        source: event.source,
        payload: event.payload,
        timestamp: event.timestamp,
        id: event.id,
      });
    } catch {
      // Window may not be ready, ignore
    }
  }

  // ---------------------------------------------------------------------------
  // IPC handlers
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('event-bus:emit', (_e, type: DexEventType, source: string, payload: any) => {
      this.emit(type, source, payload);
      return true;
    });

    ipcMain.handle('event-bus:recent', (_e, limit: number) => {
      return this.getRecentEvents(limit);
    });

    ipcMain.handle('event-bus:by-type', (_e, type: DexEventType, limit: number) => {
      return this.getEventsByType(type, limit);
    });

    ipcMain.handle('event-bus:counts', () => {
      return this.getEventCounts();
    });

    ipcMain.handle('event-bus:status', () => {
      return {
        subscriptionCount: this.getSubscriptionCount(),
        readySources: this.getReadySources(),
        queueLength: this.getQueueLength(),
        totalEventsProcessed: Array.from(this.eventCounts.values()).reduce((s, v) => s + v, 0),
      };
    });

    ipcMain.handle('event-bus:mark-ready', (_e, source: string) => {
      this.markReady(source);
      return true;
    });

    // Event tracer IPC (development diagnostic)
    ipcMain.handle('event-bus:tracer-enable', () => {
      this.tracer.enable();
      return true;
    });

    ipcMain.handle('event-bus:tracer-disable', () => {
      this.tracer.disable();
      return true;
    });

    ipcMain.handle('event-bus:tracer-status', () => {
      return this.tracer.isEnabled();
    });

    ipcMain.handle('event-bus:tracer-entries', (_e, limit?: number) => {
      return this.tracer.getEntries(limit);
    });

    ipcMain.handle('event-bus:tracer-errors', (_e, limit?: number) => {
      return this.tracer.getErrorEntries(limit);
    });

    ipcMain.handle('event-bus:tracer-clear', () => {
      this.tracer.clear();
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.subscriptions.clear();
    this.readySources.clear();
    this.eventQueue = [];
    this.eventHistory = [];
    this.eventCounts.clear();
    this.initialized = false;
    log.info('[DexEventBus] Shutdown complete');
  }
}

export const dexEventBus = new DexEventBus();

export function initializeDexEventBus(win: BrowserWindow): void {
  dexEventBus.initialize(win);
}

export function shutdownDexEventBus(): void {
  dexEventBus.shutdown();
}
