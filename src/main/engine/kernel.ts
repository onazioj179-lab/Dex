// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { getNativeModule } from '../native';
import type {
  KernelSchedulerStats,
  KernelMemoryStats,
  KernelIOStats,
  KernelIPCStats,
  KernelCPUStats,
  KernelStartupStats,
  KernelPerfStats,
} from '../native';
import { CppCache, CppProfiler, isCppAvailable } from '../native/cpp-bridge';
import log from 'electron-log';

const mod = () => getNativeModule();

export function initKernel(): boolean {
  const n = mod();
  if (!n) {
    log.warn('[Kernel] Native module not available');
    return false;
  }
  try {
    if (isCppAvailable()) CppProfiler.begin('kernel.init');
    n.kernelInitStartup();
    n.kernelStartupMark('kernel_ts_init');
    n.kernelInitScheduler();
    n.kernelInitMemory();
    n.kernelInitIo();
    n.kernelInitIpc();
    n.kernelInitCpu();
    n.kernelInitPerf();
    n.kernelStartupMark('kernel_subsystems_ready');
    if (isCppAvailable()) CppProfiler.end('kernel.init');
    log.info('[Kernel] All subsystems initialized');
    return true;
  } catch (err) {
    log.warn('[Kernel] Init error (non-fatal):', String(err));
    return false;
  }
}

export function shutdownKernel(): void {
  const n = mod();
  if (!n) return;
  try {
    n.kernelStartupComplete();
    log.info('[Kernel] Shutdown complete');
  } catch (err) {
    log.warn('[Kernel] Shutdown error:', String(err));
  }
}

// --- Scheduler ---

export function submitTask(priority: number, payload: string): number {
  return mod()?.kernelSubmitTask(priority, payload) ?? -1;
}

export function dequeueTask(workerId: number): { id: number; payload: string } | null {
  const result = mod()?.kernelDequeueTask(workerId);
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

export function scheduleTimer(delayMs: number, payload: string): number {
  return mod()?.kernelScheduleTimer(delayMs, payload) ?? -1;
}

export function advanceTimer(): Array<{ id: number; payload: string }> {
  const results = mod()?.kernelAdvanceTimer() ?? [];
  return results.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

export function schedulerStats(): KernelSchedulerStats | null {
  return mod()?.kernelSchedulerStats() ?? null;
}

// --- Memory ---

export function cacheGet(key: string): Buffer | null {
  return mod()?.kernelCacheGet(key) ?? null;
}

export function cacheSet(key: string, value: Buffer): void {
  mod()?.kernelCacheSet(key, value);
}

export function cacheTrim(percent: number): void {
  mod()?.kernelCacheTrim(percent);
}

export function cacheClear(): void {
  mod()?.kernelCacheClear();
}

export function checkMemoryPressure(): boolean {
  return mod()?.kernelCheckMemoryPressure() ?? false;
}

export function memoryStats(): KernelMemoryStats | null {
  return mod()?.kernelMemoryStats() ?? null;
}

// --- IO ---

export async function readFile(path: string): Promise<Buffer | null> {
  return mod()?.kernelReadFile(path) ?? null;
}

export async function readFiles(paths: string[]): Promise<Buffer[]> {
  return mod()?.kernelReadFiles(paths) ?? [];
}

export async function writeFile(path: string, data: Buffer): Promise<boolean> {
  return mod()?.kernelWriteFile(path, data) ?? false;
}

export function enqueueWrite(path: string, offset: number, data: Buffer): void {
  mod()?.kernelEnqueueWrite(path, offset, data);
}

export async function flushWrites(path?: string): Promise<number> {
  return mod()?.kernelFlushWrites(path) ?? 0;
}

export function ioStats(): KernelIOStats | null {
  return mod()?.kernelIoStats() ?? null;
}

// --- IPC ---

export function ipcSend(channel: string, payload: Buffer): Buffer | null {
  return mod()?.kernelIpcSend(channel, payload) ?? null;
}

export function ipcFlush(channel: string): Buffer | null {
  return mod()?.kernelIpcFlush(channel) ?? null;
}

export function compress(data: Buffer, level?: number): Buffer | null {
  return mod()?.kernelCompress(data, level) ?? null;
}

export function decompress(data: Buffer): Buffer | null {
  return mod()?.kernelDecompress(data) ?? null;
}

export function ipcStats(): KernelIPCStats | null {
  return mod()?.kernelIpcStats() ?? null;
}

// --- CPU ---

export function internString(s: string): number {
  return mod()?.kernelInternString(s) ?? -1;
}

export function internBulk(strings: string[]): number[] {
  return mod()?.kernelInternBulk(strings) ?? [];
}

export function resolveString(id: number): string | null {
  return mod()?.kernelResolveString(id) ?? null;
}

export function registerId(name: string): number {
  return mod()?.kernelRegisterId(name) ?? -1;
}

export function lookupId(name: string): number | null {
  return mod()?.kernelLookupId(name) ?? null;
}

export function flagSet(bit: number): void { mod()?.kernelFlagSet(bit); }
export function flagClear(bit: number): void { mod()?.kernelFlagClear(bit); }
export function flagTest(bit: number): boolean { return mod()?.kernelFlagTest(bit) ?? false; }

export function batchHash(items: string[]): number[] {
  return mod()?.kernelBatchHash(items) ?? [];
}

export function batchSort(items: string[]): string[] {
  return mod()?.kernelBatchSort(items) ?? items.sort();
}

export function batchDedupe(items: string[]): string[] {
  return mod()?.kernelBatchDedupe(items) ?? [...new Set(items)];
}

export function hrtimeUs(): number {
  return mod()?.kernelHrtimeUs() ?? 0;
}

export function cpuStats(): KernelCPUStats | null {
  return mod()?.kernelCpuStats() ?? null;
}

// --- Startup ---

export function startupMark(label: string): void {
  mod()?.kernelStartupMark(label);
}

export function cacheModule(moduleId: string, sourceHash: string, data: Buffer): boolean {
  return mod()?.kernelCacheModule(moduleId, sourceHash, data) ?? false;
}

export function getCachedModule(moduleId: string, sourceHash: string): Buffer | null {
  return mod()?.kernelGetCachedModule(moduleId, sourceHash) ?? null;
}

export function startupStats(): KernelStartupStats | null {
  return mod()?.kernelStartupStats() ?? null;
}

// --- Performance Counters ---

export function perfRecordFrame(durationUs: number): void {
  mod()?.kernelPerfRecordFrame(durationUs);
}

export function perfRecordIpc(durationUs: number): void {
  mod()?.kernelPerfRecordIpc(durationUs);
}

export function perfRecordIo(durationUs: number): void {
  mod()?.kernelPerfRecordIo(durationUs);
}

export function perfShouldSkipFrame(): boolean {
  return mod()?.kernelPerfShouldSkipFrame() ?? false;
}

export function perfSetTargetFps(fps: number): void {
  mod()?.kernelPerfSetTargetFps(fps);
}

export function perfReset(): void {
  mod()?.kernelPerfReset();
}

export function perfStats(): KernelPerfStats | null {
  return mod()?.kernelPerfStats() ?? null;
}

// --- Scheduler Enhancements ---

export function schedulerAgeTasks(boostAmount?: number): number {
  return mod()?.kernelSchedulerAgeTasks(boostAmount) ?? 0;
}

export function schedulerDrain(): number {
  return mod()?.kernelSchedulerDrain() ?? 0;
}

export function schedulerPending(): number {
  return mod()?.kernelSchedulerPending() ?? 0;
}

// --- IO Enhancements ---

export async function prefetchFiles(paths: string[]): Promise<number> {
  return mod()?.kernelPrefetchFiles(paths) ?? 0;
}

export async function batchStat(paths: string[]): Promise<Array<{ path: string; size: number; exists: boolean; isDir: boolean }>> {
  const results = await (mod()?.kernelBatchStat(paths) ?? Promise.resolve([]));
  return results.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

export function clearReadCache(): number {
  return mod()?.kernelClearReadCache() ?? 0;
}

// --- Unified Stats ---

export interface KernelStats {
  scheduler: KernelSchedulerStats | null;
  memory: KernelMemoryStats | null;
  io: KernelIOStats | null;
  ipc: KernelIPCStats | null;
  cpu: KernelCPUStats | null;
  startup: KernelStartupStats | null;
  perf: KernelPerfStats | null;
}

export function getKernelStats(): KernelStats {
  return {
    scheduler: schedulerStats(),
    memory: memoryStats(),
    io: ioStats(),
    ipc: ipcStats(),
    cpu: cpuStats(),
    startup: startupStats(),
    perf: perfStats(),
  };
}
