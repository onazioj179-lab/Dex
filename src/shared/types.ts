// ═══════════════════════════════════════════════════════════════════════════
// DEX - Shared Types
// Type definitions used across main and renderer processes
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────
export type ActionType = 
  | 'open-app'
  | 'close-app'
  | 'kill-process'
  | 'run-command'
  | 'run-script'
  | 'open-file'
  | 'open-folder'
  | 'open-url'
  | 'volume'
  | 'notification'
  | 'custom';

export interface DexAction {
  id: string;
  name: string;
  type: ActionType;
  target: string;
  args: string[];
  icon: string;
  color: string;
  enabled: boolean;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modes
// ─────────────────────────────────────────────────────────────────────────────
export interface DexMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  actions: string[]; // Action IDs to execute when mode activates
  enableRules: string[]; // Rule IDs to enable
  disableRules: string[]; // Rule IDs to disable
  schedule?: ModeSchedule;
  active: boolean;
  createdAt: number;
}

export interface ModeSchedule {
  enabled: boolean;
  startTime: string; // HH:MM format
  endTime: string;
  days: number[]; // 0-6, Sunday-Saturday
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────
export type ConditionType = 
  | 'time'
  | 'time-range'
  | 'process-running'
  | 'process-not-running'
  | 'battery-below'
  | 'battery-above'
  | 'battery-charging'
  | 'battery-discharging'
  | 'mode-active'
  | 'mode-inactive'
  | 'network-connected'
  | 'network-disconnected'
  | 'idle-time';

export interface RuleCondition {
  id: string;
  type: ConditionType;
  value: string | number;
  operator?: 'and' | 'or';
}

export interface DexRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: string[]; // Action IDs to execute when conditions match
  cooldown: number; // Milliseconds between triggers
  lastTriggered: number | null;
  triggerCount: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────
export interface DexPermissions {
  openApps: boolean;
  closeApps: boolean;
  runCommands: boolean;
  adjustVolume: boolean;
  fileSystem: boolean;
  network: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// System Status
// ─────────────────────────────────────────────────────────────────────────────
export interface SystemStatus {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    percent: number;
  };
  battery: {
    percent: number;
    charging: boolean;
    timeRemaining: number | null;
    hasBattery: boolean;
  };
  network: {
    connected: boolean;
    type: string;
  };
  uptime: number;
  platform: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  path?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────────────────────────────────────
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Power & Performance
// ─────────────────────────────────────────────────────────────────────────────
export type PowerProfile = 'eco' | 'balanced' | 'boost';

export interface PowerState {
  currentProfile: PowerProfile;
  appliedAt: number;
  previousProfile: PowerProfile | null;
}

export interface ResourceProcess {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  memoryMB: number;
  path?: string;
  canClose: boolean;
  priority: 'system' | 'user' | 'background';
}

export interface PowerStats {
  profile: PowerProfile;
  cpu: {
    usage: number;
    cores: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
  };
  battery: {
    percent: number;
    charging: boolean;
    timeRemaining: number | null;
    hasBattery: boolean;
    powerSource: 'battery' | 'ac' | 'unknown';
  };
  topProcesses: ResourceProcess[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────
export type DexEvent = 
  | { type: 'process-started'; process: ProcessInfo }
  | { type: 'process-stopped'; process: ProcessInfo }
  | { type: 'battery-changed'; battery: SystemStatus['battery'] }
  | { type: 'network-changed'; network: SystemStatus['network'] }
  | { type: 'time-trigger'; time: string }
  | { type: 'mode-activated'; mode: DexMode }
  | { type: 'mode-deactivated'; mode: DexMode }
  | { type: 'rule-triggered'; rule: DexRule }
  | { type: 'action-executed'; action: DexAction; result: any };

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Feature Flags
// ─────────────────────────────────────────────────────────────────────────────
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  defaultValue: boolean;
  stable: boolean;
  minVersion?: string;
  deprecated?: boolean;
  deprecatedMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Update System
// ─────────────────────────────────────────────────────────────────────────────
export interface UpdateInfo {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  lastCheck: number;
  skippedVersion?: string | null;
  isDownloading: boolean;
  downloadProgress: number;
}

export interface UpdatePreferences {
  autoCheck: boolean;
  checkInterval: number;
  lastCheck: number;
  skippedVersion: string | null;
  showChangelog: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Diagnostics
// ─────────────────────────────────────────────────────────────────────────────
export interface DiagnosticLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

export interface CrashReport {
  id: string;
  timestamp: string;
  error: string;
  stack?: string;
  appVersion: string;
  osInfo: string;
  memoryUsage: NodeJS.MemoryUsage;
}

export interface DiagnosticsPreferences {
  loggingEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxLogFiles: number;
  maxLogSizeMB: number;
  collectPerformanceMetrics: boolean;
  crashReportingEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Security
// ─────────────────────────────────────────────────────────────────────────────
export interface SecurityPermission {
  id: string;
  name: string;
  description: string;
  reason: string;
  required: boolean;
  enabled: boolean;
  scope: 'main' | 'renderer' | 'both';
  risks: string[];
  mitigations: string[];
}

export interface SecurityReport {
  appVersion: string;
  reportDate: string;
  permissions: SecurityPermission[];
  sandbox: { sandboxed: boolean; details: Record<string, boolean> };
  recommendations: string[];
  risks: Array<{ level: 'low' | 'medium' | 'high'; description: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Maintenance Mode
// ─────────────────────────────────────────────────────────────────────────────
export interface MaintenanceState {
  enabled: boolean;
  reason?: string;
  startedAt?: string;
  scheduledEnd?: string;
  disabledFeatures: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Data Backup
// ─────────────────────────────────────────────────────────────────────────────
export interface BackupInfo {
  name: string;
  path: string;
  date: Date;
  size: number;
}

export interface StorageLocations {
  userData: string;
  media: string;
  recordings: string;
  backups: string;
}
// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: System Map
// ─────────────────────────────────────────────────────────────────────────────
export interface SystemDevice {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'phone' | 'tablet' | 'server' | 'unknown';
  platform: string;
  ip: string;
  status: 'online' | 'offline' | 'busy' | 'unknown';
  lastSeen: number;
  capabilities: string[];
}

export interface SystemConnection {
  id: string;
  type: 'wifi' | 'ethernet' | 'bluetooth' | 'usb';
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  strength?: number;
  speed?: number;
  metadata: Record<string, any>;
}

export interface SystemStorage {
  id: string;
  name: string;
  type: 'local' | 'removable' | 'network' | 'cloud';
  mount: string;
  total: number;
  used: number;
  free: number;
  percent: number;
  writable: boolean;
}

export interface SystemSession {
  id: string;
  deviceId: string;
  type: 'transfer' | 'control' | 'stream';
  status: 'active' | 'paused' | 'ended';
  startedAt: number;
  lastActivity: number;
  metadata: Record<string, any>;
}

export interface SystemHealth {
  cpu: { usage: number; healthy: boolean };
  memory: { usage: number; healthy: boolean };
  disk: { usage: number; healthy: boolean };
  network: { connected: boolean; healthy: boolean };
  power: { level: number; charging: boolean; healthy: boolean };
  overall: 'good' | 'degraded' | 'critical';
}

export interface SystemMap {
  devices: SystemDevice[];
  connections: SystemConnection[];
  storage: SystemStorage[];
  sessions: SystemSession[];
  health: SystemHealth;
  lastUpdated: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Transfers
// ─────────────────────────────────────────────────────────────────────────────
export type TransferType = 'file' | 'folder' | 'media' | 'text' | 'clipboard';
export type TransferDirection = 'send' | 'receive';
export type TransferStatus = 'queued' | 'transferring' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Transfer {
  id: string;
  name: string;
  type: TransferType;
  direction: TransferDirection;
  status: TransferStatus;
  source: string;
  destination: string;
  deviceId?: string;
  deviceName?: string;
  totalBytes: number;
  transferredBytes: number;
  progress: number;
  speed: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface TransferConfig {
  maxConcurrent: number;
  throttleSpeed: number;
  autoPause: boolean;
  confirmLargeTransfers: boolean;
  largeTransferThreshold: number;
  allowOverwrite: boolean;
}

export interface TransferPermission {
  id: string;
  deviceId: string;
  scope: 'file' | 'folder' | 'all';
  direction: TransferDirection;
  persistence: 'once' | 'session' | 'always';
  expiresAt?: number;
  grantedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Connections
// ─────────────────────────────────────────────────────────────────────────────
export interface ConnectionChannel {
  id: string;
  type: 'wifi' | 'bluetooth' | 'ethernet' | 'cellular';
  name: string;
  direction: 'send' | 'receive' | 'bidirectional';
  scope: 'files' | 'media' | 'sessions' | 'all';
  status: 'open' | 'closed' | 'error';
  security: 'encrypted' | 'plain' | 'unknown';
  createdAt: number;
  lastUsed?: number;
  bytesTransferred: number;
}

export interface NetworkInfo {
  hostname: string;
  localIp: string;
  publicIp?: string;
  wifiConnected: boolean;
  wifiSSID?: string;
  wifiStrength?: number;
  ethernetConnected: boolean;
  internetAccess: boolean;
}

export interface ConnectionPermissions {
  wifiEnabled: boolean;
  bluetoothEnabled: boolean;
  cellularEnabled: boolean;
  allowIncoming: boolean;
  allowOutgoing: boolean;
  trustedDevices: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Devices
// ─────────────────────────────────────────────────────────────────────────────
export interface Device {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'phone' | 'tablet' | 'server' | 'unknown';
  platform: string;
  hostname: string;
  ip: string;
  port: number;
  capabilities: DeviceCapabilities;
  status: 'online' | 'offline' | 'busy' | 'unknown';
  lastSeen: number;
  trusted: boolean;
  paired: boolean;
}

export interface DeviceCapabilities {
  canSendFiles: boolean;
  canReceiveFiles: boolean;
  canStream: boolean;
  canRemoteControl: boolean;
  maxTransferSize?: number;
  supportedTypes: string[];
}

export interface DevicePairing {
  deviceId: string;
  code: string;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Deep Session Flow
// ─────────────────────────────────────────────────────────────────────────────
// Philosophy: Continuity over context switching, flow over features, comfort over density

export interface DeepSessionState {
  id: string;
  startedAt: number;
  lastActivity: number;
  currentPage: string;
  previousPages: string[];
  contexts: Record<string, PageContext>;
  openDrafts: Record<string, DraftState>;
  pinnedNoteIds: string[];
  splitViewConfig: SplitViewConfig | null;
  preferences: DeepSessionPreferences;
}

export interface PageContext {
  pageId: string;
  scrollPosition: number;
  cursorPosition?: { x: number; y: number };
  selection?: { start: number; end: number; text?: string };
  expandedItems?: string[];
  filterState?: Record<string, any>;
  timestamp: number;
}

export interface DraftState {
  pageId: string;
  content: any;
  timestamp: number;
  autosaved: boolean;
}

export interface SplitViewConfig {
  enabled: boolean;
  leftPanel: string;
  rightPanel: string;
  ratio: number; // 0-1, left panel width ratio
  orientation: 'horizontal' | 'vertical';
}

export interface DeepSessionPreferences {
  autoRestore: boolean;
  preserveScrollPosition: boolean;
  preserveDrafts: boolean;
  idleTimeout: number; // ms before considered idle
  compactAfterIdle: number; // ms before compacting state
  fadeTransitions: boolean;
  softFocusRings: boolean;
  comfortTypography: boolean;
}

// Long-form comfort settings
export interface ComfortSettings {
  lineHeight: number; // 1.6-1.8 recommended
  maxTextWidth: number; // 680px recommended
  fontSize: number; // 15-16px for extended reading
  softContrast: boolean; // Use #2c2c2e instead of #000
  smoothScroll: boolean;
  reducedMotion: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// API & Network Types (replace any)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WebhookPayload {
  event: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface NetworkRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface NetworkResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Types (replace any)
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  id: string;
  content: string;
  model: string;
  tokensUsed: number;
  finishReason: 'stop' | 'length' | 'error';
}

export interface AIStreamChunk {
  id: string;
  content: string;
  done: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Types (replace any)
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageItem<T = unknown> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt?: number;
}

export interface StorageOptions {
  encrypt?: boolean;
  compress?: boolean;
  ttl?: number; // Time to live in ms
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Types (replace any)
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  permissions: string[];
  hooks?: string[];
}

export interface PluginContext {
  pluginId: string;
  dataDir: string;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────────────────────────

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncResult<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Media / File IPC Results
// ─────────────────────────────────────────────────────────────────────────────
/** Raw file object returned by Electron media/files IPC */
export interface MediaFileResult {
  path?: string;
  name?: string;
  extension?: string;
  size?: number;
  modified?: string;
}

/** Serialized task as stored in JSON/localStorage (dates are strings) */
export interface SerializedTask {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  list: string;
  notes: string;
}
