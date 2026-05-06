// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Network Hygiene Monitor
// Defensive network hygiene - outbound-only, encrypted channels
// No plain-text traffic, certificate validation, activity pausing
// ===========================================================================

import { net, app } from 'electron';
import * as https from 'https';
import * as tls from 'tls';
import * as dns from 'dns';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export interface NetworkConfig {
  enabled: boolean;
  enforceHttps: boolean;
  validateCertificates: boolean;
  allowInbound: boolean;
  pauseOnUncertainty: boolean;
  trustedDomains: string[];
  blockedDomains: string[];
  maxConcurrentConnections: number;
  connectionTimeout: number;
  logAllConnections: boolean;
}

export interface NetworkStatus {
  online: boolean;
  connectionType: 'wifi' | 'ethernet' | 'cellular' | 'unknown';
  metered: boolean;
  lastCheck: number;
  activeConnections: number;
  blockedAttempts: number;
}

export interface ConnectionAttempt {
  id: string;
  timestamp: number;
  domain: string;
  port: number;
  protocol: 'https' | 'http' | 'wss' | 'ws' | 'tcp';
  allowed: boolean;
  reason?: string;
  duration?: number;
  bytesTransferred?: number;
}

export interface CertificateInfo {
  domain: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  valid: boolean;
  errors: string[];
}

export interface ConnectivityState {
  wifi: ConnectivityDetail;
  cellular: ConnectivityDetail;
  bluetooth: ConnectivityDetail;
  vpn: boolean;
}

export interface ConnectivityDetail {
  available: boolean;
  connected: boolean;
  strength?: number; // 0-100
  metered?: boolean;
  ssid?: string;
}

// ===========================================================================
// CONSTANTS
// ===========================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_LOG_ENTRIES = 500;

// ===========================================================================
// STORE
// ===========================================================================

const networkStore = new Store<{
  config: NetworkConfig;
  connectionLog: ConnectionAttempt[];
  certificateCache: Record<string, CertificateInfo>;
  statistics: NetworkStatistics;
}>({
  name: 'dex-network',
  defaults: {
    config: {
      enabled: true,
      enforceHttps: true,
      validateCertificates: true,
      allowInbound: false,
      pauseOnUncertainty: true,
      trustedDomains: [
        'github.com',
        'api.github.com',
        'githubusercontent.com',
        'electronjs.org',
      ],
      blockedDomains: [],
      maxConcurrentConnections: 200,
      connectionTimeout: DEFAULT_TIMEOUT,
      logAllConnections: false,
    },
    connectionLog: [],
    certificateCache: {},
    statistics: {
      totalConnections: 0,
      blockedConnections: 0,
      httpsConnections: 0,
      httpConnections: 0,
      certificateErrors: 0,
      lastReset: Date.now(),
    },
  },
});

interface NetworkStatistics {
  totalConnections: number;
  blockedConnections: number;
  httpsConnections: number;
  httpConnections: number;
  certificateErrors: number;
  lastReset: number;
}

// ===========================================================================
// NETWORK HYGIENE MONITOR
// ===========================================================================

class NetworkHygieneMonitorClass {
  private activeConnections: Map<string, ConnectionAttempt> = new Map();
  private isPaused = false;
  private statusCheckInterval: NodeJS.Timeout | null = null;
  private currentStatus: NetworkStatus = {
    online: true,
    connectionType: 'unknown',
    metered: false,
    lastCheck: 0,
    activeConnections: 0,
    blockedAttempts: 0,
  };

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    log.info('[NetworkHygiene] Initializing network hygiene monitor...');

    // Initial status check
    await this.updateNetworkStatus();

    // Periodic status checks
    this.statusCheckInterval = setInterval(
      () => this.updateNetworkStatus(),
      60 * 1000 // Every minute
    );

    log.info('[NetworkHygiene] Network hygiene monitor active');
  }

  shutdown(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    this.activeConnections.clear();
    log.info('[NetworkHygiene] Network hygiene monitor shutdown');
  }

  // -------------------------------------------------------------------------
  // CONNECTION VALIDATION
  // -------------------------------------------------------------------------

  // Check if a connection should be allowed
  async validateConnection(
    domain: string,
    port: number,
    protocol: 'https' | 'http' | 'wss' | 'ws' | 'tcp'
  ): Promise<{ allowed: boolean; reason: string }> {
    const config = this.getConfig();
    const connectionId = `${domain}:${port}:${protocol}`;

    // Check if monitor is enabled
    if (!config.enabled) {
      return { allowed: true, reason: 'Monitor disabled' };
    }

    // Check if paused
    if (this.isPaused && config.pauseOnUncertainty) {
      this.logConnection(connectionId, domain, port, protocol, false, 'Network paused');
      return { allowed: false, reason: 'Network activity paused' };
    }

    // Check blocked domains
    if (this.isDomainBlocked(domain)) {
      this.logConnection(connectionId, domain, port, protocol, false, 'Domain blocked');
      this.incrementBlocked();
      return { allowed: false, reason: 'Domain is blocked' };
    }

    // Enforce HTTPS
    if (config.enforceHttps && (protocol === 'http' || protocol === 'ws')) {
      // Allow localhost/127.0.0.1 for development
      if (domain !== 'localhost' && domain !== '127.0.0.1') {
        this.logConnection(connectionId, domain, port, protocol, false, 'HTTP not allowed');
        this.incrementBlocked();
        return { allowed: false, reason: 'Only HTTPS/WSS connections allowed' };
      }
    }

    // Check concurrent connection limit (TTL-sweep stale entries first)
    const now = Date.now();
    const timeout = config.connectionTimeout || DEFAULT_TIMEOUT;
    for (const [cid, conn] of this.activeConnections) {
      if (now - conn.timestamp > timeout) this.activeConnections.delete(cid);
    }
    if (this.activeConnections.size >= config.maxConcurrentConnections) {
      return { allowed: false, reason: 'Connection limit reached' };
    }

    // For HTTPS, validate certificate if enabled
    if (protocol === 'https' && config.validateCertificates) {
      const certValid = await this.validateCertificate(domain);
      if (!certValid.valid) {
        this.logConnection(connectionId, domain, port, protocol, false, 'Certificate invalid');
        this.incrementBlocked();
        return { allowed: false, reason: `Certificate error: ${certValid.errors.join(', ')}` };
      }
    }

    // Connection allowed
    this.logConnection(connectionId, domain, port, protocol, true, 'Allowed');
    this.incrementStats(protocol);

    return { allowed: true, reason: 'Validation passed' };
  }

  // Validate SSL/TLS certificate
  async validateCertificate(domain: string): Promise<CertificateInfo> {
    const config = this.getConfig();
    
    // Check cache first
    const cached = networkStore.get('certificateCache')[domain];
    if (cached && new Date(cached.validTo) > new Date()) {
      return cached;
    }

    // Trusted domains bypass strict validation
    if (config.trustedDomains.includes(domain)) {
      return {
        domain,
        issuer: 'Trusted',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        fingerprint: '',
        valid: true,
        errors: [],
      };
    }

    return new Promise((resolve) => {
      const socket = tls.connect(443, domain, {
        servername: domain,
        rejectUnauthorized: true,
      });

      socket.setTimeout(config.connectionTimeout);

      socket.on('secureConnect', () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;

        const authError = socket.authorizationError;
        const errorMessage = authError 
          ? (typeof authError === 'string' ? authError : authError.toString())
          : 'Unknown error';

        const info: CertificateInfo = {
          domain,
          issuer: cert.issuer?.O || 'Unknown',
          validFrom: new Date(cert.valid_from),
          validTo: new Date(cert.valid_to),
          fingerprint: cert.fingerprint || '',
          valid: authorized,
          errors: authorized ? [] : [errorMessage],
        };

        // Cache the result
        const cache = networkStore.get('certificateCache');
        cache[domain] = info;
        networkStore.set('certificateCache', cache);

        socket.destroy();
        resolve(info);
      });

      socket.on('error', (error) => {
        const stats = networkStore.get('statistics');
        stats.certificateErrors++;
        networkStore.set('statistics', stats);

        resolve({
          domain,
          issuer: 'Unknown',
          validFrom: new Date(),
          validTo: new Date(),
          fingerprint: '',
          valid: false,
          errors: [error.message],
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          domain,
          issuer: 'Unknown',
          validFrom: new Date(),
          validTo: new Date(),
          fingerprint: '',
          valid: false,
          errors: ['Connection timeout'],
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // DOMAIN MANAGEMENT
  // -------------------------------------------------------------------------

  private isDomainBlocked(domain: string): boolean {
    const config = this.getConfig();
    return config.blockedDomains.some(blocked => {
      if (blocked.startsWith('*.')) {
        return domain.endsWith(blocked.slice(1));
      }
      return domain === blocked || domain.endsWith('.' + blocked);
    });
  }

  addTrustedDomain(domain: string): void {
    const config = this.getConfig();
    if (!config.trustedDomains.includes(domain)) {
      config.trustedDomains.push(domain);
      networkStore.set('config', config);
      log.info(`[NetworkHygiene] Added trusted domain: ${domain}`);
    }
  }

  removeTrustedDomain(domain: string): void {
    const config = this.getConfig();
    config.trustedDomains = config.trustedDomains.filter(d => d !== domain);
    networkStore.set('config', config);
  }

  addBlockedDomain(domain: string): void {
    const config = this.getConfig();
    if (!config.blockedDomains.includes(domain)) {
      config.blockedDomains.push(domain);
      networkStore.set('config', config);
      log.info(`[NetworkHygiene] Blocked domain: ${domain}`);
    }
  }

  removeBlockedDomain(domain: string): void {
    const config = this.getConfig();
    config.blockedDomains = config.blockedDomains.filter(d => d !== domain);
    networkStore.set('config', config);
  }

  // -------------------------------------------------------------------------
  // NETWORK STATUS
  // -------------------------------------------------------------------------

  async updateNetworkStatus(): Promise<NetworkStatus> {
    try {
      const online = net.isOnline();

      this.currentStatus = {
        online,
        connectionType: this.detectConnectionType(),
        metered: false, // Would require native module for accurate detection
        lastCheck: Date.now(),
        activeConnections: this.activeConnections.size,
        blockedAttempts: networkStore.get('statistics').blockedConnections,
      };

      // Auto-pause if offline
      if (!online && this.getConfig().pauseOnUncertainty) {
        this.pause();
      } else if (online && this.isPaused) {
        this.resume();
      }

      return this.currentStatus;
    } catch (error) {
      log.error('[NetworkHygiene] Status check failed:', error);
      return this.currentStatus;
    }
  }

  private detectConnectionType(): 'wifi' | 'ethernet' | 'cellular' | 'unknown' {
    // Accurate detection requires native modules — infer from online state
    if (net.isOnline()) return 'ethernet'; // Assume wired on desktop unless native detection available
    return 'unknown';
  }

  getNetworkStatus(): NetworkStatus {
    return this.currentStatus;
  }

  // Connectivity awareness
  async getConnectivityState(): Promise<ConnectivityState> {
    // This provides basic connectivity info
    // Full implementation would require native modules for Wi-Fi/Bluetooth details
    const online = net.isOnline();

    return {
      wifi: {
        available: true, // Assume available on desktop
        connected: online,
        strength: online ? 100 : 0,
        metered: false,
      },
      cellular: {
        available: false, // Not typically available on desktop
        connected: false,
      },
      bluetooth: {
        available: false, // Would need native module
        connected: false,
      },
      vpn: false, // Would need native module for VPN detection
    };
  }

  // -------------------------------------------------------------------------
  // PAUSE / RESUME
  // -------------------------------------------------------------------------

  pause(): void {
    this.isPaused = true;
    log.info('[NetworkHygiene] Network activity paused');
  }

  resume(): void {
    this.isPaused = false;
    log.info('[NetworkHygiene] Network activity resumed');
  }

  isPausedState(): boolean {
    return this.isPaused;
  }

  // -------------------------------------------------------------------------
  // DNS VALIDATION
  // -------------------------------------------------------------------------

  async resolveDomain(domain: string): Promise<string[] | null> {
    return new Promise((resolve) => {
      dns.resolve4(domain, (error, addresses) => {
        if (error) {
          log.warn(`[NetworkHygiene] DNS resolution failed for ${domain}: ${error.message}`);
          resolve(null);
        } else {
          resolve(addresses);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // SECURE REQUEST HELPER
  // -------------------------------------------------------------------------

  async secureRequest(
    url: string,
    options?: https.RequestOptions
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const protocol = urlObj.protocol.slice(0, -1) as 'https' | 'http';

    // Validate connection first
    const validation = await this.validateConnection(domain, port, protocol);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    return new Promise((resolve) => {
      const config = this.getConfig();
      const req = https.request(url, {
        ...options,
        timeout: config.connectionTimeout,
        rejectUnauthorized: config.validateCertificates,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ success: true, data });
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.end();
    });
  }

  // -------------------------------------------------------------------------
  // LOGGING & STATISTICS
  // -------------------------------------------------------------------------

  private logConnection(
    id: string,
    domain: string,
    port: number,
    protocol: 'https' | 'http' | 'wss' | 'ws' | 'tcp',
    allowed: boolean,
    reason: string
  ): void {
    const config = this.getConfig();
    if (!config.logAllConnections && allowed) return;

    const attempt: ConnectionAttempt = {
      id,
      timestamp: Date.now(),
      domain,
      port,
      protocol,
      allowed,
      reason,
    };

    if (allowed) {
      this.activeConnections.set(id, attempt);
    }

    const connectionLog = networkStore.get('connectionLog');
    connectionLog.unshift(attempt);
    if (connectionLog.length > MAX_LOG_ENTRIES) {
      connectionLog.splice(MAX_LOG_ENTRIES);
    }
    networkStore.set('connectionLog', connectionLog);
  }

  private incrementStats(protocol: 'https' | 'http' | 'wss' | 'ws' | 'tcp'): void {
    const stats = networkStore.get('statistics');
    stats.totalConnections++;
    if (protocol === 'https' || protocol === 'wss') {
      stats.httpsConnections++;
    } else {
      stats.httpConnections++;
    }
    networkStore.set('statistics', stats);
  }

  private incrementBlocked(): void {
    const stats = networkStore.get('statistics');
    stats.blockedConnections++;
    networkStore.set('statistics', stats);
  }

  // Mark connection as complete
  completeConnection(connectionId: string, bytesTransferred?: number): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection) {
      connection.duration = Date.now() - connection.timestamp;
      connection.bytesTransferred = bytesTransferred;
      this.activeConnections.delete(connectionId);
    }
  }

  getConnectionLog(limit = 100): ConnectionAttempt[] {
    return networkStore.get('connectionLog').slice(0, limit);
  }

  getStatistics(): NetworkStatistics {
    return networkStore.get('statistics');
  }

  resetStatistics(): void {
    networkStore.set('statistics', {
      totalConnections: 0,
      blockedConnections: 0,
      httpsConnections: 0,
      httpConnections: 0,
      certificateErrors: 0,
      lastReset: Date.now(),
    });
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  getConfig(): NetworkConfig {
    return networkStore.get('config');
  }

  updateConfig(updates: Partial<NetworkConfig>): NetworkConfig {
    const config = this.getConfig();
    const updated = { ...config, ...updates };
    networkStore.set('config', updated);
    return updated;
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const NetworkHygieneMonitor = new NetworkHygieneMonitorClass();
export default NetworkHygieneMonitor;
