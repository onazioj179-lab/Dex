// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - NEXUS Cloud - Collaboration Engine
// Real-time collaboration with presence and comments
// Items 726-750 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface CollabConfig {
  serverUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  cursorSyncInterval: number;
  presenceTimeout: number;
  enableChat: boolean;
  enableVoice: boolean;
  enableVideo: boolean;
}

export interface CollabSession {
  id: string;
  projectId: string;
  name: string;
  host: User;
  participants: User[];
  createdAt: number;
  settings: SessionSettings;
  status: 'active' | 'paused' | 'ended';
}

export interface SessionSettings {
  allowEditing: boolean;
  allowComments: boolean;
  allowChat: boolean;
  maxParticipants: number;
  requireApproval: boolean;
  shareLevel: 'view' | 'comment' | 'edit' | 'admin';
}

// =============================================================================
// ITEM 726-730: USER & PRESENCE
// =============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  role: UserRole;
  status: UserStatus;
  lastActive: number;
}

export type UserRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export interface Presence {
  userId: string;
  sessionId: string;
  fileId?: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  viewport?: Viewport;
  lastUpdate: number;
}

export interface CursorPosition {
  file: string;
  line: number;
  column: number;
}

export interface SelectionRange {
  file: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface Viewport {
  file: string;
  startLine: number;
  endLine: number;
  scrollTop: number;
}

// =============================================================================
// ITEM 731-735: REAL-TIME SYNC (CRDT)
// =============================================================================

export interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
  userId: string;
  timestamp: number;
  version: number;
}

export interface DocumentState {
  id: string;
  content: string;
  version: number;
  operations: Operation[];
  cursors: Map<string, CursorPosition>;
}

// Operational Transformation
export class OTDocument {
  private content: string = '';
  private version: number = 0;
  private pendingOps: Operation[] = [];
  private confirmedOps: Operation[] = [];
  
  constructor(initialContent: string = '') {
    this.content = initialContent;
  }
  
  apply(op: Operation): string {
    switch (op.type) {
      case 'insert':
        this.content = 
          this.content.slice(0, op.position) + 
          (op.content || '') + 
          this.content.slice(op.position);
        break;
      case 'delete':
        this.content = 
          this.content.slice(0, op.position) + 
          this.content.slice(op.position + (op.length || 0));
        break;
      case 'retain':
        // No content change, just moves cursor
        break;
    }
    
    this.version++;
    this.confirmedOps.push(op);
    
    return this.content;
  }
  
  // Transform operation against another
  transform(op1: Operation, op2: Operation): [Operation, Operation] {
    const op1Prime = { ...op1 };
    const op2Prime = { ...op2 };
    
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position <= op2.position) {
        op2Prime.position += op1.content?.length || 0;
      } else {
        op1Prime.position += op2.content?.length || 0;
      }
    } else if (op1.type === 'insert' && op2.type === 'delete') {
      if (op1.position <= op2.position) {
        op2Prime.position += op1.content?.length || 0;
      } else if (op1.position >= op2.position + (op2.length || 0)) {
        op1Prime.position -= op2.length || 0;
      } else {
        // Insert inside delete range
        op1Prime.position = op2.position;
        op2Prime.length = op1.position - op2.position;
      }
    } else if (op1.type === 'delete' && op2.type === 'insert') {
      if (op2.position <= op1.position) {
        op1Prime.position += op2.content?.length || 0;
      } else if (op2.position >= op1.position + (op1.length || 0)) {
        // No change needed
      } else {
        // Insert inside delete range
        op2Prime.position = op1.position;
      }
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      if (op1.position >= op2.position + (op2.length || 0)) {
        op1Prime.position -= op2.length || 0;
      } else if (op2.position >= op1.position + (op1.length || 0)) {
        op2Prime.position -= op1.length || 0;
      } else {
        // Overlapping deletes
        const start = Math.min(op1.position, op2.position);
        const end = Math.max(
          op1.position + (op1.length || 0),
          op2.position + (op2.length || 0)
        );
        op1Prime.position = start;
        op1Prime.length = end - start;
        op2Prime.length = 0; // Effectively a no-op
      }
    }
    
    return [op1Prime, op2Prime];
  }
  
  getContent(): string {
    return this.content;
  }
  
  getVersion(): number {
    return this.version;
  }
}

// =============================================================================
// ITEM 736-740: COMMENTS & THREADS
// =============================================================================

export interface Comment {
  id: string;
  threadId: string;
  authorId: string;
  content: string;
  mentions: string[];
  attachments: Attachment[];
  reactions: Reaction[];
  createdAt: number;
  updatedAt: number;
  isEdited: boolean;
  isDeleted: boolean;
}

export interface CommentThread {
  id: string;
  fileId: string;
  anchor: ThreadAnchor;
  status: 'open' | 'resolved' | 'archived';
  comments: Comment[];
  participants: string[];
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface ThreadAnchor {
  type: 'line' | 'range' | 'point';
  file: string;
  startLine: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  originalText?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  timestamp: number;
}

// =============================================================================
// ITEM 741-745: CHAT & COMMUNICATION
// =============================================================================

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  type: 'text' | 'file' | 'image' | 'code' | 'system';
  content: string;
  metadata?: ChatMessageMetadata;
  replyTo?: string;
  mentions: string[];
  reactions: Reaction[];
  timestamp: number;
  isEdited: boolean;
}

export interface ChatMessageMetadata {
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  imageWidth?: number;
  imageHeight?: number;
  codeLanguage?: string;
  previewUrl?: string;
}

export interface ChatChannel {
  id: string;
  sessionId: string;
  name: string;
  type: 'general' | 'direct' | 'thread';
  participants: string[];
  unreadCount: number;
  lastMessage?: ChatMessage;
  createdAt: number;
}

export interface VoiceState {
  channelId: string;
  userId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  volume: number;
}

export interface VideoState {
  channelId: string;
  userId: string;
  isEnabled: boolean;
  isScreenSharing: boolean;
  streamId?: string;
}

// =============================================================================
// ITEM 746-750: COLLABORATION ENGINE
// =============================================================================

export class CollaborationEngine {
  private config: CollabConfig;
  private session: CollabSession | null = null;
  private user: User | null = null;
  private presence: Map<string, Presence> = new Map();
  private documents: Map<string, OTDocument> = new Map();
  private threads: Map<string, CommentThread> = new Map();
  private channels: Map<string, ChatChannel> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();
  private voiceStates: Map<string, VoiceState> = new Map();
  private videoStates: Map<string, VideoState> = new Map();
  private wsConnection: WebSocketConnection | null = null;
  private listeners: Map<string, Set<(event: CollabEvent) => void>> = new Map();
  private reconnectAttempts: number = 0;
  
  constructor(config?: Partial<CollabConfig>) {
    this.config = {
      serverUrl: 'wss://collab.nexus.dex.app',
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      cursorSyncInterval: 50,
      presenceTimeout: 60000,
      enableChat: true,
      enableVoice: true,
      enableVideo: true,
      ...config
    };
  }
  
  // Session management
  async createSession(projectId: string, name: string, settings?: Partial<SessionSettings>): Promise<CollabSession> {
    if (!this.user) throw new Error('User not authenticated');
    
    const session: CollabSession = {
      id: this.generateId(),
      projectId,
      name,
      host: this.user,
      participants: [this.user],
      createdAt: Date.now(),
      settings: {
        allowEditing: true,
        allowComments: true,
        allowChat: true,
        maxParticipants: 10,
        requireApproval: false,
        shareLevel: 'edit',
        ...settings
      },
      status: 'active'
    };
    
    this.session = session;
    await this.connect();
    
    // Create general chat channel
    this.createChannel('General', 'general');
    
    this.emit('session-created', { session });
    return session;
  }
  
  async joinSession(sessionId: string): Promise<CollabSession> {
    if (!this.user) throw new Error('User not authenticated');
    
    // In real implementation, would fetch session from server
    await this.connect();
    
    this.emit('session-joined', { sessionId });
    return this.session!;
  }
  
  async leaveSession(): Promise<void> {
    if (this.session) {
      this.emit('session-left', { sessionId: this.session.id });
      await this.disconnect();
      this.session = null;
    }
  }
  
  async endSession(): Promise<void> {
    if (this.session && this.user?.id === this.session.host.id) {
      this.session.status = 'ended';
      this.emit('session-ended', { session: this.session });
      await this.disconnect();
      this.session = null;
    }
  }
  
  // User authentication
  authenticate(user: User): void {
    this.user = user;
    this.emit('authenticated', { user });
  }
  
  // Connection management
  private async connect(): Promise<void> {
    this.wsConnection = new WebSocketConnection(
      this.config.serverUrl,
      (message) => this.handleMessage(message),
      () => this.handleDisconnect()
    );
    
    await this.wsConnection.connect();
    this.startHeartbeat();
    this.reconnectAttempts = 0;
    
    this.emit('connected', {});
  }
  
  private async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.wsConnection?.close();
    this.wsConnection = null;
    this.emit('disconnected', {});
  }
  
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect();
      }, this.config.reconnectInterval);
    } else {
      this.emit('connection-failed', { attempts: this.reconnectAttempts });
    }
  }
  
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send('heartbeat', { timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
  
  private send(type: string, data: unknown): void {
    this.wsConnection?.send({ type, data });
  }
  
  private handleMessage(message: { type: string; data: unknown }): void {
    switch (message.type) {
      case 'presence-update':
        this.handlePresenceUpdate(message.data as Presence);
        break;
      case 'operation':
        this.handleOperation(message.data as { fileId: string; operation: Operation });
        break;
      case 'comment':
        this.handleComment(message.data as Comment);
        break;
      case 'chat':
        this.handleChatMessage(message.data as ChatMessage);
        break;
      case 'user-joined':
        this.handleUserJoined(message.data as User);
        break;
      case 'user-left':
        this.handleUserLeft(message.data as { userId: string });
        break;
    }
  }
  
  // Presence
  updatePresence(presence: Partial<Presence>): void {
    if (!this.user || !this.session) return;
    
    const fullPresence: Presence = {
      userId: this.user.id,
      sessionId: this.session.id,
      lastUpdate: Date.now(),
      ...presence
    };
    
    this.presence.set(this.user.id, fullPresence);
    this.send('presence', fullPresence);
  }
  
  updateCursor(file: string, line: number, column: number): void {
    this.updatePresence({ cursor: { file, line, column } });
  }
  
  updateSelection(file: string, start: { line: number; column: number }, end: { line: number; column: number }): void {
    this.updatePresence({ selection: { file, start, end } });
  }
  
  updateViewport(file: string, startLine: number, endLine: number, scrollTop: number): void {
    this.updatePresence({ viewport: { file, startLine, endLine, scrollTop } });
  }
  
  private handlePresenceUpdate(presence: Presence): void {
    this.presence.set(presence.userId, presence);
    this.emit('presence-changed', { presence });
    
    // Check for stale presence
    const now = Date.now();
    for (const [userId, p] of this.presence) {
      if (now - p.lastUpdate > this.config.presenceTimeout) {
        this.presence.delete(userId);
        this.emit('user-inactive', { userId });
      }
    }
  }
  
  getPresence(userId: string): Presence | undefined {
    return this.presence.get(userId);
  }
  
  getAllPresence(): Presence[] {
    return Array.from(this.presence.values());
  }
  
  // Document operations
  openDocument(fileId: string, content: string): OTDocument {
    const doc = new OTDocument(content);
    this.documents.set(fileId, doc);
    return doc;
  }
  
  closeDocument(fileId: string): void {
    this.documents.delete(fileId);
  }
  
  applyOperation(fileId: string, operation: Operation): void {
    const doc = this.documents.get(fileId);
    if (!doc) return;
    
    doc.apply(operation);
    this.send('operation', { fileId, operation });
    this.emit('operation-applied', { fileId, operation });
  }
  
  private handleOperation(data: { fileId: string; operation: Operation }): void {
    const doc = this.documents.get(data.fileId);
    if (doc) {
      doc.apply(data.operation);
      this.emit('remote-operation', data);
    }
  }
  
  insertText(fileId: string, position: number, content: string): void {
    const operation: Operation = {
      id: this.generateId(),
      type: 'insert',
      position,
      content,
      userId: this.user!.id,
      timestamp: Date.now(),
      version: this.documents.get(fileId)?.getVersion() || 0
    };
    
    this.applyOperation(fileId, operation);
  }
  
  deleteText(fileId: string, position: number, length: number): void {
    const operation: Operation = {
      id: this.generateId(),
      type: 'delete',
      position,
      length,
      userId: this.user!.id,
      timestamp: Date.now(),
      version: this.documents.get(fileId)?.getVersion() || 0
    };
    
    this.applyOperation(fileId, operation);
  }
  
  // Comments
  createThread(fileId: string, anchor: ThreadAnchor, initialComment: string): CommentThread {
    const thread: CommentThread = {
      id: this.generateId(),
      fileId,
      anchor,
      status: 'open',
      comments: [],
      participants: [this.user!.id],
      createdAt: Date.now()
    };
    
    this.threads.set(thread.id, thread);
    this.addComment(thread.id, initialComment);
    
    this.emit('thread-created', { thread });
    return thread;
  }
  
  addComment(threadId: string, content: string, mentions: string[] = []): Comment {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error('Thread not found');
    
    const comment: Comment = {
      id: this.generateId(),
      threadId,
      authorId: this.user!.id,
      content,
      mentions,
      attachments: [],
      reactions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isEdited: false,
      isDeleted: false
    };
    
    thread.comments.push(comment);
    
    if (!thread.participants.includes(this.user!.id)) {
      thread.participants.push(this.user!.id);
    }
    
    this.send('comment', comment);
    this.emit('comment-added', { thread, comment });
    
    return comment;
  }
  
  editComment(commentId: string, newContent: string): void {
    for (const thread of this.threads.values()) {
      const comment = thread.comments.find(c => c.id === commentId);
      if (comment && comment.authorId === this.user!.id) {
        comment.content = newContent;
        comment.updatedAt = Date.now();
        comment.isEdited = true;
        
        this.send('comment-edit', { commentId, content: newContent });
        this.emit('comment-edited', { comment });
        return;
      }
    }
  }
  
  deleteComment(commentId: string): void {
    for (const thread of this.threads.values()) {
      const comment = thread.comments.find(c => c.id === commentId);
      if (comment && comment.authorId === this.user!.id) {
        comment.isDeleted = true;
        
        this.send('comment-delete', { commentId });
        this.emit('comment-deleted', { comment });
        return;
      }
    }
  }
  
  resolveThread(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = 'resolved';
      thread.resolvedAt = Date.now();
      thread.resolvedBy = this.user!.id;
      
      this.send('thread-resolve', { threadId });
      this.emit('thread-resolved', { thread });
    }
  }
  
  reopenThread(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.status = 'open';
      thread.resolvedAt = undefined;
      thread.resolvedBy = undefined;
      
      this.send('thread-reopen', { threadId });
      this.emit('thread-reopened', { thread });
    }
  }
  
  addReaction(commentId: string, emoji: string): void {
    for (const thread of this.threads.values()) {
      const comment = thread.comments.find(c => c.id === commentId);
      if (comment) {
        const existing = comment.reactions.find(
          r => r.emoji === emoji && r.userId === this.user!.id
        );
        
        if (!existing) {
          comment.reactions.push({
            emoji,
            userId: this.user!.id,
            timestamp: Date.now()
          });
          
          this.send('reaction-add', { commentId, emoji });
          this.emit('reaction-added', { comment, emoji });
        }
        return;
      }
    }
  }
  
  removeReaction(commentId: string, emoji: string): void {
    for (const thread of this.threads.values()) {
      const comment = thread.comments.find(c => c.id === commentId);
      if (comment) {
        comment.reactions = comment.reactions.filter(
          r => !(r.emoji === emoji && r.userId === this.user!.id)
        );
        
        this.send('reaction-remove', { commentId, emoji });
        this.emit('reaction-removed', { comment, emoji });
        return;
      }
    }
  }
  
  private handleComment(comment: Comment): void {
    const thread = this.threads.get(comment.threadId);
    if (thread) {
      thread.comments.push(comment);
      this.emit('remote-comment', { thread, comment });
    }
  }
  
  getThreads(fileId?: string): CommentThread[] {
    const threads = Array.from(this.threads.values());
    return fileId ? threads.filter(t => t.fileId === fileId) : threads;
  }
  
  // Chat
  createChannel(name: string, type: ChatChannel['type'] = 'general'): ChatChannel {
    const channel: ChatChannel = {
      id: this.generateId(),
      sessionId: this.session!.id,
      name,
      type,
      participants: type === 'general' 
        ? this.session!.participants.map(p => p.id)
        : [this.user!.id],
      unreadCount: 0,
      createdAt: Date.now()
    };
    
    this.channels.set(channel.id, channel);
    this.messages.set(channel.id, []);
    
    this.emit('channel-created', { channel });
    return channel;
  }
  
  sendChatMessage(channelId: string, content: string, type: ChatMessage['type'] = 'text'): ChatMessage {
    const message: ChatMessage = {
      id: this.generateId(),
      channelId,
      authorId: this.user!.id,
      type,
      content,
      mentions: this.extractMentions(content),
      reactions: [],
      timestamp: Date.now(),
      isEdited: false
    };
    
    const channelMessages = this.messages.get(channelId) || [];
    channelMessages.push(message);
    this.messages.set(channelId, channelMessages);
    
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.lastMessage = message;
    }
    
    this.send('chat', message);
    this.emit('chat-message', { message });
    
    return message;
  }
  
  sendCodeSnippet(channelId: string, code: string, language: string): ChatMessage {
    return this.sendChatMessage(channelId, code, 'code');
  }
  
  private extractMentions(content: string): string[] {
    const mentions: string[] = [];
    const regex = /@(\w+)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }
  
  private handleChatMessage(message: ChatMessage): void {
    const channelMessages = this.messages.get(message.channelId) || [];
    channelMessages.push(message);
    this.messages.set(message.channelId, channelMessages);
    
    const channel = this.channels.get(message.channelId);
    if (channel && message.authorId !== this.user!.id) {
      channel.unreadCount++;
      channel.lastMessage = message;
    }
    
    this.emit('remote-chat', { message });
  }
  
  markChannelRead(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.unreadCount = 0;
    }
  }
  
  getMessages(channelId: string): ChatMessage[] {
    return this.messages.get(channelId) || [];
  }
  
  getChannels(): ChatChannel[] {
    return Array.from(this.channels.values());
  }
  
  // Voice/Video
  joinVoice(channelId: string): void {
    if (!this.config.enableVoice) return;
    
    const state: VoiceState = {
      channelId,
      userId: this.user!.id,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      volume: 100
    };
    
    this.voiceStates.set(this.user!.id, state);
    this.send('voice-join', state);
    this.emit('voice-joined', { state });
  }
  
  leaveVoice(): void {
    this.voiceStates.delete(this.user!.id);
    this.send('voice-leave', { userId: this.user!.id });
    this.emit('voice-left', { userId: this.user!.id });
  }
  
  toggleMute(): void {
    const state = this.voiceStates.get(this.user!.id);
    if (state) {
      state.isMuted = !state.isMuted;
      this.send('voice-mute', { userId: this.user!.id, muted: state.isMuted });
      this.emit('voice-mute-changed', { state });
    }
  }
  
  toggleDeafen(): void {
    const state = this.voiceStates.get(this.user!.id);
    if (state) {
      state.isDeafened = !state.isDeafened;
      if (state.isDeafened) state.isMuted = true;
      this.send('voice-deafen', { userId: this.user!.id, deafened: state.isDeafened });
      this.emit('voice-deafen-changed', { state });
    }
  }
  
  startVideo(): void {
    if (!this.config.enableVideo) return;
    
    const voiceState = this.voiceStates.get(this.user!.id);
    if (!voiceState) return;
    
    const state: VideoState = {
      channelId: voiceState.channelId,
      userId: this.user!.id,
      isEnabled: true,
      isScreenSharing: false
    };
    
    this.videoStates.set(this.user!.id, state);
    this.send('video-start', state);
    this.emit('video-started', { state });
  }
  
  stopVideo(): void {
    this.videoStates.delete(this.user!.id);
    this.send('video-stop', { userId: this.user!.id });
    this.emit('video-stopped', { userId: this.user!.id });
  }
  
  startScreenShare(): void {
    const state = this.videoStates.get(this.user!.id);
    if (state) {
      state.isScreenSharing = true;
      this.send('screen-share-start', { userId: this.user!.id });
      this.emit('screen-share-started', { state });
    }
  }
  
  stopScreenShare(): void {
    const state = this.videoStates.get(this.user!.id);
    if (state) {
      state.isScreenSharing = false;
      this.send('screen-share-stop', { userId: this.user!.id });
      this.emit('screen-share-stopped', { state });
    }
  }
  
  // User management
  private handleUserJoined(user: User): void {
    if (this.session) {
      this.session.participants.push(user);
      this.emit('user-joined', { user });
    }
  }
  
  private handleUserLeft(data: { userId: string }): void {
    if (this.session) {
      this.session.participants = this.session.participants.filter(
        p => p.id !== data.userId
      );
      this.presence.delete(data.userId);
      this.voiceStates.delete(data.userId);
      this.videoStates.delete(data.userId);
      this.emit('user-left', data);
    }
  }
  
  kickUser(userId: string): void {
    if (this.user?.id === this.session?.host.id) {
      this.send('kick-user', { userId });
      this.emit('user-kicked', { userId });
    }
  }
  
  changeRole(userId: string, newRole: UserRole): void {
    if (this.user?.id === this.session?.host.id || this.user?.role === 'admin') {
      const participant = this.session?.participants.find(p => p.id === userId);
      if (participant) {
        participant.role = newRole;
        this.send('role-change', { userId, role: newRole });
        this.emit('role-changed', { userId, role: newRole });
      }
    }
  }
  
  // Event handling
  on(event: string, callback: (event: CollabEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: CollabEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const collabEvent: CollabEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(collabEvent));
    }
  }
  
  // State getters
  getSession(): CollabSession | null {
    return this.session;
  }
  
  getUser(): User | null {
    return this.user;
  }
  
  getParticipants(): User[] {
    return this.session?.participants || [];
  }
  
  getDocument(fileId: string): OTDocument | undefined {
    return this.documents.get(fileId);
  }
  
  // Utilities
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// WEBSOCKET HELPER
// =============================================================================

class WebSocketConnection {
  private url: string;
  private ws: WebSocket | null = null;
  private onMessage: (message: { type: string; data: unknown }) => void;
  private onDisconnect: () => void;
  
  constructor(
    url: string,
    onMessage: (message: { type: string; data: unknown }) => void,
    onDisconnect: () => void
  ) {
    this.url = url;
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => resolve();
        this.ws.onerror = (e) => reject(e);
        this.ws.onclose = () => this.onDisconnect();
        this.ws.onmessage = (e) => {
          try {
            const message = JSON.parse(e.data);
            this.onMessage(message);
          } catch {
            // Invalid message
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }
  
  send(data: { type: string; data: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface CollabEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// ITEM 101-105: FILE SHARING & PERMISSIONS
// =============================================================================

export interface SharedFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  ownerId: string;
  permissions: FilePermissions;
  sharedWith: SharedAccess[];
  uploadedAt: number;
  lastModified: number;
  version: number;
}

export interface FilePermissions {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canShare: boolean;
  canDownload: boolean;
  canDelete: boolean;
}

export interface SharedAccess {
  userId: string;
  permissions: FilePermissions;
  grantedAt: number;
  grantedBy: string;
  expiresAt?: number;
}

export function createDefaultPermissions(role: UserRole): FilePermissions {
  const permissions: Record<UserRole, FilePermissions> = {
    owner: { canView: true, canEdit: true, canComment: true, canShare: true, canDownload: true, canDelete: true },
    admin: { canView: true, canEdit: true, canComment: true, canShare: true, canDownload: true, canDelete: false },
    editor: { canView: true, canEdit: true, canComment: true, canShare: false, canDownload: true, canDelete: false },
    commenter: { canView: true, canEdit: false, canComment: true, canShare: false, canDownload: true, canDelete: false },
    viewer: { canView: true, canEdit: false, canComment: false, canShare: false, canDownload: false, canDelete: false },
  };
  return permissions[role];
}

// =============================================================================
// ITEM 106-110: VERSION HISTORY & DIFF
// =============================================================================

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  content: string;
  authorId: string;
  createdAt: number;
  message?: string;
  size: number;
  checksum: string;
}

export interface DiffResult {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function computeDiff(oldContent: string, newContent: string): DiffResult {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  
  // Simple line-by-line diff (Myers algorithm would be better for production)
  let i = 0, j = 0;
  let currentHunk: DiffHunk | null = null;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      // Context line
      if (currentHunk) {
        currentHunk.lines.push({ type: 'context', content: oldLines[i], oldLineNumber: i + 1, newLineNumber: j + 1 });
      }
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
      // Addition
      if (!currentHunk) {
        currentHunk = { oldStart: i + 1, oldLines: 0, newStart: j + 1, newLines: 0, lines: [] };
      }
      currentHunk.lines.push({ type: 'add', content: newLines[j], newLineNumber: j + 1 });
      currentHunk.newLines++;
      additions++;
      j++;
    } else if (i < oldLines.length) {
      // Deletion
      if (!currentHunk) {
        currentHunk = { oldStart: i + 1, oldLines: 0, newStart: j + 1, newLines: 0, lines: [] };
      }
      currentHunk.lines.push({ type: 'remove', content: oldLines[i], oldLineNumber: i + 1 });
      currentHunk.oldLines++;
      deletions++;
      i++;
    }
    
    // Close hunk if we have context
    if (currentHunk && currentHunk.lines.length > 0) {
      const lastLine = currentHunk.lines[currentHunk.lines.length - 1];
      if (lastLine.type === 'context' && currentHunk.lines.filter(l => l.type !== 'context').length > 0) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    }
  }
  
  if (currentHunk && currentHunk.lines.length > 0) {
    hunks.push(currentHunk);
  }
  
  return { additions, deletions, hunks };
}

// =============================================================================
// ITEM 111-115: ACTIVITY FEED
// =============================================================================

export type ActivityType = 
  | 'file-created' | 'file-edited' | 'file-deleted' | 'file-shared'
  | 'comment-added' | 'comment-resolved' | 'thread-created'
  | 'user-joined' | 'user-left' | 'user-mentioned'
  | 'session-started' | 'session-ended'
  | 'version-created' | 'version-restored';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

export function formatActivityMessage(activity: ActivityItem): string {
  const messages: Record<ActivityType, (a: ActivityItem) => string> = {
    'file-created': (a) => `${a.actorName} created ${a.targetName}`,
    'file-edited': (a) => `${a.actorName} edited ${a.targetName}`,
    'file-deleted': (a) => `${a.actorName} deleted ${a.targetName}`,
    'file-shared': (a) => `${a.actorName} shared ${a.targetName}`,
    'comment-added': (a) => `${a.actorName} commented on ${a.targetName}`,
    'comment-resolved': (a) => `${a.actorName} resolved a thread on ${a.targetName}`,
    'thread-created': (a) => `${a.actorName} started a discussion on ${a.targetName}`,
    'user-joined': (a) => `${a.actorName} joined the session`,
    'user-left': (a) => `${a.actorName} left the session`,
    'user-mentioned': (a) => `${a.actorName} mentioned ${a.targetName}`,
    'session-started': (a) => `${a.actorName} started the session`,
    'session-ended': (a) => `${a.actorName} ended the session`,
    'version-created': (a) => `${a.actorName} saved version ${a.metadata?.version} of ${a.targetName}`,
    'version-restored': (a) => `${a.actorName} restored ${a.targetName} to version ${a.metadata?.version}`,
  };
  return messages[activity.type]?.(activity) || `${activity.actorName} performed an action`;
}

export function groupActivitiesByDay(activities: ActivityItem[]): Map<string, ActivityItem[]> {
  const groups = new Map<string, ActivityItem[]>();
  for (const activity of activities) {
    const date = new Date(activity.timestamp).toDateString();
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(activity);
  }
  return groups;
}

// =============================================================================
// ITEM 116-118: SMART NOTIFICATIONS
// =============================================================================

export interface CollabNotification {
  id: string;
  type: 'mention' | 'comment' | 'reaction' | 'edit' | 'join' | 'share' | 'resolve';
  title: string;
  body: string;
  actorId: string;
  actorName: string;
  targetId?: string;
  priority: 'low' | 'normal' | 'high';
  read: boolean;
  timestamp: number;
  action?: { type: string; payload: Record<string, unknown> };
}

export function shouldNotify(notification: CollabNotification, preferences: NotificationPreferences): boolean {
  if (!preferences.enabled) return false;
  if (preferences.mutedUsers.includes(notification.actorId)) return false;
  if (!preferences.types[notification.type]) return false;
  if (notification.priority === 'low' && !preferences.showLowPriority) return false;
  
  // Don't disturb mode
  if (preferences.doNotDisturb) {
    const now = new Date();
    const hours = now.getHours();
    if (hours >= preferences.dndStart || hours < preferences.dndEnd) return false;
  }
  
  return true;
}

export interface NotificationPreferences {
  enabled: boolean;
  types: Record<CollabNotification['type'], boolean>;
  showLowPriority: boolean;
  doNotDisturb: boolean;
  dndStart: number; // hour 0-23
  dndEnd: number;   // hour 0-23
  mutedUsers: string[];
  mutedSessions: string[];
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  types: { mention: true, comment: true, reaction: false, edit: false, join: true, share: true, resolve: true },
  showLowPriority: false,
  doNotDisturb: false,
  dndStart: 22,
  dndEnd: 8,
  mutedUsers: [],
  mutedSessions: [],
};

// =============================================================================
// ITEM 119-120: SESSION ANALYTICS
// =============================================================================

export interface SessionAnalytics {
  sessionId: string;
  duration: number;
  participantCount: number;
  peakParticipants: number;
  totalEdits: number;
  totalComments: number;
  totalMessages: number;
  editsByUser: Record<string, number>;
  commentsByUser: Record<string, number>;
  activeFiles: string[];
  timeline: AnalyticsTimelinePoint[];
}

export interface AnalyticsTimelinePoint {
  timestamp: number;
  participants: number;
  edits: number;
  comments: number;
}

export function generateSessionSummary(analytics: SessionAnalytics): string {
  const hours = Math.floor(analytics.duration / 3600000);
  const minutes = Math.floor((analytics.duration % 3600000) / 60000);
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  
  const topContributor = Object.entries(analytics.editsByUser)
    .sort(([, a], [, b]) => b - a)[0];
  
  return [
    `Session lasted ${durationStr} with ${analytics.participantCount} participants.`,
    `${analytics.totalEdits} edits across ${analytics.activeFiles.length} files.`,
    `${analytics.totalComments} comments and ${analytics.totalMessages} chat messages.`,
    topContributor ? `Top contributor: ${topContributor[0]} (${topContributor[1]} edits)` : '',
  ].filter(Boolean).join(' ');
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createCollaborationEngine = (config?: Partial<CollabConfig>) => 
  new CollaborationEngine(config);

export default { CollaborationEngine, createCollaborationEngine };
