// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - External Connectors Framework
// Phase 19: Connector-based external file access
// User explicitly connects each source with clear permission scope
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from '../utils/Logger';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export type ConnectorType = 'local-folder' | 'external-drive' | 'network-share' | 'cloud-storage';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'pending';
export type AccessLevel = 'read-only' | 'read-write';

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  path: string;
  accessLevel: AccessLevel;
  enabled: boolean;
  createdAt: number;
  lastAccessed?: number;
  metadata?: Record<string, any>;
}

export interface ConnectorInfo extends ConnectorConfig {
  status: ConnectorStatus;
  available: boolean;
  error?: string;
  stats?: {
    totalFiles?: number;
    totalSize?: number;
    lastScanned?: number;
  };
}

export interface ConnectorFile {
  name: string;
  path: string;
  relativePath: string;
  connectorId: string;
  size: number;
  isDirectory: boolean;
  modified: number;
}

export interface ConnectorOperation {
  id: string;
  connectorId: string;
  type: 'read' | 'write' | 'list' | 'copy';
  path: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

// ===========================================================================
// EXTERNAL CONNECTORS CLASS
// ===========================================================================

class ExternalConnectorsClass {
  private connectors: Map<string, ConnectorConfig> = new Map();
  private operationLog: ConnectorOperation[] = [];
  private maxLogSize = 100;

  constructor() {
    this.loadConnectors();
  }

  // -------------------------------------------------------------------------
  // CONNECTOR MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add a new connector
   */
  addConnector(config: Omit<ConnectorConfig, 'id' | 'createdAt'>): ConnectorInfo {
    const id = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    const connector: ConnectorConfig = {
      ...config,
      id,
      createdAt: Date.now(),
    };

    // Validate path exists
    const normalizedPath = path.normalize(config.path);
    if (!fs.existsSync(normalizedPath)) {
      log.warn(`[Connectors] Path does not exist: ${normalizedPath}`);
    }

    this.connectors.set(id, { ...connector, path: normalizedPath });
    this.saveConnectors();

    log.info(`[Connectors] Added connector: ${connector.name} (${id})`);
    return this.getConnectorInfo(id)!;
  }

  /**
   * Remove a connector
   */
  removeConnector(connectorId: string): boolean {
    const removed = this.connectors.delete(connectorId);
    
    if (removed) {
      this.saveConnectors();
      log.info(`[Connectors] Removed connector: ${connectorId}`);
    }
    
    return removed;
  }

  /**
   * Update connector settings
   */
  updateConnector(
    connectorId: string,
    updates: Partial<Pick<ConnectorConfig, 'name' | 'accessLevel' | 'enabled'>>
  ): ConnectorInfo | null {
    const connector = this.connectors.get(connectorId);
    
    if (!connector) {
      return null;
    }

    const updated: ConnectorConfig = {
      ...connector,
      ...updates,
    };

    this.connectors.set(connectorId, updated);
    this.saveConnectors();

    log.info(`[Connectors] Updated connector: ${connectorId}`);
    return this.getConnectorInfo(connectorId);
  }

  /**
   * Get all connectors
   */
  getConnectors(): ConnectorInfo[] {
    return Array.from(this.connectors.keys()).map(id => this.getConnectorInfo(id)!);
  }

  /**
   * Get connector by ID
   */
  getConnector(connectorId: string): ConnectorConfig | null {
    return this.connectors.get(connectorId) ?? null;
  }

  /**
   * Get detailed connector info
   */
  getConnectorInfo(connectorId: string): ConnectorInfo | null {
    const connector = this.connectors.get(connectorId);
    
    if (!connector) {
      return null;
    }

    const available = fs.existsSync(connector.path);
    let status: ConnectorStatus = 'disconnected';
    let error: string | undefined;

    if (!connector.enabled) {
      status = 'disconnected';
    } else if (!available) {
      status = 'error';
      error = 'Path not accessible';
    } else {
      status = 'connected';
    }

    return {
      ...connector,
      status,
      available,
      error,
    };
  }

  // -------------------------------------------------------------------------
  // FILE OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * List files in connector
   */
  listFiles(connectorId: string, subPath: string = ''): ConnectorFile[] | null {
    const connector = this.connectors.get(connectorId);
    
    if (!connector || !connector.enabled) {
      this.logOperation(connectorId, 'list', subPath, false, 'Connector not available');
      return null;
    }

    const fullPath = path.join(connector.path, subPath);
    
    // Ensure we're still within the connector's scope
    if (!fullPath.startsWith(connector.path)) {
      this.logOperation(connectorId, 'list', subPath, false, 'Path outside connector scope');
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      this.logOperation(connectorId, 'list', subPath, false, 'Path does not exist');
      return null;
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const files: ConnectorFile[] = [];

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        try {
          const stats = fs.statSync(entryPath);
          files.push({
            name: entry.name,
            path: entryPath,
            relativePath: path.relative(connector.path, entryPath),
            connectorId,
            size: stats.size,
            isDirectory: entry.isDirectory(),
            modified: stats.mtimeMs,
          });
        } catch {
          continue;
        }
      }

      // Update last accessed
      connector.lastAccessed = Date.now();
      this.connectors.set(connectorId, connector);

      this.logOperation(connectorId, 'list', subPath, true);
      return files;

    } catch (error) {
      this.logOperation(connectorId, 'list', subPath, false, 
        error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Read file from connector
   */
  readFile(connectorId: string, relativePath: string): Buffer | null {
    const connector = this.connectors.get(connectorId);
    
    if (!connector || !connector.enabled) {
      this.logOperation(connectorId, 'read', relativePath, false, 'Connector not available');
      return null;
    }

    const fullPath = path.join(connector.path, relativePath);
    
    if (!fullPath.startsWith(connector.path)) {
      this.logOperation(connectorId, 'read', relativePath, false, 'Path outside connector scope');
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      this.logOperation(connectorId, 'read', relativePath, false, 'File does not exist');
      return null;
    }

    try {
      const content = fs.readFileSync(fullPath);
      
      connector.lastAccessed = Date.now();
      this.connectors.set(connectorId, connector);

      this.logOperation(connectorId, 'read', relativePath, true);
      return content;

    } catch (error) {
      this.logOperation(connectorId, 'read', relativePath, false,
        error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Write file to connector (requires read-write access)
   */
  writeFile(connectorId: string, relativePath: string, content: Buffer | string): boolean {
    const connector = this.connectors.get(connectorId);
    
    if (!connector || !connector.enabled) {
      this.logOperation(connectorId, 'write', relativePath, false, 'Connector not available');
      return false;
    }

    if (connector.accessLevel !== 'read-write') {
      this.logOperation(connectorId, 'write', relativePath, false, 'Connector is read-only');
      return false;
    }

    const fullPath = path.join(connector.path, relativePath);
    
    if (!fullPath.startsWith(connector.path)) {
      this.logOperation(connectorId, 'write', relativePath, false, 'Path outside connector scope');
      return false;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content);
      
      connector.lastAccessed = Date.now();
      this.connectors.set(connectorId, connector);

      this.logOperation(connectorId, 'write', relativePath, true);
      log.info(`[Connectors] Wrote file: ${relativePath} (${connectorId})`);
      return true;

    } catch (error) {
      this.logOperation(connectorId, 'write', relativePath, false,
        error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Copy file from connector to local path
   */
  copyToLocal(connectorId: string, relativePath: string, localPath: string): boolean {
    const content = this.readFile(connectorId, relativePath);
    
    if (!content) {
      return false;
    }

    try {
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(localPath, content);
      this.logOperation(connectorId, 'copy', relativePath, true);
      log.info(`[Connectors] Copied to local: ${relativePath} ${localPath}`);
      return true;

    } catch (error) {
      log.error('[Connectors] Copy to local failed:', error);
      return false;
    }
  }

  /**
   * Copy file from local to connector
   */
  copyFromLocal(localPath: string, connectorId: string, relativePath: string): boolean {
    if (!fs.existsSync(localPath)) {
      log.warn(`[Connectors] Local file does not exist: ${localPath}`);
      return false;
    }

    try {
      const content = fs.readFileSync(localPath);
      return this.writeFile(connectorId, relativePath, content);
    } catch (error) {
      log.error('[Connectors] Copy from local failed:', error);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // AUDIT LOG
  // -------------------------------------------------------------------------

  /**
   * Get operation log
   */
  getOperationLog(): ConnectorOperation[] {
    return [...this.operationLog];
  }

  /**
   * Clear operation log
   */
  clearOperationLog(): void {
    this.operationLog = [];
    log.info('[Connectors] Operation log cleared');
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private logOperation(
    connectorId: string,
    type: ConnectorOperation['type'],
    opPath: string,
    success: boolean,
    error?: string
  ): void {
    const operation: ConnectorOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      connectorId,
      type,
      path: opPath,
      timestamp: Date.now(),
      success,
      error,
    };

    this.operationLog.push(operation);

    if (this.operationLog.length > this.maxLogSize) {
      this.operationLog = this.operationLog.slice(-this.maxLogSize);
    }
  }

  private loadConnectors(): void {
    try {
      const connectorsPath = path.join(app.getPath('userData'), 'dex-connectors.json');
      if (fs.existsSync(connectorsPath)) {
        const data = JSON.parse(fs.readFileSync(connectorsPath, 'utf-8'));
        for (const connector of data.connectors ?? []) {
          this.connectors.set(connector.id, connector);
        }
        log.info(`[Connectors] Loaded ${this.connectors.size} connectors`);
      }
    } catch (error) {
      log.error('[Connectors] Failed to load connectors:', error);
    }
  }

  private saveConnectors(): void {
    try {
      const connectorsPath = path.join(app.getPath('userData'), 'dex-connectors.json');
      const data = {
        version: 1,
        connectors: Array.from(this.connectors.values()),
      };
      fs.writeFileSync(connectorsPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.error('[Connectors] Failed to save connectors:', error);
    }
  }
}

// Singleton export
export const externalConnectors = new ExternalConnectorsClass();
