// =============================================================================
// DEX Platform — Track G1: DexNotes block model + backlinks
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Block-based note document with stable ids and backlink extraction.
 * The CRDT layer (src/shared/sync/crdt.ts) syncs individual block text.
 */

export type BlockType =
  | 'paragraph' | 'heading' | 'quote' | 'code'
  | 'todo' | 'list-item' | 'image' | 'attachment' | 'divider';

export interface NoteBlock {
  id: string;
  type: BlockType;
  /** Plain text content; rich runs go in `marks`. */
  text: string;
  /** Indent level for list items. */
  indent?: number;
  /** Checked state for todos. */
  done?: boolean;
  /** For code blocks. */
  language?: string;
  /** Attachment SHA-256 (BlobStore). */
  blobSha256?: string;
  /** For images: width/height. */
  width?: number;
  height?: number;
}

export interface NoteDoc {
  id: string;
  title: string;
  blocks: NoteBlock[];
  tags: string[];
  createdAtMs: number;
  modifiedAtMs: number;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const HASHTAG_RE = /(?:^|\s)#([A-Za-z0-9][\w-]*)/g;

export function extractBacklinks(doc: NoteDoc): string[] {
  const out = new Set<string>();
  for (const b of doc.blocks) {
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(b.text))) out.add(m[1]!.trim());
  }
  return Array.from(out);
}

export function extractHashtags(doc: NoteDoc): string[] {
  const out = new Set<string>();
  for (const b of doc.blocks) {
    let m: RegExpExecArray | null;
    HASHTAG_RE.lastIndex = 0;
    while ((m = HASHTAG_RE.exec(b.text))) out.add(m[1]!.toLowerCase());
  }
  return Array.from(out);
}

export interface BacklinkGraph {
  /** title -> set of doc ids that link to it. */
  inbound: Map<string, Set<string>>;
  /** doc id -> set of titles it links to. */
  outbound: Map<string, Set<string>>;
}

export function buildBacklinkGraph(docs: ReadonlyArray<NoteDoc>): BacklinkGraph {
  const inbound = new Map<string, Set<string>>();
  const outbound = new Map<string, Set<string>>();
  for (const d of docs) {
    const links = extractBacklinks(d);
    outbound.set(d.id, new Set(links));
    for (const target of links) {
      let s = inbound.get(target);
      if (!s) { s = new Set(); inbound.set(target, s); }
      s.add(d.id);
    }
  }
  return { inbound, outbound };
}

/** Reorder blocks: move from -> to (stable, bounds-checked). */
export function moveBlock(doc: NoteDoc, from: number, to: number): NoteDoc {
  if (from < 0 || from >= doc.blocks.length) return doc;
  const target = Math.max(0, Math.min(doc.blocks.length - 1, to));
  if (from === target) return doc;
  const blocks = doc.blocks.slice();
  const [b] = blocks.splice(from, 1);
  blocks.splice(target, 0, b!);
  return { ...doc, blocks, modifiedAtMs: Date.now() };
}
