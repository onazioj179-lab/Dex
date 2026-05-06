// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- Barrel Export
// All 100 Backend Performance Rules + existing engine modules
// ===========================================================================

// ---------------------------------------------------------------------------
// Performance Rules 1-6: Startup Optimization
// ---------------------------------------------------------------------------
export {
  startupOptimizer,
  StartupOptimizer,
  V8SnapshotManager,
  SharedModuleCache,
  WASMAOTCache,
  BytecodeCacheWarmer,
  SpeculativeModuleParser,
} from './StartupOptimizer';

// ---------------------------------------------------------------------------
// Performance Rules 7-15: Memory Architecture
// ---------------------------------------------------------------------------
export {
  memoryArchitecture,
  MemoryArchitecture,
  SlabAllocator,
  GenerationalCache,
  LargePageAllocator,
  COWObject,
  ArrayBufferPool,
  CacheLineAlignedBuffer,
  PageFaultMinimizer,
  MemoryPressureResponder,
  ArenaAllocator,
} from './MemoryArchitecture';

// ---------------------------------------------------------------------------
// Performance Rules 16-23: Concurrency Engine
// ---------------------------------------------------------------------------
export {
  concurrencyEngine,
  ConcurrencyEngine,
  WorkStealingDeque,
  SPSCRingBuffer,
  ConcurrentHashMap,
  EpochReclamation,
  HierarchicalTimerWheel,
  FiberScheduler,
  PriorityTaskScheduler,
  CoreAffinityManager,
} from './ConcurrencyEngine';

// ---------------------------------------------------------------------------
// Performance Rules 24-30: IPC Optimization
// ---------------------------------------------------------------------------
export {
  ipcOptimizer,
  IPCOptimizer,
  BinarySerializer,
  SharedMemoryManager,
  IPCChannelMultiplexer,
  IPCBatchCoalescer,
  ZeroCopyTransferManager,
  IPCCompressor,
  IPCMessagePool,
} from './IPCOptimizer';

// ---------------------------------------------------------------------------
// Performance Rules 31-42: IO Engine
// ---------------------------------------------------------------------------
export {
  ioEngine,
  IOEngine,
  PlatformIODispatcher,
  MemoryMappedFileManager,
  VectoredIO,
  FilePreAllocator,
  FileHandlePool,
  WriteCoalescer,
  ReadAheadPipeline,
  PageCacheScheduler,
  AsyncFsyncBatcher,
  DirectoryWatchOptimizer,
  TempFileManager,
  StreamingFileProcessor,
} from './IOEngine';

// ---------------------------------------------------------------------------
// Performance Rules 43-58: CPU Optimization
// ---------------------------------------------------------------------------
export {
  cpuOptimizer,
  CPUOptimizer,
  SIMDJSONParser,
  StringInterningTable,
  IntegerIDRegistry,
  PerfectHashGenerator,
  BitwiseFlagRegister,
  BranchlessOps,
  HighResolutionTimer,
  BatchProcessor,
  LoopOptimizer,
  HotPathOptimizer,
  MathOptimizer,
} from './CPUOptimizer';

// ---------------------------------------------------------------------------
// Performance Rules 59-69: V8 Optimizer
// ---------------------------------------------------------------------------
export {
  v8Optimizer,
  V8Optimizer,
  DynamicHeapSizer,
  ConcurrentGCTrigger,
  IdleGCHintSystem,
  HeapStatisticsMonitor,
  HiddenClassFactory,
  MonomorphicICEnforcer,
  LazyPropertyCache,
  TimingBuffer,
  V8FlagTuner,
  CodeCacheManager,
  TurboFanHints,
} from './V8Optimizer';

// ---------------------------------------------------------------------------
// Performance Rules 70-74: WASM Engine
// ---------------------------------------------------------------------------
export {
  wasmEngine,
  WASMEngine,
  WASMSIMDAccelerator,
  WASMThreadPool,
  StreamingWASMCompiler,
  WASMInstantiationCache,
  WASMMemory64Manager,
  detectWASMFeatures,
} from './WASMEngine';

// ---------------------------------------------------------------------------
// Performance Rules 75-82: Data Structures
// ---------------------------------------------------------------------------
export {
  dataStructures,
  DataStructures,
  PersistentRedBlackTree,
  FractionalCascadingIndex,
  BinaryTimelineFormat,
  RoaringBitmap,
  BTreeCache,
  Trie,
  SkipList,
  BloomFilter,
} from './DataStructures';

// ---------------------------------------------------------------------------
// Performance Rules 83-89: Platform Native
// ---------------------------------------------------------------------------
export {
  platformNative,
  PlatformNative,
  NativeRunLoopIntegration,
  HighResTimers,
  OSMemoryPressureMonitor,
  NativeProcessSpawner,
  FileDescriptorManager,
  PlatformTimerManager,
  SignalHandler,
} from './PlatformNative';

// ---------------------------------------------------------------------------
// Performance Rules 90-100: Diagnostics and Build
// ---------------------------------------------------------------------------
export {
  diagnosticsAndBuild,
  DiagnosticsAndBuild,
  ContinuousProfiler,
  HeapSnapshotDiffer,
  SanitizerHooks,
  BrotliPipeline,
  IntegrityVerifier,
  ContentHashCacheBuster,
  PreloadScanner,
  PerformanceRegressionDetector,
  TurboFanDeoptMonitor,
  BundleAnalyzer,
  DeadCodeEliminator,
} from './DiagnosticsAndBuild';

// ---------------------------------------------------------------------------
// Existing Engine Modules
// ---------------------------------------------------------------------------
export { ImosionAudioEngine, getAudioEngine, disposeAudioEngine } from './ImosionAudioEngine';
export { default as ImosionCloudSync } from './ImosionCloudSync';
export { default as ImosionFileManager } from './ImosionFileManager';
export { default as ImosionGPUAccelerator } from './ImosionGPUAccelerator';
export { default as ImosionPluginHost } from './ImosionPluginHost';
export { default as ImosionSecurity } from './ImosionSecurity';
export { MediaPlaybackEngine } from './MediaPlaybackEngine';
export { RuleEngine } from './RuleEngine';

// ---------------------------------------------------------------------------
// Kernel (Rust NAPI-RS native performance kernel)
// ---------------------------------------------------------------------------
export {
  initKernel,
  shutdownKernel,
  submitTask,
  dequeueTask,
  scheduleTimer,
  advanceTimer,
  schedulerStats,
  cacheGet,
  cacheSet,
  cacheTrim,
  cacheClear,
  checkMemoryPressure,
  memoryStats,
  readFile as kernelReadFile,
  readFiles as kernelReadFiles,
  writeFile as kernelWriteFile,
  enqueueWrite,
  flushWrites,
  ioStats,
  ipcSend,
  ipcFlush,
  compress,
  decompress,
  ipcStats,
  internString,
  internBulk,
  resolveString,
  registerId,
  lookupId,
  flagSet,
  flagClear,
  flagTest,
  batchHash,
  batchSort,
  batchDedupe,
  hrtimeUs,
  cpuStats,
  startupMark,
  cacheModule,
  getCachedModule,
  startupStats,
  getKernelStats,
} from './kernel';
export type { KernelStats } from './kernel';

// ---------------------------------------------------------------------------
// Unified Initialization
// ---------------------------------------------------------------------------

import { startupOptimizer } from './StartupOptimizer';
import { memoryArchitecture } from './MemoryArchitecture';
import { concurrencyEngine } from './ConcurrencyEngine';
import { ipcOptimizer } from './IPCOptimizer';
import { ioEngine } from './IOEngine';
import { cpuOptimizer } from './CPUOptimizer';
import { v8Optimizer } from './V8Optimizer';
import { wasmEngine } from './WASMEngine';
import { dataStructures } from './DataStructures';
import { platformNative } from './PlatformNative';
import { diagnosticsAndBuild } from './DiagnosticsAndBuild';
import { initKernel, shutdownKernel } from './kernel';
import { initCppSubsystems, shutdownCppSubsystems } from '../native/cpp-bridge';
import * as log from 'electron-log';

/**
 * Initialize all 100 Backend Performance Rules in the correct order.
 * Call this early in the app lifecycle, after app.whenReady().
 */
export async function initializePerformanceEngine(): Promise<void> {
  const start = Date.now();

  try {
    // Phase 0a: Native Rust kernel
    initKernel();

    // Phase 0b: C++ kernel subsystems (threadpool, mempool, cache, scheduler, IO ring, profiler, bloom, spatial)
    initCppSubsystems();

    // Phase 1: Platform detection and native integration (Rules 83-89)
    await platformNative.initialize();

    // Phase 2: Startup optimization (Rules 1-6)
    startupOptimizer.initialize();

    // Phase 3: Memory architecture (Rules 7-15)
    memoryArchitecture.initialize();

    // Phase 4: Concurrency primitives (Rules 16-23)
    concurrencyEngine.initialize();

    // Phase 5: IPC optimization (Rules 24-30)
    ipcOptimizer.initialize();

    // Phase 6: IO engine (Rules 31-42)
    await ioEngine.initialize();

    // Phase 7: CPU optimization (Rules 43-58)
    cpuOptimizer.initialize();

    // Phase 8: V8 runtime (Rules 59-69)
    v8Optimizer.initialize();

    // Phase 9: WASM engine (Rules 70-74)
    await wasmEngine.initialize();

    // Phase 10: Data structures (Rules 75-82)
    dataStructures.initialize();

    // Phase 11: Diagnostics and build tools (Rules 90-100)
    await diagnosticsAndBuild.initialize({
      enableProfiler: true,
      enableSanitizer: false, // Enable in dev only
      enableHeapDiff: true,
    });

    const elapsed = Date.now() - start;
    log.info(`[PerformanceEngine] All 100 rules initialized in ${elapsed}ms`);
  } catch (err) {
    log.warn('[PerformanceEngine] Initialization error (non-fatal):', String(err));
  }
}

/**
 * Shut down all performance engine subsystems.
 */
export function shutdownPerformanceEngine(): void {
  try {
    shutdownCppSubsystems();
    shutdownKernel();
    diagnosticsAndBuild.shutdown();
    platformNative.shutdown();
    log.info('[PerformanceEngine] Shut down');
  } catch (err) {
    log.warn('[PerformanceEngine] Shutdown error:', String(err));
  }
}
