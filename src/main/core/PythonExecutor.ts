// ═══════════════════════════════════════════════════════════════════════════
// DEX - Python Executor (Hardened)
// Phase 15: Deep Internal Micro-Optimization
// Short-lived, scoped, memory-limited Python execution
// ═══════════════════════════════════════════════════════════════════════════

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PythonExecutionOptions {
  script: string;
  args?: string[];
  timeout?: number;           // Default: 30 seconds
  maxOutputSize?: number;     // Default: 1MB
  cwd?: string;
  env?: Record<string, string>;
  killOnTimeout?: boolean;
}

export interface PythonExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
  killed: boolean;
  error?: string;
}

interface ActiveProcess {
  process: ChildProcess;
  startedAt: number;
  script: string;
  timeout: NodeJS.Timeout;
}

// ═══════════════════════════════════════════════════════════════════════════
// PYTHON EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

class PythonExecutorClass {
  private activeProcesses: Map<string, ActiveProcess> = new Map();
  private pythonPath: string;
  private scriptPath: string;

  // Configuration
  private config = {
    defaultTimeout: 30000,        // 30 seconds
    maxOutputSize: 1024 * 1024,   // 1MB
    maxConcurrent: 3,
    killSignal: 'SIGTERM' as NodeJS.Signals,
    cleanupIntervalMs: 60000,     // Clean zombie processes every minute
  };

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    this.scriptPath = path.join(__dirname, '../../python');
  }

  start(): void {
    // Periodic cleanup of stuck processes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStuckProcesses();
    }, this.config.cleanupIntervalMs);

    log.info('[PythonExecutor] Started');
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Kill all active processes
    for (const [id] of this.activeProcesses) {
      this.kill(id);
    }

    log.info('[PythonExecutor] Stopped');
  }

  // Execute a Python script
  async execute(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
    const {
      script,
      args = [],
      timeout = this.config.defaultTimeout,
      maxOutputSize = this.config.maxOutputSize,
      cwd = this.scriptPath,
      env,
      killOnTimeout = true,
    } = options;

    // Check concurrency limit
    if (this.activeProcesses.size >= this.config.maxConcurrent) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: null,
        duration: 0,
        killed: false,
        error: 'Too many concurrent Python processes',
      };
    }

    const processId = `py-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      let completed = false;

      const complete = (exitCode: number | null, error?: string) => {
        if (completed) return;
        completed = true;

        // Clean up
        this.activeProcesses.delete(processId);

        resolve({
          success: exitCode === 0,
          stdout: stdout.slice(0, maxOutputSize),
          stderr: stderr.slice(0, maxOutputSize),
          exitCode,
          duration: Date.now() - startTime,
          killed,
          error,
        });
      };

      try {
        // Resolve script path
        const scriptPath = script.includes(path.sep) 
          ? script 
          : path.join(this.scriptPath, script);

        // Spawn Python process
        const pythonProcess = spawn(this.pythonPath, [scriptPath, ...args], {
          cwd,
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });

        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          if (!completed && killOnTimeout) {
            killed = true;
            pythonProcess.kill(this.config.killSignal);
            log.warn(`[PythonExecutor] Process ${processId} timed out after ${timeout}ms`);
          }
        }, timeout);

        // Track active process
        this.activeProcesses.set(processId, {
          process: pythonProcess,
          startedAt: startTime,
          script,
          timeout: timeoutHandle,
        });

        // Collect output
        pythonProcess.stdout?.on('data', (data: Buffer) => {
          if (stdout.length < maxOutputSize) {
            stdout += data.toString();
          }
        });

        pythonProcess.stderr?.on('data', (data: Buffer) => {
          if (stderr.length < maxOutputSize) {
            stderr += data.toString();
          }
        });

        // Handle completion
        pythonProcess.on('close', (code) => {
          clearTimeout(timeoutHandle);
          complete(code);
        });

        pythonProcess.on('error', (err) => {
          clearTimeout(timeoutHandle);
          complete(null, err.message);
        });

      } catch (error: any) {
        complete(null, error.message);
      }
    });
  }

  // Execute a quick Python command
  async executeCommand(command: string, timeout = 10000): Promise<string> {
    const result = await this.execute({
      script: '-c',
      args: [command],
      timeout,
    });

    if (!result.success) {
      throw new Error(result.stderr || result.error || 'Python command failed');
    }

    return result.stdout.trim();
  }

  // Kill a specific process
  kill(processId: string): boolean {
    const active = this.activeProcesses.get(processId);
    if (!active) return false;

    clearTimeout(active.timeout);
    active.process.kill(this.config.killSignal);
    this.activeProcesses.delete(processId);

    log.info(`[PythonExecutor] Killed process ${processId}`);
    return true;
  }

  // Kill all active processes
  killAll(): number {
    let killed = 0;
    for (const [id, active] of this.activeProcesses) {
      clearTimeout(active.timeout);
      active.process.kill(this.config.killSignal);
      killed++;
    }
    this.activeProcesses.clear();

    log.info(`[PythonExecutor] Killed ${killed} processes`);
    return killed;
  }

  // Get status of active processes
  getStatus(): Array<{
    id: string;
    script: string;
    runningFor: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeProcesses.entries()).map(([id, active]) => ({
      id,
      script: active.script,
      runningFor: now - active.startedAt,
    }));
  }

  // Check if any Python process is running
  isRunning(): boolean {
    return this.activeProcesses.size > 0;
  }

  // Configure executor
  configure(config: Partial<typeof this.config>): void {
    Object.assign(this.config, config);
  }

  private cleanupStuckProcesses(): void {
    const now = Date.now();
    const stuckThreshold = this.config.defaultTimeout * 2;

    for (const [id, active] of this.activeProcesses) {
      if (now - active.startedAt > stuckThreshold) {
        log.warn(`[PythonExecutor] Cleaning up stuck process ${id}`);
        this.kill(id);
      }
    }
  }
}

// Singleton export
export const pythonExecutor = new PythonExecutorClass();

// ═══════════════════════════════════════════════════════════════════════════
// PREDEFINED PYTHON OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const pythonOps = {
  // Get power status
  async getPowerStatus(): Promise<any> {
    const result = await pythonExecutor.execute({
      script: 'power_controller.py',
      args: ['status'],
      timeout: 15000,
    });

    if (!result.success) {
      throw new Error(result.stderr || 'Failed to get power status');
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { raw: result.stdout };
    }
  },

  // Execute system command safely
  async executeSystemCommand(command: string): Promise<string> {
    // Whitelist of allowed commands
    const allowedCommands = ['systeminfo', 'hostname', 'whoami'];
    const baseCommand = command.split(' ')[0].toLowerCase();

    if (!allowedCommands.includes(baseCommand)) {
      throw new Error(`Command not allowed: ${baseCommand}`);
    }

    return pythonExecutor.executeCommand(
      `import subprocess; print(subprocess.check_output('${command}', shell=True, text=True))`,
      10000
    );
  },

  // Check Python availability
  async checkAvailable(): Promise<boolean> {
    try {
      await pythonExecutor.executeCommand('print("ok")', 5000);
      return true;
    } catch {
      return false;
    }
  },

  // Get Python version
  async getVersion(): Promise<string> {
    return pythonExecutor.executeCommand('import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")', 5000);
  },
};
