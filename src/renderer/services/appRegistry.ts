// =============================================================================
// DEX Platform — App registry (capabilities)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Extends APP_DEFINITIONS (identity: name, icon, colour, category, version)
// with what the shell needs to build launchers, search and context menus:
// window configuration, pinning eligibility, "open in window" support, where
// an app's settings live, and its registered quick actions.
//
// Quick actions are declared here AND implemented by the app through
// registerAppIntentHandler (services/appIntents.ts). Only list an action once
// the app's handler performs it — tests/unit/app-registry.test.ts checks the
// two stay in step.

import { APP_DEFINITIONS } from '../store/runningApps';

export type AppCategory = 'system' | 'productivity' | 'creative' | 'media' | 'utility';

export interface AppQuickAction {
  /** Stable id passed to the app's intent handler. */
  id: string;
  label: string;
  icon: string;
  /** Extra search terms. */
  keywords: string[];
}

export type AppSettingsTarget =
  | { kind: 'settings'; section: string }
  | { kind: 'intent'; action: string };

export interface AppWindowConfig { w: number; h: number; maximized?: boolean }

export interface AppEntry {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: AppCategory | undefined;
  description?: string;
  version?: string;
  buildDate?: string;
  shortcut?: string;
  pinnable: boolean;
  /** The shell can float the app in its own window. */
  supportsWindow: boolean;
  settings?: AppSettingsTarget;
  actions: AppQuickAction[];
  window?: AppWindowConfig;
}

/** Default floating window sizes per app (used on restore/detach). */
export const APP_WINDOW_SIZES: Record<string, AppWindowConfig> = {
  // New launches open in the full inner workspace; these sizes are used when
  // users explicitly restore/detach.
  browser: { w: 900, h: 600 },
  // Ledger: room for sidebar + 6-column table + inspector; usable down to ~480px wide.
  ledger: { w: 1180, h: 760 },
  files: { w: 800, h: 550 },
  gallery: { w: 800, h: 550 },
  settings: { w: 920, h: 620 },
  taskmanager: { w: 880, h: 600 },
  notes: { w: 700, h: 500 },
  videoeditor: { w: 900, h: 600, maximized: true },
  imosion: { w: 850, h: 580, maximized: true },
  prism: { w: 850, h: 580, maximized: true },
  flux: { w: 850, h: 580, maximized: true },
  forge: { w: 850, h: 580, maximized: true },
  audio: { w: 800, h: 550 },
  rewind: { w: 720, h: 500 },
  tasks: { w: 680, h: 480 },
  workflows: { w: 720, h: 500 },
  store: { w: 900, h: 640 },
  games: { w: 900, h: 640 },
  calendar: { w: 680, h: 480 },
  kanban: { w: 720, h: 500 },
  // Compact utilities: sized to their measured content (preview, 2026-11-04)
  // so nothing opens clipped; fitWindowToWorkspace shrinks them on small screens.
  calculator: { w: 360, h: 610 },
  passwordgenerator: { w: 440, h: 720 },
  achievements: { w: 600, h: 460 },
  recyclebin: { w: 600, h: 460 },
  powerrename: { w: 940, h: 620 },
  transfers: { w: 600, h: 460 },
  power: { w: 780, h: 520 },
  axl: { w: 1000, h: 650, maximized: true },
  stopwatch: { w: 340, h: 480 },
  unitconverter: { w: 440, h: 780 },
  pomodoro: { w: 360, h: 520 },
  qrcode: { w: 400, h: 664 },
  colorpicker: { w: 360, h: 610 },
  weather: { w: 400, h: 600 },
  worldclock: { w: 500, h: 744 },
  noisegenerator: { w: 420, h: 710 },
  dexcode: { w: 900, h: 620 },
  nexus: { w: 900, h: 650 },
  learn: { w: 600, h: 520 },
  collabhub: { w: 900, h: 650 },
  canvas: { w: 800, h: 600, maximized: true },
  timer: { w: 360, h: 520 },
  screenrecorder: { w: 720, h: 540 },
  presentation: { w: 1100, h: 700, maximized: true },
  pdfviewer: { w: 900, h: 650, maximized: true },
  pixelart: { w: 900, h: 640, maximized: true },
  maps: { w: 960, h: 660 },
  git: { w: 820, h: 620 },
  env: { w: 760, h: 600 },
  ssh: { w: 760, h: 640 },
  backup: { w: 760, h: 700 },
};

// Last size the user gave each app's floating window, so it reopens the same.
const SIZE_KEY = 'dex-app-window-sizes';
let sizeCache: Record<string, { w: number; h: number }> | null = null;
let sizeTimer: ReturnType<typeof setTimeout> | null = null;

function sizes(): Record<string, { w: number; h: number }> {
  if (sizeCache) return sizeCache;
  try {
    const raw = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}');
    sizeCache = raw && typeof raw === 'object' ? raw : {};
  } catch { sizeCache = {}; }
  return sizeCache!;
}

export function rememberedWindowSize(appId: string): { w: number; h: number } | null {
  const s = sizes()[appId];
  return s && Number.isFinite(s.w) && Number.isFinite(s.h) && s.w >= 280 && s.h >= 200 ? s : null;
}

export function rememberWindowSize(appId: string, w: number, h: number): void {
  const cur = sizes();
  const rw = Math.round(w), rh = Math.round(h);
  if (cur[appId]?.w === rw && cur[appId]?.h === rh) return;
  cur[appId] = { w: rw, h: rh };
  if (sizeTimer) clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(cur)); } catch { /* quota */ } }, 400);
}

export const QUICK_ACTIONS: Record<string, AppQuickAction[]> = {
  ledger: [
    { id: 'new-transaction', label: 'New Transaction', icon: 'plus', keywords: ['expense', 'income', 'spend', 'payment', 'add'] },
    { id: 'open-budget', label: 'Open Budget', icon: 'pie-chart', keywords: ['budget', 'envelope', 'assign'] },
    { id: 'import-csv', label: 'Import CSV', icon: 'import', keywords: ['bank', 'statement', 'csv', 'import'] },
    { id: 'open-reports', label: 'Open Reports', icon: 'bar-chart-2', keywords: ['report', 'spending', 'cash flow'] },
  ],
  notes: [
    { id: 'new-note', label: 'New Note', icon: 'plus', keywords: ['note', 'write', 'create'] },
    { id: 'search-notes', label: 'Search Notes', icon: 'search', keywords: ['find', 'note'] },
  ],
  dexcode: [
    { id: 'open-project', label: 'Open Project', icon: 'folder-open', keywords: ['folder', 'workspace', 'code'] },
    { id: 'new-file', label: 'New File', icon: 'file-plus', keywords: ['code', 'script', 'create'] },
  ],
  browser: [
    { id: 'new-tab', label: 'New Tab', icon: 'plus', keywords: ['web', 'tab', 'page'] },
    { id: 'open-url', label: 'Open URL', icon: 'link', keywords: ['address', 'website', 'go to', 'web'] },
  ],
};

const SETTINGS: Record<string, AppSettingsTarget> = {
  browser: { kind: 'settings', section: 'browser' },
  files: { kind: 'settings', section: 'files' },
  uki: { kind: 'settings', section: 'uki' },
  nexus: { kind: 'settings', section: 'nexus' },
  videoeditor: { kind: 'settings', section: 'creativeapps' },
  imosion: { kind: 'settings', section: 'creativeapps' },
  prism: { kind: 'settings', section: 'creativeapps' },
  flux: { kind: 'settings', section: 'creativeapps' },
  forge: { kind: 'settings', section: 'creativeapps' },
  axl: { kind: 'settings', section: 'creativeapps' },
  ledger: { kind: 'intent', action: 'open-settings' },
};

/** Ids that are part of the shell itself, not launchable/pinnable apps. */
const NOT_PINNABLE = new Set(['home']);

export function getAppEntry(id: string): AppEntry | null {
  const def = APP_DEFINITIONS[id];
  if (!def) return null;
  return {
    id,
    name: def.name,
    icon: def.icon || id,
    color: def.color,
    category: def.category,
    description: def.description,
    version: def.version,
    buildDate: def.buildDate,
    shortcut: def.shortcut,
    pinnable: !NOT_PINNABLE.has(id),
    supportsWindow: id !== 'home',
    settings: SETTINGS[id],
    actions: QUICK_ACTIONS[id] || [],
    window: APP_WINDOW_SIZES[id],
  };
}

export function isPinnable(id: string): boolean {
  return !!APP_DEFINITIONS[id] && !NOT_PINNABLE.has(id);
}

export function getQuickActions(id: string): AppQuickAction[] {
  return QUICK_ACTIONS[id] || [];
}

export const CATEGORY_LABEL: Record<AppCategory, string> = {
  system: 'System', productivity: 'Productivity', creative: 'Creative', media: 'Media', utility: 'Utilities',
};

export interface AppSearchHit {
  kind: 'app' | 'action';
  appId: string;
  actionId?: string;
  label: string;
  detail: string;
  icon: string;
  score: number;
}

function scoreText(q: string, text: string): number {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s&/-]+/).some(w => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return 0;
}

/**
 * Local search over app names, categories and registered actions. Matching
 * is by prefix/word/substring only (no fuzzy guessing), so an ambiguous query
 * never silently resolves to an unrelated action: Enter runs the TOP hit only,
 * and actions rank below an equally good app-name match.
 */
export function searchApps(query: string, ids: string[]): AppSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: AppSearchHit[] = [];
  for (const id of ids) {
    const e = getAppEntry(id);
    if (!e) continue;
    const cat = e.category ? CATEGORY_LABEL[e.category] : '';
    const nameScore = scoreText(q, e.name);
    const s = Math.max(nameScore ? nameScore + 5 : 0, scoreText(q, id), cat ? Math.max(0, scoreText(q, cat) - 25) : 0, e.description ? Math.max(0, scoreText(q, e.description) - 30) : 0);
    if (s > 0) hits.push({ kind: 'app', appId: id, label: e.name, detail: cat, icon: e.icon, score: s });
    for (const a of e.actions) {
      const as = Math.max(scoreText(q, a.label), ...a.keywords.map(k => Math.max(0, scoreText(q, k) - 10)), scoreText(q, `${e.name} ${a.label}`));
      if (as > 0) hits.push({ kind: 'action', appId: id, actionId: a.id, label: a.label, detail: e.name, icon: a.icon, score: as - 2 });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40);
}
