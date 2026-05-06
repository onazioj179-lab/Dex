// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Apple-Inspired Compression Framework
// =============================================================================
// Implements compression algorithms similar to Apple's Compression framework:
// - Fast (LZ4-like): Best for small blocks, 2-3x faster
// - Balanced (LZFSE-like): Matches zlib-5 ratio at 2-3x speed
// - High (LZMA-like): Maximum compression for archival
// - Adaptive: Auto-selects based on data entropy
//
// Features:
// - Buffer compression (single-step, < 8MB)
// - Stream compression (multi-step, for large data)
// - RAM compression (inactive memory pages)
// - Transparent file compression (.dexz format)
// - Dictionary compression for repetitive data
// =============================================================================

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type CompressionAlgorithm = 'fast' | 'balanced' | 'high' | 'adaptive';
export type CompressionMode = 'buffer' | 'stream';

export interface CompressionStats {
  totalCompressedBytes: number;
  totalDecompressedBytes: number;
  bytesSaved: number;
  compressionOperations: number;
  decompressionOperations: number;
  ramPagesCompressed: number;
  ramBytesSaved: number;
  averageRatio: number;
}

export interface RamCompressionStats {
  totalUncompressed: number;
  totalCompressed: number;
  pageCount: number;
  compressionRatio: number;
  bytesSaved: number;
}

export interface CompressedFile {
  originalPath: string;
  originalSize: number;
  compressedSize: number;
  algorithm: string;
  ratio: number;
}

export interface BatchCompressionResult {
  filesProcessed: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  overallRatio: number;
  bytesSaved: number;
  failedFiles: string[];
}

// ---------------------------------------------------------------------------
// NATIVE BRIDGE
// ---------------------------------------------------------------------------

interface DexNative {
  // Buffer compression
  compressBuffer(data: Uint8Array, algorithm?: number): Uint8Array;
  decompressBuffer(data: Uint8Array): Uint8Array;
  
  // Stream compression
  createCompressionStream(algorithm?: number): number;
  streamCompressChunk(streamId: number, data: Uint8Array): Uint8Array;
  finishCompressionStream(streamId: number): Uint8Array;
  createDecompressionStream(): number;
  streamDecompressChunk(streamId: number, data: Uint8Array): Uint8Array;
  finishDecompressionStream(streamId: number): Uint8Array;
  
  // RAM compression
  ramCompressPage(key: string, data: Uint8Array): boolean;
  ramDecompressPage(key: string): Uint8Array | null;
  ramEvictPage(key: string): boolean;
  getRamCompressionStats(): RamCompressionStats;
  
  // File compression
  compressFile(path: string, algorithm?: number): Promise<CompressedFile>;
  decompressFile(compressedPath: string): Promise<string>;
  compressFilesBatch(paths: string[], algorithm?: number): Promise<BatchCompressionResult>;
  
  // Dictionary compression
  addCompressionSample(data: Uint8Array): void;
  buildCompressionDictionary(dictSize?: number): boolean;
  compressWithDictionary(data: Uint8Array): Uint8Array | null;
  decompressWithDictionary(data: Uint8Array): Uint8Array | null;
  
  // Stats
  getCompressionStats(): CompressionStats;
  resetCompressionStats(): void;
}

const getNative = (): DexNative | null => {
  try {
    // Access native module through Electron bridge
    const w = window as any;
    return w.dexNative || w.dex?.native || null;
  } catch {
    return null;
  }
};

// Algorithm to native enum mapping
const ALGORITHM_MAP: Record<CompressionAlgorithm, number> = {
  fast: 0,
  balanced: 1,
  high: 2,
  adaptive: 3,
};

// ---------------------------------------------------------------------------
// COMPRESSION SERVICE
// ---------------------------------------------------------------------------

class CompressionService {
  private native: DexNative | null = null;
  private fallbackEnabled = true;
  
  constructor() {
    this.native = getNative();
  }
  
  // -------------------------------------------------------------------------
  // BUFFER COMPRESSION (single-step, < 8MB)
  // -------------------------------------------------------------------------
  
  /**
   * Compress data in a single step. Best for data under 8MB.
   */
  compressBuffer(data: Uint8Array | ArrayBuffer, algorithm: CompressionAlgorithm = 'balanced'): Uint8Array {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      try {
        return this.native.compressBuffer(input, ALGORITHM_MAP[algorithm]);
      } catch (e) {
        console.warn('[Compression] Native compression failed, using fallback:', e);
      }
    }
    
    // Fallback: use pako or return as-is
    return this.fallbackCompress(input, algorithm);
  }
  
  /**
   * Decompress data in a single step.
   */
  decompressBuffer(data: Uint8Array | ArrayBuffer): Uint8Array {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      try {
        return this.native.decompressBuffer(input);
      } catch (e) {
        console.warn('[Compression] Native decompression failed, using fallback:', e);
      }
    }
    
    return this.fallbackDecompress(input);
  }
  
  // -------------------------------------------------------------------------
  // STREAM COMPRESSION (multi-step, for large data)
  // -------------------------------------------------------------------------
  
  /**
   * Create a compression stream for large data.
   */
  createCompressionStream(algorithm: CompressionAlgorithm = 'balanced'): DEXCompressionStream {
    return new DEXCompressionStream(this.native, ALGORITHM_MAP[algorithm]);
  }
  
  /**
   * Create a decompression stream for large data.
   */
  createDecompressionStream(): DEXDecompressionStream {
    return new DEXDecompressionStream(this.native);
  }
  
  // -------------------------------------------------------------------------
  // RAM COMPRESSION (memory page compression)
  // -------------------------------------------------------------------------
  
  /**
   * Compress inactive memory and store with a key.
   * Returns true if compression saved space.
   */
  ramCompress(key: string, data: Uint8Array | ArrayBuffer): boolean {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      try {
        return this.native.ramCompressPage(key, input);
      } catch {
        return false;
      }
    }
    
    // Fallback: store in memory map
    return this.fallbackRamCompress(key, input);
  }
  
  /**
   * Retrieve and decompress memory by key.
   */
  ramDecompress(key: string): Uint8Array | null {
    if (this.native) {
      try {
        return this.native.ramDecompressPage(key);
      } catch {
        return null;
      }
    }
    
    return this.fallbackRamDecompress(key);
  }
  
  /**
   * Evict a compressed memory page.
   */
  ramEvict(key: string): boolean {
    if (this.native) {
      try {
        return this.native.ramEvictPage(key);
      } catch {
        return false;
      }
    }
    
    return this.fallbackRamEvict(key);
  }
  
  /**
   * Get RAM compression statistics.
   */
  getRamStats(): RamCompressionStats {
    if (this.native) {
      try {
        return this.native.getRamCompressionStats();
      } catch {
        // Fall through
      }
    }
    
    return this.fallbackRamStats;
  }
  
  // -------------------------------------------------------------------------
  // FILE COMPRESSION
  // -------------------------------------------------------------------------
  
  /**
   * Compress a file to .dexz format.
   */
  async compressFile(path: string, algorithm: CompressionAlgorithm = 'balanced'): Promise<CompressedFile> {
    if (this.native) {
      return this.native.compressFile(path, ALGORITHM_MAP[algorithm]);
    }
    
    throw new Error('Native compression required for file operations');
  }
  
  /**
   * Decompress a .dexz file.
   */
  async decompressFile(compressedPath: string): Promise<string> {
    if (this.native) {
      return this.native.decompressFile(compressedPath);
    }
    
    throw new Error('Native compression required for file operations');
  }
  
  /**
   * Compress multiple files in batch.
   */
  async compressFiles(paths: string[], algorithm: CompressionAlgorithm = 'balanced'): Promise<BatchCompressionResult> {
    if (this.native) {
      return this.native.compressFilesBatch(paths, ALGORITHM_MAP[algorithm]);
    }
    
    throw new Error('Native compression required for file operations');
  }
  
  // -------------------------------------------------------------------------
  // DICTIONARY COMPRESSION
  // -------------------------------------------------------------------------
  
  /**
   * Add a sample for dictionary training.
   */
  addSample(data: Uint8Array | ArrayBuffer): void {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      this.native.addCompressionSample(input);
    }
  }
  
  /**
   * Build compression dictionary from samples.
   */
  buildDictionary(dictSize = 65536): boolean {
    if (this.native) {
      return this.native.buildCompressionDictionary(dictSize);
    }
    return false;
  }
  
  /**
   * Compress using trained dictionary.
   */
  compressWithDict(data: Uint8Array | ArrayBuffer): Uint8Array | null {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      return this.native.compressWithDictionary(input);
    }
    return null;
  }
  
  /**
   * Decompress using trained dictionary.
   */
  decompressWithDict(data: Uint8Array | ArrayBuffer): Uint8Array | null {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    if (this.native) {
      return this.native.decompressWithDictionary(input);
    }
    return null;
  }
  
  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------
  
  /**
   * Get overall compression statistics.
   */
  getStats(): CompressionStats {
    if (this.native) {
      try {
        return this.native.getCompressionStats();
      } catch {
        // Fall through
      }
    }
    
    return this.fallbackStats;
  }
  
  /**
   * Reset all statistics.
   */
  resetStats(): void {
    if (this.native) {
      this.native.resetCompressionStats();
    }
    this.fallbackStats = this.createEmptyStats();
    this.fallbackRamStats = this.createEmptyRamStats();
  }
  
  // -------------------------------------------------------------------------
  // FALLBACK IMPLEMENTATIONS (when native not available)
  // -------------------------------------------------------------------------
  
  private fallbackRamMap = new Map<string, Uint8Array>();
  private fallbackStats: CompressionStats = this.createEmptyStats();
  private fallbackRamStats: RamCompressionStats = this.createEmptyRamStats();
  
  private createEmptyStats(): CompressionStats {
    return {
      totalCompressedBytes: 0,
      totalDecompressedBytes: 0,
      bytesSaved: 0,
      compressionOperations: 0,
      decompressionOperations: 0,
      ramPagesCompressed: 0,
      ramBytesSaved: 0,
      averageRatio: 1,
    };
  }
  
  private createEmptyRamStats(): RamCompressionStats {
    return {
      totalUncompressed: 0,
      totalCompressed: 0,
      pageCount: 0,
      compressionRatio: 1,
      bytesSaved: 0,
    };
  }
  
  private fallbackCompress(data: Uint8Array, _algorithm: CompressionAlgorithm): Uint8Array {
    // Simple RLE-like compression for fallback
    if (data.length < 64) return data;
    
    const result: number[] = [];
    let i = 0;
    
    while (i < data.length) {
      const byte = data[i];
      let count = 1;
      
      while (i + count < data.length && data[i + count] === byte && count < 255) {
        count++;
      }
      
      if (count >= 4) {
        // Run-length encode
        result.push(0xFF, count, byte);
        i += count;
      } else {
        result.push(byte);
        i++;
      }
    }
    
    const compressed = new Uint8Array(result);
    
    // Only use if smaller
    if (compressed.length < data.length) {
      this.fallbackStats.compressionOperations++;
      this.fallbackStats.totalDecompressedBytes += data.length;
      this.fallbackStats.totalCompressedBytes += compressed.length;
      this.fallbackStats.bytesSaved += data.length - compressed.length;
      return compressed;
    }
    
    return data;
  }
  
  private fallbackDecompress(data: Uint8Array): Uint8Array {
    // Simple RLE decompression
    const result: number[] = [];
    let i = 0;
    
    while (i < data.length) {
      if (data[i] === 0xFF && i + 2 < data.length) {
        const count = data[i + 1];
        const byte = data[i + 2];
        for (let j = 0; j < count; j++) {
          result.push(byte);
        }
        i += 3;
      } else {
        result.push(data[i]);
        i++;
      }
    }
    
    this.fallbackStats.decompressionOperations++;
    return new Uint8Array(result);
  }
  
  private fallbackRamCompress(key: string, data: Uint8Array): boolean {
    const compressed = this.fallbackCompress(data, 'fast');
    if (compressed.length < data.length) {
      this.fallbackRamMap.set(key, compressed);
      this.fallbackRamStats.pageCount = this.fallbackRamMap.size;
      this.fallbackRamStats.totalUncompressed += data.length;
      this.fallbackRamStats.totalCompressed += compressed.length;
      this.fallbackRamStats.bytesSaved += data.length - compressed.length;
      return true;
    }
    return false;
  }
  
  private fallbackRamDecompress(key: string): Uint8Array | null {
    const compressed = this.fallbackRamMap.get(key);
    if (!compressed) return null;
    return this.fallbackDecompress(compressed);
  }
  
  private fallbackRamEvict(key: string): boolean {
    return this.fallbackRamMap.delete(key);
  }
}

// ---------------------------------------------------------------------------
// STREAM CLASSES
// ---------------------------------------------------------------------------

class DEXCompressionStream {
  private streamId: number | null = null;
  private chunks: Uint8Array[] = [];
  private native: DexNative | null;
  private algorithm: number;
  
  constructor(native: DexNative | null, algorithm: number) {
    this.native = native;
    this.algorithm = algorithm;
    
    if (native) {
      this.streamId = native.createCompressionStream(algorithm);
    }
  }
  
  write(chunk: Uint8Array | ArrayBuffer): void {
    const data = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
    
    if (this.native && this.streamId !== null) {
      this.native.streamCompressChunk(this.streamId, data);
    } else {
      this.chunks.push(data);
    }
  }
  
  finish(): Uint8Array {
    if (this.native && this.streamId !== null) {
      const result = this.native.finishCompressionStream(this.streamId);
      this.streamId = null;
      return result;
    }
    
    // Fallback: concatenate and compress
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return combined; // No compression in fallback
  }
}

class DEXDecompressionStream {
  private streamId: number | null = null;
  private chunks: Uint8Array[] = [];
  private native: DexNative | null;
  
  constructor(native: DexNative | null) {
    this.native = native;
    
    if (native) {
      this.streamId = native.createDecompressionStream();
    }
  }
  
  write(chunk: Uint8Array | ArrayBuffer): void {
    const data = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
    
    if (this.native && this.streamId !== null) {
      this.native.streamDecompressChunk(this.streamId, data);
    } else {
      this.chunks.push(data);
    }
  }
  
  finish(): Uint8Array {
    if (this.native && this.streamId !== null) {
      const result = this.native.finishDecompressionStream(this.streamId);
      this.streamId = null;
      return result;
    }
    
    // Fallback: concatenate
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return combined;
  }
}

// ---------------------------------------------------------------------------
// SINGLETON EXPORT
// ---------------------------------------------------------------------------

export const compression = new CompressionService();

// ---------------------------------------------------------------------------
// ZUSTAND STORE FOR UI
// ---------------------------------------------------------------------------

interface CompressionStoreState {
  stats: CompressionStats;
  ramStats: RamCompressionStats;
  isCompressing: boolean;
  lastOperation: string | null;
  
  // Actions
  refreshStats: () => void;
  setCompressing: (status: boolean) => void;
  setLastOperation: (op: string) => void;
}

export const useCompressionStore = create<CompressionStoreState>((set) => ({
  stats: compression.getStats(),
  ramStats: compression.getRamStats(),
  isCompressing: false,
  lastOperation: null,
  
  refreshStats: () => {
    set({
      stats: compression.getStats(),
      ramStats: compression.getRamStats(),
    });
  },
  
  setCompressing: (status) => set({ isCompressing: status }),
  setLastOperation: (op) => set({ lastOperation: op }),
}));

// ---------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format compression ratio as percentage.
 */
export function formatRatio(ratio: number): string {
  const percent = (1 - ratio) * 100;
  return `${percent.toFixed(1)}% smaller`;
}

/**
 * Estimate best algorithm for data.
 */
export function suggestAlgorithm(data: Uint8Array): CompressionAlgorithm {
  if (data.length < 4096) {
    return 'fast'; // Small data, use fast
  }
  
  // Sample entropy
  const sample = data.slice(0, Math.min(4096, data.length));
  const freq = new Array(256).fill(0);
  for (const byte of sample) {
    freq[byte]++;
  }
  
  let entropy = 0;
  const len = sample.length;
  for (const count of freq) {
    if (count > 0) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
  }
  
  const normalizedEntropy = entropy / 8;
  
  if (normalizedEntropy > 0.95) {
    return 'fast'; // High entropy, won't compress well
  } else if (normalizedEntropy > 0.7) {
    return 'balanced'; // Medium entropy
  } else {
    return 'high'; // Low entropy, compress well
  }
}

// ---------------------------------------------------------------------------
// TRANSPARENT COMPRESSION HOOKS
// ---------------------------------------------------------------------------

/**
 * Auto-compress data before storage.
 */
export function autoCompress(data: Uint8Array | ArrayBuffer): Uint8Array {
  const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  
  // Skip if too small
  if (input.length < 256) return input;
  
  const algorithm = suggestAlgorithm(input);
  return compression.compressBuffer(input, algorithm);
}

/**
 * Auto-decompress data after retrieval.
 */
export function autoDecompress(data: Uint8Array | ArrayBuffer): Uint8Array {
  const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  
  try {
    return compression.decompressBuffer(input);
  } catch {
    // Not compressed, return as-is
    return input;
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

export { DEXCompressionStream, DEXDecompressionStream };
