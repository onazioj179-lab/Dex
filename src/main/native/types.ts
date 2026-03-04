// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — TypeScript Type Definitions
// Auto-generated types matching Rust NAPI-RS struct exports
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// System Monitoring
// ─────────────────────────────────────────────────────────────────────────

export interface SystemStats {
  cpuPercent: number;
  cpuCount: number;
  cpuPerCore: number[];
  cpuFreqMhz: number;
  memoryTotal: number;
  memoryUsed: number;
  memoryPercent: number;
  memoryAvailable: number;
  swapTotal: number;
  swapUsed: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  batteryTimeLeft: number | null;
  uptime: number;
  platform: string;
  osVersion: string;
  hostname: string;
  kernelVersion: string;
}

export interface DiskInfo {
  mount: string;
  fsType: string;
  total: number;
  used: number;
  available: number;
  percent: number;
  name: string;
}

export interface NetworkInfo {
  name: string;
  rxBytes: number;
  txBytes: number;
  totalRx: number;
  totalTx: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Process Management
// ─────────────────────────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryMb: number;
  status: string;
  category: 'system' | 'user' | 'background' | 'safe_to_close';
}

export interface CloseProcessResult {
  success: boolean;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Power Management
// ─────────────────────────────────────────────────────────────────────────

export interface PowerProfile {
  name: string;
  description: string;
  cpuLimit: number;
}

export interface PowerResult {
  success: boolean;
  profile: string;
  changes: string[];
  error: string | null;
}

export interface PowerStatus {
  profile: string;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  batteryTimeLeft: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
// File Scanning
// ─────────────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified: number;
  isDirectory: boolean;
}

export interface ScanResult {
  files: FileEntry[];
  totalScanned: number;
  durationMs: number;
  truncated: boolean;
}

export interface DirectorySize {
  totalBytes: number;
  fileCount: number;
  dirCount: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Health Monitoring
// ─────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  uptime: number;
  uptimeFormatted: string;
  errorCount: number;
  memoryMb: number;
  avgMemoryMb: number;
  memoryTrend: 'stable' | 'increasing' | 'decreasing';
  healthy: boolean;
}

export interface Suggestion {
  suggestionType: string;
  name: string;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Native Module Interface
// ─────────────────────────────────────────────────────────────────────────

export interface DexNativeModule {
  // System
  getSystemStats(): SystemStats;
  getDiskInfo(): DiskInfo[];
  getNetworkInfo(): NetworkInfo[];

  // Processes
  getProcesses(limit?: number): ProcessInfo[];
  closeProcess(pid: number, force?: boolean): CloseProcessResult;
  freeMemory(): CloseProcessResult;

  // Power
  getPowerProfiles(): PowerProfile[];
  setPowerProfile(profile: string): PowerResult;
  getPowerStatus(): PowerStatus;

  // Files
  scanDirectory(
    rootPath: string,
    extensions: string[],
    maxDepth?: number,
    limit?: number,
    includeDirs?: boolean,
  ): ScanResult;
  getDirectorySize(dirPath: string): DirectorySize;
  scanMediaFiles(
    scanType: string,
    customPaths?: string[],
    limit?: number,
  ): ScanResult;

  // Health
  heartbeat(): void;
  recordError(errorMessage: string): void;
  getHealth(): HealthStatus;

  // Learning
  recordActivity(activityType: string, name: string): void;
  getSuggestions(): Suggestion[];
}
