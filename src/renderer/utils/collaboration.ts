// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Collaboration (Phase O: Items 866-885)
// Real-time sync, presence, cursors, and sharing
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  avatar?: string;
  color: string;
}

export interface Cursor {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface Selection {
  userId: string;
  start: number;
  end: number;
  layerId?: string;
}

export interface PresenceState {
  userId: string;
  user: User;
  cursor?: Cursor;
  selection?: Selection;
  status: 'online' | 'away' | 'busy';
  lastSeen: number;
}

export interface CRDTOperation {
  id: string;
  type: 'insert' | 'delete' | 'update';
  path: string[];
  value?: unknown;
  timestamp: number;
  userId: string;
  vectorClock: Record<string, number>;
}

export interface SyncMessage {
  type: 'operation' | 'presence' | 'cursor' | 'selection' | 'sync' | 'ack';
  payload: unknown;
  timestamp: number;
  senderId: string;
}

export interface ShareLink {
  id: string;
  documentId: string;
  token: string;
  permissions: 'view' | 'comment' | 'edit';
  expiresAt?: number;
  maxUses?: number;
  uses: number;
  createdAt: number;
  createdBy: string;
}

export interface Comment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  position?: { x: number; y: number };
  resolved: boolean;
  replies: Comment[];
  createdAt: number;
  updatedAt: number;
}

export interface CollaborationSession {
  id: string;
  documentId: string;
  participants: PresenceState[];
  createdAt: number;
  hostId: string;
}

// ---------------------------------------------------------------------------
// 866-870. CRDT Implementation
// ---------------------------------------------------------------------------

export class CRDTDocument<T = Record<string, unknown>> {
  private state: T;
  private operations: CRDTOperation[] = [];
  private vectorClock: Record<string, number> = {};
  private userId: string;
  private listeners: ((state: T, op: CRDTOperation) => void)[] = [];

  constructor(userId: string, initialState: T) {
    this.userId = userId;
    this.state = initialState;
    this.vectorClock[userId] = 0;
  }

  // 866. Apply Operation
  applyOperation(op: CRDTOperation): void {
    // Update vector clock
    Object.entries(op.vectorClock).forEach(([uid, clock]) => {
      this.vectorClock[uid] = Math.max(this.vectorClock[uid] || 0, clock);
    });

    // Check if operation should be applied
    if (this.isOperationApplied(op)) return;

    // Apply based on type
    switch (op.type) {
      case 'insert':
      case 'update':
        this.setAtPath(op.path, op.value);
        break;
      case 'delete':
        this.deleteAtPath(op.path);
        break;
    }

    this.operations.push(op);
    this.notifyListeners(op);
  }

  // 867. Create Operation
  createOperation(type: CRDTOperation['type'], path: string[], value?: unknown): CRDTOperation {
    this.vectorClock[this.userId] = (this.vectorClock[this.userId] || 0) + 1;

    const op: CRDTOperation = {
      id: this.generateId(),
      type,
      path,
      value,
      timestamp: Date.now(),
      userId: this.userId,
      vectorClock: { ...this.vectorClock },
    };

    this.applyOperation(op);
    return op;
  }

  // 868. Conflict Resolution
  private isOperationApplied(op: CRDTOperation): boolean {
    return this.operations.some(existing => existing.id === op.id);
  }

  resolveConflict(op1: CRDTOperation, op2: CRDTOperation): CRDTOperation {
    // Last-Writer-Wins with user ID tiebreaker
    if (op1.timestamp !== op2.timestamp) {
      return op1.timestamp > op2.timestamp ? op1 : op2;
    }
    return op1.userId > op2.userId ? op1 : op2;
  }

  // 869. State Management
  getState(): T {
    return this.state;
  }

  getAtPath(path: string[]): unknown {
    let current: unknown = this.state;
    for (const key of path) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private setAtPath(path: string[], value: unknown): void {
    if (path.length === 0) {
      this.state = value as T;
      return;
    }

    let current: unknown = this.state;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if ((current as Record<string, unknown>)[key] === undefined) {
        (current as Record<string, unknown>)[key] = {};
      }
      current = (current as Record<string, unknown>)[key];
    }
    (current as Record<string, unknown>)[path[path.length - 1]] = value;
  }

  private deleteAtPath(path: string[]): void {
    if (path.length === 0) return;

    let current: unknown = this.state;
    for (let i = 0; i < path.length - 1; i++) {
      current = (current as Record<string, unknown>)[path[i]];
      if (current === undefined) return;
    }
    delete (current as Record<string, unknown>)[path[path.length - 1]];
  }

  // 870. Merge States
  merge(remoteOps: CRDTOperation[]): void {
    // Sort by vector clock order
    const sorted = [...remoteOps].sort((a, b) => {
      const aSum = Object.values(a.vectorClock).reduce((s, v) => s + v, 0);
      const bSum = Object.values(b.vectorClock).reduce((s, v) => s + v, 0);
      return aSum - bSum;
    });

    sorted.forEach(op => this.applyOperation(op));
  }

  getOperations(): CRDTOperation[] {
    return [...this.operations];
  }

  getOperationsSince(vectorClock: Record<string, number>): CRDTOperation[] {
    return this.operations.filter(op => {
      return Object.entries(op.vectorClock).some(([uid, clock]) => {
        return clock > (vectorClock[uid] || 0);
      });
    });
  }

  getVectorClock(): Record<string, number> {
    return { ...this.vectorClock };
  }

  onChange(callback: (state: T, op: CRDTOperation) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(op: CRDTOperation): void {
    this.listeners.forEach(l => l(this.state, op));
  }

  private generateId(): string {
    return `${this.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// 871-875. Presence & Cursors
// ---------------------------------------------------------------------------

export class PresenceManager {
  private localUser: User;
  private presence: Map<string, PresenceState> = new Map();
  private cursors: Map<string, Cursor> = new Map();
  private selections: Map<string, Selection> = new Map();
  private listeners: {
    presence: ((state: PresenceState[]) => void)[];
    cursor: ((cursors: Cursor[]) => void)[];
    selection: ((selections: Selection[]) => void)[];
  } = { presence: [], cursor: [], selection: [] };
  private colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  private colorIndex = 0;

  constructor(user: User) {
    this.localUser = user;
    this.updateLocalPresence('online');
  }

  // 871. Update Presence
  updateLocalPresence(status: PresenceState['status']): void {
    const state: PresenceState = {
      userId: this.localUser.id,
      user: this.localUser,
      status,
      lastSeen: Date.now(),
    };
    this.presence.set(this.localUser.id, state);
    this.notifyPresence();
  }

  updateRemotePresence(state: PresenceState): void {
    this.presence.set(state.userId, state);
    this.notifyPresence();
  }

  removePresence(userId: string): void {
    this.presence.delete(userId);
    this.cursors.delete(userId);
    this.selections.delete(userId);
    this.notifyPresence();
    this.notifyCursors();
    this.notifySelections();
  }

  getPresence(): PresenceState[] {
    return Array.from(this.presence.values());
  }

  // 872. Cursor Broadcasting
  updateLocalCursor(x: number, y: number): Cursor {
    const cursor: Cursor = {
      userId: this.localUser.id,
      x,
      y,
      timestamp: Date.now(),
    };
    this.cursors.set(this.localUser.id, cursor);
    this.notifyCursors();
    return cursor;
  }

  updateRemoteCursor(cursor: Cursor): void {
    this.cursors.set(cursor.userId, cursor);
    this.notifyCursors();
  }

  getCursors(): Cursor[] {
    return Array.from(this.cursors.values());
  }

  // 873. Selection Sync
  updateLocalSelection(start: number, end: number, layerId?: string): Selection {
    const selection: Selection = {
      userId: this.localUser.id,
      start,
      end,
      layerId,
    };
    this.selections.set(this.localUser.id, selection);
    this.notifySelections();
    return selection;
  }

  updateRemoteSelection(selection: Selection): void {
    this.selections.set(selection.userId, selection);
    this.notifySelections();
  }

  getSelections(): Selection[] {
    return Array.from(this.selections.values());
  }

  // 874. User Colors
  assignColor(userId: string): string {
    const existing = this.presence.get(userId);
    if (existing?.user.color) return existing.user.color;
    
    const color = this.colors[this.colorIndex % this.colors.length];
    this.colorIndex++;
    return color;
  }

  // 875. Awareness
  isUserActive(userId: string): boolean {
    const presence = this.presence.get(userId);
    if (!presence) return false;
    return Date.now() - presence.lastSeen < 30000; // 30 seconds
  }

  getActiveUsers(): PresenceState[] {
    return this.getPresence().filter(p => this.isUserActive(p.userId));
  }

  // Event Listeners
  onPresenceChange(callback: (state: PresenceState[]) => void): () => void {
    this.listeners.presence.push(callback);
    return () => {
      this.listeners.presence = this.listeners.presence.filter(l => l !== callback);
    };
  }

  onCursorChange(callback: (cursors: Cursor[]) => void): () => void {
    this.listeners.cursor.push(callback);
    return () => {
      this.listeners.cursor = this.listeners.cursor.filter(l => l !== callback);
    };
  }

  onSelectionChange(callback: (selections: Selection[]) => void): () => void {
    this.listeners.selection.push(callback);
    return () => {
      this.listeners.selection = this.listeners.selection.filter(l => l !== callback);
    };
  }

  private notifyPresence(): void {
    const state = this.getPresence();
    this.listeners.presence.forEach(l => l(state));
  }

  private notifyCursors(): void {
    const cursors = this.getCursors();
    this.listeners.cursor.forEach(l => l(cursors));
  }

  private notifySelections(): void {
    const selections = this.getSelections();
    this.listeners.selection.forEach(l => l(selections));
  }
}

// ---------------------------------------------------------------------------
// 876-880. Sync Engine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private ws: WebSocket | null = null;
  private userId: string;
  private sessionId: string | null = null;
  private messageQueue: SyncMessage[] = [];
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<SyncMessage['type'], ((payload: unknown) => void)[]> = new Map();

  constructor(userId: string) {
    this.userId = userId;
  }

  // 876. Connect
  async connect(url: string, sessionId: string): Promise<boolean> {
    this.sessionId = sessionId;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.flushQueue();
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as SyncMessage;
            this.handleMessage(message);
          } catch {
            console.error('Failed to parse sync message');
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.attemptReconnect(url, sessionId);
        };

        this.ws.onerror = () => {
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  // 877. Disconnect
  disconnect(): void {
    this.connected = false;
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }

  // 878. Send Message
  send(type: SyncMessage['type'], payload: unknown): void {
    const message: SyncMessage = {
      type,
      payload,
      timestamp: Date.now(),
      senderId: this.userId,
    };

    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  // 879. Handle Incoming
  private handleMessage(message: SyncMessage): void {
    if (message.senderId === this.userId) return; // Ignore own messages

    const listeners = this.listeners.get(message.type) || [];
    listeners.forEach(l => l(message.payload));
  }

  on(type: SyncMessage['type'], callback: (payload: unknown) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
    
    return () => {
      const list = this.listeners.get(type);
      if (list) {
        this.listeners.set(type, list.filter(l => l !== callback));
      }
    };
  }

  // 880. Reconnection
  private attemptReconnect(url: string, sessionId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      this.connect(url, sessionId);
    }, delay);
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.connected) {
      const message = this.messageQueue.shift()!;
      this.ws?.send(JSON.stringify(message));
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

// ---------------------------------------------------------------------------
// 881-883. Sharing
// ---------------------------------------------------------------------------

export class ShareManager {
  private links: Map<string, ShareLink> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // 881. Create Share Link
  createShareLink(documentId: string, userId: string, options: {
    permissions?: ShareLink['permissions'];
    expiresIn?: number;
    maxUses?: number;
  } = {}): ShareLink {
    const link: ShareLink = {
      id: this.generateId(),
      documentId,
      token: this.generateToken(),
      permissions: options.permissions || 'view',
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
      maxUses: options.maxUses,
      uses: 0,
      createdAt: Date.now(),
      createdBy: userId,
    };

    this.links.set(link.id, link);
    return link;
  }

  // 882. Get Share URL
  getShareUrl(link: ShareLink): string {
    return `${this.baseUrl}/share/${link.token}`;
  }

  // 883. Validate Link
  validateLink(token: string): ShareLink | null {
    for (const link of this.links.values()) {
      if (link.token !== token) continue;
      
      // Check expiration
      if (link.expiresAt && link.expiresAt < Date.now()) {
        return null;
      }
      
      // Check uses
      if (link.maxUses && link.uses >= link.maxUses) {
        return null;
      }

      return link;
    }
    return null;
  }

  useLink(token: string): ShareLink | null {
    const link = this.validateLink(token);
    if (link) {
      link.uses++;
    }
    return link;
  }

  revokeLink(id: string): boolean {
    return this.links.delete(id);
  }

  getLinksForDocument(documentId: string): ShareLink[] {
    return Array.from(this.links.values()).filter(l => l.documentId === documentId);
  }

  private generateId(): string {
    return `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
}

// ---------------------------------------------------------------------------
// 884-885. Comments
// ---------------------------------------------------------------------------

export class CommentManager {
  private comments: Map<string, Comment> = new Map();
  private listeners: ((comments: Comment[]) => void)[] = [];

  // 884. Add Comment
  addComment(documentId: string, userId: string, content: string, position?: { x: number; y: number }): Comment {
    const comment: Comment = {
      id: this.generateId(),
      documentId,
      userId,
      content,
      position,
      resolved: false,
      replies: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.comments.set(comment.id, comment);
    this.notifyListeners(documentId);
    return comment;
  }

  // Reply to Comment
  addReply(commentId: string, userId: string, content: string): Comment | null {
    const parent = this.comments.get(commentId);
    if (!parent) return null;

    const reply: Comment = {
      id: this.generateId(),
      documentId: parent.documentId,
      userId,
      content,
      resolved: false,
      replies: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    parent.replies.push(reply);
    parent.updatedAt = Date.now();
    this.notifyListeners(parent.documentId);
    return reply;
  }

  // Edit Comment
  editComment(commentId: string, content: string): boolean {
    const comment = this.findComment(commentId);
    if (!comment) return false;

    comment.content = content;
    comment.updatedAt = Date.now();
    this.notifyListeners(comment.documentId);
    return true;
  }

  // 885. Resolve Comment
  resolveComment(commentId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment) return false;

    comment.resolved = true;
    comment.updatedAt = Date.now();
    this.notifyListeners(comment.documentId);
    return true;
  }

  unresolveComment(commentId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment) return false;

    comment.resolved = false;
    comment.updatedAt = Date.now();
    this.notifyListeners(comment.documentId);
    return true;
  }

  // Delete Comment
  deleteComment(commentId: string): boolean {
    const comment = this.comments.get(commentId);
    if (!comment) return false;

    this.comments.delete(commentId);
    this.notifyListeners(comment.documentId);
    return true;
  }

  // Get Comments
  getCommentsForDocument(documentId: string, includeResolved = false): Comment[] {
    return Array.from(this.comments.values())
      .filter(c => c.documentId === documentId)
      .filter(c => includeResolved || !c.resolved)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getComment(commentId: string): Comment | undefined {
    return this.findComment(commentId);
  }

  private findComment(commentId: string): Comment | undefined {
    // Check top-level comments
    if (this.comments.has(commentId)) {
      return this.comments.get(commentId);
    }

    // Check replies
    for (const comment of this.comments.values()) {
      const reply = this.findReply(comment.replies, commentId);
      if (reply) return reply;
    }

    return undefined;
  }

  private findReply(replies: Comment[], commentId: string): Comment | undefined {
    for (const reply of replies) {
      if (reply.id === commentId) return reply;
      const nested = this.findReply(reply.replies, commentId);
      if (nested) return nested;
    }
    return undefined;
  }

  // Listeners
  onChange(callback: (comments: Comment[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(documentId: string): void {
    const comments = this.getCommentsForDocument(documentId, true);
    this.listeners.forEach(l => l(comments));
  }

  private generateId(): string {
    return `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function useCRDT<T extends Record<string, unknown>>(userId: string, initialState: T) {
  const doc = useRef(new CRDTDocument<T>(userId, initialState));
  const [state, setState] = useState<T>(initialState);

  useEffect(() => {
    return doc.current.onChange((newState) => {
      setState(newState);
    });
  }, []);

  const update = useCallback((path: string[], value: unknown) => {
    return doc.current.createOperation('update', path, value);
  }, []);

  const insert = useCallback((path: string[], value: unknown) => {
    return doc.current.createOperation('insert', path, value);
  }, []);

  const remove = useCallback((path: string[]) => {
    return doc.current.createOperation('delete', path);
  }, []);

  const merge = useCallback((ops: CRDTOperation[]) => {
    doc.current.merge(ops);
  }, []);

  return { state, update, insert, remove, merge, doc: doc.current };
}

export function usePresence(user: User) {
  const manager = useRef(new PresenceManager(user));
  const [presence, setPresence] = useState<PresenceState[]>([]);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);

  useEffect(() => {
    const unsubPresence = manager.current.onPresenceChange(setPresence);
    const unsubCursors = manager.current.onCursorChange(setCursors);
    const unsubSelections = manager.current.onSelectionChange(setSelections);

    return () => {
      unsubPresence();
      unsubCursors();
      unsubSelections();
    };
  }, []);

  return {
    presence,
    cursors,
    selections,
    updateCursor: useCallback((x: number, y: number) => manager.current.updateLocalCursor(x, y), []),
    updateSelection: useCallback((start: number, end: number, layerId?: string) => 
      manager.current.updateLocalSelection(start, end, layerId), []),
    updateStatus: useCallback((status: PresenceState['status']) => 
      manager.current.updateLocalPresence(status), []),
    manager: manager.current,
  };
}

export function useSync(userId: string) {
  const engine = useRef(new SyncEngine(userId));
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async (url: string, sessionId: string) => {
    const success = await engine.current.connect(url, sessionId);
    setConnected(success);
    return success;
  }, []);

  const disconnect = useCallback(() => {
    engine.current.disconnect();
    setConnected(false);
  }, []);

  const send = useCallback((type: SyncMessage['type'], payload: unknown) => {
    engine.current.send(type, payload);
  }, []);

  const on = useCallback((type: SyncMessage['type'], callback: (payload: unknown) => void) => {
    return engine.current.on(type, callback);
  }, []);

  return { connected, connect, disconnect, send, on, engine: engine.current };
}

export function useComments(documentId: string) {
  const manager = useRef(new CommentManager());
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    setComments(manager.current.getCommentsForDocument(documentId, true));
    return manager.current.onChange(setComments);
  }, [documentId]);

  return {
    comments,
    addComment: useCallback((userId: string, content: string, position?: { x: number; y: number }) =>
      manager.current.addComment(documentId, userId, content, position), [documentId]),
    addReply: useCallback((commentId: string, userId: string, content: string) =>
      manager.current.addReply(commentId, userId, content), []),
    editComment: useCallback((commentId: string, content: string) =>
      manager.current.editComment(commentId, content), []),
    resolveComment: useCallback((commentId: string) =>
      manager.current.resolveComment(commentId), []),
    deleteComment: useCallback((commentId: string) =>
      manager.current.deleteComment(commentId), []),
    manager: manager.current,
  };
}

export function useShareLinks(documentId: string, baseUrl: string) {
  const manager = useRef(new ShareManager(baseUrl));
  const [links, setLinks] = useState<ShareLink[]>([]);

  useEffect(() => {
    setLinks(manager.current.getLinksForDocument(documentId));
  }, [documentId]);

  const createLink = useCallback((userId: string, options?: Parameters<ShareManager['createShareLink']>[2]) => {
    const link = manager.current.createShareLink(documentId, userId, options);
    setLinks(manager.current.getLinksForDocument(documentId));
    return link;
  }, [documentId]);

  const revokeLink = useCallback((linkId: string) => {
    manager.current.revokeLink(linkId);
    setLinks(manager.current.getLinksForDocument(documentId));
  }, [documentId]);

  const getUrl = useCallback((link: ShareLink) => {
    return manager.current.getShareUrl(link);
  }, []);

  return { links, createLink, revokeLink, getUrl, manager: manager.current };
}
