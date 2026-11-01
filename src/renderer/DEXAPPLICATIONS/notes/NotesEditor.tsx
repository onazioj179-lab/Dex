// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- Editor Core
// ==========================================================================
// Custom contenteditable-based rich text editor with formatting toolbar,
// keyboard shortcuts, block types, inline marks, and embedded content.
// ==========================================================================

import React, { useRef, useCallback, useEffect, useState, memo } from 'react';
import DOMPurify from 'dompurify';
import { platform } from '../../utils';
import {
  DocRoot,
  docToHTML,
  htmlToDoc,
  docToPlainText,
  deserializeDoc,
  serializeDoc,
  UndoManager,
  countWords,
} from './NotesDocumentModel';
import { askConfiguredLLM, hasConfiguredProvider } from '../../uki/providers/connect';
import { renderPrompt, STANDARD_TEMPLATES } from '../../../shared/uki/promptTemplates';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { searchLines } from '../../../shared/search/textSearch';
import { analyzeText, readingTimeMinutes } from '../../../shared/text/documentStats';
import DexIcon from '../../components/DexIcon';
import SketchPad, { type SketchMode } from './SketchPad';

// ---------------------------------------------------------------------------
// Document statistics helpers
// ---------------------------------------------------------------------------

/** Rough sentence count: text split on terminators, non-empty segments. */
function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotesEditorProps {
  content: string;
  onChange: (content: string, plainText: string, wordCount: number) => void;
  onSave: () => void;
  readOnly?: boolean;
  editorMode: 'edit' | 'preview' | 'split';
  focusMode?: boolean;
  placeholder?: string;
  /** Existing note titles, used to power [[wiki-link]] autocomplete. */
  noteTitles?: string[];
  /** Invoked when a rendered [[wiki-link]] is clicked, with the target title. */
  onWikiLinkClick?: (title: string) => void;
  /** Invoked when files are dropped onto the editor, to add them as attachments. */
  onDropFiles?: (files: FileList) => void;
}

interface ToolbarAction {
  id: string;
  label: string;
  icon: string;
  /** DexIcon glyph name; when set it renders instead of the text `icon` (declutter). */
  glyph?: string;
  command: string;
  arg?: string;
  shortcut?: string;
}

// ---------------------------------------------------------------------------
// Toolbar Configuration
// ---------------------------------------------------------------------------

const _M = platform.isMac ? '⌘' : 'Ctrl';

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    { id: 'bold', label: 'Bold', icon: 'B', command: 'bold', shortcut: `${_M}+B` },
    { id: 'italic', label: 'Italic', icon: 'I', command: 'italic', shortcut: `${_M}+I` },
    { id: 'underline', label: 'Underline', icon: 'U', command: 'underline', shortcut: `${_M}+U` },
    { id: 'strikethrough', label: 'Strikethrough', icon: 'S', command: 'strikeThrough' },
  ],
  [
    { id: 'h1', label: 'Heading 1', icon: 'H1', command: 'formatBlock', arg: 'h1' },
    { id: 'h2', label: 'Heading 2', icon: 'H2', command: 'formatBlock', arg: 'h2' },
    { id: 'h3', label: 'Heading 3', icon: 'H3', command: 'formatBlock', arg: 'h3' },
  ],
  [
    { id: 'ul', label: 'Bullet List', icon: 'UL', glyph: 'list', command: 'insertUnorderedList' },
    { id: 'ol', label: 'Numbered List', icon: 'OL', command: 'insertOrderedList' },
    { id: 'checklist', label: 'Checklist', icon: 'CL', glyph: 'check-square', command: 'checklist' },
  ],
  [
    { id: 'blockquote', label: 'Quote', icon: 'Q', command: 'formatBlock', arg: 'blockquote' },
    { id: 'code', label: 'Code Block', icon: '<>', command: 'codeBlock' },
    { id: 'hr', label: 'Divider', icon: '--', command: 'insertHorizontalRule' },
  ],
  [
    { id: 'highlight', label: 'Highlight', icon: 'HL', glyph: 'highlighter', command: 'highlight' },
    { id: 'inlinecode', label: 'Inline Code', icon: '`', glyph: 'code', command: 'inlineCode' },
    { id: 'link', label: 'Link', icon: 'LK', glyph: 'link', command: 'link' },
  ],
  [
    { id: 'table', label: 'Insert Table', icon: 'TBL', glyph: 'grid', command: 'table' },
    { id: 'sketch', label: 'Insert Sketch', icon: 'Drw', glyph: 'pen-tool', command: 'sketch' },
    { id: 'signature', label: 'Insert Handwritten Signature', icon: 'Sig', glyph: 'feather', command: 'signature' },
    { id: 'columns', label: 'Two Columns', icon: 'Col', command: 'columns' },
    { id: 'callout-note', label: 'Callout: Note', icon: 'Note', glyph: 'info', command: 'callout', arg: 'note' },
    { id: 'callout-warning', label: 'Callout: Warning', icon: 'Warn', glyph: 'alert-triangle', command: 'callout', arg: 'warning' },
    { id: 'callout-tip', label: 'Callout: Tip', icon: 'Tip', glyph: 'lightbulb', command: 'callout', arg: 'tip' },
  ],
  [
    // Native execCommand verbs -- routed through the toolbar's default dispatcher,
    // so they persist exactly like Bold/Heading do. Indentation drives nested lists.
    { id: 'outdent', label: 'Decrease Indent', icon: 'Out', command: 'outdent' },
    { id: 'indent', label: 'Increase Indent', icon: 'In', command: 'indent' },
    { id: 'align-left', label: 'Align Left', icon: 'AL', glyph: 'align-left', command: 'justifyLeft' },
    { id: 'align-center', label: 'Align Center', icon: 'AC', glyph: 'align-center', command: 'justifyCenter' },
    { id: 'align-right', label: 'Align Right', icon: 'AR', glyph: 'align-right', command: 'justifyRight' },
  ],
];

// ---------------------------------------------------------------------------
// Editor typography (DEX 5.7) — a Word-style default-font picker. The chosen
// family + size apply to the whole editor (body text; headings keep their CSS
// scale but adopt the family) and persist across notes via localStorage.
// ---------------------------------------------------------------------------

const NOTE_FONTS: { label: string; value: string }[] = [
  { label: 'Sans', value: 'var(--dex-font-ui)' },
  { label: 'Serif', value: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { label: 'Mono', value: 'var(--font-mono)' },
  { label: 'System', value: 'system-ui, -apple-system, sans-serif' },
];
const NOTE_SIZES = [13, 14, 15, 16, 18, 20, 24];
const NOTE_FONT_KEY = 'dex-notes-font-family';
const NOTE_SIZE_KEY = 'dex-notes-font-size';

// ---------------------------------------------------------------------------
// uki AI writing actions (roadmap: "Writing assistance in Notes")
// ---------------------------------------------------------------------------
// Each runs a one-shot through the user's configured provider on the current
// selection (or the whole note when nothing is selected). Prompts are built
// injection-safe via promptTemplates. 'replace' swaps the selection in place;
// 'append' (Continue) and any whole-note run add at the end, never destroying
// existing text. Degrades to a status hint when no provider key is set.

const AI_SYSTEM =
  'You are a writing assistant inside DEX Notes. Return ONLY the resulting text — ' +
  "no preamble, commentary, or surrounding quotes. Preserve the author's meaning.";

interface AiAction {
  id: string;
  label: string;
  mode: 'replace' | 'append';
  build: (text: string) => string;
}

const AI_ACTIONS: AiAction[] = [
  {
    id: 'ai-improve',
    label: 'Improve',
    mode: 'replace',
    build: (t) => renderPrompt(STANDARD_TEMPLATES.rewrite_tone, { tone: 'clear, polished, and professional', text: t }),
  },
  {
    id: 'ai-summarise',
    label: 'Summarise',
    mode: 'replace',
    build: (t) => renderPrompt(STANDARD_TEMPLATES.summarise, { maxSentences: '3', text: t }),
  },
  {
    id: 'ai-bullets',
    label: 'Bullets',
    mode: 'replace',
    build: (t) => renderPrompt(STANDARD_TEMPLATES.bullet_points, { count: '5', text: t }),
  },
  {
    id: 'ai-extend',
    label: 'Continue',
    mode: 'append',
    build: (t) =>
      'Continue writing the following text naturally, matching its tone and style. ' +
      'Return only the continuation (do not repeat the existing text):\n\n' + t,
  },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'transparent',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '6px var(--space-3)',
    borderBottom: '1px solid var(--color-bg-hover)',
    background: 'var(--color-bg-inset, rgba(0,0,0,0.15))',
    flexWrap: 'wrap',
    minHeight: 38,
    flexShrink: 0,
  },
  toolbarGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    marginRight: 6,
  },
  toolbarBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--dex-font-ui)',
    transition: 'background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms cubic-bezier(0.4,0,0.2,1)',
  },
  toolbarBtnActive: {
    background: 'var(--color-border)',
    color: 'var(--color-text-primary)',
  },
  toolbarSep: {
    width: 1,
    height: 18,
    background: 'var(--color-border-subtle)',
    marginLeft: 4,
    marginRight: 4,
  },
  editorWrap: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  editorArea: {
    flex: 1,
    overflow: 'auto',
  },
  editable: {
    minHeight: '100%',
    padding: 'var(--space-4) var(--space-8)',
    outline: 'none',
    color: 'var(--color-text-primary, #e0e0e0)',
    fontSize: 15,
    lineHeight: 1.7,
    fontFamily: 'var(--dex-font-ui)',
    caretColor: '#64d2ff',
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
  },
  preview: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4) var(--space-8)',
    color: 'var(--color-text-primary, #e0e0e0)',
    fontSize: 15,
    lineHeight: 1.7,
    fontFamily: 'var(--dex-font-ui)',
  },
  splitDivider: {
    width: 1,
    background: 'var(--color-bg-hover)',
    flexShrink: 0,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px var(--space-3)',
    borderTop: '1px solid var(--color-bg-hover)',
    background: 'var(--color-bg-inset, rgba(0,0,0,0.1))',
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    flexShrink: 0,
  },
  placeholder: {
    position: 'absolute' as const,
    top: 16,
    left: 32,
    color: 'var(--color-text-tertiary)',
    fontSize: 15,
    pointerEvents: 'none' as const,
    fontFamily: 'var(--dex-font-ui)',
  },
  focusModeEditable: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '48px var(--space-8)',
  },
  aiBtn: {
    height: 28,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  aiBtnDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  aiStatus: {
    color: 'var(--color-accent)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '60%',
  },
  dropOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(100,210,255,0.08)',
    border: '2px dashed rgba(100,210,255,0.6)',
    borderRadius: 'var(--radius-md, 8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 5,
  },
  // [[wiki-link]] popup -- mirrors the WordSuggestions SuggestionBar styling.
  wikiPopup: {
    position: 'fixed',
    zIndex: 'var(--z-tooltip)' as unknown as number,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-elevated, rgba(30,30,30,0.97))',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm, 4px)',
    padding: '4px 0',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    minWidth: 160,
    maxWidth: 320,
    maxHeight: 240,
    overflow: 'auto',
  },
  wikiItem: {
    padding: '6px var(--space-3)',
    fontSize: 13,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'background 0.1s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  wikiItemActive: {
    background: 'rgba(191,90,242,0.18)',
    color: 'var(--color-text-primary)',
  },
};

// ---------------------------------------------------------------------------
// Editor Component
// ---------------------------------------------------------------------------

export const NotesEditor: React.FC<NotesEditorProps> = memo(({
  content,
  onChange,
  onSave,
  readOnly = false,
  editorMode,
  focusMode = false,
  placeholder = 'Start writing...',
  noteTitles = [],
  onWikiLinkClick,
  onDropFiles,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const undoMgr = useRef(new UndoManager(200));
  const lastContent = useRef(content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposing = useRef(false);
  // Set by the Ctrl/Cmd+Shift+V shortcut so the next paste lands as plain text,
  // stripping all formatting (the normal paste keeps rich HTML when available).
  const forcePlainRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [sketchMode, setSketchMode] = useState<SketchMode | null>(null);
  const sketchRangeRef = useRef<Range | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [wdCount, setWdCount] = useState(0);
  const [sentenceCount, setSentenceCount] = useState(0);
  // Per-editor word-count goal (persisted); session baseline powers "+N this session".
  const [wordGoal, setWordGoal] = useState(() => {
    try { return parseInt(localStorage.getItem('dex-notes-wordgoal') || '0', 10) || 0; } catch { return 0; }
  });
  const sessionBaseRef = useRef<number | null>(null);
  // Reading level (Flesch-Kincaid grade + ease band) -- shown once a note is long
  // enough for the score to be meaningful. Computed in the debounced pass below.
  const [readability, setReadability] = useState('');
  // -- Outline (document headings -> navigable table of contents) -------------
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<{ level: number; text: string }[]>([]);

  // -- Editor typography (DEX 5.7): persisted default font family + size -------
  const [fontFamily, setFontFamily] = useState<string>(() => {
    try { return localStorage.getItem(NOTE_FONT_KEY) || 'var(--dex-font-ui)'; } catch { return 'var(--dex-font-ui)'; }
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(NOTE_SIZE_KEY)); return v >= 10 && v <= 40 ? v : 15; } catch { return 15; }
  });
  const setEditorFont = useCallback((family: string) => {
    setFontFamily(family);
    try { localStorage.setItem(NOTE_FONT_KEY, family); } catch { /* best-effort pref persistence */ }
  }, []);
  const setEditorSize = useCallback((size: number) => {
    setFontSize(size);
    try { localStorage.setItem(NOTE_SIZE_KEY, String(size)); } catch { /* best-effort pref persistence */ }
  }, []);

  // Rebuild the heading list straight off the live editor DOM (cheap; runs with
  // the other live counts). Order matches the DOM so the outline can scroll to
  // the Nth heading by index.
  const refreshHeadings = useCallback(() => {
    const el = editorRef.current;
    if (!el) { setHeadings([]); return; }
    const hs = Array.from(el.querySelectorAll('h1,h2,h3')).map((h) => ({
      level: Number(h.tagName.slice(1)) || 1,
      text: (h.textContent || '').trim(),
    })).filter((h) => h.text.length > 0);
    setHeadings(hs);
  }, []);

  const scrollToHeading = useCallback((index: number) => {
    const el = editorRef.current;
    if (!el) return;
    const target = el.querySelectorAll('h1,h2,h3')[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // -- [[wiki-link]] autocomplete state --------------------------------------
  // Mirrors the WordSuggestions popup mechanics: a caret-anchored list that
  // appears once the user opens "[[" and filters note titles by what follows.
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiPos, setWikiPos] = useState({ top: 0, left: 0 });
  const [wikiActive, setWikiActive] = useState(0);

  // Feed uki's app-context registry: answer "what note is open?" (first line as
  // a title + the live selection) so the assistant is aware of the active note.
  // Reads live DOM at call time, so a one-time registration is enough.
  useEffect(() => {
    registerUkiAppContext('notes', () => {
      const text = (editorRef.current?.textContent || '').trim();
      if (!text) return undefined;
      const selection = window.getSelection()?.toString().trim();
      // Idea: give UKI the note's size + reading level so it can reason about the
      // document it's looking at (e.g. "summarise this" knows it's a 1,200-word,
      // Grade-11 piece). Reuses the shared documentStats util.
      const s = analyzeText(text);
      return {
        appId: 'notes',
        currentFile: text.split('\n')[0]?.slice(0, 80) || undefined,
        selectionText: selection || undefined,
        custom: {
          length: `${s.words} words · ${s.readingTimeMinutes} min read${s.words >= 30 ? ` · Grade ${s.gradeLevel} (${s.readability})` : ''}`,
        },
      };
    });
    // Let UKI READ the open note as a callable action (read-only, no confirm).
    registerUkiAppAction('notes', {
      id: 'notes.getActiveNote',
      description: 'read the full plain text of the note currently open in Notes.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const text = (editorRef.current?.textContent || '').trim();
      return text ? text.slice(0, 4000) : 'No note is open in Notes.';
    });
    registerUkiAppAction('notes', {
      id: 'notes.search',
      description: 'search the open note for a query and return matching lines.',
      args: [{ name: 'query', type: 'string' }],
      example: '{"query":"meeting"}',
      mutates: false,
    }, (args) => {
      const text = (editorRef.current?.textContent || '').trim();
      if (!text) return 'No note is open in Notes.';
      const q = String(args.query ?? '');
      const hits = searchLines(text, q, 25);
      return hits.length ? hits.map((h) => `${h.line}: ${h.text}`).join('\n') : `No lines match "${q}".`;
    });
    // Enhance the open note with AI (mutating -> confirm-gated). Appends the
    // result below the original text; never overwrites. Degrades to a clear
    // message when no provider key is configured.
    registerUkiAppAction('notes', {
      id: 'notes.enhance',
      description: 'enhance the open note with AI: rewrite, summarize, fix grammar, or follow a custom instruction. The result is appended below the original text.',
      args: [{ name: 'instruction', type: 'string' }],
      example: '{"instruction": "Summarize this note into 5 bullet points"}',
      mutates: true,
    }, (args) => enhanceRef.current(String(args.instruction ?? '')));
    return () => {
      unregisterUkiAppContext('notes');
      unregisterUkiAppAction('notes.getActiveNote');
      unregisterUkiAppAction('notes.search');
      unregisterUkiAppAction('notes.enhance');
    };
  }, []);

  // Initial render: set editor HTML
  useEffect(() => {
    if (editorRef.current && content !== lastContent.current) {
      lastContent.current = content;
      const doc = deserializeDoc(content);
      const html = docToHTML(doc);
      editorRef.current.innerHTML = DOMPurify.sanitize(html);
      const text = editorRef.current.textContent || '';
      setIsEmpty(!text.trim());
      setCharCount(text.length);
      setWdCount(countWords(text));
      setSentenceCount(countSentences(text));
      refreshHeadings();
    }
  }, [content, refreshHeadings]);

  // Auto-focus editor so user can start typing immediately
  useEffect(() => {
    if (editorRef.current && !readOnly && editorMode !== 'preview') {
      const timer = setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          // Place cursor at end of content
          const sel = window.getSelection();
          if (sel && editorRef.current.childNodes.length > 0) {
            const range = document.createRange();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [readOnly, editorMode]);

  // Cleanup pending save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // -- Emit Changes ------------------------------------------------------

  const emitChange = useCallback(() => {
    if (!editorRef.current || isComposing.current) return;

    // Live, cheap counts straight off the DOM text -- runs every keystroke.
    // The expensive doc parse/serialize is deferred into the debounce below so
    // typing never pays for a full DOMParser + JSON.stringify of the document.
    const liveText = editorRef.current.textContent || '';
    setIsEmpty(!liveText.trim());
    setCharCount(liveText.length);
    setWdCount(countWords(liveText));
    setSentenceCount(countSentences(liveText));
    refreshHeadings();

    // Debounce the heavy work: parse HTML -> doc, serialize, extract plain text,
    // then notify the parent (which itself persists). onChange timing is
    // unchanged (it already only fired after this 300ms debounce).
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!editorRef.current) return;
      const doc = htmlToDoc(editorRef.current.innerHTML);
      const serialized = serializeDoc(doc);
      const plainText = docToPlainText(doc);
      const words = countWords(plainText);
      const stats = analyzeText(plainText);
      setReadability(stats.words >= 30 ? `Grade ${stats.gradeLevel} · ${stats.readability}` : '');
      lastContent.current = serialized;
      onChange(serialized, plainText, words);
    }, 300);
  }, [onChange]);

  // -- Undo/Redo Push ----------------------------------------------------

  const pushUndo = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const doc = htmlToDoc(html);
    undoMgr.current.push(doc, 'edit');
  }, []);

  // -- execCommand Wrapper -----------------------------------------------

  const exec = useCallback((command: string, arg?: string) => {
    pushUndo();
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    emitChange();
  }, [pushUndo, emitChange]);

  // Capture the session's starting word count once, then prompt to set a goal.
  useEffect(() => {
    if (sessionBaseRef.current === null) sessionBaseRef.current = wdCount;
  }, [wdCount]);
  const editGoal = useCallback(() => {
    const v = window.prompt('Set a word-count goal (0 to clear):', String(wordGoal));
    if (v === null) return;
    const n = Math.max(0, parseInt(v, 10) || 0);
    setWordGoal(n);
    try { localStorage.setItem('dex-notes-wordgoal', String(n)); } catch { /* noop */ }
  }, [wordGoal]);

  // -- [[wiki-link]] autocomplete ----------------------------------------

  const wikiMatches = React.useMemo(() => {
    const q = wikiQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of noteTitles) {
      const title = (t || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      if (q && !key.includes(q)) continue;
      seen.add(key);
      out.push(title);
      if (out.length >= 8) break;
    }
    return out;
  }, [noteTitles, wikiQuery]);

  const closeWiki = useCallback(() => {
    setWikiOpen(false);
    setWikiQuery('');
    setWikiActive(0);
  }, []);

  // Inspect the text immediately before the caret for an open "[[query".
  const detectWikiTrigger = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) { closeWiki(); return; }
    const range = sel.getRangeAt(0);
    if (!range.collapsed) { closeWiki(); return; }
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closeWiki(); return; }
    const before = (node.textContent || '').slice(0, range.startOffset);
    // Open "[[" with no closing "]]" between it and the caret, no newline.
    const m = before.match(/\[\[([^\[\]\n]*)$/);
    if (!m) { closeWiki(); return; }
    setWikiQuery(m[1]);
    setWikiActive(0);
    setWikiOpen(true);
    // Anchor at the caret, but clamp into the viewport so the popup never
    // spills off the right or bottom edge (flips above the caret if needed).
    const rect = range.getBoundingClientRect();
    const POPUP_W = 320;
    const POPUP_H = 240;
    const margin = 8;
    let left = rect.left;
    if (left + POPUP_W + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - POPUP_W - margin);
    }
    let top = rect.bottom + 4;
    if (top + POPUP_H + margin > window.innerHeight) {
      // Not enough room below -- place it above the caret instead.
      top = Math.max(margin, rect.top - POPUP_H - 4);
    }
    setWikiPos({ top, left });
  }, [closeWiki]);

  // Replace the open "[[query" before the caret with a finished "[[Title]]".
  const insertWikiLink = useCallback((title: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) { closeWiki(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closeWiki(); return; }
    const text = node.textContent || '';
    const before = text.slice(0, range.startOffset);
    const m = before.match(/\[\[([^\[\]\n]*)$/);
    if (!m) { closeWiki(); return; }
    pushUndo();
    const start = range.startOffset - m[0].length;
    const delRange = document.createRange();
    delRange.setStart(node, Math.max(0, start));
    delRange.setEnd(node, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(delRange);
    document.execCommand('insertText', false, `[[${title}]]`);
    closeWiki();
    emitChange();
  }, [closeWiki, pushUndo, emitChange]);

  // The popup is position:fixed at the caret, so any scroll would leave it
  // floating at a stale spot -- close it on scroll (capture catches the inner
  // scroll container too) while it is open. Listener only attached when open.
  useEffect(() => {
    if (!wikiOpen) return;
    const onScroll = () => closeWiki();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [wikiOpen, closeWiki]);

  // -- uki AI writing actions --------------------------------------------

  const setCaretToEnd = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }, []);

  // UKI agent-callable enhance: same provider + append-only discipline as the
  // toolbar AI actions, but drivable from the agent loop ("enhance my note").
  // Ref carries fresh closures so the one-time registration below never goes
  // stale. Confirm-gating and audit come from the app-action registry.
  const enhanceRef = useRef<(instruction: string) => Promise<string>>(async () => 'Notes is not ready.');
  enhanceRef.current = async (instruction: string) => {
    if (readOnly) return 'The open note is read-only.';
    const fullText = (editorRef.current?.textContent || '').trim();
    if (!fullText) return 'No note is open in Notes.';
    if (!hasConfiguredProvider()) return 'No AI provider is configured — add a provider key in Settings to enhance notes.';
    const ask = (instruction || 'Improve clarity, fix grammar, and tighten the writing.').trim();
    let result: string | null = null;
    try {
      result = await askConfiguredLLM(
        `${ask}\n\nTEXT:\n${fullText.slice(0, 6000)}`,
        AI_SYSTEM,
        { chatOptions: { temperature: 0.5, maxTokens: 900 } },
      );
    } catch {
      result = null;
    }
    if (!result) return 'uki could not complete that — provider call failed.';
    pushUndo();
    editorRef.current?.focus();
    setCaretToEnd();
    document.execCommand('insertText', false, '\n\n' + result);
    emitChange();
    return `Enhanced the note — result appended below the original text (${result.length} chars).`;
  };

  const runAiAction = useCallback(async (action: AiAction) => {
    if (readOnly || aiBusy) return;
    const sel = window.getSelection();
    const hasSelection = !!sel && sel.rangeCount > 0 && !sel.isCollapsed && !!sel.toString().trim();
    const selectedText = hasSelection ? sel!.toString().trim() : '';
    const fullText = (editorRef.current?.textContent || '').trim();
    const source = selectedText || fullText;
    if (!source) {
      setAiStatus('Nothing to work with — write or select some text first.');
      return;
    }
    if (!hasConfiguredProvider()) {
      setAiStatus('No AI provider configured.');
      return;
    }
    // Preserve the selection across the await so a 'replace' lands in the right spot.
    const savedRange = hasSelection && sel ? sel.getRangeAt(0).cloneRange() : null;

    setAiBusy(true);
    setAiStatus('uki is working…');
    let result: string | null = null;
    try {
      result = await askConfiguredLLM(action.build(source), AI_SYSTEM, {
        chatOptions: { temperature: 0.5, maxTokens: 900 },
      });
    } catch {
      result = null;
    }
    setAiBusy(false);
    if (!result) {
      setAiStatus('uki could not complete that — check your provider key and connection.');
      return;
    }
    setAiStatus('');

    pushUndo();
    editorRef.current?.focus();
    const replace = action.mode === 'replace' && hasSelection;
    if (replace) {
      if (savedRange) {
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(savedRange);
      }
      document.execCommand('insertText', false, result);
    } else {
      // Append at the end — non-destructive (whole-note runs never overwrite).
      setCaretToEnd();
      document.execCommand('insertText', false, (fullText ? '\n\n' : '') + result);
    }
    emitChange();
  }, [readOnly, aiBusy, pushUndo, emitChange, setCaretToEnd]);

  // -- Custom Commands ---------------------------------------------------

  const handleToolbarAction = useCallback((action: ToolbarAction) => {
    if (readOnly) return;

    switch (action.command) {
      case 'checklist': {
        pushUndo();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const li = document.createElement('li');
        li.className = 'checklist-item';
        li.setAttribute('data-checked', 'false');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        // Toggling is handled by the delegated onClick (handleClick), which also
        // syncs data-checked and emits a change -- so no per-checkbox listener
        // here (those leak across innerHTML rebuilds and double-fire on click).
        li.appendChild(checkbox);
        li.appendChild(document.createTextNode(' '));
        const ul = document.createElement('ul');
        ul.style.listStyleType = 'none';
        ul.style.paddingLeft = '4px';
        ul.appendChild(li);
        range.deleteContents();
        range.insertNode(ul);
        // Place cursor after checkbox
        const textNode = li.lastChild;
        if (textNode) {
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        emitChange();
        break;
      }
      case 'codeBlock': {
        pushUndo();
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = window.getSelection()?.toString() || '';
        pre.appendChild(code);
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rng = sel.getRangeAt(0);
          rng.deleteContents();
          rng.insertNode(pre);
        }
        emitChange();
        break;
      }
      case 'callout': {
        // Insert the RENDERED callout HTML so it shows styled immediately;
        // htmlToDoc reverses it via the data-callout attribute on save, so the
        // marker round-trips (see NotesDocumentModel parseElement 'blockquote').
        pushUndo();
        const type = action.arg === 'warning' || action.arg === 'tip' ? action.arg : 'note';
        const label = type === 'warning' ? 'Warning' : type === 'tip' ? 'Tip' : 'Note';
        const html =
          `<blockquote class="callout callout-${type}" data-callout="${type}">` +
          `<div class="callout-title" contenteditable="false">` +
          `<span class="callout-icon" aria-hidden="true"></span>` +
          `<span class="callout-label">${label}</span></div>` +
          `<div class="callout-body"><p><br></p></div></blockquote><p><br></p>`;
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        emitChange();
        break;
      }
      case 'table': {
        // Insert a 3x3 starter table (first row = headers). Cells inherit the
        // editor's contentEditable so they're editable; htmlToDoc parses
        // table/tr/td|th back to the model so it persists + round-trips.
        pushUndo();
        const cols = 3;
        const rows = 3;
        let html = '<table><tbody><tr>';
        for (let c = 0; c < cols; c++) html += `<th>Header ${c + 1}</th>`;
        html += '</tr>';
        for (let r = 1; r < rows; r++) {
          html += '<tr>';
          for (let c = 0; c < cols; c++) html += '<td><br></td>';
          html += '</tr>';
        }
        html += '</tbody></table><p><br></p>';
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        emitChange();
        break;
      }
      case 'columns': {
        // Two side-by-side editable columns, backed by a 1-row 2-cell table so
        // the layout ROUND-TRIPS through the document model (a raw flex div would
        // be dropped on save). No header row -- both cells are body columns.
        pushUndo();
        const html = '<table><tbody><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>';
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        emitChange();
        break;
      }
      case 'highlight': {
        pushUndo();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const rng = sel.getRangeAt(0);
          const mark = document.createElement('mark');
          mark.appendChild(rng.extractContents());
          rng.insertNode(mark);
        }
        emitChange();
        break;
      }
      case 'inlineCode': {
        pushUndo();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const rng = sel.getRangeAt(0);
          const codEl = document.createElement('code');
          codEl.appendChild(rng.extractContents());
          rng.insertNode(codEl);
        }
        emitChange();
        break;
      }
      case 'link': {
        const url = prompt('Enter URL:');
        if (url) {
          exec('createLink', url);
        }
        break;
      }
      case 'formatBlock':
        exec(action.command, action.arg);
        break;
      case 'sketch':
      case 'signature': {
        // Remember the caret so the drawing lands where the user was typing
        // (the dialog steals focus and the selection).
        const sel = window.getSelection();
        sketchRangeRef.current = sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)
          ? sel.getRangeAt(0).cloneRange()
          : null;
        setSketchMode(action.command as SketchMode);
        break;
      }
      default:
        exec(action.command, action.arg);
        break;
    }
  }, [readOnly, exec, pushUndo, emitChange]);

  const insertSketch = useCallback((dataUrl: string, alt: string) => {
    setSketchMode(null);
    const editor = editorRef.current;
    if (!editor) return;
    pushUndo();
    editor.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      if (sketchRangeRef.current) sel.addRange(sketchRangeRef.current);
      else { const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false); sel.addRange(r); }
    }
    // An ordinary image block: htmlToDoc/docToHTML already round-trip <img>.
    const safeAlt = alt.replace(/"/g, '&quot;');
    document.execCommand('insertHTML', false, `<p><img src="${dataUrl}" alt="${safeAlt}" /></p><p><br></p>`);
    emitChange();
  }, [pushUndo, emitChange]);

  // -- Keyboard Shortcuts ------------------------------------------------

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly) return;

    // Wiki-link popup steals navigation keys while open.
    if (wikiOpen && wikiMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWikiActive(i => Math.min(i + 1, wikiMatches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWikiActive(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertWikiLink(wikiMatches[wikiActive]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWiki();
        return;
      }
    }

    const ctrl = e.ctrlKey || e.metaKey;

    // Paste as plain text (Ctrl/Cmd+Shift+V): flag the upcoming paste so it
    // strips formatting. Do NOT preventDefault -- the browser still fires the
    // paste event, which handlePaste consumes and clears the flag.
    if (ctrl && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      forcePlainRef.current = true;
      return;
    }

    // Save
    if (ctrl && e.key === 's') {
      e.preventDefault();
      onSave();
      return;
    }

    // Undo
    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      if (!editorRef.current) return;
      const html = editorRef.current.innerHTML;
      const currentDoc = htmlToDoc(html);
      const prev = undoMgr.current.undo(currentDoc);
      if (prev) {
        editorRef.current.innerHTML = DOMPurify.sanitize(docToHTML(prev));
        emitChange();
      }
      return;
    }

    // Redo
    if (ctrl && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
      e.preventDefault();
      if (!editorRef.current) return;
      const html = editorRef.current.innerHTML;
      const currentDoc = htmlToDoc(html);
      const next = undoMgr.current.redo(currentDoc);
      if (next) {
        editorRef.current.innerHTML = DOMPurify.sanitize(docToHTML(next));
        emitChange();
      }
      return;
    }

    // Bold
    if (ctrl && e.key === 'b') {
      e.preventDefault();
      exec('bold');
      return;
    }

    // Italic
    if (ctrl && e.key === 'i') {
      e.preventDefault();
      exec('italic');
      return;
    }

    // Underline
    if (ctrl && e.key === 'u') {
      e.preventDefault();
      exec('underline');
      return;
    }

    // Tab handling in code blocks
    if (e.key === 'Tab') {
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        let node: Node | null = sel.anchorNode;
        while (node && node !== editorRef.current) {
          if (node instanceof HTMLElement && (node.tagName === 'PRE' || node.tagName === 'CODE')) {
            e.preventDefault();
            document.execCommand('insertText', false, '  ');
            emitChange();
            return;
          }
          node = node.parentNode;
        }
      }
    }

    // Enter in checklist inserts new checklist item
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        let node: Node | null = sel.anchorNode;
        while (node && node !== editorRef.current) {
          if (node instanceof HTMLElement && node.classList.contains('checklist-item')) {
            e.preventDefault();
            const li = document.createElement('li');
            li.className = 'checklist-item';
            li.setAttribute('data-checked', 'false');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            // Toggling handled by delegated onClick (handleClick); no per-node listener.
            li.appendChild(checkbox);
            li.appendChild(document.createTextNode(' '));
            node.parentNode?.insertBefore(li, node.nextSibling);
            const range = document.createRange();
            range.setStartAfter(li.lastChild!);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            emitChange();
            return;
          }
          node = node.parentNode;
        }
      }
    }
  }, [readOnly, exec, emitChange, onSave, wikiOpen, wikiMatches, wikiActive, insertWikiLink, closeWiki]);

  // -- Input Handler -----------------------------------------------------

  const handleInput = useCallback(() => {
    emitChange();
    detectWikiTrigger();
  }, [emitChange, detectWikiTrigger]);

  // -- Composition (IME) -------------------------------------------------

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false;
    emitChange();
  }, [emitChange]);

  // -- Paste Handler (strip HTML formatting) -----------------------------

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Allow rich paste from our own editor, strip from external
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    // Paste-as-plain (Ctrl/Cmd+Shift+V): drop all HTML formatting this once.
    const plainOnly = forcePlainRef.current;
    forcePlainRef.current = false;

    // If it has HTML, use it (supports paste from other rich editors). Sanitize
    // first: external clipboard HTML is untrusted and can carry scripts / inline
    // event handlers (onerror, onload, ...) that would execute on insertion.
    if (html && !plainOnly) {
      e.preventDefault();
      pushUndo();
      document.execCommand('insertHTML', false, DOMPurify.sanitize(html));
      emitChange();
      return;
    }

    // Plain text paste
    if (text) {
      e.preventDefault();
      pushUndo();
      document.execCommand('insertText', false, text);
      emitChange();
    }
  }, [pushUndo, emitChange]);

  // -- Click on checkbox -------------------------------------------------

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
      const li = target.closest('.checklist-item');
      if (li) {
        const checked = (target as HTMLInputElement).checked;
        li.setAttribute('data-checked', checked ? 'true' : 'false');
        emitChange();
      }
      return;
    }
    // Wiki-link navigation: Ctrl/Cmd-click (or plain click in preview) follows it.
    const wiki = target.closest('a.wikilink') as HTMLElement | null;
    if (wiki && onWikiLinkClick) {
      const isPreview = !!target.closest('.dexnotes-preview');
      if (isPreview || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const title = wiki.getAttribute('data-wikilink') || wiki.textContent || '';
        if (title.trim()) onWikiLinkClick(title.trim());
      }
    }
  }, [emitChange, onWikiLinkClick]);

  // -- Render Preview ----------------------------------------------------

  const renderPreview = useCallback((docJson: string) => {
    const doc = deserializeDoc(docJson);
    return docToHTML(doc);
  }, []);

  // -- Drag-drop attachments ---------------------------------------------
  // A file dropped onto the editor becomes an attachment on the active note.
  // dragOver/dragLeave drive a subtle drop-target highlight; text/html drags
  // fall through to the browser's native handling untouched.

  const hasFileDrag = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (readOnly || !onDropFiles || !hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  }, [readOnly, onDropFiles, hasFileDrag, isDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when the cursor actually leaves the editor wrapper.
    if (e.currentTarget === e.target) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (readOnly || !onDropFiles) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      e.preventDefault();
      setIsDragOver(false);
      onDropFiles(files);
    }
  }, [readOnly, onDropFiles]);

  // -- Render ------------------------------------------------------------

  const showEditor = editorMode === 'edit' || editorMode === 'split';
  const showPreview = editorMode === 'preview' || editorMode === 'split';

  return (
    <div style={styles.container}>
      {sketchMode && (
        <SketchPad mode={sketchMode} onInsert={insertSketch} onCancel={() => setSketchMode(null)} />
      )}
      {/* Toolbar */}
      {!readOnly && editorMode !== 'preview' && (
        <div style={styles.toolbar}>
          {TOOLBAR_GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              <div style={styles.toolbarGroup}>
                {group.map(action => (
                  <button
                    key={action.id}
                    aria-label={action.label}
                    style={styles.toolbarBtn}
                    title={action.label + (action.shortcut ? ` (${action.shortcut})` : '')}
                    onMouseEnter={e => { e.currentTarget.style.background = styles.toolbarBtnActive.background as string; e.currentTarget.style.color = styles.toolbarBtnActive.color as string; }}
                    onMouseLeave={e => { e.currentTarget.style.background = styles.toolbarBtn.background as string; e.currentTarget.style.color = styles.toolbarBtn.color as string; }}
                    onMouseDown={e => { e.preventDefault(); handleToolbarAction(action); }}
                  >
                    {action.glyph ? <DexIcon name={action.glyph} size={15} /> : action.icon}
                  </button>
                ))}
              </div>
              {gi < TOOLBAR_GROUPS.length - 1 && <div style={styles.toolbarSep} />}
            </React.Fragment>
          ))}
          {/* Typography: default font family + size for the editor (persisted) */}
          <div style={styles.toolbarSep} />
          <div style={styles.toolbarGroup}>
            <select
              aria-label="Editor font"
              title="Editor font family"
              value={fontFamily}
              onChange={e => setEditorFont(e.target.value)}
              style={{ height: 28, borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--dex-font-ui)', padding: '0 4px', cursor: 'pointer' }}
            >
              {NOTE_FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
            <select
              aria-label="Font size"
              title="Font size"
              value={fontSize}
              onChange={e => setEditorSize(Number(e.target.value))}
              style={{ height: 28, borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--dex-font-ui)', padding: '0 4px', cursor: 'pointer' }}
            >
              {NOTE_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
          </div>
          {/* uki AI writing actions */}
          <div style={styles.toolbarSep} />
          <div style={styles.toolbarGroup}>
            {AI_ACTIONS.map(action => (
              <button
                key={action.id}
                aria-label={`uki: ${action.label}`}
                title={`uki: ${action.label} (uses your configured AI provider)`}
                style={{ ...styles.aiBtn, ...(aiBusy ? styles.aiBtnDisabled : {}) }}
                disabled={aiBusy}
                onMouseEnter={e => { if (!aiBusy) e.currentTarget.style.background = 'var(--color-accent-soft, rgba(100,210,255,0.12))'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                onMouseDown={e => { e.preventDefault(); void runAiAction(action); }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {/* Outline toggle — opens the heading table of contents */}
          <div style={styles.toolbarSep} />
          <button
            aria-label="Toggle outline"
            aria-pressed={outlineOpen}
            title="Outline — jump to document headings"
            style={{ ...styles.toolbarBtn, ...(outlineOpen ? { background: 'var(--color-bg-active, rgba(255,255,255,0.12))', color: 'var(--color-accent, #4a9eff)' } : {}) }}
            onMouseDown={e => { e.preventDefault(); setOutlineOpen(o => !o); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Editor + Preview */}
      <div
        style={{ ...styles.editorWrap, position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showEditor && (
          <div className="dex-scroll-fade-y" style={styles.editorArea}>
            <div style={{ position: 'relative' }}>
              {isEmpty && !readOnly && (
                <div style={styles.placeholder}>{placeholder}</div>
              )}
              <div
                ref={editorRef}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                className="dexnotes-editable"
                style={{
                  ...styles.editable,
                  ...(focusMode ? styles.focusModeEditable : {}),
                  fontFamily,
                  fontSize,
                }}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onClick={handleClick}
                onBlur={closeWiki}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                spellCheck
              />
            </div>
          </div>
        )}

        {showEditor && showPreview && <div style={styles.splitDivider} />}

        {showPreview && (
          <div
            className="dexnotes-preview dex-scroll-fade-y"
            style={styles.preview}
            onClick={handleClick}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(content)) }}
          />
        )}

        {/* Drop-target highlight for dragged attachments */}
        {isDragOver && (
          <div style={styles.dropOverlay} />
        )}

        {/* [[wiki-link]] autocomplete popup */}
        {wikiOpen && wikiMatches.length > 0 && (
          <div style={{ ...styles.wikiPopup, top: wikiPos.top, left: wikiPos.left }}>
            {wikiMatches.map((title, i) => (
              <div
                key={title}
                style={{
                  ...styles.wikiItem,
                  ...(i === wikiActive ? styles.wikiItemActive : {}),
                }}
                onMouseDown={e => { e.preventDefault(); insertWikiLink(title); }}
                onMouseEnter={() => setWikiActive(i)}
              >
                {title}
              </div>
            ))}
          </div>
        )}

        {/* Outline panel — navigable table of contents built from headings */}
        {outlineOpen && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 230, zIndex: 5,
            background: 'var(--color-bg-surface, #161618)',
            borderLeft: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: 'var(--color-text-tertiary, #8a8a8a)',
            }}>
              <span>Outline</span>
              <button
                aria-label="Close outline"
                onMouseDown={e => { e.preventDefault(); setOutlineOpen(false); }}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
              {headings.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-tertiary, #8a8a8a)', lineHeight: 1.4 }}>
                  No headings yet. Use H1/H2/H3 to build an outline.
                </div>
              ) : (
                headings.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToHeading(i)}
                    title={h.text}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-secondary, #c8c8c8)', fontSize: 12.5, lineHeight: 1.4,
                      padding: '5px 12px', paddingLeft: 12 + (h.level - 1) * 14,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontWeight: h.level === 1 ? 600 : 400,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {h.text}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span title="Document statistics">
          {wdCount.toLocaleString()} words · {charCount.toLocaleString()} characters · {sentenceCount.toLocaleString()} sentence{sentenceCount === 1 ? '' : 's'}
          {wdCount > 0 ? ` · ${readingTimeMinutes(wdCount)} min read` : ''}
          {readability ? ` · ${readability}` : ''}
        </span>
        {aiStatus && <span style={styles.aiStatus}>{aiStatus}</span>}
        {(() => {
          const base = sessionBaseRef.current ?? wdCount;
          const session = Math.max(0, wdCount - base);
          const pct = wordGoal > 0 ? Math.min(100, Math.round((wdCount / wordGoal) * 100)) : 0;
          const reached = wordGoal > 0 && wdCount >= wordGoal;
          return (
            <span
              role="button"
              tabIndex={0}
              title="Click to set a word-count goal"
              onClick={editGoal}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editGoal(); } }}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: reached ? 'var(--color-success)' : undefined }}
            >
              {wordGoal > 0 ? (
                <>
                  <span style={{ display: 'inline-block', width: 44, height: 4, borderRadius: 2, background: 'var(--color-border-subtle, rgba(255,255,255,.1))', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: reached ? 'var(--color-success)' : 'var(--color-accent)' }} />
                  </span>
                  Goal {wdCount.toLocaleString()}/{wordGoal.toLocaleString()}
                </>
              ) : 'Set goal'}
              {session > 0 ? ` · +${session.toLocaleString()} this session` : ''}
            </span>
          );
        })()}
        <span>{editorMode === 'edit' ? 'Editing' : editorMode === 'preview' ? 'Preview' : 'Split View'}</span>
      </div>
    </div>
  );
});

NotesEditor.displayName = 'NotesEditor';

// ---------------------------------------------------------------------------
// Editor CSS (injected into document)
// ---------------------------------------------------------------------------

const EDITOR_CSS = `
.checklist-item {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}
.checklist-item input[type="checkbox"] {
  margin-top: 5px;
  accent-color: #64d2ff;
  cursor: pointer;
}
.checklist-item[data-checked="true"] {
  text-decoration: line-through;
  opacity: 0.55;
}
div[contenteditable] h1 { font-size: 28px; font-weight: 700; margin: 20px 0 8px; color: #ffffff; }
div[contenteditable] h2 { font-size: 22px; font-weight: 600; margin: 16px 0 6px; color: #f0f0f0; }
div[contenteditable] h3 { font-size: 18px; font-weight: 600; margin: 14px 0 4px; color: #e0e0e0; }
div[contenteditable] h4 { font-size: 16px; font-weight: 600; margin: 12px 0 4px; }
div[contenteditable] h5 { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
div[contenteditable] h6 { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
div[contenteditable] p { margin: 4px 0; }
div[contenteditable] blockquote {
  border-left: 3px solid rgba(100,210,255,0.3);
  padding-left: 16px;
  margin: 12px 0;
  color: var(--color-text-secondary);
  font-style: italic;
}
/* === Callout blocks: > [!NOTE] / [!WARNING] / [!TIP] === */
/* Rendered from a blockquote carrying a [!TYPE] marker. Colours map to theme
   tokens: NOTE -> accent, WARNING -> warning, TIP -> success. Applies in both
   the contenteditable and the read-only preview. */
.dexnotes-editable blockquote.callout,
.dexnotes-preview blockquote.callout {
  border: 1px solid var(--callout-color, var(--color-accent));
  border-left-width: 3px;
  background: var(--callout-bg, rgba(10,132,255,0.08));
  border-radius: var(--radius-sm, 6px);
  padding: 10px 14px;
  margin: 12px 0;
  color: var(--color-text-primary);
  font-style: normal;
}
.dexnotes-editable blockquote.callout-note,
.dexnotes-preview blockquote.callout-note {
  --callout-color: var(--color-accent);
  --callout-bg: var(--color-accent-light, rgba(10,132,255,0.08));
}
.dexnotes-editable blockquote.callout-warning,
.dexnotes-preview blockquote.callout-warning {
  --callout-color: var(--color-warning);
  --callout-bg: rgba(255,159,10,0.10);
}
.dexnotes-editable blockquote.callout-tip,
.dexnotes-preview blockquote.callout-tip {
  --callout-color: var(--color-success);
  --callout-bg: rgba(48,209,88,0.10);
}
.dexnotes-editable blockquote.callout .callout-title,
.dexnotes-preview blockquote.callout .callout-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.2px;
  color: var(--callout-color, var(--color-accent));
  margin-bottom: 4px;
  user-select: none;
}
.dexnotes-editable blockquote.callout .callout-icon,
.dexnotes-preview blockquote.callout .callout-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--callout-color, var(--color-accent));
  -webkit-mask: var(--callout-icon-mask) center / contain no-repeat;
  mask: var(--callout-icon-mask) center / contain no-repeat;
}
.dexnotes-editable blockquote.callout-note .callout-icon,
.dexnotes-preview blockquote.callout-note .callout-icon {
  --callout-icon-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Crect x='11' y='10' width='2' height='7' fill='black'/%3E%3Crect x='11' y='6.5' width='2' height='2' fill='black'/%3E%3C/svg%3E");
}
.dexnotes-editable blockquote.callout-warning .callout-icon,
.dexnotes-preview blockquote.callout-warning .callout-icon {
  --callout-icon-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2 L22 21 H2 Z'/%3E%3Crect x='11' y='9' width='2' height='6' fill='black'/%3E%3Crect x='11' y='16.5' width='2' height='2' fill='black'/%3E%3C/svg%3E");
}
.dexnotes-editable blockquote.callout-tip .callout-icon,
.dexnotes-preview blockquote.callout-tip .callout-icon {
  --callout-icon-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 21h6v-1H9zM12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z'/%3E%3C/svg%3E");
}
.dexnotes-editable blockquote.callout .callout-body > *:first-child,
.dexnotes-preview blockquote.callout .callout-body > *:first-child { margin-top: 0; }
.dexnotes-editable blockquote.callout .callout-body > *:last-child,
.dexnotes-preview blockquote.callout .callout-body > *:last-child { margin-bottom: 0; }
/* === Code blocks: <pre><code> === */
/* Flat monospace block: a subtle solid surface, hairline border, small radius.
   Whitespace and newlines are preserved (white-space: pre) so multi-line code
   survives the save/reload round-trip and renders identically in edit + preview.
   Both the contenteditable and the read-only preview are targeted so the block
   looks the same in every editor mode. */
.dexnotes-editable pre,
.dexnotes-preview pre {
  background: var(--color-bg-inset, rgba(0,0,0,0.3));
  border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.08));
  border-radius: var(--radius-sm, 6px);
  padding: 12px 16px;
  margin: 12px 0;
  overflow-x: auto;
  white-space: pre;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  color: #c8d6e5;
}
.dexnotes-editable code,
.dexnotes-preview code {
  background: rgba(100,210,255,0.08);
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: #64d2ff;
}
.dexnotes-editable pre code,
.dexnotes-preview pre code {
  background: none;
  border: none;
  padding: 0;
  white-space: inherit;
  color: inherit;
}
div[contenteditable] mark {
  background: rgba(255,214,10,0.25);
  color: inherit;
  padding: 1px 3px;
  border-radius: 2px;
}
div[contenteditable] hr {
  border: none;
  height: 1px;
  background: var(--color-border);
  margin: 20px 0;
}
div[contenteditable] a {
  color: #64d2ff;
  text-decoration: none;
}
div[contenteditable] a:hover {
  text-decoration: underline;
}
a.wikilink, .dexnotes-preview a.wikilink {
  color: #bf5af2;
  text-decoration: none;
  border-bottom: 1px dashed rgba(191,90,242,0.5);
  cursor: pointer;
}
a.wikilink:hover {
  border-bottom-color: #bf5af2;
  background: rgba(191,90,242,0.1);
}
div[contenteditable] ul, div[contenteditable] ol {
  padding-left: 24px;
  margin: 8px 0;
}
div[contenteditable] li {
  margin: 4px 0;
}
div[contenteditable] table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}
div[contenteditable] th, div[contenteditable] td {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  text-align: left;
}
div[contenteditable] th {
  background: var(--color-border-subtle);
  font-weight: 600;
}
div[contenteditable] img {
  max-width: 100%;
  border-radius: 4px;
  margin: 8px 0;
}
`;

// Inject editor CSS on first import
let cssInjected = false;
export function injectEditorCSS(): void {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}
