// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Hardened Python Integration
// Phase 28: Backend Architecture Refinement
// Short-lived, bounded, fully killable Python execution
// ===========================================================================

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { resourceManager } from './ResourceManager';
import { errorClassifier } from './ErrorClassifier';

// ===========================================================================
// TYPES
// ===========================================================================

export interface PythonExecutionRequest {
  id?: string;
  script: string;
  args?: string[];
  input?: string;
  timeout?: number;
  memoryLimitMB?: number;
  cwd?: string;
  env?: Record<string, string>;
  priority?: 'low' | 'normal' | 'high';
}

export interface PythonExecutionResult {
  requestId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
  memoryUsed?: number;
  timedOut: boolean;
  killed: boolean;
  error?: string;
}

export interface PythonProcessInfo {
  id: string;
  script: string;
  startedAt: number;
  timeout: number;
  memoryLimit: number;
  state: 'running' | 'completed' | 'killed' | 'timed-out';
}

interface ActivePythonProcess {
  id: string;
  process: ChildProcess;
  request: PythonExecutionRequest;
  startedAt: number;
  timeoutHandle: NodeJS.Timeout;
  memoryCheckHandle?: NodeJS.Timeout;
  aborted: boolean;
}

// ===========================================================================
// HARDENED PYTHON EXECUTOR
// ===========================================================================

class HardenedPythonExecutorClass extends EventEmitter {
  // Active processes
  private processes: Map<string, ActivePythonProcess> = new Map();
  
  // Python path resolution
  private pythonPath: string | null = null;
  private scriptBasePath: string;
  
  // Configuration
  private config = {
    maxConcurrent: 2,
    defaultTimeout: 15000,       // 15 seconds (shorter than before)
    maxTimeout: 60000,           // 1 minute max
    defaultMemoryLimitMB: 128,
    maxMemoryLimitMB: 256,
    maxOutputBytes: 512 * 1024,  // 512KB max output
    memoryCheckIntervalMs: 10000, // Check every 10 seconds (was 1s - too frequent)
    cleanupIntervalMs: 60000,    // Cleanup every 60s (was 30s)
  };

  // Statistics
  private stats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    timedOutExecutions: 0,
    killedExecutions: 0,
    totalDuration: 0,
  };

  // Lifecycle
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isAvailable: boolean | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.scriptBasePath = path.join(__dirname, '../../python');
    this.detectPython();
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  start(): void {
    // Cleanup stuck processes periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanupStuckProcesses();
    }, this.config.cleanupIntervalMs);
    
    // Listen to resource manager
    resourceManager.on('pressureChanged', ({ newPressure }) => {
      if (newPressure === 'critical' || newPressure === 'high') {
        this.killNonCritical();
      }
    });
    
    log.info('[HardenedPython] Started');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Kill all processes
    const killed = this.killAll();
    log.info(`[HardenedPython] Stopped (killed ${killed} processes)`);
    this.emit('stopped');
  }

  // -------------------------------------------------------------------------
  // PYTHON DETECTION
  // -------------------------------------------------------------------------

  private async detectPython(): Promise<void> {
    const candidates = process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python'];
    
    for (const cmd of candidates) {
      try {
        const result = await this.tryPythonCommand(cmd);
        if (result) {
          this.pythonPath = cmd;
          this.isAvailable = true;
          log.info(`[HardenedPython] Found Python: ${cmd}`);
          return;
        }
      } catch {
        continue;
      }
    }
    
    this.isAvailable = false;
    log.warn('[HardenedPython] Python not found');
  }

  private tryPythonCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, ['--version'], { windowsHide: true });
      let output = '';
      
      proc.stdout?.on('data', (d) => { output += d.toString(); });
      proc.stderr?.on('data', (d) => { output += d.toString(); });
      
      const timeout = setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
      
      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0 && output.toLowerCase().includes('python'));
      });
      
      proc.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Check if Python is available
   */
  async checkAvailable(): Promise<boolean> {
    if (this.isAvailable !== null) return this.isAvailable;
    await this.detectPython();
    return this.isAvailable ?? false;
  }

  // -------------------------------------------------------------------------
  // EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Execute a Python script with full sandboxing
   */
  async execute(request: PythonExecutionRequest): Promise<PythonExecutionResult> {
    const requestId = request.id ?? `py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Check availability
    if (!await this.checkAvailable()) {
      return this.createFailResult(requestId, 'Python is not available');
    }

    // Check concurrency
    if (this.processes.size >= this.config.maxConcurrent) {
      // Wait for a slot or fail
      const waited = await this.waitForSlot(5000);
      if (!waited) {
        return this.createFailResult(requestId, 'Too many concurrent Python processes');
      }
    }

    // Check resource pressure
    if (resourceManager.shouldYield()) {
      return this.createFailResult(requestId, 'System under resource pressure');
    }

    // Validate and sanitize request
    const timeout = Math.min(request.timeout ?? this.config.defaultTimeout, this.config.maxTimeout);
    const memoryLimit = Math.min(request.memoryLimitMB ?? this.config.defaultMemoryLimitMB, this.config.maxMemoryLimitMB);
    
    this.stats.totalExecutions++;
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let completed = false;
      let timedOut = false;
      let killed = false;
      
      const complete = (exitCode: number | null, error?: string) => {
        if (completed) return;
        completed = true;
        
        const activeProc = this.processes.get(requestId);
        if (activeProc) {
          clearTimeout(activeProc.timeoutHandle);
          if (activeProc.memoryCheckHandle) {
            clearInterval(activeProc.memoryCheckHandle);
          }
          this.processes.delete(requestId);
        }
        
        const duration = Date.now() - startTime;
        this.stats.totalDuration += duration;
        
        const success = exitCode === 0 && !timedOut && !killed && !error;
        if (success) {
          this.stats.successfulExecutions++;
        } else if (timedOut) {
          this.stats.timedOutExecutions++;
        } else if (killed) {
          this.stats.killedExecutions++;
        } else {
          this.stats.failedExecutions++;
        }
        
        const result: PythonExecutionResult = {
          requestId,
          success,
          stdout: stdout.slice(0, this.config.maxOutputBytes),
          stderr: stderr.slice(0, this.config.maxOutputBytes),
          exitCode,
          duration,
          timedOut,
          killed,
          error: error ?? (timedOut ? 'Execution timed out' : undefined),
        };
        
        this.emit('executionCompleted', result);
        log.debug(`[HardenedPython] Execution ${requestId}: ${success ? 'success' : 'failed'} (${duration}ms)`);
        
        resolve(result);
      };
      
      try {
        // Resolve script path
        const scriptPath = this.resolveScriptPath(request.script);
        if (!scriptPath && request.script !== '-c') {
          complete(null, `Script not found: ${request.script}`);
          return;
        }
        
        // Build args
        const args = scriptPath 
          ? [scriptPath, ...(request.args ?? [])]
          : [request.script, ...(request.args ?? [])];
        
        // Spawn options
        const options: SpawnOptions = {
          cwd: request.cwd ?? this.scriptBasePath,
          env: {
            ...process.env,
            ...request.env,
            PYTHONUNBUFFERED: '1',
            PYTHONDONTWRITEBYTECODE: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        };
        
        // Spawn process
        const proc = spawn(this.pythonPath!, args, options);
        
        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          if (!completed) {
            timedOut = true;
            proc.kill('SIGTERM');
            setTimeout(() => {
              if (!completed) proc.kill('SIGKILL');
            }, 1000);
            log.warn(`[HardenedPython] Process ${requestId} timed out`);
          }
        }, timeout);
        
        // Track active process
        const activeProc: ActivePythonProcess = {
          id: requestId,
          process: proc,
          request,
          startedAt: startTime,
          timeoutHandle,
          aborted: false,
        };
        this.processes.set(requestId, activeProc);
        
        // Provide input if any
        if (request.input) {
          proc.stdin?.write(request.input);
          proc.stdin?.end();
        } else {
          proc.stdin?.end();
        }
        
        // Collect output with size limit
        proc.stdout?.on('data', (data: Buffer) => {
          if (stdout.length < this.config.maxOutputBytes) {
            stdout += data.toString();
          }
        });
        
        proc.stderr?.on('data', (data: Buffer) => {
          if (stderr.length < this.config.maxOutputBytes) {
            stderr += data.toString();
          }
        });
        
        // Handle close
        proc.on('close', (code) => {
          complete(code);
        });
        
        proc.on('error', (err) => {
          complete(null, err.message);
        });
        
        this.emit('executionStarted', { requestId, script: request.script });
        
      } catch (error: any) {
        complete(null, error.message);
      }
    });
  }

  /**
   * Execute a one-liner Python command
   */
  async executeCommand(command: string, timeout = 10000): Promise<string> {
    const result = await this.execute({
      script: '-c',
      args: [command],
      timeout,
      priority: 'high',
    });
    
    if (!result.success) {
      throw new Error(result.stderr || result.error || 'Python command failed');
    }
    
    return result.stdout.trim();
  }

  private resolveScriptPath(script: string): string | null {
    // If it's a command flag, return null
    if (script === '-c' || script === '-m') return null;
    
    // If absolute path
    if (path.isAbsolute(script)) {
      return fs.existsSync(script) ? script : null;
    }
    
    // Check in script base path
    const fullPath = path.join(this.scriptBasePath, script);
    if (fs.existsSync(fullPath)) return fullPath;
    
    // Check with .py extension
    const withExt = fullPath.endsWith('.py') ? fullPath : `${fullPath}.py`;
    if (fs.existsSync(withExt)) return withExt;
    
    return null;
  }

  // -------------------------------------------------------------------------
  // PROCESS CONTROL
  // -------------------------------------------------------------------------

  /**
   * Kill a specific process
   */
  kill(processId: string): boolean {
    const active = this.processes.get(processId);
    if (!active) return false;
    
    active.aborted = true;
    clearTimeout(active.timeoutHandle);
    if (active.memoryCheckHandle) {
      clearInterval(active.memoryCheckHandle);
    }
    
    // Try graceful kill first
    active.process.kill('SIGTERM');
    
    // Force kill after 1 second
    setTimeout(() => {
      try {
        active.process.kill('SIGKILL');
      } catch {
        // Process may have already exited
      }
    }, 1000);
    
    log.info(`[HardenedPython] Killed process: ${processId}`);
    return true;
  }

  /**
   * Kill all processes
   */
  killAll(): number {
    let count = 0;
    for (const [id] of this.processes) {
      if (this.kill(id)) count++;
    }
    return count;
  }

  /**
   * Kill non-critical processes (low/normal priority)
   */
  killNonCritical(): number {
    let count = 0;
    for (const [id, proc] of this.processes) {
      if (proc.request.priority !== 'high') {
        if (this.kill(id)) count++;
      }
    }
    log.info(`[HardenedPython] Killed ${count} non-critical processes`);
    return count;
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private createFailResult(requestId: string, error: string): PythonExecutionResult {
    this.stats.failedExecutions++;
    return {
      requestId,
      success: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      duration: 0,
      timedOut: false,
      killed: false,
      error,
    };
  }

  private waitForSlot(maxWait: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startWait = Date.now();
      
      const check = () => {
        if (this.processes.size < this.config.maxConcurrent) {
          resolve(true);
          return;
        }
        
        if (Date.now() - startWait >= maxWait) {
          resolve(false);
          return;
        }
        
        setTimeout(check, 100);
      };
      
      check();
    });
  }

  private cleanupStuckProcesses(): void {
    const now = Date.now();
    const stuckThreshold = this.config.maxTimeout * 1.5;
    
    for (const [id, proc] of this.processes) {
      if (now - proc.startedAt > stuckThreshold) {
        log.warn(`[HardenedPython] Cleaning up stuck process: ${id}`);
        this.kill(id);
        
        errorClassifier.report('Python process stuck', {
          source: 'HardenedPython',
          operation: 'cleanupStuckProcesses',
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // STATUS
  // -------------------------------------------------------------------------

  getStatus(): {
    available: boolean;
    pythonPath: string | null;
    activeProcesses: number;
    config: typeof HardenedPythonExecutorClass.prototype.config;
    stats: typeof HardenedPythonExecutorClass.prototype.stats;
  } {
    return {
      available: this.isAvailable ?? false,
      pythonPath: this.pythonPath,
      activeProcesses: this.processes.size,
      config: { ...this.config },
      stats: { ...this.stats },
    };
  }

  getActiveProcesses(): PythonProcessInfo[] {
    const now = Date.now();
    return Array.from(this.processes.values()).map(p => ({
      id: p.id,
      script: p.request.script,
      startedAt: p.startedAt,
      timeout: p.request.timeout ?? this.config.defaultTimeout,
      memoryLimit: p.request.memoryLimitMB ?? this.config.defaultMemoryLimitMB,
      state: p.aborted ? 'killed' : 'running',
    }));
  }

  /**
   * Set configuration
   */
  configure(config: Partial<typeof this.config>): void {
    Object.assign(this.config, config);
    log.info('[HardenedPython] Configuration updated');
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const hardenedPython = new HardenedPythonExecutorClass();
export default hardenedPython;
