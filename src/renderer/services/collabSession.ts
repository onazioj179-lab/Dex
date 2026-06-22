// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * collabSession — REAL same-device live collaboration over BroadcastChannel.
 *
 * Scope is honestly same-device, multi-window: every DEX window on this
 * machine that joins the same room id converges on shared presence, a
 * CRDT-merged shared document, chat, and reactions. There is NO server and
 * NO cross-device relay here (that is a later network task).
 *
 * Transport: one BroadcastChannel(`dex-collab-<roomId>`) per session. Messages
 * are plain JSON envelopes. Each window is a distinct "actor" (its session id)
 * so two windows opened by the same user are still distinct live peers.
 *
 * Convergence:
 *  - Presence is heartbeat-based: peers broadcast a heartbeat on an interval
 *    and are dropped locally once they go stale (no heartbeat within timeout).
 *  - Shared document fields are last-write-wins registers (see shared/collab/
 *    crdt.ts). Any window can setState(patch); the merge is commutative so the
 *    order of delivery does not matter and all windows reach the same state.
 *  - A late joiner asks for a state sync; existing peers reply with their full
 *    register map, which the joiner merges in.
 */

import {
  LwwRegister,
  lwwInit,
  lwwSet,
  lwwMerge,
} from '../../shared/collab/crdt';
import { ReactionName } from '../../shared/collab/reactions';

// ---------------------------------------------------------------------------
// PUBLIC TYPES
// ---------------------------------------------------------------------------

export interface CollabUser {
  id: string;
  name: string;
  color: string;
}

/** A live peer = one window currently joined to the room. */
export interface CollabPeer {
  /** Per-window session id (the CRDT actor). Unique per window. */
  sessionId: string;
  user: CollabUser;
  /** Wall-clock of the last heartbeat we received. */
  lastSeen: number;
  /** True for the local window. */
  isSelf: boolean;
}

export interface CollabChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userColor: string;
  body: string;
  ts: number;
}

export interface CollabReactionEvent {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  name: ReactionName;
  ts: number;
}

/** The shared document: each field is an LWW register keyed by name. */
export type SharedDoc = Record<string, LwwRegister<unknown>>;

/** Plain (unwrapped) view of the shared document values. */
export type SharedState = Record<string, unknown>;

type PresenceListener = (peers: CollabPeer[]) => void;
type StateListener = (state: SharedState) => void;
type ChatListener = (message: CollabChatMessage) => void;
type ReactionListener = (reaction: CollabReactionEvent) => void;

type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// WIRE PROTOCOL
// ---------------------------------------------------------------------------

type Envelope =
  | { t: 'hello'; from: string; user: CollabUser; ts: number }
  | { t: 'heartbeat'; from: string; user: CollabUser; ts: number }
  | { t: 'bye'; from: string; ts: number }
  // someone (usually a late joiner) requests the current shared doc
  | { t: 'sync-request'; from: string; ts: number }
  // full shared-doc snapshot, sent in reply to a sync-request
  | { t: 'sync-state'; from: string; doc: SharedDoc; ts: number }
  // an incremental shared-doc patch (one or more LWW registers)
  | { t: 'patch'; from: string; doc: SharedDoc; ts: number }
  | { t: 'chat'; from: string; message: CollabChatMessage; ts: number }
  | { t: 'reaction'; from: string; reaction: CollabReactionEvent; ts: number };

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 2000;
/** Peers with no heartbeat within this window are considered gone. */
const PEER_TIMEOUT_MS = 6000;
/** How often we sweep for stale peers. */
const SWEEP_INTERVAL_MS = 2000;

const now = (): number => Date.now();

const genId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isBroadcastChannelAvailable = (): boolean =>
  typeof globalThis !== 'undefined' && typeof (globalThis as any).BroadcastChannel === 'function';

// ---------------------------------------------------------------------------
// SESSION
// ---------------------------------------------------------------------------

export class CollabSession {
  private channel: BroadcastChannel | null = null;
  private roomId: string | null = null;
  private user: CollabUser | null = null;
  /** This window's unique actor id. Stable for the lifetime of the session. */
  readonly sessionId: string = genId('sess');

  // Live peers keyed by their sessionId. Always includes self while joined.
  private peers = new Map<string, CollabPeer>();

  // Shared document: name -> LWW register. The merged source of truth.
  private doc: SharedDoc = {};

  // Listeners
  private presenceListeners = new Set<PresenceListener>();
  private stateListeners = new Set<StateListener>();
  private chatListeners = new Set<ChatListener>();
  private reactionListeners = new Set<ReactionListener>();

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  private joined = false;

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  /** True once join() has succeeded and not yet been torn down. */
  isActive(): boolean {
    return this.joined && this.channel !== null;
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  /**
   * Join a room. Idempotent-ish: if already joined to a different room, the
   * previous session is torn down first. Returns false if BroadcastChannel is
   * unavailable (the caller should label the UI as offline/local-only).
   */
  join(roomId: string, user: CollabUser): boolean {
    if (!roomId || !user) return false;
    if (!isBroadcastChannelAvailable()) {
      // No transport: still register self so the UI has a sane peer list.
      this.user = user;
      this.roomId = roomId;
      this.joined = true;
      this.upsertSelf();
      this.emitPresence();
      return false;
    }

    // If switching rooms, tear down the old channel cleanly first.
    if (this.joined) this.leave();

    this.roomId = roomId;
    this.user = user;
    this.joined = true;

    try {
      this.channel = new BroadcastChannel(`dex-collab-${roomId}`);
    } catch (err) {
      console.error('[collabSession] failed to open channel:', err);
      this.channel = null;
      this.joined = true; // still local-only
      this.upsertSelf();
      this.emitPresence();
      return false;
    }

    this.channel.onmessage = (ev: MessageEvent) => this.handleMessage(ev.data as Envelope);
    this.channel.onmessageerror = (ev) => {
      console.error('[collabSession] message error:', ev);
    };

    // Register self locally.
    this.upsertSelf();
    this.emitPresence();

    // Announce ourselves + request the current shared state from any peers.
    this.post({ t: 'hello', from: this.sessionId, user, ts: now() });
    this.post({ t: 'sync-request', from: this.sessionId, ts: now() });

    // Start heartbeat + stale-peer sweep.
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.sweepTimer = setInterval(() => this.sweepStalePeers(), SWEEP_INTERVAL_MS);

    return true;
  }

  /** Leave the room: announce departure, close channel, clear timers. */
  leave(): void {
    if (!this.joined) return;

    if (this.channel) {
      try {
        this.post({ t: 'bye', from: this.sessionId, ts: now() });
      } catch {
        /* channel may already be closing; ignore */
      }
      try {
        this.channel.onmessage = null;
        this.channel.onmessageerror = null;
        this.channel.close();
      } catch (err) {
        console.error('[collabSession] error closing channel:', err);
      }
      this.channel = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }

    this.joined = false;
    this.roomId = null;
    this.peers.clear();
    this.doc = {};
    this.emitPresence();
    this.emitState();
  }

  /** Full teardown including listener sets. Call on unmount. */
  destroy(): void {
    this.leave();
    this.presenceListeners.clear();
    this.stateListeners.clear();
    this.chatListeners.clear();
    this.reactionListeners.clear();
  }

  // -------------------------------------------------------------------------
  // PRESENCE
  // -------------------------------------------------------------------------

  /** Current live peers, including self, most-recently-seen-ordered-stable. */
  getPeers(): CollabPeer[] {
    return [...this.peers.values()].sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.sessionId.localeCompare(b.sessionId);
    });
  }

  subscribePresence(cb: PresenceListener): Unsubscribe {
    this.presenceListeners.add(cb);
    // Push current value immediately so subscribers don't wait for a change.
    try { cb(this.getPeers()); } catch (e) { console.error('[collabSession]', e); }
    return () => { this.presenceListeners.delete(cb); };
  }

  private upsertSelf(): void {
    if (!this.user) return;
    this.peers.set(this.sessionId, {
      sessionId: this.sessionId,
      user: this.user,
      lastSeen: now(),
      isSelf: true,
    });
  }

  private upsertPeer(sessionId: string, user: CollabUser): void {
    if (sessionId === this.sessionId) {
      this.upsertSelf();
      return;
    }
    const existing = this.peers.get(sessionId);
    this.peers.set(sessionId, {
      sessionId,
      user,
      lastSeen: now(),
      isSelf: false,
    });
    if (!existing) this.emitPresence();
    else this.touchPeer(sessionId);
  }

  private touchPeer(sessionId: string): void {
    const p = this.peers.get(sessionId);
    if (p) p.lastSeen = now();
  }

  private dropPeer(sessionId: string): void {
    if (this.peers.delete(sessionId)) this.emitPresence();
  }

  private sendHeartbeat(): void {
    if (!this.user) return;
    this.upsertSelf();
    this.post({ t: 'heartbeat', from: this.sessionId, user: this.user, ts: now() });
  }

  private sweepStalePeers(): void {
    const cutoff = now() - PEER_TIMEOUT_MS;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.isSelf) continue;
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPresence();
  }

  private emitPresence(): void {
    const peers = this.getPeers();
    for (const cb of this.presenceListeners) {
      try { cb(peers); } catch (e) { console.error('[collabSession]', e); }
    }
  }

  // -------------------------------------------------------------------------
  // SHARED STATE (CRDT)
  // -------------------------------------------------------------------------

  /** Current merged shared-state values (unwrapped from LWW registers). */
  getState(): SharedState {
    const out: SharedState = {};
    for (const [k, reg] of Object.entries(this.doc)) out[k] = reg.value;
    return out;
  }

  /**
   * Update one or more shared fields. Each becomes/updates an LWW register
   * authored by this window. Broadcasts a patch so all windows converge.
   */
  setState(patch: Record<string, unknown>): void {
    if (!patch || typeof patch !== 'object') return;
    const ts = now();
    const changedDoc: SharedDoc = {};
    let changed = false;

    for (const [key, value] of Object.entries(patch)) {
      const existing = this.doc[key];
      const reg = existing
        ? lwwSet(existing, value, this.sessionId, ts)
        : lwwInit(value, this.sessionId, ts);
      // lwwSet/lwwInit always produce a register; record it.
      this.doc[key] = reg;
      changedDoc[key] = reg;
      changed = true;
    }

    if (!changed) return;
    this.emitState();
    this.post({ t: 'patch', from: this.sessionId, doc: changedDoc, ts });
  }

  subscribeState(cb: StateListener): Unsubscribe {
    this.stateListeners.add(cb);
    try { cb(this.getState()); } catch (e) { console.error('[collabSession]', e); }
    return () => { this.stateListeners.delete(cb); };
  }

  /** Merge an incoming partial/full doc into ours via lwwMerge. */
  private mergeDoc(incoming: SharedDoc): void {
    if (!incoming || typeof incoming !== 'object') return;
    let changed = false;
    for (const [key, reg] of Object.entries(incoming)) {
      if (!reg || typeof reg.ts !== 'number') continue;
      const existing = this.doc[key];
      const merged = existing ? lwwMerge(existing, reg) : reg;
      if (!existing || merged !== existing) {
        this.doc[key] = merged;
        changed = true;
      }
    }
    if (changed) this.emitState();
  }

  private emitState(): void {
    const state = this.getState();
    for (const cb of this.stateListeners) {
      try { cb(state); } catch (e) { console.error('[collabSession]', e); }
    }
  }

  // -------------------------------------------------------------------------
  // CHAT
  // -------------------------------------------------------------------------

  /** Broadcast a chat message and deliver it locally too. */
  sendChat(body: string): CollabChatMessage | null {
    const text = (body ?? '').trim();
    if (!text || !this.user) return null;
    const message: CollabChatMessage = {
      id: genId('msg'),
      sessionId: this.sessionId,
      userId: this.user.id,
      userName: this.user.name,
      userColor: this.user.color,
      body: text,
      ts: now(),
    };
    // Deliver locally first so the sender sees it immediately.
    this.emitChat(message);
    this.post({ t: 'chat', from: this.sessionId, message, ts: message.ts });
    return message;
  }

  subscribeChat(cb: ChatListener): Unsubscribe {
    this.chatListeners.add(cb);
    return () => { this.chatListeners.delete(cb); };
  }

  private emitChat(message: CollabChatMessage): void {
    for (const cb of this.chatListeners) {
      try { cb(message); } catch (e) { console.error('[collabSession]', e); }
    }
  }

  // -------------------------------------------------------------------------
  // REACTIONS
  // -------------------------------------------------------------------------

  sendReaction(name: ReactionName): CollabReactionEvent | null {
    if (!this.user) return null;
    const reaction: CollabReactionEvent = {
      id: genId('rx'),
      sessionId: this.sessionId,
      userId: this.user.id,
      userName: this.user.name,
      name,
      ts: now(),
    };
    this.emitReaction(reaction);
    this.post({ t: 'reaction', from: this.sessionId, reaction, ts: reaction.ts });
    return reaction;
  }

  subscribeReactions(cb: ReactionListener): Unsubscribe {
    this.reactionListeners.add(cb);
    return () => { this.reactionListeners.delete(cb); };
  }

  private emitReaction(reaction: CollabReactionEvent): void {
    for (const cb of this.reactionListeners) {
      try { cb(reaction); } catch (e) { console.error('[collabSession]', e); }
    }
  }

  // -------------------------------------------------------------------------
  // TRANSPORT
  // -------------------------------------------------------------------------

  private post(env: Envelope): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(env);
    } catch (err) {
      console.error('[collabSession] postMessage failed:', err);
    }
  }

  private handleMessage(env: Envelope): void {
    if (!env || typeof env !== 'object' || !('t' in env)) return;
    // Ignore anything we somehow received from ourselves (BroadcastChannel
    // does not echo to the sender, but guard anyway for safety).
    if ('from' in env && env.from === this.sessionId) return;

    switch (env.t) {
      case 'hello': {
        this.upsertPeer(env.from, env.user);
        // Greet the newcomer so they learn about us immediately, and share
        // our current shared doc so they converge without waiting.
        if (this.user) {
          this.post({ t: 'heartbeat', from: this.sessionId, user: this.user, ts: now() });
        }
        if (Object.keys(this.doc).length > 0) {
          this.post({ t: 'sync-state', from: this.sessionId, doc: this.doc, ts: now() });
        }
        break;
      }
      case 'heartbeat': {
        this.upsertPeer(env.from, env.user);
        break;
      }
      case 'bye': {
        this.dropPeer(env.from);
        break;
      }
      case 'sync-request': {
        // Reply with our full doc (only if we have anything).
        if (Object.keys(this.doc).length > 0) {
          this.post({ t: 'sync-state', from: this.sessionId, doc: this.doc, ts: now() });
        }
        break;
      }
      case 'sync-state': {
        this.mergeDoc(env.doc);
        break;
      }
      case 'patch': {
        this.mergeDoc(env.doc);
        break;
      }
      case 'chat': {
        if (env.message) this.emitChat(env.message);
        break;
      }
      case 'reaction': {
        if (env.reaction) this.emitReaction(env.reaction);
        break;
      }
      default:
        break;
    }
  }
}

/**
 * Factory. Each call produces an independent session (its own window actor).
 * Callers own the lifecycle and must call destroy() on teardown.
 */
export function createCollabSession(): CollabSession {
  return new CollabSession();
}
