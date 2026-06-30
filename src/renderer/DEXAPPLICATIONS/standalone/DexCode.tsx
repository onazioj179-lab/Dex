// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexCode — code editor for DexScript (DEX's scripting language).
// Runtime, syntax highlight, templates, and file IO live in ./dexCode/*
import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import DexIcon from '../../components/DexIcon';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { TerminalTabs } from '../../components/TerminalTabs';
import { STORAGE_KEY, FILE_KEY, DEFAULT_CODE, TEMPLATES } from './dexCode/templates';
import { transpileDexScript, executeDexScript } from './dexCode/runtime';
import { hasConfiguredProvider, askConfiguredLLM } from '../../uki/providers/connect';
import { runUkiAgent } from '../../uki/agentRunner';
import { buildSystemPrompt } from '../../uki';
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
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { searchLines } from '../../../shared/search/textSearch';
import {
  pickProjectFolder, loadProject, getStoredProjectRoot, clearStoredProject,
  readProjectFile, searchProject, projectName, buildSymbolIndex,
  type DexProject, type WorkspaceHit, type ProjectSymbol, type ProjectFile,
} from './dexCode/project';
import { fuzzyFilter, type QuickOpenResult } from './dexCode/quickOpen';

// Re-export for any external consumer that previously imported these from
// DexCode.tsx directly.
export { transpileDexScript, executeDexScript, highlightDexScript };

// Bottom terminal panel sizing. Min keeps the panel usable; max is clamped to
// 70% of the editor area at drag time so the editor never collapses.
const PANEL_HEIGHT_KEY = 'dex-code-panel-height';
const PANEL_MIN_HEIGHT = 120;

// --- Plain-English mode -----------------------------------------------------
// "Write what you want in English, run it." UKI either TRANSLATES the English
// into DexScript (transparent: the code lands in the editor, editable) or
// EXECUTES the intent directly via its agent tools. AI makes coding easy; this
// makes talking to the AI feel like coding.
const PLAIN_TRANSLATE_SYS = [
  'You translate a plain-English request into a single DexScript program for the DEX platform.',
  'DexScript is a small JavaScript-like language: `let x = 1`, `print(...)`, `if/else` (also `elif`), `for x in 1..10 {}`, `for item in list {}`, `while`, `fn name(args) {}`, arithmetic and string ops.',
  'A standard library is available as globals (call as shown):',
  '  print(...args)  — output a line.   type(v) — "null"|"list"|"number"|"string"|...',
  '  math: pi, e, tau, sqrt, cbrt, abs, pow, hypot, round(n,d?), floor, ceil, trunc, sign, min, max, clamp(n,lo,hi), sum(...), avg(...), gcd(a,b), lcm(a,b), random(min?,max?), sin/cos/tan, log/log2/log10, deg(r), rad(d).',
  '  str: upper(s), lower(s), trim(s), len(s), contains(s,sub), starts(s,sub), ends(s,sub), split(s,sep), join(list,sep), replace(s,a,b), repeat(s,n), reverse(s), padLeft(s,n,c?), padRight(s,n,c?), capitalize(s).',
  '  list: range(n) or range(a,b,step?), map(a,f), filter(a,f), reduce(a,f,init), each(a,f), sum(a), avg(a), min(a), max(a), sort(a,f?), reverse(a), unique(a), first(a), last(a), len(a), contains(a,v), indexOf(a,v), slice(a,s,e), flatten(a), zip(a,b), push(a,v), pop(a).',
  '  fmt: number(n), currency(n,cur?), percent(n,d?), fixed(n,d?), bytes(n).',
  '  time: now(), date(), time(), year(), month(), day(), weekday(), iso().   json: encode(v), decode(s), pretty(v).   assert(cond,msg?).',
  'There is NO file, network, or DOM access — pure computation only. Prefer the stdlib over reimplementing it.',
  'Output ONLY the DexScript code — no prose, no explanation, no markdown fences. The code must be runnable as-is.',
  'Prefer `print(...)` to surface results so the user sees output when it runs.',
].join('\n');

/** Strip ```lang fences / stray backticks an LLM may wrap code in. */
function stripCodeFences(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1];
  return t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
}

// Gutter line numbers, memoized so typing on a single line does not rebuild the
// whole column of <div>s every keystroke -- it only re-renders when the line
// count actually changes. A meaningful win on large files (the gutter was the
// hottest list in the editor's render path).
const LineNumbers = memo(function LineNumbers({ count }: { count: number }) {
  return (
    <div style={S.lineNumbers} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={S.lineNum}>{i + 1}</div>
      ))}
    </div>
  );
});

// One Quick Open result row. Memoized so re-rendering the palette (e.g. moving
// the highlight) only repaints the rows whose props changed, not all 50.
const QuickOpenRow = memo(function QuickOpenRow({
  name, path, matches, active, onPick, onHover,
}: {
  name: string;
  path: string;
  matches: number[];
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  const matchSet = matches.length ? new Set(matches) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={onHover}
      style={{ ...S.quickOpenRow, ...(active ? S.quickOpenRowActive : null) }}
      title={path}
    >
      <DexIcon name="code" size={12} />
      <span style={S.quickOpenName}>
        {matchSet
          ? Array.from(name).map((ch, i) =>
              matchSet.has(i)
                ? <mark key={i} style={S.quickOpenMark}>{ch}</mark>
                : <span key={i}>{ch}</span>)
          : name}
      </span>
      <span style={S.quickOpenPath}>{path}</span>
    </button>
  );
});

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
  // Live verbs for the Run button ("Running / Executing / Crunching").
  const runPhrase = useWorkingPhrase(isRunning, 'run');

  // Plain-English mode: write intent in English; UKI translates it to DexScript
  // ('code', transparent + editable) or executes it directly ('doit').
  const [langMode, setLangMode] = useState<'dexscript' | 'plain'>(() => {
    try { return localStorage.getItem('dex-code-lang-mode') === 'plain' ? 'plain' : 'dexscript'; } catch { return 'dexscript'; }
  });
  const [plainMode, setPlainMode] = useState<'code' | 'doit'>(() => {
    try { return localStorage.getItem('dex-code-plain-mode') === 'doit' ? 'doit' : 'code'; } catch { return 'code'; }
  });
  const [plainText, setPlainText] = useState(() => {
    try { return localStorage.getItem('dex-code-plain-text') || ''; } catch { return ''; }
  });
  useEffect(() => { try { localStorage.setItem('dex-code-lang-mode', langMode); } catch { /* quota */ } }, [langMode]);
  useEffect(() => { try { localStorage.setItem('dex-code-plain-mode', plainMode); } catch { /* quota */ } }, [plainMode]);
  useEffect(() => { try { localStorage.setItem('dex-code-plain-text', plainText); } catch { /* quota */ } }, [plainText]);
  // Verb for the Run button while UKI is working a plain-English request.
  const aiPhrase = useWorkingPhrase(isRunning && langMode === 'plain', plainMode === 'doit' ? 'run' : 'generic');

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
  // Full-screen / Zen mode (DEX 6.0: "be a pro IDE"). Portals the whole editor
  // over the entire viewport — above the DEX top bar + launcher — so DexCode
  // truly fills the screen like VS Code, not just the floating app window.
  // F11 toggles, Esc exits; persisted so it reopens the way you left it.
  const [fullscreen, setFullscreen] = useState(() => {
    try { return localStorage.getItem('dex-code-fullscreen') === 'true'; } catch { return false; }
  });
  const toggleFullscreen = useCallback(() => {
    setFullscreen(v => {
      const next = !v;
      try { localStorage.setItem('dex-code-fullscreen', String(next)); } catch { /* ignore */ }
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
  // Templates tucked behind a collapsible header (hidden by default) so the
  // sidebar stays focused on your files, not the starter list. Persisted.
  const [showTemplates, setShowTemplates] = useState(() => {
    try { return localStorage.getItem('dex-code-show-templates') === 'true'; } catch { return false; }
  });
  const toggleTemplates = useCallback(() => {
    setShowTemplates(v => {
      const next = !v;
      try { localStorage.setItem('dex-code-show-templates', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Collapsible Output pane — hide it to give the editor the full width, like a
  // pro IDE panel toggle. Persisted; auto-reveals when you Run so results show.
  const [outputCollapsed, setOutputCollapsed] = useState(() => {
    try { return localStorage.getItem('dex-code-output-collapsed') === 'true'; } catch { return false; }
  });
  const setOutputCollapsedPersist = useCallback((next: boolean) => {
    setOutputCollapsed(next);
    try { localStorage.setItem('dex-code-output-collapsed', String(next)); } catch { /* ignore */ }
  }, []);
  // Go to Line (Ctrl+G).
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [goToLineInput, setGoToLineInput] = useState('');
  const goToLineRef = useRef<HTMLInputElement>(null);
  // Quick Open (Ctrl/Cmd+P): a fuzzy file finder over the open project's files +
  // recent files. `quickOpenIndex` is the highlighted row for keyboard nav.
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const quickOpenRef = useRef<HTMLInputElement>(null);
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
    // Let UKI READ the open file's full source as a callable action (read-only).
    registerUkiAppAction('dexcode', {
      id: 'dexcode.readActiveFile',
      description: 'read the full source of the file currently open in DexCode.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const s = ukiCtxRef.current;
      if (!s.code) return 'No file is open in DexCode.';
      const name = s.currentFilePath || s.fileName;
      return `// ${name}\n${s.code}`.slice(0, 6000);
    });
    // UKI can OPEN a new file/buffer with generated content (mutating -> confirm).
    registerUkiAppAction('dexcode', {
      id: 'dexcode.newFile',
      description: 'open a NEW file in DexCode with the given name and content (replaces the editor buffer; the user saves it to disk).',
      args: [{ name: 'name', type: 'string', optional: true }, { name: 'content', type: 'string' }],
      example: '{"name": "hello.dex", "content": "print(1)"}',
      mutates: true,
    }, (args) => {
      const content = String(args.content ?? '');
      const name = String(args.name ?? '').trim() || 'untitled.dex';
      setCode(content);
      setCurrentFilePath(null);
      setFileName(name);
      return `Opened new file "${name}" in DexCode (${content.split('\n').length} lines). Use Save to write it to disk.`;
    });
    // UKI can SEARCH the open file and get back ranked matching lines (the
    // retrieval core for working over large files without dumping the whole
    // thing into the prompt).
    registerUkiAppAction('dexcode', {
      id: 'dexcode.search',
      description: 'search the file open in DexCode for a query and return the best-matching lines with their line numbers.',
      args: [{ name: 'query', type: 'string' }],
      example: '{"query":"function add"}',
      mutates: false,
    }, (args) => {
      const s = ukiCtxRef.current;
      if (!s.code) return 'No file is open in DexCode.';
      const q = String(args.query ?? '');
      const hits = searchLines(s.code, q, 25);
      if (!hits.length) return `No lines match "${q}".`;
      return hits.map((h) => `${h.line}: ${h.text}`).join('\n');
    });
    return () => {
      unregisterUkiAppContext('dexcode');
      unregisterUkiAppAction('dexcode.readActiveFile');
      unregisterUkiAppAction('dexcode.newFile');
      unregisterUkiAppAction('dexcode.search');
    };
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
    // Reveal the output panel if it was collapsed -- you ran it, you want results.
    setOutputCollapsed(prev => {
      if (prev) { try { localStorage.setItem('dex-code-output-collapsed', 'false'); } catch { /* ignore */ } }
      return false;
    });
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

  // Run a PLAIN-ENGLISH request through UKI. 'code' translates English ->
  // DexScript, drops it in the editor (transparent + editable), and runs it;
  // 'doit' hands the intent to UKI's agent loop and reports what it did.
  const runPlain = useCallback(async () => {
    const intent = plainText.trim();
    if (!intent) return;
    setOutputCollapsedPersist(false);
    if (!hasConfiguredProvider()) {
      setOutput([]);
      setError('Plain English needs an AI provider. Add a key in Settings > AI Providers, then try again.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setOutput([]);
    try {
      if (plainMode === 'code') {
        const gen = await askConfiguredLLM(intent, PLAIN_TRANSLATE_SYS, { chatOptions: { temperature: 0.2, maxTokens: 700 } });
        const generated = stripCodeFences(gen || '');
        if (!generated) { setError('Could not turn that into code. Try rephrasing.'); return; }
        // Surface the generated program in the editor so it's transparent and
        // the user can tweak + re-run it as DexScript.
        setCode(generated);
        setLangMode('dexscript');
        const result = executeDexScript(generated);
        setOutput([`// Generated from: ${intent}`, ...result.output]);
        setError(result.error);
        setDuration(result.duration);
      } else {
        const steps: string[] = [];
        const answer = await runUkiAgent({ userText: intent, systemPrompt: buildSystemPrompt(), pushStep: (s) => steps.push(s) });
        setOutput([
          ...(steps.length ? [...steps.map(s => `· ${s}`), ''] : []),
          answer || '(UKI returned no response — is a provider key set?)',
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      setTimeout(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, 0);
    }
  }, [plainText, plainMode, setOutputCollapsedPersist]);

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
      // Quick Open fuzzy file finder (Ctrl/Cmd+P) -- VS Code convention.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowQuickOpen(prev => {
          if (prev) { editorRef.current?.focus(); return false; }
          setQuickOpenQuery('');
          setQuickOpenIndex(0);
          requestAnimationFrame(() => quickOpenRef.current?.focus());
          return true;
        });
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
      if (e.key === 'Escape' && (showFind || showGoToLine || showQuickOpen)) {
        setShowFind(false);
        setShowReplace(false);
        setShowGoToLine(false);
        setShowQuickOpen(false);
        editorRef.current?.focus();
      }
      // Full screen: F11 toggles; Escape exits (only when no dialog is open, so
      // a single Esc still closes Find/GoTo first).
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === 'Escape' && fullscreen && !showFind && !showGoToLine && !showQuickOpen) {
        setFullscreen(false);
        try { localStorage.setItem('dex-code-fullscreen', 'false'); } catch { /* ignore */ }
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
  }, [code, fileName, runCode, showFind, showGoToLine, showQuickOpen, handleSaveFile, handleSaveAs, handleOpenFile, handleNewFile, toggleSidebar, toggleFullscreen, fullscreen]);

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
  // Live verb for the project-wide code search status.
  const searchPhrase = useWorkingPhrase(workspaceBusy, 'search');

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

  // Quick Open results: fuzzy-rank the project's files against the query. Recent
  // files (without an open project) are folded in so Ctrl+P is useful even before
  // a folder is opened. Recomputed only when the inputs change.
  const quickOpenItems = useMemo<ProjectFile[]>(() => {
    const map = new Map<string, ProjectFile>();
    if (project) for (const f of project.files) map.set(f.path, f);
    for (const p of recentFiles) {
      if (!map.has(p)) map.set(p, { name: p.split(/[\\/]/).pop() || p, path: p });
    }
    return Array.from(map.values());
  }, [project, recentFiles]);

  const quickOpenResults = useMemo<QuickOpenResult<ProjectFile>[]>(
    () => fuzzyFilter(quickOpenItems, quickOpenQuery, 50),
    [quickOpenItems, quickOpenQuery],
  );

  // Keep the highlighted row in range as the result set shrinks/grows.
  useEffect(() => { setQuickOpenIndex(0); }, [quickOpenQuery]);

  const openQuickOpen = useCallback(() => {
    setShowQuickOpen(true);
    setQuickOpenQuery('');
    setQuickOpenIndex(0);
    requestAnimationFrame(() => quickOpenRef.current?.focus());
  }, []);

  const closeQuickOpen = useCallback(() => {
    setShowQuickOpen(false);
    editorRef.current?.focus();
  }, []);

  // Open the highlighted (or an explicit) quick-open result in the editor.
  const acceptQuickOpen = useCallback((index?: number) => {
    const pick = quickOpenResults[index ?? quickOpenIndex];
    if (!pick) return;
    setShowQuickOpen(false);
    loadEditorFromPath(pick.item.path);
  }, [quickOpenResults, quickOpenIndex, loadEditorFromPath]);

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

  const shell = (
    <div style={{ ...S.container, gridTemplateColumns: sidebarCollapsed ? '44px minmax(0, 1fr)' : '44px 220px minmax(0, 1fr)', ...(fullscreen ? { height: '100vh', width: '100vw' } : null) }}>
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
          title="Quick Open file (Ctrl+P)"
          aria-label="Quick open file"
          aria-pressed={showQuickOpen}
          style={showQuickOpen ? S.activityBtnActive : S.activityBtn}
          onClick={() => { if (showQuickOpen) closeQuickOpen(); else openQuickOpen(); }}
          onMouseEnter={e => { if (!showQuickOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { if (!showQuickOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          <DexIcon name="file-text" size={16} />
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
      <aside className="dex-liquid-glass-strong" style={S.sidebar}>
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
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: 11, background: 'var(--color-bg-inset, rgba(255,255,255,0.04))', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', outline: 'none' }}
                />
                {workspaceBusy && <div style={{ fontSize: 10, opacity: 0.5, padding: '2px var(--space-2)' }}>{searchPhrase}…</div>}
                {workspaceHits.length > 0 ? (
                  <div className="dex-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflow: 'auto' }}>
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
                  <div className="dex-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
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
                    style={{ width: '100%', boxSizing: 'border-box', margin: '2px 0 4px', padding: '4px 8px', fontSize: 11, background: 'var(--color-bg-inset, rgba(255,255,255,0.04))', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', outline: 'none' }}
                  />
                )}
                {filteredSymbols.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-2)' }}>No matches</div>
                ) : (
                  <div className="dex-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
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
          <div
            style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={toggleTemplates}
            role="button"
            tabIndex={0}
            aria-expanded={showTemplates}
            aria-label="Toggle Templates section"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTemplates(); } }}
          >
            <DexIcon name={showTemplates ? 'chevron-down' : 'chevron-right'} size={10} />
            Templates
            <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>{TEMPLATES.length}</span>
          </div>
          {showTemplates && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
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
          )}
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
        <div className="dex-liquid-glass-strong" style={S.topBar}>
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
            {/* Language toggle: real DexScript vs plain-English-via-UKI. */}
            <div role="tablist" aria-label="Editor language" style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-inset, rgba(255,255,255,0.05))', borderRadius: 8, padding: 2, gap: 2 }}>
              {(['dexscript', 'plain'] as const).map(m => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={langMode === m}
                  onClick={() => setLangMode(m)}
                  style={{
                    padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: langMode === m ? 'var(--color-accent)' : 'transparent',
                    color: langMode === m ? '#fff' : 'var(--color-text-secondary)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >{m === 'dexscript' ? 'Code' : 'Plain English'}</button>
              ))}
            </div>
            {/* In plain mode, choose whether UKI writes code or just acts. */}
            {langMode === 'plain' && (
              <div role="tablist" aria-label="Plain-English behaviour" style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-inset, rgba(255,255,255,0.05))', borderRadius: 8, padding: 2, gap: 2 }}>
                {(['code', 'doit'] as const).map(m => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={plainMode === m}
                    title={m === 'code' ? 'UKI writes DexScript you can see and edit, then runs it' : 'UKI carries out your request directly'}
                    onClick={() => setPlainMode(m)}
                    style={{
                      padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: plainMode === m ? 'var(--color-accent-light)' : 'transparent',
                      color: plainMode === m ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >{m === 'code' ? 'Show code' : 'Just do it'}</button>
                ))}
              </div>
            )}
            <button
              onClick={langMode === 'plain' ? runPlain : runCode}
              disabled={isRunning || (langMode === 'plain' && !plainText.trim())}
              style={S.runBtn}
              onMouseEnter={e => { if (!isRunning) e.currentTarget.style.background = 'var(--color-text-secondary)'; }}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-text-primary)'}
            >
              <DexIcon name="play" size={13} color="var(--color-bg-base)" />
              <span>{isRunning ? `${(langMode === 'plain' ? aiPhrase : runPhrase)}...` : 'Run'}</span>
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
            <button
              onClick={toggleFullscreen}
              style={fullscreen ? { ...S.clearBtn, background: 'var(--color-bg-hover)' } : S.clearBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = fullscreen ? 'var(--color-bg-hover)' : 'transparent')}
              title={fullscreen ? 'Exit full screen (F11 / Esc)' : 'Full screen (F11)'}
              aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
              aria-pressed={fullscreen}
            >
              <DexIcon name={fullscreen ? 'minimize' : 'fullscreen'} size={11} />
            </button>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Ctrl+Enter to run</span>
          </div>
        </div>

        {/* Quick Open (Ctrl/Cmd+P) — fuzzy file finder over the project + recents */}
        {showQuickOpen && (
          <div style={S.quickOpenScrim} onMouseDown={closeQuickOpen}>
            <div className="dex-liquid-glass-strong" style={S.quickOpenPanel} onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Quick Open">
              <div style={S.quickOpenSearch}>
                <DexIcon name="search" size={13} color="var(--color-text-tertiary)" />
                <input
                  ref={quickOpenRef}
                  value={quickOpenQuery}
                  onChange={e => setQuickOpenQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setQuickOpenIndex(i => Math.min(i + 1, quickOpenResults.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setQuickOpenIndex(i => Math.max(i - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); acceptQuickOpen(); }
                    else if (e.key === 'Escape') { e.preventDefault(); closeQuickOpen(); }
                  }}
                  placeholder={quickOpenItems.length ? 'Go to file…' : 'Open a folder to search files'}
                  aria-label="Quick open file"
                  spellCheck={false}
                  style={S.quickOpenInput}
                />
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {quickOpenResults.length}{quickOpenItems.length > quickOpenResults.length ? '+' : ''}
                </span>
              </div>
              <div className="dex-scroll" style={S.quickOpenList}>
                {quickOpenResults.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {quickOpenItems.length ? 'No matching files' : 'No files indexed yet'}
                  </div>
                ) : quickOpenResults.map((r, i) => (
                  <QuickOpenRow
                    key={r.item.path}
                    name={r.item.name}
                    path={r.item.path}
                    matches={r.matches}
                    active={i === quickOpenIndex}
                    onPick={() => acceptQuickOpen(i)}
                    onHover={() => setQuickOpenIndex(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Editor + Output */}
        <div style={{ ...S.editorLayout, gridTemplateColumns: outputCollapsed ? 'minmax(0, 1fr)' : 'minmax(0, 3fr) minmax(0, 2fr)' }}>
          {/* Code Editor */}
          <div style={S.editorPane}>
            <div style={S.paneHeader}>
              <span>Editor</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>.dex</span>
                {outputCollapsed && (
                  <button
                    onClick={() => setOutputCollapsedPersist(false)}
                    style={S.paneToggleBtn}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    title="Show output panel"
                    aria-label="Show output panel"
                  >
                    <DexIcon name="chevron-left" size={12} />
                    <span style={{ fontSize: 10 }}>Output</span>
                  </button>
                )}
              </div>
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
            {langMode === 'plain' ? (
              /* Plain-English surface: a clean prose textarea. No highlighting,
                 no line numbers — you're writing intent, not code. Cmd/Ctrl+Enter
                 runs it, matching the code editor's muscle memory. */
              <div style={S.editorWrapper}>
                <textarea
                  value={plainText}
                  onChange={e => setPlainText(e.target.value)}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void runPlain(); } }}
                  placeholder={plainMode === 'code'
                    ? 'Describe what the program should do, in plain English.\n\ne.g. "Print the numbers 1 to 10, but say Fizz for multiples of 3."\n\nUKI writes the DexScript, drops it in the editor, and runs it. Cmd/Ctrl+Enter to run.'
                    : 'Tell UKI what to do, in plain English.\n\ne.g. "Open the calculator and search the web for today\'s date."\n\nUKI carries it out with its tools. Cmd/Ctrl+Enter to run.'}
                  spellCheck
                  style={{ ...S.editor, fontSize: fontSize + 1, fontFamily: 'var(--dex-font-ui)', whiteSpace: 'pre-wrap', padding: 'var(--space-3)' }}
                  aria-label="Plain English instructions"
                />
              </div>
            ) : (
              <div style={S.editorWrapper}>
                {/* Line numbers — memoized; only re-renders when the count changes */}
                <LineNumbers count={lineCount} />
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
            )}
          </div>

          {/* Output Panel */}
          {!outputCollapsed && (
          <div style={S.outputPane}>
            <div style={S.paneHeader}>
              <span>Output</span>
              {duration > 0 && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {duration < 1 ? '<1' : Math.round(duration)}ms
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                {output.length > 0 && (
                <>
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
                </>
                )}
                <button
                  onClick={() => setOutputCollapsedPersist(true)}
                  style={S.paneToggleBtn}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="Hide output panel"
                  aria-label="Hide output panel"
                >
                  <DexIcon name="chevron-right" size={12} />
                </button>
              </div>
            </div>
            <div ref={outputRef} className="dex-scroll" style={S.outputContent}>
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
          )}
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

  // Full-screen mode: portal the editor over the whole viewport (above the DEX
  // top bar + launcher) so it truly fills the screen — the window-frame `contain`
  // would otherwise trap a fixed overlay inside the app window.
  return fullscreen
    ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'var(--color-bg-base)' }}>{shell}</div>,
        document.body,
      )
    : shell;
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 0,
    boxShadow: 'none',
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 0,
    boxShadow: 'none',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
    gap: 6,
    position: 'relative',
    zIndex: 100,
  },
  fileInput: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    // Base layer sits BEHIND both the syntax-highlight <pre> and the textarea.
    // The textarea itself must stay transparent (below) so the coloured code
    // shows through — otherwise its opaque background hides the highlight layer
    // and the editor looks empty.
    background: 'var(--color-bg-base, #0C0C0E)',
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
    // MUST be transparent: the textarea is layered ON TOP of the syntax-highlight
    // <pre>. An opaque background here hides the coloured code (the long-standing
    // "can't see my code in DexCode" bug). The dark base lives on editorWrapper.
    background: 'transparent',
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
  paneToggleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 22,
    padding: '0 6px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontWeight: 600,
    letterSpacing: '0.02em',
    textTransform: 'none' as const,
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
  quickOpenScrim: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 200,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 60,
    background: 'rgba(0,0,0,0.35)',
  },
  quickOpenPanel: {
    width: 'min(560px, 90%)',
    maxHeight: '70%',
    display: 'flex',
    flexDirection: 'column' as const,
    borderRadius: 14,
    overflow: 'hidden',
  },
  quickOpenSearch: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  quickOpenInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  },
  quickOpenList: {
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: 4,
    minHeight: 0,
  },
  quickOpenRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 8px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 12,
  },
  quickOpenRowActive: {
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
  },
  quickOpenName: {
    flexShrink: 0,
    fontWeight: 600,
    maxWidth: '45%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  quickOpenMark: {
    background: 'transparent',
    color: 'var(--color-accent, #4A9EFF)',
    fontWeight: 700,
  },
  quickOpenPath: {
    marginLeft: 'auto',
    fontSize: 10,
    opacity: 0.5,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    direction: 'rtl' as const,
    textAlign: 'left' as const,
  },
};

export default memo(DexCode);
