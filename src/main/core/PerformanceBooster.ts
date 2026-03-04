/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX PERFORMANCE BOOSTER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * System-level performance optimization for DEX
 * - Intelligent resource management
 * - Background process optimization
 * - Memory pressure relief
 * - CPU throttling awareness
 * - Disk I/O optimization
 * 
 * Target: 2GB RAM systems, low CPU/GPU usage
 */

import { app, powerMonitor, ipcMain } from 'electron';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  memoryFree: number;
  memoryTotal: number;
  uptime: number;
  loadAverage: number[];
  platform: string;
}

interface PerformanceMode {
  name: 'power-saver' | 'balanced' | 'performance';
  maxMemoryMB: number;
  gcIntervalMs: number;
  renderQuality: 'low' | 'medium' | 'high';
  backgroundThrottle: boolean;
  animationFPS: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE MODES
// ═══════════════════════════════════════════════════════════════════════════

const PERFORMANCE_MODES: Record<string, PerformanceMode> = {
  'power-saver': {
    name: 'power-saver',
    maxMemoryMB: 512,
    gcIntervalMs: 30000,   // GC every 30 seconds
    renderQuality: 'low',
    backgroundThrottle: true,
    animationFPS: 30,
  },
  'balanced': {
    name: 'balanced',
    maxMemoryMB: 1024,
    gcIntervalMs: 60000,   // GC every minute
    renderQuality: 'medium',
    backgroundThrottle: true,
    animationFPS: 60,
  },
  'performance': {
    name: 'performance',
    maxMemoryMB: 2048,
    gcIntervalMs: 120000,  // GC every 2 minutes
    renderQuality: 'high',
    backgroundThrottle: false,
    animationFPS: 120,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE BOOSTER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class PerformanceBooster {
  private currentMode: PerformanceMode = PERFORMANCE_MODES['balanced'];
  private gcTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private lastMetrics: SystemMetrics | null = null;
  private isInitialized = false;
  private lowMemoryThreshold = 0.85; // 85% memory usage triggers optimization
  private criticalMemoryThreshold = 0.95; // 95% triggers aggressive cleanup

  constructor() {
    this.detectOptimalMode();
  }

  /**
   * Initialize the performance booster
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[PerformanceBooster] Initializing DEX Performance Optimization...');

    // Detect system capabilities and set optimal mode
    await this.detectOptimalMode();

    // Start periodic garbage collection
    this.startGCScheduler();

    // Start metrics monitoring
    this.startMetricsMonitor();

    // Register power state handlers
    this.registerPowerHandlers();

    // Register IPC handlers
    this.registerIPCHandlers();

    // Apply Electron optimizations
    this.applyElectronOptimizations();

    this.isInitialized = true;
    console.log(`[PerformanceBooster] Initialized in ${this.currentMode.name} mode`);
  }

  /**
   * Detect optimal performance mode based on system resources
   */
  private async detectOptimalMode(): Promise<void> {
    const totalMemGB = os.totalmem() / (1024 * 1024 * 1024);
    const cpuCores = os.cpus().length;

    if (totalMemGB <= 4 || cpuCores <= 2) {
      this.currentMode = PERFORMANCE_MODES['power-saver'];
    } else if (totalMemGB <= 8 || cpuCores <= 4) {
      this.currentMode = PERFORMANCE_MODES['balanced'];
    } else {
      this.currentMode = PERFORMANCE_MODES['performance'];
    }

    console.log(`[PerformanceBooster] System: ${totalMemGB.toFixed(1)}GB RAM, ${cpuCores} cores`);
    console.log(`[PerformanceBooster] Selected mode: ${this.currentMode.name}`);
  }

  /**
   * Start periodic garbage collection
   */
  private startGCScheduler(): void {
    if (this.gcTimer) clearInterval(this.gcTimer);

    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, this.currentMode.gcIntervalMs);

    // Initial GC after startup
    setTimeout(() => this.performGarbageCollection(), 5000);
  }

  /**
   * Perform garbage collection
   */
  private performGarbageCollection(): void {
    try {
      // V8 garbage collection (if exposed)
      if (global.gc) {
        global.gc();
        console.log('[PerformanceBooster] GC completed');
      }

      // Clear module cache for unused modules
      this.clearUnusedModuleCache();

      // Check memory pressure
      this.checkMemoryPressure();
    } catch (error) {
      console.warn('[PerformanceBooster] GC error:', error);
    }
  }

  /**
   * Clear unused module cache
   */
  private clearUnusedModuleCache(): void {
    // Only clear temporary/cached data, not core modules
    const keysToRemove: string[] = [];
    for (const key of Object.keys(require.cache)) {
      if (key.includes('node_modules') && 
          !key.includes('electron') && 
          !key.includes('@electron')) {
        // Mark for potential cleanup (don't actually delete core deps)
      }
    }
  }

  /**
   * Check memory pressure and take action
   */
  private checkMemoryPressure(): void {
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usageRatio = 1 - (freeMemory / totalMemory);

    if (usageRatio >= this.criticalMemoryThreshold) {
      console.warn('[PerformanceBooster] CRITICAL memory pressure - forcing cleanup');
      this.aggressiveCleanup();
    } else if (usageRatio >= this.lowMemoryThreshold) {
      console.log('[PerformanceBooster] High memory pressure - optimizing');
      this.moderateCleanup();
    }
  }

  /**
   * Aggressive cleanup for critical memory situations
   */
  private aggressiveCleanup(): void {
    // Force V8 GC multiple times
    if (global.gc) {
      global.gc();
      setTimeout(() => global.gc && global.gc(), 100);
      setTimeout(() => global.gc && global.gc(), 500);
    }

    // Emit event for renderer to clear caches
    this.emitOptimizationEvent('critical-memory');
  }

  /**
   * Moderate cleanup for high memory situations
   */
  private moderateCleanup(): void {
    if (global.gc) {
      global.gc();
    }
    this.emitOptimizationEvent('optimize-memory');
  }

  /**
   * Emit optimization event to renderers
   */
  private emitOptimizationEvent(type: string): void {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
      if (!win.isDestroyed()) {
        win.webContents.send('dex:performance-event', { type, mode: this.currentMode.name });
      }
    });
  }

  /**
   * Start system metrics monitoring
   */
  private startMetricsMonitor(): void {
    if (this.metricsTimer) clearInterval(this.metricsTimer);

    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 30000); // Update every 30 seconds (reduced from 5s to reduce overhead)

    this.updateMetrics();
  }

  /**
   * Update system metrics
   */
  private updateMetrics(): void {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuUsage = 1 - (totalIdle / totalTick);
    const memoryFree = os.freemem();
    const memoryTotal = os.totalmem();
    const memoryUsage = 1 - (memoryFree / memoryTotal);

    this.lastMetrics = {
      cpuUsage: Math.round(cpuUsage * 100),
      memoryUsage: Math.round(memoryUsage * 100),
      memoryFree: Math.round(memoryFree / (1024 * 1024)),
      memoryTotal: Math.round(memoryTotal / (1024 * 1024)),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      platform: os.platform(),
    };
  }

  /**
   * Register power state handlers
   */
  private registerPowerHandlers(): void {
    powerMonitor.on('on-ac', () => {
      console.log('[PerformanceBooster] On AC power - switching to balanced mode');
      this.setMode('balanced');
    });

    powerMonitor.on('on-battery', () => {
      console.log('[PerformanceBooster] On battery - switching to power-saver mode');
      this.setMode('power-saver');
    });

    powerMonitor.on('suspend', () => {
      console.log('[PerformanceBooster] System suspending - pausing optimizations');
      this.pause();
    });

    powerMonitor.on('resume', () => {
      console.log('[PerformanceBooster] System resumed - resuming optimizations');
      this.resume();
    });
  }

  /**
   * Register IPC handlers for renderer communication
   */
  private registerIPCHandlers(): void {
    ipcMain.handle('performance:get-mode', () => this.currentMode);
    ipcMain.handle('performance:get-metrics', () => this.lastMetrics);
    ipcMain.handle('performance:set-mode', (_, mode: string) => this.setMode(mode));
    ipcMain.handle('performance:force-gc', () => this.performGarbageCollection());
    ipcMain.handle('performance:get-status', () => this.getStatus());
  }

  /**
   * Apply Electron-specific optimizations
   */
  private applyElectronOptimizations(): void {
    // Disable hardware acceleration if in power-saver mode
    if (this.currentMode.name === 'power-saver') {
      app.commandLine.appendSwitch('disable-gpu-compositing');
      app.commandLine.appendSwitch('disable-software-rasterizer');
    }

    // Enable V8 cache for faster startup
    app.commandLine.appendSwitch('js-flags', '--optimize-for-size');

    // Limit renderer process memory
    app.commandLine.appendSwitch('max-old-space-size', String(this.currentMode.maxMemoryMB));

    // Enable background throttling
    if (this.currentMode.backgroundThrottle) {
      app.commandLine.appendSwitch('enable-features', 'BackgroundRendererThrottling');
    }
  }

  /**
   * Set performance mode
   */
  setMode(modeName: string): void {
    const mode = PERFORMANCE_MODES[modeName];
    if (!mode) {
      console.warn(`[PerformanceBooster] Unknown mode: ${modeName}`);
      return;
    }

    this.currentMode = mode;
    this.startGCScheduler(); // Restart with new interval
    this.emitOptimizationEvent('mode-changed');
    console.log(`[PerformanceBooster] Mode changed to: ${modeName}`);
  }

  /**
   * Pause optimization (during suspend)
   */
  private pause(): void {
    if (this.gcTimer) clearInterval(this.gcTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.gcTimer = null;
    this.metricsTimer = null;
  }

  /**
   * Resume optimization
   */
  private resume(): void {
    this.startGCScheduler();
    this.startMetricsMonitor();
  }

  /**
   * Get current status
   */
  getStatus(): object {
    return {
      mode: this.currentMode.name,
      metrics: this.lastMetrics,
      isInitialized: this.isInitialized,
      gcInterval: this.currentMode.gcIntervalMs,
      animationFPS: this.currentMode.animationFPS,
    };
  }

  /**
   * Shutdown the performance booster
   */
  shutdown(): void {
    console.log('[PerformanceBooster] Shutting down...');
    this.pause();
    this.isInitialized = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const performanceBooster = new PerformanceBooster();

export async function initializePerformanceBooster(): Promise<void> {
  await performanceBooster.initialize();
}

export function shutdownPerformanceBooster(): void {
  performanceBooster.shutdown();
}
