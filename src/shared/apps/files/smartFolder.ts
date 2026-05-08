// =============================================================================
// DEX Platform — Track G1: Files smart-folder model
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Tagged file index + smart-folder query language. Pure structures so the
 * indexer and renderer share semantics.
 */

export interface FileMeta {
  path: string;
  name: string;
  bytes: number;
  modifiedAtMs: number;
  /** Lowercased extension without dot. */
  ext: string;
  /** User tags. */
  tags: string[];
  /** SHA-256 if computed. */
  sha256?: string;
  /** Coarse kind hint for fast filters. */
  kind?: 'image' | 'video' | 'audio' | 'doc' | 'code' | 'archive' | 'other';
}

export type Predicate =
  | { op: 'tag'; value: string }
  | { op: 'kind'; value: FileMeta['kind'] }
  | { op: 'ext'; value: string }
  | { op: 'name-contains'; value: string }
  | { op: 'larger-than'; value: number }
  | { op: 'smaller-than'; value: number }
  | { op: 'modified-after'; value: number }
  | { op: 'modified-before'; value: number }
  | { op: 'and'; preds: Predicate[] }
  | { op: 'or'; preds: Predicate[] }
  | { op: 'not'; pred: Predicate };

export function evalPredicate(f: FileMeta, p: Predicate): boolean {
  switch (p.op) {
    case 'tag': return f.tags.includes(p.value);
    case 'kind': return f.kind === p.value;
    case 'ext': return f.ext === p.value.toLowerCase();
    case 'name-contains': return f.name.toLowerCase().includes(p.value.toLowerCase());
    case 'larger-than': return f.bytes > p.value;
    case 'smaller-than': return f.bytes < p.value;
    case 'modified-after': return f.modifiedAtMs > p.value;
    case 'modified-before': return f.modifiedAtMs < p.value;
    case 'and': return p.preds.every(q => evalPredicate(f, q));
    case 'or': return p.preds.some(q => evalPredicate(f, q));
    case 'not': return !evalPredicate(f, p.pred);
  }
}

export interface SmartFolder {
  id: string;
  name: string;
  predicate: Predicate;
  /** Sort key. */
  sort: 'name' | 'modified' | 'size';
  ascending: boolean;
}

export function runSmartFolder(files: ReadonlyArray<FileMeta>, sf: SmartFolder): FileMeta[] {
  const filtered = files.filter(f => evalPredicate(f, sf.predicate));
  filtered.sort((a, b) => {
    let c = 0;
    if (sf.sort === 'name') c = a.name.localeCompare(b.name);
    else if (sf.sort === 'modified') c = a.modifiedAtMs - b.modifiedAtMs;
    else c = a.bytes - b.bytes;
    return sf.ascending ? c : -c;
  });
  return filtered;
}

export interface BatchOperation {
  kind: 'rename' | 'move' | 'tag-add' | 'tag-remove' | 'convert';
  /** Glob/template. */
  template: string;
  /** Optional target arg, e.g. destination dir or tag. */
  target?: string;
}

export interface BatchPreviewItem {
  source: string;
  target?: string;
  willChange: boolean;
}

export function previewRename(files: ReadonlyArray<FileMeta>, template: string): BatchPreviewItem[] {
  // Template tokens: {name} {ext} {n} {date}
  return files.map((f, i) => {
    const date = new Date(f.modifiedAtMs).toISOString().slice(0, 10);
    const baseNoExt = f.name.replace(/\.[^.]+$/, '');
    const out = template
      .replace(/\{name\}/g, baseNoExt)
      .replace(/\{ext\}/g, f.ext)
      .replace(/\{n\}/g, String(i + 1).padStart(3, '0'))
      .replace(/\{date\}/g, date);
    return { source: f.path, target: out, willChange: out !== f.name };
  });
}
