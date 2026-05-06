// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Network Manager
// ==========================================================================
// Feature 33: Network QoS Manager (bandwidth allocation)
// Feature 34: Background Transfer Continuation (persistent registry)
// Feature 35: Local Service Discovery (zero-config)
// ==========================================================================

import * as net from 'net';
import * as dgram from 'dgram';
import * as os from 'os';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Feature 33: Network QoS Manager
// ---------------------------------------------------------------------------

export type NetworkPriority = 'critical' | 'high' | 'normal' | 'low';

interface BandwidthBucket {
  priority: NetworkPriority;
  maxBytesPerSecond: number;
  currentBytesPerSecond: number;
  totalBytes: number;
  windowStartMs: number;
  windowBytes: number;
}

interface TransferTracker {
  id: string;
  priority: NetworkPriority;
  bytesTransferred: number;
  startedAt: number;
  lastChunkAt: number;
  paused: boolean;
  url: string;
}

const DEFAULT_BANDWIDTH_LIMITS: Record<NetworkPriority, number> = {
  critical: Infinity,
  high: 10 * 1024 * 1024,     // 10 MB/s
  normal: 5 * 1024 * 1024,     // 5 MB/s
  low: 1 * 1024 * 1024,        // 1 MB/s
};

class NetworkQoSManager {
  private buckets = new Map<NetworkPriority, BandwidthBucket>();
  private activeTransfers = new Map<string, TransferTracker>();
  private transferIdCounter = 0;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    const priorities: NetworkPriority[] = ['critical', 'high', 'normal', 'low'];
    for (const p of priorities) {
      this.buckets.set(p, {
        priority: p,
        maxBytesPerSecond: DEFAULT_BANDWIDTH_LIMITS[p],
        currentBytesPerSecond: 0,
        totalBytes: 0,
        windowStartMs: Date.now(),
        windowBytes: 0,
      });
    }
  }

  initialize(): void {
    this.metricsInterval = setInterval(() => {
      this.resetWindows();
    }, 1000); // Reset per-second metrics every second
    log.info('[NetworkQoS] Feature 33: Network QoS manager initialized');
  }

  registerTransfer(url: string, priority: NetworkPriority): string {
    const id = `transfer-${++this.transferIdCounter}`;
    this.activeTransfers.set(id, {
      id,
      priority,
      bytesTransferred: 0,
      startedAt: Date.now(),
      lastChunkAt: Date.now(),
      paused: false,
      url,
    });
    return id;
  }

  recordBytes(transferId: string, bytes: number): boolean {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return true;

    const bucket = this.buckets.get(transfer.priority)!;

    // Check if we'd exceed the bucket limit
    if (bucket.windowBytes + bytes > bucket.maxBytesPerSecond) {
      transfer.paused = true;
      return false; // Caller should throttle/pause
    }

    bucket.windowBytes += bytes;
    bucket.totalBytes += bytes;
    transfer.bytesTransferred += bytes;
    transfer.lastChunkAt = Date.now();
    transfer.paused = false;
    return true;
  }

  completeTransfer(transferId: string): void {
    this.activeTransfers.delete(transferId);
  }

  isTransferAllowed(priority: NetworkPriority): boolean {
    const bucket = this.buckets.get(priority)!;
    return bucket.windowBytes < bucket.maxBytesPerSecond;
  }

  setBandwidthLimit(priority: NetworkPriority, bytesPerSecond: number): void {
    const bucket = this.buckets.get(priority);
    if (bucket) {
      bucket.maxBytesPerSecond = bytesPerSecond;
    }
  }

  private resetWindows(): void {
    for (const [, bucket] of this.buckets) {
      bucket.currentBytesPerSecond = bucket.windowBytes;
      bucket.windowBytes = 0;
      bucket.windowStartMs = Date.now();
    }
  }

  getStats(): {
    activeTransfers: number;
    bandwidthUsage: Record<string, { current: number; max: number; total: number }>;
  } {
    const usage: Record<string, { current: number; max: number; total: number }> = {};
    for (const [p, bucket] of this.buckets) {
      usage[p] = {
        current: bucket.currentBytesPerSecond,
        max: bucket.maxBytesPerSecond,
        total: bucket.totalBytes,
      };
    }
    return {
      activeTransfers: this.activeTransfers.size,
      bandwidthUsage: usage,
    };
  }

  shutdown(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.activeTransfers.clear();
  }
}

// ---------------------------------------------------------------------------
// Feature 34: Background Transfer Continuation
// ---------------------------------------------------------------------------

export interface PersistentTransfer {
  id: string;
  url: string;
  destPath: string;
  totalBytes: number;
  transferredBytes: number;
  priority: NetworkPriority;
  createdAt: number;
  lastResumedAt: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed';
  headers: Record<string, string>;
}

class BackgroundTransferContinuation {
  private registry = new Map<string, PersistentTransfer>();
  private transferIdCounter = 0;
  private resumeInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.loadRegistry();
    this.resumeInterval = setInterval(() => {
      this.resumePendingTransfers();
    }, 15_000); // Check every 15 seconds
    log.info('[BackgroundTransfer] Feature 34: Background transfer continuation initialized');
  }

  create(url: string, destPath: string, options?: {
    priority?: NetworkPriority;
    headers?: Record<string, string>;
    maxRetries?: number;
    totalBytes?: number;
  }): string {
    const id = `bg-transfer-${++this.transferIdCounter}-${Date.now()}`;
    const transfer: PersistentTransfer = {
      id,
      url,
      destPath,
      totalBytes: options?.totalBytes || 0,
      transferredBytes: 0,
      priority: options?.priority || 'normal',
      createdAt: Date.now(),
      lastResumedAt: 0,
      retryCount: 0,
      maxRetries: options?.maxRetries || 3,
      status: 'pending',
      headers: options?.headers || {},
    };

    this.registry.set(id, transfer);
    this.persistRegistry();
    return id;
  }

  updateProgress(id: string, bytesTransferred: number): void {
    const transfer = this.registry.get(id);
    if (!transfer) return;

    transfer.transferredBytes = bytesTransferred;
    transfer.status = 'active';
    transfer.lastResumedAt = Date.now();
  }

  markCompleted(id: string): void {
    const transfer = this.registry.get(id);
    if (transfer) {
      transfer.status = 'completed';
      this.persistRegistry();
    }
  }

  markFailed(id: string): void {
    const transfer = this.registry.get(id);
    if (transfer) {
      transfer.retryCount++;
      if (transfer.retryCount >= transfer.maxRetries) {
        transfer.status = 'failed';
      } else {
        transfer.status = 'pending';
      }
      this.persistRegistry();
    }
  }

  pause(id: string): void {
    const transfer = this.registry.get(id);
    if (transfer) {
      transfer.status = 'paused';
      this.persistRegistry();
    }
  }

  resume(id: string): void {
    const transfer = this.registry.get(id);
    if (transfer && transfer.status === 'paused') {
      transfer.status = 'pending';
      this.persistRegistry();
    }
  }

  private resumePendingTransfers(): void {
    for (const [, transfer] of this.registry) {
      if (transfer.status === 'pending') {
        // In a real implementation, this would start/resume the HTTP download
        // For now, mark it as needing attention
        transfer.lastResumedAt = Date.now();
      }
    }
  }

  getTransfer(id: string): PersistentTransfer | null {
    return this.registry.get(id) || null;
  }

  getAllTransfers(): PersistentTransfer[] {
    return Array.from(this.registry.values());
  }

  getPendingTransfers(): PersistentTransfer[] {
    return Array.from(this.registry.values()).filter(t => t.status === 'pending');
  }

  cleanup(): void {
    // Remove completed/failed transfers older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, transfer] of this.registry) {
      if ((transfer.status === 'completed' || transfer.status === 'failed') && transfer.createdAt < cutoff) {
        this.registry.delete(id);
      }
    }
    this.persistRegistry();
  }

  private persistRegistry(): void {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(app.getPath('userData'), 'bg-transfers.json');
      const data = JSON.stringify(Array.from(this.registry.values()));
      fs.writeFileSync(filePath, data, 'utf-8');
    } catch { /* ok */ }
  }

  private loadRegistry(): void {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(app.getPath('userData'), 'bg-transfers.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const transfers: PersistentTransfer[] = JSON.parse(raw);
        for (const t of transfers) {
          // Reset active transfers to pending on restart
          if (t.status === 'active') t.status = 'pending';
          this.registry.set(t.id, t);
        }
      }
    } catch { /* ok */ }
  }

  shutdown(): void {
    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
      this.resumeInterval = null;
    }
    this.persistRegistry();
  }
}

// ---------------------------------------------------------------------------
// Feature 35: Local Service Discovery
// ---------------------------------------------------------------------------

interface DiscoveredService {
  name: string;
  host: string;
  port: number;
  type: string;
  discoveredAt: number;
  lastSeenAt: number;
  metadata: Record<string, string>;
}

const MDNS_MULTICAST_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;

class LocalServiceDiscovery {
  private services = new Map<string, DiscoveredService>();
  private publishedServices: Array<{ name: string; port: number; type: string }> = [];
  private scanInterval: NodeJS.Timeout | null = null;
  private udpSocket: dgram.Socket | null = null;

  initialize(): void {
    // Periodic LAN scan for DEX instances
    this.scanInterval = setInterval(() => {
      this.scanLocalNetwork();
    }, 30_000); // Every 30 seconds

    this.startListening();
    log.info('[ServiceDiscovery] Feature 35: Local service discovery initialized');
  }

  private startListening(): void {
    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleDiscoveryMessage(msg, rinfo);
      });

      this.udpSocket.on('error', (err) => {
        log.warn('[ServiceDiscovery] Socket error:', err.message);
        // Gracefully close and retry later
        try { this.udpSocket?.close(); } catch { /* ok */ }
        this.udpSocket = null;
      });

      this.udpSocket.bind(0, () => {
        try {
          this.udpSocket?.setBroadcast(true);
        } catch { /* ok */ }
      });
    } catch {
      log.info('[ServiceDiscovery] UDP socket unavailable, using passive mode');
    }
  }

  private handleDiscoveryMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString('utf-8'));
      if (data.protocol !== 'dex-discovery') return;

      const key = `${rinfo.address}:${data.port}`;
      this.services.set(key, {
        name: data.name || 'Unknown DEX',
        host: rinfo.address,
        port: data.port,
        type: data.type || 'dex-instance',
        discoveredAt: this.services.get(key)?.discoveredAt || Date.now(),
        lastSeenAt: Date.now(),
        metadata: data.metadata || {},
      });
    } catch {
      // Not a valid discovery message
    }
  }

  publish(name: string, port: number, type: string = 'dex-instance'): void {
    this.publishedServices.push({ name, port, type });
  }

  private scanLocalNetwork(): void {
    if (!this.udpSocket) return;

    for (const pub of this.publishedServices) {
      const message = Buffer.from(JSON.stringify({
        protocol: 'dex-discovery',
        name: pub.name,
        port: pub.port,
        type: pub.type,
        metadata: { platform: process.platform, version: '2.0.1' },
      }));

      try {
        // Broadcast on all interfaces
        const interfaces = os.networkInterfaces();
        for (const [, addrs] of Object.entries(interfaces)) {
          if (!addrs) continue;
          for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
              const parts = addr.address.split('.');
              parts[3] = '255';
              const broadcast = parts.join('.');
              try {
                this.udpSocket.send(message, 0, message.length, 41234, broadcast);
              } catch { /* ok */ }
            }
          }
        }
      } catch { /* ok */ }
    }

    // Prune stale services (not seen in 2 minutes)
    const cutoff = Date.now() - 120_000;
    for (const [key, service] of this.services) {
      if (service.lastSeenAt < cutoff) {
        this.services.delete(key);
      }
    }
  }

  getDiscoveredServices(): DiscoveredService[] {
    return Array.from(this.services.values());
  }

  getServiceByType(type: string): DiscoveredService[] {
    return Array.from(this.services.values()).filter(s => s.type === type);
  }

  shutdown(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch { /* ok */ }
      this.udpSocket = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const networkQoS = new NetworkQoSManager();
export const backgroundTransfers = new BackgroundTransferContinuation();
export const serviceDiscovery = new LocalServiceDiscovery();

export function initializeNetworkManager(): void {
  networkQoS.initialize();
  backgroundTransfers.initialize();
  serviceDiscovery.initialize();
  log.info('[NetworkManager] Features 33-35: Network manager initialized');
}

export function shutdownNetworkManager(): void {
  networkQoS.shutdown();
  backgroundTransfers.shutdown();
  serviceDiscovery.shutdown();
}
