// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Session & Workflow Controller
// Phase 5 & 6: Advanced Control Composition & Live Task Control
// ===========================================================================

import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';
import { ActionController } from './ActionController';
import { OperationsController } from './OperationsController';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  type: 'action' | 'operation' | 'app' | 'delay' | 'notification';
  name: string;
  description: string;
  config: Record<string, any>;
  enabled: boolean;
  order: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: WorkflowStep[];
  scope: string[];
  impact: 'light' | 'medium' | 'heavy';
  pinned: boolean;
  isTemplate: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  stepResults: StepResult[];
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
  startTime?: number;
  endTime?: number;
}

export interface Session {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'paused' | 'ended';
  notes: SessionNote[];
  timers: SessionTimer[];
  executedWorkflows: string[];
  activeOperations: string[];
}

export interface SessionNote {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  linkedTo?: { type: 'workflow' | 'operation' | 'timer'; id: string };
}

export interface SessionTimer {
  id: string;
  name: string;
  duration: number; // in seconds
  elapsed: number;
  status: 'idle' | 'running' | 'paused' | 'completed';
  startedAt?: number;
  linkedTo?: { type: 'workflow' | 'session'; id: string };
}

export interface RunningTask {
  id: string;
  name: string;
  type: 'app' | 'workflow' | 'operation' | 'timer';
  status: 'running' | 'paused';
  startTime: number;
  source: 'dex' | 'system';
  pid?: number;
  canStop: boolean;
}

// -----------------------------------------------------------------------------
// Default Templates
// -----------------------------------------------------------------------------

const DEFAULT_TEMPLATES: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Clean Workspace',
    description: 'Close non-essential apps and free memory',
    category: 'cleanup',
    steps: [
      {
        id: 'step_1',
        type: 'operation',
        name: 'Close Background Apps',
        description: 'Close non-essential background applications',
        config: { operationId: 'close-background-apps' },
        enabled: true,
        order: 1,
      },
      {
        id: 'step_2',
        type: 'operation',
        name: 'Clean Memory',
        description: 'Release unused memory',
        config: { operationId: 'clean-memory' },
        enabled: true,
        order: 2,
      },
      {
        id: 'step_3',
        type: 'operation',
        name: 'Clear Temp Files',
        description: 'Remove temporary files',
        config: { operationId: 'clear-temp-files' },
        enabled: true,
        order: 3,
      },
    ],
    scope: ['memory', 'processes', 'files'],
    impact: 'medium',
    pinned: false,
    isTemplate: true,
  },
  {
    name: 'Prep for Work',
    description: 'Optimize system for productivity',
    category: 'performance',
    steps: [
      {
        id: 'step_1',
        type: 'operation',
        name: 'Performance Prep',
        description: 'Optimize system for demanding tasks',
        config: { operationId: 'performance-prep' },
        enabled: true,
        order: 1,
      },
      {
        id: 'step_2',
        type: 'operation',
        name: 'Minimize Distractions',
        description: 'Minimize other windows',
        config: { operationId: 'minimize-distractions' },
        enabled: true,
        order: 2,
      },
    ],
    scope: ['power', 'windows'],
    impact: 'light',
    pinned: false,
    isTemplate: true,
  },
  {
    name: 'Low Power Cleanup',
    description: 'Reduce resource usage to save battery',
    category: 'power',
    steps: [
      {
        id: 'step_1',
        type: 'operation',
        name: 'Return to Balanced',
        description: 'Set power profile to balanced',
        config: { operationId: 'return-balanced' },
        enabled: true,
        order: 1,
      },
      {
        id: 'step_2',
        type: 'operation',
        name: 'Close Background Apps',
        description: 'Close non-essential apps',
        config: { operationId: 'close-background-apps' },
        enabled: true,
        order: 2,
      },
      {
        id: 'step_3',
        type: 'operation',
        name: 'Reduce Visual Load',
        description: 'Disable animations and effects',
        config: { operationId: 'reduce-visual-load' },
        enabled: true,
        order: 3,
      },
    ],
    scope: ['power', 'processes', 'visual'],
    impact: 'medium',
    pinned: false,
    isTemplate: true,
  },
  {
    name: 'Emergency Reset',
    description: 'Reset all Dex states and return to defaults',
    category: 'system',
    steps: [
      {
        id: 'step_1',
        type: 'operation',
        name: 'Return to Balanced',
        description: 'Reset power profile',
        config: { operationId: 'return-balanced' },
        enabled: true,
        order: 1,
      },
      {
        id: 'step_2',
        type: 'operation',
        name: 'Reset Dex State',
        description: 'Clear all temporary Dex states',
        config: { operationId: 'reset-dex-state' },
        enabled: true,
        order: 2,
      },
    ],
    scope: ['dex', 'power'],
    impact: 'light',
    pinned: false,
    isTemplate: true,
  },
];

// -----------------------------------------------------------------------------
// Session Controller
// -----------------------------------------------------------------------------

export class SessionController {
  private currentSession: Session | null = null;
  private workflows: Workflow[] = [];
  private executions: Map<string, WorkflowExecution> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private timerIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private dataStore: DataStore,
    private logger: Logger,
    private operationsController: OperationsController,
    private actionController: ActionController
  ) {
    this.loadData();
  }

  // ===========================================================================
  // WORKFLOW MANAGEMENT
  // ===========================================================================

  async getWorkflows(): Promise<Workflow[]> {
    return this.workflows.filter(w => !w.isTemplate);
  }

  async getTemplates(): Promise<Workflow[]> {
    return this.workflows.filter(w => w.isTemplate);
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.workflows.find(w => w.id === id) || null;
  }

  async saveWorkflow(workflow: Partial<Workflow>): Promise<Workflow> {
    const now = Date.now();
    
    if (workflow.id) {
      // Update existing
      const index = this.workflows.findIndex(w => w.id === workflow.id);
      if (index >= 0) {
        this.workflows[index] = {
          ...this.workflows[index],
          ...workflow,
          updatedAt: now,
        };
        await this.saveData();
        this.logger.info(`Workflow updated: ${workflow.name}`);
        return this.workflows[index];
      }
    }

    // Create new
    const newWorkflow: Workflow = {
      id: `workflow_${now}_${Math.random().toString(36).substr(2, 9)}`,
      name: workflow.name || 'New Workflow',
      description: workflow.description || '',
      category: workflow.category || 'custom',
      steps: workflow.steps || [],
      scope: workflow.scope || [],
      impact: workflow.impact || 'light',
      pinned: workflow.pinned || false,
      isTemplate: workflow.isTemplate || false,
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.push(newWorkflow);
    await this.saveData();
    this.logger.info(`Workflow created: ${newWorkflow.name}`);
    return newWorkflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const index = this.workflows.findIndex(w => w.id === id);
    if (index >= 0) {
      const workflow = this.workflows[index];
      if (workflow.isTemplate) {
        throw new Error('Cannot delete built-in templates');
      }
      this.workflows.splice(index, 1);
      await this.saveData();
      this.logger.info(`Workflow deleted: ${workflow.name}`);
    }
  }

  async duplicateWorkflow(id: string): Promise<Workflow> {
    const source = this.workflows.find(w => w.id === id);
    if (!source) {
      throw new Error('Workflow not found');
    }

    return this.saveWorkflow({
      ...source,
      id: undefined,
      name: `${source.name} (Copy)`,
      isTemplate: false,
      pinned: false,
    });
  }

  async togglePin(id: string): Promise<Workflow> {
    const workflow = this.workflows.find(w => w.id === id);
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    workflow.pinned = !workflow.pinned;
    workflow.updatedAt = Date.now();
    await this.saveData();
    return workflow;
  }

  async getPinnedWorkflows(): Promise<Workflow[]> {
    return this.workflows.filter(w => w.pinned && !w.isTemplate);
  }

  // ===========================================================================
  // WORKFLOW EXECUTION
  // ===========================================================================

  async executeWorkflow(workflowId: string): Promise<WorkflowExecution> {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const enabledSteps = workflow.steps.filter(s => s.enabled).sort((a, b) => a.order - b.order);
    if (enabledSteps.length === 0) {
      throw new Error('No enabled steps in workflow');
    }

    const execution: WorkflowExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId: workflow.id,
      workflowName: workflow.name,
      startTime: Date.now(),
      status: 'running',
      currentStep: 0,
      totalSteps: enabledSteps.length,
      stepResults: enabledSteps.map(step => ({
        stepId: step.id,
        stepName: step.name,
        status: 'pending',
      })),
    };

    this.executions.set(execution.id, execution);
    this.logger.info(`Starting workflow: ${workflow.name}`);

    // Add to current session if active
    if (this.currentSession) {
      this.currentSession.executedWorkflows.push(execution.id);
    }

    // Execute steps sequentially
    try {
      for (let i = 0; i < enabledSteps.length; i++) {
        const step = enabledSteps[i];
        execution.currentStep = i;
        execution.stepResults[i].status = 'running';
        execution.stepResults[i].startTime = Date.now();

        try {
          await this.executeStep(step);
          execution.stepResults[i].status = 'success';
          execution.stepResults[i].message = 'Completed successfully';
        } catch (error: any) {
          execution.stepResults[i].status = 'failed';
          execution.stepResults[i].message = error.message;
          this.logger.warn(`Step failed: ${step.name} - ${error.message}`);
        }
        
        execution.stepResults[i].endTime = Date.now();
      }

      execution.status = execution.stepResults.some(r => r.status === 'failed') ? 'failed' : 'completed';
    } catch (error: any) {
      execution.status = 'failed';
      this.logger.error(`Workflow failed: ${workflow.name} - ${error.message}`);
    }

    execution.endTime = Date.now();
    this.logger.info(`Workflow ${execution.status}: ${workflow.name}`);
    
    return execution;
  }

  private async executeStep(step: WorkflowStep): Promise<void> {
    switch (step.type) {
      case 'operation':
        await this.operationsController.execute(step.config.operationId);
        break;
      
      case 'action':
        if (step.config.action) {
          await this.actionController.execute(step.config.action);
        }
        break;
      
      case 'app':
        if (step.config.target) {
          await this.actionController.execute({
            id: `temp-${step.id}`,
            name: step.name,
            type: 'open-app',
            target: step.config.target,
            args: step.config.args || [],
            icon: 'app',
            color: '#6366f1',
            enabled: true,
            createdAt: Date.now(),
          });
        }
        break;
      
      case 'delay':
        const delayMs = (step.config.seconds || 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        break;
      
      case 'notification':
        // Could send system notification
        this.logger.info(`Notification: ${step.config.message || step.name}`);
        break;
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = Date.now();
      this.logger.info(`Workflow cancelled: ${execution.workflowName}`);
    }
  }

  async getExecution(id: string): Promise<WorkflowExecution | null> {
    return this.executions.get(id) || null;
  }

  async getActiveExecutions(): Promise<WorkflowExecution[]> {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }

  async getRecentExecutions(limit: number = 10): Promise<WorkflowExecution[]> {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  async startSession(name: string): Promise<Session> {
    if (this.currentSession && this.currentSession.status === 'active') {
      await this.endSession();
    }

    this.currentSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      startTime: Date.now(),
      status: 'active',
      notes: [],
      timers: [],
      executedWorkflows: [],
      activeOperations: [],
    };

    this.logger.info(`Session started: ${name}`);
    return this.currentSession;
  }

  async endSession(): Promise<Session | null> {
    if (!this.currentSession) return null;

    this.currentSession.status = 'ended';
    this.currentSession.endTime = Date.now();
    
    // Stop all active timers
    for (const timer of this.currentSession.timers) {
      if (timer.status === 'running') {
        await this.pauseTimer(timer.id);
      }
    }

    const session = this.currentSession;
    this.logger.info(`Session ended: ${session.name}`);
    
    // Archive session
    await this.archiveSession(session);
    this.currentSession = null;
    
    return session;
  }

  async getCurrentSession(): Promise<Session | null> {
    return this.currentSession;
  }

  async pauseSession(): Promise<Session | null> {
    if (!this.currentSession) return null;
    this.currentSession.status = 'paused';
    this.logger.info(`Session paused: ${this.currentSession.name}`);
    return this.currentSession;
  }

  async resumeSession(): Promise<Session | null> {
    if (!this.currentSession) return null;
    this.currentSession.status = 'active';
    this.logger.info(`Session resumed: ${this.currentSession.name}`);
    return this.currentSession;
  }

  // ===========================================================================
  // NOTES
  // ===========================================================================

  async addNote(content: string, linkedTo?: { type: 'workflow' | 'operation' | 'timer'; id: string }): Promise<SessionNote> {
    if (!this.currentSession) {
      // Create a default session if none exists
      await this.startSession('Quick Notes');
    }

    const note: SessionNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedTo,
    };

    this.currentSession!.notes.push(note);
    await this.saveData();
    return note;
  }

  async updateNote(noteId: string, content: string): Promise<SessionNote | null> {
    if (!this.currentSession) return null;

    const note = this.currentSession.notes.find(n => n.id === noteId);
    if (note) {
      note.content = content;
      note.updatedAt = Date.now();
      await this.saveData();
    }
    return note || null;
  }

  async deleteNote(noteId: string): Promise<void> {
    if (!this.currentSession) return;

    const index = this.currentSession.notes.findIndex(n => n.id === noteId);
    if (index >= 0) {
      this.currentSession.notes.splice(index, 1);
      await this.saveData();
    }
  }

  async getNotes(): Promise<SessionNote[]> {
    return this.currentSession?.notes || [];
  }

  // ===========================================================================
  // TIMERS
  // ===========================================================================

  async createTimer(name: string, durationSeconds: number): Promise<SessionTimer> {
    if (!this.currentSession) {
      await this.startSession('Timer Session');
    }

    const timer: SessionTimer = {
      id: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      duration: durationSeconds,
      elapsed: 0,
      status: 'idle',
    };

    this.currentSession!.timers.push(timer);
    await this.saveData();
    return timer;
  }

  async startTimer(timerId: string): Promise<SessionTimer | null> {
    if (!this.currentSession) return null;

    const timer = this.currentSession.timers.find(t => t.id === timerId);
    if (!timer) return null;

    timer.status = 'running';
    timer.startedAt = Date.now();

    // Set up interval to track elapsed time
    const interval = setInterval(() => {
      if (timer.status === 'running') {
        timer.elapsed++;
        if (timer.elapsed >= timer.duration) {
          timer.status = 'completed';
          this.clearTimerInterval(timerId);
          this.logger.info(`Timer completed: ${timer.name}`);
        }
      }
    }, 1000);

    this.timerIntervals.set(timerId, interval);
    this.logger.info(`Timer started: ${timer.name}`);
    return timer;
  }

  async pauseTimer(timerId: string): Promise<SessionTimer | null> {
    if (!this.currentSession) return null;

    const timer = this.currentSession.timers.find(t => t.id === timerId);
    if (timer && timer.status === 'running') {
      timer.status = 'paused';
      this.clearTimerInterval(timerId);
      this.logger.info(`Timer paused: ${timer.name}`);
    }
    return timer || null;
  }

  async resumeTimer(timerId: string): Promise<SessionTimer | null> {
    if (!this.currentSession) return null;

    const timer = this.currentSession.timers.find(t => t.id === timerId);
    if (timer && timer.status === 'paused') {
      return this.startTimer(timerId);
    }
    return timer || null;
  }

  async resetTimer(timerId: string): Promise<SessionTimer | null> {
    if (!this.currentSession) return null;

    const timer = this.currentSession.timers.find(t => t.id === timerId);
    if (timer) {
      this.clearTimerInterval(timerId);
      timer.status = 'idle';
      timer.elapsed = 0;
      timer.startedAt = undefined;
      this.logger.info(`Timer reset: ${timer.name}`);
    }
    return timer || null;
  }

  async deleteTimer(timerId: string): Promise<void> {
    if (!this.currentSession) return;

    this.clearTimerInterval(timerId);
    const index = this.currentSession.timers.findIndex(t => t.id === timerId);
    if (index >= 0) {
      this.currentSession.timers.splice(index, 1);
      await this.saveData();
    }
  }

  async getTimers(): Promise<SessionTimer[]> {
    return this.currentSession?.timers || [];
  }

  async getTimer(timerId: string): Promise<SessionTimer | null> {
    return this.currentSession?.timers.find(t => t.id === timerId) || null;
  }

  private clearTimerInterval(timerId: string): void {
    const interval = this.timerIntervals.get(timerId);
    if (interval) {
      clearInterval(interval);
      this.timerIntervals.delete(timerId);
    }
  }

  // ===========================================================================
  // RUNNING TASKS
  // ===========================================================================

  async getRunningTasks(): Promise<RunningTask[]> {
    const tasks: RunningTask[] = [];

    // Add active workflow executions
    for (const exec of this.executions.values()) {
      if (exec.status === 'running') {
        tasks.push({
          id: exec.id,
          name: exec.workflowName,
          type: 'workflow',
          status: 'running',
          startTime: exec.startTime,
          source: 'dex',
          canStop: true,
        });
      }
    }

    // Add active timers
    if (this.currentSession) {
      for (const timer of this.currentSession.timers) {
        if (timer.status === 'running') {
          tasks.push({
            id: timer.id,
            name: timer.name,
            type: 'timer',
            status: 'running',
            startTime: timer.startedAt || Date.now(),
            source: 'dex',
            canStop: true,
          });
        }
      }
    }

    return tasks;
  }

  async stopTask(taskId: string): Promise<void> {
    // Check if it's a workflow execution
    const execution = this.executions.get(taskId);
    if (execution) {
      await this.cancelExecution(taskId);
      return;
    }

    // Check if it's a timer
    await this.pauseTimer(taskId);
  }

  // ===========================================================================
  // DATA PERSISTENCE
  // ===========================================================================

  private async loadData(): Promise<void> {
    try {
      // Load workflows
      const savedWorkflows = await this.dataStore.get('workflows');
      if (Array.isArray(savedWorkflows)) {
        this.workflows = savedWorkflows;
      }

      // Initialize templates if not present
      const hasTemplates = this.workflows.some(w => w.isTemplate);
      if (!hasTemplates) {
        await this.initializeTemplates();
      }

      // Load current session if exists
      const savedSession = await this.dataStore.get('currentSession');
      if (savedSession && savedSession.status === 'active') {
        this.currentSession = savedSession;
        // Restore timer states but don't auto-start
        if (this.currentSession && this.currentSession.timers) {
          for (const timer of this.currentSession.timers) {
            if (timer.status === 'running') {
              timer.status = 'paused'; // Pause timers on load
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load session data');
      this.workflows = [];
      await this.initializeTemplates();
    }
  }

  private async initializeTemplates(): Promise<void> {
    const now = Date.now();
    for (const template of DEFAULT_TEMPLATES) {
      const workflow: Workflow = {
        ...template,
        id: `template_${template.name.toLowerCase().replace(/\s+/g, '_')}`,
        createdAt: now,
        updatedAt: now,
      };
      this.workflows.push(workflow);
    }
    await this.saveData();
  }

  private async saveData(): Promise<void> {
    try {
      await this.dataStore.set('workflows', this.workflows);
      if (this.currentSession) {
        await this.dataStore.set('currentSession', this.currentSession);
      }
    } catch (error) {
      this.logger.error('Failed to save session data');
    }
  }

  private async archiveSession(session: Session): Promise<void> {
    try {
      const archived = await this.dataStore.get('archivedSessions') || [];
      archived.unshift(session);
      // Keep only last 50 sessions
      if (archived.length > 50) {
        archived.splice(50);
      }
      await this.dataStore.set('archivedSessions', archived);
    } catch (error) {
      this.logger.error('Failed to archive session');
    }
  }

  async getArchivedSessions(limit: number = 10): Promise<Session[]> {
    const archived = await this.dataStore.get('archivedSessions') || [];
    return archived.slice(0, limit);
  }
}
