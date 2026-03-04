// =============================================================================
// DEX - Phase 51: Complete Integration Module
// Unified exports for all Phase 51 capabilities
// =============================================================================

// Performance Optimization
import {
  PERF_TARGETS as _PERF_TARGETS,
  stateOptimizer as _stateOptimizer,
  ipcOptimizer as _ipcOptimizer,
  memoryOptimizer as _memoryOptimizer,
  idleDetector as _idleDetector,
  renderOptimizer as _renderOptimizer,
  performanceOptimizer as _performanceOptimizer,
  PerformanceOptimizer as _PerformanceOptimizer,
} from './PerformanceOptimizer';

// OS-Like Capability Layer
import {
  CapabilityType as _CapabilityType,
  CapabilityStatus as _CapabilityStatus,
  capabilityLayer as _capabilityLayer,
  CapabilityLayer as _CapabilityLayer,
} from './CapabilityLayer';
import type { Capability, ResourceBudget, FileOperation, Transfer } from './CapabilityLayer';

// Device Interface
import {
  DeviceType as _DeviceType,
  DeviceStatus as _DeviceStatus,
  TransferMode as _TransferMode,
  deviceInterface as _deviceInterface,
  DeviceInterface as _DeviceInterface,
} from './DeviceInterface';
import type { ExternalDevice, DeviceFile, DeviceTransfer } from './DeviceInterface';

// Plugin System
import {
  PluginState as _PluginState,
  PluginPermission as _PluginPermission,
  pluginManager as _pluginManager,
  PluginManager as _PluginManager,
} from './PluginSystem';
import type {
  Plugin,
  PluginManifest,
  PluginCommand,
  PluginPanel,
  PluginSetting,
} from './PluginSystem';

// Long-Term Stability
import {
  STABILITY_TARGETS as _STABILITY_TARGETS,
  longTermStability as _longTermStability,
  LongTermStabilityManager as _LongTermStabilityManager,
} from './LongTermStability';

// Re-export everything
export const PERF_TARGETS = _PERF_TARGETS;
export const stateOptimizer = _stateOptimizer;
export const ipcOptimizer = _ipcOptimizer;
export const memoryOptimizer = _memoryOptimizer;
export const idleDetector = _idleDetector;
export const renderOptimizer = _renderOptimizer;
export const performanceOptimizer = _performanceOptimizer;
export const PerformanceOptimizer = _PerformanceOptimizer;

export const CapabilityType = _CapabilityType;
export const CapabilityStatus = _CapabilityStatus;
export const capabilityLayer = _capabilityLayer;
export const CapabilityLayer = _CapabilityLayer;

export const DeviceType = _DeviceType;
export const DeviceStatus = _DeviceStatus;
export const TransferMode = _TransferMode;
export const deviceInterface = _deviceInterface;
export const DeviceInterface = _DeviceInterface;

export const PluginState = _PluginState;
export const PluginPermission = _PluginPermission;
export const pluginManager = _pluginManager;
export const PluginManager = _PluginManager;

export const STABILITY_TARGETS = _STABILITY_TARGETS;
export const longTermStability = _longTermStability;
export const LongTermStabilityManager = _LongTermStabilityManager;

// Re-export types
export type { Capability, ResourceBudget, FileOperation, Transfer };
export type { ExternalDevice, DeviceFile, DeviceTransfer };
export type { Plugin, PluginManifest, PluginCommand, PluginPanel, PluginSetting };

// =============================================================================
// PHASE 51 INITIALIZATION
// =============================================================================

export interface Phase51Status {
  performance: {
    initialized: boolean;
    targetsActive: boolean;
  };
  capabilities: {
    initialized: boolean;
    activeCount: number;
  };
  devices: {
    initialized: boolean;
    connectedCount: number;
  };
  plugins: {
    initialized: boolean;
    activeCount: number;
  };
  stability: {
    initialized: boolean;
    isStable: boolean;
  };
  ready: boolean;
}

let phase51Initialized = false;

export async function initializePhase51(): Promise<Phase51Status> {
  console.log('[Phase51] Initializing all subsystems...');
  
  const status: Phase51Status = {
    performance: { initialized: false, targetsActive: false },
    capabilities: { initialized: false, activeCount: 0 },
    devices: { initialized: false, connectedCount: 0 },
    plugins: { initialized: false, activeCount: 0 },
    stability: { initialized: false, isStable: false },
    ready: false,
  };
  
  try {
    // 1. Performance Optimizer
    console.log('[Phase51] Starting Performance Optimizer...');
    status.performance.initialized = true;
    status.performance.targetsActive = true;
    
    // 2. Capability Layer
    console.log('[Phase51] Starting Capability Layer...');
    const caps = _capabilityLayer.getActiveCapabilities();
    status.capabilities.initialized = true;
    status.capabilities.activeCount = caps.length;
    
    // 3. Device Interface
    console.log('[Phase51] Starting Device Interface...');
    const devices = _deviceInterface.getDevices();
    status.devices.initialized = true;
    status.devices.connectedCount = devices.length;
    
    // 4. Plugin System
    console.log('[Phase51] Loading Plugin System...');
    await _pluginManager.loadInstalledPlugins();
    const plugins = _pluginManager.getActivePlugins();
    status.plugins.initialized = true;
    status.plugins.activeCount = plugins.length;
    
    // 5. Long-Term Stability
    console.log('[Phase51] Starting Long-Term Stability Monitor...');
    const stabilityReport = _longTermStability.getStabilityReport();
    status.stability.initialized = true;
    status.stability.isStable = stabilityReport.isStable;
    
    // All systems ready
    status.ready = true;
    phase51Initialized = true;
    
    console.log('[Phase51] All subsystems initialized successfully');
    console.log(`  - Performance: Active`);
    console.log(`  - Capabilities: ${status.capabilities.activeCount} active`);
    console.log(`  - Devices: ${status.devices.connectedCount} connected`);
    console.log(`  - Plugins: ${status.plugins.activeCount} active`);
    console.log(`  - Stability: ${status.stability.isStable ? 'Stable' : 'Issues detected'}`);
    
  } catch (err) {
    console.error('[Phase51] Initialization error:', err);
  }
  
  return status;
}

export function getPhase51Status(): Phase51Status {
  return {
    performance: {
      initialized: phase51Initialized,
      targetsActive: phase51Initialized,
    },
    capabilities: {
      initialized: phase51Initialized,
      activeCount: phase51Initialized ? _capabilityLayer.getActiveCapabilities().length : 0,
    },
    devices: {
      initialized: phase51Initialized,
      connectedCount: phase51Initialized ? _deviceInterface.getDevices().length : 0,
    },
    plugins: {
      initialized: phase51Initialized,
      activeCount: phase51Initialized ? _pluginManager.getActivePlugins().length : 0,
    },
    stability: {
      initialized: phase51Initialized,
      isStable: phase51Initialized ? _longTermStability.getStabilityReport().isStable : false,
    },
    ready: phase51Initialized,
  };
}

export function shutdownPhase51(): void {
  console.log('[Phase51] Shutting down all subsystems...');
  
  try {
    // Shutdown in reverse order
    _longTermStability.shutdown();
    _deviceInterface.shutdown();
    _performanceOptimizer.shutdown();
    
    phase51Initialized = false;
    console.log('[Phase51] All subsystems shut down');
  } catch (err) {
    console.error('[Phase51] Shutdown error:', err);
  }
}

// =============================================================================
// COMPREHENSIVE REPORT
// =============================================================================

export interface Phase51Report {
  version: string;
  phase: number;
  timestamp: number;
  
  performance: {
    report: ReturnType<typeof _performanceOptimizer.getReport>;
    targets: typeof _PERF_TARGETS;
  };
  
  capabilities: ReturnType<typeof _capabilityLayer.getSystemStatus>;
  
  devices: {
    connected: ReturnType<typeof _deviceInterface.getDevices>;
    transfers: ReturnType<typeof _deviceInterface.transferManager.getTransfers>;
  };
  
  plugins: ReturnType<typeof _pluginManager.getStats>;
  
  stability: ReturnType<typeof _longTermStability.getStabilityReport>;
  
  overall: {
    healthy: boolean;
    issues: string[];
  };
}

export function getPhase51Report(): Phase51Report {
  const perfReport = _performanceOptimizer.getReport();
  const capStatus = _capabilityLayer.getSystemStatus();
  const stabilityReport = _longTermStability.getStabilityReport();
  
  const issues: string[] = [];
  
  // Check performance
  if (!perfReport.healthy) {
    issues.push('Performance issues detected');
  }
  
  // Check capabilities
  if (capStatus.degradedCapabilities > 0) {
    issues.push(`${capStatus.degradedCapabilities} capability/ies degraded`);
  }
  
  // Check stability
  issues.push(...stabilityReport.issues);
  
  return {
    version: '1.0.0',
    phase: 51,
    timestamp: Date.now(),
    
    performance: {
      report: perfReport,
      targets: _PERF_TARGETS,
    },
    
    capabilities: capStatus,
    
    devices: {
      connected: _deviceInterface.getDevices(),
      transfers: _deviceInterface.transferManager.getTransfers(),
    },
    
    plugins: _pluginManager.getStats(),
    
    stability: stabilityReport,
    
    overall: {
      healthy: issues.length === 0,
      issues,
    },
  };
}
