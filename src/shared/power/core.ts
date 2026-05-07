// =============================================================================
// DEX Platform - DEX v3.10.0 wave Z - power-user weird mode primitives
// =============================================================================

// ---- modal vim bar ----
export type VimMode = 'normal'|'insert'|'visual'|'command';
export interface VimState { mode: VimMode; cursor: number; buffer: string }
export function vimTransition(state: VimState, key: string): VimState {
  if (state.mode === 'normal') {
    if (key === 'i') return { ...state, mode: 'insert' };
    if (key === 'v') return { ...state, mode: 'visual' };
    if (key === ':') return { ...state, mode: 'command' };
    if (key === 'h') return { ...state, cursor: Math.max(0, state.cursor - 1) };
    if (key === 'l') return { ...state, cursor: Math.min(state.buffer.length, state.cursor + 1) };
  }
  if (state.mode !== 'normal' && key === 'Escape') return { ...state, mode: 'normal' };
  return state;
}

// ---- verb-noun grammar ----
export interface ParsedCommand { verb: string; noun: string; modifier?: string }
export function parseVerbNoun(input: string): ParsedCommand | null {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { verb: parts[0], noun: parts[1], modifier: parts.slice(2).join(' ') || undefined };
}

// ---- leader key chord ----
export interface LeaderChord { keys: readonly string[]; action: string }
export function matchChord(pressed: readonly string[], chords: readonly LeaderChord[]): string | null {
  for (const c of chords) {
    if (c.keys.length === pressed.length && c.keys.every((k, i) => k === pressed[i])) return c.action;
  }
  return null;
}

// ---- keybinding packs ----
export type KeybindingPack = 'logic'|'premiere'|'after-effects'|'blender'|'default';
export const PACKS: Record<KeybindingPack, Readonly<Record<string, string>>> = {
  logic:        { 'Space':'play', 'R':'record', 'B':'bounce', 'M':'mute' },
  premiere:     { 'Space':'play', 'C':'razor',  'V':'select', 'M':'marker' },
  'after-effects': { 'Space':'preview', 'U':'reveal', 'P':'position', 'R':'rotation' },
  blender:      { 'G':'grab', 'R':'rotate', 'S':'scale', 'Tab':'mode' },
  default:      { 'Space':'play', 'Escape':'cancel' },
};
export function lookupBinding(pack: KeybindingPack, key: string): string | undefined { return PACKS[pack][key]; }

// ---- marks + registers + multi-cursor ----
export interface MarkSet { marks: ReadonlyMap<string, number> }
export function setMark(s: MarkSet, name: string, pos: number): MarkSet {
  const m = new Map(s.marks); m.set(name, pos); return { marks: m };
}
export interface MultiCursor { positions: readonly number[] }
export function addCursor(mc: MultiCursor, pos: number): MultiCursor {
  return { positions: [...new Set([...mc.positions, pos])].sort((a, b) => a - b) };
}

// ---- snippets ----
export function expandSnippet(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\$\{(\w+)\}/g, (_m, k) => vars[k] ?? '');
}

// ---- keystroke heatmap ----
export function buildHeatmap(events: readonly { key: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) out.set(e.key, (out.get(e.key) ?? 0) + 1);
  return out;
}

// ---- workspaces snapshot ----
export interface WorkspaceSnapshot { id: string; layout: string; openFiles: readonly string[] }

// ---- cross-app clipboard ring ----
export interface ClipRing { items: readonly string[]; max: number }
export function pushClip(ring: ClipRing, item: string): ClipRing {
  const items = [item, ...ring.items.filter((i) => i !== item)].slice(0, ring.max);
  return { items, max: ring.max };
}

// ---- infinite whiteboard pan/zoom ----
export interface ViewTransform { x: number; y: number; zoom: number }
export function panZoom(t: ViewTransform, dx: number, dy: number, dz: number): ViewTransform {
  return { x: t.x + dx, y: t.y + dy, zoom: Math.max(0.05, Math.min(64, t.zoom * Math.exp(dz))) };
}

// ---- mind map nodes ----
export interface MindNode { id: string; text: string; childIds: readonly string[] }
export function addChild(parent: MindNode, childId: string): MindNode {
  return { ...parent, childIds: [...parent.childIds, childId] };
}

// ---- outline indent ops ----
export interface OutlineItem { id: string; text: string; depth: number }
export function indent(items: readonly OutlineItem[], id: string, delta: number): OutlineItem[] {
  return items.map((i) => i.id === id ? { ...i, depth: Math.max(0, i.depth + delta) } : i);
}

// ---- SRS flashcards (SM-2) ----
export interface SrsCard { id: string; ease: number; interval: number; reps: number }
export function reviewCard(card: SrsCard, quality: number): SrsCard {
  if (quality < 3) return { ...card, reps: 0, interval: 1, ease: card.ease };
  const reps = card.reps + 1;
  let interval: number;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = 6;
  else interval = Math.round(card.interval * card.ease);
  const ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return { id: card.id, ease, interval, reps };
}

// ---- auto-organize by extension ----
const EXT_BUCKETS: Record<string, string> = {
  jpg:'images', jpeg:'images', png:'images', gif:'images', webp:'images',
  mp4:'video', mov:'video', mkv:'video', webm:'video',
  mp3:'audio', wav:'audio', flac:'audio', aiff:'audio',
  pdf:'docs', doc:'docs', docx:'docs', txt:'docs', md:'docs',
};
export function classifyFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_BUCKETS[ext] ?? 'other';
}

// ---- dedupe by hash ----
export function dedupeByHash<T extends { hash: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const i of items) if (!seen.has(i.hash)) { seen.add(i.hash); out.push(i); }
  return out;
}

// ---- treemap (simple slice-and-dice) ----
export interface TreemapInput { id: string; size: number }
export interface TreemapRect { id: string; x: number; y: number; w: number; h: number }
export function sliceTreemap(items: readonly TreemapInput[], width: number, height: number): TreemapRect[] {
  const total = items.reduce((s, i) => s + i.size, 0);
  if (total === 0) return [];
  const horizontal = width >= height;
  let offset = 0; const rects: TreemapRect[] = [];
  for (const item of items) {
    const frac = item.size / total;
    if (horizontal) {
      const w = width * frac;
      rects.push({ id: item.id, x: offset, y: 0, w, h: height });
      offset += w;
    } else {
      const h = height * frac;
      rects.push({ id: item.id, x: 0, y: offset, w: width, h });
      offset += h;
    }
  }
  return rects;
}

// ---- ADHD module ----
export interface VisualTimer { remainingSec: number; totalSec: number; phase: 'work'|'break' }
export function tickTimer(t: VisualTimer, dt: number, breakSec: number): VisualTimer {
  const r = t.remainingSec - dt;
  if (r > 0) return { ...t, remainingSec: r };
  if (t.phase === 'work') return { remainingSec: breakSec, totalSec: breakSec, phase: 'break' };
  return { remainingSec: t.totalSec, totalSec: t.totalSec, phase: 'work' };
}
export const SENSORY_LOW_PALETTE = { bg: '#1a1a1f', fg: '#cfd0d3', accent: '#6a8caf' } as const;
export interface BodyDoubleSession { id: string; startedAt: number; partnerId: string; durationMin: number }
export function shouldTriggerTwentyTwentyTwenty(elapsedMs: number): boolean { return elapsedMs >= 20 * 60 * 1000; }
export function hydrationCadence(weightKg: number): number {
  // returns minutes between sips (~35ml/kg/day, 30ml sip during 16 waking hours)
  const dailyMl = weightKg * 35;
  const sipsPerDay = dailyMl / 30;
  return (16 * 60) / sipsPerDay;
}

// ---- crazy mode: pick random unused feature ----
export function pickRandomUnused(features: readonly string[], usedIds: ReadonlyArray<string>, rng: () => number): string | null {
  const used = new Set(usedIds);
  const pool = features.filter((f) => !used.has(f));
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}
