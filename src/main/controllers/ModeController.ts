// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Mode Controller
// Manages mode activation/deactivation and associated actions
// ===========================================================================

import * as schedule from 'node-schedule';
import { DexMode, DexAction } from '../../shared/types';
import { DataStore } from '../store/DataStore';
import { ActionController } from './ActionController';
import { Logger } from '../utils/Logger';

export class ModeController {
  private dataStore: DataStore;
  private actionController: ActionController;
  private logger: Logger;
  private scheduledJobs: Map<string, schedule.Job> = new Map();
  private activeMode: DexMode | null = null;

  constructor(dataStore: DataStore, actionController: ActionController, logger: Logger) {
    this.dataStore = dataStore;
    this.actionController = actionController;
    this.logger = logger;
    this.initializeSchedules();
  }

  async getActiveMode(): Promise<DexMode | null> {
    return this.activeMode;
  }

  async activateMode(modeId: string): Promise<void> {
    const modes = this.dataStore.getModes();
    const mode = modes.find(m => m.id === modeId);
    
    if (!mode) {
      this.logger.error(`Mode not found: ${modeId}`);
      throw new Error('Mode not found');
    }

    // Deactivate current mode first
    if (this.activeMode) {
      await this.deactivateMode();
    }

    this.logger.info(`Activating mode: ${mode.name}`);

    // Execute mode actions
    const actions = this.dataStore.getActions();
    for (const actionId of mode.actions) {
      const action = actions.find(a => a.id === actionId);
      if (action && action.enabled) {
        try {
          await this.actionController.execute(action);
        } catch (error: any) {
          this.logger.error(`Failed to execute action ${action.name} for mode ${mode.name}`, error);
        }
      }
    }

    // Enable/disable rules based on mode
    for (const ruleId of mode.enableRules) {
      await this.dataStore.toggleRule(ruleId, true);
    }
    for (const ruleId of mode.disableRules) {
      await this.dataStore.toggleRule(ruleId, false);
    }

    // Update mode status
    this.activeMode = mode;
    await this.dataStore.setActiveMode(modeId);

    this.logger.success(`Mode activated: ${mode.name}`);
  }

  async deactivateMode(): Promise<void> {
    if (!this.activeMode) {
      return;
    }

    this.logger.info(`Deactivating mode: ${this.activeMode.name}`);

    // Re-enable rules that were disabled
    for (const ruleId of this.activeMode.disableRules) {
      await this.dataStore.toggleRule(ruleId, true);
    }

    this.activeMode = null;
    await this.dataStore.setActiveMode(null);

    this.logger.success('Mode deactivated');
  }

  private initializeSchedules(): void {
    const modes = this.dataStore.getModes();

    for (const mode of modes) {
      if (mode.schedule?.enabled) {
        this.scheduleMode(mode);
      }
    }
  }

  private scheduleMode(mode: DexMode): void {
    if (!mode.schedule || !mode.schedule.enabled) {
      return;
    }

    const { startTime, endTime, days } = mode.schedule;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    // Schedule activation
    const startJobId = `${mode.id}-start`;
    const startJob = schedule.scheduleJob({
      hour: startHour,
      minute: startMinute,
      dayOfWeek: days,
    }, async () => {
      this.logger.info(`Scheduled activation of mode: ${mode.name}`);
      await this.activateMode(mode.id);
    });

    if (startJob) {
      this.scheduledJobs.set(startJobId, startJob);
    }

    // Schedule deactivation
    const endJobId = `${mode.id}-end`;
    const endJob = schedule.scheduleJob({
      hour: endHour,
      minute: endMinute,
      dayOfWeek: days,
    }, async () => {
      if (this.activeMode?.id === mode.id) {
        this.logger.info(`Scheduled deactivation of mode: ${mode.name}`);
        await this.deactivateMode();
      }
    });

    if (endJob) {
      this.scheduledJobs.set(endJobId, endJob);
    }

    this.logger.info(`Scheduled mode: ${mode.name} (${startTime} - ${endTime})`);
  }

  reloadSchedules(): void {
    // Cancel all existing jobs
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();

    // Reinitialize
    this.initializeSchedules();
  }

  cancelAllSchedules(): void {
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();
  }
}
