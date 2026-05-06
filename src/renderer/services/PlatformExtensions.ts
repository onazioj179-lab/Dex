// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX Platform Extensions
 * ===========================================================================
 *
 * 7A. Portable Mode (detect + relocate data, USB-safe paths, self-check)
 * 7B. REST API Server (local HTTP server for external integrations)
 * 7C. CLI Interface (command processing, alias system, auto-complete)
 * 7D. Mobile Companion Spec (local network link, push sync, QR pair)
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// 7A. Portable Mode
// ---------------------------------------------------------------------------

export interface PortableModeState {
  enabled: boolean;
  dataPath: string;
  configPath: string;
  cachePath: string;
  usbDriveDetected: boolean;
  driveLetter: string;
  lastIntegrityCheck: number;
  integrityOk: boolean;
  sizeOnDisk: number; // bytes
}

interface PortableModeStore extends PortableModeState {
  detect: () => Promise<void>;
  enable: (targetPath: string) => Promise<void>;
  disable: () => Promise<void>;
  migrate: (newPath: string) => Promise<void>;
  runIntegrityCheck: () => Promise<boolean>;
  calculateSize: () => Promise<void>;
}

export const usePortableModeStore = create<PortableModeStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      dataPath: '',
      configPath: '',
      cachePath: '',
      usbDriveDetected: false,
      driveLetter: '',
      lastIntegrityCheck: 0,
      integrityOk: true,
      sizeOnDisk: 0,

      detect: async () => {
        try {
          const result = await (window as any).electron?.ipcRenderer?.invoke('portable:detect');
          if (result) {
            set({
              usbDriveDetected: result.usbDetected,
              driveLetter: result.driveLetter || '',
            });
          }
        } catch { /* silent */ }
      },

      enable: async (targetPath) => {
        try {
          await (window as any).electron?.ipcRenderer?.invoke('portable:enable', { targetPath });
          set({
            enabled: true,
            dataPath: targetPath + '/dex-data',
            configPath: targetPath + '/dex-config',
            cachePath: targetPath + '/dex-cache',
          });
        } catch { /* silent */ }
      },

      disable: async () => {
        try {
          await (window as any).electron?.ipcRenderer?.invoke('portable:disable');
          set({ enabled: false, dataPath: '', configPath: '', cachePath: '' });
        } catch { /* silent */ }
      },

      migrate: async (newPath) => {
        try {
          await (window as any).electron?.ipcRenderer?.invoke('portable:migrate', {
            from: get().dataPath,
            to: newPath,
          });
          set({
            dataPath: newPath + '/dex-data',
            configPath: newPath + '/dex-config',
            cachePath: newPath + '/dex-cache',
          });
        } catch { /* silent */ }
      },

      runIntegrityCheck: async () => {
        try {
          const ok = await (window as any).electron?.ipcRenderer?.invoke('portable:integrity-check', {
            dataPath: get().dataPath,
          });
          set({ lastIntegrityCheck: Date.now(), integrityOk: ok !== false });
          return ok !== false;
        } catch {
          set({ integrityOk: false });
          return false;
        }
      },

      calculateSize: async () => {
        try {
          const size = await (window as any).electron?.ipcRenderer?.invoke('portable:calculate-size', {
            dataPath: get().dataPath,
          });
          set({ sizeOnDisk: size || 0 });
        } catch { /* silent */ }
      },
    }),
    {
      name: 'dex-portable-mode',
      partialize: (s) => ({
        enabled: s.enabled,
        dataPath: s.dataPath,
        configPath: s.configPath,
        cachePath: s.cachePath,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// 7B. REST API Server
// ---------------------------------------------------------------------------

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: string;
  description: string;
  auth: boolean;
  rateLimit: number; // requests per minute
}

export interface APILog {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  status: number;
  duration: number; // ms
  ip: string;
}

interface RESTAPIStore {
  running: boolean;
  port: number;
  host: string;
  apiKey: string;
  corsEnabled: boolean;
  allowedOrigins: string[];
  logs: APILog[];
  maxLogs: number;
  endpoints: APIEndpoint[];
  requestCount: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setPort: (port: number) => void;
  regenerateKey: () => void;
  toggleCors: () => void;
  addAllowedOrigin: (origin: string) => void;
  removeAllowedOrigin: (origin: string) => void;
  clearLogs: () => void;
}

const API_ENDPOINTS: APIEndpoint[] = [
  { method: 'GET', path: '/api/v1/status', handler: 'getStatus', description: 'Get DEX system status', auth: false, rateLimit: 60 },
  { method: 'GET', path: '/api/v1/apps', handler: 'getApps', description: 'List running applications', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/apps/:name/launch', handler: 'launchApp', description: 'Launch an application', auth: true, rateLimit: 10 },
  { method: 'POST', path: '/api/v1/apps/:name/close', handler: 'closeApp', description: 'Close an application', auth: true, rateLimit: 10 },
  { method: 'GET', path: '/api/v1/notes', handler: 'getNotes', description: 'List all notes', auth: true, rateLimit: 30 },
  { method: 'GET', path: '/api/v1/notes/:id', handler: 'getNote', description: 'Get note content', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/notes', handler: 'createNote', description: 'Create a new note', auth: true, rateLimit: 20 },
  { method: 'PUT', path: '/api/v1/notes/:id', handler: 'updateNote', description: 'Update a note', auth: true, rateLimit: 20 },
  { method: 'DELETE', path: '/api/v1/notes/:id', handler: 'deleteNote', description: 'Delete a note', auth: true, rateLimit: 10 },
  { method: 'GET', path: '/api/v1/tasks', handler: 'getTasks', description: 'List all tasks', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/tasks', handler: 'createTask', description: 'Create a task', auth: true, rateLimit: 20 },
  { method: 'PATCH', path: '/api/v1/tasks/:id', handler: 'updateTask', description: 'Update a task', auth: true, rateLimit: 20 },
  { method: 'GET', path: '/api/v1/calendar', handler: 'getEvents', description: 'List calendar events', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/calendar', handler: 'createEvent', description: 'Create calendar event', auth: true, rateLimit: 20 },
  { method: 'GET', path: '/api/v1/files', handler: 'getFiles', description: 'List files', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/files/upload', handler: 'uploadFile', description: 'Upload a file', auth: true, rateLimit: 10 },
  { method: 'GET', path: '/api/v1/system/health', handler: 'getHealth', description: 'System health check', auth: false, rateLimit: 60 },
  { method: 'GET', path: '/api/v1/system/metrics', handler: 'getMetrics', description: 'System metrics', auth: true, rateLimit: 30 },
  { method: 'POST', path: '/api/v1/automation/run', handler: 'runAutomation', description: 'Execute automation workflow', auth: true, rateLimit: 5 },
  { method: 'GET', path: '/api/v1/search', handler: 'globalSearch', description: 'Global content search', auth: true, rateLimit: 20 },
];

function generateAPIKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'dex_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export const useRESTAPIStore = create<RESTAPIStore>()(
  persist(
    (set, get) => ({
      running: false,
      port: 9847,
      host: '127.0.0.1',
      apiKey: generateAPIKey(),
      corsEnabled: false,
      allowedOrigins: ['http://localhost:3000'],
      logs: [],
      maxLogs: 500,
      endpoints: API_ENDPOINTS,
      requestCount: 0,

      start: async () => {
        try {
          const { port, host, apiKey, corsEnabled, allowedOrigins } = get();
          await (window as any).electron?.ipcRenderer?.invoke('api:start', {
            port, host, apiKey, corsEnabled, allowedOrigins,
            endpoints: API_ENDPOINTS,
          });
          set({ running: true });
        } catch { /* silent */ }
      },

      stop: async () => {
        try {
          await (window as any).electron?.ipcRenderer?.invoke('api:stop');
          set({ running: false });
        } catch { /* silent */ }
      },

      setPort: (port) => set({ port }),
      regenerateKey: () => set({ apiKey: generateAPIKey() }),
      toggleCors: () => set(s => ({ corsEnabled: !s.corsEnabled })),

      addAllowedOrigin: (origin) => set(s => ({
        allowedOrigins: [...s.allowedOrigins.filter(o => o !== origin), origin],
      })),

      removeAllowedOrigin: (origin) => set(s => ({
        allowedOrigins: s.allowedOrigins.filter(o => o !== origin),
      })),

      clearLogs: () => set({ logs: [], requestCount: 0 }),
    }),
    {
      name: 'dex-rest-api',
      partialize: (s) => ({
        port: s.port,
        host: s.host,
        apiKey: s.apiKey,
        corsEnabled: s.corsEnabled,
        allowedOrigins: s.allowedOrigins,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// 7C. CLI Interface
// ---------------------------------------------------------------------------

export interface CLICommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  args: { name: string; required: boolean; description: string }[];
  flags: { name: string; short: string; description: string; type: 'boolean' | 'string' | 'number' }[];
}

export interface CLIHistoryEntry {
  input: string;
  output: string;
  timestamp: number;
  exitCode: number;
}

interface CLIStore {
  history: CLIHistoryEntry[];
  aliases: Record<string, string>;
  currentInput: string;
  historyIndex: number;
  commands: CLICommand[];
  setInput: (input: string) => void;
  execute: (input: string) => void;
  addAlias: (alias: string, command: string) => void;
  removeAlias: (alias: string) => void;
  clearHistory: () => void;
  navigateHistory: (direction: 'up' | 'down') => void;
  getCompletions: (partial: string) => string[];
}

const CLI_COMMANDS: CLICommand[] = [
  {
    name: 'open', aliases: ['o', 'launch'],
    description: 'Open an application',
    usage: 'open <app-name>',
    args: [{ name: 'app', required: true, description: 'Application name' }],
    flags: [{ name: 'split', short: 's', description: 'Open in split view', type: 'boolean' }],
  },
  {
    name: 'close', aliases: ['q', 'quit'],
    description: 'Close an application',
    usage: 'close <app-name>',
    args: [{ name: 'app', required: true, description: 'Application name' }],
    flags: [],
  },
  {
    name: 'note', aliases: ['n'],
    description: 'Create or search notes',
    usage: 'note [create|search|list] [text]',
    args: [{ name: 'action', required: false, description: 'Action: create, search, list' }],
    flags: [
      { name: 'tag', short: 't', description: 'Tag for the note', type: 'string' },
      { name: 'folder', short: 'f', description: 'Target folder', type: 'string' },
    ],
  },
  {
    name: 'task', aliases: ['t'],
    description: 'Manage tasks',
    usage: 'task [add|done|list|move] [text]',
    args: [{ name: 'action', required: false, description: 'Action: add, done, list, move' }],
    flags: [
      { name: 'board', short: 'b', description: 'Kanban board name', type: 'string' },
      { name: 'priority', short: 'p', description: 'Priority level', type: 'string' },
    ],
  },
  {
    name: 'search', aliases: ['s', 'find'],
    description: 'Global search across all content',
    usage: 'search <query>',
    args: [{ name: 'query', required: true, description: 'Search query' }],
    flags: [
      { name: 'type', short: 't', description: 'Filter by type: note, task, file, event', type: 'string' },
      { name: 'limit', short: 'l', description: 'Max results', type: 'number' },
    ],
  },
  {
    name: 'file', aliases: ['f', 'fs'],
    description: 'File operations',
    usage: 'file [list|info|open] [path]',
    args: [{ name: 'action', required: false, description: 'Action: list, info, open' }],
    flags: [
      { name: 'recursive', short: 'r', description: 'Recursive listing', type: 'boolean' },
    ],
  },
  {
    name: 'system', aliases: ['sys'],
    description: 'System information and controls',
    usage: 'system [status|health|restart]',
    args: [{ name: 'action', required: false, description: 'Action: status, health, restart' }],
    flags: [],
  },
  {
    name: 'theme', aliases: [],
    description: 'Switch or list themes',
    usage: 'theme [name|list]',
    args: [{ name: 'theme', required: false, description: 'Theme name or "list"' }],
    flags: [],
  },
  {
    name: 'focus', aliases: [],
    description: 'Start or stop focus session',
    usage: 'focus [start|stop] [duration]',
    args: [
      { name: 'action', required: false, description: 'start or stop' },
      { name: 'minutes', required: false, description: 'Duration in minutes' },
    ],
    flags: [{ name: 'goal', short: 'g', description: 'Focus goal description', type: 'string' }],
  },
  {
    name: 'automation', aliases: ['auto', 'macro'],
    description: 'Run automation workflow',
    usage: 'automation <workflow-name>',
    args: [{ name: 'workflow', required: true, description: 'Workflow name' }],
    flags: [{ name: 'dry-run', short: 'd', description: 'Preview without executing', type: 'boolean' }],
  },
  {
    name: 'export', aliases: [],
    description: 'Export data',
    usage: 'export <type> [path]',
    args: [
      { name: 'type', required: true, description: 'Type: notes, tasks, calendar, all' },
      { name: 'path', required: false, description: 'Output file path' },
    ],
    flags: [{ name: 'format', short: 'f', description: 'Format: json, csv, md', type: 'string' }],
  },
  {
    name: 'help', aliases: ['h', '?'],
    description: 'Show help for commands',
    usage: 'help [command]',
    args: [{ name: 'command', required: false, description: 'Command name' }],
    flags: [],
  },
  {
    name: 'clear', aliases: ['cls'],
    description: 'Clear terminal history',
    usage: 'clear',
    args: [],
    flags: [],
  },
  {
    name: 'alias', aliases: [],
    description: 'Create or list command aliases',
    usage: 'alias [name=command]',
    args: [{ name: 'definition', required: false, description: 'alias=command' }],
    flags: [],
  },
];

function parseCLIInput(raw: string): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const tokens = raw.trim().split(/\s+/);
  const command = tokens[0] || '';
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const eqIdx = t.indexOf('=');
      if (eqIdx !== -1) {
        flags[t.slice(2, eqIdx)] = t.slice(eqIdx + 1);
      } else {
        flags[t.slice(2)] = true;
      }
    } else if (t.startsWith('-') && t.length === 2) {
      // Short flag
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        flags[t.slice(1)] = next;
        i++;
      } else {
        flags[t.slice(1)] = true;
      }
    } else {
      args.push(t);
    }
  }

  return { command, args, flags };
}

export const useCLIStore = create<CLIStore>()(
  persist(
    (set, get) => ({
      history: [],
      aliases: {},
      currentInput: '',
      historyIndex: -1,
      commands: CLI_COMMANDS,

      setInput: (input) => set({ currentInput: input, historyIndex: -1 }),

      execute: (input) => {
        const raw = input.trim();
        if (!raw) return;

        // Resolve alias
        const firstWord = raw.split(/\s+/)[0];
        const aliasTarget = get().aliases[firstWord];
        const resolved = aliasTarget ? raw.replace(firstWord, aliasTarget) : raw;

        const parsed = parseCLIInput(resolved);

        // Find command
        const cmd = CLI_COMMANDS.find(c =>
          c.name === parsed.command || c.aliases.includes(parsed.command)
        );

        let output = '';
        let exitCode = 0;

        if (parsed.command === 'clear') {
          set({ history: [], currentInput: '' });
          return;
        }

        if (parsed.command === 'help') {
          if (parsed.args[0]) {
            const target = CLI_COMMANDS.find(c => c.name === parsed.args[0] || c.aliases.includes(parsed.args[0]));
            if (target) {
              output = `${target.name} - ${target.description}\nUsage: ${target.usage}`;
              if (target.aliases.length > 0) output += `\nAliases: ${target.aliases.join(', ')}`;
              if (target.args.length > 0) output += '\nArgs:\n' + target.args.map(a => `  ${a.name}${a.required ? ' (required)' : ''} - ${a.description}`).join('\n');
              if (target.flags.length > 0) output += '\nFlags:\n' + target.flags.map(f => `  --${f.name}${f.short ? ` (-${f.short})` : ''} - ${f.description}`).join('\n');
            } else {
              output = `Unknown command: ${parsed.args[0]}`;
              exitCode = 1;
            }
          } else {
            output = 'Available commands:\n' + CLI_COMMANDS.map(c => `  ${c.name.padEnd(12)} ${c.description}`).join('\n');
          }
        } else if (parsed.command === 'alias') {
          if (parsed.args[0]?.includes('=')) {
            const [alias, ...rest] = parsed.args[0].split('=');
            const aliasCmd = rest.join('=');
            get().addAlias(alias, aliasCmd);
            output = `Alias created: ${alias} -> ${aliasCmd}`;
          } else {
            const aliases = get().aliases;
            const entries = Object.entries(aliases);
            output = entries.length > 0
              ? entries.map(([k, v]) => `  ${k} -> ${v}`).join('\n')
              : 'No aliases defined.';
          }
        } else if (cmd) {
          // Route to IPC
          try {
            (window as any).electron?.ipcRenderer?.invoke('cli:execute', {
              command: cmd.name,
              args: parsed.args,
              flags: parsed.flags,
            });
            output = `Executing: ${cmd.name} ${parsed.args.join(' ')}`;
          } catch (e) {
            output = `Error: ${e instanceof Error ? e.message : String(e)}`;
            exitCode = 1;
          }
        } else {
          output = `Unknown command: ${parsed.command}. Type "help" for available commands.`;
          exitCode = 1;
        }

        const entry: CLIHistoryEntry = {
          input: raw,
          output,
          timestamp: Date.now(),
          exitCode,
        };

        set(s => ({
          history: [...s.history.slice(-499), entry],
          currentInput: '',
          historyIndex: -1,
        }));
      },

      addAlias: (alias, command) => set(s => ({
        aliases: { ...s.aliases, [alias]: command },
      })),

      removeAlias: (alias) => set(s => {
        const aliases = { ...s.aliases };
        delete aliases[alias];
        return { aliases };
      }),

      clearHistory: () => set({ history: [] }),

      navigateHistory: (direction) => set(s => {
        const len = s.history.length;
        if (len === 0) return s;
        let newIdx = s.historyIndex;
        if (direction === 'up') {
          newIdx = newIdx === -1 ? len - 1 : Math.max(0, newIdx - 1);
        } else {
          newIdx = newIdx >= len - 1 ? -1 : newIdx + 1;
        }
        return {
          historyIndex: newIdx,
          currentInput: newIdx === -1 ? '' : s.history[newIdx].input,
        };
      }),

      getCompletions: (partial) => {
        const completions: string[] = [];
        const lower = partial.toLowerCase();
        for (const cmd of CLI_COMMANDS) {
          if (cmd.name.startsWith(lower)) completions.push(cmd.name);
          for (const alias of cmd.aliases) {
            if (alias.startsWith(lower)) completions.push(alias);
          }
        }
        for (const alias of Object.keys(get().aliases)) {
          if (alias.startsWith(lower)) completions.push(alias);
        }
        return completions;
      },
    }),
    {
      name: 'dex-cli',
      partialize: (s) => ({
        aliases: s.aliases,
        history: s.history.slice(-100),
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// 7D. Mobile Companion Spec
// ---------------------------------------------------------------------------

export interface PairedDevice {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  lastSeen: number;
  paired: boolean;
  pushEnabled: boolean;
  syncNotes: boolean;
  syncTasks: boolean;
  syncCalendar: boolean;
  syncFiles: boolean;
}

interface MobileCompanionStore {
  devices: PairedDevice[];
  discoveryActive: boolean;
  pairCode: string;
  serverPort: number;
  encryptionEnabled: boolean;
  syncInterval: number; // seconds
  startDiscovery: () => void;
  stopDiscovery: () => void;
  generatePairCode: () => void;
  pairDevice: (deviceId: string, name: string, platform: PairedDevice['platform']) => void;
  unpairDevice: (deviceId: string) => void;
  updateDeviceSync: (deviceId: string, partial: Partial<PairedDevice>) => void;
  pushToDevice: (deviceId: string, payload: { type: string; data: unknown }) => void;
  syncNow: (deviceId: string) => void;
}

function generatePairCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

export const useMobileCompanionStore = create<MobileCompanionStore>()(
  persist(
    (set, get) => ({
      devices: [],
      discoveryActive: false,
      pairCode: generatePairCode(),
      serverPort: 9848,
      encryptionEnabled: true,
      syncInterval: 30,

      startDiscovery: () => {
        set({ discoveryActive: true });
        try {
          (window as any).electron?.ipcRenderer?.invoke('companion:start-discovery', {
            port: get().serverPort,
            pairCode: get().pairCode,
          });
        } catch { /* silent */ }
      },

      stopDiscovery: () => {
        set({ discoveryActive: false });
        try {
          (window as any).electron?.ipcRenderer?.invoke('companion:stop-discovery');
        } catch { /* silent */ }
      },

      generatePairCode: () => set({ pairCode: generatePairCode() }),

      pairDevice: (deviceId, name, platform) => set(s => ({
        devices: [...s.devices, {
          id: deviceId,
          name,
          platform,
          lastSeen: Date.now(),
          paired: true,
          pushEnabled: true,
          syncNotes: true,
          syncTasks: true,
          syncCalendar: true,
          syncFiles: false,
        }],
      })),

      unpairDevice: (deviceId) => {
        try {
          (window as any).electron?.ipcRenderer?.invoke('companion:unpair', { deviceId });
        } catch { /* silent */ }
        set(s => ({
          devices: s.devices.filter(d => d.id !== deviceId),
        }));
      },

      updateDeviceSync: (deviceId, partial) => set(s => ({
        devices: s.devices.map(d =>
          d.id === deviceId ? { ...d, ...partial } : d
        ),
      })),

      pushToDevice: (deviceId, payload) => {
        try {
          (window as any).electron?.ipcRenderer?.invoke('companion:push', { deviceId, payload });
        } catch { /* silent */ }
      },

      syncNow: (deviceId) => {
        try {
          const device = get().devices.find(d => d.id === deviceId);
          if (!device) return;
          (window as any).electron?.ipcRenderer?.invoke('companion:sync', {
            deviceId,
            syncNotes: device.syncNotes,
            syncTasks: device.syncTasks,
            syncCalendar: device.syncCalendar,
            syncFiles: device.syncFiles,
          });
        } catch { /* silent */ }
      },
    }),
    {
      name: 'dex-mobile-companion',
      partialize: (s) => ({
        devices: s.devices,
        serverPort: s.serverPort,
        encryptionEnabled: s.encryptionEnabled,
        syncInterval: s.syncInterval,
      }),
    }
  )
);
