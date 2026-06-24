// =============================================================================
// DEX Platform — Security: unified per-app sandbox profile
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unified sandbox profile (DEX_FEATURE_BACKLOG 03). Composes the three policy
 * layers — network capability gating (Windows AppContainer model), the Linux
 * bubblewrap jail argv, and the brokered-IPC route policy — into ONE object a
 * per-OS host driver consumes. This is the single "DEX supplies policy on top"
 * artifact: one call turns an app's declared capabilities into the concrete,
 * least-privilege enforcement inputs for every platform.
 *
 * Pure: the per-OS drivers (Rust Core on Windows/macOS, the bwrap launcher on
 * Linux) read these fields and apply them; the decision logic stays testable here.
 */

import type { AppCapability } from './appContainer';
import {
  deriveNetworkPolicy, classifyDestination, checkNetworkRequest,
  type NetworkPolicy, type NetworkCapability, type DeriveOptions,
} from './networkPolicy';
import { buildBwrapArgs, type LinuxSandboxSpec } from './linuxSandbox';
import { evaluateIpcRoute, type IpcMessage, type IpcDecision } from './brokeredIpc';

export interface SandboxProfileInput {
  appId: string;
  capabilities: ReadonlyArray<AppCapability>;
  /** Per-app data + resource dirs for the Linux jail. */
  dataDir: string;
  resourceDir?: string;
  audioSocket?: string;
  network?: DeriveOptions;
}

export interface SandboxProfile {
  appId: string;
  capabilities: ReadonlyArray<AppCapability>;
  /** Network policy (derived AppContainer classes + loopback rule). */
  network: NetworkPolicy;
  /** The Windows AppContainer network capability tokens to apply via WFP/SID. */
  windowsNetworkCapabilities: NetworkCapability[];
  /** The Linux bubblewrap argv (before `bwrap` and the app command). */
  linuxBwrapArgs: string[];
  /** Inner-app IPC is always brokered (never raw loopback). */
  ipcMode: 'brokered';
  /** Guard a network destination against this app's policy. */
  checkDestination: (host: string, inbound?: boolean) => { allow: boolean; reason: string };
  /** Guard an inner-app IPC message against this app's capabilities. */
  checkIpc: (msg: IpcMessage) => IpcDecision;
}

/**
 * Build the full sandbox profile for an app from its declared capabilities.
 * One call -> every platform's enforcement inputs, all least-privilege.
 */
export function buildSandboxProfile(input: SandboxProfileInput): SandboxProfile {
  const { appId, capabilities } = input;
  const network = deriveNetworkPolicy(capabilities, input.network);

  const linuxSpec: LinuxSandboxSpec = {
    appId,
    capabilities,
    dataDir: input.dataDir,
    resourceDir: input.resourceDir,
    audioSocket: input.audioSocket,
  };

  return {
    appId,
    capabilities,
    network,
    windowsNetworkCapabilities: [...network.caps],
    linuxBwrapArgs: buildBwrapArgs(linuxSpec),
    ipcMode: 'brokered',
    checkDestination: (host: string, inbound = false) =>
      checkNetworkRequest(network, classifyDestination(host, inbound)),
    checkIpc: (msg: IpcMessage) => evaluateIpcRoute(msg, capabilities),
  };
}
