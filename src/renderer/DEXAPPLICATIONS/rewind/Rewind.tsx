/**
 * DEX Rewind - Activity Logger & Search
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * DVR for your desktop day -- records active windows, clipboard,
 * file events, browser tabs. All local, no cloud, no accounts.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { DexLoader } from '../../components/LoadingStates';
import { useAppTracking } from '../../services/usePatternLearning';
import { RewindViewErrorBoundary } from './RewindViewErrorBoundary';
import { getBundledAppVersion } from '../../utils/appVersion';
import { canvasColor } from '../../utils/canvasTheme';
import DexIcon from '../../components/DexIcon';
import { DexSearchInput } from '../../styles/components';
import { useConfirm } from '../../components/ConfirmDialog';
import { buildTimeline, sessionDuration } from '../../../shared/rewind/timeline';
import { useAppLifecycle } from '../../hooks/useAppLifecycle';
import { useScheduledInterval } from '../../hooks/useScheduledWork';
import { groupSessionsByDay, describeSession, formatDuration } from '../../../shared/rewind/timelineView';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { resolveRecallDate } from '../../../shared/rewind/recall';
import { spaceAt } from '../../store/stageActivityLog';
import { STAGE_KIND_META, type StageKind } from '../../store/stageStore';

// ===========================================================================
// TYPES
// ===========================================================================

interface RewindEntry {
  id: string;
  type: 'app' | 'clipboard' | 'file' | 'browser' | 'dex' | 'screenshot';
  content: string;
  appName: string;
  timestamp: number;
  metadata: Record<string, any>;
}

interface RewindSettings {
  isRecording: boolean;
  retentionDays: number;
  excludedApps: string[];
  trackClipboard: boolean;
  trackFiles: boolean;
  trackApps: boolean;
  trackBrowser: boolean;
  pollIntervalMs: number;
  screenshotsEnabled: boolean;
  screenshotIntervalMin: number;
  aiSearchEnabled: boolean;
  aiModel: string;
  themeName?: RewindThemeName;
  customTheme?: { background: string; surface: string; accent: string; text: string; muted: string };
  lastSeenReleaseNotesVersion?: string;
}

interface DaySummary {
  date: string;
  totalEntries: number;
  byType: Record<string, number>;
  topApps: { name: string; count: number }[];
  hours: number[];
}

interface StorageInfo {
  totalFiles: number;
  totalEntries: number;
  totalSizeBytes: number;
  oldestDate: string | null;
  newestDate: string | null;
}

interface ScreenshotRecord {
  id: string;
  filepath: string;
  timestamp: number;
  activeApp: string;
}

interface SmartSummary {
  id: string;
  date: string;
  statsJson: string;
  aiSummary: string | null;
  createdAt: number;
}



interface WorkspaceProfile {
  id: string;
  name: string;
  definingApps: string[];
  notificationPreference: 'normal' | 'quiet' | 'silent';
  autoSuggestFocus: boolean;
  distractions: string[];
  autoDeleteWindowDays: number | null;
}

// ===========================================================================
// HELPERS
// ===========================================================================

const dex = window.dex;

const TYPE_COLORS: Record<string, string> = {
  app: 'var(--color-accent)',
  clipboard: 'var(--color-warning)',
  file: 'var(--color-success)',
  browser: '#5e5ce6',
  dex: '#bf5af2',
  screenshot: '#ff375f',
};

const TYPE_LABELS: Record<string, string> = {
  app: 'App',
  clipboard: 'Clipboard',
  file: 'File',
  browser: 'Browser',
  dex: 'DEX',
  screenshot: 'Screenshot',
};

const TYPE_SHORT: Record<string, React.ReactNode> = {
  app: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="3"/><path d="M2 6h12"/><circle cx="4.5" cy="4" r="0.7" fill="currentColor" stroke="none"/><circle cx="6.8" cy="4" r="0.7" fill="currentColor" stroke="none"/></svg>,
  clipboard: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="3" y="2" width="10" height="12" rx="2"/><path d="M6 2V1.5a1 1 0 012 0V2"/><path d="M6 7h4M6 10h3"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M9 2v4h4"/></svg>,
  browser: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/><path d="M8 2a10 10 0 010 12M8 2a10 10 0 000 12"/></svg>,
  dex: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 8l2 2 2-2"/></svg>,
  screenshot: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="8" cy="8" r="2.5"/><path d="M5 3V2h2"/></svg>,
};

type RewindThemeName = 'dark' | 'darker' | 'light' | 'high-contrast' | 'custom';

const THEME_PRESETS: Record<Exclude<RewindThemeName, 'custom'>, {
  background: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
}> = {
  dark: {
    background: '#0D0D0D',
    surface: '#18181B',
    accent: 'var(--color-accent)',
    text: '#F4F4F6',
    muted: '#9A9AA1',
  },
  darker: {
    background: 'var(--color-bg-base)',
    surface: '#151517',
    accent: 'var(--color-accent)',
    text: '#F4F4F6',
    muted: '#92929A',
  },
  light: {
    background: '#f5f5f5',
    surface: 'var(--color-text-primary)',
    accent: 'var(--color-accent)',
    text: '#1e1e1e',
    muted: '#888888',
  },
  'high-contrast': {
    background: '#000000',
    surface: '#141414',
    accent: 'var(--color-text-primary)',
    text: 'var(--color-text-primary)',
    muted: '#D4D4D8',
  },
};

function applyThemeVars(theme: {
  background: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
}) {
  // Only set Rewind-scoped CSS vars -- NEVER mutate global design-system tokens
  const root = document.documentElement;
  root.style.setProperty('--rewind-bg', theme.background);
  root.style.setProperty('--rewind-surface', theme.surface);
  root.style.setProperty('--rewind-accent', theme.accent);
  root.style.setProperty('--rewind-text', theme.text);
  root.style.setProperty('--rewind-muted', theme.muted);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

import { formatBytes } from '../../../shared/format/units';
import { keyEventForApp } from '../../shell/input/appKeyScope';
import { persistOrWarn } from '../../utils/persistOrWarn';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateStrFromTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ===========================================================================
// NAV ITEMS
// ===========================================================================

// Native Rewind channels answer null when a feature has nothing yet (fresh
// profile, unported channel). List state must stay a list, or render crashes
// on .map (seen in the built app: plugin commands).
const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

type View = 'overview' | 'timeline' | 'search' | 'journal' | 'settings';

interface JournalEntry {
  id: string;
  timestamp: number;
  title: string;
  body: string;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible';
  tags: string[];
  pinned: boolean;
  linkedActivities: string[];
}

const MOOD_MAP: Record<JournalEntry['mood'], { label: string; color: string }> = {
  great:   { label: 'Great',   color: 'var(--color-success)' },
  good:    { label: 'Good',    color: 'var(--color-accent)' },
  neutral: { label: 'Neutral', color: 'var(--color-text-tertiary)' },
  bad:     { label: 'Bad',     color: 'var(--color-warning)' },
  terrible:{ label: 'Terrible',color: 'var(--color-error)' },
};

const NAV_ITEMS: { id: View; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'overview', label: 'Overview' },
  { id: 'search', label: 'Search' },
  { id: 'journal', label: 'Journal' },
  { id: 'settings', label: 'Settings' },
];

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

const Rewind: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm();
  useAppTracking('rewind');

  // -- State --
  const [view, setView] = useState<View>('overview');
  const [isRecording, setIsRecording] = useState(true);
  const [timeline, setTimeline] = useState<RewindEntry[]>([]);
  const [searchResults, setSearchResults] = useState<RewindEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [settings, setSettings] = useState<RewindSettings | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [newExclude, setNewExclude] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Phase 2 State
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([]);
  const [screenshotData, setScreenshotData] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [smartSummary, setSmartSummary] = useState<SmartSummary | null>(null);
  const [weekSummaries, setWeekSummaries] = useState<SmartSummary[]>([]);

  const [screenshotStorage, setScreenshotStorage] = useState<{ totalSizeBytes: number; totalCount: number } | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Journal state - load from localStorage on mount
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    try {
      const saved = localStorage.getItem('dex-rewind-journal');
      if (saved) return JSON.parse(saved);
    } catch { /* corrupted data */ }
    return [];
  });
  const [journalDraft, setJournalDraft] = useState({ title: '', body: '', mood: 'neutral' as JournalEntry['mood'], tags: '' });
  const [journalEditing, setJournalEditing] = useState<string | null>(null);
  const [journalFilter, setJournalFilter] = useState<'all' | 'pinned'>('all');
  const [journalSearch, setJournalSearch] = useState('');

  // -- uki context: let the assistant know Rewind's active view + recording state
  // and journal size (UKI Workspace Awareness initiative). Mirrors the
  // Notes/Tasks/Files/Gallery resolvers; a latest-value ref reads live state.
  const ukiCtxRef = useRef({ view, isRecording, journalCount: journalEntries.length });
  useEffect(() => { ukiCtxRef.current = { view, isRecording, journalCount: journalEntries.length }; });
  useEffect(() => {
    registerUkiAppContext('rewind', () => {
      const c = ukiCtxRef.current;
      return {
        appId: 'rewind',
        currentFile: `Rewind: ${c.view}`,
        custom: { view: c.view, recording: c.isRecording, journalEntries: c.journalCount },
      };
    });
    // Cross-session recall: UKI reads the persisted Rewind history for a day so it
    // can answer "what did I work on last Thursday" / "continue last week".
    registerUkiAppAction('rewind', {
      id: 'rewind.recall',
      description: 'recall what the user worked on around a day ("last thursday", "yesterday", "2026-06-25") by reading the Rewind activity history — for cross-session continuity.',
      args: [{ name: 'when', type: 'string' }],
      example: '{"when":"last thursday"}',
      mutates: false,
    }, async (args) => {
      const when = String(args.when ?? '').trim();
      const date = resolveRecallDate(when, new Date());
      if (!date) return `I couldn't read the date "${when}". Try "yesterday", "last thursday", or a date like 2026-06-25.`;
      const rw = (window as unknown as { dex?: { rewind?: { getSmartSummary?: (d: string) => Promise<unknown> } } }).dex?.rewind;
      if (!rw?.getSmartSummary) return "Rewind activity history isn't available in this build.";
      try {
        const ss = (await rw.getSmartSummary(date)) as { aiSummary?: string; summary?: string; totalEntries?: number } | null;
        if (!ss) return `No recorded activity for ${date}.`;
        const summary = ss.aiSummary || ss.summary || (ss.totalEntries != null ? `${ss.totalEntries} recorded events` : '');
        return summary ? `${date}: ${summary}` : `There is recorded activity on ${date}, but no summary is available.`;
      } catch {
        return `Could not load Rewind activity for ${date}.`;
      }
    });
    return () => {
      unregisterUkiAppContext('rewind');
      unregisterUkiAppAction('rewind.recall');
    };
  }, []);

  // Persist journal entries on change (debounced flush)
  const journalFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (journalFlushTimer.current) clearTimeout(journalFlushTimer.current);
    journalFlushTimer.current = setTimeout(() => {
      try { persistOrWarn('dex-rewind-journal', JSON.stringify(journalEntries), 'your Rewind journal'); } catch { /* serialisation failed */ }
    }, 500);
    return () => { if (journalFlushTimer.current) clearTimeout(journalFlushTimer.current); };
  }, [journalEntries]);

  // Profile state
  const [username, setUsername] = useState('User');
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [profileDropdown, setProfileDropdown] = useState(false);
  const [aboutModal, setAboutModal] = useState(false);

  // Phase 4 state
  const [backendStatus, setBackendStatus] = useState<Record<string, any> | null>(null);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [integrityWarning, setIntegrityWarning] = useState(false);
  const [auditLog, setAuditLog] = useState<{ id?: string; action?: string; timestamp?: number; detail?: string; user?: string }[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Phase 5 state
  const [crashRecovery, setCrashRecovery] = useState<Record<string, any> | null>(null);
  const [workspaceProfiles, setWorkspaceProfiles] = useState<WorkspaceProfile[]>([]);
  const [activeWorkspaceProfile, setActiveWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileApps, setNewProfileApps] = useState('');
  const [backupSettings, setBackupSettings] = useState<any>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingExcludedApps, setOnboardingExcludedApps] = useState<string[]>(['Banking App', '1Password', 'Bitwarden']);
  const [onboardingExcludeInput, setOnboardingExcludeInput] = useState('');
  const [onboardingScreenshots, setOnboardingScreenshots] = useState(false);

  const [onboardingAutoDelete, setOnboardingAutoDelete] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsTab, setAnalyticsTab] = useState<'productivity' | 'appUsage' | 'patterns' | 'focusHistory'>('productivity');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandSearchResults, setCommandSearchResults] = useState<RewindEntry[]>([]);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const productivityCanvasRef = useRef<HTMLCanvasElement>(null);
  const appDonutCanvasRef = useRef<HTMLCanvasElement>(null);
  const patternHeatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const focusTrendCanvasRef = useRef<HTMLCanvasElement>(null);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [pluginCommands, setPluginCommands] = useState<Array<{ pluginId: string; name: string }>>([]);
  const [themeName, setThemeName] = useState<RewindThemeName>('dark');
  const [customTheme, setCustomTheme] = useState({
    background: 'var(--color-bg-elevated)',
    surface: '#2d2d2d',
    accent: 'var(--color-accent)',
    text: '#F4F4F6',
    muted: '#9A9AA1',
  });
  const [backgroundErrorBanner, setBackgroundErrorBanner] = useState<{ message: string; timestamp: number } | null>(null);
  const [todayLogs, setTodayLogs] = useState('');
  const [releaseNotesModal, setReleaseNotesModal] = useState<{ version: string; notes: string } | null>(null);

  // Overview sub-state (lifted from renderOverview to avoid hooks-in-conditional-function)
  const [overviewSection, setOverviewSection] = useState<'timeline' | 'search'>('timeline');
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [shotsExpanded, setShotsExpanded] = useState(false);

  // UKI Memory state
  const [ukiMemories, setUkiMemories] = useState<any[]>([]);
  const [ukiMemoryQuery, setUkiMemoryQuery] = useState('');
  const [ukiMemoryStats, setUkiMemoryStats] = useState<any>(null);
  const [ukiMemoryLoading, setUkiMemoryLoading] = useState(false);

  // -- Load data --
  const loadTimeline = useCallback(async () => {
    if (!dex?.rewind) return;
    setLoading(true);
    try {
      const entries = await dex.rewind.getTimeline(selectedDate, filterType === 'all' ? undefined : filterType);
      setTimeline(entries || []);
    } catch (e) {
      console.warn('[Rewind] Timeline load error:', e);
      setBackgroundErrorBanner({ message: 'Some timeline data could not be loaded', timestamp: Date.now() });
    }
    setLoading(false);
  }, [selectedDate, filterType]);

  const loadSummary = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const s = await dex.rewind.getDaySummary(selectedDate);
      setSummary(s);
    } catch (e) {
      console.warn('[Rewind] Summary load error:', e);
    }
  }, [selectedDate]);

  const loadSettings = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const s = await dex.rewind.getSettings();
      setSettings(s);
      setIsRecording(s.isRecording);
      const nextTheme = (s.themeName || 'dark') as RewindThemeName;
      const nextCustom = s.customTheme || customTheme;
      setThemeName(nextTheme);
      setCustomTheme(nextCustom);
      if (nextTheme === 'custom') applyThemeVars(nextCustom);
      else applyThemeVars(THEME_PRESETS[nextTheme as Exclude<RewindThemeName, 'custom'>] || THEME_PRESETS.dark);
    } catch (e) {
      console.warn('[Rewind] Settings load error:', e);
    }
  }, [customTheme]);

  const loadStorageInfo = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const info = await dex.rewind.getStorageInfo();
      setStorageInfo(info);
    } catch (e) {
      console.warn('[Rewind] Storage info error:', e);
    }
  }, []);

  const loadScreenshots = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const ss = await dex.rewind.getScreenshots(selectedDate);
      setScreenshots(ss || []);
      const dataMap: Record<string, string> = {};
      for (const s of (ss || []).slice(0, 20)) {
        try {
          const data = await dex.rewind.getScreenshotData(s.filepath);
          if (data) dataMap[s.id] = data;
        } catch (e) { console.warn('[Rewind] Screenshot data load failed:', e); }
      }
      setScreenshotData(prev => ({ ...prev, ...dataMap }));
    } catch (e) {
      console.warn('[Rewind] Screenshots load error:', e);
    }
  }, [selectedDate]);

  const loadSmartSummary = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const ss = await dex.rewind.getSmartSummary(selectedDate);
      setSmartSummary(ss);
      const week = await dex.rewind.getWeekSummaries();
      setWeekSummaries(week || []);
    } catch (e) {
      console.warn('[Rewind] Smart summary load error:', e);
    }
  }, [selectedDate]);



  const loadScreenshotStorage = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      const info = await dex.rewind.getScreenshotStorageInfo();
      setScreenshotStorage(info);
    } catch (e) {
      console.warn('[Rewind] Screenshot storage error:', e);
    }
  }, []);

  const loadPhase5 = useCallback(async () => {
    if (!dex?.rewind) return;
    try {
      if (dex.rewind.getCrashRecoveryStatus) {
        setCrashRecovery(await dex.rewind.getCrashRecoveryStatus());
      }
      if (dex.rewind.getWorkspaceProfiles) {
        setWorkspaceProfiles(asList(await dex.rewind.getWorkspaceProfiles()));
      }
      if (dex.rewind.getActiveWorkspaceProfile) {
        setActiveWorkspaceProfile(await dex.rewind.getActiveWorkspaceProfile());
      }
      if (dex.rewind.getBackupSettings) {
        setBackupSettings(await dex.rewind.getBackupSettings());
      }
      if (dex.rewind.getOnboardingState != null) {
        // Onboarding auto-completed -- first-launch hint handles new users
        setOnboardingCompleted(true);
      }
      if (dex.rewind.getPlugins) {
        setPlugins(asList(await dex.rewind.getPlugins()));
      }
      if (dex.rewind.getPluginCommands) {
        setPluginCommands(asList(await dex.rewind.getPluginCommands()));
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Rewind] Phase 5 load error:', e);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!dex?.rewind?.getAnalyticsSnapshot) return;
    try {
      const snapshot = await dex.rewind.getAnalyticsSnapshot();
      setAnalytics(snapshot);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Rewind] Analytics load error:', e);
    }
  }, []);

  useEffect(() => {
    loadTimeline();
    loadSummary();
    loadSettings();
    // Load profile info
    if (dex?.rewind?.getUsername) {
      dex.rewind.getUsername().then((u: string) => setUsername(u || 'User')).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    if (dex?.rewind?.getAppVersion) {
      dex.rewind.getAppVersion().then((v: string) => setAppVersion(v || getBundledAppVersion())).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    // Phase 4: initial session lock and integrity check
    if (dex?.rewind?.isSessionLocked) {
      dex.rewind.isSessionLocked().then((locked: boolean) => setSessionLocked(locked)).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    if (dex?.rewind?.getSecurityStatus) {
      dex.rewind.getSecurityStatus().then((s: { lastIntegrityCheck?: { passed: boolean } }) => {
        if (s?.lastIntegrityCheck && !s.lastIntegrityCheck.passed) {
          setIntegrityWarning(true);
        }
      }).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    loadPhase5();
  }, [loadTimeline, loadSummary, loadSettings, loadPhase5]);

  // App lifecycle: pause all background polling when Rewind is not on screen,
  // so it consumes nothing while idle/backgrounded and resumes on return.
  const lifecyclePhase = useAppLifecycle('rewind', {});

  // Auto-refresh timeline every 30s — routed through the FrameScheduler so the
  // (potentially large) reload runs inside the per-tier frame budget instead of
  // blocking the UI, and pauses entirely while Rewind is off-screen.
  useScheduledInterval(loadTimeline, 30000, {
    appId: 'rewind',
    priority: 'idle',
    enabled: lifecyclePhase === 'foreground',
  });

  // Auto-refresh backend status every 2s (always-on, silent)
  useEffect(() => {
    const loadStatus = async () => {
      if (!dex?.rewind?.getBackendStatus) return;
      try {
        const status = await dex.rewind.getBackendStatus();
        setBackendStatus(status);
        if (status?.activeProfile) {
          setActiveWorkspaceProfile(status.activeProfile);
        }
        if (status?.backup) {
          setBackupSettings(status.backup);
        }
      } catch (e) { if (import.meta.env.DEV) console.warn('[Rewind] Status load failed:', e); }
    };
    if (lifecyclePhase === 'foreground') {
      loadStatus();
      const timer = setInterval(loadStatus, 10000);
      return () => clearInterval(timer);
    }
  }, [lifecyclePhase]);

  // Auto-refresh analytics every 60s (always-on, silent)
  useEffect(() => {
    if (lifecyclePhase !== 'foreground') return;
    loadAnalytics();
    const timer = setInterval(loadAnalytics, 120 * 1000);
    return () => clearInterval(timer);
  }, [loadAnalytics, lifecyclePhase]);

  // Phase 4: poll session lock state every 5s
  useEffect(() => {
    const check = async () => {
      if (!dex?.rewind?.isSessionLocked) return;
      try {
        const locked = await dex.rewind.isSessionLocked();
        setSessionLocked(locked);
      } catch (e) { if (import.meta.env.DEV) console.warn('[Rewind] Session lock check failed:', e); }
    };
    if (lifecyclePhase !== 'foreground') return;
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [lifecyclePhase]);

  useEffect(() => {
    if (lifecyclePhase !== 'foreground') return;
    const timer = setInterval(() => {
      loadPhase5();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadPhase5, lifecyclePhase]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'rewind')) return; // key meant for another app
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        setCommandQuery('');
        setCommandIndex(0);
        setCommandSearchResults([]);
      }

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (profileDropdown) {
          setProfileDropdown(false);
          return;
        }
        if (aboutModal) {
          setAboutModal(false);
          return;
        }
        if (lightboxUrl) {
          setLightboxUrl(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, profileDropdown, aboutModal, lightboxUrl]);

  useEffect(() => {
    if (!dex?.rewind?.onBackgroundError) return;
    const cb = (payload: { message: string; timestamp: number }) => setBackgroundErrorBanner(payload);
    dex.rewind.onBackgroundError(cb);
    return () => dex.rewind.offBackgroundError?.(cb);
  }, []);

  // No update check here: the shell's update notice and Settings > Updates own
  // that (this one ran a network check on every open and rendered nothing).

  useEffect(() => {
    const updates = window.dex?.updates;
    if (!updates?.onInstalled) return;
    const onInstalled = async (payload: { version: string }) => {
      if (settings && settings.lastSeenReleaseNotesVersion === payload.version) return;
      const details = await updates.getReleaseNotesForVersion?.(payload.version);
      setReleaseNotesModal({ version: payload.version, notes: details?.notes || '' });
    };
    updates.onInstalled(onInstalled);
    return () => updates.offInstalled?.(onInstalled);
  }, [settings]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const focusTimer = setTimeout(() => commandInputRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!analytics) return;

    const drawBars = () => {
      const canvas = productivityCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const points = analytics?.productivity?.dailyActiveHours30d || [];
      const max = Math.max(1, ...points.map((p: { hours?: number }) => p.hours || 0));
      const barW = Math.max(3, Math.floor(width / Math.max(1, points.length)) - 2);

      points.forEach((p: { hours?: number }, i: number) => {
        const h = Math.round(((p.hours || 0) / max) * (height - 20));
        const x = i * (barW + 2);
        const y = height - h;
        ctx.fillStyle = 'rgba(74,158,255,0.8)';
        ctx.fillRect(x, y, barW, h);
      });
    };

    const drawDonut = () => {
      const canvas = appDonutCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const items = analytics?.appUsage?.donutTop8 || [];
      const total = items.reduce((sum: number, item: { totalMinutes?: number }) => sum + (item.totalMinutes || 0), 0) || 1;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 8;
      const inner = radius * 0.6;
      const colors = ['var(--color-accent)', '#5e5ce6', 'var(--color-success)', 'var(--color-warning)', '#ff375f', '#64d2ff', '#bf5af2', 'var(--color-text-tertiary)'];
      let angle = -Math.PI / 2;
      items.forEach((item: { totalMinutes?: number }, i: number) => {
        const slice = ((item.totalMinutes || 0) / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        angle += slice;
      });
      ctx.beginPath();
      ctx.fillStyle = 'rgba(20,20,22,1)';
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHeatmap = () => {
      const canvas = patternHeatmapCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const heatmap = analytics?.patterns?.heatmap || [];
      const rows = 7;
      const cols = 24;
      const w = canvas.width / cols;
      const h = canvas.height / rows;
      const max = Math.max(1, ...heatmap.flatMap((r: number[]) => r || [0]));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = (heatmap[r]?.[c] || 0) / max;
          const alpha = Math.max(0.08, val);
          ctx.fillStyle = `rgba(74,158,255,${alpha})`;
          ctx.fillRect(c * w + 1, r * h + 1, w - 2, h - 2);
        }
      }
    };

    const drawLine = () => {
      const canvas = focusTrendCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const points = analytics?.focusHistory?.focusScoreTrend || [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!points.length) return;
      // Canvas 2D ignores var() colors — resolve the token to a literal
      ctx.strokeStyle = canvasColor('--color-success');
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point: { score?: number }, i: number) => {
        const x = (i / Math.max(1, points.length - 1)) * (canvas.width - 20) + 10;
        const y = canvas.height - ((point.score || 0) / 100) * (canvas.height - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawBars();
    drawDonut();
    drawHeatmap();
    drawLine();
  }, [analytics, analyticsTab]);

  // -- Actions --
  const toggleRecording = async () => {
    if (!dex?.rewind) return;
    const newState = await dex.rewind.toggleRecording();
    setIsRecording(newState);
  };

  const doSearch = async () => {
    if (!dex?.rewind || !searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await dex.rewind.search(searchQuery, 30);
      setSearchResults(results || []);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Rewind] Search error:', e);
    }
    setLoading(false);
  };

  const updateSetting = async (key: string, value: any) => {
    if (!dex?.rewind) return;
    const updated = await dex.rewind.updateSettings({ [key]: value });
    setSettings(updated);
    if (key === 'isRecording') setIsRecording(value);

    if (key === 'themeName') {
      const nextTheme = value as RewindThemeName;
      setThemeName(nextTheme);
      if (nextTheme === 'custom') applyThemeVars(customTheme);
      else applyThemeVars(THEME_PRESETS[nextTheme as Exclude<RewindThemeName, 'custom'>] || THEME_PRESETS.dark);
    }
    if (key === 'customTheme') {
      setCustomTheme(value);
      if (themeName === 'custom') applyThemeVars(value);
    }
  };

  const deleteAllData = async () => {
    if (!dex?.rewind) return;
    const ok = await confirm({
      title: 'Delete all Rewind data?',
      message: 'This will permanently remove every captured screenshot, transcript, and journal entry. This cannot be undone.',
      confirmLabel: 'Delete everything',
      tone: 'destructive',
    });
    if (!ok) return;
    await dex.rewind.deleteAllData();
    setTimeline([]);
    setSearchResults([]);
    setSummary(null);
    setScreenshots([]);
    setSmartSummary(null);
    setWeekSummaries([]);
    loadStorageInfo();
    loadScreenshotStorage();
  };

  const addExclusion = () => {
    if (!newExclude.trim() || !settings) return;
    const updated = [...(settings.excludedApps || []), newExclude.trim()];
    updateSetting('excludedApps', updated);
    setNewExclude('');
  };

  const removeExclusion = (app: string) => {
    if (!settings) return;
    const updated = (settings.excludedApps || []).filter(a => a !== app);
    updateSetting('excludedApps', updated);
  };

  const captureScreenshotNow = async () => {
    if (!dex?.rewind) return;
    await dex.rewind.captureScreenshotNow();
    loadScreenshots();
  };

  const generateSummaryNow = async () => {
    if (!dex?.rewind) return;
    setGeneratingSummary(true);
    try {
      await dex.rewind.generateSummaryNow(selectedDate);
      await loadSmartSummary();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Rewind] Summary generation error:', e);
    }
    setGeneratingSummary(false);
  };

  const exportSummary = async () => {
    if (!dex?.rewind) return;
    try {
      const text = await dex.rewind.exportSummary(selectedDate);
      if (text) navigator.clipboard.writeText(text);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Rewind] Export error:', e);
    }
  };

  const openScreenshotsFolder = async () => {
    if (!dex?.rewind) return;
    await dex.rewind.openScreenshotsFolder();
  };

  const loadScreenshotFullRes = async (record: ScreenshotRecord) => {
    if (!dex?.rewind) return;
    try {
      const data = await dex.rewind.getScreenshotData(record.filepath);
      if (data) setLightboxUrl(data);
    } catch (e) { if (import.meta.env.DEV) console.warn('[Rewind] Full-res screenshot load failed:', e); }
  };

  const shiftDate = (offset: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSelectedDate(ds);
  };

  const restoreCrashedSession = useCallback(async () => {
    if (!dex?.rewind?.restoreCrashedSession) return;
    const result = await dex.rewind.restoreCrashedSession();
    if (result?.restored) {
      await loadSettings();
      await loadTimeline();
      setCrashRecovery({ ...(crashRecovery || {}), hasUncleanExit: false, dismissed: true, restored: true });
    }
  }, [dex, crashRecovery, loadSettings, loadTimeline]);

  // Auto-restore crashed session (moved from inline IIFE to avoid setState during render)
  useEffect(() => {
    if (crashRecovery?.hasUncleanExit && !crashRecovery?.dismissed) {
      restoreCrashedSession();
    }
  }, [crashRecovery?.hasUncleanExit, crashRecovery?.dismissed, restoreCrashedSession]);

  const dismissCrashRecovery = async () => {
    if (!dex?.rewind?.dismissCrashRecovery) return;
    await dex.rewind.dismissCrashRecovery();
    setCrashRecovery({ ...(crashRecovery || {}), dismissed: true });
  };

  const createWorkspaceProfile = async () => {
    if (!dex?.rewind?.saveWorkspaceProfile || !newProfileName.trim()) return;
    const definingApps = newProfileApps.split(',').map(v => v.trim()).filter(Boolean);
    await dex.rewind.saveWorkspaceProfile({
      name: newProfileName.trim(),
      definingApps,
      notificationPreference: 'normal',
      autoSuggestFocus: false,
      distractions: [],
      autoDeleteWindowDays: null,
    });
    setNewProfileName('');
    setNewProfileApps('');
    await loadPhase5();
  };

  const removeWorkspaceProfile = async (profileId: string) => {
    if (!dex?.rewind?.deleteWorkspaceProfile) return;
    await dex.rewind.deleteWorkspaceProfile(profileId);
    await loadPhase5();
  };

  const runBackupNow = async () => {
    if (!dex?.rewind?.runBackupNow) return;
    await dex.rewind.runBackupNow();
    await loadPhase5();
  };

  const chooseBackupFolder = async () => {
    if (!dex?.rewind?.pickBackupFolder) return;
    await dex.rewind.pickBackupFolder();
    await loadPhase5();
  };

  const restoreFromBackup = async () => {
    if (!dex?.rewind?.restoreBackupFromPicker) return;
    await dex.rewind.restoreBackupFromPicker();
  };

  const executePaletteCommand = async (id: string) => {
    if (!dex?.rewind) return;

    if (id.startsWith('nav:')) {
      const target = id.replace('nav:', '') as View;
      const validViews: View[] = ['timeline', 'overview', 'search', 'journal', 'settings'];
      if (validViews.includes(target)) {
        setView(target);
      }
      setCommandPaletteOpen(false);
      return;
    }

    switch (id) {
      case 'pause-recording':
        if (isRecording) await toggleRecording();
        break;
      case 'resume-recording':
        if (!isRecording) await toggleRecording();
        break;
      case 'start-focus': {
        if (dex?.rewind?.startFocusSession) await dex.rewind.startFocusSession('Focus session');
        break;
      }
      case 'end-focus':
        if (dex?.rewind?.endFocusSession) await dex.rewind.endFocusSession();
        break;
      case 'generate-today-summary':
        await dex.rewind.generateSummaryNow(todayStr());
        break;
      case 'export-daily-report':
        await exportSummary();
        break;
      case 'export-weekly-report': {
        const week = await dex.rewind.getWeekSummaries();
        if (week && week.length > 0) {
          const plain = week.map((w: { date: string; aiSummary?: string }) => `${w.date}: ${w.aiSummary || 'No summary'}`).join('\n');
          await navigator.clipboard.writeText(plain);
        }
        break;
      }
      case 'open-backup-folder':
        await chooseBackupFolder();
        break;
      case 'run-backup-now':
        await runBackupNow();
        break;
      case 'clear-clipboard-history':
        setTimeline(prev => prev.filter(e => e.type !== 'clipboard'));
        break;
      case 'open-audit-log':
        setView('settings');
        setShowAuditLog(true);
        if (dex.rewind.getAuditLog) setAuditLog(asList(await dex.rewind.getAuditLog(200)));
        break;
      default:
        if (id.startsWith('plugin:')) {
          const parts = id.split(':');
          const pluginId = parts[1];
          const commandName = parts.slice(2).join(':');
          if (dex?.rewind?.runPluginCommand) {
            await dex.rewind.runPluginCommand(pluginId, commandName);
          }
        }
        break;
    }

    setCommandPaletteOpen(false);
  };

  const paletteCommands = [
    { id: 'nav:timeline', title: 'Go to Timeline', description: 'Open timeline view' },
    { id: 'nav:search', title: 'Go to Search', description: 'Open search view' },
    { id: 'nav:summary', title: 'Go to Summary', description: 'Open summary view' },
    { id: 'nav:status', title: 'Go to Status', description: 'Open status dashboard' },
    { id: 'nav:focus', title: 'Go to Focus', description: 'Open focus insights' },
    { id: 'nav:reports', title: 'Go to Reports', description: 'Open screenshot reports' },
    { id: 'nav:analytics', title: 'Go to Analytics', description: 'Open analytics view' },
    { id: 'nav:settings', title: 'Go to Settings', description: 'Open settings view' },
    { id: 'pause-recording', title: 'Pause recording', description: 'Pause activity logging' },
    { id: 'resume-recording', title: 'Resume recording', description: 'Resume activity logging' },
    { id: 'start-focus', title: 'Start focus session', description: 'Prompt for goal and start' },
    { id: 'end-focus', title: 'End focus session', description: 'End current focus session' },
    { id: 'generate-today-summary', title: 'Generate today summary', description: 'Generate smart summary' },
    { id: 'export-daily-report', title: 'Export daily report', description: 'Copy daily report to clipboard' },
    { id: 'export-weekly-report', title: 'Export weekly report', description: 'Copy weekly report to clipboard' },
    { id: 'open-backup-folder', title: 'Open backup folder', description: 'Choose or open backup location' },
    { id: 'run-backup-now', title: 'Run database backup now', description: 'Create immediate backup' },
    { id: 'clear-clipboard-history', title: 'Clear clipboard history', description: 'Hide clipboard entries from current list' },
    { id: 'open-audit-log', title: 'Open audit log', description: 'Show audit log in Settings' },
  ];

  const dynamicPaletteCommands = [
    ...paletteCommands,
    ...pluginCommands.map(cmd => ({
      id: `plugin:${cmd.pluginId}:${cmd.name}`,
      title: `${cmd.name}`,
      description: `Plugin command from ${cmd.pluginId}`,
    })),
  ];

  const filteredPaletteCommands = dynamicPaletteCommands.filter(c => {
    const q = commandQuery.toLowerCase().trim();
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  useEffect(() => {
    const q = commandQuery.trim();
    if (!commandPaletteOpen) return;
    if (!q) {
      setCommandSearchResults([]);
      setCommandIndex(0);
      return;
    }

    if (filteredPaletteCommands.length > 0) {
      setCommandSearchResults([]);
      setCommandIndex(0);
      return;
    }

    let active = true;
    const run = async () => {
      if (!dex?.rewind?.search) return;
      const results = await dex.rewind.search(q, 30);
      if (!active) return;
      setCommandSearchResults((results || []).slice(0, 5));
      setCommandIndex(0);
    };
    run().catch((e: unknown) => { console.warn('[DEX]', e); });

    return () => {
      active = false;
    };
  }, [commandQuery, commandPaletteOpen, filteredPaletteCommands.length]);

  const completeOnboarding = async () => {
    if (!dex?.rewind?.completeOnboarding) return;
    await dex.rewind.completeOnboarding({
      excludedApps: onboardingExcludedApps,
      screenshotsEnabled: onboardingScreenshots,
      aiSearchEnabled: false,
      autoDelete30Days: onboardingAutoDelete,
    });
    setOnboardingCompleted(true);
    await loadSettings();
  };

  const userInitial = username.charAt(0).toUpperCase();

  // Group the loaded activity into work sessions by idle gap, for a scannable
  // timeline summary. Makes shared/rewind/timeline.ts (buildTimeline) load-bearing
  // instead of orphaned — the renderer now reconstructs sessions from the log.
  const timelineSessions = useMemo(
    () => buildTimeline(
      timeline.map(e => ({ ts: e.timestamp, appId: e.appName, kind: e.type, label: e.content })),
    ),
    [timeline],
  );

  // Day-grouped, newest-first projection of those sessions for a scannable
  // timeline ("Today", "Yesterday", richer per-session labels + durations).
  // Makes shared/rewind/timelineView.ts load-bearing instead of orphaned.
  const sessionDays = useMemo(() => groupSessionsByDay(timelineSessions), [timelineSessions]);

  // =======================================================================
  // RENDER
  // =======================================================================

  return (
    <div style={S.root} className="rewind-app">
      <style>{`
        /* === REWIND - UI HOVER === */
        .rewind-app button { font-family: inherit; transition: background 0.12s ease, border-color 0.12s ease; }
        .rewind-app button:not(:disabled):hover { background: var(--color-surface-2) !important; }
        .rewind-app button:disabled { opacity: 0.4; cursor: default; }
        .rewind-app * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
        .rewind-app ::-webkit-scrollbar { width: 6px; height: 6px; }
        .rewind-app ::-webkit-scrollbar-track { background: transparent; }
        .rewind-app ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .rewind-app ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14) !important; color: inherit !important; }
      `}</style>
      {/* -- TOP HEADER -- */}
      <div style={S.topHeader}>
        <div style={S.topHeaderBrand}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))' }}>Rewind</span>
        </div>

        {/* 2-tab pill switcher */}
        <div style={S.tabRow}>
          {NAV_ITEMS.map(tab => (
            <button
              key={tab.id}
              style={{ ...S.tabBtn, ...(view === tab.id ? S.tabBtnActive : {}) }}
              onClick={() => {
                setView(tab.id);
                if (tab.id === 'settings') {
                  loadSettings(); loadStorageInfo(); loadScreenshotStorage();
                  if (dex?.rewind?.getAuditLog) {
                    dex.rewind.getAuditLog(100).then((log: { id?: string; action?: string; timestamp?: number; detail?: string; user?: string }[]) => setAuditLog(log || [])).catch((e: unknown) => { console.warn('[DEX]', e); });
                    dex.rewind.getTodayLogs?.().then((txt: string) => setTodayLogs(txt || '')).catch((e: unknown) => { console.warn('[DEX]', e); });
                  }
                }
                if (tab.id === 'overview') { loadTimeline(); loadSummary(); loadScreenshots(); }
                if (tab.id === 'timeline') { loadTimeline(); }
                if (tab.id === 'search') { /* search is on-demand */ }
              }}
              aria-label={`${tab.label} tab`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: date nav + record dot */}
        <div style={S.headerRight}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button style={S.dateBtn} onClick={() => shiftDate(-1)} aria-label="Previous day"><DexIcon name="chevron-left" size={12} /></button>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary, #e4e4e7)', minWidth: 60, textAlign: 'center' as const }}>
              {selectedDate === todayStr() ? 'Today' : new Date(selectedDate + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
            <button style={S.dateBtn} onClick={() => shiftDate(1)} disabled={selectedDate === todayStr()} aria-label="Next day"><DexIcon name="chevron-right" size={12} /></button>
          </div>
          <button style={S.recordToggle} onClick={toggleRecording} title={isRecording ? 'Pause recording' : 'Resume recording'} aria-label={isRecording ? 'Pause recording' : 'Resume recording'}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isRecording ? 'var(--color-error)' : 'var(--color-text-tertiary)',
              display: 'inline-block',
              animation: isRecording ? 'rewindPulse 1.5s ease infinite' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: isRecording ? 'var(--color-error)' : 'var(--text-muted, #71717a)' }}>
              {isRecording ? 'Live' : 'Paused'}
            </span>
          </button>

        </div>
      </div>

      {/* -- PROBLEMS: load failures and a failed integrity check used to be set and never shown -- */}
      {(backgroundErrorBanner || integrityWarning) && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 12px 0', padding: '8px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-warning, #ff9f0a) 40%, transparent)', background: 'color-mix(in srgb, var(--color-warning, #ff9f0a) 10%, transparent)', fontSize: 12, color: 'var(--color-text-primary)' }}>
          {integrityWarning && <span>The last integrity check failed: some Rewind records may have been changed or damaged. Settings › Security › Run Integrity Check runs it again.</span>}
          {backgroundErrorBanner && (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{backgroundErrorBanner.message}</span>
              <button aria-label="Dismiss" onClick={() => setBackgroundErrorBanner(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
            </span>
          )}
        </div>
      )}
      {/* -- MAIN CONTENT -- */}
      <div style={S.main}>
        <div style={S.content}>
          {view === 'overview' && <RewindViewErrorBoundary viewName="Overview">{renderOverview()}</RewindViewErrorBoundary>}
          {view === 'timeline' && <RewindViewErrorBoundary viewName="Timeline">{renderTimeline()}</RewindViewErrorBoundary>}
          {view === 'search' && <RewindViewErrorBoundary viewName="Search">{renderSearch()}</RewindViewErrorBoundary>}
          {view === 'journal' && <RewindViewErrorBoundary viewName="Journal">{renderJournal()}</RewindViewErrorBoundary>}
          {view === 'settings' && <RewindViewErrorBoundary viewName="Settings">{renderSettings()}</RewindViewErrorBoundary>}
        </div>
      </div>

      {/* Background error banner -- suppressed for clean UX */}

      {/* Update banner -- suppressed, updates auto-download silently */}

      {releaseNotesModal && (
        <div style={S.lightboxOverlay} role="dialog" aria-label="Release notes" aria-modal="true" onMouseDown={() => setReleaseNotesModal(null)}>
          <div style={{ ...S.aboutCard, maxWidth: 640, textAlign: 'left' as const }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 'var(--space-2)' }}>Release notes {releaseNotesModal.version}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, maxHeight: 360, overflowY: 'auto' }}>
              {releaseNotesModal.notes || 'No release notes available.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                style={S.headerBtn}
                onClick={async () => {
                  await updateSetting('lastSeenReleaseNotesVersion', releaseNotesModal.version);
                  setReleaseNotesModal(null);
                }}
                aria-label="Close release notes"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {commandPaletteOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 14000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '10vh',
          }}
          onMouseDown={() => setCommandPaletteOpen(false)}
        >
          <div
            style={{
              width: 'min(920px, 94vw)',
              background: 'rgba(20,20,22,0.98)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <input
              ref={commandInputRef}
              value={commandQuery}
              onChange={e => setCommandQuery(e.target.value)}
              onKeyDown={async e => {
                const listLength = filteredPaletteCommands.length > 0 ? filteredPaletteCommands.length : commandSearchResults.length;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCommandIndex(v => Math.min(v + 1, Math.max(0, listLength - 1)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCommandIndex(v => Math.max(0, v - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredPaletteCommands.length > 0) {
                    const cmd = filteredPaletteCommands[commandIndex];
                    if (cmd) await executePaletteCommand(cmd.id);
                  } else {
                    const entry = commandSearchResults[commandIndex];
                    if (entry) {
                      setView('overview');
                      setSelectedDate(dateStrFromTs(entry.timestamp));
                      setCommandPaletteOpen(false);
                    }
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setCommandPaletteOpen(false);
                }
              }}
              placeholder="Search"
              style={{
                width: '100%',
                padding: '14px var(--space-4)',
                fontSize: 16,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--color-text-primary)',
                borderBottom: '1px solid var(--color-border)',
              }}
            />

            <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: 'var(--space-2)' }}>
              {filteredPaletteCommands.length > 0 ? (
                filteredPaletteCommands.map((cmd, idx) => (
                  <button
                    key={cmd.id}
                    onClick={() => executePaletteCommand(cmd.id)}
                    aria-label={cmd.title}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      padding: '10px var(--space-3)',
                      borderRadius: 6,
                      border: 'none',
                      background: commandIndex === idx ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{cmd.title}</span>
                    <span style={{ fontSize: 11, opacity: 0.72 }}>{cmd.description}</span>
                  </button>
                ))
              ) : commandSearchResults.length > 0 ? (
                commandSearchResults.map((entry, idx) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setView('overview');
                      setSelectedDate(dateStrFromTs(entry.timestamp));
                      setCommandPaletteOpen(false);
                    }}
                    aria-label={`Go to ${entry.content}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px var(--space-3)',
                      borderRadius: 6,
                      border: 'none',
                      background: commandIndex === idx ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{entry.content}</div>
                    <div style={{ fontSize: 11, opacity: 0.72 }}>{entry.appName} {formatTime(entry.timestamp)}</div>
                  </button>
                ))
              ) : (
                <div style={{ fontSize: 12, opacity: 0.72, padding: 'var(--space-3)' }}>No matching commands or activity results.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Session lock + integrity warning -- suppressed for clean UX */}

      {/* -- SCREENSHOT LIGHTBOX -- */}
      {lightboxUrl && (
        <div style={S.lightboxOverlay} onMouseDown={() => setLightboxUrl(null)}>
          <div style={S.lightboxContent} onMouseDown={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Screenshot" style={S.lightboxImg} />
            <button style={S.lightboxClose} onClick={() => setLightboxUrl(null)} aria-label="Close lightbox">&times;</button>
          </div>
        </div>
      )}

      {/* -- ABOUT MODAL -- */}
      {aboutModal && (
        <div style={S.lightboxOverlay} onMouseDown={() => setAboutModal(false)}>
          <div style={S.aboutCard} onMouseDown={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 'var(--space-2)' }}>DEX Rewind</div>
            <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 'var(--space-3)' }}>Version {appVersion}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.8 }}>
              Activity logger and search for your desktop -- all data stays local.
            </div>
            <button style={{ ...S.headerBtn, marginTop: 'var(--space-4)' }} onClick={() => setAboutModal(false)} aria-label="Close about">Close</button>
          </div>
        </div>
      )}

      {/* -- CLICK-AWAY for profile dropdown -- */}
      {profileDropdown && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 'var(--z-max)' }}
          onClick={() => setProfileDropdown(false)}
        />
      )}

      {/* Pulse keyframe animation */}
      <style>{`
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid var(--rewind-accent, var(--color-accent, #4A9EFF));
          outline-offset: 2px;
        }
        @keyframes rewindPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <ConfirmHost />
    </div>
  );

  // =======================================================================
  // VIEW: OVERVIEW (unified 2-section page)
  // =======================================================================

  function renderOverview() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* -- Search / Timeline tab strip + inline search -- */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: 'var(--space-4) var(--space-5) var(--space-3)',
          flexShrink: 0,
        }}>
          {/* Mini tab strip - iOS segmented control style */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--color-surface-1)', borderRadius: 4, padding: 2, flexShrink: 0 }}>
            {(['timeline', 'search'] as const).map(t => (
              <button
                key={t}
                style={{
                  padding: '4px var(--space-3)', borderRadius: 2, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  background: overviewSection === t ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: overviewSection === t ? 'var(--text-primary, #fafafa)' : 'var(--text-muted, #71717a)',
                }}
                onClick={() => setOverviewSection(t)}
                aria-label={`${t === 'timeline' ? 'Timeline' : 'Search'} view`}
              >
                {t === 'timeline' ? 'Timeline' : 'Search'}
              </button>
            ))}
          </div>

          {/* Inline search input (only in search mode) */}
          {overviewSection === 'search' && (
            <div style={{ flex: 1, display: 'flex', gap: 10 }}>
              <DexSearchInput
                ref={searchInputRef}
                fullWidth
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery('')}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="Search activity"
                autoFocus
              />
              <button style={{ ...S.searchBtn, height: 40, padding: '0 var(--space-5)' }} onClick={doSearch} aria-label="Search">Search</button>
            </div>
          )}

          {/* Timeline: filter pills */}
          {overviewSection === 'timeline' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {['all', 'app', 'browser', 'clipboard', 'file'].map(t => (
                <button
                  key={t}
                  style={{
                    ...S.filterBtn,
                    padding: 'var(--space-2) 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    ...(filterType === t ? { background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)', color: 'var(--color-text-primary)' } : {}),
                  }}
                  onClick={() => setFilterType(t)}
                  aria-label={`Filter by ${t === 'all' ? 'all' : TYPE_LABELS[t] || t}`}
                >
                  {t === 'all' ? 'All' : TYPE_LABELS[t] || t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* -- Main scrollable area -- */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3) var(--space-5) var(--space-5)' }}>

          {/* TIMELINE entries */}
          {overviewSection === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Crash recovery handled by useEffect */}

              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="dex-skeleton" style={{ height: 64, borderRadius: 10 }} />
                  ))}
                </div>
              )}
              {!loading && timeline.length === 0 && (
                <div style={S.emptyState}>
                  <div style={{ fontSize: 28, marginBottom: 'var(--space-3)', opacity: 0.3 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nothing recorded yet</div>
                  <div style={{ fontSize: 12, opacity: 0.64, lineHeight: 1.5 }}>
                    {isRecording
                      ? 'Events will appear as you use your computer. Check back after a few minutes.'
                      : 'Recording is paused. Click "Live" in the header to resume.'}
                  </div>
                </div>
              )}
              {!loading && timeline.map(entry => (
                <div key={entry.id} style={S.entryCard} tabIndex={0} aria-label={`${entry.appName} -- ${entry.content}`}>
                  <div style={{ ...S.entryIcon, background: `${TYPE_COLORS[entry.type] || '#555'}20`, color: TYPE_COLORS[entry.type] || '#888' }}>
                    {TYPE_SHORT[entry.type] || '-'}
                  </div>
                  <div style={S.entryBody}>
                    <div style={S.entryContent}>{entry.content}</div>
                    <div style={S.entryMeta}>
                      <span style={{ color: TYPE_COLORS[entry.type], fontWeight: 500 }}>{TYPE_LABELS[entry.type]}</span>
                      <span style={{ opacity: 0.3 }}>&#183;</span>
                      <span>{entry.appName}</span>
                      <span style={{ opacity: 0.3 }}>&#183;</span>
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SEARCH results */}
          {overviewSection === 'search' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading && <div style={S.emptyState}>Searching</div>}
              {!loading && !searchQuery && (
                <div style={S.emptyState}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Search your history</div>
                  <div style={{ fontSize: 12, opacity: 0.64 }}>Find apps opened, text copied, files changed, sites visited</div>
                </div>
              )}
              {!loading && searchQuery && searchResults.length === 0 && (
                <div style={S.emptyState}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No results</div>
                  <div style={{ fontSize: 12, opacity: 0.64 }}>Try different keywords or a shorter phrase</div>
                </div>
              )}
              {!loading && searchResults.length > 0 && (
                <div style={{ fontSize: 11, opacity: 0.56, marginBottom: 4 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
              )}
              {!loading && searchResults.map(entry => (
                <div key={entry.id} style={S.entryCard}>
                  <div style={{ ...S.entryIcon, background: `${TYPE_COLORS[entry.type] || '#555'}20`, color: TYPE_COLORS[entry.type] || '#888' }}>
                    {TYPE_SHORT[entry.type] || '-'}
                  </div>
                  <div style={S.entryBody}>
                    <div style={S.entryContent}>{entry.content}</div>
                    <div style={S.entryMeta}>
                      <span style={{ color: TYPE_COLORS[entry.type], fontWeight: 500 }}>{TYPE_LABELS[entry.type]}</span>
                      <span style={{ opacity: 0.3 }}>&#183;</span>
                      <span>{entry.appName}</span>
                      <span style={{ opacity: 0.3 }}>&#183;</span>
                      <span>{formatDate(entry.timestamp)} {formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* -- TODAY AT A GLANCE (collapsible stats strip) -- */}
          {overviewSection === 'timeline' && (
            <div style={{ marginTop: 18 }}>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #e4e4e7)', fontSize: 12, fontWeight: 600, padding: '0 0 var(--space-2)' }}
                onClick={() => setStatsExpanded(v => !v)}
                aria-label="Toggle today at a glance"
              >
                <DexIcon name={statsExpanded ? 'chevron-down' : 'chevron-right'} size={10} color="var(--color-text-tertiary)" />
                Today at a Glance
              </button>
              {statsExpanded && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                  {[
                    { label: 'Events', value: summary?.totalEntries ?? timeline.length },
                    { label: 'Apps', value: summary?.topApps?.length ?? '-' },
                    { label: 'Hours active', value: summary ? `${summary.hours.filter(h => h > 0).length}h` : '-' },
                    { label: 'Screenshots', value: screenshots.length || '-' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      flex: '1 1 80px',
                      background: 'var(--bg-surface, #121215)',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
                      borderRadius: 10,
                      padding: '10px 14px',
                      minWidth: 80,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))' }}>{stat.value}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                  {summary?.topApps?.slice(0, 4).map(app => (
                    <div key={app.name} style={{
                      flex: '1 1 80px',
                      background: 'var(--bg-surface, #121215)',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
                      borderRadius: 10,
                      padding: '10px 14px',
                      minWidth: 80,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #fafafa)' }}>{app.count}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{app.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -- SCREENSHOTS strip (collapsible) -- */}
          {overviewSection === 'timeline' && screenshots.length > 0 && (
            <div style={{ marginTop: 18, paddingBottom: 'var(--space-6)' }}>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #e4e4e7)', fontSize: 12, fontWeight: 600, padding: '0 0 var(--space-2)' }}
                onClick={() => setShotsExpanded(v => !v)}
                aria-label="Toggle screenshots"
              >
                <DexIcon name={shotsExpanded ? 'chevron-down' : 'chevron-right'} size={10} color="var(--color-text-tertiary)" />
                Screenshots ({screenshots.length})
              </button>
              {shotsExpanded && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 'var(--space-2)' }}>
                  {screenshots.slice(0, 12).map(ss => {
                    const dataUrl = screenshotData[ss.id];
                    return (
                      <div
                        key={ss.id}
                        style={{ flexShrink: 0, width: 120, height: 76, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-surface, #121215)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', cursor: dataUrl ? 'pointer' : 'default' }}
                        onClick={() => dataUrl && setLightboxUrl(dataUrl)}
                        title={formatTime(ss.timestamp)}
                      >
                        {dataUrl
                          ? <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.25 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6V4h10v2"/></svg></div>
                        }
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  // =======================================================================
  // VIEW: TIMELINE (legacy -- kept for internal use)
  // =======================================================================

  function renderTimeline() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
        <div style={S.viewHeader}>
          <span style={S.viewTitle}>Timeline</span>
        </div>

        {/* Crash recovery handled by useEffect */}

        {/* Date navigation */}
        <div style={S.dateNav}>
          <button style={S.dateBtn} onClick={() => shiftDate(-1)} aria-label="Previous day">Prev</button>
          <span style={S.dateLabel}>
            {selectedDate === todayStr() ? 'Today' : new Date(selectedDate).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <button style={S.dateBtn} onClick={() => shiftDate(1)} disabled={selectedDate === todayStr()} aria-label="Next day">Next</button>
        </div>

        {/* Type filter */}
        <div style={S.filterRow}>
          {['all', 'app', 'browser', 'clipboard', 'file', 'screenshot', 'dex'].map(t => (
            <button
              key={t}
              style={{
                ...S.filterBtn,
                ...(filterType === t ? { background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)', color: 'var(--color-text-primary)' } : {}),
              }}
              onClick={() => setFilterType(t)}
              aria-label={`Filter by ${t === 'all' ? 'all' : TYPE_LABELS[t] || t}`}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t] || t}
            </button>
          ))}
        </div>

        {/* Work sessions — idle-gap grouped, then day-bucketed with relative
            headings + human labels (shared/rewind/timelineView.ts). */}
        {!loading && sessionDays.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: '0 4px 4px' }} aria-label="Work sessions">
            {sessionDays.map(day => (
              <div key={day.dayTs}>
                <div className="dex-label-caps" style={{ fontSize: 10, margin: '2px 0 6px' }}>
                  {day.heading}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {day.sessions.map(sess => {
                    // Which Project Space was active when this session happened?
                    const space = spaceAt(sess.startTs);
                    const spaceMeta = space ? STAGE_KIND_META[(space.kind as StageKind)] : undefined;
                    return (
                    <div
                      key={sess.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: 'var(--color-surface-1)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: 11, color: 'var(--rewind-text, #e4e4e7)',
                      }}
                      title={space ? `${describeSession(sess)} · ${space.name} space` : describeSession(sess)}
                    >
                      {space && spaceMeta && (
                        <span
                          style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
                            padding: '1px 5px', borderRadius: 4,
                            background: spaceMeta.accent.startsWith('#') ? `${spaceMeta.accent}26` : 'var(--color-accent-subtle)',
                            color: spaceMeta.accent.startsWith('#') ? spaceMeta.accent : 'var(--color-accent)',
                            textTransform: 'uppercase',
                          }}
                          title={`Workspace: ${space.name}`}
                        >
                          {spaceMeta.label}
                        </span>
                      )}
                      <span style={{ fontWeight: 600 }}>{sess.primaryAppId}</span>
                      <span style={{ opacity: 0.7 }}>{formatDuration(sessionDuration(sess))}</span>
                      <span style={{ opacity: 0.56 }}>·</span>
                      <span style={{ opacity: 0.72 }}>{sess.eventCount} event{sess.eventCount === 1 ? '' : 's'}</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Entries */}
        <div style={S.entryList} role="list" aria-label="Timeline entries">
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 'var(--space-2) 0' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="dex-skeleton" style={{ height: 52, borderRadius: 6 }} />
              ))}
            </div>
          )}
          {!loading && timeline.length === 0 && (
            <div style={S.emptyState}>
              <div style={{ fontSize: 14, marginBottom: 'var(--space-2)', fontWeight: 600 }}>No activity recorded</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {isRecording ? 'Events will appear as you use your computer' : 'Recording is paused'}
              </div>
            </div>
          )}
          {!loading && timeline.map(entry => (
            <div key={entry.id} style={S.entryCard} role="listitem" tabIndex={0} aria-label={`${entry.appName} ${entry.content}`}>
              <div style={{ ...S.entryIcon, background: `${TYPE_COLORS[entry.type] || '#555'}22`, color: TYPE_COLORS[entry.type] || '#555' }}>
                {TYPE_SHORT[entry.type] || '-'}
              </div>
              <div style={S.entryBody}>
                <div style={S.entryContent}>{entry.content}</div>
                <div style={S.entryMeta}>
                  <span style={{ color: TYPE_COLORS[entry.type], fontWeight: 500 }}>{TYPE_LABELS[entry.type]}</span>
                  <span style={{ opacity: 0.3 }}>&#183;</span>
                  <span>{entry.appName}</span>
                  <span style={{ opacity: 0.3 }}>&#183;</span>
                  <span>{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =======================================================================
  // VIEW: SEARCH
  // =======================================================================

  function renderSearch() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
        <div style={S.viewHeader}>
          <span style={S.viewTitle}>Search</span>
        </div>

        {/* Search bar */}
        <div style={S.searchBar}>
          <DexSearchInput
            ref={searchInputRef}
            fullWidth
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search"
          />
          <button style={S.searchBtn} onClick={doSearch} aria-label="Search">Search</button>
        </div>

        {/* Results */}
        <div style={S.entryList}>
          {loading && <div style={S.emptyState}>Searching...</div>}
          {!loading && searchResults.length === 0 && searchQuery && (
            <div style={S.emptyState}>
              <div style={{ fontSize: 14, marginBottom: 'var(--space-2)', fontWeight: 600 }}>No results found</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Try different keywords or a broader query</div>
            </div>
          )}
          {!loading && searchResults.length === 0 && !searchQuery && (
            <div style={S.emptyState}>
              <div style={{ fontSize: 14, marginBottom: 'var(--space-2)', fontWeight: 600 }}>Search your activity</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Find anything you did -- apps opened, text copied, files changed, websites visited
              </div>
            </div>
          )}
          {!loading && searchResults.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.7, padding: '0 4px', marginBottom: 4 }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
          )}
          {!loading && searchResults.map(entry => (
            <div key={entry.id} style={S.entryCard}>
              <div style={{ ...S.entryIcon, background: `${TYPE_COLORS[entry.type] || '#555'}22`, color: TYPE_COLORS[entry.type] || '#555' }}>
                {TYPE_SHORT[entry.type] || '-'}
              </div>
              <div style={S.entryBody}>
                <div style={S.entryContent}>{entry.content}</div>
                <div style={S.entryMeta}>
                  <span style={{ color: TYPE_COLORS[entry.type], fontWeight: 500 }}>{TYPE_LABELS[entry.type]}</span>
                  <span style={{ opacity: 0.3 }}>&#183;</span>
                  <span>{entry.appName}</span>
                  <span style={{ opacity: 0.3 }}>&#183;</span>
                  <span>{formatDate(entry.timestamp)} {formatTime(entry.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =======================================================================
  // VIEW: JOURNAL
  // =======================================================================

  function saveJournalEntry() {
    const { title, body, mood, tags } = journalDraft;
    if (!body.trim()) return;
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);

    if (journalEditing) {
      setJournalEntries(prev =>
        prev.map(e =>
          e.id === journalEditing
            ? { ...e, title: title.trim(), body: body.trim(), mood, tags: parsedTags }
            : e
        )
      );
      setJournalEditing(null);
    } else {
      const entry: JournalEntry = {
        id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        title: title.trim() || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        body: body.trim(),
        mood,
        tags: parsedTags,
        pinned: false,
        linkedActivities: [],
      };
      setJournalEntries(prev => [entry, ...prev]);
    }
    setJournalDraft({ title: '', body: '', mood: 'neutral', tags: '' });
  }

  function deleteJournalEntry(id: string) {
    setJournalEntries(prev => prev.filter(e => e.id !== id));
    if (journalEditing === id) {
      setJournalEditing(null);
      setJournalDraft({ title: '', body: '', mood: 'neutral', tags: '' });
    }
  }

  function togglePinJournal(id: string) {
    setJournalEntries(prev =>
      prev.map(e => e.id === id ? { ...e, pinned: !e.pinned } : e)
    );
  }

  function startEditJournal(entry: JournalEntry) {
    setJournalEditing(entry.id);
    setJournalDraft({
      title: entry.title,
      body: entry.body,
      mood: entry.mood,
      tags: entry.tags.join(', '),
    });
  }

  function linkActivityToJournal(journalId: string, activityId: string) {
    setJournalEntries(prev =>
      prev.map(e =>
        e.id === journalId
          ? { ...e, linkedActivities: e.linkedActivities.includes(activityId) ? e.linkedActivities : [...e.linkedActivities, activityId] }
          : e
      )
    );
  }

  function renderJournal() {
    const q = journalSearch.trim().toLowerCase();
    let filtered = journalFilter === 'pinned'
      ? journalEntries.filter(e => e.pinned)
      : journalEntries;
    if (q) filtered = filtered.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.body || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );

    const todayEntries = filtered.filter(e => {
      const d = new Date(e.timestamp);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
    const olderEntries = filtered.filter(e => !todayEntries.includes(e));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflow: 'auto', padding: 'var(--space-4) var(--space-5) var(--space-5)', flex: 1, minHeight: 0 }}>
        {/* Header */}
        <div style={S.viewHeader}>
          <span style={S.viewTitle}>Journal</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'pinned'] as const).map(f => (
              <button
                key={f}
                onClick={() => setJournalFilter(f)}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: journalFilter === f ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                  color: journalFilter === f ? 'var(--color-text-primary)' : 'var(--text-muted, #71717a)',
                }}
                aria-label={`Filter: ${f}`}
              >
                {f === 'all' ? 'All' : 'Pinned'}
              </button>
            ))}
          </div>
        </div>

        {/* Search across journal entries (title, body, tags) */}
        <DexSearchInput
          fullWidth
          placeholder="Search"
          value={journalSearch}
          onChange={e => setJournalSearch(e.target.value)}
          onClear={() => setJournalSearch('')}
          aria-label="Search journal entries"
        />
        {q && filtered.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted, #71717a)', padding: 'var(--space-2)' }}>
            No journal entries match "{journalSearch.trim()}".
          </div>
        )}

        {/* Compose */}
        <div style={{ ...S.insightCard, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            placeholder="Title (optional)"
            value={journalDraft.title}
            onChange={e => setJournalDraft(d => ({ ...d, title: e.target.value }))}
            style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 6, padding: 'var(--space-2) var(--space-3)', color: 'inherit', fontSize: 13, fontWeight: 600,
              outline: 'none', fontFamily: 'inherit',
            }}
            aria-label="Journal entry title"
          />
          <textarea
            placeholder="Write about your day..."
            value={journalDraft.body}
            onChange={e => setJournalDraft(d => ({ ...d, body: e.target.value }))}
            rows={4}
            style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 6, padding: '10px var(--space-3)', color: 'inherit', fontSize: 13, lineHeight: 1.6,
              outline: 'none', resize: 'vertical', fontFamily: 'inherit', minHeight: 80,
            }}
            aria-label="Journal entry body"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #71717a)', marginRight: 4 }}>Mood:</span>
            {(Object.keys(MOOD_MAP) as JournalEntry['mood'][]).map(m => (
              <button
                key={m}
                onClick={() => setJournalDraft(d => ({ ...d, mood: m }))}
                style={{
                  padding: '3px var(--space-2)', borderRadius: 4, border: '1px solid',
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  borderColor: journalDraft.mood === m ? MOOD_MAP[m].color : 'rgba(255,255,255,0.1)',
                  background: journalDraft.mood === m ? `${MOOD_MAP[m].color}20` : 'transparent',
                  color: journalDraft.mood === m ? MOOD_MAP[m].color : 'var(--text-muted, #71717a)',
                }}
                aria-label={`Mood: ${MOOD_MAP[m].label}`}
              >
                {MOOD_MAP[m].label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Tags (comma-separated)"
            value={journalDraft.tags}
            onChange={e => setJournalDraft(d => ({ ...d, tags: e.target.value }))}
            style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
              borderRadius: 6, padding: '6px var(--space-3)', color: 'inherit', fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
            }}
            aria-label="Tags"
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            {journalEditing && (
              <button
                onClick={() => { setJournalEditing(null); setJournalDraft({ title: '', body: '', mood: 'neutral', tags: '' }); }}
                aria-label="Cancel editing"
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'var(--text-secondary, #a1a1aa)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={saveJournalEntry}
              disabled={!journalDraft.body.trim()}
              aria-label={journalEditing ? 'Update entry' : 'Save entry'}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: journalDraft.body.trim() ? 'var(--color-accent-fill)' : 'rgba(74,158,255,0.3)',
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: journalDraft.body.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit', opacity: journalDraft.body.trim() ? 1 : 0.5,
              }}
            >
              {journalEditing ? 'Update' : 'Save Entry'}
            </button>
          </div>
        </div>

        {/* Link recent activity */}
        {journalEditing && timeline.length > 0 && (
          <div style={{ ...S.insightCard, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted, #71717a)' }}>Link recent activity:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {timeline.slice(0, 8).map(act => {
                const linked = journalEntries.find(e => e.id === journalEditing)?.linkedActivities.includes(act.id);
                return (
                  <button
                    key={act.id}
                    onClick={() => linkActivityToJournal(journalEditing, act.id)}
                    style={{
                      padding: '3px var(--space-2)', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                      border: `1px solid ${linked ? 'var(--dex-focus-color, #fff)' : 'rgba(255,255,255,0.1)'}`,
                      background: linked ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent',
                      color: linked ? 'var(--color-text-primary)' : 'var(--text-muted, #71717a)',
                      fontFamily: 'inherit',
                    }}
                    title={act.content}
                    aria-label={`Link activity: ${act.appName}`}
                  >
                    {act.appName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Today's entries */}
        {todayEntries.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #71717a)', padding: '0 2px' }}>Today</div>
            {todayEntries.map(entry => renderJournalCard(entry))}
          </>
        )}

        {/* Older entries */}
        {olderEntries.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #71717a)', padding: '0 2px', marginTop: 4 }}>Earlier</div>
            {olderEntries.map(entry => renderJournalCard(entry))}
          </>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--space-10) 0', color: 'var(--text-muted, #71717a)' }}>
            <div style={{ marginBottom: 'var(--space-2)', opacity: 0.56 }}><DexIcon name="pencil" size={32} /></div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {journalFilter === 'pinned' ? 'No pinned entries' : 'No journal entries yet'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.72 }}>
              {journalFilter === 'pinned' ? 'Pin entries to see them here' : 'Start writing about your day above'}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderJournalCard(entry: JournalEntry) {
    const moodInfo = MOOD_MAP[entry.mood];
    const dateStr = new Date(entry.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    return (
      <div key={entry.id} style={{ ...S.insightCard, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
              {entry.title && (
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #fafafa)' }}>
                  {entry.title}
                </span>
              )}
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: `${moodInfo.color}18`, color: moodInfo.color, fontWeight: 500,
              }}>
                {moodInfo.label}
              </span>
              {entry.pinned && (
                <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600 }}>Pinned</span>
              )}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary, #a1a1aa)', whiteSpace: 'pre-wrap' }}>
              {entry.body}
            </div>
            {entry.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {entry.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: 'var(--color-surface-2)', color: 'var(--text-muted, #71717a)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {entry.linkedActivities.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--color-accent)', marginTop: 4 }}>
                {entry.linkedActivities.length} linked activit{entry.linkedActivities.length === 1 ? 'y' : 'ies'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #71717a)' }}>{dateStr}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => togglePinJournal(entry.id)}
                title={entry.pinned ? 'Unpin' : 'Pin'}
                aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: entry.pinned ? 'var(--color-warning)' : 'var(--text-muted, #71717a)', fontSize: 12,
                }}
              >
                <DexIcon name={entry.pinned ? 'pin' : 'circle-dashed'} size={12} />
              </button>
              <button
                onClick={() => startEditJournal(entry)}
                title="Edit"
                aria-label="Edit entry"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--text-muted, #71717a)', fontSize: 12,
                }}
              >
                <DexIcon name="pencil" size={12} />
              </button>
              <button
                onClick={() => deleteJournalEntry(entry.id)}
                title="Delete"
                aria-label="Delete entry"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--color-error)', fontSize: 12,
                }}
              >
                <DexIcon name="close" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // =======================================================================
  // VIEW: SETTINGS (Privacy / Preferences)
  // =======================================================================

  function renderSettings() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', overflow: 'auto', padding: 'var(--space-4) var(--space-5) var(--space-5)', flex: 1, minHeight: 0 }}>
        <div style={S.viewHeader}><span style={S.viewTitle}>Settings</span></div>

        {/* Recording toggle */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Recording</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12 }}>Background activity logging</span>
            <button
              aria-label={isRecording ? 'Disable background activity logging' : 'Enable background activity logging'}
              style={{
                ...S.toggleBtn,
                background: isRecording ? 'var(--color-accent-fill)' : 'rgba(255,255,255,0.1)',
              }}
              onClick={toggleRecording}
            >
              <div style={{
                ...S.toggleKnob,
                transform: isRecording ? 'translateX(18px)' : 'translateX(2px)',
              }} />
            </button>
          </div>
        </div>

        {/* Tracking categories */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>What to Track</div>
          {settings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {([
                { key: 'trackApps', label: 'Active Windows', desc: 'Record which apps and windows you use' },
                { key: 'trackBrowser', label: 'Browser Tabs', desc: 'Record browser tab titles' },
                { key: 'trackClipboard', label: 'Clipboard', desc: 'Record text you copy' },
                { key: 'trackFiles', label: 'File Changes', desc: 'Watch Desktop, Documents, Downloads' },
              ] as const).map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12 }}>{item.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.56 }}>{item.desc}</div>
                  </div>
                  <button
                    aria-label={`${settings[item.key] ? 'Disable' : 'Enable'} ${item.label} tracking`}
                    style={{
                      ...S.toggleBtn,
                      background: settings[item.key] ? 'var(--color-accent-fill)' : 'rgba(255,255,255,0.1)',
                    }}
                    onClick={() => updateSetting(item.key, !settings[item.key])}
                  >
                    <div style={{
                      ...S.toggleKnob,
                      transform: settings[item.key] ? 'translateX(18px)' : 'translateX(2px)',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Screenshot settings */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Screenshots</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12 }}>Periodic Screenshots</div>
                <div style={{ fontSize: 10, opacity: 0.56 }}>Capture screen at regular intervals</div>
              </div>
              <button
                aria-label={settings?.screenshotsEnabled ? 'Disable periodic screenshots' : 'Enable periodic screenshots'}
                style={{
                  ...S.toggleBtn,
                  background: settings?.screenshotsEnabled ? 'var(--color-accent-fill)' : 'rgba(255,255,255,0.1)',
                }}
                onClick={() => updateSetting('screenshotsEnabled', !settings?.screenshotsEnabled)}
              >
                <div style={{
                  ...S.toggleKnob,
                  transform: settings?.screenshotsEnabled ? 'translateX(18px)' : 'translateX(2px)',
                }} />
              </button>
            </div>
            {settings?.screenshotsEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 12 }}>Capture every</span>
                <select
                  style={S.select}
                  aria-label="Screenshot capture interval"
                  value={settings?.screenshotIntervalMin || 5}
                  onChange={e => updateSetting('screenshotIntervalMin', parseInt(e.target.value))}
                >
                  <option value="1">1 min</option>
                  <option value="2">2 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                </select>
              </div>
            )}
            {screenshotStorage && (
              <div style={{ fontSize: 10, opacity: 0.56 }}>
                {screenshotStorage.totalCount} screenshots, {formatBytes(screenshotStorage.totalSizeBytes)}
              </div>
            )}
            <button aria-label="Open screenshots folder" style={S.headerBtn} onClick={openScreenshotsFolder}>Open Screenshots Folder</button>
          </div>
        </div>

        {/* Excluded apps */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Excluded Apps</div>
          <div style={{ fontSize: 10, opacity: 0.56, marginBottom: 'var(--space-2)' }}>
            Activity from these apps will not be recorded (process name, case-insensitive)
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
            <input
              style={S.excludeInput}
              value={newExclude}
              onChange={e => setNewExclude(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExclusion()}
              placeholder="e.g. keepass, 1password"
            />
            <button aria-label="Add app exclusion" style={S.searchBtn} onClick={addExclusion}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(settings?.excludedApps || []).map(app => (
              <div key={app} style={S.excludeTag}>
                <span>{app}</span>
                <button aria-label={`Remove ${app} from exclusion list`} style={S.excludeRemove} onClick={() => removeExclusion(app)}>&times;</button>
              </div>
            ))}
            {(settings?.excludedApps || []).length === 0 && (
              <div style={{ fontSize: 11, opacity: 0.56 }}>No excluded apps</div>
            )}
          </div>
        </div>

        {/* Retention */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Data Retention</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 12 }}>Keep data for</span>
            <select
              style={S.select}
              aria-label="Data retention period"
              value={settings?.retentionDays || 30}
              onChange={e => updateSetting('retentionDays', parseInt(e.target.value))}
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
        </div>

        {/* Appearance */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Appearance</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 'var(--space-2)' }}>
            Default: dark. Theme applies immediately and saves automatically.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
            {([
              { id: 'dark', label: 'Dark' },
              { id: 'darker', label: 'Darker' },
              { id: 'light', label: 'Light' },
              { id: 'high-contrast', label: 'High Contrast' },
              { id: 'custom', label: 'Custom' },
            ] as Array<{ id: RewindThemeName; label: string }>).map(item => {
              const preset = item.id === 'custom' ? customTheme : THEME_PRESETS[item.id as Exclude<RewindThemeName, 'custom'>];
              const active = themeName === item.id;
              return (
                <button
                  key={item.id}
                  aria-label={`Select ${item.label} theme`}
                  style={{
                    border: active ? `2px solid ${preset.accent}` : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    background: preset.surface,
                    color: preset.text,
                    cursor: 'pointer',
                    padding: 'var(--space-2)',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                  onClick={() => updateSetting('themeName', item.id)}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[preset.background, preset.surface, preset.accent, preset.text, preset.muted].map((c, i) => (
                      <span key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.2)' }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {themeName === 'custom' && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: 'var(--space-2)' }}>
              {([
                ['background', 'Background'],
                ['surface', 'Surface'],
                ['accent', 'Accent'],
                ['text', 'Text'],
                ['muted', 'Muted'],
              ] as Array<[keyof typeof customTheme, string]>).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>{label}</span>
                  <input
                    type="color"
                    value={customTheme[key]}
                    onChange={e => {
                      const next = { ...customTheme, [key]: e.target.value };
                      setCustomTheme(next);
                      applyThemeVars(next);
                      updateSetting('customTheme', next);
                    }}
                    style={{ width: 38, height: 24, border: 'none', background: 'transparent' }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Notifications</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 'var(--space-2)' }}>
            Default: normal. Controls Rewind notification verbosity for status and plugin messages.
          </div>
          <select
            style={S.select}
            aria-label="Notification mode"
            value={(settings as any)?.notificationMode || 'normal'}
            onChange={e => updateSetting('notificationMode', e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="quiet">Quiet</option>
            <option value="silent">Silent</option>
          </select>
        </div>

        {/* Storage info */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Storage</div>
          {storageInfo ? (
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 12 }}>
              <div style={S.statBox}>
                <div style={S.statNum}>{storageInfo.totalFiles}</div>
                <div style={S.statLabel}>Days</div>
              </div>
              <div style={S.statBox}>
                <div style={S.statNum}>{storageInfo.totalEntries.toLocaleString()}</div>
                <div style={S.statLabel}>Entries</div>
              </div>
              <div style={S.statBox}>
                <div style={S.statNum}>{formatBytes(storageInfo.totalSizeBytes)}</div>
                <div style={S.statLabel}>Disk Usage</div>
              </div>
              {screenshotStorage && (
                <div style={S.statBox}>
                  <div style={S.statNum}>{formatBytes(screenshotStorage.totalSizeBytes)}</div>
                  <div style={S.statLabel}>Screenshots</div>
                </div>
              )}
            </div>
          ) : (
            <DexLoader variant="inline" label="Loading…" />
          )}
        </div>

        {/* Phase 5: Backup scheduler */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Backups</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12 }}>Schedule:</span>
            <select
              style={S.select}
              aria-label="Backup schedule"
              value={backupSettings?.schedule || 'daily'}
              onChange={async e => {
                if (!dex?.rewind?.setBackupSchedule) return;
                await dex.rewind.setBackupSchedule(e.target.value);
                await loadPhase5();
              }}
            >
              <option value="daily">Daily</option>
              <option value="3days">Every 3 days</option>
              <option value="weekly">Weekly</option>
            </select>
            <button aria-label="Choose backup folder" style={S.headerBtn} onClick={chooseBackupFolder}>Choose Folder</button>
            <button aria-label="Backup now" style={S.headerBtn} onClick={runBackupNow}>Backup Now</button>
            <button aria-label="Restore from backup" style={S.headerBtn} onClick={restoreFromBackup}>Restore from Backup</button>
          </div>
          <div style={{ marginTop: 'var(--space-2)', fontSize: 11, opacity: 0.75 }}>
            Last backup: {backupSettings?.lastBackupAt ? new Date(backupSettings.lastBackupAt).toLocaleString() : 'Never'}
            {backupSettings?.lastBackupSizeBytes ? ` (${formatBytes(backupSettings.lastBackupSizeBytes)})` : ''}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, opacity: 0.64 }}>
            Folder: {backupSettings?.folder || 'Default app data folder'}
          </div>
        </div>

        {/* Phase 5: Workspace profiles */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Workspace Profiles</div>
          <div style={{ marginBottom: 'var(--space-2)', fontSize: 11, opacity: 0.75 }}>
            Active profile: {activeWorkspaceProfile?.name || 'Work'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <input
              style={S.excludeInput}
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              placeholder="Profile name"
            />
            <input
              style={S.excludeInput}
              value={newProfileApps}
              onChange={e => setNewProfileApps(e.target.value)}
              placeholder="Defining apps (comma separated)"
            />
            <button aria-label="Create workspace profile" style={S.headerBtn} onClick={createWorkspaceProfile}>Create</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {workspaceProfiles.map(profile => (
              <div key={profile.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                padding: '6px var(--space-2)',
                borderRadius: 4,
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{profile.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>
                    Apps: {(profile.definingApps || []).join(', ') || 'None'}
                  </div>
                </div>
                {!profile.id.startsWith('default_') && (
                  <button aria-label={`Delete workspace profile ${profile.name}`} style={S.headerBtn} onClick={() => removeWorkspaceProfile(profile.id)}>Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Phase 7: Plugins */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Plugins</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <button
              aria-label="Open plugins folder"
              style={S.headerBtn}
              onClick={async () => {
                if (!dex?.rewind?.openPluginsFolder) return;
                await dex.rewind.openPluginsFolder();
              }}
            >
              Open plugins folder
            </button>
            <button
              aria-label="Reload all plugins"
              style={S.headerBtn}
              onClick={async () => {
                if (!dex?.rewind?.reloadPlugins) return;
                setPlugins(asList(await dex.rewind.reloadPlugins()));
                if (dex?.rewind?.getPluginCommands) setPluginCommands(asList(await dex.rewind.getPluginCommands()));
              }}
            >
              Reload all
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plugins.length === 0 && (
              <div style={{ fontSize: 11, opacity: 0.64 }}>No plugins found. Add .js files to the plugins folder and reload.</div>
            )}
            {plugins.map(plugin => (
              <div key={plugin.id} style={{
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 6,
                padding: 'var(--space-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {plugin.name} v{plugin.version}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.75 }}>By {plugin.author}</div>
                  <div style={{ fontSize: 10, opacity: 0.725 }}>{plugin.description}</div>
                  {plugin.loadError && (
                    <div style={{ fontSize: 10, color: 'var(--color-warning)' }}>Load error: {plugin.loadError}</div>
                  )}
                </div>
                <button
                  aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} plugin ${plugin.name}`}
                  style={S.headerBtn}
                  onClick={async () => {
                    if (!dex?.rewind?.setPluginEnabled) return;
                    await dex.rewind.setPluginEnabled(plugin.id, !plugin.enabled);
                    setPlugins(asList(await dex.rewind.getPlugins()));
                    if (dex?.rewind?.getPluginCommands) setPluginCommands(asList(await dex.rewind.getPluginCommands()));
                  }}
                >
                  {plugin.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Phase 4: Security & Integrity */}
        <div style={S.insightCard}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Security</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' as const, marginBottom: 'var(--space-2)' }}>
            <button
              aria-label="Run integrity check"
              style={S.headerBtn}
              onClick={async () => {
                if (!dex?.rewind?.runIntegrityCheck) return;
                const toast = (type: string, message: string) => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
                try {
                  const result = await dex.rewind.runIntegrityCheck();
                  if (!result) { toast('error', 'The integrity check did not run.'); return; }
                  setIntegrityWarning(!result.passed);
                  toast(result.passed ? 'success' : 'warning', result.passed ? 'Integrity check passed.' : 'Integrity check failed: see the warning at the top.');
                } catch (e) {
                  toast('error', `The integrity check could not run: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
            >
              Run Integrity Check
            </button>
            <button
              aria-label={showAuditLog ? 'Hide audit log' : 'View audit log'}
              style={S.headerBtn}
              onClick={async () => {
                if (!dex?.rewind?.getAuditLog) return;
                const log = await dex.rewind.getAuditLog(200);
                setAuditLog(log || []);
                setShowAuditLog(!showAuditLog);
              }}
            >
              {showAuditLog ? 'Hide Audit Log' : 'View Audit Log'}
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.56 }}>
            Integrity check verifies data files have not been tampered with externally.
            Audit log records all security-relevant actions and cannot be cleared from the UI.
          </div>
        </div>

        {/* Audit Log Panel */}
        {showAuditLog && auditLog.length > 0 && (
          <div style={S.insightCard}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Audit Log</div>
            <div style={{
              maxHeight: 300, overflowY: 'auto', display: 'flex',
              flexDirection: 'column', gap: 4,
            }}>
              {auditLog.map((entry: { id?: string; action?: string; timestamp?: number; detail?: string; user?: string }, idx: number) => (
                <div key={entry.id || idx} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: '4px var(--space-2)', borderRadius: 4,
                  background: 'var(--color-surface-1)',
                  fontSize: 11,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: entry.action?.includes('locked') ? 'var(--color-warning)'
                      : entry.action?.includes('deleted') ? 'var(--color-error)'
                      : entry.action?.includes('export') ? '#5e5ce6'
                      : 'var(--color-success)',
                  }} />
                  <span style={{ flex: 1, opacity: 0.8 }}>{entry.action}: {entry.detail}</span>
                  <span style={{ opacity: 0.35, fontSize: 10, flexShrink: 0 }}>
                    {entry.timestamp ? formatTime(entry.timestamp) : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div style={{ ...S.insightCard, borderColor: 'rgba(255,59,48,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-error)' }}>Danger Zone</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 'var(--space-2)' }}>
            This permanently deletes all Rewind data including screenshots. This cannot be undone.
          </div>
          <button aria-label="Delete all Rewind data" style={S.dangerBtn} onClick={deleteAllData}>
            Delete All Rewind Data
          </button>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' as const, paddingBottom: 'var(--space-4)' }}>
          All data stays on this machine. No cloud. No accounts.
        </div>
      </div>
    );
  }
};

// Status view inline helpers
const statusCardStyle: React.CSSProperties = {
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '14px var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const statusCardHeader: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 2,
  color: 'rgba(245,245,247,0.9)',
};
const statusRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
const statusMeta: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
};
const statusDot = (color: string): React.CSSProperties => ({
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

// ===========================================================================
// STYLES
// ===========================================================================

const S: Record<string, React.CSSProperties> = {
  // Layout
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--rewind-bg, var(--color-bg-base, #0D0D0D))',
    color: 'var(--rewind-text, var(--color-text-primary, #EBEBEB))',
    fontFamily: 'var(--dex-font-ui)',
    overflow: 'hidden',
  },

  // Top header bar
  topHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 14px',
    height: 36,
    flexShrink: 0,
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  topHeaderBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    flexShrink: 0,
    minWidth: 120,
  },
  tabRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    background: 'var(--color-surface-1)',
    borderRadius: 4,
    padding: 2,
    border: '1px solid var(--color-border-subtle)',
    overflowX: 'auto' as const,
    scrollbarWidth: 'none' as const,
    maxWidth: '100%',
    flexShrink: 1,
  },
  tabBtn: {
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tabBtnActive: {
    background: 'rgba(255,255,255,0.08)',
    color: 'var(--rewind-text, var(--color-text-primary, #EBEBEB))',
    fontWeight: 600,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexShrink: 0,
    minWidth: 120,
    justifyContent: 'flex-end',
  },
  sidebarBrand: {
    padding: '0 var(--space-4) var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 'var(--space-3)',
  },
  brandName: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))',
  },
  profileArea: {
    padding: '0 var(--space-4) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative' as const,
  },
  avatarBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(74,158,255,0.12)',
    color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 700,
    userSelect: 'none' as const,
  },
  profileName: {
    fontSize: 11,
    opacity: 0.72,
    marginTop: 6,
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 140,
  },
  profileDropdown: {
    position: 'absolute' as const,
    top: 70,
    left: 16,
    right: 16,
    background: 'var(--color-bg-surface-solid, #161618)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    padding: '4px 0',
    zIndex: 'var(--z-max)',
    boxShadow: 'var(--pg-shadow-panel)',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary, #f5f5f7)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 12,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },

  // Navigation
  navList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 var(--space-2)',
  },
  navItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'rgba(255,255,255,0.70)',
    cursor: 'pointer',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
  },
  navItemActive: {
    background: 'rgba(74,158,255,0.12)',
    color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))',
    fontWeight: 600,
  },

  // Sidebar footer
  sidebarFooter: {
    padding: 'var(--space-3) var(--space-4) 0',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  recordToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },

  // Main content area
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },

  // View header
  viewHeader: {
    marginBottom: 'var(--space-2)',
  },
  viewTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },

  // Date navigation
  dateNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },
  dateBtn: {
    background: 'var(--color-surface-2)',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-primary, #f5f5f7)',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: 11,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.8,
  },

  // Filter row
  filterRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 500,
  },

  // Entry list
  entryList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  entryCard: {
    display: 'flex',
    gap: 10,
    padding: '10px var(--space-3)',
    borderRadius: 4,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-subtle)',
  },
  entryIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  entryBody: {
    flex: 1,
    minWidth: 0,
  },
  entryContent: {
    fontSize: 13,
    lineHeight: '1.5',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 500,
  },
  entryMeta: {
    display: 'flex',
    gap: 'var(--space-2)',
    fontSize: 11,
    opacity: 0.75,
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center' as const,
    padding: 'var(--space-5)',
  },

  // Search
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '6px 10px',
    borderRadius: 4,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border)',
  },
  searchInput: {
    flex: 1,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    outline: 'none',
    color: 'var(--rewind-text, var(--color-text-primary, #EBEBEB))',
    fontSize: 12,
    padding: '7px 10px',
  },
  searchBtn: {
    background: 'var(--color-accent-light, rgba(74,158,255,0.16))',
    border: '1px solid var(--color-accent-muted, rgba(74,158,255,0.38))',
    borderRadius: 4,
    color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))',
    cursor: 'pointer',
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
  },

  // Buttons
  headerBtn: {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--rewind-text, var(--color-text-primary, #EBEBEB))',
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: 11,
  },

  // Insight cards
  insightCard: {
    padding: 'var(--space-3) 14px',
    borderRadius: 4,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-subtle)',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  statNum: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--rewind-accent, var(--color-accent, #4A9EFF))',
  },
  statLabel: {
    fontSize: 10,
    opacity: 0.7,
  },

  // Toggle
  toggleBtn: {
    width: 38,
    height: 20,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.25s cubic-bezier(0,0,0.2,1)',
    flexShrink: 0,
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    transition: 'transform 0.18s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: 'var(--pg-shadow-chip)',
  },

  // Exclude
  excludeInput: {
    flex: 1,
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    padding: '4px var(--space-2)',
    color: 'var(--color-text-primary, #f5f5f7)',
    fontSize: 11,
    outline: 'none',
  },
  excludeTag: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px var(--space-2)',
    borderRadius: 4,
    background: 'var(--color-surface-2)',
    fontSize: 11,
  },
  excludeRemove: {
    background: 'none',
    border: 'none',
    color: 'var(--color-error)',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    lineHeight: 1,
  },

  // Select
  select: {
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--color-text-primary, #f5f5f7)',
    padding: '4px var(--space-2)',
    fontSize: 11,
    outline: 'none',
    cursor: 'pointer',
  },

  // Danger
  dangerBtn: {
    background: 'rgba(255,59,48,0.15)',
    border: '1px solid rgba(255,59,48,0.3)',
    borderRadius: 4,
    color: 'var(--color-error)',
    cursor: 'pointer',
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 500,
  },

  // Screenshot grid
  screenshotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-2)',
    padding: '4px 0',
  },
  screenshotCard: {
    borderRadius: 4,
    overflow: 'hidden',
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-subtle)',
    cursor: 'pointer',
  },
  screenshotThumb: {
    width: '100%',
    height: 100,
    objectFit: 'cover' as const,
    display: 'block',
  },
  screenshotPlaceholder: {
    width: '100%',
    height: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-surface-1)',
    fontSize: 14,
    opacity: 0.3,
  },
  screenshotInfo: {
    padding: '6px var(--space-2)',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    opacity: 0.7,
  },

  // Lightbox
  lightboxOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-max)',
    cursor: 'pointer',
  },
  lightboxContent: {
    position: 'relative' as const,
    maxWidth: '90vw',
    maxHeight: '90vh',
  },
  lightboxImg: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain' as const,
    borderRadius: 6,
    boxShadow: 'var(--pg-shadow-popover)',
  },
  lightboxClose: {
    position: 'absolute' as const,
    top: -12,
    right: -12,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // About modal
  aboutCard: {
    background: 'var(--color-bg-surface-solid, #161618)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    padding: 'var(--space-6) 28px',
    textAlign: 'center' as const,
    maxWidth: 320,
    cursor: 'default',
    boxShadow: 'var(--pg-shadow-panel)',
  },
};

Rewind.displayName = 'Rewind';
export default memo(Rewind);
