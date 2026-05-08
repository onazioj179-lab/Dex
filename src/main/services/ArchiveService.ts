// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Native archive support service.
//
// Goals (May 2026 sweep):
//   - First-class ZIP read / extract / create using only Node built-ins.
//     No third-party deps to keep the installer small and avoid CVE churn.
//   - Best-effort 7z and RAR via system binaries (`7z`, `7za`, `unrar`,
//     `rar`) when present. Gracefully reports "external tool missing"
//     instead of crashing — DEX itself never bundles a RAR licence.
//   - Wires into File Explorer through IPC channels prefixed `archive:*`.
//
// Security:
//   - All extraction paths are sanitised against zip-slip (`..`, absolute
//     paths) before any write.
//   - Compressed/uncompressed size ratio capped to defuse zip-bombs.
//   - The system-tool path uses an allow-list of binary names and refuses
//     anything containing path separators / shell metacharacters.

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { spawn, spawnSync } from 'child_process';
import log from 'electron-log';

const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const ZIP_BOMB_RATIO = 100; // refuse if uncompressed > 100x compressed
const ZIP_BOMB_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB hard cap per entry

export type ArchiveFormat = 'zip' | '7z' | 'rar' | 'tar' | 'unknown';

export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  modified: number;
}

export interface ArchiveListResult {
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  /** When false the archive needs an external tool not currently installed. */
  supported: boolean;
  /** Human-readable note (missing tool, partial support, etc.). */
  note?: string;
}

export interface ArchiveOperationResult {
  success: boolean;
  entryCount: number;
  outputPath: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function detectFormat(filePath: string): ArchiveFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.apk')) return 'zip';
  if (lower.endsWith('.7z')) return '7z';
  if (lower.endsWith('.rar')) return 'rar';
  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar.bz2')) return 'tar';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// External tool discovery (cached)
// ---------------------------------------------------------------------------

const EXTERNAL_TOOL_CACHE: Record<string, string | false> = {};

/**
 * Probes for an external command on PATH. Allow-list only — names that
 * contain anything other than [a-z0-9_-] are rejected. Returns the resolved
 * binary name (string) when found, or `false` when not.
 */
function findTool(name: string): string | false {
  if (!/^[a-z0-9_-]+$/.test(name)) return false;
  if (name in EXTERNAL_TOOL_CACHE) return EXTERNAL_TOOL_CACHE[name];
  const probeArgs = ['--help'];
  try {
    const result = spawnSync(name, probeArgs, { stdio: 'ignore', timeout: 4000, shell: false });
    const ok = result.status === 0 || result.status === 1; // many tools exit 1 on --help
    EXTERNAL_TOOL_CACHE[name] = ok ? name : false;
    return EXTERNAL_TOOL_CACHE[name];
  } catch {
    EXTERNAL_TOOL_CACHE[name] = false;
    return false;
  }
}

function findSevenZip(): string | false {
  return findTool('7z') || findTool('7za');
}

function findUnrar(): string | false {
  return findTool('unrar') || findTool('unar');
}

// ---------------------------------------------------------------------------
// ZIP — pure-node reader
// ---------------------------------------------------------------------------

interface CentralDirEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  modified: number;
  isDirectory: boolean;
}

function readZipCentralDirectory(buffer: Buffer): CentralDirEntry[] {
  // Find End-of-Central-Directory record (search backwards from end, max 64K).
  const maxScan = Math.min(buffer.length, 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= buffer.length - maxScan && i >= 0; i--) {
    if (buffer.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIR_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record).');

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (cdOffset + cdSize > buffer.length) throw new Error('ZIP central directory out of bounds.');

  const entries: CentralDirEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(p) !== ZIP_CENTRAL_DIR_SIG) {
      throw new Error('ZIP central directory signature mismatch.');
    }
    const compressionMethod = buffer.readUInt16LE(p + 10);
    const dosTime = buffer.readUInt16LE(p + 12);
    const dosDate = buffer.readUInt16LE(p + 14);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const uncompressedSize = buffer.readUInt32LE(p + 24);
    const fileNameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localHeaderOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.slice(p + 46, p + 46 + fileNameLen).toString('utf8');

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      modified: dosToUnix(dosDate, dosTime),
      isDirectory: name.endsWith('/'),
    });

    p += 46 + fileNameLen + extraLen + commentLen;
  }
  return entries;
}

function dosToUnix(dosDate: number, dosTime: number): number {
  // DOS date: bits 0-4 day, 5-8 month, 9-15 year (since 1980).
  // DOS time: bits 0-4 sec/2, 5-10 min, 11-15 hour.
  const day = dosDate & 0x1f;
  const month = ((dosDate >> 5) & 0x0f) - 1;
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  const sec = (dosTime & 0x1f) * 2;
  const min = (dosTime >> 5) & 0x3f;
  const hour = (dosTime >> 11) & 0x1f;
  return new Date(year, month, day, hour, min, sec).getTime();
}

function readLocalFileData(buffer: Buffer, entry: CentralDirEntry): Buffer {
  const lf = entry.localHeaderOffset;
  if (buffer.readUInt32LE(lf) !== ZIP_LOCAL_FILE_HEADER_SIG) {
    throw new Error('ZIP local-file-header signature mismatch.');
  }
  const fileNameLen = buffer.readUInt16LE(lf + 26);
  const extraLen = buffer.readUInt16LE(lf + 28);
  const dataStart = lf + 30 + fileNameLen + extraLen;
  return buffer.slice(dataStart, dataStart + entry.compressedSize);
}

function inflateEntry(buffer: Buffer, entry: CentralDirEntry): Buffer {
  const compressed = readLocalFileData(buffer, entry);
  if (entry.compressionMethod === 0) return compressed; // stored
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed); // deflate
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

// ---------------------------------------------------------------------------
// ZIP — pure-node writer (stored + deflate, no encryption)
// ---------------------------------------------------------------------------

interface PendingZipEntry {
  name: string;
  data: Buffer;
  compressed: Buffer;
  method: number;
  crc32: number;
  modified: Date;
  localOffset: number;
}

function unixToDos(date: Date): { dosDate: number; dosTime: number } {
  const year = Math.max(0, date.getFullYear() - 1980);
  const dosDate = ((year & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  return { dosDate, dosTime };
}

const CRC32_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function buildZip(files: { name: string; absPath: string }[]): Promise<Buffer> {
  const entries: PendingZipEntry[] = [];
  for (const f of files) {
    const stat = fs.statSync(f.absPath);
    if (stat.isDirectory()) continue;
    const data = fs.readFileSync(f.absPath);
    const compressed = zlib.deflateRawSync(data, { level: 6 });
    const useStore = compressed.length >= data.length;
    entries.push({
      name: f.name.replace(/\\/g, '/'),
      data,
      compressed: useStore ? data : compressed,
      method: useStore ? 0 : 8,
      crc32: crc32(data),
      modified: stat.mtime,
      localOffset: 0,
    });
  }

  const chunks: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    e.localOffset = offset;
    const nameBuf = Buffer.from(e.name, 'utf8');
    const { dosDate, dosTime } = unixToDos(e.modified);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // bit 11 = UTF-8
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(e.crc32, 14);
    local.writeUInt32LE(e.compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    chunks.push(local, nameBuf, e.compressed);
    offset += local.length + nameBuf.length + e.compressed.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const { dosDate, dosTime } = unixToDos(e.modified);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(ZIP_CENTRAL_DIR_SIG, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8); // bit 11 = UTF-8
    cd.writeUInt16LE(e.method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(e.crc32, 16);
    cd.writeUInt32LE(e.compressed.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(e.localOffset, 42);
    chunks.push(cd, nameBuf);
    offset += cd.length + nameBuf.length;
  }
  const cdSize = offset - cdStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_END_OF_CENTRAL_DIR_SIG, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Path safety (zip-slip)
// ---------------------------------------------------------------------------

export function safeJoin(targetDir: string, entryName: string): string | null {
  const cleaned = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.split('/').some((seg) => seg === '..')) return null;
  const resolved = path.resolve(targetDir, cleaned);
  const base = path.resolve(targetDir) + path.sep;
  if (!resolved.startsWith(base) && resolved !== path.resolve(targetDir)) return null;
  return resolved;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ArchiveService {
  async list(filePath: string): Promise<ArchiveListResult> {
    const format = detectFormat(filePath);
    if (format === 'zip') {
      const buffer = fs.readFileSync(filePath);
      const cd = readZipCentralDirectory(buffer);
      return {
        format,
        supported: true,
        entries: cd.map((e) => ({
          name: e.name,
          size: e.uncompressedSize,
          compressedSize: e.compressedSize,
          isDirectory: e.isDirectory,
          modified: e.modified,
        })),
      };
    }
    if (format === '7z') {
      const tool = findSevenZip();
      if (!tool) return { format, supported: false, entries: [], note: '7-Zip not installed.' };
      return this.listViaSevenZip(filePath, tool);
    }
    if (format === 'rar') {
      const tool = findUnrar();
      if (!tool) return { format, supported: false, entries: [], note: 'unrar / unar not installed.' };
      return { format, supported: true, entries: [], note: 'Listing RAR via external tool — extract to enumerate.' };
    }
    return { format, supported: false, entries: [], note: 'Unsupported archive format.' };
  }

  async extract(filePath: string, outputDir: string): Promise<ArchiveOperationResult> {
    const format = detectFormat(filePath);
    fs.mkdirSync(outputDir, { recursive: true });

    if (format === 'zip') {
      try {
        const buffer = fs.readFileSync(filePath);
        const entries = readZipCentralDirectory(buffer);
        let count = 0;
        for (const entry of entries) {
          if (entry.uncompressedSize > ZIP_BOMB_MAX_BYTES) {
            throw new Error(`Refusing entry > ${ZIP_BOMB_MAX_BYTES} bytes: ${entry.name}`);
          }
          if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > ZIP_BOMB_RATIO) {
            throw new Error(`Refusing zip-bomb-ratio entry: ${entry.name}`);
          }
          const dest = safeJoin(outputDir, entry.name);
          if (!dest) throw new Error(`Refusing unsafe path: ${entry.name}`);
          if (entry.isDirectory) {
            fs.mkdirSync(dest, { recursive: true });
            continue;
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const data = inflateEntry(buffer, entry);
          fs.writeFileSync(dest, data);
          count++;
        }
        return { success: true, entryCount: count, outputPath: outputDir };
      } catch (e) {
        const error = (e as Error).message;
        log.error('[ArchiveService] zip extract failed:', error);
        return { success: false, entryCount: 0, outputPath: outputDir, error };
      }
    }

    if (format === '7z') {
      const tool = findSevenZip();
      if (!tool) {
        return { success: false, entryCount: 0, outputPath: outputDir, error: '7-Zip not installed.' };
      }
      return this.runExternal(tool, ['x', filePath, `-o${outputDir}`, '-y'], outputDir);
    }
    if (format === 'rar') {
      const tool = findUnrar();
      if (!tool) {
        return { success: false, entryCount: 0, outputPath: outputDir, error: 'unrar / unar not installed.' };
      }
      const args = tool === 'unar'
        ? ['-quiet', '-output-directory', outputDir, '-force-overwrite', filePath]
        : ['x', '-y', filePath, outputDir + path.sep];
      return this.runExternal(tool, args, outputDir);
    }

    return { success: false, entryCount: 0, outputPath: outputDir, error: `Unsupported format: ${format}` };
  }

  /**
   * Build a ZIP from a list of files. `files[i].name` is the in-archive path,
   * `files[i].absPath` is the on-disk source.
   */
  async createZip(files: { name: string; absPath: string }[], outputPath: string): Promise<ArchiveOperationResult> {
    try {
      const buffer = await buildZip(files);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      return { success: true, entryCount: files.length, outputPath };
    } catch (e) {
      const error = (e as Error).message;
      log.error('[ArchiveService] zip create failed:', error);
      return { success: false, entryCount: 0, outputPath, error };
    }
  }

  private listViaSevenZip(filePath: string, tool: string): Promise<ArchiveListResult> {
    return new Promise((resolve) => {
      let stdout = '';
      const child = spawn(tool, ['l', '-slt', filePath], { shell: false });
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.on('error', () => resolve({ format: '7z', supported: false, entries: [], note: '7z spawn failed.' }));
      child.on('close', () => {
        const entries: ArchiveEntry[] = [];
        const blocks = stdout.split(/\r?\n\r?\n/);
        for (const block of blocks) {
          const lines = block.split(/\r?\n/);
          const map: Record<string, string> = {};
          for (const line of lines) {
            const m = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
            if (m) map[m[1].trim()] = m[2].trim();
          }
          if (!map.Path) continue;
          entries.push({
            name: map.Path,
            size: parseInt(map.Size || '0', 10),
            compressedSize: parseInt(map['Packed Size'] || '0', 10),
            isDirectory: (map.Attributes || '').includes('D'),
            modified: map.Modified ? Date.parse(map.Modified) : 0,
          });
        }
        resolve({ format: '7z', supported: true, entries });
      });
    });
  }

  private runExternal(tool: string, args: string[], outputDir: string): Promise<ArchiveOperationResult> {
    return new Promise((resolve) => {
      let stderr = '';
      const child = spawn(tool, args, { shell: false });
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('error', (err) => resolve({ success: false, entryCount: 0, outputPath: outputDir, error: err.message }));
      child.on('close', (code) => {
        if (code === 0) {
          // Best-effort entry count by walking the output dir.
          let count = 0;
          try {
            const walk = (dir: string) => {
              for (const name of fs.readdirSync(dir)) {
                const p = path.join(dir, name);
                if (fs.statSync(p).isDirectory()) walk(p);
                else count++;
              }
            };
            walk(outputDir);
          } catch { /* ignore */ }
          resolve({ success: true, entryCount: count, outputPath: outputDir });
        } else {
          resolve({ success: false, entryCount: 0, outputPath: outputDir, error: stderr.trim() || `exit ${code}` });
        }
      });
    });
  }
}

export const archiveService = new ArchiveService();

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerArchiveIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('archive:detect', (_e, filePath: string) => detectFormat(String(filePath)));
  ipcMain.handle('archive:list', (_e, filePath: string) => archiveService.list(String(filePath)));
  ipcMain.handle('archive:extract', (_e, filePath: string, outputDir: string) =>
    archiveService.extract(String(filePath), String(outputDir))
  );
  ipcMain.handle('archive:create-zip', (_e, files: { name: string; absPath: string }[], outputPath: string) =>
    archiveService.createZip(Array.isArray(files) ? files : [], String(outputPath))
  );
  ipcMain.handle('archive:tools', () => ({
    sevenZip: findSevenZip(),
    unrar: findUnrar(),
  }));
}
