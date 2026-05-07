// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UI surface primitives — wave H.
 *
 * Pure data + planners that drive surfaces we have not yet polished:
 * empty states, command-palette ranking, contextual keyboard map,
 * focus ring tokens, and a unified toast manager. No DOM, no React.
 */

// DEX v3.8.9 wave H - UI surface primitives

// -------- empty-state catalogue ------------------------------------------

export type EmptyStateKey =
  | 'notes' | 'tasks' | 'files' | 'workflows' | 'vinx' | 'axl'
  | 'rewind' | 'forge' | 'imosion' | 'flux' | 'prism' | 'gallery'
  | 'nexus' | 'plugins' | 'devices' | 'activity' | 'trash' | 'search';

export interface EmptyState {
  key: EmptyStateKey;
  title: string;
  body: string;
  /** One-click suggested action label. Routed by the surface. */
  cta: string;
  /** Stable action id the renderer maps to a handler. */
  ctaAction: string;
}

const EMPTY_STATES: Record<EmptyStateKey, EmptyState> = {
  notes:     { key: 'notes',     title: 'No notes yet', body: 'Capture a thought, link it later.', cta: 'New note', ctaAction: 'notes.new' },
  tasks:     { key: 'tasks',     title: 'Inbox zero', body: 'Add a task to start your day.', cta: 'New task', ctaAction: 'tasks.new' },
  files:     { key: 'files',     title: 'No files here', body: 'Drop files in or import from anywhere.', cta: 'Import files', ctaAction: 'files.import' },
  workflows: { key: 'workflows', title: 'No workflows', body: 'Chain steps so DEX runs them on a click.', cta: 'New workflow', ctaAction: 'workflows.new' },
  vinx:      { key: 'vinx',      title: 'No clips yet', body: 'Drop a video to start cutting.', cta: 'Open clip', ctaAction: 'vinx.open' },
  axl:       { key: 'axl',       title: 'No models', body: 'Start a sketch or import STEP / STL.', cta: 'New sketch', ctaAction: 'axl.new' },
  rewind:    { key: 'rewind',    title: 'Quiet so far', body: 'Activity will appear as you work.', cta: 'Configure', ctaAction: 'rewind.settings' },
  forge:     { key: 'forge',     title: 'No projects', body: 'Open a folder to start coding.', cta: 'Open folder', ctaAction: 'forge.open' },
  imosion:   { key: 'imosion',   title: 'No tracks', body: 'Drop audio or record from mic.', cta: 'New session', ctaAction: 'imosion.new' },
  flux:      { key: 'flux',      title: 'No comps', body: 'Animate any shape, frame by frame.', cta: 'New comp', ctaAction: 'flux.new' },
  prism:     { key: 'prism',     title: 'No images', body: 'Drop an image to edit.', cta: 'Open image', ctaAction: 'prism.open' },
  gallery:   { key: 'gallery',   title: 'Empty gallery', body: 'Photos and videos collect here.', cta: 'Import media', ctaAction: 'gallery.import' },
  nexus:     { key: 'nexus',     title: 'Graph is empty', body: 'Use DEX a little — connections show up.', cta: 'Open guide', ctaAction: 'nexus.help' },
  plugins:   { key: 'plugins',   title: 'No plugins', body: 'Install a plugin or write your own.', cta: 'Browse', ctaAction: 'plugins.browse' },
  devices:   { key: 'devices',   title: 'Just this device', body: 'Sign in elsewhere to sync.', cta: 'Sign in elsewhere', ctaAction: 'devices.help' },
  activity:  { key: 'activity',  title: 'No activity', body: 'Audit events appear here as you work.', cta: 'OK', ctaAction: 'noop' },
  trash:     { key: 'trash',     title: 'Trash is empty', body: 'Deleted items wait here for 30 days.', cta: 'OK', ctaAction: 'noop' },
  search:    { key: 'search',    title: 'No matches', body: 'Try a different word or check spelling.', cta: 'Clear', ctaAction: 'search.clear' },
};

export function getEmptyState(key: EmptyStateKey): EmptyState {
  return EMPTY_STATES[key];
}

export function listEmptyStateKeys(): EmptyStateKey[] {
  return Object.keys(EMPTY_STATES) as EmptyStateKey[];
}

// -------- command-palette ranking ---------------------------------------

export interface PaletteEntry {
  id: string;
  label: string;
  /** Higher = more important. Used to break fuzzy ties. */
  baseWeight?: number;
}

export interface PaletteRecency {
  /** Map of entry id → last-used timestamp. */
  lastUsedAt: Record<string, number>;
}

export function newPaletteRecency(): PaletteRecency {
  return { lastUsedAt: {} };
}

export function markUsed(rec: PaletteRecency, id: string, now: number): PaletteRecency {
  return { lastUsedAt: { ...rec.lastUsedAt, [id]: now } };
}

/**
 * Score a single entry against a query. Pure: no state.
 *
 * Ranking rules (combined by addition):
 *  - Exact label match (case-insensitive): +1000
 *  - Prefix match: +500
 *  - Substring contains: +200
 *  - Subsequence (every query char appears in order): +100
 *  - baseWeight: + entry.baseWeight (default 0)
 *  - Recency boost: +50 if used in last 60s, +25 in 5min, +10 in 1h
 *
 * Returns 0 (no match) or a positive integer.
 */
export function scorePaletteEntry(
  entry: PaletteEntry,
  query: string,
  now: number,
  recency: PaletteRecency
): number {
  const q = query.trim().toLowerCase();
  const label = entry.label.toLowerCase();
  if (q === '') return (entry.baseWeight ?? 0) + recencyBoost(entry.id, now, recency);
  let score = 0;
  if (label === q) score += 1000;
  else if (label.startsWith(q)) score += 500;
  else if (label.includes(q)) score += 200;
  else if (isSubsequence(q, label)) score += 100;
  else return 0;
  score += entry.baseWeight ?? 0;
  score += recencyBoost(entry.id, now, recency);
  return score;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (needle[i] === haystack[j]) i += 1;
  }
  return i === needle.length;
}

function recencyBoost(id: string, now: number, rec: PaletteRecency): number {
  const last = rec.lastUsedAt[id];
  if (last === undefined) return 0;
  const ageMs = now - last;
  if (ageMs < 60_000) return 50;
  if (ageMs < 5 * 60_000) return 25;
  if (ageMs < 60 * 60_000) return 10;
  return 0;
}

/**
 * Rank an entry list against a query. Returns matches in score-desc
 * order, with stable insertion order for ties. Entries with score 0
 * are excluded unless the query is empty (then all entries are listed).
 */
export function rankPalette(
  entries: readonly PaletteEntry[],
  query: string,
  now: number,
  recency: PaletteRecency = newPaletteRecency()
): Array<{ entry: PaletteEntry; score: number }> {
  const scored = entries.map((entry, i) => ({
    entry,
    score: scorePaletteEntry(entry, query, now, recency),
    i,
  }));
  const filtered = query.trim() === ''
    ? scored
    : scored.filter((s) => s.score > 0);
  filtered.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return filtered.map(({ entry, score }) => ({ entry, score }));
}

// -------- contextual keyboard map ---------------------------------------

export type ScopeKey = 'global' | 'notes' | 'tasks' | 'files' | 'forge' | 'nexus' | 'vinx' | 'imosion';

export interface KeyBinding {
  combo: string;          // e.g. "Ctrl+K", "?"
  description: string;
  scope: ScopeKey;
}

const BINDINGS: KeyBinding[] = [
  // global
  { combo: 'Ctrl+K', description: 'Open command launcher', scope: 'global' },
  { combo: 'Ctrl+Space', description: 'Open UKI assistant', scope: 'global' },
  { combo: '/', description: 'Open command menu', scope: 'global' },
  { combo: '?', description: 'Show keyboard map', scope: 'global' },
  { combo: 'Ctrl+,', description: 'Open Settings', scope: 'global' },
  { combo: 'Ctrl+Tab', description: 'Switch app', scope: 'global' },
  { combo: 'Esc', description: 'Close current overlay', scope: 'global' },
  // notes
  { combo: 'Ctrl+N', description: 'New note', scope: 'notes' },
  { combo: 'Ctrl+B', description: 'Bold', scope: 'notes' },
  { combo: 'Ctrl+I', description: 'Italic', scope: 'notes' },
  // tasks
  { combo: 'Ctrl+Enter', description: 'Add task', scope: 'tasks' },
  { combo: 'Space', description: 'Toggle complete', scope: 'tasks' },
  // files
  { combo: 'Enter', description: 'Open selected', scope: 'files' },
  { combo: 'Del', description: 'Move to trash', scope: 'files' },
  { combo: 'F2', description: 'Rename', scope: 'files' },
  // forge
  { combo: 'Ctrl+P', description: 'Quick open file', scope: 'forge' },
  { combo: 'Ctrl+Shift+F', description: 'Find in project', scope: 'forge' },
  // nexus
  { combo: 'F', description: 'Frame view', scope: 'nexus' },
  { combo: '+', description: 'Zoom in', scope: 'nexus' },
  { combo: '-', description: 'Zoom out', scope: 'nexus' },
  // vinx
  { combo: 'J', description: 'Cut at playhead', scope: 'vinx' },
  { combo: 'K', description: 'Play / pause', scope: 'vinx' },
  // imosion
  { combo: 'R', description: 'Record', scope: 'imosion' },
  { combo: 'Space', description: 'Play / pause', scope: 'imosion' },
];

/**
 * Bindings for a scope, with global bindings always included first.
 * Scope === 'global' returns globals only.
 */
export function bindingsFor(scope: ScopeKey): KeyBinding[] {
  if (scope === 'global') return BINDINGS.filter((b) => b.scope === 'global');
  return [
    ...BINDINGS.filter((b) => b.scope === 'global'),
    ...BINDINGS.filter((b) => b.scope === scope),
  ];
}

// -------- focus ring tokens ---------------------------------------------

/** Token-driven focus-ring style for `:focus-visible`. */
export interface FocusRing {
  /** CSS outline shorthand. */
  outline: string;
  outlineOffset: string;
  borderRadius?: string;
}

export const FOCUS_RINGS: Record<'default' | 'inset' | 'destructive', FocusRing> = {
  default:     { outline: '2px solid var(--color-accent)', outlineOffset: '2px' },
  inset:       { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' },
  destructive: { outline: '2px solid var(--color-danger)', outlineOffset: '2px' },
};

// -------- unified toast manager -----------------------------------------

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** When it was created (ms epoch). */
  createdAt: number;
  /** ms until auto-dismiss. 0 = sticky. */
  ttlMs: number;
  /** Optional action button. */
  action?: { label: string; actionId: string };
}

export interface ToastQueue {
  toasts: Toast[];
}

export const DEFAULT_TOAST_TTL_MS: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  warning: 6000,
  error: 8000,
};

export function newToastQueue(): ToastQueue {
  return { toasts: [] };
}

export interface PushToastInput {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  ttlMs?: number;
  action?: { label: string; actionId: string };
  now: number;
}

/**
 * Append a toast. If an id already exists it is replaced (so spamming
 * the same kind of toast does not stack).
 */
export function pushToast(queue: ToastQueue, input: PushToastInput): ToastQueue {
  const ttl = input.ttlMs ?? DEFAULT_TOAST_TTL_MS[input.kind];
  const toast: Toast = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    createdAt: input.now,
    ttlMs: ttl,
    action: input.action,
  };
  const without = queue.toasts.filter((t) => t.id !== input.id);
  return { toasts: [...without, toast] };
}

export function dismissToast(queue: ToastQueue, id: string): ToastQueue {
  return { toasts: queue.toasts.filter((t) => t.id !== id) };
}

/** Drop expired toasts. Sticky (ttlMs === 0) ones are kept. */
export function expireToasts(queue: ToastQueue, now: number): ToastQueue {
  return {
    toasts: queue.toasts.filter((t) => t.ttlMs === 0 || now - t.createdAt < t.ttlMs),
  };
}
