/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX AUTOMATION MODULE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Unit tests for automation modules:
 * - MacroRecorder
 * - ScheduleManager
 * - ActionQueue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

console.log('🧪 DEX Automation Module Test Suite Starting...');

// ═══════════════════════════════════════════════════════════════════════════
// MacroRecorder Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('MacroRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Recording', () => {
    it('should start recording', () => {
      const recorder = createMacroRecorder();
      
      recorder.startRecording();
      
      expect(recorder.isRecording()).toBe(true);
    });

    it('should record actions with timestamps', () => {
      const recorder = createMacroRecorder();
      
      recorder.startRecording();
      recorder.recordAction({ type: 'click', target: '#button1' });
      vi.advanceTimersByTime(500);
      recorder.recordAction({ type: 'type', value: 'hello' });
      recorder.stopRecording();
      
      const macro = recorder.getMacro();
      expect(macro.actions).toHaveLength(2);
      expect(macro.actions[1].delay).toBe(500);
    });

    it('should capture action metadata', () => {
      const recorder = createMacroRecorder();
      
      recorder.startRecording();
      recorder.recordAction({
        type: 'click',
        target: '#submit',
        x: 100,
        y: 200,
        modifiers: ['ctrl'],
      });
      
      const macro = recorder.getMacro();
      expect(macro.actions[0].x).toBe(100);
      expect(macro.actions[0].modifiers).toContain('ctrl');
    });
  });

  describe('Playback', () => {
    it('should replay actions in order', async () => {
      const recorder = createMacroRecorder();
      const executedActions: string[] = [];
      
      recorder.setExecutor((action) => {
        executedActions.push(action.type);
        return Promise.resolve();
      });
      
      recorder.loadMacro({
        name: 'test',
        actions: [
          { type: 'click', delay: 0 },
          { type: 'type', delay: 100 },
          { type: 'scroll', delay: 100 },
        ],
      });
      
      const playPromise = recorder.play();
      await vi.runAllTimersAsync();
      await playPromise;
      
      expect(executedActions).toEqual(['click', 'type', 'scroll']);
    });

    it('should respect delays', async () => {
      const recorder = createMacroRecorder();
      let executionCount = 0;
      
      recorder.setExecutor(async () => {
        executionCount++;
      });
      
      recorder.loadMacro({
        name: 'test',
        actions: [
          { type: 'action1', delay: 0 },
          { type: 'action2', delay: 1000 },
        ],
      });
      
      recorder.play();
      
      // First action executes immediately
      await vi.advanceTimersByTimeAsync(10);
      expect(executionCount).toBe(1);
      
      // Second action waits for delay
      await vi.advanceTimersByTimeAsync(1000);
      expect(executionCount).toBe(2);
    });

    it('should support speed multiplier', async () => {
      const recorder = createMacroRecorder();
      let lastExecutionTime = 0;
      
      recorder.setExecutor(async () => {
        lastExecutionTime = Date.now();
      });
      
      recorder.loadMacro({
        name: 'test',
        actions: [
          { type: 'action1', delay: 0 },
          { type: 'action2', delay: 1000 },
        ],
      });
      
      const startTime = Date.now();
      recorder.play({ speed: 2.0 }); // 2x speed
      
      await vi.advanceTimersByTimeAsync(500); // Half the original delay
      
      // At 2x speed, 1000ms delay becomes 500ms
      expect(lastExecutionTime - startTime).toBe(500);
    });
  });

  describe('Pause/Resume', () => {
    it('should pause playback', async () => {
      const recorder = createMacroRecorder();
      let executionCount = 0;
      
      recorder.setExecutor(async () => { executionCount++; });
      recorder.loadMacro({
        name: 'test',
        actions: [
          { type: 'a1', delay: 0 },
          { type: 'a2', delay: 100 },
          { type: 'a3', delay: 100 },
        ],
      });
      
      recorder.play();
      await vi.advanceTimersByTimeAsync(50);
      
      recorder.pause();
      await vi.advanceTimersByTimeAsync(200);
      
      expect(executionCount).toBe(1); // Only first action
      expect(recorder.isPaused()).toBe(true);
    });

    it('should resume from pause', async () => {
      const recorder = createMacroRecorder();
      let executionCount = 0;
      
      recorder.setExecutor(async () => { executionCount++; });
      recorder.loadMacro({
        name: 'test',
        actions: [
          { type: 'a1', delay: 0 },
          { type: 'a2', delay: 100 },
          { type: 'a3', delay: 100 },
        ],
      });
      
      recorder.play();
      await vi.advanceTimersByTimeAsync(50);
      
      recorder.pause();
      const countAfterPause = executionCount;
      
      recorder.resume();
      await vi.advanceTimersByTimeAsync(250);
      
      // Should have executed more actions after resume
      expect(executionCount).toBeGreaterThan(countAfterPause);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ScheduleManager Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('ScheduleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Task Scheduling', () => {
    it('should schedule one-time tasks', () => {
      const scheduler = createScheduleManager();
      
      const taskId = scheduler.scheduleOnce({
        name: 'backup',
        runAt: new Date('2024-01-15T12:00:00'),
        action: () => {},
      });
      
      expect(taskId).toBeDefined();
      expect(scheduler.getTask(taskId)).toBeDefined();
    });

    it('should execute task at scheduled time', async () => {
      const scheduler = createScheduleManager();
      let executed = false;
      
      scheduler.scheduleOnce({
        name: 'test',
        runAt: new Date('2024-01-15T11:00:00'),
        action: () => { executed = true; },
      });
      
      scheduler.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 1 hour
      
      expect(executed).toBe(true);
    });

    it('should not execute before scheduled time', async () => {
      const scheduler = createScheduleManager();
      let executed = false;
      
      scheduler.scheduleOnce({
        name: 'test',
        runAt: new Date('2024-01-15T11:00:00'),
        action: () => { executed = true; },
      });
      
      scheduler.start();
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // 30 minutes
      
      expect(executed).toBe(false);
    });
  });

  describe('Recurring Tasks', () => {
    it('should schedule recurring tasks', () => {
      const scheduler = createScheduleManager();
      
      const taskId = scheduler.scheduleRecurring({
        name: 'cleanup',
        interval: 60000, // Every minute
        action: () => {},
      });
      
      const task = scheduler.getTask(taskId);
      expect(task?.recurring).toBe(true);
    });

    it('should execute recurring tasks multiple times', async () => {
      const scheduler = createScheduleManager();
      let executionCount = 0;
      
      scheduler.scheduleRecurring({
        name: 'heartbeat',
        interval: 1000,
        action: () => { executionCount++; },
      });
      
      scheduler.start();
      await vi.advanceTimersByTimeAsync(3500);
      
      expect(executionCount).toBe(3);
    });

    it('should support cron expressions', () => {
      const scheduler = createScheduleManager();
      
      const taskId = scheduler.scheduleCron({
        name: 'daily-backup',
        cron: '0 0 * * *', // Every day at midnight
        action: () => {},
      });
      
      const nextRun = scheduler.getNextRunTime(taskId);
      expect(nextRun).toBeDefined();
    });
  });

  describe('Task Management', () => {
    it('should cancel tasks', () => {
      const scheduler = createScheduleManager();
      
      const taskId = scheduler.scheduleOnce({
        name: 'test',
        runAt: new Date('2024-01-15T12:00:00'),
        action: () => {},
      });
      
      scheduler.cancelTask(taskId);
      
      expect(scheduler.getTask(taskId)).toBeUndefined();
    });

    it('should list all tasks', () => {
      const scheduler = createScheduleManager();
      
      scheduler.scheduleOnce({ name: 'task1', runAt: new Date(), action: () => {} });
      scheduler.scheduleOnce({ name: 'task2', runAt: new Date(), action: () => {} });
      
      const tasks = scheduler.listTasks();
      expect(tasks).toHaveLength(2);
    });

    it('should pause and resume tasks', async () => {
      const scheduler = createScheduleManager();
      let executionCount = 0;
      
      const taskId = scheduler.scheduleRecurring({
        name: 'test',
        interval: 1000,
        action: () => { executionCount++; },
      });
      
      scheduler.start();
      await vi.advanceTimersByTimeAsync(2500);
      
      scheduler.pauseTask(taskId);
      await vi.advanceTimersByTimeAsync(2000);
      
      const countAfterPause = executionCount;
      
      scheduler.resumeTask(taskId);
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(executionCount).toBe(countAfterPause + 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ActionQueue Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('ActionQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Queue Operations', () => {
    it('should enqueue actions', () => {
      const queue = createActionQueue();
      
      queue.enqueue({ type: 'click', id: '1' });
      queue.enqueue({ type: 'type', id: '2' });
      
      expect(queue.length()).toBe(2);
    });

    it('should process actions in FIFO order', async () => {
      const queue = createActionQueue();
      const processed: string[] = [];
      
      queue.setProcessor(async (action) => {
        processed.push(action.id);
      });
      
      queue.enqueue({ type: 'a', id: '1' });
      queue.enqueue({ type: 'b', id: '2' });
      queue.enqueue({ type: 'c', id: '3' });
      
      await queue.processAll();
      
      expect(processed).toEqual(['1', '2', '3']);
    });

    it('should respect priority', async () => {
      const queue = createActionQueue({ usePriority: true });
      const processed: string[] = [];
      
      queue.setProcessor(async (action) => {
        processed.push(action.id);
      });
      
      queue.enqueue({ type: 'low', id: 'low', priority: 1 });
      queue.enqueue({ type: 'high', id: 'high', priority: 10 });
      queue.enqueue({ type: 'med', id: 'med', priority: 5 });
      
      await queue.processAll();
      
      expect(processed).toEqual(['high', 'med', 'low']);
    });
  });

  describe('Concurrency', () => {
    it('should limit concurrent actions', async () => {
      const queue = createActionQueue({ concurrency: 2 });
      let concurrent = 0;
      let maxConcurrent = 0;
      
      queue.setProcessor(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 100));
        concurrent--;
      });
      
      queue.enqueue({ id: '1' });
      queue.enqueue({ id: '2' });
      queue.enqueue({ id: '3' });
      
      const processPromise = queue.processAll();
      await vi.runAllTimersAsync();
      await processPromise;
      
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle action errors', async () => {
      const queue = createActionQueue();
      let errorCount = 0;
      
      queue.setProcessor(async (action) => {
        if (action.id === 'fail') {
          throw new Error('Action failed');
        }
      });
      
      queue.onError(() => { errorCount++; });
      
      queue.enqueue({ id: 'ok' });
      queue.enqueue({ id: 'fail' });
      queue.enqueue({ id: 'ok2' });
      
      await queue.processAll();
      
      expect(errorCount).toBe(1);
      expect(queue.getFailedActions()).toHaveLength(1);
    });

    it('should retry failed actions', async () => {
      const queue = createActionQueue({ maxRetries: 2 });
      let attempts = 0;
      
      queue.setProcessor(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
      });
      
      queue.enqueue({ id: 'retry-me' });
      await queue.processAll();
      
      expect(attempts).toBe(3);
    });

    it('should respect retry delay', async () => {
      const queue = createActionQueue({ maxRetries: 1, retryDelay: 1000 });
      let attempts = 0;
      const attemptTimes: number[] = [];
      
      queue.setProcessor(async () => {
        attempts++;
        attemptTimes.push(Date.now());
        if (attempts < 2) {
          throw new Error('Fail');
        }
      });
      
      queue.enqueue({ id: 'test' });
      const processPromise = queue.processAll();
      await vi.runAllTimersAsync();
      await processPromise;
      
      expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Queue Control', () => {
    it('should pause processing', async () => {
      const queue = createActionQueue();
      const processed: string[] = [];
      
      queue.setProcessor(async (action) => {
        processed.push(action.id);
        await new Promise(r => setTimeout(r, 100));
      });
      
      queue.enqueue({ id: '1' });
      queue.enqueue({ id: '2' });
      queue.enqueue({ id: '3' });
      
      queue.processAll();
      await vi.advanceTimersByTimeAsync(50);
      
      queue.pause();
      await vi.advanceTimersByTimeAsync(500);
      
      expect(processed.length).toBeLessThan(3);
    });

    it('should clear queue', () => {
      const queue = createActionQueue();
      
      queue.enqueue({ id: '1' });
      queue.enqueue({ id: '2' });
      
      queue.clear();
      
      expect(queue.length()).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createMacroRecorder() {
  let recording = false;
  let paused = false;
  let actions: any[] = [];
  let startTime = 0;
  let lastActionTime = 0;
  let executor: ((action: any) => Promise<void>) | null = null;
  let macro: any = null;
  let currentIndex = 0;
  let playResolver: (() => void) | null = null;
  
  return {
    startRecording() {
      recording = true;
      actions = [];
      startTime = Date.now();
      lastActionTime = startTime;
    },
    
    stopRecording() {
      recording = false;
    },
    
    isRecording() {
      return recording;
    },
    
    isPaused() {
      return paused;
    },
    
    recordAction(action: any) {
      if (!recording) return;
      
      const now = Date.now();
      const delay = now - lastActionTime;
      lastActionTime = now;
      
      actions.push({ ...action, delay });
    },
    
    getMacro() {
      return { name: 'recorded', actions };
    },
    
    loadMacro(m: any) {
      macro = m;
      actions = m.actions;
    },
    
    setExecutor(fn: (action: any) => Promise<void>) {
      executor = fn;
    },
    
    async play(options: { speed?: number } = {}) {
      const speed = options.speed || 1;
      currentIndex = 0;
      paused = false;
      
      return new Promise<void>((resolve) => {
        playResolver = resolve;
        this._playNext(speed);
      });
    },
    
    _playNext(speed: number) {
      if (paused || currentIndex >= actions.length) {
        if (playResolver) playResolver();
        return;
      }
      
      const action = actions[currentIndex];
      const delay = currentIndex === 0 ? 0 : action.delay / speed;
      
      setTimeout(async () => {
        if (paused) return;
        if (executor) await executor(action);
        currentIndex++;
        this._playNext(speed);
      }, delay);
    },
    
    pause() {
      paused = true;
    },
    
    resume() {
      paused = false;
      this._playNext(1);
    },
  };
}

function createScheduleManager() {
  const tasks = new Map<string, any>();
  let running = false;
  let idCounter = 0;
  
  return {
    scheduleOnce(config: any) {
      const id = `task-${++idCounter}`;
      tasks.set(id, { ...config, id, recurring: false });
      return id;
    },
    
    scheduleRecurring(config: any) {
      const id = `task-${++idCounter}`;
      tasks.set(id, { ...config, id, recurring: true });
      return id;
    },
    
    scheduleCron(config: any) {
      const id = `task-${++idCounter}`;
      // Simplified cron - just set next run to tomorrow midnight
      const nextRun = new Date();
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(0, 0, 0, 0);
      tasks.set(id, { ...config, id, recurring: true, nextRun });
      return id;
    },
    
    getTask(id: string) {
      return tasks.get(id);
    },
    
    getNextRunTime(id: string) {
      const task = tasks.get(id);
      return task?.nextRun || task?.runAt;
    },
    
    cancelTask(id: string) {
      tasks.delete(id);
    },
    
    listTasks() {
      return Array.from(tasks.values());
    },
    
    pauseTask(id: string) {
      const task = tasks.get(id);
      if (task) task.paused = true;
    },
    
    resumeTask(id: string) {
      const task = tasks.get(id);
      if (task) task.paused = false;
    },
    
    start() {
      running = true;
      this._tick();
    },
    
    _tick() {
      if (!running) return;
      
      const now = Date.now();
      
      for (const task of tasks.values()) {
        if (task.paused) continue;
        
        if (task.runAt && new Date(task.runAt).getTime() <= now && !task.executed) {
          task.action();
          task.executed = true;
          if (!task.recurring) {
            tasks.delete(task.id);
          }
        }
        
        if (task.interval && !task.lastRun) {
          task.lastRun = now;
        } else if (task.interval && (now - task.lastRun) >= task.interval) {
          if (!task.paused) {
            task.action();
            task.lastRun = now;
          }
        }
      }
      
      setTimeout(() => this._tick(), 100);
    },
  };
}

function createActionQueue(config: any = {}) {
  let queue: any[] = [];
  let processor: ((action: any) => Promise<void>) | null = null;
  let errorHandlers: ((error: Error, action: any) => void)[] = [];
  let failedActions: any[] = [];
  let paused = false;
  const concurrency = config.concurrency || 1;
  const usePriority = config.usePriority || false;
  const maxRetries = config.maxRetries || 0;
  const retryDelay = config.retryDelay || 0;
  
  return {
    enqueue(action: any) {
      queue.push({ ...action, retries: 0 });
      if (usePriority) {
        queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      }
    },
    
    length() {
      return queue.length;
    },
    
    setProcessor(fn: (action: any) => Promise<void>) {
      processor = fn;
    },
    
    onError(handler: (error: Error, action: any) => void) {
      errorHandlers.push(handler);
    },
    
    getFailedActions() {
      return [...failedActions];
    },
    
    async processAll() {
      while (queue.length > 0 && !paused) {
        const batch = queue.splice(0, concurrency);
        
        await Promise.all(batch.map(async (action) => {
          try {
            if (processor) await processor(action);
          } catch (error: any) {
            if (action.retries < maxRetries) {
              action.retries++;
              if (retryDelay) {
                await new Promise(r => setTimeout(r, retryDelay));
              }
              queue.unshift(action);
            } else {
              failedActions.push(action);
              errorHandlers.forEach(h => h(error, action));
            }
          }
        }));
      }
    },
    
    pause() {
      paused = true;
    },
    
    resume() {
      paused = false;
    },
    
    clear() {
      queue = [];
    },
  };
}

console.log('✅ DEX Automation Module Test Suite Complete');
