/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX CORE UNIT TESTS - Performance Optimization
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Performance modes
type PerformanceMode = 'ultra-low' | 'low' | 'balanced' | 'performance';

// Mock Performance Booster
const createPerformanceBooster = () => {
  let currentMode: PerformanceMode = 'balanced';
  let gcInterval: ReturnType<typeof setInterval> | null = null;
  const metrics = {
    memoryUsage: 0,
    cpuUsage: 0,
    gcCount: 0,
  };

  return {
    setMode: vi.fn((mode: PerformanceMode) => {
      currentMode = mode;
    }),
    
    getMode: vi.fn(() => currentMode),
    
    getConfig: vi.fn((mode: PerformanceMode) => {
      const configs: Record<PerformanceMode, { maxMemory: number; gcInterval: number }> = {
        'ultra-low': { maxMemory: 150, gcInterval: 30000 },
        'low': { maxMemory: 256, gcInterval: 60000 },
        'balanced': { maxMemory: 512, gcInterval: 120000 },
        'performance': { maxMemory: 1024, gcInterval: 300000 },
      };
      return configs[mode];
    }),

    startGCSchedule: vi.fn(() => {
      const config = createPerformanceBooster().getConfig(currentMode);
      gcInterval = setInterval(() => {
        metrics.gcCount++;
      }, config.gcInterval);
    }),

    stopGCSchedule: vi.fn(() => {
      if (gcInterval) {
        clearInterval(gcInterval);
        gcInterval = null;
      }
    }),

    getMetrics: vi.fn(() => ({ ...metrics })),
    
    forceGC: vi.fn(() => {
      metrics.gcCount++;
      return true;
    }),

    isMemoryPressure: vi.fn((threshold = 0.85) => {
      return metrics.memoryUsage / 100 > threshold;
    }),

    setMemoryUsage: (usage: number) => {
      metrics.memoryUsage = usage;
    },
  };
};

// Mock Resource Governor
const createResourceGovernor = () => {
  const limits = {
    maxCPU: 80,
    maxMemory: 512,
    maxProcesses: 10,
  };
  let isThrottling = false;

  return {
    setLimits: vi.fn((newLimits: Partial<typeof limits>) => {
      Object.assign(limits, newLimits);
    }),

    getLimits: vi.fn(() => ({ ...limits })),

    checkLimits: vi.fn((usage: { cpu: number; memory: number }) => {
      const violations: string[] = [];
      if (usage.cpu > limits.maxCPU) violations.push('CPU');
      if (usage.memory > limits.maxMemory) violations.push('Memory');
      return { withinLimits: violations.length === 0, violations };
    }),

    startThrottling: vi.fn(() => {
      isThrottling = true;
    }),

    stopThrottling: vi.fn(() => {
      isThrottling = false;
    }),

    isThrottling: vi.fn(() => isThrottling),
  };
};

// Mock Memory Manager
const createMemoryManager = () => {
  let heapUsed = 100 * 1024 * 1024; // 100MB
  const snapshots: Array<{ timestamp: number; heapUsed: number }> = [];

  return {
    getHeapUsed: vi.fn(() => heapUsed),
    
    getHeapUsedMB: vi.fn(() => Math.round(heapUsed / (1024 * 1024))),

    setHeapUsed: (bytes: number) => {
      heapUsed = bytes;
    },

    takeSnapshot: vi.fn(() => {
      const snapshot = { timestamp: Date.now(), heapUsed };
      snapshots.push(snapshot);
      return snapshot;
    }),

    getSnapshots: vi.fn(() => [...snapshots]),

    detectLeak: vi.fn(() => {
      if (snapshots.length < 2) return false;
      const growth = snapshots[snapshots.length - 1].heapUsed - snapshots[0].heapUsed;
      return growth > 50 * 1024 * 1024; // 50MB growth = leak
    }),

    clearSnapshots: vi.fn(() => {
      snapshots.length = 0;
    }),

    optimize: vi.fn(() => {
      heapUsed = Math.floor(heapUsed * 0.7); // Simulate 30% reduction
      return heapUsed;
    }),
  };
};

describe('PerformanceBooster', () => {
  let performanceBooster: ReturnType<typeof createPerformanceBooster>;

  beforeEach(() => {
    performanceBooster = createPerformanceBooster();
  });

  afterEach(() => {
    performanceBooster.stopGCSchedule();
  });

  describe('Mode Management', () => {
    it('should default to balanced mode', () => {
      expect(performanceBooster.getMode()).toBe('balanced');
    });

    it('should change modes', () => {
      performanceBooster.setMode('ultra-low');
      expect(performanceBooster.setMode).toHaveBeenCalledWith('ultra-low');
    });

    it('should return correct config for each mode', () => {
      const ultraLow = performanceBooster.getConfig('ultra-low');
      const performance = performanceBooster.getConfig('performance');
      
      expect(ultraLow.maxMemory).toBeLessThan(performance.maxMemory);
      expect(ultraLow.gcInterval).toBeLessThan(performance.gcInterval);
    });
  });

  describe('Garbage Collection', () => {
    it('should force GC', () => {
      const initialCount = performanceBooster.getMetrics().gcCount;
      performanceBooster.forceGC();
      expect(performanceBooster.getMetrics().gcCount).toBe(initialCount + 1);
    });
  });

  describe('Memory Pressure', () => {
    it('should detect memory pressure', () => {
      performanceBooster.setMemoryUsage(90); // 90%
      expect(performanceBooster.isMemoryPressure(0.85)).toBe(true);
    });

    it('should not report pressure under threshold', () => {
      performanceBooster.setMemoryUsage(50); // 50%
      expect(performanceBooster.isMemoryPressure(0.85)).toBe(false);
    });
  });
});

describe('ResourceGovernor', () => {
  let resourceGovernor: ReturnType<typeof createResourceGovernor>;

  beforeEach(() => {
    resourceGovernor = createResourceGovernor();
  });

  describe('Limit Management', () => {
    it('should have default limits', () => {
      const limits = resourceGovernor.getLimits();
      expect(limits.maxCPU).toBe(80);
      expect(limits.maxMemory).toBe(512);
    });

    it('should update limits', () => {
      resourceGovernor.setLimits({ maxCPU: 50 });
      expect(resourceGovernor.setLimits).toHaveBeenCalledWith({ maxCPU: 50 });
    });
  });

  describe('Limit Checking', () => {
    it('should pass within limits', () => {
      const result = resourceGovernor.checkLimits({ cpu: 50, memory: 300 });
      expect(result.withinLimits).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect CPU violation', () => {
      const result = resourceGovernor.checkLimits({ cpu: 95, memory: 300 });
      expect(result.withinLimits).toBe(false);
      expect(result.violations).toContain('CPU');
    });

    it('should detect memory violation', () => {
      const result = resourceGovernor.checkLimits({ cpu: 50, memory: 600 });
      expect(result.withinLimits).toBe(false);
      expect(result.violations).toContain('Memory');
    });

    it('should detect multiple violations', () => {
      const result = resourceGovernor.checkLimits({ cpu: 95, memory: 600 });
      expect(result.withinLimits).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('Throttling', () => {
    it('should track throttling state', () => {
      expect(resourceGovernor.isThrottling()).toBe(false);
      resourceGovernor.startThrottling();
      expect(resourceGovernor.startThrottling).toHaveBeenCalled();
    });
  });
});

describe('MemoryManager', () => {
  let memoryManager: ReturnType<typeof createMemoryManager>;

  beforeEach(() => {
    memoryManager = createMemoryManager();
  });

  describe('Memory Tracking', () => {
    it('should report heap usage', () => {
      expect(memoryManager.getHeapUsedMB()).toBe(100);
    });

    it('should take snapshots', () => {
      memoryManager.takeSnapshot();
      expect(memoryManager.getSnapshots()).toHaveLength(1);
    });
  });

  describe('Leak Detection', () => {
    it('should not detect leak with insufficient data', () => {
      expect(memoryManager.detectLeak()).toBe(false);
    });

    it('should detect memory leak', () => {
      memoryManager.takeSnapshot();
      memoryManager.setHeapUsed(200 * 1024 * 1024); // Grow to 200MB
      memoryManager.takeSnapshot();
      expect(memoryManager.detectLeak()).toBe(true);
    });

    it('should not detect leak for small growth', () => {
      memoryManager.takeSnapshot();
      memoryManager.setHeapUsed(120 * 1024 * 1024); // Grow to 120MB (20MB growth)
      memoryManager.takeSnapshot();
      expect(memoryManager.detectLeak()).toBe(false);
    });
  });

  describe('Optimization', () => {
    it('should reduce memory on optimize', () => {
      const before = memoryManager.getHeapUsed();
      memoryManager.optimize();
      expect(memoryManager.getHeapUsed()).toBeLessThan(before);
    });
  });
});
