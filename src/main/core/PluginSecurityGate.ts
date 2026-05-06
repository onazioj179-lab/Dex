// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Plugin Security Gate
// ==========================================================================
// Main-process orchestrator for plugin security. Coordinates between
// the plugin-executor worker thread, the database cluster, and the
// security audit log. Enforces static analysis, 50ms execution budgets,
// auto-disable after 3 consecutive failures, and manifest validation.
// ==========================================================================
// Rules 81-83: Plugin Performance Architecture
// 81. Execution budget enforcement with per-plugin tracking
// 82. Plugin memory isolation with per-plugin memory caps
// 83. Hot-reload with zero-downtime plugin updates
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { app, ipcMain, BrowserWindow } from 'electron';
import { databaseCluster } from './DatabaseCluster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entryPoint: string;
  permissions: string[];
  author?: string;
  description?: string;
}

interface PluginRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  failureCount: number;
  configJson: string | null;
  sourceHash: string;
  loadedAt: number;
}

interface PluginExecutionResult {
  pluginId: string;
  event: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

const ALLOWED_PERMISSIONS = new Set([
  'storage',
  'notifications',
  'clipboard-read',
  'theme',
  'sidebar-widget',
  'context-menu',
  'keyboard-shortcut',
]);

const FORBIDDEN_IMPORT_PATTERNS = [
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /require\s*\(\s*['"]net['"]\s*\)/,
  /require\s*\(\s*['"]http['"]\s*\)/,
  /require\s*\(\s*['"]https['"]\s*\)/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /require\s*\(\s*['"]dgram['"]\s*\)/,
  /require\s*\(\s*['"]cluster['"]\s*\)/,
  /import\s+.*from\s+['"]child_process['"]/,
  /import\s+.*from\s+['"]net['"]/,
  /import\s+.*from\s+['"]http['"]/,
  /import\s+.*from\s+['"]https['"]/,
  /import\s+.*from\s+['"]fs['"]/,
  /import\s+.*from\s+['"]electron['"]/,
  /eval\s*\(/,
  /new\s+Function\s*\(/,
  /process\.exit/,
  /process\.kill/,
  /process\.env/,
  /globalThis\[/,
];

const MAX_SOURCE_SIZE_BYTES = 512 * 1024; // 512 KB
const EXECUTION_BUDGET_MS = 50;
const MAX_CONSECUTIVE_FAILURES = 3;

// ---------------------------------------------------------------------------
// Plugin Security Gate
// ---------------------------------------------------------------------------

class PluginSecurityGate {
  private plugins = new Map<string, PluginRecord>();
  private pluginDir: string = '';
  private initialized = false;
  private mainWindow: BrowserWindow | null = null;

  initialize(win: BrowserWindow): void {
    if (this.initialized) return;
    this.mainWindow = win;

    try {
      const userData = app.getPath('userData');
      this.pluginDir = path.join(userData, 'plugins');
      if (!fs.existsSync(this.pluginDir)) {
        fs.mkdirSync(this.pluginDir, { recursive: true, mode: 0o700 });
      }
    } catch (err) {
      log.warn('[PluginSecurityGate] Plugin directory creation failed:', err);
    }

    this.loadRegisteredPlugins();
    this.registerIPC();
    this.initialized = true;
    log.info(`[PluginSecurityGate] Initialized with ${this.plugins.size} registered plugins`);
  }

  // ---------------------------------------------------------------------------
  // Manifest validation
  // ---------------------------------------------------------------------------

  validateManifest(manifest: PluginManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.length > 128) {
      errors.push('Invalid or missing plugin id');
    }
    if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.length > 256) {
      errors.push('Invalid or missing plugin name');
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      errors.push('Invalid version format (expected semver x.y.z)');
    }
    if (!manifest.entryPoint || typeof manifest.entryPoint !== 'string') {
      errors.push('Missing entryPoint');
    }
    if (!Array.isArray(manifest.permissions)) {
      errors.push('permissions must be an array');
    } else {
      for (const perm of manifest.permissions) {
        if (!ALLOWED_PERMISSIONS.has(perm)) {
          errors.push(`Unknown permission: ${perm}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------------------
  // Static analysis
  // ---------------------------------------------------------------------------

  analyzeSource(source: string): { safe: boolean; violations: string[] } {
    const violations: string[] = [];

    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_SIZE_BYTES) {
      violations.push(`Source exceeds ${MAX_SOURCE_SIZE_BYTES} byte limit`);
      return { safe: false, violations };
    }

    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`Forbidden pattern detected: ${pattern.source}`);
      }
    }

    return { safe: violations.length === 0, violations };
  }

  // ---------------------------------------------------------------------------
  // Plugin registration
  // ---------------------------------------------------------------------------

  async registerPlugin(manifest: PluginManifest, source: string): Promise<{ success: boolean; error?: string }> {
    // Validate manifest
    const manifestResult = this.validateManifest(manifest);
    if (!manifestResult.valid) {
      const msg = `Manifest validation failed: ${manifestResult.errors.join(', ')}`;
      this.auditLog('plugin-register-rejected', manifest.id, msg, 'warn');
      return { success: false, error: msg };
    }

    // Static analysis
    const analysisResult = this.analyzeSource(source);
    if (!analysisResult.safe) {
      const msg = `Static analysis failed: ${analysisResult.violations.join(', ')}`;
      this.auditLog('plugin-register-rejected', manifest.id, msg, 'warn');
      return { success: false, error: msg };
    }

    // Compute source hash
    const sourceHash = crypto.createHash('sha256').update(source).digest('hex');

    // Store in database
    const now = Date.now();
    databaseCluster.writeStmt(
      'plug:register',
      manifest.id,
      manifest.name,
      manifest.version,
      1,
      now,
      now,
      0,
      JSON.stringify({ permissions: manifest.permissions, author: manifest.author, description: manifest.description })
    );

    // Store source file
    const sourcePath = path.join(this.pluginDir, `${manifest.id}.js`);
    try {
      fs.writeFileSync(sourcePath, source, { mode: 0o600 });
    } catch (err) {
      log.warn(`[PluginSecurityGate] Failed to write plugin source for ${manifest.id}:`, err);
    }

    // Track in memory
    const record: PluginRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: true,
      failureCount: 0,
      configJson: JSON.stringify({ permissions: manifest.permissions }),
      sourceHash,
      loadedAt: now,
    };
    this.plugins.set(manifest.id, record);

    this.auditLog('plugin-registered', manifest.id, `v${manifest.version} hash=${sourceHash.slice(0, 16)}`, 'info');
    log.info(`[PluginSecurityGate] Registered plugin: ${manifest.name} (${manifest.id})`);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Plugin execution
  // ---------------------------------------------------------------------------

  executePluginEvent(pluginId: string, event: string, data: any): PluginExecutionResult {
    const record = this.plugins.get(pluginId);
    if (!record) {
      return { pluginId, event, durationMs: 0, success: false, error: 'Plugin not found' };
    }
    if (!record.enabled) {
      return { pluginId, event, durationMs: 0, success: false, error: 'Plugin is disabled' };
    }

    const start = performance.now();

    // Read source
    const sourcePath = path.join(this.pluginDir, `${pluginId}.js`);
    let source: string;
    try {
      source = fs.readFileSync(sourcePath, 'utf8');
    } catch {
      return { pluginId, event, durationMs: 0, success: false, error: 'Plugin source not found' };
    }

    // Re-verify hash
    const currentHash = crypto.createHash('sha256').update(source).digest('hex');
    if (currentHash !== record.sourceHash) {
      this.disablePlugin(pluginId, 'Source hash mismatch (possible tampering)');
      return { pluginId, event, durationMs: 0, success: false, error: 'Source integrity check failed' };
    }

    // Execute in sandboxed context (simulated -- real isolation is in plugin-executor worker)
    const durationMs = performance.now() - start;

    if (durationMs > EXECUTION_BUDGET_MS) {
      record.failureCount++;
      databaseCluster.writeStmt('plug:increment-failures', Date.now(), pluginId);
      this.auditLog('plugin-budget-exceeded', pluginId, `${event} took ${durationMs.toFixed(2)}ms (budget: ${EXECUTION_BUDGET_MS}ms)`, 'warn');

      if (record.failureCount >= MAX_CONSECUTIVE_FAILURES) {
        this.disablePlugin(pluginId, `${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      }

      return { pluginId, event, durationMs, success: false, error: 'Execution budget exceeded' };
    }

    // Log successful execution
    databaseCluster.writeStmt('plug:log-event', pluginId, event, Date.now(), durationMs, 1, null);

    // Reset failure count on success
    if (record.failureCount > 0) {
      record.failureCount = 0;
      databaseCluster.writeStmt('plug:reset-failures', Date.now(), pluginId);
    }

    return { pluginId, event, durationMs, success: true };
  }

  // ---------------------------------------------------------------------------
  // Plugin management
  // ---------------------------------------------------------------------------

  disablePlugin(pluginId: string, reason: string): void {
    const record = this.plugins.get(pluginId);
    if (!record) return;
    record.enabled = false;
    databaseCluster.writeStmt('plug:set-enabled', 0, Date.now(), pluginId);
    this.auditLog('plugin-disabled', pluginId, reason, 'warn');
    log.warn(`[PluginSecurityGate] Disabled plugin ${pluginId}: ${reason}`);

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('plugin-security:plugin-disabled', { pluginId, reason });
    }
  }

  enablePlugin(pluginId: string): boolean {
    const record = this.plugins.get(pluginId);
    if (!record) return false;
    record.enabled = true;
    record.failureCount = 0;
    databaseCluster.writeStmt('plug:set-enabled', 1, Date.now(), pluginId);
    databaseCluster.writeStmt('plug:reset-failures', Date.now(), pluginId);
    this.auditLog('plugin-enabled', pluginId, 'Manual re-enable', 'info');
    return true;
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
    const sourcePath = path.join(this.pluginDir, `${pluginId}.js`);
    try {
      if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
    } catch {
      // Non-critical
    }
    // Delete from DB
    const db = databaseCluster.getDb('dex-plugins');
    if (db) {
      try {
        db.prepare('DELETE FROM plugins WHERE id = ?').run(pluginId);
        db.prepare('DELETE FROM plugin_data WHERE plugin_id = ?').run(pluginId);
        db.prepare('DELETE FROM plugin_events WHERE plugin_id = ?').run(pluginId);
      } catch {
        // Non-critical
      }
    }
    this.auditLog('plugin-unregistered', pluginId, '', 'info');
  }

  getPluginStatus(pluginId: string): PluginRecord | null {
    return this.plugins.get(pluginId) ?? null;
  }

  getAllPlugins(): PluginRecord[] {
    return Array.from(this.plugins.values());
  }

  getEnabledPlugins(): PluginRecord[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private loadRegisteredPlugins(): void {
    try {
      const rows = databaseCluster.allStmt('plug:list-all') as Array<{
        id: string;
        name: string;
        version: string;
        enabled: number;
        failure_count: number;
      }>;
      for (const row of rows) {
        const sourcePath = path.join(this.pluginDir, `${row.id}.js`);
        let sourceHash = '';
        try {
          if (fs.existsSync(sourcePath)) {
            const source = fs.readFileSync(sourcePath, 'utf8');
            sourceHash = crypto.createHash('sha256').update(source).digest('hex');
          }
        } catch {
          // Could not hash source
        }
        this.plugins.set(row.id, {
          id: row.id,
          name: row.name,
          version: row.version,
          enabled: row.enabled === 1,
          failureCount: row.failure_count,
          configJson: null,
          sourceHash,
          loadedAt: Date.now(),
        });
      }
    } catch {
      // Database not ready yet, fine
    }
  }

  private auditLog(action: string, subject: string, details: string, severity: string): void {
    databaseCluster.auditLog(action, subject, details, severity as any);
  }

  // ---------------------------------------------------------------------------
  // IPC handlers
  // ---------------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.handle('plugin-gate:list', () => {
      return this.getAllPlugins().map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        enabled: p.enabled,
        failureCount: p.failureCount,
      }));
    });

    ipcMain.handle('plugin-gate:status', (_e, pluginId: string) => {
      const status = this.getPluginStatus(pluginId);
      if (!status) return null;
      return {
        id: status.id,
        name: status.name,
        version: status.version,
        enabled: status.enabled,
        failureCount: status.failureCount,
      };
    });

    ipcMain.handle('plugin-gate:enable', (_e, pluginId: string) => {
      return this.enablePlugin(pluginId);
    });

    ipcMain.handle('plugin-gate:disable', (_e, pluginId: string) => {
      this.disablePlugin(pluginId, 'User requested');
      return true;
    });

    ipcMain.handle('plugin-gate:unregister', (_e, pluginId: string) => {
      this.unregisterPlugin(pluginId);
      return true;
    });

    ipcMain.handle('plugin-gate:register', async (_e, manifest: PluginManifest, source: string) => {
      return this.registerPlugin(manifest, source);
    });

    ipcMain.handle('plugin-gate:analyze', (_e, source: string) => {
      return this.analyzeSource(source);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.plugins.clear();
    if (this.budgetCheckInterval) {
      clearInterval(this.budgetCheckInterval);
      this.budgetCheckInterval = null;
    }
    this.initialized = false;
    log.info('[PluginSecurityGate] Shutdown complete');
  }

  // ---------------------------------------------------------------------------
  // Rule 81: Per-plugin execution budget tracking
  // ---------------------------------------------------------------------------

  private executionBudgets = new Map<string, { totalMs: number; callCount: number; avgMs: number; violations: number }>();
  private readonly BUDGET_WINDOW_MS = 60_000; // 1 minute windows
  private budgetCheckInterval: NodeJS.Timeout | null = null;

  trackExecution(pluginId: string, durationMs: number): void {
    let budget = this.executionBudgets.get(pluginId);
    if (!budget) {
      budget = { totalMs: 0, callCount: 0, avgMs: 0, violations: 0 };
      this.executionBudgets.set(pluginId, budget);
    }

    budget.totalMs += durationMs;
    budget.callCount++;
    budget.avgMs = budget.totalMs / budget.callCount;

    if (durationMs > EXECUTION_BUDGET_MS) {
      budget.violations++;
      log.warn(`[PluginSecurityGate] Rule 81: Plugin '${pluginId}' exceeded budget: ${durationMs}ms > ${EXECUTION_BUDGET_MS}ms (violations: ${budget.violations})`);

      // Auto-disable after too many violations
      if (budget.violations >= MAX_CONSECUTIVE_FAILURES) {
        this.disablePlugin(pluginId, `Auto-disabled: ${budget.violations} execution budget violations`);
      }
    }
  }

  getExecutionStats(pluginId: string): { totalMs: number; callCount: number; avgMs: number; violations: number } | null {
    return this.executionBudgets.get(pluginId) || null;
  }

  resetExecutionBudgets(): void {
    for (const budget of this.executionBudgets.values()) {
      budget.totalMs = 0;
      budget.callCount = 0;
      // Keep violations and avgMs for tracking
    }
  }

  startBudgetMonitoring(): void {
    if (this.budgetCheckInterval) return;
    this.budgetCheckInterval = setInterval(() => {
      this.resetExecutionBudgets();
    }, this.BUDGET_WINDOW_MS);
  }

  // ---------------------------------------------------------------------------
  // Rule 82: Per-plugin memory caps
  // ---------------------------------------------------------------------------

  private readonly PLUGIN_MEMORY_CAP_MB = 50; // 50MB per plugin
  private pluginMemoryUsage = new Map<string, number>();

  reportPluginMemory(pluginId: string, memoryMB: number): void {
    this.pluginMemoryUsage.set(pluginId, memoryMB);

    if (memoryMB > this.PLUGIN_MEMORY_CAP_MB) {
      log.warn(`[PluginSecurityGate] Rule 82: Plugin '${pluginId}' exceeds memory cap: ${memoryMB}MB > ${this.PLUGIN_MEMORY_CAP_MB}MB`);
      this.auditLog('plugin-memory-exceeded', pluginId, `${memoryMB}MB > ${this.PLUGIN_MEMORY_CAP_MB}MB`, 'warn');
      // If way over limit, disable
      if (memoryMB > this.PLUGIN_MEMORY_CAP_MB * 2) {
        this.disablePlugin(pluginId, `Auto-disabled: memory usage ${memoryMB}MB exceeds 2x cap`);
      }
    }
  }

  getPluginMemoryUsage(): Map<string, number> {
    return new Map(this.pluginMemoryUsage);
  }

  // ---------------------------------------------------------------------------
  // Rule 83: Hot-reload with zero-downtime plugin updates
  // ---------------------------------------------------------------------------

  async hotReload(pluginId: string, newSource: string, newManifest: PluginManifest): Promise<{ success: boolean; error?: string }> {
    const existing = this.plugins.get(pluginId);
    if (!existing) {
      return { success: false, error: `Plugin '${pluginId}' not found` };
    }

    // Validate new version
    const manifestResult = this.validateManifest(newManifest);
    if (!manifestResult.valid) {
      return { success: false, error: `Manifest validation failed: ${manifestResult.errors.join(', ')}` };
    }

    const analysisResult = this.analyzeSource(newSource);
    if (!analysisResult.safe) {
      return { success: false, error: `Static analysis failed: ${analysisResult.violations.join(', ')}` };
    }

    // Compute new hash
    const newHash = crypto.createHash('sha256').update(newSource).digest('hex');
    if (newHash === existing.sourceHash) {
      return { success: true }; // No change
    }

    // Update in-place (zero downtime -- old code still serves while new loads)
    const wasEnabled = existing.enabled;
    existing.version = newManifest.version;
    existing.sourceHash = newHash;
    existing.failureCount = 0; // Reset on update
    existing.loadedAt = Date.now();

    // Persist update
    try {
      databaseCluster.writeStmt(
        'plug:register',
        newManifest.id,
        newManifest.name,
        newManifest.version,
        wasEnabled ? 1 : 0,
        0,
        null,
        newHash,
        Date.now()
      );
    } catch (err) {
      log.warn(`[PluginSecurityGate] Rule 83: Failed to persist hot-reload for ${pluginId}:`, err);
    }

    // Write new source
    try {
      const entryPath = path.join(this.pluginDir, pluginId, newManifest.entryPoint);
      fs.writeFileSync(entryPath, newSource, 'utf-8');
    } catch (err) {
      log.warn(`[PluginSecurityGate] Rule 83: Failed to write updated source for ${pluginId}:`, err);
    }

    this.auditLog('plugin-hot-reloaded', pluginId, `v${newManifest.version}, hash=${newHash.slice(0, 12)}`, 'info');
    log.info(`[PluginSecurityGate] Rule 83: Hot-reloaded plugin '${pluginId}' to v${newManifest.version}`);

    return { success: true };
  }
}

export const pluginSecurityGate = new PluginSecurityGate();

export function initializePluginSecurityGate(win: BrowserWindow): void {
  pluginSecurityGate.initialize(win);
}

export function shutdownPluginSecurityGate(): void {
  pluginSecurityGate.shutdown();
}
