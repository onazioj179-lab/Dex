// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Browser Bridge (Chrome Pairing)
// Phase 19: Optional web-assisted tasks through browser pairing
// User must approve browser pairing - every action is visible
// ===========================================================================

import { Logger } from '../utils/Logger';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing';

export interface BrowserConnection {
  id: string;
  browserName: string;
  browserVersion: string;
  connectedAt: number;
  lastActivity: number;
  tabCount: number;
}

export interface WebAction {
  id: string;
  type: 'navigate' | 'read' | 'fill' | 'click' | 'download' | 'screenshot';
  target: string;
  params?: Record<string, any>;
  status: 'pending' | 'sent' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface PageContent {
  url: string;
  title: string;
  text?: string;
  html?: string;
  links?: { text: string; href: string }[];
  forms?: { id: string; action: string; fields: string[] }[];
}

export interface PairingRequest {
  code: string;
  expiresAt: number;
  browserInfo?: {
    name: string;
    version: string;
  };
}

// ===========================================================================
// BROWSER BRIDGE CLASS
// ===========================================================================

class BrowserBridgeClass extends EventEmitter {
  private status: BridgeStatus = 'disconnected';
  private connection: BrowserConnection | null = null;
  private pendingActions: Map<string, WebAction> = new Map();
  private actionHistory: WebAction[] = [];
  private maxHistorySize = 50;
  private server: http.Server | null = null;
  private pairingRequest: PairingRequest | null = null;
  private port = 19847; // Dex browser bridge port

  constructor() {
    super();
  }

  // -------------------------------------------------------------------------
  // CONNECTION MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Start the bridge server for browser pairing
   */
  async startServer(): Promise<boolean> {
    if (this.server) {
      log.warn('[BrowserBridge] Server already running');
      return true;
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        log.error('[BrowserBridge] Server error:', error);
        this.status = 'disconnected';
        this.emit('error', error);
        resolve(false);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        log.info(`[BrowserBridge] Server started on port ${this.port}`);
        this.status = 'disconnected';
        this.emit('serverStarted', this.port);
        resolve(true);
      });
    });
  }

  /**
   * Stop the bridge server
   */
  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.status = 'disconnected';
      this.connection = null;
      log.info('[BrowserBridge] Server stopped');
      this.emit('serverStopped');
    }
  }

  /**
   * Start pairing process
   */
  startPairing(): PairingRequest {
    const code = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
    
    this.pairingRequest = {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };

    this.status = 'pairing';
    this.emit('pairingStarted', this.pairingRequest);
    log.info(`[BrowserBridge] Pairing started with code: ${code}`);

    return this.pairingRequest;
  }

  /**
   * Cancel pairing
   */
  cancelPairing(): void {
    this.pairingRequest = null;
    this.status = 'disconnected';
    this.emit('pairingCancelled');
    log.info('[BrowserBridge] Pairing cancelled');
  }

  /**
   * Disconnect browser
   */
  disconnect(): void {
    this.connection = null;
    this.status = 'disconnected';
    this.pendingActions.clear();
    this.emit('disconnected');
    log.info('[BrowserBridge] Browser disconnected');
  }

  /**
   * Get current status
   */
  getStatus(): { status: BridgeStatus; connection: BrowserConnection | null; pairing: PairingRequest | null } {
    return {
      status: this.status,
      connection: this.connection,
      pairing: this.pairingRequest,
    };
  }

  // -------------------------------------------------------------------------
  // WEB ACTIONS
  // -------------------------------------------------------------------------

  /**
   * Navigate to URL
   */
  async navigate(targetUrl: string): Promise<WebAction> {
    return this.createAction('navigate', targetUrl);
  }

  /**
   * Read page content
   */
  async readPage(targetUrl?: string): Promise<WebAction> {
    return this.createAction('read', targetUrl ?? 'current');
  }

  /**
   * Fill form field
   */
  async fillField(selector: string, value: string): Promise<WebAction> {
    return this.createAction('fill', selector, { value });
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<WebAction> {
    return this.createAction('click', selector);
  }

  /**
   * Download file
   */
  async download(fileUrl: string, filename?: string): Promise<WebAction> {
    return this.createAction('download', fileUrl, { filename });
  }

  /**
   * Take screenshot
   */
  async screenshot(): Promise<WebAction> {
    return this.createAction('screenshot', 'viewport');
  }

  /**
   * Get pending actions
   */
  getPendingActions(): WebAction[] {
    return Array.from(this.pendingActions.values());
  }

  /**
   * Get action history
   */
  getActionHistory(): WebAction[] {
    return [...this.actionHistory];
  }

  /**
   * Cancel pending action
   */
  cancelAction(actionId: string): boolean {
    const action = this.pendingActions.get(actionId);
    
    if (!action) {
      return false;
    }

    action.status = 'failed';
    action.error = 'Cancelled by user';
    action.completedAt = Date.now();
    
    this.pendingActions.delete(actionId);
    this.recordAction(action);
    this.emit('actionCancelled', action);

    return true;
  }

  // -------------------------------------------------------------------------
  // REQUEST HANDLING
  // -------------------------------------------------------------------------

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers for browser extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pairing-Code');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url ?? '', true);
    const pathname = parsedUrl.pathname;

    // Handle different endpoints
    switch (pathname) {
      case '/status':
        this.handleStatus(req, res);
        break;
      case '/pair':
        this.handlePair(req, res);
        break;
      case '/action':
        this.handleAction(req, res);
        break;
      case '/result':
        this.handleResult(req, res);
        break;
      case '/heartbeat':
        this.handleHeartbeat(req, res);
        break;
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: this.status,
      connected: this.status === 'connected',
      pendingActions: this.pendingActions.size,
    }));
  }

  private handlePair(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    let bodySize = 0;
    const MAX_BODY = 65536;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) { req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const pairingCode = data.code;

        if (!this.pairingRequest) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'No pairing in progress' }));
          return;
        }

        if (Date.now() > this.pairingRequest.expiresAt) {
          this.pairingRequest = null;
          this.status = 'disconnected';
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Pairing code expired' }));
          return;
        }

        if (pairingCode !== this.pairingRequest.code) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Invalid pairing code' }));
          return;
        }

        // Pairing successful
        this.connection = {
          id: `conn_${Date.now()}`,
          browserName: data.browserName ?? 'Unknown',
          browserVersion: data.browserVersion ?? 'Unknown',
          connectedAt: Date.now(),
          lastActivity: Date.now(),
          tabCount: data.tabCount ?? 1,
        };

        this.pairingRequest = null;
        this.status = 'connected';
        
        log.info(`[BrowserBridge] Paired with ${this.connection.browserName}`);
        this.emit('connected', this.connection);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, connectionId: this.connection.id }));

      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private handleAction(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.status !== 'connected') {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Not connected' }));
      return;
    }

    // Return pending actions for the browser to execute
    const actions = Array.from(this.pendingActions.values())
      .filter(a => a.status === 'pending')
      .map(a => {
        a.status = 'sent';
        return a;
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ actions }));
  }

  private handleResult(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (this.status !== 'connected') {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Not connected' }));
      return;
    }

    let body = '';
    let bodySize2 = 0;
    const MAX_BODY2 = 65536;
    req.on('data', chunk => {
      bodySize2 += chunk.length;
      if (bodySize2 > MAX_BODY2) { req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const action = this.pendingActions.get(data.actionId);

        if (!action) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Action not found' }));
          return;
        }

        action.status = data.success ? 'completed' : 'failed';
        action.result = data.result;
        action.error = data.error;
        action.completedAt = Date.now();

        this.pendingActions.delete(data.actionId);
        this.recordAction(action);
        this.emit('actionCompleted', action);

        if (this.connection) {
          this.connection.lastActivity = Date.now();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private handleHeartbeat(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.status === 'connected' && this.connection) {
      this.connection.lastActivity = Date.now();
      
      // Parse tab count from query
      const parsedUrl = url.parse(req.url ?? '', true);
      if (parsedUrl.query.tabCount) {
        this.connection.tabCount = parseInt(parsedUrl.query.tabCount as string, 10) || 1;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private async createAction(
    type: WebAction['type'],
    target: string,
    params?: Record<string, any>
  ): Promise<WebAction> {
    if (this.status !== 'connected') {
      const action: WebAction = {
        id: this.generateId(),
        type,
        target,
        params,
        status: 'failed',
        error: 'Browser not connected',
        createdAt: Date.now(),
        completedAt: Date.now(),
      };
      this.recordAction(action);
      return action;
    }

    const action: WebAction = {
      id: this.generateId(),
      type,
      target,
      params,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.pendingActions.set(action.id, action);
    this.emit('actionCreated', action);
    log.info(`[BrowserBridge] Created action: ${type} ${target}`);

    return action;
  }

  private generateId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private recordAction(action: WebAction): void {
    this.actionHistory.push(action);
    
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistorySize);
    }
  }
}

// Singleton export
export const browserBridge = new BrowserBridgeClass();
