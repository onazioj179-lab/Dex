// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- IPC Kernel
// ==========================================================================
// Feature 42: Capability-Based IPC Contracts
// Feature 43: On-Demand Worker Lifecycle
// Feature 44: Distributed Event System
// Feature 45: Guaranteed Delivery Queue
// ==========================================================================

import * as log from 'electron-log';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Feature 42: Capability-Based IPC Contracts
// ---------------------------------------------------------------------------

export type IPCCapability = 'send' | 'receive' | 'broadcast' | 'subscribe' | 'request' | 'respond';

export interface IPCContract {
  channel: string;
  version: number;
  requiredCapabilities: IPCCapability[];
  payloadSchema: {
    type: string;
    maxSizeBytes: number;
    fields?: Record<string, string>;
  };
  rateLimitPerSecond: number;
  timeout: number;
}

interface ChannelBinding {
  processId: string;
  capabilities: Set<IPCCapability>;
  boundAt: number;
}

class IPCContractManager {
  private contracts = new Map<string, IPCContract>();
  private bindings = new Map<string, ChannelBinding[]>();
  private violations: Array<{ channel: string; processId: string; reason: string; timestamp: number }> = [];

  registerContract(contract: IPCContract): void {
    this.contracts.set(contract.channel, contract);
  }

  bind(channel: string, processId: string, requestedCapabilities: IPCCapability[]): boolean {
    const contract = this.contracts.get(channel);
    if (!contract) {
      // Channel not under contract -- allow implicitly
      return true;
    }

    // Verify all requested capabilities are available for this channel
    for (const cap of requestedCapabilities) {
      if (!contract.requiredCapabilities.includes(cap)) {
        this.recordViolation(channel, processId, `Capability '${cap}' not allowed`);
        return false;
      }
    }

    const existing = this.bindings.get(channel) || [];
    existing.push({
      processId,
      capabilities: new Set(requestedCapabilities),
      boundAt: Date.now(),
    });
    this.bindings.set(channel, existing);

    return true;
  }

  checkPermission(channel: string, processId: string, capability: IPCCapability): boolean {
    const bindings = this.bindings.get(channel);
    if (!bindings) return true; // No binding requirement

    const binding = bindings.find(b => b.processId === processId);
    if (!binding) {
      this.recordViolation(channel, processId, `Process not bound to channel`);
      return false;
    }

    if (!binding.capabilities.has(capability)) {
      this.recordViolation(channel, processId, `Missing capability '${capability}'`);
      return false;
    }

    return true;
  }

  unbind(channel: string, processId: string): void {
    const bindings = this.bindings.get(channel);
    if (bindings) {
      this.bindings.set(channel, bindings.filter(b => b.processId !== processId));
    }
  }

  private recordViolation(channel: string, processId: string, reason: string): void {
    this.violations.push({ channel, processId, reason, timestamp: Date.now() });
    if (this.violations.length > 1000) {
      this.violations = this.violations.slice(-500);
    }
    log.warn(`[IPCContract] Violation: ${reason} (channel: ${channel}, process: ${processId})`);
  }

  getContract(channel: string): IPCContract | null {
    return this.contracts.get(channel) || null;
  }

  getViolations(): Array<{ channel: string; processId: string; reason: string; timestamp: number }> {
    return [...this.violations];
  }

  getStats(): { contracts: number; bindings: number; violations: number } {
    let totalBindings = 0;
    for (const [, bindings] of this.bindings) {
      totalBindings += bindings.length;
    }
    return {
      contracts: this.contracts.size,
      bindings: totalBindings,
      violations: this.violations.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 43: On-Demand Worker Lifecycle
// ---------------------------------------------------------------------------

export type WorkerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

interface ManagedWorker {
  name: string;
  state: WorkerState;
  startedAt: number;
  lastUsedAt: number;
  autoShutdownMs: number;
  startFn: () => Promise<void>;
  stopFn: () => Promise<void>;
  requestCount: number;
}

const DEFAULT_AUTO_SHUTDOWN_MS = 5 * 60 * 1000; // 5 minutes idle

class OnDemandWorkerLifecycle {
  private workers = new Map<string, ManagedWorker>();
  private idleCheckInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleWorkers();
    }, 30_000);
    log.info('[WorkerLifecycle] Feature 43: On-demand worker lifecycle initialized');
  }

  register(
    name: string,
    startFn: () => Promise<void>,
    stopFn: () => Promise<void>,
    autoShutdownMs: number = DEFAULT_AUTO_SHUTDOWN_MS
  ): void {
    this.workers.set(name, {
      name,
      state: 'stopped',
      startedAt: 0,
      lastUsedAt: 0,
      autoShutdownMs,
      startFn,
      stopFn,
      requestCount: 0,
    });
  }

  async ensureRunning(name: string): Promise<boolean> {
    const worker = this.workers.get(name);
    if (!worker) return false;

    if (worker.state === 'running') {
      worker.lastUsedAt = Date.now();
      worker.requestCount++;
      return true;
    }

    if (worker.state === 'starting') {
      // Wait for startup
      return new Promise(resolve => {
        const check = setInterval(() => {
          if (worker.state === 'running') {
            clearInterval(check);
            worker.lastUsedAt = Date.now();
            worker.requestCount++;
            resolve(true);
          } else if (worker.state === 'error' || worker.state === 'stopped') {
            clearInterval(check);
            resolve(false);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve(false);
        }, 30000);
      });
    }

    // Start the worker
    worker.state = 'starting';
    try {
      await worker.startFn();
      worker.state = 'running';
      worker.startedAt = Date.now();
      worker.lastUsedAt = Date.now();
      worker.requestCount++;
      log.info(`[WorkerLifecycle] Started worker '${name}'`);
      return true;
    } catch (err) {
      worker.state = 'error';
      log.warn(`[WorkerLifecycle] Failed to start worker '${name}':`, err);
      return false;
    }
  }

  async stopWorker(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker || worker.state !== 'running') return;

    worker.state = 'stopping';
    try {
      await worker.stopFn();
      worker.state = 'stopped';
      log.info(`[WorkerLifecycle] Stopped worker '${name}'`);
    } catch (err) {
      worker.state = 'error';
      log.warn(`[WorkerLifecycle] Failed to stop worker '${name}':`, err);
    }
  }

  private async checkIdleWorkers(): Promise<void> {
    const now = Date.now();
    for (const [name, worker] of this.workers) {
      if (worker.state === 'running' && worker.autoShutdownMs > 0) {
        if ((now - worker.lastUsedAt) >= worker.autoShutdownMs) {
          log.info(`[WorkerLifecycle] Auto-stopping idle worker '${name}'`);
          await this.stopWorker(name);
        }
      }
    }
  }

  getWorkerState(name: string): WorkerState {
    return this.workers.get(name)?.state || 'stopped';
  }

  getStats(): Array<{ name: string; state: WorkerState; requests: number; uptimeMs: number }> {
    return Array.from(this.workers.values()).map(w => ({
      name: w.name,
      state: w.state,
      requests: w.requestCount,
      uptimeMs: w.state === 'running' ? Date.now() - w.startedAt : 0,
    }));
  }

  async shutdown(): Promise<void> {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    for (const [name, worker] of this.workers) {
      if (worker.state === 'running') {
        await this.stopWorker(name);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 44: Distributed Event System
// ---------------------------------------------------------------------------

interface DistributedEvent {
  id: string;
  type: string;
  source: string;
  payload: unknown;
  timestamp: number;
  ttl: number; // milliseconds to live
  hops: number;
}

interface EventSubscription {
  subscriberId: string;
  eventType: string;
  handler: (event: DistributedEvent) => void;
}

class DistributedEventSystem {
  private subscriptions = new Map<string, EventSubscription[]>();
  private eventLog: DistributedEvent[] = [];
  private processedIds = new Set<string>();
  private maxLogSize = 5000;

  subscribe(subscriberId: string, eventType: string, handler: (event: DistributedEvent) => void): () => void {
    const existing = this.subscriptions.get(eventType) || [];
    const sub: EventSubscription = { subscriberId, eventType, handler };
    existing.push(sub);
    this.subscriptions.set(eventType, existing);

    return () => {
      const subs = this.subscriptions.get(eventType);
      if (subs) {
        this.subscriptions.set(eventType, subs.filter(s => s !== sub));
      }
    };
  }

  publish(type: string, source: string, payload: unknown, ttlMs: number = 30000): string {
    const event: DistributedEvent = {
      id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type,
      source,
      payload,
      timestamp: Date.now(),
      ttl: ttlMs,
      hops: 0,
    };

    this.deliver(event);
    return event.id;
  }

  private deliver(event: DistributedEvent): void {
    // Deduplicate
    if (this.processedIds.has(event.id)) return;
    this.processedIds.add(event.id);

    // TTL check
    if (Date.now() - event.timestamp > event.ttl) return;

    event.hops++;
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize / 2);
    }

    // Deliver to subscribers
    const subs = this.subscriptions.get(event.type) || [];
    const wildcardSubs = this.subscriptions.get('*') || [];
    const allSubs = [...subs, ...wildcardSubs];

    for (const sub of allSubs) {
      try {
        sub.handler(event);
      } catch (err) {
        log.warn(`[DistributedEvents] Handler error for '${event.type}':`, err);
      }
    }

    // Prune processed IDs if too large
    if (this.processedIds.size > 50000) {
      const entries = Array.from(this.processedIds);
      this.processedIds = new Set(entries.slice(-25000));
    }
  }

  getRecentEvents(count: number): DistributedEvent[] {
    return this.eventLog.slice(-count);
  }

  getSubscriberCount(eventType: string): number {
    return (this.subscriptions.get(eventType) || []).length;
  }

  getStats(): { subscriptions: number; eventsDelivered: number; uniqueTypes: number } {
    return {
      subscriptions: Array.from(this.subscriptions.values()).reduce((sum, s) => sum + s.length, 0),
      eventsDelivered: this.eventLog.length,
      uniqueTypes: this.subscriptions.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 45: Guaranteed Delivery Queue
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'expired';

interface QueuedMessage {
  id: string;
  channel: string;
  payload: unknown;
  status: DeliveryStatus;
  createdAt: number;
  deliveredAt: number;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  ackRequired: boolean;
  acked: boolean;
}

class GuaranteedDeliveryQueue {
  private queue: QueuedMessage[] = [];
  private processInterval: NodeJS.Timeout | null = null;
  private deliveryFn: ((channel: string, payload: unknown) => Promise<boolean>) | null = null;
  private msgIdCounter = 0;

  initialize(deliveryFn?: (channel: string, payload: unknown) => Promise<boolean>): void {
    this.deliveryFn = deliveryFn || null;
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 1000);
    log.info('[GuaranteedDelivery] Feature 45: Guaranteed delivery queue initialized');
  }

  setDeliveryFunction(fn: (channel: string, payload: unknown) => Promise<boolean>): void {
    this.deliveryFn = fn;
  }

  enqueue(channel: string, payload: unknown, options?: {
    maxRetries?: number;
    timeoutMs?: number;
    ackRequired?: boolean;
  }): string {
    const id = `gdq-${++this.msgIdCounter}-${Date.now()}`;
    this.queue.push({
      id,
      channel,
      payload,
      status: 'pending',
      createdAt: Date.now(),
      deliveredAt: 0,
      retryCount: 0,
      maxRetries: options?.maxRetries || 5,
      timeoutMs: options?.timeoutMs || 30000,
      ackRequired: options?.ackRequired || false,
      acked: false,
    });
    return id;
  }

  acknowledge(messageId: string): void {
    const msg = this.queue.find(m => m.id === messageId);
    if (msg) {
      msg.acked = true;
      msg.status = 'delivered';
    }
  }

  private async processQueue(): Promise<void> {
    if (!this.deliveryFn) return;

    const now = Date.now();
    const pendingMessages = this.queue.filter(m => m.status === 'pending');

    for (const msg of pendingMessages) {
      // Check timeout
      if ((now - msg.createdAt) > msg.timeoutMs) {
        msg.status = 'expired';
        continue;
      }

      // Attempt delivery
      try {
        const delivered = await this.deliveryFn(msg.channel, msg.payload);
        if (delivered) {
          if (!msg.ackRequired) {
            msg.status = 'delivered';
            msg.deliveredAt = Date.now();
          } else {
            // Wait for explicit ack
            msg.deliveredAt = Date.now();
          }
        } else {
          msg.retryCount++;
          if (msg.retryCount >= msg.maxRetries) {
            msg.status = 'failed';
          }
        }
      } catch {
        msg.retryCount++;
        if (msg.retryCount >= msg.maxRetries) {
          msg.status = 'failed';
        }
      }
    }

    // Prune old delivered/failed messages
    this.queue = this.queue.filter(m => {
      if (m.status === 'delivered' || m.status === 'expired' || m.status === 'failed') {
        return (now - (m.deliveredAt || m.createdAt)) < 60000; // Keep for 1 minute
      }
      return true;
    });
  }

  getQueueStats(): { pending: number; delivered: number; failed: number; expired: number } {
    let pending = 0, delivered = 0, failed = 0, expired = 0;
    for (const msg of this.queue) {
      switch (msg.status) {
        case 'pending': pending++; break;
        case 'delivered': delivered++; break;
        case 'failed': failed++; break;
        case 'expired': expired++; break;
      }
    }
    return { pending, delivered, failed, expired };
  }

  getPendingMessages(): QueuedMessage[] {
    return this.queue.filter(m => m.status === 'pending');
  }

  shutdown(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const ipcContracts = new IPCContractManager();
export const workerLifecycle = new OnDemandWorkerLifecycle();
export const distributedEvents = new DistributedEventSystem();
export const guaranteedDelivery = new GuaranteedDeliveryQueue();

export function initializeIPCKernel(): void {
  workerLifecycle.initialize();
  guaranteedDelivery.initialize();
  log.info('[IPCKernel] Features 42-45: IPC kernel initialized');
}

export async function shutdownIPCKernel(): Promise<void> {
  guaranteedDelivery.shutdown();
  await workerLifecycle.shutdown();
}
