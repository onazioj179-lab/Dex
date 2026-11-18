// =============================================================================
// DEX Bio Engineering Studio — project model, undo history, persistence
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import { MAX_FEATURES, type SeqFeature, type SequenceKind } from './bioScience';

/** Where a sequence came from — shown next to every value derived from it. */
export type SequenceSource = 'entered' | 'imported' | 'sample' | 'derived';

export interface BioSequence {
  id: string;
  name: string;
  /** Cleaned residues (nucleotides stored as DNA, A/C/G/T/N). */
  seq: string;
  kind: SequenceKind;
  /** Nucleotide topology: true for a plasmid or other closed circle. Absent = linear. */
  circular?: boolean;
  /** Annotations (from a GenBank import). Cleared when the residues are edited. */
  features?: SeqFeature[];
  source: SequenceSource;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** A frozen snapshot of calculated results the user chose to keep. */
export interface SavedResult {
  id: string;
  sequenceId: string;
  sequenceName: string;
  title: string;
  createdAt: number;
  /** Label → value with units, exactly as displayed when saved. */
  values: Record<string, string>;
  /** Fingerprint of the residues the values were calculated from (reproducibility). */
  inputDigest?: string;
  /** DEX version that calculated them. */
  appVersion?: string;
}

/** Stable FNV-1a fingerprint of a sequence's residues + topology. */
export function sequenceDigest(seq: string, circular = false): string {
  let h = 0x811c9dc5;
  const text = `${circular ? 'c' : 'l'}:${seq}`;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${seq.length}-${h.toString(16).padStart(8, '0')}`;
}

/** True when a saved result no longer matches its sequence (edited or deleted). */
export function resultIsStale(r: SavedResult, seqs: readonly BioSequence[]): 'changed' | 'deleted' | null {
  const s = seqs.find((x) => x.id === r.sequenceId);
  if (!s) return 'deleted';
  if (r.inputDigest && r.inputDigest !== sequenceDigest(s.seq, !!s.circular)) return 'changed';
  return null;
}

export interface BioProject {
  version: 1;
  name: string;
  sequences: BioSequence[];
  results: SavedResult[];
  activeId: string | null;
}

export const BIO_PROJECT_KEY = 'dex-bio-project-v1';
const HISTORY_LIMIT = 100;

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function emptyProject(): BioProject {
  return { version: 1, name: 'Untitled project', sequences: [], results: [], activeId: null };
}

/** Validate untrusted JSON (a restored file or old storage). Throws with a reason. */
export function normalizeProject(input: unknown): BioProject {
  if (!input || typeof input !== 'object') throw new Error('Not a DEX Bio project file.');
  const o = input as Record<string, unknown>;
  if (o.version !== 1) throw new Error(`Unsupported project version: ${String(o.version)}.`);
  if (!Array.isArray(o.sequences)) throw new Error('The project has no sequence list.');
  const kinds: SequenceKind[] = ['dna', 'rna', 'protein'];
  const sources: SequenceSource[] = ['entered', 'imported', 'sample', 'derived'];
  const sequences: BioSequence[] = o.sequences.map((s, i) => {
    const r = (s ?? {}) as Record<string, unknown>;
    if (typeof r.seq !== 'string') throw new Error(`Sequence ${i + 1} has no residues.`);
    return {
      id: typeof r.id === 'string' ? r.id : newId('seq'),
      name: typeof r.name === 'string' && r.name ? r.name : `Sequence ${i + 1}`,
      seq: r.seq.toUpperCase(),
      kind: kinds.includes(r.kind as SequenceKind) ? (r.kind as SequenceKind) : 'dna',
      ...(r.circular === true && r.kind !== 'protein' ? { circular: true } : {}),
      ...featuresOf(r.features, r.seq.length),
      source: sources.includes(r.source as SequenceSource) ? (r.source as SequenceSource) : 'imported',
      notes: typeof r.notes === 'string' ? r.notes : '',
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    };
  });
  const results: SavedResult[] = Array.isArray(o.results)
    ? o.results.filter((x): x is SavedResult => !!x && typeof x === 'object' && typeof (x as SavedResult).id === 'string' && typeof (x as SavedResult).values === 'object')
    : [];
  const activeId = typeof o.activeId === 'string' && sequences.some((s) => s.id === o.activeId)
    ? o.activeId
    : sequences[0]?.id ?? null;
  return { version: 1, name: typeof o.name === 'string' && o.name ? o.name : 'Untitled project', sequences, results, activeId };
}

/** Keep only well-formed features that lie inside the sequence. */
function featuresOf(input: unknown, length: number): { features?: SeqFeature[] } {
  if (!Array.isArray(input)) return {};
  const features: SeqFeature[] = [];
  for (const x of input) {
    if (features.length >= MAX_FEATURES) break;
    const f = (x ?? {}) as Record<string, unknown>;
    const start = Number(f.start);
    const end = Number(f.end);
    if (typeof f.type !== 'string' || typeof f.location !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < 1 || end < start || end > length) continue;
    features.push({
      type: f.type.slice(0, 40), location: f.location.slice(0, 2000), start, end,
      strand: f.strand === -1 ? -1 : 1,
      label: typeof f.label === 'string' ? f.label.slice(0, 120) : f.type,
      partial: f.partial === true,
    });
  }
  return features.length ? { features } : {};
}

export function loadProject(storage: Pick<Storage, 'getItem'> | null = safeStorage()): BioProject {
  try {
    const raw = storage?.getItem(BIO_PROJECT_KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : emptyProject();
  } catch {
    return emptyProject();
  }
}

export function saveProject(p: BioProject, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(BIO_PROJECT_KEY, JSON.stringify(p));
    return !!storage;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Actions + undo history
// ---------------------------------------------------------------------------

export type BioAction =
  | { type: 'add'; sequences: Omit<BioSequence, 'id' | 'createdAt' | 'updatedAt'>[] }
  | { type: 'update'; id: string; patch: Partial<Pick<BioSequence, 'name' | 'seq' | 'notes' | 'kind' | 'circular'>> }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'rename-project'; name: string }
  | { type: 'save-result'; result: Omit<SavedResult, 'id' | 'createdAt'> }
  | { type: 'remove-result'; id: string }
  | { type: 'replace'; project: BioProject };

export function applyAction(p: BioProject, a: BioAction, now = Date.now()): BioProject {
  switch (a.type) {
    case 'add': {
      const added = a.sequences.map((s) => ({ ...s, id: newId('seq'), createdAt: now, updatedAt: now }));
      if (!added.length) return p;
      return { ...p, sequences: [...p.sequences, ...added], activeId: added[0].id };
    }
    case 'update':
      return {
        ...p,
        sequences: p.sequences.map((s) => {
          if (s.id !== a.id) return s;
          const next = { ...s, ...a.patch, updatedAt: now };
          // Feature coordinates describe the old residues; an edit makes them wrong.
          if (a.patch.seq !== undefined && a.patch.seq !== s.seq) delete next.features;
          return next;
        }),
      };
    case 'remove': {
      const idx = p.sequences.findIndex((s) => s.id === a.id);
      if (idx < 0) return p;
      const sequences = p.sequences.filter((s) => s.id !== a.id);
      const activeId = p.activeId === a.id ? (sequences[Math.min(idx, sequences.length - 1)]?.id ?? null) : p.activeId;
      return { ...p, sequences, activeId };
    }
    case 'select':
      return { ...p, activeId: a.id };
    case 'rename-project':
      return { ...p, name: a.name.trim() || p.name };
    case 'save-result':
      return { ...p, results: [{ ...a.result, id: newId('res'), createdAt: now }, ...p.results] };
    case 'remove-result':
      return { ...p, results: p.results.filter((r) => r.id !== a.id) };
    case 'replace':
      return a.project;
  }
}

/** Selection changes are navigation, not edits: they never enter undo history. */
export function isUndoable(a: BioAction): boolean {
  return a.type !== 'select';
}

export interface History {
  past: BioProject[];
  present: BioProject;
  future: BioProject[];
}

export function historyInit(present: BioProject): History {
  return { past: [], present, future: [] };
}

export type HistoryAction = BioAction | { type: 'undo' } | { type: 'redo' };

export function historyReducer(h: History, a: HistoryAction): History {
  if (a.type === 'undo') {
    if (!h.past.length) return h;
    const prev = h.past[h.past.length - 1];
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }
  if (a.type === 'redo') {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
  }
  const next = applyAction(h.present, a);
  if (next === h.present) return h;
  if (!isUndoable(a)) return { ...h, present: next };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** File-name-safe stem. */
export function fileStem(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'sequence';
}
