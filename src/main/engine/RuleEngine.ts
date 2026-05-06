// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Rule Engine
// IF/THEN automation logic processor
// ===========================================================================

import * as schedule from 'node-schedule';
import { DexRule, RuleCondition, SystemStatus, ProcessInfo } from '../../shared/types';
import { DataStore } from '../store/DataStore';
import { ActionController } from '../controllers/ActionController';
import { ModeController } from '../controllers/ModeController';
import { Logger } from '../utils/Logger';

interface ContextData {
  systemStatus: SystemStatus | null;
  runningProcesses: ProcessInfo[];
  currentTime: Date;
}

export class RuleEngine {
  private dataStore: DataStore;
  private actionController: ActionController;
  private modeController: ModeController;
  private logger: Logger;
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private timeJobs: Map<string, schedule.Job> = new Map();
  private contextData: ContextData = {
    systemStatus: null,
    runningProcesses: [],
    currentTime: new Date(),
  };

  constructor(
    dataStore: DataStore,
    actionController: ActionController,
    modeController: ModeController,
    logger: Logger
  ) {
    this.dataStore = dataStore;
    this.actionController = actionController;
    this.modeController = modeController;
    this.logger = logger;
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.logger.info('Rule Engine started');
    
    // Check rules every 10 seconds
    this.checkInterval = setInterval(() => {
      this.evaluateRules();
    }, 10000);

    // Setup time-based triggers
    this.setupTimeJobs();
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel all time jobs
    for (const job of this.timeJobs.values()) {
      job.cancel();
    }
    this.timeJobs.clear();

    this.logger.info('Rule Engine stopped');
  }

  reloadRules(): void {
    this.setupTimeJobs();
    this.logger.info('Rules reloaded');
  }

  updateContext(systemStatus: SystemStatus, processes: ProcessInfo[]): void {
    this.contextData = {
      systemStatus,
      runningProcesses: processes,
      currentTime: new Date(),
    };
  }

  private async evaluateRules(): Promise<void> {
    if (!this.isRunning) return;

    const rules = this.dataStore.getRules().filter(r => r.enabled);

    for (const rule of rules) {
      try {
        // Check cooldown
        if (rule.lastTriggered) {
          const elapsed = Date.now() - rule.lastTriggered;
          if (elapsed < rule.cooldown) {
            continue;
          }
        }

        // Evaluate conditions
        const conditionsMet = await this.evaluateConditions(rule.conditions);
        
        if (conditionsMet) {
          await this.triggerRule(rule);
        }
      } catch (error: any) {
        this.logger.error(`Error evaluating rule: ${rule.name}`, error);
      }
    }
  }

  private async evaluateConditions(conditions: RuleCondition[]): Promise<boolean> {
    if (conditions.length === 0) return false;

    let result = true;
    let currentOperator: 'and' | 'or' = 'and';

    for (const condition of conditions) {
      const conditionResult = await this.evaluateCondition(condition);
      
      if (currentOperator === 'and') {
        result = result && conditionResult;
      } else {
        result = result || conditionResult;
      }

      currentOperator = condition.operator || 'and';
    }

    return result;
  }

  private async evaluateCondition(condition: RuleCondition): Promise<boolean> {
    const { systemStatus, runningProcesses, currentTime } = this.contextData;

    switch (condition.type) {
      case 'time': {
        const targetTime = condition.value as string;
        const [hours, minutes] = targetTime.split(':').map(Number);
        return currentTime.getHours() === hours && currentTime.getMinutes() === minutes;
      }

      case 'time-range': {
        const [start, end] = (condition.value as string).split('-');
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }

      case 'process-running': {
        const processName = (condition.value as string).toLowerCase();
        return runningProcesses.some(p => 
          p.name.toLowerCase().includes(processName)
        );
      }

      case 'process-not-running': {
        const processName = (condition.value as string).toLowerCase();
        return !runningProcesses.some(p => 
          p.name.toLowerCase().includes(processName)
        );
      }

      case 'battery-below': {
        if (!systemStatus?.battery?.hasBattery) return false;
        return systemStatus.battery.percent < (condition.value as number);
      }

      case 'battery-above': {
        if (!systemStatus?.battery?.hasBattery) return false;
        return systemStatus.battery.percent > (condition.value as number);
      }

      case 'battery-charging': {
        if (!systemStatus?.battery?.hasBattery) return false;
        return systemStatus.battery.charging;
      }

      case 'battery-discharging': {
        if (!systemStatus?.battery?.hasBattery) return false;
        return !systemStatus.battery.charging;
      }

      case 'mode-active': {
        const activeMode = await this.modeController.getActiveMode();
        return activeMode?.id === condition.value || activeMode?.name === condition.value;
      }

      case 'mode-inactive': {
        const activeMode = await this.modeController.getActiveMode();
        return !activeMode || (activeMode.id !== condition.value && activeMode.name !== condition.value);
      }

      case 'network-connected': {
        return systemStatus?.network?.connected ?? false;
      }

      case 'network-disconnected': {
        return !(systemStatus?.network?.connected ?? true);
      }

      case 'idle-time': {
        // Would need electron.powerMonitor.getSystemIdleTime()
        // For now, return false
        return false;
      }

      default:
        return false;
    }
  }

  private async triggerRule(rule: DexRule): Promise<void> {
    this.logger.info(`Rule triggered: ${rule.name}`);

    // Execute rule actions
    const actions = this.dataStore.getActions();
    for (const actionId of rule.actions) {
      const action = actions.find(a => a.id === actionId);
      if (action && action.enabled) {
        try {
          await this.actionController.execute(action);
        } catch (error: any) {
          this.logger.error(`Failed to execute action ${action.name} for rule ${rule.name}`, error);
        }
      }
    }

    // Update trigger info
    await this.dataStore.updateRuleTrigger(rule.id);
    this.logger.success(`Rule completed: ${rule.name}`);
  }

  private setupTimeJobs(): void {
    // Cancel existing jobs
    for (const job of this.timeJobs.values()) {
      job.cancel();
    }
    this.timeJobs.clear();

    const rules = this.dataStore.getRules().filter(r => r.enabled);

    for (const rule of rules) {
      for (const condition of rule.conditions) {
        if (condition.type === 'time') {
          const [hours, minutes] = (condition.value as string).split(':').map(Number);
          
          const job = schedule.scheduleJob({
            hour: hours,
            minute: minutes,
          }, async () => {
            if (this.isRunning) {
              const conditionsMet = await this.evaluateConditions(rule.conditions);
              if (conditionsMet) {
                await this.triggerRule(rule);
              }
            }
          });

          if (job) {
            this.timeJobs.set(`${rule.id}-${condition.id}`, job);
          }
        }
      }
    }
  }
}
