// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- Document Model
// ==========================================================================
// JSON tree-based document model with transaction system, undo/redo stack,
// serialization to/from contenteditable HTML, and plain text extraction.
// ==========================================================================

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

export type NodeType =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'code_block'
  | 'horizontal_rule'
  | 'bullet_list'
  | 'ordered_list'
  | 'list_item'
  | 'checklist_item'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'image'
  | 'divider';

export type MarkType = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'highlight' | 'link';

export interface Mark {
  type: MarkType;
  attrs?: Record<string, string>;
}

export interface DocNode {
  type: NodeType;
  content?: DocNode[];
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, any>;
}

export interface DocRoot {
  type: 'doc';
  content: DocNode[];
}

// ---------------------------------------------------------------------------
// Document Operations
// ---------------------------------------------------------------------------

export function createEmptyDoc(): DocRoot {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  };
}

export function createDocFromText(text: string): DocRoot {
  const lines = text.split('\n');
  const content: DocNode[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      content.push({ type: 'paragraph', content: [] });
    } else {
      content.push({
        type: 'paragraph',
        content: [{ type: 'paragraph', text: line }],
      });
    }
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }
  return { type: 'doc', content };
}

// ---------------------------------------------------------------------------
// Serialization: Doc -> Plain Text
// ---------------------------------------------------------------------------

export function docToPlainText(doc: DocRoot): string {
  const parts: string[] = [];
  walkNodes(doc.content, (node, depth) => {
    if (node.text) {
      parts.push(node.text);
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      if (parts.length > 0 && parts[parts.length - 1] !== '\n') {
        parts.push('\n');
      }
    } else if (node.type === 'horizontal_rule' || node.type === 'divider') {
      parts.push('\n---\n');
    } else if (node.type === 'list_item' || node.type === 'checklist_item') {
      if (parts.length > 0 && parts[parts.length - 1] !== '\n') {
        parts.push('\n');
      }
      if (node.type === 'checklist_item') {
        parts.push(node.attrs?.checked ? '[x] ' : '[ ] ');
      } else {
        parts.push('- ');
      }
    } else if (node.type === 'blockquote') {
      parts.push('> ');
    } else if (node.type === 'code_block') {
      parts.push('\n```\n');
    }
  });
  return parts.join('').trim();
}

// ---------------------------------------------------------------------------
// Serialization: Doc -> HTML (for contenteditable rendering)
// ---------------------------------------------------------------------------

export function docToHTML(doc: DocRoot): string {
  return nodesToHTML(doc.content);
}

function nodesToHTML(nodes: DocNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(nodeToHTML).join('');
}

function nodeToHTML(node: DocNode): string {
  // Text node with marks
  if (node.text !== undefined) {
    let html = renderWikiLinks(escapeHTML(node.text));
    if (node.marks) {
      for (const mark of node.marks) {
        html = wrapMark(html, mark);
      }
    }
    return html;
  }

  const inner = nodesToHTML(node.content);

  switch (node.type) {
    case 'paragraph':
      return `<p>${inner || '<br>'}</p>`;
    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6);
      return `<h${level}>${inner}</h${level}>`;
    }
    case 'blockquote':
      return blockquoteToHTML(node, inner);
    case 'code_block':
      return `<pre><code>${inner}</code></pre>`;
    case 'horizontal_rule':
    case 'divider':
      return '<hr>';
    case 'bullet_list':
      return `<ul>${inner}</ul>`;
    case 'ordered_list':
      return `<ol start="${node.attrs?.start || 1}">${inner}</ol>`;
    case 'list_item':
      return `<li>${inner}</li>`;
    case 'checklist_item': {
      const checked = node.attrs?.checked ? ' checked' : '';
      return `<li class="checklist-item" data-checked="${node.attrs?.checked ? 'true' : 'false'}"><input type="checkbox"${checked} />${inner}</li>`;
    }
    case 'table':
      return `<table>${inner}</table>`;
    case 'table_row':
      return `<tr>${inner}</tr>`;
    case 'table_cell': {
      const tag = node.attrs?.header ? 'th' : 'td';
      return `<${tag}>${inner}</${tag}>`;
    }
    case 'image':
      return `<img src="${escapeAttr(node.attrs?.src || '')}" alt="${escapeAttr(node.attrs?.alt || '')}" />`;
    default:
      return inner;
  }
}

// ---------------------------------------------------------------------------
// Callout blocks: GitHub-style "> [!NOTE]" / "> [!WARNING]" / "> [!TIP]"
// ---------------------------------------------------------------------------
// A blockquote whose first line opens with a [!TYPE] marker renders as a
// coloured callout box instead of a plain quote. The rendered blockquote keeps
// a data-callout attribute so it round-trips: htmlToDoc reads that attribute
// back into a leading "[!TYPE]" paragraph, regenerating the same doc model.
// Supported types map to theme tokens: NOTE -> accent, WARNING -> warning,
// TIP -> success. Detection is case-insensitive; an optional inline title may
// follow the marker on the same line (e.g. "[!TIP] Pro tip").

const CALLOUT_TYPES: Record<string, { label: string }> = {
  note: { label: 'Note' },
  warning: { label: 'Warning' },
  tip: { label: 'Tip' },
};

const CALLOUT_MARKER_RE = /^\s*\[!(note|warning|tip)\]\s*(.*)$/i;

/** First text content carried by a blockquote's content, used for marker detection. */
function blockquoteLeadText(node: DocNode): string {
  const first = (node.content || [])[0];
  if (!first) return '';
  return nodeText(first);
}

function blockquoteToHTML(node: DocNode, inner: string): string {
  const lead = blockquoteLeadText(node);
  const m = lead.match(CALLOUT_MARKER_RE);
  if (!m) return `<blockquote>${inner}</blockquote>`;

  const type = m[1].toLowerCase();
  const inlineTitle = (m[2] || '').trim();
  const meta = CALLOUT_TYPES[type];
  const label = inlineTitle || meta.label;

  // Rebuild the body without the marker paragraph (the header replaces it).
  const body = nodesToHTML((node.content || []).slice(1));
  const header =
    `<div class="callout-title" contenteditable="false">` +
    `<span class="callout-icon" aria-hidden="true"></span>` +
    `<span class="callout-label">${escapeHTML(label)}</span></div>`;
  return (
    `<blockquote class="callout callout-${type}" data-callout="${type}"` +
    (inlineTitle ? ` data-callout-title="${escapeAttr(inlineTitle)}"` : '') +
    `>${header}<div class="callout-body">${body || '<p><br></p>'}</div></blockquote>`
  );
}

function wrapMark(html: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold': return `<strong>${html}</strong>`;
    case 'italic': return `<em>${html}</em>`;
    case 'underline': return `<u>${html}</u>`;
    case 'strikethrough': return `<s>${html}</s>`;
    case 'code': return `<code>${html}</code>`;
    case 'highlight': return `<mark>${html}</mark>`;
    case 'link': return `<a href="${escapeAttr(mark.attrs?.href || '#')}">${html}</a>`;
    default: return html;
  }
}

// ---------------------------------------------------------------------------
// Serialization: HTML -> Doc (from contenteditable)
// ---------------------------------------------------------------------------

export function htmlToDoc(html: string): DocRoot {
  const parser = new DOMParser();
  const dom = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const content = parseChildren(dom.body);
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }
  return { type: 'doc', content };
}

function parseChildren(el: Element | ChildNode): DocNode[] {
  const nodes: DocNode[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        nodes.push({ type: 'paragraph', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elc = child as Element;
      // contenteditable puts inserted/pasted images INSIDE the current <p>, but
      // parseInline only keeps text, so those images were silently dropped on
      // save. Split such paragraphs into text paragraphs + image blocks.
      if ((elc.tagName === 'P' || elc.tagName === 'DIV') && elc.querySelector('img')) {
        nodes.push(...splitParagraphImages(elc));
        continue;
      }
      const parsed = parseElement(elc);
      if (parsed) {
        nodes.push(parsed);
      }
    }
  }
  return nodes;
}

/** A paragraph containing images -> [paragraph?, image, paragraph?, ...]. */
function splitParagraphImages(el: Element): DocNode[] {
  const out: DocNode[] = [];
  let run = el.ownerDocument.createElement('p');
  const flush = () => {
    const content = parseInline(run);
    if ((run.textContent || '').trim()) out.push({ type: 'paragraph', content });
    run = el.ownerDocument.createElement('p');
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'IMG') {
      flush();
      const img = node as Element;
      out.push({ type: 'image', attrs: { src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '' } });
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).querySelector('img')) {
      flush();
      out.push(...splitParagraphImages(node as Element));
    } else {
      run.appendChild(node.cloneNode(true));
    }
  }
  flush();
  return out;
}

function parseElement(el: Element): DocNode | null {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'p':
      return { type: 'paragraph', content: parseInline(el) };
    case 'h1': return { type: 'heading', attrs: { level: 1 }, content: parseInline(el) };
    case 'h2': return { type: 'heading', attrs: { level: 2 }, content: parseInline(el) };
    case 'h3': return { type: 'heading', attrs: { level: 3 }, content: parseInline(el) };
    case 'h4': return { type: 'heading', attrs: { level: 4 }, content: parseInline(el) };
    case 'h5': return { type: 'heading', attrs: { level: 5 }, content: parseInline(el) };
    case 'h6': return { type: 'heading', attrs: { level: 6 }, content: parseInline(el) };
    case 'blockquote': {
      // Callout blockquotes carry data-callout; reconstruct the leading
      // "[!TYPE] title" paragraph from the attribute and parse only the body,
      // so the marker survives the round-trip without the rendered header
      // leaking its label text back into the document.
      const callout = el.getAttribute('data-callout');
      if (callout && CALLOUT_TYPES[callout.toLowerCase()]) {
        const type = callout.toLowerCase();
        const title = el.getAttribute('data-callout-title') || '';
        const marker = `[!${type.toUpperCase()}]${title ? ` ${title}` : ''}`;
        const bodyEl = el.querySelector('.callout-body');
        const bodyNodes = bodyEl ? parseChildren(bodyEl) : [];
        return {
          type: 'blockquote',
          content: [{ type: 'paragraph', text: marker }, ...bodyNodes],
        };
      }
      return { type: 'blockquote', content: parseChildren(el) };
    }
    case 'pre': {
      const code = el.querySelector('code');
      const text = (code || el).textContent || '';
      return { type: 'code_block', content: [{ type: 'paragraph', text }] };
    }
    case 'hr':
      return { type: 'horizontal_rule' };
    case 'ul': {
      const items = Array.from(el.children).map(li => parseListItem(li)).filter(Boolean) as DocNode[];
      if (items.length > 0 && items[0].type === 'checklist_item') {
        return { type: 'bullet_list', content: items };
      }
      return { type: 'bullet_list', content: items };
    }
    case 'ol': {
      const start = parseInt(el.getAttribute('start') || '1', 10);
      const items = Array.from(el.children).map(li => parseListItem(li)).filter(Boolean) as DocNode[];
      return { type: 'ordered_list', attrs: { start }, content: items };
    }
    case 'table': {
      const rows: DocNode[] = [];
      el.querySelectorAll('tr').forEach(tr => {
        const cells: DocNode[] = [];
        tr.querySelectorAll('td, th').forEach(cell => {
          cells.push({
            type: 'table_cell',
            attrs: { header: cell.tagName.toLowerCase() === 'th' },
            content: parseInline(cell),
          });
        });
        rows.push({ type: 'table_row', content: cells });
      });
      return { type: 'table', content: rows };
    }
    case 'img':
      return {
        type: 'image',
        attrs: { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' },
      };
    case 'br':
      return null;
    case 'div':
      // Divs in contenteditable usually just wrap paragraphs
      return { type: 'paragraph', content: parseInline(el) };
    default:
      // Treat unknown block elements as paragraphs
      return { type: 'paragraph', content: parseInline(el) };
  }
}

function parseListItem(el: Element): DocNode | null {
  if (!el || el.tagName.toLowerCase() !== 'li') return null;

  const checkbox = el.querySelector('input[type="checkbox"]');
  if (checkbox || el.classList.contains('checklist-item')) {
    const checked = (checkbox as HTMLInputElement)?.checked ||
      el.getAttribute('data-checked') === 'true';
    return {
      type: 'checklist_item',
      attrs: { checked },
      content: parseInline(el),
    };
  }
  return { type: 'list_item', content: parseInline(el) };
}

function parseInline(el: Element): DocNode[] {
  const nodes: DocNode[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        nodes.push({ type: 'paragraph', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const inlineEl = child as Element;
      const tag = inlineEl.tagName.toLowerCase();

      // Skip checkbox inputs (handled by checklist_item)
      if (tag === 'input') continue;

      // Wiki-link anchors round-trip back to "[[Title]]" plain text so the
      // stored doc keeps the portable syntax rather than a baked-in anchor.
      if (tag === 'a' && inlineEl.classList.contains('wikilink')) {
        const title = inlineEl.getAttribute('data-wikilink') || inlineEl.textContent || '';
        if (title.trim()) {
          nodes.push({ type: 'paragraph', text: `[[${title.trim()}]]` });
        }
        continue;
      }

      const mark = tagToMark(inlineEl);
      if (mark) {
        const innerNodes = parseInline(inlineEl);
        for (const n of innerNodes) {
          if (n.text !== undefined) {
            const existing = n.marks || [];
            nodes.push({ ...n, marks: [...existing, mark] });
          } else {
            nodes.push(n);
          }
        }
      } else if (tag === 'br') {
        // Line break within inline content
        nodes.push({ type: 'paragraph', text: '\n' });
      } else {
        // Nested block in inline context -- flatten
        const innerNodes = parseInline(inlineEl);
        nodes.push(...innerNodes);
      }
    }
  }
  return nodes;
}

function tagToMark(el: Element): Mark | null {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'strong': case 'b': return { type: 'bold' };
    case 'em': case 'i': return { type: 'italic' };
    case 'u': return { type: 'underline' };
    case 's': case 'del': case 'strike': return { type: 'strikethrough' };
    case 'code': return { type: 'code' };
    case 'mark': return { type: 'highlight' };
    case 'a': return { type: 'link', attrs: { href: el.getAttribute('href') || '' } };
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Serialization: Doc -> Markdown
// ---------------------------------------------------------------------------

export function docToMarkdown(doc: DocRoot): string {
  return nodesToMarkdown(doc.content, 0);
}

function nodesToMarkdown(nodes: DocNode[] | undefined, indent: number): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(n => nodeToMarkdown(n, indent)).join('');
}

function nodeToMarkdown(node: DocNode, indent: number): string {
  if (node.text !== undefined) {
    let text = node.text;
    if (node.marks) {
      for (const mark of node.marks) {
        text = wrapMarkMd(text, mark);
      }
    }
    return text;
  }

  const inner = nodesToMarkdown(node.content, indent);
  const prefix = '  '.repeat(indent);

  switch (node.type) {
    case 'paragraph':
      return `${prefix}${inner}\n\n`;
    case 'heading': {
      const level = node.attrs?.level || 1;
      return `${'#'.repeat(level)} ${inner}\n\n`;
    }
    case 'blockquote':
      return inner.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
    case 'code_block':
      return `\`\`\`\n${inner}\n\`\`\`\n\n`;
    case 'horizontal_rule':
    case 'divider':
      return '---\n\n';
    case 'bullet_list':
      return inner;
    case 'ordered_list': {
      let idx = node.attrs?.start || 1;
      return (node.content || []).map(item => {
        const itemText = nodesToMarkdown(item.content, indent);
        return `${prefix}${idx++}. ${itemText.trim()}\n`;
      }).join('') + '\n';
    }
    case 'list_item':
      return `${prefix}- ${inner.trim()}\n`;
    case 'checklist_item': {
      const check = node.attrs?.checked ? 'x' : ' ';
      return `${prefix}- [${check}] ${inner.trim()}\n`;
    }
    case 'table': {
      const rows = node.content || [];
      if (rows.length === 0) return '';
      const lines: string[] = [];
      rows.forEach((row, ri) => {
        const cells = (row.content || []).map(cell => nodesToMarkdown(cell.content, 0).trim());
        lines.push('| ' + cells.join(' | ') + ' |');
        if (ri === 0) {
          lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        }
      });
      return lines.join('\n') + '\n\n';
    }
    case 'image':
      return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`;
    default:
      return inner;
  }
}

function wrapMarkMd(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold': return `**${text}**`;
    case 'italic': return `*${text}*`;
    case 'underline': return `<u>${text}</u>`;
    case 'strikethrough': return `~~${text}~~`;
    case 'code': return `\`${text}\``;
    case 'highlight': return `==${text}==`;
    case 'link': return `[${text}](${mark.attrs?.href || ''})`;
    default: return text;
  }
}

// ---------------------------------------------------------------------------
// Undo/Redo Transaction System
// ---------------------------------------------------------------------------

export interface DocTransaction {
  doc: DocRoot;
  timestamp: number;
  description: string;
}

export class UndoManager {
  private undoStack: DocTransaction[] = [];
  private redoStack: DocTransaction[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 200) {
    this.maxHistory = maxHistory;
  }

  push(doc: DocRoot, description: string = ''): void {
    this.undoStack.push({
      doc: structuredClone(doc),
      timestamp: Date.now(),
      description,
    });
    // Clear redo on new change
    this.redoStack = [];
    // Limit history size
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo(currentDoc: DocRoot): DocRoot | null {
    if (this.undoStack.length === 0) return null;
    const prev = this.undoStack.pop()!;
    this.redoStack.push({
      doc: structuredClone(currentDoc),
      timestamp: Date.now(),
      description: 'undo',
    });
    return structuredClone(prev.doc);
  }

  redo(currentDoc: DocRoot): DocRoot | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push({
      doc: structuredClone(currentDoc),
      timestamp: Date.now(),
      description: 'redo',
    });
    return structuredClone(next.doc);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ---------------------------------------------------------------------------
// Word Count
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function walkNodes(nodes: DocNode[] | undefined, fn: (node: DocNode, depth: number) => void, depth: number = 0): void {
  if (!nodes) return;
  for (const node of nodes) {
    fn(node, depth);
    if (node.content) {
      walkNodes(node.content, fn, depth + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Wiki-links: [[Note Title]] -> clickable anchor
// ---------------------------------------------------------------------------
// Operates on already-HTML-escaped text. The rendered anchor carries the raw
// title in data-wikilink so click handlers can resolve it, while the visible
// label keeps the original "[[Title]]" syntax off-screen. On the way back in
// (htmlToDoc), a .wikilink anchor is flattened to "[[Title]]" plain text so the
// stored document model never accumulates anchor cruft and round-trips cleanly.

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/g;

export function renderWikiLinks(escapedText: string): string {
  return escapedText.replace(WIKILINK_RE, (_m, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return _m;
    // title is already HTML-escaped (came from escapeHTML); reuse for the attr.
    return `<a class="wikilink" data-wikilink="${trimmed}" href="#">${trimmed}</a>`;
  });
}

// ---------------------------------------------------------------------------
// Headings: extract a flat outline for a table-of-contents view
// ---------------------------------------------------------------------------

export interface HeadingItem {
  level: number;
  text: string;
  /** Stable index among headings, used to locate the matching DOM element. */
  index: number;
}

export function extractHeadings(doc: DocRoot): HeadingItem[] {
  const headings: HeadingItem[] = [];
  walkNodes(doc.content, (node) => {
    if (node.type === 'heading') {
      const level = Math.min(Math.max(node.attrs?.level || 1, 1), 3);
      const text = nodeText(node).trim();
      if (text) {
        headings.push({ level, text, index: headings.length });
      }
    }
  });
  return headings;
}

function nodeText(node: DocNode): string {
  if (node.text !== undefined) return node.text;
  return (node.content || []).map(nodeText).join('');
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Doc JSON Serialization
// ---------------------------------------------------------------------------

export function serializeDoc(doc: DocRoot): string {
  return JSON.stringify(doc);
}

export function deserializeDoc(json: string): DocRoot {
  try {
    const parsed = JSON.parse(json);
    if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
      return parsed as DocRoot;
    }
  } catch (_e) {
    // Fall through
  }
  return createEmptyDoc();
}

// ---------------------------------------------------------------------------
// Node Creation Helpers
// ---------------------------------------------------------------------------

export function createParagraph(text?: string, marks?: Mark[]): DocNode {
  if (text) {
    return { type: 'paragraph', content: [{ type: 'paragraph', text, marks }] };
  }
  return { type: 'paragraph', content: [] };
}

export function createHeading(level: number, text: string): DocNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'paragraph', text }],
  };
}

export function createBulletList(items: string[]): DocNode {
  return {
    type: 'bullet_list',
    content: items.map(text => ({
      type: 'list_item' as NodeType,
      content: [{ type: 'paragraph' as NodeType, text }],
    })),
  };
}

export function createChecklist(items: Array<{ text: string; checked: boolean }>): DocNode {
  return {
    type: 'bullet_list',
    content: items.map(({ text, checked }) => ({
      type: 'checklist_item' as NodeType,
      attrs: { checked },
      content: [{ type: 'paragraph' as NodeType, text }],
    })),
  };
}

export function createCodeBlock(code: string, language?: string): DocNode {
  return {
    type: 'code_block',
    attrs: language ? { language } : undefined,
    content: [{ type: 'paragraph', text: code }],
  };
}

export function createTable(rows: string[][]): DocNode {
  return {
    type: 'table',
    content: rows.map((cells, ri) => ({
      type: 'table_row' as NodeType,
      content: cells.map(text => ({
        type: 'table_cell' as NodeType,
        attrs: { header: ri === 0 },
        content: [{ type: 'paragraph' as NodeType, text }],
      })),
    })),
  };
}

export function createHorizontalRule(): DocNode {
  return { type: 'horizontal_rule' };
}

export function createBlockquote(text: string): DocNode {
  return {
    type: 'blockquote',
    content: [{ type: 'paragraph', content: [{ type: 'paragraph', text }] }],
  };
}

export function createImage(src: string, alt?: string): DocNode {
  return {
    type: 'image',
    attrs: { src, alt: alt || '' },
  };
}
