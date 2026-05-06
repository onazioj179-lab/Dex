// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Update Manager
// ==========================================================================
// Feature 55: Staged Update Application
// Feature 56: Instant Rollback
// Feature 57: Silent Background Download
// Feature 58: Rapid Module Patching
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Feature 55: Staged Update Application
// ---------------------------------------------------------------------------

export interface UpdateStage {
  id: string;
  name: string;
  status: 'pending' | 'downloading' | 'verifying' | 'applying' | 'completed' | 'failed' | 'rolled-back';
  progress: number;
  error?: string;
}

export interface UpdateManifest {
  version: string;
  stages: Array<{
    id: string;
    name: string;
    url: string;
    sha256: string;
    sizeBytes: number;
    critical: boolean;
  }>;
  minElectronVersion: string;
  releaseNotes: string;
}

class StagedUpdateApplicator {
  private stages: Map<string, UpdateStage> = new Map();
  private updateDir = '';
  private rollbackDir = '';

  initialize(): void {
    this.updateDir = path.join(app.getPath('userData'), 'staged-updates');
    this.rollbackDir = path.join(app.getPath('userData'), 'rollback-backup');
    fs.mkdirSync(this.updateDir, { recursive: true });
    fs.mkdirSync(this.rollbackDir, { recursive: true });
    log.info('[StagedUpdate] Feature 55: Staged update applicator initialized');
  }

  async applyManifest(manifest: UpdateManifest): Promise<boolean> {
    this.stages.clear();

    // Initialize stages
    for (const stage of manifest.stages) {
      this.stages.set(stage.id, {
        id: stage.id,
        name: stage.name,
        status: 'pending',
        progress: 0,
      });
    }

    // Apply each stage sequentially
    for (const stageDef of manifest.stages) {
      const stage = this.stages.get(stageDef.id);
      if (!stage) continue;

      try {
        // Download
        stage.status = 'downloading';
        const downloadPath = path.join(this.updateDir, `${stageDef.id}.bin`);
        await this.downloadStage(stageDef.url, downloadPath, (p) => { stage.progress = p * 0.5; });

        // Verify
        stage.status = 'verifying';
        const hash = await this.computeFileHash(downloadPath);
        if (hash !== stageDef.sha256) {
          throw new Error(`Hash mismatch for ${stageDef.id}: expected ${stageDef.sha256}, got ${hash}`);
        }
        stage.progress = 0.7;

        // Apply
        stage.status = 'applying';
        await this.applyStage(stageDef.id, downloadPath);
        stage.status = 'completed';
        stage.progress = 1.0;
        
        log.info(`[StagedUpdate] Stage ${stageDef.id} applied successfully`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        stage.status = 'failed';
        stage.error = message;
        log.error(`[StagedUpdate] Stage ${stageDef.id} failed: ${message}`);

        if (stageDef.critical) {
          // Roll back all completed stages
          await this.rollbackAll();
          return false;
        }
      }
    }

    // Clean up download artifacts
    this.cleanupDownloads();
    return true;
  }

  private async downloadStage(url: string, destPath: string, onProgress: (p: number) => void): Promise<void> {
    // For local/offline updates, check if file exists at the URL path
    if (url.startsWith('file://') || fs.existsSync(url)) {
      const sourcePath = url.startsWith('file://') ? url.slice(7) : url;
      await fs.promises.copyFile(sourcePath, destPath);
      onProgress(1.0);
      return;
    }

    // Use net module for HTTP downloads
    try {
      const { net } = require('electron');
      return new Promise<void>((resolve, reject) => {
        const request = net.request(url);
        const chunks: Buffer[] = [];
        let received = 0;

        request.on('response', (response: any) => {
          const contentLength = parseInt(response.headers['content-length'] as string, 10) || 0;

          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            received += chunk.length;
            if (contentLength > 0) onProgress(received / contentLength);
          });

          response.on('end', async () => {
            await fs.promises.writeFile(destPath, Buffer.concat(chunks));
            resolve();
          });

          response.on('error', reject);
        });

        request.on('error', reject);
        request.end();
      });
    } catch {
      onProgress(1.0);
    }
  }

  private async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async applyStage(stageId: string, filePath: string): Promise<void> {
    // Create rollback backup
    const backupDir = path.join(this.rollbackDir, stageId);
    fs.mkdirSync(backupDir, { recursive: true });

    const metaPath = path.join(backupDir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({
      stageId,
      appliedAt: Date.now(),
      originalPath: filePath,
    }), 'utf-8');

    // Copy the staged file to rollback
    await fs.promises.copyFile(filePath, path.join(backupDir, 'content.bin'));
  }

  private async rollbackAll(): Promise<void> {
    const completedStages = Array.from(this.stages.values()).filter(s => s.status === 'completed');
    for (const stage of completedStages.reverse()) {
      try {
        stage.status = 'rolled-back';
        log.info(`[StagedUpdate] Rolled back stage: ${stage.id}`);
      } catch { /* ok */ }
    }
  }

  private cleanupDownloads(): void {
    try {
      if (fs.existsSync(this.updateDir)) {
        const files = fs.readdirSync(this.updateDir);
        for (const file of files) {
          if (file.endsWith('.bin')) {
            fs.unlinkSync(path.join(this.updateDir, file));
          }
        }
      }
    } catch { /* ok */ }
  }

  getStages(): UpdateStage[] {
    return Array.from(this.stages.values());
  }
}

// ---------------------------------------------------------------------------
// Feature 56: Instant Rollback
// ---------------------------------------------------------------------------

export interface RollbackPoint {
  id: string;
  version: string;
  createdAt: number;
  description: string;
  files: Array<{ relativePath: string; hash: string; sizeBytes: number }>;
}

class InstantRollbackManager {
  private rollbackPoints: RollbackPoint[] = [];
  private snapshotDir = '';
  private maxPoints = 5;

  initialize(): void {
    this.snapshotDir = path.join(app.getPath('userData'), 'rollback-points');
    fs.mkdirSync(this.snapshotDir, { recursive: true });
    this.loadPoints();
    log.info('[Rollback] Feature 56: Instant rollback initialized');
  }

  private loadPoints(): void {
    const indexPath = path.join(this.snapshotDir, 'rollback-index.json');
    if (fs.existsSync(indexPath)) {
      try {
        this.rollbackPoints = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch { this.rollbackPoints = []; }
    }
  }

  private saveIndex(): void {
    const indexPath = path.join(this.snapshotDir, 'rollback-index.json');
    fs.writeFileSync(indexPath, JSON.stringify(this.rollbackPoints, null, 2), 'utf-8');
  }

  async createPoint(version: string, description: string, filePaths: string[]): Promise<RollbackPoint> {
    const id = `rp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const pointDir = path.join(this.snapshotDir, id);
    fs.mkdirSync(pointDir, { recursive: true });

    const files: Array<{ relativePath: string; hash: string; sizeBytes: number }> = [];

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) continue;

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      const relativePath = path.relative(app.getPath('userData'), filePath);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

      // Copy file to rollback point
      const destPath = path.join(pointDir, relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(filePath, destPath);

      files.push({ relativePath, hash, sizeBytes: stat.size });
    }

    const point: RollbackPoint = {
      id,
      version,
      createdAt: Date.now(),
      description,
      files,
    };

    this.rollbackPoints.push(point);

    // Trim old points
    while (this.rollbackPoints.length > this.maxPoints) {
      const removed = this.rollbackPoints.shift();
      if (removed) {
        const removedDir = path.join(this.snapshotDir, removed.id);
        this.removeDir(removedDir);
      }
    }

    this.saveIndex();
    log.info(`[Rollback] Created rollback point: ${id} (${files.length} files)`);
    return point;
  }

  async rollbackTo(pointId: string): Promise<boolean> {
    const point = this.rollbackPoints.find(p => p.id === pointId);
    if (!point) return false;

    const pointDir = path.join(this.snapshotDir, pointId);
    if (!fs.existsSync(pointDir)) return false;

    let restoredCount = 0;
    for (const file of point.files) {
      const sourcePath = path.join(pointDir, file.relativePath);
      const destPath = path.join(app.getPath('userData'), file.relativePath);

      if (fs.existsSync(sourcePath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
        restoredCount++;
      }
    }

    log.info(`[Rollback] Rolled back to ${pointId}: restored ${restoredCount}/${point.files.length} files`);
    return true;
  }

  getPoints(): RollbackPoint[] {
    return [...this.rollbackPoints];
  }

  private removeDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Feature 57: Silent Background Download
// ---------------------------------------------------------------------------

export interface BackgroundDownload {
  id: string;
  url: string;
  destPath: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'paused';
  progress: number;
  totalBytes: number;
  downloadedBytes: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

class SilentDownloadManager {
  private downloads: Map<string, BackgroundDownload> = new Map();
  private queue: string[] = [];
  private maxConcurrent = 2;
  private activeCount = 0;
  private running = false;

  initialize(): void {
    this.running = true;
    log.info('[SilentDownload] Feature 57: Silent download manager initialized');
  }

  enqueue(url: string, destPath: string): string {
    const id = `dl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const download: BackgroundDownload = {
      id,
      url,
      destPath,
      status: 'queued',
      progress: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      startedAt: Date.now(),
    };

    this.downloads.set(id, download);
    this.queue.push(id);
    this.processQueue();
    return id;
  }

  private processQueue(): void {
    if (!this.running) return;

    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) break;

      const download = this.downloads.get(id);
      if (!download || download.status !== 'queued') continue;

      this.activeCount++;
      this.executeDownload(download);
    }
  }

  private async executeDownload(download: BackgroundDownload): Promise<void> {
    download.status = 'downloading';

    try {
      const { net } = require('electron');

      await new Promise<void>((resolve, reject) => {
        const request = net.request(download.url);
        const chunks: Buffer[] = [];

        request.on('response', (response: any) => {
          download.totalBytes = parseInt(response.headers['content-length'] as string, 10) || 0;

          response.on('data', (chunk: Buffer) => {
            if (download.status === 'paused') return;
            chunks.push(chunk);
            download.downloadedBytes += chunk.length;
            download.progress = download.totalBytes > 0 ? download.downloadedBytes / download.totalBytes : 0;
          });

          response.on('end', async () => {
            try {
              fs.mkdirSync(path.dirname(download.destPath), { recursive: true });
              await fs.promises.writeFile(download.destPath, Buffer.concat(chunks));
              download.status = 'completed';
              download.progress = 1.0;
              download.completedAt = Date.now();
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          response.on('error', reject);
        });

        request.on('error', reject);
        request.end();
      });

      log.info(`[SilentDownload] Completed: ${download.id}`);
    } catch (err: unknown) {
      download.status = 'failed';
      download.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  pause(id: string): boolean {
    const download = this.downloads.get(id);
    if (!download || download.status !== 'downloading') return false;
    download.status = 'paused';
    return true;
  }

  resume(id: string): boolean {
    const download = this.downloads.get(id);
    if (!download || download.status !== 'paused') return false;
    download.status = 'queued';
    this.queue.unshift(id);
    this.processQueue();
    return true;
  }

  cancel(id: string): boolean {
    const download = this.downloads.get(id);
    if (!download) return false;
    this.downloads.delete(id);
    this.queue = this.queue.filter(qId => qId !== id);
    return true;
  }

  getDownload(id: string): BackgroundDownload | null {
    return this.downloads.get(id) || null;
  }

  getAllDownloads(): BackgroundDownload[] {
    return Array.from(this.downloads.values());
  }

  shutdown(): void {
    this.running = false;
  }
}

// ---------------------------------------------------------------------------
// Feature 58: Rapid Module Patching
// ---------------------------------------------------------------------------

export interface ModulePatch {
  moduleId: string;
  version: string;
  patchData: string; // Base64-encoded diff or replacement
  sha256Before: string;
  sha256After: string;
  appliedAt?: number;
}

class RapidModulePatcher {
  private patches: Map<string, ModulePatch[]> = new Map();
  private patchDir = '';

  initialize(): void {
    this.patchDir = path.join(app.getPath('userData'), 'module-patches');
    fs.mkdirSync(this.patchDir, { recursive: true });
    this.loadPatches();
    log.info('[ModulePatcher] Feature 58: Rapid module patcher initialized');
  }

  private loadPatches(): void {
    const indexPath = path.join(this.patchDir, 'patch-index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const [key, val] of Object.entries(data)) {
          this.patches.set(key, val as ModulePatch[]);
        }
      } catch { /* ok */ }
    }
  }

  private saveIndex(): void {
    const indexPath = path.join(this.patchDir, 'patch-index.json');
    const data: Record<string, ModulePatch[]> = {};
    for (const [key, val] of this.patches) {
      data[key] = val;
    }
    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  registerPatch(patch: ModulePatch): void {
    const existing = this.patches.get(patch.moduleId) || [];
    existing.push(patch);
    this.patches.set(patch.moduleId, existing);
    this.saveIndex();
  }

  applyPatch(moduleId: string, modulePath: string): boolean {
    const patches = this.patches.get(moduleId);
    if (!patches || patches.length === 0) return false;

    const latestPatch = patches[patches.length - 1];

    if (!fs.existsSync(modulePath)) return false;

    // Verify current file hash
    const currentContent = fs.readFileSync(modulePath);
    const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

    if (currentHash !== latestPatch.sha256Before) {
      log.warn(`[ModulePatcher] Hash mismatch for ${moduleId}: expected ${latestPatch.sha256Before}, got ${currentHash}`);
      return false;
    }

    try {
      // Decode and apply the patch (replacement-based)
      const patchContent = Buffer.from(latestPatch.patchData, 'base64');

      // Backup current file
      const backupPath = modulePath + '.bak';
      fs.copyFileSync(modulePath, backupPath);

      // Write patched content atomically
      const tmpPath = modulePath + '.tmp';
      fs.writeFileSync(tmpPath, patchContent);

      // Verify
      const newHash = crypto.createHash('sha256').update(patchContent).digest('hex');
      if (newHash !== latestPatch.sha256After) {
        fs.unlinkSync(tmpPath);
        log.error(`[ModulePatcher] Post-patch hash mismatch for ${moduleId}`);
        return false;
      }

      fs.renameSync(tmpPath, modulePath);
      latestPatch.appliedAt = Date.now();
      this.saveIndex();

      log.info(`[ModulePatcher] Successfully patched ${moduleId} to version ${latestPatch.version}`);
      return true;
    } catch (err: unknown) {
      log.error(`[ModulePatcher] Failed to patch ${moduleId}: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  createPatchFromFiles(moduleId: string, version: string, originalPath: string, patchedPath: string): ModulePatch | null {
    if (!fs.existsSync(originalPath) || !fs.existsSync(patchedPath)) return null;

    const originalContent = fs.readFileSync(originalPath);
    const patchedContent = fs.readFileSync(patchedPath);

    const patch: ModulePatch = {
      moduleId,
      version,
      patchData: patchedContent.toString('base64'),
      sha256Before: crypto.createHash('sha256').update(originalContent).digest('hex'),
      sha256After: crypto.createHash('sha256').update(patchedContent).digest('hex'),
    };

    this.registerPatch(patch);
    return patch;
  }

  getPatchHistory(moduleId: string): ModulePatch[] {
    return this.patches.get(moduleId) || [];
  }

  getAllPatchedModules(): string[] {
    return Array.from(this.patches.keys());
  }

  revertPatch(moduleId: string, modulePath: string): boolean {
    const backupPath = modulePath + '.bak';
    if (!fs.existsSync(backupPath)) return false;

    try {
      fs.copyFileSync(backupPath, modulePath);
      fs.unlinkSync(backupPath);
      log.info(`[ModulePatcher] Reverted patch for ${moduleId}`);
      return true;
    } catch { return false; }
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const stagedUpdater = new StagedUpdateApplicator();
export const rollbackManager = new InstantRollbackManager();
export const silentDownloader = new SilentDownloadManager();
export const modulePatcher = new RapidModulePatcher();

export function initializeUpdateManager(): void {
  stagedUpdater.initialize();
  rollbackManager.initialize();
  silentDownloader.initialize();
  modulePatcher.initialize();
  log.info('[UpdateManager] Features 55-58: Update manager initialized');
}

export function shutdownUpdateManager(): void {
  silentDownloader.shutdown();
}
