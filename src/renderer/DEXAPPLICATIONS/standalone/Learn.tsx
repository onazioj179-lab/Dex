// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Learn — Insights, Shortcuts & Activity Intelligence
 * Surfaces usage patterns, keyboard shortcuts, app tips, system info,
 * hourly/daily usage heatmaps, power/performance controls, and AI
 * suggestions from the local pattern-learning engine. All data is local-only.
 */

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import DexIcon from '../../components/DexIcon';
import { useLearningStore } from '../../store/learningStore';
import { platform } from '../../utils';
import { findPeakHourWindow, peakIndex } from '../../../shared/format/activityInsights';
import { sendToNotes } from '../../services/sendTo';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { frameScheduler } from '../../services/FrameScheduler';

// -- Helpers ---------------------------------------------------------------
const fmtMs = (ms: number): string => {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

interface Suggestion {
  type: string;
  target: string;
  reason: string;
  confidence: number;
}
interface FrequentItem { id: string; count: number }

type Tab = 'overview' | 'courses' | 'shortcuts' | 'apps' | 'insights' | 'power';

// -- Power mode definitions -------------------------------------------------
interface PowerProfile {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  cpuLimit: number;
  gpuLimit: number;
  screenBrightness: number;
}

const POWER_PROFILES: PowerProfile[] = [
  { id: 'full', name: 'Full Power', icon: 'zap', color: '#FF453A', description: 'All systems running at maximum capacity', cpuLimit: 100, gpuLimit: 100, screenBrightness: 100 },
  { id: 'balanced', name: 'Balanced', icon: 'scale', color: '#5AC8FA', description: 'Optimal balance of performance and efficiency', cpuLimit: 100, gpuLimit: 100, screenBrightness: 100 },
  { id: 'conservative', name: 'Conservative', icon: 'battery', color: '#30D158', description: 'Reduced power use while keeping features active', cpuLimit: 80, gpuLimit: 80, screenBrightness: 80 },
  { id: 'minimal', name: 'Power Saver', icon: 'battery-low', color: '#FF9500', description: 'Maximize battery life with core features only', cpuLimit: 60, gpuLimit: 50, screenBrightness: 60 },
];

// -- Keyboard shortcuts reference ------------------------------------------
const _M = platform.isMac ? '⌘' : 'Ctrl';
const _O = platform.isMac ? '⌥' : 'Alt';

const SHORTCUT_SECTIONS = [
  {
    title: 'Navigation',
    items: [
      { keys: `${_M}+1–9`, desc: 'Switch to dock app 1–9' },
      { keys: 'F3', desc: 'Toggle app overview' },
      { keys: `${_M}+Tab`, desc: 'Switch between running apps' },
      { keys: `${_M}+W`, desc: 'Close current app' },
      { keys: `${_M}+Shift+W`, desc: 'Close all apps' },
      { keys: 'Escape', desc: 'Close menu / go back' },
    ],
  },
  {
    title: 'Creative Suite',
    items: [
      { keys: `${_O}+V`, desc: 'Open VINX (Video Editor)' },
      { keys: `${_O}+I`, desc: 'Open Imosion (Music)' },
      { keys: `${_O}+F`, desc: 'Open FLUX (Motion Graphics)' },
      { keys: `${_O}+R`, desc: 'Open PRISM (Photo Editor)' },
      { keys: `${_O}+G`, desc: 'Open FORGE (Encoder)' },
      { keys: `${_O}+X`, desc: 'Open AXL (Engineering)' },
    ],
  },
  {
    title: 'Window Management',
    items: [
      { keys: 'Double-click titlebar', desc: 'Maximize / restore window' },
      { keys: 'Drag to edge', desc: 'Snap window to half/quarter' },
      { keys: 'Hover maximize btn', desc: 'Show snap layout grid' },
    ],
  },
  {
    title: 'System',
    items: [
      { keys: `${_M}+K`, desc: 'Command palette / search' },
      { keys: `${_M}+,`, desc: 'Open Settings' },
      { keys: `${_O}+P`, desc: 'Power controls' },
    ],
  },
];

// -- App tips reference ----------------------------------------------------
const APP_TIPS_DATA = [
  { app: 'VINX', color: '#BF5AF2', tips: ['Drag media from Files into the timeline', 'Use J/K/L for shuttle playback', 'Right-click clips for split, trim, and effects', 'Export subtitles as SRT from the subtitle panel'] },
  { app: 'Imosion', color: '#FF6B35', tips: ['Record directly with the built-in mic input', 'Use the mixer to route and pan channels', 'Apply effects like reverb, EQ, and compression per track', 'Export stems individually for collaboration'] },
  { app: 'FLUX', color: '#64D2FF', tips: ['Add shape or text layers from the toolbar', 'Keyframe properties for smooth animation', 'Use the graph editor for easing curves', 'Enable 3D mode for depth and camera control'] },
  { app: 'PRISM', color: 'var(--color-success)', tips: ['Use layers panel for non-destructive editing', 'Hold Shift for proportional transforms', 'Apply adjustment layers for global color grading', 'Export at any resolution from the export dialog'] },
  { app: 'AXL', color: 'var(--color-accent)', tips: ['Create parts with the shape tools', 'Apply constraints to lock dimensions', 'Run stress simulation to validate your design', 'Export as STL for 3D printing or DXF for CAD'] },
  { app: 'FORGE', color: 'var(--color-warning)', tips: ['Drag files into the queue to start encoding', 'Choose presets or customize output settings', 'Queue multiple jobs for batch processing', 'Monitor progress with the built-in dashboard'] },
  { app: 'Notes', color: 'var(--color-warning)', tips: ['Organize with folders in the sidebar', 'Use Markdown formatting for rich text', 'Pin important notes to the top', 'Autocomplete suggests words as you type'] },
  { app: 'Files', color: '#339AF0', tips: ['Use breadcrumbs to navigate directories', 'Preview images and documents inline', 'Right-click for copy, move, and rename', 'Use the search bar to find files quickly'] },
];

// -- Courses: lesson / module model ----------------------------------------
// A self-contained learning curriculum for DEX. Each module groups lessons;
// each lesson carries an estimated time and readable body content. All progress
// is tracked renderer-side and persisted to localStorage (no native bridge).
interface Lesson {
  id: string;
  title: string;
  minutes: number;       // estimated time
  summary: string;       // one-line description (also searched)
  content: string;       // lesson body (searched, sendable to Notes)
}
interface CourseModule {
  id: string;
  title: string;
  color: string;
  description: string;
  lessons: Lesson[];
}

const COURSE_MODULES: CourseModule[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    color: '#5e5ce6',
    description: 'Find your way around the DEX desktop and core workflows.',
    lessons: [
      {
        id: 'gs-tour', title: 'The DEX Desktop Tour', minutes: 4,
        summary: 'Dock, top bar, Spotlight, and the window area at a glance.',
        content: 'DEX is built around four areas: the dock for launching apps, the top bar for system status and quick controls, Spotlight (Ctrl/Cmd+K) for search and commands, and the window area where your apps live. Apps open as managed windows you can snap, maximize, and stack. Everything you do is local-first.',
      },
      {
        id: 'gs-launch', title: 'Launching & Switching Apps', minutes: 3,
        summary: 'Open apps from the dock, Spotlight, or keyboard.',
        content: 'Click a dock icon or press Ctrl/Cmd plus a number 1 through 9 to jump straight to a dock app. Ctrl/Cmd+Tab cycles through running apps, and F3 opens the app overview. Close the current app with Ctrl/Cmd+W. The fastest path is usually Spotlight: hit Ctrl/Cmd+K and start typing.',
      },
      {
        id: 'gs-windows', title: 'Window Management', minutes: 5,
        summary: 'Snap, maximize, and arrange windows like a pro.',
        content: 'Drag a window to a screen edge to snap it to a half or quarter. Double-click a titlebar to maximize or restore. Hover the maximize button to reveal the snap-layout grid and pick an arrangement. Combine snapping with Ctrl/Cmd+Tab to build a multi-app workspace in seconds.',
      },
      {
        id: 'gs-spotlight', title: 'Spotlight & Commands', minutes: 4,
        summary: 'Search apps, files, and run commands from one field.',
        content: 'Spotlight is the command center of DEX. Open it with Ctrl/Cmd+K, then search apps, files, and settings, or type a slash command to act instantly. Results are ranked by your recent activity, so the things you use most rise to the top.',
      },
    ],
  },
  {
    id: 'creative-suite',
    title: 'Creative Suite',
    color: '#BF5AF2',
    description: 'Produce video, audio, motion, and design work in DEX.',
    lessons: [
      {
        id: 'cs-vinx', title: 'Editing Video in VINX', minutes: 8,
        summary: 'Timeline basics, shuttle playback, and exporting.',
        content: 'VINX is the DEX video editor. Drag media from Files onto the timeline, then use J, K, and L for shuttle playback. Right-click clips to split, trim, and add effects. When you are done, export subtitles as SRT from the subtitle panel and render your final cut.',
      },
      {
        id: 'cs-imosion', title: 'Making Music in Imosion', minutes: 7,
        summary: 'Record, mix, and export stems.',
        content: 'Imosion is the DEX music studio. Record directly with the built-in mic input, then use the mixer to route and pan channels. Apply per-track effects like reverb, EQ, and compression. Export stems individually when collaborating with others.',
      },
      {
        id: 'cs-flux', title: 'Motion Graphics with FLUX', minutes: 9,
        summary: 'Keyframes, easing, and 3D depth.',
        content: 'FLUX builds motion graphics. Add shape or text layers from the toolbar and keyframe their properties for smooth animation. Refine timing in the graph editor using easing curves, and switch on 3D mode for depth and camera control.',
      },
      {
        id: 'cs-prism', title: 'Photo Editing in PRISM', minutes: 6,
        summary: 'Non-destructive layers and color grading.',
        content: 'PRISM is the DEX photo editor. Work non-destructively with the layers panel and hold Shift for proportional transforms. Use adjustment layers for global color grading, then export at any resolution from the export dialog.',
      },
    ],
  },
  {
    id: 'productivity',
    title: 'Productivity',
    color: '#30D158',
    description: 'Notes, files, and the everyday apps that keep you moving.',
    lessons: [
      {
        id: 'pr-notes', title: 'Notes Like a Power User', minutes: 5,
        summary: 'Folders, Markdown, pinning, and autocomplete.',
        content: 'Notes keeps your thinking organized. Use folders in the sidebar to group notes, write with Markdown for rich formatting, and pin important notes to the top. Autocomplete suggests words as you type so capturing ideas stays fast.',
      },
      {
        id: 'pr-files', title: 'Navigating Files', minutes: 4,
        summary: 'Breadcrumbs, inline preview, and quick search.',
        content: 'The Files app gives you fast navigation with breadcrumbs and inline preview for images and documents. Right-click for copy, move, and rename, and use the search bar to find anything quickly without leaving the window.',
      },
      {
        id: 'pr-search', title: 'Search Everywhere', minutes: 3,
        summary: 'One search field, ranked by your habits.',
        content: 'DEX search is unified. The same field searches apps, files, and settings, and ranks results by what you actually use. The more you work, the smarter ordering becomes, surfacing your frequent destinations first.',
      },
    ],
  },
];

const ALL_LESSONS: Lesson[] = COURSE_MODULES.flatMap(m => m.lessons);
const LESSON_MODULE: Record<string, CourseModule> = Object.fromEntries(
  COURSE_MODULES.flatMap(m => m.lessons.map(l => [l.id, m] as const)),
);
const TOTAL_LESSON_COUNT = ALL_LESSONS.length;

// -- Persistence -----------------------------------------------------------
const PROGRESS_KEY = 'dex.learn.courses.progress.v1';
const BOOKMARKS_KEY = 'dex.learn.courses.bookmarks.v1';
const STREAK_KEY = 'dex.learn.courses.streak.v1';
const RESUME_KEY = 'dex.learn.courses.resume.v1';

type LessonStatus = 'started' | 'completed';
type ProgressMap = Record<string, LessonStatus>;

interface StreakState {
  current: number;        // consecutive-day streak count
  lastDay: string | null; // YYYY-MM-DD of last completion
  todayCount: number;     // lessons completed today
  todayKey: string | null;// YYYY-MM-DD that todayCount belongs to
}
const DAILY_GOAL = 3;

const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
};

const loadProgress = (): ProgressMap => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch { return {}; }
};
const saveProgress = (p: ProgressMap): void => {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* noop */ }
};
const loadBookmarks = (): string[] => {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};
const saveBookmarks = (b: string[]): void => {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b)); } catch { /* noop */ }
};
const loadResume = (): string | null => {
  try { return localStorage.getItem(RESUME_KEY); } catch { return null; }
};
const saveResume = (id: string): void => {
  try { localStorage.setItem(RESUME_KEY, id); } catch { /* noop */ }
};
const loadStreak = (): StreakState => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const s = JSON.parse(raw) as StreakState;
      return {
        current: s.current ?? 0,
        lastDay: s.lastDay ?? null,
        todayCount: s.todayCount ?? 0,
        todayKey: s.todayKey ?? null,
      };
    }
  } catch { /* noop */ }
  return { current: 0, lastDay: null, todayCount: 0, todayKey: null };
};
const saveStreak = (s: StreakState): void => {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch { /* noop */ }
};

const learnToast = (type: 'success' | 'error' | 'info', message: string): void => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
};

// -- Styles (module-level, never re-created) --------------------------------
const ROOT: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: 'var(--color-bg-base, #0a0a0f)',
  color: 'var(--color-text-primary, #e5e5ea)',
  overflow: 'hidden',
};
// Sticky chrome header — `.dex-liquid-glass-strong` (applied via className on the
// element) supplies the translucent material + blur; we flatten the forced radius
// to 0 (full-bleed bar) and keep the hairline divider beneath it.
const HEADER: React.CSSProperties = {
  padding: 'var(--space-5) var(--space-6) 14px', flexShrink: 0,
  borderRadius: 0,
  borderBottom: '1px solid var(--color-border-subtle)',
};
const CONTENT: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-6) 28px',
  display: 'flex', flexDirection: 'column', gap: 18,
};
const CARD: React.CSSProperties = {
  background: 'var(--color-bg-elevated, rgba(255,255,255,.04))',
  borderRadius: 10, padding: 'var(--space-4) 18px',
  border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
};
// Subtle row dividers shared across cards.
const ROW_DIVIDER = '1px solid var(--color-border-subtle, rgba(255,255,255,.04))';
const CARD_TITLE: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.04em', opacity: 0.5, marginBottom: 'var(--space-3)',
};
const STAT_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 0', fontSize: 13,
};
const PEAK_PILL: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: 'var(--color-accent-soft, rgba(94,92,230,0.18))',
  color: 'var(--color-accent)',
};
const BAR_BG: React.CSSProperties = {
  flex: 1, height: 4, borderRadius: 2, marginLeft: 'var(--space-3)',
  background: 'var(--color-bg-inset, rgba(255,255,255,.06))', overflow: 'hidden',
};
const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
  borderRadius: 10, cursor: 'pointer', border: 'none',
  background: active ? 'var(--color-bg-hover, rgba(255,255,255,.1))' : 'transparent',
  color: active ? 'var(--color-text-primary, #fff)' : 'var(--color-text-tertiary, rgba(255,255,255,.5))',
  transition: 'all .15s ease',
});

// ── Component ──────────────────────────────────────────────────────────────
const Learn: React.FC = () => {
  const { enabled, patterns, setEnabled, reset } = useLearningStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);
  const [dayPatterns, setDayPatterns] = useState<Record<string, { app: string; count: number }[]>>({});
  const [hourlyPatterns, setHourlyPatterns] = useState<Record<string, { app: string; count: number }[]>>({});
  const [sessionStats, setSessionStats] = useState<{ average: number; total: number; count: number } | null>(null);

  // -- Courses state (renderer-only, persisted to localStorage) ------------
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [bookmarks, setBookmarks] = useState<string[]>(() => loadBookmarks());
  const [streak, setStreak] = useState<StreakState>(() => loadStreak());
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [courseQuery, setCourseQuery] = useState('');
  const [noteDraft, setNoteDraft] = useState('');

  // On first courses-view, normalise the streak for the current day:
  // a missed day resets the streak; the per-day counter rolls over.
  useEffect(() => {
    const today = dayKey();
    setStreak(prev => {
      let next = prev;
      if (prev.lastDay && daysBetween(prev.lastDay, today) > 1) {
        next = { ...next, current: 0 };
      }
      if (prev.todayKey !== today) {
        next = { ...next, todayCount: 0, todayKey: today };
      }
      if (next !== prev) saveStreak(next);
      return next;
    });
  }, []);

  // Mark a lesson started (idempotent: never downgrade a completed lesson) and
  // record it as the resume point.
  const startLesson = useCallback((id: string) => {
    setActiveLesson(id);
    setNoteDraft('');
    saveResume(id);
    setProgress(prev => {
      if (prev[id]) return prev;            // already started or completed
      const next = { ...prev, [id]: 'started' as LessonStatus };
      saveProgress(next);
      return next;
    });
  }, []);

  // Mark complete -> update progress + streak (daily count + consecutive days).
  const completeLesson = useCallback((id: string) => {
    setProgress(prev => {
      if (prev[id] === 'completed') return prev;
      const next = { ...prev, [id]: 'completed' as LessonStatus };
      saveProgress(next);
      return next;
    });
    setStreak(prev => {
      if (progress[id] === 'completed') return prev; // no double-count
      const today = dayKey();
      let current = prev.current;
      if (prev.lastDay !== today) {
        // First completion of a new day: extend the streak if yesterday counted,
        // otherwise (gap or first ever) the streak restarts at 1.
        current = prev.lastDay && daysBetween(prev.lastDay, today) === 1
          ? prev.current + 1
          : 1;
      }
      const todayCount = (prev.todayKey === today ? prev.todayCount : 0) + 1;
      const next: StreakState = { current, lastDay: today, todayCount, todayKey: today };
      saveStreak(next);
      return next;
    });
    learnToast('success', 'Lesson completed');
  }, [progress]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const has = prev.includes(id);
      const next = has ? prev.filter(b => b !== id) : [...prev, id];
      saveBookmarks(next);
      learnToast('info', has ? 'Bookmark removed' : 'Lesson bookmarked');
      return next;
    });
  }, []);

  // Save the user's note (plus lesson title/summary) to the Notes app.
  const saveNotesFor = useCallback((lesson: Lesson) => {
    const note = noteDraft.trim();
    const body = [
      `# ${lesson.title}`,
      lesson.summary,
      '',
      note ? note : lesson.content,
    ].join('\n');
    void sendToNotes(body, `Learn: ${lesson.title}`);
  }, [noteDraft]);

  // -- Courses derived data ------------------------------------------------
  const moduleProgress = useMemo(() => {
    const out: Record<string, { done: number; total: number; pct: number }> = {};
    for (const m of COURSE_MODULES) {
      const total = m.lessons.length;
      const done = m.lessons.filter(l => progress[l.id] === 'completed').length;
      out[m.id] = { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
    return out;
  }, [progress]);

  const completedCount = useMemo(
    () => ALL_LESSONS.filter(l => progress[l.id] === 'completed').length,
    [progress],
  );

  const resumeLesson = useMemo(() => {
    const id = loadResume();
    if (id && LESSON_MODULE[id] && progress[id] !== 'completed') {
      return ALL_LESSONS.find(l => l.id === id) || null;
    }
    return null;
  }, [progress]);

  // Recommend the next incomplete lesson, preferring the module of the last
  // touched lesson, then the first module with unfinished work.
  const recommendedLesson = useMemo(() => {
    const fromId = loadResume();
    const preferredModule = fromId ? LESSON_MODULE[fromId] : undefined;
    const search = preferredModule
      ? [preferredModule, ...COURSE_MODULES.filter(m => m.id !== preferredModule.id)]
      : COURSE_MODULES;
    for (const m of search) {
      const lesson = m.lessons.find(l => progress[l.id] !== 'completed');
      if (lesson) return lesson;
    }
    return null;
  }, [progress]);

  const courseResults = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return null;
    return ALL_LESSONS.filter(l =>
      l.title.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.content.toLowerCase().includes(q),
    );
  }, [courseQuery]);

  const bookmarkedLessons = useMemo(
    () => bookmarks.map(id => ALL_LESSONS.find(l => l.id === id)).filter((l): l is Lesson => !!l),
    [bookmarks],
  );

  // Power management state
  const [powerProfile, setPowerProfile] = useState<string>('balanced');
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [isCharging, setIsCharging] = useState<boolean>(true);
  const [cpuUsage, setCpuUsage] = useState<number>(0);
  const [memoryUsage, setMemoryUsage] = useState<number>(0);
  const [restrictedMode, setRestrictedMode] = useState<boolean>(false);
  
  // Real-time system monitoring
  const metricsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch battery and power state
  useEffect(() => {
    const ipc = (window as any).electron;
    if (!ipc?.invoke) return;
    
    // Initial power state
    ipc.invoke('os:getBatteryInfo').then((info: any) => {
      if (info) {
        setBatteryLevel(info.level ?? 100);
        setIsCharging(info.charging ?? true);
      }
    }).catch(() => {});
    
    // Get current power profile
    ipc.invoke('battery:getProfile').then((profile: string) => {
      if (profile) setPowerProfile(profile);
    }).catch(() => {});
    
    // Get restriction status
    ipc.invoke('battery:getRestrictions').then((restrictions: any) => {
      setRestrictedMode(restrictions?.pauseNonEssentialTimers ?? false);
    }).catch(() => {});
    
    // Real-time metrics -- only poll while document is visible.
    const updateMetrics = () => {
      if (document.hidden) return;
      ipc.invoke('system:getCpuUsage').then((cpu: number) => setCpuUsage(cpu || 0)).catch(() => {});
      ipc.invoke('system:getMemoryUsage').then((mem: number) => setMemoryUsage(mem || 0)).catch(() => {});
    };
    updateMetrics();
    metricsInterval.current = setInterval(() => frameScheduler.schedule(updateMetrics, { appId: 'learn', priority: 'idle' }), 2000);
    
    return () => {
      if (metricsInterval.current) clearInterval(metricsInterval.current);
    };
  }, []);

  // Handle power profile change
  const changePowerProfile = useCallback((profileId: string) => {
    const ipc = (window as any).electron;
    setPowerProfile(profileId);
    ipc?.invoke?.('battery:setProfile', profileId).catch(() => {});
  }, []);
  
  // Toggle restriction mode
  const toggleRestrictions = useCallback(() => {
    const ipc = (window as any).electron;
    const newState = !restrictedMode;
    setRestrictedMode(newState);
    // Update config to enable/disable non-essential timer pausing
    ipc?.invoke?.('battery:setConfig', { 
      enabled: newState 
    }).catch(() => {});
  }, [restrictedMode]);

  // Fetch data from main process pattern engine
  useEffect(() => {
    const ipc = (window as any).electron;
    if (!ipc?.invoke) return;
    ipc.invoke('patterns:getSuggestions', {}).then((s: Suggestion[]) => setSuggestions(s || [])).catch((e: unknown) => console.warn('[Learn] getSuggestions:', e));
    ipc.invoke('patterns:getFrequent', null, 20).then((f: FrequentItem[]) => setFrequentItems(f || [])).catch((e: unknown) => console.warn('[Learn] getFrequent:', e));
    ipc.invoke('patterns:getDayPatterns').then((d: any) => setDayPatterns(d || {})).catch((e: unknown) => console.warn('[Learn] getDayPatterns:', e));
    ipc.invoke('patterns:getHourlyPatterns').then((h: any) => setHourlyPatterns(h || {})).catch((e: unknown) => console.warn('[Learn] getHourlyPatterns:', e));
    ipc.invoke('patterns:getSessionStats').then((s: any) => setSessionStats(s || null)).catch((e: unknown) => console.warn('[Learn] getSessionStats:', e));
  }, []);

  // Derived data from renderer learning store
  const rankedPages = useMemo(() => {
    return Object.entries(patterns.pageVisits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
  }, [patterns.pageVisits]);

  const rankedActions = useMemo(() => {
    return Object.entries(patterns.actionFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
  }, [patterns.actionFrequency]);

  const totalTimeMs = useMemo(() => {
    return Object.values(patterns.pageTime).reduce((a, b) => a + b, 0);
  }, [patterns.pageTime]);

  const pageTimeEntries = useMemo(() => {
    return Object.entries(patterns.pageTime)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [patterns.pageTime]);

  const maxPageVisits = rankedPages.length ? rankedPages[0][1] : 1;
  const maxActionFreq = rankedActions.length ? rankedActions[0][1] : 1;
  const maxPageTime = pageTimeEntries.length ? pageTimeEntries[0][1] : 1;

  // Synthesize the heatmaps into a one-line "you're most active..." insight.
  const activityPeak = useMemo(() => {
    const hourTotals = HOUR_LABELS.map((_, i) =>
      (hourlyPatterns[String(i)] || []).reduce((s, d) => s + d.count, 0));
    const dayTotals = DAY_LABELS.map((_, i) =>
      (dayPatterns[String(i)] || []).reduce((s, d) => s + d.count, 0));
    return {
      window: findPeakHourWindow(hourTotals, 3),
      dayIdx: peakIndex(dayTotals),
    };
  }, [hourlyPatterns, dayPatterns]);

  const handleReset = useCallback(() => {
    reset();
    const ipc = (window as any).electron;
    ipc?.invoke?.('patterns:cleanup').catch((e: unknown) => console.warn('[Learn] cleanup:', e));
  }, [reset]);

  // UKI app-context: expose the current course/lesson, its module, and overall
  // progress so the assistant knows what the user is learning. A ref keeps the
  // resolver reading live state — register once at mount.
  const ukiCtxRef = useRef({ tab, activeLesson, completedCount, streak });
  ukiCtxRef.current = { tab, activeLesson, completedCount, streak };
  useEffect(() => {
    registerUkiAppContext('learn', () => {
      const s = ukiCtxRef.current;
      const lesson = s.activeLesson ? ALL_LESSONS.find(l => l.id === s.activeLesson) : undefined;
      const mod = s.activeLesson ? LESSON_MODULE[s.activeLesson] : undefined;
      const pct = TOTAL_LESSON_COUNT ? Math.round((s.completedCount / TOTAL_LESSON_COUNT) * 100) : 0;
      return {
        appId: 'learn',
        focusedItemId: lesson?.id,
        custom: {
          tab: s.tab,
          course: mod?.title,
          lesson: lesson?.title,
          progress: `${s.completedCount}/${TOTAL_LESSON_COUNT} lessons (${pct}%)`,
          dayStreak: s.streak.current,
        },
      };
    });
    return () => unregisterUkiAppContext('learn');
  }, []);

  // Render one lesson row (status dot, title, time, bookmark, expandable body).
  const renderLesson = useCallback((lesson: Lesson, accent: string) => {
    const status = progress[lesson.id];
    const done = status === 'completed';
    const isOpen = activeLesson === lesson.id;
    const bookmarked = bookmarks.includes(lesson.id);
    return (
      <div
        key={lesson.id}
        style={{
          borderRadius: 'var(--radius-lg)',
          border: `1px solid ${isOpen ? accent + '66' : 'var(--color-border-subtle, rgba(255,255,255,.06))'}`,
          background: isOpen ? accent + '0d' : 'var(--color-bg-hover, rgba(255,255,255,.02))',
          overflow: 'hidden',
        }}
      >
        <div
          onClick={() => (isOpen ? setActiveLesson(null) : startLesson(lesson.id))}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
        >
          <DexIcon
            name={done ? 'check-circle' : status === 'started' ? 'play' : 'circle'}
            size={16}
            color={done ? 'var(--color-success)' : status === 'started' ? accent : 'currentColor'}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, opacity: done ? 0.55 : 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {lesson.title}
            </div>
            <div style={{ fontSize: 11, opacity: 0.45, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {lesson.summary}
            </div>
          </div>
          {done && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-success)', background: 'rgba(48,209,88,.14)', padding: '2px 6px', borderRadius: 4 }}>
              Done
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: 0.4, flexShrink: 0 }}>
            <DexIcon name="clock" size={11} />{lesson.minutes}m
          </span>
          <button
            onClick={e => { e.stopPropagation(); toggleBookmark(lesson.id); }}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: bookmarked ? accent : 'var(--color-text-tertiary, rgba(255,255,255,.4))' }}
          >
            <DexIcon name="bookmark" size={15} color={bookmarked ? accent : 'currentColor'} />
          </button>
        </div>

        {isOpen && (
          <div style={{ padding: '0 12px 12px', borderTop: ROW_DIVIDER }}>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.78, margin: '12px 0' }}>{lesson.content}</p>
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Jot a note for this lesson..."
              style={{
                width: '100%', minHeight: 56, resize: 'vertical', boxSizing: 'border-box',
                background: 'var(--color-bg-inset, rgba(0,0,0,.25))', color: 'inherit',
                border: '1px solid var(--color-border-subtle, rgba(255,255,255,.08))',
                borderRadius: 10, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
                outline: 'none', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => completeLesson(lesson.id)}
                disabled={done}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 10, border: 'none',
                  cursor: done ? 'default' : 'pointer',
                  background: done ? 'var(--color-bg-hover, rgba(255,255,255,.06))' : 'rgba(48,209,88,.16)',
                  color: done ? 'var(--color-text-tertiary, rgba(255,255,255,.4))' : 'var(--color-success)',
                }}
              >
                {done ? 'Completed' : 'Mark Complete'}
              </button>
              <button
                onClick={() => saveNotesFor(lesson)}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 10,
                  border: '1px solid var(--color-border-subtle, rgba(255,255,255,.1))',
                  background: 'var(--color-bg-hover, rgba(255,255,255,.04))', color: 'inherit', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <DexIcon name="file-text" size={13} />Save to Notes
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }, [progress, activeLesson, bookmarks, noteDraft, startLesson, toggleBookmark, completeLesson, saveNotesFor]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={ROOT}>
      {/* Header */}
      <div className="dex-liquid-glass-strong" style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'linear-gradient(135deg, #5e5ce6, #7d7aff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DexIcon name="brain" size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>Learn</h1>
              <p style={{ fontSize: 11, margin: 0, opacity: 0.45 }}>
                Shortcuts, tips & activity intelligence
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 10,
              border: 'none', cursor: 'pointer',
              background: enabled ? 'rgba(48,209,88,.15)' : 'rgba(255,69,58,.15)',
              color: enabled ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {enabled ? 'Tracking Active' : 'Tracking Paused'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {(['overview', 'courses', 'shortcuts', 'apps', 'insights', 'power'] as Tab[]).map(t => (
            <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
              {t === 'power' ? 'Power' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={CONTENT}>
        {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Pages Visited', value: Object.keys(patterns.pageVisits).length, color: '#5e5ce6' },
                { label: 'Actions Tracked', value: Object.values(patterns.actionFrequency).reduce((a, b) => a + b, 0), color: 'var(--color-success)' },
                { label: 'Total Active', value: fmtMs(totalTimeMs), color: 'var(--color-warning)' },
              ].map(s => (
                <div key={s.label} style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color, opacity: 0.6 }} />
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Session Stats from main process */}
            {sessionStats && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Session Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Average Session</div><div style={{ fontWeight: 600 }}>{fmtMs(sessionStats.average)}</div></div>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Total Time</div><div style={{ fontWeight: 600 }}>{fmtMs(sessionStats.total)}</div></div>
                  <div><div style={{ opacity: 0.5, fontSize: 11 }}>Sessions</div><div style={{ fontWeight: 600 }}>{sessionStats.count}</div></div>
                </div>
              </div>
            )}

            {/* Top Pages */}
            {rankedPages.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Most Visited Pages</div>
                {rankedPages.slice(0, 6).map(([page, count]) => (
                  <div key={page} style={STAT_ROW}>
                    <span style={{ opacity: 0.8 }}>{page}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(count / maxPageVisits) * 100}%`, height: '100%', borderRadius: 2, background: '#5e5ce6' }} />
                    </div>
                    <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Top Actions */}
            {rankedActions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Top Actions</div>
                {rankedActions.slice(0, 6).map(([action, count]) => (
                  <div key={action} style={STAT_ROW}>
                    <span style={{ opacity: 0.8, flex: '0 0 140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{action}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(count / maxActionFreq) * 100}%`, height: '100%', borderRadius: 2, background: '#64d2ff' }} />
                    </div>
                    <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions from pattern engine */}
            {suggestions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Suggestions</div>
                {suggestions.slice(0, 5).map((s, i) => (
                  <div key={i} style={{
                    padding: 'var(--space-2) 0', borderBottom: i < suggestions.length - 1 ? ROW_DIVIDER : 'none',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 4,
                      background: 'rgba(94,92,230,.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <DexIcon name="sparkles" size={14} color="#5e5ce6" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.target}</div>
                      <div style={{ fontSize: 11, opacity: 0.45 }}>{s.reason}</div>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.4, padding: '2px 6px', background: 'var(--color-bg-hover, rgba(255,255,255,.04))', borderRadius: 3 }}>{s.type}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state when no data yet */}
            {rankedPages.length === 0 && rankedActions.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center' as const, padding: '28px var(--space-5)' }}>
                <div style={{ opacity: 0.25, marginBottom: 'var(--space-2)' }}>
                  <DexIcon name="activity" size={32} color="currentColor" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Start exploring DEX</div>
                <div style={{ fontSize: 12, opacity: 0.45, maxWidth: 280, margin: '0 auto' }}>
                  Open apps, browse files, and create projects. Your activity data will appear here as you use DEX.
                </div>
              </div>
            )}
          </>
        )}

        {/* ── COURSES TAB ────────────────────────────────────────────── */}
        {tab === 'courses' && (
          <>
            {/* Streak / daily goal + overall progress */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#FF9500', opacity: 0.7 }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <DexIcon name="flame" size={20} color="#FF9500" />{streak.current}
                </div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Day Streak</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#30D158', opacity: 0.7 }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                  {streak.todayCount}<span style={{ fontSize: 14, opacity: 0.4 }}>/{DAILY_GOAL}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Today's Goal</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#5e5ce6', opacity: 0.7 }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{completedCount}<span style={{ fontSize: 14, opacity: 0.4 }}>/{TOTAL_LESSON_COUNT}</span></div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Lessons Done</div>
              </div>
            </div>

            {/* Search across lessons */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }}>
                <DexIcon name="search" size={14} />
              </span>
              <input
                value={courseQuery}
                onChange={e => setCourseQuery(e.target.value)}
                placeholder="Search lessons..."
                aria-label="Search lessons"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px',
                  background: 'var(--color-bg-elevated, rgba(255,255,255,.04))', color: 'inherit',
                  border: '1px solid var(--color-border-subtle, rgba(255,255,255,.08))',
                  borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Search results (replaces module list while a query is active) */}
            {courseResults ? (
              <div style={CARD}>
                <div style={CARD_TITLE}>{courseResults.length} Result{courseResults.length === 1 ? '' : 's'}</div>
                {courseResults.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.45, padding: '8px 0' }}>No lessons match "{courseQuery}".</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {courseResults.map(l => renderLesson(l, LESSON_MODULE[l.id].color))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Continue where you left off */}
                {(resumeLesson || recommendedLesson) && (
                  <div style={CARD}>
                    <div style={CARD_TITLE}>{resumeLesson ? 'Continue Learning' : 'Recommended Next'}</div>
                    {(() => {
                      const next = resumeLesson || recommendedLesson!;
                      const mod = LESSON_MODULE[next.id];
                      return (
                        <button
                          onClick={() => { setCourseQuery(''); startLesson(next.id); }}
                          style={{
                            width: '100%', textAlign: 'left' as const, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                            borderRadius: 'var(--radius-lg)', border: `1px solid ${mod.color}55`, background: `${mod.color}12`, color: 'inherit',
                          }}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${mod.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <DexIcon name="play" size={16} color={mod.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{next.title}</div>
                            <div style={{ fontSize: 11, opacity: 0.5 }}>{mod.title} · {next.minutes} min</div>
                          </div>
                          <DexIcon name="chevron-right" size={16} color="currentColor" />
                        </button>
                      );
                    })()}
                  </div>
                )}

                {/* Bookmarks */}
                {bookmarkedLessons.length > 0 && (
                  <div style={CARD}>
                    <div style={{ ...CARD_TITLE, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <DexIcon name="bookmark" size={11} />Bookmarks
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {bookmarkedLessons.map(l => renderLesson(l, LESSON_MODULE[l.id].color))}
                    </div>
                  </div>
                )}

                {/* Modules with per-module progress bars + lesson lists */}
                {COURSE_MODULES.map(mod => {
                  const mp = moduleProgress[mod.id];
                  return (
                    <div key={mod.id} style={CARD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, background: `${mod.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <DexIcon name="book" size={14} color={mod.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: mod.color }}>{mod.title}</div>
                          <div style={{ fontSize: 11, opacity: 0.5 }}>{mod.description}</div>
                        </div>
                        {mp.pct === 100 && (
                          <span title="Module complete" style={{ display: 'inline-flex' }}>
                            <DexIcon name="award" size={18} color={mod.color} />
                          </span>
                        )}
                      </div>

                      {/* Overall progress bar for the module */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-bg-inset, rgba(255,255,255,.06))', overflow: 'hidden' }}>
                          <div style={{ width: `${mp.pct}%`, height: '100%', borderRadius: 3, background: mod.color, transition: 'width .25s ease' }} />
                        </div>
                        <span style={{ fontSize: 11, opacity: 0.5, minWidth: 64, textAlign: 'right' as const }}>{mp.done}/{mp.total} · {mp.pct}%</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {mod.lessons.map(l => renderLesson(l, mod.color))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── SHORTCUTS TAB ──────────────────────────────────────────── */}
        {tab === 'shortcuts' && (
          <>
            {SHORTCUT_SECTIONS.map(section => (
              <div key={section.title} style={CARD}>
                <div style={CARD_TITLE}>{section.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {section.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: i < section.items.length - 1 ? ROW_DIVIDER : 'none',
                    }}>
                      <span style={{ fontSize: 13, opacity: 0.8 }}>{item.desc}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {item.keys.split('+').length > 1 ? (
                          item.keys.split('+').map((key, ki) => (
                            <React.Fragment key={ki}>
                              {ki > 0 && <span style={{ fontSize: 10, opacity: 0.3, lineHeight: '22px' }}>+</span>}
                              <span style={{
                                padding: '2px var(--space-2)', fontSize: 11, fontWeight: 600,
                                background: 'var(--color-bg-hover, rgba(255,255,255,.08))', borderRadius: 4,
                                border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
                                fontFamily: 'var(--font-mono, monospace)',
                                minWidth: 24, textAlign: 'center' as const,
                              }}>{key.trim()}</span>
                            </React.Fragment>
                          ))
                        ) : (
                          <span style={{
                            padding: '2px var(--space-2)', fontSize: 11, fontWeight: 600,
                            background: 'var(--color-bg-hover, rgba(255,255,255,.08))', borderRadius: 4,
                            border: '1px solid var(--color-border-subtle, rgba(255,255,255,.06))',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}>{item.keys}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── APPS TAB ──────────────────────────────────────────────── */}
        {tab === 'apps' && (
          <>
            {/* App tips cards */}
            {APP_TIPS_DATA.map(app => (
              <div key={app.app} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: `${app.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: app.color }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: app.color }}>{app.app}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.tips.map((tip, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                      padding: '5px 0',
                      borderBottom: i < app.tips.length - 1 ? ROW_DIVIDER : 'none',
                    }}>
                      <span style={{ fontSize: 10, opacity: 0.3, marginTop: 2, flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Frequent Items from main-process pattern engine */}
            {frequentItems.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Most Used (All Time)</div>
                {frequentItems.map(f => {
                  const maxCount = frequentItems[0]?.count || 1;
                  return (
                    <div key={f.id} style={STAT_ROW}>
                      <span style={{ opacity: 0.8, flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.id}</span>
                      <div style={BAR_BG}>
                        <div style={{ width: `${(f.count / maxCount) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--color-success)' }} />
                      </div>
                      <span style={{ minWidth: 28, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{f.count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time Spent per Page */}
            {pageTimeEntries.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Time Spent</div>
                {pageTimeEntries.map(([page, ms]) => (
                  <div key={page} style={STAT_ROW}>
                    <span style={{ opacity: 0.8, flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{page}</span>
                    <div style={BAR_BG}>
                      <div style={{ width: `${(ms / maxPageTime) * 100}%`, height: '100%', borderRadius: 2, background: 'var(--color-warning)' }} />
                    </div>
                    <span style={{ minWidth: 44, textAlign: 'right' as const, opacity: 0.5, fontSize: 12 }}>{fmtMs(ms)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── INSIGHTS TAB ──────────────────────────────────────────── */}
        {tab === 'insights' && (
          <>
            {/* Peak-activity summary */}
            {(activityPeak.window || activityPeak.dayIdx !== null) && (
              <div style={CARD}>
                <div style={CARD_TITLE}>When You Work</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                  {activityPeak.window && (
                    <span style={PEAK_PILL}>
                      <DexIcon name="clock" size={12} />
                      Most active {activityPeak.window.startHour}:00&ndash;{activityPeak.window.endHour}:00
                    </span>
                  )}
                  {activityPeak.dayIdx !== null && (
                    <span style={PEAK_PILL}>
                      <DexIcon name="calendar" size={12} />
                      Busiest day {DAY_LABELS[activityPeak.dayIdx]}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Day-of-Week Heatmap */}
            {Object.keys(dayPatterns).length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Activity by Day</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAY_LABELS.map((day, idx) => {
                    const dayData = dayPatterns[String(idx)] || [];
                    const total = dayData.reduce((s, d) => s + d.count, 0);
                    const maxTotal = Math.max(1, ...DAY_LABELS.map((_, i) =>
                      (dayPatterns[String(i)] || []).reduce((s: number, d: { count: number }) => s + d.count, 0)
                    ));
                    return (
                      <div key={day} style={{ flex: 1, textAlign: 'center' as const }}>
                        <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                          <div style={{
                            width: '80%', borderRadius: 2,
                            background: total ? 'rgba(94,92,230,.6)' : 'var(--color-bg-hover, rgba(255,255,255,.04))',
                            height: `${Math.max(4, (total / maxTotal) * 100)}%`,
                          }} />
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4 }}>{day}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hourly Activity Heatmap */}
            {Object.keys(hourlyPatterns).length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Hourly Activity</div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 64 }}>
                  {HOUR_LABELS.map((_, idx) => {
                    const hourData = hourlyPatterns[String(idx)] || [];
                    const total = hourData.reduce((s, d) => s + d.count, 0);
                    const maxTotal = Math.max(1, ...HOUR_LABELS.map((__, i) =>
                      (hourlyPatterns[String(i)] || []).reduce((s: number, d: { count: number }) => s + d.count, 0)
                    ));
                    return (
                      <div key={idx} style={{
                        flex: 1, borderRadius: 2,
                        background: total ? 'rgba(100,210,255,.5)' : 'var(--color-bg-hover, rgba(255,255,255,.03))',
                        height: `${Math.max(4, (total / maxTotal) * 100)}%`,
                        transition: 'height .18s cubic-bezier(0.4,0,0.2,1)',
                      }} title={`${HOUR_LABELS[idx]}: ${total} actions`} />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>0:00</span>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>12:00</span>
                  <span style={{ fontSize: 10, opacity: 0.3 }}>23:00</span>
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {patterns.searchPatterns.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>Recent Searches</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                  {patterns.searchPatterns.slice(0, 20).map((q, i) => (
                    <span key={i} style={{
                      padding: '4px 10px', fontSize: 12, borderRadius: 4,
                      background: 'var(--color-bg-hover, rgba(255,255,255,.05))', opacity: 0.7,
                    }}>{q}</span>
                  ))}
                </div>
              </div>
            )}

            {/* All Suggestions */}
            {suggestions.length > 0 && (
              <div style={CARD}>
                <div style={CARD_TITLE}>All Recommendations</div>
                {suggestions.map((s, i) => (
                  <div key={i} style={{
                    padding: '10px 0',
                    borderBottom: i < suggestions.length - 1 ? ROW_DIVIDER : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.target}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(94,92,230,.15)', color: '#7d7aff' }}>{s.type}</span>
                      <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 'auto' }}>{Math.round(s.confidence * 100)}%</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.5 }}>{s.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty insights state */}
            {suggestions.length === 0 && Object.keys(hourlyPatterns).length === 0 && Object.keys(dayPatterns).length === 0 && (
              <div style={{ ...CARD, textAlign: 'center' as const, padding: 'var(--space-8)', opacity: 0.5 }}>
                <DexIcon name="brain" size={24} color="currentColor" />
                <p style={{ marginTop: 'var(--space-2)', fontSize: 13 }}>No insights yet</p>
              </div>
            )}

            {/* Data Management */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Data Management</div>
              <button
                onClick={handleReset}
                style={{
                  padding: 'var(--space-2) var(--space-4)', fontSize: 12, fontWeight: 500, borderRadius: 10,
                  border: '1px solid var(--color-error-muted, rgba(255,69,58,.3))', background: 'var(--color-error-muted, rgba(255,69,58,.08))',
                  color: 'var(--color-error)', cursor: 'pointer',
                }}
              >
                Reset All Learning Data
              </button>
            </div>
          </>
        )}

        {/* ── POWER TAB ──────────────────────────────────────────────── */}
        {tab === 'power' && (
          <>
            {/* System Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: isCharging ? '#30D158' : batteryLevel > 20 ? '#5AC8FA' : '#FF453A',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{batteryLevel}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                  {isCharging ? 'Charging' : 'Battery'}
                </div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: cpuUsage > 80 ? '#FF453A' : cpuUsage > 50 ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{cpuUsage}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>CPU</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: memoryUsage > 80 ? '#FF453A' : memoryUsage > 60 ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{memoryUsage}%</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Memory</div>
              </div>
              <div style={{ ...CARD, textAlign: 'center' as const, position: 'relative' as const }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: restrictedMode ? '#FF9500' : '#30D158',
                }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{restrictedMode ? 'ON' : 'OFF'}</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Restrictions</div>
              </div>
            </div>

            {/* Power Profiles */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Power Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {POWER_PROFILES.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => changePowerProfile(profile.id)}
                    style={{
                      padding: '14px var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      border: powerProfile === profile.id ? `2px solid ${profile.color}` : '2px solid transparent',
                      background: powerProfile === profile.id ? `${profile.color}15` : 'var(--color-bg-hover, rgba(255,255,255,.03))',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <DexIcon name={profile.icon as any} size={18} color={profile.color} />
                      <span style={{ fontWeight: 600, fontSize: 13, color: powerProfile === profile.id ? profile.color : 'inherit' }}>
                        {profile.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.4 }}>{profile.description}</div>
                    {powerProfile === profile.id && (
                      <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', fontSize: 10, opacity: 0.6 }}>
                        <span>CPU: {profile.cpuLimit}%</span>
                        <span>GPU: {profile.gpuLimit}%</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Restriction Controls */}
            <div style={CARD}>
              <div style={CARD_TITLE}>Operation Mode</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    {restrictedMode ? 'Restricted Mode' : 'Unrestricted Mode'}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>
                    {restrictedMode 
                      ? 'Some operations are limited to save power and resources'
                      : 'All operations run at full capacity'}
                  </div>
                </div>
                <button
                  onClick={toggleRestrictions}
                  style={{
                    padding: 'var(--space-2) var(--space-4)', fontSize: 12, fontWeight: 600, borderRadius: 10,
                    border: 'none', cursor: 'pointer',
                    background: restrictedMode ? 'rgba(255,69,58,.15)' : 'rgba(48,209,88,.15)',
                    color: restrictedMode ? '#FF453A' : '#30D158',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {restrictedMode ? 'Disable Restrictions' : 'Enable Restrictions'}
                </button>
              </div>
              
              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
                {[
                  { label: 'Clear Cache', icon: 'trash', action: 'cache:clear' },
                  { label: 'Optimize', icon: 'zap', action: 'system:optimize' },
                  { label: 'Refresh', icon: 'refresh-cw', action: 'system:refresh' },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => (window as any).electron?.invoke?.(item.action)}
                    style={{
                      padding: '10px var(--space-3)', borderRadius: 10, border: 'none',
                      background: 'var(--color-bg-hover, rgba(255,255,255,.05))', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 11, color: 'inherit', transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,.1))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,.05))')}
                  >
                    <DexIcon name={item.icon as any} size={14} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default memo(Learn);
