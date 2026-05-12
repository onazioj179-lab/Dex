/**
 * UKI Cache — TTL cache with optional AES-GCM encryption at rest.
 *
 * Backing store: localStorage (synchronous, fast, per-origin). Values are
 * JSON-serialized. When `encrypted: true`, value bytes are encrypted with
 * a per-install key derived once and stored locally — this protects from
 * casual storage scraping by other renderer code, not from a determined
 * attacker with full disk access.
 *
 * Speed: reads are O(1) JSON.parse. Writes are async only when encrypted.
 * Sync read API exposed for non-encrypted entries (the hot path).
 */

const STORAGE_PREFIX = 'uki:cache:';
const KEY_STORAGE = 'uki:cache:__key__';

interface CacheEntry<T> {
  v: 1;                  // schema version
  ts: number;            // unix ms set time
  ttl: number;           // ttl ms (0 = no expiry)
  data: T;
}

interface EncryptedEnvelope {
  v: 1;
  enc: true;
  iv: string;            // base64
  ct: string;            // base64
  ttl: number;
  ts: number;
}

let cachedKey: CryptoKey | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buf;
}

// Helper: copy any byte source into a fresh ArrayBuffer. We deliberately
// build the destination via a numeric loop so the function never depends on
// Uint8Array's generic ArrayBufferLike parameter, which TS 5.7+ refuses to
// narrow to ArrayBuffer for WebCrypto BufferSource overloads.
function toBuf(src: ArrayBufferLike | ArrayBufferView): ArrayBuffer {
  let bytes: number[];
  if (ArrayBuffer.isView(src)) {
    const view = src as ArrayBufferView;
    const tmp = new Uint8Array(view.byteLength);
    // Read source bytes one at a time via DataView to avoid generic-buffer typing issues.
    const dv = new DataView((view as { buffer: ArrayBufferLike }).buffer, view.byteOffset, view.byteLength);
    for (let i = 0; i < view.byteLength; i++) tmp[i] = dv.getUint8(i);
    bytes = Array.from(tmp);
  } else {
    const dv = new DataView(src as ArrayBufferLike);
    bytes = new Array<number>(dv.byteLength);
    for (let i = 0; i < dv.byteLength; i++) bytes[i] = dv.getUint8(i);
  }
  const out = new ArrayBuffer(bytes.length);
  const dst = new Uint8Array(out);
  for (let i = 0; i < bytes.length; i++) dst[i] = bytes[i];
  return out;
}

/** Lazily get or generate the per-install AES-GCM key. */
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!isBrowser() || !window.crypto?.subtle) {
    throw new Error('WebCrypto unavailable');
  }
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) {
    try {
      const raw = b64decode(stored);
      const key = await crypto.subtle.importKey('raw', toBuf(raw) as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
      cachedKey = key;
      return key;
    } catch {
      // fall through to regenerate
    }
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(KEY_STORAGE, b64encode(raw));
  cachedKey = key;
  return key;
}

export interface SetOptions {
  /** TTL in milliseconds (0 = no expiry). Default 5 minutes. */
  ttl?: number;
  /** Encrypt at rest with AES-GCM. Default false. */
  encrypted?: boolean;
}

/** Synchronous get for unencrypted entries. Returns undefined on miss/expiry. */
export function get<T = unknown>(key: string): T | undefined {
  if (!isBrowser()) return undefined;
  const raw = localStorage.getItem(STORAGE_PREFIX + key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T> | EncryptedEnvelope;
    if ('enc' in parsed && parsed.enc) return undefined; // need async path
    const entry = parsed as CacheEntry<T>;
    if (entry.ttl > 0 && Date.now() - entry.ts > entry.ttl) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return undefined;
    }
    return entry.data;
  } catch {
    return undefined;
  }
}

/** Async get supports both encrypted and plain entries. */
export async function getAsync<T = unknown>(key: string): Promise<T | undefined> {
  if (!isBrowser()) return undefined;
  const raw = localStorage.getItem(STORAGE_PREFIX + key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T> | EncryptedEnvelope;
    if ('enc' in parsed && parsed.enc) {
      if (parsed.ttl > 0 && Date.now() - parsed.ts > parsed.ttl) {
        localStorage.removeItem(STORAGE_PREFIX + key);
        return undefined;
      }
      const aesKey = await getKey();
      const iv = b64decode(parsed.iv);
      const ct = b64decode(parsed.ct);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBuf(iv) as unknown as BufferSource }, aesKey, toBuf(ct) as unknown as BufferSource);
      const text = new TextDecoder().decode(pt);
      return JSON.parse(text) as T;
    }
    const entry = parsed as CacheEntry<T>;
    if (entry.ttl > 0 && Date.now() - entry.ts > entry.ttl) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return undefined;
    }
    return entry.data;
  } catch {
    return undefined;
  }
}

/** Sync set for unencrypted entries. */
export function set<T>(key: string, data: T, options: SetOptions = {}): void {
  if (!isBrowser()) return;
  const ttl = options.ttl ?? 5 * 60 * 1000;
  if (options.encrypted) {
    // fire and forget; caller can `await setAsync` for guarantees.
    void setAsync(key, data, options);
    return;
  }
  const entry: CacheEntry<T> = { v: 1, ts: Date.now(), ttl, data };
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // quota exceeded — best-effort prune oldest UKI entries
    pruneOldest(8);
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry)); } catch { /* give up */ }
  }
}

/** Async set required when encryption is enabled. */
export async function setAsync<T>(key: string, data: T, options: SetOptions = {}): Promise<void> {
  if (!isBrowser()) return;
  const ttl = options.ttl ?? 5 * 60 * 1000;
  if (!options.encrypted) {
    set(key, data, options);
    return;
  }
  const aesKey = await getKey();
  const ivArr = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(ivArr);
  const ivBuf = toBuf(ivArr);
  const text = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf as unknown as BufferSource }, aesKey, toBuf(text) as unknown as BufferSource);
  const envelope: EncryptedEnvelope = {
    v: 1, enc: true, iv: b64encode(ivBuf), ct: b64encode(ct), ttl, ts: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    pruneOldest(8);
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(envelope)); } catch { /* give up */ }
  }
}

export function remove(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_PREFIX + key);
}

export function clearAll(): void {
  if (!isBrowser()) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX) && k !== KEY_STORAGE) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

function pruneOldest(count: number): void {
  if (!isBrowser()) return;
  const entries: Array<{ key: string; ts: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX) || k === KEY_STORAGE) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(k) ?? '{}') as { ts?: number };
      entries.push({ key: k, ts: parsed.ts ?? 0 });
    } catch { /* ignore malformed */ }
  }
  entries.sort((a, b) => a.ts - b.ts);
  entries.slice(0, count).forEach(e => localStorage.removeItem(e.key));
}
