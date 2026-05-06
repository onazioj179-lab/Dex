// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Softero — DEX Internal Antivirus Engine
 * 
 * Real-time background file scanner with:
 * - Signature-based malware detection (SHA-256 hash matching)
 * - Heuristic pattern analysis (suspicious file structures)
 * - Quarantine management with safe restore
 * - Scheduled full/quick scans
 * - Real-time file system monitoring
 */

import log from 'electron-log';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger';
import { SofteroSignatures, ThreatSignature, ThreatSeverity } from './SofteroSignatures';

const logger = new Logger();

export interface ScanResult {
  filePath: string;
  status: 'clean' | 'threat' | 'suspicious' | 'error';
  threatName?: string;
  severity?: ThreatSeverity;
  detectionMethod?: 'signature' | 'heuristic' | 'pattern';
  hash?: string;
  size?: number;
  timestamp: number;
}

export interface ScanProgress {
  phase: 'idle' | 'scanning' | 'complete' | 'cancelled';
  scannedFiles: number;
  totalFiles: number;
  threatsFound: number;
  currentFile: string;
  startTime: number;
  elapsedMs: number;
}

export interface QuarantineEntry {
  id: string;
  originalPath: string;
  quarantinePath: string;
  threatName: string;
  severity: ThreatSeverity;
  detectionMethod: string;
  hash: string;
  size: number;
  quarantinedAt: number;
  canRestore: boolean;
}

export interface SofteroConfig {
  realTimeProtection: boolean;
  scanOnStartup: boolean;
  maxFileSizeMB: number;
  excludedPaths: string[];
  excludedExtensions: string[];
  scanDepth: number;
  quarantineMaxSizeMB: number;
  heuristicSensitivity: 'low' | 'medium' | 'high';
}

const DEFAULT_CONFIG: SofteroConfig = {
  realTimeProtection: true,
  scanOnStartup: false,
  maxFileSizeMB: 100,
  excludedPaths: [],
  excludedExtensions: ['.log', '.tmp'],
  scanDepth: 10,
  quarantineMaxSizeMB: 500,
  heuristicSensitivity: 'medium',
};

// Suspicious patterns for heuristic detection
const HEURISTIC_PATTERNS = {
  // Executable content in non-executable files
  peHeader: Buffer.from([0x4D, 0x5A]), // MZ header
  elfHeader: Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF
  // Suspicious script patterns  
  scriptPatterns: [
    /powershell\s+-(?:enc|encodedcommand)/i,
    /cmd\.exe\s+\/c/i,
    /\beval\s*\(\s*atob\s*\(/i,
    /document\.write\s*\(\s*unescape/i,
    /\bWScript\.Shell\b/i,
    /\bnew\s+ActiveXObject\b/i,
    /fromCharCode\s*\(\s*\d+\s*(?:,\s*\d+\s*){20,}/i,
  ],
  // Known obfuscation markers
  obfuscation: [
    /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){30,}/i,
    /String\.fromCharCode\s*\(.*\){5,}/i,
  ],
};

// Extensions that should be checked for executable content
const EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.wsf',
  '.msi', '.scr', '.com', '.pif', '.hta', '.cpl',
]);

export class Softero {
  private config: SofteroConfig;
  private signatures: SofteroSignatures;
  private quarantine: Map<string, QuarantineEntry> = new Map();
  private scanHistory: ScanResult[] = [];
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private scanning = false;
  private scanCancelled = false;
  private progress: ScanProgress = {
    phase: 'idle',
    scannedFiles: 0,
    totalFiles: 0,
    threatsFound: 0,
    currentFile: '',
    startTime: 0,
    elapsedMs: 0,
  };

  private quarantineDir: string;
  private configPath: string;
  private quarantineDbPath: string;

  constructor() {
    const dataDir = path.join(app.getPath('userData'), 'softero');
    this.quarantineDir = path.join(dataDir, 'quarantine');
    this.configPath = path.join(dataDir, 'config.json');
    this.quarantineDbPath = path.join(dataDir, 'quarantine-db.json');

    this.config = DEFAULT_CONFIG;
    this.signatures = new SofteroSignatures();
  }

  async initialize(): Promise<void> {
    logger.info('[Softero] Initializing antivirus engine');

    // Ensure directories exist
    await fs.promises.mkdir(this.quarantineDir, { recursive: true });

    // Load config
    await this.loadConfig();

    // Load quarantine database
    await this.loadQuarantineDb();

    // Initialize signatures
    await this.signatures.initialize();

    // Register IPC handlers
    this.registerIPC();

    // Start real-time protection if enabled
    if (this.config.realTimeProtection) {
      this.startRealTimeProtection();
    }

    logger.success('[Softero] Antivirus engine initialized');
  }

  // ─── File Scanning ────────────────────────────────────────────

  async scanFile(filePath: string): Promise<ScanResult> {
    const result: ScanResult = {
      filePath,
      status: 'clean',
      timestamp: Date.now(),
    };

    try {
      // Validate path exists
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return result;

      // Skip if too large
      if (stat.size > this.config.maxFileSizeMB * 1024 * 1024) {
        return result;
      }

      // Skip excluded extensions
      const ext = path.extname(filePath).toLowerCase();
      if (this.config.excludedExtensions.includes(ext)) {
        return result;
      }

      result.size = stat.size;

      // Read file for scanning
      const buffer = await fs.promises.readFile(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      result.hash = hash;

      // 1. Signature-based detection (fastest)
      const sigMatch = this.signatures.matchHash(hash);
      if (sigMatch) {
        result.status = 'threat';
        result.threatName = sigMatch.name;
        result.severity = sigMatch.severity;
        result.detectionMethod = 'signature';
        logger.warn(`[Softero] THREAT DETECTED: ${sigMatch.name} in ${filePath}`);
        this.notifyThreat(result);
        return result;
      }

      // 2. Pattern-based detection
      const patternMatch = this.signatures.matchPattern(filePath, buffer);
      if (patternMatch) {
        result.status = 'threat';
        result.threatName = patternMatch.name;
        result.severity = patternMatch.severity;
        result.detectionMethod = 'pattern';
        logger.warn(`[Softero] PATTERN MATCH: ${patternMatch.name} in ${filePath}`);
        this.notifyThreat(result);
        return result;
      }

      // 3. Heuristic analysis 
      const heuristicResult = this.runHeuristics(filePath, buffer, ext);
      if (heuristicResult) {
        result.status = 'suspicious';
        result.threatName = heuristicResult;
        result.severity = 'medium';
        result.detectionMethod = 'heuristic';
        logger.warn(`[Softero] SUSPICIOUS: ${heuristicResult} in ${filePath}`);
        this.notifyThreat(result);
        return result;
      }

    } catch (err) {
      result.status = 'error';
      logger.error(`[Softero] Scan error for ${filePath}`, err);
    }

    return result;
  }

  async scanDirectory(dirPath: string, recursive = true): Promise<ScanResult[]> {
    if (this.scanning) {
      logger.warn('[Softero] Scan already in progress');
      return [];
    }

    this.scanning = true;
    this.scanCancelled = false;
    const results: ScanResult[] = [];

    try {
      // Collect files first
      const files = await this.collectFiles(dirPath, recursive);
      
      this.progress = {
        phase: 'scanning',
        scannedFiles: 0,
        totalFiles: files.length,
        threatsFound: 0,
        currentFile: '',
        startTime: Date.now(),
        elapsedMs: 0,
      };

      this.emitProgress();

      // Scan files in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (this.scanCancelled) {
          this.progress.phase = 'cancelled';
          this.emitProgress();
          break;
        }

        const batch = files.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(f => this.scanFile(f))
        );

        for (const result of batchResults) {
          results.push(result);
          if (result.status === 'threat' || result.status === 'suspicious') {
            this.progress.threatsFound++;
          }
        }

        this.progress.scannedFiles = Math.min(i + BATCH_SIZE, files.length);
        this.progress.currentFile = batch[batch.length - 1] || '';
        this.progress.elapsedMs = Date.now() - this.progress.startTime;
        this.emitProgress();
      }

      if (!this.scanCancelled) {
        this.progress.phase = 'complete';
        this.progress.elapsedMs = Date.now() - this.progress.startTime;
        this.emitProgress();
      }

    } finally {
      this.scanning = false;
      this.scanHistory.push(...results);
      // Keep only last 10000 results
      if (this.scanHistory.length > 10000) {
        this.scanHistory = this.scanHistory.slice(-10000);
      }
    }

    return results;
  }

  async quickScan(): Promise<ScanResult[]> {
    logger.info('[Softero] Starting quick scan');
    const scanPaths = [
      app.getPath('downloads'),
      app.getPath('temp'),
      app.getPath('desktop'),
    ];

    const allResults: ScanResult[] = [];
    for (const scanPath of scanPaths) {
      try {
        await fs.promises.access(scanPath);
        const results = await this.scanDirectory(scanPath, false);
        allResults.push(...results);
      } catch {
        // Path doesn't exist, skip
      }
    }
    return allResults;
  }

  cancelScan(): void {
    if (this.scanning) {
      this.scanCancelled = true;
      logger.info('[Softero] Scan cancelled by user');
    }
  }

  // ─── Heuristic Analysis ───────────────────────────────────────

  private runHeuristics(filePath: string, buffer: Buffer, ext: string): string | null {
    const sensitivity = this.config.heuristicSensitivity;

    // Check for executable content in non-executable extensions
    if (!EXECUTABLE_EXTENSIONS.has(ext)) {
      // PE header in non-exe file
      if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
        return 'Heuristic.EmbeddedPE';
      }
      // ELF header in non-elf file
      if (buffer.length >= 4 && buffer.subarray(0, 4).equals(HEURISTIC_PATTERNS.elfHeader)) {
        return 'Heuristic.EmbeddedELF';
      }
    }

    // Text-based analysis for script files
    const textExts = new Set(['.js', '.vbs', '.ps1', '.bat', '.cmd', '.html', '.htm', '.svg']);
    if (textExts.has(ext) || buffer.length < 1024 * 1024) {
      try {
        const text = buffer.toString('utf8', 0, Math.min(buffer.length, 512 * 1024));

        // Check script patterns
        for (const pattern of HEURISTIC_PATTERNS.scriptPatterns) {
          if (pattern.test(text)) {
            return 'Heuristic.SuspiciousScript';
          }
        }

        // Check obfuscation (medium+ sensitivity)
        if (sensitivity !== 'low') {
          for (const pattern of HEURISTIC_PATTERNS.obfuscation) {
            if (pattern.test(text)) {
              return 'Heuristic.ObfuscatedCode';
            }
          }
        }

        // High entropy detection (high sensitivity only)
        if (sensitivity === 'high' && buffer.length > 1024) {
          const entropy = this.calculateEntropy(buffer.subarray(0, 8192));
          if (entropy > 7.5) {
            return 'Heuristic.HighEntropy';
          }
        }
      } catch {
        // Not text, skip
      }
    }

    return null;
  }

  private calculateEntropy(data: Buffer): number {
    const freq = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      freq[data[i]]++;
    }
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / data.length;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  // ─── Quarantine ──────────────────────────────────────────────

  async quarantineFile(filePath: string, threatName: string, severity: ThreatSeverity, detectionMethod: string): Promise<QuarantineEntry | null> {
    try {
      const stat = await fs.promises.stat(filePath);
      const hash = crypto.createHash('sha256')
        .update(await fs.promises.readFile(filePath))
        .digest('hex');

      const id = crypto.randomUUID();
      const quarantinePath = path.join(this.quarantineDir, `${id}.quarantine`);

      // Encrypt the file before quarantining (XOR with key derived from id)
      const fileData = await fs.promises.readFile(filePath);
      const key = crypto.createHash('sha256').update(id).digest();
      const encrypted = Buffer.alloc(fileData.length);
      for (let i = 0; i < fileData.length; i++) {
        encrypted[i] = fileData[i] ^ key[i % key.length];
      }
      await fs.promises.writeFile(quarantinePath, encrypted);

      // Remove original
      await fs.promises.unlink(filePath);

      const entry: QuarantineEntry = {
        id,
        originalPath: filePath,
        quarantinePath,
        threatName,
        severity,
        detectionMethod,
        hash,
        size: stat.size,
        quarantinedAt: Date.now(),
        canRestore: true,
      };

      this.quarantine.set(id, entry);
      await this.saveQuarantineDb();

      logger.info(`[Softero] Quarantined: ${filePath} → ${quarantinePath}`);
      this.emitEvent('quarantine-update');
      return entry;

    } catch (err) {
      logger.error(`[Softero] Failed to quarantine ${filePath}`, err);
      return null;
    }
  }

  async restoreFromQuarantine(id: string): Promise<boolean> {
    const entry = this.quarantine.get(id);
    if (!entry || !entry.canRestore) return false;

    try {
      // Decrypt and restore
      const encrypted = await fs.promises.readFile(entry.quarantinePath);
      const key = crypto.createHash('sha256').update(id).digest();
      const decrypted = Buffer.alloc(encrypted.length);
      for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ key[i % key.length];
      }

      // Ensure target directory exists
      await fs.promises.mkdir(path.dirname(entry.originalPath), { recursive: true });
      await fs.promises.writeFile(entry.originalPath, decrypted);

      // Remove quarantine file
      await fs.promises.unlink(entry.quarantinePath);
      this.quarantine.delete(id);
      await this.saveQuarantineDb();

      logger.info(`[Softero] Restored: ${entry.originalPath}`);
      this.emitEvent('quarantine-update');
      return true;

    } catch (err) {
      logger.error(`[Softero] Failed to restore ${id}`, err);
      return false;
    }
  }

  async deleteFromQuarantine(id: string): Promise<boolean> {
    const entry = this.quarantine.get(id);
    if (!entry) return false;

    try {
      await fs.promises.unlink(entry.quarantinePath);
      this.quarantine.delete(id);
      await this.saveQuarantineDb();
      logger.info(`[Softero] Permanently deleted quarantined file: ${entry.originalPath}`);
      this.emitEvent('quarantine-update');
      return true;
    } catch (err) {
      logger.error(`[Softero] Failed to delete quarantine entry ${id}`, err);
      return false;
    }
  }

  // ─── Real-Time Protection ─────────────────────────────────────

  private startRealTimeProtection(): void {
    const watchPaths = [
      app.getPath('downloads'),
      app.getPath('desktop'),
    ];

    for (const watchPath of watchPaths) {
      try {
        if (!fs.existsSync(watchPath)) continue;

        const watcher = fs.watch(watchPath, { recursive: true }, async (eventType, filename) => {
          if (!filename || eventType !== 'rename') return;

          const fullPath = path.join(watchPath, filename);
          try {
            const stat = await fs.promises.stat(fullPath);
            if (!stat.isFile()) return;

            // Small delay to let file finish writing
            await new Promise(resolve => setTimeout(resolve, 500));

            const result = await this.scanFile(fullPath);
            if (result.status === 'threat') {
              logger.warn(`[Softero] Real-time: Threat detected in ${fullPath}`);
              // Auto-quarantine threats
              await this.quarantineFile(
                fullPath,
                result.threatName || 'Unknown',
                result.severity || 'high',
                result.detectionMethod || 'signature'
              );
            }
          } catch {
            // File may have been deleted before scan
          }
        });

        this.watchers.set(watchPath, watcher);
        logger.info(`[Softero] Watching: ${watchPath}`);
      } catch {
        logger.warn(`[Softero] Cannot watch: ${watchPath}`);
      }
    }
  }

  private stopRealTimeProtection(): void {
    for (const [watchPath, watcher] of this.watchers) {
      watcher.close();
      logger.info(`[Softero] Stopped watching: ${watchPath}`);
    }
    this.watchers.clear();
  }

  // ─── File Collection ──────────────────────────────────────────

  private async collectFiles(dirPath: string, recursive: boolean, depth = 0): Promise<string[]> {
    if (depth > this.config.scanDepth) return [];

    const files: string[] = [];
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip excluded paths
        if (this.config.excludedPaths.some(p => fullPath.startsWith(p))) continue;

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!this.config.excludedExtensions.includes(ext)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive) {
          // Skip system/hidden directories
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const subFiles = await this.collectFiles(fullPath, true, depth + 1);
          files.push(...subFiles);
        }
      }
    } catch {
      // Permission denied or path invalid
    }
    return files;
  }

  // ─── Config & Persistence ────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(data);
      this.config = { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  private async loadQuarantineDb(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.quarantineDbPath, 'utf8');
      const entries: QuarantineEntry[] = JSON.parse(data);
      this.quarantine.clear();
      for (const entry of entries) {
        this.quarantine.set(entry.id, entry);
      }
    } catch (e) {
      log.warn('[Softero] Failed to load quarantine DB, starting fresh:', e);
      this.quarantine.clear();
    }
  }

  private async saveQuarantineDb(): Promise<void> {
    const entries = Array.from(this.quarantine.values());
    await fs.promises.writeFile(this.quarantineDbPath, JSON.stringify(entries, null, 2));
  }

  async updateConfig(updates: Partial<SofteroConfig>): Promise<void> {
    const wasRealTime = this.config.realTimeProtection;
    this.config = { ...this.config, ...updates };
    await this.saveConfig();

    // Toggle real-time protection if changed
    if (updates.realTimeProtection !== undefined && updates.realTimeProtection !== wasRealTime) {
      if (updates.realTimeProtection) {
        this.startRealTimeProtection();
      } else {
        this.stopRealTimeProtection();
      }
    }
  }

  // ─── IPC Handlers ─────────────────────────────────────────────

  private registerIPC(): void {
    ipcMain.handle('softero:get-status', () => ({
      realTimeProtection: this.config.realTimeProtection,
      scanning: this.scanning,
      progress: this.progress,
      quarantineCount: this.quarantine.size,
      signatureCount: this.signatures.getSignatureCount(),
      lastScanTime: this.scanHistory.length > 0
        ? this.scanHistory[this.scanHistory.length - 1].timestamp
        : null,
    }));

    ipcMain.handle('softero:get-config', () => ({ ...this.config }));

    ipcMain.handle('softero:update-config', async (_e, updates: Partial<SofteroConfig>) => {
      await this.updateConfig(updates);
      return { ...this.config };
    });

    ipcMain.handle('softero:scan-file', async (_e, filePath: string) => {
      return this.scanFile(filePath);
    });

    ipcMain.handle('softero:scan-directory', async (_e, dirPath: string) => {
      return this.scanDirectory(dirPath);
    });

    ipcMain.handle('softero:quick-scan', async () => {
      return this.quickScan();
    });

    ipcMain.handle('softero:cancel-scan', () => {
      this.cancelScan();
    });

    ipcMain.handle('softero:get-quarantine', () => {
      return Array.from(this.quarantine.values());
    });

    ipcMain.handle('softero:quarantine-file', async (_e, filePath: string, threatName: string, severity: ThreatSeverity) => {
      return this.quarantineFile(filePath, threatName, severity, 'manual');
    });

    ipcMain.handle('softero:restore-quarantine', async (_e, id: string) => {
      return this.restoreFromQuarantine(id);
    });

    ipcMain.handle('softero:delete-quarantine', async (_e, id: string) => {
      return this.deleteFromQuarantine(id);
    });

    ipcMain.handle('softero:get-scan-history', (_e, limit = 100) => {
      return this.scanHistory.slice(-limit);
    });

    ipcMain.handle('softero:toggle-realtime', async () => {
      await this.updateConfig({ realTimeProtection: !this.config.realTimeProtection });
      return this.config.realTimeProtection;
    });
  }

  // ─── Events ───────────────────────────────────────────────────

  private notifyThreat(result: ScanResult): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('softero:threat-detected', result);
    }
  }

  private emitProgress(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('softero:scan-progress', this.progress);
    }
  }

  private emitEvent(event: string, data?: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(`softero:${event}`, data);
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stopRealTimeProtection();
    this.cancelScan();
    await this.saveQuarantineDb();
    logger.info('[Softero] Antivirus engine shut down');
  }
}
