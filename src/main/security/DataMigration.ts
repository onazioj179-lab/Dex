// ═══════════════════════════════════════════════════════════════════════════
// DEX - Data Migration Framework
// Schema versioning and data migrations
// ═══════════════════════════════════════════════════════════════════════════

import { app } from 'electron';
import * as fs from 'fs';
import * as log from 'electron-log';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MigrationMeta {
  version: number;
  appliedAt: number;
  name: string;
  checksum?: string;
}

interface MigrationFn {
  version: number;
  name: string;
  up: (data: any) => Promise<any>;
  down?: (data: any) => Promise<any>;
}

interface MigrationState {
  currentVersion: number;
  migrations: MigrationMeta[];
  lastMigrationAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration Manager
// ─────────────────────────────────────────────────────────────────────────────

export class DataMigrationManager {
  private migrations: MigrationFn[] = [];
  private statePath: string;
  private state: MigrationState;
  
  // Current schema version - increment when schema changes
  static readonly CURRENT_VERSION = 1;
  
  constructor() {
    this.statePath = path.join(app.getPath('userData'), 'migration-state.json');
    this.state = this.loadState();
    this.registerMigrations();
  }
  
  private loadState(): MigrationState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      log.error('[Migration] Failed to load state:', err);
    }
    
    return {
      currentVersion: 0,
      migrations: [],
      lastMigrationAt: 0,
    };
  }
  
  private saveState(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      log.error('[Migration] Failed to save state:', err);
    }
  }
  
  // Register all migrations
  private registerMigrations(): void {
    // Migration 1: Initial schema normalization
    this.register({
      version: 1,
      name: 'initial_schema_normalization',
      up: async (data: any) => {
        // Ensure all required fields exist with defaults
        const migrated = { ...data };
        
        // Normalize actions
        if (migrated.actions) {
          migrated.actions = migrated.actions.map((action: any) => ({
            id: action.id || `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: action.name || 'Unnamed Action',
            type: action.type || 'open-app',
            target: action.target || '',
            args: action.args || [],
            icon: action.icon || 'zap',
            color: action.color || '#6366f1',
            enabled: action.enabled !== false,
            createdAt: action.createdAt || Date.now(),
            ...action,
          }));
        }
        
        // Normalize workflows
        if (migrated.workflows) {
          migrated.workflows = migrated.workflows.map((workflow: any) => ({
            id: workflow.id || `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: workflow.name || 'Unnamed Workflow',
            steps: workflow.steps || [],
            isEnabled: workflow.isEnabled !== false,
            createdAt: workflow.createdAt || Date.now(),
            updatedAt: workflow.updatedAt || Date.now(),
            ...workflow,
          }));
        }
        
        // Normalize automations
        if (migrated.automations) {
          migrated.automations = migrated.automations.map((automation: any) => ({
            id: automation.id || `automation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: automation.name || 'Unnamed Automation',
            blocks: automation.blocks || [],
            isEnabled: automation.isEnabled !== false,
            isRunning: false,
            createdAt: automation.createdAt || Date.now(),
            updatedAt: automation.updatedAt || Date.now(),
            ...automation,
          }));
        }
        
        // Ensure settings exist
        if (!migrated.settings) {
          migrated.settings = {
            startOnBoot: false,
            minimizeToTray: true,
            theme: 'dark',
          };
        }
        
        // Ensure permissions exist
        if (!migrated.permissions) {
          migrated.permissions = {
            openApps: true,
            closeApps: false,
            runCommands: false,
            adjustVolume: true,
            fileSystem: false,
            network: false,
          };
        }
        
        // Add schema version
        migrated._schemaVersion = 1;
        
        return migrated;
      },
      down: async (data: any) => {
        // Remove schema version for downgrade
        const { _schemaVersion, ...rest } = data;
        return rest;
      },
    });
    
    // Future migrations would be added here:
    // this.register({ version: 2, name: 'add_new_feature', up: async (data) => { ... } });
  }
  
  // Register a migration
  register(migration: MigrationFn): void {
    // Keep migrations sorted by version
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }
  
  // Get pending migrations
  getPendingMigrations(): MigrationFn[] {
    return this.migrations.filter(m => m.version > this.state.currentVersion);
  }
  
  // Check if migrations are needed
  needsMigration(): boolean {
    return this.state.currentVersion < DataMigrationManager.CURRENT_VERSION;
  }
  
  // Run all pending migrations
  async migrate(data: any): Promise<{ data: any; applied: string[] }> {
    const pending = this.getPendingMigrations();
    const applied: string[] = [];
    let currentData = { ...data };
    
    log.info(`[Migration] Starting migration from v${this.state.currentVersion} to v${DataMigrationManager.CURRENT_VERSION}`);
    log.info(`[Migration] ${pending.length} migrations pending`);
    
    for (const migration of pending) {
      try {
        log.info(`[Migration] Applying: ${migration.name} (v${migration.version})`);
        
        // Create backup before migration
        const backup = JSON.stringify(currentData);
        
        // Apply migration
        currentData = await migration.up(currentData);
        
        // Record migration
        this.state.migrations.push({
          version: migration.version,
          name: migration.name,
          appliedAt: Date.now(),
          checksum: this.calculateChecksum(backup),
        });
        
        this.state.currentVersion = migration.version;
        this.state.lastMigrationAt = Date.now();
        
        applied.push(migration.name);
        
        log.info(`[Migration] Successfully applied: ${migration.name}`);
      } catch (err) {
        log.error(`[Migration] Failed to apply ${migration.name}:`, err);
        throw new Error(`Migration failed: ${migration.name} - ${err}`);
      }
    }
    
    // Save migration state
    this.saveState();
    
    return { data: currentData, applied };
  }
  
  // Rollback to a specific version
  async rollback(targetVersion: number, data: any): Promise<any> {
    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= this.state.currentVersion)
      .sort((a, b) => b.version - a.version); // Reverse order for rollback
    
    let currentData = { ...data };
    
    for (const migration of migrationsToRollback) {
      if (!migration.down) {
        throw new Error(`Migration ${migration.name} does not support rollback`);
      }
      
      log.info(`[Migration] Rolling back: ${migration.name}`);
      currentData = await migration.down(currentData);
      
      // Remove from applied migrations
      this.state.migrations = this.state.migrations.filter(m => m.version !== migration.version);
    }
    
    this.state.currentVersion = targetVersion;
    this.saveState();
    
    return currentData;
  }
  
  // Calculate checksum for backup verification
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  // Get migration status
  getStatus(): {
    currentVersion: number;
    targetVersion: number;
    needsMigration: boolean;
    appliedMigrations: MigrationMeta[];
    pendingMigrations: string[];
  } {
    return {
      currentVersion: this.state.currentVersion,
      targetVersion: DataMigrationManager.CURRENT_VERSION,
      needsMigration: this.needsMigration(),
      appliedMigrations: this.state.migrations,
      pendingMigrations: this.getPendingMigrations().map(m => m.name),
    };
  }
  
  // Validate data integrity
  validateData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check schema version
    if (data._schemaVersion !== DataMigrationManager.CURRENT_VERSION) {
      errors.push(`Schema version mismatch: expected ${DataMigrationManager.CURRENT_VERSION}, got ${data._schemaVersion}`);
    }
    
    // Validate actions
    if (data.actions) {
      for (const action of data.actions) {
        if (!action.id) errors.push('Action missing id');
        if (!action.name) errors.push(`Action ${action.id} missing name`);
        if (!action.type) errors.push(`Action ${action.id} missing type`);
      }
    }
    
    // Validate workflows
    if (data.workflows) {
      for (const workflow of data.workflows) {
        if (!workflow.id) errors.push('Workflow missing id');
        if (!workflow.name) errors.push(`Workflow ${workflow.id} missing name`);
        if (!Array.isArray(workflow.steps)) errors.push(`Workflow ${workflow.id} missing steps array`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Singleton instance
export const dataMigrationManager = new DataMigrationManager();

