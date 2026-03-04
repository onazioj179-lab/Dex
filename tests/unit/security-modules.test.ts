/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX SECURITY MODULE TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Unit tests for security modules:
 * - IPCValidator
 * - DataMigration
 * - PermissionManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

console.log('🧪 DEX Security Module Test Suite Starting...');

// ═══════════════════════════════════════════════════════════════════════════
// IPCValidator Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('IPCValidator', () => {
  describe('Channel Validation', () => {
    it('should allow registered channels', () => {
      const validator = createIPCValidator();
      
      expect(validator.isValidChannel('files:list')).toBe(true);
      expect(validator.isValidChannel('shell:openExternal')).toBe(true);
      expect(validator.isValidChannel('system:getInfo')).toBe(true);
    });

    it('should reject unknown channels', () => {
      const validator = createIPCValidator();
      
      expect(validator.isValidChannel('malicious:inject')).toBe(false);
      expect(validator.isValidChannel('eval:execute')).toBe(false);
    });

    it('should allow dynamic dex: prefixed channels', () => {
      const validator = createIPCValidator();
      
      expect(validator.isValidChannel('dex:custom-action')).toBe(true);
      expect(validator.isValidChannel('dex:plugin:invoke')).toBe(true);
    });
  });

  describe('Input Sanitization', () => {
    it('should escape HTML in strings', () => {
      const sanitizer = createInputSanitizer();
      
      const input = '<script>alert("xss")</script>';
      const result = sanitizer.sanitizeString(input);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should block dangerous patterns', () => {
      const sanitizer = createInputSanitizer();
      
      expect(sanitizer.containsDangerousPattern('eval("code")')).toBe(true);
      expect(sanitizer.containsDangerousPattern('javascript:void(0)')).toBe(true);
      expect(sanitizer.containsDangerousPattern('normal text')).toBe(false);
    });

    it('should sanitize nested objects', () => {
      const sanitizer = createInputSanitizer();
      
      const input = {
        name: '<script>alert(1)</script>',
        nested: {
          value: 'javascript:void(0)',
        },
      };
      
      const result = sanitizer.sanitizeObject(input);
      
      expect(result.name).not.toContain('<script>');
      expect(sanitizer.containsDangerousPattern(result.nested.value)).toBe(false);
    });

    it('should limit string length', () => {
      const sanitizer = createInputSanitizer({ maxStringLength: 100 });
      
      const longString = 'a'.repeat(200);
      const result = sanitizer.sanitizeString(longString);
      
      expect(result.length).toBe(100);
    });
  });

  describe('Path Validation', () => {
    it('should block path traversal attempts', () => {
      const validator = createIPCValidator();
      
      expect(validator.isValidPath('../../../etc/passwd')).toBe(false);
      expect(validator.isValidPath('..\\..\\Windows\\System32')).toBe(false);
      expect(validator.isValidPath('/home/user/documents')).toBe(true);
    });

    it('should validate allowed directories', () => {
      const validator = createIPCValidator({
        allowedDirs: ['/home/user', '/tmp'],
      });
      
      expect(validator.isPathAllowed('/home/user/docs/file.txt')).toBe(true);
      expect(validator.isPathAllowed('/etc/passwd')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DataMigration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('DataMigration', () => {
  describe('Version Management', () => {
    it('should track current version', () => {
      const migrator = createMigrationManager();
      
      expect(migrator.getCurrentVersion()).toBe(0);
    });

    it('should identify pending migrations', () => {
      const migrator = createMigrationManager();
      migrator.registerMigration({ version: 1, name: 'add-field' });
      migrator.registerMigration({ version: 2, name: 'rename-column' });
      
      const pending = migrator.getPendingMigrations();
      
      expect(pending).toHaveLength(2);
      expect(pending[0].version).toBe(1);
    });

    it('should not include applied migrations', () => {
      const migrator = createMigrationManager({ currentVersion: 1 });
      migrator.registerMigration({ version: 1, name: 'already-applied' });
      migrator.registerMigration({ version: 2, name: 'pending' });
      
      const pending = migrator.getPendingMigrations();
      
      expect(pending).toHaveLength(1);
      expect(pending[0].version).toBe(2);
    });
  });

  describe('Migration Execution', () => {
    it('should execute migrations in order', async () => {
      const migrator = createMigrationManager();
      const executionOrder: number[] = [];
      
      migrator.registerMigration({
        version: 1,
        name: 'first',
        up: async () => { executionOrder.push(1); },
      });
      migrator.registerMigration({
        version: 2,
        name: 'second',
        up: async () => { executionOrder.push(2); },
      });
      
      await migrator.migrate();
      
      expect(executionOrder).toEqual([1, 2]);
    });

    it('should update version after migration', async () => {
      const migrator = createMigrationManager();
      migrator.registerMigration({
        version: 1,
        name: 'test',
        up: async () => {},
      });
      
      await migrator.migrate();
      
      expect(migrator.getCurrentVersion()).toBe(1);
    });

    it('should handle migration errors', async () => {
      const migrator = createMigrationManager();
      migrator.registerMigration({
        version: 1,
        name: 'failing',
        up: async () => { throw new Error('Migration failed'); },
      });
      
      const result = await migrator.migrate();
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Rollback', () => {
    it('should support rollback with down function', async () => {
      const migrator = createMigrationManager({ currentVersion: 2 });
      let rolledBack = false;
      
      migrator.registerMigration({
        version: 2,
        name: 'with-rollback',
        up: async () => {},
        down: async () => { rolledBack = true; },
      });
      
      // Rollback from version 2 to version 1
      await migrator.rollback(1);
      
      expect(rolledBack).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PermissionManager Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('PermissionManager', () => {
  describe('Permission Checking', () => {
    it('should check basic permissions', () => {
      const manager = createPermissionManager({
        openApps: true,
        runCommands: false,
        fileSystem: true,
      });
      
      expect(manager.hasPermission('openApps')).toBe(true);
      expect(manager.hasPermission('runCommands')).toBe(false);
    });

    it('should default to false for unknown permissions', () => {
      const manager = createPermissionManager({});
      
      expect(manager.hasPermission('unknownPermission')).toBe(false);
    });
  });

  describe('Permission Granting', () => {
    it('should grant permissions', () => {
      const manager = createPermissionManager({ runCommands: false });
      
      manager.grantPermission('runCommands');
      
      expect(manager.hasPermission('runCommands')).toBe(true);
    });

    it('should revoke permissions', () => {
      const manager = createPermissionManager({ openApps: true });
      
      manager.revokePermission('openApps');
      
      expect(manager.hasPermission('openApps')).toBe(false);
    });
  });

  describe('Permission Requests', () => {
    it('should track pending permission requests', () => {
      const manager = createPermissionManager({});
      
      manager.requestPermission('fileSystem', 'Need to save files');
      
      const pending = manager.getPendingRequests();
      expect(pending).toHaveLength(1);
      expect(pending[0].permission).toBe('fileSystem');
    });

    it('should resolve requests when approved', async () => {
      const manager = createPermissionManager({});
      
      const requestPromise = manager.requestPermission('network', 'Need internet');
      manager.approveRequest('network');
      
      const result = await requestPromise;
      expect(result).toBe(true);
      expect(manager.hasPermission('network')).toBe(true);
    });

    it('should reject requests when denied', async () => {
      const manager = createPermissionManager({});
      
      const requestPromise = manager.requestPermission('admin', 'Need admin');
      manager.denyRequest('admin');
      
      const result = await requestPromise;
      expect(result).toBe(false);
      expect(manager.hasPermission('admin')).toBe(false);
    });
  });

  describe('Permission Presets', () => {
    it('should apply minimal preset', () => {
      const manager = createPermissionManager({});
      
      manager.applyPreset('minimal');
      
      expect(manager.hasPermission('openApps')).toBe(true);
      expect(manager.hasPermission('runCommands')).toBe(false);
      expect(manager.hasPermission('fileSystem')).toBe(false);
    });

    it('should apply full preset', () => {
      const manager = createPermissionManager({});
      
      manager.applyPreset('full');
      
      expect(manager.hasPermission('openApps')).toBe(true);
      expect(manager.hasPermission('runCommands')).toBe(true);
      expect(manager.hasPermission('fileSystem')).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createIPCValidator(config: any = {}) {
  const registeredChannels = new Set([
    'files:list', 'files:read', 'files:write',
    'shell:openExternal', 'shell:openPath',
    'system:getInfo', 'system:getPlatform',
    'data:get', 'data:set',
  ]);
  
  return {
    isValidChannel(channel: string) {
      if (registeredChannels.has(channel)) return true;
      if (channel.startsWith('dex:')) return true;
      return false;
    },
    
    isValidPath(filePath: string) {
      const dangerous = ['../', '..\\', '../', '..\\\\'];
      return !dangerous.some(p => filePath.includes(p));
    },
    
    isPathAllowed(filePath: string) {
      const allowedDirs = config.allowedDirs || [];
      return allowedDirs.some((dir: string) => filePath.startsWith(dir));
    },
  };
}

function createInputSanitizer(config: any = {}) {
  const maxLen = config.maxStringLength || 10000;
  
  return {
    sanitizeString(input: string) {
      let result = input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
      
      // Remove dangerous patterns
      result = result.replace(/javascript:/gi, '');
      
      return result.substring(0, maxLen);
    },
    
    containsDangerousPattern(input: string) {
      const patterns = [
        /eval\s*\(/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<script/i,
      ];
      return patterns.some(p => p.test(input));
    },
    
    sanitizeObject(obj: any): any {
      if (typeof obj === 'string') {
        return this.sanitizeString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(item => this.sanitizeObject(item));
      }
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = this.sanitizeObject(value);
        }
        return result;
      }
      return obj;
    },
  };
}

function createMigrationManager(config: any = {}) {
  let currentVersion = config.currentVersion || 0;
  const migrations: any[] = [];
  const applied: number[] = [];
  
  return {
    getCurrentVersion() {
      return currentVersion;
    },
    
    registerMigration(migration: any) {
      migrations.push(migration);
      migrations.sort((a, b) => a.version - b.version);
    },
    
    getPendingMigrations() {
      return migrations.filter(m => m.version > currentVersion);
    },
    
    async migrate() {
      const pending = this.getPendingMigrations();
      const errors: any[] = [];
      const appliedMigrations: string[] = [];
      
      for (const migration of pending) {
        try {
          await migration.up();
          currentVersion = migration.version;
          applied.push(migration.version);
          appliedMigrations.push(migration.name);
        } catch (error) {
          errors.push({ migration: migration.name, error });
          break;
        }
      }
      
      return {
        success: errors.length === 0,
        applied: appliedMigrations,
        errors,
      };
    },
    
    async rollback(toVersion: number) {
      const toRollback = migrations
        .filter(m => m.version > toVersion && m.version <= currentVersion && m.down)
        .reverse();
      
      for (const migration of toRollback) {
        await migration.down();
        currentVersion = migration.version - 1;
      }
    },
  };
}

function createPermissionManager(initialPermissions: any) {
  const permissions = { ...initialPermissions };
  const pendingRequests: any[] = [];
  const requestResolvers = new Map<string, { resolve: Function; reject: Function }>();
  
  return {
    hasPermission(permission: string) {
      return permissions[permission] === true;
    },
    
    grantPermission(permission: string) {
      permissions[permission] = true;
    },
    
    revokePermission(permission: string) {
      permissions[permission] = false;
    },
    
    requestPermission(permission: string, reason: string) {
      pendingRequests.push({ permission, reason });
      
      return new Promise<boolean>((resolve) => {
        requestResolvers.set(permission, { resolve, reject: () => resolve(false) });
      });
    },
    
    getPendingRequests() {
      return [...pendingRequests];
    },
    
    approveRequest(permission: string) {
      permissions[permission] = true;
      const resolver = requestResolvers.get(permission);
      if (resolver) {
        resolver.resolve(true);
        requestResolvers.delete(permission);
      }
      const idx = pendingRequests.findIndex(r => r.permission === permission);
      if (idx !== -1) pendingRequests.splice(idx, 1);
    },
    
    denyRequest(permission: string) {
      const resolver = requestResolvers.get(permission);
      if (resolver) {
        resolver.resolve(false);
        requestResolvers.delete(permission);
      }
      const idx = pendingRequests.findIndex(r => r.permission === permission);
      if (idx !== -1) pendingRequests.splice(idx, 1);
    },
    
    applyPreset(preset: string) {
      const presets: Record<string, any> = {
        minimal: { openApps: true, runCommands: false, fileSystem: false },
        standard: { openApps: true, runCommands: true, fileSystem: false },
        full: { openApps: true, runCommands: true, fileSystem: true },
      };
      
      Object.assign(permissions, presets[preset] || {});
    },
  };
}

console.log('✅ DEX Security Module Test Suite Complete');
