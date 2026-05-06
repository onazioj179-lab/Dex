// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Privacy Shield
// System 5: Data Privacy & Leak Prevention
// Ensures no data leaves the local machine without explicit user consent
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, session, net, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type DataType = 
  | 'file-content'
  | 'file-metadata'
  | 'user-settings'
  | 'usage-data'
  | 'crash-report'
  | 'telemetry'
  | 'diagnostic'
  | 'clipboard'
  | 'screenshot'
  | 'system-info';

export type NetworkAction = 'block' | 'allow' | 'prompt';

export interface DataFlowRule {
  id: string;
  dataType: DataType;
  destination: string; // Domain or 'local' or '*'
  action: NetworkAction;
  reason: string;
  createdAt: number;
  lastTriggered?: number;
  triggerCount: number;
}

export interface NetworkRequest {
  id: string;
  timestamp: number;
  url: string;
  method: string;
  domain: string;
  blocked: boolean;
  reason?: string;
  dataTypes: DataType[];
  sizeBytes?: number;
}

export interface PrivacyConfig {
  enabled: boolean;
  defaultAction: NetworkAction;
  blockTelemetry: boolean;
  blockCrashReports: boolean;
  blockExternalImages: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  logAllRequests: boolean;
  maxRequestLogSize: number;
}

export interface PrivacyStats {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  dataTypesBlocked: Record<DataType, number>;
  topBlockedDomains: { domain: string; count: number }[];
  lastReset: number;
}

export interface LeakWarning {
  id: string;
  timestamp: number;
  dataType: DataType;
  destination: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  prevented: boolean;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: PrivacyConfig = {
  enabled: true,
  defaultAction: 'block',
  blockTelemetry: true,
  blockCrashReports: true,
  blockExternalImages: false,
  allowedDomains: [],
  blockedDomains: [
    'analytics.google.com',
    'www.google-analytics.com',
    'stats.g.doubleclick.net',
    'telemetry.microsoft.com',
    'dc.services.visualstudio.com',
    'vortex.data.microsoft.com',
  ],
  logAllRequests: true,
  maxRequestLogSize: 1000,
};

// ===========================================================================
// KNOWN TELEMETRY PATTERNS
// ===========================================================================

const TELEMETRY_PATTERNS = [
  /analytics/i,
  /telemetry/i,
  /tracking/i,
  /beacon/i,
  /collect/i,
  /metrics/i,
  /stats/i,
  /ping/i,
  /crash.*report/i,
  /error.*report/i,
  /sentry/i,
  /bugsnag/i,
  /rollbar/i,
];

// ===========================================================================
// PRIVACY SHIELD
// ===========================================================================

class PrivacyShieldClass extends EventEmitter {
  private config: PrivacyConfig;
  private rules: Map<string, DataFlowRule> = new Map();
  private requestLog: NetworkRequest[] = [];
  private warnings: LeakWarning[] = [];
  private stats: PrivacyStats;
  private configPath = '';
  private isActive = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.stats = this.initStats();
    this.setupIPC();
  }

  private initStats(): PrivacyStats {
    return {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      dataTypesBlocked: {
        'file-content': 0,
        'file-metadata': 0,
        'user-settings': 0,
        'usage-data': 0,
        'crash-report': 0,
        'telemetry': 0,
        'diagnostic': 0,
        'clipboard': 0,
        'screenshot': 0,
        'system-info': 0,
      },
      topBlockedDomains: [],
      lastReset: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.configPath = path.join(app.getPath('userData'), 'privacy');
    
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await this.loadConfig();
      await this.loadRules();
      this.setupNetworkInterception();
      this.setupDefaultRules();
      
      this.isActive = true;
      log.info('[PrivacyShield] Activated - All network traffic monitored');
    } catch (error) {
      log.error('[PrivacyShield] Initialization failed:', error);
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

  private async loadRules(): Promise<void> {
    const rulesFile = path.join(this.configPath, 'rules.json');
    
    try {
      const data = await fs.readFile(rulesFile, 'utf-8');
      const rules = JSON.parse(data) as DataFlowRule[];
      
      for (const rule of rules) {
        this.rules.set(rule.id, rule);
      }
    } catch {
      // No existing rules
    }
  }

  private async saveRules(): Promise<void> {
    const rulesFile = path.join(this.configPath, 'rules.json');
    const rules = Array.from(this.rules.values());
    await fs.writeFile(rulesFile, JSON.stringify(rules, null, 2));
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get privacy status
    ipcMain.handle('privacy:status', () => {
      return {
        enabled: this.config.enabled,
        isActive: this.isActive,
        stats: this.stats,
      };
    });

    // Get config
    ipcMain.handle('privacy:config', () => {
      return this.config;
    });

    // Update config
    ipcMain.handle('privacy:setConfig', async (_event, updates: Partial<PrivacyConfig>) => {
      return this.updateConfig(updates);
    });

    // Get request log
    ipcMain.handle('privacy:requestLog', (_event, limit?: number) => {
      return this.getRequestLog(limit);
    });

    // Get warnings
    ipcMain.handle('privacy:warnings', (_event, limit?: number) => {
      return this.getWarnings(limit);
    });

    // Get rules
    ipcMain.handle('privacy:rules', () => {
      return this.getRules();
    });

    // Add rule
    ipcMain.handle('privacy:addRule', async (_event, rule: Omit<DataFlowRule, 'id' | 'createdAt' | 'triggerCount'>) => {
      return this.addRule(rule);
    });

    // Remove rule
    ipcMain.handle('privacy:removeRule', async (_event, ruleId: string) => {
      return this.removeRule(ruleId);
    });

    // Clear logs
    ipcMain.handle('privacy:clearLogs', () => {
      return this.clearLogs();
    });

    // Reset stats
    ipcMain.handle('privacy:resetStats', () => {
      return this.resetStats();
    });

    // Allow domain
    ipcMain.handle('privacy:allowDomain', async (_event, domain: string) => {
      return this.allowDomain(domain);
    });

    // Block domain
    ipcMain.handle('privacy:blockDomain', async (_event, domain: string) => {
      return this.blockDomain(domain);
    });
  }

  // -------------------------------------------------------------------------
  // NETWORK INTERCEPTION
  // -------------------------------------------------------------------------

  private setupNetworkInterception(): void {
    if (!this.config.enabled) return;

    // Intercept all network requests
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const result = this.evaluateRequest(details);
      
      if (result.blocked) {
        callback({ cancel: true });
      } else {
        callback({});
      }
    });

    // Also monitor outgoing data
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      // Check for suspicious headers that might contain user data
      const sanitizedHeaders = this.sanitizeHeaders(details.requestHeaders);
      callback({ requestHeaders: sanitizedHeaders });
    });

    log.info('[PrivacyShield] Network interception configured');
  }

  private evaluateRequest(details: Electron.OnBeforeRequestListenerDetails): { blocked: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { blocked: false };
    }

    const url = new URL(details.url);
    const domain = url.hostname;

    // Skip local requests
    if (this.isLocalRequest(domain)) {
      return { blocked: false };
    }

    // Log the request
    const request = this.logRequest(details, false);

    // Check explicitly allowed domains
    if (this.config.allowedDomains.includes(domain)) {
      this.stats.allowedRequests++;
      return { blocked: false };
    }

    // Check explicitly blocked domains
    if (this.config.blockedDomains.includes(domain)) {
      this.markRequestBlocked(request, 'Domain in blocklist');
      return { blocked: true, reason: 'Domain blocked' };
    }

    // Check for telemetry patterns
    if (this.config.blockTelemetry && this.isTelemetryRequest(details.url)) {
      this.markRequestBlocked(request, 'Telemetry request detected');
      this.addWarning('telemetry', domain, 'medium', 'Telemetry request blocked');
      return { blocked: true, reason: 'Telemetry blocked' };
    }

    // Check custom rules
    const matchingRule = this.findMatchingRule(domain);
    if (matchingRule) {
      matchingRule.lastTriggered = Date.now();
      matchingRule.triggerCount++;

      if (matchingRule.action === 'block') {
        this.markRequestBlocked(request, matchingRule.reason);
        return { blocked: true, reason: matchingRule.reason };
      }
    }

    // Default action
    if (this.config.defaultAction === 'block') {
      this.markRequestBlocked(request, 'Default policy: block unknown requests');
      return { blocked: true, reason: 'Unknown destination blocked' };
    }

    this.stats.allowedRequests++;
    return { blocked: false };
  }

  private isLocalRequest(domain: string): boolean {
    return (
      domain === 'localhost' ||
      domain === '127.0.0.1' ||
      domain === '::1' ||
      domain.endsWith('.local') ||
      domain === '' ||
      domain.startsWith('file')
    );
  }

  private isTelemetryRequest(url: string): boolean {
    return TELEMETRY_PATTERNS.some(pattern => pattern.test(url));
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-auth-token',
      'x-api-key',
    ];

    const sanitized = { ...headers };
    
    // Log but allow - don't strip headers as it might break functionality
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        log.debug(`[PrivacyShield] Sensitive header detected: ${header}`);
      }
    }

    return sanitized;
  }

  // -------------------------------------------------------------------------
  // REQUEST LOGGING
  // -------------------------------------------------------------------------

  private logRequest(details: Electron.OnBeforeRequestListenerDetails, blocked: boolean): NetworkRequest {
    const url = new URL(details.url);
    
    const request: NetworkRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      url: details.url,
      method: details.method || 'GET',
      domain: url.hostname,
      blocked,
      dataTypes: this.inferDataTypes(details),
    };

    if (this.config.logAllRequests) {
      this.requestLog.push(request);
      
      // Enforce max size
      if (this.requestLog.length > this.config.maxRequestLogSize) {
        this.requestLog.shift();
      }
    }

    this.stats.totalRequests++;
    return request;
  }

  private markRequestBlocked(request: NetworkRequest, reason: string): void {
    request.blocked = true;
    request.reason = reason;
    this.stats.blockedRequests++;

    // Update domain stats
    const existing = this.stats.topBlockedDomains.find(d => d.domain === request.domain);
    if (existing) {
      existing.count++;
    } else {
      this.stats.topBlockedDomains.push({ domain: request.domain, count: 1 });
    }

    // Sort and limit
    this.stats.topBlockedDomains.sort((a, b) => b.count - a.count);
    this.stats.topBlockedDomains = this.stats.topBlockedDomains.slice(0, 20);

    this.emit('request:blocked', request);
  }

  private inferDataTypes(details: Electron.OnBeforeRequestListenerDetails): DataType[] {
    const types: DataType[] = [];
    const url = details.url.toLowerCase();

    if (url.includes('crash') || url.includes('error')) {
      types.push('crash-report');
    }
    if (url.includes('telemetry') || url.includes('analytics') || url.includes('metrics')) {
      types.push('telemetry');
    }
    if (url.includes('diagnostic')) {
      types.push('diagnostic');
    }
    if (types.length === 0) {
      types.push('usage-data');
    }

    return types;
  }

  // -------------------------------------------------------------------------
  // WARNINGS
  // -------------------------------------------------------------------------

  private addWarning(
    dataType: DataType,
    destination: string,
    severity: LeakWarning['severity'],
    description: string,
    prevented: boolean = true
  ): void {
    const warning: LeakWarning = {
      id: `warn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      dataType,
      destination,
      severity,
      description,
      prevented,
    };

    this.warnings.push(warning);
    
    // Keep last 100 warnings
    if (this.warnings.length > 100) {
      this.warnings.shift();
    }

    this.stats.dataTypesBlocked[dataType]++;
    this.emit('warning', warning);
  }

  // -------------------------------------------------------------------------
  // RULES MANAGEMENT
  // -------------------------------------------------------------------------

  private setupDefaultRules(): void {
    // Block common telemetry endpoints
    const defaultRules: Omit<DataFlowRule, 'id' | 'createdAt' | 'triggerCount'>[] = [
      {
        dataType: 'telemetry',
        destination: '*.google-analytics.com',
        action: 'block',
        reason: 'Google Analytics telemetry',
      },
      {
        dataType: 'telemetry',
        destination: '*.doubleclick.net',
        action: 'block',
        reason: 'DoubleClick tracking',
      },
      {
        dataType: 'crash-report',
        destination: '*.sentry.io',
        action: 'block',
        reason: 'Sentry error reporting',
      },
    ];

    for (const rule of defaultRules) {
      // Only add if not already exists
      const exists = Array.from(this.rules.values()).some(
        r => r.destination === rule.destination && r.dataType === rule.dataType
      );

      if (!exists) {
        this.addRule(rule);
      }
    }
  }

  private findMatchingRule(domain: string): DataFlowRule | null {
    for (const rule of this.rules.values()) {
      const pattern = rule.destination
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      
      const regex = new RegExp(`^${pattern}$`, 'i');
      if (regex.test(domain)) {
        return rule;
      }
    }
    return null;
  }

  async addRule(rule: Omit<DataFlowRule, 'id' | 'createdAt' | 'triggerCount'>): Promise<DataFlowRule> {
    const fullRule: DataFlowRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      triggerCount: 0,
    };

    this.rules.set(fullRule.id, fullRule);
    await this.saveRules();

    this.emit('rule:added', fullRule);
    return fullRule;
  }

  async removeRule(ruleId: string): Promise<{ success: boolean }> {
    if (this.rules.delete(ruleId)) {
      await this.saveRules();
      this.emit('rule:removed', ruleId);
      return { success: true };
    }
    return { success: false };
  }

  getRules(): DataFlowRule[] {
    return Array.from(this.rules.values());
  }

  // -------------------------------------------------------------------------
  // DOMAIN MANAGEMENT
  // -------------------------------------------------------------------------

  async allowDomain(domain: string): Promise<{ success: boolean }> {
    // Remove from blocked if present
    this.config.blockedDomains = this.config.blockedDomains.filter(d => d !== domain);
    
    // Add to allowed if not present
    if (!this.config.allowedDomains.includes(domain)) {
      this.config.allowedDomains.push(domain);
    }

    await this.saveConfig();
    this.emit('domain:allowed', domain);
    return { success: true };
  }

  async blockDomain(domain: string): Promise<{ success: boolean }> {
    // Remove from allowed if present
    this.config.allowedDomains = this.config.allowedDomains.filter(d => d !== domain);
    
    // Add to blocked if not present
    if (!this.config.blockedDomains.includes(domain)) {
      this.config.blockedDomains.push(domain);
    }

    await this.saveConfig();
    this.emit('domain:blocked', domain);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // GETTERS
  // -------------------------------------------------------------------------

  getRequestLog(limit: number = 100): NetworkRequest[] {
    return this.requestLog.slice(-limit);
  }

  getWarnings(limit: number = 50): LeakWarning[] {
    return this.warnings.slice(-limit);
  }

  getStats(): PrivacyStats {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------
  // MANAGEMENT
  // -------------------------------------------------------------------------

  async updateConfig(updates: Partial<PrivacyConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();

    // Re-setup interception if enabled state changed
    if ('enabled' in updates) {
      if (updates.enabled) {
        this.setupNetworkInterception();
      }
      this.isActive = !!updates.enabled;
    }

    this.emit('config:changed', this.config);
    return { success: true };
  }

  clearLogs(): { success: boolean } {
    this.requestLog = [];
    this.warnings = [];
    return { success: true };
  }

  resetStats(): { success: boolean } {
    this.stats = this.initStats();
    return { success: true };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const PrivacyShield = new PrivacyShieldClass();
