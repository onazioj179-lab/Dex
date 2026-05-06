// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Workflow Execution Engine
// Phase 20: Deterministic, previewable, reversible execution
// Steps execute sequentially unless specified
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import { 
  Workflow, 
  WorkflowNode, 
  WorkflowExecution, 
  ExecutionLogEntry,
  WorkflowGraph,
  NodeStatus 
} from './WorkflowGraph';
import { fileManager } from './FileManager';

const log = new Logger();
import { documentCreator } from './DocumentCreator';
import { browserBridge } from './BrowserBridge';
import { performanceGuardian } from './PerformanceGuardian';

// ===========================================================================
// TYPES
// ===========================================================================

export interface ExecutionOptions {
  dryRun?: boolean;
  pauseOnConfirm?: boolean;
  continueOnError?: boolean;
  maxDuration?: number; // Max execution time in ms
}

export interface NodeExecutor {
  type: string;
  execute: (
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ) => Promise<any>;
  validate?: (node: WorkflowNode) => boolean;
  canUndo?: boolean;
  undo?: (node: WorkflowNode, result: any) => Promise<void>;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  nodeResults: Map<string, any>;
  tempDir: string;
  onLog: (entry: Omit<ExecutionLogEntry, 'timestamp'>) => void;
  onProgress: (nodeId: string, progress: number) => void;
  checkAbort: () => boolean;
  checkPause: () => Promise<void>;
}

// ===========================================================================
// WORKFLOW ENGINE CLASS
// ===========================================================================

class WorkflowEngineClass extends EventEmitter {
  private executors: Map<string, NodeExecutor> = new Map();
  private activeExecution: WorkflowExecution | null = null;
  private executionHistory: WorkflowExecution[] = [];
  private savedWorkflows: Map<string, Workflow> = new Map();
  private isPaused = false;
  private isAborted = false;
  private maxHistorySize = 20;
  private pausePromiseResolve: (() => void) | null = null;

  constructor() {
    super();
    this.registerBuiltInExecutors();
    this.loadWorkflows();
  }

  // -------------------------------------------------------------------------
  // WORKFLOW MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Save a workflow
   */
  saveWorkflow(workflow: Workflow): void {
    this.savedWorkflows.set(workflow.id, workflow);
    this.persistWorkflows();
    log.info(`[WorkflowEngine] Saved workflow: ${workflow.name}`);
    this.emit('workflowSaved', workflow);
  }

  /**
   * Get a workflow
   */
  getWorkflow(workflowId: string): Workflow | null {
    return this.savedWorkflows.get(workflowId) ?? null;
  }

  /**
   * Get all workflows
   */
  getWorkflows(): Workflow[] {
    return Array.from(this.savedWorkflows.values());
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(workflowId: string): boolean {
    const deleted = this.savedWorkflows.delete(workflowId);
    if (deleted) {
      this.persistWorkflows();
      log.info(`[WorkflowEngine] Deleted workflow: ${workflowId}`);
      this.emit('workflowDeleted', workflowId);
    }
    return deleted;
  }

  /**
   * Duplicate a workflow
   */
  duplicateWorkflow(workflowId: string, newName?: string): Workflow | null {
    const original = this.savedWorkflows.get(workflowId);
    if (!original) return null;

    const duplicate: Workflow = {
      ...original,
      id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newName ?? `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.saveWorkflow(duplicate);
    return duplicate;
  }

  // -------------------------------------------------------------------------
  // EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Execute a workflow
   */
  async execute(
    workflow: Workflow,
    inputs: Record<string, any>,
    options: ExecutionOptions = {}
  ): Promise<WorkflowExecution> {
    if (this.activeExecution) {
      throw new Error('Another workflow is already running');
    }

    // Validate workflow
    const graph = new WorkflowGraph(workflow);
    const validation = graph.validate();
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Validate inputs
    for (const input of workflow.inputs) {
      if (input.required && inputs[input.name] === undefined) {
        throw new Error(`Missing required input: ${input.name}`);
      }
    }

    // Create execution record
    const execution: WorkflowExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      inputValues: { ...inputs },
      outputValues: {},
      nodeResults: new Map(),
      currentNodeId: null,
      startedAt: Date.now(),
      log: [],
    };

    this.activeExecution = execution;
    this.isPaused = false;
    this.isAborted = false;

    // Create temp directory
    const tempDir = path.join(app.getPath('temp'), `dex-workflow-${execution.id}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create execution context
    const context: ExecutionContext = {
      workflowId: workflow.id,
      executionId: execution.id,
      inputs,
      outputs: {},
      nodeResults: execution.nodeResults,
      tempDir,
      onLog: (entry) => this.addLogEntry(execution, entry),
      onProgress: (nodeId, progress) => this.emit('nodeProgress', { executionId: execution.id, nodeId, progress }),
      checkAbort: () => this.isAborted,
      checkPause: () => this.waitForResume(),
    };

    this.emit('executionStarted', execution);
    this.addLogEntry(execution, { level: 'info', message: `Starting workflow: ${workflow.name}` });

    try {
      // Get execution order
      const executionOrder = graph.getExecutionOrder();

      // Execute nodes in order
      for (const node of executionOrder) {
        if (this.isAborted) {
          throw new Error('Execution aborted by user');
        }

        await this.waitForResume();

        // Check performance budgets
        const perfStatus = performanceGuardian.getStatus();
        if (perfStatus.health === 'critical') {
          this.addLogEntry(execution, { 
            level: 'warn', 
            message: 'Pausing due to system pressure',
            nodeId: node.id 
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        execution.currentNodeId = node.id;
        this.emit('nodeStarted', { executionId: execution.id, node });

        const result = await this.executeNode(node, context, options);
        
        node.status = 'completed';
        node.result = result;
        execution.nodeResults.set(node.id, result);

        this.emit('nodeCompleted', { executionId: execution.id, node, result });
      }

      execution.status = 'completed';
      execution.outputValues = context.outputs;
      
      this.addLogEntry(execution, { level: 'info', message: 'Workflow completed successfully' });

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.addLogEntry(execution, { 
        level: 'error', 
        message: `Workflow failed: ${execution.error}` 
      });

      if (!options.continueOnError) {
        throw error;
      }
    } finally {
      execution.completedAt = Date.now();
      execution.totalDuration = execution.completedAt - execution.startedAt;
      execution.currentNodeId = null;

      // Clean up temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }

      this.recordExecution(execution);
      this.activeExecution = null;
      this.emit('executionCompleted', execution);
    }

    return execution;
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (!this.activeExecution || this.isPaused) return;
    
    this.isPaused = true;
    if (this.activeExecution) {
      this.activeExecution.status = 'paused';
    }
    this.emit('executionPaused', this.activeExecution);
    log.info('[WorkflowEngine] Execution paused');
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (!this.activeExecution || !this.isPaused) return;
    
    this.isPaused = false;
    if (this.activeExecution) {
      this.activeExecution.status = 'running';
    }
    
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
    
    this.emit('executionResumed', this.activeExecution);
    log.info('[WorkflowEngine] Execution resumed');
  }

  /**
   * Abort execution
   */
  abort(): void {
    if (!this.activeExecution) return;
    
    this.isAborted = true;
    this.isPaused = false;
    
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
    
    if (this.activeExecution) {
      this.activeExecution.status = 'cancelled';
    }
    
    this.emit('executionAborted', this.activeExecution);
    log.info('[WorkflowEngine] Execution aborted');
  }

  /**
   * Get active execution
   */
  getActiveExecution(): WorkflowExecution | null {
    return this.activeExecution;
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): WorkflowExecution[] {
    return [...this.executionHistory];
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): WorkflowExecution | null {
    if (this.activeExecution?.id === executionId) {
      return this.activeExecution;
    }
    return this.executionHistory.find(e => e.id === executionId) ?? null;
  }

  // -------------------------------------------------------------------------
  // NODE EXECUTION
  // -------------------------------------------------------------------------

  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<any> {
    const executor = this.executors.get(node.type);
    
    if (!executor) {
      throw new Error(`No executor for node type: ${node.type}`);
    }

    if (executor.validate && !executor.validate(node)) {
      throw new Error(`Invalid node configuration: ${node.name}`);
    }

    const startTime = Date.now();
    context.onLog({ 
      level: 'info', 
      message: `Executing: ${node.name}`,
      nodeId: node.id,
      nodeName: node.name 
    });

    try {
      const result = await executor.execute(node, context, options);
      
      node.duration = Date.now() - startTime;
      context.onLog({ 
        level: 'info', 
        message: `Completed: ${node.name} (${node.duration}ms)`,
        nodeId: node.id,
        nodeName: node.name 
      });

      return result;
    } catch (error) {
      node.status = 'failed';
      node.error = error instanceof Error ? error.message : 'Unknown error';
      node.duration = Date.now() - startTime;
      
      context.onLog({ 
        level: 'error', 
        message: `Failed: ${node.name} - ${node.error}`,
        nodeId: node.id,
        nodeName: node.name 
      });

      throw error;
    }
  }

  /**
   * Register a node executor
   */
  registerExecutor(executor: NodeExecutor): void {
    this.executors.set(executor.type, executor);
    log.info(`[WorkflowEngine] Registered executor: ${executor.type}`);
  }

  // -------------------------------------------------------------------------
  // BUILT-IN EXECUTORS
  // -------------------------------------------------------------------------

  private registerBuiltInExecutors(): void {
    // File operation executor
    this.registerExecutor({
      type: 'file-operation',
      canUndo: true,
      execute: async (node, context) => {
        const { operation, ...params } = node.params;
        
        switch (operation) {
          case 'rename':
            return fileManager.renameFile(params.source, params.newName);
          case 'move':
            return fileManager.moveFile(params.source, params.destination);
          case 'copy':
            return fileManager.copyFile(params.source, params.destination);
          case 'delete':
            return fileManager.deleteFile(params.path);
          case 'organize':
            return fileManager.organizeByType(params.folder);
          case 'batchRename':
            return fileManager.executeBatchRename(params.files, params.rules);
          default:
            throw new Error(`Unknown file operation: ${operation}`);
        }
      },
    });

    // Document creation executor
    this.registerExecutor({
      type: 'document-create',
      execute: async (node, context) => {
        const { type, name, template, data, outputDir } = node.params;
        
        return documentCreator.createDocument({
          type,
          name,
          templateId: template,
          data: { ...data, ...context.inputs },
          outputDir: outputDir ?? context.tempDir,
        });
      },
    });

    // Web step executor
    this.registerExecutor({
      type: 'web-step',
      execute: async (node, context) => {
        const { action, ...params } = node.params;
        
        const status = browserBridge.getStatus();
        if (status.status !== 'connected') {
          throw new Error('Browser not connected');
        }

        switch (action) {
          case 'navigate':
            return browserBridge.navigate(params.url ?? context.inputs.url);
          case 'read':
            return browserBridge.readPage();
          case 'fill':
            return browserBridge.fillField(params.selector, params.value);
          case 'click':
            return browserBridge.click(params.selector);
          case 'download':
            return browserBridge.download(params.url ?? context.inputs.url, params.filename);
          default:
            throw new Error(`Unknown web action: ${action}`);
        }
      },
    });

    // User confirmation executor
    this.registerExecutor({
      type: 'user-confirm',
      execute: async (node, context, options) => {
        if (options.dryRun) {
          context.onLog({ level: 'info', message: `[DRY RUN] Would ask: ${node.params.message}`, nodeId: node.id });
          return { confirmed: true, dryRun: true };
        }

        if (options.pauseOnConfirm !== false) {
          // Emit event and wait for user response
          return new Promise((resolve) => {
            this.emit('confirmationRequired', {
              executionId: context.executionId,
              nodeId: node.id,
              message: node.params.message,
              resolve: (confirmed: boolean) => resolve({ confirmed }),
            });
          });
        }

        return { confirmed: true, autoApproved: true };
      },
    });

    // Delay executor
    this.registerExecutor({
      type: 'delay',
      execute: async (node, context) => {
        const duration = node.params.duration ?? 1000;
        await new Promise(resolve => setTimeout(resolve, duration));
        return { delayed: duration };
      },
    });

    // Log executor
    this.registerExecutor({
      type: 'log',
      execute: async (node, context) => {
        const message = node.params.message;
        context.onLog({ level: 'info', message, nodeId: node.id, nodeName: node.name });
        log.info(`[Workflow] ${message}`);
        return { logged: message };
      },
    });

    // Data transform executor
    this.registerExecutor({
      type: 'data-transform',
      execute: async (node, context) => {
        const { transform, input, output } = node.params;
        const inputData = context.inputs[input] ?? context.nodeResults.get(input);
        
        let result: any;
        
        switch (transform) {
          case 'json-parse':
            result = JSON.parse(inputData);
            break;
          case 'json-stringify':
            result = JSON.stringify(inputData, null, 2);
            break;
          case 'split':
            result = inputData.split(node.params.delimiter ?? '\n');
            break;
          case 'join':
            result = inputData.join(node.params.delimiter ?? '\n');
            break;
          case 'filter':
            result = inputData.filter((item: any) => {
              if (!node.params.predicate) return true;
              // Safe property-based filter: "field:op:value" e.g. "status:eq:active", "age:gt:18"
              const pred = String(node.params.predicate);
              const parts = pred.split(':');
              if (parts.length < 3) return !!item?.[pred];
              const [field, op, ...rest] = parts;
              const expected = rest.join(':');
              const actual = item?.[field];
              switch (op) {
                case 'eq': return String(actual) === expected;
                case 'neq': return String(actual) !== expected;
                case 'gt': return Number(actual) > Number(expected);
                case 'gte': return Number(actual) >= Number(expected);
                case 'lt': return Number(actual) < Number(expected);
                case 'lte': return Number(actual) <= Number(expected);
                case 'contains': return String(actual).includes(expected);
                case 'startsWith': return String(actual).startsWith(expected);
                case 'endsWith': return String(actual).endsWith(expected);
                case 'exists': return actual !== undefined && actual !== null;
                default: return !!actual;
              }
            });
            break;
          default:
            result = inputData;
        }

        if (output) {
          context.outputs[output] = result;
        }
        
        return result;
      },
    });

    // Condition executor
    this.registerExecutor({
      type: 'condition',
      execute: async (node, context) => {
        const { expression } = node.params;
        // Evaluate truthy/falsy value of the expression string
        const result = expression !== '' && expression !== '0' && expression !== 'false';
        return { condition: expression, result };
      },
    });

    // App control executor
    this.registerExecutor({
      type: 'app-control',
      execute: async (node, context) => {
        const { action, app: appName, params } = node.params;
        context.onLog({ 
          level: 'warn', 
          message: `App control not available: ${action} on ${appName}`,
          nodeId: node.id 
        });
        return { action, app: appName, error: 'App control requires OS integration module' };
      },
    });
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private async waitForResume(): Promise<void> {
    if (!this.isPaused) return;
    
    return new Promise(resolve => {
      this.pausePromiseResolve = resolve;
    });
  }

  private addLogEntry(execution: WorkflowExecution, entry: Omit<ExecutionLogEntry, 'timestamp'>): void {
    execution.log.push({
      ...entry,
      timestamp: Date.now(),
    });
    this.emit('logEntry', { executionId: execution.id, entry });
  }

  private recordExecution(execution: WorkflowExecution): void {
    // Convert Map to object for storage
    const serializable = {
      ...execution,
      nodeResults: Object.fromEntries(execution.nodeResults),
    };

    this.executionHistory.push(execution);
    
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }

    // Persist to disk
    this.persistExecutionHistory();
  }

  private loadWorkflows(): void {
    try {
      const workflowsPath = path.join(app.getPath('userData'), 'dex-workflows.json');
      if (fs.existsSync(workflowsPath)) {
        const data = JSON.parse(fs.readFileSync(workflowsPath, 'utf-8'));
        for (const workflow of data.workflows ?? []) {
          this.savedWorkflows.set(workflow.id, workflow);
        }
        log.info(`[WorkflowEngine] Loaded ${this.savedWorkflows.size} workflows`);
      }
    } catch (error) {
      log.error('[WorkflowEngine] Failed to load workflows:', error);
    }
  }

  private persistWorkflows(): void {
    try {
      const workflowsPath = path.join(app.getPath('userData'), 'dex-workflows.json');
      const data = {
        version: 1,
        workflows: Array.from(this.savedWorkflows.values()),
      };
      fs.writeFileSync(workflowsPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.error('[WorkflowEngine] Failed to persist workflows:', error);
    }
  }

  private persistExecutionHistory(): void {
    try {
      const historyPath = path.join(app.getPath('userData'), 'dex-workflow-history.json');
      const data = {
        version: 1,
        executions: this.executionHistory.map(e => ({
          ...e,
          nodeResults: Object.fromEntries(e.nodeResults),
        })),
      };
      fs.writeFileSync(historyPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.error('[WorkflowEngine] Failed to persist execution history:', error);
    }
  }
}

// Singleton export
export const workflowEngine = new WorkflowEngineClass();
