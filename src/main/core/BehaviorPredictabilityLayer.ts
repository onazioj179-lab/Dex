// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Behavior Predictability Layer
// Phase 69: Deterministic Behavior
// Same input = same result, always. No surprises.
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import * as crypto from 'crypto';

// ===========================================================================
// TYPES
// ===========================================================================

export interface BehaviorContract {
  id: string;
  name: string;
  description: string;
  inputSchema: InputSchema;
  expectedOutputs: ExpectedOutput[];
  sideEffects: string[];
  invariants: string[];
  locked: boolean;
}

export interface InputSchema {
  type: string;
  properties: Record<string, { type: string; required?: boolean }>;
  examples: unknown[];
}

export interface ExpectedOutput {
  condition: string;
  output: unknown;
  description: string;
}

export interface BehaviorExecution {
  contractId: string;
  input: unknown;
  inputHash: string;
  output: unknown;
  outputHash: string;
  timestamp: number;
  duration: number;
  deterministic: boolean;
}

export interface DeterminismViolation {
  contractId: string;
  input: unknown;
  inputHash: string;
  expectedOutputHash: string;
  actualOutputHash: string;
  timestamp: number;
}

// ===========================================================================
// LOCKED BEHAVIOR CONTRACTS
// ===========================================================================

const BEHAVIOR_CONTRACTS: BehaviorContract[] = [
  // -- Search Behavior -----------------------------------------------------
  {
    id: 'search-files',
    name: 'File Search',
    description: 'Search for files by query returns consistent results',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', required: true },
        path: { type: 'string' },
        limit: { type: 'number' }
      },
      examples: [{ query: 'test', limit: 10 }]
    },
    expectedOutputs: [
      { condition: 'query is empty', output: [], description: 'Empty query returns empty array' },
      { condition: 'query matches nothing', output: [], description: 'No matches returns empty array' }
    ],
    sideEffects: [],
    invariants: [
      'Results are sorted by relevance',
      'Same query always returns same order',
      'Results include only accessible files'
    ],
    locked: true
  },

  // -- Navigation Behavior -------------------------------------------------
  {
    id: 'navigate-page',
    name: 'Page Navigation',
    description: 'Navigate to page updates view consistently',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', required: true },
        params: { type: 'object' }
      },
      examples: [{ page: 'files' }, { page: 'actions', params: { id: '123' } }]
    },
    expectedOutputs: [
      { condition: 'page exists', output: { success: true }, description: 'Valid page navigates successfully' },
      { condition: 'page does not exist', output: { success: false, error: 'Page not found' }, description: 'Invalid page returns error' }
    ],
    sideEffects: ['Updates current view', 'Updates URL/history'],
    invariants: [
      'Back button returns to previous page',
      'Page state is preserved during session',
      'Same page never shows different layout'
    ],
    locked: true
  },

  // -- File Operations -----------------------------------------------------
  {
    id: 'file-create',
    name: 'File Creation',
    description: 'Creating a file produces consistent result',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        path: { type: 'string', required: true },
        content: { type: 'string' }
      },
      examples: [{ name: 'test.txt', path: '/documents', content: 'hello' }]
    },
    expectedOutputs: [
      { condition: 'path is valid and writable', output: { success: true }, description: 'File created successfully' },
      { condition: 'file already exists', output: { success: false, error: 'File exists' }, description: 'Duplicate name fails' },
      { condition: 'path is invalid', output: { success: false, error: 'Invalid path' }, description: 'Invalid path fails' }
    ],
    sideEffects: ['Creates file on disk', 'Updates file index'],
    invariants: [
      'File appears in list immediately',
      'File content matches input',
      'Undo restores previous state'
    ],
    locked: true
  },

  // -- Action Execution ----------------------------------------------------
  {
    id: 'action-execute',
    name: 'Action Execution',
    description: 'Executing an action produces predictable result',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string', required: true },
        input: { type: 'object' }
      },
      examples: [{ actionId: 'open-file', input: { path: '/test.txt' } }]
    },
    expectedOutputs: [
      { condition: 'action exists and valid input', output: { success: true }, description: 'Action executes' },
      { condition: 'action does not exist', output: { success: false, error: 'Action not found' }, description: 'Invalid action fails' },
      { condition: 'invalid input', output: { success: false, error: 'Invalid input' }, description: 'Bad input fails' }
    ],
    sideEffects: ['Depends on action type'],
    invariants: [
      'Same action with same input produces same result',
      'Failed actions have no side effects',
      'Action state is reflected immediately'
    ],
    locked: true
  },

  // -- Keyboard Shortcuts --------------------------------------------------
  {
    id: 'keyboard-shortcut',
    name: 'Keyboard Shortcuts',
    description: 'Shortcuts always trigger the same action',
    inputSchema: {
      type: 'object',
      properties: {
        keys: { type: 'string', required: true },
        context: { type: 'string' }
      },
      examples: [{ keys: 'Ctrl+S' }, { keys: 'Ctrl+K', context: 'editor' }]
    },
    expectedOutputs: [
      { condition: 'shortcut is bound', output: { triggered: true }, description: 'Shortcut triggers action' },
      { condition: 'shortcut is not bound', output: { triggered: false }, description: 'Unbound shortcut does nothing' }
    ],
    sideEffects: ['Triggers bound action'],
    invariants: [
      'Same key combo always triggers same action',
      'Context-specific shortcuts only work in context',
      'Shortcuts never conflict'
    ],
    locked: true
  },

  // -- Drag and Drop -------------------------------------------------------
  {
    id: 'drag-drop',
    name: 'Drag and Drop',
    description: 'Drag operations have predictable outcomes',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', required: true },
        target: { type: 'string', required: true },
        items: { type: 'array', required: true }
      },
      examples: [{ source: 'files', target: 'folder', items: ['file1.txt'] }]
    },
    expectedOutputs: [
      { condition: 'valid drop target', output: { success: true }, description: 'Drop succeeds' },
      { condition: 'invalid drop target', output: { success: false }, description: 'Invalid target rejects' }
    ],
    sideEffects: ['Moves/copies items'],
    invariants: [
      'Drop indicators show valid targets',
      'Items appear in target immediately',
      'Source updates immediately'
    ],
    locked: true
  },

  // -- Settings Changes ----------------------------------------------------
  {
    id: 'setting-change',
    name: 'Settings Changes',
    description: 'Changing settings applies consistently',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', required: true },
        value: { type: 'any', required: true }
      },
      examples: [{ key: 'theme', value: 'dark' }]
    },
    expectedOutputs: [
      { condition: 'valid setting and value', output: { success: true }, description: 'Setting applied' },
      { condition: 'invalid setting', output: { success: false, error: 'Unknown setting' }, description: 'Invalid key fails' },
      { condition: 'invalid value', output: { success: false, error: 'Invalid value' }, description: 'Invalid value fails' }
    ],
    sideEffects: ['Persists setting', 'May update UI'],
    invariants: [
      'Setting persists across restarts',
      'UI reflects setting immediately',
      'Related settings update together'
    ],
    locked: true
  }
];

// ===========================================================================
// BEHAVIOR PREDICTABILITY LAYER
// ===========================================================================

class BehaviorPredictabilityLayerClass extends EventEmitter {
  private contracts: Map<string, BehaviorContract> = new Map();
  private executionHistory: Map<string, BehaviorExecution[]> = new Map();
  private violations: DeterminismViolation[] = [];
  private deterministicMode = true;

  constructor() {
    super();
    this.initializeContracts();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private initializeContracts(): void {
    for (const contract of BEHAVIOR_CONTRACTS) {
      this.contracts.set(contract.id, contract);
    }
    log.info(`[Behavior] Loaded ${this.contracts.size} behavior contracts`);
  }

  private setupIPC(): void {
    // Get contract
    ipcMain.handle('behavior:contract', (_event, id: string) => {
      return this.getContract(id);
    });

    // Get all contracts
    ipcMain.handle('behavior:contracts', () => {
      return this.getAllContracts();
    });

    // Record execution
    ipcMain.handle('behavior:record', (_event, execution: Omit<BehaviorExecution, 'inputHash' | 'outputHash' | 'deterministic'>) => {
      return this.recordExecution(execution);
    });

    // Verify determinism
    ipcMain.handle('behavior:verify', (_event, contractId: string, input: unknown, output: unknown) => {
      return this.verifyDeterminism(contractId, input, output);
    });

    // Get violations
    ipcMain.handle('behavior:violations', () => {
      return this.getViolations();
    });

    // Get execution history
    ipcMain.handle('behavior:history', (_event, contractId: string) => {
      return this.getExecutionHistory(contractId);
    });

    // Check expected output
    ipcMain.handle('behavior:expected', (_event, contractId: string, condition: string) => {
      return this.getExpectedOutput(contractId, condition);
    });
  }

  // -------------------------------------------------------------------------
  // CONTRACT ACCESS
  // -------------------------------------------------------------------------

  getContract(id: string): BehaviorContract | null {
    return this.contracts.get(id) || null;
  }

  getAllContracts(): BehaviorContract[] {
    return Array.from(this.contracts.values());
  }

  getExpectedOutput(contractId: string, condition: string): ExpectedOutput | null {
    const contract = this.contracts.get(contractId);
    if (!contract) return null;
    
    return contract.expectedOutputs.find(o => o.condition === condition) || null;
  }

  // -------------------------------------------------------------------------
  // EXECUTION TRACKING
  // -------------------------------------------------------------------------

  recordExecution(execution: Omit<BehaviorExecution, 'inputHash' | 'outputHash' | 'deterministic'>): BehaviorExecution {
    const inputHash = this.hashValue(execution.input);
    const outputHash = this.hashValue(execution.output);
    
    // Check if we've seen this input before
    const history = this.executionHistory.get(execution.contractId) || [];
    const previousExecution = history.find(e => e.inputHash === inputHash);
    
    const deterministic = !previousExecution || previousExecution.outputHash === outputHash;
    
    const fullExecution: BehaviorExecution = {
      ...execution,
      inputHash,
      outputHash,
      deterministic
    };

    // Record violation if not deterministic
    if (!deterministic && previousExecution) {
      this.recordViolation({
        contractId: execution.contractId,
        input: execution.input,
        inputHash,
        expectedOutputHash: previousExecution.outputHash,
        actualOutputHash: outputHash,
        timestamp: Date.now()
      });
    }

    // Store in history
    history.push(fullExecution);
    if (history.length > 100) {
      history.shift();
    }
    this.executionHistory.set(execution.contractId, history);

    return fullExecution;
  }

  verifyDeterminism(contractId: string, input: unknown, output: unknown): { deterministic: boolean; reason?: string } {
    const inputHash = this.hashValue(input);
    const outputHash = this.hashValue(output);
    
    const history = this.executionHistory.get(contractId) || [];
    const previousExecution = history.find(e => e.inputHash === inputHash);
    
    if (!previousExecution) {
      return { deterministic: true, reason: 'First execution with this input' };
    }
    
    if (previousExecution.outputHash === outputHash) {
      return { deterministic: true, reason: 'Output matches previous execution' };
    }
    
    return {
      deterministic: false,
      reason: `Output changed: expected ${previousExecution.outputHash.slice(0, 8)}, got ${outputHash.slice(0, 8)}`
    };
  }

  // -------------------------------------------------------------------------
  // VIOLATIONS
  // -------------------------------------------------------------------------

  private recordViolation(violation: DeterminismViolation): void {
    this.violations.push(violation);
    
    if (this.violations.length > 100) {
      this.violations.shift();
    }
    
    const contract = this.contracts.get(violation.contractId);
    log.warn(`[Behavior] Determinism violation: ${contract?.name || violation.contractId}`);
    
    this.emit('violation', violation);
    this.broadcastViolation(violation);
  }

  getViolations(): DeterminismViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  private broadcastViolation(violation: DeterminismViolation): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('behavior:violation', violation);
      }
    }
  }

  // -------------------------------------------------------------------------
  // HISTORY
  // -------------------------------------------------------------------------

  getExecutionHistory(contractId: string): BehaviorExecution[] {
    return [...(this.executionHistory.get(contractId) || [])];
  }

  // -------------------------------------------------------------------------
  // WRAPPED EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Execute a function and verify its determinism
   */
  async execute<T, R>(
    contractId: string,
    input: T,
    fn: (input: T) => Promise<R>
  ): Promise<{ output: R; deterministic: boolean }> {
    const start = Date.now();
    
    try {
      const output = await fn(input);
      const duration = Date.now() - start;
      
      const execution = this.recordExecution({
        contractId,
        input,
        output,
        timestamp: Date.now(),
        duration
      });
      
      return {
        output,
        deterministic: execution.deterministic
      };
    } catch (error) {
      const duration = Date.now() - start;
      const output = { error: error instanceof Error ? error.message : 'Unknown error' };
      
      const execution = this.recordExecution({
        contractId,
        input,
        output,
        timestamp: Date.now(),
        duration
      });
      
      throw error;
    }
  }

  /**
   * Create a deterministic wrapper for a function
   */
  wrap<T extends unknown[], R>(
    contractId: string,
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const { output } = await this.execute(contractId, args, async (input) => {
        return fn(...(input as T));
      });
      return output;
    };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private hashValue(value: unknown): string {
    const serialized = this.deterministicStringify(value);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  private deterministicStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return String(value);
    }
    
    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }
    
    if (Array.isArray(value)) {
      return '[' + value.map(v => this.deterministicStringify(v)).join(',') + ']';
    }
    
    // Sort object keys for deterministic ordering
    const sorted = Object.keys(value as object).sort();
    const pairs = sorted.map(key => {
      return `"${key}":${this.deterministicStringify((value as Record<string, unknown>)[key])}`;
    });
    
    return '{' + pairs.join(',') + '}';
  }

  // -------------------------------------------------------------------------
  // MODE CONTROL
  // -------------------------------------------------------------------------

  enableDeterministicMode(): void {
    this.deterministicMode = true;
    log.info('[Behavior] Deterministic mode enabled');
  }

  disableDeterministicMode(): void {
    this.deterministicMode = false;
    log.warn('[Behavior] Deterministic mode disabled');
  }

  isDeterministicMode(): boolean {
    return this.deterministicMode;
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const BehaviorPredictabilityLayer = new BehaviorPredictabilityLayerClass();
export default BehaviorPredictabilityLayer;
