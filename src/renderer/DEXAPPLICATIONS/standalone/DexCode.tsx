// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexCode — code editor for DexScript (DEX's scripting language).
// Runtime, syntax highlight, templates, and file IO live in ./dexCode/*
import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { TerminalTabs } from '../../components/TerminalTabs';
import { STORAGE_KEY, FILE_KEY, DEFAULT_CODE, TEMPLATES } from './dexCode/templates';
import { transpileDexScript, executeDexScript } from './dexCode/runtime';
import { findMatchingBracket } from '../../../shared/format/bracketMatcher';
import { highlightDexScript } from './dexCode/highlight';
import { extractSymbols, lineStartOffset, SYMBOL_TAG } from './dexCode/symbols';
import {
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
  openFileDialog,
  saveFileDialog,
  saveFile,
} from './dexCode/fileIO';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import {
  pickProjectFolder, loadProject, getStoredProjectRoot, clearStoredProject,
  readProjectFile, searchProject, projectName, buildSymbolIndex,
  type DexProject, type WorkspaceHit, type ProjectSymbol,
} from './dexCode/project';

// Re-export for any external consumer that previously imported these from
// DexCode.tsx directly.
export { transpileDexScript, executeDexScript, highlightDexScript };

// Bottom terminal panel sizing. Min keeps the panel usable; max is clamped to
// 70% of the editor area at drag time so the editor never collapses.
const PANEL_HEIGHT_KEY = 'dex-code-panel-height';
const PANEL_MIN_HEIGHT = 120;

const DexCode: React.FC = () => {
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE; } catch { return DEFAULT_CODE; }
  });
  const [fileName, setFileName] = useState(() => {
    try { return localStorage.getItem(FILE_KEY) || 'main.dex'; } catch { return 'main.dex'; }
  });
  // File system state
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => getRecentFiles());
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  
  const [output, setOutput] = useState<string[]>([]);
  const [replInput, setReplInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  // Autosave status for the status bar. 'saving' while the debounce is pending,
  // 'saved' briefly after the write lands, then idle. Purely a UI affordance --
  // the autosave timing itself is unchanged.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Collapsible sidebar (DEX 5.6: IDE-like, "nothing locked"). Toggle from the
  // Navigator activity-bar button or Ctrl+B (VS Code convention). Persisted.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('dex-code-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem('dex-code-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Bottom terminal panel height — resizable + persisted (DEX 5.6: nothing locked).
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      const stored = parseInt(localStorage.getItem(PANEL_HEIGHT_KEY) || '', 10);
      return Number.isFinite(stored) && stored >= PANEL_MIN_HEIGHT ? stored : 240;
    } catch { return 240; }
  });
  const workspaceRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [fontSize, setFontSize] = useState(13);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [selStats, setSelStats] = useState<{ chars: number; lines: number } | null>(null);
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  // Outline / precision navigation: the live symbol map of the current file.
  const [showOutline, setShowOutline] = useState(true);
  const [outlineFilter, setOutlineFilter] = useState('');
  // Go to Line (Ctrl+G).
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [goToLineInput, setGoToLineInput] = useState('');
  const goToLineRef = useRef<HTMLInputElement>(null);
  // Output -> ecosystem (copy / send via DEX Flow).
  const [outputCopied, setOutputCopied] = useState(false);
  // Track original content for modified detection
  const originalCodeRef = useRef(code);

  // UKI dev-workspace awareness (DEX 5.6): expose the open file + language +
  // dirty state + cursor so UKI knows what code the user is editing. A ref keeps
  // the resolver reading live state without re-registering on every keystroke.
  const ukiCtxRef = useRef({ fileName, currentFilePath, code, isModified, cursorPos });
  ukiCtxRef.current = { fileName, currentFilePath, code, isModified, cursorPos };
  useEffect(() => {
    registerUkiAppContext('dexcode', () => {
      const s = ukiCtxRef.current;
      const ext = (s.fileName.split('.').pop() || '').toLowerCase();
      const language = ext === 'dex' ? 'DexScript' : (ext || 'text');
      return {
        appId: 'dexcode',
        currentFile: s.currentFilePath || s.fileName,
        focusedItemId: s.fileName,
        custom: {
          language,
          lines: s.code ? s.code.split('\n').length : 0,
          status: s.isModified ? 'unsaved changes' : 'saved',
          cursor: `line ${s.cursorPos.line}, col ${s.cursorPos.col}`,
        },
      };
    });
    return () => unregisterUkiAppContext('dexcode');
  }, []);

  // File system handlers
  const handleOpenFile = useCallback(async () => {
    const result = await openFileDialog();
    if (result) {
      setCode(result.content);
      setCurrentFilePath(result.path);
      setFileName(result.path.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = result.content;
      setIsModified(false);
      addRecentFile(result.path);
      setRecentFiles(getRecentFiles());
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (currentFilePath) {
      const success = await saveFile(currentFilePath, code);
      if (success) {
        originalCodeRef.current = code;
        setIsModified(false);
      }
    } else {
      // Save As if no current file
      const path = await saveFileDialog(code, fileName);
      if (path) {
        setCurrentFilePath(path);
        setFileName(path.split(/[\\/]/).pop() || 'file.dex');
        originalCodeRef.current = code;
        setIsModified(false);
        addRecentFile(path);
        setRecentFiles(getRecentFiles());
      }
    }
  }, [code, currentFilePath, fileName]);

  const handleSaveAs = useCallback(async () => {
    const path = await saveFileDialog(code, fileName);
    if (path) {
      setCurrentFilePath(path);
      setFileName(path.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = code;
      setIsModified(false);
      addRecentFile(path);
      setRecentFiles(getRecentFiles());
    }
  }, [code, fileName]);

  const handleNewFile = useCallback(() => {
    setCode(DEFAULT_CODE);
    setCurrentFilePath(null);
    setFileName('untitled.dex');
    originalCodeRef.current = DEFAULT_CODE;
    setIsModified(false);
  }, []);

  const handleOpenRecent = useCallback(async (filePath: string) => {
    try {
      const content = await window.dex?.invoke('fs:read-file', filePath);
      setCode(content);
      setCurrentFilePath(filePath);
      setFileName(filePath.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = content;
      setIsModified(false);
      addRecentFile(filePath);
      setRecentFiles(getRecentFiles());
      setShowRecentFiles(false);
    } catch {
      // File might not exist anymore
      const updated = removeRecentFile(filePath);
      setRecentFiles(updated);
    }
  }, [recentFiles]);

  // Track modifications
  useEffect(() => {
    setIsModified(code !== originalCodeRef.current);
  }, [code]);

  // Auto-save
  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, code);
        localStorage.setItem(FILE_KEY, fileName);
      } catch { /* ignore */ }
      setSaveState('saved');
    }, 300);
    return () => window.clearTimeout(timer);
  }, [code, fileName]);

  // After "Saved" shows briefly, fade the indicator back to idle. Reset on each
  // new save so the message stays visible while edits are in flight.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  // Persist the bottom panel height (debounced) so it restores on next mount.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight)); } catch { /* ignore */ }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [panelHeight]);

  // Drag the divider at the top edge of the panel to resize it. Listeners are
  // attached on press and torn down on release (and on unmount as a safety net).
  const resizeStateRef = useRef<{ startY: number; startHeight: number; max: number } | null>(null);
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const workspaceH = workspaceRef.current?.clientHeight ?? window.innerHeight;
    resizeStateRef.current = {
      startY: e.clientY,
      startHeight: panelHeight,
      max: Math.max(PANEL_MIN_HEIGHT, Math.round(workspaceH * 0.7)),
    };
    const onMove = (ev: MouseEvent) => {
      const st = resizeStateRef.current;
      if (!st) return;
      // Dragging up (smaller clientY) grows the panel.
      const next = st.startHeight + (st.startY - ev.clientY);
      setPanelHeight(Math.min(st.max, Math.max(PANEL_MIN_HEIGHT, next)));
    };
    const onUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [panelHeight]);

  // Safety net: if the editor unmounts mid-drag, reset the global cursor styles.
  useEffect(() => () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Sync scroll between editor and highlight overlay
  const handleScroll = useCallback(() => {
    if (editorRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop;
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, []);

  // Run code
  const runCode = useCallback(() => {
    setIsRunning(true);
    setOutput([]);
    setError(null);
    // Defer with setTimeout (not requestAnimationFrame) so the "running" state
    // paints first AND execution still fires when the DEX window is backgrounded
    // -- rAF is paused for hidden/unfocused tabs, which silently dropped runs.
    setTimeout(() => {
      const result = executeDexScript(code);
      setOutput(result.output);
      setError(result.error);
      setDuration(result.duration);
      setIsRunning(false);
      // Scroll output to bottom once it has rendered.
      setTimeout(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }, 0);
    }, 0);
  }, [code]);

  // -- REPL: evaluate a single DexScript expression in isolation and append its
  // output to the console (DEX 5.7). The runtime is stateless per call, so each
  // entry runs independently -- a quick scratchpad for testing expressions
  // without running the whole file.
  const runRepl = useCallback(() => {
    const expr = replInput.trim();
    if (!expr) return;
    const result = executeDexScript(expr);
    setOutput(prev => [
      ...prev,
      `> ${expr}`,
      ...(result.error ? [result.error] : (result.output.length ? result.output : ['(no output)'])),
    ]);
    setError(null);
    setReplInput('');
    setTimeout(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, 0);
  }, [replInput]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSaveFile();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewFile();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(false);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      // Go to Line (Ctrl/Cmd+G) — precision navigation.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setShowGoToLine(true);
        setGoToLineInput('');
        requestAnimationFrame(() => goToLineRef.current?.focus());
      }
      if (e.key === 'Escape' && (showFind || showGoToLine)) {
        setShowFind(false);
        setShowReplace(false);
        setShowGoToLine(false);
        editorRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        setFontSize(s => Math.min(s + 1, 24));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setFontSize(s => Math.max(s - 1, 9));
      }
      // Toggle terminal panel (Ctrl+`)
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setTerminalOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [code, fileName, runCode, showFind, showGoToLine, handleSaveFile, handleSaveAs, handleOpenFile, handleNewFile, toggleSidebar]);

  // Tab key, bracket auto-close, auto-indent
  // Live symbol map of the current file (functions / classes / top-level vars).
  const symbols = useMemo(() => extractSymbols(code), [code]);
  const filteredSymbols = useMemo(() => {
    const q = outlineFilter.trim().toLowerCase();
    return q ? symbols.filter(s => s.name.toLowerCase().includes(q)) : symbols;
  }, [symbols, outlineFilter]);

  // Precision navigation: move the caret to a 1-indexed line, focus, and center
  // it in the viewport. The textarea's onScroll keeps the highlight overlay in
  // sync. Used by the Outline so a click jumps straight to a symbol.
  const jumpToLine = useCallback((line: number) => {
    const ta = editorRef.current;
    if (!ta) return;
    const pos = lineStartOffset(code, line);
    const totalLines = Math.max(1, code.split('\n').length);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
      const lineHeight = ta.scrollHeight / totalLines;
      ta.scrollTop = Math.max(0, (line - 1) * lineHeight - ta.clientHeight / 2);
    });
  }, [code]);

  const handleGoToLine = useCallback(() => {
    const n = parseInt(goToLineInput.trim(), 10);
    if (!Number.isFinite(n) || n < 1) return;
    jumpToLine(n);
    setShowGoToLine(false);
    setGoToLineInput('');
  }, [goToLineInput, jumpToLine]);

  // --- Project awareness: open a folder, browse + search its source files ---
  const [project, setProject] = useState<DexProject | null>(null);
  const [showProject, setShowProject] = useState(true);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspaceHits, setWorkspaceHits] = useState<WorkspaceHit[]>([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  // Restore the last-opened project folder on mount.
  useEffect(() => {
    const root = getStoredProjectRoot();
    if (root) loadProject(root).then(p => { if (p) setProject(p); });
  }, []);

  // Load a project file into the editor (mirrors handleOpenRecent), optionally
  // jumping to a line once the new content has rendered.
  const loadEditorFromPath = useCallback(async (filePath: string, line?: number) => {
    const content = await readProjectFile(filePath);
    if (content == null) return;
    setCode(content);
    setCurrentFilePath(filePath);
    setFileName(filePath.split(/[\\/]/).pop() || 'file.dex');
    originalCodeRef.current = content;
    setIsModified(false);
    addRecentFile(filePath);
    setRecentFiles(getRecentFiles());
    if (line && line > 0) setTimeout(() => jumpToLine(line), 60);
  }, [jumpToLine]);

  const openFolder = useCallback(async () => {
    const proj = await pickProjectFolder();
    if (proj) { setProject(proj); setWorkspaceHits([]); setWorkspaceQuery(''); }
  }, []);

  const closeProject = useCallback(() => {
    clearStoredProject();
    setProject(null);
    setWorkspaceHits([]);
    setWorkspaceQuery('');
  }, []);

  const runWorkspaceSearch = useCallback(async () => {
    if (!project) return;
    const q = workspaceQuery.trim();
    if (!q) { setWorkspaceHits([]); return; }
    setWorkspaceBusy(true);
    try { setWorkspaceHits(await searchProject(project, q)); }
    finally { setWorkspaceBusy(false); }
  }, [project, workspaceQuery]);

  // Cross-file symbol index for go-to-definition; rebuilt when the project changes.
  const [symbolIndex, setSymbolIndex] = useState<Map<string, ProjectSymbol[]>>(new Map());
  useEffect(() => {
    if (!project) { setSymbolIndex(new Map()); return; }
    let cancelled = false;
    buildSymbolIndex(project).then(idx => { if (!cancelled) setSymbolIndex(idx); });
    return () => { cancelled = true; };
  }, [project]);

  // The identifier under the editor caret (for go-to-definition / find-references).
  const identifierAt = useCallback((): string => {
    const ta = editorRef.current;
    if (!ta) return '';
    const pos = ta.selectionStart;
    const isWord = (c: string) => /[A-Za-z0-9_$]/.test(c || '');
    let s = pos, e = pos;
    while (s > 0 && isWord(code[s - 1])) s--;
    while (e < code.length && isWord(code[e])) e++;
    return code.slice(s, e);
  }, [code]);

  // Go to a symbol's definition: prefer a cross-file project hit, else the current
  // file's own symbols. Opens the defining file and jumps to the line.
  const gotoDefinition = useCallback((word: string) => {
    const w = word.trim();
    if (!w) return;
    const hits = symbolIndex.get(w);
    if (hits && hits.length) {
      const hit = hits[0];
      if (currentFilePath && hit.file.path === currentFilePath) jumpToLine(hit.line);
      else loadEditorFromPath(hit.file.path, hit.line);
      return;
    }
    const local = symbols.find(sym => sym.name === w);
    if (local) { jumpToLine(local.line); return; }
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `No definition found for "${w}"` } }));
  }, [symbolIndex, symbols, currentFilePath, jumpToLine, loadEditorFromPath]);

  // Find references: grep the project for the identifier, surfaced in the Project panel.
  const findReferences = useCallback((word: string) => {
    const w = word.trim();
    if (!w || !project) return;
    setWorkspaceQuery(w);
    setShowProject(true);
    setWorkspaceBusy(true);
    searchProject(project, w).then(hits => { setWorkspaceHits(hits); setWorkspaceBusy(false); });
  }, [project]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // F12: go to definition of the identifier at the caret. Shift+F12: find
    // references across the open project.
    if (e.key === 'F12') {
      e.preventDefault();
      const word = identifierAt();
      if (e.shiftKey) findReferences(word); else gotoDefinition(word);
      return;
    }

    // Jump to matching bracket (Ctrl/Cmd+M): partner of the bracket at, or just
    // before, the caret.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      let p = start;
      let m = findMatchingBracket(code, start);
      if (!m && start > 0) { p = start - 1; m = findMatchingBracket(code, start - 1); }
      if (m) {
        e.preventDefault();
        const target = p === m.openPos ? m.closePos : m.openPos;
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = target; ta.focus(); });
        return;
      }
    }

    // Tab indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
      return;
    }

    // Bracket auto-close
    const bracketPairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    if (bracketPairs[e.key]) {
      e.preventDefault();
      const close = bracketPairs[e.key];
      const newCode = code.substring(0, start) + e.key + close + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Quote auto-close
    if (e.key === '"' || e.key === "'") {
      const charAfter = code[start] || '';
      if (charAfter === e.key) {
        e.preventDefault();
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
        return;
      }
      e.preventDefault();
      const newCode = code.substring(0, start) + e.key + e.key + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Skip closing bracket/paren/brace
    if (([')', ']', '}'].includes(e.key)) && code[start] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Enter auto-indent
    if (e.key === 'Enter') {
      e.preventDefault();
      const before = code.substring(0, start);
      const after = code.substring(end);
      const currentLine = before.split('\n').pop() || '';
      const indent = currentLine.match(/^(\s*)/)?.[1] || '';
      const charBefore = code[start - 1];
      const charAfter = code[start];
      if (charBefore === '{' && charAfter === '}') {
        const newCode = before + '\n' + indent + '  \n' + indent + after;
        setCode(newCode);
        requestAnimationFrame(() => {
          const pos = start + 1 + indent.length + 2;
          ta.selectionStart = ta.selectionEnd = pos;
        });
      } else {
        const extra = charBefore === '{' ? '  ' : '';
        const newCode = before + '\n' + indent + extra + after;
        setCode(newCode);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 1 + indent.length + extra.length;
        });
      }
      return;
    }

    // Backspace: delete matching pair
    if (e.key === 'Backspace' && start === end && start > 0) {
      const pair = code[start - 1] + code[start];
      if (pair === '{}' || pair === '[]' || pair === '()' || pair === '""' || pair === "''") {
        e.preventDefault();
        const newCode = code.substring(0, start - 1) + code.substring(start + 1);
        setCode(newCode);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start - 1; });
        return;
      }
    }
  }, [code, identifierAt, gotoDefinition, findReferences]);

  const highlighted = useMemo(() => highlightDexScript(code), [code]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);

  // Cursor position tracking
  const updateCursorPos = useCallback(() => {
    if (!editorRef.current) return;
    const ta = editorRef.current;
    const pos = ta.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCursorPos({ line, col });
    const selLen = ta.selectionEnd - ta.selectionStart;
    if (selLen > 0) {
      const selected = code.substring(ta.selectionStart, ta.selectionEnd);
      setSelStats({ chars: selLen, lines: selected.split('\n').length });
    } else {
      setSelStats(null);
    }
  }, [code]);

  // Find/replace logic
  const findNext = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const startPos = ta.selectionEnd;
    const idx = code.toLowerCase().indexOf(findText.toLowerCase(), startPos);
    if (idx !== -1) {
      ta.focus();
      ta.selectionStart = idx;
      ta.selectionEnd = idx + findText.length;
    } else {
      const wrapIdx = code.toLowerCase().indexOf(findText.toLowerCase());
      if (wrapIdx !== -1) {
        ta.focus();
        ta.selectionStart = wrapIdx;
        ta.selectionEnd = wrapIdx + findText.length;
      }
    }
  }, [code, findText]);

  const findPrev = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const startPos = Math.max(0, ta.selectionStart - 1);
    const idx = code.toLowerCase().lastIndexOf(findText.toLowerCase(), startPos);
    if (idx !== -1) {
      ta.focus();
      ta.selectionStart = idx;
      ta.selectionEnd = idx + findText.length;
    } else {
      const wrapIdx = code.toLowerCase().lastIndexOf(findText.toLowerCase());
      if (wrapIdx !== -1) {
        ta.focus();
        ta.selectionStart = wrapIdx;
        ta.selectionEnd = wrapIdx + findText.length;
      }
    }
  }, [code, findText]);

  const replaceOne = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const selected = code.substring(ta.selectionStart, ta.selectionEnd);
    if (selected.toLowerCase() === findText.toLowerCase()) {
      const newCode = code.substring(0, ta.selectionStart) + replaceText + code.substring(ta.selectionEnd);
      setCode(newCode);
      requestAnimationFrame(() => findNext());
    } else {
      findNext();
    }
  }, [code, findText, replaceText, findNext]);

  const replaceAll = useCallback(() => {
    if (!findText) return;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    setCode(code.replace(regex, replaceText));
  }, [code, findText, replaceText]);

  const findMatchCount = useMemo(() => {
    if (!findText) return 0;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (code.match(regex) || []).length;
  }, [code, findText]);

  const stats = useMemo(() => {
    const lines = code.split('\n').length;
    const chars = code.length;
    const words = code.trim().split(/\s+/).filter(Boolean).length;
    return { lines, chars, words };
  }, [code]);

  return (
    <div style={{ ...S.container, gridTemplateColumns: sidebarCollapsed ? '44px minmax(0, 1fr)' : '44px 220px minmax(0, 1fr)' }}>
      {/* Activity bar (Xcode-style) -- slim icon column on far left */}
      <nav style={S.activityBar} aria-label="DexCode activity bar">
        <button
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle sidebar"
          aria-pressed={!sidebarCollapsed}
          style={sidebarCollapsed ? S.activityBtn : S.activityBtnActive}
          onClick={toggleSidebar}
          onMouseEnter={e => { if (sidebarCollapsed) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { if (sidebarCollapsed) e.currentTarget.style.background = 'transparent'; }}
        >
          <DexIcon name="folder" size={16} />
        </button>
        <button
          title="Find"
          aria-label="Find in file"
          aria-pressed={showFind}
          style={showFind ? S.activityBtnActive : S.activityBtn}
          onClick={() => setShowFind(s => !s)}
          onMouseEnter={e => { if (!showFind) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { if (!showFind) e.currentTarget.style.background = 'transparent'; }}
        >
          <DexIcon name="search" size={16} />
        </button>
        <button
          title="Run"
          aria-label="Run code"
          style={S.activityBtn}
          onClick={runCode}
          disabled={isRunning}
          onMouseEnter={e => { if (!isRunning) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <DexIcon name="play" size={16} />
        </button>
        <button
          title="Terminal"
          aria-label="Toggle terminal"
          aria-pressed={terminalOpen}
          style={terminalOpen ? S.activityBtnActive : S.activityBtn}
          onClick={() => setTerminalOpen(o => !o)}
          onMouseEnter={e => { if (!terminalOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { if (!terminalOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          <DexIcon name="terminal" size={16} />
        </button>
        <div style={{ flex: 1 }} />
      </nav>

      {/* Sidebar — collapsible (Ctrl+B / Navigator button) */}
      {!sidebarCollapsed && (
      <aside style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <span style={S.sidebarTitle}>DEXCODE</span>
        </div>

        {/* File Actions */}
        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>File</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={handleNewFile}
              style={S.fileActionBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <DexIcon name="plus" size={12} />
              <span>New File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+N</span>
            </button>
            <button
              onClick={handleOpenFile}
              style={S.fileActionBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <DexIcon name="folder-open" size={12} />
              <span>Open File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+O</span>
            </button>
            <button
              onClick={handleSaveFile}
              style={S.fileActionBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <DexIcon name="save" size={12} />
              <span>Save{isModified ? ' *' : ''}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
            </button>
            <button
              onClick={handleSaveAs}
              style={S.fileActionBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <DexIcon name="download" size={12} />
              <span>Save As</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+Shift+S</span>
            </button>
          </div>
        </div>

        {/* Project — open a folder, browse + search its source files */}
        <div style={S.sidebarBlock}>
          <div
            style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setShowProject(v => !v)}
            role="button"
            tabIndex={0}
            aria-expanded={showProject}
            aria-label="Toggle Project section"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowProject(v => !v); } }}
          >
            <DexIcon name={showProject ? 'chevron-down' : 'chevron-right'} size={10} />
            Project
            {project && <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>{project.files.length}</span>}
          </div>
          {showProject && (
            !project ? (
              <button
                onClick={openFolder}
                style={S.fileActionBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <DexIcon name="folder-open" size={12} />
                <span>Open Folder…</span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 var(--space-2)' }}>
                  <DexIcon name="folder-open" size={11} />
                  <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.root}>{projectName(project.root)}</span>
                  <button onClick={openFolder} title="Open a different folder" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}><DexIcon name="folder-open" size={11} /></button>
                  <button onClick={closeProject} title="Close project" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}><DexIcon name="x" size={11} /></button>
                </div>
                <input
                  value={workspaceQuery}
                  onChange={e => setWorkspaceQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runWorkspaceSearch(); }}
                  placeholder="Search in project…"
                  aria-label="Search in project"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: 11, background: 'var(--color-bg-inset, rgba(255,255,255,0.04))', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', outline: 'none' }}
                />
                {workspaceBusy && <div style={{ fontSize: 10, opacity: 0.5, padding: '2px var(--space-2)' }}>Searching…</div>}
                {workspaceHits.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflow: 'auto' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, padding: '2px var(--space-2)' }}>{workspaceHits.length} match{workspaceHits.length === 1 ? '' : 'es'}</div>
                    {workspaceHits.map((h, i) => (
                      <button
                        key={`${h.path}-${h.line}-${i}`}
                        onClick={() => loadEditorFromPath(h.path, h.line)}
                        style={{ ...S.recentFileBtn, flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                        title={`${h.name}:${h.line}`}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{h.name}:{h.line}</span>
                        <span style={{ fontSize: 10, opacity: 0.5, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{h.text}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
                    {project.files.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-2)' }}>No source files</div>
                    ) : project.files.map((f, i) => (
                      <button
                        key={`${f.path}-${i}`}
                        onClick={() => loadEditorFromPath(f.path)}
                        style={{ ...S.recentFileBtn, ...(currentFilePath === f.path ? { background: 'var(--color-bg-hover)' } : null) }}
                        title={f.path}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = currentFilePath === f.path ? 'var(--color-bg-hover)' : 'transparent')}
                      >
                        <DexIcon name="code" size={11} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Outline — live symbol map (precision navigation, DEX signature) */}
        <div style={S.sidebarBlock}>
          <div
            style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setShowOutline(v => !v)}
            role="button"
            tabIndex={0}
            aria-expanded={showOutline}
            aria-label="Toggle Outline section"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowOutline(v => !v); } }}
          >
            <DexIcon name={showOutline ? 'chevron-down' : 'chevron-right'} size={10} />
            Outline
            <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>{symbols.length}</span>
          </div>
          {showOutline && (
            symbols.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-2)' }}>No symbols yet</div>
            ) : (
              <>
                {symbols.length > 6 && (
                  <input
                    value={outlineFilter}
                    onChange={e => setOutlineFilter(e.target.value)}
                    placeholder="Filter symbols…"
                    aria-label="Filter symbols"
                    style={{ width: '100%', boxSizing: 'border-box', margin: '2px 0 4px', padding: '4px 8px', fontSize: 11, background: 'var(--color-bg-inset, rgba(255,255,255,0.04))', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', outline: 'none' }}
                  />
                )}
                {filteredSymbols.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-2)' }}>No matches</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
                    {filteredSymbols.map((s, i) => (
                      <button
                        key={`${s.name}-${s.line}-${i}`}
                        onClick={() => jumpToLine(s.line)}
                        style={{ ...S.recentFileBtn }}
                        title={`${s.name} — line ${s.line}`}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, width: 22, flexShrink: 0, textTransform: 'uppercase' }}>{SYMBOL_TAG[s.kind]}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 10 }}>{s.line}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div style={S.sidebarBlock}>
            <div
              style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowRecentFiles(!showRecentFiles)}
              role="button"
              tabIndex={0}
              aria-expanded={showRecentFiles}
              aria-label="Toggle Recent Files section"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowRecentFiles(!showRecentFiles); } }}
            >
              <DexIcon name={showRecentFiles ? 'chevron-down' : 'chevron-right'} size={10} />
              Recent Files
            </div>
            {showRecentFiles && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentFiles.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => handleOpenRecent(f)}
                    style={{ ...S.recentFileBtn }}
                    title={f}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <DexIcon name="code" size={11} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.split(/[\\/]/).pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>Templates</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => { setFileName(t.fileName); setCode(t.code); }}
                style={{...S.templateBtn, padding: '6px var(--space-2)'}}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-inset, var(--color-border-subtle, rgba(255,255,255,0.04)))')}
              >
                <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            <div style={S.statCard}><span style={S.statLabel}>L</span><span style={S.statValue}>{stats.lines}</span></div>
            <div style={S.statCard}><span style={S.statLabel}>W</span><span style={S.statValue}>{stats.words}</span></div>
            <div style={S.statCard}><span style={S.statLabel}>C</span><span style={S.statValue}>{stats.chars}</span></div>
          </div>
        </div>
      </aside>
      )}

      {/* Main workspace */}
      <section ref={workspaceRef} style={S.workspace}>
        {/* Top bar */}
        <div style={S.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              value={fileName + (isModified ? ' •' : '')}
              onChange={e => setFileName(e.target.value.replace(' •', ''))}
              style={S.fileInput}
              aria-label="File name"
              title={currentFilePath || 'Unsaved file'}
            />
            {currentFilePath && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentFilePath}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={runCode}
              disabled={isRunning}
              style={S.runBtn}
              onMouseEnter={e => { if (!isRunning) e.currentTarget.style.background = 'var(--color-text-secondary)'; }}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-text-primary)'}
            >
              <DexIcon name="play" size={13} color="var(--color-bg-base)" />
              <span>{isRunning ? 'Running...' : 'Run'}</span>
            </button>
            <button
              onClick={() => { setOutput([]); setError(null); }}
              style={S.clearBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Clear
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderLeft: '1px solid var(--color-border)', paddingLeft: 6 }}>
              <button
                onClick={() => setFontSize(s => Math.max(s - 1, 9))}
                style={S.fontBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Decrease font size"
              >
                <DexIcon name="minus" size={11} />
              </button>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
              <button
                onClick={() => setFontSize(s => Math.min(s + 1, 24))}
                style={S.fontBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Increase font size"
              >
                <DexIcon name="plus" size={11} />
              </button>
            </div>
            <button
              onClick={() => { setShowFind(f => !f); if (!showFind) requestAnimationFrame(() => findInputRef.current?.focus()); }}
              style={S.clearBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title="Find (Ctrl+F)"
            >
              <DexIcon name="search" size={11} />
            </button>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Ctrl+Enter to run</span>
          </div>
        </div>

        {/* Editor + Output */}
        <div style={S.editorLayout}>
          {/* Code Editor */}
          <div style={S.editorPane}>
            <div style={S.paneHeader}>
              <span>Editor</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>.dex</span>
            </div>
            {/* Find/Replace bar */}
            {showFind && (
              <div style={S.findBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <DexIcon name="search" size={12} color="var(--color-text-tertiary)" />
                  <input
                    ref={findInputRef}
                    value={findText}
                    onChange={e => setFindText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); } if (e.key === 'Escape') { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); } }}
                    placeholder="Find..."
                    style={S.findInput}
                    aria-label="Find text"
                  />
                  {findText && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{findMatchCount} found</span>}
                  <button onClick={findPrev} style={S.findNavBtn} title="Previous (Shift+Enter)"><DexIcon name="chevron-up" size={12} /></button>
                  <button onClick={findNext} style={S.findNavBtn} title="Next (Enter)"><DexIcon name="chevron-down" size={12} /></button>
                  <button onClick={() => setShowReplace(v => !v)} style={{...S.findNavBtn, color: showReplace ? 'var(--color-accent, #4A9EFF)' : undefined}} title="Toggle Replace (Ctrl+H)"><DexIcon name="repeat" size={12} /></button>
                  <button onClick={() => { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); }} style={S.findNavBtn} title="Close (Esc)"><DexIcon name="close" size={12} /></button>
                </div>
                {showReplace && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <DexIcon name="corner-down-right" size={12} color="var(--color-text-tertiary)" />
                    <input
                      value={replaceText}
                      onChange={e => setReplaceText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') replaceOne(); if (e.key === 'Escape') { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); } }}
                      placeholder="Replace..."
                      style={S.findInput}
                      aria-label="Replace text"
                    />
                    <button onClick={replaceOne} style={S.findNavBtn} title="Replace">1</button>
                    <button onClick={replaceAll} style={S.findNavBtn} title="Replace All">All</button>
                  </div>
                )}
              </div>
            )}
            {showGoToLine && (
              <div style={S.findBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <DexIcon name="chevron-right" size={12} color="var(--color-text-tertiary)" />
                  <input
                    ref={goToLineRef}
                    type="number"
                    min={1}
                    value={goToLineInput}
                    onChange={e => setGoToLineInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGoToLine(); } if (e.key === 'Escape') { setShowGoToLine(false); editorRef.current?.focus(); } }}
                    placeholder={`Go to line… (1–${lineCount})`}
                    style={S.findInput}
                    aria-label="Go to line"
                  />
                  <button onClick={handleGoToLine} style={S.findNavBtn} title="Go (Enter)">Go</button>
                  <button onClick={() => { setShowGoToLine(false); editorRef.current?.focus(); }} style={S.findNavBtn} title="Close (Esc)"><DexIcon name="close" size={12} /></button>
                </div>
              </div>
            )}
            <div style={S.editorWrapper}>
              {/* Line numbers */}
              <div style={S.lineNumbers} aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} style={S.lineNum}>{i + 1}</div>
                ))}
              </div>
              {/* Syntax highlight overlay */}
              <pre
                ref={highlightRef}
                style={{...S.highlightOverlay, fontSize}}
                dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
                aria-hidden="true"
              />
              {/* Actual textarea */}
              <textarea
                ref={editorRef}
                value={code}
                onChange={e => setCode(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                onKeyUp={updateCursorPos}
                onClick={e => { updateCursorPos(); if (e.ctrlKey || e.metaKey) gotoDefinition(identifierAt()); }}
                onSelect={updateCursorPos}
                title="Ctrl/Cmd+Click or F12: Go to Definition · Shift+F12: Find References"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{...S.editor, fontSize}}
                aria-label="DexScript code editor"
              />
            </div>
          </div>

          {/* Output Panel */}
          <div style={S.outputPane}>
            <div style={S.paneHeader}>
              <span>Output</span>
              {duration > 0 && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {duration < 1 ? '<1' : Math.round(duration)}ms
                </span>
              )}
              {output.length > 0 && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button
                    onClick={async () => { try { await navigator.clipboard.writeText(output.join('\n')); setOutputCopied(true); setTimeout(() => setOutputCopied(false), 1200); } catch { /* clipboard unavailable */ } }}
                    style={S.findNavBtn}
                    title="Copy output to clipboard"
                  >{outputCopied ? 'Copied' : 'Copy'}</button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('dex-flow-open', { detail: { payload: { kind: 'text', content: output.join('\n'), source: 'dexcode', label: 'DexCode output' } } }))}
                    style={S.findNavBtn}
                    title="Send output to another app (DEX Flow)"
                  >Send</button>
                </div>
              )}
            </div>
            <div ref={outputRef} style={S.outputContent}>
              {output.length === 0 && !error && (
                <div style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic', fontSize: 12 }}>
                  <span style={{opacity:0.5}}>$ </span>Run your code to see output here
                </div>
              )}
              {output.map((line, i) => (
                <div key={i} style={S.outputLine}>
                  <span style={{ position: 'absolute', left: 0, opacity: 0.3 }} aria-hidden="true">›</span>
                  {line}
                </div>
              ))}
              {error && (
                <div style={S.errorLine}>
                  <DexIcon name="alert-triangle" size={12} color="var(--color-text-primary)" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            {/* REPL: evaluate a single expression and append its output */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderTop: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
              <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }} aria-hidden="true">{'>'}</span>
              <input
                value={replInput}
                onChange={e => setReplInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runRepl(); } }}
                placeholder="Evaluate expression"
                aria-label="DexScript REPL input"
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={S.statusBar}>
          <span>DexScript</span>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          {selStats ? (
            <span style={{ color: 'var(--color-accent)' }}>
              Sel {selStats.chars} ch{selStats.lines > 1 ? `, ${selStats.lines} ln` : ''}
            </span>
          ) : (
            <span>{stats.lines} lines</span>
          )}
          <span>{stats.chars} chars</span>
          <span style={{ fontSize: 9 }}>{fontSize}px</span>
          {/* Autosave indicator -- mirrors the local-storage autosave state */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              opacity: saveState === 'idle' ? 0.45 : 1,
              transition: 'opacity 0.2s',
            }}
            title="Editor content is autosaved to this device"
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: saveState === 'saving'
                  ? 'var(--color-text-tertiary)'
                  : 'var(--color-accent, #4A9EFF)',
              }}
            />
            {saveState === 'saving' ? 'Saving…' : 'Saved'}
          </span>
          <button
            type="button"
            onClick={() => setTerminalOpen(v => !v)}
            title="Toggle terminal (Ctrl+`)"
            aria-label="Toggle terminal"
            aria-pressed={terminalOpen}
            style={{
              marginLeft: 'auto',
              background: terminalOpen ? 'var(--color-accent, #4A9EFF)' : 'transparent',
              color: terminalOpen ? '#fff' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 3,
              padding: '2px var(--space-2)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Terminal
          </button>
          <span>Ctrl+F find · Ctrl+H replace · Ctrl+S export · Ctrl+` terminal</span>
        </div>

        {terminalOpen && (
          <div style={{ ...S.panelDock, height: panelHeight }}>
            {/* Draggable divider — drag up/down to resize the panel */}
            <div
              style={S.panelResizer}
              onMouseDown={handlePanelResizeStart}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize terminal panel"
              title="Drag to resize"
            >
              <div style={S.panelResizerGrip} aria-hidden="true" />
            </div>
            <div style={S.panelBody}>
              <TerminalTabs onClose={() => setTerminalOpen(false)} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

// ======================================================================
// STYLES
// ======================================================================

const S: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: '44px 220px minmax(0, 1fr)',
    height: '100%',
    width: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '11px',
    overflow: 'hidden',
    position: 'relative',
    contain: 'layout style',
  },
  activityBar: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    padding: '6px 0',
    background: 'var(--color-bg-base)',
    borderRight: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    height: '100%',
  },
  activityBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
  activityBtnActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    background: 'var(--color-accent, #4a9eff)',
    color: 'var(--color-accent-text, #fff)',
    borderRadius: 4,
    cursor: 'pointer',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    padding: '0 10px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--color-text-tertiary)',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: 0,
    background: 'var(--color-bg-surface-solid)',
    borderRight: '1px solid var(--color-border)',
    overflow: 'auto',
    scrollbarWidth: 'none',
  },
  sidebarBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 'var(--space-2) 10px',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.04))',
  },
  eyebrow: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--color-text-tertiary)',
  },
  title: {
    margin: 0,
    fontSize: 22,
    letterSpacing: '-0.03em',
    fontWeight: 600,
  },
  subtitle: {
    margin: 0,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-tertiary)',
  },
  templateBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: 2,
    padding: 'var(--space-2) 10px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-inset, rgba(255,255,255,0.04))',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'background 0.12s',
    textAlign: 'left' as const,
  },
  fileActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '7px 10px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontSize: 11,
    fontWeight: 500,
    textAlign: 'left' as const,
    width: '100%',
  },
  recentFileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px var(--space-2)',
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontSize: 10,
    textAlign: 'left' as const,
    width: '100%',
  },
  refCode: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: 'var(--space-2)',
    borderRadius: 6,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    alignItems: 'center',
  },
  statLabel: { fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  statValue: { fontSize: 13, fontWeight: 700 },
  workspace: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    height: '100%',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    minHeight: 40,
    padding: '0 var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    flexShrink: 0,
    gap: 6,
    position: 'relative',
    zIndex: 100,
  },
  fileInput: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '4px 10px',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    width: 160,
  },
  runBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 14px',
    borderRadius: 4,
    border: 'none',
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-base)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  clearBtn: {
    padding: '5px 10px',
    borderRadius: 4,
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  editorLayout: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    overflow: 'hidden',
  },
  editorPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  paneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px var(--space-3)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
    flexShrink: 0,
  },
  editorWrapper: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
  },
  lineNumbers: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: 'var(--space-3) 0',
    background: 'var(--color-bg-base, #0C0C0E)',
    borderRight: '1px solid var(--color-border)',
    minWidth: 40,
    textAlign: 'right' as const,
    userSelect: 'none' as const,
    overflow: 'hidden',
    flexShrink: 0,
  },
  lineNum: {
    fontSize: 11,
    lineHeight: '20px',
    color: 'var(--color-text-tertiary)',
    paddingRight: 'var(--space-2)',
    fontFamily: 'var(--font-mono)',
  },
  highlightOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 'var(--space-3)',
    fontSize: 13,
    lineHeight: '20px',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre' as const,
    overflow: 'hidden',
    pointerEvents: 'none' as const,
    color: 'var(--color-text-primary)',
    background: 'transparent',
    border: 'none',
    wordWrap: 'normal' as const,
  },
  editor: {
    position: 'absolute' as const,
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    padding: 'var(--space-3)',
    fontSize: 13,
    lineHeight: '20px',
    fontFamily: 'var(--font-mono)',
    background: 'var(--color-bg-base, #0C0C0E)',
    color: 'transparent',
    caretColor: 'var(--color-text-primary)',
    border: 'none',
    outline: 'none',
    resize: 'none' as const,
    overflow: 'auto',
    whiteSpace: 'pre' as const,
    wordWrap: 'normal' as const,
    tabSize: 2,
    WebkitTextFillColor: 'transparent',
  },
  outputPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderLeft: '1px solid var(--color-border)',
  },
  outputContent: {
    flex: 1,
    padding: 'var(--space-4)',
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: '1.6',
    background: 'var(--color-bg-base, #0C0C0E)',
    scrollbarWidth: 'thin' as const,
  },
  outputLine: {
    color: 'var(--color-text-secondary)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    position: 'relative' as const,
    paddingLeft: 14,
  },
  errorLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-hover)',
    borderLeft: '2px solid var(--color-text-primary)',
    padding: 'var(--space-2) var(--space-3)',
    marginTop: 'var(--space-2)',
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: '0 var(--space-3)',
    height: 24,
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  fontBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 3,
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.12s',
    padding: 0,
  },
  findBar: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '6px 10px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  findInput: {
    flex: 1,
    background: 'var(--color-bg-base, #0C0C0E)',
    border: '1px solid var(--color-border)',
    borderRadius: 3,
    padding: '3px var(--space-2)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    minWidth: 0,
  },
  findNavBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 700,
    padding: 0,
  },
  panelDock: {
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    minHeight: 0,
    padding: '0 var(--space-3) var(--space-3)',
  },
  panelResizer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 7,
    flexShrink: 0,
    cursor: 'row-resize',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
  },
  panelResizerGrip: {
    width: 36,
    height: 2,
    borderRadius: 1,
    background: 'var(--color-border)',
  },
  panelBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
  },
};

export default memo(DexCode);
