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
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';
import { Terminal } from '../../components/Terminal';
import { STORAGE_KEY, FILE_KEY, DEFAULT_CODE, TEMPLATES } from './dexCode/templates';
import { transpileDexScript, executeDexScript } from './dexCode/runtime';
import { highlightDexScript } from './dexCode/highlight';
import {
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
  openFileDialog,
  saveFileDialog,
  saveFile,
} from './dexCode/fileIO';

// Re-export for any external consumer that previously imported these from
// DexCode.tsx directly.
export { transpileDexScript, executeDexScript, highlightDexScript };

const DexCode: React.FC = () => {
  const { showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('dexcode');
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
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [fontSize, setFontSize] = useState(13);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  // Track original content for modified detection
  const originalCodeRef = useRef(code);

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
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, code);
        localStorage.setItem(FILE_KEY, fileName);
      } catch { /* ignore */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [code, fileName]);

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
    // Use requestAnimationFrame so UI updates before execution
    requestAnimationFrame(() => {
      const result = executeDexScript(code);
      setOutput(result.output);
      setError(result.error);
      setDuration(result.duration);
      setIsRunning(false);
      // Scroll output to bottom
      requestAnimationFrame(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      });
    });
  }, [code]);

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
      if (e.key === 'Escape' && showFind) {
        setShowFind(false);
        setShowReplace(false);
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
  }, [code, fileName, runCode, showFind, handleSaveFile, handleSaveAs, handleOpenFile, handleNewFile]);

  // Tab key, bracket auto-close, auto-indent
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

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
  }, [code]);

  const highlighted = useMemo(() => highlightDexScript(code), [code]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);

  // Cursor position tracking
  const updateCursorPos = useCallback(() => {
    if (!editorRef.current) return;
    const pos = editorRef.current.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCursorPos({ line, col });
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
    <div style={S.container}>
      {/* Activity bar (Xcode-style) -- slim icon column on far left */}
      <nav style={S.activityBar} aria-label="DexCode activity bar">
        <button title="Navigator" aria-label="Navigator" style={S.activityBtnActive}>
          <DexIcon name="folder" size={16} />
        </button>
        <button
          title="Find"
          aria-label="Find in file"
          style={S.activityBtn}
          onClick={() => setShowFind(s => !s)}
        >
          <DexIcon name="search" size={16} />
        </button>
        <button
          title="Run"
          aria-label="Run code"
          style={S.activityBtn}
          onClick={runCode}
          disabled={isRunning}
        >
          <DexIcon name="play" size={16} />
        </button>
        <button
          title="Terminal"
          aria-label="Toggle terminal"
          style={S.activityBtn}
          onClick={() => setTerminalOpen(o => !o)}
        >
          <DexIcon name="terminal" size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          title="Shortcuts"
          aria-label="Keyboard shortcuts"
          style={S.activityBtn}
          onClick={() => setShowShortcutsPanel(true)}
        >
          <DexIcon name="command" size={16} />
        </button>
      </nav>

      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <span style={S.sidebarTitle}>DEXCODE</span>
        </div>

        {/* File Actions */}
        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>File</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={handleNewFile} style={S.fileActionBtn}>
              <DexIcon name="plus" size={12} />
              <span>New File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+N</span>
            </button>
            <button onClick={handleOpenFile} style={S.fileActionBtn}>
              <DexIcon name="folder-open" size={12} />
              <span>Open File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+O</span>
            </button>
            <button onClick={handleSaveFile} style={S.fileActionBtn}>
              <DexIcon name="save" size={12} />
              <span>Save{isModified ? ' *' : ''}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
            </button>
            <button onClick={handleSaveAs} style={S.fileActionBtn}>
              <DexIcon name="download" size={12} />
              <span>Save As</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+Shift+S</span>
            </button>
          </div>
        </div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div style={S.sidebarBlock}>
            <div 
              style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowRecentFiles(!showRecentFiles)}
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
                style={{...S.templateBtn, padding: '6px 8px'}}
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

      {/* Main workspace */}
      <section style={S.workspace}>
        {/* Top bar */}
        <div style={S.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                onClick={updateCursorPos}
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
            </div>
            <div ref={outputRef} style={S.outputContent}>
              {output.length === 0 && !error && (
                <div style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic', fontSize: 12 }}>
                  <span style={{opacity:0.5}}>\$ </span>Run your code to see output here
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
          </div>
        </div>

        {/* Status bar */}
        <div style={S.statusBar}>
          <span>DexScript</span>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{stats.lines} lines</span>
          <span>{stats.chars} chars</span>
          <span style={{ fontSize: 9 }}>{fontSize}px</span>
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
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Terminal
          </button>
          <span>? shortcuts · Ctrl+F find · Ctrl+H replace · Ctrl+S export · Ctrl+` terminal</span>
        </div>

        {terminalOpen && (
          <div style={{ height: 240, padding: '0 12px 12px', flexShrink: 0 }}>
            <Terminal onClose={() => setTerminalOpen(false)} />
          </div>
        )}
      </section>
      {showShortcutsPanel && <KeyboardShortcutsPanel appId="dexcode" onClose={() => setShowShortcutsPanel(false)} />}
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
    padding: '8px 10px',
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
    padding: '8px 10px',
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
    gap: 8,
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
    padding: '5px 8px',
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
    padding: 8,
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
    padding: '0 12px',
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
    padding: '6px 12px',
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
    padding: '12px 0',
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
    paddingRight: 8,
    fontFamily: 'var(--font-mono)',
  },
  highlightOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 12,
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
    padding: 12,
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
    padding: '16px',
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
    padding: '8px 12px',
    marginTop: 8,
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
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
    padding: '3px 8px',
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
};

export default memo(DexCode);
