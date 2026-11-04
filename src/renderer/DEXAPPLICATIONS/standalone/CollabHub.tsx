// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Collab Hub
// Unified collaboration center for all DEX creative apps
// Access from anywhere, dock integration, pro features
// =============================================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AssistedTextarea } from '../../components/AssistedTextarea';
import {
  useCollaborationStore,
  SharedProject,
  Checkpoint,
} from '../../services/CollaborationSystem';
import ShareDialog from '../../components/ShareDialog';
import { listCheckpoints, requestRestore, deleteCheckpoint, takeCollabOpen, COLLAB_OPEN, CHECKPOINTS_CHANGED, type AppCheckpoint } from '../../services/appCheckpoints';
import { EmptyState } from '../../components/EmptyState';
import ChatPanel from '../../components/ChatPanel';
import { DexSearchInput } from '../../styles/components';
import {
  createCollabSession,
  CollabSession,
  CollabPeer,
  CollabChatMessage,
} from '../../services/collabSession';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(180deg, var(--color-bg-elevated, #1a1a1c) 0%, var(--color-bg-base, #0d0d0f) 100%)',
    color: 'var(--color-text-primary, #fff)',
    fontFamily: 'var(--dex-font-ui)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.02))',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 'var(--radius-lg)',
    background: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(94,92,230,0.3)',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    margin: 0,
    background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
    marginTop: 2,
  },
  headerActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  actionBtn: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 13,
    fontWeight: 500,
    background: 'var(--color-bg-hover, rgba(255,255,255,0.08))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--color-text-primary, #fff)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s ease',
  },
  actionBtnPrimary: {
    background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)',
    border: 'none',
    boxShadow: '0 4px 16px rgba(10,132,255,0.3)',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: 'var(--space-3) var(--space-6)',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.04))',
  },
  tab: {
    padding: '10px var(--space-5)',
    fontSize: 13,
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: {
    background: 'var(--color-bg-hover, rgba(255,255,255,0.08))',
    color: 'var(--color-text-primary, #fff)',
  },
  tabBadge: {
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 700,
    background: 'var(--color-accent-fill)',
    color: 'var(--color-accent-text, #fff)',
    borderRadius: 'var(--radius-sm)',
    minWidth: 18,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-6)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 'var(--space-4)',
  },
  card: {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-5)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  cardMenu: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-muted, #636366)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    opacity: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  cardMeta: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  cardCollaborators: {
    display: 'flex',
    alignItems: 'center',
  },
  cardAvatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    marginLeft: -8,
    border: '2px solid var(--color-bg-base, #1a1a1c)',
  },
  cardAvatarMore: {
    background: 'var(--color-bg-active, rgba(255,255,255,0.1))',
    fontSize: 9,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
  },
  cardAppBadge: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  cardActions: {
    display: 'flex',
    gap: 6,
  },
  cardActionBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  checkpointList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  checkpointItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px var(--space-4)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  checkpointIcon: {
    width: 40,
    height: 40,
    borderRadius: 'var(--radius-lg)',
    background: 'linear-gradient(135deg, #30d158, #34c759)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointInfo: {
    flex: 1,
    minWidth: 0,
  },
  checkpointName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  checkpointMeta: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
  },
  checkpointActions: {
    display: 'flex',
    gap: 6,
  },
  filterChips: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-5)',
  },
  filterChip: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
    borderRadius: 14,
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  filterChipActive: {
    background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)',
    borderColor: 'var(--dex-focus-color, #fff)',
    color: 'var(--color-text-primary)',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 'var(--space-3) var(--space-5)',
    margin: '0 var(--space-6) var(--space-4)',
    background: 'linear-gradient(135deg, rgba(255,69,58,0.15), rgba(255,69,58,0.08))',
    border: '1px solid var(--color-error-muted, rgba(255,69,58,0.3))',
    borderRadius: 10,
    fontSize: 13,
    color: 'var(--color-error, #ff453a)',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--color-bg-inset, rgba(0,0,0,0.5))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-lg)',
  },
};

// App colors and icons
const APP_THEMES: Record<string, { bg: string; color: string; icon: string }> = {
  vinx: { bg: 'linear-gradient(135deg, #ff6b6b, #ee5a5a)', color: '#ff6b6b', icon: 'V' },
  imosion: { bg: 'linear-gradient(135deg, #845ef7, #7048e8)', color: '#845ef7', icon: 'I' },
  prism: { bg: 'linear-gradient(135deg, #22b8cf, #15aabf)', color: '#22b8cf', icon: 'P' },
  flux: { bg: 'linear-gradient(135deg, #ff922b, #fd7e14)', color: '#ff922b', icon: 'F' },
  forge: { bg: 'linear-gradient(135deg, #51cf66, #40c057)', color: '#51cf66', icon: 'G' },
  axl: { bg: 'linear-gradient(135deg, #339af0, #228be6)', color: '#339af0', icon: 'A' },
};

// Activity feed icons (rendered white on a colored gradient circle)
const ACTIVITY_ICONS = {
  pending: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  approved: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  denied: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  checkpoint: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// LOCAL ROOMS MODEL
// ---------------------------------------------------------------------------
// These features run entirely on local/in-memory state persisted to
// localStorage. There is no real-time backend wired into the renderer, so
// presence is "local session" presence (the current user plus any seeded /
// invited members) and chat is local-only. Labels in the UI say so honestly.

const ROOMS_STORAGE_KEY = 'dex-collab-rooms-v1';
const ROOM_MEMBERSHIP_KEY = 'dex-collab-room-membership-v1';

type MemberStatus = 'online' | 'away' | 'offline';

interface RoomMember {
  id: string;
  name: string;
  email?: string;
  status: MemberStatus;
  lastActiveAt: number;
  isCurrentUser?: boolean;
}

interface RoomMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
  system?: boolean;
}

type RoomActivityType =
  | 'created'
  | 'joined'
  | 'left'
  | 'message'
  | 'status'
  | 'linkout';

interface RoomActivity {
  id: string;
  type: RoomActivityType;
  actorId: string;
  actorName: string;
  detail: string;
  timestamp: number;
}

interface CollabRoom {
  id: string;
  name: string;
  topic: string;
  appId: string; // linked DEX app for shared note/board link-out
  createdAt: number;
  members: RoomMember[];
  messages: RoomMessage[];
  activity: RoomActivity[];
}

const genId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Deterministic avatar color from a string id/name
const avatarColor = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffff;
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
};

const STATUS_COLORS: Record<MemberStatus, string> = {
  online: 'var(--color-success)',
  away: 'var(--color-warning)',
  offline: 'var(--color-text-tertiary)',
};

function loadRooms(): CollabRoom[] {
  try {
    const raw = localStorage.getItem(ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CollabRoom[];
  } catch (err) {
    console.error('[CollabHub] failed to load rooms:', err);
    return [];
  }
}

function persistRooms(rooms: CollabRoom[]): void {
  try {
    localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
  } catch (err) {
    console.error('[CollabHub] failed to persist rooms:', err);
  }
}

function loadMembership(): string[] {
  try {
    const raw = localStorage.getItem(ROOM_MEMBERSHIP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch (err) {
    console.error('[CollabHub] failed to load room membership:', err);
    return [];
  }
}

function persistMembership(ids: string[]): void {
  try {
    localStorage.setItem(ROOM_MEMBERSHIP_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('[CollabHub] failed to persist room membership:', err);
  }
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

type TabId = 'projects' | 'shared' | 'checkpoints' | 'activity' | 'rooms';

const CollabHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('projects');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [showShare, setShowShare] = useState<string | null>(null);
  const [showChat, setShowChat] = useState<string | null>(null);
  // Saved app versions (services/appCheckpoints), refreshed when any app saves.
  const [appCheckpoints, setAppCheckpoints] = useState<AppCheckpoint[]>(() => listCheckpoints());
  useEffect(() => {
    const refresh = () => setAppCheckpoints(listCheckpoints());
    window.addEventListener(CHECKPOINTS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(CHECKPOINTS_CHANGED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    currentUser,
    projects,
    setCurrentUser,
    createProject,
    setActiveProject,
    handleAccessRequest,
  } = useCollaborationStore();

  // Initialize demo user if not set
  useEffect(() => {
    if (!currentUser) {
      setCurrentUser({
        id: 'user-1',
        email: 'creator@dex.app',
        name: 'DEX User',
      });
    }
  }, [currentUser, setCurrentUser]);

  // -------------------------------------------------------------------------
  // ROOMS (local session) state
  // -------------------------------------------------------------------------
  const [rooms, setRooms] = useState<CollabRoom[]>(() => loadRooms());
  const [joinedRoomIds, setJoinedRoomIds] = useState<string[]>(() => loadMembership());
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  const me = useMemo(() => ({
    id: currentUser?.id || 'user-1',
    name: currentUser?.name || 'DEX User',
    email: currentUser?.email,
  }), [currentUser]);

  // Persist rooms / membership whenever they change
  useEffect(() => { persistRooms(rooms); }, [rooms]);
  useEffect(() => { persistMembership(joinedRoomIds); }, [joinedRoomIds]);

  // Keep a valid active room selection
  useEffect(() => {
    if (activeRoomId && !rooms.some(r => r.id === activeRoomId)) {
      setActiveRoomId(null);
    } else if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms, activeRoomId]);

  // Mark the current user "online" in joined rooms on mount / membership change
  useEffect(() => {
    setRooms(prev => prev.map(room => {
      if (!joinedRoomIds.includes(room.id)) return room;
      const hasMe = room.members.some(m => m.id === me.id);
      if (!hasMe) return room;
      return {
        ...room,
        members: room.members.map(m =>
          m.id === me.id
            ? { ...m, status: 'online' as MemberStatus, lastActiveAt: Date.now() }
            : m
        ),
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomIds, me.id]);

  const activeRoom = useMemo(
    () => rooms.find(r => r.id === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  const isJoined = useCallback(
    (roomId: string) => joinedRoomIds.includes(roomId),
    [joinedRoomIds]
  );

  // Auto-scroll chat to bottom when active room messages change
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeRoom?.messages.length, activeRoomId]);

  const toast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  }, []);

  const appendActivity = (room: CollabRoom, activity: Omit<RoomActivity, 'id' | 'timestamp'>): CollabRoom => ({
    ...room,
    activity: [
      ...room.activity,
      { ...activity, id: genId('act'), timestamp: Date.now() },
    ].slice(-200),
  });

  const handleCreateRoom = useCallback(() => {
    const name = prompt('Room name:');
    if (!name || !name.trim()) return;
    const topic = prompt('Topic (optional):') || '';
    const appId = (prompt('Linked app (vinx, imosion, prism, flux, forge, axl):') || 'prism')
      .trim()
      .toLowerCase();

    const now = Date.now();
    const ownerMember: RoomMember = {
      id: me.id,
      name: me.name,
      email: me.email,
      status: 'online',
      lastActiveAt: now,
      isCurrentUser: true,
    };
    const room: CollabRoom = {
      id: genId('room'),
      name: name.trim(),
      topic: topic.trim(),
      appId: APP_THEMES[appId] ? appId : 'prism',
      createdAt: now,
      members: [ownerMember],
      messages: [{
        id: genId('msg'),
        authorId: 'system',
        authorName: 'System',
        content: `${me.name} created this room (local session).`,
        timestamp: now,
        system: true,
      }],
      activity: [{
        id: genId('act'),
        type: 'created',
        actorId: me.id,
        actorName: me.name,
        detail: `created room "${name.trim()}"`,
        timestamp: now,
      }],
    };

    setRooms(prev => [room, ...prev]);
    setJoinedRoomIds(prev => prev.includes(room.id) ? prev : [...prev, room.id]);
    setActiveRoomId(room.id);
    toast('success', `Room "${room.name}" created`);
  }, [me, toast]);

  const handleJoinRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      const exists = room.members.some(m => m.id === me.id);
      const members = exists
        ? room.members.map(m => m.id === me.id
            ? { ...m, status: 'online' as MemberStatus, lastActiveAt: Date.now() }
            : m)
        : [...room.members, {
            id: me.id,
            name: me.name,
            email: me.email,
            status: 'online' as MemberStatus,
            lastActiveAt: Date.now(),
            isCurrentUser: true,
          }];
      let next: CollabRoom = { ...room, members };
      if (!exists) {
        next = appendActivity(next, {
          type: 'joined',
          actorId: me.id,
          actorName: me.name,
          detail: `joined the room`,
        });
        next = {
          ...next,
          messages: [...next.messages, {
            id: genId('msg'),
            authorId: 'system',
            authorName: 'System',
            content: `${me.name} joined the room.`,
            timestamp: Date.now(),
            system: true,
          }],
        };
      }
      return next;
    }));
    setJoinedRoomIds(prev => prev.includes(roomId) ? prev : [...prev, roomId]);
    setActiveRoomId(roomId);
    toast('success', 'Joined room');
  }, [me, toast]);

  const handleLeaveRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      let next = appendActivity(room, {
        type: 'left',
        actorId: me.id,
        actorName: me.name,
        detail: `left the room`,
      });
      next = {
        ...next,
        members: next.members.map(m =>
          m.id === me.id ? { ...m, status: 'offline' as MemberStatus, lastActiveAt: Date.now() } : m
        ),
        messages: [...next.messages, {
          id: genId('msg'),
          authorId: 'system',
          authorName: 'System',
          content: `${me.name} left the room.`,
          timestamp: Date.now(),
          system: true,
        }],
      };
      return next;
    }));
    setJoinedRoomIds(prev => prev.filter(id => id !== roomId));
    toast('info', 'Left room');
  }, [me, toast]);

  const handleSendMessage = useCallback((roomId: string) => {
    const content = draftMessage.trim();
    if (!content) return;
    if (!isJoined(roomId)) {
      toast('error', 'Join the room to send messages');
      return;
    }
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      const msg: RoomMessage = {
        id: genId('msg'),
        authorId: me.id,
        authorName: me.name,
        content,
        timestamp: Date.now(),
      };
      let next: CollabRoom = {
        ...room,
        messages: [...room.messages, msg],
        members: room.members.map(m =>
          m.id === me.id ? { ...m, status: 'online' as MemberStatus, lastActiveAt: Date.now() } : m
        ),
      };
      next = appendActivity(next, {
        type: 'message',
        actorId: me.id,
        actorName: me.name,
        detail: content.length > 60 ? `${content.slice(0, 60)}…` : content,
      });
      return next;
    }));
    setDraftMessage('');
  }, [draftMessage, isJoined, me, toast]);

  // Cycle the current user's presence status in a room: online -> away -> online
  const handleToggleMyStatus = useCallback((roomId: string) => {
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      const mine = room.members.find(m => m.id === me.id);
      if (!mine) return room;
      const nextStatus: MemberStatus = mine.status === 'online' ? 'away' : 'online';
      let next: CollabRoom = {
        ...room,
        members: room.members.map(m =>
          m.id === me.id ? { ...m, status: nextStatus, lastActiveAt: Date.now() } : m
        ),
      };
      next = appendActivity(next, {
        type: 'status',
        actorId: me.id,
        actorName: me.name,
        detail: `set status to ${nextStatus}`,
      });
      return next;
    }));
  }, [me]);

  // Shared note/board link-out -> opens the linked app
  const handleRoomLinkOut = useCallback((room: CollabRoom) => {
    window.dispatchEvent(new CustomEvent('dex-open-app', {
      detail: { appId: room.appId },
    }));
    setRooms(prev => prev.map(r => {
      if (r.id !== room.id) return r;
      return appendActivity(r, {
        type: 'linkout',
        actorId: me.id,
        actorName: me.name,
        detail: `opened ${room.appId}`,
      });
    }));
    toast('info', `Opening ${room.appId}…`);
  }, [me, toast]);

  // -------------------------------------------------------------------------
  // LIVE SESSION (real same-device multi-window sync via BroadcastChannel)
  // -------------------------------------------------------------------------
  // A CollabSession is bound to the active room while it is joined. Open a
  // second DEX window, join the same room, and the peers / shared scratch /
  // chat below sync in real time across windows on THIS device.
  const sessionRef = React.useRef<CollabSession | null>(null);
  const [livePeers, setLivePeers] = useState<CollabPeer[]>([]);
  const [liveScratch, setLiveScratch] = useState<string>('');
  const [liveChat, setLiveChat] = useState<CollabChatMessage[]>([]);
  const [liveDraft, setLiveDraft] = useState<string>('');
  const [liveSupported, setLiveSupported] = useState<boolean>(true);
  // Track whether a scratch edit originated locally so remote updates don't
  // clobber the field the user is actively typing into.
  const scratchEditingRef = React.useRef<boolean>(false);
  const liveChatScrollRef = React.useRef<HTMLDivElement>(null);

  // Stable per-window presence color, derived from the user id.
  const myColor = useMemo(() => avatarColor(me.id + me.name), [me.id, me.name]);

  // Bind/unbind a live session to the active room only while it is joined.
  const liveRoomKey = activeRoom && isJoined(activeRoom.id) ? activeRoom.id : null;

  useEffect(() => {
    if (!liveRoomKey) {
      // Not in a joined room — ensure any prior session is torn down.
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
      setLivePeers([]);
      setLiveChat([]);
      setLiveScratch('');
      setLiveDraft('');
      return;
    }

    const session = createCollabSession();
    sessionRef.current = session;
    setLiveChat([]);
    setLiveDraft('');

    const supported = session.join(liveRoomKey, {
      id: me.id,
      name: me.name,
      color: myColor,
    });
    setLiveSupported(supported);

    const unsubPresence = session.subscribePresence(peers => setLivePeers(peers));
    const unsubState = session.subscribeState(state => {
      const next = typeof state.scratch === 'string' ? state.scratch : '';
      // Don't overwrite while the local user is mid-edit.
      if (!scratchEditingRef.current) setLiveScratch(next);
    });
    const unsubChat = session.subscribeChat(message => {
      setLiveChat(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message].slice(-200);
      });
    });

    return () => {
      unsubPresence();
      unsubState();
      unsubChat();
      session.destroy();
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRoomKey, me.id, me.name, myColor]);

  // Auto-scroll the live chat to bottom on new messages.
  useEffect(() => {
    const el = liveChatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveChat.length]);

  const handleLiveScratchChange = useCallback((value: string) => {
    scratchEditingRef.current = true;
    setLiveScratch(value);
    sessionRef.current?.setState({ scratch: value });
  }, []);

  const handleLiveScratchBlur = useCallback(() => {
    scratchEditingRef.current = false;
  }, []);

  const handleSendLiveChat = useCallback(() => {
    const session = sessionRef.current;
    const text = liveDraft.trim();
    if (!session || !text) return;
    session.sendChat(text);
    setLiveDraft('');
  }, [liveDraft]);

  // Search across rooms + members
  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    const sorted = [...rooms].sort((a, b) => b.createdAt - a.createdAt);
    if (!q) return sorted;
    return sorted.filter(room =>
      room.name.toLowerCase().includes(q) ||
      room.topic.toLowerCase().includes(q) ||
      room.appId.toLowerCase().includes(q) ||
      room.members.some(m =>
        m.name.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      )
    );
  }, [rooms, roomSearch]);

  const presenceCount = useCallback((room: CollabRoom) =>
    room.members.filter(m => m.status === 'online').length, []);

  const projectList = useMemo(() => {
    const list = Array.from(projects.values());
    let filtered = list;

    // Filter by tab
    if (activeTab === 'shared') {
      filtered = filtered.filter(p => p.collaborators.length > 1);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.appId.toLowerCase().includes(q)
      );
    }

    // Filter by app
    if (filter) {
      filtered = filtered.filter(p => p.appId === filter);
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, activeTab, search, filter]);

  const allCheckpoints = appCheckpoints;

  // Another app asked to show its Share dialog, chat or checkpoints here.
  useEffect(() => {
    const apply = () => {
      const req = takeCollabOpen();
      if (!req) return;
      if (req.panel === 'checkpoints') setActiveTab('checkpoints');
      else if (req.projectId && req.panel === 'share') setShowShare(req.projectId);
      else if (req.projectId && req.panel === 'chat') setShowChat(req.projectId);
    };
    apply();
    window.addEventListener(COLLAB_OPEN, apply);
    return () => window.removeEventListener(COLLAB_OPEN, apply);
  }, []);

  const pendingRequests = useMemo(() => {
    let count = 0;
    projects.forEach(p => {
      count += p.accessRequests.filter(r => r.status === 'pending').length;
    });
    return count;
  }, [projects]);

  // Activity feed - combines access requests, checkpoints, and system messages
  type ActivityItem = {
    id: string;
    type: 'access_request' | 'checkpoint' | 'invite' | 'project_created';
    projectId: string;
    projectName: string;
    timestamp: number;
    title: string;
    description: string;
    icon: React.ReactNode;
    iconBg: string;
    actionable?: boolean;
    requestId?: string;
    status?: 'pending' | 'approved' | 'denied';
  };

  const activityFeed = useMemo(() => {
    const items: ActivityItem[] = [];

    projects.forEach(p => {
      // Add access requests
      p.accessRequests.forEach(req => {
        items.push({
          id: `req-${req.id}`,
          type: 'access_request',
          projectId: p.id,
          projectName: p.name,
          timestamp: req.timestamp,
          title: req.status === 'pending' 
            ? `${req.requesterName} requested access`
            : req.status === 'approved'
            ? `${req.requesterName} was granted access`
            : `${req.requesterName}'s request was denied`,
          description: req.message || `Requested ${req.requestedRole} access to ${p.name}`,
          icon: req.status === 'pending' ? ACTIVITY_ICONS.pending : req.status === 'approved' ? ACTIVITY_ICONS.approved : ACTIVITY_ICONS.denied,
          iconBg: req.status === 'pending' 
            ? 'linear-gradient(135deg, #ff9f0a, #ff6b00)'
            : req.status === 'approved'
            ? 'linear-gradient(135deg, #30d158, #28a745)'
            : 'linear-gradient(135deg, #ff453a, #dc3545)',
          actionable: req.status === 'pending',
          requestId: req.id,
          status: req.status,
        });
      });

      // Add recent checkpoints
      p.checkpoints.slice(-5).forEach(cp => {
        items.push({
          id: `cp-${cp.id}`,
          type: 'checkpoint',
          projectId: p.id,
          projectName: p.name,
          timestamp: cp.timestamp,
          title: cp.autoSave ? 'Auto-saved checkpoint' : `Checkpoint: ${cp.name}`,
          description: `${cp.creatorName} saved a checkpoint on ${p.name}`,
          icon: ACTIVITY_ICONS.checkpoint,
          iconBg: 'linear-gradient(135deg, #30d158, #34c759)',
        });
      });

      // Add collaborator joins (recent 7 days)
      const recentJoins = p.collaborators.filter(
        c => c.joinedAt > Date.now() - 7 * 24 * 60 * 60 * 1000 && c.role !== 'owner'
      );
      recentJoins.forEach(c => {
        items.push({
          id: `join-${c.id}`,
          type: 'invite',
          projectId: p.id,
          projectName: p.name,
          timestamp: c.joinedAt,
          title: `${c.name} joined`,
          description: `Joined ${p.name} as ${c.role}${c.isVisitor ? ' (visitor)' : ''}`,
          icon: ACTIVITY_ICONS.user,
          iconBg: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
        });
      });
    });

    // Sort by timestamp descending
    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }, [projects]);

  const handleApproveRequest = useCallback((projectId: string, requestId: string, approve: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      handleAccessRequest(projectId, requestId, approve);
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { 
          type: 'success', 
          message: approve ? 'Access granted' : 'Request denied'
        }
      }));
    } catch (err: any) {
      console.error('[CollabHub] access request failed:', err);
      setError('Could not update the access request. Please try again.');
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'error', message: 'Could not update the access request. Please try again.' }
      }));
    } finally {
      setIsLoading(false);
    }
  }, [handleAccessRequest]);

  const handleCreateProject = useCallback(() => {
    const name = prompt('Project name:');
    if (!name) return;
    
    const appId = prompt('App (vinx, imosion, prism, flux, forge, axl):') || 'prism';
    const project = createProject(name, appId);
    setActiveProject(project.id);
    
    window.dispatchEvent(new CustomEvent('dex-toast', {
      detail: { type: 'success', message: `Created "${name}"` }
    }));
  }, [createProject, setActiveProject]);

  const handleOpenProject = useCallback((project: SharedProject) => {
    setActiveProject(project.id);
    // Launch the app. The shell's launch listener (AppManager) keys off
    // 'dex-open-app' { appId }; the old 'dex-launch-app' name had no handler.
    window.dispatchEvent(new CustomEvent('dex-open-app', {
      detail: { appId: project.appId }
    }));
  }, [setActiveProject]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
              <path d="M2 12h20"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.title}>Collab Hub</h1>
            <div style={styles.subtitle}>Real-time collaboration for creative projects</div>
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.actionBtn}
            onClick={() => setShowChat(projectList[0]?.id || null)}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.08))'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat
          </button>
          <button
            style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }}
            onClick={handleCreateProject}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {([
          {
            id: 'projects' as const,
            label: 'My Projects',
            badge: 0,
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            ),
          },
          {
            id: 'shared' as const,
            label: 'Shared with Me',
            badge: 0,
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            ),
          },
          {
            id: 'checkpoints' as const,
            label: 'Checkpoints',
            badge: 0,
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            ),
          },
          {
            id: 'activity' as const,
            label: 'Activity',
            badge: pendingRequests,
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            ),
          },
          {
            id: 'rooms' as const,
            label: 'Rooms',
            badge: joinedRoomIds.length,
            icon: (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
            ),
          },
        ]).map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            <span style={{ display: 'flex', alignItems: 'center' }} aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.badge > 0 && (
              <span style={styles.tabBadge}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Error Banner */}
        {error && (
          <div style={styles.errorBanner as React.CSSProperties}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              title="Dismiss"
              aria-label="Dismiss error"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-error, #ff453a)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Search */}
        {activeTab !== 'checkpoints' && activeTab !== 'activity' && activeTab !== 'rooms' && (
          <>
            <DexSearchInput
              fullWidth
              placeholder="Search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClear={() => setSearch('')}
              style={{ marginBottom: 'var(--space-5)' }}
            />

            <div style={styles.filterChips}>
              {['All', 'vinx', 'imosion', 'prism', 'flux', 'forge', 'axl'].map(f => (
                <button
                  key={f}
                  style={{
                    ...styles.filterChip,
                    ...((filter === f || (f === 'All' && !filter)) ? styles.filterChipActive : {}),
                  }}
                  onClick={() => setFilter(f === 'All' ? null : f)}
                >
                  {f === 'All' ? 'All' : `${APP_THEMES[f]?.icon || ''} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Projects Grid */}
        {(activeTab === 'projects' || activeTab === 'shared') && (
          projectList.length === 0 ? (
            <EmptyState
              title={activeTab === 'shared' ? 'Nothing shared with you yet' : 'No projects yet'}
              description={activeTab === 'shared'
                ? 'Projects other people share with you will appear here.'
                : 'Start a shared project to collaborate in real time across DEX creative apps.'}
              icon={(
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              )}
              actions={activeTab === 'shared' ? undefined : [{ label: 'Create project', onClick: handleCreateProject }]}
            />
          ) : (
            <div style={styles.grid}>
              {projectList.map(project => {
                const theme = APP_THEMES[project.appId] || APP_THEMES.prism;
                const collaborators = project.collaborators.slice(0, 4);
                const moreCount = project.collaborators.length - 4;

                return (
                  <div
                    key={project.id}
                    className="dex-liquid-glass"
                    style={styles.card}
                    onClick={() => handleOpenProject(project)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border, rgba(255,255,255,0.15))';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      const menuBtn = e.currentTarget.querySelector('[data-menu-btn]') as HTMLElement;
                      if (menuBtn) menuBtn.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'translateY(0)';
                      const menuBtn = e.currentTarget.querySelector('[data-menu-btn]') as HTMLElement;
                      if (menuBtn) menuBtn.style.opacity = '0';
                    }}
                  >
                    <div style={styles.cardHeader}>
                      <div style={{ ...styles.cardIcon, background: theme.bg }}>
                        {theme.icon}
                      </div>
                      <button
                        data-menu-btn
                        style={styles.cardMenu}
                        onClick={e => { e.stopPropagation(); setShowShare(project.id); }}
                        title="Project options"
                        aria-label="Project options"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                        </svg>
                      </button>
                    </div>

                    <div style={styles.cardTitle}>{project.name}</div>
                    <div style={styles.cardMeta}>
                      <span>Updated {formatTime(project.updatedAt)}</span>
                      <span>•</span>
                      <span>{project.checkpoints.length} checkpoints</span>
                    </div>

                    <div style={styles.cardCollaborators}>
                      {collaborators.map((c, i) => (
                        <div
                          key={c.id}
                          style={{
                            ...styles.cardAvatar,
                            marginLeft: i === 0 ? 0 : -8,
                            zIndex: 10 - i,
                          }}
                          title={c.name}
                        >
                          {c.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      ))}
                      {moreCount > 0 && (
                        <div style={{ ...styles.cardAvatar, ...styles.cardAvatarMore, zIndex: 5 }}>
                          +{moreCount}
                        </div>
                      )}
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={{ ...styles.cardAppBadge, background: `${theme.color}20`, color: theme.color }}>
                        {project.appId}
                      </span>
                      <div style={styles.cardActions}>
                        <button
                          style={styles.cardActionBtn}
                          onClick={e => { e.stopPropagation(); setShowShare(project.id); }}
                          title="Share"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; e.currentTarget.style.color = 'var(--color-text-primary, #fff)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; e.currentTarget.style.color = 'var(--color-text-tertiary, #8e8e93)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                          </svg>
                        </button>
                        <button
                          style={styles.cardActionBtn}
                          onClick={e => { e.stopPropagation(); setShowChat(project.id); }}
                          title="Chat"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; e.currentTarget.style.color = 'var(--color-text-primary, #fff)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; e.currentTarget.style.color = 'var(--color-text-tertiary, #8e8e93)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Checkpoints */}
        {activeTab === 'checkpoints' && (
          allCheckpoints.length === 0 ? (
            <EmptyState
              title="No checkpoints yet"
              description="Saved versions of your projects will appear here so you can review or restore them."
              icon={(
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
              )}
            />
          ) : (
            <div style={styles.checkpointList}>
              {allCheckpoints.map(cp => (
                <div
                  key={cp.id}
                  className="dex-liquid-glass"
                  style={styles.checkpointItem}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border, rgba(255,255,255,0.15))'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <div style={styles.checkpointIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    </svg>
                  </div>
                  <div style={styles.checkpointInfo}>
                    <div style={styles.checkpointName}>{cp.name}</div>
                    <div style={styles.checkpointMeta}>
                      {cp.appName} • {formatTime(cp.timestamp)} • {Math.max(1, Math.round(cp.bytes / 1024))} KB
                      {cp.auto && <span style={{ marginLeft: 'var(--space-2)', opacity: 0.6 }}>Autosave</span>}
                    </div>
                  </div>
                  <div style={styles.checkpointActions}>
                    <button
                      style={styles.cardActionBtn}
                      title="Restore"
                      aria-label={`Restore ${cp.name} in ${cp.appName}`}
                      onClick={() => {
                        const appId = requestRestore(cp.id);
                        if (!appId) { toast('error', 'That checkpoint is no longer available'); return; }
                        (window as any).__dexRunningApps?.getState().launchApp({ id: appId, name: cp.appName, icon: appId });
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                      </svg>
                    </button>
                    <button
                      style={styles.cardActionBtn}
                      title="Delete"
                      aria-label={`Delete ${cp.name}`}
                      onClick={() => { if (window.confirm(`Delete checkpoint "${cp.name}"? This cannot be undone.`)) deleteCheckpoint(cp.id); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Activity */}
        {activeTab === 'activity' && (
          activityFeed.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Access requests, checkpoints, and new collaborators will show up here as your projects evolve."
              icon={(
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              )}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {activityFeed.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '14px var(--space-4)',
                    background: item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.1), rgba(255,159,10,0.05))'
                      : 'var(--color-bg-hover, rgba(255,255,255,0.04))',
                    border: item.actionable
                      ? '1px solid var(--color-warning-muted, rgba(255,159,10,0.2))'
                      : '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                    borderRadius: 10,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.15), rgba(255,159,10,0.08))'
                      : 'var(--color-bg-active, rgba(255,255,255,0.08))';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.1), rgba(255,159,10,0.05))'
                      : 'var(--color-bg-hover, rgba(255,255,255,0.04))';
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-lg)',
                    background: item.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: 14, 
                      fontWeight: 500,
                      color: 'var(--color-text-primary, #fff)',
                      marginBottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}>
                      {item.title}
                      {item.status && item.status !== 'pending' && (
                        <span style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          background: item.status === 'approved'
                            ? 'var(--color-success-muted, rgba(48,209,88,0.15))'
                            : 'var(--color-error-muted, rgba(255,69,58,0.15))',
                          color: item.status === 'approved' ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)',
                        }}>
                          {item.status}
                        </span>
                      )}
                    </div>
                    <div style={{ 
                      fontSize: 12, 
                      color: 'var(--color-text-tertiary, #8e8e93)',
                      marginBottom: item.actionable ? 10 : 0,
                    }}>
                      {item.description}
                    </div>
                    {item.actionable && item.requestId && (
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          style={{
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--color-success, #30d158)',
                            color: 'var(--color-accent-text, #fff)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => handleApproveRequest(item.projectId, item.requestId!, true)}
                          disabled={isLoading}
                          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                        >
                          Approve
                        </button>
                        <button
                          style={{
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'transparent',
                            color: 'var(--color-error, #ff453a)',
                            border: '1px solid var(--color-error-muted, rgba(255,69,58,0.3))',
                            borderRadius: 'var(--radius-md)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => handleApproveRequest(item.projectId, item.requestId!, false)}
                          disabled={isLoading}
                          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: 11,
                    color: 'var(--color-text-tertiary, #636366)',
                    flexShrink: 0,
                  }}>
                    {formatTime(item.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Rooms (local session) */}
        {activeTab === 'rooms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Local-session honesty banner + create */}
            <div className="dex-liquid-glass" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_COLORS.online, flexShrink: 0,
                  boxShadow: `0 0 8px ${STATUS_COLORS.online}`,
                }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8e8e93)' }}>
                  Local session · presence and chat are stored on this device only
                </span>
              </div>
              <button
                style={{ ...styles.actionBtn, ...styles.actionBtnPrimary, flexShrink: 0 }}
                onClick={handleCreateRoom}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Room
              </button>
            </div>

            <DexSearchInput
              fullWidth
              placeholder="Search rooms and members"
              value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              onClear={() => setRoomSearch('')}
            />

            {rooms.length === 0 ? (
              <EmptyState
                title="No rooms yet"
                description="Create a local room to organize presence, an activity timeline, and a chat for a shared note or board."
                icon={(
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                  </svg>
                )}
                actions={[{ label: 'Create room', onClick: handleCreateRoom }]}
              />
            ) : filteredRooms.length === 0 ? (
              <EmptyState
                title="No matches"
                description="No rooms or members match your search."
                icon={(
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                )}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
                {/* Room list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {filteredRooms.map(room => {
                    const theme = APP_THEMES[room.appId] || APP_THEMES.prism;
                    const selected = room.id === activeRoomId;
                    const joined = isJoined(room.id);
                    return (
                      <button
                        key={room.id}
                        onClick={() => setActiveRoomId(room.id)}
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 'var(--space-3) var(--space-4)',
                          background: selected
                            ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
                            : 'var(--color-bg-hover, rgba(255,255,255,0.04))',
                          border: selected
                            ? '1px solid var(--color-accent)'
                            : '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                          borderRadius: 'var(--radius-lg)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          color: 'var(--color-text-primary, #fff)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ ...styles.cardAvatar, marginLeft: 0, background: theme.bg, width: 28, height: 28, fontSize: 12 }}>
                            {theme.icon}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {room.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {room.topic || room.appId}
                            </div>
                          </div>
                          {joined && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px',
                              borderRadius: 'var(--radius-sm)', background: 'var(--color-success-muted, rgba(48,209,88,0.15))',
                              color: 'var(--color-success, #30d158)', flexShrink: 0,
                            }}>
                              JOINED
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS.online }} />
                            {presenceCount(room)} online
                          </span>
                          <span>{room.members.length} member{room.members.length === 1 ? '' : 's'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Active room detail */}
                {activeRoom ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                    {/* Header */}
                    <div className="dex-liquid-glass" style={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                      gap: 'var(--space-3)', padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>
                          {activeRoom.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8e8e93)', marginTop: 2 }}>
                          {activeRoom.topic ? `${activeRoom.topic} · ` : ''}linked to {activeRoom.appId}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          style={styles.actionBtn}
                          onClick={() => handleRoomLinkOut(activeRoom)}
                          title={`Open ${activeRoom.appId}`}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.08))'; }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          Open board
                        </button>
                        {isJoined(activeRoom.id) ? (
                          <>
                            <button
                              style={styles.actionBtn}
                              onClick={() => handleToggleMyStatus(activeRoom.id)}
                              title="Toggle your presence"
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.08))'; }}
                            >
                              {activeRoom.members.find(m => m.id === me.id)?.status === 'away' ? 'Set online' : 'Set away'}
                            </button>
                            <button
                              style={{ ...styles.actionBtn, color: 'var(--color-error, #ff453a)' }}
                              onClick={() => handleLeaveRoom(activeRoom.id)}
                              title="Leave room"
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.08))'; }}
                            >
                              Leave
                            </button>
                          </>
                        ) : (
                          <button
                            style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }}
                            onClick={() => handleJoinRoom(activeRoom.id)}
                            title="Join room"
                            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                          >
                            Join
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live (this device) — REAL multi-window sync */}
                    {isJoined(activeRoom.id) && (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
                        padding: 'var(--space-4)',
                        background: 'linear-gradient(135deg, rgba(48,209,88,0.08), rgba(48,209,88,0.02))',
                        border: '1px solid var(--color-success-muted, rgba(48,209,88,0.25))',
                        borderRadius: 'var(--radius-lg)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: liveSupported ? STATUS_COLORS.online : STATUS_COLORS.away,
                              boxShadow: liveSupported ? `0 0 8px ${STATUS_COLORS.online}` : 'none',
                              flexShrink: 0,
                            }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>
                                Live (this device)
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)' }}>
                                {liveSupported
                                  ? 'Open a second DEX window and join this room to see real-time sync.'
                                  : 'Multi-window transport unavailable here — showing this window only.'}
                              </div>
                            </div>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                            background: 'var(--color-success-muted, rgba(48,209,88,0.15))',
                            color: 'var(--color-success, #30d158)', flexShrink: 0,
                          }}>
                            {livePeers.length} window{livePeers.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        {/* Live window peers */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                          {livePeers.map(p => (
                            <div key={p.sessionId} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 10px 5px 5px', borderRadius: 18,
                              background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
                              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                            }}>
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, color: '#fff',
                                background: p.user.color || avatarColor(p.user.id),
                              }}>
                                {p.user.name?.[0]?.toUpperCase() || '?'}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--color-text-primary, #fff)' }}>
                                {p.user.name}{p.isSelf ? ' (this window)' : ''}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Shared synced scratch note */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary, #8e8e93)' }}>
                            Shared scratch note · synced across windows
                          </div>
                          <AssistedTextarea
                            value={liveScratch}
                            onChange={e => handleLiveScratchChange(e.target.value)}
                            onBlur={handleLiveScratchBlur}
                            placeholder="Type here — every joined window on this device sees it live."
                            rows={3}
                            style={{
                              width: '100%', boxSizing: 'border-box', resize: 'vertical',
                              padding: '10px 12px', fontSize: 13, lineHeight: 1.5,
                              fontFamily: 'var(--dex-font-ui)',
                              background: 'var(--color-bg-base, rgba(0,0,0,0.25))',
                              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
                              borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary, #fff)',
                              outline: 'none',
                            }}
                          />
                        </div>

                        {/* Live cross-window chat */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary, #8e8e93)' }}>
                            Live chat · {liveChat.length} message{liveChat.length === 1 ? '' : 's'} this session
                          </div>
                          <div
                            ref={liveChatScrollRef}
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 8,
                              maxHeight: 160, overflowY: 'auto',
                              padding: liveChat.length ? '8px 4px' : 0,
                            }}
                          >
                            {liveChat.map(msg => {
                              const mine = msg.sessionId === sessionRef.current?.sessionId;
                              return (
                                <div key={msg.id} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
                                  <span style={{
                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 700, color: '#fff',
                                    background: msg.userColor || avatarColor(msg.userId),
                                  }}>
                                    {msg.userName?.[0]?.toUpperCase() || '?'}
                                  </span>
                                  <div style={{
                                    fontSize: 12, lineHeight: 1.4, padding: '6px 10px', borderRadius: 10,
                                    maxWidth: '75%', wordBreak: 'break-word',
                                    color: 'var(--color-text-primary, #fff)',
                                    background: mine
                                      ? 'linear-gradient(135deg, #0a84ff, #5e5ce6)'
                                      : 'var(--color-bg-active, rgba(255,255,255,0.08))',
                                  }}>
                                    {msg.body}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <input
                              value={liveDraft}
                              onChange={e => setLiveDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendLiveChat(); } }}
                              placeholder="Message all joined windows…"
                              style={{
                                flex: 1, padding: '8px 12px', fontSize: 13,
                                background: 'var(--color-bg-base, rgba(0,0,0,0.2))',
                                border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
                                borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary, #fff)',
                                outline: 'none',
                              }}
                            />
                            <button
                              style={{ ...styles.actionBtn, ...styles.actionBtnPrimary, opacity: liveDraft.trim() ? 1 : 0.5 }}
                              onClick={handleSendLiveChat}
                              disabled={!liveDraft.trim()}
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 'var(--space-4)', alignItems: 'start' }}>
                      {/* Chat */}
                      <div className="dex-liquid-glass-strong" style={{
                        display: 'flex', flexDirection: 'column',
                        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                      }}>
                        <div
                          ref={chatScrollRef}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
                            padding: 'var(--space-4)', height: 320, overflowY: 'auto',
                          }}
                        >
                          {activeRoom.messages.map(msg => {
                            if (msg.system) {
                              return (
                                <div key={msg.id} style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted, #636366)' }}>
                                  {msg.content}
                                </div>
                              );
                            }
                            const mine = msg.authorId === me.id;
                            return (
                              <div key={msg.id} style={{ display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row' }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 11, fontWeight: 600, color: '#fff',
                                  background: avatarColor(msg.authorId),
                                }}>
                                  {msg.authorName[0]?.toUpperCase() || '?'}
                                </div>
                                <div style={{ maxWidth: '75%' }}>
                                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)', marginBottom: 3, textAlign: mine ? 'right' : 'left' }}>
                                    {mine ? 'You' : msg.authorName} · {formatTime(msg.timestamp)}
                                  </div>
                                  <div style={{
                                    fontSize: 13, lineHeight: 1.4, padding: '8px 12px', borderRadius: 10,
                                    color: 'var(--color-text-primary, #fff)',
                                    background: mine
                                      ? 'linear-gradient(135deg, #0a84ff, #5e5ce6)'
                                      : 'var(--color-bg-active, rgba(255,255,255,0.08))',
                                    wordBreak: 'break-word',
                                  }}>
                                    {msg.content}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{
                          display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)',
                          borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                        }}>
                          <input
                            value={draftMessage}
                            onChange={e => setDraftMessage(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(activeRoom.id); } }}
                            placeholder={isJoined(activeRoom.id) ? 'Message (local-only)…' : 'Join to chat'}
                            disabled={!isJoined(activeRoom.id)}
                            style={{
                              flex: 1, padding: '8px 12px', fontSize: 13,
                              background: 'var(--color-bg-base, rgba(0,0,0,0.2))',
                              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
                              borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary, #fff)',
                              outline: 'none', opacity: isJoined(activeRoom.id) ? 1 : 0.5,
                            }}
                          />
                          <button
                            style={{ ...styles.actionBtn, ...styles.actionBtnPrimary, opacity: (isJoined(activeRoom.id) && draftMessage.trim()) ? 1 : 0.5 }}
                            onClick={() => handleSendMessage(activeRoom.id)}
                            disabled={!isJoined(activeRoom.id) || !draftMessage.trim()}
                          >
                            Send
                          </button>
                        </div>
                      </div>

                      {/* Presence list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary, #8e8e93)' }}>
                          Members · {activeRoom.members.length}
                        </div>
                        {[...activeRoom.members]
                          .sort((a, b) => {
                            const order: Record<MemberStatus, number> = { online: 0, away: 1, offline: 2 };
                            return order[a.status] - order[b.status];
                          })
                          .map(m => (
                            <div key={m.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 10px', borderRadius: 'var(--radius-lg)',
                              background: 'var(--color-bg-hover, rgba(255,255,255,0.04))',
                              border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                            }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 11, fontWeight: 600, color: '#fff',
                                  background: avatarColor(m.id),
                                }}>
                                  {m.name[0]?.toUpperCase() || '?'}
                                </div>
                                <span style={{
                                  position: 'absolute', right: -1, bottom: -1,
                                  width: 9, height: 9, borderRadius: '50%',
                                  background: STATUS_COLORS[m.status],
                                  border: '2px solid var(--color-bg-elevated, #1a1a1c)',
                                }} title={m.status} />
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {m.name}{m.isCurrentUser ? ' (you)' : ''}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary, #8e8e93)' }}>
                                  {m.status === 'online' ? 'Online' : m.status === 'away' ? 'Away' : `Last seen ${formatTime(m.lastActiveAt)}`}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Activity timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-tertiary, #8e8e93)' }}>
                        Activity timeline
                      </div>
                      {[...activeRoom.activity].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30).map(a => (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 'var(--radius-lg)',
                          background: 'var(--color-bg-hover, rgba(255,255,255,0.03))',
                          border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 600, color: '#fff',
                            background: avatarColor(a.actorId),
                          }}>
                            {a.actorName[0]?.toUpperCase() || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--color-text-secondary, #c7c7cc)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>{a.actorName}</span>{' '}
                            <span style={{ color: 'var(--color-text-tertiary, #8e8e93)' }}>{a.detail}</span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted, #636366)', flexShrink: 0 }}>
                            {formatTime(a.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Select a room"
                    description="Pick a room on the left to see presence, chat, and its activity timeline."
                    icon={(
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    )}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Dialog */}
      {showShare && (
        <ShareDialog
          projectId={showShare}
          projectName={projects.get(showShare)?.name || 'Project'}
          onClose={() => setShowShare(null)}
        />
      )}

      {/* Chat Panel */}
      {showChat && (
        <ChatPanel
          projectId={showChat}
          onClose={() => setShowChat(null)}
        />
      )}
    </div>
  );
};

export default CollabHub;
