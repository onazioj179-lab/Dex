// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Nexus P2P Protocol
 * -----------------------------------------------------------------------------
 * Typed wire format for LAN-only collaborative graph editing. The transport
 * (mDNS / WebRTC datachannel / quic-transport) is intentionally not chosen
 * yet -- this module only defines the message schema, version handshake, and
 * a pure validator so the wire is locked down before any real socket opens.
 *
 * INTENTIONAL STUB: there is no networking in this file. The exported
 * `createInProcessTransport` factory returns an in-memory pair of endpoints
 * useful for tests and the renderer's "preview p2p" demo mode. Real LAN
 * transport will land in a later wave once the protocol is agreed.
 */

// DEX v3.8.5 - Nexus p2p collab protocol

export const NEXUS_P2P_PROTOCOL_VERSION = 1 as const;

export type NexusP2PMessage =
  | { kind: 'hello'; protocol: 1; peerId: string; nick: string }
  | { kind: 'welcome'; protocol: 1; peerId: string; nick: string; peers: string[] }
  | { kind: 'graph:add-node'; nodeId: string; label: string; group?: string }
  | { kind: 'graph:remove-node'; nodeId: string }
  | { kind: 'graph:add-link'; source: string; target: string; weight?: number }
  | { kind: 'graph:remove-link'; source: string; target: string }
  | { kind: 'cursor'; peerId: string; nodeId: string | null }
  | { kind: 'chat'; peerId: string; text: string; ts: number }
  | { kind: 'ping'; ts: number }
  | { kind: 'pong'; ts: number };

export type NexusP2PMessageKind = NexusP2PMessage['kind'];

const STRING_KEYS: Partial<Record<NexusP2PMessageKind, string[]>> = {
  hello: ['peerId', 'nick'],
  welcome: ['peerId', 'nick'],
  'graph:add-node': ['nodeId', 'label'],
  'graph:remove-node': ['nodeId'],
  'graph:add-link': ['source', 'target'],
  'graph:remove-link': ['source', 'target'],
  cursor: ['peerId'],
  chat: ['peerId', 'text'],
};

/** Validate a parsed object as a NexusP2PMessage. Returns null on failure. */
export function validateMessage(raw: unknown): NexusP2PMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const kind = m.kind;
  if (typeof kind !== 'string') return null;
  switch (kind) {
    case 'hello':
    case 'welcome':
      if (m.protocol !== NEXUS_P2P_PROTOCOL_VERSION) return null;
      break;
    case 'ping':
    case 'pong':
      if (typeof m.ts !== 'number') return null;
      return raw as NexusP2PMessage;
    default:
      break;
  }
  const required = STRING_KEYS[kind as NexusP2PMessageKind];
  if (required) {
    for (const k of required) {
      if (typeof m[k] !== 'string') return null;
    }
  }
  // welcome.peers
  if (kind === 'welcome') {
    if (!Array.isArray(m.peers)) return null;
    if (m.peers.some((p) => typeof p !== 'string')) return null;
  }
  // chat.ts must be number
  if (kind === 'chat' && typeof m.ts !== 'number') return null;
  // cursor.nodeId can be string or null
  if (kind === 'cursor' && m.nodeId !== null && typeof m.nodeId !== 'string') return null;
  return raw as NexusP2PMessage;
}

export interface NexusP2PEndpoint {
  send: (msg: NexusP2PMessage) => void;
  onMessage: (handler: (msg: NexusP2PMessage) => void) => () => void;
  close: () => void;
}

/**
 * Create two in-process endpoints connected back-to-back. Useful for tests
 * and a single-window "preview p2p" demo. Real LAN transport replaces this
 * with WebRTC or QUIC in a later wave.
 */
export function createInProcessTransport(): { a: NexusP2PEndpoint; b: NexusP2PEndpoint } {
  const aListeners: Array<(m: NexusP2PMessage) => void> = [];
  const bListeners: Array<(m: NexusP2PMessage) => void> = [];
  let closed = false;
  const a: NexusP2PEndpoint = {
    send: (msg) => { if (!closed) for (const l of bListeners) l(msg); },
    onMessage: (h) => { aListeners.push(h); return () => { const i = aListeners.indexOf(h); if (i >= 0) aListeners.splice(i, 1); }; },
    close: () => { closed = true; aListeners.length = 0; },
  };
  const b: NexusP2PEndpoint = {
    send: (msg) => { if (!closed) for (const l of aListeners) l(msg); },
    onMessage: (h) => { bListeners.push(h); return () => { const i = bListeners.indexOf(h); if (i >= 0) bListeners.splice(i, 1); }; },
    close: () => { closed = true; bListeners.length = 0; },
  };
  return { a, b };
}

/** Apply a graph mutation message to a working pair of node/link arrays. */
export interface MutableGraph {
  nodes: Array<{ id: string; label: string; group?: string }>;
  links: Array<{ source: string; target: string; weight?: number }>;
}

export function applyMessage(graph: MutableGraph, msg: NexusP2PMessage): MutableGraph {
  switch (msg.kind) {
    case 'graph:add-node':
      if (!graph.nodes.find((n) => n.id === msg.nodeId)) {
        graph.nodes.push({ id: msg.nodeId, label: msg.label, group: msg.group });
      }
      return graph;
    case 'graph:remove-node':
      graph.nodes = graph.nodes.filter((n) => n.id !== msg.nodeId);
      graph.links = graph.links.filter((l) => l.source !== msg.nodeId && l.target !== msg.nodeId);
      return graph;
    case 'graph:add-link':
      if (!graph.links.find((l) => l.source === msg.source && l.target === msg.target)) {
        graph.links.push({ source: msg.source, target: msg.target, weight: msg.weight });
      }
      return graph;
    case 'graph:remove-link':
      graph.links = graph.links.filter((l) => !(l.source === msg.source && l.target === msg.target));
      return graph;
    default:
      return graph;
  }
}
