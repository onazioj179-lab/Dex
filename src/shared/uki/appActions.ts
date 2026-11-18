// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI app-action registry (pure, main + renderer).
 *
 * The context registry (shared/uki/appContext.ts) answers "what is the user
 * looking at?". This is its active sibling: apps register CALLABLE actions
 * (e.g. `notes.getActiveNote`, `dexcode.createFile`) that UKI's agent loop can
 * discover and invoke as dynamic tools — beyond the six static core tools —
 * without editing the core loop.
 *
 * Each action is described as DATA (id, description, arg schema, example,
 * mutates, permissions) so it slots straight into the existing MCP-style
 * `createToolCatalog(extra)` and reuses the same constrained-output validation
 * as the core tools. The registry itself is pure + dependency-free; the renderer
 * singleton (renderer/uki/appActionRegistry.ts) adds running-app scoping.
 */

import type { ArgSpec, ToolSpec } from './toolValidation';

/** An app-provided action, described as data for the agent catalog. */
export interface AppActionSpec {
  /** Namespaced id, also the dynamic tool name: 'notes.createNote'. */
  id: string;
  /** One-line description shown in the agent's tool catalog. */
  description: string;
  /** Argument schema (string-typed, like the core tools). */
  args: ArgSpec[];
  /** Minimal VALID-JSON example of the arguments, used in repair messages. */
  example: string;
  /** True when the action changes app state (drives confirm gating). */
  mutates: boolean;
  /**
   * Hands content (a page, a document) to the model: a cloud provider would
   * receive it, so the user is always asked first, like a mutating action.
   */
  sendsContent?: boolean;
  /** Permissions the action needs (checked against the app's grants). */
  permissions?: string[];
}

/** Runs an action and returns a model-facing RESULT string. */
export type AppActionHandler = (args: Record<string, unknown>) => Promise<string> | string;

export interface AppActionEntry {
  appId: string;
  spec: AppActionSpec;
  handler: AppActionHandler;
}

export interface AppActionRegistry {
  actions: Map<string, AppActionEntry>;
}

export function createAppActionRegistry(): AppActionRegistry {
  return { actions: new Map() };
}

/** Register (or replace) an action by its id. */
export function registerAppAction(reg: AppActionRegistry, entry: AppActionEntry): void {
  reg.actions.set(entry.spec.id, entry);
}

export function unregisterAppAction(reg: AppActionRegistry, id: string): void {
  reg.actions.delete(id);
}

export function getAppAction(reg: AppActionRegistry, id: string): AppActionEntry | undefined {
  return reg.actions.get(id);
}

export function listAppActions(reg: AppActionRegistry): AppActionEntry[] {
  return [...reg.actions.values()];
}

/** Adapt an action spec into a ToolSpec so it merges into the agent catalog. */
export function actionToToolSpec(spec: AppActionSpec): ToolSpec {
  const argline = spec.args.length
    ? `{${spec.args.map((a) => `"${a.name}": ${a.type}${a.optional ? '?' : ''}`).join(', ')}}`
    : '{}';
  return {
    name: spec.id,
    argline,
    description: spec.description,
    args: spec.args,
    example: spec.example,
  };
}
