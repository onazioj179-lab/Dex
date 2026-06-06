// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Plugin Publisher (Track C1)
// ---------------------------------------------------------------------------
// Packages a plugin source directory into a single deterministic .dexplug
// envelope (JSON: manifest + base64 file contents + sha256 + optional
// signature). Verifies and extracts envelopes, and runs a forbidden-pattern
// scan on plugin code before install.
//
// Filesystem access is injected so the module is unit-testable without
// touching the real disk.
// ===========================================================================

import { createHash } from 'crypto';
import type { SignatureBlock } from '../security/codesign';

export interface PluginPublishedMeta {
  author: string;
  version: string;
  /** SHA-256 of the canonicalized contents block. */
  sha256: string;
  /** Optional Authenticode / codesign / detached signature, base64. */
  signature?: string;
  downloadUrl?: string;
  publishedAt: number;
  downloads?: number;
}

export interface PluginManifestLite {
  id: string;
  name: string;
  version: string;
  author?: string | { name: string };
  main?: string;
  /** Free-form fields are preserved verbatim. */
  [k: string]: unknown;
}

export interface DexPlugEnvelope {
  /** Format identifier. Always 'dexplug-v1'. */
  format: 'dexplug-v1';
  manifest: PluginManifestLite;
  /** path -> base64 contents */
  files: Record<string, string>;
  published: PluginPublishedMeta;
  /**
   * DEX code-signing block (added by `dex sign`). Trust comes from this, not the
   * origin: the install gate verifies it against the trust store before any
   * unpack. Absent => the package is unsigned and the gate rejects it.
   */
  signature?: SignatureBlock;
}

export interface FsLike {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  readDir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }>;
  exists(path: string): Promise<boolean>;
  mkdirP(path: string): Promise<void>;
  join(...parts: string[]): string;
}

export interface PackageOptions {
  /** Override Date.now in tests. */
  now?: () => number;
  /** Optional signature to embed (base64). */
  signature?: string;
  /** Optional published download URL. */
  downloadUrl?: string;
  /** Allow source files larger than this (bytes). Default 5MB. */
  maxFileBytes?: number;
}

// ---------------------------------------------------------------------------
// Forbidden-pattern scanner. Mirrors PluginController's posture; intentionally
// conservative. Runs on every text file in the package.
// ---------------------------------------------------------------------------

export const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\beval\s*\(/, reason: 'eval() is forbidden in plugins' },
  { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() is forbidden' },
  { pattern: /child_process/, reason: 'child_process is not allowed' },
  { pattern: /\brequire\s*\(\s*['"]child_process['"]/, reason: 'child_process require is not allowed' },
  { pattern: /process\.binding\s*\(/, reason: 'process.binding() is not allowed' },
  { pattern: /__proto__\s*=/, reason: 'prototype mutation is not allowed' },
  { pattern: /Object\.setPrototypeOf\s*\(/, reason: 'setPrototypeOf is not allowed' },
];

export interface ScanIssue {
  file: string;
  line: number;
  reason: string;
  excerpt: string;
}

export function scanFiles(files: Record<string, string>): ScanIssue[] {
  const issues: ScanIssue[] = [];
  for (const [path, base64] of Object.entries(files)) {
    if (!isTextFile(path)) continue;
    let decoded = '';
    try {
      decoded = Buffer.from(base64, 'base64').toString('utf8');
    } catch { continue; }
    const lines = decoded.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of FORBIDDEN_PATTERNS) {
        if (rule.pattern.test(line)) {
          issues.push({ file: path, line: i + 1, reason: rule.reason, excerpt: line.trim().slice(0, 200) });
        }
      }
    }
  }
  return issues;
}

function isTextFile(path: string): boolean {
  return /\.(js|ts|tsx|jsx|json|md|css|html|txt|yml|yaml)$/i.test(path);
}

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

const MANIFEST_NAMES = ['manifest.json', 'plugin.json', 'package.json'];

export async function packagePlugin(
  srcDir: string,
  fs: FsLike,
  options: PackageOptions = {},
): Promise<DexPlugEnvelope> {
  if (!await fs.exists(srcDir)) {
    throw new Error(`Source directory does not exist: ${srcDir}`);
  }

  // Locate manifest
  let manifestPath: string | null = null;
  for (const name of MANIFEST_NAMES) {
    const candidate = fs.join(srcDir, name);
    if (await fs.exists(candidate)) { manifestPath = candidate; break; }
  }
  if (!manifestPath) {
    throw new Error('No manifest.json / plugin.json / package.json found in source');
  }

  const manifestBytes = await fs.readFile(manifestPath);
  const manifestText = Buffer.from(manifestBytes).toString('utf8');
  let manifest: PluginManifestLite;
  try {
    manifest = JSON.parse(manifestText) as PluginManifestLite;
  } catch {
    throw new Error('Manifest is not valid JSON');
  }
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error('Manifest must include id, name, and version');
  }

  const maxBytes = options.maxFileBytes ?? 5 * 1024 * 1024;
  const files: Record<string, string> = {};
  await collectFiles(srcDir, '', fs, files, maxBytes);

  const sha256 = hashFiles(files);
  const author = typeof manifest.author === 'string'
    ? manifest.author
    : manifest.author?.name ?? 'unknown';

  const envelope: DexPlugEnvelope = {
    format: 'dexplug-v1',
    manifest,
    files,
    published: {
      author,
      version: manifest.version,
      sha256,
      signature: options.signature,
      downloadUrl: options.downloadUrl,
      publishedAt: options.now ? options.now() : Date.now(),
      downloads: 0,
    },
  };
  return envelope;
}

async function collectFiles(
  rootDir: string,
  relPrefix: string,
  fs: FsLike,
  out: Record<string, string>,
  maxBytes: number,
): Promise<void> {
  const dir = relPrefix ? fs.join(rootDir, relPrefix) : rootDir;
  const entries = await fs.readDir(dir);
  for (const name of entries) {
    if (name === '.' || name === '..' || name.startsWith('.git')) continue;
    if (name === 'node_modules') continue;
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    const full = fs.join(rootDir, rel);
    const stat = await fs.stat(full);
    if (stat.isDirectory) {
      await collectFiles(rootDir, rel, fs, out, maxBytes);
    } else if (stat.isFile) {
      const bytes = await fs.readFile(full);
      if (bytes.length > maxBytes) {
        throw new Error(`File exceeds max size (${bytes.length} > ${maxBytes}): ${rel}`);
      }
      out[rel] = Buffer.from(bytes).toString('base64');
    }
  }
}

function hashFiles(files: Record<string, string>): string {
  // Canonicalize: sort by path so identical content -> identical hash.
  const sorted = Object.keys(files).sort();
  const hash = createHash('sha256');
  for (const path of sorted) {
    hash.update(path);
    hash.update('\0');
    hash.update(files[path]);
    hash.update('\0');
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifyResult {
  ok: boolean;
  sha256Ok: boolean;
  scanIssues: ScanIssue[];
  reason?: string;
}

export function verifyEnvelope(envelope: DexPlugEnvelope): VerifyResult {
  if (!envelope || envelope.format !== 'dexplug-v1') {
    return { ok: false, sha256Ok: false, scanIssues: [], reason: 'invalid-format' };
  }
  if (!envelope.manifest || !envelope.files || !envelope.published) {
    return { ok: false, sha256Ok: false, scanIssues: [], reason: 'malformed-envelope' };
  }
  const computed = hashFiles(envelope.files);
  const sha256Ok = computed === envelope.published.sha256;
  const scanIssues = scanFiles(envelope.files);
  const ok = sha256Ok && scanIssues.length === 0;
  return {
    ok,
    sha256Ok,
    scanIssues,
    reason: !sha256Ok ? 'sha256-mismatch' : scanIssues.length > 0 ? 'forbidden-pattern' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export async function extractEnvelope(
  envelope: DexPlugEnvelope,
  destDir: string,
  fs: FsLike,
): Promise<string[]> {
  const verify = verifyEnvelope(envelope);
  if (!verify.ok) {
    throw new Error(`Refusing to extract: ${verify.reason ?? 'invalid'}`);
  }

  const written: string[] = [];
  await fs.mkdirP(destDir);
  for (const [rel, base64] of Object.entries(envelope.files)) {
    if (rel.includes('..')) {
      throw new Error(`Unsafe path in envelope: ${rel}`);
    }
    const target = fs.join(destDir, rel);
    const dir = target.substring(0, target.lastIndexOf('/'));
    if (dir && dir !== destDir) await fs.mkdirP(dir);
    const bytes = Buffer.from(base64, 'base64');
    await fs.writeFile(target, bytes);
    written.push(target);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

export function envelopeToString(env: DexPlugEnvelope): string {
  return JSON.stringify(env);
}

export function parseEnvelope(text: string): DexPlugEnvelope {
  const parsed = JSON.parse(text) as DexPlugEnvelope;
  if (!parsed || parsed.format !== 'dexplug-v1') {
    throw new Error('Not a dexplug-v1 envelope');
  }
  return parsed;
}
