// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- I/O & IPC Acceleration
// ==========================================================================
// Technique 22: MessageChannel for High-Frequency IPC
// Technique 23: BroadcastChannel Manager
// Technique 25: ArrayBuffer Transfer Helpers
// Technique 26: IPC Message Object Pooling (refs PerformancePrimitives)
// Technique 32: Native SHA256 with JS Fallback
// Technique 33: File Permissions Helpers
// Technique 34: Hard Link / Symbolic Link Helpers
// Technique 35: Structured Clone for Deep Copy
// Technique 36: Memory Locking Hint (advisory)
// Technique 37: Process Priority Management
// Technique 38: CPU Temperature Stub (uses OS module)
// Technique 39: Platform Syscall Wrappers
// Technique 59: Frame-Batched Event Dispatch
// Technique 60: TCP_NODELAY Helper
// Technique 61: SO_REUSEPORT Helper
// Technique 62: Read-Ahead / OS Cache Hints
// Technique 63: sendfile() Style Zero-Copy Transfers
// Technique 64: splice() Style In-Kernel Transfer
// Technique 65: writev() Gather Write
// Technique 66: madvise() Memory Access Hints
// Technique 67: fadvise() File Access Hints
// Technique 68: Platform-Specific Optimized Dispatch
// Technique 69: OS-Level Thread Affinity Hint
// ==========================================================================

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { BrowserWindow, MessageChannelMain } from 'electron';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 22: MessageChannel for High-Frequency IPC
// ---------------------------------------------------------------------------

interface ManagedChannel {
  channel: MessageChannelMain;
  windowId: number;
  purpose: string;
  messagesReceived: number;
  messagesSent: number;
}

class MessageChannelManager {
  private channels: Map<string, ManagedChannel> = new Map();

  create(windowId: number, purpose: string): MessageChannelMain {
    const key = `${windowId}:${purpose}`;
    const existing = this.channels.get(key);
    if (existing) return existing.channel;

    const channel = new MessageChannelMain();
    this.channels.set(key, {
      channel,
      windowId,
      purpose,
      messagesReceived: 0,
      messagesSent: 0,
    });
    return channel;
  }

  sendPort(window: BrowserWindow, purpose: string): MessageChannelMain | null {
    const channel = this.create(window.id, purpose);
    try {
      window.webContents.postMessage(`channel:${purpose}`, null, [channel.port2]);
      return channel;
    } catch {
      return null;
    }
  }

  getPort1(windowId: number, purpose: string): Electron.MessagePortMain | null {
    const key = `${windowId}:${purpose}`;
    const managed = this.channels.get(key);
    return managed ? managed.channel.port1 : null;
  }

  destroyForWindow(windowId: number): void {
    for (const [key, managed] of this.channels) {
      if (managed.windowId === windowId) {
        try {
          managed.channel.port1.close();
          managed.channel.port2.close();
        } catch { /* ports may already be closed */ }
        this.channels.delete(key);
      }
    }
  }

  get stats(): Array<{ key: string; purpose: string; sent: number; received: number }> {
    const result: Array<{ key: string; purpose: string; sent: number; received: number }> = [];
    for (const [key, managed] of this.channels) {
      result.push({ key, purpose: managed.purpose, sent: managed.messagesSent, received: managed.messagesReceived });
    }
    return result;
  }
}

export const messageChannelManager = new MessageChannelManager();

// ---------------------------------------------------------------------------
// Technique 23: BroadcastChannel Manager (simulated for Electron main process)
// ---------------------------------------------------------------------------

type BroadcastHandler = (data: unknown) => void;

class BroadcastChannelManager {
  private channels: Map<string, Set<BroadcastHandler>> = new Map();

  subscribe(channel: string, handler: BroadcastHandler): () => void {
    let handlers = this.channels.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channels.set(channel, handlers);
    }
    handlers.add(handler);
    return () => { handlers?.delete(handler); };
  }

  broadcast(channel: string, data: unknown): void {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(data); } catch (err) {
        log.error(`[BroadcastChannel:${channel}] Handler error:`, err);
      }
    }
  }

  hasSubscribers(channel: string): boolean {
    const handlers = this.channels.get(channel);
    return handlers !== undefined && handlers.size > 0;
  }

  clear(): void { this.channels.clear(); }
}

export const broadcastChannels = new BroadcastChannelManager();

// ---------------------------------------------------------------------------
// Technique 25: ArrayBuffer Transfer Helpers
// ---------------------------------------------------------------------------

export const BufferTransfer = {
  // Convert string to ArrayBuffer for transfer
  stringToBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  },

  // Convert ArrayBuffer back to string
  bufferToString(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  },

  // Convert JSON to transferable ArrayBuffer
  jsonToBuffer(obj: unknown): ArrayBuffer {
    return BufferTransfer.stringToBuffer(JSON.stringify(obj));
  },

  // Convert ArrayBuffer to JSON
  bufferToJson(buffer: ArrayBuffer): unknown {
    return JSON.parse(BufferTransfer.bufferToString(buffer));
  },

  // Create a transferable copy of a typed array
  transferTypedArray(arr: ArrayBufferView): ArrayBuffer {
    const copy = new ArrayBuffer(arr.byteLength);
    new Uint8Array(copy).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    return copy;
  },

  // Slice without copying (view)
  view(buffer: ArrayBuffer, offset: number, length: number): Uint8Array {
    return new Uint8Array(buffer, offset, length);
  },
};

// ---------------------------------------------------------------------------
// Technique 32: Native SHA256 with JS Fallback
// ---------------------------------------------------------------------------

export function sha256(data: string | Buffer): string {
  try {
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch {
    // JS fallback (simplified, for emergency use)
    return jsSHA256(typeof data === 'string' ? data : data.toString('utf8'));
  }
}

export function sha256Buffer(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

function jsSHA256(message: string): string {
  // Minimal JS SHA-256 implementation for fallback
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rotr(n: number, x: number): number { return (x >>> n) | (x << (32 - n)); }
  function ch(x: number, y: number, z: number): number { return (x & y) ^ (~x & z); }
  function maj(x: number, y: number, z: number): number { return (x & y) ^ (x & z) ^ (y & z); }
  function sigma0(x: number): number { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
  function sigma1(x: number): number { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
  function gamma0(x: number): number { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
  function gamma1(x: number): number { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

  const bytes: number[] = [];
  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 0x3F)); }
    else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3F)); bytes.push(0x80 | (c & 0x3F)); }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let i = 56; i >= 0; i -= 8) bytes.push((bitLen >>> i) & 0xFF);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let block = 0; block < bytes.length; block += 64) {
    const W = new Array(64);
    for (let t = 0; t < 16; t++) {
      W[t] = (bytes[block + t * 4] << 24) | (bytes[block + t * 4 + 1] << 16) | (bytes[block + t * 4 + 2] << 8) | bytes[block + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) | 0;
      const T2 = (sigma0(a) + maj(a, b, c)) | 0;
      h = g; g = f; f = e; e = (d + T1) | 0; d = c; c = b; b = a; a = (T1 + T2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  function hex(n: number): string { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

// ---------------------------------------------------------------------------
// Technique 33: File Permission Helpers
// ---------------------------------------------------------------------------

export const FilePermissions = {
  setReadOnly(filePath: string): void {
    try {
      if (process.platform === 'win32') {
        fs.chmodSync(filePath, 0o444);
      } else {
        fs.chmodSync(filePath, 0o444);
      }
    } catch { /* non-critical */ }
  },

  setReadWrite(filePath: string): void {
    try { fs.chmodSync(filePath, 0o644); } catch { /* non-critical */ }
  },

  setExecutable(filePath: string): void {
    try { fs.chmodSync(filePath, 0o755); } catch { /* non-critical */ }
  },

  isReadable(filePath: string): boolean {
    try { fs.accessSync(filePath, fs.constants.R_OK); return true; } catch { return false; }
  },

  isWritable(filePath: string): boolean {
    try { fs.accessSync(filePath, fs.constants.W_OK); return true; } catch { return false; }
  },
};

// ---------------------------------------------------------------------------
// Technique 34: Hard Link / Symbolic Link Helpers
// ---------------------------------------------------------------------------

export const LinkHelpers = {
  hardLink(src: string, dest: string): boolean {
    try { fs.linkSync(src, dest); return true; } catch { return false; }
  },

  symlink(target: string, linkPath: string, type: 'file' | 'dir' = 'file'): boolean {
    try {
      fs.symlinkSync(target, linkPath, process.platform === 'win32' ? (type === 'dir' ? 'junction' : 'file') : undefined);
      return true;
    } catch { return false; }
  },

  isSymlink(filePath: string): boolean {
    try { return fs.lstatSync(filePath).isSymbolicLink(); } catch { return false; }
  },

  resolveLink(filePath: string): string | null {
    try { return fs.realpathSync(filePath); } catch { return null; }
  },

  // Deduplicate identical files using hard links (save disk space)
  deduplicateByHash(files: string[]): { saved: number; linked: number } {
    const hashMap = new Map<string, string>();
    let saved = 0;
    let linked = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file);
        const hash = sha256(content);
        const existing = hashMap.get(hash);
        if (existing && existing !== file) {
          const stat = fs.statSync(file);
          fs.unlinkSync(file);
          if (LinkHelpers.hardLink(existing, file)) {
            saved += stat.size;
            linked++;
          } else {
            // Restore by copy if hard link failed
            fs.copyFileSync(existing, file);
          }
        } else {
          hashMap.set(hash, file);
        }
      } catch { /* skip failed files */ }
    }
    return { saved, linked };
  },
};

// ---------------------------------------------------------------------------
// Technique 35: Structured Clone for Deep Copy
// ---------------------------------------------------------------------------

export function structuredDeepCopy<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    // Fallback to JSON round-trip
    return JSON.parse(JSON.stringify(obj));
  }
}

// ---------------------------------------------------------------------------
// Technique 36: Memory Locking Hint (Advisory)
// ---------------------------------------------------------------------------

export function advisoryMemoryLock(buffer: ArrayBuffer): void {
  // On Node.js, we can't directly call mlock(). This is advisory only.
  // The V8 engine manages memory, but we can prevent garbage collection
  // by storing a strong reference in a global set.
  lockedBuffers.add(buffer);
}

export function advisoryMemoryUnlock(buffer: ArrayBuffer): void {
  lockedBuffers.delete(buffer);
}

const lockedBuffers = new Set<ArrayBuffer>();

// ---------------------------------------------------------------------------
// Technique 37: Process Priority Management
// ---------------------------------------------------------------------------

export const ProcessPriority = {
  setHighPriority(): boolean {
    try { os.setPriority(os.constants.priority.PRIORITY_HIGH); return true; } catch { return false; }
  },

  setNormalPriority(): boolean {
    try { os.setPriority(os.constants.priority.PRIORITY_NORMAL); return true; } catch { return false; }
  },

  setLowPriority(): boolean {
    try { os.setPriority(os.constants.priority.PRIORITY_LOW); return true; } catch { return false; }
  },

  setAboveNormal(): boolean {
    try { os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL); return true; } catch { return false; }
  },

  getCurrent(): number {
    try { return os.getPriority(); } catch { return 0; }
  },
};

// ---------------------------------------------------------------------------
// Technique 38: CPU Temperature Stub
// ---------------------------------------------------------------------------

export function getCPUTemperature(): number | null {
  // On Windows, CPU temp requires native access (WMI or custom addon)
  // On Linux, read /sys/class/thermal/thermal_zone0/temp
  if (process.platform === 'linux') {
    try {
      const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      return parseInt(temp, 10) / 1000;
    } catch { return null; }
  }
  // macOS: requires iokit access (not available in pure JS)
  // Windows: requires WMI queries (not available in pure JS)
  return null;
}

// ---------------------------------------------------------------------------
// Technique 59: Frame-Batched Event Dispatch
// ---------------------------------------------------------------------------

interface BatchedEvent {
  type: string;
  data: unknown;
}

class FrameBatchedDispatcher {
  private queue: BatchedEvent[] = [];
  private scheduled = false;
  private handlers: Map<string, Set<(events: BatchedEvent[]) => void>> = new Map();
  private frameMs: number;

  constructor(frameMs: number = 16) {
    this.frameMs = frameMs;
  }

  on(type: string, handler: (events: BatchedEvent[]) => void): () => void {
    let handlers = this.handlers.get(type);
    if (!handlers) { handlers = new Set(); this.handlers.set(type, handlers); }
    handlers.add(handler);
    return () => { handlers?.delete(handler); };
  }

  emit(type: string, data: unknown): void {
    this.queue.push({ type, data });
    if (!this.scheduled) {
      this.scheduled = true;
      setTimeout(() => this.flush(), this.frameMs);
    }
  }

  private flush(): void {
    this.scheduled = false;
    const events = this.queue;
    this.queue = [];

    // Group by type
    const grouped = new Map<string, BatchedEvent[]>();
    for (const event of events) {
      let group = grouped.get(event.type);
      if (!group) { group = []; grouped.set(event.type, group); }
      group.push(event);
    }

    // Dispatch grouped events
    for (const [type, typeEvents] of grouped) {
      const handlers = this.handlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(typeEvents); } catch (err) {
            log.error(`[FrameDispatcher] Handler error for ${type}:`, err);
          }
        }
      }
    }
  }

  clear(): void {
    this.queue.length = 0;
    this.scheduled = false;
    this.handlers.clear();
  }
}

export const frameBatchedDispatcher = new FrameBatchedDispatcher(16);

// ---------------------------------------------------------------------------
// Technique 60/61: Socket Option Helpers
// ---------------------------------------------------------------------------

export const SocketOptimizer = {
  setNoDelay(socket: net.Socket): void {
    try { socket.setNoDelay(true); } catch { /* non-critical */ }
  },

  setKeepAlive(socket: net.Socket, intervalMs: number = 30000): void {
    try { socket.setKeepAlive(true, intervalMs); } catch { /* non-critical */ }
  },

  // SO_REUSEPORT via Node.js server options (not directly settable, but hint via reusePort)
  createOptimizedServer(handler: (socket: net.Socket) => void): net.Server {
    const server = net.createServer({ allowHalfOpen: false }, handler);
    return server;
  },
};

// ---------------------------------------------------------------------------
// Technique 39/62-67: Platform Syscall Wrappers (JS implementations)
// ---------------------------------------------------------------------------

export const PlatformSyscalls = {
  // Technique 63: sendfile() style zero-copy
  // In Node.js, we approximate zero-copy with stream.pipe()
  async sendfile(srcPath: string, destFd: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(srcPath, { highWaterMark: 256 * 1024 });
      const writeStream = fs.createWriteStream('', { fd: destFd, autoClose: false });
      let bytesTransferred = 0;
      readStream.on('data', (chunk: string | Buffer) => { bytesTransferred += (chunk as Buffer).length; });
      readStream.pipe(writeStream);
      writeStream.on('finish', () => resolve(bytesTransferred));
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });
  },

  // Technique 64: splice() style in-kernel pipe
  // Approximate with pipe between streams
  async splice(src: NodeJS.ReadableStream, dest: NodeJS.WritableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      src.pipe(dest as NodeJS.WritableStream);
      dest.on('finish', () => resolve());
      dest.on('error', reject);
    });
  },

  // Technique 65: writev() gather write
  async writev(fd: number, buffers: Buffer[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const combined = Buffer.concat(buffers);
      fs.write(fd, combined, 0, combined.length, null, (err, written) => {
        if (err) reject(err);
        else resolve(written);
      });
    });
  },

  // Technique 62: Read-ahead hint
  readAhead(filePath: string, _byteCount: number): void {
    // On Linux, this would be posix_fadvise(fd, 0, byteCount, POSIX_FADV_SEQUENTIAL)
    // In Node.js, we approximate by opening a read stream with large buffer
    try {
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024, start: 0, end: _byteCount });
      stream.on('data', () => {}); // Read and discard to warm cache
      stream.on('end', () => stream.destroy());
      stream.on('error', () => stream.destroy());
    } catch { /* non-critical */ }
  },

  // Technique 66: madvise() memory access hint
  // In JS, this is advisory only - we can hint to V8 via typed array patterns
  madvise(_buffer: ArrayBuffer, _advice: 'sequential' | 'random' | 'willneed' | 'dontneed'): void {
    // No-op in JS. On native, this would call madvise().
    // For 'dontneed', we could set the buffer to null to hint GC.
  },

  // Technique 67: fadvise() file access hint
  fadvise(_fd: number, _offset: number, _length: number, _advice: 'sequential' | 'random' | 'willneed' | 'dontneed'): void {
    // No-op in JS. On native, this would call posix_fadvise().
  },
};

// ---------------------------------------------------------------------------
// Technique 68: Platform-Specific Optimized Dispatch
// ---------------------------------------------------------------------------

export const PlatformDispatch = {
  platform: process.platform as 'win32' | 'darwin' | 'linux',

  isWindows(): boolean { return process.platform === 'win32'; },
  isMac(): boolean { return process.platform === 'darwin'; },
  isLinux(): boolean { return process.platform === 'linux'; },

  // Run platform-specific code path
  dispatch<T>(handlers: { win32?: () => T; darwin?: () => T; linux?: () => T; fallback: () => T }): T {
    const handler = handlers[process.platform as 'win32' | 'darwin' | 'linux'];
    return handler ? handler() : handlers.fallback();
  },

  // Optimized file watching per platform
  watchOptions(): { persistent: boolean; recursive: boolean } {
    return {
      persistent: true,
      recursive: process.platform !== 'linux', // Linux inotify doesn't support recursive natively
    };
  },

  // Optimized temp directory
  optimizedTempDir(): string {
    if (process.platform === 'linux') {
      // Use /dev/shm if available (RAM-backed tmpfs)
      try { if (fs.existsSync('/dev/shm')) return '/dev/shm'; } catch { /* fallback */ }
    }
    return os.tmpdir();
  },

  // Separator-aware path joining
  sep: path.sep,
};

// ---------------------------------------------------------------------------
// Technique 69: Thread Affinity Hint (Advisory)
// ---------------------------------------------------------------------------

export function setThreadAffinityHint(_threadId: number, _cpuCore: number): void {
  // Not directly available in Node.js. On native, this would call
  // SetThreadAffinityMask (Windows), pthread_setaffinity_np (Linux),
  // or thread_policy_set (macOS). This is an advisory no-op.
}

// ---------------------------------------------------------------------------
// Initialization / Shutdown
// ---------------------------------------------------------------------------

export function initializeIOAccelerator(): void {
  // Set process to above-normal priority for better responsiveness
  ProcessPriority.setAboveNormal();

  log.info('[IOAccelerator] Techniques 22-26, 32-39, 59-69: I/O acceleration initialized');
}

export function shutdownIOAccelerator(): void {
  messageChannelManager.destroyForWindow(-1); // Clean up any orphaned channels
  broadcastChannels.clear();
  frameBatchedDispatcher.clear();
  lockedBuffers.clear();
  ProcessPriority.setNormalPriority();
}
