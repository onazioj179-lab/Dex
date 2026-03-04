// ═══════════════════════════════════════════════════════════════════════════
// DEX - Input Latency Controller
// FINAL PERFORMANCE & VISUAL SMOOTHNESS MODE
// ═══════════════════════════════════════════════════════════════════════════
// Input-to-Pixel Latency Control
// ═══════════════════════════════════════════════════════════════════════════
// TARGETS:
// - Instant typing (< 16ms latency)
// - Instant cursor movement (< 8ms)
// - Smooth scrolling at 120Hz
// - Zero hitching under load
// ═══════════════════════════════════════════════════════════════════════════

import log from 'electron-log';
import { ipcMain, BrowserWindow } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// INPUT LATENCY TARGETS
// ═══════════════════════════════════════════════════════════════════════════

export const INPUT_TARGETS = {
  // Latency bounds (ms)
  MAX_TYPING_LATENCY_MS: 16,           // Sub-frame for typing
  MAX_CURSOR_LATENCY_MS: 8,            // Sub-frame for cursor
  MAX_SCROLL_LATENCY_MS: 8,            // 120Hz frame time
  MAX_CLICK_LATENCY_MS: 16,            // Instant click response
  MAX_KEYDOWN_LATENCY_MS: 8,           // Key press response
  
  // Interaction prioritization
  PRIORITY_KEYBOARD: 1,                // Highest - typing/shortcuts
  PRIORITY_POINTER: 2,                 // Mouse/touch
  PRIORITY_SCROLL: 2,                  // Scroll events
  PRIORITY_WINDOW: 3,                  // Window events
  PRIORITY_BACKGROUND: 10,             // Background work
  
  // Deferral rules
  DEFER_THRESHOLD_MS: 4,               // Defer work if input within 4ms
  CANCEL_THRESHOLD_MS: 16,             // Cancel heavy work on input
  INPUT_DEBOUNCE_MS: 8,                // Minimum between same-type inputs
  
  // Measurement
  LATENCY_SAMPLE_SIZE: 100,            // Rolling average window
  LATENCY_REPORT_INTERVAL_MS: 5000,    // Report every 5 seconds
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type InputType = 'keyboard' | 'pointer' | 'scroll' | 'touch' | 'other';
export type InputPriority = 1 | 2 | 3 | 10;

export interface InputEvent {
  type: InputType;
  timestamp: number;
  priority: InputPriority;
}

export interface LatencyMeasurement {
  type: InputType;
  inputTime: number;
  renderTime: number;
  latencyMs: number;
}

export interface InputLatencySnapshot {
  timestamp: number;
  avgTypingLatency: number;
  avgScrollLatency: number;
  avgClickLatency: number;
  p99TypingLatency: number;
  p99ScrollLatency: number;
  inputsDeferred: number;
  inputsCanceled: number;
  isResponsive: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT LATENCY CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class InputLatencyControllerClass {
  private isRunning = false;
  private windows: Map<number, BrowserWindow> = new Map();
  
  // Latency measurements
  private keyboardLatencies: number[] = [];
  private scrollLatencies: number[] = [];
  private pointerLatencies: number[] = [];
  
  // Metrics
  private inputsDeferred = 0;
  private inputsCanceled = 0;
  private lastInputTime = 0;
  private lastInputType: InputType | null = null;
  
  // Deferral callbacks
  private deferCallbacks: Set<() => void> = new Set();
  private cancelCallbacks: Set<() => void> = new Set();
  
  // Reporting
  private reportInterval: NodeJS.Timeout | null = null;

  constructor() {}

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    log.info(' [InputLatency] Starting - Zero-latency input mode');
    log.info(` [InputLatency] Targets: ${INPUT_TARGETS.MAX_TYPING_LATENCY_MS}ms typing, ${INPUT_TARGETS.MAX_SCROLL_LATENCY_MS}ms scroll`);
    
    this.setupIPCHandlers();
    this.startReporting();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    
    log.info(' [InputLatency] Stopped');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPCHandlers(): void {
    // Record input event from renderer
    ipcMain.on('input:event', (_event, input: InputEvent) => {
      this.recordInputEvent(input);
    });
    
    // Record latency measurement from renderer
    ipcMain.on('input:latency', (_event, measurement: LatencyMeasurement) => {
      this.recordLatency(measurement);
    });
    
    // Check if work should be deferred
    ipcMain.handle('input:shouldDefer', () => {
      return this.shouldDeferWork();
    });
    
    // Get current snapshot
    ipcMain.handle('input:getSnapshot', () => this.getSnapshot());
    
    // Get input targets
    ipcMain.handle('input:getTargets', () => INPUT_TARGETS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT EVENT HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  private recordInputEvent(input: InputEvent): void {
    this.lastInputTime = input.timestamp;
    this.lastInputType = input.type;
    
    // Check if we should signal deferral to background tasks
    const timeSinceLastInput = Date.now() - this.lastInputTime;
    if (timeSinceLastInput < INPUT_TARGETS.DEFER_THRESHOLD_MS) {
      this.triggerDeferral();
    }
    
    // High-priority inputs should cancel heavy background work
    if (input.priority === 1 && timeSinceLastInput < INPUT_TARGETS.CANCEL_THRESHOLD_MS) {
      this.triggerCancellation();
    }
  }

  private recordLatency(measurement: LatencyMeasurement): void {
    const latency = measurement.latencyMs;
    
    switch (measurement.type) {
      case 'keyboard':
        this.keyboardLatencies.push(latency);
        if (this.keyboardLatencies.length > INPUT_TARGETS.LATENCY_SAMPLE_SIZE) {
          this.keyboardLatencies.shift();
        }
        // Warn on high typing latency
        if (latency > INPUT_TARGETS.MAX_TYPING_LATENCY_MS * 2) {
          log.debug(` [InputLatency] High typing latency: ${latency.toFixed(1)}ms`);
        }
        break;
        
      case 'scroll':
        this.scrollLatencies.push(latency);
        if (this.scrollLatencies.length > INPUT_TARGETS.LATENCY_SAMPLE_SIZE) {
          this.scrollLatencies.shift();
        }
        break;
        
      case 'pointer':
        this.pointerLatencies.push(latency);
        if (this.pointerLatencies.length > INPUT_TARGETS.LATENCY_SAMPLE_SIZE) {
          this.pointerLatencies.shift();
        }
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORK DEFERRAL
  // ─────────────────────────────────────────────────────────────────────────

  shouldDeferWork(): boolean {
    if (!this.lastInputTime) return false;
    
    const timeSinceInput = Date.now() - this.lastInputTime;
    return timeSinceInput < INPUT_TARGETS.DEFER_THRESHOLD_MS;
  }

  shouldCancelWork(): boolean {
    if (!this.lastInputTime || this.lastInputType !== 'keyboard') return false;
    
    const timeSinceInput = Date.now() - this.lastInputTime;
    return timeSinceInput < INPUT_TARGETS.CANCEL_THRESHOLD_MS;
  }

  private triggerDeferral(): void {
    this.inputsDeferred++;
    this.deferCallbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        log.error('[InputLatency] Deferral callback error:', err);
      }
    });
  }

  private triggerCancellation(): void {
    this.inputsCanceled++;
    this.cancelCallbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        log.error('[InputLatency] Cancel callback error:', err);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTING
  // ─────────────────────────────────────────────────────────────────────────

  private startReporting(): void {
    this.reportInterval = setInterval(() => {
      const snapshot = this.getSnapshot();
      
      // Log if latency targets are being missed
      if (!snapshot.isResponsive) {
        log.warn(` [InputLatency] Responsiveness degraded: typing=${snapshot.avgTypingLatency.toFixed(1)}ms, scroll=${snapshot.avgScrollLatency.toFixed(1)}ms`);
      }
    }, INPUT_TARGETS.LATENCY_REPORT_INTERVAL_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API
  // ─────────────────────────────────────────────────────────────────────────

  getSnapshot(): InputLatencySnapshot {
    const avgTyping = this.calculateAverage(this.keyboardLatencies);
    const avgScroll = this.calculateAverage(this.scrollLatencies);
    const avgClick = this.calculateAverage(this.pointerLatencies);
    
    const p99Typing = this.calculatePercentile(this.keyboardLatencies, 99);
    const p99Scroll = this.calculatePercentile(this.scrollLatencies, 99);
    
    // Responsive if all latencies are within targets
    const isResponsive = 
      avgTyping <= INPUT_TARGETS.MAX_TYPING_LATENCY_MS &&
      avgScroll <= INPUT_TARGETS.MAX_SCROLL_LATENCY_MS &&
      avgClick <= INPUT_TARGETS.MAX_CLICK_LATENCY_MS;
    
    return {
      timestamp: Date.now(),
      avgTypingLatency: avgTyping,
      avgScrollLatency: avgScroll,
      avgClickLatency: avgClick,
      p99TypingLatency: p99Typing,
      p99ScrollLatency: p99Scroll,
      inputsDeferred: this.inputsDeferred,
      inputsCanceled: this.inputsCanceled,
      isResponsive,
    };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  registerWindow(window: BrowserWindow): void {
    this.windows.set(window.id, window);
    
    window.on('closed', () => {
      this.windows.delete(window.id);
    });
    
    // Send targets to renderer
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('input:targets', INPUT_TARGETS);
    });
  }

  // Callback registration for background task systems
  onDeferRequest(callback: () => void): () => void {
    this.deferCallbacks.add(callback);
    return () => this.deferCallbacks.delete(callback);
  }

  onCancelRequest(callback: () => void): () => void {
    this.cancelCallbacks.add(callback);
    return () => this.cancelCallbacks.delete(callback);
  }

  getTimeSinceLastInput(): number {
    return this.lastInputTime ? Date.now() - this.lastInputTime : Infinity;
  }

  isUserInteracting(): boolean {
    return this.getTimeSinceLastInput() < 100; // 100ms interaction window
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const InputLatencyController = new InputLatencyControllerClass();
export default InputLatencyController;
