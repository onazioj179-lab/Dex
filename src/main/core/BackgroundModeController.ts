// ═══════════════════════════════════════════════════════════════════════════
// DEX - Background Mode Controller
// Phase 42: Event-driven background behavior with near-zero impact
// ═══════════════════════════════════════════════════════════════════════════

import { app, BrowserWindow, powerMonitor, ipcMain } from 'electron';
import Store from 'electron-store';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BackgroundState = 'active' | 'idle' | 'sleeping' | 'deep-sleep';

export interface BackgroundConfig {
  enabled: boolean;
  sleepAfterMinutes: number;
  deepSleepAfterMinutes: number;
  allowFileWatching: boolean;
  allowScheduledTasks: boolean;
  allowNotifications: boolean;
  wakeOnFileChange: boolean;
  wakeOnSchedule: boolean;
  maxWakePerHour: number;
}

export interface BackgroundStatus {
  state: BackgroundState;
  stateEnterTime: number;
  wakeCount: number;
  lastWakeReason: string | null;
  activeServices: string[];
  pausedServices: string[];
  memoryUsageMB: number;
  cpuUsagePercent: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  type: 'maintenance' | 'sync' | 'cleanup' | 'custom';
  schedule: {
    type: 'interval' | 'time' | 'idle-only';
    value: number; // ms for interval, hour (0-23) for time
  };
  lastRun: number;
  nextRun: number;
  enabled: boolean;
  runOnWake: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

const backgroundStore = new Store<{
  config: BackgroundConfig;
  status: BackgroundStatus;
  scheduledTasks: ScheduledTask[];
  wakeHistory: Array<{ timestamp: number; reason: string }>;
}>({
  name: 'background-mode',
  defaults: {
    config: {
      enabled: true,
      sleepAfterMinutes: 5,
      deepSleepAfterMinutes: 30,
      allowFileWatching: true,
      allowScheduledTasks: true,
      allowNotifications: true,
      wakeOnFileChange: false, // Conservative default
      wakeOnSchedule: false,
      maxWakePerHour: 3,
    },
    status: {
      state: 'active',
      stateEnterTime: Date.now(),
      wakeCount: 0,
      lastWakeReason: null,
      activeServices: [],
      pausedServices: [],
      memoryUsageMB: 0,
      cpuUsagePercent: 0,
    },
    scheduledTasks: [
      {
        id: 'maintenance',
        name: 'System Maintenance',
        type: 'maintenance',
        schedule: { type: 'idle-only', value: 24 * 60 * 60 * 1000 }, // Daily
        lastRun: 0,
        nextRun: 0,
        enabled: true,
        runOnWake: false,
      },
    ],
    wakeHistory: [],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND MODE CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class BackgroundModeController {
  private static instance: BackgroundModeController;
  private initialized = false;
  private currentState: BackgroundState = 'active';
  private sleepTimer: NodeJS.Timeout | null = null;
  private deepSleepTimer: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private pausedServices: Set<string> = new Set();
  private activeServices: Set<string> = new Set(['core']);
  private stateChangeListeners: Set<(state: BackgroundState) => void> = new Set();
  private wakeCountThisHour = 0;
  private hourResetTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): BackgroundModeController {
    if (!BackgroundModeController.instance) {
      BackgroundModeController.instance = new BackgroundModeController();
    }
    return BackgroundModeController.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = backgroundStore.get('config');
    if (!config.enabled) {
      console.log('[BackgroundModeController] Background mode disabled');
      return;
    }

    // Set up event listeners
    this.setupEventListeners();

    // Reset hourly wake count
    this.hourResetTimer = setInterval(() => {
      this.wakeCountThisHour = 0;
    }, 60 * 60 * 1000);

    // Start in active state
    this.setState('active');

    this.initialized = true;
    console.log('[BackgroundModeController] Initialized');
  }

  private setupEventListeners(): void {
    // Window focus/blur
    app.on('browser-window-focus', () => {
      this.recordActivity('window-focus');
      this.wake('user-interaction');
    });

    app.on('browser-window-blur', () => {
      this.startSleepTimer();
    });

    // System events
    powerMonitor.on('suspend', () => {
      this.enterDeepSleep('system-suspend');
    });

    powerMonitor.on('resume', () => {
      this.wake('system-resume');
    });

    powerMonitor.on('lock-screen', () => {
      this.enterSleep('screen-lock');
    });

    powerMonitor.on('unlock-screen', () => {
      this.wake('screen-unlock');
    });

    // IPC for user activity
    ipcMain.on('user:activity', () => {
      this.recordActivity('user-activity');
    });
  }

  async shutdown(): Promise<void> {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.deepSleepTimer) clearTimeout(this.deepSleepTimer);
    if (this.hourResetTimer) clearInterval(this.hourResetTimer);
    
    this.saveStatus();
    this.initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  private setState(newState: BackgroundState): void {
    if (this.currentState === newState) return;

    const previousState = this.currentState;
    this.currentState = newState;

    console.log(`[BackgroundModeController] State: ${previousState} → ${newState}`);

    // Update stored status
    const status = backgroundStore.get('status');
    status.state = newState;
    status.stateEnterTime = Date.now();
    backgroundStore.set('status', status);

    // Apply state-specific behavior
    this.applyStateTransition(previousState, newState);

    // Notify listeners
    this.stateChangeListeners.forEach(cb => cb(newState));
  }

  private applyStateTransition(from: BackgroundState, to: BackgroundState): void {
    switch (to) {
      case 'active':
        this.resumeAllServices();
        break;

      case 'idle':
        // Reduce non-essential activity
        this.pauseService('indexing');
        this.pauseService('sync');
        break;

      case 'sleeping':
        // Pause most services
        this.pauseService('indexing');
        this.pauseService('sync');
        this.pauseService('media');
        this.pauseService('analytics');
        break;

      case 'deep-sleep':
        // Pause all non-essential services
        this.pauseAllNonEssential();
        break;
    }
  }

  getState(): BackgroundState {
    return this.currentState;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SLEEP / WAKE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  private startSleepTimer(): void {
    if (this.currentState === 'deep-sleep') return;

    const config = backgroundStore.get('config');
    
    // Clear existing timers
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.deepSleepTimer) clearTimeout(this.deepSleepTimer);

    // Set sleep timer
    this.sleepTimer = setTimeout(() => {
      if (this.currentState === 'active') {
        this.enterSleep('inactivity');
      }
    }, config.sleepAfterMinutes * 60 * 1000);

    // Set deep sleep timer
    this.deepSleepTimer = setTimeout(() => {
      if (this.currentState !== 'deep-sleep') {
        this.enterDeepSleep('extended-inactivity');
      }
    }, config.deepSleepAfterMinutes * 60 * 1000);
  }

  private enterSleep(reason: string): void {
    console.log(`[BackgroundModeController] Entering sleep: ${reason}`);
    this.setState('sleeping');
  }

  private enterDeepSleep(reason: string): void {
    console.log(`[BackgroundModeController] Entering deep sleep: ${reason}`);
    this.setState('deep-sleep');

    // Attempt memory compaction
    if (global.gc) {
      global.gc();
    }
  }

  wake(reason: string): void {
    const config = backgroundStore.get('config');

    // Check wake limit
    if (this.currentState === 'deep-sleep') {
      if (this.wakeCountThisHour >= config.maxWakePerHour) {
        console.log('[BackgroundModeController] Wake limit reached, staying asleep');
        return;
      }
      this.wakeCountThisHour++;
    }

    console.log(`[BackgroundModeController] Waking: ${reason}`);

    // Record wake
    const history = backgroundStore.get('wakeHistory');
    history.push({ timestamp: Date.now(), reason });
    if (history.length > 100) history.splice(0, history.length - 100);
    backgroundStore.set('wakeHistory', history);

    // Update status
    const status = backgroundStore.get('status');
    status.wakeCount++;
    status.lastWakeReason = reason;
    backgroundStore.set('status', status);

    this.setState('active');
    this.startSleepTimer();
  }

  recordActivity(source: string): void {
    this.lastActivityTime = Date.now();

    // If sleeping, wake on activity
    if (this.currentState === 'sleeping' || this.currentState === 'idle') {
      this.wake(source);
    }

    // Reset sleep timers
    this.startSleepTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERVICE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  registerService(serviceId: string): void {
    this.activeServices.add(serviceId);
    this.pausedServices.delete(serviceId);
    this.updateServiceStatus();
  }

  unregisterService(serviceId: string): void {
    this.activeServices.delete(serviceId);
    this.pausedServices.delete(serviceId);
    this.updateServiceStatus();
  }

  pauseService(serviceId: string): void {
    if (this.activeServices.has(serviceId)) {
      this.activeServices.delete(serviceId);
      this.pausedServices.add(serviceId);
      this.updateServiceStatus();
    }
  }

  resumeService(serviceId: string): void {
    if (this.pausedServices.has(serviceId)) {
      this.pausedServices.delete(serviceId);
      this.activeServices.add(serviceId);
      this.updateServiceStatus();
    }
  }

  private pauseAllNonEssential(): void {
    const essential = ['core'];
    for (const service of this.activeServices) {
      if (!essential.includes(service)) {
        this.pauseService(service);
      }
    }
  }

  private resumeAllServices(): void {
    for (const service of this.pausedServices) {
      this.activeServices.add(service);
    }
    this.pausedServices.clear();
    this.updateServiceStatus();
  }

  private updateServiceStatus(): void {
    const status = backgroundStore.get('status');
    status.activeServices = Array.from(this.activeServices);
    status.pausedServices = Array.from(this.pausedServices);
    backgroundStore.set('status', status);
  }

  isServiceActive(serviceId: string): boolean {
    return this.activeServices.has(serviceId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEDULED TASKS
  // ─────────────────────────────────────────────────────────────────────────

  getScheduledTasks(): ScheduledTask[] {
    return backgroundStore.get('scheduledTasks');
  }

  async addScheduledTask(task: Omit<ScheduledTask, 'id' | 'lastRun' | 'nextRun'>): Promise<ScheduledTask> {
    const tasks = backgroundStore.get('scheduledTasks');
    
    const newTask: ScheduledTask = {
      ...task,
      id: `task_${Date.now()}`,
      lastRun: 0,
      nextRun: this.calculateNextRun(task.schedule),
    };

    tasks.push(newTask);
    backgroundStore.set('scheduledTasks', tasks);

    return newTask;
  }

  async removeScheduledTask(taskId: string): Promise<boolean> {
    const tasks = backgroundStore.get('scheduledTasks');
    const filtered = tasks.filter(t => t.id !== taskId);
    
    if (filtered.length === tasks.length) return false;
    
    backgroundStore.set('scheduledTasks', filtered);
    return true;
  }

  async toggleScheduledTask(taskId: string, enabled: boolean): Promise<boolean> {
    const tasks = backgroundStore.get('scheduledTasks');
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) return false;
    
    task.enabled = enabled;
    backgroundStore.set('scheduledTasks', tasks);
    return true;
  }

  private calculateNextRun(schedule: ScheduledTask['schedule']): number {
    const now = Date.now();
    
    switch (schedule.type) {
      case 'interval':
        return now + schedule.value;
      
      case 'time':
        const targetHour = schedule.value;
        const date = new Date();
        date.setHours(targetHour, 0, 0, 0);
        if (date.getTime() <= now) {
          date.setDate(date.getDate() + 1);
        }
        return date.getTime();
      
      case 'idle-only':
        return now + schedule.value;
      
      default:
        return now + 24 * 60 * 60 * 1000; // Default to daily
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  getConfig(): BackgroundConfig {
    return backgroundStore.get('config');
  }

  async updateConfig(updates: Partial<BackgroundConfig>): Promise<BackgroundConfig> {
    const current = backgroundStore.get('config');
    const updated = { ...current, ...updates };
    backgroundStore.set('config', updated);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────────────────

  getStatus(): BackgroundStatus {
    const status = backgroundStore.get('status');
    
    // Update memory usage
    const memoryUsage = process.memoryUsage();
    status.memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    return status;
  }

  private saveStatus(): void {
    const status = backgroundStore.get('status');
    status.state = this.currentState;
    status.activeServices = Array.from(this.activeServices);
    status.pausedServices = Array.from(this.pausedServices);
    backgroundStore.set('status', status);
  }

  getWakeHistory(limit: number = 20): Array<{ timestamp: number; reason: string }> {
    return backgroundStore.get('wakeHistory').slice(-limit);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LISTENERS
  // ─────────────────────────────────────────────────────────────────────────

  onStateChange(callback: (state: BackgroundState) => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  isSleeping(): boolean {
    return this.currentState === 'sleeping' || this.currentState === 'deep-sleep';
  }

  isDeepSleeping(): boolean {
    return this.currentState === 'deep-sleep';
  }

  canRunBackgroundTask(): boolean {
    const config = backgroundStore.get('config');
    return config.enabled && config.allowScheduledTasks && !this.isDeepSleeping();
  }

  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivityTime;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const backgroundModeController = BackgroundModeController.getInstance();
export default backgroundModeController;
