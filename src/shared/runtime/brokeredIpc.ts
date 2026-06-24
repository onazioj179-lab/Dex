// =============================================================================
// DEX Platform — Security: brokered secure inner-app IPC
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Brokered secure IPC for inner-app comms (DEX_FEATURE_BACKLOG 03 · P2).
 *
 * Inner apps must NOT talk to each other over localhost sockets — Windows
 * AppContainer blocks cross-package loopback by default (Project Zero), and it is
 * un-auditable. Instead every message is routed through the DEX broker (the Rust
 * Core / main process), which authorises it against the SENDER's declared
 * capabilities before delivery. This module is the pure routing POLICY: it decides
 * which capability a channel namespace requires and whether a given sender may use
 * it. The transport (the real broker) calls `evaluateIpcRoute` per message.
 *
 * Fail-closed: an unknown channel namespace, or a sender lacking the required
 * capability, is denied. Direct app->app targeting is always rejected (everything
 * goes via the broker), which is what makes the channel auditable.
 */

import type { AppCapability } from './appContainer';

/** Where a message is addressed. Only the broker is a legal target. */
export type IpcTarget = 'broker' | { app: string };

export interface IpcMessage {
  from: string;
  to: IpcTarget;
  /** Namespaced channel, e.g. `clipboard:write`, `files:read`, `net:fetch`. */
  channel: string;
}

export interface IpcDecision {
  allow: boolean;
  reason: string;
  /** The capability the channel required (for the audit trail), if any. */
  requiredCapability?: AppCapability;
}

/**
 * Map a channel NAMESPACE (the part before the first `:`) to the capability it
 * requires. Namespaces not listed need no capability (e.g. `ping`, `log`) but must
 * still be known — an unknown namespace is denied.
 */
const CHANNEL_CAPABILITY: Record<string, AppCapability | null> = {
  clipboard: 'clipboard',
  files: 'files.read',     // write channels are gated separately below
  net: 'network',
  capture: 'capture',
  notify: 'notify',
  storage: 'storage',
  audio: 'audio.out',
  gpu: 'gpu',
  // Capability-free but recognised system channels.
  ping: null,
  log: null,
  lifecycle: null,
};

/** Whether a channel implies a WRITE (needs files.write, not just files.read). */
function isWriteChannel(channel: string): boolean {
  return /(:write|:create|:delete|:move|:put)\b/i.test(channel) || channel.endsWith(':write');
}

/**
 * Evaluate one IPC message against the sender's granted capabilities. The broker
 * calls this before forwarding; on `allow:false` it drops the message and audits.
 */
export function evaluateIpcRoute(
  msg: IpcMessage,
  senderCaps: ReadonlyArray<AppCapability>,
): IpcDecision {
  // 1) Only the broker is addressable. App->app is never direct.
  if (msg.to !== 'broker') {
    return { allow: false, reason: 'direct app-to-app IPC is forbidden; route via the broker' };
  }

  // 2) Resolve the channel namespace.
  const ns = (msg.channel || '').split(':')[0];
  if (!ns || !(ns in CHANNEL_CAPABILITY)) {
    return { allow: false, reason: `unknown channel namespace "${ns}"` };
  }

  // 3) files namespace: write channels require files.write.
  const caps = new Set(senderCaps);
  if (ns === 'files') {
    const needed: AppCapability = isWriteChannel(msg.channel) ? 'files.write' : 'files.read';
    return caps.has(needed)
      ? { allow: true, reason: needed, requiredCapability: needed }
      : { allow: false, reason: `missing ${needed}`, requiredCapability: needed };
  }

  // 4) Generic namespace capability check.
  const required = CHANNEL_CAPABILITY[ns];
  if (required === null) {
    return { allow: true, reason: `${ns} is capability-free` };
  }
  return caps.has(required)
    ? { allow: true, reason: required, requiredCapability: required }
    : { allow: false, reason: `missing ${required}`, requiredCapability: required };
}

/** The set of channel namespaces a host may register handlers for. */
export function knownChannelNamespaces(): string[] {
  return Object.keys(CHANNEL_CAPABILITY);
}
