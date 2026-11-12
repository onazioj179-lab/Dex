// =============================================================================
// DEX Platform — Notes export / import file formats
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Export and Import in Notes went to `dexnotes:export` / `dexnotes:import`,
// which were never ported to Tauri: both always failed. The note document
// model already lives in the renderer, so conversion happens here and the
// native side only shows the save dialog / reads the picked file.

import {
  type DocNode, type DocRoot, type Mark,
  createDocFromText, deserializeDoc, docToHTML, docToMarkdown, docToPlainText, htmlToDoc,
} from './NotesDocumentModel';

export type NoteExportFormat = 'markdown' | 'html' | 'txt' | 'json';

export const NOTE_EXPORT_EXT: Record<NoteExportFormat, string> = {
  markdown: 'md', html: 'html', txt: 'txt', json: 'json',
};

/** File types the importer understands (lower-case, no dot). */
export const NOTE_IMPORT_EXTS = ['md', 'markdown', 'txt', 'text', 'html', 'htm', 'json'];

interface ExportableNote { title?: string; content?: string; created_at?: number; updated_at?: number; tags?: unknown }

export { serializeDoc, docToPlainText } from './NotesDocumentModel';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A Windows-safe file name from a note title. */
export function safeFileName(title: string | undefined, ext: string): string {
  const base = (title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+|\.+$/g, '').slice(0, 120);
  return `${base || 'Untitled note'}.${ext}`;
}

/** Note → file text in the chosen format. */
export function noteToFileText(note: ExportableNote, format: NoteExportFormat): string {
  const doc = deserializeDoc(note.content || '');
  const title = note.title || 'Untitled note';
  switch (format) {
    case 'markdown': {
      const body = docToMarkdown(doc).replace(/\n{3,}/g, '\n\n').trim();
      return `# ${title}\n\n${body}\n`;
    }
    case 'txt':
      return `${title}\n\n${docToPlainText(doc).trim()}\n`;
    case 'html':
      return [
        '<!doctype html>', '<html><head><meta charset="utf-8">',
        `<title>${escapeHtml(title)}</title>`,
        '<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6}pre{background:#f4f4f4;padding:12px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>',
        '</head><body>', `<h1>${escapeHtml(title)}</h1>`, docToHTML(doc), '</body></html>', '',
      ].join('\n');
    case 'json':
      return JSON.stringify({
        format: 'dex-note', version: 1, title,
        created_at: note.created_at ?? null, updated_at: note.updated_at ?? null,
        content: doc,
      }, null, 2) + '\n';
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** `**b**`, `*i*` / `_i_`, `` `c` ``, `~~s~~`, `==h==`, `[t](url)` → text runs. */
export function parseInlineMarkdown(text: string): DocNode[] {
  const out: DocNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(~~([^~]+)~~)|(==([^=]+)==)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*]+)\*)|(\b_([^_]+)_\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string, marks?: Mark[]) => { if (t) out.push(marks ? { type: 'paragraph', text: t, marks } : { type: 'paragraph', text: t }); };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[2] !== undefined) push(m[2], [{ type: 'bold' }]);
    else if (m[4] !== undefined) push(m[4], [{ type: 'strikethrough' }]);
    else if (m[6] !== undefined) push(m[6], [{ type: 'highlight' }]);
    else if (m[8] !== undefined) push(m[8], [{ type: 'code' }]);
    else if (m[10] !== undefined) {
      const href = /^(https?:|mailto:)/i.test(m[11]) ? m[11] : '';
      push(m[10], href ? [{ type: 'link', attrs: { href } }] : undefined);
    } else if (m[13] !== undefined) push(m[13], [{ type: 'italic' }]);
    else if (m[15] !== undefined) push(m[15], [{ type: 'italic' }]);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return out;
}

const para = (text: string): DocNode => ({ type: 'paragraph', content: parseInlineMarkdown(text) });

/** Markdown → note document (headings, lists, checklists, quotes, code, rules, tables). */
export function markdownToDoc(md: string): DocRoot {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const content: DocNode[] = [];
  let i = 0;
  let paraBuf: string[] = [];
  const flush = () => { if (paraBuf.length) { content.push(para(paraBuf.join(' '))); paraBuf = []; } };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    let m: RegExpMatchArray | null;

    if (t === '') { flush(); i++; continue; }

    if (/^(```|~~~)/.test(t)) {
      flush();
      const fence = t.slice(0, 3);
      const language = t.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      i++; // closing fence
      content.push({ type: 'code_block', ...(language ? { attrs: { language } } : {}), content: [{ type: 'paragraph', text: code.join('\n') }] });
      continue;
    }
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      content.push({ type: 'heading', attrs: { level: m[1].length }, content: parseInlineMarkdown(m[2].replace(/\s+#+$/, '')) });
      i++; continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { flush(); content.push({ type: 'horizontal_rule' }); i++; continue; }
    if (t.startsWith('>')) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) q.push(lines[i++].trim().replace(/^>\s?/, ''));
      content.push({ type: 'blockquote', content: [para(q.join(' '))] });
      continue;
    }
    if (/^[-*+]\s+/.test(t)) {
      flush();
      const items: DocNode[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const it = lines[i++].trim().replace(/^[-*+]\s+/, '');
        const cm = it.match(/^\[([ xX])\]\s*(.*)$/);
        items.push(cm
          ? { type: 'checklist_item', attrs: { checked: cm[1] !== ' ' }, content: parseInlineMarkdown(cm[2]) }
          : { type: 'list_item', content: parseInlineMarkdown(it) });
      }
      content.push({ type: 'bullet_list', content: items });
      continue;
    }
    if ((m = t.match(/^(\d+)[.)]\s+/))) {
      flush();
      const start = Number(m[1]) || 1;
      const items: DocNode[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push({ type: 'list_item', content: parseInlineMarkdown(lines[i++].trim().replace(/^\d+[.)]\s+/, '')) });
      }
      content.push({ type: 'ordered_list', ...(start !== 1 ? { attrs: { start } } : {}), content: items });
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush();
      const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const rows: string[][] = [cells(t)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      content.push({
        type: 'table',
        content: rows.map((r, ri) => ({
          type: 'table_row',
          content: r.map(c => ({ type: 'table_cell', attrs: { header: ri === 0 }, content: [para(c)] })),
        })),
      });
      continue;
    }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)) && /^https?:/i.test(m[2])) {
      flush();
      content.push({ type: 'image', attrs: { src: m[2], alt: m[1] } });
      i++; continue;
    }
    paraBuf.push(t);
    i++;
  }
  flush();
  if (content.length === 0) content.push({ type: 'paragraph', content: [] });
  return { type: 'doc', content };
}

export interface ImportedNote { title: string; doc: DocRoot }

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * A picked file → a note. The title comes from a leading `# Heading` (markdown),
 * `<title>` / first `<h1>` (HTML), a DEX note export's title, or the file name.
 * Throws with a readable message when the file can't be used.
 */
export function fileToNote(fileName: string, text: string): ImportedNote {
  const ext = (fileName.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const fallbackTitle = stripExt(fileName.split(/[\\/]/).pop() || '') || 'Imported note';

  if (ext === 'json') {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { throw new Error('This JSON file is not a note export'); }
    const doc = parsed?.content?.type === 'doc' ? parsed.content : parsed?.type === 'doc' ? parsed : null;
    if (!doc || !Array.isArray(doc.content)) throw new Error('This JSON file is not a note export');
    return { title: typeof parsed.title === 'string' && parsed.title ? parsed.title : fallbackTitle, doc: doc as DocRoot };
  }

  if (ext === 'html' || ext === 'htm') {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const body = text.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? text;
    const h1 = body.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const decode = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const title = decode(titleMatch?.[1] || h1?.[1] || '') || fallbackTitle;
    // Drop a leading <h1> that just repeats the title (what our own export writes).
    const rest = h1 && decode(h1[1]) === title ? body.slice(body.indexOf(h1[0]) + h1[0].length) : body;
    return { title, doc: htmlToDoc(rest) };
  }

  if (ext === 'md' || ext === 'markdown') {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const first = lines.findIndex(l => l.trim() !== '');
    const h = first >= 0 ? lines[first].trim().match(/^#\s+(.+)$/) : null;
    if (h) return { title: h[1].trim(), doc: markdownToDoc(lines.slice(first + 1).join('\n')) };
    return { title: fallbackTitle, doc: markdownToDoc(text) };
  }

  if (ext === 'txt' || ext === 'text' || ext === '') {
    return { title: fallbackTitle, doc: createDocFromText(text.replace(/\r\n?/g, '\n')) };
  }

  throw new Error(`Notes can import ${NOTE_IMPORT_EXTS.map(e => '.' + e).join(', ')} files`);
}
