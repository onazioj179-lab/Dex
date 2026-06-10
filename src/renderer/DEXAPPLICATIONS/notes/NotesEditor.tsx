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
}

interface ToolbarAction {
  id: string;
  label: string;
  icon: string;
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
    { id: 'ul', label: 'Bullet List', icon: 'UL', command: 'insertUnorderedList' },
    { id: 'ol', label: 'Numbered List', icon: 'OL', command: 'insertOrderedList' },
    { id: 'checklist', label: 'Checklist', icon: 'CL', command: 'checklist' },
  ],
  [
    { id: 'blockquote', label: 'Quote', icon: 'Q', command: 'formatBlock', arg: 'blockquote' },
    { id: 'code', label: 'Code Block', icon: '<>', command: 'codeBlock' },
    { id: 'hr', label: 'Divider', icon: '--', command: 'insertHorizontalRule' },
  ],
  [
    { id: 'highlight', label: 'Highlight', icon: 'HL', command: 'highlight' },
    { id: 'inlinecode', label: 'Inline Code', icon: '`', command: 'inlineCode' },
    { id: 'link', label: 'Link', icon: 'LK', command: 'link' },
  ],
];

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
    padding: '6px 12px',
    borderBottom: '1px solid var(--color-bg-hover)',
    background: 'rgba(0,0,0,0.15)',
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
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transition: 'background 0.12s, color 0.12s',
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
    padding: '24px 32px',
    outline: 'none',
    color: 'var(--color-text-primary, #e0e0e0)',
    fontSize: 15,
    lineHeight: 1.7,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    caretColor: '#64d2ff',
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
  },
  preview: {
    flex: 1,
    overflow: 'auto',
    padding: '24px 32px',
    color: 'var(--color-text-primary, #e0e0e0)',
    fontSize: 15,
    lineHeight: 1.7,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    padding: '4px 12px',
    borderTop: '1px solid var(--color-bg-hover)',
    background: 'rgba(0,0,0,0.1)',
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    flexShrink: 0,
  },
  placeholder: {
    position: 'absolute' as const,
    top: 24,
    left: 32,
    color: 'var(--color-text-tertiary)',
    fontSize: 15,
    pointerEvents: 'none' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  focusModeEditable: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '48px 32px',
  },
  aiBtn: {
    height: 28,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    border: 'none',
    borderRadius: 6,
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
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const undoMgr = useRef(new UndoManager(200));
  const lastContent = useRef(content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [charCount, setCharCount] = useState(0);
  const [wdCount, setWdCount] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('');

  // Feed uki's app-context registry: answer "what note is open?" (first line as
  // a title + the live selection) so the assistant is aware of the active note.
  // Reads live DOM at call time, so a one-time registration is enough.
  useEffect(() => {
    registerUkiAppContext('notes', () => {
      const text = (editorRef.current?.textContent || '').trim();
      if (!text) return undefined;
      const selection = window.getSelection()?.toString().trim();
      return {
        appId: 'notes',
        currentFile: text.split('\n')[0]?.slice(0, 80) || undefined,
        selectionText: selection || undefined,
      };
    });
    return () => unregisterUkiAppContext('notes');
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
    }
  }, [content]);

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
    const html = editorRef.current.innerHTML;
    const doc = htmlToDoc(html);
    const serialized = serializeDoc(doc);
    const plainText = docToPlainText(doc);
    const words = countWords(plainText);

    lastContent.current = serialized;
    setIsEmpty(!plainText.trim());
    setCharCount(plainText.length);
    setWdCount(words);

    // Debounce saves
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
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
      setAiStatus('Add an AI provider key in Settings to use AI actions.');
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
        checkbox.addEventListener('change', () => {
          li.setAttribute('data-checked', checkbox.checked ? 'true' : 'false');
          emitChange();
        });
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
      default:
        exec(action.command, action.arg);
        break;
    }
  }, [readOnly, exec, pushUndo, emitChange]);

  // -- Keyboard Shortcuts ------------------------------------------------

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly) return;

    const ctrl = e.ctrlKey || e.metaKey;

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
            checkbox.addEventListener('change', () => {
              li.setAttribute('data-checked', checkbox.checked ? 'true' : 'false');
              emitChange();
            });
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
  }, [readOnly, exec, emitChange, onSave]);

  // -- Input Handler -----------------------------------------------------

  const handleInput = useCallback(() => {
    emitChange();
  }, [emitChange]);

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

    // If it has HTML, use it directly (supports paste from other rich editors)
    if (html) {
      e.preventDefault();
      pushUndo();
      document.execCommand('insertHTML', false, html);
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
    }
  }, [emitChange]);

  // -- Render Preview ----------------------------------------------------

  const renderPreview = useCallback((docJson: string) => {
    const doc = deserializeDoc(docJson);
    return docToHTML(doc);
  }, []);

  // -- Drop handler for attachments --------------------------------------

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Allow default text/html drops
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      e.preventDefault();
      // File drops handled by parent component
    }
  }, []);

  // -- Render ------------------------------------------------------------

  const showEditor = editorMode === 'edit' || editorMode === 'split';
  const showPreview = editorMode === 'preview' || editorMode === 'split';

  return (
    <div style={styles.container}>
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
                    onMouseDown={e => { e.preventDefault(); handleToolbarAction(action); }}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
              {gi < TOOLBAR_GROUPS.length - 1 && <div style={styles.toolbarSep} />}
            </React.Fragment>
          ))}
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
                onMouseDown={e => { e.preventDefault(); void runAiAction(action); }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor + Preview */}
      <div style={styles.editorWrap}>
        {showEditor && (
          <div style={styles.editorArea}>
            <div style={{ position: 'relative' }}>
              {isEmpty && !readOnly && (
                <div style={styles.placeholder}>{placeholder}</div>
              )}
              <div
                ref={editorRef}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                style={{
                  ...styles.editable,
                  ...(focusMode ? styles.focusModeEditable : {}),
                }}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onClick={handleClick}
                onDrop={handleDrop}
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
            style={styles.preview}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(content)) }}
          />
        )}
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>{wdCount} words, {charCount} characters</span>
        {aiStatus && <span style={styles.aiStatus}>{aiStatus}</span>}
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
div[contenteditable] pre {
  background: rgba(0,0,0,0.3);
  border-radius: 6px;
  padding: 12px 16px;
  margin: 12px 0;
  overflow-x: auto;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #c8d6e5;
}
div[contenteditable] code {
  background: rgba(100,210,255,0.08);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  color: #64d2ff;
}
div[contenteditable] pre code {
  background: none;
  padding: 0;
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
  border-radius: 6px;
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
