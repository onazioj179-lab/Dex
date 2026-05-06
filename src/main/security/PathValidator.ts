// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Path Validation & Sanitization
 * ===========================================================================
 * 
 * Centralized path validation to prevent:
 * - Directory traversal attacks (../, ..\\)
 * - Symlink escapes
 * - Null byte injection
 * - Access outside allowed directories
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const HOME_DIR = os.homedir();

/** Directories the app is allowed to read/write within */
const ALLOWED_ROOTS = [
  HOME_DIR,
  path.join(HOME_DIR, 'Documents'),
  path.join(HOME_DIR, 'Downloads'),
  path.join(HOME_DIR, 'Music'),
  path.join(HOME_DIR, 'Pictures'),
  path.join(HOME_DIR, 'Videos'),
  path.join(HOME_DIR, 'Desktop'),
];

/** Sensitive paths that must never be accessed */
const BLOCKED_PATHS = [
  path.join(HOME_DIR, '.ssh'),
  path.join(HOME_DIR, '.gnupg'),
  path.join(HOME_DIR, '.aws'),
  path.join(HOME_DIR, '.config', 'gcloud'),
  path.join(HOME_DIR, '.kube'),
  path.join(HOME_DIR, '.npmrc'),
];

export class PathValidator {
  /**
   * Validate and resolve a path, ensuring it's within allowed boundaries.
   * Returns the resolved absolute path or throws an error.
   */
  static validatePath(inputPath: string, options?: { requireExists?: boolean }): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Invalid path: empty or non-string input');
    }

    // Block null bytes
    if (inputPath.includes('\0')) {
      throw new Error('Invalid path: contains null bytes');
    }

    // Resolve to absolute path (normalises ../ components)
    const resolved = path.resolve(inputPath);

    // Helper: check the resolved/real path against block-list and home-dir boundary
    const assertSafe = (p: string) => {
      for (const blocked of BLOCKED_PATHS) {
        if (p === blocked || p.startsWith(blocked + path.sep)) {
          throw new Error('Access denied: sensitive directory');
        }
      }
      if (!p.startsWith(HOME_DIR)) {
        throw new Error('Access denied: path outside home directory');
      }
    };

    assertSafe(resolved);

    // If the path exists on disk, resolve symlinks and re-validate the real path.
    // path.resolve() does NOT follow symlinks; a symlink inside HOME_DIR could
    // point to ~/.ssh or / and silently pass the first check.
    if (fs.existsSync(resolved)) {
      try {
        const real = fs.realpathSync(resolved);
        if (real !== resolved) {
          assertSafe(real);
          return real; // return the fully-resolved canonical path
        }
      } catch (e: any) {
        // Re-throw our own access-denied errors; swallow OS errors (race, perms)
        if (typeof e?.message === 'string' && e.message.startsWith('Access denied')) throw e;
      }
    }

    // Optionally verify the path exists (checked after symlink resolution)
    if (options?.requireExists && !fs.existsSync(resolved)) {
      throw new Error(`Path not found: ${resolved}`);
    }

    return resolved;
  }

  /**
   * Validate a path is within a specific directory.
   * Used for scoped operations like downloads.
   */
  static validateScopedPath(inputPath: string, scopeDir: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Invalid path: empty or non-string input');
    }

    if (inputPath.includes('\0')) {
      throw new Error('Invalid path: contains null bytes');
    }

    const resolved = path.resolve(inputPath);
    const resolvedScope = path.resolve(scopeDir);

    if (!resolved.startsWith(resolvedScope + path.sep) && resolved !== resolvedScope) {
      throw new Error(`Access denied: path outside allowed scope ${resolvedScope}`);
    }

    return resolved;
  }

  /**
   * Validate a URL for download operations.
   * Only allows http: and https: protocols.
   */
  static validateDownloadUrl(url: string): URL {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: empty or non-string input');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL: malformed URL');
    }

    // Only allow HTTP and HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid URL protocol: ${parsed.protocol} -- only http: and https: allowed`);
    }

    // Block internal network addresses
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
    if (blockedHosts.includes(hostname)) {
      throw new Error('Invalid URL: cannot download from localhost');
    }

    // Block private IP ranges (basic check)
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
      throw new Error('Invalid URL: cannot download from private network');
    }

    return parsed;
  }

  /**
   * Validate a storage key name.
   * Prevents injection of special characters.
   */
  static validateStorageKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid storage key: empty or non-string');
    }

    // Only allow alphanumeric, dots, hyphens, underscores
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new Error('Invalid storage key: contains disallowed characters');
    }

    // Max key length
    if (key.length > 256) {
      throw new Error('Invalid storage key: exceeds maximum length of 256');
    }

    return key;
  }

  /**
   * Sanitize a filename (strip directory components, dangerous chars).
   */
  static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return `file_${Date.now()}`;
    }

    return path.basename(filename)
      .replace(/[<>:"/\\|?*\0]/g, '_')  // Replace dangerous chars
      .replace(/^\.+/, '_')              // Don't start with dots
      .slice(0, 255);                    // Max filename length
  }
}
