// =============================================================================
// DEX Platform — Track F: SDK v1 surface contract
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Stable plugin/extension SDK contract. Plugins target this surface; the
 * host implements it. Versioning rule: this file is the only thing under
 * `sdk/v1/` that can be re-exported as `@dex/sdk@1`. Breaking changes go
 * to a sibling `sdk/v2/`.
 */

import type { AppCapability } from '../../../runtime/appContainer';

export const SDK_VERSION = '1.0.0' as const;

export interface DexHostInfo {
  hostVersion: string;       // semver of host
  sdkVersion: typeof SDK_VERSION;
  platform: 'win' | 'mac' | 'linux';
  /** True when the plugin is running inside a sandboxed AppContainer. */
  sandboxed: boolean;
}

export interface NotifyOptions {
  title: string;
  body?: string;
  /** Optional action ids; the host returns the chosen action. */
  actions?: string[];
  level?: 'info' | 'warn' | 'error';
}

export interface CommandRegistration {
  id: string;
  title: string;
  /** Optional shortcut, e.g. 'Ctrl+K'. */
  shortcut?: string;
  handler: () => void | Promise<void>;
}

export interface SettingsPanelDescriptor {
  id: string;
  title: string;
  category: 'general' | 'integration' | 'creative' | 'developer';
  schema: SettingSchema[];
}

export type SettingSchema =
  | { id: string; kind: 'boolean'; label: string; default: boolean }
  | { id: string; kind: 'string'; label: string; default: string; placeholder?: string }
  | { id: string; kind: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { id: string; kind: 'select'; label: string; default: string; options: { value: string; label: string }[] };

/** The full v1 host surface. Implementations must be additive only. */
export interface DexHostV1 {
  readonly host: DexHostInfo;
  /** Request a runtime capability. May prompt the user; cached afterwards. */
  requestCapability(c: AppCapability): Promise<boolean>;
  /** Read/write to the plugin's private storage area (small JSON values). */
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  /** Emit a user-visible notification. Returns chosen action id or null. */
  notify(opts: NotifyOptions): Promise<string | null>;
  /** Register commands shown in the command palette. */
  registerCommand(c: CommandRegistration): { dispose(): void };
  /** Register a settings panel injected into Settings. */
  registerSettingsPanel(p: SettingsPanelDescriptor): { dispose(): void };
  /** Subscribe to host events (lifecycle, theme, network). */
  on(event: SdkEvent, handler: (payload: unknown) => void): { dispose(): void };
}

export type SdkEvent =
  | 'theme-change'
  | 'network-change'
  | 'capability-grant'
  | 'capability-revoke'
  | 'app-suspend'
  | 'app-resume';

/** Plugin entry contract. Plugins export a default function with this signature. */
export type PluginActivate = (host: DexHostV1) => void | Promise<void>;
export type PluginDeactivate = () => void | Promise<void>;

export interface PluginModuleV1 {
  activate: PluginActivate;
  deactivate?: PluginDeactivate;
}

/** Quick compatibility check used by the loader. */
export function isHostV1Compatible(host: { sdkVersion?: string }): boolean {
  if (!host.sdkVersion) return false;
  const [maj] = host.sdkVersion.split('.');
  return maj === '1';
}
