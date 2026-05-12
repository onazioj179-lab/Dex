// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Feature Flags & Maintenance Controller
// Phase 11: Feature flags, stable internal APIs, backward-compatible storage
// ===========================================================================

import { ipcMain, app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

// ===========================================================================
// FEATURE FLAGS DEFINITION
// ===========================================================================

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultValue: boolean;
  stable: boolean; // If false, feature is experimental
  minVersion?: string; // Minimum app version required
  deprecated?: boolean;
  deprecatedMessage?: string;
}

const DEFAULT_FEATURES: FeatureFlag[] = [
  // Core Features (Stable)
  {
    id: 'power_management',
    name: 'Power Management',
    description: 'CPU/memory optimization and power profiles',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'notes',
    name: 'Quick Notes',
    description: 'Create and manage notes',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'tasks',
    name: 'Task Management',
    description: 'Task lists and to-dos',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'workflows',
    name: 'Automation Workflows',
    description: 'Create automated workflows',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'operations',
    name: 'Quick Operations',
    description: 'One-click system operations',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'rules',
    name: 'Automation Rules',
    description: 'Event-triggered automation rules',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'timers',
    name: 'Timers & Reminders',
    description: 'Set timers and reminders',
    enabled: true,
    defaultValue: true,
    stable: true
  },

  // Advanced Features
  {
    id: 'voice_control',
    name: 'Voice Control',
    description: 'Voice commands and recording',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'media_capture',
    name: 'Media Capture',
    description: 'Screenshots and screen recording',
    enabled: true,
    defaultValue: true,
    stable: true
  },
  {
    id: 'learning_mode',
    name: 'Learning Mode',
    description: 'Learn from user actions',
    enabled: true,
    defaultValue: true,
    stable: true
  },

  // Expert Features
  {
    id: 'expert_mode',
    name: 'Expert Mode',
    description: 'Advanced system control options',
    enabled: false,
    defaultValue: false,
    stable: true
  },
  {
    id: 'system_integrity',
    name: 'System Integrity Panel',
    description: 'Monitor system health and processes',
    enabled: true,
    defaultValue: true,
    stable: true
  },

  // Experimental Features
  {
    id: 'ai_suggestions',
    name: 'AI Suggestions',
    description: 'AI-powered action suggestions',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '1.1.0'
  },
  {
    id: 'cloud_sync',
    name: 'Cloud Sync',
    description: 'Sync data across devices',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '2.0.0'
  },
  {
    id: 'plugin_system',
    name: 'Plugin System',
    description: 'Load third-party plugins',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '2.0.0'
  },

  // ===========================================================================
  // Roadmap flags (DEX_OS_PRODUCTION_ROADMAP.md). Off by default; flipped on
  // as each phase graduates. Keeping them declared lets phase work land behind
  // a stable id without coordinating two PRs.
  // ===========================================================================
  {
    id: 'uki_native_store',
    name: 'UKI Native Store (SQLite + FTS5)',
    description: 'Cold-tier UKI storage backed by the Rust native module.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.5.0'
  },
  {
    id: 'uki_semantic_search',
    name: 'UKI Semantic Search',
    description: 'On-device embeddings + vector recall for UKI queries.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.6.0'
  },
  {
    id: 'service_host',
    name: 'Service Host Lifecycle',
    description: 'Unified lifecycle for new backend services (start/stop/health).',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.4.1'
  },
  {
    id: 'snap_layouts_v2',
    name: 'Snap Layouts V2',
    description: 'Hover-based snap zone selector inspired by Windows 11.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.7.0'
  },
  {
    id: 'tiling_mode',
    name: 'Tiling Window Mode',
    description: 'i3-style keyboard-first tiling layout.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.7.0'
  },
  {
    id: 'dexctl_cli',
    name: 'dexctl CLI Bridge',
    description: 'Local CLI for scripting DEX from a terminal.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.7.0'
  },
  {
    id: 'cross_app_refs',
    name: 'Cross-App References',
    description: 'application/x-dex-ref MIME for cross-app drag/drop and pasting.',
    enabled: false,
    defaultValue: false,
    stable: false,
    minVersion: '4.6.0'
  }
];

// ===========================================================================
// MAINTENANCE MODE
// ===========================================================================

interface MaintenanceState {
  enabled: boolean;
  reason?: string;
  startedAt?: string;
  scheduledEnd?: string;
  disabledFeatures: string[];
}

// ===========================================================================
// API VERSIONING
// ===========================================================================

interface ApiVersion {
  version: string;
  introduced: string;
  deprecated?: string;
  removed?: string;
  changes: string[];
}

const API_VERSIONS: ApiVersion[] = [
  {
    version: '1.0.0',
    introduced: '2024-01-01',
    changes: [
      'Initial API release',
      'Core IPC handlers for notes, tasks, workflows',
      'Power management API',
      'Data export/import API'
    ]
  },
  {
    version: '1.1.0',
    introduced: '2024-06-01',
    changes: [
      'Added feature flags API',
      'Added diagnostics API',
      'Added security audit API',
      'Added update management API',
      'Folder-based export/import'
    ]
  }
];

// ===========================================================================
// STORAGE MIGRATION
// ===========================================================================

interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  migrate: (data: any) => any;
}

const MIGRATIONS: MigrationStep[] = [
  {
    fromVersion: '0.9.0',
    toVersion: '1.0.0',
    migrate: (data) => {
      // Example migration: rename 'items' to 'notes'
      if (data.items && !data.notes) {
        data.notes = data.items;
        delete data.items;
      }
      return data;
    }
  }
];

// ===========================================================================
// CONTROLLER
// ===========================================================================

const store = new Store<{
  featureFlags: Record<string, boolean>;
  maintenance: MaintenanceState;
  apiVersion: string;
  lastMigration: string;
}>({
  defaults: {
    featureFlags: {},
    maintenance: {
      enabled: false,
      disabledFeatures: []
    },
    apiVersion: '1.1.0',
    lastMigration: '1.0.0'
  }
});

class FeatureFlagsController {
  private features: Map<string, FeatureFlag>;
  private maintenanceState: MaintenanceState;

  constructor() {
    this.features = new Map();
    this.initializeFeatures();
    this.maintenanceState = store.get('maintenance');
    this.registerHandlers();
    this.runMigrations();
  }

  private initializeFeatures(): void {
    const savedFlags = store.get('featureFlags');
    
    for (const feature of DEFAULT_FEATURES) {
      const saved = savedFlags[feature.id];
      this.features.set(feature.id, {
        ...feature,
        enabled: saved !== undefined ? saved : feature.defaultValue
      });
    }
  }

  private registerHandlers(): void {
    // Get all feature flags
    ipcMain.handle('features:getAll', () => {
      return Array.from(this.features.values());
    });

    // Get specific feature flag
    ipcMain.handle('features:get', (_, id: string) => {
      return this.features.get(id);
    });

    // Check if feature is enabled
    ipcMain.handle('features:isEnabled', (_, id: string) => {
      return this.isEnabled(id);
    });

    // Toggle feature flag
    ipcMain.handle('features:toggle', (_, id: string, enabled: boolean) => {
      return this.toggleFeature(id, enabled);
    });

    // Reset all features to defaults
    ipcMain.handle('features:resetAll', () => {
      return this.resetAllFeatures();
    });

    // Get maintenance state
    ipcMain.handle('maintenance:getState', () => {
      return this.maintenanceState;
    });

    // Enable maintenance mode
    ipcMain.handle('maintenance:enable', (_, reason?: string, scheduledEnd?: string) => {
      return this.enableMaintenance(reason, scheduledEnd);
    });

    // Disable maintenance mode
    ipcMain.handle('maintenance:disable', () => {
      return this.disableMaintenance();
    });

    // Get API versions
    ipcMain.handle('api:getVersions', () => {
      return API_VERSIONS;
    });

    // Get current API version
    ipcMain.handle('api:getCurrentVersion', () => {
      return store.get('apiVersion');
    });

    // Get stable features only
    ipcMain.handle('features:getStable', () => {
      return Array.from(this.features.values()).filter(f => f.stable);
    });

    // Get experimental features
    ipcMain.handle('features:getExperimental', () => {
      return Array.from(this.features.values()).filter(f => !f.stable);
    });
  }

  // ===========================================================================
  // FEATURE FLAG METHODS
  // ===========================================================================

  isEnabled(id: string): boolean {
    // Check maintenance mode first
    if (this.maintenanceState.enabled) {
      if (this.maintenanceState.disabledFeatures.includes(id)) {
        return false;
      }
    }

    const feature = this.features.get(id);
    if (!feature) return false;

    // Check version requirement
    if (feature.minVersion) {
      const current = app.getVersion();
      if (this.compareVersions(current, feature.minVersion) < 0) {
        return false;
      }
    }

    return feature.enabled;
  }

  toggleFeature(id: string, enabled: boolean): { success: boolean; error?: string } {
    const feature = this.features.get(id);
    if (!feature) {
      return { success: false, error: 'Feature not found' };
    }

    if (feature.deprecated) {
      log.warn(`Toggling deprecated feature: ${id}`);
    }

    // Check version requirement for enabling
    if (enabled && feature.minVersion) {
      const current = app.getVersion();
      if (this.compareVersions(current, feature.minVersion) < 0) {
        return { 
          success: false, 
          error: `This feature requires version ${feature.minVersion} or higher` 
        };
      }
    }

    feature.enabled = enabled;
    this.features.set(id, feature);
    
    // Persist
    const flags = store.get('featureFlags');
    flags[id] = enabled;
    store.set('featureFlags', flags);

    log.info(`Feature ${id} ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  }

  resetAllFeatures(): { success: boolean } {
    for (const feature of DEFAULT_FEATURES) {
      this.features.set(feature.id, { ...feature });
    }
    
    store.set('featureFlags', {});
    log.info('All features reset to defaults');
    return { success: true };
  }

  // ===========================================================================
  // MAINTENANCE MODE METHODS
  // ===========================================================================

  enableMaintenance(reason?: string, scheduledEnd?: string): { success: boolean } {
    this.maintenanceState = {
      enabled: true,
      reason,
      startedAt: new Date().toISOString(),
      scheduledEnd,
      disabledFeatures: []
    };
    
    store.set('maintenance', this.maintenanceState);
    log.info('Maintenance mode enabled', { reason });
    return { success: true };
  }

  disableMaintenance(): { success: boolean } {
    this.maintenanceState = {
      enabled: false,
      disabledFeatures: []
    };
    
    store.set('maintenance', this.maintenanceState);
    log.info('Maintenance mode disabled');
    return { success: true };
  }

  isMaintenanceMode(): boolean {
    return this.maintenanceState.enabled;
  }

  // ===========================================================================
  // MIGRATION METHODS
  // ===========================================================================

  private runMigrations(): void {
    const lastMigration = store.get('lastMigration');
    const currentVersion = app.getVersion();

    for (const migration of MIGRATIONS) {
      if (
        this.compareVersions(lastMigration, migration.fromVersion) <= 0 &&
        this.compareVersions(currentVersion, migration.toVersion) >= 0
      ) {
        log.info(`Running migration from ${migration.fromVersion} to ${migration.toVersion}`);
        
        try {
          // Get all data, migrate, and save
          const allData = store.store;
          const migratedData = migration.migrate(allData);
          
          // Save migrated data
          for (const [key, value] of Object.entries(migratedData)) {
            store.set(key as any, value);
          }
          
          store.set('lastMigration', migration.toVersion);
          log.info(`Migration to ${migration.toVersion} complete`);
        } catch (error) {
          log.error(`Migration failed:`, error);
        }
      }
    }
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  getFeatureState(id: string): FeatureFlag | undefined {
    return this.features.get(id);
  }

  getAllFeatures(): FeatureFlag[] {
    return Array.from(this.features.values());
  }

  getMaintenanceState(): MaintenanceState {
    return this.maintenanceState;
  }
}

export const featureFlagsController = new FeatureFlagsController();

// Export helper function for checking features throughout the app
export function isFeatureEnabled(id: string): boolean {
  return featureFlagsController.isEnabled(id);
}
