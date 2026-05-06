// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Softero Signature Database
 * 
 * Manages threat signatures for hash-based and pattern-based detection.
 * Includes built-in EICAR test signature and common threat patterns.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from '../utils/Logger';

const logger = new Logger();

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatSignature {
  name: string;
  severity: ThreatSeverity;
  category: string;
  description: string;
}

interface HashSignature extends ThreatSignature {
  hash: string;
}

interface PatternSignature extends ThreatSignature {
  /** Glob pattern for file path matching */
  filePattern?: string;
  /** Extensions this pattern applies to */
  extensions?: string[];
  /** Byte patterns (hex strings) to match in file content */
  bytePatterns?: string[];
  /** Regex patterns to match in text content */
  textPatterns?: string[];
}

// Known test signatures (EICAR standard antivirus test)
const BUILTIN_HASH_SIGNATURES: HashSignature[] = [
  {
    hash: '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
    name: 'EICAR-Test-File',
    severity: 'low',
    category: 'test',
    description: 'EICAR antivirus test file — not harmful',
  },
];

// Pattern-based detections for common threats
const BUILTIN_PATTERN_SIGNATURES: PatternSignature[] = [
  {
    name: 'Trojan.AutoRun',
    severity: 'high',
    category: 'trojan',
    description: 'Autorun.inf that executes hidden programs',
    filePattern: '**/autorun.inf',
    textPatterns: [
      'shellexecute',
      'open=.*\\.exe',
    ],
  },
  {
    name: 'Exploit.DoubleExtension',
    severity: 'medium',
    category: 'social-engineering',
    description: 'File with double extension to disguise executable',
    filePattern: '**/*.{jpg,png,pdf,doc,txt}.{exe,scr,bat,cmd,ps1,vbs}',
  },
  {
    name: 'Malware.CryptoMiner',
    severity: 'high',
    category: 'cryptominer',
    description: 'Cryptocurrency mining script',
    extensions: ['.js', '.html', '.htm'],
    textPatterns: [
      'coinhive\\.min\\.js',
      'CoinHive\\.Anonymous',
      'cryptonight\\.wasm',
      'minero\\.cc',
    ],
  },
  {
    name: 'Suspect.PowerShellDownloader',
    severity: 'high',
    category: 'downloader',
    description: 'PowerShell script downloading and executing remote code',
    extensions: ['.ps1', '.bat', '.cmd'],
    textPatterns: [
      'Invoke-WebRequest.*\\|.*Invoke-Expression',
      'IEX\\s*\\(.*Net\\.WebClient.*DownloadString',
      'Start-BitsTransfer.*-Source.*http',
      'certutil.*-urlcache.*-split.*-f',
    ],
  },
  {
    name: 'Suspect.VBSDropper',
    severity: 'high',
    category: 'dropper',
    description: 'VBS script that drops and executes files',
    extensions: ['.vbs', '.vbe', '.wsf'],
    textPatterns: [
      'CreateObject\\("WScript\\.Shell"\\)',
      'CreateObject\\("Scripting\\.FileSystemObject"\\)',
      '\\.Run\\s+".*\\.exe',
    ],
  },
  {
    name: 'Suspect.BatchObfuscation',
    severity: 'medium',
    category: 'obfuscation',
    description: 'Heavily obfuscated batch script',
    extensions: ['.bat', '.cmd'],
    textPatterns: [
      '(%[a-z~]:[~][0-9]+,[0-9]+%){5,}',
      'set\\s+"[a-z]=[^"]{50,}"',
    ],
  },
  {
    name: 'PUP.BrowserHijack',
    severity: 'medium',
    category: 'pup',
    description: 'Browser hijacker modifying search/homepage settings',
    extensions: ['.js', '.json'],
    textPatterns: [
      '"homepage_url":\\s*"https?://[^"]*search[^"]*"',
      'chrome\\.storage\\..*set.*homepage',
    ],
  },
];

export class SofteroSignatures {
  private hashMap: Map<string, ThreatSignature> = new Map();
  private patterns: PatternSignature[] = [];
  private customSignaturesPath: string;

  constructor() {
    this.customSignaturesPath = path.join(
      app.getPath('userData'),
      'softero',
      'custom-signatures.json'
    );
  }

  async initialize(): Promise<void> {
    // Load built-in signatures
    for (const sig of BUILTIN_HASH_SIGNATURES) {
      this.hashMap.set(sig.hash, {
        name: sig.name,
        severity: sig.severity,
        category: sig.category,
        description: sig.description,
      });
    }
    this.patterns = [...BUILTIN_PATTERN_SIGNATURES];

    // Load custom signatures
    await this.loadCustomSignatures();

    logger.info(`[Softero] Loaded ${this.hashMap.size} hash signatures, ${this.patterns.length} pattern signatures`);
  }

  matchHash(hash: string): ThreatSignature | null {
    return this.hashMap.get(hash.toLowerCase()) || null;
  }

  matchPattern(filePath: string, buffer: Buffer): ThreatSignature | null {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    for (const pattern of this.patterns) {
      // Check extension filter
      if (pattern.extensions && !pattern.extensions.includes(ext)) {
        continue;
      }

      // Check file pattern
      if (pattern.filePattern) {
        if (!this.matchGlob(fileName, pattern.filePattern)) {
          // Also check for double-extension pattern
          const parts = fileName.split('.');
          if (parts.length < 3 && pattern.name === 'Exploit.DoubleExtension') continue;
          if (parts.length >= 3 && pattern.name !== 'Exploit.DoubleExtension') continue;
        }
      }

      // Check byte patterns
      if (pattern.bytePatterns) {
        for (const hexPattern of pattern.bytePatterns) {
          const bytes = Buffer.from(hexPattern, 'hex');
          if (buffer.includes(bytes)) {
            return pattern;
          }
        }
      }

      // Check text patterns
      if (pattern.textPatterns) {
        try {
          const text = buffer.toString('utf8', 0, Math.min(buffer.length, 256 * 1024));
          for (const textPattern of pattern.textPatterns) {
            const regex = new RegExp(textPattern, 'i');
            if (regex.test(text)) {
              return pattern;
            }
          }
        } catch {
          // Binary file, skip text patterns
        }
      }
    }

    return null;
  }

  getSignatureCount(): number {
    return this.hashMap.size + this.patterns.length;
  }

  // Simple glob matching for file patterns
  private matchGlob(fileName: string, pattern: string): boolean {
    // Handle ** prefix
    const cleanPattern = pattern.replace(/^\*\*\//, '');
    // Convert glob to regex
    const regexStr = cleanPattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\{([^}]+)\}/g, (_, group) => `(?:${group.replace(/,/g, '|')})`)
      .replace(/\?/g, '.');
    try {
      return new RegExp(`^${regexStr}$`, 'i').test(fileName);
    } catch {
      return false;
    }
  }

  private async loadCustomSignatures(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.customSignaturesPath, 'utf8');
      const custom = JSON.parse(data);
      if (custom.hashes) {
        for (const sig of custom.hashes) {
          if (sig.hash && sig.name) {
            this.hashMap.set(sig.hash.toLowerCase(), sig);
          }
        }
      }
      if (custom.patterns) {
        this.patterns.push(...custom.patterns);
      }
    } catch {
      // No custom signatures yet
    }
  }
}
