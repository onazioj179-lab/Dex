// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Architecture Contract
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// Frozen schemas, version compatibility, migration support
// ===========================================================================

import log from 'electron-log';
import { app } from 'electron';
import Store from 'electron-store';

// ===========================================================================
// VERSION CONSTANTS
// ===========================================================================

export const SCHEMA_VERSION = 1;
export const MIN_SUPPORTED_VERSION = 1;
export const DATA_FORMAT_VERSION = 1;
export const ENCRYPTION_SCHEMA_VERSION = 1;
export const IPC_CONTRACT_VERSION = 1;

// ===========================================================================
// TYPES
// ===========================================================================

export interface SchemaDefinition {
  version: number;
  name: string;
  description: string;
  fields: SchemaField[];
  frozen: boolean;
  frozenAt?: string;
}

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  since: number;       // Version when field was added
  deprecated?: number; // Version when deprecated (if any)
}

export interface MigrationDefinition {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: (data: any) => any;
  reversible: boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  currentVersion: number;
  dataVersion: number;
  requiresMigration: boolean;
  migrationPath: number[];
  warnings: string[];
}

// ===========================================================================
// FROZEN SCHEMAS - These define the permanent data structure
// ===========================================================================

export const FROZEN_SCHEMAS: Record<string, SchemaDefinition> = {
  // Core Action schema
  action: {
    version: 1,
    name: 'DexAction',
    description: 'Automation action definition',
    frozen: true,
    frozenAt: '2024-01-15',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Unique identifier', since: 1 },
      { name: 'name', type: 'string', required: true, description: 'Display name', since: 1 },
      { name: 'type', type: 'ActionType', required: true, description: 'Action type', since: 1 },
      { name: 'target', type: 'string', required: true, description: 'Target path/url/command', since: 1 },
      { name: 'args', type: 'string[]', required: true, description: 'Arguments array', since: 1 },
      { name: 'icon', type: 'string', required: true, description: 'Icon identifier', since: 1 },
      { name: 'color', type: 'string', required: true, description: 'Color hex code', since: 1 },
      { name: 'enabled', type: 'boolean', required: true, description: 'Active state', since: 1 },
      { name: 'createdAt', type: 'number', required: true, description: 'Creation timestamp', since: 1 },
    ],
  },

  // Core Mode schema
  mode: {
    version: 1,
    name: 'DexMode',
    description: 'Environment mode definition',
    frozen: true,
    frozenAt: '2024-01-15',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Unique identifier', since: 1 },
      { name: 'name', type: 'string', required: true, description: 'Display name', since: 1 },
      { name: 'description', type: 'string', required: true, description: 'Description', since: 1 },
      { name: 'icon', type: 'string', required: true, description: 'Icon identifier', since: 1 },
      { name: 'color', type: 'string', required: true, description: 'Color hex code', since: 1 },
      { name: 'actions', type: 'string[]', required: true, description: 'Action IDs to execute', since: 1 },
      { name: 'enableRules', type: 'string[]', required: true, description: 'Rules to enable', since: 1 },
      { name: 'disableRules', type: 'string[]', required: true, description: 'Rules to disable', since: 1 },
      { name: 'schedule', type: 'ModeSchedule?', required: false, description: 'Optional schedule', since: 1 },
      { name: 'active', type: 'boolean', required: true, description: 'Current state', since: 1 },
      { name: 'createdAt', type: 'number', required: true, description: 'Creation timestamp', since: 1 },
    ],
  },

  // Core Rule schema
  rule: {
    version: 1,
    name: 'DexRule',
    description: 'Automation rule definition',
    frozen: true,
    frozenAt: '2024-01-15',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Unique identifier', since: 1 },
      { name: 'name', type: 'string', required: true, description: 'Display name', since: 1 },
      { name: 'description', type: 'string', required: true, description: 'Description', since: 1 },
      { name: 'enabled', type: 'boolean', required: true, description: 'Active state', since: 1 },
      { name: 'conditions', type: 'RuleCondition[]', required: true, description: 'Trigger conditions', since: 1 },
      { name: 'actions', type: 'string[]', required: true, description: 'Actions to execute', since: 1 },
      { name: 'cooldown', type: 'number', required: true, description: 'Cooldown in ms', since: 1 },
      { name: 'lastTriggered', type: 'number?', required: false, description: 'Last trigger time', since: 1 },
      { name: 'triggerCount', type: 'number', required: true, description: 'Total triggers', since: 1 },
      { name: 'createdAt', type: 'number', required: true, description: 'Creation timestamp', since: 1 },
    ],
  },

  // Encryption schema
  encryptedData: {
    version: 1,
    name: 'EncryptedData',
    description: 'Encrypted data envelope format',
    frozen: true,
    frozenAt: '2024-01-15',
    fields: [
      { name: 'v', type: 'number', required: true, description: 'Schema version', since: 1 },
      { name: 'alg', type: 'string', required: true, description: 'Algorithm identifier', since: 1 },
      { name: 'iv', type: 'string', required: true, description: 'Initialization vector (base64)', since: 1 },
      { name: 'tag', type: 'string', required: true, description: 'Auth tag (base64)', since: 1 },
      { name: 'ct', type: 'string', required: true, description: 'Ciphertext (base64)', since: 1 },
    ],
  },

  // Session schema
  session: {
    version: 1,
    name: 'DexSession',
    description: 'Work session definition',
    frozen: true,
    frozenAt: '2024-01-15',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Unique identifier', since: 1 },
      { name: 'name', type: 'string', required: true, description: 'Display name', since: 1 },
      { name: 'description', type: 'string', required: true, description: 'Description', since: 1 },
      { name: 'operations', type: 'string[]', required: true, description: 'Operation IDs', since: 1 },
      { name: 'targets', type: 'SessionTarget[]', required: true, description: 'Targets to open', since: 1 },
      { name: 'mode', type: 'string?', required: false, description: 'Associated mode', since: 1 },
      { name: 'icon', type: 'string', required: true, description: 'Icon identifier', since: 1 },
      { name: 'color', type: 'string', required: true, description: 'Color hex code', since: 1 },
      { name: 'lastUsed', type: 'number?', required: false, description: 'Last use timestamp', since: 1 },
      { name: 'useCount', type: 'number', required: true, description: 'Total uses', since: 1 },
      { name: 'createdAt', type: 'number', required: true, description: 'Creation timestamp', since: 1 },
    ],
  },
};

// ===========================================================================
// IPC CONTRACT - Frozen channel definitions
// ===========================================================================

export interface IPCContract {
  channel: string;
  direction: 'main-to-renderer' | 'renderer-to-main' | 'bidirectional';
  requestType?: string;
  responseType?: string;
  description: string;
  since: number;
  deprecated?: boolean;
}

export const IPC_CONTRACTS: IPCContract[] = [
  // Window controls
  { channel: 'window:minimize', direction: 'renderer-to-main', description: 'Minimize window', since: 1 },
  { channel: 'window:maximize', direction: 'renderer-to-main', description: 'Maximize/restore window', since: 1 },
  { channel: 'window:close', direction: 'renderer-to-main', description: 'Close to tray', since: 1 },

  // Actions
  { channel: 'actions:getAll', direction: 'renderer-to-main', responseType: 'DexAction[]', description: 'Get all actions', since: 1 },
  { channel: 'actions:create', direction: 'renderer-to-main', requestType: 'Partial<DexAction>', responseType: 'DexAction', description: 'Create action', since: 1 },
  { channel: 'actions:execute', direction: 'renderer-to-main', requestType: 'string', description: 'Execute action by ID', since: 1 },

  // Modes
  { channel: 'modes:getAll', direction: 'renderer-to-main', responseType: 'DexMode[]', description: 'Get all modes', since: 1 },
  { channel: 'modes:activate', direction: 'renderer-to-main', requestType: 'string', description: 'Activate mode by ID', since: 1 },

  // Rules
  { channel: 'rules:getAll', direction: 'renderer-to-main', responseType: 'DexRule[]', description: 'Get all rules', since: 1 },

  // Encryption
  { channel: 'encryption:getStatus', direction: 'renderer-to-main', responseType: 'EncryptionConfig', description: 'Get encryption status', since: 1 },
  { channel: 'encryption:enable', direction: 'renderer-to-main', requestType: 'EnableOptions', description: 'Enable encryption', since: 1 },

  // Trust & Transparency
  { channel: 'trust:getStatus', direction: 'renderer-to-main', responseType: 'TrustStatus', description: 'Get trust panel status', since: 1 },
];

// ===========================================================================
// MIGRATIONS
// ===========================================================================

const migrations: MigrationDefinition[] = [
  // Placeholder for future migrations
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   description: 'Add new field X to actions',
  //   reversible: true,
  //   migrate: (data) => {
  //     // Migration logic
  //     return data;
  //   },
  // },
];

// ===========================================================================
// VERSION STORE
// ===========================================================================

const versionStore = new Store<{
  schemaVersion: number;
  dataFormatVersion: number;
  lastMigration: number | null;
  migrationHistory: Array<{ from: number; to: number; timestamp: number }>;
}>({
  name: 'dex-versions',
  defaults: {
    schemaVersion: SCHEMA_VERSION,
    dataFormatVersion: DATA_FORMAT_VERSION,
    lastMigration: null,
    migrationHistory: [],
  },
});

// ===========================================================================
// ARCHITECTURE CONTRACT CLASS
// ===========================================================================

class ArchitectureContractClass {
  // -------------------------------------------------------------------------
  // VERSION CHECKING
  // -------------------------------------------------------------------------

  /**
   * Check data compatibility with current schema
   */
  checkCompatibility(dataVersion?: number): CompatibilityResult {
    const currentVersion = SCHEMA_VERSION;
    const version = dataVersion ?? versionStore.get('dataFormatVersion');

    const result: CompatibilityResult = {
      compatible: true,
      currentVersion,
      dataVersion: version,
      requiresMigration: false,
      migrationPath: [],
      warnings: [],
    };

    if (version < MIN_SUPPORTED_VERSION) {
      result.compatible = false;
      result.warnings.push(`Data version ${version} is no longer supported. Minimum: ${MIN_SUPPORTED_VERSION}`);
      return result;
    }

    if (version > currentVersion) {
      result.compatible = false;
      result.warnings.push(`Data was created with a newer version (${version}). Please update Dex.`);
      return result;
    }

    if (version < currentVersion) {
      result.requiresMigration = true;
      result.migrationPath = this.findMigrationPath(version, currentVersion);
      if (result.migrationPath.length === 0) {
        result.warnings.push('No migration path available');
      }
    }

    return result;
  }

  /**
   * Find migration path between versions
   */
  private findMigrationPath(from: number, to: number): number[] {
    const path: number[] = [from];
    let current = from;

    while (current < to) {
      const migration = migrations.find(m => m.fromVersion === current);
      if (!migration) break;
      current = migration.toVersion;
      path.push(current);
    }

    return path.length > 1 && path[path.length - 1] === to ? path : [];
  }

  // -------------------------------------------------------------------------
  // MIGRATION
  // -------------------------------------------------------------------------

  /**
   * Migrate data to current version
   */
  async migrateData(data: any, fromVersion: number): Promise<{ success: boolean; data: any; errors: string[] }> {
    const errors: string[] = [];
    let migratedData = JSON.parse(JSON.stringify(data)); // Deep clone
    let currentVersion = fromVersion;

    log.info(`[ArchitectureContract] Migrating data from v${fromVersion} to v${SCHEMA_VERSION}`);

    while (currentVersion < SCHEMA_VERSION) {
      const migration = migrations.find(m => m.fromVersion === currentVersion);
      if (!migration) {
        errors.push(`No migration from v${currentVersion}`);
        break;
      }

      try {
        migratedData = migration.migrate(migratedData);
        
        // Record migration
        const history = versionStore.get('migrationHistory');
        history.push({
          from: currentVersion,
          to: migration.toVersion,
          timestamp: Date.now(),
        });
        versionStore.set('migrationHistory', history);

        currentVersion = migration.toVersion;
        log.info(`[ArchitectureContract] Migrated to v${currentVersion}`);
      } catch (error) {
        errors.push(`Migration from v${currentVersion} failed: ${error}`);
        break;
      }
    }

    if (currentVersion === SCHEMA_VERSION) {
      versionStore.set('dataFormatVersion', SCHEMA_VERSION);
      versionStore.set('lastMigration', Date.now());
    }

    return {
      success: currentVersion === SCHEMA_VERSION,
      data: migratedData,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // SCHEMA VALIDATION
  // -------------------------------------------------------------------------

  /**
   * Validate data against a schema
   */
  validateAgainstSchema(schemaName: string, data: any): { valid: boolean; errors: string[] } {
    const schema = FROZEN_SCHEMAS[schemaName];
    if (!schema) {
      return { valid: false, errors: [`Unknown schema: ${schemaName}`] };
    }

    const errors: string[] = [];

    for (const field of schema.fields) {
      if (field.required && !(field.name in data)) {
        errors.push(`Missing required field: ${field.name}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  /**
   * Get all frozen schemas
   */
  getSchemas(): Record<string, SchemaDefinition> {
    return FROZEN_SCHEMAS;
  }

  /**
   * Get IPC contracts
   */
  getIPCContracts(): IPCContract[] {
    return IPC_CONTRACTS;
  }

  /**
   * Get current version info
   */
  getVersionInfo(): {
    appVersion: string;
    schemaVersion: number;
    dataFormatVersion: number;
    encryptionSchemaVersion: number;
    ipcContractVersion: number;
    lastMigration: number | null;
  } {
    return {
      appVersion: app.getVersion(),
      schemaVersion: SCHEMA_VERSION,
      dataFormatVersion: versionStore.get('dataFormatVersion'),
      encryptionSchemaVersion: ENCRYPTION_SCHEMA_VERSION,
      ipcContractVersion: IPC_CONTRACT_VERSION,
      lastMigration: versionStore.get('lastMigration'),
    };
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): Array<{ from: number; to: number; timestamp: number }> {
    return versionStore.get('migrationHistory');
  }
}

// Export singleton instance
export const architectureContract = new ArchitectureContractClass();
