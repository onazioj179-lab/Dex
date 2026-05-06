// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Network Guard
// System 5: Network Activity Control & Monitoring
// No hidden network activity, user controls all outbound connections
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, net, session } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dns from 'dns';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ConnectionStatus = 'online' | 'offline' | 'limited';
export type NetworkMode = 'full' | 'local-only' | 'disabled';

export interface NetworkConnection {
  id: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  protocol: 'http' | 'https' | 'ws' | 'wss' | 'other';
  domain: string;
  port: number;
  status: 'active' | 'completed' | 'failed' | 'blocked';
  bytesIn: number;
  bytesOut: number;
  duration: number;
  purpose?: string;
}

export interface NetworkPolicy {
  id: string;
  name: string;
  domain: string;
  allowed: boolean;
  reason: string;
  createdAt: number;
  expiresAt?: number;
  isUserDefined: boolean;
}

export interface NetworkUsage {
  timestamp: number;
  bytesIn: number;
  bytesOut: number;
  connectionsCount: number;
}

export interface NetworkSummary {
  status: ConnectionStatus;
  mode: NetworkMode;
  totalBytesIn: number;
  totalBytesOut: number;
  activeConnections: number;
  blockedAttempts: number;
  allowedDomains: number;
  blockedDomains: number;
  uptimeMs: number;
}

export interface NetworkConfig {
  mode: NetworkMode;
  allowUpdates: boolean;
  allowExtensionNetwork: boolean;
  maxConcurrentConnections: number;
  connectionTimeout: number;
  logConnections: boolean;
  alertOnNewDomain: boolean;
  offlineMode: boolean;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: NetworkConfig = {
  mode: 'full',
  allowUpdates: true,
  allowExtensionNetwork: false,
  maxConcurrentConnections: 50,
  connectionTimeout: 30000,
  logConnections: true,
  alertOnNewDomain: true,
  offlineMode: false,
};

// ===========================================================================
// BUILT-IN ALLOWED DOMAINS (for core functionality)
// ===========================================================================

const CORE_ALLOWED_DOMAINS = [
  'github.com', // Updates
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
];

// ===========================================================================
// NETWORK GUARD
// ===========================================================================

class NetworkGuardClass extends EventEmitter {
  private config: NetworkConfig;
  private policies: Map<string, NetworkPolicy> = new Map();
  private connections: Map<string, NetworkConnection> = new Map();
  private connectionHistory: NetworkConnection[] = [];
  private usageHistory: NetworkUsage[] = [];
  private configPath = '';
  private startTime = Date.now();
  private totalBytesIn = 0;
  private totalBytesOut = 0;
  private blockedAttempts = 0;
  private connectionStatus: ConnectionStatus = 'online';
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.configPath = path.join(app.getPath('userData'), 'network');
    
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await this.loadConfig();
      await this.loadPolicies();
      this.setupNetworkMonitoring();
      this.startConnectivityCheck();
      
      log.info(`[NetworkGuard] Initialized in ${this.config.mode} mode`);
    } catch (error) {
      log.error('[NetworkGuard] Initialization failed:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    const configFile = path.join(this.configPath, 'config.json');
    
    try {
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    const configFile = path.join(this.configPath, 'config.json');
    await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));
  }

  private async loadPolicies(): Promise<void> {
    const policiesFile = path.join(this.configPath, 'policies.json');
    
    try {
      const data = await fs.readFile(policiesFile, 'utf-8');
      const policies = JSON.parse(data) as NetworkPolicy[];
      
      for (const policy of policies) {
        this.policies.set(policy.domain, policy);
      }
    } catch {
      // Initialize with core domains
      for (const domain of CORE_ALLOWED_DOMAINS) {
        const policy: NetworkPolicy = {
          id: `core-${domain}`,
          name: `Core: ${domain}`,
          domain,
          allowed: true,
          reason: 'Core functionality',
          createdAt: Date.now(),
          isUserDefined: false,
        };
        this.policies.set(domain, policy);
      }
      await this.savePolicies();
    }
  }

  private async savePolicies(): Promise<void> {
    const policiesFile = path.join(this.configPath, 'policies.json');
    const policies = Array.from(this.policies.values());
    await fs.writeFile(policiesFile, JSON.stringify(policies, null, 2));
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get network summary
    ipcMain.handle('network:summary', () => {
      return this.getSummary();
    });

    // Get active connections
    ipcMain.handle('network:connections', () => {
      return this.getActiveConnections();
    });

    // Get connection history
    ipcMain.handle('network:history', (_event, limit?: number) => {
      return this.getConnectionHistory(limit);
    });

    // Get policies
    ipcMain.handle('network:policies', () => {
      return this.getPolicies();
    });

    // Add policy
    ipcMain.handle('network:addPolicy', async (_event, domain: string, allowed: boolean, reason?: string) => {
      return this.addPolicy(domain, allowed, reason);
    });

    // Remove policy
    ipcMain.handle('network:removePolicy', async (_event, domain: string) => {
      return this.removePolicy(domain);
    });

    // Get config
    ipcMain.handle('network:config', () => {
      return this.config;
    });

    // Update config
    ipcMain.handle('network:setConfig', async (_event, updates: Partial<NetworkConfig>) => {
      return this.updateConfig(updates);
    });

    // Set network mode
    ipcMain.handle('network:setMode', async (_event, mode: NetworkMode) => {
      return this.setMode(mode);
    });

    // Check connectivity
    ipcMain.handle('network:checkConnectivity', async () => {
      return this.checkConnectivity();
    });

    // Get usage stats
    ipcMain.handle('network:usage', () => {
      return this.getUsageStats();
    });

    // Enable offline mode
    ipcMain.handle('network:setOffline', async (_event, offline: boolean) => {
      return this.setOfflineMode(offline);
    });

    // Test domain
    ipcMain.handle('network:testDomain', async (_event, domain: string) => {
      return this.testDomain(domain);
    });
  }

  // -------------------------------------------------------------------------
  // NETWORK MONITORING
  // -------------------------------------------------------------------------

  private setupNetworkMonitoring(): void {
    // Monitor all HTTP/HTTPS requests
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const result = this.evaluateConnection(details);
      
      if (result.blocked) {
        this.recordBlockedAttempt(details);
        callback({ cancel: true });
      } else {
        this.recordConnection(details);
        callback({});
      }
    });

    // Track completed requests
    session.defaultSession.webRequest.onCompleted((details) => {
      this.updateConnectionStats(details);
    });

    // Track failed requests
    session.defaultSession.webRequest.onErrorOccurred((details) => {
      this.markConnectionFailed(details);
    });
  }

  private evaluateConnection(details: Electron.OnBeforeRequestListenerDetails): { blocked: boolean; reason?: string } {
    // Check if offline mode
    if (this.config.offlineMode) {
      return { blocked: true, reason: 'Offline mode enabled' };
    }

    // Check network mode
    if (this.config.mode === 'disabled') {
      return { blocked: true, reason: 'Network disabled' };
    }

    try {
      const url = new URL(details.url);
      const domain = url.hostname;

      // Always allow local connections
      if (this.isLocalConnection(domain)) {
        return { blocked: false };
      }

      // Local-only mode blocks external
      if (this.config.mode === 'local-only') {
        return { blocked: true, reason: 'Local-only mode' };
      }

      // Check policy
      const policy = this.findPolicy(domain);
      if (policy) {
        if (!policy.allowed) {
          return { blocked: true, reason: policy.reason };
        }
        return { blocked: false };
      }

      // No policy - check if we should alert
      if (this.config.alertOnNewDomain) {
        this.emit('network:newDomain', domain);
      }

      // Default allow in full mode
      return { blocked: false };
    } catch {
      return { blocked: false };
    }
  }

  private isLocalConnection(domain: string): boolean {
    return (
      domain === 'localhost' ||
      domain === '127.0.0.1' ||
      domain === '::1' ||
      domain.endsWith('.local') ||
      domain.startsWith('192.168.') ||
      domain.startsWith('10.') ||
      domain.startsWith('172.16.')
    );
  }

  private findPolicy(domain: string): NetworkPolicy | null {
    // Exact match
    if (this.policies.has(domain)) {
      return this.policies.get(domain)!;
    }

    // Wildcard match (*.example.com)
    for (const [policyDomain, policy] of this.policies) {
      if (policyDomain.startsWith('*.')) {
        const baseDomain = policyDomain.slice(2);
        if (domain.endsWith(baseDomain)) {
          return policy;
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // CONNECTION TRACKING
  // -------------------------------------------------------------------------

  private recordConnection(details: Electron.OnBeforeRequestListenerDetails): void {
    try {
      const url = new URL(details.url);
      
      const connection: NetworkConnection = {
        id: details.id.toString(),
        timestamp: Date.now(),
        direction: 'outbound',
        protocol: url.protocol.replace(':', '') as NetworkConnection['protocol'],
        domain: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        status: 'active',
        bytesIn: 0,
        bytesOut: 0,
        duration: 0,
      };

      this.connections.set(connection.id, connection);

      if (this.config.logConnections) {
        this.emit('connection:started', connection);
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  private recordBlockedAttempt(details: Electron.OnBeforeRequestListenerDetails): void {
    this.blockedAttempts++;
    
    try {
      const url = new URL(details.url);
      
      const connection: NetworkConnection = {
        id: details.id.toString(),
        timestamp: Date.now(),
        direction: 'outbound',
        protocol: url.protocol.replace(':', '') as NetworkConnection['protocol'],
        domain: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        status: 'blocked',
        bytesIn: 0,
        bytesOut: 0,
        duration: 0,
      };

      this.connectionHistory.push(connection);
      this.trimHistory();

      this.emit('connection:blocked', connection);
    } catch {
      // Invalid URL
    }
  }

  private updateConnectionStats(details: Electron.OnCompletedListenerDetails): void {
    const connection = this.connections.get(details.id.toString());
    if (connection) {
      connection.status = 'completed';
      connection.duration = Date.now() - connection.timestamp;
      
      // Move to history
      this.connectionHistory.push(connection);
      this.connections.delete(details.id.toString());
      this.trimHistory();
    }
  }

  private markConnectionFailed(details: Electron.OnErrorOccurredListenerDetails): void {
    const connection = this.connections.get(details.id.toString());
    if (connection) {
      connection.status = 'failed';
      connection.duration = Date.now() - connection.timestamp;
      
      this.connectionHistory.push(connection);
      this.connections.delete(details.id.toString());
      this.trimHistory();
    }
  }

  private trimHistory(): void {
    const maxHistory = 1000;
    if (this.connectionHistory.length > maxHistory) {
      this.connectionHistory = this.connectionHistory.slice(-maxHistory);
    }
  }

  // -------------------------------------------------------------------------
  // CONNECTIVITY CHECK
  // -------------------------------------------------------------------------

  private startConnectivityCheck(): void {
    // Initial check
    this.checkConnectivity();

    // Periodic check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkConnectivity();
    }, 30000);
  }

  async checkConnectivity(): Promise<{ status: ConnectionStatus; latencyMs?: number }> {
    const start = Date.now();
    
    try {
      // Try to resolve a known domain
      await new Promise<void>((resolve, reject) => {
        dns.resolve('dns.google', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const latencyMs = Date.now() - start;
      const newStatus: ConnectionStatus = latencyMs > 2000 ? 'limited' : 'online';
      
      if (newStatus !== this.connectionStatus) {
        this.connectionStatus = newStatus;
        this.emit('connectivity:changed', newStatus);
      }

      return { status: newStatus, latencyMs };
    } catch {
      if (this.connectionStatus !== 'offline') {
        this.connectionStatus = 'offline';
        this.emit('connectivity:changed', 'offline');
      }
      return { status: 'offline' };
    }
  }

  // -------------------------------------------------------------------------
  // POLICY MANAGEMENT
  // -------------------------------------------------------------------------

  async addPolicy(domain: string, allowed: boolean, reason?: string): Promise<NetworkPolicy> {
    const policy: NetworkPolicy = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: domain,
      domain,
      allowed,
      reason: reason || (allowed ? 'User allowed' : 'User blocked'),
      createdAt: Date.now(),
      isUserDefined: true,
    };

    this.policies.set(domain, policy);
    await this.savePolicies();

    this.emit('policy:added', policy);
    return policy;
  }

  async removePolicy(domain: string): Promise<{ success: boolean }> {
    const policy = this.policies.get(domain);
    
    // Don't allow removing core policies
    if (policy && !policy.isUserDefined) {
      return { success: false };
    }

    if (this.policies.delete(domain)) {
      await this.savePolicies();
      this.emit('policy:removed', domain);
      return { success: true };
    }

    return { success: false };
  }

  getPolicies(): NetworkPolicy[] {
    return Array.from(this.policies.values());
  }

  // -------------------------------------------------------------------------
  // MODE MANAGEMENT
  // -------------------------------------------------------------------------

  async setMode(mode: NetworkMode): Promise<{ success: boolean }> {
    this.config.mode = mode;
    await this.saveConfig();
    
    log.info(`[NetworkGuard] Mode changed to: ${mode}`);
    this.emit('mode:changed', mode);
    
    return { success: true };
  }

  async setOfflineMode(offline: boolean): Promise<{ success: boolean }> {
    this.config.offlineMode = offline;
    await this.saveConfig();
    
    log.info(`[NetworkGuard] Offline mode: ${offline}`);
    this.emit('offline:changed', offline);
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // TESTING
  // -------------------------------------------------------------------------

  async testDomain(domain: string): Promise<{ 
    reachable: boolean; 
    latencyMs?: number; 
    blocked: boolean; 
    reason?: string 
  }> {
    // Check policy first
    const policy = this.findPolicy(domain);
    if (policy && !policy.allowed) {
      return { reachable: false, blocked: true, reason: policy.reason };
    }

    // Check mode
    if (this.config.mode === 'disabled' || this.config.offlineMode) {
      return { reachable: false, blocked: true, reason: 'Network disabled or offline' };
    }

    if (this.config.mode === 'local-only' && !this.isLocalConnection(domain)) {
      return { reachable: false, blocked: true, reason: 'Local-only mode' };
    }

    // Try to reach the domain
    const start = Date.now();
    
    try {
      await new Promise<void>((resolve, reject) => {
        dns.resolve(domain, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return { 
        reachable: true, 
        latencyMs: Date.now() - start, 
        blocked: false 
      };
    } catch {
      return { 
        reachable: false, 
        blocked: false, 
        reason: 'DNS resolution failed' 
      };
    }
  }

  // -------------------------------------------------------------------------
  // GETTERS
  // -------------------------------------------------------------------------

  getSummary(): NetworkSummary {
    const userPolicies = Array.from(this.policies.values()).filter(p => p.isUserDefined);
    
    return {
      status: this.connectionStatus,
      mode: this.config.mode,
      totalBytesIn: this.totalBytesIn,
      totalBytesOut: this.totalBytesOut,
      activeConnections: this.connections.size,
      blockedAttempts: this.blockedAttempts,
      allowedDomains: userPolicies.filter(p => p.allowed).length,
      blockedDomains: userPolicies.filter(p => !p.allowed).length,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  getActiveConnections(): NetworkConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectionHistory(limit: number = 100): NetworkConnection[] {
    return this.connectionHistory.slice(-limit);
  }

  getUsageStats(): NetworkUsage[] {
    return [...this.usageHistory];
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async updateConfig(updates: Partial<NetworkConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    
    this.emit('config:changed', this.config);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    log.info('[NetworkGuard] Shutdown');
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const NetworkGuard = new NetworkGuardClass();
