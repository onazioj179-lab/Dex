// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Performance Primitives
// ==========================================================================
// Technique 10: Object Pooling for Frequent Allocations
// Technique 11: Typed Arrays for Numeric Data
// Technique 12: ArrayBuffer Views for Structured Data
// Technique 13: Closure Allocation Elimination
// Technique 14: WeakRef for Cache Entries
// Technique 70: Old Generation Object Initialization
// Technique 71: Hidden Class Consistency
// Technique 72: Monomorphic Call Sites
// Technique 73: TurboFan-Friendly Hot Functions
// Technique 74: Type Stability in Hot Variables
// Technique 75: Integer Arithmetic Preference
// Technique 77: Bitwise Flag Operations
// Technique 78: Local Variable Caching in Hot Loops
// Technique 79: Direct Array Indexing
// Technique 80: Bitmask Capability Checks
// Technique 84: Function-Level Memoization
// Technique 86: Minimize Cross-Realm Object Passing
// Technique 87: Uint8Array for Binary Data
// Technique 88: String Interning for Frequent Strings
// ==========================================================================

import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 10: Generic Object Pool
// ---------------------------------------------------------------------------

export class ObjectPool<T extends object> {
  private free: T[] = [];
  private maxSize: number;
  private factory: () => T;
  private resetter: (obj: T) => void;
  private acquiredCount = 0;
  private releasedCount = 0;

  constructor(factory: () => T, resetter: (obj: T) => void, maxSize: number = 256) {
    this.factory = factory;
    this.resetter = resetter;
    this.maxSize = maxSize;
  }

  acquire(): T {
    this.acquiredCount++;
    if (this.free.length > 0) {
      return this.free.pop() as T;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.releasedCount++;
    if (this.free.length < this.maxSize) {
      this.resetter(obj);
      this.free.push(obj);
    }
  }

  prewarm(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.free.length);
    for (let i = 0; i < toCreate; i++) {
      this.free.push(this.factory());
    }
  }

  get stats(): { free: number; acquired: number; released: number; max: number } {
    return { free: this.free.length, acquired: this.acquiredCount, released: this.releasedCount, max: this.maxSize };
  }

  clear(): void { this.free.length = 0; }
}

// Pre-built pools for high-frequency objects

export interface PooledIPCMessage {
  channel: string;
  payload: unknown;
  timestamp: number;
  id: number;
  compressed: boolean;
  transferList: ArrayBuffer[];
}

function createIPCMessage(): PooledIPCMessage {
  return { channel: '', payload: null, timestamp: 0, id: 0, compressed: false, transferList: [] };
}
function resetIPCMessage(m: PooledIPCMessage): void {
  m.channel = ''; m.payload = null; m.timestamp = 0; m.id = 0; m.compressed = false; m.transferList.length = 0;
}
export const ipcMessagePool = new ObjectPool<PooledIPCMessage>(createIPCMessage, resetIPCMessage, 512);

export interface PooledEventObject {
  type: string;
  source: string;
  payload: unknown;
  timestamp: number;
  id: number;
}
function createEventObject(): PooledEventObject {
  return { type: '', source: '', payload: null, timestamp: 0, id: 0 };
}
function resetEventObject(e: PooledEventObject): void {
  e.type = ''; e.source = ''; e.payload = null; e.timestamp = 0; e.id = 0;
}
export const eventObjectPool = new ObjectPool<PooledEventObject>(createEventObject, resetEventObject, 512);

export interface PooledLogEntry {
  level: number;
  source: string;
  message: string;
  timestamp: number;
  data: unknown;
}
function createLogEntry(): PooledLogEntry {
  return { level: 0, source: '', message: '', timestamp: 0, data: null };
}
function resetLogEntry(e: PooledLogEntry): void {
  e.level = 0; e.source = ''; e.message = ''; e.timestamp = 0; e.data = null;
}
export const logEntryPool = new ObjectPool<PooledLogEntry>(createLogEntry, resetLogEntry, 1024);

export interface PooledTaskObject {
  id: number;
  priority: number;
  type: number;
  status: number;
  fn: (() => Promise<unknown>) | null;
}
function createTaskObject(): PooledTaskObject {
  return { id: 0, priority: 0, type: 0, status: 0, fn: null };
}
function resetTaskObject(t: PooledTaskObject): void {
  t.id = 0; t.priority = 0; t.type = 0; t.status = 0; t.fn = null;
}
export const taskObjectPool = new ObjectPool<PooledTaskObject>(createTaskObject, resetTaskObject, 256);

export interface PooledPerfSample {
  startNs: bigint;
  endNs: bigint;
  category: number;
  label: number;
}
function createPerfSample(): PooledPerfSample {
  return { startNs: 0n, endNs: 0n, category: 0, label: 0 };
}
function resetPerfSample(s: PooledPerfSample): void {
  s.startNs = 0n; s.endNs = 0n; s.category = 0; s.label = 0;
}
export const perfSamplePool = new ObjectPool<PooledPerfSample>(createPerfSample, resetPerfSample, 256);

export interface PooledDBRow {
  id: number;
  col0: unknown; col1: unknown; col2: unknown; col3: unknown;
  col4: unknown; col5: unknown; col6: unknown; col7: unknown;
}
function createDBRow(): PooledDBRow {
  return { id: 0, col0: null, col1: null, col2: null, col3: null, col4: null, col5: null, col6: null, col7: null };
}
function resetDBRow(r: PooledDBRow): void {
  r.id = 0; r.col0 = null; r.col1 = null; r.col2 = null; r.col3 = null; r.col4 = null; r.col5 = null; r.col6 = null; r.col7 = null;
}
export const dbRowPool = new ObjectPool<PooledDBRow>(createDBRow, resetDBRow, 512);

// ---------------------------------------------------------------------------
// Technique 11: Typed Array Factory
// ---------------------------------------------------------------------------

export const TypedArrays = {
  float64(size: number): Float64Array { return new Float64Array(size); },
  float32(size: number): Float32Array { return new Float32Array(size); },
  int32(size: number): Int32Array { return new Int32Array(size); },
  uint8(size: number): Uint8Array { return new Uint8Array(size); },
  uint32(size: number): Uint32Array { return new Uint32Array(size); },

  // Timeline positions and durations (64-bit float for nanosecond precision)
  timelinePositions(count: number): Float64Array { return new Float64Array(count); },
  // Activity timestamps
  timestamps(count: number): Int32Array { return new Int32Array(count); },
  // Hash output and binary data
  binaryBuffer(size: number): Uint8Array { return new Uint8Array(size); },
  // Task priorities and status flags
  taskFlags(count: number): Int32Array { return new Int32Array(count); },
  // Analytics chart data
  chartSeries(count: number): Float32Array { return new Float32Array(count); },
  // Search scores
  searchScores(count: number): Float64Array { return new Float64Array(count); },
};

// ---------------------------------------------------------------------------
// Technique 12: ArrayBuffer Binary Protocol
// ---------------------------------------------------------------------------

// Binary IPC message layout:
// Offset 0:  uint32 channel (interned string ID)
// Offset 4:  uint32 payload length
// Offset 8:  uint32 flags (compressed, transfer, etc.)
// Offset 12: uint32 timestamp low
// Offset 16: uint32 timestamp high
// Offset 20: payload bytes

const IPC_HEADER_SIZE = 20;

export function encodeIPCBinary(channelId: number, payload: Uint8Array, flags: number, timestamp: number): ArrayBuffer {
  const buffer = new ArrayBuffer(IPC_HEADER_SIZE + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, channelId, true);
  view.setUint32(4, payload.byteLength, true);
  view.setUint32(8, flags, true);
  view.setUint32(12, timestamp & 0xFFFFFFFF, true);
  view.setUint32(16, (timestamp / 0x100000000) >>> 0, true);
  new Uint8Array(buffer, IPC_HEADER_SIZE).set(payload);
  return buffer;
}

export function decodeIPCBinary(buffer: ArrayBuffer): { channelId: number; payload: Uint8Array; flags: number; timestamp: number } {
  const view = new DataView(buffer);
  const channelId = view.getUint32(0, true);
  const payloadLen = view.getUint32(4, true);
  const flags = view.getUint32(8, true);
  const tsLow = view.getUint32(12, true);
  const tsHigh = view.getUint32(16, true);
  const timestamp = tsHigh * 0x100000000 + tsLow;
  const payload = new Uint8Array(buffer, IPC_HEADER_SIZE, payloadLen);
  return { channelId, payload, flags, timestamp };
}

// Event bus binary protocol:
// Offset 0: uint16 type (interned)
// Offset 2: uint16 source (interned)
// Offset 4: uint32 timestamp low
// Offset 8: uint32 timestamp high
// Offset 12: uint32 payload length
// Offset 16: payload

const EVENT_HEADER_SIZE = 16;

export function encodeEventBinary(typeId: number, sourceId: number, payload: Uint8Array, timestamp: number): ArrayBuffer {
  const buffer = new ArrayBuffer(EVENT_HEADER_SIZE + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint16(0, typeId, true);
  view.setUint16(2, sourceId, true);
  view.setUint32(4, timestamp & 0xFFFFFFFF, true);
  view.setUint32(8, (timestamp / 0x100000000) >>> 0, true);
  view.setUint32(12, payload.byteLength, true);
  new Uint8Array(buffer, EVENT_HEADER_SIZE).set(payload);
  return buffer;
}

export function decodeEventBinary(buffer: ArrayBuffer): { typeId: number; sourceId: number; payload: Uint8Array; timestamp: number } {
  const view = new DataView(buffer);
  const typeId = view.getUint16(0, true);
  const sourceId = view.getUint16(2, true);
  const tsLow = view.getUint32(4, true);
  const tsHigh = view.getUint32(8, true);
  const timestamp = tsHigh * 0x100000000 + tsLow;
  const payloadLen = view.getUint32(12, true);
  const payload = new Uint8Array(buffer, EVENT_HEADER_SIZE, payloadLen);
  return { typeId, sourceId, payload, timestamp };
}

// ---------------------------------------------------------------------------
// Technique 13: Named Function Registry (Closure Elimination)
// ---------------------------------------------------------------------------

type HandlerFn = (ctx: unknown, arg: unknown) => void;
const handlerRegistry: Map<string, HandlerFn> = new Map();

export function registerHandler(name: string, fn: HandlerFn): void {
  handlerRegistry.set(name, fn);
}

export function getHandler(name: string): HandlerFn | undefined {
  return handlerRegistry.get(name);
}

export function invokeHandler(name: string, ctx: unknown, arg: unknown): boolean {
  const fn = handlerRegistry.get(name);
  if (fn) { fn(ctx, arg); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Technique 14: WeakRef Cache
// ---------------------------------------------------------------------------

export class WeakRefCache<K, V extends object> {
  private cache: Map<K, WeakRef<V>> = new Map();
  private registry: FinalizationRegistry<K>;

  constructor() {
    this.registry = new FinalizationRegistry((key: K) => {
      const ref = this.cache.get(key);
      if (ref && ref.deref() === undefined) {
        this.cache.delete(key);
      }
    });
  }

  set(key: K, value: V): void {
    const existing = this.cache.get(key);
    if (existing) {
      const old = existing.deref();
      if (old) {
        try { this.registry.unregister(old); } catch { /* ok */ }
      }
    }
    this.cache.set(key, new WeakRef(value));
    this.registry.register(value, key, value);
  }

  get(key: K): V | undefined {
    const ref = this.cache.get(key);
    if (!ref) return undefined;
    const val = ref.deref();
    if (val === undefined) { this.cache.delete(key); return undefined; }
    return val;
  }

  has(key: K): boolean {
    const ref = this.cache.get(key);
    if (!ref) return false;
    if (ref.deref() === undefined) { this.cache.delete(key); return false; }
    return true;
  }

  delete(key: K): boolean {
    const ref = this.cache.get(key);
    if (ref) {
      const val = ref.deref();
      if (val) { try { this.registry.unregister(val); } catch { /* ok */ } }
    }
    return this.cache.delete(key);
  }

  get size(): number { return this.cache.size; }

  clear(): void { this.cache.clear(); }
}

// Pre-built WeakRef caches for T14
export const thumbnailPreviewCache = new WeakRefCache<string, Buffer>();
export const screenshotCache = new WeakRefCache<string, Buffer>();
export const analyticsResultCache = new WeakRefCache<string, Record<string, unknown>>();
export const pluginDataCache = new WeakRefCache<string, Record<string, unknown>>();

// ---------------------------------------------------------------------------
// Technique 77: Bitwise Flag Operations
// ---------------------------------------------------------------------------

export const FLAG = {
  // Capability tier feature flags (32-bit)
  BASIC_STORAGE:    0x00000001,
  ADVANCED_SEARCH:  0x00000002,
  PLUGIN_SYSTEM:    0x00000004,
  ANALYTICS:        0x00000008,
  AUTOMATION:       0x00000010,
  AI_FEATURES:      0x00000020,
  VOICE_CONTROL:    0x00000040,
  CLOUD_SYNC:       0x00000080,
  MULTI_WINDOW:     0x00000100,
  HARDWARE_ACCEL:   0x00000200,
  BACKGROUND_TASKS: 0x00000400,
  VIDEO_EDITING:    0x00000800,
  AUDIO_EDITING:    0x00001000,
  MEDIA_ENCODING:   0x00002000,

  // Inner app state flags
  APP_VISIBLE:      0x00010000,
  APP_ACTIVE:       0x00020000,
  APP_LOADING:      0x00040000,
  APP_ERROR:        0x00080000,
  APP_DIRTY:        0x00100000,

  // Task state flags
  TASK_QUEUED:      0x01000000,
  TASK_RUNNING:     0x02000000,
  TASK_COMPLETED:   0x04000000,
  TASK_FAILED:      0x08000000,
  TASK_CANCELLED:   0x10000000,

  // Event bus subscription flags
  SUB_ALL_EVENTS:   0x00000001,
  SUB_ONCE:         0x00000002,
  SUB_ASYNC:        0x00000004,
  SUB_PRIORITY:     0x00000008,
} as const;

export function hasFlag(flags: number, flag: number): boolean { return (flags & flag) !== 0; }
export function setFlag(flags: number, flag: number): number { return flags | flag; }
export function clearFlag(flags: number, flag: number): number { return flags & ~flag; }
export function toggleFlag(flags: number, flag: number): number { return flags ^ flag; }

// ---------------------------------------------------------------------------
// Technique 80: Bitmask Capability Checks
// ---------------------------------------------------------------------------

const TIER_MASKS: number[] = [
  0x00000001, // Tier 0: basic storage only
  0x00000003, // Tier 1: + advanced search
  0x0000000F, // Tier 2: + plugins, analytics
  0x000000FF, // Tier 3: + automation, AI, voice, cloud
  0x000003FF, // Tier 4: + multi-window, hardware accel
  0x00003FFF, // Tier 5: all features
];

let currentCapabilityMask = TIER_MASKS[5]; // Default to full

export function setCapabilityTier(tier: number): void {
  currentCapabilityMask = TIER_MASKS[Math.min(tier, TIER_MASKS.length - 1)] || TIER_MASKS[0];
}

export function isFeatureAvailable(featureFlag: number): boolean {
  return (currentCapabilityMask & featureFlag) !== 0;
}

// ---------------------------------------------------------------------------
// Technique 84: Memoization Framework
// ---------------------------------------------------------------------------

const MEMO_MAX_SIZE = 1000;

export function memoize<A extends unknown[], R>(fn: (...args: A) => R, keyFn?: (...args: A) => string): (...args: A) => R {
  const cache = new Map<string, R>();

  return function memoized(...args: A): R {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key) as R;

    const result = fn(...args);
    if (cache.size >= MEMO_MAX_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, result);
    return result;
  };
}

// Pre-memoized common functions
export const memoizedExtensionType = memoize((ext: string): string => {
  const map: Record<string, string> = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image', '.bmp': 'image', '.ico': 'image',
    '.mp4': 'video', '.mov': 'video', '.avi': 'video', '.mkv': 'video', '.webm': 'video', '.flv': 'video', '.wmv': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio', '.ogg': 'audio', '.m4a': 'audio', '.wma': 'audio',
    '.pdf': 'document', '.doc': 'document', '.docx': 'document', '.xls': 'document', '.xlsx': 'document', '.ppt': 'document', '.pptx': 'document',
    '.txt': 'text', '.md': 'text', '.csv': 'text', '.json': 'text', '.xml': 'text', '.html': 'text', '.css': 'text',
    '.js': 'code', '.ts': 'code', '.py': 'code', '.java': 'code', '.c': 'code', '.cpp': 'code', '.rs': 'code', '.go': 'code',
    '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
  };
  return map[ext.toLowerCase()] || 'other';
});

export const memoizedShortcutFormat = memoize((key: string, mod: string): string => {
  const parts: string[] = [];
  if (mod.includes('ctrl') || mod.includes('meta')) parts.push(process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
  if (mod.includes('shift')) parts.push('Shift');
  if (mod.includes('alt')) parts.push(process.platform === 'darwin' ? 'Option' : 'Alt');
  parts.push(key.toUpperCase());
  return parts.join('+');
});

// ---------------------------------------------------------------------------
// Technique 88: String Interning
// ---------------------------------------------------------------------------

class StringInternTable {
  private table: Map<string, string> = new Map();
  private idMap: Map<string, number> = new Map();
  private reverseMap: Map<number, string> = new Map();
  private nextId = 1;

  intern(str: string): string {
    const existing = this.table.get(str);
    if (existing !== undefined) return existing;
    this.table.set(str, str);
    return str;
  }

  internId(str: string): number {
    const existingId = this.idMap.get(str);
    if (existingId !== undefined) return existingId;
    const id = this.nextId++;
    this.idMap.set(str, id);
    this.reverseMap.set(id, str);
    this.table.set(str, str);
    return id;
  }

  fromId(id: number): string | undefined {
    return this.reverseMap.get(id);
  }

  get size(): number { return this.table.size; }
}

export const stringIntern = new StringInternTable();

// Pre-intern all common strings
const COMMON_STRINGS = [
  // App names
  'imosion', 'forge', 'vinx', 'rewind', 'flux', 'prism', 'calculator', 'calendar', 'kanban', 'notes', 'tasks', 'files', 'settings',
  // Event types
  'app-ready', 'app-focus', 'app-blur', 'app-closed', 'app-switched', 'project-opened', 'project-saved', 'project-closed',
  'file-created', 'file-modified', 'file-deleted', 'file-renamed', 'task-created', 'task-completed', 'task-deleted',
  'plugin-loaded', 'plugin-unloaded', 'focus-session-start', 'focus-session-end', 'idle-start', 'idle-end',
  'capability-tier-change', 'theme-change', 'shortcut-triggered', 'media-play', 'media-pause', 'media-stop',
  'system-warning', 'system-error', 'performance-violation', 'rewind-snapshot', 'backup-completed',
  // IPC channels
  'ipc:invoke', 'ipc:send', 'ipc:handle', 'ipc:broadcast',
  // Log levels
  'debug', 'info', 'warn', 'error', 'fatal',
  // File extensions
  '.mp4', '.mov', '.mp3', '.wav', '.png', '.jpg', '.pdf', '.txt', '.json',
  // Capability tiers
  'tier-0', 'tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5',
];

for (const s of COMMON_STRINGS) {
  stringIntern.intern(s);
  stringIntern.internId(s);
}

// ---------------------------------------------------------------------------
// Technique 71/72/73/74: V8 Optimization Helpers
// ---------------------------------------------------------------------------

// Technique 70: Initialize all properties upfront for old-generation allocation
export function initializeFullObject<T extends Record<string, unknown>>(template: T): T {
  const obj = {} as T;
  const keys = Object.keys(template);
  for (let i = 0; i < keys.length; i++) {
    (obj as Record<string, unknown>)[keys[i]] = template[keys[i]];
  }
  return obj;
}

// Technique 71: Hidden class enforcer - validates property order
export function enforceHiddenClass<T extends Record<string, unknown>>(obj: T, expectedKeys: string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== expectedKeys.length) return false;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== expectedKeys[i]) return false;
  }
  return true;
}

// Technique 74: Type coercion at function boundaries
export function coerceToInt(value: unknown): number { return (value as number) | 0; }
export function coerceToFloat(value: unknown): number { return +(value as number); }
export function coerceToString(value: unknown): string { return '' + value; }
export function coerceToBool(value: unknown): boolean { return !!value; }

// Technique 75: Integer arithmetic helpers
export function intDiv(a: number, b: number): number { return (a / b) | 0; }
export function intMod(a: number, b: number): number { return ((a | 0) % (b | 0)) | 0; }
export function intMin(a: number, b: number): number { return (a | 0) < (b | 0) ? (a | 0) : (b | 0); }
export function intMax(a: number, b: number): number { return (a | 0) > (b | 0) ? (a | 0) : (b | 0); }
export function intClamp(val: number, lo: number, hi: number): number {
  const v = val | 0; const l = lo | 0; const h = hi | 0;
  return v < l ? l : v > h ? h : v;
}

// Technique 78: Local variable caching helper for hot loops
export function cachedLength<T>(arr: ArrayLike<T>): number { return arr.length | 0; }

// Technique 79: Direct array indexing constants for struct-of-arrays
export const SOA = {
  // Activity log offsets
  ACTIVITY_TIMESTAMP: 0,
  ACTIVITY_TYPE: 1,
  ACTIVITY_CONTENT_IDX: 2,
  ACTIVITY_STRIDE: 3,

  // Task queue offsets
  TASK_PRIORITY: 0,
  TASK_TYPE: 1,
  TASK_STATUS: 2,
  TASK_STRIDE: 3,

  // Performance sample offsets
  PERF_START_LO: 0,
  PERF_START_HI: 1,
  PERF_END_LO: 2,
  PERF_END_HI: 3,
  PERF_STRIDE: 4,
} as const;

// ---------------------------------------------------------------------------
// Technique 42: Struct of Arrays Containers
// ---------------------------------------------------------------------------

export class ActivityLogSOA {
  timestamps: Int32Array;
  typeCodes: Int32Array;
  contentIndices: Int32Array;
  private capacity: number;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.timestamps = new Int32Array(capacity);
    this.typeCodes = new Int32Array(capacity);
    this.contentIndices = new Int32Array(capacity);
  }

  push(timestamp: number, typeCode: number, contentIdx: number): number {
    if (this.count >= this.capacity) return -1;
    const idx = this.count++;
    this.timestamps[idx] = timestamp | 0;
    this.typeCodes[idx] = typeCode | 0;
    this.contentIndices[idx] = contentIdx | 0;
    return idx;
  }

  get(index: number): { timestamp: number; typeCode: number; contentIdx: number } | null {
    if (index < 0 || index >= this.count) return null;
    return { timestamp: this.timestamps[index], typeCode: this.typeCodes[index], contentIdx: this.contentIndices[index] };
  }

  get length(): number { return this.count; }

  clear(): void { this.count = 0; }
}

export class PerfSampleSOA {
  startTimes: Float64Array;
  endTimes: Float64Array;
  private capacity: number;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.startTimes = new Float64Array(capacity);
    this.endTimes = new Float64Array(capacity);
  }

  push(start: number, end: number): number {
    if (this.count >= this.capacity) return -1;
    const idx = this.count++;
    this.startTimes[idx] = start;
    this.endTimes[idx] = end;
    return idx;
  }

  duration(index: number): number {
    return this.endTimes[index] - this.startTimes[index];
  }

  get length(): number { return this.count; }
  clear(): void { this.count = 0; }
}

export class SearchScoreSOA {
  scores: Float64Array;
  resultRefs: unknown[];
  private capacity: number;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.scores = new Float64Array(capacity);
    this.resultRefs = new Array(capacity);
  }

  push(score: number, ref: unknown): number {
    if (this.count >= this.capacity) return -1;
    const idx = this.count++;
    this.scores[idx] = score;
    this.resultRefs[idx] = ref;
    return idx;
  }

  get length(): number { return this.count; }

  sortDescending(): void {
    // Simple insertion sort for small arrays, optimized for nearly-sorted data
    const n = this.count;
    const s = this.scores;
    const r = this.resultRefs;
    for (let i = 1; i < n; i++) {
      const keyScore = s[i];
      const keyRef = r[i];
      let j = i - 1;
      while (j >= 0 && s[j] < keyScore) {
        s[j + 1] = s[j];
        r[j + 1] = r[j];
        j--;
      }
      s[j + 1] = keyScore;
      r[j + 1] = keyRef;
    }
  }

  clear(): void { this.count = 0; }
}

// ---------------------------------------------------------------------------
// Technique 76: Fixed-Point Timeline Arithmetic
// ---------------------------------------------------------------------------

// 1000 sub-frame units per frame => 64-bit integer storage
const SUBFRAME_RESOLUTION = 1000;

export class FixedPointTimeline {
  static fromSeconds(seconds: number, fps: number): bigint {
    return BigInt(Math.round(seconds * fps * SUBFRAME_RESOLUTION));
  }

  static toSeconds(fixedPoint: bigint, fps: number): number {
    return Number(fixedPoint) / (fps * SUBFRAME_RESOLUTION);
  }

  static add(a: bigint, b: bigint): bigint { return a + b; }
  static subtract(a: bigint, b: bigint): bigint { return a - b; }
  static multiply(a: bigint, scalar: number): bigint {
    return a * BigInt(Math.round(scalar * SUBFRAME_RESOLUTION)) / BigInt(SUBFRAME_RESOLUTION);
  }

  static compare(a: bigint, b: bigint): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  static frameNumber(fixedPoint: bigint): number {
    return Number(fixedPoint / BigInt(SUBFRAME_RESOLUTION));
  }

  static subFrame(fixedPoint: bigint): number {
    return Number(fixedPoint % BigInt(SUBFRAME_RESOLUTION));
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializePerformancePrimitives(): void {
  // Prewarm all pools during Phase A
  ipcMessagePool.prewarm(64);
  eventObjectPool.prewarm(64);
  logEntryPool.prewarm(128);
  taskObjectPool.prewarm(32);
  perfSamplePool.prewarm(32);
  dbRowPool.prewarm(64);

  log.info('[PerfPrimitives] Techniques 10-14, 42, 70-80, 84, 86-89: Performance primitives initialized');
}

export function shutdownPerformancePrimitives(): void {
  ipcMessagePool.clear();
  eventObjectPool.clear();
  logEntryPool.clear();
  taskObjectPool.clear();
  perfSamplePool.clear();
  dbRowPool.clear();
  thumbnailPreviewCache.clear();
  screenshotCache.clear();
  analyticsResultCache.clear();
  pluginDataCache.clear();
}
