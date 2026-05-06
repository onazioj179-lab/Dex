// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX API Server - REST API & Webhooks for External Integration
// Enables remote control, automation, and third-party integrations
// ===========================================================================

import log from 'electron-log';
import { ipcMain, BrowserWindow, app } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import Store from 'electron-store';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ApiConfig {
  enabled: boolean;
  port: number;
  host: string;
  apiKey: string;
  corsOrigins: string[];
  rateLimit: number;
  webhooksEnabled: boolean;
}

interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: number;
  lastTriggered?: number;
  failureCount: number;
  enabled: boolean;
}

interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

type RouteHandler = (req: ApiRequest) => Promise<ApiResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

// -----------------------------------------------------------------------------
// API Server
// -----------------------------------------------------------------------------

class DexApiServer {
  private server: http.Server | null = null;
  private routes: Route[] = [];
  private store: Store;
  private webhookStore: Store;
  private mainWindow: BrowserWindow | null = null;
  private requestCounts: Map<string, number[]> = new Map();

  constructor() {
    this.store = new Store({ name: 'dex-api-config' });
    this.webhookStore = new Store({ name: 'dex-webhooks' });
    this.registerRoutes();
  }

  // Get or create API configuration
  getConfig(): ApiConfig {
    return {
      enabled: this.store.get('enabled', false) as boolean,
      port: this.store.get('port', 45678) as number,
      host: this.store.get('host', '127.0.0.1') as string, // Always bind to localhost by default -- never expose to LAN
      apiKey: this.store.get('apiKey', this.generateApiKey()) as string,
      corsOrigins: this.store.get('corsOrigins', ['http://localhost:*']) as string[],
      rateLimit: this.store.get('rateLimit', 100) as number,
      webhooksEnabled: this.store.get('webhooksEnabled', true) as boolean,
    };
  }

  // Generate API key
  private generateApiKey(): string {
    const key = `dex_${crypto.randomBytes(32).toString('hex')}`;
    this.store.set('apiKey', key);
    return key;
  }

  // Register API routes
  private registerRoutes(): void {
    // Health check
    this.route('GET', '/api/v1/health', async () => ({
      status: 200,
      body: { status: 'ok', version: app.getVersion(), timestamp: Date.now() },
    }));

    // System status
    this.route('GET', '/api/v1/status', async () => ({
      status: 200,
      body: {
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: app.getVersion(),
      },
    }));

    // List workflows
    this.route('GET', '/api/v1/workflows', async () => {
      const workflowStore = new Store({ name: 'dex-workflows' });
      const workflows = workflowStore.get('workflows', []);
      return { status: 200, body: { workflows, count: (workflows as unknown[]).length } };
    });

    // Get workflow by ID
    this.route('GET', '/api/v1/workflows/:id', async (req) => {
      const workflowStore = new Store({ name: 'dex-workflows' });
      const workflows = workflowStore.get('workflows', []) as Array<{ id: string }>;
      const workflow = workflows.find(w => w.id === req.query.id);
      
      if (!workflow) {
        return { status: 404, body: { error: 'Workflow not found' } };
      }
      return { status: 200, body: workflow };
    });

    // Run workflow
    this.route('POST', '/api/v1/workflows/:id/run', async (req) => {
      const workflowStore = new Store({ name: 'dex-workflows' });
      const workflows = workflowStore.get('workflows', []) as Array<{ id: string; name: string }>;
      const workflow = workflows.find(w => w.id === req.query.id);
      
      if (!workflow) {
        return { status: 404, body: { error: 'Workflow not found' } };
      }

      const executionId = `api-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      
      // Emit to main process
      ipcMain.emit('api:run-workflow', null, {
        id: executionId,
        workflowId: workflow.id,
        options: req.body,
      });

      // Fire webhook
      this.triggerWebhook('workflow:started', {
        executionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        startedAt: Date.now(),
      });

      return {
        status: 202,
        body: {
          executionId,
          workflowId: workflow.id,
          status: 'started',
          message: `Workflow '${workflow.name}' started`,
        },
      };
    });

    // List operations
    this.route('GET', '/api/v1/operations', async () => {
      const operationStore = new Store({ name: 'dex-operations' });
      const operations = operationStore.get('operations', []);
      return { status: 200, body: { operations, count: (operations as unknown[]).length } };
    });

    // Run operation
    this.route('POST', '/api/v1/operations/:id/run', async (req) => {
      const operationStore = new Store({ name: 'dex-operations' });
      const operations = operationStore.get('operations', []) as Array<{ id: string; name: string }>;
      const operation = operations.find(o => o.id === req.query.id);
      
      if (!operation) {
        return { status: 404, body: { error: 'Operation not found' } };
      }

      const executionId = `api-op-${Date.now()}`;
      
      ipcMain.emit('api:run-operation', null, {
        id: executionId,
        operationId: operation.id,
      });

      return {
        status: 202,
        body: {
          executionId,
          operationId: operation.id,
          status: 'started',
        },
      };
    });

    // Execute action
    this.route('POST', '/api/v1/actions/execute', async (req) => {
      const body = req.body as { type?: string; config?: unknown };
      
      if (!body.type) {
        return { status: 400, body: { error: 'Action type is required' } };
      }

      const executionId = `api-action-${Date.now()}`;
      
      ipcMain.emit('api:execute-action', null, {
        id: executionId,
        type: body.type,
        config: body.config || {},
      });

      return {
        status: 202,
        body: { executionId, actionType: body.type, status: 'queued' },
      };
    });

    // Trigger scheduled task
    this.route('POST', '/api/v1/triggers/:id/fire', async (req) => {
      const schedulerStore = new Store({ name: 'dex-scheduler' });
      const triggers = schedulerStore.get('triggers', []) as Array<{ id: string; name: string }>;
      const trigger = triggers.find(t => t.id === req.query.id);
      
      if (!trigger) {
        return { status: 404, body: { error: 'Trigger not found' } };
      }

      ipcMain.emit('api:fire-trigger', null, { triggerId: trigger.id });

      return {
        status: 202,
        body: { triggerId: trigger.id, status: 'fired' },
      };
    });

    // Webhooks management
    this.route('GET', '/api/v1/webhooks', async () => {
      const subscriptions = this.webhookStore.get('subscriptions', []) as WebhookSubscription[];
      return {
        status: 200,
        body: {
          webhooks: subscriptions.map(s => ({
            id: s.id,
            url: s.url,
            events: s.events,
            enabled: s.enabled,
            lastTriggered: s.lastTriggered,
          })),
        },
      };
    });

    this.route('POST', '/api/v1/webhooks', async (req) => {
      const body = req.body as { url?: string; events?: string[] };
      
      if (!body.url || !body.events?.length) {
        return { status: 400, body: { error: 'url and events are required' } };
      }

      const subscription: WebhookSubscription = {
        id: crypto.randomBytes(8).toString('hex'),
        url: body.url,
        events: body.events,
        secret: crypto.randomBytes(32).toString('hex'),
        createdAt: Date.now(),
        failureCount: 0,
        enabled: true,
      };

      const subscriptions = this.webhookStore.get('subscriptions', []) as WebhookSubscription[];
      subscriptions.push(subscription);
      this.webhookStore.set('subscriptions', subscriptions);

      return {
        status: 201,
        body: {
          id: subscription.id,
          secret: subscription.secret,
          message: 'Webhook created. Save the secret for signature verification.',
        },
      };
    });

    this.route('DELETE', '/api/v1/webhooks/:id', async (req) => {
      const subscriptions = this.webhookStore.get('subscriptions', []) as WebhookSubscription[];
      const index = subscriptions.findIndex(s => s.id === req.query.id);
      
      if (index === -1) {
        return { status: 404, body: { error: 'Webhook not found' } };
      }

      subscriptions.splice(index, 1);
      this.webhookStore.set('subscriptions', subscriptions);

      return { status: 200, body: { message: 'Webhook deleted' } };
    });

    // Mode control
    this.route('GET', '/api/v1/modes/current', async () => {
      const modeStore = new Store({ name: 'dex-modes' });
      const currentMode = modeStore.get('current', 'normal');
      return { status: 200, body: { mode: currentMode } };
    });

    this.route('POST', '/api/v1/modes/:mode', async (req) => {
      const mode = req.query.mode;
      const validModes = ['normal', 'focus', 'dnd', 'eco', 'boost'];
      
      if (!validModes.includes(mode)) {
        return { status: 400, body: { error: `Invalid mode. Valid: ${validModes.join(', ')}` } };
      }

      ipcMain.emit('api:set-mode', null, { mode });
      
      return { status: 200, body: { mode, message: `Switched to ${mode} mode` } };
    });

    // Window control
    this.route('POST', '/api/v1/window/:action', async (req) => {
      const action = req.query.action;
      
      if (!this.mainWindow) {
        return { status: 500, body: { error: 'Window not available' } };
      }

      switch (action) {
        case 'show':
          this.mainWindow.show();
          break;
        case 'hide':
          this.mainWindow.hide();
          break;
        case 'minimize':
          this.mainWindow.minimize();
          break;
        case 'maximize':
          this.mainWindow.maximize();
          break;
        case 'focus':
          this.mainWindow.focus();
          break;
        default:
          return { status: 400, body: { error: 'Invalid action' } };
      }

      return { status: 200, body: { action, success: true } };
    });
  }

  // Add route
  private route(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  // Match route
  private matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      
      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        return { route, params };
      }
    }
    return null;
  }

  // Rate limiting
  private checkRateLimit(ip: string): boolean {
    const config = this.getConfig();
    const now = Date.now();
    const windowMs = 60000; // 1 minute window

    let timestamps = this.requestCounts.get(ip) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);
    
    if (timestamps.length >= config.rateLimit) {
      return false;
    }

    timestamps.push(now);
    this.requestCounts.set(ip, timestamps);

    // Periodic cleanup: prune stale IPs every 100 requests
    if (this.requestCounts.size > 1000) {
      for (const [storedIp, storedTimestamps] of this.requestCounts.entries()) {
        const recent = storedTimestamps.filter(t => now - t < windowMs);
        if (recent.length === 0) {
          this.requestCounts.delete(storedIp);
        }
      }
    }
    return true;
  }

  // Handle request
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const config = this.getConfig();
    
    // CORS headers -- restrict to configured origins
    const origin = req.headers.origin || '';
    const allowedOrigins = config.corsOrigins || ['http://localhost:*'];
    const isAllowed = allowedOrigins.some(pattern => {
      if (pattern === '*') return true;
      // Support wildcard port matching: http://localhost:*
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(origin);
    });
    if (isAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!this.checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }

    // API key authentication
    const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== config.apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid API key' }));
      return;
    }

    // Parse URL
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Match route
    const matched = this.matchRoute(req.method || 'GET', path);
    if (!matched) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse body
    let body: unknown = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await this.parseBody(req);
    }

    // Build request object
    const apiReq: ApiRequest = {
      method: req.method || 'GET',
      path,
      query: { ...query, ...matched.params },
      body,
      headers: req.headers as Record<string, string>,
    };

    try {
      const response = await matched.route.handler(apiReq);
      res.writeHead(response.status, {
        'Content-Type': 'application/json',
        ...response.headers,
      });
      res.end(JSON.stringify(response.body));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  // Parse request body
  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    const MAX_BODY_SIZE = 1_048_576; // 1MB
    return new Promise((resolve, reject) => {
      let data = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        data += chunk;
      });
      req.on('error', (err) => reject(err));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (error) {
          log.warn('[ApiServer] Failed to parse request body:', error);
          resolve({});
        }
      });
    });
  }

  // Trigger webhook
  async triggerWebhook(event: string, payload: unknown): Promise<void> {
    const config = this.getConfig();
    if (!config.webhooksEnabled) return;

    const subscriptions = this.webhookStore.get('subscriptions', []) as WebhookSubscription[];
    
    for (const sub of subscriptions) {
      if (!sub.enabled || !sub.events.includes(event)) continue;

      const webhookPayload = {
        event,
        timestamp: Date.now(),
        data: payload,
      };

      const signature = crypto
        .createHmac('sha256', sub.secret)
        .update(JSON.stringify(webhookPayload))
        .digest('hex');

      try {
        const url = new URL(sub.url);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const request = client.request(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Dex-Signature': `sha256=${signature}`,
            'X-Dex-Event': event,
          },
        });

        request.on('error', (err) => {
          log.warn(`[ApiServer] Webhook request error for ${sub.url}:`, err);
          sub.failureCount++;
        });
        request.write(JSON.stringify(webhookPayload));
        request.end();

        // Update last triggered
        sub.lastTriggered = Date.now();
        sub.failureCount = 0;
      } catch (error) {
        log.warn(`[ApiServer] Webhook delivery failed for ${sub.url}:`, error);
        sub.failureCount++;
        if (sub.failureCount >= 5) {
          log.warn(`[ApiServer] Disabling webhook ${sub.url} after 5 failures`);
          sub.enabled = false;
        }
      }
    }

    this.webhookStore.set('subscriptions', subscriptions);
  }

  // Start server
  start(mainWindow: BrowserWindow): void {
    const config = this.getConfig();
    if (!config.enabled) return;

    this.mainWindow = mainWindow;
    
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        log.error('[ApiServer] Request failed:', err);
        res.writeHead(500);
        res.end('Internal Server Error');
      });
    });

    this.server.listen(config.port, config.host, () => {
      if (!app.isPackaged) log.info(`Dex API server running at http://${config.host}:${config.port}`);
    });
  }

  // Stop server
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // Enable/disable API
  setEnabled(enabled: boolean): void {
    this.store.set('enabled', enabled);
    if (enabled && !this.server && this.mainWindow) {
      this.start(this.mainWindow);
    } else if (!enabled && this.server) {
      this.stop();
    }
  }

  // Get API key
  getApiKey(): string {
    return this.getConfig().apiKey;
  }

  // Regenerate API key
  regenerateApiKey(): string {
    const key = `dex_${crypto.randomBytes(32).toString('hex')}`;
    this.store.set('apiKey', key);
    return key;
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const apiServer = new DexApiServer();

export function initializeApiServer(mainWindow: BrowserWindow): void {
  // IPC handlers
  ipcMain.handle('api:get-config', () => apiServer.getConfig());
  ipcMain.handle('api:set-enabled', (_, enabled: boolean) => {
    apiServer.setEnabled(enabled);
    return apiServer.getConfig();
  });
  ipcMain.handle('api:get-key', () => apiServer.getApiKey());
  ipcMain.handle('api:regenerate-key', () => apiServer.regenerateApiKey());
  ipcMain.handle('api:trigger-webhook', (_, event: string, payload: unknown) => {
    return apiServer.triggerWebhook(event, payload);
  });

  // Start if enabled
  const config = apiServer.getConfig();
  if (config.enabled) {
    apiServer.start(mainWindow);
  }
}

export function shutdownApiServer(): void {
  apiServer.stop();
}
