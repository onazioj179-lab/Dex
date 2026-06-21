// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- Omni Clipboard Store (Smart Clipboard System)
 * ===========================================================================
 *
 * The single source of truth for DEX's clipboard history. Unlike a plain
 * clipboard manager, the Omni Clipboard is *intelligent*: every captured clip
 * is typed (text / code / link / color / ...), language-detected when it is
 * code, and attributed to the DEX app it was copied from -- so the history
 * becomes a searchable, cross-app memory of what you've been working with.
 *
 * Pure store: capture (background polling + in-app copy events) lives in
 * services/ClipboardMonitor.ts, and the panel/Spotlight read from here. This
 * keeps the data model decoupled from DOM/clipboard APIs so it is testable and
 * consumable from any surface (panel, command palette, Spotlight, UKI).
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { debouncedJsonStorage } from '../utils/debouncedStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Semantic classification of a clip -- drives icon, preview, and filtering. */
export type ClipKind =
  | 'text'
  | 'code'
  | 'link'
  | 'color'
  | 'email'
  | 'path'
  | 'number'
  | 'image'
  | 'file';

export interface ClipEntry {
  id: string;
  /** Full clipboard content (capped -- see MAX_CONTENT). */
  content: string;
  kind: ClipKind;
  /** Detected language for `code` clips (e.g. "ts", "py", "json"). */
  language?: string;
  /** DEX app the clip was copied from, when known. */
  sourceAppId?: string;
  sourceAppName?: string;
  pinned?: boolean;
  timestamp: number;
  /** Single-line truncated preview for list rendering. */
  preview: string;
  charCount: number;
}

/** Optional capture context supplied by the monitor (decouples store from app state). */
export interface AddClipOptions {
  sourceAppId?: string;
  sourceAppName?: string;
  /** Force a kind instead of auto-detecting (e.g. 'image' for a data URL). */
  kind?: ClipKind;
}

interface ClipboardState {
  entries: ClipEntry[];
  /**
   * Capture a clip. Detects kind, dedupes (a re-copied clip is promoted to the
   * top, preserving its pin), attributes the source, and enforces capacity
   * (pinned clips are never evicted). Returns the new/promoted entry, or null
   * when the content was ignored (empty / oversized).
   */
  add: (content: string, opts?: AddClipOptions) => ClipEntry | null;
  remove: (id: string) => void;
  togglePin: (id: string) => void;
  /** Clear unpinned clips (pinned ones survive -- they are the user's "stack"). */
  clearUnpinned: () => void;
  /** Clear everything, pinned included. */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Max entries retained (pinned clips do not count against this cap). */
const MAX_ENTRIES = 100;
/** Text clips larger than this are left on the OS clipboard but kept out of history. */
const MAX_CONTENT = 256 * 1024;
/** Image clips (base64 data URLs) get a larger ceiling -- they are session-only. */
const MAX_IMAGE_CONTENT = 8 * 1024 * 1024;
const PREVIEW_LEN = 140;

// ---------------------------------------------------------------------------
// Kind detection -- cheap, conservative heuristics. Exported so Spotlight and
// any future consumer classify clips the same way.
// ---------------------------------------------------------------------------

const RE_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$|^(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%/\s]+\)$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_URL = /^(?:https?:\/\/|www\.)[^\s]+$/i;
const RE_PATH = /^(?:[a-z]:\\|\\\\|\/(?:[^\s/]+\/)|~\/|\.{1,2}\/)[^\n]*$/i;
const RE_NUMBER = /^-?\d[\d,_]*(?:\.\d+)?(?:e[+-]?\d+)?%?$/i;

/** Token signatures that strongly imply source code. */
const CODE_SIGNATURES = [
  /\b(?:function|const|let|var|=>|import|export|class|interface|type)\b/, // js/ts
  /\b(?:def|elif|lambda|self|async def)\b/,                               // python
  /[{};]\s*$/m,                                                           // braces/semicolons
  /^\s*(?:#include|using namespace|public\s+(?:class|static))/m,          // c/c++/java/c#
  /\b(?:fn|impl|pub|mut|let)\b.*[{;]/,                                    // rust
  /<\/?[a-z][\w-]*(?:\s[^>]*)?>/i,                                        // html/xml tags
];

function detectLanguage(text: string): string | undefined {
  const t = text.trim();
  // TypeScript: needs a genuinely TS-only signal, not just `const`/`=>` (those
  // are equally valid JS). Look for type annotations, interface/type decls,
  // `as` assertions, or generics alongside a JS keyword.
  if (/\b(?:import|export|const|let|function|class|interface|type|enum)\b/.test(t)
    && /\binterface\s+\w+|\btype\s+\w+\s*=|:\s*(?:string|number|boolean|void|any|unknown|never|Promise<|\w+\[\])|\bas\s+(?:const|\w+)|<[A-Z]\w*>/.test(t)) {
    return 'ts';
  }
  if (/\b(?:function|const|let|var)\b|=>/.test(t)) return 'js';
  if (/\b(?:def|elif|lambda|self)\b|^\s*print\(/m.test(t)) return 'py';
  if (/\b(?:fn|impl|pub|mut)\b/.test(t)) return 'rust';
  if (/<\/?[a-z][\w-]*/i.test(t)) return 'html';
  if (/[.#][\w-]+\s*\{[^}]*:[^}]*\}/.test(t)) return 'css';
  if (/^\s*(?:\$|#|sudo |npm |git |cd |ls |cargo )/m.test(t)) return 'sh';
  return undefined;
}

export function detectClipKind(content: string): { kind: ClipKind; language?: string } {
  const trimmed = content.trim();
  if (!trimmed) return { kind: 'text' };

  // Structured JSON (any line count) is code -- check before the single-line
  // shortcuts so `{ "a": 1 }` is not mistaken for plain text.
  if (trimmed.length > 1 && /^[[{]/.test(trimmed)) {
    try { JSON.parse(trimmed); return { kind: 'code', language: 'json' }; } catch { /* not json */ }
  }

  const singleLine = !/\n/.test(trimmed);

  if (singleLine) {
    if (RE_COLOR.test(trimmed)) return { kind: 'color' };
    if (RE_EMAIL.test(trimmed)) return { kind: 'email' };
    if (RE_URL.test(trimmed)) return { kind: 'link' };
    if (RE_NUMBER.test(trimmed)) return { kind: 'number' };
    if (RE_PATH.test(trimmed) && !/\s{2,}/.test(trimmed)) return { kind: 'path' };
  }

  // Code: multi-line with strong signatures, or a single line that is clearly code.
  const sigHits = CODE_SIGNATURES.reduce((n, re) => (re.test(trimmed) ? n + 1 : n), 0);
  if ((!singleLine && sigHits >= 1) || sigHits >= 2) {
    return { kind: 'code', language: detectLanguage(trimmed) };
  }

  return { kind: 'text' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function makeId(): string {
  _seq = (_seq + 1) % 100000;
  return `clip-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

function makePreview(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_LEN ? `${oneLine.slice(0, PREVIEW_LEN)}…` : oneLine;
}

/** Enforce capacity: keep every pinned clip + the most recent unpinned up to cap. */
function enforceCap(entries: ClipEntry[]): ClipEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const pinned = entries.filter(e => e.pinned);
  const unpinned = entries.filter(e => !e.pinned).slice(0, MAX_ENTRIES);
  // Re-merge preserving original (most-recent-first) order.
  const keep = new Set([...pinned, ...unpinned]);
  return entries.filter(e => keep.has(e));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (content, opts) => {
        if (!content) return null;
        const isImage = opts?.kind === 'image';
        if (content.length > (isImage ? MAX_IMAGE_CONTENT : MAX_CONTENT)) return null;
        if (!isImage && !content.trim()) return null;

        const { entries } = get();
        // Identical to the current top -> nothing to do.
        if (entries[0]?.content === content) return entries[0];

        const existing = entries.find(e => e.content === content);
        const detected = opts?.kind ? { kind: opts.kind, language: undefined } : detectClipKind(content);
        const entry: ClipEntry = {
          id: existing?.id ?? makeId(),
          content,
          kind: detected.kind,
          language: detected.language,
          sourceAppId: opts?.sourceAppId ?? existing?.sourceAppId,
          sourceAppName: opts?.sourceAppName ?? existing?.sourceAppName,
          pinned: existing?.pinned,
          timestamp: Date.now(),
          preview: isImage ? 'Image' : makePreview(content),
          charCount: content.length,
        };
        const rest = existing ? entries.filter(e => e.id !== existing.id) : entries;
        set({ entries: enforceCap([entry, ...rest]) });
        return entry;
      },

      remove: (id) => set(state => ({ entries: state.entries.filter(e => e.id !== id) })),

      togglePin: (id) => set(state => ({
        entries: state.entries.map(e => (e.id === id ? { ...e, pinned: !e.pinned } : e)),
      })),

      clearUnpinned: () => set(state => ({ entries: state.entries.filter(e => e.pinned) })),

      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'dex-clipboard-omni',
      storage: debouncedJsonStorage,
      version: 1,
      // Image clips hold large base64 data URLs -- keep them session-only so they
      // never blow the localStorage quota. Everything else persists.
      partialize: (state) => ({ entries: state.entries.filter(e => e.kind !== 'image') }),
    },
  ),
);

// Expose globally for non-React surfaces (Spotlight index, UKI tools).
if (typeof window !== 'undefined') {
  (window as unknown as { __dexClipboardStore?: typeof useClipboardStore }).__dexClipboardStore = useClipboardStore;
}

// ---------------------------------------------------------------------------
// Selector hooks (minimize re-renders)
// ---------------------------------------------------------------------------

export const useClipboardEntries = () => useClipboardStore(s => s.entries);
export const useClipboardActions = () => useClipboardStore(useShallow(s => ({
  add: s.add,
  remove: s.remove,
  togglePin: s.togglePin,
  clearUnpinned: s.clearUnpinned,
  clearAll: s.clearAll,
})));

/**
 * One-time import of the legacy `dex-clipboard-history` format (text-only,
 * {id,content,type,timestamp,preview}) into the Omni store, so existing users
 * keep their history. Idempotent: runs only while the new store is still empty.
 */
export function migrateLegacyClipboard(): void {
  try {
    if (useClipboardStore.getState().entries.length > 0) return;
    const raw = localStorage.getItem('dex-clipboard-history');
    if (!raw) return;
    const old = JSON.parse(raw) as Array<{ content?: string; timestamp?: number }>;
    if (!Array.isArray(old) || old.length === 0) return;
    const pins = (() => {
      try { return new Set(JSON.parse(localStorage.getItem('dex-clipboard-pinned') || '[]')); }
      catch { return new Set<string>(); }
    })();
    const { add, togglePin } = useClipboardStore.getState();
    // Oldest first so the most recent ends up on top after each unshift.
    for (const item of [...old].reverse()) {
      if (!item?.content) continue;
      const e = add(item.content);
      if (e && pins.has(e.id)) togglePin(e.id);
    }
    // Retire the legacy keys so the migration never re-runs.
    localStorage.removeItem('dex-clipboard-history');
    localStorage.removeItem('dex-clipboard-pinned');
  } catch { /* never block boot on a migration */ }
}
