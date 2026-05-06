// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Workflow Automation (Phase L: Items 801-825)
// Action recording, batch processing, and automation
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionType = 'click' | 'input' | 'keypress' | 'scroll' | 'drag' | 'select' | 'custom';
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater' | 'less' | 'regex';
export type TriggerType = 'manual' | 'schedule' | 'event' | 'hotkey' | 'api';

export interface RecordedAction {
  id: string;
  type: ActionType;
  target: string;
  value?: unknown;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface Macro {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  variables: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface WorkflowStep {
  id: string;
  action: RecordedAction;
  condition?: WorkflowCondition;
  onSuccess?: string;
  onFailure?: string;
  timeout?: number;
  retries?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  variables: Record<string, unknown>;
  trigger: TriggerType;
  enabled: boolean;
}

export interface BatchJob {
  id: string;
  name: string;
  items: unknown[];
  processor: (item: unknown, index: number) => Promise<unknown>;
  concurrency: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: { completed: number; failed: number; total: number };
}

export interface ScheduledTask {
  id: string;
  workflowId: string;
  cron?: string;
  interval?: number;
  nextRun: number;
  lastRun?: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 801. Action Recording
// ---------------------------------------------------------------------------

export class ActionRecorder {
  private recording = false;
  private actions: RecordedAction[] = [];
  private startTime = 0;
  private listeners: { element: HTMLElement; type: string; handler: EventListener }[] = [];

  startRecording(): void {
    if (this.recording) return;
    
    this.recording = true;
    this.actions = [];
    this.startTime = Date.now();
    
    this.attachListeners();
  }

  stopRecording(): RecordedAction[] {
    this.recording = false;
    this.detachListeners();
    return [...this.actions];
  }

  isRecording(): boolean {
    return this.recording;
  }

  getActions(): RecordedAction[] {
    return [...this.actions];
  }

  private attachListeners(): void {
    const handleClick = (e: Event) => this.recordClick(e as MouseEvent);
    const handleInput = (e: Event) => this.recordInput(e as InputEvent);
    const handleKeydown = (e: Event) => this.recordKeypress(e as KeyboardEvent);
    const handleScroll = (e: Event) => this.recordScroll(e);

    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    this.listeners = [
      { element: document as unknown as HTMLElement, type: 'click', handler: handleClick },
      { element: document as unknown as HTMLElement, type: 'input', handler: handleInput },
      { element: document as unknown as HTMLElement, type: 'keydown', handler: handleKeydown },
      { element: document as unknown as HTMLElement, type: 'scroll', handler: handleScroll },
    ];
  }

  private detachListeners(): void {
    this.listeners.forEach(({ element, type, handler }) => {
      element.removeEventListener(type, handler, true);
    });
    this.listeners = [];
  }

  private recordClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    this.actions.push({
      id: this.generateId(),
      type: 'click',
      target: this.getSelector(target),
      timestamp: Date.now() - this.startTime,
      metadata: {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      },
    });
  }

  private recordInput(e: InputEvent): void {
    const target = e.target as HTMLInputElement;
    this.actions.push({
      id: this.generateId(),
      type: 'input',
      target: this.getSelector(target),
      value: target.value,
      timestamp: Date.now() - this.startTime,
    });
  }

  private recordKeypress(e: KeyboardEvent): void {
    this.actions.push({
      id: this.generateId(),
      type: 'keypress',
      target: this.getSelector(e.target as HTMLElement),
      value: e.key,
      timestamp: Date.now() - this.startTime,
      metadata: {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      },
    });
  }

  private recordScroll(e: Event): void {
    const target = e.target as HTMLElement;
    this.actions.push({
      id: this.generateId(),
      type: 'scroll',
      target: this.getSelector(target),
      timestamp: Date.now() - this.startTime,
      metadata: {
        scrollTop: target.scrollTop,
        scrollLeft: target.scrollLeft,
      },
    });
  }

  private getSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(Boolean).join('.');
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  }

  private generateId(): string {
    return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// 802. Action Playback
// ---------------------------------------------------------------------------

export class ActionPlayer {
  private playing = false;
  private paused = false;
  private currentIndex = 0;
  private playbackSpeed = 1;
  private actions: RecordedAction[] = [];
  private onProgress?: (index: number, total: number) => void;
  private onComplete?: () => void;
  private onError?: (error: Error, action: RecordedAction) => void;

  setActions(actions: RecordedAction[]): void {
    this.actions = [...actions];
    this.currentIndex = 0;
  }

  async play(options: {
    speed?: number;
    onProgress?: (index: number, total: number) => void;
    onComplete?: () => void;
    onError?: (error: Error, action: RecordedAction) => void;
  } = {}): Promise<void> {
    this.playbackSpeed = options.speed ?? 1;
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
    this.playing = true;
    this.paused = false;

    while (this.currentIndex < this.actions.length && this.playing) {
      if (this.paused) {
        await this.waitForResume();
        continue;
      }

      const action = this.actions[this.currentIndex];
      const prevAction = this.actions[this.currentIndex - 1];
      
      // Wait for timing
      if (prevAction) {
        const delay = (action.timestamp - prevAction.timestamp) / this.playbackSpeed;
        await this.wait(delay);
      }

      try {
        await this.executeAction(action);
        this.onProgress?.(this.currentIndex + 1, this.actions.length);
      } catch (e) {
        this.onError?.(e as Error, action);
      }

      this.currentIndex++;
    }

    this.playing = false;
    this.onComplete?.();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.playing = false;
    this.paused = false;
    this.currentIndex = 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private async executeAction(action: RecordedAction): Promise<void> {
    const element = document.querySelector(action.target) as HTMLElement;
    if (!element && action.type !== 'keypress') {
      throw new Error(`Element not found: ${action.target}`);
    }

    switch (action.type) {
      case 'click':
        element.click();
        break;
      case 'input':
        (element as HTMLInputElement).value = action.value as string;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      case 'keypress':
        const keyEvent = new KeyboardEvent('keydown', action.metadata as KeyboardEventInit);
        (element || document).dispatchEvent(keyEvent);
        break;
      case 'scroll':
        element.scrollTop = (action.metadata as { scrollTop: number }).scrollTop;
        element.scrollLeft = (action.metadata as { scrollLeft: number }).scrollLeft;
        break;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  private waitForResume(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (!this.paused || !this.playing) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

// ---------------------------------------------------------------------------
// 803-805. Macro System
// ---------------------------------------------------------------------------

export class MacroManager {
  private macros: Map<string, Macro> = new Map();
  private recorder = new ActionRecorder();
  private player = new ActionPlayer();

  // 803. Create Macro from Recording
  createMacro(name: string, description?: string): Macro {
    const actions = this.recorder.stopRecording();
    const macro: Macro = {
      id: this.generateId(),
      name,
      description,
      actions,
      variables: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.macros.set(macro.id, macro);
    return macro;
  }

  startRecording(): void {
    this.recorder.startRecording();
  }

  isRecording(): boolean {
    return this.recorder.isRecording();
  }

  getMacro(id: string): Macro | undefined {
    return this.macros.get(id);
  }

  getAllMacros(): Macro[] {
    return Array.from(this.macros.values());
  }

  deleteMacro(id: string): boolean {
    return this.macros.delete(id);
  }

  // 804. Macro Variables
  setMacroVariable(macroId: string, name: string, value: unknown): void {
    const macro = this.macros.get(macroId);
    if (macro) {
      macro.variables[name] = value;
      macro.updatedAt = Date.now();
    }
  }

  getMacroVariable(macroId: string, name: string): unknown {
    return this.macros.get(macroId)?.variables[name];
  }

  // 805. Run Macro
  async runMacro(
    id: string,
    options: {
      variables?: Record<string, unknown>;
      speed?: number;
      onProgress?: (index: number, total: number) => void;
    } = {}
  ): Promise<void> {
    const macro = this.macros.get(id);
    if (!macro) throw new Error(`Macro not found: ${id}`);

    // Apply variables
    const actions = this.applyVariables(macro.actions, {
      ...macro.variables,
      ...options.variables,
    });

    this.player.setActions(actions);
    await this.player.play({
      speed: options.speed,
      onProgress: options.onProgress,
    });
  }

  stopMacro(): void {
    this.player.stop();
  }

  private applyVariables(actions: RecordedAction[], variables: Record<string, unknown>): RecordedAction[] {
    return actions.map(action => {
      let value = action.value;
      if (typeof value === 'string') {
        Object.entries(variables).forEach(([name, varValue]) => {
          value = (value as string).replace(new RegExp(`\\$\\{${name}\\}`, 'g'), String(varValue));
        });
      }
      return { ...action, value };
    });
  }

  // 806. Export/Import Macros
  exportMacro(id: string): string | null {
    const macro = this.macros.get(id);
    if (!macro) return null;
    return JSON.stringify(macro);
  }

  importMacro(json: string): Macro | null {
    try {
      const macro = JSON.parse(json) as Macro;
      macro.id = this.generateId();
      macro.createdAt = Date.now();
      macro.updatedAt = Date.now();
      this.macros.set(macro.id, macro);
      return macro;
    } catch {
      return null;
    }
  }

  private generateId(): string {
    return `macro-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const macroManager = new MacroManager();

// ---------------------------------------------------------------------------
// 807-812. Batch Processing
// ---------------------------------------------------------------------------

export class BatchProcessor {
  private jobs: Map<string, BatchJob> = new Map();
  private runningJobs: Set<string> = new Set();

  // 807. Create Batch Job
  createJob(
    name: string,
    items: unknown[],
    processor: (item: unknown, index: number) => Promise<unknown>,
    concurrency = 4
  ): BatchJob {
    const job: BatchJob = {
      id: this.generateId(),
      name,
      items,
      processor,
      concurrency,
      status: 'pending',
      progress: { completed: 0, failed: 0, total: items.length },
    };
    this.jobs.set(job.id, job);
    return job;
  }

  // 808. Run Batch Job
  async runJob(
    id: string,
    options: {
      onProgress?: (progress: BatchJob['progress']) => void;
      onItemComplete?: (item: unknown, result: unknown, index: number) => void;
      onItemError?: (item: unknown, error: Error, index: number) => void;
    } = {}
  ): Promise<{ results: unknown[]; errors: { index: number; error: Error }[] }> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);

    job.status = 'running';
    this.runningJobs.add(id);

    const results: unknown[] = new Array(job.items.length);
    const errors: { index: number; error: Error }[] = [];
    let currentIndex = 0;

    const processItem = async (): Promise<void> => {
      while (currentIndex < job.items.length) {
        if (job.status === 'paused') {
          await this.waitForResume(id);
        }
        if (job.status !== 'running') break;

        const index = currentIndex++;
        const item = job.items[index];

        try {
          const result = await job.processor(item, index);
          results[index] = result;
          job.progress.completed++;
          options.onItemComplete?.(item, result, index);
        } catch (e) {
          job.progress.failed++;
          errors.push({ index, error: e as Error });
          options.onItemError?.(item, e as Error, index);
        }

        options.onProgress?.(job.progress);
      }
    };

    // Run with concurrency
    const workers = Array(job.concurrency).fill(null).map(() => processItem());
    await Promise.all(workers);

    job.status = errors.length > 0 && job.progress.completed === 0 ? 'failed' : 'completed';
    this.runningJobs.delete(id);

    return { results, errors };
  }

  // 809. Pause/Resume Job
  pauseJob(id: string): void {
    const job = this.jobs.get(id);
    if (job && job.status === 'running') {
      job.status = 'paused';
    }
  }

  resumeJob(id: string): void {
    const job = this.jobs.get(id);
    if (job && job.status === 'paused') {
      job.status = 'running';
    }
  }

  // 810. Cancel Job
  cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'failed';
      this.runningJobs.delete(id);
    }
  }

  getJob(id: string): BatchJob | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  deleteJob(id: string): boolean {
    this.runningJobs.delete(id);
    return this.jobs.delete(id);
  }

  private waitForResume(id: string): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        const job = this.jobs.get(id);
        if (!job || job.status !== 'paused') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private generateId(): string {
    return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const batchProcessor = new BatchProcessor();

// ---------------------------------------------------------------------------
// 811-815. Workflow Engine
// ---------------------------------------------------------------------------

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private runningWorkflows: Map<string, { step: string; startTime: number }> = new Map();

  // 811. Create Workflow
  createWorkflow(name: string, description?: string): Workflow {
    const workflow: Workflow = {
      id: this.generateId(),
      name,
      description,
      steps: [],
      variables: {},
      trigger: 'manual',
      enabled: true,
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  // 812. Add Workflow Step
  addStep(
    workflowId: string,
    action: RecordedAction,
    options: {
      condition?: WorkflowCondition;
      onSuccess?: string;
      onFailure?: string;
      timeout?: number;
      retries?: number;
    } = {}
  ): WorkflowStep | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    const step: WorkflowStep = {
      id: this.generateId(),
      action,
      ...options,
    };
    workflow.steps.push(step);
    return step;
  }

  // 813. Conditional Logic
  evaluateCondition(condition: WorkflowCondition, context: Record<string, unknown>): boolean {
    const fieldValue = context[condition.field];
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === targetValue;
      case 'not_equals':
        return fieldValue !== targetValue;
      case 'contains':
        return String(fieldValue).includes(String(targetValue));
      case 'greater':
        return Number(fieldValue) > Number(targetValue);
      case 'less':
        return Number(fieldValue) < Number(targetValue);
      case 'regex':
        return new RegExp(String(targetValue)).test(String(fieldValue));
      default:
        return false;
    }
  }

  // 814. Run Workflow
  async runWorkflow(
    id: string,
    options: {
      variables?: Record<string, unknown>;
      onStepStart?: (step: WorkflowStep) => void;
      onStepComplete?: (step: WorkflowStep, result: unknown) => void;
      onStepError?: (step: WorkflowStep, error: Error) => void;
    } = {}
  ): Promise<{ success: boolean; results: Record<string, unknown>; errors: Error[] }> {
    const workflow = this.workflows.get(id);
    if (!workflow) throw new Error(`Workflow not found: ${id}`);
    if (!workflow.enabled) throw new Error(`Workflow is disabled: ${id}`);

    const context = { ...workflow.variables, ...options.variables };
    const results: Record<string, unknown> = {};
    const errors: Error[] = [];

    this.runningWorkflows.set(id, { step: '', startTime: Date.now() });

    let currentStepId: string | undefined = workflow.steps[0]?.id;

    while (currentStepId) {
      const step = workflow.steps.find(s => s.id === currentStepId);
      if (!step) break;

      this.runningWorkflows.set(id, { step: step.id, startTime: Date.now() });
      options.onStepStart?.(step);

      // Check condition
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        currentStepId = step.onFailure;
        continue;
      }

      // Execute with retries
      let success = false;
      let lastError: Error | null = null;
      const maxRetries = step.retries ?? 0;

      for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
        try {
          const result = await this.executeStep(step, context, step.timeout);
          results[step.id] = result;
          context[`step_${step.id}_result`] = result;
          success = true;
          options.onStepComplete?.(step, result);
        } catch (e) {
          lastError = e as Error;
          if (attempt === maxRetries) {
            errors.push(lastError);
            options.onStepError?.(step, lastError);
          }
        }
      }

      currentStepId = success ? step.onSuccess : step.onFailure;
      
      // Default to next step if no explicit path
      if (currentStepId === undefined && success) {
        const currentIndex = workflow.steps.findIndex(s => s.id === step.id);
        currentStepId = workflow.steps[currentIndex + 1]?.id;
      }
    }

    this.runningWorkflows.delete(id);
    return { success: errors.length === 0, results, errors };
  }

  private async executeStep(
    step: WorkflowStep,
    context: Record<string, unknown>,
    timeout?: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = timeout ? setTimeout(() => reject(new Error('Step timeout')), timeout) : null;

      // Execute action
      const element = document.querySelector(step.action.target) as HTMLElement;
      
      try {
        switch (step.action.type) {
          case 'click':
            element?.click();
            break;
          case 'input':
            (element as HTMLInputElement).value = String(step.action.value);
            element?.dispatchEvent(new Event('input', { bubbles: true }));
            break;
          case 'custom':
            // Custom action handling
            break;
        }
        
        if (timeoutId) clearTimeout(timeoutId);
        resolve(true);
      } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  // 815. Stop Workflow
  stopWorkflow(id: string): void {
    this.runningWorkflows.delete(id);
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  deleteWorkflow(id: string): boolean {
    this.runningWorkflows.delete(id);
    return this.workflows.delete(id);
  }

  isRunning(id: string): boolean {
    return this.runningWorkflows.has(id);
  }

  private generateId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const workflowEngine = new WorkflowEngine();

// ---------------------------------------------------------------------------
// 816-819. Scheduling
// ---------------------------------------------------------------------------

export class TaskScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private workflowEngine: WorkflowEngine;

  constructor(workflowEngine: WorkflowEngine) {
    this.workflowEngine = workflowEngine;
  }

  // 816. Schedule Task
  scheduleTask(workflowId: string, options: { cron?: string; interval?: number }): ScheduledTask {
    const task: ScheduledTask = {
      id: this.generateId(),
      workflowId,
      cron: options.cron,
      interval: options.interval,
      nextRun: this.calculateNextRun(options),
      enabled: true,
    };
    this.tasks.set(task.id, task);
    this.startTask(task.id);
    return task;
  }

  // 817. Start/Stop Task
  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task || !task.enabled) return;

    const runTask = async () => {
      task.lastRun = Date.now();
      await this.workflowEngine.runWorkflow(task.workflowId);
      task.nextRun = this.calculateNextRun({ interval: task.interval });
      
      if (task.interval) {
        this.timers.set(id, setTimeout(runTask, task.interval));
      }
    };

    const delay = Math.max(0, task.nextRun - Date.now());
    this.timers.set(id, setTimeout(runTask, delay));
  }

  stopTask(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  // 818. Enable/Disable Task
  enableTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.enabled = true;
      this.startTask(id);
    }
  }

  disableTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.enabled = false;
      this.stopTask(id);
    }
  }

  // 819. Get Task Status
  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  deleteTask(id: string): boolean {
    this.stopTask(id);
    return this.tasks.delete(id);
  }

  private calculateNextRun(options: { cron?: string; interval?: number }): number {
    if (options.interval) {
      return Date.now() + options.interval;
    }
    // Simplified cron - just use interval for now
    return Date.now() + 60000;
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// 820-823. Integration Hooks
// ---------------------------------------------------------------------------

export type WebhookEvent = 'workflow.started' | 'workflow.completed' | 'workflow.failed' | 'step.completed' | 'step.failed';

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  enabled: boolean;
}

export class IntegrationManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private eventQueue: { event: WebhookEvent; payload: unknown }[] = [];
  private processing = false;

  // 820. Register Webhook
  registerWebhook(url: string, events: WebhookEvent[], secret?: string): WebhookConfig {
    const webhook: WebhookConfig = {
      id: this.generateId(),
      url,
      events,
      secret,
      enabled: true,
    };
    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }

  // 821. Trigger Webhook
  async triggerWebhooks(event: WebhookEvent, payload: unknown): Promise<void> {
    const webhooks = Array.from(this.webhooks.values())
      .filter(w => w.enabled && w.events.includes(event));

    await Promise.all(webhooks.map(webhook => this.sendWebhook(webhook, event, payload)));
  }

  private async sendWebhook(webhook: WebhookConfig, event: WebhookEvent, payload: unknown): Promise<void> {
    try {
      const body = JSON.stringify({ event, payload, timestamp: Date.now() });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      if (webhook.secret) {
        // Simple signature (in production, use HMAC)
        headers['X-Webhook-Signature'] = btoa(webhook.secret + body);
      }

      await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (e) {
      console.error('Webhook failed:', e);
    }
  }

  // 822. CLI Integration
  async executeCLI(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // In Electron, this would use child_process
    // Stub for browser environment
    console.log('CLI command:', command);
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  // 823. API Endpoint
  createAPIEndpoint(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: (params: unknown) => Promise<unknown>
  ): void {
    // Register endpoint for external API access
    console.log('API endpoint registered:', method, path);
  }

  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  getAllWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  deleteWebhook(id: string): boolean {
    return this.webhooks.delete(id);
  }

  private generateId(): string {
    return `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const integrationManager = new IntegrationManager();

// ---------------------------------------------------------------------------
// 824-825. Templates and Presets
// ---------------------------------------------------------------------------

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: Omit<Workflow, 'id'>;
}

export class TemplateManager {
  private templates: Map<string, WorkflowTemplate> = new Map();

  // 824. Built-in Templates
  constructor() {
    this.loadBuiltInTemplates();
  }

  private loadBuiltInTemplates(): void {
    // File rename template
    this.templates.set('file-rename', {
      id: 'file-rename',
      name: 'Batch File Rename',
      description: 'Rename multiple files with pattern',
      category: 'File Operations',
      workflow: {
        name: 'Batch File Rename',
        steps: [],
        variables: { pattern: '${name}-${date}' },
        trigger: 'manual',
        enabled: true,
      },
    });

    // Export template
    this.templates.set('batch-export', {
      id: 'batch-export',
      name: 'Batch Export',
      description: 'Export multiple items in sequence',
      category: 'Export',
      workflow: {
        name: 'Batch Export',
        steps: [],
        variables: { format: 'png', quality: 90 },
        trigger: 'manual',
        enabled: true,
      },
    });
  }

  // 825. Create from Template
  createFromTemplate(templateId: string, workflowEngine: WorkflowEngine): Workflow | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const workflow = workflowEngine.createWorkflow(template.workflow.name);
    workflow.variables = { ...template.workflow.variables };
    workflow.trigger = template.workflow.trigger;
    
    return workflow;
  }

  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }
}

export const templateManager = new TemplateManager();

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function useActionRecorder() {
  const recorder = useRef(new ActionRecorder());
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);

  const startRecording = useCallback(() => {
    recorder.current.startRecording();
    setRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    const recorded = recorder.current.stopRecording();
    setRecording(false);
    setActions(recorded);
    return recorded;
  }, []);

  return { recording, actions, startRecording, stopRecording };
}

export function useActionPlayer() {
  const player = useRef(new ActionPlayer());
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const play = useCallback(async (actions: RecordedAction[], speed = 1) => {
    player.current.setActions(actions);
    setPlaying(true);
    setProgress({ current: 0, total: actions.length });

    await player.current.play({
      speed,
      onProgress: (current, total) => setProgress({ current, total }),
      onComplete: () => setPlaying(false),
    });
  }, []);

  const pause = useCallback(() => player.current.pause(), []);
  const resume = useCallback(() => player.current.resume(), []);
  const stop = useCallback(() => {
    player.current.stop();
    setPlaying(false);
  }, []);

  return { playing, progress, play, pause, resume, stop };
}

export function useBatchProcessor<T, R>(
  processor: (item: T, index: number) => Promise<R>,
  concurrency = 4
) {
  const [status, setStatus] = useState<BatchJob['status']>('pending');
  const [progress, setProgress] = useState({ completed: 0, failed: 0, total: 0 });
  const jobId = useRef<string | null>(null);

  const process = useCallback(async (items: T[]): Promise<{ results: R[]; errors: { index: number; error: Error }[] }> => {
    const job = batchProcessor.createJob('batch', items, processor as (item: unknown, index: number) => Promise<unknown>, concurrency);
    jobId.current = job.id;
    setStatus('running');
    setProgress({ completed: 0, failed: 0, total: items.length });

    const result = await batchProcessor.runJob(job.id, {
      onProgress: (p) => setProgress(p),
    });

    setStatus(job.status);
    return result as { results: R[]; errors: { index: number; error: Error }[] };
  }, [processor, concurrency]);

  const pause = useCallback(() => {
    if (jobId.current) batchProcessor.pauseJob(jobId.current);
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (jobId.current) batchProcessor.resumeJob(jobId.current);
    setStatus('running');
  }, []);

  const cancel = useCallback(() => {
    if (jobId.current) batchProcessor.cancelJob(jobId.current);
    setStatus('failed');
  }, []);

  return { status, progress, process, pause, resume, cancel };
}

export function useWorkflow(workflowId?: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (workflowId) {
      setWorkflow(workflowEngine.getWorkflow(workflowId) || null);
    }
  }, [workflowId]);

  const run = useCallback(async (variables?: Record<string, unknown>) => {
    if (!workflow) return;
    setRunning(true);
    try {
      await workflowEngine.runWorkflow(workflow.id, { variables });
    } finally {
      setRunning(false);
    }
  }, [workflow]);

  const stop = useCallback(() => {
    if (workflow) {
      workflowEngine.stopWorkflow(workflow.id);
      setRunning(false);
    }
  }, [workflow]);

  return { workflow, running, run, stop };
}
