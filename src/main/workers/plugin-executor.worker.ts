// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Plugin Executor Thread
// ==========================================================================
// All plugin code runs here, completely isolated from all other threads.
// No access to fs, net, http, child_process, electron, or any DEX db.
// Plugin handlers have a 50ms execution budget per event.
// ==========================================================================

import { parentPort } from 'worker_threads';
import * as vm from 'vm';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Forbidden module scanner
// ---------------------------------------------------------------------------
const FORBIDDEN_PATTERNS = [
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /require\s*\(\s*['"]net['"]\s*\)/,
  /require\s*\(\s*['"]http['"]\s*\)/,
  /require\s*\(\s*['"]https['"]\s*\)/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bimport\s*\(/,
  /\bglobalThis\b/,
  /\bprocess\b/,
  /require\s*\(\s*['"]os['"]\s*\)/,
  /require\s*\(\s*['"]path['"]\s*\)/,
  /require\s*\(\s*['"]crypto['"]\s*\)/,
  /require\s*\(\s*['"]vm['"]\s*\)/,
  /require\s*\(\s*['"]worker_threads['"]\s*\)/,
];

function scanForForbiddenPatterns(source: string): string | null {
  for (const pattern of FORBIDDEN_PATTERNS) {
    const match = source.match(pattern);
    if (match) {
      return `Forbidden pattern detected: ${match[0]}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------
interface PluginInstance {
  id: string;
  name: string;
  enabled: boolean;
  consecutiveFailures: number;
  handlers: Map<string, (payload: any) => any>;
}

const plugins = new Map<string, PluginInstance>();

function registerPlugin(id: string, name: string, source: string): { ok: boolean; error?: string } {
  const violation = scanForForbiddenPatterns(source);
  if (violation) {
    return { ok: false, error: `Plugin "${name}" rejected: ${violation}` };
  }

  const plugin: PluginInstance = {
    id,
    name,
    enabled: true,
    consecutiveFailures: 0,
    handlers: new Map(),
  };

  // Create a sandboxed scope for the plugin
  const api = {
    onEvent: (eventType: string, handler: (payload: any) => any) => {
      plugin.handlers.set(eventType, handler);
    },
    log: (message: string) => {
      parentPort?.postMessage({
        type: 'plugin-log',
        payload: { pluginId: id, message },
        requestId: '',
        timestamp: Date.now(),
      });
    },
    notify: (title: string, body: string) => {
      parentPort?.postMessage({
        type: 'plugin-notify',
        payload: { pluginId: id, title, body },
        requestId: '',
        timestamp: Date.now(),
      });
    },
    saveData: (key: string, value: any) => {
      parentPort?.postMessage({
        type: 'plugin-save-data',
        payload: { pluginId: id, key, value },
        requestId: '',
        timestamp: Date.now(),
      });
    },
    getData: (_key: string): any => {
      // Async data retrieval would need a round-trip; cached data is preferred
      return null;
    },
  };

  try {
    // Execute plugin source in a sandboxed VM context (avoids AV-flagged Function constructor)
    const sandbox = vm.createContext({
      api,
      // No access to require, process, global, etc.
    });
    // Compile source as a Script first to catch syntax errors before execution
    const script = new vm.Script(`(function(api) { ${source}\n})(api);`, {
      filename: `plugin-${id}.js`,
    });
    script.runInContext(sandbox, {
      timeout: 5000,
      displayErrors: true,
    });
    plugins.set(id, plugin);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Plugin "${name}" failed to initialize: ${err.message}` };
  }
}

function dispatchEvent(eventType: string, eventPayload: any): Array<{ pluginId: string; result: any; error?: string; durationMs: number }> {
  const results: Array<{ pluginId: string; result: any; error?: string; durationMs: number }> = [];

  for (const [id, plugin] of plugins) {
    if (!plugin.enabled) continue;
    const handler = plugin.handlers.get(eventType);
    if (!handler) continue;

    const start = performance.now();
    try {
      const result = handler(eventPayload);
      const duration = performance.now() - start;

      if (duration > 50) {
        plugin.consecutiveFailures++;
        results.push({ pluginId: id, result: null, error: `Exceeded 50ms budget (${duration.toFixed(1)}ms)`, durationMs: duration });
      } else {
        plugin.consecutiveFailures = 0;
        results.push({ pluginId: id, result, durationMs: duration });
      }
    } catch (err: any) {
      const duration = performance.now() - start;
      plugin.consecutiveFailures++;
      results.push({ pluginId: id, result: null, error: err.message, durationMs: duration });
    }

    // Auto-disable after 3 consecutive failures
    if (plugin.consecutiveFailures >= 3) {
      plugin.enabled = false;
      parentPort?.postMessage({
        type: 'plugin-auto-disabled',
        payload: {
          pluginId: id,
          pluginName: plugin.name,
          reason: 'Disabled due to 3 consecutive handler failures or budget overruns',
        },
        requestId: '',
        timestamp: Date.now(),
      });
    }
  }

  return results;
}

function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

parentPort?.on('message', (msg: ThreadMessage) => {
  try {
    switch (msg.type) {
      case 'register-plugin': {
        const { id, name, source } = msg.payload;
        const result = registerPlugin(id, name, source);
        respond(msg, result);
        break;
      }
      case 'unregister-plugin': {
        plugins.delete(msg.payload.id);
        respond(msg, { ok: true });
        break;
      }
      case 'dispatch-event': {
        const results = dispatchEvent(msg.payload.eventType, msg.payload.eventPayload);
        respond(msg, { results });
        break;
      }
      case 'enable-plugin': {
        const p = plugins.get(msg.payload.id);
        if (p) {
          p.enabled = true;
          p.consecutiveFailures = 0;
        }
        respond(msg, { ok: true });
        break;
      }
      case 'disable-plugin': {
        const p = plugins.get(msg.payload.id);
        if (p) p.enabled = false;
        respond(msg, { ok: true });
        break;
      }
      case 'get-status': {
        const status: Array<{ id: string; name: string; enabled: boolean; failures: number; handlerCount: number }> = [];
        for (const [, p] of plugins) {
          status.push({
            id: p.id,
            name: p.name,
            enabled: p.enabled,
            failures: p.consecutiveFailures,
            handlerCount: p.handlers.size,
          });
        }
        respond(msg, { plugins: status });
        break;
      }
      case '__heartbeat':
        respond(msg, { alive: true });
        break;
      case '__shutdown':
        plugins.clear();
        respond(msg, { ok: true });
        process.exit(0);
        break;
      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message);
  }
});
