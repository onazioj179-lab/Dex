// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - NOTES App - Core Engine
// Rich text editing with markdown and blocks
// Items 751-775 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface Note {
  id: string;
  title: string;
  content: Block[];
  notebookId?: string;
  folderId?: string;
  tags: string[];
  color?: string;
  icon?: string;
  pinned: boolean;
  locked: boolean;
  archived: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  wordCount: number;
  characterCount: number;
  readingTime: number;
  version: number;
  collaborators?: string[];
}

// =============================================================================
// ITEM 751-755: BLOCK-BASED CONTENT
// =============================================================================

export interface Block {
  id: string;
  type: BlockType;
  content: BlockContent;
  children?: Block[];
  metadata: BlockMetadata;
}

export type BlockType = 
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  | 'bulletList' | 'numberedList' | 'todoList' | 'toggleList'
  | 'quote' | 'callout' | 'code' | 'codeBlock' | 'math' | 'mathBlock'
  | 'divider' | 'image' | 'video' | 'audio' | 'file' | 'embed'
  | 'table' | 'columns' | 'bookmark' | 'linkPreview'
  | 'database' | 'gallery' | 'calendar' | 'timeline' | 'kanban'
  | 'toc' | 'breadcrumb' | 'synced';

export interface BlockContent {
  text?: RichText[];
  checked?: boolean;
  language?: string;
  url?: string;
  caption?: string;
  width?: number | 'full';
  height?: number;
  alignment?: 'left' | 'center' | 'right';
  tableData?: TableCell[][];
  columnWidths?: number[];
  embedType?: string;
  linkId?: string;
  databaseId?: string;
  color?: CalloutColor;
  icon?: string;
  collapsed?: boolean;
}

export interface BlockMetadata {
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  indentLevel: number;
  isCollapsed: boolean;
}

// =============================================================================
// ITEM 756-760: RICH TEXT
// =============================================================================

export interface RichText {
  text: string;
  styles: TextStyle[];
  link?: string;
  mention?: Mention;
  emoji?: string;
  equation?: string;
  color?: TextColor;
  backgroundColor?: TextColor;
}

export type TextStyle = 
  | 'bold' | 'italic' | 'underline' | 'strikethrough'
  | 'code' | 'highlight' | 'superscript' | 'subscript';

export type TextColor = 
  | 'default' | 'gray' | 'brown' | 'orange' | 'yellow'
  | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export type CalloutColor = 
  | 'gray' | 'brown' | 'orange' | 'yellow' | 'green'
  | 'blue' | 'purple' | 'pink' | 'red';

export interface Mention {
  type: 'user' | 'page' | 'date' | 'database';
  id: string;
  text: string;
}

export interface TableCell {
  content: RichText[];
  rowSpan?: number;
  colSpan?: number;
  backgroundColor?: TextColor;
  alignment?: 'left' | 'center' | 'right';
}

// =============================================================================
// ITEM 761-765: MARKDOWN SUPPORT
// =============================================================================

export interface MarkdownOptions {
  gfm: boolean;
  tables: boolean;
  taskLists: boolean;
  strikethrough: boolean;
  autolinks: boolean;
  footnotes: boolean;
  math: boolean;
  frontMatter: boolean;
}

export class MarkdownParser {
  private options: MarkdownOptions;
  
  constructor(options?: Partial<MarkdownOptions>) {
    this.options = {
      gfm: true,
      tables: true,
      taskLists: true,
      strikethrough: true,
      autolinks: true,
      footnotes: true,
      math: true,
      frontMatter: true,
      ...options
    };
  }
  
  parse(markdown: string): Block[] {
    const blocks: Block[] = [];
    const lines = markdown.split('\n');
    let i = 0;
    
    // Handle front matter
    if (this.options.frontMatter && lines[0] === '---') {
      i = lines.indexOf('---', 1) + 1;
    }
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        blocks.push(this.createBlock(`heading${level}` as BlockType, headingMatch[2]));
        i++;
        continue;
      }
      
      // Horizontal rule
      if (line.match(/^(-{3,}|_{3,}|\*{3,})$/)) {
        blocks.push(this.createBlock('divider'));
        i++;
        continue;
      }
      
      // Code blocks
      if (line.startsWith('```')) {
        const language = line.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push(this.createBlock('codeBlock', codeLines.join('\n'), { language }));
        i++;
        continue;
      }
      
      // Block quotes
      if (line.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          quoteLines.push(lines[i].slice(1).trim());
          i++;
        }
        blocks.push(this.createBlock('quote', quoteLines.join('\n')));
        continue;
      }
      
      // Unordered lists
      if (line.match(/^[\-\*\+]\s/)) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].match(/^[\-\*\+]\s/)) {
          listItems.push(lines[i].replace(/^[\-\*\+]\s/, ''));
          i++;
        }
        blocks.push(this.createListBlock('bulletList', listItems));
        continue;
      }
      
      // Ordered lists
      if (line.match(/^\d+\.\s/)) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          listItems.push(lines[i].replace(/^\d+\.\s/, ''));
          i++;
        }
        blocks.push(this.createListBlock('numberedList', listItems));
        continue;
      }
      
      // Task lists
      if (this.options.taskLists && line.match(/^[\-\*]\s\[[ x]\]/i)) {
        const listItems: { text: string; checked: boolean }[] = [];
        while (i < lines.length && lines[i].match(/^[\-\*]\s\[[ x]\]/i)) {
          const checked = lines[i].includes('[x]') || lines[i].includes('[X]');
          const text = lines[i].replace(/^[\-\*]\s\[[ x]\]\s*/i, '');
          listItems.push({ text, checked });
          i++;
        }
        blocks.push(this.createTodoListBlock(listItems));
        continue;
      }
      
      // Tables
      if (this.options.tables && line.includes('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].includes('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        blocks.push(this.createTableBlock(tableLines));
        continue;
      }
      
      // Math blocks
      if (this.options.math && line.startsWith('$$')) {
        const mathLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        blocks.push(this.createBlock('mathBlock', mathLines.join('\n')));
        i++;
        continue;
      }
      
      // Images
      const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        blocks.push(this.createBlock('image', '', { 
          url: imageMatch[2], 
          caption: imageMatch[1] 
        }));
        i++;
        continue;
      }
      
      // Empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      // Default to paragraph
      blocks.push(this.createBlock('paragraph', line));
      i++;
    }
    
    return blocks;
  }
  
  private createBlock(type: BlockType, text: string = '', extra: Partial<BlockContent> = {}): Block {
    return {
      id: this.generateId(),
      type,
      content: {
        text: text ? this.parseInlineMarkdown(text) : undefined,
        ...extra
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indentLevel: 0,
        isCollapsed: false
      }
    };
  }
  
  private createListBlock(type: 'bulletList' | 'numberedList', items: string[]): Block {
    return {
      id: this.generateId(),
      type,
      content: {},
      children: items.map(item => this.createBlock('paragraph', item)),
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indentLevel: 0,
        isCollapsed: false
      }
    };
  }
  
  private createTodoListBlock(items: { text: string; checked: boolean }[]): Block {
    return {
      id: this.generateId(),
      type: 'todoList',
      content: {},
      children: items.map(item => ({
        id: this.generateId(),
        type: 'paragraph' as BlockType,
        content: {
          text: this.parseInlineMarkdown(item.text),
          checked: item.checked
        },
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          indentLevel: 0,
          isCollapsed: false
        }
      })),
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indentLevel: 0,
        isCollapsed: false
      }
    };
  }
  
  private createTableBlock(lines: string[]): Block {
    const tableData: TableCell[][] = [];
    
    for (let i = 0; i < lines.length; i++) {
      // Skip separator row
      if (lines[i].match(/^\|[\s\-:|]+\|$/)) continue;
      
      const cells = lines[i]
        .split('|')
        .filter(cell => cell.trim())
        .map(cell => ({
          content: this.parseInlineMarkdown(cell.trim())
        }));
      
      tableData.push(cells);
    }
    
    return {
      id: this.generateId(),
      type: 'table',
      content: { tableData },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indentLevel: 0,
        isCollapsed: false
      }
    };
  }
  
  private parseInlineMarkdown(text: string): RichText[] {
    const segments: RichText[] = [];
    let remaining = text;
    
    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        segments.push({ text: boldMatch[1], styles: ['bold'] });
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      
      // Italic
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        segments.push({ text: italicMatch[1], styles: ['italic'] });
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      
      // Code
      const codeMatch = remaining.match(/^`(.+?)`/);
      if (codeMatch) {
        segments.push({ text: codeMatch[1], styles: ['code'] });
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      
      // Strikethrough
      const strikeMatch = remaining.match(/^~~(.+?)~~/);
      if (this.options.strikethrough && strikeMatch) {
        segments.push({ text: strikeMatch[1], styles: ['strikethrough'] });
        remaining = remaining.slice(strikeMatch[0].length);
        continue;
      }
      
      // Link
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        segments.push({ text: linkMatch[1], styles: [], link: linkMatch[2] });
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }
      
      // Inline math
      const mathMatch = remaining.match(/^\$(.+?)\$/);
      if (this.options.math && mathMatch) {
        segments.push({ text: '', styles: [], equation: mathMatch[1] });
        remaining = remaining.slice(mathMatch[0].length);
        continue;
      }
      
      // Plain text (take until next special char)
      const plainMatch = remaining.match(/^[^*`~\[$]+/);
      if (plainMatch) {
        segments.push({ text: plainMatch[0], styles: [] });
        remaining = remaining.slice(plainMatch[0].length);
        continue;
      }
      
      // Single char fallback
      segments.push({ text: remaining[0], styles: [] });
      remaining = remaining.slice(1);
    }
    
    return segments;
  }
  
  serialize(blocks: Block[]): string {
    return blocks.map(block => this.serializeBlock(block)).join('\n\n');
  }
  
  private serializeBlock(block: Block, level: number = 0): string {
    const indent = '  '.repeat(level);
    
    switch (block.type) {
      case 'heading1':
        return `# ${this.serializeRichText(block.content.text)}`;
      case 'heading2':
        return `## ${this.serializeRichText(block.content.text)}`;
      case 'heading3':
        return `### ${this.serializeRichText(block.content.text)}`;
      case 'heading4':
        return `#### ${this.serializeRichText(block.content.text)}`;
      case 'heading5':
        return `##### ${this.serializeRichText(block.content.text)}`;
      case 'heading6':
        return `###### ${this.serializeRichText(block.content.text)}`;
      
      case 'paragraph':
        return indent + this.serializeRichText(block.content.text);
      
      case 'bulletList':
        return block.children?.map(child => 
          `${indent}- ${this.serializeRichText(child.content.text)}`
        ).join('\n') || '';
      
      case 'numberedList':
        return block.children?.map((child, i) => 
          `${indent}${i + 1}. ${this.serializeRichText(child.content.text)}`
        ).join('\n') || '';
      
      case 'todoList':
        return block.children?.map(child => 
          `${indent}- [${child.content.checked ? 'x' : ' '}] ${this.serializeRichText(child.content.text)}`
        ).join('\n') || '';
      
      case 'quote':
        return this.serializeRichText(block.content.text)
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n');
      
      case 'codeBlock':
        return `\`\`\`${block.content.language || ''}\n${this.serializeRichText(block.content.text)}\n\`\`\``;
      
      case 'divider':
        return '---';
      
      case 'image':
        return `![${block.content.caption || ''}](${block.content.url})`;
      
      case 'table':
        if (!block.content.tableData) return '';
        const header = block.content.tableData[0];
        const rows = block.content.tableData.slice(1);
        return [
          '| ' + header.map(cell => this.serializeRichText(cell.content)).join(' | ') + ' |',
          '| ' + header.map(() => '---').join(' | ') + ' |',
          ...rows.map(row => '| ' + row.map(cell => this.serializeRichText(cell.content)).join(' | ') + ' |')
        ].join('\n');
      
      case 'mathBlock':
        return `$$\n${this.serializeRichText(block.content.text)}\n$$`;
      
      default:
        return this.serializeRichText(block.content.text);
    }
  }
  
  private serializeRichText(richText?: RichText[]): string {
    if (!richText) return '';
    
    return richText.map(segment => {
      let text = segment.text;
      
      if (segment.equation) {
        return `$${segment.equation}$`;
      }
      
      if (segment.link) {
        return `[${text}](${segment.link})`;
      }
      
      if (segment.styles.includes('bold')) {
        text = `**${text}**`;
      }
      if (segment.styles.includes('italic')) {
        text = `*${text}*`;
      }
      if (segment.styles.includes('code')) {
        text = `\`${text}\``;
      }
      if (segment.styles.includes('strikethrough')) {
        text = `~~${text}~~`;
      }
      
      return text;
    }).join('');
  }
  
  private generateId(): string {
    return `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// ITEM 766-770: NOTE EDITOR ENGINE
// =============================================================================

export interface EditorConfig {
  autosave: boolean;
  autosaveInterval: number;
  spellcheck: boolean;
  markdown: boolean;
  emojiShortcodes: boolean;
  slashCommands: boolean;
  tableOfContents: boolean;
  wordCount: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
}

export interface Selection {
  blockId: string;
  start: number;
  end: number;
}

export interface Clipboard {
  blocks: Block[];
  html?: string;
  text?: string;
}

export class NoteEngine {
  private notes: Map<string, Note> = new Map();
  private activeNote: Note | null = null;
  private config: EditorConfig;
  private markdownParser: MarkdownParser;
  private undoStack: Block[][] = [];
  private redoStack: Block[][] = [];
  private selection: Selection | null = null;
  private clipboard: Clipboard | null = null;
  private autosaveTimer?: ReturnType<typeof setTimeout>;
  private listeners: Map<string, Set<(event: NoteEvent) => void>> = new Map();
  
  constructor(config?: Partial<EditorConfig>) {
    this.config = {
      autosave: true,
      autosaveInterval: 5000,
      spellcheck: true,
      markdown: true,
      emojiShortcodes: true,
      slashCommands: true,
      tableOfContents: true,
      wordCount: true,
      focusMode: false,
      typewriterMode: false,
      ...config
    };
    
    this.markdownParser = new MarkdownParser();
  }
  
  // Note CRUD
  createNote(title: string = 'Untitled', notebookId?: string): Note {
    const note: Note = {
      id: this.generateId(),
      title,
      content: [this.createBlock('paragraph')],
      notebookId,
      tags: [],
      pinned: false,
      locked: false,
      archived: false,
      trashed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      wordCount: 0,
      characterCount: 0,
      readingTime: 0,
      version: 1
    };
    
    this.notes.set(note.id, note);
    this.emit('note-created', { note });
    
    return note;
  }
  
  openNote(noteId: string): Note | null {
    const note = this.notes.get(noteId);
    if (note) {
      note.accessedAt = Date.now();
      this.activeNote = note;
      this.undoStack = [];
      this.redoStack = [];
      this.emit('note-opened', { note });
      
      if (this.config.autosave) {
        this.startAutosave();
      }
    }
    return note || null;
  }
  
  closeNote(): void {
    if (this.activeNote) {
      this.stopAutosave();
      this.emit('note-closed', { noteId: this.activeNote.id });
      this.activeNote = null;
    }
  }
  
  saveNote(): void {
    if (this.activeNote) {
      this.activeNote.updatedAt = Date.now();
      this.activeNote.version++;
      this.updateWordCount();
      this.emit('note-saved', { note: this.activeNote });
    }
  }
  
  deleteNote(noteId: string): void {
    const note = this.notes.get(noteId);
    if (note) {
      note.trashed = true;
      note.updatedAt = Date.now();
      this.emit('note-trashed', { note });
    }
  }
  
  permanentlyDeleteNote(noteId: string): void {
    const note = this.notes.get(noteId);
    if (note) {
      this.notes.delete(noteId);
      this.emit('note-deleted', { noteId });
    }
  }
  
  restoreNote(noteId: string): void {
    const note = this.notes.get(noteId);
    if (note && note.trashed) {
      note.trashed = false;
      note.updatedAt = Date.now();
      this.emit('note-restored', { note });
    }
  }
  
  duplicateNote(noteId: string): Note | null {
    const original = this.notes.get(noteId);
    if (!original) return null;
    
    const duplicate: Note = {
      ...original,
      id: this.generateId(),
      title: `${original.title} (Copy)`,
      content: JSON.parse(JSON.stringify(original.content)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      version: 1
    };
    
    this.notes.set(duplicate.id, duplicate);
    this.emit('note-duplicated', { original, duplicate });
    
    return duplicate;
  }
  
  // Block operations
  createBlock(type: BlockType, text: string = ''): Block {
    return {
      id: this.generateId(),
      type,
      content: {
        text: text ? [{ text, styles: [] }] : []
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indentLevel: 0,
        isCollapsed: false
      }
    };
  }
  
  insertBlock(afterBlockId: string, type: BlockType = 'paragraph'): Block | null {
    if (!this.activeNote) return null;
    
    const newBlock = this.createBlock(type);
    const index = this.activeNote.content.findIndex(b => b.id === afterBlockId);
    
    if (index !== -1) {
      this.pushUndo();
      this.activeNote.content.splice(index + 1, 0, newBlock);
      this.emit('block-inserted', { block: newBlock, afterId: afterBlockId });
    }
    
    return newBlock;
  }
  
  deleteBlock(blockId: string): void {
    if (!this.activeNote) return;
    
    const index = this.activeNote.content.findIndex(b => b.id === blockId);
    if (index !== -1) {
      this.pushUndo();
      const deleted = this.activeNote.content.splice(index, 1)[0];
      
      // Ensure at least one block
      if (this.activeNote.content.length === 0) {
        this.activeNote.content.push(this.createBlock('paragraph'));
      }
      
      this.emit('block-deleted', { block: deleted });
    }
  }
  
  moveBlock(blockId: string, direction: 'up' | 'down'): void {
    if (!this.activeNote) return;
    
    const index = this.activeNote.content.findIndex(b => b.id === blockId);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (index !== -1 && newIndex >= 0 && newIndex < this.activeNote.content.length) {
      this.pushUndo();
      const block = this.activeNote.content.splice(index, 1)[0];
      this.activeNote.content.splice(newIndex, 0, block);
      this.emit('block-moved', { block, direction });
    }
  }
  
  convertBlock(blockId: string, newType: BlockType): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (block) {
      this.pushUndo();
      block.type = newType;
      block.metadata.updatedAt = Date.now();
      this.emit('block-converted', { block, newType });
    }
  }
  
  indentBlock(blockId: string, direction: 'indent' | 'outdent'): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (block) {
      this.pushUndo();
      const delta = direction === 'indent' ? 1 : -1;
      block.metadata.indentLevel = Math.max(0, block.metadata.indentLevel + delta);
      this.emit('block-indented', { block, level: block.metadata.indentLevel });
    }
  }
  
  updateBlockText(blockId: string, text: RichText[]): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (block) {
      block.content.text = text;
      block.metadata.updatedAt = Date.now();
      this.emit('block-updated', { block });
    }
  }
  
  toggleBlockCollapse(blockId: string): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (block) {
      block.metadata.isCollapsed = !block.metadata.isCollapsed;
      this.emit('block-toggled', { block });
    }
  }
  
  // Text formatting
  applyFormat(blockId: string, style: TextStyle, start: number, end: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block || !block.content.text) return;
    
    this.pushUndo();
    
    // Apply style to affected segments
    // This is simplified - real implementation would handle segment splitting
    for (const segment of block.content.text) {
      if (!segment.styles.includes(style)) {
        segment.styles.push(style);
      }
    }
    
    this.emit('format-applied', { blockId, style, start, end });
  }
  
  removeFormat(blockId: string, style: TextStyle, start: number, end: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block || !block.content.text) return;
    
    this.pushUndo();
    
    for (const segment of block.content.text) {
      segment.styles = segment.styles.filter(s => s !== style);
    }
    
    this.emit('format-removed', { blockId, style, start, end });
  }
  
  setTextColor(blockId: string, color: TextColor, start: number, end: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block || !block.content.text) return;
    
    this.pushUndo();
    
    for (const segment of block.content.text) {
      segment.color = color;
    }
    
    this.emit('color-changed', { blockId, color, start, end });
  }
  
  insertLink(blockId: string, url: string, text: string, position: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block) return;
    
    this.pushUndo();
    
    if (!block.content.text) {
      block.content.text = [];
    }
    
    block.content.text.push({ text, styles: [], link: url });
    this.emit('link-inserted', { blockId, url, text });
  }
  
  insertMention(blockId: string, mention: Mention, position: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block) return;
    
    this.pushUndo();
    
    if (!block.content.text) {
      block.content.text = [];
    }
    
    block.content.text.push({ text: mention.text, styles: [], mention });
    this.emit('mention-inserted', { blockId, mention });
  }
  
  insertEmoji(blockId: string, emoji: string, position: number): void {
    if (!this.activeNote) return;
    
    const block = this.activeNote.content.find(b => b.id === blockId);
    if (!block) return;
    
    this.pushUndo();
    
    if (!block.content.text) {
      block.content.text = [];
    }
    
    block.content.text.push({ text: '', styles: [], emoji });
    this.emit('emoji-inserted', { blockId, emoji });
  }
  
  // Undo/Redo
  private pushUndo(): void {
    if (!this.activeNote) return;
    
    this.undoStack.push(JSON.parse(JSON.stringify(this.activeNote.content)));
    this.redoStack = [];
    
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
  }
  
  undo(): void {
    if (!this.activeNote || this.undoStack.length === 0) return;
    
    this.redoStack.push(JSON.parse(JSON.stringify(this.activeNote.content)));
    this.activeNote.content = this.undoStack.pop()!;
    this.emit('undo', {});
  }
  
  redo(): void {
    if (!this.activeNote || this.redoStack.length === 0) return;
    
    this.undoStack.push(JSON.parse(JSON.stringify(this.activeNote.content)));
    this.activeNote.content = this.redoStack.pop()!;
    this.emit('redo', {});
  }
  
  // Clipboard
  copy(blockIds: string[]): void {
    if (!this.activeNote) return;
    
    const blocks = this.activeNote.content.filter(b => blockIds.includes(b.id));
    this.clipboard = {
      blocks: JSON.parse(JSON.stringify(blocks)),
      text: this.blocksToText(blocks)
    };
    
    this.emit('copied', { blockCount: blocks.length });
  }
  
  cut(blockIds: string[]): void {
    if (!this.activeNote) return;
    
    this.copy(blockIds);
    this.pushUndo();
    
    for (const id of blockIds) {
      this.deleteBlock(id);
    }
    
    this.emit('cut', { blockCount: blockIds.length });
  }
  
  paste(afterBlockId?: string): void {
    if (!this.activeNote || !this.clipboard) return;
    
    this.pushUndo();
    
    const newBlocks = this.clipboard.blocks.map(b => ({
      ...b,
      id: this.generateId()
    }));
    
    const insertIndex = afterBlockId 
      ? this.activeNote.content.findIndex(b => b.id === afterBlockId) + 1
      : this.activeNote.content.length;
    
    this.activeNote.content.splice(insertIndex, 0, ...newBlocks);
    this.emit('pasted', { blockCount: newBlocks.length });
  }
  
  private blocksToText(blocks: Block[]): string {
    return blocks.map(block => {
      if (!block.content.text) return '';
      return block.content.text.map(s => s.text).join('');
    }).join('\n');
  }
  
  // Import/Export
  importMarkdown(markdown: string): void {
    if (!this.activeNote) return;
    
    this.pushUndo();
    this.activeNote.content = this.markdownParser.parse(markdown);
    this.emit('markdown-imported', {});
  }
  
  exportMarkdown(): string {
    if (!this.activeNote) return '';
    return this.markdownParser.serialize(this.activeNote.content);
  }
  
  exportHTML(): string {
    if (!this.activeNote) return '';
    
    const blocksHTML = this.activeNote.content.map(block => 
      this.blockToHTML(block)
    ).join('\n');
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${this.activeNote.title}</title>
</head>
<body>
  <h1>${this.activeNote.title}</h1>
  ${blocksHTML}
</body>
</html>`;
  }
  
  private blockToHTML(block: Block): string {
    const content = this.richTextToHTML(block.content.text);
    
    switch (block.type) {
      case 'heading1': return `<h1>${content}</h1>`;
      case 'heading2': return `<h2>${content}</h2>`;
      case 'heading3': return `<h3>${content}</h3>`;
      case 'heading4': return `<h4>${content}</h4>`;
      case 'heading5': return `<h5>${content}</h5>`;
      case 'heading6': return `<h6>${content}</h6>`;
      case 'paragraph': return `<p>${content}</p>`;
      case 'quote': return `<blockquote>${content}</blockquote>`;
      case 'codeBlock': return `<pre><code>${content}</code></pre>`;
      case 'divider': return '<hr />';
      case 'image': return `<img src="${block.content.url}" alt="${block.content.caption || ''}" />`;
      case 'bulletList':
        return `<ul>${block.children?.map(c => `<li>${this.richTextToHTML(c.content.text)}</li>`).join('') || ''}</ul>`;
      case 'numberedList':
        return `<ol>${block.children?.map(c => `<li>${this.richTextToHTML(c.content.text)}</li>`).join('') || ''}</ol>`;
      case 'todoList':
        return `<ul class="todo-list">${block.children?.map(c => 
          `<li><input type="checkbox" ${c.content.checked ? 'checked' : ''} /> ${this.richTextToHTML(c.content.text)}</li>`
        ).join('') || ''}</ul>`;
      default: return `<div>${content}</div>`;
    }
  }
  
  private richTextToHTML(richText?: RichText[]): string {
    if (!richText) return '';
    
    return richText.map(segment => {
      let html = this.escapeHTML(segment.text);
      
      if (segment.styles.includes('bold')) html = `<strong>${html}</strong>`;
      if (segment.styles.includes('italic')) html = `<em>${html}</em>`;
      if (segment.styles.includes('underline')) html = `<u>${html}</u>`;
      if (segment.styles.includes('strikethrough')) html = `<del>${html}</del>`;
      if (segment.styles.includes('code')) html = `<code>${html}</code>`;
      
      if (segment.link) {
        html = `<a href="${segment.link}">${html}</a>`;
      }
      
      return html;
    }).join('');
  }
  
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // Word count
  private updateWordCount(): void {
    if (!this.activeNote) return;
    
    let text = '';
    for (const block of this.activeNote.content) {
      if (block.content.text) {
        text += block.content.text.map(s => s.text).join('') + ' ';
      }
    }
    
    this.activeNote.characterCount = text.length;
    this.activeNote.wordCount = text.trim().split(/\s+/).filter(w => w).length;
    this.activeNote.readingTime = Math.ceil(this.activeNote.wordCount / 200);
  }
  
  // Autosave
  private startAutosave(): void {
    this.stopAutosave();
    this.autosaveTimer = setInterval(() => {
      this.saveNote();
    }, this.config.autosaveInterval);
  }
  
  private stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
  }
  
  // Event handling
  on(event: string, callback: (event: NoteEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: NoteEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const noteEvent: NoteEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(noteEvent));
    }
  }
  
  // Getters
  getNotes(): Note[] {
    return Array.from(this.notes.values());
  }
  
  getNote(noteId: string): Note | undefined {
    return this.notes.get(noteId);
  }
  
  getActiveNote(): Note | null {
    return this.activeNote;
  }
  
  getConfig(): EditorConfig {
    return { ...this.config };
  }
  
  updateConfig(config: Partial<EditorConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  // Utilities
  private generateId(): string {
    return `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface NoteEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createNoteEngine = (config?: Partial<EditorConfig>) => new NoteEngine(config);

export default { NoteEngine, createNoteEngine };
