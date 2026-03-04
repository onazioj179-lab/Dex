// ═══════════════════════════════════════════════════════════════════════════
// DEX Native Bridge — Connects Rust native module to existing IPC handlers
// Drop-in replacement for Python psutil + JS systeminformation calls
// ═══════════════════════════════════════════════════════════════════════════

import { getNativeModule, isNativeAvailable } from './index';
import type {
  SystemStats,
  DiskInfo,
  NetworkInfo,
  ProcessInfo,
  CloseProcessResult,
  PowerStatus,
  PowerResult,
  FileEntry,
  ScanResult,
  DirectorySize,
  HealthStatus,
  Suggestion,
} from './types';
import log from 'electron-log';

// ─────────────────────────────────────────────────────────────────────────
// Native-First API — Uses Rust when available, falls back to JS
// ─────────────────────────────────────────────────────────────────────────

/**
 * System monitoring bridge.
 * Replaces: systeminformation + Python psutil subprocess
 */
export const NativeSystem = {
  getStats(): SystemStats | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getSystemStats();
    } catch (e) {
      log.error('[NativeBridge] getStats failed:', e);
      return null;
    }
  },

  getDisks(): DiskInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getDiskInfo();
    } catch (e) {
      log.error('[NativeBridge] getDisks failed:', e);
      return [];
    }
  },

  getNetworks(): NetworkInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getNetworkInfo();
    } catch (e) {
      log.error('[NativeBridge] getNetworks failed:', e);
      return [];
    }
  },
};

/**
 * Process management bridge.
 * Replaces: ps-list + psutil.process_iter()
 */
export const NativeProcesses = {
  list(limit?: number): ProcessInfo[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getProcesses(limit);
    } catch (e) {
      log.error('[NativeBridge] process list failed:', e);
      return [];
    }
  },

  close(pid: number, force?: boolean): CloseProcessResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, message: 'Native module not available' };
    try {
      return mod.closeProcess(pid, force);
    } catch (e) {
      log.error('[NativeBridge] close process failed:', e);
      return { success: false, message: String(e) };
    }
  },

  freeMemory(): CloseProcessResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, message: 'Native module not available' };
    try {
      return mod.freeMemory();
    } catch (e) {
      log.error('[NativeBridge] free memory failed:', e);
      return { success: false, message: String(e) };
    }
  },
};

/**
 * Power management bridge.
 * Replaces: Python PowerManager + PowerController shell commands
 */
export const NativePower = {
  getStatus(): PowerStatus | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getPowerStatus();
    } catch (e) {
      log.error('[NativeBridge] power status failed:', e);
      return null;
    }
  },

  setProfile(profile: string): PowerResult {
    const mod = getNativeModule();
    if (!mod) return { success: false, profile, changes: [], error: 'Native module not available' };
    try {
      return mod.setPowerProfile(profile);
    } catch (e) {
      log.error('[NativeBridge] set profile failed:', e);
      return { success: false, profile, changes: [], error: String(e) };
    }
  },

  getProfiles() {
    const mod = getNativeModule();
    if (!mod) return [];
    return mod.getPowerProfiles();
  },
};

/**
 * File scanning bridge.
 * Replaces: sync readdirSync recursive scans
 */
export const NativeFiles = {
  scan(
    rootPath: string,
    extensions: string[] = [],
    maxDepth?: number,
    limit?: number,
    includeDirs?: boolean,
  ): ScanResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.scanDirectory(rootPath, extensions, maxDepth, limit, includeDirs);
    } catch (e) {
      log.error('[NativeBridge] scan failed:', e);
      return null;
    }
  },

  directorySize(dirPath: string): DirectorySize | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getDirectorySize(dirPath);
    } catch (e) {
      log.error('[NativeBridge] directory size failed:', e);
      return null;
    }
  },

  scanMedia(scanType: string, customPaths?: string[], limit?: number): ScanResult | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.scanMediaFiles(scanType, customPaths, limit);
    } catch (e) {
      log.error('[NativeBridge] media scan failed:', e);
      return null;
    }
  },
};

/**
 * Health and learning bridge.
 * Replaces: Python Watchdog + LearningEngine
 */
export const NativeHealth = {
  heartbeat(): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.heartbeat();
    } catch {
      // Silent — health monitoring is non-critical
    }
  },

  recordError(msg: string): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.recordError(msg);
    } catch {
      // Silent
    }
  },

  getHealth(): HealthStatus | null {
    const mod = getNativeModule();
    if (!mod) return null;
    try {
      return mod.getHealth();
    } catch (e) {
      log.error('[NativeBridge] health check failed:', e);
      return null;
    }
  },

  recordActivity(type: string, name: string): void {
    const mod = getNativeModule();
    if (!mod) return;
    try {
      mod.recordActivity(type, name);
    } catch {
      // Silent
    }
  },

  getSuggestions(): Suggestion[] {
    const mod = getNativeModule();
    if (!mod) return [];
    try {
      return mod.getSuggestions();
    } catch {
      return [];
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────

export { isNativeAvailable };

/**
 * Log native module status at startup.
 */
export function logNativeStatus(): void {
  if (isNativeAvailable()) {
    log.info('[Native] Rust native module ACTIVE — Python subprocess eliminated');
    log.info('[Native] Modules: system monitoring, process management, file scanning, power control, health');
  } else {
    log.info('[Native] Rust native module NOT available — using JS/Python fallbacks');
    log.info('[Native] Build native module: cd native && npm install && npm run build');
  }
}
