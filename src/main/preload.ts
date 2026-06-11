/**
 * ===========================================================================
 * DEX - Personal Control Hub for Desktop Automation
 * ===========================================================================
 * 
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * @version    3.6.0
 * 
 * Preload Script - Context Bridge for Secure IPC
 * ===========================================================================
 */

import { contextBridge, ipcRenderer } from 'electron';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// IPC Envelope Encryption (preload side)
// Fetches the session key from main once, then seals sensitive payloads
// locally with AES-256-GCM before they cross IPC channels.
// ---------------------------------------------------------------------------

let _ipcSessionKey: Buffer | null = null;

async function ensureIPCKey(): Promise<Buffer> {
  if (_ipcSessionKey) return _ipcSessionKey;
  const keyB64: string | null = await ipcRenderer.invoke('ipc-crypto:getSessionKey');
  if (!keyB64) throw new Error('IPCCrypto session key not available');
  _ipcSessionKey = Buffer.from(keyB64, 'base64');
  return _ipcSessionKey;
}

interface SealedEnvelope { v: 1; iv: string; tag: string; ct: string; }

async function sealForIPC(plaintext: string): Promise<SealedEnvelope> {
  const key = await ensureIPCKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}

// Type definitions for exposed APIs
export interface DexAPI {
  // Generic invoke for dynamic IPC calls
  invoke: (channel: string, ...args: any[]) => Promise<any>;

  // Platform info
  platform: {
    isMac: boolean;
    isWindows: boolean;
    isLinux: boolean;
    os: string;
    homeDir: string;
  };

  // Window controls
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    hide: () => void;
    setTitleBarOverlay: (enabled: boolean) => Promise<any>;
    enterCompact: (opts?: { width?: number; height?: number; corner?: string }) => Promise<any>;
    exitCompact: () => Promise<any>;
  };

  // Actions
  actions: {
    execute: (action: any) => Promise<any>;
    getAll: () => Promise<any[]>;
    save: (action: any) => Promise<any>;
    delete: (actionId: string) => Promise<void>;
    getRunningApps: () => Promise<any[]>;
    closeApp: (pid: number) => Promise<void>;
  };

  // Modes
  modes: {
    getAll: () => Promise<any[]>;
    getActive: () => Promise<any | null>;
    activate: (modeId: string) => Promise<void>;
    deactivate: () => Promise<void>;
    save: (mode: any) => Promise<any>;
    delete: (modeId: string) => Promise<void>;
  };

  // Rules
  rules: {
    getAll: () => Promise<any[]>;
    save: (rule: any) => Promise<any>;
    delete: (ruleId: string) => Promise<void>;
    toggle: (ruleId: string, enabled: boolean) => Promise<void>;
  };

  // System
  system: {
    getStatus: () => Promise<any>;
    getProcesses: () => Promise<any[]>;
    killProcess: (pid: number, force?: boolean) => Promise<{ success: boolean; message: string }>;
    claimResources: (enable: boolean) => Promise<any>;
    reservationStatus: () => Promise<any>;
    releasePid: (pid: number) => Promise<any>;
  };

  // Power & Performance
  power: {
    getStats: () => Promise<any>;
    getProfile: () => Promise<string>;
    setProfile: (profile: 'eco' | 'balanced' | 'boost') => Promise<any>;
    quickBoost: (durationMinutes?: number) => Promise<any>;
    getResourceHogs: () => Promise<any[]>;
    closeProcess: (pid: number, force?: boolean) => Promise<any>;
    freeMemory: () => Promise<any>;
    getSuggestedCleanup: () => Promise<any>;
    setCpuLimit: (val: number) => Promise<any>;
    setGpuLimit: (val: number) => Promise<any>;
    setFanCurve: (val: number) => Promise<any>;
  };

  // OS Controls
  os: {
    lockScreen: () => Promise<any>;
    shutdown: () => Promise<any>;
    restart: () => Promise<any>;
    sleep: () => Promise<any>;
  };

  // Operations
  operations: {
    execute: (operationId: string) => Promise<any>;
    undo: (logId: string) => Promise<any>;
    getLogs: (limit?: number) => Promise<any[]>;
  };

  // Workflows
  workflows: {
    getAll: () => Promise<any[]>;
    getTemplates: () => Promise<any[]>;
    save: (workflow: any) => Promise<any>;
    delete: (workflowId: string) => Promise<void>;
    duplicate: (workflowId: string) => Promise<any>;
    togglePin: (workflowId: string) => Promise<void>;
    execute: (workflowId: string) => Promise<any>;
  };

  // Sessions
  sessions: {
    getCurrent: () => Promise<any | null>;
    start: (name: string) => Promise<any>;
    end: (sessionId: string) => Promise<void>;
    getHistory: () => Promise<any[]>;
    // Notes
    getNotes: () => Promise<any[]>;
    addNote: (noteData: any) => Promise<any>;
    updateNote: (noteId: string, updates: any) => Promise<any>;
    deleteNote: (noteId: string) => Promise<void>;
    // Timers
    getTimers: () => Promise<any[]>;
    createTimer: (timerData: any) => Promise<any>;
    startTimer: (timerId: string) => Promise<void>;
    pauseTimer: (timerId: string) => Promise<void>;
    stopTimer: (timerId: string) => Promise<void>;
    deleteTimer: (timerId: string) => Promise<void>;
    // Running Tasks
    getRunningTasks: () => Promise<any[]>;
    stopTask: (taskId: string) => Promise<void>;
  };

  // Logs
  logs: {
    get: (limit?: number) => Promise<any[]>;
    clear: () => Promise<void>;
  };

  // Permissions
  permissions: {
    getAll: () => Promise<any>;
    grant: (permission: string) => Promise<void>;
    revoke: (permission: string) => Promise<void>;
  };

  // Embedding (text → vector via main-process EmbeddingService)
  embedding: {
    compute: (text: string) => Promise<{ vector: number[]; dim: number; backend: string } | null>;
    computeBatch: (texts: string[]) => Promise<Array<{ vector: number[]; dim: number; backend: string }> | null>;
  };

  // Emergency controls
  emergency: {
    stop: () => Promise<void>;
    resume: () => Promise<void>;
  };

  // Shell
  shell: {
    openPath: (path: string) => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  };

  // Watchdog
  watchdog: {
    health: () => Promise<{
      healthy: boolean;
      lastCheck: number;
      memoryUsage: number;
      cpuUsage: number;
      uptime: number;
      errors: string[];
      warnings: string[];
    }>;
    check: () => Promise<any>;
    diagnostics: () => Promise<any>;
    clearErrors: () => Promise<{ success: boolean }>;
  };

  // Updates
  updates: {
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<any>;
    skip: (version: string) => Promise<any>;
    remindLater: (hours?: number) => Promise<any>;
    getInfo: () => Promise<any>;
    getPreferences: () => Promise<any>;
    setPreferences: (prefs: any) => Promise<any>;
    openReleaseNotes: () => Promise<any>;
    getChangelog: () => Promise<any>;
    getReleaseNotesForVersion: (version: string) => Promise<{ version: string; notes: string }>;
    onInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => void;
    offInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => void;
    // Phase 66: Release Manager additions
    getConfig: () => Promise<any>;
    listBackups: () => Promise<any[]>;
    rollback: (backupId: string) => Promise<any>;
    deleteBackup: (backupId: string) => Promise<any>;
    getUpdateHistory: () => Promise<any[]>;
    // v4.0.0: Pro 30-day downgrade window
    canDowngrade: () => Promise<{ eligible: boolean; daysRemaining: number; targetVersion: string | null; reason: string }>;
    downgrade: () => Promise<{ success: boolean; eligibility: { eligible: boolean; daysRemaining: number; targetVersion: string | null; reason: string }; restoredBackup?: string; error?: string }>;
    getInstallHistory: () => Promise<Array<{ version: string; fromVersion: string | null; installedAt: number }>>;
    pruneCache: () => Promise<{ freedBytes: number; removed: number }>;
  };

  // Diagnostics
  diagnostics: {
    getPreferences: () => Promise<any>;
    setPreferences: (prefs: any) => Promise<any>;
    getLogs: (count?: number) => Promise<any[]>;
    getLogFile: (date?: string) => Promise<string>;
    listLogFiles: () => Promise<any[]>;
    clearLogs: () => Promise<{ success: boolean }>;
    getCrashReports: () => Promise<any[]>;
    deleteCrashReport: (id: string) => Promise<any>;
    clearCrashReports: () => Promise<any>;
    getPerformance: () => Promise<any>;
    getPerformanceHistory: () => Promise<any[]>;
    getSystemInfo: () => Promise<any>;
    export: () => Promise<any>;
    openLogsFolder: () => Promise<any>;
    log: (level: string, category: string, message: string, data?: any) => Promise<any>;
    reportError: (error: { message: string; stack?: string }) => Promise<any>;
  };

  // Crash Reporter -- local-only crash stats
  crashReporter: {
    getStats: () => Promise<any>;
    getRecent: (limit?: number) => Promise<any[]>;
    clear: () => Promise<any>;
    reportRendererError: (data: { message: string; stack?: string }) => Promise<any>;
  };

  // Authentication
  auth: {
    getState: () => Promise<any>;
    getConfig: () => Promise<any>;
    biometricsAvailable: () => Promise<boolean>;
    authenticatePassword: (password: string) => Promise<{ success: boolean; error?: string; token?: string }>;
    authenticatePin: (pin: string) => Promise<{ success: boolean; error?: string; token?: string }>;
    authenticateBiometric: () => Promise<{ success: boolean; error?: string; token?: string }>;
    setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
    setPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
    enableBiometric: () => Promise<{ success: boolean; error?: string }>;
    updateConfig: (updates: any) => Promise<{ success: boolean }>;
    lock: () => Promise<void>;
    clearCredentials: (currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
    changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
    generateRecoveryCodes: () => Promise<{ success: boolean; codes?: string[] }>;
    authenticateRecovery: (code: string) => Promise<{ success: boolean; error?: string; token?: string }>;
    verifySession: (token: string) => Promise<boolean>;
    getLockoutStatus: () => Promise<{ isLockedOut: boolean; remainingMinutes: number; attemptsRemaining: number }>;
    onStateChange: (callback: (state: any) => void) => void;
  };

  // Secure Vault - Password Manager & Authenticator
  vault: {
    // State & Control
    getState: () => Promise<any>;
    exists: () => Promise<boolean>;
    create: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
    unlock: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
    lock: () => Promise<void>;
    
    // Credentials
    getCredentials: () => Promise<any[]>;
    getCredential: (id: string) => Promise<any | null>;
    addCredential: (credential: any) => Promise<any>;
    updateCredential: (id: string, updates: any) => Promise<boolean>;
    deleteCredential: (id: string) => Promise<boolean>;
    searchCredentials: (query: string) => Promise<any[]>;
    
    // Authenticator (2FA)
    getAuthenticators: () => Promise<any[]>;
    addAuthenticator: (entry: any) => Promise<any>;
    updateAuthenticator: (id: string, updates: any) => Promise<boolean>;
    deleteAuthenticator: (id: string) => Promise<boolean>;
    generateTOTP: (id: string) => Promise<{ code: string; remaining: number } | null>;
    generateTOTPFromSecret: (secret: string, options?: any) => Promise<{ code: string; remaining: number }>;
    parseOTPUri: (uri: string) => Promise<any>;
    
    // Settings
    getSettings: () => Promise<any>;
    updateSettings: (updates: any) => Promise<boolean>;
    
    // Utilities
    generatePassword: (options?: any) => Promise<string>;
    assessPasswordStrength: (password: string) => Promise<{ score: number; label: string; suggestions: string[] }>;
    auditPasswords: () => Promise<any>;
    copyToClipboard: (text: string) => Promise<void>;
    
    // Export/Import
    exportVault: (exportPassword: string) => Promise<string | null>;
    importVault: (data: string, exportPassword: string) => Promise<boolean>;
    changeMasterPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
    
    // Events
    onStateChange: (callback: (state: any) => void) => void;
  };

  // System Intelligence - Local-only pattern learning
  intelligence: {
    getState: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<boolean>;
    getSuggestions: () => Promise<any[]>;
    dismissSuggestion: (id: string) => Promise<boolean>;
    acceptSuggestion: (id: string) => Promise<{ success: boolean; action?: string }>;
    getPatterns: () => Promise<any[]>;
    triggerAnalysis: () => Promise<void>;
    clearData: () => Promise<boolean>;
    recordEvent: (type: string, target: string, metadata?: any) => Promise<void>;
    getFileOrganization: (directory: string) => Promise<any[]>;
    onStateChange: (callback: (state: any) => void) => void;
  };

  // Security
  security: {
    getPermissions: () => Promise<any[]>;
    getPermission: (id: string) => Promise<any>;
    togglePermission: (id: string, enabled: boolean) => Promise<any>;
    getReport: () => Promise<any>;
    getLog: () => Promise<any[]>;
    verifySandbox: () => Promise<any>;
    exportAudit: () => Promise<any>;
  };

  // Feature Flags
  features: {
    getAll: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    isEnabled: (id: string) => Promise<boolean>;
    toggle: (id: string, enabled: boolean) => Promise<any>;
    resetAll: () => Promise<any>;
    getStable: () => Promise<any[]>;
    getExperimental: () => Promise<any[]>;
  };

  // Maintenance Mode
  maintenance: {
    getState: () => Promise<any>;
    enable: (reason?: string, scheduledEnd?: string) => Promise<any>;
    disable: () => Promise<any>;
  };

  // Health Monitor
  health: {
    check: () => Promise<any>;
    getStatus: () => Promise<any>;
    getVerification: () => Promise<{ passed: number; failed: number; warnings: number; results: any[] }>;
    getLogs: (options?: { level?: string; source?: string; since?: number; limit?: number }) => Promise<any[]>;
    clearLogs: () => Promise<{ success: boolean }>;
    exportLogs: () => Promise<string>;
    setDiagnosticsEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
    isDiagnosticsEnabled: () => Promise<boolean>;
  };

  // Performance & Capability Layer
  phase51: {
    getStatus: () => Promise<any>;
    getReport: () => Promise<any>;
    getPerformance: () => Promise<any>;
    getCapabilities: () => Promise<any>;
    getDevices: () => Promise<any>;
    getStability: () => Promise<any>;
    getPlugins: () => Promise<any>;
  };

  // External Devices
  devices: {
    list: () => Promise<any[]>;
    browse: (deviceId: string, path?: string) => Promise<any[]>;
    import: (deviceId: string, paths: string[], dest?: string) => Promise<any>;
    export: (deviceId: string, paths: string[], dest: string) => Promise<any>;
  };

  // Capability Layer
  capability: {
    fileSystem: {
      list: (path: string) => Promise<any>;
      copy: (source: string, dest: string) => Promise<any>;
      move: (source: string, dest: string) => Promise<any>;
    };
    transfer: {
      getStats: () => Promise<any>;
    };
    storage: {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any) => Promise<void>;
    };
  };

  // Data (Enhanced Phase 11)
  data: {
    export: () => Promise<{ success: boolean; path?: string; error?: string }>;
    import: () => Promise<{ success: boolean; imported?: string[]; error?: string }>;
    reset: () => Promise<{ success: boolean; error?: string }>;
    stats: () => Promise<any>;
    exportCollection: (collection: string) => Promise<any>;
    exportToFolder: (options?: any) => Promise<any>;
    importFromFolder: () => Promise<any>;
    createBackup: () => Promise<any>;
    listBackups: () => Promise<any[]>;
    restoreBackup: (backupPath: string) => Promise<any>;
    openFolder: () => Promise<any>;
    getLocations: () => Promise<any>;
  };

  // Phase 12: System Map
  systemMap: {
    get: () => Promise<any>;
    getHealth: () => Promise<any>;
    getConnections: () => Promise<any[]>;
    getStorage: () => Promise<any[]>;
    getSessions: () => Promise<any[]>;
    refresh: () => Promise<any>;
    evaluateTransferCapacity: () => Promise<any>;
  };

  // Phase 12: Transfers
  transfer: {
    localCopy: (request: any) => Promise<any>;
    send: (request: any) => Promise<any>;
    getActiveTransfers: () => Promise<any[]>;
    pause: (id: string) => Promise<any>;
    resume: (id: string) => Promise<any>;
    cancel: (id: string) => Promise<any>;
    getConfig: () => Promise<any>;
    setConfig: (config: any) => Promise<any>;
    selectFiles: () => Promise<any>;
    getPermissions: () => Promise<any[]>;
    grantPermission: (perm: any) => Promise<any>;
    revokePermission: (id: string) => Promise<any>;
  };

  // Phase 12: Connection
  connection: {
    getNetworkInfo: () => Promise<any>;
    getPermissions: () => Promise<any>;
    setPermissions: (perms: any) => Promise<any>;
    setNetworkingEnabled: (enabled: boolean) => Promise<any>;
    getChannels: () => Promise<any[]>;
    openChannel: (config: any) => Promise<any>;
    closeChannel: (id: string) => Promise<any>;
    isTypeAllowed: (type: string) => Promise<boolean>;
    testConnection: (host: string, port: number) => Promise<any>;
    getLocalIPs: () => Promise<string[]>;
  };

  // Phase 12: Device
  device: {
    getThisDevice: () => Promise<any>;
    setName: (name: string) => Promise<any>;
    getAll: () => Promise<any[]>;
    getTrusted: () => Promise<any[]>;
    getOnline: () => Promise<any[]>;
    isDiscoveryEnabled: () => Promise<boolean>;
    setDiscoveryEnabled: (enabled: boolean) => Promise<any>;
    addManual: (ip: string, port: number) => Promise<any>;
    remove: (deviceId: string) => Promise<any>;
    setTrusted: (deviceId: string, trusted: boolean) => Promise<any>;
    initiatePairing: (deviceId: string) => Promise<any>;
    acceptPairing: (pairingId: string) => Promise<any>;
    rejectPairing: (pairingId: string) => Promise<any>;
    getSessions: () => Promise<any[]>;
    endSession: (sessionId: string) => Promise<any>;
  };

  // HTTP Transfer: local network file sharing via HTTP server + QR code
  httpTransfer: {
    start: () => Promise<any>;
    stop: () => Promise<any>;
    share: (filePaths: string[]) => Promise<any>;
    unshare: (fileId: string) => Promise<any>;
    info: () => Promise<any>;
    pickAndShare: () => Promise<any>;
    acceptUpload: (uploadId: string, accept: boolean) => Promise<any>;
    getPendingUploads: () => Promise<any[]>;
  };

  // Phase 14: Deep Session Flow
  deepSession: {
    // Session lifecycle
    start: () => Promise<any>;
    restore: () => Promise<any>;
    end: () => Promise<any>;
    get: () => Promise<any>;
    // Page context preservation
    saveContext: (pageId: string, context: any) => Promise<any>;
    getContext: (pageId: string) => Promise<any>;
    navigate: (pageId: string) => Promise<any>;
    getNavigationHistory: () => Promise<string[]>;
    // Draft management
    saveDraft: (pageId: string, content: any) => Promise<any>;
    getDraft: (pageId: string) => Promise<any>;
    getDrafts: () => Promise<any>;
    discardDraft: (pageId: string) => Promise<any>;
    // Pinned notes
    pinNote: (noteId: string) => Promise<any>;
    unpinNote: (noteId: string) => Promise<any>;
    getPinnedNotes: () => Promise<string[]>;
    // Split view
    setSplitView: (config: any) => Promise<any>;
    getSplitView: () => Promise<any>;
    // Activity & preferences
    recordActivity: () => Promise<any>;
    getPreferences: () => Promise<any>;
    setPreferences: (prefs: any) => Promise<any>;
  };

  // Phase 16: Encryption
  encryption: {
    getStatus: () => Promise<{
      available: boolean;
      enabled: boolean;
      locked: boolean;
      keySource: 'password' | 'system' | null;
      lastKeyRotation: number | null;
    }>;
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<any>;
    initWithPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
    initWithSystemKey: () => Promise<{ success: boolean; error?: string }>;
    unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
    lock: () => Promise<{ success: boolean }>;
    disable: () => Promise<{ success: boolean; error?: string }>;
  };

  // Phase 17: Trust & Transparency
  trust: {
    getStatus: () => Promise<any>;
    getFullReport: () => Promise<any>;
    getPermissions: () => Promise<any>;
    grantPermission: (permission: string) => Promise<boolean>;
    revokePermission: (permission: string) => Promise<boolean>;
    enableRestrictedMode: (allowedPermissions?: string[]) => Promise<boolean>;
    disableRestrictedMode: () => Promise<boolean>;
    runSecurityAudit: () => Promise<any>;
    getAuditLog: (count?: number, category?: string) => Promise<any[]>;
    verifyIntegrity: () => Promise<any[]>;
    getPerformance: () => Promise<any>;
    getDataLocations: () => Promise<any>;
    getHumanError: (code: string) => Promise<any>;
    getArchitecture: () => Promise<any>;
  };

  // Phase 18: Data Export & User Ownership
  export: {
    data: (options: any) => Promise<any>;
    dataToPath: (path: string, options: any) => Promise<any>;
    import: () => Promise<any>;
    importFromPath: (path: string) => Promise<any>;
    getSummary: () => Promise<any>;
    getLocations: () => Promise<any>;
    openDataFolder: () => Promise<boolean>;
  };

  // Phase 19: File Management
  files: {
    addScope: (folderPath: string, options?: any) => Promise<boolean>;
    addScopeWithDialog: () => Promise<string | null>;
    removeScope: (folderPath: string) => Promise<boolean>;
    getScopes: () => Promise<any[]>;
    isInScope: (targetPath: string) => Promise<boolean>;
    list: (dirPath: string, sort?: any) => Promise<any[] | null>;
    search: (options: any) => Promise<any[]>;
    recent: (options: any) => Promise<any[]>;
    rename: (oldPath: string, newName: string) => Promise<any>;
    move: (sourcePath: string, targetDir: string) => Promise<any>;
    copy: (sourcePath: string, targetDir: string) => Promise<any>;
    delete: (filePath: string) => Promise<any>;
    previewBatchRename: (files: string[], rules: any[]) => Promise<any[]>;
    executeBatchRename: (files: string[], rules: any[]) => Promise<any[]>;
    organizeByType: (dirPath: string) => Promise<any[]>;
    undo: () => Promise<any | null>;
    getHistory: () => Promise<any[]>;
    clearHistory: () => Promise<boolean>;
  };

  // Phase 19: Task Queue
  tasks: {
    add: (task: any) => Promise<any>;
    remove: (taskId: string) => Promise<boolean>;
    reorder: (taskId: string, newIndex: number) => Promise<boolean>;
    getAll: () => Promise<any[]>;
    getStatus: () => Promise<any>;
    start: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    resume: () => Promise<boolean>;
    stop: () => Promise<boolean>;
    cancelCurrent: () => Promise<boolean>;
    clearCompleted: () => Promise<number>;
    getTypes: () => Promise<string[]>;
  };

  // Phase 19: Document Creation
  documents: {
    getTemplates: () => Promise<any[]>;
    getTemplate: (templateId: string) => Promise<any | null>;
    addTemplate: (template: any) => Promise<any>;
    removeTemplate: (templateId: string) => Promise<boolean>;
    create: (request: any) => Promise<any>;
    preview: (request: any) => Promise<string>;
    getHistory: () => Promise<any[]>;
    selectOutputDir: () => Promise<string | null>;
  };

  // Phase 19: External Connectors
  connectors: {
    add: (config: any) => Promise<any>;
    addWithDialog: () => Promise<any | null>;
    remove: (connectorId: string) => Promise<boolean>;
    update: (connectorId: string, updates: any) => Promise<any | null>;
    getAll: () => Promise<any[]>;
    get: (connectorId: string) => Promise<any | null>;
    listFiles: (connectorId: string, subPath?: string) => Promise<any[] | null>;
    readFile: (connectorId: string, relativePath: string) => Promise<string | null>;
    writeFile: (connectorId: string, relativePath: string, content: string) => Promise<boolean>;
    copyToLocal: (connectorId: string, relativePath: string, localPath: string) => Promise<boolean>;
    getLog: () => Promise<any[]>;
  };

  // Phase 19: Browser Bridge
  browser: {
    startServer: () => Promise<boolean>;
    stopServer: () => Promise<boolean>;
    startPairing: () => Promise<any>;
    cancelPairing: () => Promise<boolean>;
    disconnect: () => Promise<boolean>;
    getStatus: () => Promise<any>;
    navigate: (url: string) => Promise<any>;
    readPage: () => Promise<any>;
    fillField: (selector: string, value: string) => Promise<any>;
    click: (selector: string) => Promise<any>;
    download: (url: string, filename?: string) => Promise<any>;
    getPendingActions: () => Promise<any[]>;
    getActionHistory: () => Promise<any[]>;
    cancelAction: (actionId: string) => Promise<boolean>;
  };

  // Phase 20: Workflows
  workflow: {
    getAll: () => Promise<any[]>;
    get: (workflowId: string) => Promise<any | null>;
    save: (workflow: any) => Promise<boolean>;
    delete: (workflowId: string) => Promise<boolean>;
    duplicate: (workflowId: string, newName?: string) => Promise<any | null>;
    validate: (workflow: any) => Promise<{ valid: boolean; errors: string[] }>;
    getPresets: () => Promise<any>;
    createNew: (name: string, description?: string) => Promise<any>;
    execute: (workflowId: string, inputs: any, options?: any) => Promise<any>;
    executeNew: (workflow: any, inputs: any, options?: any) => Promise<any>;
    pause: () => Promise<boolean>;
    resume: () => Promise<boolean>;
    abort: () => Promise<boolean>;
    getActive: () => Promise<any | null>;
    getHistory: () => Promise<any[]>;
    getExecution: (executionId: string) => Promise<any | null>;
  };

  // Phase 27: Block-Based Automations
  automations: {
    getAll: () => Promise<any[]>;
    get: (id: string) => Promise<any | null>;
    save: (automation: any) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
    execute: (id: string) => Promise<any>;
    cancel: (id: string) => Promise<boolean>;
    toggleFavorite: (id: string) => Promise<any>;
    duplicate: (id: string) => Promise<any>;
  };

  // Scripting Engine
  scripting: {
    getScripts: () => Promise<any[]>;
    getScript: (id: string) => Promise<any | null>;
    createScript: (script: any) => Promise<any>;
    updateScript: (id: string, updates: any) => Promise<any>;
    deleteScript: (id: string) => Promise<boolean>;
    execute: (id: string) => Promise<any>;
    executeCode: (code: string) => Promise<any>;
    stop: (id: string) => Promise<boolean>;
    getTemplates: () => Promise<any[]>;
  };

  //  ULTRA-LOW RESOURCE MODE: Resource Governor API
  resource: {
    getSnapshot: () => Promise<any>;
    getPressure: () => Promise<any>;
    getThrottleLevel: () => Promise<number>;
    getBudgets: () => Promise<any>;
    recordActivity: () => void;
    getGPUState: () => Promise<any>;
    shouldRender: () => Promise<boolean>;
    reportRenderStart: () => void;
    reportRenderEnd: () => void;
  };

  //  120Hz RENDER GOVERNOR: High-refresh rate support
  render: {
    getConfig: () => Promise<any>;
    getSnapshot: () => Promise<any>;
    reportFrameMetrics: (metrics: any) => void;
    reportStateChange: (state: string) => void;
    reportInputEvent: () => void;
  };

  //  MOTION DISCIPLINE: Animation control
  motion: {
    getConfig: () => Promise<any>;
    getState: () => Promise<any>;
    requestAnimation: (request: any) => Promise<any>;
    reportPrefersReduced: (prefers: boolean) => void;
    reportAnimationStart: () => void;
    reportAnimationEnd: () => void;
  };

  //  INPUT LATENCY: Zero-latency input mode
  input: {
    getSnapshot: () => Promise<any>;
    getTargets: () => Promise<any>;
    shouldDefer: () => Promise<boolean>;
    reportEvent: (event: any) => void;
    reportLatency: (measurement: any) => void;
  };

  //  SESSION STABILITY: Long-session support
  stability: {
    getMetrics: () => Promise<any>;
    getSnapshot: () => Promise<any>;
    getUptime: () => Promise<number>;
    compact: () => Promise<any>;
    reportIdle: () => void;
    reportFrameTime: (frameTime: number) => void;
    reportLatency: (latency: number) => void;
  };

  //  PERFORMANCE ENFORCER: Guarantees enforcement
  enforce: {
    getSnapshot: () => Promise<any>;
    getGuarantees: () => Promise<any>;
    getBaseline: () => Promise<any>;
    check: () => Promise<any>;
    reportMetrics: (metrics: any) => void;
  };

  //  UNIVERSAL SEARCH: Global search across Dex and computer files
  search: {
    query: (query: string, options?: {
      scopes?: ('dex' | 'computer')[];
      limit?: number;
      types?: string[];
    }) => Promise<{
      results: Array<{
        id: string;
        title: string;
        type: string;
        scope: 'dex' | 'computer';
        subtitle?: string;
        preview?: string;
        path?: string;
        category?: string;
        score?: number;
        timestamp?: number;
      }>;
      total: number;
      scopes: ('dex' | 'computer')[];
    }>;
    getStats: () => Promise<{
      dex: { indexed: number; types: string[] };
      computer: { indexed: number; scopes: string[] };
    }>;
    rebuild: () => Promise<{ success: boolean }>;
  };

  //  FILE SEARCH: Computer file indexing scopes
  fileSearch: {
    getScopes: () => Promise<Array<{
      path: string;
      name: string;
      fileCount: number;
      indexed: boolean;
      lastIndexed?: number;
    }>>;
    addScope: (folderPath?: string) => Promise<{
      success: boolean;
      scope?: { path: string; name: string };
      error?: string;
    }>;
    removeScope: (scopePath: string) => Promise<{ success: boolean }>;
    search: (query: string, options?: {
      scopes?: string[];
      limit?: number;
    }) => Promise<Array<{
      path: string;
      name: string;
      type: string;
      size: number;
      modified: number;
      score: number;
    }>>;
    reindex: (scopePath?: string) => Promise<{ success: boolean }>;
  };

  //  FILE INTELLIGENCE: Deep file understanding (Phase 38)
  fileIntel: {
    // Authorization
    authorizePath: (path?: string) => Promise<{ success: boolean; path?: string; reason?: string }>;
    revokePath: (path: string) => Promise<{ success: boolean }>;
    getAuthorizedPaths: () => Promise<string[]>;
    
    // Scanning & Analysis
    scanDirectory: (path: string, options?: { recursive?: boolean; maxFiles?: number }) => 
      Promise<{ success: boolean; files?: any[]; count?: number; error?: string }>;
    analyzeFile: (path: string, deep?: boolean) => Promise<any>;
    analyzeMedia: (path: string, type: 'image' | 'video' | 'audio' | 'document') => Promise<any>;
    
    // Queries
    getAllFiles: () => Promise<any[]>;
    getFile: (id: string) => Promise<any>;
    searchFiles: (query: string) => Promise<any[]>;
    getRecentFiles: (limit?: number) => Promise<any[]>;
    getFilesByType: (type: string) => Promise<any[]>;
    getStatistics: () => Promise<any>;
    
    // Grouping
    groupByType: () => Promise<any[]>;
    groupByDate: (granularity?: 'day' | 'week' | 'month') => Promise<any[]>;
    findDuplicates: () => Promise<any[]>;
    
    // Organization
    getSuggestions: () => Promise<any[]>;
    approveSuggestion: (id: string) => Promise<any>;
    applySuggestion: (suggestion: any) => Promise<any>;
    rejectSuggestion: (id: string) => Promise<any>;
    
    // File Operations
    openFile: (path: string) => Promise<{ success: boolean; error?: string }>;
    revealInExplorer: (path: string) => Promise<{ success: boolean }>;
    getThumbnail: (path: string) => Promise<string | null>;
    
    // Watching
    startWatching: (path: string, options?: { recursive?: boolean }) => Promise<{ success: boolean }>;
    stopWatching: (path: string) => Promise<{ success: boolean }>;
    getWatcherStatus: () => Promise<any>;
  };

  //  PHASE 39: SECURITY CORE - Layered defensive security
  securityCore: {
    getStatus: () => Promise<any>;
    getLayerStatus: (layer: number) => Promise<any>;
    getThreats: () => Promise<any[]>;
    acknowledgeThreats: (threatIds: string[]) => Promise<boolean>;
    runSecurityCheck: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<boolean>;
    registerFileIntegrity: (filePath: string, hash?: string) => Promise<boolean>;
    verifyFileIntegrity: (filePath: string) => Promise<any>;
    createSecureContext: (contextId: string) => Promise<any>;
    destroySecureContext: (contextId: string) => Promise<boolean>;
    logAuditEvent: (event: any) => Promise<boolean>;
    getAuditLog: (options?: any) => Promise<any[]>;
    exportAuditLog: () => Promise<string | null>;
  };

  //  PHASE 39: SECURE KEY MANAGER - Encryption key lifecycle
  secureKeys: {
    listKeys: () => Promise<any[]>;
    generateKey: (name: string, purpose: string) => Promise<any>;
    deriveKey: (name: string, passphrase: string, purpose: string) => Promise<any>;
    deleteKey: (keyId: string) => Promise<boolean>;
    rotateKey: (keyId: string) => Promise<any>;
    isLocked: () => Promise<boolean>;
    lock: () => Promise<boolean>;
    unlock: (passphrase: string) => Promise<boolean>;
    encrypt: (keyId: string, data: string) => Promise<string>;
    decrypt: (keyId: string, encrypted: string) => Promise<string>;
    getKeyInfo: (keyId: string) => Promise<any>;
  };

  //  PHASE 39/40: SECURE TRANSFER HUB - Encrypted file transfer
  secureTransfer: {
    initiate: (sourcePath: string, destinationPath: string, encrypt: boolean) => Promise<any>;
    selectAndInitiate: () => Promise<any>;
    getTransfers: () => Promise<any[]>;
    getActiveTransfers: () => Promise<any[]>;
    approveTransfer: (transferId: string) => Promise<boolean>;
    rejectTransfer: (transferId: string) => Promise<boolean>;
    pauseTransfer: (transferId: string) => Promise<boolean>;
    resumeTransfer: (transferId: string) => Promise<boolean>;
    cancelTransfer: (transferId: string) => Promise<boolean>;
    getQuarantined: () => Promise<any[]>;
    releaseFromQuarantine: (transferId: string) => Promise<boolean>;
    deleteFromQuarantine: (transferId: string) => Promise<boolean>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<boolean>;
  };

  //  PHASE 39/40: NETWORK HYGIENE - Defensive network monitoring
  networkHygiene: {
    getStatus: () => Promise<any>;
    getConnectivity: () => Promise<any>;
    isOnline: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    resume: () => Promise<boolean>;
    trustDomain: (domain: string, permanent: boolean) => Promise<boolean>;
    blockDomain: (domain: string) => Promise<boolean>;
    getTrustedDomains: () => Promise<string[]>;
    getBlockedDomains: () => Promise<string[]>;
    getConnectionLog: (limit?: number) => Promise<any[]>;
    validateUrl: (url: string) => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<boolean>;
  };

  //  PHASE 41: DASHBOARD WIDGET SYSTEM - Customizable dashboard
  dashboard: {
    getLayout: () => Promise<any>;
    saveLayout: (layout: any) => Promise<boolean>;
    getLayouts: () => Promise<any[]>;
    switchLayout: (layoutId: string) => Promise<any>;
    createLayout: (name: string) => Promise<any>;
    deleteLayout: (layoutId: string) => Promise<boolean>;
    addWidget: (type: string) => Promise<any>;
    removeWidget: (widgetId: string) => Promise<boolean>;
    moveWidget: (widgetId: string, x: number, y: number) => Promise<boolean>;
    resizeWidget: (widgetId: string, width: number, height: number) => Promise<boolean>;
    getWidgetTypes: () => Promise<any[]>;
    getQuickButtons: () => Promise<any[]>;
    addQuickButton: (button: any) => Promise<any>;
    removeQuickButton: (buttonId: string) => Promise<boolean>;
    executeQuickAction: (actionId: string) => Promise<any>;
  };

  //  PHASE 41: THEME SYSTEM - True black system theming
  theme: {
    getConfig: () => Promise<any>;
    setMode: (mode: 'light' | 'dark' | 'true-black' | 'system') => Promise<any>;
    setAccentColor: (color: string) => Promise<any>;
    setFontScale: (scale: number) => Promise<any>;
    setReducedMotion: (reduced: boolean) => Promise<any>;
    setDensity: (density: 'compact' | 'normal' | 'comfortable') => Promise<any>;
    generateCSSVariables: () => Promise<string>;
    getPresets: () => Promise<any[]>;
    applyPreset: (presetId: string) => Promise<any>;
    export: () => Promise<any>;
    import: (config: any) => Promise<boolean>;
    getSystemAccentColor: () => Promise<string | null>;
  };

  //  PHASE 41: MEDIA WORKSPACE - Universal media handling
  media: {
    getInfo: (filePath: string) => Promise<any>;
    preview: (filePath: string) => Promise<any>;
    getThumbnail: (filePath: string, size?: number) => Promise<string | null>;
    openWithSystem: (filePath: string) => Promise<boolean>;
    getSupportedFormats: () => Promise<any>;
    getMediaFiles: (directory: string) => Promise<any[]>;
  };

  //  PHASE 42: USAGE LEARNING ENGINE - Local-only pattern learning
  learning: {
    recordActivity: (activityType?: string) => Promise<void>;
    recordFeatureUse: (featureId: string) => Promise<void>;
    predict: () => Promise<any>;
    getMostUsedFeatures: (limit?: number) => Promise<any[]>;
    getPatterns: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
    clearData: () => Promise<boolean>;
    exportData: () => Promise<any>;
  };

  //  PHASE 42: POWER EFFICIENCY - Battery & resource optimization
  efficiency: {
    getStatus: () => Promise<any>;
    getMode: () => Promise<string>;
    setMode: (mode: 'performance' | 'normal' | 'battery-saver' | 'aggressive-saver') => Promise<any>;
    getLimits: () => Promise<any>;
    shouldAllowBackgroundTask: (priority: string) => Promise<boolean>;
    yieldResources: () => Promise<void>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
  };

  //  PHASE 42: BACKGROUND MODE - Event-driven background behavior
  background: {
    getState: () => Promise<string>;
    getStatus: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
    wake: (reason: string) => Promise<void>;
    recordActivity: (source: string) => Promise<void>;
    getWakeHistory: (limit?: number) => Promise<any[]>;
    registerService: (serviceId: string) => Promise<void>;
    unregisterService: (serviceId: string) => Promise<void>;
    isServiceActive: (serviceId: string) => Promise<boolean>;
    getScheduledTasks: () => Promise<any[]>;
    addScheduledTask: (task: any) => Promise<any>;
    removeScheduledTask: (taskId: string) => Promise<boolean>;
    toggleScheduledTask: (taskId: string, enabled: boolean) => Promise<boolean>;
  };

  //  PHASE 42: SYSTEM ADVISORY - Suggestions only, never enforce
  advisory: {
    getActive: () => Promise<any[]>;
    dismiss: (advisoryId: string) => Promise<boolean>;
    act: (advisoryId: string) => Promise<boolean>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
    disableAll: () => Promise<void>;
    enableAll: () => Promise<void>;
    getStats: () => Promise<any>;
  };

  //  PHASE 43: PATTERN DETECTION - Opt-in only, local processing
  patterns: {
    enable: () => Promise<boolean>;
    disable: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    reset: () => Promise<boolean>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
    getSummary: () => Promise<any>;
    recordFeatureUse: (featureId: string) => Promise<void>;
  };

  //  PHASE 43: WORKFLOW INTELLIGENCE - Advisory suggestions only
  workflowIntel: {
    getSuggestions: () => Promise<any[]>;
    dismissSuggestion: (id: string) => Promise<boolean>;
    acceptSuggestion: (id: string) => Promise<boolean>;
    rankSearchResults: (results: any[]) => Promise<any[]>;
    getPrefill: (commandId: string) => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
  };

  //  PHASE 44: SELF-HEALING - State recovery & rollback
  selfHealing: {
    runHealthCheck: () => Promise<any>;
    createCheckpoint: () => Promise<string>;
    rollbackToCheckpoint: (checkpointId: string) => Promise<boolean>;
    getCheckpoints: () => Promise<any[]>;
    deleteCheckpoint: (checkpointId: string) => Promise<boolean>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
  };

  //  PHASE 44: LONGEVITY GUARDIAN - Long-run resource sanity
  longevity: {
    captureBaseline: () => Promise<any>;
    getDriftReport: () => Promise<any>;
    runCompaction: () => Promise<any>;
    cleanupOrphanedTasks: () => Promise<number>;
    getStats: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
  };

  //  PHASE 45: GOVERNANCE - Permission registry & compliance
  governance: {
    getPermissions: () => Promise<any[]>;
    getPermission: (id: string) => Promise<any>;
    grantPermission: (id: string) => Promise<boolean>;
    revokePermission: (id: string) => Promise<boolean>;
    getComplianceStatus: () => Promise<any>;
    getRetentionPolicies: () => Promise<any[]>;
    setRetentionPolicy: (dataType: string, days: number) => Promise<boolean>;
    prepareCleanUninstall: () => Promise<any>;
  };

  //  PHASE 45: PERFORMANCE CONTRACT - Locked guarantees
  performanceContract: {
    getGuarantees: () => Promise<any[]>;
    checkCompliance: () => Promise<any>;
    validateChange: (change: any) => Promise<any>;
    takeSnapshot: () => Promise<any>;
    getComplianceReport: () => Promise<any>;
  };

  //  PHASE 45: FAILURE CONTAINMENT - Fault isolation
  containment: {
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => Promise<any>;
    getDomainStatus: () => Promise<any>;
    getFaults: (limit?: number) => Promise<any[]>;
    getSafeMode: () => Promise<any>;
    enterSafeMode: (reason: string) => Promise<boolean>;
    exitSafeMode: () => Promise<boolean>;
    isolateDomain: (domain: string) => Promise<boolean>;
    restoreDomain: (domain: string) => Promise<boolean>;
    clearFaults: () => Promise<boolean>;
  };

  //  PHASE 46: VOICE CONTROL - Opt-in voice commands
  voice: {
    // Config
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<any>;
    enable: () => Promise<boolean>;
    disable: () => Promise<boolean>;
    // Control
    getState: () => Promise<string>;
    startListening: () => Promise<boolean>;
    stopListening: () => Promise<boolean>;
    cancelCommand: () => Promise<boolean>;
    toggle: () => Promise<boolean>;
    // Microphone
    getMicrophoneStatus: () => Promise<any>;
    requestMicrophonePermission: () => Promise<boolean>;
    // Logs & Stats
    getLogs: (limit?: number) => Promise<any[]>;
    clearLogs: () => Promise<boolean>;
    getStats: () => Promise<any>;
    getCurrentSession: () => Promise<any>;
    getFullStatus: () => Promise<any>;
  };

  //  PHASE 46: VOICE COMMANDS - Command processing
  voiceCommand: {
    parse: (transcript: string) => Promise<any>;
    execute: (command: any) => Promise<any>;
    confirm: () => Promise<any>;
    reject: () => Promise<boolean>;
    getPending: () => Promise<any>;
    getPatterns: () => Promise<any[]>;
  };

  //  UKI VOICE ASSISTANT - Memory & Context
  uki: {
    getStatus: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (partial: any) => Promise<any>;
    resetConfig: () => Promise<any>;
    startListening: () => Promise<void>;
    stopListening: () => Promise<boolean>;
    toggle: () => Promise<string>;
    transcript: (text: string) => Promise<boolean>;
    query: (text: string) => Promise<any>;
    confirm: (confirmed: boolean) => Promise<boolean>;
    setContext: (page: string | null, appId: string | null) => void;
    // Memory
    memoryRecord: (entry: { type: string; summary: string; appId?: string; pageId?: string; category?: string; action?: string; success?: boolean }) => Promise<boolean>;
    memorySearch: (query: string, limit?: number) => Promise<any[]>;
    memoryRecent: (limit?: number) => Promise<any[]>;
    memoryStats: () => Promise<any>;
    memoryCleanup: () => Promise<number>;
    memoryClear: () => Promise<boolean>;
    // Copilot (Claude-like AI coworker)
    copilot: {
      getConfig: () => Promise<any>;
      updateConfig: (config: any) => Promise<any>;
      setContext: (context: any) => Promise<boolean>;
      sendMessage: (content: string) => Promise<any>;
      getConversation: () => Promise<any[]>;
      clearConversation: () => Promise<boolean>;
      getSuggestions: () => Promise<any[]>;
      executeAction: (actionId: string) => Promise<any>;
      isThinking: () => Promise<boolean>;
    };
    // Blueprint generator (A2)
    blueprint: {
      generate: (prompt: string, kind?: string) => Promise<any>;
      tweak: (blueprintId: string, change: { key: string; value: unknown }) => Promise<any>;
    };
    // Rewind memory recall (A4)
    recall: (query: string, options?: Record<string, unknown>) => Promise<any>;
    // Creative operator (A3)
    operator: {
      dispatch: (action: unknown) => Promise<any>;
      audit: (limit?: number) => Promise<any[]>;
    };
  };

  //  Defense orchestrator (D3)
  defense: {
    status: () => Promise<any>;
    report: (signal: unknown) => Promise<any>;
    lockdown: (enable: boolean) => Promise<any>;
    onSnapshot: (cb: (p: unknown) => void) => void;
    onQuarantine: (cb: (p: unknown) => void) => void;
    onVaultLock: (cb: (p: unknown) => void) => void;
    onNetworkLockdown: (cb: (p: unknown) => void) => void;
    onRestoreFiles: (cb: (p: unknown) => void) => void;
    onNexusEmergency: (cb: (p: unknown) => void) => void;
  };

  //  Nexus biometrics (D2)
  nexusBio: {
    list: () => Promise<any>;
    enroll: (payload: { kind: string; label?: string }) => Promise<any>;
    test: (id: string) => Promise<any>;
    revoke: (id: string) => Promise<any>;
  };

  //  PHASE 46: VOICE SCOPES - Permission management
  voiceScope: {
    getDefinitions: () => Promise<any[]>;
    getAll: () => Promise<any[]>;
    get: (scope: string) => Promise<any>;
    enable: (scope: string) => Promise<boolean>;
    disable: (scope: string) => Promise<boolean>;
    setConfirmation: (scope: string, level: string) => Promise<boolean>;
    addTarget: (scope: string, target: string) => Promise<boolean>;
    removeTarget: (scope: string, target: string) => Promise<boolean>;
    getTargets: (scope: string) => Promise<string[]>;
    isAllowed: (scope: string) => Promise<boolean>;
    isTargetAllowed: (scope: string, target: string) => Promise<boolean>;
    reset: () => Promise<boolean>;
  };

  //  PHASE 46: VOICE FEEDBACK - Visual/audio feedback
  voiceFeedback: {
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<any>;
    getHistory: (limit?: number) => Promise<any[]>;
    clearHistory: () => Promise<boolean>;
  };

  //  AI DISABLED - Privacy-first system uses local Pattern Learning instead
  ai: {
    getStatus: () => Promise<{ enabled: false; hasProviders: false; activeProvider: null; providers: [] }>;
    setEnabled: (enabled: boolean) => Promise<false>;
  };

  //  PHASE 62: UNIVERSAL CODE EDITOR - Multi-language development
  code: {
    // File operations
    getFiles: (folder?: string | null) => Promise<Array<{
      id: string;
      name: string;
      path: string;
      language: string;
      size: number;
      lastModified: number;
    }>>;
    readFile: (fileId: string) => Promise<string>;
    saveFile: (file: {
      id: string;
      name: string;
      path: string;
      language: string;
      content: string;
    }) => Promise<boolean>;
    deleteFile: (fileId: string) => Promise<boolean>;
    createFile: (language: string) => Promise<{
      id: string;
      name: string;
      path: string;
      language: string;
    }>;
    
    // Folder operations
    getFolders: () => Promise<Array<{ id: string; name: string; path: string }>>;
    createFolder: (path: string) => Promise<boolean>;
    
    // Search
    searchFiles: (query: string) => Promise<Array<{
      id: string;
      name: string;
      path: string;
      language: string;
    }>>;
    
    // Recent files
    getRecent: () => Promise<Array<{
      id: string;
      name: string;
      path: string;
      language: string;
      lastModified: number;
    }>>;
    addToRecent: (fileId: string) => Promise<boolean>;
  };

  //  PHASE 63: ACTIVITY & NOTIFICATIONS
  activity: {
    getAll: () => Promise<Array<{
      id: string;
      type: 'info' | 'success' | 'warning' | 'error' | 'ai' | 'automation';
      title: string;
      message?: string;
      timestamp: number;
      read: boolean;
      source?: string;
    }>>;
    getRecent: () => Promise<Array<{
      id: string;
      type: 'file' | 'note' | 'task' | 'workflow';
      name: string;
      timestamp: number;
    }>>;
    markRead: (id: string) => Promise<boolean>;
    markAllRead: () => Promise<boolean>;
    clearAll: () => Promise<boolean>;
    onNew: (callback: (event: unknown, activity: unknown) => void) => void;
    offNew: (callback: (event: unknown, activity: unknown) => void) => void;
  };

  //  PHASE 63: PROJECTS
  projects: {
    getAll: () => Promise<Array<{
      id: string;
      name: string;
      color: string;
      lastAccessed: number;
    }>>;
    create: (project: { name: string; color?: string }) => Promise<{ id: string; name: string; color: string }>;
    update: (projectId: string, updates: { name?: string; color?: string }) => Promise<boolean>;
    delete: (projectId: string) => Promise<boolean>;
    setActive: (projectId: string | null) => Promise<boolean>;
    getActive: () => Promise<{ id: string; name: string; color: string } | null>;
  };

  //  PHASE 58-59: GOVERNANCE CONTRACT - AI + Plugin boundaries & post-launch rules
  governanceContract: {
    // Status
    getStatus: () => Promise<{
      aiEnabled: boolean;
      pluginsEnabled: boolean;
      violationCount: number;
      pendingActions: number;
      contractsActive: boolean;
    }>;
    
    // Contracts (read-only, immutable)
    getContracts: () => Promise<{
      coreLaws: Record<string, boolean>;
      performance: Record<string, number | boolean>;
      aiBoundaries: Record<string, boolean | number>;
      pluginBoundaries: Record<string, boolean | number>;
      dataFlow: Record<string, boolean>;
      evolution: Record<string, boolean>;
      forbidden: string[];
    }>;
    
    // Violations
    getViolations: () => Promise<Array<{
      type: 'ai' | 'plugin' | 'core' | 'data';
      rule: string;
      description: string;
      severity: 'warning' | 'violation' | 'critical';
      timestamp: number;
      source?: string;
    }>>;
    clearViolations: () => Promise<boolean>;
    
    // Pending Actions (mediated execution)
    getPendingActions: () => Promise<Array<{
      id: string;
      source: 'ai' | 'plugin' | 'user';
      type: 'suggestion' | 'transform' | 'execute';
      description: string;
      preview?: string;
      requiresApproval: boolean;
      approved: boolean;
    }>>;
    approveAction: (actionId: string) => Promise<boolean>;
    rejectAction: (actionId: string) => Promise<boolean>;
    
    // Action History
    getActionHistory: () => Promise<Array<{
      id: string;
      source: 'ai' | 'plugin' | 'user';
      type: string;
      description: string;
      executedAt?: number;
    }>>;
    clearHistory: () => Promise<boolean>;
    
    // Validation (for testing/debugging)
    validateExecution: (request: {
      source: 'ai' | 'plugin' | 'user' | 'core';
      action: string;
      target?: string;
    }) => Promise<{ allowed: boolean; reason?: string }>;
    validateDataFlow: (from: string, to: string, dataType: string) => Promise<{ allowed: boolean; reason?: string }>;
  };

  // Clipboard History - OS-level clipboard management
  clipboard: {
    getHistory: (filter?: any) => Promise<any[]>;
    get: (id: string) => Promise<any | null>;
    paste: (id: string) => Promise<boolean>;
    pin: (id: string, pinned: boolean) => Promise<boolean>;
    favorite: (id: string, favorite: boolean) => Promise<boolean>;
    tag: (id: string, tags: string[]) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    clear: (keepPinned?: boolean) => Promise<{ deleted: number }>;
    search: (query: string) => Promise<any[]>;
    stats: () => Promise<any>;
    getConfig: () => Promise<any>;
    setConfig: (config: any) => Promise<any>;
    pause: () => Promise<{ success: boolean }>;
    resume: () => Promise<{ success: boolean }>;
    capture: () => Promise<any>;
  };

  // Voice Notes - Local voice recording & storage
  voiceNotes: {
    getAll: () => Promise<any[]>;
    getById: (id: string) => Promise<any | null>;
    save: (audioData: ArrayBuffer, metadata: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<any>;
    delete: (id: string) => Promise<boolean>;
    togglePin: (id: string) => Promise<boolean>;
    getPath: (id: string) => Promise<string | null>;
    search: (query: string) => Promise<any[]>;
    getRecent: (limit?: number) => Promise<any[]>;
    getPinned: () => Promise<any[]>;
    getStats: () => Promise<{ count: number; totalDuration: number; totalSize: number }>;
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<any>;
  };

  // ===========================================================================
  // SYSTEM STORAGE, AUTOMATION & LEARNING INTELLIGENCE
  // ===========================================================================

  // System Storage - Efficient structured storage
  storage: {
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<boolean>;
    getStats: () => Promise<any>;
    getLocations: () => Promise<any>;
    store: (type: string, id: string, data: any) => Promise<boolean>;
    retrieve: (type: string, id: string) => Promise<any>;
    delete: (type: string, id: string) => Promise<boolean>;
    indexFile: (filePath: string, metadata: any) => Promise<boolean>;
    search: (query: string, types?: string[]) => Promise<any[]>;
    listByType: (type: string) => Promise<any[]>;
    runCleanup: () => Promise<any>;
  };

  // Automation Engine - Real end-to-end automation
  automationEngine: {
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<boolean>;
    getAll: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (automation: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    preview: (id: string) => Promise<any>;
    execute: (id: string, forceManual?: boolean) => Promise<any>;
    cancel: (id: string) => Promise<boolean>;
    undo: (executionId: string) => Promise<any>;
    getLogs: (limit?: number) => Promise<any[]>;
    getRunning: () => Promise<any[]>;
    getApprovalQueue: () => Promise<any[]>;
    approve: (automationId: string) => Promise<boolean>;
    deny: (automationId: string) => Promise<boolean>;
  };

  // Processing Pipeline - Download Process Summarize
  pipeline: {
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<boolean>;
    processFile: (filePath: string, options?: any) => Promise<any>;
    selectAndProcess: (options?: any) => Promise<any>;
    getPendingFiles: () => Promise<any[]>;
    dismissPending: (id: string) => Promise<boolean>;
    getActiveJobs: () => Promise<any[]>;
    getCompletedJobs: (limit?: number) => Promise<any[]>;
    getJob: (id: string) => Promise<any>;
    cancelJob: (id: string) => Promise<boolean>;
  };

  // Audio Processor - Voice Value workflows
  audio: {
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<boolean>;
    import: (filePath?: string) => Promise<any>;
    saveRecording: (data: ArrayBuffer, format: string, duration: number) => Promise<any>;
    getAllNotes: () => Promise<any[]>;
    getNote: (id: string) => Promise<any>;
    updateNote: (id: string, updates: any) => Promise<any>;
    deleteNote: (id: string) => Promise<boolean>;
    exportNote: (id: string, path?: string) => Promise<string | null>;
    transcribe: (noteId: string, providerId?: string) => Promise<any>;
    summarize: (noteId: string, aiProvider?: string) => Promise<any>;
    linkToFile: (noteId: string, filePath: string) => Promise<boolean>;
    unlinkFromFile: (noteId: string, filePath: string) => Promise<boolean>;
    linkToProject: (noteId: string, projectId: string) => Promise<boolean>;
    getProviders: () => Promise<any[]>;
    addProvider: (provider: any) => Promise<any>;
    updateProvider: (id: string, updates: any) => Promise<boolean>;
    removeProvider: (id: string) => Promise<boolean>;
    setActiveProvider: (id: string | null) => Promise<boolean>;
    getStats: () => Promise<any>;
  };

  // Governance Controller - System-wide control & trust
  governanceCtrl: {
    getStatus: () => Promise<any>;
    getDashboardData: () => Promise<any>;
    enableAll: () => Promise<boolean>;
    disableAll: () => Promise<boolean>;
    setAutomationEnabled: (enabled: boolean) => Promise<boolean>;
    setLearningEnabled: (enabled: boolean) => Promise<boolean>;
    emergencyStop: () => Promise<boolean>;
    getAutomationPermissions: () => Promise<any[]>;
    setAutomationPermission: (id: string, permission: any) => Promise<boolean>;
    canRunAutomation: (id: string) => Promise<any>;
    getLearningConfig: () => Promise<any>;
    updateLearningConfig: (updates: any) => Promise<boolean>;
    clearLearningData: () => Promise<boolean>;
    getLimits: () => Promise<any[]>;
    updateLimit: (id: string, updates: any) => Promise<boolean>;
    checkLimit: (id: string, increment?: number) => Promise<any>;
    getAuditLog: (options?: any) => Promise<any[]>;
  };

  // In-App Help System
  help: {
    getAllTopics: () => Promise<any[]>;
    getTopicsByCategory: (category: string) => Promise<any[]>;
    getTopic: (id: string) => Promise<any>;
    searchTopics: (query: string) => Promise<any[]>;
    getContextualHelp: (featureId: string) => Promise<any>;
    getAllGuides: () => Promise<any[]>;
    getGuide: (id: string) => Promise<any>;
    getCategories: () => Promise<any[]>;
  };

  // Events
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;

  // Creative Apps - File I/O bridge
  creativeApps: {
    showSaveDialog: (options: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath?: string }>;
    showOpenDialog: (options: { title?: string; filters?: Array<{ name: string; extensions: string[] }>; multiple?: boolean }) => Promise<{ canceled: boolean; filePaths?: string[] }>;
    saveFile: (filePath: string, data: ArrayBuffer | string) => Promise<boolean>;
    readFile: (filePath: string) => Promise<ArrayBuffer | null>;
  };

  // DEX Rewind - Activity Logger (Phase 1 + Phase 2)
  rewind: {
    // Phase 1
    getTimeline: (dateStr?: string, filterType?: string) => Promise<any[]>;
    search: (query: string, daysBack?: number) => Promise<any[]>;
    getSettings: () => Promise<any>;
    updateSettings: (updates: any) => Promise<any>;
    toggleRecording: () => Promise<boolean>;
    deleteAllData: () => Promise<boolean>;
    getStorageInfo: () => Promise<any>;
    isRecording: () => Promise<boolean>;
    getDaySummary: (dateStr?: string) => Promise<any>;
    // Phase 2 -- Screenshots
    getScreenshots: (dateStr?: string) => Promise<any[]>;
    getScreenshotData: (filepath: string) => Promise<string | null>;
    getScreenshotStorageInfo: () => Promise<{ totalSizeBytes: number; totalCount: number }>;
    openScreenshotsFolder: () => Promise<boolean>;
    captureScreenshotNow: () => Promise<boolean>;
    // Phase 2 -- Smart Summary
    getSmartSummary: (dateStr?: string) => Promise<any>;
    generateSummaryNow: (dateStr?: string) => Promise<any>;
    getWeekSummaries: () => Promise<any[]>;
    exportSummary: (dateStr?: string) => Promise<string | null>;
    // Phase 2 -- AI Status
    getAIStatus: () => Promise<{ available: boolean; enabled: boolean; model: string }>;
    // User profile
    getUsername: () => Promise<string>;
    getAppVersion: () => Promise<string>;
    // Phase 4 -- Learning Engine
    getLearningStatus: () => Promise<any>;
    getLearnedPatterns: () => Promise<any>;
    getPredictedNextApp: () => Promise<string | null>;
    getPeakWindow: () => Promise<any>;
    isInPeakWindow: () => Promise<boolean>;
    getSuggestedDistractions: () => Promise<string[]>;
    recordSearchClick: (query: string, entryId: string) => Promise<boolean>;
    // Phase 4 -- Security Layer
    getSecurityStatus: () => Promise<any>;
    runIntegrityCheck: () => Promise<any>;
    getAuditLog: (limit?: number) => Promise<any[]>;
    isSessionLocked: () => Promise<boolean>;
    unlockSession: () => Promise<boolean>;
    // Phase 4 -- DEX Bridge
    getBridgeStatus: () => Promise<any>;
    isDndActive: () => Promise<boolean>;
    // Phase 4 -- Combined Backend Status
    getBackendStatus: () => Promise<any>;
    // Phase 5 -- Crash Recovery
    getCrashRecoveryStatus: () => Promise<any>;
    restoreCrashedSession: () => Promise<{ restored: boolean; reason: string }>;
    dismissCrashRecovery: () => Promise<boolean>;
    // Phase 5 -- Backup
    getBackupSettings: () => Promise<any>;
    setBackupSchedule: (schedule: 'daily' | '3days' | 'weekly') => Promise<boolean>;
    setBackupFolder: (folder: string) => Promise<boolean>;
    runBackupNow: () => Promise<any>;
    pickBackupFolder: () => Promise<string | null>;
    restoreBackupFromPicker: () => Promise<any>;
    // Phase 5 -- Profiles
    getWorkspaceProfiles: () => Promise<any[]>;
    getActiveWorkspaceProfile: () => Promise<any>;
    saveWorkspaceProfile: (profile: any) => Promise<any>;
    deleteWorkspaceProfile: (profileId: string) => Promise<boolean>;
    // Phase 5 -- Onboarding
    getOnboardingState: () => Promise<{ completed: boolean }>;
    skipOnboarding: () => Promise<boolean>;
    completeOnboarding: (payload: {
      excludedApps: string[];
      screenshotsEnabled: boolean;
      aiSearchEnabled: boolean;
      autoDelete30Days: boolean;
    }) => Promise<boolean>;
    // Phase 5 -- Focus recovery
    setFocusSessionState: (state: Record<string, any> | null) => Promise<boolean>;
    getFocusSessionState: () => Promise<Record<string, any> | null>;
    startFocusSession: (goalText: string) => Promise<any>;
    endFocusSession: () => Promise<any>;
    getFocusSessions: () => Promise<any[]>;
    // Phase 6 -- Analytics
    getAnalyticsSnapshot: () => Promise<any>;
    recomputeAnalyticsNow: () => Promise<any>;
    // Phase 7 -- Plugins
    getPlugins: () => Promise<any[]>;
    setPluginEnabled: (id: string, enabled: boolean) => Promise<boolean>;
    reloadPlugins: () => Promise<any[]>;
    openPluginsFolder: () => Promise<boolean>;
    getPluginCommands: () => Promise<Array<{ pluginId: string; name: string }>>;
    runPluginCommand: (pluginId: string, name: string, payload?: any) => Promise<any>;
    // Phase 7 -- Logging
    getTodayLogs: () => Promise<string>;
    openLogsFolder: () => Promise<boolean>;
    onBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => void;
    offBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => void;
  };

  // DTP: DEX Transfer Protocol - high-speed device-to-device transfers
  dtp: {
    startServer: () => Promise<any>;
    stopServer: () => Promise<any>;
    startDiscovery: () => Promise<any>;
    stopDiscovery: () => Promise<any>;
    getDevices: () => Promise<any[]>;
    refreshDevices: () => Promise<any>;
    sendFiles: (args: { files: string[]; targetAddress: string; targetPort?: number; sessionToken: string }) => Promise<any>;
    cancelSend: (transferId: string) => Promise<any>;
    pauseSend: (transferId: string) => Promise<any>;
    resumeSend: (transferId: string) => Promise<any>;
    approveDevice: (deviceId: string) => Promise<any>;
    denyDevice: (deviceId: string) => Promise<any>;
    pauseReceive: (transferId: string) => Promise<any>;
    cancelReceive: (transferId: string) => Promise<any>;
    getHistory: (limit?: number) => Promise<any[]>;
    getTrustedDevices: () => Promise<any[]>;
    removeTrustedDevice: (deviceId: string) => Promise<any>;
    measureBandwidth: (args: { address: string; port?: number }) => Promise<any>;
    onDeviceFound: (callback: (device: any) => void) => void;
    onDeviceLost: (callback: (device: any) => void) => void;
    onDevicePending: (callback: (info: any) => void) => void;
    onSendProgress: (callback: (progress: any) => void) => void;
    onSendComplete: (callback: (result: any) => void) => void;
    onSendError: (callback: (error: any) => void) => void;
    onTransferProgress: (callback: (info: any) => void) => void;
    onTransferComplete: (callback: (info: any) => void) => void;
    onTransferError: (callback: (info: any) => void) => void;
    offDeviceFound: (callback: (device: any) => void) => void;
    offDeviceLost: (callback: (device: any) => void) => void;
    offSendProgress: (callback: (progress: any) => void) => void;
    offTransferProgress: (callback: (info: any) => void) => void;
  };

  //  User Profile API
  user: {
    getProfile: () => Promise<{ username: string; displayName: string; hostname: string; platform: string; arch: string }>;
  };
}
const invokePrefixAllowlist = [
  // Core system channels
  'intent:',
  'intelligence:',
  'workflowIntelligence:',
  'sessionMemory:',
  'transferIntelligence:',
  'searchIntelligence:',
  'learningSystem:',
  'learningEngine:',
  'workflowPredictor:',
  'storage:',
  'automationEngine:',
  'pipeline:',
  'governance:',
  'recovery:',
  'eventBus:',
  'linkgraph:',
  'observability:',
  'phase51:',
  'safeMode:',
  'q1Foundation:',
  'authHardening:',
  'vaultHardening:',
  'sessionHardening:',
  'creativeApps:',
  // App & feature channels
  'rewind:',
  'audio:',
  'theme:',
  'capability:',
  'files:',
  'notes:',
  'auth:',
  'settings:',
  'shell:',
  'splitview:',
  'power:',
  'xenon:',
  'patterns:',
  'stability:',
  'memory:',
  'permission:',
  'automation:',
  'search:',
  'media:',
  'dashboard:',
  'sessions:',
  'activity:',
  'projects:',
  'system:',
  'tasks:',
  'workflows:',
  'gallery:',
  'download:',
  'window:',
  'app:',
  'mode:',
  'rule:',
  'action:',
  'log:',
  'data:',
  'health:',
  'diagnostics:',
  'encryption:',
  'security:',
  'vault:',
  'trust:',
  'watchdog:',
  'device:',
  'connection:',
  'scheduler:',
  'plugin:',
  'voice:',
  'hotkey:',
  'transfer:',
  'update:',
  'sync:',
  'api:',
  'video:',
  // Unified Systems (13 Production Subsystems)
  'notification-center:',
  'global-search:',
  'media-library:',
  'version-history:',
  'task-queue:',
  'recycle-bin:',
  'layout:',
  'deeplink:',
  'scratchpad:',
  'localization:',
  'feedback:',
  'multiwindow:',
  'batch:',
  'state-sync:',
  // Deep Backend Systems (11-Part Architecture Pass)
  'perf-instrument:',
  'db-cluster:',
  'plugin-gate:',
  'event-bus:',
  'intelligence:',
  'startup-sequencer:',
  'shutdown-sequencer:',
  'thread:',
  'plugin-security:',
  'motion:',
  // DEX Rewind System Journal (5-Part Architecture)
  'journal:',
  // Feature Suite (38 New Subsystems)
  'session-replay:',
  'project-linker:',
  'daily-briefing:',
  'relationship-graph:',
  'time-tracking:',
  'goals:',
  'snapshot-comparison:',
  'project-health:',
  'duplication-detector:',
  'keyboard-nav:',
  'project-archiver:',
  'daily-note:',
  'content-expiry:',
  'search-history:',
  'live-collaboration:',
  'smart-grouping:',
  'voice-memo:',
  'project-timeline:',
  'link-preview:',
  'stats-dashboard:',
  'export-bundle:',
  'file-watcher:',
  'word-count:',
  'smart-rename:',
  'vinx-presentation:',
  'project-comparison:',
  'dashboard:',
  'reminder:',
  'fts:',
  'dependencies:',
  'color-labels:',
  'read-later:',
  'bulk-metadata:',
  'activity-feed:',
  'project-lock:',
  'theme-schedule:',
  'nl-task:',
  'changelog:',
  // Game System
  'game-system:',
  // DEX Notes (SQLite-backed)
  'dexnotes:',
  // OS Mode Shell
  'os:',
  'dex:',
  // Rust Native Module IPC
  'native:',
  'native-core:',
  // UKI Voice Assistant
  'uki:',
  // File Watcher
  'watch:',
  // File system access
  'fs:',
  // Workflow script execution
  'workflow:',
  // Inner App Stability
  'stability:',
  // System Completeness
  'multimonitor:',
  'multiuser:',
  'devplatform:',
  'licensing:',
  'help:',
  'i18n:',
  'migration:',
  'backup:',
  'import:',
  'health:',
  'uninstall:',
  'user:',
  // Network mode + connection control (NetworkGuard)
  'network:',
  // PTY / terminal sessions (DexCode terminal)
  'pty:',
  // Creator-only unlock surface (Ed25519 signed challenge / token)
  'creator:',
  // Standalone app channels
  'screencapture:',
  'dialog:',
  // Phase 3 host bridges (Store, Games, Capability, Snapshot, Sync)
  'store:',
  'games:',
  'capability:',
  'snapshot:',
  'sync:',
];

const invokeExactAllowlist = new Set(['intent:getStatus', 'startup:timeline', 'renderer:heartbeat']);
const listenerWrappers = new WeakMap<(...args: any[]) => void, (...args: any[]) => void>();

function isAllowedDynamicInvokeChannel(channel: string): boolean {
  if (invokeExactAllowlist.has(channel)) {
    return true;
  }
  // Block channels containing traversal or injection patterns
  if (channel.includes('..') || channel.includes('\0') || channel.includes('\\')) {
    return false;
  }
  return invokePrefixAllowlist.some(prefix => channel.startsWith(prefix));
}

const api: DexAPI = {
  // Generic invoke for dynamic IPC calls (used by Intent Sessions and Next-Gen systems)
  invoke: (channel: string, ...args: any[]) => {
    if (!isAllowedDynamicInvokeChannel(channel)) {
      throw new Error(`Blocked IPC invoke channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  platform: {
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
    isLinux: process.platform === 'linux',
    os: process.platform,
    homeDir: process.env.HOME || process.env.USERPROFILE || '',
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    hide: () => ipcRenderer.invoke('window:hide'),
    setTitleBarOverlay: (enabled: boolean) => ipcRenderer.invoke('window:setTitleBarOverlay', enabled),
    enterCompact: (opts?: { width?: number; height?: number; corner?: string }) => ipcRenderer.invoke('window:enter-compact', opts),
    exitCompact: () => ipcRenderer.invoke('window:exit-compact'),
  },

  actions: {
    execute: (action) => ipcRenderer.invoke('action:execute', action),
    getAll: () => ipcRenderer.invoke('action:getAll'),
    save: (action) => ipcRenderer.invoke('action:save', action),
    delete: (actionId) => ipcRenderer.invoke('action:delete', actionId),
    getRunningApps: () => ipcRenderer.invoke('action:getRunningApps'),
    closeApp: (pid) => ipcRenderer.invoke('action:closeApp', pid),
  },

  modes: {
    getAll: () => ipcRenderer.invoke('mode:getAll'),
    getActive: () => ipcRenderer.invoke('mode:getActive'),
    activate: (modeId) => ipcRenderer.invoke('mode:activate', modeId),
    deactivate: () => ipcRenderer.invoke('mode:deactivate'),
    save: (mode) => ipcRenderer.invoke('mode:save', mode),
    delete: (modeId) => ipcRenderer.invoke('mode:delete', modeId),
  },

  rules: {
    getAll: () => ipcRenderer.invoke('rule:getAll'),
    save: (rule) => ipcRenderer.invoke('rule:save', rule),
    delete: (ruleId) => ipcRenderer.invoke('rule:delete', ruleId),
    toggle: (ruleId, enabled) => ipcRenderer.invoke('rule:toggle', ruleId, enabled),
  },

  system: {
    getStatus: () => ipcRenderer.invoke('system:getStatus'),
    getProcesses: () => ipcRenderer.invoke('system:getProcesses'),
    killProcess: (pid: number, force?: boolean) => ipcRenderer.invoke('system:killProcess', pid, !!force),
    // Performance Reservation (lower priority of background processes)
    claimResources: (enable: boolean, options?: Record<string, unknown>) =>
      ipcRenderer.invoke('system:claimResources', enable, options),
    reservationStatus: () => ipcRenderer.invoke('system:reservationStatus'),
    releasePid: (pid: number) => ipcRenderer.invoke('system:releasePid', pid),
  },

  defense: {
    status: () => ipcRenderer.invoke('defense:status'),
    report: (signal: unknown) => ipcRenderer.invoke('defense:report', signal),
    lockdown: (enable: boolean) => ipcRenderer.invoke('defense:lockdown', enable),
    onSnapshot: (cb: (p: unknown) => void) => { ipcRenderer.on('defense:snapshot', (_e, p) => cb(p)); },
    onQuarantine: (cb: (p: unknown) => void) => { ipcRenderer.on('defense:quarantine', (_e, p) => cb(p)); },
    onVaultLock: (cb: (p: unknown) => void) => { ipcRenderer.on('defense:vault-lock', (_e, p) => cb(p)); },
    onNetworkLockdown: (cb: (p: unknown) => void) => { ipcRenderer.on('defense:network-lockdown', (_e, p) => cb(p)); },
    onRestoreFiles: (cb: (p: unknown) => void) => { ipcRenderer.on('defense:restore-files', (_e, p) => cb(p)); },
    onNexusEmergency: (cb: (p: unknown) => void) => { ipcRenderer.on('nexus:emergency', (_e, p) => cb(p)); },
  },

  nexusBio: {
    list: () => ipcRenderer.invoke('nexus:biometric:list'),
    enroll: (payload: { kind: string; label?: string }) => ipcRenderer.invoke('nexus:biometric:enroll', payload),
    test: (id: string) => ipcRenderer.invoke('nexus:biometric:test', id),
    revoke: (id: string) => ipcRenderer.invoke('nexus:biometric:revoke', id),
  },

  power: {
    getStats: () => ipcRenderer.invoke('power:getStats'),
    getProfile: () => ipcRenderer.invoke('power:getProfile'),
    setProfile: (profile) => ipcRenderer.invoke('power:setProfile', profile),
    quickBoost: (duration = 30) => ipcRenderer.invoke('power:quickBoost', duration),
    getResourceHogs: () => ipcRenderer.invoke('power:getResourceHogs'),
    closeProcess: (pid, force = false) => ipcRenderer.invoke('power:closeProcess', pid, force),
    freeMemory: () => ipcRenderer.invoke('power:freeMemory'),
    getSuggestedCleanup: () => ipcRenderer.invoke('power:getSuggestedCleanup'),
    setCpuLimit: (val: number) => ipcRenderer.invoke('power:setCpuLimit', val),
    setGpuLimit: (val: number) => ipcRenderer.invoke('power:setGpuLimit', val),
    setFanCurve: (val: number) => ipcRenderer.invoke('power:setFanCurve', val),
  },

  os: {
    lockScreen: () => ipcRenderer.invoke('os:lockScreen'),
    shutdown: () => ipcRenderer.invoke('os:shutdown'),
    restart: () => ipcRenderer.invoke('os:restart'),
    sleep: () => ipcRenderer.invoke('os:sleep'),
  },

  operations: {
    execute: (operationId) => ipcRenderer.invoke('operations:execute', operationId),
    undo: (logId) => ipcRenderer.invoke('operations:undo', logId),
    getLogs: (limit = 20) => ipcRenderer.invoke('operations:getLogs', limit),
  },

  // Phase 5: Workflows (Composed Operations)
  workflows: {
    getAll: () => ipcRenderer.invoke('workflows:getAll'),
    getTemplates: () => ipcRenderer.invoke('workflows:getTemplates'),
    save: (workflow) => ipcRenderer.invoke('workflows:save', workflow),
    delete: (workflowId) => ipcRenderer.invoke('workflows:delete', workflowId),
    duplicate: (workflowId) => ipcRenderer.invoke('workflows:duplicate', workflowId),
    togglePin: (workflowId) => ipcRenderer.invoke('workflows:togglePin', workflowId),
    execute: (workflowId) => ipcRenderer.invoke('workflows:execute', workflowId),
  },

  // Phase 6: Sessions (Work Sessions, Notes, Timers, Running Tasks)
  sessions: {
    getCurrent: () => ipcRenderer.invoke('sessions:getCurrent'),
    start: (name) => ipcRenderer.invoke('sessions:start', name),
    end: (sessionId) => ipcRenderer.invoke('sessions:end', sessionId),
    getHistory: () => ipcRenderer.invoke('sessions:getHistory'),
    // Notes
    getNotes: () => ipcRenderer.invoke('sessions:getNotes'),
    addNote: (noteData) => ipcRenderer.invoke('sessions:addNote', noteData),
    updateNote: (noteId, updates) => ipcRenderer.invoke('sessions:updateNote', noteId, updates),
    deleteNote: (noteId) => ipcRenderer.invoke('sessions:deleteNote', noteId),
    // Timers
    getTimers: () => ipcRenderer.invoke('sessions:getTimers'),
    createTimer: (timerData) => ipcRenderer.invoke('sessions:createTimer', timerData),
    startTimer: (timerId) => ipcRenderer.invoke('sessions:startTimer', timerId),
    pauseTimer: (timerId) => ipcRenderer.invoke('sessions:pauseTimer', timerId),
    stopTimer: (timerId) => ipcRenderer.invoke('sessions:stopTimer', timerId),
    deleteTimer: (timerId) => ipcRenderer.invoke('sessions:deleteTimer', timerId),
    // Running Tasks
    getRunningTasks: () => ipcRenderer.invoke('sessions:getRunningTasks'),
    stopTask: (taskId) => ipcRenderer.invoke('sessions:stopTask', taskId),
  },

  logs: {
    get: (limit = 100) => ipcRenderer.invoke('logs:get', limit),
    clear: () => ipcRenderer.invoke('logs:clear'),
  },

  permissions: {
    getAll: () => ipcRenderer.invoke('permissions:getAll'),
    grant: (permission) => ipcRenderer.invoke('permissions:grant', permission),
    revoke: (permission) => ipcRenderer.invoke('permissions:revoke', permission),
  },

  embedding: {
    compute: (text: string) => ipcRenderer.invoke('embedding:compute', text),
    computeBatch: (texts: string[]) => ipcRenderer.invoke('embedding:compute-batch', texts),
  },

  emergency: {
    stop: () => ipcRenderer.invoke('emergency:stop'),
    resume: () => ipcRenderer.invoke('emergency:resume'),
  },

  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Phase 10: Data management (Export/Import/Reset)
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
    reset: () => ipcRenderer.invoke('data:reset'),
    stats: () => ipcRenderer.invoke('data:stats'),
    exportCollection: (collection) => ipcRenderer.invoke('data:exportCollection', collection),
    exportToFolder: (options) => ipcRenderer.invoke('data:exportToFolder', options),
    importFromFolder: () => ipcRenderer.invoke('data:importFromFolder'),
    createBackup: () => ipcRenderer.invoke('data:createBackup'),
    listBackups: () => ipcRenderer.invoke('data:listBackups'),
    restoreBackup: (backupPath) => ipcRenderer.invoke('data:restoreBackup', backupPath),
    openFolder: () => ipcRenderer.invoke('data:openFolder'),
    getLocations: () => ipcRenderer.invoke('data:getLocations'),
  },

  // Phase 10: Watchdog (Self-monitoring)
  watchdog: {
    health: () => ipcRenderer.invoke('watchdog:health'),
    check: () => ipcRenderer.invoke('watchdog:check'),
    diagnostics: () => ipcRenderer.invoke('watchdog:diagnostics'),
    clearErrors: () => ipcRenderer.invoke('watchdog:clearErrors'),
  },

  // Phase 11: Updates
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    skip: (version) => ipcRenderer.invoke('updates:skip', version),
    remindLater: (hours?: number) => ipcRenderer.invoke('updates:remindLater', hours),
    getInfo: () => ipcRenderer.invoke('updates:getInfo'),
    getPreferences: () => ipcRenderer.invoke('updates:getPreferences'),
    setPreferences: (prefs) => ipcRenderer.invoke('updates:setPreferences', prefs),
    openReleaseNotes: () => ipcRenderer.invoke('updates:openReleaseNotes'),
    getChangelog: () => ipcRenderer.invoke('updates:getChangelog'),
    getReleaseNotesForVersion: (version: string) => ipcRenderer.invoke('updates:getReleaseNotesForVersion', version),
    onInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, payload: { version: string; backupPath?: string | null; timestamp: number }) => callback(payload);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('update:installed', wrapped);
    },
    offInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('update:installed', wrapped);
      listenerWrappers.delete(callback as any);
    },
    // Phase 66: Release Manager additions
    getConfig: () => ipcRenderer.invoke('update:getConfig'),
    listBackups: () => ipcRenderer.invoke('update:listBackups'),
    rollback: (backupId: string) => ipcRenderer.invoke('update:rollback', backupId),
    deleteBackup: (backupId: string) => ipcRenderer.invoke('update:deleteBackup', backupId),
    getUpdateHistory: () => ipcRenderer.invoke('update:getHistory'),
    // v4.0.0: Pro 30-day downgrade window
    canDowngrade: () => ipcRenderer.invoke('updates:canDowngrade'),
    downgrade: (targetVersion?: string) => ipcRenderer.invoke('updates:downgrade', targetVersion),
    getInstallHistory: () => ipcRenderer.invoke('updates:getInstallHistory'),
    // Cache reclaim
    pruneCache: () => ipcRenderer.invoke('updates:pruneCache'),
  },

  // Phase 11: Diagnostics
  diagnostics: {
    getPreferences: () => ipcRenderer.invoke('diagnostics:getPreferences'),
    setPreferences: (prefs) => ipcRenderer.invoke('diagnostics:setPreferences', prefs),
    getLogs: (count) => ipcRenderer.invoke('diagnostics:getLogs', count),
    getLogFile: (date) => ipcRenderer.invoke('diagnostics:getLogFile', date),
    listLogFiles: () => ipcRenderer.invoke('diagnostics:listLogFiles'),
    clearLogs: () => ipcRenderer.invoke('diagnostics:clearLogs'),
    getCrashReports: () => ipcRenderer.invoke('diagnostics:getCrashReports'),
    deleteCrashReport: (id) => ipcRenderer.invoke('diagnostics:deleteCrashReport', id),
    clearCrashReports: () => ipcRenderer.invoke('diagnostics:clearCrashReports'),
    getPerformance: () => ipcRenderer.invoke('diagnostics:getPerformance'),
    getPerformanceHistory: () => ipcRenderer.invoke('diagnostics:getPerformanceHistory'),
    getSystemInfo: () => ipcRenderer.invoke('diagnostics:getSystemInfo'),
    export: () => ipcRenderer.invoke('diagnostics:export'),
    openLogsFolder: () => ipcRenderer.invoke('diagnostics:openLogsFolder'),
    log: (level, category, message, data) => ipcRenderer.invoke('diagnostics:log', level, category, message, data),
    reportError: (error) => ipcRenderer.invoke('diagnostics:reportError', error),
  },

  // Crash Reporter -- local-only crash stats
  crashReporter: {
    getStats: () => ipcRenderer.invoke('crash-reporter:getStats'),
    getRecent: (limit?: number) => ipcRenderer.invoke('crash-reporter:getRecent', limit),
    clear: () => ipcRenderer.invoke('crash-reporter:clear'),
    reportRendererError: (data: { message: string; stack?: string }) =>
      ipcRenderer.invoke('crash-reporter:reportRendererError', data),
  },

  // Authentication
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    getConfig: () => ipcRenderer.invoke('auth:getConfig'),
    biometricsAvailable: () => ipcRenderer.invoke('auth:biometricsAvailable'),
    authenticatePassword: async (password: string) => ipcRenderer.invoke('auth:authenticatePassword', await sealForIPC(password)),
    authenticatePin: async (pin: string) => ipcRenderer.invoke('auth:authenticatePin', await sealForIPC(pin)),
    authenticateBiometric: () => ipcRenderer.invoke('auth:authenticateBiometric'),
    setPassword: async (password: string) => ipcRenderer.invoke('auth:setPassword', await sealForIPC(password)),
    setPin: async (pin: string) => ipcRenderer.invoke('auth:setPin', await sealForIPC(pin)),
    enableBiometric: () => ipcRenderer.invoke('auth:enableBiometric'),
    updateConfig: (updates) => ipcRenderer.invoke('auth:updateConfig', updates),
    lock: () => ipcRenderer.invoke('auth:lock'),
    clearCredentials: async (currentPassword?: string) => ipcRenderer.invoke('auth:clearCredentials', currentPassword ? await sealForIPC(currentPassword) : undefined),
    changePassword: async (currentPassword: string, newPassword: string) => ipcRenderer.invoke('auth:changePassword', await sealForIPC(JSON.stringify({ currentPassword, newPassword }))),
    changePin: async (currentPin: string, newPin: string) => ipcRenderer.invoke('auth:changePin', await sealForIPC(JSON.stringify({ currentPin, newPin }))),
    generateRecoveryCodes: () => ipcRenderer.invoke('auth:generateRecoveryCodes'),
    authenticateRecovery: async (code: string) => ipcRenderer.invoke('auth:authenticateRecovery', await sealForIPC(code)),
    verifySession: async (token: string) => ipcRenderer.invoke('auth:verifySession', await sealForIPC(token)),
    getLockoutStatus: () => ipcRenderer.invoke('auth:getLockoutStatus'),
    onStateChange: (callback) => ipcRenderer.on('auth:stateChanged', (_, state) => callback(state)),
  },

  // Secure Vault - Password Manager & Authenticator
  vault: {
    getState: () => ipcRenderer.invoke('vault:getState'),
    exists: () => ipcRenderer.invoke('vault:exists'),
    create: async (masterPassword: string) => ipcRenderer.invoke('vault:create', await sealForIPC(masterPassword)),
    unlock: async (masterPassword: string) => ipcRenderer.invoke('vault:unlock', await sealForIPC(masterPassword)),
    lock: () => ipcRenderer.invoke('vault:lock'),
    
    getCredentials: () => ipcRenderer.invoke('vault:getCredentials'),
    getCredential: (id) => ipcRenderer.invoke('vault:getCredential', id),
    addCredential: async (credential: any) => ipcRenderer.invoke('vault:addCredential', await sealForIPC(JSON.stringify(credential))),
    updateCredential: async (id: string, updates: any) => ipcRenderer.invoke('vault:updateCredential', id, await sealForIPC(JSON.stringify(updates))),
    deleteCredential: (id) => ipcRenderer.invoke('vault:deleteCredential', id),
    searchCredentials: (query) => ipcRenderer.invoke('vault:searchCredentials', query),
    
    getAuthenticators: () => ipcRenderer.invoke('vault:getAuthenticators'),
    addAuthenticator: async (entry: any) => ipcRenderer.invoke('vault:addAuthenticator', await sealForIPC(JSON.stringify(entry))),
    updateAuthenticator: async (id: string, updates: any) => ipcRenderer.invoke('vault:updateAuthenticator', id, await sealForIPC(JSON.stringify(updates))),
    deleteAuthenticator: (id) => ipcRenderer.invoke('vault:deleteAuthenticator', id),
    generateTOTP: (id) => ipcRenderer.invoke('vault:generateTOTP', id),
    generateTOTPFromSecret: async (secret: string, options: any) => ipcRenderer.invoke('vault:generateTOTPFromSecret', await sealForIPC(secret), options),
    parseOTPUri: async (uri: string) => ipcRenderer.invoke('vault:parseOTPUri', await sealForIPC(uri)),
    
    getSettings: () => ipcRenderer.invoke('vault:getSettings'),
    updateSettings: (updates) => ipcRenderer.invoke('vault:updateSettings', updates),
    
    generatePassword: (options) => ipcRenderer.invoke('vault:generatePassword', options),
    assessPasswordStrength: async (password: string) => ipcRenderer.invoke('vault:assessPasswordStrength', await sealForIPC(password)),
    auditPasswords: () => ipcRenderer.invoke('vault:auditPasswords'),
    copyToClipboard: async (text: string) => ipcRenderer.invoke('vault:copyToClipboard', await sealForIPC(text)),
    
    exportVault: async (exportPassword: string) => ipcRenderer.invoke('vault:exportVault', await sealForIPC(exportPassword)),
    importVault: async (data: string, exportPassword: string) => ipcRenderer.invoke('vault:importVault', data, await sealForIPC(exportPassword)),
    changeMasterPassword: async (currentPassword: string, newPassword: string) => ipcRenderer.invoke('vault:changeMasterPassword', await sealForIPC(currentPassword), await sealForIPC(newPassword)),
    
    onStateChange: (callback) => ipcRenderer.on('vault:stateChanged', (_, state) => callback(state)),
  },

  // System Intelligence - Local-only pattern learning
  intelligence: {
    getState: () => ipcRenderer.invoke('intelligence:getState'),
    getConfig: () => ipcRenderer.invoke('intelligence:getConfig'),
    updateConfig: (updates) => ipcRenderer.invoke('intelligence:updateConfig', updates),
    getSuggestions: () => ipcRenderer.invoke('intelligence:getSuggestions'),
    dismissSuggestion: (id) => ipcRenderer.invoke('intelligence:dismissSuggestion', id),
    acceptSuggestion: (id) => ipcRenderer.invoke('intelligence:acceptSuggestion', id),
    getPatterns: () => ipcRenderer.invoke('intelligence:getPatterns'),
    triggerAnalysis: () => ipcRenderer.invoke('intelligence:triggerAnalysis'),
    clearData: () => ipcRenderer.invoke('intelligence:clearData'),
    recordEvent: (type, target, metadata) => ipcRenderer.invoke('intelligence:recordEvent', type, target, metadata),
    getFileOrganization: (directory) => ipcRenderer.invoke('intelligence:getFileOrganization', directory),
    onStateChange: (callback) => ipcRenderer.on('intelligence:stateChanged', (_, state) => callback(state)),
  },

  // Phase 11: Security
  security: {
    getPermissions: () => ipcRenderer.invoke('security:getPermissions'),
    getPermission: (id) => ipcRenderer.invoke('security:getPermission', id),
    togglePermission: (id, enabled) => ipcRenderer.invoke('security:togglePermission', id, enabled),
    getReport: () => ipcRenderer.invoke('security:getReport'),
    getLog: () => ipcRenderer.invoke('security:getLog'),
    verifySandbox: () => ipcRenderer.invoke('security:verifySandbox'),
    exportAudit: () => ipcRenderer.invoke('security:exportAudit'),
  },

  // Phase 11: Feature Flags
  features: {
    getAll: () => ipcRenderer.invoke('features:getAll'),
    get: (id) => ipcRenderer.invoke('features:get', id),
    isEnabled: (id) => ipcRenderer.invoke('features:isEnabled', id),
    toggle: (id, enabled) => ipcRenderer.invoke('features:toggle', id, enabled),
    resetAll: () => ipcRenderer.invoke('features:resetAll'),
    getStable: () => ipcRenderer.invoke('features:getStable'),
    getExperimental: () => ipcRenderer.invoke('features:getExperimental'),
  },

  // Phase 11: Maintenance
  maintenance: {
    getState: () => ipcRenderer.invoke('maintenance:getState'),
    enable: (reason, scheduledEnd) => ipcRenderer.invoke('maintenance:enable', reason, scheduledEnd),
    disable: () => ipcRenderer.invoke('maintenance:disable'),
  },

  // Phase 24: Health Monitor
  health: {
    check: () => ipcRenderer.invoke('health:check'),
    getStatus: () => ipcRenderer.invoke('health:getStatus'),
    getVerification: () => ipcRenderer.invoke('health:getVerification'),
    getLogs: (options) => ipcRenderer.invoke('health:getLogs', options),
    clearLogs: () => ipcRenderer.invoke('health:clearLogs'),
    exportLogs: () => ipcRenderer.invoke('health:exportLogs'),
    setDiagnosticsEnabled: (enabled) => ipcRenderer.invoke('health:setDiagnosticsEnabled', enabled),
    isDiagnosticsEnabled: () => ipcRenderer.invoke('health:isDiagnosticsEnabled'),
  },

  // Phase 51: Performance & Capability Layer
  phase51: {
    getStatus: () => ipcRenderer.invoke('phase51:getStatus'),
    getReport: () => ipcRenderer.invoke('phase51:getReport'),
    getPerformance: () => ipcRenderer.invoke('phase51:getPerformance'),
    getCapabilities: () => ipcRenderer.invoke('phase51:getCapabilities'),
    getDevices: () => ipcRenderer.invoke('phase51:getDevices'),
    getStability: () => ipcRenderer.invoke('phase51:getStability'),
    getPlugins: () => ipcRenderer.invoke('phase51:getPlugins'),
  },

  // Phase 51: External Devices
  devices: {
    list: () => ipcRenderer.invoke('devices:list'),
    browse: (deviceId, path) => ipcRenderer.invoke('devices:browse', deviceId, path),
    import: (deviceId, paths, dest) => ipcRenderer.invoke('devices:import', deviceId, paths, dest),
    export: (deviceId, paths, dest) => ipcRenderer.invoke('devices:export', deviceId, paths, dest),
  },

  // Phase 51: Capability Layer
  capability: {
    fileSystem: {
      list: (path) => ipcRenderer.invoke('capability:fileSystem:list', path),
      copy: (source, dest) => ipcRenderer.invoke('capability:fileSystem:copy', source, dest),
      move: (source, dest) => ipcRenderer.invoke('capability:fileSystem:move', source, dest),
    },
    transfer: {
      getStats: () => ipcRenderer.invoke('capability:transfer:getStats'),
    },
    storage: {
      get: (key) => ipcRenderer.invoke('capability:storage:get', key),
      set: (key, value) => ipcRenderer.invoke('capability:storage:set', key, value),
    },
  },

  // Phase 12: System Map
  systemMap: {
    get: () => ipcRenderer.invoke('systemMap:get'),
    getHealth: () => ipcRenderer.invoke('systemMap:getHealth'),
    getConnections: () => ipcRenderer.invoke('systemMap:getConnections'),
    getStorage: () => ipcRenderer.invoke('systemMap:getStorage'),
    getSessions: () => ipcRenderer.invoke('systemMap:getSessions'),
    refresh: () => ipcRenderer.invoke('systemMap:refresh'),
    evaluateTransferCapacity: () => ipcRenderer.invoke('systemMap:evaluateTransferCapacity'),
  },

  // Phase 12: Transfers
  transfer: {
    localCopy: (request) => ipcRenderer.invoke('transfer:localCopy', request),
    send: (request) => ipcRenderer.invoke('transfer:send', request),
    getActiveTransfers: () => ipcRenderer.invoke('transfer:getActive'),
    pause: (id) => ipcRenderer.invoke('transfer:pause', id),
    resume: (id) => ipcRenderer.invoke('transfer:resume', id),
    cancel: (id) => ipcRenderer.invoke('transfer:cancel', id),
    getConfig: () => ipcRenderer.invoke('transfer:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('transfer:setConfig', config),
    selectFiles: () => ipcRenderer.invoke('transfer:browseFile'),
    getPermissions: () => ipcRenderer.invoke('transfer:getPermissions'),
    grantPermission: (perm) => ipcRenderer.invoke('transfer:grantPermission', perm),
    revokePermission: (id) => ipcRenderer.invoke('transfer:revokePermission', id),
  },

  // Phase 12: Connection
  connection: {
    getNetworkInfo: () => ipcRenderer.invoke('connection:getNetworkInfo'),
    getPermissions: () => ipcRenderer.invoke('connection:getPermissions'),
    setPermissions: (perms) => ipcRenderer.invoke('connection:setPermissions', perms),
    setNetworkingEnabled: (enabled) => ipcRenderer.invoke('connection:setNetworkingEnabled', enabled),
    getChannels: () => ipcRenderer.invoke('connection:getChannels'),
    openChannel: (config) => ipcRenderer.invoke('connection:openChannel', config),
    closeChannel: (id) => ipcRenderer.invoke('connection:closeChannel', id),
    isTypeAllowed: (type) => ipcRenderer.invoke('connection:isTypeAllowed', type),
    testConnection: (host, port) => ipcRenderer.invoke('connection:testConnection', host, port),
    getLocalIPs: () => ipcRenderer.invoke('connection:getLocalIPs'),
  },

  // Phase 12: Device
  device: {
    getThisDevice: () => ipcRenderer.invoke('device:getThisDevice'),
    setName: (name) => ipcRenderer.invoke('device:setName', name),
    getAll: () => ipcRenderer.invoke('device:getAll'),
    getTrusted: () => ipcRenderer.invoke('device:getTrusted'),
    getOnline: () => ipcRenderer.invoke('device:getOnline'),
    isDiscoveryEnabled: () => ipcRenderer.invoke('device:isDiscoveryEnabled'),
    setDiscoveryEnabled: (enabled) => ipcRenderer.invoke('device:setDiscoveryEnabled', enabled),
    addManual: (ip, port) => ipcRenderer.invoke('device:addManual', ip, port),
    remove: (deviceId) => ipcRenderer.invoke('device:remove', deviceId),
    setTrusted: (deviceId, trusted) => ipcRenderer.invoke('device:setTrusted', deviceId, trusted),
    initiatePairing: (deviceId) => ipcRenderer.invoke('device:initiatePairing', deviceId),
    acceptPairing: (pairingId) => ipcRenderer.invoke('device:acceptPairing', pairingId),
    rejectPairing: (pairingId) => ipcRenderer.invoke('device:rejectPairing', pairingId),
    getSessions: () => ipcRenderer.invoke('device:getSessions'),
    endSession: (sessionId) => ipcRenderer.invoke('device:endSession', sessionId),
  },

  // HTTP Transfer: local network file sharing via HTTP server + QR code
  httpTransfer: {
    start: () => ipcRenderer.invoke('http-transfer:start'),
    stop: () => ipcRenderer.invoke('http-transfer:stop'),
    share: (filePaths: string[]) => ipcRenderer.invoke('http-transfer:share', filePaths),
    unshare: (fileId: string) => ipcRenderer.invoke('http-transfer:unshare', fileId),
    info: () => ipcRenderer.invoke('http-transfer:info'),
    pickAndShare: () => ipcRenderer.invoke('http-transfer:pick-and-share'),
    acceptUpload: (uploadId: string, accept: boolean) => ipcRenderer.invoke('http-transfer:accept-upload', uploadId, accept),
    getPendingUploads: () => ipcRenderer.invoke('http-transfer:pending-uploads'),
  },

  // Phase 14: Deep Session Flow
  deepSession: {
    // Session lifecycle
    start: () => ipcRenderer.invoke('deepSession:start'),
    restore: () => ipcRenderer.invoke('deepSession:restore'),
    end: () => ipcRenderer.invoke('deepSession:end'),
    get: () => ipcRenderer.invoke('deepSession:get'),
    // Page context preservation
    saveContext: (pageId, context) => ipcRenderer.invoke('deepSession:saveContext', pageId, context),
    getContext: (pageId) => ipcRenderer.invoke('deepSession:getContext', pageId),
    navigate: (pageId) => ipcRenderer.invoke('deepSession:navigate', pageId),
    getNavigationHistory: () => ipcRenderer.invoke('deepSession:getNavigationHistory'),
    // Draft management
    saveDraft: (pageId, content) => ipcRenderer.invoke('deepSession:saveDraft', pageId, content),
    getDraft: (pageId) => ipcRenderer.invoke('deepSession:getDraft', pageId),
    getDrafts: () => ipcRenderer.invoke('deepSession:getDrafts'),
    discardDraft: (pageId) => ipcRenderer.invoke('deepSession:discardDraft', pageId),
    // Pinned notes
    pinNote: (noteId) => ipcRenderer.invoke('deepSession:pinNote', noteId),
    unpinNote: (noteId) => ipcRenderer.invoke('deepSession:unpinNote', noteId),
    getPinnedNotes: () => ipcRenderer.invoke('deepSession:getPinnedNotes'),
    // Split view
    setSplitView: (config) => ipcRenderer.invoke('deepSession:setSplitView', config),
    getSplitView: () => ipcRenderer.invoke('deepSession:getSplitView'),
    // Activity & preferences
    recordActivity: () => ipcRenderer.invoke('deepSession:recordActivity'),
    getPreferences: () => ipcRenderer.invoke('deepSession:getPreferences'),
    setPreferences: (prefs) => ipcRenderer.invoke('deepSession:setPreferences', prefs),
  },

  // Phase 16: Encryption
  encryption: {
    getStatus: () => ipcRenderer.invoke('encryption:getStatus'),
    getConfig: () => ipcRenderer.invoke('encryption:getConfig'),
    updateConfig: (updates) => ipcRenderer.invoke('encryption:updateConfig', updates),
    initWithPassword: async (password: string) => ipcRenderer.invoke('encryption:initWithPassword', await sealForIPC(password)),
    initWithSystemKey: () => ipcRenderer.invoke('encryption:initWithSystemKey'),
    unlock: async (password: string) => ipcRenderer.invoke('encryption:unlock', await sealForIPC(password)),
    lock: () => ipcRenderer.invoke('encryption:lock'),
    disable: () => ipcRenderer.invoke('encryption:disable'),
  },

  // Phase 17: Trust & Transparency
  trust: {
    getStatus: () => ipcRenderer.invoke('trust:getStatus'),
    getFullReport: () => ipcRenderer.invoke('trust:getFullReport'),
    getPermissions: () => ipcRenderer.invoke('trust:getPermissions'),
    grantPermission: (permission) => ipcRenderer.invoke('trust:grantPermission', permission),
    revokePermission: (permission) => ipcRenderer.invoke('trust:revokePermission', permission),
    enableRestrictedMode: (allowedPermissions) => ipcRenderer.invoke('trust:enableRestrictedMode', allowedPermissions),
    disableRestrictedMode: () => ipcRenderer.invoke('trust:disableRestrictedMode'),
    runSecurityAudit: () => ipcRenderer.invoke('trust:runSecurityAudit'),
    getAuditLog: (count, category) => ipcRenderer.invoke('trust:getAuditLog', count, category),
    verifyIntegrity: () => ipcRenderer.invoke('trust:verifyIntegrity'),
    getPerformance: () => ipcRenderer.invoke('trust:getPerformance'),
    getDataLocations: () => ipcRenderer.invoke('trust:getDataLocations'),
    getHumanError: (code) => ipcRenderer.invoke('trust:getHumanError', code),
    getArchitecture: () => ipcRenderer.invoke('trust:getArchitecture'),
  },

  // Phase 18: Data Export & User Ownership
  export: {
    data: (options) => ipcRenderer.invoke('export:data', options),
    dataToPath: (path, options) => ipcRenderer.invoke('export:dataToPath', path, options),
    import: () => ipcRenderer.invoke('export:import'),
    importFromPath: (path) => ipcRenderer.invoke('export:importFromPath', path),
    getSummary: () => ipcRenderer.invoke('export:getSummary'),
    getLocations: () => ipcRenderer.invoke('export:getLocations'),
    openDataFolder: () => ipcRenderer.invoke('export:openDataFolder'),
  },

  // Phase 19: File Management
  files: {
    addScope: (folderPath, options) => ipcRenderer.invoke('files:addScope', folderPath, options),
    addScopeWithDialog: () => ipcRenderer.invoke('files:addScopeWithDialog'),
    removeScope: (folderPath) => ipcRenderer.invoke('files:removeScope', folderPath),
    getScopes: () => ipcRenderer.invoke('files:getScopes'),
    isInScope: (targetPath) => ipcRenderer.invoke('files:isInScope', targetPath),
    list: (dirPath, sort) => ipcRenderer.invoke('files:list', dirPath, sort),
    search: (options) => ipcRenderer.invoke('files:search', options),
    recent: (options) => ipcRenderer.invoke('files:recent', options),
    rename: (oldPath, newName) => ipcRenderer.invoke('files:rename', oldPath, newName),
    move: (sourcePath, targetDir) => ipcRenderer.invoke('files:move', sourcePath, targetDir),
    copy: (sourcePath, targetDir) => ipcRenderer.invoke('files:copy', sourcePath, targetDir),
    delete: (filePath) => ipcRenderer.invoke('files:delete', filePath),
    previewBatchRename: (files, rules) => ipcRenderer.invoke('files:previewBatchRename', files, rules),
    executeBatchRename: (files, rules) => ipcRenderer.invoke('files:executeBatchRename', files, rules),
    organizeByType: (dirPath) => ipcRenderer.invoke('files:organizeByType', dirPath),
    undo: () => ipcRenderer.invoke('files:undo'),
    getHistory: () => ipcRenderer.invoke('files:getHistory'),
    clearHistory: () => ipcRenderer.invoke('files:clearHistory'),
  },

  // Phase 19: Task Queue
  tasks: {
    add: (task) => ipcRenderer.invoke('tasks:add', task),
    remove: (taskId) => ipcRenderer.invoke('tasks:remove', taskId),
    reorder: (taskId, newIndex) => ipcRenderer.invoke('tasks:reorder', taskId, newIndex),
    getAll: () => ipcRenderer.invoke('tasks:getAll'),
    getStatus: () => ipcRenderer.invoke('tasks:getStatus'),
    start: () => ipcRenderer.invoke('tasks:start'),
    pause: () => ipcRenderer.invoke('tasks:pause'),
    resume: () => ipcRenderer.invoke('tasks:resume'),
    stop: () => ipcRenderer.invoke('tasks:stop'),
    cancelCurrent: () => ipcRenderer.invoke('tasks:cancelCurrent'),
    clearCompleted: () => ipcRenderer.invoke('tasks:clearCompleted'),
    getTypes: () => ipcRenderer.invoke('tasks:getTypes'),
  },

  // Phase 19: Document Creation
  documents: {
    getTemplates: () => ipcRenderer.invoke('documents:getTemplates'),
    getTemplate: (templateId) => ipcRenderer.invoke('documents:getTemplate', templateId),
    addTemplate: (template) => ipcRenderer.invoke('documents:addTemplate', template),
    removeTemplate: (templateId) => ipcRenderer.invoke('documents:removeTemplate', templateId),
    create: (request) => ipcRenderer.invoke('documents:create', request),
    preview: (request) => ipcRenderer.invoke('documents:preview', request),
    getHistory: () => ipcRenderer.invoke('documents:getHistory'),
    selectOutputDir: () => ipcRenderer.invoke('documents:selectOutputDir'),
  },

  // Phase 19: External Connectors
  connectors: {
    add: (config) => ipcRenderer.invoke('connectors:add', config),
    addWithDialog: () => ipcRenderer.invoke('connectors:addWithDialog'),
    remove: (connectorId) => ipcRenderer.invoke('connectors:remove', connectorId),
    update: (connectorId, updates) => ipcRenderer.invoke('connectors:update', connectorId, updates),
    getAll: () => ipcRenderer.invoke('connectors:getAll'),
    get: (connectorId) => ipcRenderer.invoke('connectors:get', connectorId),
    listFiles: (connectorId, subPath) => ipcRenderer.invoke('connectors:listFiles', connectorId, subPath),
    readFile: (connectorId, relativePath) => ipcRenderer.invoke('connectors:readFile', connectorId, relativePath),
    writeFile: (connectorId, relativePath, content) => ipcRenderer.invoke('connectors:writeFile', connectorId, relativePath, content),
    copyToLocal: (connectorId, relativePath, localPath) => ipcRenderer.invoke('connectors:copyToLocal', connectorId, relativePath, localPath),
    getLog: () => ipcRenderer.invoke('connectors:getLog'),
  },

  // Phase 19: Browser Bridge
  browser: {
    startServer: () => ipcRenderer.invoke('browser:startServer'),
    stopServer: () => ipcRenderer.invoke('browser:stopServer'),
    startPairing: () => ipcRenderer.invoke('browser:startPairing'),
    cancelPairing: () => ipcRenderer.invoke('browser:cancelPairing'),
    disconnect: () => ipcRenderer.invoke('browser:disconnect'),
    getStatus: () => ipcRenderer.invoke('browser:getStatus'),
    navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
    readPage: () => ipcRenderer.invoke('browser:readPage'),
    fillField: async (selector: string, value: string) => ipcRenderer.invoke('browser:fillField', selector, await sealForIPC(value)),
    click: (selector) => ipcRenderer.invoke('browser:click', selector),
    download: (url, filename) => ipcRenderer.invoke('browser:download', url, filename),
    getPendingActions: () => ipcRenderer.invoke('browser:getPendingActions'),
    getActionHistory: () => ipcRenderer.invoke('browser:getActionHistory'),
    cancelAction: (actionId) => ipcRenderer.invoke('browser:cancelAction', actionId),
  },

  // Phase 20: Workflows
  workflow: {
    getAll: () => ipcRenderer.invoke('workflow:getAll'),
    get: (workflowId) => ipcRenderer.invoke('workflow:get', workflowId),
    save: (workflow) => ipcRenderer.invoke('workflow:save', workflow),
    delete: (workflowId) => ipcRenderer.invoke('workflow:delete', workflowId),
    duplicate: (workflowId, newName) => ipcRenderer.invoke('workflow:duplicate', workflowId, newName),
    validate: (workflow) => ipcRenderer.invoke('workflow:validate', workflow),
    getPresets: () => ipcRenderer.invoke('workflow:getPresets'),
    createNew: (name, description) => ipcRenderer.invoke('workflow:createNew', name, description),
    execute: (workflowId, inputs, options) => ipcRenderer.invoke('workflow:execute', workflowId, inputs, options),
    executeNew: (workflow, inputs, options) => ipcRenderer.invoke('workflow:executeNew', workflow, inputs, options),
    pause: () => ipcRenderer.invoke('workflow:pause'),
    resume: () => ipcRenderer.invoke('workflow:resume'),
    abort: () => ipcRenderer.invoke('workflow:abort'),
    getActive: () => ipcRenderer.invoke('workflow:getActive'),
    getHistory: () => ipcRenderer.invoke('workflow:getHistory'),
    getExecution: (executionId) => ipcRenderer.invoke('workflow:getExecution', executionId),
  },

  // Phase 27: Block-Based Automations
  automations: {
    getAll: () => ipcRenderer.invoke('automation:getAll'),
    get: (id) => ipcRenderer.invoke('automation:get', id),
    save: (automation) => ipcRenderer.invoke('automation:save', automation),
    delete: (id) => ipcRenderer.invoke('automation:delete', id),
    execute: (id) => ipcRenderer.invoke('automation:execute', id),
    cancel: (id) => ipcRenderer.invoke('automation:cancel', id),
    toggleFavorite: (id) => ipcRenderer.invoke('automation:toggleFavorite', id),
    duplicate: (id) => ipcRenderer.invoke('automation:duplicate', id),
  },

  // Scripting Engine
  scripting: {
    getScripts: () => ipcRenderer.invoke('scripting:get-scripts'),
    getScript: (id) => ipcRenderer.invoke('scripting:get-script', id),
    createScript: (script) => ipcRenderer.invoke('scripting:create-script', script),
    updateScript: (id, updates) => ipcRenderer.invoke('scripting:update-script', id, updates),
    deleteScript: (id) => ipcRenderer.invoke('scripting:delete-script', id),
    execute: (id) => ipcRenderer.invoke('scripting:execute', id),
    executeCode: (code) => ipcRenderer.invoke('scripting:execute-code', code),
    stop: (id) => ipcRenderer.invoke('scripting:stop', id),
    getTemplates: () => ipcRenderer.invoke('scripting:get-templates'),
  },

  //  User Profile API
  user: {
    getProfile: () => ipcRenderer.invoke('user:getProfile') as Promise<{ username: string; displayName: string; hostname: string; platform: string; arch: string }>,
  },

  //  ULTRA-LOW RESOURCE MODE: Resource Governor API
  resource: {
    getSnapshot: () => ipcRenderer.invoke('resource:getSnapshot'),
    getPressure: () => ipcRenderer.invoke('resource:getPressure'),
    getThrottleLevel: () => ipcRenderer.invoke('resource:getThrottleLevel'),
    getBudgets: () => ipcRenderer.invoke('resource:getBudgets'),
    // User activity tracking - call on any user interaction
    recordActivity: () => ipcRenderer.send('user:activity'),
    // GPU state tracking
    getGPUState: () => ipcRenderer.invoke('gpu:getState'),
    shouldRender: () => ipcRenderer.invoke('gpu:shouldRender'),
    reportRenderStart: () => ipcRenderer.send('gpu:renderStart'),
    reportRenderEnd: () => ipcRenderer.send('gpu:renderEnd'),
  },

  //  120Hz RENDER GOVERNOR: High-refresh rate support
  render: {
    getConfig: () => ipcRenderer.invoke('render:getConfig'),
    getSnapshot: () => ipcRenderer.invoke('render:getSnapshot'),
    reportFrameMetrics: (metrics: any) => ipcRenderer.send('render:frameMetrics', metrics),
    reportStateChange: (state: string) => ipcRenderer.send('render:stateChange', state),
    reportInputEvent: () => ipcRenderer.send('render:inputEvent'),
  },

  //  MOTION DISCIPLINE: Animation control
  motion: {
    getConfig: () => ipcRenderer.invoke('motion:getConfig'),
    getState: () => ipcRenderer.invoke('motion:getState'),
    requestAnimation: (request: any) => ipcRenderer.invoke('motion:requestAnimation', request),
    reportPrefersReduced: (prefers: boolean) => ipcRenderer.send('motion:prefersReduced', prefers),
    reportAnimationStart: () => ipcRenderer.send('motion:animationStart'),
    reportAnimationEnd: () => ipcRenderer.send('motion:animationEnd'),
  },

  //  INPUT LATENCY: Zero-latency input mode
  input: {
    getSnapshot: () => ipcRenderer.invoke('input:getSnapshot'),
    getTargets: () => ipcRenderer.invoke('input:getTargets'),
    shouldDefer: () => ipcRenderer.invoke('input:shouldDefer'),
    reportEvent: (event: any) => ipcRenderer.send('input:event', event),
    reportLatency: (measurement: any) => ipcRenderer.send('input:latency', measurement),
  },

  //  SESSION STABILITY: Long-session support
  stability: {
    getMetrics: () => ipcRenderer.invoke('stability:getMetrics'),
    getSnapshot: () => ipcRenderer.invoke('stability:getSnapshot'),
    getUptime: () => ipcRenderer.invoke('stability:getUptime'),
    compact: () => ipcRenderer.invoke('stability:compact'),
    reportIdle: () => ipcRenderer.send('stability:idle'),
    reportFrameTime: (frameTime: number) => ipcRenderer.send('stability:frameTime', frameTime),
    reportLatency: (latency: number) => ipcRenderer.send('stability:latency', latency),
  },

  //  PERFORMANCE ENFORCER: Guarantees enforcement
  enforce: {
    getSnapshot: () => ipcRenderer.invoke('enforce:getSnapshot'),
    getGuarantees: () => ipcRenderer.invoke('enforce:getGuarantees'),
    getBaseline: () => ipcRenderer.invoke('enforce:getBaseline'),
    check: () => ipcRenderer.invoke('enforce:check'),
    reportMetrics: (metrics: any) => ipcRenderer.send('enforce:metrics', metrics),
  },

  //  UNIVERSAL SEARCH: Global search across Dex and computer files
  search: {
    query: (query, options) => ipcRenderer.invoke('search:query', query, options),
    getStats: () => ipcRenderer.invoke('search:getStats'),
    rebuild: () => ipcRenderer.invoke('search:rebuild'),
  },

  //  FILE SEARCH: Computer file indexing scopes
  fileSearch: {
    getScopes: () => ipcRenderer.invoke('fileSearch:getScopes'),
    addScope: (folderPath) => ipcRenderer.invoke('fileSearch:addScope', folderPath),
    removeScope: (scopePath) => ipcRenderer.invoke('fileSearch:removeScope', scopePath),
    search: (query, options) => ipcRenderer.invoke('fileSearch:search', query, options),
    reindex: (scopePath) => ipcRenderer.invoke('fileSearch:reindex', scopePath),
  },

  // Phase 38: File Intelligence
  fileIntel: {
    // Authorization
    authorizePath: (path) => ipcRenderer.invoke('file-intel:authorize-path', path),
    revokePath: (path) => ipcRenderer.invoke('file-intel:revoke-path', path),
    getAuthorizedPaths: () => ipcRenderer.invoke('file-intel:get-authorized-paths'),
    
    // Scanning & Analysis
    scanDirectory: (path, options) => ipcRenderer.invoke('file-intel:scan-directory', path, options),
    analyzeFile: (path, deep) => ipcRenderer.invoke('file-intel:analyze-file', path, deep),
    analyzeMedia: (path, type) => ipcRenderer.invoke('file-intel:analyze-media', path, type),
    
    // Queries
    getAllFiles: () => ipcRenderer.invoke('file-intel:get-all-files'),
    getFile: (id) => ipcRenderer.invoke('file-intel:get-file', id),
    searchFiles: (query) => ipcRenderer.invoke('file-intel:search-files', query),
    getRecentFiles: (limit) => ipcRenderer.invoke('file-intel:get-recent-files', limit),
    getFilesByType: (type) => ipcRenderer.invoke('file-intel:get-files-by-type', type),
    getStatistics: () => ipcRenderer.invoke('file-intel:get-statistics'),
    
    // Grouping
    groupByType: () => ipcRenderer.invoke('file-intel:group-by-type'),
    groupByDate: (granularity) => ipcRenderer.invoke('file-intel:group-by-date', granularity),
    findDuplicates: () => ipcRenderer.invoke('file-intel:find-duplicates'),
    
    // Organization
    getSuggestions: () => ipcRenderer.invoke('file-intel:get-suggestions'),
    approveSuggestion: (id) => ipcRenderer.invoke('file-intel:approve-suggestion', id),
    applySuggestion: (suggestion) => ipcRenderer.invoke('file-intel:apply-suggestion', suggestion),
    rejectSuggestion: (id) => ipcRenderer.invoke('file-intel:reject-suggestion', id),
    
    // File Operations
    openFile: (path) => ipcRenderer.invoke('file-intel:open-file', path),
    revealInExplorer: (path) => ipcRenderer.invoke('file-intel:reveal-in-explorer', path),
    getThumbnail: (path) => ipcRenderer.invoke('file-intel:get-thumbnail', path),
    
    // Watching
    startWatching: (path, options) => ipcRenderer.invoke('file-intel:start-watching', path, options),
    stopWatching: (path) => ipcRenderer.invoke('file-intel:stop-watching', path),
    getWatcherStatus: () => ipcRenderer.invoke('file-intel:get-watcher-status'),
  },

  //  Phase 39: Security Core - Layered defensive security
  securityCore: {
    getStatus: () => ipcRenderer.invoke('securityCore:getStatus'),
    getLayerStatus: (layer) => ipcRenderer.invoke('securityCore:getLayerStatus', layer),
    getThreats: () => ipcRenderer.invoke('securityCore:getThreats'),
    acknowledgeThreats: (threatIds) => ipcRenderer.invoke('securityCore:acknowledgeThreats', threatIds),
    runSecurityCheck: () => ipcRenderer.invoke('securityCore:runSecurityCheck'),
    getConfig: () => ipcRenderer.invoke('securityCore:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('securityCore:updateConfig', config),
    registerFileIntegrity: (filePath, hash) => ipcRenderer.invoke('securityCore:registerFileIntegrity', filePath, hash),
    verifyFileIntegrity: (filePath) => ipcRenderer.invoke('securityCore:verifyFileIntegrity', filePath),
    createSecureContext: (contextId) => ipcRenderer.invoke('securityCore:createSecureContext', contextId),
    destroySecureContext: (contextId) => ipcRenderer.invoke('securityCore:destroySecureContext', contextId),
    logAuditEvent: (event) => ipcRenderer.invoke('securityCore:logAuditEvent', event),
    getAuditLog: (options) => ipcRenderer.invoke('securityCore:getAuditLog', options),
    exportAuditLog: () => ipcRenderer.invoke('securityCore:exportAuditLog'),
  },

  //  Phase 39: Secure Key Manager - Encryption key lifecycle
  secureKeys: {
    listKeys: () => ipcRenderer.invoke('secureKeys:listKeys'),
    generateKey: (name, purpose) => ipcRenderer.invoke('secureKeys:generateKey', name, purpose),
    deriveKey: async (name: string, passphrase: string, purpose: string) => ipcRenderer.invoke('secureKeys:deriveKey', name, await sealForIPC(passphrase), purpose),
    deleteKey: (keyId) => ipcRenderer.invoke('secureKeys:deleteKey', keyId),
    rotateKey: (keyId) => ipcRenderer.invoke('secureKeys:rotateKey', keyId),
    isLocked: () => ipcRenderer.invoke('secureKeys:isLocked'),
    lock: () => ipcRenderer.invoke('secureKeys:lock'),
    unlock: async (passphrase: string) => ipcRenderer.invoke('secureKeys:unlock', await sealForIPC(passphrase)),
    encrypt: async (keyId: string, data: string) => ipcRenderer.invoke('secureKeys:encrypt', keyId, await sealForIPC(data)),
    decrypt: (keyId, encrypted) => ipcRenderer.invoke('secureKeys:decrypt', keyId, encrypted),
    getKeyInfo: (keyId) => ipcRenderer.invoke('secureKeys:getKeyInfo', keyId),
  },

  //  Phase 39/40: Secure Transfer Hub - Encrypted file transfer
  secureTransfer: {
    initiate: (sourcePath, destinationPath, encrypt) => ipcRenderer.invoke('secureTransfer:initiate', sourcePath, destinationPath, encrypt),
    selectAndInitiate: () => ipcRenderer.invoke('secureTransfer:selectAndInitiate'),
    getTransfers: () => ipcRenderer.invoke('secureTransfer:getTransfers'),
    getActiveTransfers: () => ipcRenderer.invoke('secureTransfer:getActiveTransfers'),
    approveTransfer: (transferId) => ipcRenderer.invoke('secureTransfer:approveTransfer', transferId),
    rejectTransfer: (transferId) => ipcRenderer.invoke('secureTransfer:rejectTransfer', transferId),
    pauseTransfer: (transferId) => ipcRenderer.invoke('secureTransfer:pauseTransfer', transferId),
    resumeTransfer: (transferId) => ipcRenderer.invoke('secureTransfer:resumeTransfer', transferId),
    cancelTransfer: (transferId) => ipcRenderer.invoke('secureTransfer:cancelTransfer', transferId),
    getQuarantined: () => ipcRenderer.invoke('secureTransfer:getQuarantined'),
    releaseFromQuarantine: (transferId) => ipcRenderer.invoke('secureTransfer:releaseFromQuarantine', transferId),
    deleteFromQuarantine: (transferId) => ipcRenderer.invoke('secureTransfer:deleteFromQuarantine', transferId),
    getConfig: () => ipcRenderer.invoke('secureTransfer:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('secureTransfer:updateConfig', config),
  },

  //  Phase 39/40: Network Hygiene - Defensive network monitoring
  networkHygiene: {
    getStatus: () => ipcRenderer.invoke('networkHygiene:getStatus'),
    getConnectivity: () => ipcRenderer.invoke('networkHygiene:getConnectivity'),
    isOnline: () => ipcRenderer.invoke('networkHygiene:isOnline'),
    pause: () => ipcRenderer.invoke('networkHygiene:pause'),
    resume: () => ipcRenderer.invoke('networkHygiene:resume'),
    trustDomain: (domain, permanent) => ipcRenderer.invoke('networkHygiene:trustDomain', domain, permanent),
    blockDomain: (domain) => ipcRenderer.invoke('networkHygiene:blockDomain', domain),
    getTrustedDomains: () => ipcRenderer.invoke('networkHygiene:getTrustedDomains'),
    getBlockedDomains: () => ipcRenderer.invoke('networkHygiene:getBlockedDomains'),
    getConnectionLog: (limit) => ipcRenderer.invoke('networkHygiene:getConnectionLog', limit),
    validateUrl: (url) => ipcRenderer.invoke('networkHygiene:validateUrl', url),
    getConfig: () => ipcRenderer.invoke('networkHygiene:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('networkHygiene:updateConfig', config),
  },

  //  Phase 41: Dashboard Widget System - Customizable dashboard
  dashboard: {
    getLayout: () => ipcRenderer.invoke('dashboard:getLayout'),
    saveLayout: (layout) => ipcRenderer.invoke('dashboard:saveLayout', layout),
    getLayouts: () => ipcRenderer.invoke('dashboard:getLayouts'),
    switchLayout: (layoutId) => ipcRenderer.invoke('dashboard:switchLayout', layoutId),
    createLayout: (name) => ipcRenderer.invoke('dashboard:createLayout', name),
    deleteLayout: (layoutId) => ipcRenderer.invoke('dashboard:deleteLayout', layoutId),
    addWidget: (type) => ipcRenderer.invoke('dashboard:addWidget', type),
    removeWidget: (widgetId) => ipcRenderer.invoke('dashboard:removeWidget', widgetId),
    moveWidget: (widgetId, x, y) => ipcRenderer.invoke('dashboard:moveWidget', widgetId, x, y),
    resizeWidget: (widgetId, width, height) => ipcRenderer.invoke('dashboard:resizeWidget', widgetId, width, height),
    getWidgetTypes: () => ipcRenderer.invoke('dashboard:getWidgetTypes'),
    getQuickButtons: () => ipcRenderer.invoke('dashboard:getQuickButtons'),
    addQuickButton: (button) => ipcRenderer.invoke('dashboard:addQuickButton', button),
    removeQuickButton: (buttonId) => ipcRenderer.invoke('dashboard:removeQuickButton', buttonId),
    executeQuickAction: (actionId) => ipcRenderer.invoke('dashboard:executeQuickAction', actionId),
  },

  //  Phase 41: Theme System - True black system theming
  theme: {
    getConfig: () => ipcRenderer.invoke('theme:getConfig'),
    setMode: (mode) => ipcRenderer.invoke('theme:setMode', mode),
    setAccentColor: (color) => ipcRenderer.invoke('theme:setAccentColor', color),
    setFontScale: (scale) => ipcRenderer.invoke('theme:setFontScale', scale),
    setReducedMotion: (reduced) => ipcRenderer.invoke('theme:setReducedMotion', reduced),
    setDensity: (density) => ipcRenderer.invoke('theme:setDensity', density),
    generateCSSVariables: () => ipcRenderer.invoke('theme:generateCSSVariables'),
    getPresets: () => ipcRenderer.invoke('theme:getPresets'),
    applyPreset: (presetId) => ipcRenderer.invoke('theme:applyPreset', presetId),
    export: () => ipcRenderer.invoke('theme:export'),
    import: (config) => ipcRenderer.invoke('theme:import', config),
    getSystemAccentColor: () => ipcRenderer.invoke('theme:getSystemAccentColor'),
  },

  //  Phase 41: Media Workspace - Universal media handling
  media: {
    getInfo: (filePath) => ipcRenderer.invoke('media:getInfo', filePath),
    preview: (filePath) => ipcRenderer.invoke('media:preview', filePath),
    getThumbnail: (filePath, size) => ipcRenderer.invoke('media:getThumbnail', filePath, size),
    openWithSystem: (filePath) => ipcRenderer.invoke('media:openWithSystem', filePath),
    getSupportedFormats: () => ipcRenderer.invoke('media:getSupportedFormats'),
    getMediaFiles: (directory) => ipcRenderer.invoke('media:getMediaFiles', directory),
  },

  //  Phase 42: Usage Learning Engine - Local-only pattern learning
  learning: {
    recordActivity: (activityType) => ipcRenderer.invoke('learning:recordActivity', activityType),
    recordFeatureUse: (featureId) => ipcRenderer.invoke('learning:recordFeatureUse', featureId),
    predict: () => ipcRenderer.invoke('learning:predict'),
    getMostUsedFeatures: (limit) => ipcRenderer.invoke('learning:getMostUsedFeatures', limit),
    getPatterns: () => ipcRenderer.invoke('learning:getPatterns'),
    getConfig: () => ipcRenderer.invoke('learning:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('learning:updateConfig', config),
    clearData: () => ipcRenderer.invoke('learning:clearData'),
    exportData: () => ipcRenderer.invoke('learning:exportData'),
  },

  //  Phase 42: Power Efficiency - Battery & resource optimization
  efficiency: {
    getStatus: () => ipcRenderer.invoke('efficiency:getStatus'),
    getMode: () => ipcRenderer.invoke('efficiency:getMode'),
    setMode: (mode) => ipcRenderer.invoke('efficiency:setMode', mode),
    getLimits: () => ipcRenderer.invoke('efficiency:getLimits'),
    shouldAllowBackgroundTask: (priority) => ipcRenderer.invoke('efficiency:shouldAllowBackgroundTask', priority),
    yieldResources: () => ipcRenderer.invoke('efficiency:yieldResources'),
    getConfig: () => ipcRenderer.invoke('efficiency:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('efficiency:updateConfig', config),
  },

  //  Phase 42: Background Mode - Event-driven background behavior
  background: {
    getState: () => ipcRenderer.invoke('background:getState'),
    getStatus: () => ipcRenderer.invoke('background:getStatus'),
    getConfig: () => ipcRenderer.invoke('background:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('background:updateConfig', config),
    wake: (reason) => ipcRenderer.invoke('background:wake', reason),
    recordActivity: (source) => ipcRenderer.invoke('background:recordActivity', source),
    getWakeHistory: (limit) => ipcRenderer.invoke('background:getWakeHistory', limit),
    registerService: (serviceId) => ipcRenderer.invoke('background:registerService', serviceId),
    unregisterService: (serviceId) => ipcRenderer.invoke('background:unregisterService', serviceId),
    isServiceActive: (serviceId) => ipcRenderer.invoke('background:isServiceActive', serviceId),
    getScheduledTasks: () => ipcRenderer.invoke('background:getScheduledTasks'),
    addScheduledTask: (task) => ipcRenderer.invoke('background:addScheduledTask', task),
    removeScheduledTask: (taskId) => ipcRenderer.invoke('background:removeScheduledTask', taskId),
    toggleScheduledTask: (taskId, enabled) => ipcRenderer.invoke('background:toggleScheduledTask', taskId, enabled),
  },

  //  Phase 42: System Advisory - Suggestions only, never enforce
  advisory: {
    getActive: () => ipcRenderer.invoke('advisory:getActive'),
    dismiss: (advisoryId) => ipcRenderer.invoke('advisory:dismiss', advisoryId),
    act: (advisoryId) => ipcRenderer.invoke('advisory:act', advisoryId),
    getConfig: () => ipcRenderer.invoke('advisory:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('advisory:updateConfig', config),
    disableAll: () => ipcRenderer.invoke('advisory:disableAll'),
    enableAll: () => ipcRenderer.invoke('advisory:enableAll'),
    getStats: () => ipcRenderer.invoke('advisory:getStats'),
  },

  //  Phase 43: Pattern Detection - Opt-in only, local processing
  patterns: {
    enable: () => ipcRenderer.invoke('patterns:enable'),
    disable: () => ipcRenderer.invoke('patterns:disable'),
    pause: () => ipcRenderer.invoke('patterns:pause'),
    reset: () => ipcRenderer.invoke('patterns:reset'),
    getConfig: () => ipcRenderer.invoke('patterns:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('patterns:updateConfig', config),
    getSummary: () => ipcRenderer.invoke('patterns:getSummary'),
    recordFeatureUse: (featureId) => ipcRenderer.invoke('patterns:recordFeatureUse', featureId),
  },

  //  Phase 43: Workflow Intelligence - Advisory suggestions only
  workflowIntel: {
    getSuggestions: () => ipcRenderer.invoke('workflowIntel:getSuggestions'),
    dismissSuggestion: (id) => ipcRenderer.invoke('workflowIntel:dismissSuggestion', id),
    acceptSuggestion: (id) => ipcRenderer.invoke('workflowIntel:acceptSuggestion', id),
    rankSearchResults: (results) => ipcRenderer.invoke('workflowIntel:rankSearchResults', results),
    getPrefill: (commandId) => ipcRenderer.invoke('workflowIntel:getPrefill', commandId),
    getConfig: () => ipcRenderer.invoke('workflowIntel:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('workflowIntel:updateConfig', config),
  },

  //  Phase 44: Self-Healing - State recovery & rollback
  selfHealing: {
    runHealthCheck: () => ipcRenderer.invoke('selfHealing:runHealthCheck'),
    createCheckpoint: () => ipcRenderer.invoke('selfHealing:createCheckpoint'),
    rollbackToCheckpoint: (checkpointId) => ipcRenderer.invoke('selfHealing:rollbackToCheckpoint', checkpointId),
    getCheckpoints: () => ipcRenderer.invoke('selfHealing:getCheckpoints'),
    deleteCheckpoint: (checkpointId) => ipcRenderer.invoke('selfHealing:deleteCheckpoint', checkpointId),
    getConfig: () => ipcRenderer.invoke('selfHealing:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('selfHealing:updateConfig', config),
  },

  //  Phase 44: Longevity Guardian - Long-run resource sanity
  longevity: {
    captureBaseline: () => ipcRenderer.invoke('longevity:captureBaseline'),
    getDriftReport: () => ipcRenderer.invoke('longevity:getDriftReport'),
    runCompaction: () => ipcRenderer.invoke('longevity:runCompaction'),
    cleanupOrphanedTasks: () => ipcRenderer.invoke('longevity:cleanupOrphanedTasks'),
    getStats: () => ipcRenderer.invoke('longevity:getStats'),
    getConfig: () => ipcRenderer.invoke('longevity:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('longevity:updateConfig', config),
  },

  //  Phase 45: Governance - Permission registry & compliance
  governance: {
    getPermissions: () => ipcRenderer.invoke('governance:getPermissions'),
    getPermission: (id) => ipcRenderer.invoke('governance:getPermission', id),
    grantPermission: (id) => ipcRenderer.invoke('governance:grantPermission', id),
    revokePermission: (id) => ipcRenderer.invoke('governance:revokePermission', id),
    getComplianceStatus: () => ipcRenderer.invoke('governance:getComplianceStatus'),
    getRetentionPolicies: () => ipcRenderer.invoke('governance:getRetentionPolicies'),
    setRetentionPolicy: (dataType, days) => ipcRenderer.invoke('governance:setRetentionPolicy', dataType, days),
    prepareCleanUninstall: () => ipcRenderer.invoke('governance:prepareCleanUninstall'),
  },

  //  Phase 45: Performance Contract - Locked guarantees
  performanceContract: {
    getGuarantees: () => ipcRenderer.invoke('performanceContract:getGuarantees'),
    checkCompliance: () => ipcRenderer.invoke('performanceContract:checkCompliance'),
    validateChange: (change) => ipcRenderer.invoke('performanceContract:validateChange', change),
    takeSnapshot: () => ipcRenderer.invoke('performanceContract:takeSnapshot'),
    getComplianceReport: () => ipcRenderer.invoke('performanceContract:getComplianceReport'),
  },

  //  Phase 45: Failure Containment - Fault isolation
  containment: {
    getConfig: () => ipcRenderer.invoke('containment:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('containment:updateConfig', config),
    getDomainStatus: () => ipcRenderer.invoke('containment:getDomainStatus'),
    getFaults: (limit) => ipcRenderer.invoke('containment:getFaults', limit),
    getSafeMode: () => ipcRenderer.invoke('containment:getSafeMode'),
    enterSafeMode: (reason) => ipcRenderer.invoke('containment:enterSafeMode', reason),
    exitSafeMode: () => ipcRenderer.invoke('containment:exitSafeMode'),
    isolateDomain: (domain) => ipcRenderer.invoke('containment:isolateDomain', domain),
    restoreDomain: (domain) => ipcRenderer.invoke('containment:restoreDomain', domain),
    clearFaults: () => ipcRenderer.invoke('containment:clearFaults'),
  },

  //  Phase 46: Voice Control - Opt-in voice commands
  voice: {
    getConfig: () => ipcRenderer.invoke('voice:getConfig'),
    updateConfig: (updates) => ipcRenderer.invoke('voice:updateConfig', updates),
    enable: () => ipcRenderer.invoke('voice:enable'),
    disable: () => ipcRenderer.invoke('voice:disable'),
    getState: () => ipcRenderer.invoke('voice:getState'),
    startListening: () => ipcRenderer.invoke('voice:startListening'),
    stopListening: () => ipcRenderer.invoke('voice:stopListening'),
    cancelCommand: () => ipcRenderer.invoke('voice:cancelCommand'),
    toggle: () => ipcRenderer.invoke('voiceCmd:toggle'),
    getMicrophoneStatus: () => ipcRenderer.invoke('voice:getMicrophoneStatus'),
    requestMicrophonePermission: () => ipcRenderer.invoke('voice:requestMicrophonePermission'),
    getLogs: (limit) => ipcRenderer.invoke('voice:getLogs', limit),
    clearLogs: () => ipcRenderer.invoke('voice:clearLogs'),
    getStats: () => ipcRenderer.invoke('voice:getStats'),
    getCurrentSession: () => ipcRenderer.invoke('voice:getCurrentSession'),
    getFullStatus: () => ipcRenderer.invoke('voiceCmd:getFullStatus'),
  },

  //  Phase 46: Voice Commands - Command processing
  voiceCommand: {
    parse: (transcript) => ipcRenderer.invoke('voiceCommand:parse', transcript),
    execute: (command) => ipcRenderer.invoke('voiceCommand:execute', command),
    confirm: () => ipcRenderer.invoke('voiceCommand:confirm'),
    reject: () => ipcRenderer.invoke('voiceCommand:reject'),
    getPending: () => ipcRenderer.invoke('voiceCommand:getPending'),
    getPatterns: () => ipcRenderer.invoke('voiceCommand:getPatterns'),
  },

  //  Phase 46: Voice Scopes - Permission management
  voiceScope: {
    getDefinitions: () => ipcRenderer.invoke('voiceScope:getDefinitions'),
    getAll: () => ipcRenderer.invoke('voiceScope:getAll'),
    get: (scope) => ipcRenderer.invoke('voiceScope:get', scope),
    enable: (scope) => ipcRenderer.invoke('voiceScope:enable', scope),
    disable: (scope) => ipcRenderer.invoke('voiceScope:disable', scope),
    setConfirmation: (scope, level) => ipcRenderer.invoke('voiceScope:setConfirmation', scope, level),
    addTarget: (scope, target) => ipcRenderer.invoke('voiceScope:addTarget', scope, target),
    removeTarget: (scope, target) => ipcRenderer.invoke('voiceScope:removeTarget', scope, target),
    getTargets: (scope) => ipcRenderer.invoke('voiceScope:getTargets', scope),
    isAllowed: (scope) => ipcRenderer.invoke('voiceScope:isAllowed', scope),
    isTargetAllowed: (scope, target) => ipcRenderer.invoke('voiceScope:isTargetAllowed', scope, target),
    reset: () => ipcRenderer.invoke('voiceScope:reset'),
  },

  //  Phase 46: Voice Feedback - Visual/audio feedback
  voiceFeedback: {
    getConfig: () => ipcRenderer.invoke('voiceFeedback:getConfig'),
    updateConfig: (updates) => ipcRenderer.invoke('voiceFeedback:updateConfig', updates),
    getHistory: (limit) => ipcRenderer.invoke('voiceFeedback:getHistory', limit),
    clearHistory: () => ipcRenderer.invoke('voiceFeedback:clearHistory'),
  },

  //  UKI Voice Assistant - Memory & Context
  uki: {
    getStatus: () => ipcRenderer.invoke('uki:getStatus'),
    getConfig: () => ipcRenderer.invoke('uki:getConfig'),
    updateConfig: (partial) => ipcRenderer.invoke('uki:updateConfig', partial),
    resetConfig: () => ipcRenderer.invoke('uki:resetConfig'),
    startListening: () => ipcRenderer.invoke('uki:startListening'),
    stopListening: () => ipcRenderer.invoke('uki:stopListening'),
    toggle: () => ipcRenderer.invoke('uki:toggle'),
    transcript: async (text: string) => ipcRenderer.invoke('uki:transcript', await sealForIPC(text)),
    query: async (text: string) => ipcRenderer.invoke('uki:query', await sealForIPC(text)),
    confirm: (confirmed) => ipcRenderer.invoke('uki:confirm', confirmed),
    setContext: (page, appId) => ipcRenderer.send('uki:setContext', page, appId),
    // Memory
    memoryRecord: (entry) => ipcRenderer.invoke('uki:memoryRecord', entry),
    memorySearch: (query, limit = 20) => ipcRenderer.invoke('uki:memorySearch', query, limit),
    memoryRecent: (limit = 10) => ipcRenderer.invoke('uki:memoryRecent', limit),
    memoryStats: () => ipcRenderer.invoke('uki:memoryStats'),
    memoryCleanup: () => ipcRenderer.invoke('uki:memoryCleanup'),
    memoryClear: () => ipcRenderer.invoke('uki:memoryClear'),
    // Copilot (Claude-like AI coworker)
    copilot: {
      getConfig: () => ipcRenderer.invoke('uki:copilot:getConfig'),
      updateConfig: (config: any) => ipcRenderer.invoke('uki:copilot:updateConfig', config),
      setContext: (context: any) => ipcRenderer.invoke('uki:copilot:setContext', context),
      sendMessage: async (content: string) => ipcRenderer.invoke('uki:copilot:sendMessage', await sealForIPC(content)),
      getConversation: () => ipcRenderer.invoke('uki:copilot:getConversation'),
      clearConversation: () => ipcRenderer.invoke('uki:copilot:clearConversation'),
      getSuggestions: () => ipcRenderer.invoke('uki:copilot:getSuggestions'),
      executeAction: (actionId: string) => ipcRenderer.invoke('uki:copilot:executeAction', actionId),
      isThinking: () => ipcRenderer.invoke('uki:copilot:isThinking'),
    },
    // Blueprint generator (AXL / scaffold)
    blueprint: {
      generate: async (prompt: string, kind?: string) =>
        ipcRenderer.invoke('uki:blueprint:generate', await sealForIPC(prompt), kind),
      tweak: (blueprintId: string, change: { key: string; value: unknown }) =>
        ipcRenderer.invoke('uki:blueprint:tweak', blueprintId, change),
    },
    // Cross-source recall (knowledge + native + rewind)
    recall: async (query: string, options?: Record<string, unknown>) =>
      ipcRenderer.invoke('uki:recall', await sealForIPC(query), options),
    // Creative operator dispatch
    operator: {
      dispatch: (action: unknown) => ipcRenderer.invoke('uki:operator:dispatch', action),
      audit: (limit?: number) => ipcRenderer.invoke('uki:operator:audit', limit),
    },
  },

  //  AI DISABLED - Privacy-first system uses local Pattern Learning instead
  ai: {
    getStatus: () => Promise.resolve({ enabled: false, hasProviders: false, activeProvider: null, providers: [] }),
    setEnabled: () => Promise.resolve(false),
  },

  //  Phase 62: Universal Code Editor - Multi-language development
  code: {
    // File operations
    getFiles: (folder) => ipcRenderer.invoke('code:getFiles', folder),
    readFile: (fileId) => ipcRenderer.invoke('code:readFile', fileId),
    saveFile: (file) => ipcRenderer.invoke('code:saveFile', file),
    deleteFile: (fileId) => ipcRenderer.invoke('code:deleteFile', fileId),
    createFile: (language) => ipcRenderer.invoke('code:createFile', language),
    
    // Folder operations
    getFolders: () => ipcRenderer.invoke('code:getFolders'),
    createFolder: (path) => ipcRenderer.invoke('code:createFolder', path),
    
    // Search
    searchFiles: (query) => ipcRenderer.invoke('code:searchFiles', query),
    
    // Recent files
    getRecent: () => ipcRenderer.invoke('code:getRecent'),
    addToRecent: (fileId) => ipcRenderer.invoke('code:addToRecent', fileId),
  },

  //  Phase 63: Activity & Projects
  activity: {
    getAll: () => ipcRenderer.invoke('activity:getAll'),
    getRecent: () => ipcRenderer.invoke('activity:getRecent'),
    markRead: (id) => ipcRenderer.invoke('activity:markRead', id),
    markAllRead: () => ipcRenderer.invoke('activity:markAllRead'),
    clearAll: () => ipcRenderer.invoke('activity:clearAll'),
    onNew: (callback) => ipcRenderer.on('activity:new', callback),
    offNew: (callback) => ipcRenderer.removeListener('activity:new', callback),
  },

  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    create: (project) => ipcRenderer.invoke('projects:create', project),
    update: (projectId, updates) => ipcRenderer.invoke('projects:update', projectId, updates),
    delete: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
    setActive: (projectId) => ipcRenderer.invoke('projects:setActive', projectId),
    getActive: () => ipcRenderer.invoke('projects:getActive'),
  },

  //  Phase 58-59: Governance Contract - AI + Plugin boundaries & post-launch rules
  governanceContract: {
    // Status
    getStatus: () => ipcRenderer.invoke('governance:getStatus'),
    
    // Contracts (read-only, immutable)
    getContracts: () => ipcRenderer.invoke('governance:getContracts'),
    
    // Violations
    getViolations: () => ipcRenderer.invoke('governance:getViolations'),
    clearViolations: () => ipcRenderer.invoke('governance:clearViolations'),
    
    // Pending Actions
    getPendingActions: () => ipcRenderer.invoke('governance:getPendingActions'),
    approveAction: (actionId: string) => ipcRenderer.invoke('governance:approveAction', actionId),
    rejectAction: (actionId: string) => ipcRenderer.invoke('governance:rejectAction', actionId),
    
    // Action History
    getActionHistory: () => ipcRenderer.invoke('governance:getActionHistory'),
    clearHistory: () => ipcRenderer.invoke('governance:clearHistory'),
    
    // Validation
    validateExecution: (request: any) => ipcRenderer.invoke('governance:validateExecution', request),
    validateDataFlow: (from: string, to: string, dataType: string) => ipcRenderer.invoke('governance:validateDataFlow', from, to, dataType),
  },

  //  Clipboard History - OS-level clipboard management
  clipboard: {
    // History
    getHistory: (filter?: any) => ipcRenderer.invoke('clipboard:history', filter),
    get: (id: string) => ipcRenderer.invoke('clipboard:get', id),
    paste: (id: string) => ipcRenderer.invoke('clipboard:paste', id),
    // Organization
    pin: (id: string, pinned: boolean) => ipcRenderer.invoke('clipboard:pin', id, pinned),
    favorite: (id: string, favorite: boolean) => ipcRenderer.invoke('clipboard:favorite', id, favorite),
    tag: (id: string, tags: string[]) => ipcRenderer.invoke('clipboard:tag', id, tags),
    // Management
    delete: (id: string) => ipcRenderer.invoke('clipboard:delete', id),
    clear: (keepPinned?: boolean) => ipcRenderer.invoke('clipboard:clear', keepPinned),
    search: (query: string) => ipcRenderer.invoke('clipboard:search', query),
    // Stats & Config
    stats: () => ipcRenderer.invoke('clipboard:stats'),
    getConfig: () => ipcRenderer.invoke('clipboard:config'),
    setConfig: (config: any) => ipcRenderer.invoke('clipboard:setConfig', config),
    // Control
    pause: () => ipcRenderer.invoke('clipboard:pause'),
    resume: () => ipcRenderer.invoke('clipboard:resume'),
    capture: () => ipcRenderer.invoke('clipboard:capture'),
  },

  //  Voice Notes - Local voice recording & storage
  voiceNotes: {
    // CRUD
    getAll: () => ipcRenderer.invoke('voiceNotes:getAll'),
    getById: (id: string) => ipcRenderer.invoke('voiceNotes:getById', id),
    save: (audioData: ArrayBuffer, metadata: any) => ipcRenderer.invoke('voiceNotes:save', audioData, metadata),
    update: (id: string, updates: any) => ipcRenderer.invoke('voiceNotes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('voiceNotes:delete', id),
    // Organization
    togglePin: (id: string) => ipcRenderer.invoke('voiceNotes:togglePin', id),
    // File access
    getPath: (id: string) => ipcRenderer.invoke('voiceNotes:getPath', id),
    // Search
    search: (query: string) => ipcRenderer.invoke('voiceNotes:search', query),
    getRecent: (limit?: number) => ipcRenderer.invoke('voiceNotes:getRecent', limit),
    getPinned: () => ipcRenderer.invoke('voiceNotes:getPinned'),
    // Stats
    getStats: () => ipcRenderer.invoke('voiceNotes:getStats'),
    // Settings
    getSettings: () => ipcRenderer.invoke('voiceNotes:getSettings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('voiceNotes:updateSettings', settings),
  },

  // ===========================================================================
  // SYSTEM STORAGE, AUTOMATION & LEARNING INTELLIGENCE
  // ===========================================================================

  // System Storage - Efficient structured storage
  storage: {
    getConfig: () => ipcRenderer.invoke('storage:getConfig'),
    updateConfig: (updates: any) => ipcRenderer.invoke('storage:updateConfig', updates),
    getStats: () => ipcRenderer.invoke('storage:getStats'),
    getLocations: () => ipcRenderer.invoke('storage:getLocations'),
    store: (type: string, id: string, data: any) => ipcRenderer.invoke('storage:store', type, id, data),
    retrieve: (type: string, id: string) => ipcRenderer.invoke('storage:retrieve', type, id),
    delete: (type: string, id: string) => ipcRenderer.invoke('storage:delete', type, id),
    indexFile: (filePath: string, metadata: any) => ipcRenderer.invoke('storage:indexFile', filePath, metadata),
    search: (query: string, types?: string[]) => ipcRenderer.invoke('storage:search', query, types),
    listByType: (type: string) => ipcRenderer.invoke('storage:listByType', type),
    runCleanup: () => ipcRenderer.invoke('storage:runCleanup'),
  },

  // Automation Engine - Real end-to-end automation
  automationEngine: {
    getConfig: () => ipcRenderer.invoke('automationEngine:getConfig'),
    updateConfig: (updates: any) => ipcRenderer.invoke('automationEngine:updateConfig', updates),
    getAll: () => ipcRenderer.invoke('automationEngine:getAll'),
    get: (id: string) => ipcRenderer.invoke('automationEngine:get', id),
    create: (automation: any) => ipcRenderer.invoke('automationEngine:create', automation),
    update: (id: string, updates: any) => ipcRenderer.invoke('automationEngine:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('automationEngine:delete', id),
    preview: (id: string) => ipcRenderer.invoke('automationEngine:preview', id),
    execute: (id: string, forceManual?: boolean) => ipcRenderer.invoke('automationEngine:execute', id, forceManual),
    cancel: (id: string) => ipcRenderer.invoke('automationEngine:cancel', id),
    undo: (executionId: string) => ipcRenderer.invoke('automationEngine:undo', executionId),
    getLogs: (limit?: number) => ipcRenderer.invoke('automationEngine:getLogs', limit),
    getRunning: () => ipcRenderer.invoke('automationEngine:getRunning'),
    getApprovalQueue: () => ipcRenderer.invoke('automationEngine:getApprovalQueue'),
    approve: (automationId: string) => ipcRenderer.invoke('automationEngine:approve', automationId),
    deny: (automationId: string) => ipcRenderer.invoke('automationEngine:deny', automationId),
  },

  // Processing Pipeline - Download Process Summarize
  pipeline: {
    getConfig: () => ipcRenderer.invoke('pipeline:getConfig'),
    updateConfig: (updates: any) => ipcRenderer.invoke('pipeline:updateConfig', updates),
    processFile: (filePath: string, options?: any) => ipcRenderer.invoke('pipeline:processFile', filePath, options),
    selectAndProcess: (options?: any) => ipcRenderer.invoke('pipeline:selectAndProcess', options),
    getPendingFiles: () => ipcRenderer.invoke('pipeline:getPendingFiles'),
    dismissPending: (id: string) => ipcRenderer.invoke('pipeline:dismissPending', id),
    getActiveJobs: () => ipcRenderer.invoke('pipeline:getActiveJobs'),
    getCompletedJobs: (limit?: number) => ipcRenderer.invoke('pipeline:getCompletedJobs', limit),
    getJob: (id: string) => ipcRenderer.invoke('pipeline:getJob', id),
    cancelJob: (id: string) => ipcRenderer.invoke('pipeline:cancelJob', id),
  },

  // Audio Processor - Voice Value workflows
  audio: {
    getConfig: () => ipcRenderer.invoke('audio:getConfig'),
    updateConfig: (updates: any) => ipcRenderer.invoke('audio:updateConfig', updates),
    import: (filePath?: string) => ipcRenderer.invoke('audio:import', filePath),
    saveRecording: (data: ArrayBuffer, format: string, duration: number) => 
      ipcRenderer.invoke('audio:saveRecording', Array.from(new Uint8Array(data)), format, duration),
    getAllNotes: () => ipcRenderer.invoke('audio:getAllNotes'),
    getNote: (id: string) => ipcRenderer.invoke('audio:getNote', id),
    updateNote: (id: string, updates: any) => ipcRenderer.invoke('audio:updateNote', id, updates),
    deleteNote: (id: string) => ipcRenderer.invoke('audio:deleteNote', id),
    exportNote: (id: string, path?: string) => ipcRenderer.invoke('audio:exportNote', id, path),
    transcribe: (noteId: string, providerId?: string) => ipcRenderer.invoke('audio:transcribe', noteId, providerId),
    summarize: (noteId: string, aiProvider?: string) => ipcRenderer.invoke('audio:summarize', noteId, aiProvider),
    linkToFile: (noteId: string, filePath: string) => ipcRenderer.invoke('audio:linkToFile', noteId, filePath),
    unlinkFromFile: (noteId: string, filePath: string) => ipcRenderer.invoke('audio:unlinkFromFile', noteId, filePath),
    linkToProject: (noteId: string, projectId: string) => ipcRenderer.invoke('audio:linkToProject', noteId, projectId),
    getProviders: () => ipcRenderer.invoke('audio:getProviders'),
    addProvider: (provider: any) => ipcRenderer.invoke('audio:addProvider', provider),
    updateProvider: (id: string, updates: any) => ipcRenderer.invoke('audio:updateProvider', id, updates),
    removeProvider: (id: string) => ipcRenderer.invoke('audio:removeProvider', id),
    setActiveProvider: (id: string | null) => ipcRenderer.invoke('audio:setActiveProvider', id),
    getStats: () => ipcRenderer.invoke('audio:getStats'),
  },

  // Governance Controller - System-wide control & trust
  governanceCtrl: {
    getStatus: () => ipcRenderer.invoke('govCtrl:getStatus'),
    getDashboardData: () => ipcRenderer.invoke('govCtrl:getDashboardData'),
    enableAll: () => ipcRenderer.invoke('govCtrl:enableAll'),
    disableAll: () => ipcRenderer.invoke('govCtrl:disableAll'),
    setAutomationEnabled: (enabled: boolean) => ipcRenderer.invoke('govCtrl:setAutomationEnabled', enabled),
    setLearningEnabled: (enabled: boolean) => ipcRenderer.invoke('govCtrl:setLearningEnabled', enabled),
    emergencyStop: () => ipcRenderer.invoke('govCtrl:emergencyStop'),
    getAutomationPermissions: () => ipcRenderer.invoke('govCtrl:getAutomationPermissions'),
    setAutomationPermission: (id: string, permission: any) => 
      ipcRenderer.invoke('govCtrl:setAutomationPermission', id, permission),
    canRunAutomation: (id: string) => ipcRenderer.invoke('govCtrl:canRunAutomation', id),
    getLearningConfig: () => ipcRenderer.invoke('govCtrl:getLearningConfig'),
    updateLearningConfig: (updates: any) => ipcRenderer.invoke('govCtrl:updateLearningConfig', updates),
    clearLearningData: () => ipcRenderer.invoke('govCtrl:clearLearningData'),
    getLimits: () => ipcRenderer.invoke('govCtrl:getLimits'),
    updateLimit: (id: string, updates: any) => ipcRenderer.invoke('govCtrl:updateLimit', id, updates),
    checkLimit: (id: string, increment?: number) => ipcRenderer.invoke('govCtrl:checkLimit', id, increment),
    getAuditLog: (options?: any) => ipcRenderer.invoke('govCtrl:getAuditLog', options),
  },

  // In-App Help System
  help: {
    getAllTopics: () => ipcRenderer.invoke('help:getAllTopics'),
    getTopicsByCategory: (category: string) => ipcRenderer.invoke('help:getTopicsByCategory', category),
    getTopic: (id: string) => ipcRenderer.invoke('help:getTopic', id),
    searchTopics: (query: string) => ipcRenderer.invoke('help:searchTopics', query),
    getContextualHelp: (featureId: string) => ipcRenderer.invoke('help:getContextualHelp', featureId),
    getAllGuides: () => ipcRenderer.invoke('help:getAllGuides'),
    getGuide: (id: string) => ipcRenderer.invoke('help:getGuide', id),
    getCategories: () => ipcRenderer.invoke('help:getCategories'),
  },

  on: (channel, callback) => {
    const validChannels = [
      'emergency:stopped', 
      'emergency:resumed', 
      'mode:changed', 
      'rule:triggered', 
      'log:new',
      'workflow:progress',
      'workflow:complete',
      'session:started',
      'session:ended',
      'timer:tick',
      'timer:complete',
      'watchdog:healthUpdate',
      'update:checking',
      'update:available',
      'update:not-available',
      'update:progress',
      'update:downloaded',
      'update:error',
      // Phase 12 events
      'transfer:progress',
      'transfer:complete',
      'transfer:error',
      'device:discovered',
      'device:connected',
      'device:disconnected',
      'connection:changed',
      // Phase 14 events
      'deepSession:restored',
      'deepSession:contextSaved',
      'deepSession:navigated',
      'deepSession:draftSaved',
      'deepSession:idle',
      'deepSession:active',
      // Phase 19-20 events
      'tasks:added',
      'tasks:started',
      'tasks:completed',
      'tasks:failed',
      'tasks:progress',
      'browser:connected',
      'browser:disconnected',
      'browser:pairingStarted',
      'browser:actionCompleted',
      'workflow:executionStarted',
      'workflow:executionCompleted',
      'workflow:executionPaused',
      'workflow:executionResumed',
      'workflow:executionAborted',
      'workflow:nodeStarted',
      'workflow:nodeCompleted',
      'workflow:nodeProgress',
      'workflow:confirmationRequired',
      // Phase 27 events
      'automation:started',
      'automation:progress',
      'automation:completed',
      'timer:create',
      // Resource Governor events
      'resource-governor:reduce-memory',
      'resource-governor:pressure-change',
      // Render Governor events
      'render:config',
      'render:stateChanged',
      // Motion Controller events
      'motion:config',
      'motion:stateChanged',
      // Input Latency events
      'input:targets',
      // Session Stability events
      'stability:healthChanged',
      'stability:compactRequest',
      'stability:pruneRequest',
      // Performance Enforcer events
      'enforce:guarantees',
      'enforce:action',
      // Phase 38: File Intelligence events
      'file-intel:file-change',
      'file-intel:scan-progress',
      'file-intel:analysis-complete',
      // Phase 39/40: Security events
      'securityCore:threat-detected',
      'securityCore:layer-status-change',
      'securityCore:integrity-violation',
      'secureKeys:locked',
      'secureKeys:unlocked',
      'secureKeys:key-rotation',
      'secureTransfer:progress',
      'secureTransfer:complete',
      'secureTransfer:quarantine',
      'secureTransfer:approval-required',
      'networkHygiene:connection-blocked',
      'networkHygiene:status-change',
      // HTTP Transfer events
      'http-transfer:files-updated',
      'http-transfer:download',
      'http-transfer:upload-request',
      'http-transfer:upload-complete',
      // Phase 41/42 events
      'dashboard:layout-changed',
      'theme:changed',
      'learning:pattern-updated',
      'efficiency:mode-changed',
      'background:state-changed',
      'advisory:new',
      // Phase 43/44/45 events
      'patterns:enabled',
      'patterns:disabled',
      'patterns:detected',
      'workflowIntel:suggestion',
      'selfHealing:recovered',
      'selfHealing:checkpoint-created',
      'longevity:drift-detected',
      'longevity:compacted',
      'governance:permission-changed',
      'performanceContract:violation',
      'containment:fault',
      'containment:isolated',
      'containment:safe-mode',
      // Phase 46: Voice Control events
      'voice:stateChanged',
      'voice:microphoneActive',
      'voice:transcript',
      'voice:navigate',
      'voice:search',
      'voice:search-files',
      'voice:find-recent',
      'voice:run-workflow',
      'voice:create',
      'voice:start-timer',
      'voice:stop-timer',
      'voice:rename-files',
      'voice:delete-files',
      'voice:move-files',
      'voice:media',
      'voice:send-files',
      'voice:start-transfer',
      'voice:open-app',
      'voice:close-app',
      'voice:create-file',
      'voice:close-panel',
      'voice:confirmationRequired',
      'voice:commandResult',
      'voiceScope:changed',
      'voiceFeedback:visual',
      'voiceFeedback:speak',
      'voiceFeedback:playSound',
      // AI events - DISABLED (using Pattern Learning instead)
      // Phase 58-59: Governance events
      'governance:violation',
      'governance:actionQueued',
      'governance:actionApproved',
      'governance:actionRejected',
      // Vault events
      'vault:stateChanged',
      'vault:locked',
      'vault:unlocked',
      // Intelligence events
      'intelligence:stateChanged',
      'intelligence:suggestionNew',
      // Storage, Automation & Learning Intelligence events
      'storage:statsUpdated',
      'storage:cleanupComplete',
      'automationEngine:started',
      'automationEngine:progress',
      'automationEngine:completed',
      'automationEngine:failed',
      'automationEngine:approvalRequired',
      'pipeline:fileDetected',
      'pipeline:jobUpdated',
      'audio:note:created',
      'audio:note:updated',
      'audio:note:deleted',
      'audio:transcription:started',
      'audio:transcription:completed',
      'audio:transcription:failed',
      'audio:summary:started',
      'audio:summary:completed',
      'audio:summary:failed',
      'governance:statusUpdated',
      'governance:auditEntry',
      'governance:emergencyStop',
      // Feature Suite (38 New Subsystems) events
      'smart-rename:completed',
      'color-labels:changed',
      'project-lock:changed',
      'reminder:fired',
      'activity-feed:new',
      'keyboard-nav:stateChanged',
      'live-collaboration:peersChanged',
      'file-watcher:detected',
      'theme-schedule:changed',
      'nl-task:created',
      'event-bus:event',
      'browser:new-tab',
    ];
    if (validChannels.includes(channel)) {
      const wrapped = (_event: any, ...args: any[]) => callback(...args);
      listenerWrappers.set(callback, wrapped);
      ipcRenderer.on(channel, wrapped);
    }
  },

  off: (channel, callback) => {
    const wrapped = listenerWrappers.get(callback);
    if (!wrapped) {
      return;
    }
    ipcRenderer.removeListener(channel, wrapped);
    listenerWrappers.delete(callback);
  },

  // Creative Apps - File I/O bridge
  creativeApps: {
    showSaveDialog: (options) => ipcRenderer.invoke('creativeApps:showSaveDialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('creativeApps:showOpenDialog', options),
    saveFile: (filePath, data) => ipcRenderer.invoke('creativeApps:saveFile', filePath, data),
    readFile: (filePath) => ipcRenderer.invoke('creativeApps:readFile', filePath),
  },

  // DEX Rewind - Activity Logger (Phase 1 + Phase 2)
  rewind: {
    // Phase 1
    getTimeline: (dateStr?: string, filterType?: string) => ipcRenderer.invoke('rewind:getTimeline', dateStr, filterType),
    search: (query: string, daysBack?: number) => ipcRenderer.invoke('rewind:search', query, daysBack),
    getSettings: () => ipcRenderer.invoke('rewind:getSettings'),
    updateSettings: (updates: any) => ipcRenderer.invoke('rewind:updateSettings', updates),
    toggleRecording: () => ipcRenderer.invoke('rewind:toggleRecording'),
    deleteAllData: () => ipcRenderer.invoke('rewind:deleteAllData'),
    getStorageInfo: () => ipcRenderer.invoke('rewind:getStorageInfo'),
    isRecording: () => ipcRenderer.invoke('rewind:isRecording'),
    getDaySummary: (dateStr?: string) => ipcRenderer.invoke('rewind:getDaySummary', dateStr),
    // Phase 2 -- Screenshots
    getScreenshots: (dateStr?: string) => ipcRenderer.invoke('rewind:getScreenshots', dateStr),
    getScreenshotData: (filepath: string) => ipcRenderer.invoke('rewind:getScreenshotData', filepath),
    getScreenshotStorageInfo: () => ipcRenderer.invoke('rewind:getScreenshotStorageInfo'),
    openScreenshotsFolder: () => ipcRenderer.invoke('rewind:openScreenshotsFolder'),
    captureScreenshotNow: () => ipcRenderer.invoke('rewind:captureScreenshotNow'),
    // Phase 2 -- Smart Summary
    getSmartSummary: (dateStr?: string) => ipcRenderer.invoke('rewind:getSmartSummary', dateStr),
    generateSummaryNow: (dateStr?: string) => ipcRenderer.invoke('rewind:generateSummaryNow', dateStr),
    getWeekSummaries: () => ipcRenderer.invoke('rewind:getWeekSummaries'),
    exportSummary: (dateStr?: string) => ipcRenderer.invoke('rewind:exportSummary', dateStr),
    // Phase 2 -- AI Status
    getAIStatus: () => ipcRenderer.invoke('rewind:getAIStatus'),
    // User profile
    getUsername: () => ipcRenderer.invoke('rewind:getUsername'),
    getAppVersion: () => ipcRenderer.invoke('rewind:getAppVersion'),
    // Phase 4 -- Learning Engine
    getLearningStatus: () => ipcRenderer.invoke('rewind:getLearningStatus'),
    getLearnedPatterns: () => ipcRenderer.invoke('rewind:getLearnedPatterns'),
    getPredictedNextApp: () => ipcRenderer.invoke('rewind:getPredictedNextApp'),
    getPeakWindow: () => ipcRenderer.invoke('rewind:getPeakWindow'),
    isInPeakWindow: () => ipcRenderer.invoke('rewind:isInPeakWindow'),
    getSuggestedDistractions: () => ipcRenderer.invoke('rewind:getSuggestedDistractions'),
    recordSearchClick: (query: string, entryId: string) => ipcRenderer.invoke('rewind:recordSearchClick', query, entryId),
    // Phase 4 -- Security Layer
    getSecurityStatus: () => ipcRenderer.invoke('rewind:getSecurityStatus'),
    runIntegrityCheck: () => ipcRenderer.invoke('rewind:runIntegrityCheck'),
    getAuditLog: (limit?: number) => ipcRenderer.invoke('rewind:getAuditLog', limit),
    isSessionLocked: () => ipcRenderer.invoke('rewind:isSessionLocked'),
    unlockSession: () => ipcRenderer.invoke('rewind:unlockSession'),
    // Phase 4 -- DEX Bridge
    getBridgeStatus: () => ipcRenderer.invoke('rewind:getBridgeStatus'),
    isDndActive: () => ipcRenderer.invoke('rewind:isDndActive'),
    // Phase 4 -- Combined Backend Status
    getBackendStatus: () => ipcRenderer.invoke('rewind:getBackendStatus'),
    // Phase 5 -- Crash Recovery
    getCrashRecoveryStatus: () => ipcRenderer.invoke('rewind:getCrashRecoveryStatus'),
    restoreCrashedSession: () => ipcRenderer.invoke('rewind:restoreCrashedSession'),
    dismissCrashRecovery: () => ipcRenderer.invoke('rewind:dismissCrashRecovery'),
    // Phase 5 -- Backup
    getBackupSettings: () => ipcRenderer.invoke('rewind:getBackupSettings'),
    setBackupSchedule: (schedule: 'daily' | '3days' | 'weekly') => ipcRenderer.invoke('rewind:setBackupSchedule', schedule),
    setBackupFolder: (folder: string) => ipcRenderer.invoke('rewind:setBackupFolder', folder),
    runBackupNow: () => ipcRenderer.invoke('rewind:runBackupNow'),
    pickBackupFolder: () => ipcRenderer.invoke('rewind:pickBackupFolder'),
    restoreBackupFromPicker: () => ipcRenderer.invoke('rewind:restoreBackupFromPicker'),
    // Phase 5 -- Profiles
    getWorkspaceProfiles: () => ipcRenderer.invoke('rewind:getWorkspaceProfiles'),
    getActiveWorkspaceProfile: () => ipcRenderer.invoke('rewind:getActiveWorkspaceProfile'),
    saveWorkspaceProfile: (profile: any) => ipcRenderer.invoke('rewind:saveWorkspaceProfile', profile),
    deleteWorkspaceProfile: (profileId: string) => ipcRenderer.invoke('rewind:deleteWorkspaceProfile', profileId),
    // Phase 5 -- Onboarding
    getOnboardingState: () => ipcRenderer.invoke('rewind:getOnboardingState'),
    skipOnboarding: () => ipcRenderer.invoke('rewind:skipOnboarding'),
    completeOnboarding: (payload: {
      excludedApps: string[];
      screenshotsEnabled: boolean;
      aiSearchEnabled: boolean;
      autoDelete30Days: boolean;
    }) => ipcRenderer.invoke('rewind:completeOnboarding', payload),
    // Phase 5 -- Focus recovery
    setFocusSessionState: (state: Record<string, any> | null) => ipcRenderer.invoke('rewind:setFocusSessionState', state),
    getFocusSessionState: () => ipcRenderer.invoke('rewind:getFocusSessionState'),
    startFocusSession: (goalText: string) => ipcRenderer.invoke('rewind:startFocusSession', goalText),
    endFocusSession: () => ipcRenderer.invoke('rewind:endFocusSession'),
    getFocusSessions: () => ipcRenderer.invoke('rewind:getFocusSessions'),
    // Phase 6 -- Analytics
    getAnalyticsSnapshot: () => ipcRenderer.invoke('rewind:getAnalyticsSnapshot'),
    recomputeAnalyticsNow: () => ipcRenderer.invoke('rewind:recomputeAnalyticsNow'),
    // Phase 7 -- Plugins
    getPlugins: () => ipcRenderer.invoke('rewind:getPlugins'),
    setPluginEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('rewind:setPluginEnabled', id, enabled),
    reloadPlugins: () => ipcRenderer.invoke('rewind:reloadPlugins'),
    openPluginsFolder: () => ipcRenderer.invoke('rewind:openPluginsFolder'),
    getPluginCommands: () => ipcRenderer.invoke('rewind:getPluginCommands'),
    runPluginCommand: (pluginId: string, name: string, payload?: any) => ipcRenderer.invoke('rewind:runPluginCommand', pluginId, name, payload),
    // Phase 7 -- Logging
    getTodayLogs: () => ipcRenderer.invoke('rewind:getTodayLogs'),
    openLogsFolder: () => ipcRenderer.invoke('rewind:openLogsFolder'),
    onBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, payload: { message: string; timestamp: number }) => callback(payload);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('rewind:backgroundError', wrapped);
    },
    offBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('rewind:backgroundError', wrapped);
      listenerWrappers.delete(callback as any);
    },
  },

  // DTP: DEX Transfer Protocol
  dtp: {
    startServer: () => ipcRenderer.invoke('dtp:startServer'),
    stopServer: () => ipcRenderer.invoke('dtp:stopServer'),
    startDiscovery: () => ipcRenderer.invoke('dtp:startDiscovery'),
    stopDiscovery: () => ipcRenderer.invoke('dtp:stopDiscovery'),
    getDevices: () => ipcRenderer.invoke('dtp:getDevices'),
    refreshDevices: () => ipcRenderer.invoke('dtp:refreshDevices'),
    sendFiles: async (args: { files: string[]; targetAddress: string; targetPort?: number; sessionToken: string }) =>
      ipcRenderer.invoke('dtp:sendFiles', { ...args, sessionToken: await sealForIPC(args.sessionToken) }),
    cancelSend: (transferId: string) => ipcRenderer.invoke('dtp:cancelSend', transferId),
    pauseSend: (transferId: string) => ipcRenderer.invoke('dtp:pauseSend', transferId),
    resumeSend: (transferId: string) => ipcRenderer.invoke('dtp:resumeSend', transferId),
    approveDevice: (deviceId: string) => ipcRenderer.invoke('dtp:approveDevice', deviceId),
    denyDevice: (deviceId: string) => ipcRenderer.invoke('dtp:denyDevice', deviceId),
    pauseReceive: (transferId: string) => ipcRenderer.invoke('dtp:pauseReceive', transferId),
    cancelReceive: (transferId: string) => ipcRenderer.invoke('dtp:cancelReceive', transferId),
    getHistory: (limit?: number) => ipcRenderer.invoke('dtp:getHistory', limit),
    getTrustedDevices: () => ipcRenderer.invoke('dtp:getTrustedDevices'),
    removeTrustedDevice: (deviceId: string) => ipcRenderer.invoke('dtp:removeTrustedDevice', deviceId),
    measureBandwidth: (args: { address: string; port?: number }) => ipcRenderer.invoke('dtp:measureBandwidth', args),
    onDeviceFound: (callback: (device: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, device: any) => callback(device);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:device-found', wrapped);
    },
    onDeviceLost: (callback: (device: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, device: any) => callback(device);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:device-lost', wrapped);
    },
    onDevicePending: (callback: (info: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, info: any) => callback(info);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:device-pending', wrapped);
    },
    onSendProgress: (callback: (progress: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, progress: any) => callback(progress);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:send-progress', wrapped);
    },
    onSendComplete: (callback: (result: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, result: any) => callback(result);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:send-complete', wrapped);
    },
    onSendError: (callback: (error: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, error: any) => callback(error);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:send-error', wrapped);
    },
    onTransferProgress: (callback: (info: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, info: any) => callback(info);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:transfer-progress', wrapped);
    },
    onTransferComplete: (callback: (info: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, info: any) => callback(info);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:transfer-complete', wrapped);
    },
    onTransferError: (callback: (info: any) => void) => {
      const wrapped = (_e: Electron.IpcRendererEvent, info: any) => callback(info);
      listenerWrappers.set(callback as any, wrapped as any);
      ipcRenderer.on('dtp:transfer-error', wrapped);
    },
    offDeviceFound: (callback: (device: any) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('dtp:device-found', wrapped);
      listenerWrappers.delete(callback as any);
    },
    offDeviceLost: (callback: (device: any) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('dtp:device-lost', wrapped);
      listenerWrappers.delete(callback as any);
    },
    offSendProgress: (callback: (progress: any) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('dtp:send-progress', wrapped);
      listenerWrappers.delete(callback as any);
    },
    offTransferProgress: (callback: (info: any) => void) => {
      const wrapped = listenerWrappers.get(callback as any);
      if (!wrapped) return;
      ipcRenderer.removeListener('dtp:transfer-progress', wrapped);
      listenerWrappers.delete(callback as any);
    },
  },
};

// Q1 Foundation & Trust API
const q1FoundationAPI = {
  // Auth Hardening
  validatePassword: (password: string) => ipcRenderer.invoke('authHardening:validatePassword', password),
  calculatePasswordStrength: (password: string) => ipcRenderer.invoke('authHardening:calculateStrength', password),
  validatePIN: (pin: string) => ipcRenderer.invoke('authHardening:validatePIN', pin),
  getLockoutStatus: () => ipcRenderer.invoke('authHardening:getLockoutStatus'),
  getAuthAuditLog: (count?: number) => ipcRenderer.invoke('authHardening:getAuditLog', count),
  recordActivity: () => ipcRenderer.send('authHardening:recordActivity'),
  
  // Vault Hardening
  generatePassword: (options?: any) => ipcRenderer.invoke('vaultHardening:generatePassword', options),
  checkPasswordBreach: (password: string) => ipcRenderer.invoke('vaultHardening:checkPasswordBreach', password),
  getVaultAccessHistory: (filters?: any) => ipcRenderer.invoke('vaultHardening:getAccessHistory', filters),
  scheduleClipboardClear: (clipboardId: string) => ipcRenderer.send('vaultHardening:scheduleClipboardClear', clipboardId),
  clearClipboardNow: () => ipcRenderer.send('vaultHardening:clearClipboardNow'),
  logVaultAccess: (entry: any) => ipcRenderer.send('vaultHardening:logAccess', entry),
  
  // Session Hardening
  getAllTabs: () => ipcRenderer.invoke('sessionHardening:getAllTabs'),
  getTabHealth: (tabId: string) => ipcRenderer.invoke('sessionHardening:getTabHealth', tabId),
  getAllTabHealth: () => ipcRenderer.invoke('sessionHardening:getAllTabHealth'),
  captureSessionSnapshot: (reason?: string) => ipcRenderer.invoke('sessionHardening:captureSnapshot', reason),
  getLatestSnapshot: () => ipcRenderer.invoke('sessionHardening:getLatestSnapshot'),
  
  // Q1 Foundation Status
  getStatus: () => ipcRenderer.invoke('q1Foundation:getStatus'),
  getReport: () => ipcRenderer.invoke('q1Foundation:getReport'),
  isInitialized: () => ipcRenderer.invoke('q1Foundation:isInitialized'),
};

// Startup performance diagnostics
const diagnosticsAPI = {
  getStartupTimeline: () => ipcRenderer.invoke('startup:timeline'),
};

// Native subsystem bridges (May 2026 sweep): archive + Wi-Fi speed test.
// Kept as a separate `dexNative` object so the strongly-typed `dex` API stays
// stable for older renderers; new code reads from `window.dexNative`.
const dexNativeAPI = {
  archive: {
    detect: (filePath: string) => ipcRenderer.invoke('archive:detect', filePath),
    list: (filePath: string) => ipcRenderer.invoke('archive:list', filePath),
    extract: (filePath: string, outputDir: string) => ipcRenderer.invoke('archive:extract', filePath, outputDir),
    createZip: (files: { name: string; absPath: string }[], outputPath: string) =>
      ipcRenderer.invoke('archive:create-zip', files, outputPath),
    tools: () => ipcRenderer.invoke('archive:tools'),
  },
  network: {
    runSpeedTest: () => ipcRenderer.invoke('network:speedtest:run'),
  },
  system: {
    getCapabilities: () => ipcRenderer.invoke('system:capabilities:get'),
    refreshCapabilities: () => ipcRenderer.invoke('system:capabilities:refresh'),
  },
  corepc: {
    verify: () => ipcRenderer.invoke('corepc:verify'),
  },
  permissions: {
    list: () => ipcRenderer.invoke('permissions:list'),
    decide: (request: unknown) => ipcRenderer.invoke('permissions:decide', request),
    planBatch: (requests: unknown[]) => ipcRenderer.invoke('permissions:plan-batch', requests),
    record: (request: unknown, decision: 'allow' | 'deny', fromGroup?: boolean) =>
      ipcRenderer.invoke('permissions:record', request, decision, !!fromGroup),
    revoke: (capability: string, origin: string) =>
      ipcRenderer.invoke('permissions:revoke', capability, origin),
    revokeAll: () => ipcRenderer.invoke('permissions:revoke-all'),
  },
  reader: {
    summarize: (text: string, options?: { sentences?: number }) =>
      ipcRenderer.invoke('reader:summarize', text, options),
  },
  creator: {
    status: () => ipcRenderer.invoke('creator:status'),
    challenge: () => ipcRenderer.invoke('creator:challenge'),
    verify: (challenge: string, signatureHex: string) =>
      ipcRenderer.invoke('creator:verify', challenge, signatureHex),
    current: () => ipcRenderer.invoke('creator:current'),
    lock: () => ipcRenderer.invoke('creator:lock'),
  },
};

contextBridge.exposeInMainWorld('dex', api);
contextBridge.exposeInMainWorld('q1Foundation', q1FoundationAPI);
contextBridge.exposeInMainWorld('dexDiagnostics', diagnosticsAPI);
contextBridge.exposeInMainWorld('dexNative', dexNativeAPI);

// Legacy backward-compatible bridge -- many renderer components reference
// window.electron.invoke / window.electron.ipcRenderer.*
// Wire them to the same validated API so those calls succeed.
// Item 146: Hardened legacy bridge -- all channels go through allowlist
//
// Per-callback wrapper registry so ipcRenderer.off() removes only the
// specific listener instead of all listeners on the channel.
const legacyListenerWrappers = new WeakMap<
  (...args: any[]) => void,
  Map<string, (...args: any[]) => void>
>();

const electronLegacyBridge = {
  invoke: (channel: string, ...args: any[]) => {
    if (!isAllowedDynamicInvokeChannel(channel)) {
      console.warn(`[electron-bridge] Blocked IPC channel: ${channel}`);
      return Promise.resolve(undefined);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      if (!isAllowedDynamicInvokeChannel(channel)) {
        console.warn(`[electron-bridge] Blocked IPC send channel: ${channel}`);
        return;
      }
      ipcRenderer.send(channel, ...args);
    },
    sendSync: (channel: string, ...args: any[]) => {
      if (!isAllowedDynamicInvokeChannel(channel)) {
        console.warn(`[electron-bridge] Blocked IPC sendSync channel: ${channel}`);
        return undefined;
      }
      return ipcRenderer.sendSync(channel, ...args);
    },
    invoke: (channel: string, ...args: any[]) => {
      if (!isAllowedDynamicInvokeChannel(channel)) {
        console.warn(`[electron-bridge] Blocked IPC invoke channel: ${channel}`);
        return Promise.resolve(undefined);
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
      if (!isAllowedDynamicInvokeChannel(channel)) {
        console.warn(`[electron-bridge] Blocked IPC listener channel: ${channel}`);
        return;
      }
      const wrapper = (_event: any, ...callbackArgs: any[]) => callback(...callbackArgs);
      let channelMap = legacyListenerWrappers.get(callback);
      if (!channelMap) {
        channelMap = new Map();
        legacyListenerWrappers.set(callback, channelMap);
      }
      channelMap.set(channel, wrapper);
      ipcRenderer.on(channel, wrapper);
    },
    off: (channel: string, callback: (...args: any[]) => void) => {
      const channelMap = legacyListenerWrappers.get(callback);
      const wrapper = channelMap?.get(channel);
      if (wrapper) {
        ipcRenderer.removeListener(channel, wrapper);
        channelMap!.delete(channel);
      }
    },
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  media: {
    getMediaFiles: (type: string) => ipcRenderer.invoke('media:getMediaFiles', type),
  },
};

contextBridge.exposeInMainWorld('electron', electronLegacyBridge);
