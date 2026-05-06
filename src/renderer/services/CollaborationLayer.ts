// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Collaboration Layer
 * 8A: CRDT-based Document Sync Engine
 * 8B: Co-Edit Notes (real-time collaborative editing)
 * 8C: Comments & Annotations System
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

const ipc = (channel: string, ...args: unknown[]) =>
  (window as any).electron?.ipcRenderer?.invoke(channel, ...args).catch(() => null);

// ===========================================================================
// 8A: CRDT Document Sync Engine (Logoot-style)
// ===========================================================================

// Logoot position identifier: (integer, siteId) pairs
interface LogootIdent {
  int: number;
  site: string;
}

// A position in the Logoot document is a list of identifiers
type LogootPosition = LogootIdent[];

interface CRDTAtom {
  id: string;
  position: LogootPosition;
  char: string;
  tombstone: boolean;
  lamport: number;
  siteId: string;
}

interface CRDTOperation {
  type: 'insert' | 'delete';
  atom: CRDTAtom;
  siteId: string;
  lamport: number;
  timestamp: number;
}

interface CRDTDocument {
  id: string;
  atoms: CRDTAtom[];
  clock: number;
  siteId: string;
  version: number;
}

// Compare two Logoot positions lexicographically
function comparePositions(a: LogootPosition, b: LogootPosition): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] || { int: 0, site: '' };
    const bi = b[i] || { int: 0, site: '' };
    if (ai.int !== bi.int) return ai.int - bi.int;
    if (ai.site < bi.site) return -1;
    if (ai.site > bi.site) return 1;
  }
  return 0;
}

// Generate a position between two existing positions
function generatePositionBetween(
  before: LogootPosition,
  after: LogootPosition,
  siteId: string,
  depth: number = 0,
): LogootPosition {
  const maxDepth = 32;
  if (depth > maxDepth) {
    return [...before, { int: 1, site: siteId }];
  }

  const bIdent = before[depth] || { int: 0, site: '' };
  const aIdent = after[depth] || { int: 32767, site: '' };

  if (aIdent.int - bIdent.int > 1) {
    const mid = Math.floor((bIdent.int + aIdent.int) / 2);
    const result = before.slice(0, depth);
    result.push({ int: mid, site: siteId });
    return result;
  }

  if (aIdent.int - bIdent.int === 1) {
    const result = before.slice(0, depth + 1);
    return generatePositionBetween(result, [{ int: 32767, site: '' }], siteId, depth + 1);
  }

  if (bIdent.site < siteId) {
    const result = before.slice(0, depth);
    result.push({ int: bIdent.int, site: siteId });
    return result;
  }

  return generatePositionBetween(before, after, siteId, depth + 1);
}

// Binary search for sorted atom insertion
function findInsertIndex(atoms: CRDTAtom[], position: LogootPosition): number {
  let lo = 0;
  let hi = atoms.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (comparePositions(atoms[mid].position, position) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function createCRDTDocument(docId: string, siteId: string): CRDTDocument {
  return { id: docId, atoms: [], clock: 0, siteId, version: 0 };
}

function insertAtPosition(
  doc: CRDTDocument,
  index: number,
  char: string,
): { doc: CRDTDocument; op: CRDTOperation } {
  const visible = doc.atoms.filter(a => !a.tombstone);
  const beforeAtom = visible[index - 1];
  const afterAtom = visible[index];

  const beforePos: LogootPosition = beforeAtom ? beforeAtom.position : [{ int: 0, site: '' }];
  const afterPos: LogootPosition = afterAtom ? afterAtom.position : [{ int: 32767, site: '' }];

  const newClock = doc.clock + 1;
  const position = generatePositionBetween(beforePos, afterPos, doc.siteId);

  const atom: CRDTAtom = {
    id: `${doc.siteId}:${newClock}`,
    position,
    char,
    tombstone: false,
    lamport: newClock,
    siteId: doc.siteId,
  };

  const insertIdx = findInsertIndex(doc.atoms, position);
  const newAtoms = [...doc.atoms];
  newAtoms.splice(insertIdx, 0, atom);

  const op: CRDTOperation = {
    type: 'insert',
    atom,
    siteId: doc.siteId,
    lamport: newClock,
    timestamp: Date.now(),
  };

  return {
    doc: { ...doc, atoms: newAtoms, clock: newClock, version: doc.version + 1 },
    op,
  };
}

function deleteAtPosition(
  doc: CRDTDocument,
  index: number,
): { doc: CRDTDocument; op: CRDTOperation } | null {
  const visible = doc.atoms.filter(a => !a.tombstone);
  const target = visible[index];
  if (!target) return null;

  const newClock = doc.clock + 1;
  const newAtoms = doc.atoms.map(a =>
    a.id === target.id ? { ...a, tombstone: true } : a
  );

  const op: CRDTOperation = {
    type: 'delete',
    atom: { ...target, tombstone: true },
    siteId: doc.siteId,
    lamport: newClock,
    timestamp: Date.now(),
  };

  return {
    doc: { ...doc, atoms: newAtoms, clock: newClock, version: doc.version + 1 },
    op,
  };
}

function applyRemoteOperation(doc: CRDTDocument, op: CRDTOperation): CRDTDocument {
  const newClock = Math.max(doc.clock, op.lamport) + 1;

  if (op.type === 'insert') {
    const existing = doc.atoms.find(a => a.id === op.atom.id);
    if (existing) return { ...doc, clock: newClock };

    const insertIdx = findInsertIndex(doc.atoms, op.atom.position);
    const newAtoms = [...doc.atoms];
    newAtoms.splice(insertIdx, 0, op.atom);
    return { ...doc, atoms: newAtoms, clock: newClock, version: doc.version + 1 };
  }

  if (op.type === 'delete') {
    const newAtoms = doc.atoms.map(a =>
      a.id === op.atom.id ? { ...a, tombstone: true } : a
    );
    return { ...doc, atoms: newAtoms, clock: newClock, version: doc.version + 1 };
  }

  return doc;
}

function documentToString(doc: CRDTDocument): string {
  return doc.atoms.filter(a => !a.tombstone).map(a => a.char).join('');
}

// ===========================================================================
// CRDT Sync Store
// ===========================================================================

interface SyncPeer {
  id: string;
  name: string;
  address: string;
  port: number;
  lastSeen: number;
  latency: number;
}

interface PendingOp {
  docId: string;
  op: CRDTOperation;
  delivered: Set<string>;
}

interface CRDTSyncState {
  siteId: string;
  documents: Record<string, CRDTDocument>;
  peers: SyncPeer[];
  connected: boolean;
  pendingOps: PendingOp[];
  operationLog: CRDTOperation[];
  broadcastPort: number;

  initSite: () => void;
  createDocument: (docId: string) => void;
  localInsert: (docId: string, index: number, char: string) => CRDTOperation | null;
  localDelete: (docId: string, index: number) => CRDTOperation | null;
  applyRemote: (docId: string, op: CRDTOperation) => void;
  getText: (docId: string) => string;
  setText: (docId: string, text: string) => void;

  discoverPeers: () => Promise<void>;
  connectToPeer: (address: string, port: number) => Promise<void>;
  broadcastOperation: (docId: string, op: CRDTOperation) => Promise<void>;
  syncDocument: (docId: string, peerId: string) => Promise<void>;
  getDocumentVersion: (docId: string) => number;
}

export const useCRDTSyncStore = create<CRDTSyncState>()(
  devtools(
    (set, get) => ({
      siteId: '',
      documents: {},
      peers: [],
      connected: false,
      pendingOps: [],
      operationLog: [],
      broadcastPort: 9451,

      initSite: () => {
        const existing = get().siteId;
        if (existing) return;
        const id = 'site-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
        set({ siteId: id });
      },

      createDocument: (docId: string) => {
        const { documents, siteId } = get();
        if (documents[docId]) return;
        const doc = createCRDTDocument(docId, siteId);
        set({ documents: { ...documents, [docId]: doc } });
      },

      localInsert: (docId: string, index: number, char: string) => {
        const { documents, siteId, operationLog, pendingOps } = get();
        const doc = documents[docId];
        if (!doc) return null;

        const docWithSite = { ...doc, siteId };
        const result = insertAtPosition(docWithSite, index, char);
        set({
          documents: { ...documents, [docId]: result.doc },
          operationLog: [...operationLog, result.op],
          pendingOps: [...pendingOps, { docId, op: result.op, delivered: new Set() }],
        });
        return result.op;
      },

      localDelete: (docId: string, index: number) => {
        const { documents, siteId, operationLog, pendingOps } = get();
        const doc = documents[docId];
        if (!doc) return null;

        const docWithSite = { ...doc, siteId };
        const result = deleteAtPosition(docWithSite, index);
        if (!result) return null;

        set({
          documents: { ...documents, [docId]: result.doc },
          operationLog: [...operationLog, result.op],
          pendingOps: [...pendingOps, { docId, op: result.op, delivered: new Set() }],
        });
        return result.op;
      },

      applyRemote: (docId: string, op: CRDTOperation) => {
        const { documents, operationLog } = get();
        let doc = documents[docId];
        if (!doc) {
          doc = createCRDTDocument(docId, get().siteId);
        }
        const updated = applyRemoteOperation(doc, op);
        set({
          documents: { ...documents, [docId]: updated },
          operationLog: [...operationLog, op],
        });
      },

      getText: (docId: string) => {
        const doc = get().documents[docId];
        if (!doc) return '';
        return documentToString(doc);
      },

      setText: (docId: string, text: string) => {
        const { documents, siteId } = get();
        let doc = documents[docId];
        if (!doc) {
          doc = createCRDTDocument(docId, siteId);
        }
        // Clear and rebuild - used for initial load from saved text
        let current = { ...doc, atoms: [] as CRDTAtom[], clock: doc.clock, siteId };
        for (let i = 0; i < text.length; i++) {
          const result = insertAtPosition(current, i, text[i]);
          current = result.doc;
        }
        set({ documents: { ...documents, [docId]: current } });
      },

      discoverPeers: async () => {
        const result = await ipc('collaboration:discover-peers');
        if (result && Array.isArray(result)) {
          set({ peers: result, connected: result.length > 0 });
        }
      },

      connectToPeer: async (address: string, port: number) => {
        const result = await ipc('collaboration:connect-peer', { address, port });
        if (result) {
          const { peers } = get();
          const exists = peers.find(p => p.address === address && p.port === port);
          if (!exists) {
            set({ peers: [...peers, result], connected: true });
          }
        }
      },

      broadcastOperation: async (docId: string, op: CRDTOperation) => {
        const { peers } = get();
        for (const peer of peers) {
          await ipc('collaboration:send-operation', {
            peerId: peer.id,
            docId,
            operation: op,
          });
        }
      },

      syncDocument: async (docId: string, peerId: string) => {
        const doc = get().documents[docId];
        if (!doc) return;
        const remoteOps = await ipc('collaboration:sync-document', {
          peerId,
          docId,
          version: doc.version,
        });
        if (remoteOps && Array.isArray(remoteOps)) {
          let current = doc;
          for (const op of remoteOps) {
            current = applyRemoteOperation(current, op);
          }
          const { documents } = get();
          set({ documents: { ...documents, [docId]: current } });
        }
      },

      getDocumentVersion: (docId: string) => {
        return get().documents[docId]?.version ?? 0;
      },
    }),
    { name: 'dex-crdt-sync', enabled: import.meta.env.DEV }
  )
);

// ===========================================================================
// 8B: Co-Edit Notes Store
// ===========================================================================

interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  position: number; // character offset
  selection?: { start: number; end: number };
  lastUpdate: number;
}

interface EditSession {
  id: string;
  noteId: string;
  host: string;
  participants: string[];
  cursors: Record<string, CollaboratorCursor>;
  started: number;
  docId: string;
}

interface CoEditState {
  sessions: EditSession[];
  activeSession: string | null;
  cursors: Record<string, CollaboratorCursor>;
  localCursor: { position: number; selection?: { start: number; end: number } } | null;
  userColors: Record<string, string>;
  undoStack: CRDTOperation[][];
  redoStack: CRDTOperation[][];

  startSession: (noteId: string, noteContent: string) => string;
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => void;
  updateCursor: (position: number, selection?: { start: number; end: number }) => void;
  applyLocalChange: (index: number, deleteCount: number, insertText: string) => void;
  undo: () => void;
  redo: () => void;
  getSessionParticipants: () => CollaboratorCursor[];
}

const COLLAB_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f',
  '#bb8fce', '#85c1e9', '#f0b27a', '#82e0aa',
];

export const useCoEditStore = create<CoEditState>()(
  devtools(
    (set, get) => ({
      sessions: [],
      activeSession: null,
      cursors: {},
      localCursor: null,
      userColors: {},
      undoStack: [],
      redoStack: [],

      startSession: (noteId: string, noteContent: string) => {
        const crdtStore = useCRDTSyncStore.getState();
        crdtStore.initSite();

        const sessionId = 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const docId = 'note-' + noteId;

        crdtStore.createDocument(docId);
        crdtStore.setText(docId, noteContent);

        const session: EditSession = {
          id: sessionId,
          noteId,
          host: crdtStore.siteId,
          participants: [crdtStore.siteId],
          cursors: {},
          started: Date.now(),
          docId,
        };

        set(s => ({
          sessions: [...s.sessions, session],
          activeSession: sessionId,
          undoStack: [],
          redoStack: [],
        }));

        ipc('collaboration:broadcast-session', { sessionId, noteId, docId });
        return sessionId;
      },

      joinSession: async (sessionId: string) => {
        const result = await ipc('collaboration:join-session', { sessionId });
        if (!result) return;

        const crdtStore = useCRDTSyncStore.getState();
        crdtStore.initSite();

        const { docId, noteId, host, participants } = result;
        crdtStore.createDocument(docId);

        // Sync full document state from host
        await crdtStore.syncDocument(docId, host);

        const session: EditSession = {
          id: sessionId,
          noteId,
          host,
          participants: [...participants, crdtStore.siteId],
          cursors: {},
          started: Date.now(),
          docId,
        };

        const colorIndex = participants.length % COLLAB_COLORS.length;
        set(s => ({
          sessions: [...s.sessions, session],
          activeSession: sessionId,
          userColors: { ...s.userColors, [crdtStore.siteId]: COLLAB_COLORS[colorIndex] },
          undoStack: [],
          redoStack: [],
        }));
      },

      leaveSession: () => {
        const { activeSession, sessions } = get();
        if (!activeSession) return;

        const session = sessions.find(s => s.id === activeSession);
        if (session) {
          const siteId = useCRDTSyncStore.getState().siteId;
          ipc('collaboration:leave-session', { sessionId: activeSession, siteId });
        }

        set(s => ({
          activeSession: null,
          sessions: s.sessions.filter(s2 => s2.id !== activeSession),
          cursors: {},
          localCursor: null,
        }));
      },

      updateCursor: (position: number, selection?: { start: number; end: number }) => {
        const { activeSession } = get();
        if (!activeSession) return;

        const siteId = useCRDTSyncStore.getState().siteId;
        set({ localCursor: { position, selection } });

        ipc('collaboration:update-cursor', {
          sessionId: activeSession,
          cursor: { userId: siteId, position, selection, lastUpdate: Date.now() },
        });
      },

      applyLocalChange: (index: number, deleteCount: number, insertText: string) => {
        const { activeSession, sessions } = get();
        if (!activeSession) return;

        const session = sessions.find(s => s.id === activeSession);
        if (!session) return;

        const crdtStore = useCRDTSyncStore.getState();
        const ops: CRDTOperation[] = [];

        // Delete characters
        for (let i = deleteCount - 1; i >= 0; i--) {
          const op = crdtStore.localDelete(session.docId, index + i);
          if (op) ops.push(op);
        }

        // Insert characters
        for (let i = 0; i < insertText.length; i++) {
          const op = crdtStore.localInsert(session.docId, index + i, insertText[i]);
          if (op) ops.push(op);
        }

        // Broadcast all ops
        for (const op of ops) {
          crdtStore.broadcastOperation(session.docId, op);
        }

        // Push to undo stack
        set(s => ({
          undoStack: [...s.undoStack, ops],
          redoStack: [],
        }));
      },

      undo: () => {
        const { undoStack, activeSession, sessions } = get();
        if (undoStack.length === 0 || !activeSession) return;

        const session = sessions.find(s => s.id === activeSession);
        if (!session) return;

        const lastOps = undoStack[undoStack.length - 1];
        const crdtStore = useCRDTSyncStore.getState();
        const reverseOps: CRDTOperation[] = [];

        // Reverse operations
        for (let i = lastOps.length - 1; i >= 0; i--) {
          const original = lastOps[i];
          if (original.type === 'insert') {
            // Find the atom and delete it
            const doc = crdtStore.documents[session.docId];
            if (doc) {
              const visible = doc.atoms.filter(a => !a.tombstone);
              const idx = visible.findIndex(a => a.id === original.atom.id);
              if (idx >= 0) {
                const op = crdtStore.localDelete(session.docId, idx);
                if (op) reverseOps.push(op);
              }
            }
          }
          // Delete undos are complex in CRDT - we skip re-insert for safety
        }

        for (const op of reverseOps) {
          crdtStore.broadcastOperation(session.docId, op);
        }

        set(s => ({
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, lastOps],
        }));
      },

      redo: () => {
        const { redoStack, activeSession, sessions } = get();
        if (redoStack.length === 0 || !activeSession) return;

        const session = sessions.find(s => s.id === activeSession);
        if (!session) return;

        const ops = redoStack[redoStack.length - 1];
        const crdtStore = useCRDTSyncStore.getState();

        for (const op of ops) {
          if (op.type === 'insert') {
            const doc = crdtStore.documents[session.docId];
            if (doc) {
              const visible = doc.atoms.filter(a => !a.tombstone);
              const targetIdx = visible.length;
              crdtStore.localInsert(session.docId, targetIdx, op.atom.char);
            }
          }
        }

        set(s => ({
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, ops],
        }));
      },

      getSessionParticipants: () => {
        const { cursors } = get();
        return Object.values(cursors);
      },
    }),
    { name: 'dex-co-edit', enabled: import.meta.env.DEV }
  )
);

// ===========================================================================
// 8C: Comments & Annotations Store
// ===========================================================================

interface Annotation {
  id: string;
  type: 'highlight' | 'underline' | 'strikethrough' | 'bookmark' | 'note';
  targetId: string; // ID of the annotated entity (file, note, task)
  targetType: 'note' | 'file' | 'task' | 'calendar-event' | 'code';
  range?: { start: number; end: number }; // character range for text annotations
  color: string;
  content: string;
  author: { id: string; name: string };
  createdAt: number;
  updatedAt: number;
  resolved: boolean;
  tags: string[];
}

interface ThreadedComment {
  id: string;
  parentId: string | null; // null for top-level comments
  annotationId?: string; // linked to annotation if inline
  targetId: string;
  targetType: 'note' | 'file' | 'task' | 'calendar-event' | 'code';
  author: { id: string; name: string };
  content: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  pinned: boolean;
  reactions: Record<string, string[]>; // reaction -> userId[]
  resolved: boolean;
  mentions: string[];
}

interface CommentsAnnotationsState {
  annotations: Annotation[];
  comments: ThreadedComment[];
  activeTarget: { id: string; type: string } | null;
  filterResolved: boolean;
  sortOrder: 'newest' | 'oldest' | 'most-replies';

  // Annotations
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'resolved'>) => string;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  resolveAnnotation: (id: string) => void;
  getAnnotationsForTarget: (targetId: string) => Annotation[];

  // Comments
  addComment: (comment: Omit<ThreadedComment, 'id' | 'createdAt' | 'updatedAt' | 'edited' | 'pinned' | 'reactions' | 'resolved'>) => string;
  editComment: (id: string, content: string) => void;
  deleteComment: (id: string) => void;
  pinComment: (id: string) => void;
  resolveComment: (id: string) => void;
  addReaction: (commentId: string, reaction: string, userId: string) => void;
  removeReaction: (commentId: string, reaction: string, userId: string) => void;
  getCommentsForTarget: (targetId: string) => ThreadedComment[];
  getReplies: (parentId: string) => ThreadedComment[];
  getThreadCount: (targetId: string) => number;

  // Filters
  setActiveTarget: (target: { id: string; type: string } | null) => void;
  setFilterResolved: (v: boolean) => void;
  setSortOrder: (order: 'newest' | 'oldest' | 'most-replies') => void;
}

export const useCommentsAnnotationsStore = create<CommentsAnnotationsState>()(
  persist(
    devtools(
      (set, get) => ({
        annotations: [],
        comments: [],
        activeTarget: null,
        filterResolved: false,
        sortOrder: 'newest' as const,

        // ------- Annotations -------

        addAnnotation: (annotation) => {
          const id = 'ann-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
          const now = Date.now();
          const full: Annotation = {
            ...annotation,
            id,
            createdAt: now,
            updatedAt: now,
            resolved: false,
          };
          set(s => ({ annotations: [...s.annotations, full] }));
          ipc('collaboration:annotation-added', full);
          return id;
        },

        updateAnnotation: (id: string, updates: Partial<Annotation>) => {
          set(s => ({
            annotations: s.annotations.map(a =>
              a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
            ),
          }));
        },

        removeAnnotation: (id: string) => {
          set(s => ({
            annotations: s.annotations.filter(a => a.id !== id),
            comments: s.comments.filter(c => c.annotationId !== id),
          }));
        },

        resolveAnnotation: (id: string) => {
          set(s => ({
            annotations: s.annotations.map(a =>
              a.id === id ? { ...a, resolved: true, updatedAt: Date.now() } : a
            ),
          }));
        },

        getAnnotationsForTarget: (targetId: string) => {
          const { annotations, filterResolved } = get();
          let result = annotations.filter(a => a.targetId === targetId);
          if (!filterResolved) {
            result = result.filter(a => !a.resolved);
          }
          return result;
        },

        // ------- Comments -------

        addComment: (comment) => {
          const id = 'cmt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
          const now = Date.now();
          const full: ThreadedComment = {
            ...comment,
            id,
            createdAt: now,
            updatedAt: now,
            edited: false,
            pinned: false,
            reactions: {},
            resolved: false,
          };
          set(s => ({ comments: [...s.comments, full] }));
          ipc('collaboration:comment-added', full);
          return id;
        },

        editComment: (id: string, content: string) => {
          set(s => ({
            comments: s.comments.map(c =>
              c.id === id ? { ...c, content, edited: true, updatedAt: Date.now() } : c
            ),
          }));
        },

        deleteComment: (id: string) => {
          // Also delete all replies recursively
          const toDelete = new Set<string>();
          const collect = (parentId: string) => {
            toDelete.add(parentId);
            get().comments.filter(c => c.parentId === parentId).forEach(c => collect(c.id));
          };
          collect(id);
          set(s => ({ comments: s.comments.filter(c => !toDelete.has(c.id)) }));
        },

        pinComment: (id: string) => {
          set(s => ({
            comments: s.comments.map(c =>
              c.id === id ? { ...c, pinned: !c.pinned } : c
            ),
          }));
        },

        resolveComment: (id: string) => {
          set(s => ({
            comments: s.comments.map(c =>
              c.id === id ? { ...c, resolved: !c.resolved, updatedAt: Date.now() } : c
            ),
          }));
        },

        addReaction: (commentId: string, reaction: string, userId: string) => {
          set(s => ({
            comments: s.comments.map(c => {
              if (c.id !== commentId) return c;
              const existing = c.reactions[reaction] || [];
              if (existing.includes(userId)) return c;
              return {
                ...c,
                reactions: { ...c.reactions, [reaction]: [...existing, userId] },
              };
            }),
          }));
        },

        removeReaction: (commentId: string, reaction: string, userId: string) => {
          set(s => ({
            comments: s.comments.map(c => {
              if (c.id !== commentId) return c;
              const existing = c.reactions[reaction] || [];
              return {
                ...c,
                reactions: {
                  ...c.reactions,
                  [reaction]: existing.filter(u => u !== userId),
                },
              };
            }),
          }));
        },

        getCommentsForTarget: (targetId: string) => {
          const { comments, filterResolved, sortOrder } = get();
          let result = comments.filter(c => c.targetId === targetId && c.parentId === null);
          if (!filterResolved) {
            result = result.filter(c => !c.resolved);
          }

          if (sortOrder === 'newest') {
            result.sort((a, b) => b.createdAt - a.createdAt);
          } else if (sortOrder === 'oldest') {
            result.sort((a, b) => a.createdAt - b.createdAt);
          } else if (sortOrder === 'most-replies') {
            const replyCounts: Record<string, number> = {};
            for (const c of comments) {
              if (c.parentId) {
                replyCounts[c.parentId] = (replyCounts[c.parentId] || 0) + 1;
              }
            }
            result.sort((a, b) => (replyCounts[b.id] || 0) - (replyCounts[a.id] || 0));
          }

          // Pinned float to top
          result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
          return result;
        },

        getReplies: (parentId: string) => {
          return get().comments
            .filter(c => c.parentId === parentId)
            .sort((a, b) => a.createdAt - b.createdAt);
        },

        getThreadCount: (targetId: string) => {
          return get().comments.filter(c => c.targetId === targetId).length;
        },

        setActiveTarget: (target) => set({ activeTarget: target }),
        setFilterResolved: (v) => set({ filterResolved: v }),
        setSortOrder: (order) => set({ sortOrder: order }),
      }),
      { name: 'dex-comments-annotations', enabled: import.meta.env.DEV }
    ),
    {
      name: 'dex-comments-annotations-storage',
      partialize: (state) => ({
        annotations: state.annotations,
        comments: state.comments,
        sortOrder: state.sortOrder,
        filterResolved: state.filterResolved,
      }),
    }
  )
);
