// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * BROWSER - DEX Browser
 * Capability-gated browsing with explicit, honest protection states.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { Select } from '../components/Select';
import DexIcon from '../components/DexIcon';
import DOMPurify from 'dompurify';
import { BLOCKED_DOMAIN_LIST } from '../config/blocked-domains';
import { dispatchActivity, updateActivity, completeActivity } from '../utils/liveActivity';
import { sendToNotes } from '../services/sendTo';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import { isTauri } from '../services/platform/tauriCompat';
import { detachedAppId } from '../services/detachedWindow';
import { loadAppPreferences, saveAppPreference, useAppPreference, useAppPreferences } from '../store/appPreferences';
import { nativePageAction, useNativePageWindows, type NativePage } from './browserPageWindows';
import { useBrowserTabStrip } from './browserTabStrip';
import { browserDownloadAction, useBrowserDownloads } from './browserDownloads';

// ===========================================================================
// TYPES
// ===========================================================================

interface Tab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  background?: boolean;  // Run in background
  pinned?: boolean;      // Pinned tab
  navHistory: string[];  // Navigation history stack
  navIndex: number;      // Current position in history
}

interface BookmarkFolder {
  id: string;
  name: string;
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId?: string;
}

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  favicon?: string;
}

interface BrowserSettings {
  blockTrackers: boolean;
  blockAds: boolean;
  forceHttps: boolean;
  fingerprintProtection: boolean;
  doNotTrack: boolean;
  clearOnExit: boolean;
  blockThirdPartyCookies: boolean;
  enableTorMode: boolean;
  customUserAgent: string;
}

// ---------------------------------------------------------------------------
// KEYCHAIN — Saved passwords & payment cards
// ---------------------------------------------------------------------------

interface SavedPassword {
  id: string;
  domain: string;    // e.g. "google.com"
  username: string;
  password: string;  // stored obfuscated in localStorage
  createdAt: number;
  lastUsed: number;
}

interface SavedCard {
  id: string;
  label: string;     // e.g. "Visa •••• 4242"
  name: string;      // cardholder name
  number: string;    // stored obfuscated
  expiry: string;    // MM/YY
  createdAt: number;
  lastUsed: number;
}

// Password obfuscation — uses IPC encryption when available, falls back to Web Crypto.
// Passwords are encrypted before storage; never stored as plaintext.
const _ob = (s: string): string => {
  try {
    const encrypted = (window as any).electron?.ipcRenderer?.sendSync?.('security:encrypt', s);
    if (encrypted && typeof encrypted === 'string') return encrypted;
  } catch { /* main process unavailable */ }
  // No fallback — refuse to store credentials without proper encryption
  console.warn('[Browser] IPC encryption unavailable — credential not stored');
  return '';
};
const _de = (s: string): string => {
  if (!s) return '';
  try {
    const decrypted = (window as any).electron?.ipcRenderer?.sendSync?.('security:decrypt', s);
    if (decrypted && typeof decrypted === 'string') return decrypted;
  } catch { /* main process unavailable */ }
  // Refuse to decode without proper encryption -- stale credentials must be re-saved
  return '';
};

// ===========================================================================
// BLOCKED DOMAINS - see src/renderer/config/blocked-domains.ts
// ===========================================================================

const BLOCKED_DOMAINS = new Set(BLOCKED_DOMAIN_LIST);

// Reduced-fingerprinting user agent. This does NOT provide Tor routing.
const REDUCED_FINGERPRINTING_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0';

// ===========================================================================
// ICONS
// ===========================================================================

// ===========================================================================
// ENTERPRISE SCALE CONSTANTS - Supports 1B+ users
// ===========================================================================

const MAX_TABS = 500;
const HISTORY_LIMIT = 2000; // Max history entries — auto-trims beyond this
const BOOKMARK_LIMIT = 5000; // Max bookmarks
const KEYCHAIN_STORAGE_KEY = 'dex-browser-keychain';
const CARDS_STORAGE_KEY = 'dex-browser-cards';
const SESSION_STORAGE_KEY = 'dex-browser-session'; // Persisted open tabs + active tab for restore
const ZOOM_STORAGE_KEY = 'dex-browser-zoom'; // Per-hostname zoom factors { [hostname]: factor }

// Zoom bounds + step (mirrors Chrome's discrete zoom levels loosely).
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

// Restore the persisted per-hostname zoom map. Shape: { [hostname]: number }.
// Never throws — returns an empty map on any parse/storage failure.
const loadZoomMap = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(parsed)) {
      const v = parsed[k];
      if (typeof v === 'number' && isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
};

// Shape persisted under SESSION_STORAGE_KEY. Only durable fields are stored —
// transient state (loading, background, crash flags, nav stacks) is dropped and
// rebuilt fresh on restore.
interface SavedSession {
  tabs: Array<{ id: string; title: string; url: string; pinned?: boolean }>;
  activeTab: string;
}

// Default single blank tab — used as the fresh state and the restore fallback.
const blankTab = (background = false): Tab => ({
  id: crypto.randomUUID(), title: 'New Tab', url: '', loading: false, navHistory: [], navIndex: -1, background,
});

// Restore tabs + active tab from the saved session. Only durable fields (id,
// title, url, pinned) are persisted; transient state (loading, background,
// crash flags, nav stacks) is rebuilt fresh here. Falls back to a single blank
// tab when the saved session is absent or malformed — never throws.
const loadSession = (restore: boolean, storageKey: string): { tabs: Tab[]; activeTab: string } => {
  const initial = blankTab();
  const fallback = { tabs: [initial], activeTab: initial.id };
  if (!restore) return fallback;
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return fallback;
    const ids = new Set<string>();
    const tabs: Tab[] = parsed.tabs
      .filter((t: any) => {
        if (!t || typeof t.id !== 'string' || !/^[\w-]{1,64}$/.test(t.id) || ids.has(t.id)) return false;
        ids.add(t.id);
        return true;
      })
      .slice(0, MAX_TABS)
      .map((t: any) => ({
        id: t.id,
        title: typeof t.title === 'string' && t.title ? t.title : 'New Tab',
        url: typeof t.url === 'string' ? t.url : '',
        loading: false,
        background: true,
        pinned: t.pinned === true ? true : undefined,
        navHistory: typeof t.url === 'string' && t.url ? [t.url] : [],
        navIndex: typeof t.url === 'string' && t.url ? 0 : -1,
      }));
    if (tabs.length === 0) return fallback;
    const activeTab = typeof parsed.activeTab === 'string' && tabs.some(t => t.id === parsed.activeTab)
      ? parsed.activeTab
      : tabs[0].id;
    return { tabs, activeTab };
  } catch {
    return fallback;
  }
};

// Direct inline SVG icons — guaranteed rendering, no DOMPurify dependency
const _svg = (sz: number, children: React.ReactNode, sw = 2) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }} aria-hidden="true">
    {children}
  </svg>
);

const Icon = {
  back: _svg(18, <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>),
  forward: _svg(18, <><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>),
  refresh: _svg(16, <><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>),
  home: _svg(16, <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>),
  plus: _svg(14, <><path d="M12 5v14" /><path d="M5 12h14" /></>),
  close: _svg(12, <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>),
  closeAll: _svg(14, <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>),
  lock: _svg(14, <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  bookmark: _svg(16, <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />),
  globe: _svg(16, <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>),
  download: _svg(16, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>),
  history: _svg(16, <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  shield: _svg(16, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  pin: _svg(12, <><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></>),
  menu: _svg(16, <><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></>),
  search: _svg(14, <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>),
  key: _svg(16, <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />),
  chevronUp: _svg(12, <path d="M18 15l-6-6-6 6" />),
  chevronDown: _svg(12, <path d="M6 9l6 6 6-6" />),
  devtools: _svg(16, <><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></>),
  settings: _svg(16, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  bookmarkList: _svg(15, <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  reader: _svg(15, <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>),
  zoomIn: _svg(15, <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" /></>),
  zoomOut: _svg(15, <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6" /></>),
  sendToNotes: _svg(15, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15h6" /></>),
};

// Download state
interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  size?: number;
  path?: string;
}

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Browser: React.FC = () => {
  const loaded = useAppPreferences(state => state.loaded);
  useEffect(() => { void loadAppPreferences(); }, []);
  return loaded ? <BrowserWorkspace /> : <p role="status">Loading Browser preferences…</p>;
};

const BrowserWorkspace: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('browser');
  const toast = useToastHelpers();
  const browserRoot = useRef<HTMLDivElement>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Restore the previous session (open tabs + active tab) on mount; falls back
  // to a single blank tab when no valid session is saved. Computed once so the
  // tabs and activeTab initializers stay in sync.
  const restoreTabs = useAppPreference('browser', 'restoreTabs') === true;
  const searchProvider = String(useAppPreference('browser', 'searchProvider'));
  const nativePages = isTauri();
  const nativeDownloads = useBrowserDownloads(nativePages);
  const downloadRequests = useRef(new Set<number>());
  const [sessionKey] = useState(() => {
    const detached = detachedAppId();
    return detached ? `${SESSION_STORAGE_KEY}:detached:${detached}` : SESSION_STORAGE_KEY;
  });
  const { pages: nativePageStates, open: nativeOpenPage, status: nativePageStatus, retry: retryPageStatus } = useNativePageWindows(nativePages);
  const nativePageStatesReady = nativePageStatus === 'ready';
  const pendingPageOpens = useRef(new Map<string, Promise<void>>());
  const closingTabs = useRef(new Set<string>());
  const initialSessionRef = useRef<{ tabs: Tab[]; activeTab: string }>();
  if (!initialSessionRef.current) initialSessionRef.current = loadSession(restoreTabs, sessionKey);
  const [tabs, setTabs] = useState<Tab[]>(() => initialSessionRef.current!.tabs);
  const [activeTab, setActiveTab] = useState(() => initialSessionRef.current!.activeTab);
  const [urlInput, setUrlInput] = useState(() => {
    const s = initialSessionRef.current!;
    return s.tabs.find(t => t.id === s.activeTab)?.url ?? '';
  });
  const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({});
  const [crashedTabs, setCrashedTabs] = useState<Set<string>>(new Set());
  const [tabQuery, setTabQuery] = useState('');
  const searchResults = useMemo(() => {
    const query = tabQuery.trim().toLowerCase();
    return tabs.filter(tab => !query || `${tab.title} ${tab.url}`.toLowerCase().includes(query));
  }, [tabs, tabQuery]);
  const openPageWindow = useCallback(async (id: string, url: string, navigate = false) => {
    if (closingTabs.current.has(id)) return;
    const address = url.replace(/^http:\/\//i, 'https://');
    setTabErrors(prev => prev[id] ? { ...prev, [id]: null } : prev);
    const queue = pendingPageOpens.current;
    const request = Promise.resolve(queue.get(id)).then(() => nativeOpenPage(id, address, navigate)).catch(error => {
      if (queue.get(id) !== request || closingTabs.current.has(id)) return;
      const message = error instanceof Error ? error.message : 'Could not open the web page window.';
      setTabErrors(prev => ({ ...prev, [id]: message }));
      toastRef.current.error(message);
    });
    queue.set(id, request);
    await request;
    if (queue.get(id) === request) queue.delete(id);
  }, [nativeOpenPage]);

  // -- uki context: surface the active tab (title + URL) to the assistant.
  // Registered once on mount; a latest-value ref (refreshed each render) keeps
  // the pure resolver reading live state without re-registering.
  const ukiCtxRef = useRef({ tabs, activeTab });
  const browserSecurityRef = useRef({ forceHttps: true, blockTrackers: true, blockAds: true, reducedFingerprinting: false });
  useEffect(() => { ukiCtxRef.current = { tabs, activeTab }; });
  useEffect(() => {
    registerUkiAppContext('browser', () => {
      const c = ukiCtxRef.current;
      const tab = c.tabs.find(t => t.id === c.activeTab);
      return {
        appId: 'browser',
        focusedItemId: c.activeTab,
        currentFile: tab?.url,
        selectionText: tab?.title,
        custom: {
          activeTabTitle: tab?.title,
          url: tab?.url,
          loading: tab?.loading ?? false,
          openTabs: c.tabs.length,
          security: browserSecurityRef.current,
          securityGuidance: tab?.url?.startsWith('http:')
            ? 'Unencrypted HTTP address. Prefer HTTPS and never enter credentials.'
            : 'Review domain spelling before entering credentials or approving downloads.',
        },
      };
    });
    return () => unregisterUkiAppContext('browser');
  }, []);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-bookmarks');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch { return []; }
  });
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolder[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-bookmark-folders');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activeBookmarkFolder, setActiveBookmarkFolder] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  // Browser settings contain sensitive config (tor mode, user agent) — use IPC-only, defaults on mount
  const [browserSettings, setBrowserSettings] = useState<BrowserSettings>({
    blockTrackers: true,
    blockAds: true,
    forceHttps: true,
    fingerprintProtection: true,
    doNotTrack: true,
    clearOnExit: true,
    blockThirdPartyCookies: true,
    enableTorMode: false,
    customUserAgent: '',
  });
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTabMenu, setShowTabMenu] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [httpsUpgradeCount, setHttpsUpgradeCount] = useState(0);

  // ---- Keychain state (IPC-only, never in localStorage) ----
  const [savedPasswords, setSavedPasswords] = useState<SavedPassword[]>([]);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [showKeychain, setShowKeychain] = useState(false);
  const [keychainTab, setKeychainTab] = useState<'passwords' | 'cards'>('passwords');
  const [showAddCard, setShowAddCard] = useState(false);
  const [savePrompt, setSavePrompt] = useState<{ domain: string; username: string; password: string } | null>(null);
  // Tracks which webviews have already had autofill injected to avoid duplicates
  const autofillInjectedRef = useRef<Set<string>>(new Set());
  // Per-session unguessable sentinel for credential detection (prevents spoofing)
  const credsSentinelRef = useRef('__DEX_CREDS_' + Math.random().toString(36).slice(2, 10) + '__');

  const webviewRefs = useRef<Map<string, any>>(new Map());
  const webviewEventsRef = useRef<Set<string>>(new Set());
  // Per-tab webview DOM listeners, retained so they can be detached when the
  // webview element unmounts (leak-safety: symmetric removal of every
  // addEventListener attached in attachWebviewEvents).
  const webviewListenersRef = useRef<Map<string, Array<[string, (...args: any[]) => void]>>>(new Map());
  // Per-tab window message handlers for credential capture (stored for cleanup)
  const credMsgHandlersRef = useRef<Map<string, (ev: MessageEvent) => void>>(new Map());
  // Stable src ref: stores the initial URL each webview mounts with.
  // Prevents React re-renders from changing the src attribute and causing reload loops.
  const webviewSrcRef = useRef<Map<string, string>>(new Map());
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const nativePageStatesRef = useRef(nativePageStates);
  nativePageStatesRef.current = nativePageStates;
  const tabStrip = useBrowserTabStrip(tabs, activeTab);
  // Refs that point at the latest createTab / refresh callbacks. The keyboard
  // handler is registered before those callbacks are defined, so we go through
  // a ref to avoid a stale closure or a re-binding cascade on every render.
  const createTabRef = useRef<((background?: boolean) => void) | null>(null);
  const closeTabRef = useRef<((id: string) => void) | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const findPageRef = useRef<(() => void) | null>(null);
  // Points at the latest applyZoomForWebview. attachWebviewEvents is defined
  // before that callback exists, so the webview event handlers reach it via ref.
  const applyZoomRef = useRef<((webview: any, tabId: string) => void) | null>(null);

  // Reconcile credential-capture message listeners against live tabs. Bulk-close
  // paths (closeAllTabs / closeTabsToRight / closeOtherTabs) drop tabs without
  // visiting closeTab, so their per-tab 'message' listeners would otherwise leak
  // and keep firing for dead tabs. Remove any handler whose tab is gone, and on
  // unmount drain whatever remains.
  useEffect(() => {
    const liveIds = new Set(tabs.map(t => t.id));
    for (const [id, handler] of credMsgHandlersRef.current) {
      if (!liveIds.has(id)) {
        window.removeEventListener('message', handler);
        credMsgHandlersRef.current.delete(id);
      }
    }
    // The same bulk-close paths also bypass closeTab's pruning of the per-tab
    // side-channel refs, so reconcile them here too — otherwise stale entries
    // for dead tabs accumulate across a long session of tab churn.
    for (const id of webviewEventsRef.current) {
      if (!liveIds.has(id)) webviewEventsRef.current.delete(id);
    }
    for (const id of autofillInjectedRef.current) {
      if (!liveIds.has(id)) autofillInjectedRef.current.delete(id);
    }
    for (const id of webviewSrcRef.current.keys()) {
      if (!liveIds.has(id)) webviewSrcRef.current.delete(id);
    }
    // Drop any retained webview-listener records for tabs that are gone (the
    // element is already unmounted, so the listeners died with it; this just
    // prevents the record map from growing across long tab-churn sessions).
    for (const id of webviewListenersRef.current.keys()) {
      if (!liveIds.has(id)) webviewListenersRef.current.delete(id);
    }
  }, [tabs]);

  useEffect(() => {
    const handlers = credMsgHandlersRef.current;
    return () => {
      for (const handler of handlers.values()) {
        window.removeEventListener('message', handler);
      }
      handlers.clear();
    };
  }, []);

  // Restored metadata stays dormant until selected. An already running
  // page stays resident so switching tabs cannot discard unsaved page state.
  useEffect(() => {
    if (nativePages || !tabsRef.current.find(tab => tab.id === activeTab)?.background) return;
    setTabs(prev => prev.map(tab => tab.id === activeTab ? { ...tab, background: false } : tab));
  }, [activeTab, nativePages]);

  // Find-in-page
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState({ active: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const bookmarkSaveRef = useRef<ReturnType<typeof setTimeout>>();

  // Per-site zoom — persisted per hostname, applied on navigation. Held in a ref
  // (mutated imperatively as pages load) plus a state mirror for the live readout.
  const zoomMapRef = useRef<Record<string, number>>(loadZoomMap());
  const zoomSaveRef = useRef<ReturnType<typeof setTimeout>>();
  const [activeZoom, setActiveZoom] = useState(1); // current active-tab zoom factor (for the readout)

  // Searchable bookmark store — live filter text for the bookmarks panel.
  const [bookmarkQuery, setBookmarkQuery] = useState('');

  // Reading mode
  const [readingMode, setReadingMode] = useState(false);
  const [readingContent, setReadingContent] = useState('');

  // Tab groups
  const [tabGroups, setTabGroups] = useState<Map<string, { name: string; color: string; tabIds: string[] }>>(new Map());
  const [showGroupMenu, setShowGroupMenu] = useState<string | null>(null);
  const TAB_GROUP_COLORS = ['var(--color-error)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-accent)', '#bf5af2', '#ac8e68'];

  const createTabGroup = useCallback((name: string, color: string, tabIds: string[]) => {
    const id = Date.now().toString(36);
    setTabGroups(prev => {
      const next = new Map(prev);
      next.set(id, { name, color, tabIds });
      return next;
    });
  }, []);

  const addTabToGroup = useCallback((groupId: string, tabId: string) => {
    setTabGroups(prev => {
      const next = new Map(prev);
      const group = next.get(groupId);
      if (group && !group.tabIds.includes(tabId)) {
        next.set(groupId, { ...group, tabIds: [...group.tabIds, tabId] });
      }
      return next;
    });
  }, []);

  const removeTabFromGroup = useCallback((groupId: string, tabId: string) => {
    setTabGroups(prev => {
      const next = new Map(prev);
      const group = next.get(groupId);
      if (group) {
        const tabIds = group.tabIds.filter(id => id !== tabId);
        if (tabIds.length === 0) next.delete(groupId);
        else next.set(groupId, { ...group, tabIds });
      }
      return next;
    });
  }, []);

  const toggleReadingMode = useCallback(() => {
    if (readingMode) {
      setReadingMode(false);
      setReadingContent('');
      return;
    }
    const tab = tabs.find(t => t.id === activeTab);
    if (!tab) return;
    const wv = webviewRefs.current.get(tab.id);
    if (!wv) return;
    // Extract article content from the page
    wv.executeJavaScript(`
      (function() {
        var article = document.querySelector('article') || document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
        var title = document.title || '';
        // Remove nav, header, footer, ads
        var clone = article.cloneNode(true);
        clone.querySelectorAll('nav, header, footer, aside, .ad, .ads, [class*="sidebar"], script, style, iframe').forEach(function(el) { el.remove(); });
        return JSON.stringify({ title: title, html: clone.innerHTML });
      })()
    `).then((result: string) => {
      try {
        const parsed = JSON.parse(result);
        setReadingContent(parsed.html || '<p>Could not extract article content.</p>');
        setReadingMode(true);
      } catch { setReadingContent('<p>Could not parse page content.</p>'); setReadingMode(true); }
    }).catch(() => { setReadingContent('<p>Could not access page content.</p>'); setReadingMode(true); });
  }, [readingMode, tabs, activeTab]);
  // Send the active tab's URL (link) to Notes via the shared cross-app sink.
  const sendUrlToNotes = useCallback(() => {
    try {
      const tab = tabsRef.current.find(t => t.id === activeTabRef.current);
      const url = tab?.url || '';
      if (!url) { toast.info?.('Open a page first'); return; }
      const title = tab?.title || url;
      void sendToNotes(`${title}\n${url}`, title);
    } catch (e) { console.warn('[DEX]', e); }
  }, [toast]);

  // Reader-mode hand-off: extract the article text from the active page and save
  // it to Notes as an article (title + source URL + readable body). Falls back to
  // a link-only note if content extraction is unavailable.
  const sendArticleToNotes = useCallback(() => {
    try {
      const tab = tabsRef.current.find(t => t.id === activeTabRef.current);
      const url = tab?.url || '';
      if (!url) { toast.info?.('Open a page first'); return; }
      const wv = webviewRefs.current.get(activeTabRef.current);
      const fallback = () => void sendToNotes(`${tab?.title || url}\n${url}`, tab?.title || url);
      if (!wv || typeof wv.executeJavaScript !== 'function') { fallback(); return; }
      wv.executeJavaScript(`
        (function() {
          var article = document.querySelector('article') || document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
          var clone = article.cloneNode(true);
          clone.querySelectorAll('nav, header, footer, aside, .ad, .ads, [class*="sidebar"], script, style, iframe, noscript').forEach(function(el) { el.remove(); });
          return JSON.stringify({ title: document.title || '', text: (clone.innerText || '').trim() });
        })()
      `).then((result: string) => {
        try {
          const parsed = JSON.parse(result);
          const articleTitle = (parsed.title || tab?.title || url).slice(0, 80);
          const body = (parsed.text || '').slice(0, 50000);
          const noteText = body
            ? `${articleTitle}\nSource: ${url}\n\n${body}`
            : `${articleTitle}\n${url}`;
          void sendToNotes(noteText, articleTitle);
        } catch { fallback(); }
      }).catch(() => fallback());
    } catch (e) { console.warn('[DEX]', e); }
  }, [toast]);

  const historySaveRef = useRef<ReturnType<typeof setTimeout>>();
  const settingsSaveRef = useRef<ReturnType<typeof setTimeout>>();
  const sessionSaveRef = useRef<ReturnType<typeof setTimeout>>();

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);

  // DevTools
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  // Search suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [urlFocused, setUrlFocused] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoveredFavorite, setHoveredFavorite] = useState<string | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  // Fullscreen video state
  const [fullscreenTabId, setFullscreenTabId] = useState<string | null>(null);

  // Cleanup timer refs on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (bookmarkSaveRef.current) clearTimeout(bookmarkSaveRef.current);
      if (historySaveRef.current) clearTimeout(historySaveRef.current);
      if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current);
      if (sessionSaveRef.current) clearTimeout(sessionSaveRef.current);
      if (zoomSaveRef.current) clearTimeout(zoomSaveRef.current);
    };
  }, []);

  // Load data from IPC backend on mount (overrides localStorage initial state)
  useEffect(() => {
    // Purge any leftover sensitive data from localStorage (migration cleanup)
    localStorage.removeItem(KEYCHAIN_STORAGE_KEY);
    localStorage.removeItem(CARDS_STORAGE_KEY);
    localStorage.removeItem('dex-browser-settings');

    let mounted = true;
    const ipc = (window as any).electron?.invoke;
    if (!ipc) return;
    ipc('capability:storage:get', 'dex-browser-bookmarks').then((r: string | null) => {
      if (!mounted) return;
      if (r) { try { const p = JSON.parse(r); if (Array.isArray(p)) setBookmarks(p); } catch (e) { console.warn('[DEX]', e); } }
    }).catch((e: unknown) => { console.warn('[DEX]', e); });
    ipc('capability:storage:get', 'dex-browser-bookmark-folders').then((r: string | null) => {
      if (!mounted) return;
      if (r) { try { const p = JSON.parse(r); if (Array.isArray(p)) setBookmarkFolders(p); } catch (e) { console.warn('[DEX]', e); } }
    }).catch((e: unknown) => { console.warn('[DEX]', e); });
    ipc('capability:storage:get', 'dex-browser-history').then((r: string | null) => {
      if (!mounted) return;
      if (r) { try { const p = JSON.parse(r); if (Array.isArray(p)) setHistory(p); } catch (e) { console.warn('[DEX]', e); } }
    }).catch((e: unknown) => { console.warn('[DEX]', e); });
    ipc('capability:storage:get', 'dex-browser-settings').then((r: string | null) => {
      if (!mounted) return;
      if (r) { try { setBrowserSettings(prev => ({ ...prev, ...JSON.parse(r) })); } catch (e) { console.warn('[DEX]', e); } }
    }).catch((e: unknown) => { console.warn('[DEX]', e); });
    // Generic capability storage is not a credential vault. Purge historical
    // browser secrets and keep new entries session-only unless a real OS vault
    // bridge is available in a future backend.
    ipc('capability:storage:set', KEYCHAIN_STORAGE_KEY, '[]').catch(() => {});
    ipc('capability:storage:set', CARDS_STORAGE_KEY, '[]').catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Persist bookmarks (debounced)
  useEffect(() => {
    if (bookmarkSaveRef.current) clearTimeout(bookmarkSaveRef.current);
    bookmarkSaveRef.current = setTimeout(() => {
      const bk = JSON.stringify(bookmarks);
      const bf = JSON.stringify(bookmarkFolders);
      localStorage.setItem('dex-browser-bookmarks', bk);
      localStorage.setItem('dex-browser-bookmark-folders', bf);
      (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-bookmarks', bk).catch((e: unknown) => { console.warn('[DEX]', e); });
      (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-bookmark-folders', bf).catch((e: unknown) => { console.warn('[DEX]', e); });
    }, 500);
  }, [bookmarks, bookmarkFolders]);

  // Keyboard shortcuts (Ctrl+F find, Ctrl+Shift+I devtools)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target;
      if (e.defaultPrevented || !(target instanceof Node) || !browserRoot.current?.contains(target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (nativePages && !findPageRef.current) return;
        e.preventDefault();
        if (nativePages) findPageRef.current?.();
        else {
          setShowFindBar(true);
          focusTimerRef.current = setTimeout(() => findInputRef.current?.focus(), 100);
        }
      }
      if (!nativePages && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setDevToolsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && fullscreenTabId) {
        const wv = webviewRefs.current.get(fullscreenTabId);
        if (wv?.executeJavaScript) wv.executeJavaScript('document.exitFullscreen().catch(function(){})');
        setFullscreenTabId(null);
      }
      if (e.key === 'Escape' && showFindBar) {
        setShowFindBar(false);
        setFindQuery('');
        setFindResults({ active: 0, total: 0 });
      }
      // Ctrl+W closes browser tab (prevent AppManager from closing the entire app)
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        const currentId = activeTabRef.current;
        if (currentId) closeTabRef.current?.(currentId);
      }
      // Ctrl+T -- new tab. Stop propagation so the global "open command palette"
      // shortcut doesn't fire on top of it.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        try { (createTabRef.current ?? (() => {}))(); } catch (err) { console.warn('[Browser] new tab', err); }
        focusTimerRef.current = setTimeout(() => urlInputRef.current?.focus(), 60);
      }
      // Ctrl+L -- jump focus to the URL bar (Chrome/Firefox parity).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        e.stopPropagation();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
      // Ctrl+R -- reload current tab.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        e.stopPropagation();
        try { (refreshRef.current ?? (() => {}))(); } catch (err) { console.warn('[Browser] reload', err); }
      }
      // Ctrl+Tab / Ctrl+Shift+Tab -- cycle through tabs without leaving the browser.
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setTabs(prev => {
          if (prev.length <= 1) return prev;
          const idx = prev.findIndex(t => t.id === activeTabRef.current);
          const dir = e.shiftKey ? -1 : 1;
          const nextIdx = (idx + dir + prev.length) % prev.length;
          const next = prev[nextIdx];
          setActiveTab(next.id);
          setUrlInput(next.url);
          return prev;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showFindBar, fullscreenTabId, nativePages]);

  // Persist history (debounced) — cap at HISTORY_LIMIT (2000)
  useEffect(() => {
    if (historySaveRef.current) clearTimeout(historySaveRef.current);
    historySaveRef.current = setTimeout(() => {
      const json = JSON.stringify(history.slice(0, HISTORY_LIMIT));
      localStorage.setItem('dex-browser-history', json);
      (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-history', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    }, 1000);
  }, [history]);

  // Persist the open session (tabs + active tab) for restore on next open
  // (debounced). Only durable fields are stored — transient loading/background/
  // nav state is dropped and rebuilt on restore.
  useEffect(() => {
    if (!restoreTabs) return;
    let pending = true;
    const save = () => {
      if (!pending || useAppPreferences.getState().apps.browser?.restoreTabs === false) return;
      pending = false;
      try {
        const session: SavedSession = {
          tabs: tabs.map(t => ({
            id: t.id,
            title: t.title,
            url: t.url,
            ...(t.pinned ? { pinned: true } : {}),
          })),
          activeTab,
        };
        localStorage.setItem(sessionKey, JSON.stringify(session));
      } catch (e) { console.warn('[DEX]', e); }
    };
    sessionSaveRef.current = setTimeout(save, 500);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(sessionSaveRef.current);
      window.removeEventListener('pagehide', save);
      // Only flush on the last commit (e.g. a window closes before the timer).
      if (tabsRef.current === tabs && activeTabRef.current === activeTab) save();
    };
  }, [tabs, activeTab, restoreTabs, sessionKey]);

  // Auto-clear: trim history beyond limit + prune entries older than 30 days
  useEffect(() => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    setHistory(prev => {
      const trimmed = prev.filter(h => h.visitedAt > thirtyDaysAgo);
      return trimmed.length > HISTORY_LIMIT ? trimmed.slice(0, HISTORY_LIMIT) : trimmed;
    });
  }, []);

  // Persist settings (debounced)
  useEffect(() => {
    if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current);
    settingsSaveRef.current = setTimeout(() => {
      const json = JSON.stringify(browserSettings);
      // Settings contain sensitive config (tor mode, user agent) — IPC only
      (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-settings', json).catch((e: unknown) => { console.warn('[DEX]', e); });
    }, 500);
  }, [browserSettings]);

  // Credentials remain memory-only until an OS-vault bridge is available.

  // Add to history - MOVED BEFORE useEffect that uses it
  const addToHistory = useCallback((url: string, title: string) => {
    if (!url || url === '') return;
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      url,
      title: title || url,
      visitedAt: Date.now(),
    };
    setHistory(prev => {
      const earlier = prev.find(item => item.url === url);
      const updated = [{ ...entry, id: earlier?.id ?? entry.id }, ...prev.filter(h => h.url !== url)];
      return updated.length > HISTORY_LIMIT ? updated.slice(0, HISTORY_LIMIT) : updated;
    });
  }, []);

  const appliedPageStates = useRef<ReadonlyMap<string, NativePage>>(new Map());
  useEffect(() => {
    if (!nativePages) return;
    const previous = appliedPageStates.current;
    appliedPageStates.current = nativePageStates;
    const changes = new Map(Array.from(nativePageStates).filter(([id, state]) => previous.get(id) !== state));
    if (!changes.size) return;
    const active = changes.get(activeTabRef.current);
    const oldAddress = tabsRef.current.find(tab => tab.id === activeTabRef.current)?.url;
    if (active?.status === 'open') {
      setUrlInput(raw => document.activeElement === urlInputRef.current && raw !== oldAddress ? raw : active.url);
    }
    setTabs(current => {
      let changed = false;
      const updated = current.map(tab => {
        const page = changes.get(tab.id);
        if (!page || page.status !== 'open' || (tab.url === page.url && tab.title === page.title)) return tab;
        changed = true;
        if (tab.url === page.url) return { ...tab, title: page.title };
        const navHistory = [...tab.navHistory.slice(0, tab.navIndex + 1), page.url].slice(-80);
        return { ...tab, title: page.title, url: page.url, navHistory, navIndex: navHistory.length - 1 };
      });
      return changed ? updated : current;
    });
    for (const [id, page] of changes) {
      const earlier = previous.get(id);
      if (page.status === 'open' && tabsRef.current.some(tab => tab.id === id) &&
        (earlier?.status !== 'open' || earlier.url !== page.url || earlier.title !== page.title)) {
        addToHistory(page.url, page.title);
      }
    }
  }, [addToHistory, nativePages, nativePageStates]);

  const hasLivePage = useCallback((id: string) => {
    const page = nativePageStatesRef.current.get(id);
    return pendingPageOpens.current.has(id) || (page !== undefined && page.status !== 'closed');
  }, []);

  const actOnPageWindow = useCallback(async (id: string, action: 'reload' | 'back' | 'forward' | 'find') => {
    try {
      await nativePageAction(id, action);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'The page window did not respond.');
    }
  }, []);

  const actOnDownload = useCallback(async (id: number, action: 'save' | 'cancel') => {
    if (downloadRequests.current.has(id)) return;
    downloadRequests.current.add(id);
    try {
      await browserDownloadAction(id, action);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'The download action could not be completed.');
    } finally {
      downloadRequests.current.delete(id);
    }
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('dex-browser-history');
    (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-history', '[]').catch(() => {});
  }, []);

  useEffect(() => {
    browserSecurityRef.current = {
      forceHttps: nativePages || browserSettings.forceHttps,
      blockTrackers: !nativePages && browserSettings.blockTrackers,
      blockAds: !nativePages && browserSettings.blockAds,
      reducedFingerprinting: !nativePages && browserSettings.enableTorMode,
    };
  }, [browserSettings.forceHttps, browserSettings.blockTrackers, browserSettings.blockAds, browserSettings.enableTorMode, nativePages]);

  useEffect(() => () => {
    if (!browserSettings.clearOnExit) return;
    localStorage.removeItem('dex-browser-history');
    if (!nativePages) localStorage.removeItem(sessionKey);
    (window as any).electron?.invoke?.('capability:storage:set', 'dex-browser-history', '[]').catch(() => {});
  }, [browserSettings.clearOnExit, nativePages]);

  // ---- Keychain CRUD ----
  const savePassword = useCallback((domain: string, username: string, password: string) => {
    setSavedPasswords(prev => {
      const existing = prev.findIndex(p => p.domain === domain && p.username === username);
      const entry: SavedPassword = {
        id: existing >= 0 ? prev[existing].id : crypto.randomUUID(),
        domain,
        username,
        password: _ob(password),
        createdAt: existing >= 0 ? prev[existing].createdAt : Date.now(),
        lastUsed: Date.now(),
      };
      if (existing >= 0) { const next = [...prev]; next[existing] = entry; return next; }
      return [entry, ...prev];
    });
  }, []);

  const deletePassword = useCallback((id: string) => {
    setSavedPasswords(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveCard = useCallback((label: string, name: string, number: string, expiry: string) => {
    const entry: SavedCard = {
      id: Date.now().toString(),
      label,
      name,
      number: _ob(number),
      expiry,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    setSavedCards(prev => [entry, ...prev]);
  }, []);

  const deleteCard = useCallback((id: string) => {
    setSavedCards(prev => prev.filter(c => c.id !== id));
  }, []);

  // Extract domain from URL for keychain matching
  const domainFromUrl = useCallback((url: string): string => {
    try { return new URL(url).hostname.replace(/^www\\./, ''); } catch { return ''; }
  }, []);

  // ---- Per-site zoom ----
  // Persist the zoom map (debounced) to localStorage.
  const persistZoomMap = useCallback(() => {
    if (zoomSaveRef.current) clearTimeout(zoomSaveRef.current);
    zoomSaveRef.current = setTimeout(() => {
      try { localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(zoomMapRef.current)); }
      catch (e) { console.warn('[DEX]', e); }
    }, 400);
  }, []);

  // Apply the remembered zoom for a webview's current host (default 1). Safe no-op
  // when the webview or its URL is unavailable. Updates the readout for the active tab.
  const applyZoomForWebview = useCallback((webview: any, tabId: string) => {
    try {
      if (!webview) return;
      const url = webview.getURL?.() || tabsRef.current.find(t => t.id === tabId)?.url || '';
      const host = domainFromUrl(url);
      const factor = (host && zoomMapRef.current[host]) || 1;
      if (typeof webview.setZoomFactor === 'function') webview.setZoomFactor(factor);
      if (tabId === activeTabRef.current) setActiveZoom(factor);
    } catch (e) { console.warn('[DEX]', e); }
  }, [domainFromUrl]);
  applyZoomRef.current = applyZoomForWebview;

  // Adjust the active tab's zoom: 'in' | 'out' | 'reset'. Persists per hostname.
  const adjustZoom = useCallback((dir: 'in' | 'out' | 'reset') => {
    try {
      const tabId = activeTabRef.current;
      const webview = webviewRefs.current.get(tabId);
      const url = webview?.getURL?.() || tabsRef.current.find(t => t.id === tabId)?.url || '';
      const host = domainFromUrl(url);
      if (!host) { toast.info?.('Open a page to zoom'); return; }
      const current = zoomMapRef.current[host] || 1;
      let next = current;
      if (dir === 'in') next = Math.min(ZOOM_MAX, Math.round((current + ZOOM_STEP) * 100) / 100);
      else if (dir === 'out') next = Math.max(ZOOM_MIN, Math.round((current - ZOOM_STEP) * 100) / 100);
      else next = 1;
      if (next === 1) delete zoomMapRef.current[host];
      else zoomMapRef.current[host] = next;
      if (webview && typeof webview.setZoomFactor === 'function') webview.setZoomFactor(next);
      setActiveZoom(next);
      persistZoomMap();
    } catch (e) { console.warn('[DEX]', e); }
  }, [domainFromUrl, persistZoomMap, toast]);

  // Keep the zoom readout in sync with the active tab's host. Reflects the stored
  // factor (default 1) whenever the active tab or its URL changes. Derives the
  // active tab's url locally so it does not depend on `currentTab` (declared later).
  const activeTabUrl = tabs.find(t => t.id === activeTab)?.url || '';
  useEffect(() => {
    try {
      const host = domainFromUrl(activeTabUrl);
      const factor = (host && zoomMapRef.current[host]) || 1;
      setActiveZoom(factor);
      // Best-effort re-apply to the live webview (e.g. switching back to a tab)
      const webview = webviewRefs.current.get(activeTab);
      if (webview && typeof webview.setZoomFactor === 'function') webview.setZoomFactor(factor);
    } catch (e) { console.warn('[DEX]', e); }
  }, [activeTab, activeTabUrl, domainFromUrl]);

  // Autofill: inject credentials into login forms on dom-ready
  const injectAutofill = useCallback((webview: any, tabId: string) => {
    if (autofillInjectedRef.current.has(tabId)) return;
    autofillInjectedRef.current.add(tabId);
    try {
      const url = webview.getURL?.() || '';
      const domain = domainFromUrl(url);
      if (!domain) return;

      // Find saved password for this domain
      const match = savedPasswords.find(p => p.domain === domain);
      if (match) {
        // Use JSON.stringify for safe data escaping — prevents XSS via credential values
        const safeData = JSON.stringify({ user: match.username, pass: _de(match.password) });
        webview.executeJavaScript(
          "(function(){" +
          "var d=" + safeData + ";" +
          "var u=document.querySelector('input[type=\"email\"],input[type=\"text\"][name*=\"user\"],input[type=\"text\"][name*=\"login\"],input[type=\"text\"][autocomplete=\"username\"],input[name=\"email\"],input[name=\"username\"]');" +
          "var p=document.querySelector('input[type=\"password\"]');" +
          "if(u){u.value=d.user;u.dispatchEvent(new Event('input',{bubbles:true}));}" +
          "if(p){p.value=d.pass;p.dispatchEvent(new Event('input',{bubbles:true}));}" +
          "})()"
        ).catch((e: unknown) => { console.warn('[DEX]', e); });
        // Update lastUsed
        setSavedPasswords(prev => prev.map(p => p.id === match.id ? { ...p, lastUsed: Date.now() } : p));
      }

      // Listen for form submit to detect credentials for save prompt
      // Uses ipc-message channel instead of console.log to avoid credential exposure in guest console
      const sentinel = credsSentinelRef.current;
      webview.executeJavaScript(
        "(function(){" +
        "document.addEventListener('submit',function(e){" +
        "var form=e.target;" +
        "var u=form.querySelector('input[type=\"email\"],input[type=\"text\"][name*=\"user\"],input[name=\"email\"],input[name=\"username\"]');" +
        "var p=form.querySelector('input[type=\"password\"]');" +
        "if(u&&p&&u.value&&p.value){" +
        "window.postMessage({type:'" + sentinel + "',username:u.value,password:p.value},'*');" +
        "}" +
        "},true);" +
        "})()"
      ).catch((e: unknown) => { console.warn('[DEX]', e); });
    } catch (e) { console.warn('[DEX]', e); }
  }, [savedPasswords, domainFromUrl]);

  // Patch a single tab in place, returning the previous array unchanged when
  // none of the fields actually differ. did-stop-loading, did-finish-load and
  // did-navigate all set loading:false in sequence, so without this guard each
  // redundant event still allocates a fresh array and re-renders the whole tab
  // strip. Returning `prev` on a no-op skips the render entirely.
  const patchTab = useCallback((tabId: string, patch: Partial<Tab>) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const cur = prev[idx];
      let changed = false;
      for (const k in patch) {
        if ((cur as any)[k] !== (patch as any)[k]) { changed = true; break; }
      }
      if (!changed) return prev;
      const next = prev.slice();
      next[idx] = { ...cur, ...patch };
      return next;
    });
  }, []);

  // Multi-webview event attachment
  const attachWebviewEvents = useCallback((webview: any, tabId: string) => {
    if (!webview || webviewEventsRef.current.has(tabId)) return;
    webviewEventsRef.current.add(tabId);

    // Record every listener so detachWebviewEvents can remove them symmetrically
    // when the webview element unmounts (leak-safety).
    const recorded: Array<[string, (...args: any[]) => void]> = [];
    const on = (evt: string, handler: (...args: any[]) => void) => {
      recorded.push([evt, handler]);
      webview.addEventListener(evt, handler);
    };
    webviewListenersRef.current.set(tabId, recorded);

    on('did-start-loading', () => {
      patchTab(tabId, { loading: true });
    });
    on('did-stop-loading', () => {
      patchTab(tabId, { loading: false });
    });
    on('did-finish-load', () => {
      patchTab(tabId, { loading: false });
    });
    on('page-title-updated', (e: { title?: string }) => {
      const title = e.title || 'New Tab';
      patchTab(tabId, { title });
      try {
        const url = webview.getURL?.() || '';
        if (url) addToHistory(url, title);
      } catch (e) { console.warn('[DEX]', e); }
    });
    on('did-navigate', (e: { url: string }) => {
      // Only update loading state — do NOT update tab.url here.
      // Updating tab.url would change the webview src attribute and cause a reload loop.
      patchTab(tabId, { loading: false });
      if (activeTabRef.current === tabId) setUrlInput(e.url);
      // Re-apply per-site zoom — host may have changed across the navigation
      applyZoomRef.current?.(webview, tabId);
    });
    on('did-navigate-in-page', (e: { url: string }) => {
      // SPA navigation — update URL bar only, not tab.url (avoids reload loop)
      if (activeTabRef.current === tabId) setUrlInput(e.url);
    });
    on('crashed', () => {
      console.error('[Browser] Webview crashed:', tabId);
      patchTab(tabId, { loading: false, title: 'Page Crashed' });
      setTabErrors(prev => ({ ...prev, [tabId]: 'Page crashed. Click reload to try again.' }));
      setCrashedTabs(prev => { const next = new Set(prev); next.add(tabId); return next; });
    });
    on('unresponsive', () => {
      setTabErrors(prev => ({ ...prev, [tabId]: 'Page is not responding...' }));
    });
    on('responsive', () => {
      setTabErrors(prev => ({ ...prev, [tabId]: null }));
    });
    on('did-fail-load', (e: { errorCode: number; errorDescription?: string }) => {
      if (e.errorCode === -3) return;
      console.error('[Browser] Load failed:', tabId, e.errorCode, e.errorDescription);
      patchTab(tabId, { loading: false });
      setTabErrors(prev => ({ ...prev, [tabId]: e.errorDescription || 'Failed to load page' }));
    });
    on('console-message', (e: { level: number; message: string }) => {
      if (e.level === 2) console.warn('[Browser] Page error:', tabId, e.message);
    });
    // Detect credential save signal via secure ipc-message channel (not console.log)
    on('ipc-message', (e: any) => {
      if (e.channel === 'dex-cred-capture') {
        try {
          const data = e.args?.[0];
          const url = webview.getURL?.() || '';
          const domain = domainFromUrl(url);
          if (domain && data?.username && data?.password) {
            setSavePrompt({ domain, username: data.username, password: data.password });
          }
        } catch (err) { console.warn('[DEX]', err); }
      }
    });
    // Handle new-window events — download links open a new window in webviews
    on('new-window', (e: { url: string; disposition?: string }) => {
      const url = e.url;
      if (!url) return;
      // Detect downloadable extensions — trigger IPC download directly
      const isDownload = /\.(exe|msi|zip|tar|gz|7z|pdf|dmg|pkg|deb|rpm|iso|bin|apk|mp3|mp4|wav|flac|avi|mkv|mov|epub|docx|xlsx|pptx|csv)(\?.*)?$/i.test(url);
      if (isDownload) {
        const fileName = url.split('/').pop()?.split('?')[0] || 'download';
        setDownloads(prev => [...prev, { id: Date.now().toString(), url, fileName, progress: 0, status: 'downloading' }]);
        setShowDownloads(true);
        window.electron?.invoke?.('download:start', url).then((result: any) => {
          if (result?.success) {
            setDownloads(prev => prev.map(d => d.url === url ? { ...d, status: 'completed', progress: 100, path: result.path } : d));
          }
        }).catch(() => {
          setDownloads(prev => prev.map(d => d.url === url ? { ...d, status: 'error' } : d));
        });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        // Let renderer open as a new tab
        window.electron?.invoke?.('browser:new-tab-request', url).catch((e: unknown) => {
          console.warn('[Browser] Failed to request new tab:', e);
        });
      }
    });
    // Also handle postMessage-based credential capture as fallback
    const handleCredMsg = (ev: MessageEvent) => {
      const sentinel = credsSentinelRef.current;
      if (ev.data?.type === sentinel && ev.data.username && ev.data.password) {
        const url = webview.getURL?.() || '';
        const domain = domainFromUrl(url);
        if (domain) {
          setSavePrompt({ domain, username: ev.data.username, password: ev.data.password });
        }
      }
    };
    credMsgHandlersRef.current.set(tabId, handleCredMsg);
    window.addEventListener('message', handleCredMsg);
    on('dom-ready', () => {
      // Autofill saved credentials on page load
      autofillInjectedRef.current.delete(tabId); // allow re-injection on new page
      injectAutofill(webview, tabId);
      // Apply remembered per-site zoom for this page's host
      applyZoomRef.current?.(webview, tabId);
    });
    on('enter-html-full-screen', () => {
      setFullscreenTabId(tabId);
    });
    on('leave-html-full-screen', () => {
      setFullscreenTabId(prev => prev === tabId ? null : prev);
    });
  }, [addToHistory, injectAutofill, domainFromUrl, setDownloads, setShowDownloads, patchTab]);

  // Symmetric teardown for attachWebviewEvents: remove every recorded DOM
  // listener from the webview element before it unmounts (leak-safety).
  const detachWebviewEvents = useCallback((webview: any, tabId: string) => {
    const recorded = webviewListenersRef.current.get(tabId);
    if (recorded && webview) {
      for (const [evt, handler] of recorded) {
        try { webview.removeEventListener(evt, handler); } catch { /* element already gone */ }
      }
    }
    webviewListenersRef.current.delete(tabId);
  }, []);

  // Ref callback factory for webviews
  const getWebviewRef = useCallback((tabId: string) => (el: any) => {
    if (el) {
      webviewRefs.current.set(tabId, el);
      // Schedule event attachment after DOM initialization
      requestAnimationFrame(() => attachWebviewEvents(el, tabId));
    } else {
      // Element unmounting — detach the listeners we attached to it.
      detachWebviewEvents(webviewRefs.current.get(tabId), tabId);
      webviewRefs.current.delete(tabId);
      webviewEventsRef.current.delete(tabId);
    }
  }, [attachWebviewEvents, detachWebviewEvents]);

  // Listen for download progress
  useEffect(() => {
    const handleProgress = (_: any, data: any) => {
      setDownloads(prev => prev.map(d => 
        d.url === data.url 
          ? { ...d, progress: data.percent, fileName: data.fileName }
          : d
      ));
    };
    window.electron?.ipcRenderer?.on?.('download:progress', handleProgress);
    return () => {
      window.electron?.ipcRenderer?.off?.('download:progress', handleProgress);
    };
  }, []);

  // Mirror file downloads into the Home "Live Activity" feed so download
  // progress shows as a live card on the Home screen. Centralized + throttled to
  // whole-percent changes so the stream of progress events doesn't spam the feed.
  const liveActivityRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const tracked = liveActivityRef.current;
    const seen = new Set<string>();
    downloads.forEach(d => {
      seen.add(d.id);
      const actId = `browser-${d.id}`;
      const pct = Math.round(d.progress);
      if (d.status === 'downloading') {
        if (!tracked.has(d.id)) {
          tracked.set(d.id, pct);
          dispatchActivity({ id: actId, type: 'download', label: `Downloading ${d.fileName}`, progress: pct, app: 'browser' });
        } else if (tracked.get(d.id) !== pct) {
          tracked.set(d.id, pct);
          updateActivity(actId, pct);
        }
      } else if (tracked.has(d.id)) {
        // Reached a terminal state (completed / error) — close the card.
        tracked.delete(d.id);
        completeActivity(actId);
      }
    });
    // A download item removed from the list while still in flight — close it too.
    tracked.forEach((_pct, id) => {
      if (!seen.has(id)) {
        tracked.delete(id);
        completeActivity(`browser-${id}`);
      }
    });
  }, [downloads]);

  // Fast download function
  const startDownload = useCallback(async (url: string) => {
    const id = Date.now().toString();
    const fileName = url.split('/').pop() || 'download';
    
    setDownloads(prev => [...prev, {
      id,
      url,
      fileName,
      progress: 0,
      status: 'downloading',
    }]);
    setShowDownloads(true);
    
    try {
      const result = await window.electron?.invoke?.('download:start', url);
      if (result?.success) {
        setDownloads(prev => prev.map(d => 
          d.id === id 
            ? { ...d, status: 'completed', progress: 100, path: result.path, size: result.size }
            : d
        ));
      }
    } catch (err) {
      setDownloads(prev => prev.map(d => 
        d.id === id ? { ...d, status: 'error' } : d
      ));
    }
  }, []);

  const currentTab = useMemo(() => tabs.find(t => t.id === activeTab), [tabs, activeTab]);
  const activePageState = nativePageStates.get(activeTab);
  const activePageWindow = activePageState?.status === 'closed' ? undefined : activePageState;
  findPageRef.current = nativePages && activePageWindow?.status === 'open' && activePageWindow.canFind === true
    ? () => { void actOnPageWindow(activeTab, 'find'); } : null;
  const activePageError = tabErrors[activeTab] ?? (activePageWindow?.status === 'failed' ? activePageWindow.error : null);
  const canGoBack = activePageWindow ? activePageWindow.canGoBack === true : Boolean(currentTab && currentTab.navIndex > 0);
  const canGoForward = activePageWindow ? activePageWindow.canGoForward === true
    : Boolean(currentTab && currentTab.navIndex < currentTab.navHistory.length - 1);

  // Silent blocking - optimized for performance
  const shouldBlock = useCallback((url: string): boolean => {
    if (!browserSettings.blockTrackers && !browserSettings.blockAds) return false;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      // Fast O(1) Set lookup - check if exact domain or parent domain is blocked
      if (BLOCKED_DOMAINS.has(hostname)) {
        setBlockedCount(c => c + 1);
        return true;
      }
      
      // Check parent domains (e.g., ads.example.com -> example.com)
      const parts = hostname.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        const parentDomain = parts.slice(i).join('.');
        if (BLOCKED_DOMAINS.has(parentDomain)) {
          setBlockedCount(c => c + 1);
          return true;
        }
      }
      
      // Block tracking patterns (only if tracker blocking enabled)
      if (browserSettings.blockTrackers) {
        const urlLower = url.toLowerCase();
        // Only match genuinely tracking-specific patterns (avoid /tracking, /collect, /log? which break legit sites)
        if (urlLower.includes('/beacon') || 
            urlLower.includes('track.php') || 
            urlLower.includes('&_ga=')) {
          setBlockedCount(c => c + 1);
          return true;
        }
      }
    } catch { /* URL parse failed */ }
    return false;
  }, [browserSettings.blockTrackers, browserSettings.blockAds]);

  // Force HTTPS - enhanced
  const upgradeToHttps = useCallback((url: string): string => {
    if (!nativePages && !browserSettings.forceHttps) return url;
    if (url.startsWith('http://')) {
      setHttpsUpgradeCount(count => count + 1);
      return url.replace('http://', 'https://');
    }
    return url;
  }, [browserSettings.forceHttps, nativePages]);

  // Create new tab with enterprise limits
  const createTab = useCallback((background = false) => {
    if (tabsRef.current.length >= MAX_TABS) {
      console.warn(`[Browser] Max tabs (${MAX_TABS}) reached`);
      return;
    }
    
    const newTab = blankTab(background);
    
    setTabs(prev => [...prev, newTab]);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'browserTabsOpened', amount: 1 } }));
    if (!background) {
      setActiveTab(newTab.id);
      setUrlInput('');
    }
  }, []);
  createTabRef.current = createTab;

  // Pin/unpin tab
  const pinTab = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t));
  }, []);

  // Tab drag handlers for reordering
  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggingTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    // Add drag ghost image styling
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleTabDragEnd = useCallback((e: React.DragEvent) => {
    setDraggingTab(null);
    setDragOverTab(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tabId !== draggingTab) {
      setDragOverTab(tabId);
    }
  }, [draggingTab]);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const draggedTabId = e.dataTransfer.getData('text/plain');
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggingTab(null);
      setDragOverTab(null);
      return;
    }
    
    setTabs(prev => {
      const draggedIndex = prev.findIndex(t => t.id === draggedTabId);
      const targetIndex = prev.findIndex(t => t.id === targetTabId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newTabs = [...prev];
      const [draggedTab] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, draggedTab);
      return newTabs;
    });
    
    setDraggingTab(null);
    setDragOverTab(null);
  }, []);

  // Move tab to background
  const moveTabToBackground = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, background: true } : t));
  }, []);

  // Close single tab
  const removeTab = useCallback((id: string) => {
    // Cleanup refs for the closed tab to prevent memory leaks
    webviewEventsRef.current.delete(id);
    webviewSrcRef.current.delete(id);
    autofillInjectedRef.current.delete(id);
    // Remove per-tab window message listener to prevent leak
    const credHandler = credMsgHandlersRef.current.get(id);
    if (credHandler) {
      window.removeEventListener('message', credHandler);
      credMsgHandlersRef.current.delete(id);
    }
    setTabs(prev => {
      if (!prev.some(tab => tab.id === id)) return prev;
      if (prev.length === 1) {
        const next = blankTab();
        setActiveTab(next.id);
        setUrlInput('');
        return [next];
      }
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabRef.current === id) {
        const closedIndex = prev.findIndex(t => t.id === id);
        const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
        setActiveTab(newTabs[newActiveIndex].id);
        setUrlInput(newTabs[newActiveIndex].url);
      }
      return newTabs;
    });
    setTabErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
    setCrashedTabs(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const closeTab = useCallback(async (id: string) => {
    if (!nativePages) {
      removeTab(id);
      return;
    }
    if (closingTabs.current.has(id)) return;
    closingTabs.current.add(id);
    try {
      await pendingPageOpens.current.get(id);
      await nativePageAction(id, 'close');
      removeTab(id);
    } catch (error) {
      toastRef.current.error(error instanceof Error ? error.message : 'Could not close the page window.');
    } finally {
      closingTabs.current.delete(id);
    }
  }, [nativePages, removeTab]);
  closeTabRef.current = id => { void closeTab(id); };

  // Close all tabs except pinned
  const closeAllTabs = useCallback(() => {
    const pinnedTabs = tabsRef.current.filter(t => t.pinned || nativePages && hasLivePage(t.id));
    if (pinnedTabs.length > 0) {
      setTabs(pinnedTabs);
      setActiveTab(pinnedTabs[0].id);
      setUrlInput(pinnedTabs[0].url);
    } else {
      const newTab = blankTab();
      setTabs([newTab]);
      setActiveTab(newTab.id);
      setUrlInput('');
    }
    setTabErrors({});
    setCrashedTabs(new Set());
    setShowTabMenu(false);
  }, [hasLivePage, nativePages]);

  // Close all tabs to the right
  const closeTabsToRight = useCallback((id: string) => {
    setTabs(prev => {
      const index = prev.findIndex(t => t.id === id);
      if (index === -1) return prev;
      const newTabs = prev.filter((tab, position) => position <= index || tab.pinned || nativePages && hasLivePage(tab.id));
      if (!newTabs.find(t => t.id === activeTabRef.current)) {
        setActiveTab(newTabs[newTabs.length - 1].id);
        setUrlInput(newTabs[newTabs.length - 1].url);
      }
      return newTabs;
    });
  }, [hasLivePage, nativePages]);

  // Close other tabs (keep only active)
  const closeOtherTabs = useCallback(() => {
    setTabs(prev => {
      const currentActiveTab = activeTabRef.current;
      const current = prev.find(t => t.id === currentActiveTab);
      return current ? prev.filter(t => t.id === currentActiveTab || t.pinned || nativePages && hasLivePage(t.id)) : prev;
    });
    setShowTabMenu(false);
  }, [hasLivePage, nativePages]);

  // Duplicate tab
  const duplicateTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length >= MAX_TABS) return prev;
      if (prev.length >= MAX_TABS) return prev;
      const tab = prev.find(t => t.id === id);
      if (!tab) return prev;
      const newTab: Tab = {
        id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: tab.title,
        url: tab.url,
        loading: false,
        navHistory: [...(tab.navHistory || [])],
        navIndex: tab.navIndex,
        background: true,
      };
      const index = prev.findIndex(t => t.id === id);
      const newTabs = [...prev];
      newTabs.splice(index + 1, 0, newTab);
      return newTabs;
    });
  }, []);

  const navigate = useCallback((url: string) => {
    let finalUrl = url.trim();

    // Block dangerous protocols
    const lower = finalUrl.toLowerCase().replace(/\s/g, '');
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
      toast.error('Blocked: dangerous URL protocol');
      return;
    }
    
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = `https://${finalUrl}`;
      } else {
        const searchEngines: Record<string, string> = {
          duckduckgo: 'https://duckduckgo.com/?q=',
          google: 'https://www.google.com/search?q=',
          startpage: 'https://www.startpage.com/do/search?q=',
          brave: 'https://search.brave.com/search?q=',
        };
        const engine = searchEngines[searchProvider] || searchEngines.duckduckgo;
        finalUrl = `${engine}${encodeURIComponent(finalUrl)}`;
      }
    }

    finalUrl = upgradeToHttps(finalUrl);
    try {
      const parsed = new URL(finalUrl);
      if (parsed.hostname.endsWith('.onion')) {
        toast.error('Onion addresses require a verified Tor transport. DEX will not pretend this session is routed through Tor.');
        return;
      }
      if (parsed.username || parsed.password) {
        toast.error('Blocked: credentials embedded in an address can conceal the real destination.');
        return;
      }
      if (parsed.hostname.includes('xn--')) {
        window.dispatchEvent(new CustomEvent('dex-notification', { detail: {
          type: 'warning', title: 'Lookalike domain warning',
          body: 'This address uses internationalized domain encoding. Verify the destination before entering credentials.',
          source: 'Browser Security',
        }}));
      }
    } catch {
      toast.error('Blocked: invalid address');
      return;
    }
    if (shouldBlock(finalUrl)) return;

    if (!nativePages) addToHistory(finalUrl, finalUrl.slice(0, 50));
    setShowSuggestions(false);

    const currentActiveTab = activeTabRef.current;
    setCrashedTabs(prev => { const next = new Set(prev); next.delete(currentActiveTab); return next; });
    setTabErrors(prev => ({ ...prev, [currentActiveTab]: null }));

    const wv = webviewRefs.current.get(currentActiveTab);
    const isNewWebview = !wv;

    setTabs(prev => prev.map(t => {
      if (t.id === currentActiveTab) {
        const newNavHistory = [...(t.navHistory || []).slice(0, (t.navIndex || 0) + 1), finalUrl];
        return { 
          ...t, 
          url: finalUrl, 
          loading: !nativePages,
          title: finalUrl.slice(0, 30),
          navHistory: newNavHistory,
          navIndex: newNavHistory.length - 1
        };
      }
      return t;
    }));
    setUrlInput(finalUrl);

    if (nativePages) {
      void openPageWindow(currentActiveTab, finalUrl, true);
    } else if (isNewWebview) {
      // Webview will mount on next render — set stable src for initial load
      webviewSrcRef.current.set(currentActiveTab, finalUrl);
    } else {
      // Webview already exists — navigate imperatively (don't change src)
      try { wv.loadURL(finalUrl); } catch (e) { console.error('[Browser] loadURL error:', e); }
    }
  }, [shouldBlock, upgradeToHttps, searchProvider, addToHistory, nativePages, openPageWindow]);

  // Pick up search query from Spotlight (via localStorage bridge)
  useEffect(() => {
    const pending = localStorage.getItem('dex-browser-search-url');
    if (pending) {
      localStorage.removeItem('dex-browser-search-url');
      navigate(pending);
    }
  }, [navigate]);

  // Listen for dex-browser-navigate events (from AppManager spotlight routing)
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail?.url;
      if (url && typeof url === 'string') {
        navigate(url);
      }
    };
    window.addEventListener('dex-browser-navigate', handler);
    return () => window.removeEventListener('dex-browser-navigate', handler);
  }, [navigate]);

  // Listen for new-tab requests from main process (target="_blank" links, popups)
  useEffect(() => {
    const handler = (_event: any, url: string) => {
      if (url && typeof url === 'string') {
        // Create a new tab and navigate to the URL
        const newTab: Tab = {
          id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: url.slice(0, 30),
          url,
          loading: true,
          navHistory: [url],
          navIndex: 0,
        };
        webviewSrcRef.current.set(newTab.id, url);
        setTabs(prev => [...prev, newTab]);
        setActiveTab(newTab.id);
        setUrlInput(url);
      }
    };
    window.electronAPI?.on?.('browser:new-tab', handler);
    return () => { window.electronAPI?.off?.('browser:new-tab', handler); };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) navigate(urlInput);
  };

  const goHome = useCallback(() => {
    const currentActiveTab = activeTabRef.current;
    // Clear stable src so next navigate creates a fresh webview
    webviewSrcRef.current.delete(currentActiveTab);
    setTabs(prev => prev.map(t =>
      t.id === currentActiveTab
        ? { ...t, url: '', title: 'New Tab', loading: false }
        : t
    ));
    setTabErrors(prev => ({ ...prev, [currentActiveTab]: null }));
    setUrlInput('');
  }, []);

  // Navigation: Go Back
  const goBack = useCallback(() => {
    const currentActiveTab = activeTabRef.current;
    if (nativePages && hasLivePage(currentActiveTab)) {
      void actOnPageWindow(currentActiveTab, 'back');
      return;
    }
    const tab = tabsRef.current.find(t => t.id === currentActiveTab);
    if (tab && tab.navIndex > 0) {
      const newIndex = tab.navIndex - 1;
      const prevUrl = tab.navHistory[newIndex];
      setTabs(prev => prev.map(t =>
        t.id === currentActiveTab
          ? { ...t, url: prevUrl, navIndex: newIndex, loading: !nativePages, title: prevUrl.slice(0, 30) }
          : t
      ));
      setTabErrors(prev => ({ ...prev, [currentActiveTab]: null }));
      setUrlInput(prevUrl);
      const wv = webviewRefs.current.get(currentActiveTab);
      if (nativePages) void openPageWindow(currentActiveTab, prevUrl, true);
      else if (wv) { try { wv.loadURL(prevUrl); } catch (e) { console.warn('[DEX]', e); } }
    }
  }, [actOnPageWindow, hasLivePage, nativePages, openPageWindow]);

  // Navigation: Go Forward
  const goForward = useCallback(() => {
    const currentActiveTab = activeTabRef.current;
    if (nativePages && hasLivePage(currentActiveTab)) {
      void actOnPageWindow(currentActiveTab, 'forward');
      return;
    }
    const tab = tabsRef.current.find(t => t.id === currentActiveTab);
    if (tab && tab.navIndex < tab.navHistory.length - 1) {
      const newIndex = tab.navIndex + 1;
      const nextUrl = tab.navHistory[newIndex];
      setTabs(prev => prev.map(t =>
        t.id === currentActiveTab
          ? { ...t, url: nextUrl, navIndex: newIndex, loading: !nativePages, title: nextUrl.slice(0, 30) }
          : t
      ));
      setTabErrors(prev => ({ ...prev, [currentActiveTab]: null }));
      setUrlInput(nextUrl);
      const wv = webviewRefs.current.get(currentActiveTab);
      if (nativePages) void openPageWindow(currentActiveTab, nextUrl, true);
      else if (wv) { try { wv.loadURL(nextUrl); } catch (e) { console.warn('[DEX]', e); } }
    }
  }, [actOnPageWindow, hasLivePage, nativePages, openPageWindow]);

  // Navigation: Refresh current page
  const refresh = useCallback(() => {
    const currentActiveTab = activeTabRef.current;
    const tab = tabsRef.current.find(t => t.id === currentActiveTab);
    if (tab && tab.url) {
      if (nativePages) {
        if (hasLivePage(tab.id)) void actOnPageWindow(tab.id, 'reload');
        else void openPageWindow(tab.id, tab.url);
        return;
      }
      setCrashedTabs(prev => { const next = new Set(prev); next.delete(currentActiveTab); return next; });
      setTabErrors(prev => ({ ...prev, [currentActiveTab]: null }));
      setTabs(prev => prev.map(t =>
        t.id === currentActiveTab ? { ...t, loading: true } : t
      ));
      const wv = webviewRefs.current.get(currentActiveTab);
      if (wv) {
        try { wv.reload(); } catch (e) { console.warn('[DEX]', e); }
      }
    }
  }, [actOnPageWindow, hasLivePage, nativePages, openPageWindow]);
  refreshRef.current = refresh;

  const addBookmark = (folderId?: string) => {
    if (!currentTab?.url) { toast.info?.('Open a page to bookmark'); return; }
    const exists = bookmarks.some(b => b.url === currentTab.url);
    if (!exists) {
      setBookmarks([...bookmarks, {
        id: Date.now().toString(),
        title: currentTab.title,
        url: currentTab.url,
        folderId,
      }]);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'bookmarksCreated', amount: 1 } }));
      toast.success?.('Bookmarked');
    } else {
      // Already bookmarked — toggle off so the same control removes it.
      setBookmarks(prev => prev.filter(b => b.url !== currentTab.url));
      toast.info?.('Bookmark removed');
    }
  };

  const removeBookmark = (id: string) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const createBookmarkFolder = (name: string) => {
    const folder: BookmarkFolder = { id: Date.now().toString(), name };
    setBookmarkFolders(prev => [...prev, folder]);
    return folder.id;
  };

  const deleteBookmarkFolder = (folderId: string) => {
    setBookmarkFolders(prev => prev.filter(f => f.id !== folderId));
    setBookmarks(prev => prev.map(b => b.folderId === folderId ? { ...b, folderId: undefined } : b));
  };

  const moveBookmarkToFolder = (bookmarkId: string, folderId: string | undefined) => {
    setBookmarks(prev => prev.map(b => b.id === bookmarkId ? { ...b, folderId } : b));
  };

  // Group history by day
  const groupedHistory = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const thisWeek = today - 6 * 86400000;
    const buckets: Record<string, HistoryEntry[]> = { Today: [], Yesterday: [], 'This Week': [], Older: [] };
    for (const h of history.slice(0, 200)) {
      if (h.visitedAt >= today) buckets['Today'].push(h);
      else if (h.visitedAt >= yesterday) buckets['Yesterday'].push(h);
      else if (h.visitedAt >= thisWeek) buckets['This Week'].push(h);
      else buckets['Older'].push(h);
    }
    for (const label of ['Today', 'Yesterday', 'This Week', 'Older']) {
      if (buckets[label].length > 0) groups.push({ label, entries: buckets[label] });
    }
    return groups;
  }, [history]);

  // Searchable + folder-scoped bookmark list for the bookmarks panel.
  const filteredBookmarks = useMemo(() => {
    const q = bookmarkQuery.trim().toLowerCase();
    return bookmarks.filter(b => {
      if (activeBookmarkFolder && b.folderId !== activeBookmarkFolder) return false;
      if (!q) return true;
      return (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q);
    });
  }, [bookmarks, activeBookmarkFolder, bookmarkQuery]);

  const isSecure = currentTab?.url?.startsWith('https://');

  // Search suggestions from history + bookmarks
  const suggestions = useMemo(() => {
    if (!urlFocused || !urlInput || urlInput.length < 2) return [];
    const query = urlInput.toLowerCase();
    const results: { type: 'history' | 'bookmark'; title: string; url: string }[] = [];
    const seen = new Set<string>();
    for (const b of bookmarks) {
      if (results.length >= 8) break;
      if ((b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) && !seen.has(b.url)) {
        seen.add(b.url);
        results.push({ type: 'bookmark', title: b.title, url: b.url });
      }
    }
    for (const h of history) {
      if (results.length >= 8) break;
      if ((h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) && !seen.has(h.url)) {
        seen.add(h.url);
        results.push({ type: 'history', title: h.title, url: h.url });
      }
    }
    return results;
  }, [urlInput, urlFocused, bookmarks, history]);

  return (
    <div ref={browserRoot} className="dex-app-surface" style={styles.container}>
      {/* Safari-style unified bar: tabs + navigation */}
      <div className="dex-app-toolbar" style={styles.topBar}>
        {/* Navigation controls */}
        <div className="dex-control-cluster" style={styles.navControls}>
          <button
            style={{...styles.navBtn, opacity: canGoBack ? 1 : 0.4, cursor: canGoBack ? 'pointer' : 'not-allowed' }}
            onClick={goBack}
            disabled={!canGoBack}
            title="Back"
            aria-label="Go back"
          >
            {Icon.back}
          </button>
          <button
            style={{...styles.navBtn, opacity: canGoForward ? 1 : 0.4, cursor: canGoForward ? 'pointer' : 'not-allowed' }}
            onClick={goForward}
            disabled={!canGoForward}
            title="Forward"
            aria-label="Go forward"
          >
            {Icon.forward}
          </button>
        </div>

        {/* Tab Groups header bar */}
        {tabGroups.size > 0 && (
          <div style={{ display: 'flex', gap: 4, padding: '2px var(--space-2)', background: 'var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            {Array.from(tabGroups.entries()).map(([gid, group]) => (
              <div key={gid} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px var(--space-2)', borderRadius: 4, background: `${group.color}22`, cursor: 'pointer' }}
                onClick={() => { const firstTab = group.tabIds[0]; if (firstTab) setActiveTab(firstTab); }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color }} />
                <span style={{ fontSize: 10, color: group.color, fontWeight: 500 }}>{group.name} ({group.tabIds.length})</span>
                <button onClick={(e) => { e.stopPropagation(); setTabGroups(prev => { const next = new Map(prev); next.delete(gid); return next; }); }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }} aria-label={`Delete group ${group.name}`}><DexIcon name="close" size={10} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Tab strip */}
        <div aria-label="Open browser tabs" style={{ ...styles.tabStrip, ...(tabStrip.virtual ? { overflowX: 'auto', scrollbarWidth: 'thin' } : {}) }}
          ref={tabStrip.container} onScroll={tabStrip.virtual ? tabStrip.onScroll : undefined}>
          <div style={tabStrip.virtual
            ? { position: 'relative', width: tabStrip.total, height: 28, flex: '0 0 auto' }
            : { display: 'flex', minWidth: 0, gap: 2 }}>
          {tabStrip.visible.map(({ tab, left, width }) => {
            const tabGroup = Array.from(tabGroups.entries()).find(([_, g]) => g.tabIds.includes(tab.id));
            return (
            <div
              key={tab.id}
              data-browser-tab={tab.id}
              draggable={!tab.pinned}
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragEnd={handleTabDragEnd}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              onDragLeave={() => setDragOverTab(null)}
              style={{
                ...styles.tab,
                ...(tabStrip.virtual ? { position: 'absolute', left, width: width - 2, height: 28, flexShrink: 0 } : {}),
                ...(activeTab === tab.id ? styles.tabActive : {}),
                ...(tabGroup ? { borderBottom: `2px solid ${tabGroup[1].color}` } : {}),
                ...(draggingTab === tab.id ? { opacity: 0.5 } : {}),
                ...(dragOverTab === tab.id ? { borderLeft: '2px solid var(--color-accent)' } : {}),
              }}
              onClick={() => {
                setActiveTab(tab.id);
                setUrlInput(tab.url);
                setTabErrors(prev => ({ ...prev, [tab.id]: null }));
              }}
              onDoubleClick={() => pinTab(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              title={`${tab.title}\n${tab.url}${tabGroup ? `\nGroup: ${tabGroup[1].name}` : ''}`}
            >
              {tab.pinned && <span style={styles.pinDot} />}
              {tab.loading || nativePageStates.get(tab.id)?.status === 'opening' ? (
                <span style={styles.loadingDot} />
              ) : (
                tab.url?.startsWith('https://') ? (
                  <span style={styles.tabLock}>{Icon.lock}</span>
                ) : tab.url ? (
                  <span style={styles.tabGlobe}>{Icon.globe}</span>
                ) : null
              )}
              <span style={styles.tabLabel}>{tab.title || 'New Tab'}</span>
              {!tab.pinned && (activeTab === tab.id || hoveredTab === tab.id) && (
                <button
                  style={{...styles.tabCloseBtn, opacity: 0.7}}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  aria-label="Close tab"
                >
                  {Icon.close}
                </button>
              )}
            </div>
          ); })}
          </div>
        </div>
        <button style={styles.newTabBtn} onClick={() => createTab()} disabled={tabs.length >= MAX_TABS}
          title="New tab" aria-label="New tab">{Icon.plus}</button>

        {/* Right actions */}
        <div style={styles.rightActions}>
          <details style={{ position: 'relative' }}>
            <summary aria-label="Search open tabs" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>Find tab</summary>
            <div style={{ position: 'absolute', background: 'var(--color-bg-elevated)', zIndex: 20, right: 0, top: '100%', width: 280, padding: 10, border: '1px solid var(--color-border)', borderRadius: 10 }}>
              <input aria-label="Search open tabs by title or address" placeholder="Title or address" style={{ width: '100%' }} value={tabQuery} onChange={e => setTabQuery(e.target.value)} />
              <div style={{ display: 'grid', gap: 3, maxHeight: 240, overflow: 'auto' }}>
                {searchResults.slice(0, 50).map(tab => (
                  <button key={tab.id} title={tab.url} style={{ ...styles.dropdownItem, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={e => {
                    setActiveTab(tab.id);
                    setUrlInput(tab.url);
                    const menu = e.currentTarget.closest('details');
                    if (menu) menu.open = false;
                  }}>{tab.title}</button>
                ))}
                {searchResults.length === 0 && <span>No matching tabs</span>}
                {searchResults.length > 50 && <span>Refine your search to see more tabs.</span>}
              </div>
            </div>
          </details>
          <button
            style={styles.navBtn}
            onClick={() => setShowTabMenu(value => !value)}
            aria-label="Tab actions"
            aria-expanded={showTabMenu}
            title="Tab actions"
          >
            ⋯
          </button>
          {(!nativePages || nativeDownloads.supported) && <button
            style={{...styles.navBtn, position: 'relative'}}
            onClick={() => setShowDownloads(!showDownloads)}
            aria-label="Downloads"
          >
            {Icon.download}
            {(downloads.some(d => d.status === 'downloading') || nativeDownloads.items.some(item =>
              item.status === 'waiting' || item.status === 'downloading')) && <span style={styles.activeDot} />}
          </button>}
          <button
            style={{...styles.navBtn, ...(showKeychain ? { color: 'var(--color-accent)' } : {})}}
            onClick={() => setShowKeychain(p => !p)}
            title="Keychain"
            aria-label="Keychain"
          >
            {Icon.key}
          </button>
          <button
            style={{...styles.navBtn, ...(showSettings ? { color: 'var(--color-accent)' } : {})}}
            onClick={() => setShowSettings(p => !p)}
            title="Settings"
            aria-label="Browser settings"
          >
            {Icon.settings}
          </button>
        </div>
      </div>

      {/* Unified address bar with consolidated actions */}
      <div style={styles.addressBar}>
        <button style={styles.navBtnSmall} onClick={refresh} title="Reload" aria-label="Reload page">
          {currentTab?.loading ? Icon.close : Icon.refresh}
        </button>
        <form onSubmit={(e) => { handleSubmit(e); setShowSuggestions(false); }} style={styles.urlForm}>
          <div style={{ position: 'relative' }}>
            <div style={styles.urlPill}>
              {isSecure && currentTab?.url && <span style={styles.lockSmall}>{Icon.lock}</span>}
              <input
                type="text"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setShowSuggestions(true); }}
                onFocus={() => { setUrlFocused(true); if (urlInput.length >= 2) setShowSuggestions(true); }}
                onBlur={() => { setTimeout(() => { setUrlFocused(false); setShowSuggestions(false); }, 50); }}
                placeholder="Search or enter address"
                style={styles.urlInput}
                ref={urlInputRef}
              />
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="dex-liquid-glass-strong" style={styles.suggestionsDropdown}>
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.url}-${i}`}
                    style={styles.suggestionItem}
                    onMouseDown={(e) => { e.preventDefault(); navigate(s.url); setShowSuggestions(false); }}
                  >
                    <span style={styles.suggestionIcon}>
                      {s.type === 'bookmark' ? Icon.bookmark : Icon.history}
                    </span>
                    <span style={styles.suggestionInfo}>
                      <span style={styles.suggestionTitle}>{s.title}</span>
                      <span style={styles.suggestionUrl}>{s.url}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>
        <button style={styles.navBtnSmall} onClick={() => addBookmark()} aria-label="Bookmark" title="Bookmark this page">{Icon.bookmark}</button>

        {/* Per-site zoom controls — remembered per hostname */}
        {!nativePages && <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <button
            style={{ ...styles.navBtnSmall, ...(currentTab?.url ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}
            onClick={() => adjustZoom('out')}
            disabled={!currentTab?.url}
            aria-label="Zoom out"
            title="Zoom out"
          >{Icon.zoomOut}</button>
          <button
            style={{
              background: 'transparent', border: 'none', color: 'var(--color-text-secondary)',
              cursor: currentTab?.url ? 'pointer' : 'not-allowed', fontSize: 11, minWidth: 34,
              padding: '3px 2px', borderRadius: 4,
            }}
            onClick={() => adjustZoom('reset')}
            disabled={!currentTab?.url}
            aria-label="Reset zoom"
            title="Reset zoom to 100%"
          >{Math.round(activeZoom * 100)}%</button>
          <button
            style={{ ...styles.navBtnSmall, ...(currentTab?.url ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}
            onClick={() => adjustZoom('in')}
            disabled={!currentTab?.url}
            aria-label="Zoom in"
            title="Zoom in"
          >{Icon.zoomIn}</button>
        </div>}

        <button
          style={{...styles.navBtnSmall, ...(currentTab?.url ? {} : { opacity: 0.4, cursor: 'not-allowed' })}}
          onClick={sendUrlToNotes}
          disabled={!currentTab?.url}
          aria-disabled={!currentTab?.url}
          aria-label="Send link to Notes"
          title="Send link to Notes"
        >{Icon.sendToNotes}</button>
        {!nativePages && <button
          style={{...styles.navBtnSmall, ...(currentTab ? {} : { opacity: 0.4, cursor: 'not-allowed' })}}
          onClick={toggleReadingMode}
          disabled={!currentTab}
          aria-disabled={!currentTab}
          aria-label="Reading mode"
          title="Reading mode"
        >{Icon.reader}</button>}
        <button style={styles.navBtnSmall} onClick={() => setShowBookmarks(!showBookmarks)} aria-label="Bookmarks" title="Bookmarks">{Icon.bookmarkList}</button>
        <button style={styles.navBtnSmall} onClick={() => setShowHistory(!showHistory)} aria-label="History" title="History & Tools">{Icon.history}</button>
        {nativePages && activePageWindow?.canFind && <button style={styles.navBtnSmall}
          onClick={() => findPageRef.current?.()} disabled={!findPageRef.current}
          aria-label="Find in page" title="Find in page (Ctrl+F)">{Icon.search}</button>}
      </div>

      {/* Tab Menu - context menu */}
      {showTabMenu && (
        <div className="dex-liquid-glass-strong" style={styles.dropdown} onMouseLeave={() => setShowTabMenu(false)}>
          <button style={styles.dropdownItem} onClick={() => { createTab(); setShowTabMenu(false); }}>New Tab</button>
          <button style={styles.dropdownItem} onClick={() => { duplicateTab(activeTab); setShowTabMenu(false); }}>Duplicate Tab</button>
          <div style={styles.dropdownDivider} />
          <button style={styles.dropdownItem} onClick={() => { pinTab(activeTab); setShowTabMenu(false); }}>
            {tabs.find(t => t.id === activeTab)?.pinned ? 'Unpin Tab' : 'Pin Tab'}
          </button>
          <div style={styles.dropdownDivider} />
          {/* Tab Groups */}
          <button style={styles.dropdownItem} onClick={() => {
            const name = prompt('Group name:');
            if (name) { createTabGroup(name, TAB_GROUP_COLORS[tabGroups.size % TAB_GROUP_COLORS.length], [activeTab]); setShowTabMenu(false); }
          }}>Add to New Group...</button>
          {Array.from(tabGroups.entries()).map(([gid, group]) => (
            <button key={gid} style={styles.dropdownItem} onClick={() => { addTabToGroup(gid, activeTab); setShowTabMenu(false); }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: group.color, marginRight: 6 }} />
              Add to "{group.name}"
            </button>
          ))}
          <div style={styles.dropdownDivider} />
          <button style={styles.dropdownItem} onClick={closeOtherTabs} disabled={!nativePageStatesReady}>Close Other Tabs</button>
          <button style={styles.dropdownItem} onClick={() => { closeTabsToRight(activeTab); setShowTabMenu(false); }} disabled={!nativePageStatesReady}>Close Tabs to Right</button>
          <button style={{...styles.dropdownItem, color: 'var(--color-error)'}} onClick={closeAllTabs} disabled={!nativePageStatesReady}>Close All Tabs</button>
          {nativePages && <small style={{ color: 'var(--color-text-secondary)' }}>
            {nativePageStatesReady ? 'Bulk close keeps pinned tabs and open page windows.'
              : nativePageStatus === 'error' ? 'Open page windows could not be checked.' : 'Checking which page windows are open…'}
          </small>}
          {nativePageStatus === 'error' && <button type="button" style={styles.dropdownItem} onClick={retryPageStatus}>Retry window check</button>}
        </div>
      )}

      {/* History Panel – grouped by day */}
      {showHistory && (
        <div className="dex-liquid-glass-strong" style={styles.sidePanel}>
          <div style={styles.sidePanelHeader}>
            <span>History</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button style={styles.clearBtn} onClick={clearHistory} aria-label="Clear all history">Clear</button>
              <button style={styles.panelClose} onClick={() => setShowHistory(false)} aria-label="Close">{Icon.close}</button>
            </div>
          </div>
          {groupedHistory.length === 0 ? (
            <div style={styles.emptyPanel}>No browsing history</div>
          ) : (
            <div style={styles.panelList}>
              {groupedHistory.map(group => (
                <div key={group.label}>
                  <div className="dex-label-caps" style={{ padding: 'var(--space-2) var(--space-3) 4px' }}>
                    {group.label}
                  </div>
                  {group.entries.map(h => (
                    <div key={h.id} style={styles.historyRow} onClick={() => navigate(h.url)}>
                      <span style={styles.historyRowIcon}>{Icon.globe}</span>
                      <div style={styles.historyRowInfo}>
                        <span style={styles.historyRowTitle}>{h.title}</span>
                        <span style={styles.historyRowUrl}>{h.url}</span>
                      </div>
                      <span style={styles.historyRowTime}>
                        {new Date(h.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bookmarks Panel – with folders */}
      {showBookmarks && (
        <div className="dex-liquid-glass-strong" style={styles.sidePanel}>
          <div style={styles.sidePanelHeader}>
            <span>Bookmarks</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button style={styles.clearBtn} onClick={() => {
                const name = prompt('Folder name:');
                if (name) createBookmarkFolder(name);
              }} aria-label="New folder">+ Folder</button>
              <button style={styles.panelClose} onClick={() => setShowBookmarks(false)} aria-label="Close">{Icon.close}</button>
            </div>
          </div>
          {/* Bookmark search */}
          <div style={{ padding: '6px 10px 2px' }}>
            <input
              type="text"
              value={bookmarkQuery}
              onChange={e => setBookmarkQuery(e.target.value)}
              placeholder="Search bookmarks..."
              aria-label="Search bookmarks"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '5px var(--space-2)',
                borderRadius: 10, border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)',
                fontSize: 12,
              }}
            />
          </div>
          {/* Folder tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px', flexWrap: 'wrap' as const }}>
            <button
              style={{ ...styles.clearBtn, fontWeight: !activeBookmarkFolder ? 600 : 400, textDecoration: !activeBookmarkFolder ? 'underline' : 'none' }}
              onClick={() => setActiveBookmarkFolder(null)}
            >All</button>
            {bookmarkFolders.map(f => (
              <button
                key={f.id}
                style={{ ...styles.clearBtn, fontWeight: activeBookmarkFolder === f.id ? 600 : 400, textDecoration: activeBookmarkFolder === f.id ? 'underline' : 'none' }}
                onClick={() => setActiveBookmarkFolder(f.id)}
                onContextMenu={e => { e.preventDefault(); if (confirm(`Delete folder "${f.name}"?`)) deleteBookmarkFolder(f.id); }}
              >{f.name}</button>
            ))}
          </div>
          {/* Bookmarks list */}
          <div style={styles.panelList}>
            {filteredBookmarks
              .map(b => (
                <div key={b.id} style={styles.historyRow} onClick={() => navigate(b.url)}>
                  <span style={styles.historyRowIcon}>{Icon.bookmark}</span>
                  <div style={styles.historyRowInfo}>
                    <span style={styles.historyRowTitle}>{b.title}</span>
                    <span style={styles.historyRowUrl}>{b.url}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {bookmarkFolders.length > 0 && (
                      <select
                        style={{ fontSize: 10, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', padding: '1px 4px' }}
                        value={b.folderId || ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => moveBookmarkToFolder(b.id, e.target.value || undefined)}
                        aria-label="Move to folder"
                      >
                        <option value="">No folder</option>
                        {bookmarkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    )}
                    <button
                      style={{ ...styles.panelClose, fontSize: 12 }}
                      onClick={e => { e.stopPropagation(); removeBookmark(b.id); }}
                      aria-label="Remove bookmark"
                    >{Icon.close}</button>
                  </div>
                </div>
              ))}
            {filteredBookmarks.length === 0 && (
              <div style={styles.emptyPanel}>
                {bookmarkQuery
                  ? 'No bookmarks match your search'
                  : `No bookmarks${activeBookmarkFolder ? ' in this folder' : ''}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Downloads Panel */}
      {showDownloads && (
        <div className="dex-liquid-glass-strong" style={styles.downloadsPanel}>
          <div style={styles.sidePanelHeader}>
            <span>Downloads</span>
            <button style={styles.panelClose} onClick={() => setShowDownloads(false)} aria-label="Close">{Icon.close}</button>
          </div>
          {nativePages ? (nativeDownloads.items.length === 0 ? <div style={styles.emptyPanel}>No downloads yet</div>
            : nativeDownloads.items.map(item => (
              <div key={item.id} style={styles.downloadRow}>
                <span style={styles.downloadName} title={item.name}>{item.name}</span>
                <div style={styles.downloadStatus}>{item.host} · {{
                  waiting: 'Ready to save', choosing: 'Choosing location…', downloading: 'Downloading',
                  completed: 'Completed', canceled: 'Canceled', failed: 'Transfer failed',
                }[item.status]}</div>
                {item.status === 'downloading' && <progress aria-label={`Download progress for ${item.name}`}
                  max={1} value={item.total && item.total > 0 ? Math.min(1, item.received / item.total) : undefined} />}
                {item.status === 'waiting' && <button style={styles.dropdownItem}
                  onClick={() => void actOnDownload(item.id, 'save')}>Choose location</button>}
                {(item.status === 'waiting' || item.status === 'choosing' || item.status === 'downloading') &&
                  <button style={styles.dropdownItem} onClick={() => void actOnDownload(item.id, 'cancel')}>Cancel download</button>}
              </div>
            ))) : downloads.length === 0 ? (
            <div style={styles.emptyPanel}>No downloads yet</div>
          ) : (
            downloads.map(d => (
              <div key={d.id} style={styles.downloadRow}>
                <span style={styles.downloadName}>{d.fileName}</span>
                <div style={styles.downloadProgress}>
                  <div style={{
                    ...styles.downloadBar,
                    width: `${d.progress}%`,
                    background: d.status === 'error' ? 'var(--color-error)' : d.status === 'completed' ? 'var(--color-success)' : 'var(--color-accent)',
                  }} />
                </div>
                <span style={styles.downloadStatus}>
                  {d.status === 'downloading' ? `${d.progress}%` : d.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Find Bar */}
      {showFindBar && (
        <div style={styles.findBar}>
          <div style={styles.findInner}>
            {Icon.search}
            <input
              ref={findInputRef}
              type="text"
              value={findQuery}
              onChange={(e) => {
                const query = e.target.value;
                setFindQuery(query);
                const wv = webviewRefs.current.get(activeTab);
                if (wv && query) {
                  wv.findInPage(query).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch((e: unknown) => { console.warn('[DEX]', e); });
                } else if (wv && !query) {
                  wv.stopFindInPage('clearSelection');
                  setFindResults({ active: 0, total: 0 });
                }
              }}
              placeholder="Find in page..."
              style={styles.findInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const wv = webviewRefs.current.get(activeTab);
                  if (wv && findQuery) {
                    wv.findInPage(findQuery, { forward: !e.shiftKey, findNext: true }).then((result: any) => {
                      if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                    }).catch((e: unknown) => { console.warn('[DEX]', e); });
                  }
                }
              }}
            />
            {findQuery && (
              <span style={styles.findCount}>
                {findResults.total > 0 ? `${findResults.active}/${findResults.total}` : 'No results'}
              </span>
            )}
            <button
              style={styles.findNavBtn}
              onClick={() => {
                const wv = webviewRefs.current.get(activeTab);
                if (wv && findQuery) {
                  wv.findInPage(findQuery, { forward: false, findNext: true }).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch((e: unknown) => { console.warn('[DEX]', e); });
                }
              }}
              disabled={findResults.total === 0}
              aria-label="Previous match"
            >
              {Icon.chevronUp}
            </button>
            <button
              style={styles.findNavBtn}
              onClick={() => {
                const wv = webviewRefs.current.get(activeTab);
                if (wv && findQuery) {
                  wv.findInPage(findQuery, { forward: true, findNext: true }).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch((e: unknown) => { console.warn('[DEX]', e); });
                }
              }}
              disabled={findResults.total === 0}
              aria-label="Next match"
            >
              {Icon.chevronDown}
            </button>
            <button
              style={styles.findCloseBtn}
              onClick={() => {
                setShowFindBar(false);
                setFindQuery('');
                setFindResults({ active: 0, total: 0 });
                const wv = webviewRefs.current.get(activeTab);
                if (wv) wv.stopFindInPage('clearSelection');
              }}
              aria-label="Close find bar"
            >
              {Icon.close}
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="dex-liquid-glass-strong" style={styles.settingsPanel}>
          <div style={styles.sidePanelHeader}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>{nativePages ? 'Browser preferences' : 'Privacy & Security'}</span>
            <button style={styles.panelClose} onClick={() => setShowSettings(false)} aria-label="Close">{Icon.close}</button>
          </div>
          <div style={styles.settingsList}>
            {!nativePages && ([
              { key: 'blockTrackers', label: 'Block Trackers' },
              { key: 'blockAds', label: 'Block Ads' },
              { key: 'forceHttps', label: 'Force HTTPS' },
              { key: 'fingerprintProtection', label: 'Fingerprint Protection' },
              { key: 'doNotTrack', label: 'Do Not Track' },
              { key: 'clearOnExit', label: 'Clear Data on Exit' },
              { key: 'blockThirdPartyCookies', label: 'Block 3rd-Party Cookies' },
              { key: 'enableTorMode', label: 'Reduced Fingerprinting UA' },
            ] as { key: keyof BrowserSettings; label: string }[]).map(item => (
              <label key={item.key} style={styles.settingRow}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>{item.label}</span>
                <button
                  type="button"
                  aria-label={`Toggle ${item.label}`}
                  aria-pressed={Boolean(browserSettings[item.key])}
                  style={{
                    ...styles.toggleTrack,
                    background: browserSettings[item.key] ? 'var(--color-success)' : 'var(--color-bg-hover)',
                  }}
                  onClick={() => setBrowserSettings(s => ({ ...s, [item.key]: !s[item.key] }))}
                >
                  <div style={{
                    ...styles.toggleKnob,
                    transform: browserSettings[item.key] ? 'translateX(14px)' : 'translateX(0)',
                  }} />
                </button>
              </label>
            ))}
            {!nativePages && <div style={{ padding: '8px 10px', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-tertiary)', fontSize: 10.5, lineHeight: 1.45 }}>
              Reduced Fingerprinting changes the browser identity only. It does not route traffic through Tor. UKI can explain the active protections and flag risky addresses.
            </div>}
            {nativePages && <p>HTTPS pages open in separate windows from the DEX workspace.</p>}
            <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>Search Engine</span>
              <Select
                size="sm"
                options={[{ value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'google', label: 'Google' }, { value: 'startpage', label: 'Startpage' }, { value: 'brave', label: 'Brave Search' }]}
                value={searchProvider}
                onChange={v => { void saveAppPreference('browser', 'searchProvider', v).then(saved => {
                  if (!saved) toast.error('Search provider could not be saved.');
                }); }}
              />
            </div>

            {/* TrackBlock Stats */}
            {!nativePages && <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3) 0 4px', borderTop: '1px solid var(--color-border-subtle)' }}>
              <div className="dex-label-caps" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                TrackBlock Stats — This Session
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {[
                  { label: 'Requests Blocked', value: blockedCount, color: 'var(--color-text-primary)' },
                  { label: 'HTTPS Upgrades', value: httpsUpgradeCount, color: 'var(--color-text-secondary)' },
                  { label: 'Fingerprint Policy', value: browserSettings.fingerprintProtection ? 'On' : 'Off', color: 'var(--color-text-secondary)' },
                  { label: 'Cookie Policy', value: browserSettings.blockThirdPartyCookies ? 'On' : 'Off', color: 'var(--color-text-secondary)' },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: '10px var(--space-3)', borderRadius: 6, background: 'var(--color-bg-secondary)' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: stat.color }}>{stat.value.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        </div>
      )}

      {/* Keychain Panel */}
      {showKeychain && (
        <div className="dex-liquid-glass-strong" style={styles.settingsPanel}>
          <div style={styles.sidePanelHeader}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Keychain</span>
            <button style={styles.panelClose} onClick={() => setShowKeychain(false)} aria-label="Close">{Icon.close}</button>
          </div>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={() => setKeychainTab('passwords')}
              aria-label="Passwords tab"
              aria-pressed={keychainTab === 'passwords'}
              style={{
                flex: 1, padding: 'var(--space-2)', fontSize: '12px', border: 'none', cursor: 'pointer',
                background: keychainTab === 'passwords' ? 'var(--color-bg-hover)' : 'transparent',
                color: keychainTab === 'passwords' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                borderBottom: keychainTab === 'passwords' ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              Passwords ({savedPasswords.length})
            </button>
            <button
              onClick={() => setKeychainTab('cards')}
              aria-label="Cards tab"
              aria-pressed={keychainTab === 'cards'}
              style={{
                flex: 1, padding: 'var(--space-2)', fontSize: '12px', border: 'none', cursor: 'pointer',
                background: keychainTab === 'cards' ? 'var(--color-bg-hover)' : 'transparent',
                color: keychainTab === 'cards' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                borderBottom: keychainTab === 'cards' ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              Cards ({savedCards.length})
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
            {/* Passwords tab */}
            {keychainTab === 'passwords' && (
              <>
                {savedPasswords.length === 0 && (
                  <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                    No saved passwords yet. Log in to a site and DEX will offer to save.
                  </div>
                )}
                {savedPasswords.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-2)', borderRadius: '4px', marginBottom: '4px',
                    background: 'var(--color-bg-secondary)', fontSize: '12px',
                  }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.domain}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{p.username}</div>
                    </div>
                    <button
                      onClick={() => deletePassword(p.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '4px' }}
                      aria-label="Delete password"
                    >{Icon.close}</button>
                  </div>
                ))}
              </>
            )}
            {/* Cards tab */}
            {keychainTab === 'cards' && (
              <>
                {!showAddCard && (
                  <button
                    onClick={() => setShowAddCard(true)}
                    aria-label="Add payment card"
                    style={{
                      width: '100%', padding: 'var(--space-2)', marginBottom: 'var(--space-2)', borderRadius: '4px',
                      border: '1px dashed var(--color-border-subtle)', background: 'transparent',
                      color: 'var(--color-accent)', cursor: 'pointer', fontSize: '12px',
                    }}
                  >+ Add Card</button>
                )}
                {showAddCard && (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const num = (fd.get('cardNumber') as string || '').replace(/\s/g, '');
                    if (num.length < 13) return;
                    const last4 = num.slice(-4);
                    const label = (num.startsWith('4') ? 'Visa' : num.startsWith('5') ? 'MC' : 'Card') + ' ••••' + last4;
                    saveCard(label, fd.get('cardName') as string || '', num, fd.get('expiry') as string || '');
                    setShowAddCard(false);
                    e.currentTarget.reset();
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 'var(--space-3)', fontSize: '12px' }}>
                    <input name="cardName" required placeholder="Cardholder name" autoComplete="off"
                      style={{ padding: '6px var(--space-2)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: '12px' }} />
                    <input name="cardNumber" required placeholder="Card number" autoComplete="off" maxLength={19}
                      style={{ padding: '6px var(--space-2)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: '12px' }} />
                    <input name="expiry" required placeholder="MM/YY" autoComplete="off" maxLength={5}
                      style={{ padding: '6px var(--space-2)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: '12px' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="submit" aria-label="Save card" style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', background: 'var(--color-accent)', color: 'var(--color-accent-text, #fff)', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                      <button type="button" aria-label="Cancel adding card" onClick={() => setShowAddCard(false)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                    </div>
                  </form>
                )}
                {savedCards.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-2)', borderRadius: '4px', marginBottom: '4px',
                    background: 'var(--color-bg-secondary)', fontSize: '12px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.label}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{c.name} — exp {c.expiry}</div>
                    </div>
                    <button
                      onClick={() => deleteCard(c.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '4px' }}
                      aria-label="Delete card"
                    >{Icon.close}</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Save Password Prompt */}
      {savePrompt && (
        <div className="dex-liquid-glass-strong" style={{
          position: 'absolute', top: '80px', right: '12px', zIndex: 'var(--z-modal)',
          borderRadius: 'var(--radius-lg)', padding: '14px var(--space-4)', boxShadow: 'var(--pg-shadow-tooltip)',
          width: '280px', fontSize: '12px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-text-primary)' }}>Save password for {savePrompt.domain}?</div>
          <div style={{ color: 'var(--color-text-muted)', marginBottom: '10px' }}>Username: {savePrompt.username}</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={() => { savePassword(savePrompt.domain, savePrompt.username, savePrompt.password); setSavePrompt(null); }}
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', background: 'var(--color-accent)', color: 'var(--color-accent-text, #fff)', cursor: 'pointer', fontSize: '12px' }}>Save</button>
            <button onClick={() => setSavePrompt(null)}
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px' }}>Never</button>
          </div>
        </div>
      )}

      {/* Content: multi-webview architecture -- each tab has its own webview */}
      <div style={styles.content}>
        {/* New Tab page for active tab with no URL */}
        {activeTab && !currentTab?.url && (
          <div style={styles.newTabPage}>
            <div style={styles.brand}>DEX</div>
            <p style={styles.tagline}>Private browsing</p>
            <form onSubmit={handleSubmit} style={styles.searchBox}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Search the web..."
                style={styles.searchInput}
                autoFocus
              />
            </form>
            {bookmarks.length > 0 && (
              <div style={styles.favoriteGrid}>
                {bookmarks.slice(0, 12).map(b => (
                  <div
                    key={b.id}
                    style={styles.favorite}
                    onClick={() => navigate(b.url)}
                    onMouseEnter={() => setHoveredFavorite(b.id)}
                    onMouseLeave={() => setHoveredFavorite(null)}
                  >
                    <div style={styles.favIcon}>{Icon.globe}</div>
                    <span style={styles.favLabel}>{b.title.slice(0, 12)}</span>
                    <button
                      style={{ ...styles.favRemove, display: hoveredFavorite === b.id ? 'flex' : 'none' }}
                      onClick={(e) => { e.stopPropagation(); removeBookmark(b.id); }}
                      aria-label="Remove bookmark"
                      title="Remove bookmark"
                    >
                      {Icon.close}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {nativePages && currentTab?.url && (
          <div style={{ display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 12, height: '100%', padding: 20 }}>
            <p style={{ overflowWrap: 'anywhere', textAlign: 'center' }}>{currentTab.url}</p>
            {activePageError && <p role="status">{activePageError}</p>}
            {activePageWindow?.status === 'opening' && <p role="status">Loading page in its window…</p>}
            <button style={styles.errorBtn} onClick={() => void openPageWindow(currentTab.id, currentTab.url, Boolean(activePageError))}>
              {activePageError ? 'Retry opening page' : activePageWindow ? 'Show web page window' : 'Open web page window'}
            </button>
          </div>
        )}
        {!nativePages && tabs.map(tab => (tab.url && (tab.id === activeTab || !tab.background)) ? (
          <div
            key={tab.id}
            style={fullscreenTabId === tab.id ? {
              position: 'fixed',
              inset: 0,
              zIndex: 'var(--z-modal)',
              display: 'flex',
              background: 'var(--color-bg-overlay, rgba(8,8,10,0.9))',
            } : {
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTab ? 'flex' : 'none',
              background: 'transparent',
            }}
          >
            {tabErrors[tab.id] && tab.id === activeTab && (
              <div style={styles.errorOverlay}>
                <div style={styles.errorBox}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <div style={styles.errorText}>{tabErrors[tab.id]}</div>
                  <button
                    style={styles.errorBtn}
                    onClick={() => {
                      setTabErrors(prev => ({ ...prev, [tab.id]: null }));
                      setCrashedTabs(prev => { const next = new Set(prev); next.delete(tab.id); return next; });
                      const wv = webviewRefs.current.get(tab.id);
                      if (wv?.reload) wv.reload();
                    }}
                    aria-label="Reload page"
                  >
                    Reload Page
                  </button>
                  <button style={styles.errorBtnAlt} onClick={goHome} aria-label="Go home">Go Home</button>
                </div>
              </div>
            )}
            <webview
              ref={getWebviewRef(tab.id)}
              src={webviewSrcRef.current.get(tab.id) || tab.url}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: tabErrors[tab.id] && tab.id === activeTab ? 'none' : 'flex',
              }}
              {...{
                partition: 'persist:dex-browser',
                allowpopups: 'false',
                disablebackgroundthrottling: 'false',
                webpreferences: 'contextIsolation=yes, nodeIntegration=no, javascript=yes, images=yes, webSecurity=yes',
                useragent: browserSettings.enableTorMode ? REDUCED_FINGERPRINTING_USER_AGENT : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              } as Record<string, string>}
            />
          </div>
        ) : null)}

        {/* Reading Mode Overlay */}
        {readingMode && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'var(--color-bg-overlay, rgba(12,12,16,0.96))', overflowY: 'auto',
            display: 'flex', justifyContent: 'center', padding: 'var(--space-10) var(--space-5)',
          }}>
            <div style={{ maxWidth: 680, width: '100%' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
                <button
                  onClick={toggleReadingMode}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                    borderRadius: 10, padding: '6px var(--space-3)', color: 'var(--color-text-secondary)',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  {Icon.back} Exit Reading Mode
                </button>
                <button
                  onClick={sendArticleToNotes}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                    borderRadius: 10, padding: '6px var(--space-3)', color: 'var(--color-text-secondary)',
                    cursor: 'pointer', fontSize: 12,
                  }}
                  aria-label="Save article to Notes"
                  title="Save this article to Notes"
                >
                  {Icon.sendToNotes} Save to Notes
                </button>
              </div>
              <div
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: 18, lineHeight: 1.8, color: 'var(--color-text-primary)',
                }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readingContent) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// SAFARI-STYLE STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
  },

  // --- Top bar: nav + tabs + actions (Safari-style) ---
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px var(--space-2)',
    background: 'var(--pg-toolbar)',
    borderBottom: '1px solid var(--pg-border)',
    WebkitAppRegion: 'drag',
    minHeight: '34px',
  } as React.CSSProperties,
  navControls: {
    display: 'flex',
    gap: '1px',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
  navBtn: {
    background: 'var(--color-bg-hover)',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '24px',
    minHeight: '24px',
    transition: 'background 0.12s, color 0.12s',
  },
  tabStrip: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px var(--space-2)',
    borderRadius: '10px',
    cursor: 'pointer',
    maxWidth: '180px',
    minWidth: '0',
    flexShrink: 1,
    background: 'transparent',
    transition: 'background 0.12s, box-shadow 0.12s',
    position: 'relative',
  },
  tabActive: {
    background: 'var(--color-border)',
    boxShadow: 'var(--pg-shadow-chip)',
  },
  pinDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: 'var(--color-accent)',
    flexShrink: 0,
  },
  loadingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: '1.5px solid var(--color-accent)',
    borderTopColor: 'transparent',
    animation: 'spin 0.6s linear infinite',
    flexShrink: 0,
  },
  tabLock: {
    color: 'var(--color-success)',
    display: 'flex',
    flexShrink: 0,
  },
  tabGlobe: {
    color: 'var(--color-text-secondary)',
    display: 'flex',
    flexShrink: 0,
  },
  tabLabel: {
    flex: 1,
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
    fontWeight: 400,
  },
  tabCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    borderRadius: '10px',
    opacity: 1,
    transition: 'opacity 0.15s',
    flexShrink: 0,
  },
  newTabBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: '3px 5px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minWidth: '22px',
    minHeight: '22px',
    transition: 'background 0.12s, color 0.12s',
  },
  rightActions: {
    display: 'flex',
    gap: '1px',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
  activeDot: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: 'var(--color-accent)',
  },

  // --- Address bar (Safari-style toolbar) ---
  addressBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px var(--space-2) 5px',
    background: 'var(--pg-toolbar)',
    borderBottom: '1px solid var(--pg-border)',
  },
  navBtnSmall: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: '3px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    minHeight: '22px',
    transition: 'background 0.12s, color 0.12s',
  },
  urlForm: {
    flex: 1,
  },
  urlPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    padding: '4px 10px',
    transition: 'box-shadow 0.15s, background 0.15s',
    border: '1px solid var(--color-bg-hover)',
  },
  lockSmall: {
    color: 'var(--color-success)',
    display: 'flex',
    flexShrink: 0,
  },
  urlInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    fontWeight: 400,
    letterSpacing: '0.1px',
  },

  // --- Dropdown (context menu) ---
  dropdown: {
    position: 'absolute',
    top: '42px',
    left: '10px',
    borderRadius: '10px',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 9999,
    minWidth: '180px',
    padding: '6px 0',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: 'var(--space-2) var(--space-4)',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  dropdownDivider: {
    height: '1px',
    background: 'var(--color-border-subtle)',
    margin: '4px 0',
  },

  // --- Side panels (history, downloads, settings) ---
  sidePanel: {
    position: 'absolute',
    top: '76px',
    right: '12px',
    width: '320px',
    maxHeight: '420px',
    borderRadius: '12px',
    boxShadow: '0 12px 40px var(--color-shadow-strong)',
    zIndex: 9999,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  sidePanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  panelClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    padding: '2px',
    borderRadius: '10px',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-error)',
    fontSize: '11px',
    cursor: 'pointer',
  },
  emptyPanel: {
    padding: 'var(--space-6)',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  panelList: {
    flex: 1,
    overflow: 'auto',
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
    transition: 'background 0.1s',
  },
  historyRowIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
    flexShrink: 0,
  },
  historyRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyRowTitle: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyRowUrl: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyRowTime: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },

  // --- Downloads panel ---
  downloadsPanel: {
    position: 'absolute',
    top: '76px',
    right: '12px',
    width: '280px',
    borderRadius: '12px',
    boxShadow: '0 12px 40px var(--color-shadow-strong)',
    zIndex: 100,
    maxHeight: 'min(460px, calc(100% - 90px))',
    overflowY: 'auto',
  },
  downloadRow: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  downloadName: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    display: 'block',
    marginBottom: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  downloadProgress: {
    height: '3px',
    background: 'var(--color-bg-hover)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  downloadBar: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.2s',
  },
  downloadStatus: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    textTransform: 'capitalize',
  },

  // --- Find bar ---
  findBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '4px 10px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  findInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    padding: '5px var(--space-3)',
  },
  findInput: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    width: '180px',
    padding: '4px',
  },
  findCount: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
  },
  findNavBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    borderRadius: '10px',
  },
  findCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    borderRadius: '10px',
    marginLeft: '4px',
  },

  // --- Settings panel ---
  settingsPanel: {
    position: 'absolute',
    top: '76px',
    right: '12px',
    width: '280px',
    maxHeight: '460px',
    borderRadius: '12px',
    boxShadow: '0 12px 40px var(--color-shadow-strong)',
    zIndex: 200,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  settingsList: {
    padding: '6px 0',
    overflow: 'auto',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-2) 14px',
    cursor: 'pointer',
  },
  toggleTrack: {
    width: '34px',
    height: '20px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    padding: 0,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleKnob: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    background: 'var(--color-bg-elevated)',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'transform 0.2s',
    boxShadow: 'var(--pg-shadow-chip)',
  },
  selectInput: {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
  },

  // --- Content area ---
  content: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
  },

  // --- New Tab page ---
  newTabPage: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-10)',
    zIndex: 1,
    background: 'radial-gradient(ellipse at 50% 40%, var(--color-accent-soft, rgba(74,158,255,0.08)) 0%, transparent 70%)',
  },
  brand: {
    fontSize: '38px',
    fontWeight: 700,
    letterSpacing: '-1.5px',
    color: 'var(--color-text-primary)',
  },
  tagline: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
    letterSpacing: '0.2px',
  },
  searchBox: {
    width: '100%',
    maxWidth: '520px',
    marginTop: 'var(--space-6)',
  },
  searchInput: {
    width: '100%',
    padding: '11px 18px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.12s, box-shadow 0.12s',
  },
  favoriteGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-6)',
    justifyContent: 'center',
    maxWidth: '520px',
  },
  favorite: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 14px',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.12s, transform 0.08s',
    minWidth: '72px',
  },
  favIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: 'var(--color-border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
  },
  favLabel: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '72px',
  },
  favRemove: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    background: 'var(--color-bg-inset, rgba(0,0,0,0.3))',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: '2px',
    display: 'none',
    borderRadius: '50%',
    width: '16px',
    height: '16px',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Error overlay ---
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-secondary)',
    zIndex: 10,
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    padding: 'var(--space-8)',
    textAlign: 'center',
  },
  errorText: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    maxWidth: '300px',
  },
  errorBtn: {
    padding: '9px 22px',
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--color-accent-text)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'filter 0.12s',
  },
  errorBtnAlt: {
    padding: 'var(--space-2) 18px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },

  // --- Search suggestions ---
  suggestionsDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    borderRadius: '10px',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 300,
    overflow: 'hidden',
  },
  suggestionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: 'var(--space-2) 14px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  },
  suggestionIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
    flexShrink: 0,
  },
  suggestionInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  suggestionTitle: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  suggestionUrl: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};


Browser.displayName = 'Browser';
export default memo(Browser);
