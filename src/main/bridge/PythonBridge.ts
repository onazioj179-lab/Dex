// ═══════════════════════════════════════════════════════════════════════════
// DEX - Python Bridge
// Communicates with Python backend for deep system control
// ═══════════════════════════════════════════════════════════════════════════

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { Logger } from '../utils/Logger';
import { app } from 'electron';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class PythonBridge {
  private process: ChildProcess | null = null;
  private logger: Logger;
  private ready: boolean = false;
  private readyPromise: Promise<boolean>;
  private readyResolve: ((value: boolean) => void) | null = null;
  private requestQueue: Map<number, PendingRequest> = new Map();
  private requestId: number = 0;
  private responseBuffer: string = '';
  private hasPsutil: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async start(): Promise<boolean> {
    if (this.process) {
      return this.ready;
    }

    const pythonScript = this.getPythonScriptPath();
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    try {
      this.process = spawn(pythonCmd, [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DEX_DATA_PATH: path.join(app.getPath('userData'), 'learning'),
          PYTHONUNBUFFERED: '1',
        },
      });

      // Handle stdout - JSON responses
      if (this.process.stdout) {
        const rl = readline.createInterface({ input: this.process.stdout });
        rl.on('line', (line) => this.handleOutput(line));
      }

      // Handle stderr - errors/logs
      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) {
            this.logger.warn(`Python: ${msg}`);
          }
        });
      }

      // Handle process exit
      this.process.on('exit', (code) => {
        this.logger.info(`Python backend exited with code ${code}`);
        this.ready = false;
        this.process = null;
        
        // Reject all pending requests
        for (const [id, req] of this.requestQueue) {
          clearTimeout(req.timeout);
          req.reject(new Error('Python process exited'));
        }
        this.requestQueue.clear();
      });

      this.process.on('error', (error) => {
        this.logger.error('Python process error', error);
        this.ready = false;
        if (this.readyResolve) {
          this.readyResolve(false);
        }
      });

      // Wait for ready signal
      const isReady = await Promise.race([
        this.readyPromise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10000)),
      ]);

      if (isReady) {
        this.logger.success('Python backend ready' + (this.hasPsutil ? ' (with psutil)' : ' (limited)'));
      } else {
        this.logger.warn('Python backend failed to start or timed out');
      }

      return isReady;
    } catch (error: any) {
      this.logger.error('Failed to start Python backend', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────────────────

  private handleOutput(line: string): void {
    try {
      const data = JSON.parse(line);
      
      // Check for ready signal
      if (data.status === 'ready') {
        this.ready = true;
        this.hasPsutil = data.psutil === true;
        if (this.readyResolve) {
          this.readyResolve(true);
        }
        return;
      }

      // Handle response (for now, we process synchronously)
      // In a more complex setup, we'd match request IDs
    } catch (error) {
      // Non-JSON output, ignore
    }
  }

  async send(cmd: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.process || !this.ready) {
      throw new Error('Python backend not ready');
    }

    return new Promise((resolve, reject) => {
      const request = JSON.stringify({ cmd, args }) + '\n';
      
      // Set up response handler for this request
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString().trim());
          this.process?.stdout?.removeListener('data', responseHandler);
          resolve(response);
        } catch {
          // Partial JSON received, wait for more data chunks
          // This is expected behavior for streaming responses
        }
      };

      this.process?.stdout?.on('data', responseHandler);
      
      // Timeout
      setTimeout(() => {
        this.process?.stdout?.removeListener('data', responseHandler);
        reject(new Error('Request timeout'));
      }, 30000);

      // Send request
      this.process?.stdin?.write(request);
    });
  }

  // Simpler synchronous-style send (reads one line response)
  async call(cmd: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.process || !this.ready) {
      // Return fallback for non-critical commands
      if (cmd === 'health') {
        return { healthy: true, uptime: 0, errorCount: 0, memoryMB: 0 };
      }
      throw new Error('Python backend not ready');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const handler = (line: string) => {
        try {
          const response = JSON.parse(line);
          clearTimeout(timeout);
          if (this.process?.stdout) {
            const rl = readline.createInterface({ input: this.process.stdout });
            rl.removeAllListeners('line');
          }
          resolve(response);
        } catch {
          // Not valid JSON yet, wait for next line
          // This is expected when response spans multiple lines
        }
      };

      if (this.process?.stdout) {
        const rl = readline.createInterface({ input: this.process.stdout });
        rl.once('line', handler);
      }

      const request = JSON.stringify({ cmd, args }) + '\n';
      this.process?.stdin?.write(request);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private getPythonScriptPath(): string {
    // In development
    const devPath = path.join(__dirname, '..', '..', 'python', 'dex_core.py');
    
    // In production (bundled)
    const prodPath = path.join(process.resourcesPath || '', 'python', 'dex_core.py');
    
    // Check which exists
    const fs = require('fs');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
    
    // Fallback to src path
    return path.join(__dirname, '..', '..', 'python', 'dex_core.py');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE API
// ═══════════════════════════════════════════════════════════════════════════

export class DexPythonAPI {
  private bridge: PythonBridge;

  constructor(bridge: PythonBridge) {
    this.bridge = bridge;
  }

  // System
  async getSystemStats() {
    return this.bridge.call('system.stats');
  }

  async getProcesses(limit: number = 30) {
    return this.bridge.call('system.processes', { limit });
  }

  async closeProcess(pid: number, force: boolean = false) {
    return this.bridge.call('system.close', { pid, force });
  }

  async freeMemory() {
    return this.bridge.call('system.freeMemory');
  }

  // Power
  async setPowerProfile(profile: 'eco' | 'balanced' | 'boost') {
    return this.bridge.call('power.setProfile', { profile });
  }

  async getPowerStatus() {
    return this.bridge.call('power.status');
  }

  // Learning
  async recordActivity(type: string, data: Record<string, any>) {
    return this.bridge.call('learning.record', { type, data });
  }

  async getSuggestions() {
    return this.bridge.call('learning.suggestions');
  }

  // Health
  async getHealth() {
    return this.bridge.call('health');
  }
}
