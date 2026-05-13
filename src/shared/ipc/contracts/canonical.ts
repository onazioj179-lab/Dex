// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Canonical IPC contract declarations. Phase 1 starter set covering the
 * highest-traffic channels. Subsequent migrations will declare additional
 * channels here as legacy registrations move into `IPCValidator`.
 *
 * Implements ADR 0004.
 */

import { IpcContractRegistry, schema, type IpcContract } from './registry';

export interface FileReadRequest { path: string; encoding?: string; }
export interface FileReadResponse { content: string; bytes: number; }
export interface FileWriteRequest { path: string; content: string; encoding?: string; }
export interface FileWriteResponse { bytes: number; }
export interface DirReadRequest { path: string; recursive?: boolean; }
export interface DirReadResponse { entries: { name: string; isDir: boolean }[]; }
export interface WindowMinimizeRequest { windowId?: string; }
export interface WindowMinimizeResponse { ok: boolean; }

export const FILE_READ: IpcContract<FileReadRequest, FileReadResponse> = {
  channel: 'files:read',
  direction: 'renderer-to-main',
  description: 'Read a file from the user-accessible filesystem.',
  request: schema.object<FileReadRequest>({
    path: schema.string,
    encoding: schema.optional(schema.string),
  }),
  response: schema.object<FileReadResponse>({
    content: schema.string,
    bytes: schema.number,
  }),
  rate: 'interactive',
  permission: 'workspace.read',
  version: 1,
};

export const FILE_WRITE: IpcContract<FileWriteRequest, FileWriteResponse> = {
  channel: 'files:write',
  direction: 'renderer-to-main',
  description: 'Write a file inside the user workspace.',
  request: schema.object<FileWriteRequest>({
    path: schema.string,
    content: schema.string,
    encoding: schema.optional(schema.string),
  }),
  response: schema.object<FileWriteResponse>({ bytes: schema.number }),
  rate: 'interactive',
  permission: 'workspace.write',
  version: 1,
};

export const DIR_READ: IpcContract<DirReadRequest, DirReadResponse> = {
  channel: 'dir:read',
  direction: 'renderer-to-main',
  description: 'Enumerate directory entries.',
  request: schema.object<DirReadRequest>({
    path: schema.string,
    recursive: schema.optional(schema.boolean),
  }),
  response: schema.object<DirReadResponse>({
    entries: schema.array(
      schema.object<{ name: string; isDir: boolean }>({
        name: schema.string,
        isDir: schema.boolean,
      }),
    ),
  }),
  rate: 'bulk',
  permission: 'workspace.read',
  version: 1,
};

export const WINDOW_MINIMIZE: IpcContract<WindowMinimizeRequest, WindowMinimizeResponse> = {
  channel: 'window:minimize',
  direction: 'renderer-to-main',
  description: 'Minimize the focused (or specified) window.',
  request: schema.object<WindowMinimizeRequest>({
    windowId: schema.optional(schema.string),
  }),
  response: schema.object<WindowMinimizeResponse>({
    ok: schema.boolean,
  }),
  rate: 'interactive',
  permission: 'public',
  version: 1,
};

/**
 * The canonical contracts shipped in this release. The list is the source
 * of truth; add new contracts here so the audit script and the runtime
 * registry stay in sync.
 */
export const CANONICAL_CONTRACTS = [
  FILE_READ,
  FILE_WRITE,
  DIR_READ,
  WINDOW_MINIMIZE,
] as const;

/**
 * Returns a fresh registry seeded with every canonical contract. The main
 * process and the renderer process each call this during startup so they
 * share a single declarative surface.
 */
export function createCanonicalRegistry(): IpcContractRegistry {
  const registry = new IpcContractRegistry();
  for (const contract of CANONICAL_CONTRACTS) {
    registry.register(contract as IpcContract<unknown, unknown>);
  }
  return registry;
}
