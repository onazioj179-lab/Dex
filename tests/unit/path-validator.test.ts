// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX - PathValidator Security Module Tests
 * ===========================================================================
 *
 * Comprehensive unit tests for the PathValidator class covering:
 * - Path validation within home directory boundaries
 * - Blocked sensitive directory enforcement
 * - Symlink resolution and escape prevention
 * - Scoped path validation
 * - Download URL validation (protocol, SSRF protection)
 * - Storage key sanitization
 * - Filename sanitization
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// ===========================================================================
// Mocks
// ===========================================================================

// Resolve to a platform-absolute path so path.resolve()/path.sep comparisons in
// PathValidator behave identically on POSIX (`/home/testuser`) and Windows
// (`C:\home\testuser`). Using a bare POSIX literal made every "inside home"
// check fail on Windows because path.resolve() re-rooted it onto the C: drive.
const MOCK_HOME = path.resolve('/home/testuser');

vi.mock('os', () => ({
  homedir: vi.fn(() => require('path').resolve('/home/testuser')),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  realpathSync: vi.fn((p: string) => p),
}));

// Import after mocks so the module-level HOME_DIR picks up the mock
import { PathValidator } from '../../src/main/security/PathValidator';
import * as fs from 'fs';

// ===========================================================================
// validatePath Tests
// ===========================================================================

describe('PathValidator.validatePath', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.realpathSync).mockImplementation((p: string) => p as string);
  });

  describe('valid paths within home directory', () => {
    it('accepts a simple file within home', () => {
      const result = PathValidator.validatePath(`${MOCK_HOME}/Documents/test.txt`);
      expect(result).toBe(path.resolve(`${MOCK_HOME}/Documents/test.txt`));
    });

    it('accepts a nested path within home', () => {
      const result = PathValidator.validatePath(`${MOCK_HOME}/Documents/subdir/deep/file.json`);
      expect(result).toBe(path.resolve(`${MOCK_HOME}/Documents/subdir/deep/file.json`));
    });

    it('accepts the home directory itself', () => {
      const result = PathValidator.validatePath(MOCK_HOME);
      expect(result).toBe(MOCK_HOME);
    });

    it('accepts Downloads directory', () => {
      const result = PathValidator.validatePath(`${MOCK_HOME}/Downloads/song.mp3`);
      expect(result).toBe(path.resolve(`${MOCK_HOME}/Downloads/song.mp3`));
    });

    it('resolves relative ../ components and accepts if still in home', () => {
      const result = PathValidator.validatePath(`${MOCK_HOME}/Documents/../Downloads/file.txt`);
      expect(result).toBe(path.resolve(`${MOCK_HOME}/Downloads/file.txt`));
    });
  });

  describe('paths outside home directory (rejected)', () => {
    it('rejects /etc/passwd', () => {
      expect(() => PathValidator.validatePath('/etc/passwd')).toThrow('Access denied: path outside home directory');
    });

    it('rejects root /', () => {
      expect(() => PathValidator.validatePath('/')).toThrow('Access denied: path outside home directory');
    });

    it('rejects /tmp directory', () => {
      expect(() => PathValidator.validatePath('/tmp/somefile')).toThrow('Access denied: path outside home directory');
    });

    it('rejects traversal that escapes home', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/../../etc/shadow`)).toThrow('Access denied: path outside home directory');
    });

    it('rejects another user home directory', () => {
      expect(() => PathValidator.validatePath('/home/otheruser/file.txt')).toThrow('Access denied: path outside home directory');
    });
  });

  describe('blocked sensitive directories', () => {
    it('rejects .ssh directory', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.ssh`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects files inside .ssh', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.ssh/id_rsa`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .gnupg directory', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.gnupg`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects files inside .gnupg', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.gnupg/private-keys-v1.d/key.key`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .aws directory', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.aws`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .aws/credentials', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.aws/credentials`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .config/gcloud', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.config/gcloud`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects files within .config/gcloud', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.config/gcloud/application_default_credentials.json`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .kube directory', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.kube`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .kube/config', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.kube/config`)).toThrow('Access denied: sensitive directory');
    });

    it('rejects .npmrc', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/.npmrc`)).toThrow('Access denied: sensitive directory');
    });
  });

  describe('null byte injection', () => {
    it('rejects path with null byte in the middle', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/file.txt\0.exe`)).toThrow('Invalid path: contains null bytes');
    });

    it('rejects path with null byte at the start', () => {
      expect(() => PathValidator.validatePath(`\0${MOCK_HOME}/file.txt`)).toThrow('Invalid path: contains null bytes');
    });

    it('rejects path with null byte at the end', () => {
      expect(() => PathValidator.validatePath(`${MOCK_HOME}/file.txt\0`)).toThrow('Invalid path: contains null bytes');
    });
  });

  describe('empty and non-string input', () => {
    it('rejects empty string', () => {
      expect(() => PathValidator.validatePath('')).toThrow('Invalid path: empty or non-string input');
    });

    it('rejects null', () => {
      expect(() => PathValidator.validatePath(null as unknown as string)).toThrow('Invalid path: empty or non-string input');
    });

    it('rejects undefined', () => {
      expect(() => PathValidator.validatePath(undefined as unknown as string)).toThrow('Invalid path: empty or non-string input');
    });

    it('rejects number', () => {
      expect(() => PathValidator.validatePath(42 as unknown as string)).toThrow('Invalid path: empty or non-string input');
    });

    it('rejects object', () => {
      expect(() => PathValidator.validatePath({} as unknown as string)).toThrow('Invalid path: empty or non-string input');
    });
  });

  describe('symlink resolution', () => {
    it('resolves symlink and rejects if real path is outside home', () => {
      const symlinkPath = `${MOCK_HOME}/Documents/sneaky-link`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue('/etc/passwd');

      expect(() => PathValidator.validatePath(symlinkPath)).toThrow('Access denied: path outside home directory');
    });

    it('resolves symlink and rejects if real path is in blocked directory', () => {
      const symlinkPath = `${MOCK_HOME}/Documents/key-link`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // realpathSync returns a normalized, platform-separator absolute path;
      // path.join keeps it consistent with how BLOCKED_PATHS is built.
      vi.mocked(fs.realpathSync).mockReturnValue(path.join(MOCK_HOME, '.ssh', 'id_rsa'));

      expect(() => PathValidator.validatePath(symlinkPath)).toThrow('Access denied: sensitive directory');
    });

    it('allows symlink when real path is still within home', () => {
      const symlinkPath = `${MOCK_HOME}/Documents/good-link`;
      const realPath = `${MOCK_HOME}/Downloads/actual-file.txt`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue(realPath);

      const result = PathValidator.validatePath(symlinkPath);
      expect(result).toBe(realPath);
    });

    it('returns the resolved path when symlink target matches resolved path (not a symlink)', () => {
      const regularPath = `${MOCK_HOME}/Documents/regular-file.txt`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue(regularPath);

      const result = PathValidator.validatePath(regularPath);
      expect(result).toBe(regularPath);
    });

    it('swallows OS errors from realpathSync (e.g. race condition)', () => {
      const filePath = `${MOCK_HOME}/Documents/transient.txt`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      // Should not throw - OS errors are swallowed
      const result = PathValidator.validatePath(filePath);
      expect(result).toBe(path.resolve(filePath));
    });

    it('re-throws access-denied errors from symlink resolution', () => {
      const filePath = `${MOCK_HOME}/Documents/tricky.txt`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation(() => {
        throw new Error('Access denied: sensitive directory');
      });

      expect(() => PathValidator.validatePath(filePath)).toThrow('Access denied: sensitive directory');
    });
  });

  describe('requireExists option', () => {
    it('throws when path does not exist and requireExists is true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => PathValidator.validatePath(`${MOCK_HOME}/nonexistent.txt`, { requireExists: true }))
        .toThrow('Path not found');
    });

    it('accepts when path exists and requireExists is true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);

      const result = PathValidator.validatePath(`${MOCK_HOME}/existing.txt`, { requireExists: true });
      expect(result).toBe(path.resolve(`${MOCK_HOME}/existing.txt`));
    });
  });
});

// ===========================================================================
// validateScopedPath Tests
// ===========================================================================

describe('PathValidator.validateScopedPath', () => {
  const scopeDir = `${MOCK_HOME}/Downloads`;

  describe('valid paths within scope', () => {
    it('accepts a file within the scope directory', () => {
      const result = PathValidator.validateScopedPath(`${scopeDir}/file.txt`, scopeDir);
      expect(result).toBe(path.resolve(`${scopeDir}/file.txt`));
    });

    it('accepts a nested file within scope', () => {
      const result = PathValidator.validateScopedPath(`${scopeDir}/sub/deep/file.txt`, scopeDir);
      expect(result).toBe(path.resolve(`${scopeDir}/sub/deep/file.txt`));
    });

    it('accepts path that equals the scope directory exactly', () => {
      const result = PathValidator.validateScopedPath(scopeDir, scopeDir);
      expect(result).toBe(path.resolve(scopeDir));
    });
  });

  describe('paths outside scope (rejected)', () => {
    it('rejects path outside the scope', () => {
      expect(() => PathValidator.validateScopedPath(`${MOCK_HOME}/Documents/file.txt`, scopeDir))
        .toThrow('Access denied: path outside allowed scope');
    });

    it('rejects traversal escape from scope', () => {
      expect(() => PathValidator.validateScopedPath(`${scopeDir}/../Documents/file.txt`, scopeDir))
        .toThrow('Access denied: path outside allowed scope');
    });

    it('rejects path that is parent of scope', () => {
      expect(() => PathValidator.validateScopedPath(MOCK_HOME, scopeDir))
        .toThrow('Access denied: path outside allowed scope');
    });

    it('rejects path with similar prefix but different directory', () => {
      // e.g. /home/testuser/Downloads-evil should not match /home/testuser/Downloads
      expect(() => PathValidator.validateScopedPath(`${scopeDir}-evil/file.txt`, scopeDir))
        .toThrow('Access denied: path outside allowed scope');
    });
  });

  describe('null bytes', () => {
    it('rejects path with null bytes', () => {
      expect(() => PathValidator.validateScopedPath(`${scopeDir}/file\0.txt`, scopeDir))
        .toThrow('Invalid path: contains null bytes');
    });
  });

  describe('empty and non-string input', () => {
    it('rejects empty string', () => {
      expect(() => PathValidator.validateScopedPath('', scopeDir))
        .toThrow('Invalid path: empty or non-string input');
    });

    it('rejects null', () => {
      expect(() => PathValidator.validateScopedPath(null as unknown as string, scopeDir))
        .toThrow('Invalid path: empty or non-string input');
    });

    it('rejects undefined', () => {
      expect(() => PathValidator.validateScopedPath(undefined as unknown as string, scopeDir))
        .toThrow('Invalid path: empty or non-string input');
    });
  });
});

// ===========================================================================
// validateDownloadUrl Tests
// ===========================================================================

describe('PathValidator.validateDownloadUrl', () => {
  describe('valid URLs', () => {
    it('accepts a standard https URL', () => {
      const result = PathValidator.validateDownloadUrl('https://example.com/file.zip');
      expect(result).toBeInstanceOf(URL);
      expect(result.protocol).toBe('https:');
      expect(result.hostname).toBe('example.com');
    });

    it('accepts a standard http URL', () => {
      const result = PathValidator.validateDownloadUrl('http://example.com/path/to/resource');
      expect(result).toBeInstanceOf(URL);
      expect(result.protocol).toBe('http:');
    });

    it('accepts https URL with port', () => {
      const result = PathValidator.validateDownloadUrl('https://example.com:8443/api');
      expect(result).toBeInstanceOf(URL);
      expect(result.port).toBe('8443');
    });

    it('accepts URL with query parameters', () => {
      const result = PathValidator.validateDownloadUrl('https://cdn.example.com/file?token=abc&v=2');
      expect(result).toBeInstanceOf(URL);
      expect(result.searchParams.get('token')).toBe('abc');
    });
  });

  describe('blocked protocols', () => {
    it('rejects ftp protocol', () => {
      expect(() => PathValidator.validateDownloadUrl('ftp://evil.com/file'))
        .toThrow('Invalid URL protocol');
    });

    it('rejects file protocol', () => {
      expect(() => PathValidator.validateDownloadUrl('file:///etc/passwd'))
        .toThrow('Invalid URL protocol');
    });

    it('rejects javascript protocol', () => {
      expect(() => PathValidator.validateDownloadUrl('javascript:alert(1)'))
        .toThrow('Invalid URL protocol');
    });

    it('rejects data protocol', () => {
      expect(() => PathValidator.validateDownloadUrl('data:text/html,<script>alert(1)</script>'))
        .toThrow('Invalid URL protocol');
    });
  });

  describe('localhost and loopback (SSRF prevention)', () => {
    it('rejects localhost', () => {
      expect(() => PathValidator.validateDownloadUrl('http://localhost/admin'))
        .toThrow('Invalid URL: cannot download from localhost');
    });

    it('rejects 127.0.0.1', () => {
      expect(() => PathValidator.validateDownloadUrl('http://127.0.0.1/admin'))
        .toThrow('Invalid URL: cannot download from localhost');
    });

    it('rejects ::1 (IPv6 loopback)', () => {
      expect(() => PathValidator.validateDownloadUrl('http://[::1]/admin'))
        .toThrow('Invalid URL: cannot download from localhost');
    });

    it('rejects 0.0.0.0', () => {
      expect(() => PathValidator.validateDownloadUrl('http://0.0.0.0/admin'))
        .toThrow('Invalid URL: cannot download from localhost');
    });
  });

  describe('private IP ranges (SSRF prevention)', () => {
    it('rejects 10.x.x.x range', () => {
      expect(() => PathValidator.validateDownloadUrl('http://10.0.0.1/internal'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 10.255.255.255', () => {
      expect(() => PathValidator.validateDownloadUrl('http://10.255.255.255/internal'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 192.168.x.x range', () => {
      expect(() => PathValidator.validateDownloadUrl('http://192.168.1.1/router'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 192.168.0.100', () => {
      expect(() => PathValidator.validateDownloadUrl('http://192.168.0.100/secret'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 172.16.x.x (start of private range)', () => {
      expect(() => PathValidator.validateDownloadUrl('http://172.16.0.1/internal'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 172.31.x.x (end of private range)', () => {
      expect(() => PathValidator.validateDownloadUrl('http://172.31.255.255/internal'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('rejects 172.20.0.1 (middle of private range)', () => {
      expect(() => PathValidator.validateDownloadUrl('http://172.20.0.1/internal'))
        .toThrow('Invalid URL: cannot download from private network');
    });

    it('allows 172.15.0.1 (below private range)', () => {
      const result = PathValidator.validateDownloadUrl('http://172.15.0.1/ok');
      expect(result).toBeInstanceOf(URL);
    });

    it('allows 172.32.0.1 (above private range)', () => {
      const result = PathValidator.validateDownloadUrl('http://172.32.0.1/ok');
      expect(result).toBeInstanceOf(URL);
    });
  });

  describe('malformed URLs', () => {
    it('rejects completely invalid URL', () => {
      expect(() => PathValidator.validateDownloadUrl('not a url at all'))
        .toThrow('Invalid URL: malformed URL');
    });

    it('rejects URL missing protocol', () => {
      expect(() => PathValidator.validateDownloadUrl('example.com/file'))
        .toThrow('Invalid URL: malformed URL');
    });

    it('rejects random garbage', () => {
      expect(() => PathValidator.validateDownloadUrl('://'))
        .toThrow('Invalid URL: malformed URL');
    });
  });

  describe('empty and non-string input', () => {
    it('rejects empty string', () => {
      expect(() => PathValidator.validateDownloadUrl(''))
        .toThrow('Invalid URL: empty or non-string input');
    });

    it('rejects null', () => {
      expect(() => PathValidator.validateDownloadUrl(null as unknown as string))
        .toThrow('Invalid URL: empty or non-string input');
    });

    it('rejects undefined', () => {
      expect(() => PathValidator.validateDownloadUrl(undefined as unknown as string))
        .toThrow('Invalid URL: empty or non-string input');
    });

    it('rejects number', () => {
      expect(() => PathValidator.validateDownloadUrl(123 as unknown as string))
        .toThrow('Invalid URL: empty or non-string input');
    });
  });
});

// ===========================================================================
// validateStorageKey Tests
// ===========================================================================

describe('PathValidator.validateStorageKey', () => {
  describe('valid keys', () => {
    it('accepts alphanumeric key', () => {
      expect(PathValidator.validateStorageKey('myKey123')).toBe('myKey123');
    });

    it('accepts key with dots', () => {
      expect(PathValidator.validateStorageKey('app.settings.theme')).toBe('app.settings.theme');
    });

    it('accepts key with hyphens', () => {
      expect(PathValidator.validateStorageKey('my-storage-key')).toBe('my-storage-key');
    });

    it('accepts key with underscores', () => {
      expect(PathValidator.validateStorageKey('my_storage_key')).toBe('my_storage_key');
    });

    it('accepts key with mixed allowed characters', () => {
      expect(PathValidator.validateStorageKey('app.config_v2-beta')).toBe('app.config_v2-beta');
    });

    it('accepts single character key', () => {
      expect(PathValidator.validateStorageKey('k')).toBe('k');
    });

    it('accepts key at exactly 256 characters', () => {
      const key = 'a'.repeat(256);
      expect(PathValidator.validateStorageKey(key)).toBe(key);
    });
  });

  describe('disallowed characters', () => {
    it('rejects key with spaces', () => {
      expect(() => PathValidator.validateStorageKey('my key'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with forward slash', () => {
      expect(() => PathValidator.validateStorageKey('path/key'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with backslash', () => {
      expect(() => PathValidator.validateStorageKey('path\\key'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with unicode characters', () => {
      expect(() => PathValidator.validateStorageKey('clefé'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with emoji', () => {
      expect(() => PathValidator.validateStorageKey('key\u{1F600}'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with angle brackets', () => {
      expect(() => PathValidator.validateStorageKey('<script>'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with null byte', () => {
      expect(() => PathValidator.validateStorageKey('key\0name'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });

    it('rejects key with colon', () => {
      expect(() => PathValidator.validateStorageKey('ns:key'))
        .toThrow('Invalid storage key: contains disallowed characters');
    });
  });

  describe('length limits', () => {
    it('rejects key exceeding 256 characters', () => {
      const longKey = 'a'.repeat(257);
      expect(() => PathValidator.validateStorageKey(longKey))
        .toThrow('Invalid storage key: exceeds maximum length of 256');
    });

    it('rejects very long key (1000 chars)', () => {
      const longKey = 'x'.repeat(1000);
      expect(() => PathValidator.validateStorageKey(longKey))
        .toThrow('Invalid storage key: exceeds maximum length of 256');
    });
  });

  describe('empty and non-string input', () => {
    it('rejects empty string', () => {
      expect(() => PathValidator.validateStorageKey(''))
        .toThrow('Invalid storage key: empty or non-string');
    });

    it('rejects null', () => {
      expect(() => PathValidator.validateStorageKey(null as unknown as string))
        .toThrow('Invalid storage key: empty or non-string');
    });

    it('rejects undefined', () => {
      expect(() => PathValidator.validateStorageKey(undefined as unknown as string))
        .toThrow('Invalid storage key: empty or non-string');
    });
  });
});

// ===========================================================================
// sanitizeFilename Tests
// ===========================================================================

describe('PathValidator.sanitizeFilename', () => {
  describe('basic sanitization', () => {
    it('returns a safe filename unchanged', () => {
      expect(PathValidator.sanitizeFilename('document.pdf')).toBe('document.pdf');
    });

    it('preserves alphanumeric with spaces', () => {
      expect(PathValidator.sanitizeFilename('my file name.txt')).toBe('my file name.txt');
    });
  });

  describe('strips dangerous characters', () => {
    it('replaces < and > with underscore', () => {
      expect(PathValidator.sanitizeFilename('file<tag>.txt')).toBe('file_tag_.txt');
    });

    it('replaces colon with underscore', () => {
      expect(PathValidator.sanitizeFilename('file:name.txt')).toBe('file_name.txt');
    });

    it('replaces double quote with underscore', () => {
      expect(PathValidator.sanitizeFilename('file"name.txt')).toBe('file_name.txt');
    });

    it('replaces forward slash with underscore', () => {
      // path.basename strips directory components first, so this tests what remains
      expect(PathValidator.sanitizeFilename('filename.txt')).toBe('filename.txt');
    });

    it('replaces backslash with underscore', () => {
      expect(PathValidator.sanitizeFilename('file\\name.txt')).toBe('file_name.txt');
    });

    it('replaces pipe with underscore', () => {
      expect(PathValidator.sanitizeFilename('file|name.txt')).toBe('file_name.txt');
    });

    it('replaces question mark with underscore', () => {
      expect(PathValidator.sanitizeFilename('file?name.txt')).toBe('file_name.txt');
    });

    it('replaces asterisk with underscore', () => {
      expect(PathValidator.sanitizeFilename('file*name.txt')).toBe('file_name.txt');
    });

    it('replaces multiple dangerous characters at once', () => {
      const sanitized = PathValidator.sanitizeFilename('f<i>l:e"|n\\a?m*e.txt');
      expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
    });
  });

  describe('leading dot prevention', () => {
    it('replaces single leading dot', () => {
      const result = PathValidator.sanitizeFilename('.hidden');
      expect(result.startsWith('.')).toBe(false);
      expect(result).toBe('_hidden');
    });

    it('replaces multiple leading dots', () => {
      const result = PathValidator.sanitizeFilename('...hidden');
      expect(result.startsWith('.')).toBe(false);
      expect(result).toBe('_hidden');
    });

    it('preserves dots that are not leading', () => {
      const result = PathValidator.sanitizeFilename('file.name.txt');
      expect(result).toBe('file.name.txt');
    });
  });

  describe('truncation to 255 characters', () => {
    it('truncates filename exceeding 255 characters', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = PathValidator.sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });

    it('does not truncate a 255-character filename', () => {
      const exactName = 'a'.repeat(255);
      const result = PathValidator.sanitizeFilename(exactName);
      expect(result.length).toBe(255);
    });

    it('does not truncate a shorter filename', () => {
      const shortName = 'short.txt';
      expect(PathValidator.sanitizeFilename(shortName)).toBe(shortName);
    });
  });

  describe('null byte removal', () => {
    it('replaces null bytes with underscore', () => {
      const result = PathValidator.sanitizeFilename('file\0name.txt');
      expect(result).not.toContain('\0');
      expect(result).toBe('file_name.txt');
    });

    it('handles null byte before extension', () => {
      const result = PathValidator.sanitizeFilename('malicious\0.exe');
      expect(result).not.toContain('\0');
    });
  });

  describe('empty and non-string input returns fallback', () => {
    it('returns fallback for empty string', () => {
      const result = PathValidator.sanitizeFilename('');
      expect(result).toMatch(/^file_\d+$/);
    });

    it('returns fallback for null', () => {
      const result = PathValidator.sanitizeFilename(null as unknown as string);
      expect(result).toMatch(/^file_\d+$/);
    });

    it('returns fallback for undefined', () => {
      const result = PathValidator.sanitizeFilename(undefined as unknown as string);
      expect(result).toMatch(/^file_\d+$/);
    });

    it('returns fallback for number', () => {
      const result = PathValidator.sanitizeFilename(42 as unknown as string);
      expect(result).toMatch(/^file_\d+$/);
    });
  });

  describe('directory stripping via path.basename', () => {
    it('strips directory path and keeps only filename', () => {
      const result = PathValidator.sanitizeFilename('/etc/passwd');
      expect(result).toBe('passwd');
    });

    it('strips nested directory paths', () => {
      const result = PathValidator.sanitizeFilename('/some/deep/path/file.txt');
      expect(result).toBe('file.txt');
    });
  });
});
