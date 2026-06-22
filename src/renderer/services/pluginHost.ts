// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Local Extension Host.
 *
 * A REAL, working local lifecycle for plugins/extensions: install from a
 * manifest, enable/disable/remove, persist to localStorage, and gate every
 * capability through the renderer permission store + the shared capability
 * ledger. There is NO remote marketplace here — this is the local extension
 * host only; fetching/installing extensions over the network is a separate,
 * later task.
 *
 * Sandboxing model:
 *  - A plugin only touches the outside world through the shared EventBus.
 *  - When enabled, a plugin is attached and may emit/subscribe ONLY on the
 *    channels its GRANTED capabilities allow-list. Emitting on a denied or
 *    unknown channel is dropped (and logged).
 *  - A disabled/removed plugin is fully detached from the bus and cannot emit.
 *  - Capability grants are mapped onto the existing DEX permission store
 *    (microphone/camera/network/notifications/...) so the user controls them
 *    through the Permission Center, exactly like every other app.
 */

import { EventBus } from '../../shared/plugin/eventBus';
import {
  validateManifest,
  createCapabilityLedger,
  grantCapability,
  revokeCapability,
  hasCapability,
  type PluginManifest,
  type PluginCapability,
  type CapabilityLedger,
} from '../../shared/plugin/manifest';
import {
  usePermissionStore,
  checkPermissionAccess,
  type PermissionId,
} from '../store/permissionStore';

// ---------------------------------------------------------------------------
// Persisted record + runtime state
// ---------------------------------------------------------------------------
const STORE_KEY = 'dex-extensions-v1';

export interface ExtensionRecord {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
  /** True for the bundled example extensions (cannot be removed). */
  builtin?: boolean;
}

/**
 * The event map every DEX plugin shares. Channels are coarse — a plugin may
 * only use the channels its granted capabilities allow (see CAPABILITY_CHANNELS).
 */
export interface DexPluginEventMap {
  'clipboard:read': { text: string };
  'clipboard:write': { text: string };
  'storage:get': { key: string };
  'storage:set': { key: string; value: unknown };
  'net:request': { url: string; method?: string };
  'notify:show': { title: string; message?: string };
  'host:tick': { at: number };
  [key: string]: unknown;
}

export type DexChannel = keyof DexPluginEventMap & string;

// Which bus channels a given capability unlocks (the per-plugin allow-list).
const CAPABILITY_CHANNELS: Record<PluginCapability, DexChannel[]> = {
  'fs:read': [],
  'fs:write': [],
  'net:fetch': ['net:request'],
  ipc: [],
  'shell:exec': [],
  clipboard: ['clipboard:read', 'clipboard:write'],
  notifications: ['notify:show'],
  storage: ['storage:get', 'storage:set'],
};

// Map a plugin capability onto the DEX permission-store toggle that governs it.
// Capabilities without a hardware-style permission (storage, ipc, fs) are
// governed purely by the capability ledger + enable state.
const CAPABILITY_PERMISSION: Partial<Record<PluginCapability, PermissionId>> = {
  'net:fetch': 'network',
  notifications: 'notifications',
};

/** A tiny plugin handler. Real built-ins use this; installed manifests may
 *  register one too via registerHandler before/after install. */
export interface PluginHandler {
  /** Called once when the plugin is enabled & attached. Return a cleanup fn. */
  onEnable?: (ctx: PluginContext) => void | (() => void);
}

/** The sandboxed surface handed to a plugin handler. */
export interface PluginContext {
  id: string;
  /** Emit on a channel. Dropped (returns false) if denied or detached. */
  emit: <K extends DexChannel>(channel: K, payload: DexPluginEventMap[K]) => boolean;
  /** Subscribe to a channel. Returns an unsubscribe fn (noop if denied). */
  on: <K extends DexChannel>(
    channel: K,
    handler: (payload: DexPluginEventMap[K]) => void,
  ) => () => void;
  /** The channels this plugin is currently allowed to use. */
  allowed: () => DexChannel[];
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
const bus = new EventBus<DexPluginEventMap>();
let ledger: CapabilityLedger = createCapabilityLedger();
let records: ExtensionRecord[] = [];
const handlers = new Map<string, PluginHandler>();
const cleanups = new Map<string, Array<() => void>>();
const subscribers = new Set<() => void>();
let initialized = false;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function persist(): void {
  try {
    // Built-ins are reconstructed at boot, so persist only their enabled flag
    // alongside installed extensions.
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch (e) {
    console.warn('[pluginHost] persist failed:', e);
  }
}

function loadPersisted(): ExtensionRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ExtensionRecord =>
        !!r && typeof r === 'object' && !!r.manifest && typeof r.manifest.id === 'string',
    );
  } catch (e) {
    console.warn('[pluginHost] load failed:', e);
    return [];
  }
}

function notifySubscribers(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch (e) {
      console.warn('[pluginHost] subscriber error:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// Capability / permission gating
// ---------------------------------------------------------------------------

/** Rebuild the ledger so it reflects exactly the capabilities a record declares. */
function syncLedger(rec: ExtensionRecord): void {
  // Drop every existing grant for this plugin, then re-grant declared caps.
  for (const cap of allCapabilities()) {
    if (hasCapability(ledger, rec.manifest.id, cap)) {
      ledger = revokeCapability(ledger, rec.manifest.id, cap);
    }
  }
  for (const cap of rec.manifest.capabilities) {
    ledger = grantCapability(ledger, { pluginId: rec.manifest.id, capability: cap });
  }
}

function dropLedger(pluginId: string): void {
  for (const cap of allCapabilities()) {
    if (hasCapability(ledger, pluginId, cap)) {
      ledger = revokeCapability(ledger, pluginId, cap);
    }
  }
}

function allCapabilities(): PluginCapability[] {
  return Object.keys(CAPABILITY_CHANNELS) as PluginCapability[];
}

/**
 * The channels a plugin may currently use: union of channels for every
 * capability that is (a) in the ledger and (b) — when it maps to a DEX
 * permission — actually granted in the permission store.
 */
function allowedChannelsFor(pluginId: string): Set<DexChannel> {
  const rec = get(pluginId);
  const out = new Set<DexChannel>();
  if (!rec || !rec.enabled) return out;
  for (const cap of rec.manifest.capabilities) {
    if (!hasCapability(ledger, pluginId, cap)) continue;
    const permId = CAPABILITY_PERMISSION[cap];
    if (permId) {
      // Logs the attempt + honours the user's toggle in the Permission Center.
      if (!checkPermissionAccess(permId, `ext:${pluginId}`)) continue;
    }
    for (const ch of CAPABILITY_CHANNELS[cap]) out.add(ch);
  }
  return out;
}

/** Public: is a plugin allowed to use a given channel right now? */
export function canUseChannel(pluginId: string, channel: DexChannel): boolean {
  return allowedChannelsFor(pluginId).has(channel);
}

// ---------------------------------------------------------------------------
// Sandboxed runtime
// ---------------------------------------------------------------------------
function makeContext(pluginId: string): PluginContext {
  return {
    id: pluginId,
    allowed: () => Array.from(allowedChannelsFor(pluginId)),
    emit: (channel, payload) => {
      // Enforce: disabled/denied plugin cannot emit.
      if (!allowedChannelsFor(pluginId).has(channel)) {
        console.warn(`[pluginHost] blocked emit "${channel}" from ${pluginId} (no grant)`);
        return false;
      }
      bus.emit(channel, payload);
      return true;
    },
    on: (channel, handler) => {
      if (!allowedChannelsFor(pluginId).has(channel)) {
        console.warn(`[pluginHost] blocked subscribe "${channel}" from ${pluginId} (no grant)`);
        return () => {};
      }
      return bus.on(pluginId, channel, handler as (p: unknown) => void);
    },
  };
}

function attach(rec: ExtensionRecord): void {
  if (!rec.enabled) return;
  detach(rec.manifest.id); // idempotent
  syncLedger(rec);
  const handler = handlers.get(rec.manifest.id);
  const list: Array<() => void> = [];
  if (handler?.onEnable) {
    try {
      const ret = handler.onEnable(makeContext(rec.manifest.id));
      if (typeof ret === 'function') list.push(ret);
    } catch (e) {
      console.warn(`[pluginHost] onEnable error for ${rec.manifest.id}:`, e);
    }
  }
  cleanups.set(rec.manifest.id, list);
}

function detach(pluginId: string): void {
  const list = cleanups.get(pluginId);
  if (list) {
    for (const fn of list) {
      try {
        fn();
      } catch (e) {
        console.warn(`[pluginHost] cleanup error for ${pluginId}:`, e);
      }
    }
    cleanups.delete(pluginId);
  }
  // Detaching from the bus removes every listener this plugin registered.
  bus.detachPlugin(pluginId);
}

// ---------------------------------------------------------------------------
// Public lifecycle API
// ---------------------------------------------------------------------------

export interface InstallResult {
  ok: boolean;
  problems?: string[];
  record?: ExtensionRecord;
}

/**
 * Install an extension from a manifest (object or JSON string). Validates via
 * the shared manifest validator, stores the record (default DISABLED), and
 * requests the DEX permissions its capabilities map to.
 */
export function installFromManifest(json: string | Record<string, unknown>): InstallResult {
  ensureInit();
  let raw: Record<string, unknown>;
  if (typeof json === 'string') {
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, problems: ['manifest is not valid JSON'] };
    }
  } else {
    raw = json || {};
  }

  const check = validateManifest(raw as Partial<PluginManifest>);
  if (!check.ok) return { ok: false, problems: check.problems };

  const manifest = raw as unknown as PluginManifest;

  // Replace if already present (reinstall/upgrade), preserving builtin flag.
  const existing = records.find((r) => r.manifest.id === manifest.id);
  if (existing?.builtin) {
    return { ok: false, problems: ['a built-in extension already uses this id'] };
  }
  const now = Date.now();
  const record: ExtensionRecord = {
    manifest,
    enabled: false, // default disabled
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  };
  records = [...records.filter((r) => r.manifest.id !== manifest.id), record];
  syncLedger(record);
  persist();

  // Request the permissions its declared capabilities need (user-grantable in
  // the Permission Center). We only request, we never silently grant.
  requestDeclaredPermissions(manifest);

  notifySubscribers();
  return { ok: true, record };
}

/** Ask the permission store to surface the toggles this manifest needs. */
export function requestDeclaredPermissions(manifest: PluginManifest): PermissionId[] {
  const requested = new Set<PermissionId>();
  for (const cap of manifest.capabilities) {
    const permId = CAPABILITY_PERMISSION[cap];
    if (permId) requested.add(permId);
  }
  // We do NOT auto-enable; the user grants in the Permission Center. We simply
  // surface the request so the UI can prompt. (No-op on the store itself.)
  return Array.from(requested);
}

/** Grant a capability's underlying DEX permission for this plugin (user action). */
export function grantPermission(pluginId: string): PermissionId[] {
  const rec = get(pluginId);
  if (!rec) return [];
  const granted: PermissionId[] = [];
  const setPermission = usePermissionStore.getState().setPermission;
  for (const cap of rec.manifest.capabilities) {
    const permId = CAPABILITY_PERMISSION[cap];
    if (permId) {
      setPermission(permId, true);
      granted.push(permId);
    }
  }
  notifySubscribers();
  return granted;
}

export function list(): ExtensionRecord[] {
  ensureInit();
  return records.map((r) => ({ ...r }));
}

export function get(id: string): ExtensionRecord | undefined {
  const r = records.find((x) => x.manifest.id === id);
  return r ? { ...r } : undefined;
}

export function enable(id: string): boolean {
  ensureInit();
  const idx = records.findIndex((r) => r.manifest.id === id);
  if (idx === -1) return false;
  records[idx] = { ...records[idx], enabled: true, updatedAt: Date.now() };
  attach(records[idx]);
  persist();
  notifySubscribers();
  return true;
}

export function disable(id: string): boolean {
  ensureInit();
  const idx = records.findIndex((r) => r.manifest.id === id);
  if (idx === -1) return false;
  records[idx] = { ...records[idx], enabled: false, updatedAt: Date.now() };
  detach(id); // fully sandboxed off — cannot emit anymore
  persist();
  notifySubscribers();
  return true;
}

export function remove(id: string): boolean {
  ensureInit();
  const rec = records.find((r) => r.manifest.id === id);
  if (!rec) return false;
  if (rec.builtin) return false; // built-ins can be disabled but not removed
  detach(id);
  dropLedger(id);
  handlers.delete(id);
  records = records.filter((r) => r.manifest.id !== id);
  persist();
  notifySubscribers();
  return true;
}

/** Permissions a record's capabilities map to (for UI summary). */
export function permissionsFor(id: string): PermissionId[] {
  const rec = get(id);
  if (!rec) return [];
  const out = new Set<PermissionId>();
  for (const cap of rec.manifest.capabilities) {
    const p = CAPABILITY_PERMISSION[cap];
    if (p) out.add(p);
  }
  return Array.from(out);
}

/** Register a runtime handler for a plugin id (used by built-ins). */
export function registerHandler(id: string, handler: PluginHandler): void {
  handlers.set(id, handler);
  const rec = get(id);
  if (rec?.enabled) attach(rec);
}

/** Subscribe to host state changes (for the manager UI). Returns unsubscribe. */
export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Direct host access to the bus (for host-side UI features / built-ins). */
export function onBus<K extends DexChannel>(
  channel: K,
  handler: (payload: DexPluginEventMap[K]) => void,
): () => void {
  return bus.on('__host__', channel, handler as (p: unknown) => void);
}

// ---------------------------------------------------------------------------
// Built-in example extensions (real manifests + tiny handlers)
// ---------------------------------------------------------------------------
const BUILTIN_MANIFESTS: PluginManifest[] = [
  {
    id: 'dex.builtin.wordcount',
    name: 'Word Count Badge',
    version: '1.0.0',
    author: 'DEX',
    dexVersion: '6.0.0',
    entryPoint: 'builtin/wordcount',
    capabilities: ['clipboard', 'notifications'],
    description:
      'Counts words on the clipboard and surfaces the total. Listens on clipboard:write, emits notify:show.',
  },
  {
    id: 'dex.builtin.clipboardcleaner',
    name: 'Clipboard Cleaner',
    version: '1.0.0',
    author: 'DEX',
    dexVersion: '6.0.0',
    entryPoint: 'builtin/clipcleaner',
    capabilities: ['clipboard'],
    description:
      'Trims tracking params and collapses whitespace on copied text, re-emitting the cleaned value on clipboard:write.',
  },
  {
    id: 'dex.builtin.heartbeat',
    name: 'Storage Heartbeat',
    version: '1.0.0',
    author: 'DEX',
    dexVersion: '6.0.0',
    entryPoint: 'builtin/heartbeat',
    capabilities: ['storage'],
    description:
      'Records the last host tick into plugin storage. Subscribes to host:tick, emits storage:set. Needs no hardware permission.',
  },
];

const BUILTIN_HANDLERS: Record<string, PluginHandler> = {
  'dex.builtin.wordcount': {
    onEnable: (ctx) => {
      return ctx.on('clipboard:write', ({ text }) => {
        const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
        ctx.emit('notify:show', {
          title: 'Word Count',
          message: `${words} word${words === 1 ? '' : 's'} on clipboard`,
        });
      });
    },
  },
  'dex.builtin.clipboardcleaner': {
    onEnable: (ctx) => {
      return ctx.on('clipboard:read', ({ text }) => {
        const cleaned = (text || '')
          .replace(/([?&])(utm_[^=&]+|fbclid|gclid)=[^&#]*/gi, '$1')
          .replace(/[?&]$/, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned !== text) ctx.emit('clipboard:write', { text: cleaned });
      });
    },
  },
  'dex.builtin.heartbeat': {
    onEnable: (ctx) => {
      return ctx.on('host:tick', ({ at }) => {
        ctx.emit('storage:set', { key: 'dex.builtin.heartbeat:last', value: at });
      });
    },
  },
};

// ---------------------------------------------------------------------------
// Init / boot
// ---------------------------------------------------------------------------
export function ensureInit(): void {
  if (initialized) return;
  initialized = true;

  const persisted = loadPersisted();

  // Seed built-ins (preserve persisted enabled state if present).
  for (const manifest of BUILTIN_MANIFESTS) {
    const prior = persisted.find((p) => p.manifest.id === manifest.id);
    const rec: ExtensionRecord = {
      manifest,
      enabled: prior?.enabled ?? false,
      installedAt: prior?.installedAt ?? Date.now(),
      updatedAt: Date.now(),
      builtin: true,
    };
    records.push(rec);
    handlers.set(manifest.id, BUILTIN_HANDLERS[manifest.id]);
    syncLedger(rec);
  }

  // Add user-installed (non-builtin) extensions.
  for (const p of persisted) {
    if (BUILTIN_MANIFESTS.some((b) => b.id === p.manifest.id)) continue;
    const check = validateManifest(p.manifest as Partial<PluginManifest>);
    if (!check.ok) continue; // skip corrupt records
    records.push({ ...p, builtin: false });
    syncLedger(p);
  }

  // Attach everything currently enabled.
  for (const rec of records) {
    if (rec.enabled) attach(rec);
  }

  persist();
}
