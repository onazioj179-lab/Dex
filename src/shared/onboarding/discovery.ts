// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Onboarding & discovery primitives — wave O.
 *
 *  - Tour step machine (next/prev/skip/restart)
 *  - "Try this" cards catalogue
 *  - Tip-of-the-day rotator (deterministic by date seed)
 *  - "?" search index (fuzzy keyword matching)
 *  - First-run checklist with completion tracking
 *
 * No DOM, no React. All state is pure data.
 */

// DEX v3.8.9 wave O - onboarding & discovery

// -------- tour state machine ---------------------------------------

export interface TourStep {
  id: string;
  /** Anchor selector or registry id; UI is free to interpret. */
  anchor: string;
  title: string;
  body: string;
  /** True for steps that block until acknowledged (no skip). */
  required?: boolean;
}

export type TourStatus = 'idle' | 'running' | 'complete' | 'skipped';

export interface TourState {
  steps: readonly TourStep[];
  index: number;
  status: TourStatus;
}

export function newTour(steps: readonly TourStep[]): TourState {
  return { steps, index: 0, status: steps.length === 0 ? 'complete' : 'idle' };
}

export function startTour(tour: TourState): TourState {
  if (tour.steps.length === 0) return tour;
  return { ...tour, status: 'running', index: 0 };
}

export function nextStep(tour: TourState): TourState {
  if (tour.status !== 'running') return tour;
  const next = tour.index + 1;
  if (next >= tour.steps.length) return { ...tour, status: 'complete' };
  return { ...tour, index: next };
}

export function prevStep(tour: TourState): TourState {
  if (tour.status !== 'running') return tour;
  return { ...tour, index: Math.max(0, tour.index - 1) };
}

export function skipTour(tour: TourState): TourState {
  if (tour.status !== 'running') return tour;
  if (currentStep(tour)?.required) return tour; // cannot skip a required step
  return { ...tour, status: 'skipped' };
}

export function restartTour(tour: TourState): TourState {
  return { ...tour, index: 0, status: 'running' };
}

export function currentStep(tour: TourState): TourStep | null {
  if (tour.status !== 'running') return null;
  return tour.steps[tour.index] ?? null;
}

/** Progress in [0,1]. Complete = 1. */
export function tourProgress(tour: TourState): number {
  if (tour.status === 'complete') return 1;
  if (tour.steps.length === 0) return 1;
  return tour.index / tour.steps.length;
}

// -------- try-this catalogue ---------------------------------------

export interface TryCard {
  id: string;
  /** App or surface this lives in (e.g. 'notes', 'files', 'global'). */
  scope: string;
  title: string;
  body: string;
  /** Action invoked on click. */
  action: { kind: 'command'; commandId: string } | { kind: 'open-url'; url: string };
  /** Skill ids that, when used, mark this card as satisfied. */
  satisfiedBy?: readonly string[];
}

export const TRY_CARDS: readonly TryCard[] = [
  {
    id: 'notes.summarise',
    scope: 'notes',
    title: 'Summarise a note in one click',
    body: 'Open any long note and press the magic button to get a 3-sentence summary.',
    action: { kind: 'command', commandId: 'notes.summarise' },
    satisfiedBy: ['notes.summarise'],
  },
  {
    id: 'files.search',
    scope: 'files',
    title: 'Find files by what they say, not what they are named',
    body: 'Hit Ctrl+K and type what the file is about — DEX searches inside.',
    action: { kind: 'command', commandId: 'palette.open' },
    satisfiedBy: ['files.semanticSearch'],
  },
  {
    id: 'nexus.connect',
    scope: 'nexus',
    title: 'Map your knowledge',
    body: 'Drag two related items onto the canvas — DEX connects them.',
    action: { kind: 'command', commandId: 'nexus.open' },
  },
  {
    id: 'palette.help',
    scope: 'global',
    title: 'See every keyboard shortcut',
    body: 'Press ? to open the shortcut cheat sheet.',
    action: { kind: 'command', commandId: 'shortcuts.show' },
  },
  {
    id: 'autosave.recover',
    scope: 'global',
    title: 'Recover unsaved work',
    body: 'DEX autosaves every 60 seconds — find your snapshots in the recents panel.',
    action: { kind: 'command', commandId: 'recents.open' },
  },
];

export function tryCardsByScope(scope: string): TryCard[] {
  return TRY_CARDS.filter((c) => c.scope === scope);
}

// -------- tip-of-the-day rotator -----------------------------------

export interface DailyTip {
  id: string;
  title: string;
  body: string;
}

export const DAILY_TIPS: readonly DailyTip[] = [
  { id: 'tip.cmdk', title: 'Quick palette', body: 'Ctrl+K opens the command palette anywhere in DEX.' },
  { id: 'tip.dndcopy', title: 'Drag = move, Ctrl+drag = copy', body: 'Files inside the same root move; across roots they copy.' },
  { id: 'tip.autosave', title: 'Autosave every minute', body: 'Snapshots are local first — drop them later if you do not want history.' },
  { id: 'tip.split', title: 'Split your view', body: 'Drag a tab sideways to split the editor.' },
  { id: 'tip.shortcut', title: 'Discoverable shortcuts', body: 'Hover any toolbar icon to see its shortcut.' },
  { id: 'tip.theme', title: 'Color-blind palettes', body: 'Settings → Accessibility offers palettes safe for protanopia, deuteranopia, and tritanopia.' },
  { id: 'tip.search', title: 'Search inside files', body: 'Files app indexes content — search returns matches by meaning, not just name.' },
  { id: 'tip.collab', title: 'Cursor presence', body: 'When collaborators are in a doc, you see their cursor live.' },
];

/** Deterministic tip for a given calendar day. Same date → same tip. */
export function tipForDay(yyyymmdd: string, tips: readonly DailyTip[] = DAILY_TIPS): DailyTip {
  if (tips.length === 0) throw new RangeError('tips array is empty');
  // Simple djb2 hash of the date string for stability.
  let h = 5381;
  for (let i = 0; i < yyyymmdd.length; i++) {
    h = ((h << 5) + h + yyyymmdd.charCodeAt(i)) >>> 0;
  }
  return tips[h % tips.length];
}

// -------- "?" search index ----------------------------------------

export interface HelpEntry {
  id: string;
  title: string;
  /** Searchable keywords (lowercase). */
  keywords: readonly string[];
  /** Section/category for grouping. */
  category: string;
  /** What to do when picked. */
  action: { kind: 'command'; commandId: string } | { kind: 'doc'; docId: string };
}

export interface HelpHit {
  entry: HelpEntry;
  score: number;
}

/**
 * Search the help index. Scoring:
 *   +50 for each keyword that starts with the query token
 *   +30 for each keyword containing the query token
 *   +20 if the title contains the token
 *   +10 if the title contains all tokens (combo bonus)
 * Tokens are split on whitespace, lowercased, deduped.
 */
export function searchHelp(query: string, entries: readonly HelpEntry[]): HelpHit[] {
  const tokens = Array.from(new Set(
    query.toLowerCase().split(/\s+/).filter((t) => t.length > 0)
  ));
  if (tokens.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const e of entries) {
    let score = 0;
    const titleLower = e.title.toLowerCase();
    let allInTitle = true;
    for (const t of tokens) {
      let tokenScore = 0;
      for (const kw of e.keywords) {
        if (kw.startsWith(t)) tokenScore += 50;
        else if (kw.includes(t)) tokenScore += 30;
      }
      if (titleLower.includes(t)) tokenScore += 20;
      else allInTitle = false;
      if (tokenScore === 0) {
        // Token missed entirely — penalise but do not zero out
        allInTitle = false;
      }
      score += tokenScore;
    }
    if (allInTitle) score += 10;
    if (score > 0) hits.push({ entry: e, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// -------- first-run checklist --------------------------------------

export interface ChecklistItem {
  id: string;
  title: string;
  /** Optional dependency: completing this requires one of these first. */
  requires?: readonly string[];
}

export const FIRST_RUN_CHECKLIST: readonly ChecklistItem[] = [
  { id: 'sign-in', title: 'Sign in or continue offline' },
  { id: 'theme', title: 'Pick a theme' },
  { id: 'shortcuts', title: 'See keyboard shortcuts' },
  { id: 'first-note', title: 'Create your first note', requires: ['sign-in'] },
  { id: 'first-search', title: 'Try semantic search', requires: ['first-note'] },
];

export interface ChecklistState {
  items: readonly ChecklistItem[];
  completed: ReadonlySet<string>;
}

export function newChecklist(items: readonly ChecklistItem[] = FIRST_RUN_CHECKLIST): ChecklistState {
  return { items, completed: new Set() };
}

export function completeChecklistItem(state: ChecklistState, id: string): ChecklistState {
  // Block completion if a dependency is missing.
  const item = state.items.find((i) => i.id === id);
  if (!item) return state;
  if (item.requires) {
    for (const dep of item.requires) {
      if (!state.completed.has(dep)) return state;
    }
  }
  const next = new Set(state.completed);
  next.add(id);
  return { ...state, completed: next };
}

export function checklistProgress(state: ChecklistState): number {
  if (state.items.length === 0) return 1;
  return state.completed.size / state.items.length;
}
