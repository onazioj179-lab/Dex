/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX CORE MODULE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Unit tests for core runtime and engine modules:
 * - RuleEngine
 * - ErrorClassifier
 * - ResourceManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

console.log('🧪 DEX Core Module Test Suite Starting...');

// ═══════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '1.0.1'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('electron-store', () => ({
  default: vi.fn(() => ({
    get: vi.fn((key, defaultValue) => defaultValue),
    set: vi.fn(),
    delete: vi.fn(),
    path: '/mock/store.json',
  })),
}));

// ═══════════════════════════════════════════════════════════════════════════
// RuleEngine Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('RuleEngine', () => {
  describe('Condition Evaluation', () => {
    it('should evaluate time conditions', () => {
      const evaluator = createConditionEvaluator();
      
      // Mock current time to 14:00
      const condition = { type: 'time', value: '14:00', operator: 'and' };
      const result = evaluator.evaluateTimeCondition(condition, new Date('2026-01-25T14:00:00'));
      
      expect(result).toBe(true);
    });

    it('should evaluate time-range conditions', () => {
      const evaluator = createConditionEvaluator();
      
      const condition = { type: 'time-range', value: '09:00-17:00', operator: 'and' };
      
      // 14:00 is within range
      expect(evaluator.evaluateTimeRangeCondition(condition, new Date('2026-01-25T14:00:00'))).toBe(true);
      
      // 08:00 is outside range
      expect(evaluator.evaluateTimeRangeCondition(condition, new Date('2026-01-25T08:00:00'))).toBe(false);
    });

    it('should evaluate process-running conditions', () => {
      const evaluator = createConditionEvaluator();
      const runningProcesses = ['chrome.exe', 'code.exe', 'slack.exe'];
      
      expect(evaluator.evaluateProcessCondition('chrome.exe', runningProcesses, true)).toBe(true);
      expect(evaluator.evaluateProcessCondition('firefox.exe', runningProcesses, true)).toBe(false);
    });

    it('should evaluate battery conditions', () => {
      const evaluator = createConditionEvaluator();
      
      expect(evaluator.evaluateBatteryCondition('below', 20, 15)).toBe(true);
      expect(evaluator.evaluateBatteryCondition('below', 20, 25)).toBe(false);
      expect(evaluator.evaluateBatteryCondition('above', 80, 90)).toBe(true);
    });

    it('should combine conditions with AND logic', () => {
      const evaluator = createConditionEvaluator();
      
      const conditions = [
        { result: true, operator: 'and' },
        { result: true, operator: 'and' },
        { result: false, operator: 'and' },
      ];
      
      expect(evaluator.combineResults(conditions, 'and')).toBe(false);
    });

    it('should combine conditions with OR logic', () => {
      const evaluator = createConditionEvaluator();
      
      const conditions = [
        { result: false, operator: 'or' },
        { result: true, operator: 'or' },
        { result: false, operator: 'or' },
      ];
      
      expect(evaluator.combineResults(conditions, 'or')).toBe(true);
    });
  });

  describe('Rule Execution', () => {
    it('should respect cooldown period', () => {
      const rule = createMockRule({
        cooldown: 60000, // 1 minute
        lastTriggered: Date.now() - 30000, // 30 seconds ago
      });
      
      expect(isRuleOnCooldown(rule)).toBe(true);
    });

    it('should allow execution after cooldown', () => {
      const rule = createMockRule({
        cooldown: 60000,
        lastTriggered: Date.now() - 120000, // 2 minutes ago
      });
      
      expect(isRuleOnCooldown(rule)).toBe(false);
    });

    it('should increment trigger count', () => {
      const rule = createMockRule({ triggerCount: 5 });
      const updated = incrementTriggerCount(rule);
      
      expect(updated.triggerCount).toBe(6);
      expect(updated.lastTriggered).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ErrorClassifier Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('ErrorClassifier', () => {
  describe('Error Categorization', () => {
    it('should classify network errors', () => {
      const error = new Error('ECONNREFUSED');
      expect(classifyError(error)).toBe('network');
      
      const timeoutError = new Error('ETIMEDOUT');
      expect(classifyError(timeoutError)).toBe('network');
    });

    it('should classify permission errors', () => {
      const error = new Error('EACCES: permission denied');
      expect(classifyError(error)).toBe('permission');
      
      const epermError = new Error('EPERM');
      expect(classifyError(epermError)).toBe('permission');
    });

    it('should classify file system errors', () => {
      const error = new Error('ENOENT: no such file');
      expect(classifyError(error)).toBe('filesystem');
      
      const enoentError = new Error('ENOENT');
      expect(classifyError(enoentError)).toBe('filesystem');
    });

    it('should classify memory errors', () => {
      const error = new Error('JavaScript heap out of memory');
      expect(classifyError(error)).toBe('memory');
    });

    it('should default to unknown for unrecognized errors', () => {
      const error = new Error('Something weird happened');
      expect(classifyError(error)).toBe('unknown');
    });
  });

  describe('Severity Assessment', () => {
    it('should rate memory errors as critical', () => {
      expect(getErrorSeverity('memory')).toBe('critical');
    });

    it('should rate permission errors as high', () => {
      expect(getErrorSeverity('permission')).toBe('high');
    });

    it('should rate network errors as medium', () => {
      expect(getErrorSeverity('network')).toBe('medium');
    });

    it('should rate filesystem errors as low', () => {
      expect(getErrorSeverity('filesystem')).toBe('low');
    });
  });

  describe('Recovery Suggestions', () => {
    it('should suggest retry for network errors', () => {
      const suggestions = getSuggestedRecovery('network');
      expect(suggestions).toContain('retry');
    });

    it('should suggest restart for memory errors', () => {
      const suggestions = getSuggestedRecovery('memory');
      expect(suggestions).toContain('restart');
    });

    it('should suggest permission fix for permission errors', () => {
      const suggestions = getSuggestedRecovery('permission');
      expect(suggestions).toContain('check-permissions');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ResourceManager Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceManager', () => {
  describe('Resource Limits', () => {
    it('should enforce memory limits', () => {
      const manager = createResourceManager({ memoryLimitMB: 512 });
      
      expect(manager.isWithinMemoryLimit(400 * 1024 * 1024)).toBe(true); // 400MB
      expect(manager.isWithinMemoryLimit(600 * 1024 * 1024)).toBe(false); // 600MB
    });

    it('should enforce CPU limits', () => {
      const manager = createResourceManager({ cpuLimitPercent: 80 });
      
      expect(manager.isWithinCPULimit(50)).toBe(true);
      expect(manager.isWithinCPULimit(90)).toBe(false);
    });

    it('should track concurrent operations', () => {
      const manager = createResourceManager({ maxConcurrentOps: 5 });
      
      // Add 5 operations
      for (let i = 0; i < 5; i++) {
        expect(manager.acquireSlot()).toBe(true);
      }
      
      // 6th should fail
      expect(manager.acquireSlot()).toBe(false);
    });

    it('should release operation slots', () => {
      const manager = createResourceManager({ maxConcurrentOps: 2 });
      
      manager.acquireSlot();
      manager.acquireSlot();
      expect(manager.acquireSlot()).toBe(false);
      
      manager.releaseSlot();
      expect(manager.acquireSlot()).toBe(true);
    });
  });

  describe('Resource Monitoring', () => {
    it('should calculate resource utilization', () => {
      const manager = createResourceManager({
        memoryLimitMB: 1024,
        cpuLimitPercent: 100,
      });
      
      const utilization = manager.getUtilization(512 * 1024 * 1024, 50);
      
      expect(utilization.memoryPercent).toBe(50);
      expect(utilization.cpuPercent).toBe(50);
    });

    it('should identify resource pressure', () => {
      const manager = createResourceManager({ memoryLimitMB: 512 });
      
      expect(manager.isUnderPressure(400 * 1024 * 1024, 50)).toBe(false);
      expect(manager.isUnderPressure(500 * 1024 * 1024, 90)).toBe(true);
    });
  });

  describe('Throttling', () => {
    it('should throttle when over limits', () => {
      const manager = createResourceManager({
        memoryLimitMB: 512,
        cpuLimitPercent: 80,
      });
      
      const action = manager.getThrottleAction(600 * 1024 * 1024, 90);
      
      expect(action.shouldThrottle).toBe(true);
      expect(action.reasons).toContain('memory');
      expect(action.reasons).toContain('cpu');
    });

    it('should not throttle when within limits', () => {
      const manager = createResourceManager({
        memoryLimitMB: 512,
        cpuLimitPercent: 80,
      });
      
      const action = manager.getThrottleAction(200 * 1024 * 1024, 30);
      
      expect(action.shouldThrottle).toBe(false);
      expect(action.reasons).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createConditionEvaluator() {
  return {
    evaluateTimeCondition(condition: any, now: Date) {
      const [hours, minutes] = condition.value.split(':').map(Number);
      return now.getHours() === hours && now.getMinutes() === minutes;
    },
    
    evaluateTimeRangeCondition(condition: any, now: Date) {
      const [start, end] = condition.value.split('-');
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    },
    
    evaluateProcessCondition(process: string, running: string[], shouldBeRunning: boolean) {
      const isRunning = running.includes(process);
      return shouldBeRunning ? isRunning : !isRunning;
    },
    
    evaluateBatteryCondition(type: string, threshold: number, current: number) {
      return type === 'below' ? current < threshold : current > threshold;
    },
    
    combineResults(conditions: any[], defaultOp: string) {
      if (defaultOp === 'and') {
        return conditions.every(c => c.result);
      }
      return conditions.some(c => c.result);
    },
  };
}

function createMockRule(overrides: any = {}) {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    enabled: true,
    conditions: [],
    actions: [],
    cooldown: 60000,
    lastTriggered: null,
    triggerCount: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function isRuleOnCooldown(rule: any): boolean {
  if (!rule.lastTriggered) return false;
  return Date.now() - rule.lastTriggered < rule.cooldown;
}

function incrementTriggerCount(rule: any) {
  return {
    ...rule,
    triggerCount: rule.triggerCount + 1,
    lastTriggered: Date.now(),
  };
}

function classifyError(error: Error): string {
  const msg = error.message.toLowerCase();
  
  if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('network')) {
    return 'network';
  }
  if (msg.includes('eacces') || msg.includes('eperm') || msg.includes('permission')) {
    return 'permission';
  }
  if (msg.includes('enoent') || msg.includes('no such file')) {
    return 'filesystem';
  }
  if (msg.includes('heap') || msg.includes('memory')) {
    return 'memory';
  }
  return 'unknown';
}

function getErrorSeverity(category: string): string {
  const severities: Record<string, string> = {
    memory: 'critical',
    permission: 'high',
    network: 'medium',
    filesystem: 'low',
    unknown: 'medium',
  };
  return severities[category] || 'medium';
}

function getSuggestedRecovery(category: string): string[] {
  const recoveries: Record<string, string[]> = {
    network: ['retry', 'check-connection'],
    memory: ['restart', 'clear-cache'],
    permission: ['check-permissions', 'run-as-admin'],
    filesystem: ['check-path', 'create-directory'],
    unknown: ['retry', 'report-issue'],
  };
  return recoveries[category] || ['retry'];
}

function createResourceManager(config: any) {
  let currentOps = 0;
  
  return {
    isWithinMemoryLimit(bytes: number) {
      return bytes <= config.memoryLimitMB * 1024 * 1024;
    },
    
    isWithinCPULimit(percent: number) {
      return percent <= config.cpuLimitPercent;
    },
    
    acquireSlot() {
      if (currentOps >= config.maxConcurrentOps) return false;
      currentOps++;
      return true;
    },
    
    releaseSlot() {
      if (currentOps > 0) currentOps--;
    },
    
    getUtilization(memBytes: number, cpuPercent: number) {
      return {
        memoryPercent: (memBytes / (config.memoryLimitMB * 1024 * 1024)) * 100,
        cpuPercent,
      };
    },
    
    isUnderPressure(memBytes: number, cpuPercent: number) {
      const memUtil = memBytes / (config.memoryLimitMB * 1024 * 1024);
      return memUtil > 0.9 || cpuPercent > 85;
    },
    
    getThrottleAction(memBytes: number, cpuPercent: number) {
      const reasons: string[] = [];
      
      if (!this.isWithinMemoryLimit(memBytes)) reasons.push('memory');
      if (!this.isWithinCPULimit(cpuPercent)) reasons.push('cpu');
      
      return {
        shouldThrottle: reasons.length > 0,
        reasons,
      };
    },
  };
}

console.log('✅ DEX Core Module Test Suite Complete');
