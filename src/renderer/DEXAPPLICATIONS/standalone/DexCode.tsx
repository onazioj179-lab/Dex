// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexCode — code editor for DexScript (DEX's scripting language).
// Runtime, syntax highlight, templates, and file IO live in ./dexCode/*
import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import DexIcon from '../../components/DexIcon';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { useAppAppearance } from '../../utils/appAppearanceContext';
import { TerminalTabs } from '../../components/TerminalTabs';
import { useConfirm } from '../../components/ConfirmDialog';
import { ProjectTasks } from './dexCode/ProjectTasks';
import { ProjectGit } from './dexCode/ProjectGit';
import { useSyntaxDiagnostics } from './dexCode/useSyntaxDiagnostics';
import { TEMPLATES } from './dexCode/templates';
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
  openFileDialog,
  saveFileDialog,
  saveFile,
} from './dexCode/fileIO';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import {
  pickProjectFolder, loadProject, restoreProject, getStoredProjectRoot, closeProjectFolder,
  readProjectFile, searchWorkspaceFiles, projectName, buildSymbolIndex, projectContains, sameProjectPath,
  openProjectDocument, saveProjectDocument,
  type DexProject, type WorkspaceHit, type ProjectSymbol, type ProjectFile,
} from './dexCode/project';
import {
  appendEditorTab, editorTabIsDirty, makeEditorTab, mergeEditorDisk, useEditorSession,
  type EditorAccess, type EditorTab,
} from './dexCode/editorSession';
import { EditorTabs, editorTabElementId } from './dexCode/EditorTabs';
import { ProjectFileList } from './dexCode/ProjectFileList';
import { fuzzyFilter, type QuickOpenResult } from './dexCode/quickOpen';
import { loadAppPreferences, useAppPreference } from '../../store/appPreferences';

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

function reportEditorError(message: string) {
  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message } }));
}

const EDITOR_LINE_HEIGHT = 20;
const DEFAULT_GUTTER_HEIGHT = 600;
const HIGHLIGHT_CHARACTER_LIMIT = 300_000;
const HIGHLIGHT_LINE_LIMIT = 10_000;

const LineNumbers = memo(function LineNumbers({ count, top, height, width }: {
  count: number; top: number; height: number; width: number;
}) {
  const first = Math.min(count - 1, Math.max(0, Math.floor(top / EDITOR_LINE_HEIGHT) - 1));
  const rows = Math.min(count - first, Math.ceil(height / EDITOR_LINE_HEIGHT) + 3);
  return (
    <div style={{ ...S.lineNumbers, width }} aria-hidden="true" data-editor-gutter>
      <div style={{ transform: `translateY(${first * EDITOR_LINE_HEIGHT - top}px)` }}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={first + index} style={S.lineNum}>{first + index + 1}</div>
        ))}
      </div>
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
  const appearance = useAppAppearance();
  const { session, current: editorSession, ready: sessionReady, draftState, update: updateSession, patch: patchTab } = useEditorSession();
  const activeTab = session.tabs.find(tab => tab.id === session.activeId)!;
  const code = activeTab.text;
  const fileName = activeTab.name;
  const currentFilePath = activeTab.path;
  const isModified = editorTabIsDirty(activeTab);
  const editorReadOnly = !sessionReady || activeTab.status === 'pending' ||
    (activeTab.status === 'unavailable' && !isModified);
  const editorPanelId = useId();
  const problemsId = useId();
  const [showProblems, setShowProblems] = useState(false);
  const setCode = useCallback((text: string) => {
    if (!editorReadOnly) patchTab(activeTab.id, tab => tab.text === text ? tab : { ...tab, text });
  }, [activeTab.id, editorReadOnly, patchTab]);
  const [project, setProject] = useState<DexProject | null>(null);
  const [gitOpen, setGitOpen] = useState(false);
  const [gitRevision, setGitRevision] = useState(0);
  const [projectReady, setProjectReady] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const projectRequest = useRef(0);
  const projectBusy = useRef(false);
  const savingDocument = useRef<string | null>(null);
  const savingDestination = useRef<string | null>(null);
  const openingDialog = useRef(false);
  const reloadingDocument = useRef<string | null>(null);
  const editorJump = useRef<{ id: string; line: number; column?: number } | null>(null);
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
  const syntax = useSyntaxDiagnostics({
    id: activeTab.id,
    name: fileName,
    text: code,
    enabled: !editorReadOnly && langMode === 'dexscript',
  });
  useEffect(() => { try { localStorage.setItem('dex-code-plain-mode', plainMode); } catch { /* quota */ } }, [plainMode]);
  useEffect(() => { try { localStorage.setItem('dex-code-plain-text', plainText); } catch { /* quota */ } }, [plainText]);
  // Verb for the Run button while UKI is working a plain-English request.
  const aiPhrase = useWorkingPhrase(isRunning && langMode === 'plain', plainMode === 'doit' ? 'run' : 'generic');

  const [terminalState, setTerminalState] = useState<'closed' | 'visible' | 'hidden'>('closed');
  const [taskState, setTaskState] = useState<'closed' | 'visible' | 'hidden'>('closed');
  const terminalOpen = terminalState === 'visible';
  const tasksOpen = taskState === 'visible';
  const { confirm, ConfirmHost } = useConfirm();
  const toggleTerminal = useCallback(() => {
    setTaskState(state => state === 'visible' ? 'hidden' : state);
    setTerminalState(state => state === 'visible' ? 'hidden' : 'visible');
  }, []);
  const toggleProjectTasks = useCallback(() => {
    setTerminalState(state => state === 'visible' ? 'hidden' : state);
    setTaskState(state => state === 'visible' ? 'hidden' : 'visible');
  }, []);
  // Autosave status for the status bar. 'saving' while the debounce is pending,
  // 'saved' briefly after the write lands, then idle. Purely a UI affordance --
  // the autosave timing itself is unchanged.
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
  const editorShellRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [gutter, setGutter] = useState({ top: 0, height: DEFAULT_GUTTER_HEIGHT });
  const measureGutter = useCallback((editor: HTMLTextAreaElement) => {
    const top = editor.scrollTop;
    const height = editor.clientHeight || DEFAULT_GUTTER_HEIGHT;
    setGutter(previous => previous.top === top && previous.height === height ? previous : { top, height });
  }, []);
  const highlightRef = useRef<HTMLPreElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const defaultFontSize = Number(useAppPreference('dexcode', 'fontSize'));
  const [fontSize, setFontSize] = useState(defaultFontSize);
  useEffect(() => { void loadAppPreferences(); }, []);
  useEffect(() => setFontSize(defaultFontSize), [defaultFontSize]);
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

  const jumpToLine = useCallback((line: number, column = 1) => {
    const tabId = editorSession.current.activeId;
    requestAnimationFrame(() => {
      if (editorSession.current.activeId !== tabId) return;
      const ta = editorRef.current;
      if (!ta) return;
      const text = ta.value;
      const start = lineStartOffset(text, line);
      const end = text.indexOf('\n', start);
      const pos = Math.min(start + column - 1, end === -1 ? text.length : end);
      ta.selectionStart = ta.selectionEnd = pos;
      ta.focus();
      ta.scrollTop = Math.max(0, (line - 1) * EDITOR_LINE_HEIGHT - ta.clientHeight / 2);
      measureGutter(ta);
    });
  }, [editorSession, measureGutter]);

  const recordEditorView = useCallback(() => {
    const editor = editorRef.current;
    const tab = editorSession.current.tabs.find(entry => entry.id === editorSession.current.activeId);
    if (!editor || !tab || editor.dataset.documentId !== tab.id || tab.status === 'pending') return;
    const view = { start: editor.selectionStart, end: editor.selectionEnd, top: editor.scrollTop, left: editor.scrollLeft };
    patchTab(tab.id, current => {
      const saved = current.view;
      return saved && saved.start === view.start && saved.end === view.end &&
        saved.top === view.top && saved.left === view.left ? current : { ...current, view };
    });
  }, [editorSession, patchTab]);

  const activateTab = useCallback((tab: EditorTab, line?: number, column?: number) => {
    recordEditorView();
    editorJump.current = line && line > 0 ? { id: tab.id, line, column } : null;
    if (editorSession.current.activeId === tab.id) {
      if (line && tab.status !== 'pending') {
        editorJump.current = null;
        jumpToLine(line, column);
      }
      return;
    }
    updateSession(previous => ({ ...previous, activeId: tab.id }));
  }, [editorSession, jumpToLine, recordEditorView, updateSession]);

  const showNewTab = useCallback((tab: EditorTab) => {
    recordEditorView();
    editorJump.current = null;
    updateSession(previous => appendEditorTab(previous, tab));
  }, [recordEditorView, updateSession]);

  const readEditorDisk = useCallback(async (path: string) => {
    const workspace = projectRef.current;
    const workspaceVersion = projectRequest.current;
    if (workspace?.writable && projectContains(workspace, path)) {
      const { content: text, ...document } = await openProjectDocument(workspace, path);
      const access: EditorAccess = { type: 'project', document, workspaceVersion };
      return { path: document.path, text, access };
    }
    const text = await readProjectFile(path);
    if (text === null) throw new Error('The file could not be read.');
    return { path, text, access: null };
  }, []);

  const rememberEditorFile = useCallback((path: string) => {
    addRecentFile(path);
    setRecentFiles(getRecentFiles());
  }, []);

  useEffect(() => {
    if (!sessionReady || !projectReady || activeTab.status !== 'pending' || !activeTab.path) return;
    let cancelled = false;
    const id = activeTab.id;
    const version = projectRequest.current;
    void readEditorDisk(activeTab.path).then(disk => {
      if (cancelled || version !== projectRequest.current) return;
      patchTab(id, tab => mergeEditorDisk({ ...tab, path: disk.path }, disk.text, disk.access ?? tab.access));
      rememberEditorFile(disk.path);
    }).catch(() => {
      if (!cancelled && version === projectRequest.current) {
        patchTab(id, tab => ({ ...tab, status: 'unavailable', access: null }));
      }
    });
    return () => { cancelled = true; };
  }, [activeTab.id, activeTab.path, activeTab.status, patchTab, project, projectReady, readEditorDisk, rememberEditorFile, sessionReady]);

  const confirmFileChange = useRef(false);
  const confirmDiscard = useCallback(async (tab: EditorTab, title: string) => {
    if (!editorTabIsDirty(tab)) return true;
    if (confirmFileChange.current) return false;
    confirmFileChange.current = true;
    try {
      return await confirm({
        title,
        message: `${tab.name} has unsaved changes.`,
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'destructive',
      });
    } finally {
      confirmFileChange.current = false;
    }
  }, [confirm]);

  const closeEditorTab = useCallback(async (id: string) => {
    const before = editorSession.current.tabs.find(tab => tab.id === id);
    if (!before || savingDocument.current === id || reloadingDocument.current === id) return;
    if (!await confirmDiscard(before, 'Close this tab?')) return;
    recordEditorView();
    updateSession(previous => {
      const index = previous.tabs.findIndex(tab => tab.id === id);
      if (index < 0 || previous.tabs[index].text !== before.text || savingDocument.current === id ||
        reloadingDocument.current === id) return previous;
      const tabs = previous.tabs.filter(tab => tab.id !== id);
      if (!tabs.length) tabs.push(makeEditorTab());
      return { tabs, activeId: previous.activeId === id ? tabs[Math.min(index, tabs.length - 1)].id : previous.activeId };
    });
  }, [confirmDiscard, editorSession, recordEditorView, updateSession]);

  const openEditorPath = useCallback(async (path: string, line?: number, column?: number, reload = false) => {
    if (!sessionReady) return;
    if (savingDestination.current && sameProjectPath(savingDestination.current, path)) {
      throw new Error('Wait for this file to finish saving before opening it.');
    }
    const existing = editorSession.current.tabs.find(tab => tab.path && sameProjectPath(tab.path, path));
    if (!existing) {
      const tab = makeEditorTab(path.split(/[\\/]/).pop() || path, '', path);
      showNewTab(tab);
      if (line && line > 0) editorJump.current = { id: tab.id, line, column };
      return;
    }
    activateTab(existing, reload ? undefined : line, column);
    if (!reload || existing.status === 'pending' || savingDocument.current === existing.id || reloadingDocument.current) return;
    reloadingDocument.current = existing.id;
    try {
      if (!await confirmDiscard(existing, 'Reload from disk?')) return;
      const version = projectRequest.current;
      const disk = await readEditorDisk(path);
      if (version !== projectRequest.current) throw new Error('The project changed while reloading. Try again.');
      patchTab(existing.id, tab => tab.text !== existing.text || tab.base !== existing.base ? tab : {
        ...tab, text: disk.text, base: disk.text, path: disk.path, access: disk.access ?? tab.access, status: 'ready',
      });
      if (line && editorSession.current.activeId === existing.id) jumpToLine(line, column);
    } finally {
      reloadingDocument.current = null;
    }
  }, [activateTab, confirmDiscard, editorSession, jumpToLine, patchTab, readEditorDisk, sessionReady, showNewTab]);

  const handleOpenFile = useCallback(async () => {
    if (!sessionReady || openingDialog.current) return;
    openingDialog.current = true;
    try {
      const result = await openFileDialog();
      if (!result) return;
      if (savingDestination.current && sameProjectPath(savingDestination.current, result.path)) {
        reportEditorError('Wait for this file to finish saving before opening it.');
        return;
      }
      const existing = editorSession.current.tabs.find(tab => tab.path && sameProjectPath(tab.path, result.path));
      const access: EditorAccess = { type: 'file' };
      if (existing) {
        if (savingDocument.current !== existing.id && reloadingDocument.current !== existing.id &&
          (!existing.access || existing.access.type === 'file')) {
          patchTab(existing.id, tab => mergeEditorDisk({ ...tab, path: result.path }, result.content, access));
        }
        activateTab(existing);
      } else {
        const tab = makeEditorTab(result.path.split(/[\\/]/).pop() || result.path, '', result.path);
        showNewTab(mergeEditorDisk(tab, result.content, access));
      }
      rememberEditorFile(result.path);
    } finally {
      openingDialog.current = false;
    }
  }, [activateTab, editorSession, patchTab, rememberEditorFile, sessionReady, showNewTab]);

  const saveEditorTab = useCallback(async (saveAs: boolean) => {
    const before = editorSession.current.tabs.find(tab => tab.id === editorSession.current.activeId);
    if (!sessionReady || !before || before.status === 'pending' ||
      savingDocument.current || reloadingDocument.current === before.id) return;
    if (before.status === 'unavailable' && !editorTabIsDirty(before)) return;
    if (!saveAs && before.status !== 'ready') {
      reportEditorError('Use Save As to keep your draft or reload the file from disk.');
      return;
    }
    savingDocument.current = before.id;
    try {
      const workspace = projectRef.current;
      let access = before.access;
      let path = before.path;
      if (!saveAs && path && workspace?.writable && projectContains(workspace, path)) {
        if (access?.type !== 'project' || access.workspaceVersion !== projectRequest.current) {
          const disk = await readEditorDisk(path);
          if (disk.text !== before.base) {
            patchTab(before.id, tab => ({ ...tab, status: 'conflict', access: null }));
            return;
          }
          access = disk.access;
        }
        if (access?.type !== 'project' || access.workspaceVersion !== projectRequest.current) {
          throw new Error('The project changed before the file was saved. Try again.');
        }
        const revision = await saveProjectDocument(access.document, before.text);
        access = { ...access, document: { ...access.document, revision } };
      } else if (!saveAs && path && access?.type === 'file') {
        if (await readProjectFile(path) !== before.base) {
          patchTab(before.id, tab => ({ ...tab, status: 'conflict', access: null }));
          return;
        }
        if (!await saveFile(path, before.text)) return;
      } else {
        const differentFile = before.status === 'conflict' || before.status === 'unavailable';
        path = await saveFileDialog(before.text, differentFile ? 'recovered-' + before.name : path || before.name, destination => {
          if (differentFile && before.path && sameProjectPath(destination, before.path)) {
            reportEditorError('Choose a different file to preserve the version on disk.');
            return false;
          }
          if (editorSession.current.tabs.some(tab => tab.id !== before.id && tab.path && sameProjectPath(tab.path, destination))) {
            reportEditorError('That file is open in another editor tab. Choose a different file.');
            return false;
          }
          savingDestination.current = destination;
          return true;
        });
        if (!path) return;
        access = { type: 'file' };
        rememberEditorFile(path);
      }
      const savedPath = path;
      patchTab(before.id, tab => ({
        ...tab, path: savedPath, name: savedPath?.split(/[\\/]/).pop() || tab.name,
        base: before.text, status: 'ready', access, welcome: false,
      }));
      if (savedPath && projectRef.current && projectContains(projectRef.current, savedPath)) {
        setGitRevision(value => value + 1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be saved.';
      if (/changed outside DEX|editor revision is stale/i.test(message)) {
        patchTab(before.id, tab => ({ ...tab, status: 'conflict', access: null }));
      }
      reportEditorError(message);
    } finally {
      savingDocument.current = null;
      savingDestination.current = null;
    }
  }, [editorSession, patchTab, readEditorDisk, rememberEditorFile, sessionReady]);

  const handleSaveFile = useCallback(() => { void saveEditorTab(false); }, [saveEditorTab]);
  const handleSaveAs = useCallback(() => { void saveEditorTab(true); }, [saveEditorTab]);
  const handleNewFile = useCallback(() => { if (sessionReady) showNewTab(makeEditorTab()); }, [sessionReady, showNewTab]);
  const openGeneratedTab = useCallback((name: string, text: string) => {
    if (sessionReady) showNewTab({ ...makeEditorTab(name, text), base: '' });
  }, [sessionReady, showNewTab]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (activeTab.status === 'pending') {
      measureGutter(editor);
      return;
    }
    const view = editorSession.current.tabs.find(tab => tab.id === activeTab.id)?.view;
    editor.setSelectionRange(view?.start ?? 0, view?.end ?? 0);
    editor.scrollTop = view?.top ?? 0;
    editor.scrollLeft = view?.left ?? 0;
    measureGutter(editor);
    const precedingText = editor.value.slice(0, editor.selectionStart);
    setCursorPos({ line: precedingText.split('\n').length, col: editor.selectionStart - precedingText.lastIndexOf('\n') });
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    setSelStats(selected ? { chars: selected.length, lines: selected.split('\n').length } : null);
    if (highlightRef.current) {
      highlightRef.current.scrollTop = editor.scrollTop;
      highlightRef.current.scrollLeft = editor.scrollLeft;
    }
    const jump = editorJump.current;
    if (jump?.id === activeTab.id) {
      editorJump.current = null;
      if (activeTab.status === 'ready') jumpToLine(jump.line, jump.column);
    }
  }, [activeTab.id, activeTab.status, editorSession, jumpToLine, langMode, measureGutter]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => {
      if (editorRef.current === editor) measureGutter(editor);
    });
    observer.observe(editor);
    return () => observer.disconnect();
  }, [activeTab.id, langMode, measureGutter]);

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
    const editor = editorRef.current;
    if (!editor) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = editor.scrollTop;
      highlightRef.current.scrollLeft = editor.scrollLeft;
    }
    measureGutter(editor);
    recordEditorView();
  }, [measureGutter, recordEditorView]);

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
        openGeneratedTab('generated.dex', generated);
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
  }, [openGeneratedTab, plainText, plainMode, setOutputCollapsedPersist]);

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
      const scope = editorShellRef.current;
      if (!scope?.contains(e.target instanceof Node ? e.target : document.activeElement)) return;
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
        toggleTerminal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [code, fileName, runCode, showFind, showGoToLine, showQuickOpen, handleSaveFile, handleSaveAs, handleOpenFile, handleNewFile, toggleSidebar, toggleFullscreen, toggleTerminal, fullscreen]);

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
  const handleGoToLine = useCallback(() => {
    const n = parseInt(goToLineInput.trim(), 10);
    if (!Number.isFinite(n) || n < 1) return;
    jumpToLine(n);
    setShowGoToLine(false);
    setGoToLineInput('');
  }, [goToLineInput, jumpToLine]);

  // --- Project awareness: open a folder, browse + search its source files ---
  const [showProject, setShowProject] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceSearchNote, setWorkspaceSearchNote] = useState('');
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspaceHits, setWorkspaceHits] = useState<WorkspaceHit[]>([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceSearched, setWorkspaceSearched] = useState(false);
  const projectSearch = useRef<AbortController | null>(null);
  // Live verb for the project-wide code search status.
  const searchPhrase = useWorkingPhrase(workspaceBusy, 'search');

  // Restore the last-opened project folder on mount.
  useEffect(() => {
    const request = ++projectRequest.current;
    restoreProject().then(proj => {
      if (request === projectRequest.current) setProject(proj);
    }).catch(error => {
      if (request === projectRequest.current) setWorkspaceError(String(error.message ?? error));
    }).finally(() => {
      if (request === projectRequest.current) setProjectReady(true);
    });
    return () => { projectRequest.current += 1; };
  }, []);

  const loadEditorFromPath = useCallback((path: string, line?: number, reload = false) => {
    void openEditorPath(path, line, undefined, reload).catch(error => {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: error.message } }));
    });
  }, [openEditorPath]);

  const handleOpenRecent = useCallback((path: string) => {
    setShowRecentFiles(false);
    loadEditorFromPath(path);
  }, [loadEditorFromPath]);
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
    if (projectBusy.current) return;
    projectBusy.current = true;
    setWorkspaceError('');
    try {
      const proj = await pickProjectFolder();
      if (!proj) return;
      projectRequest.current += 1;
      projectSearch.current?.abort();
      setProject(proj);
      setProjectReady(true);
      setWorkspaceHits([]);
      setWorkspaceQuery('');
      setWorkspaceBusy(false);
      setWorkspaceSearched(false);
      setWorkspaceSearchNote('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'The project could not be opened.');
    } finally {
      projectBusy.current = false;
    }
  }, []);

  const closeProject = useCallback(async () => {
    if (!project || projectBusy.current) return;
    projectBusy.current = true;
    setWorkspaceError('');
    try {
      await closeProjectFolder(project);
      projectRequest.current += 1;
      projectSearch.current?.abort();
      setProject(null);
      setProjectReady(true);
      setWorkspaceHits([]);
      setWorkspaceQuery('');
      setWorkspaceBusy(false);
      setWorkspaceSearched(false);
      setWorkspaceSearchNote('');
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'The project could not be closed.');
    } finally {
      projectBusy.current = false;
    }
  }, [project]);

  const refreshProject = useCallback(async () => {
    if (!project || projectBusy.current) return;
    projectBusy.current = true;
    try {
      const next = await loadProject(project.root);
      if (next) setProject(next);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'The project could not be refreshed.');
    } finally {
      projectBusy.current = false;
    }
  }, [project]);

  const searchWorkspace = useCallback(async (query: string) => {
    projectSearch.current?.abort();
    setWorkspaceHits([]);
    setWorkspaceSearched(false);
    setWorkspaceSearchNote('');
    setWorkspaceError('');
    const q = query.trim();
    if (!project || !q) { setWorkspaceBusy(false); return; }
    const request = new AbortController();
    projectSearch.current = request;
    setWorkspaceBusy(true);
    try {
      const results = await searchWorkspaceFiles(project, q, request.signal);
      if (!request.signal.aborted) {
        setWorkspaceHits(results.hits);
        setWorkspaceSearched(true);
        setWorkspaceSearchNote([
          results.limited ? 'Search limit reached.' : '',
          results.skipped ? `${results.skipped} entries skipped.` : '',
        ].filter(Boolean).join(' '));
      }
    } catch (error) {
      if (!request.signal.aborted) setWorkspaceError(error instanceof Error ? error.message : 'Project search failed.');
    } finally {
      if (projectSearch.current === request && !request.signal.aborted) setWorkspaceBusy(false);
    }
  }, [project]);
  useEffect(() => () => projectSearch.current?.abort(), []);

  // Cross-file symbol index for go-to-definition; rebuilt when the project changes.
  const [symbolIndex, setSymbolIndex] = useState<Map<string, ProjectSymbol[]>>(new Map());
  useEffect(() => {
    if (!project) { setSymbolIndex(new Map()); return; }
    const request = new AbortController();
    setSymbolIndex(new Map());
    buildSymbolIndex(project, 200, request.signal).then(idx => {
      if (!request.signal.aborted) setSymbolIndex(idx);
    });
    return () => request.abort();
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
    void searchWorkspace(w);
  }, [project, searchWorkspace]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.currentTarget.readOnly) return;
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

  const lineCount = useMemo(() => {
    let count = 1;
    for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1)) count++;
    return count;
  }, [code]);
  const gutterWidth = Math.max(40, 14 + String(lineCount).length * 7);
  const useHighlight = code.length <= HIGHLIGHT_CHARACTER_LIMIT && lineCount <= HIGHLIGHT_LINE_LIMIT;
  const highlighted = useMemo(() => useHighlight ? highlightDexScript(code) : '', [code, useHighlight]);
  useLayoutEffect(() => {
    if (editorRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop;
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, [useHighlight, langMode]);

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
    recordEditorView();
  }, [code, recordEditorView]);

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
    <div ref={editorShellRef} style={{ ...S.container, gridTemplateColumns: sidebarCollapsed ? '44px minmax(0, 1fr)' : '44px 220px minmax(0, 1fr)', ...(fullscreen ? { height: '100vh', width: '100vw' } : null) }}>
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
          onClick={toggleTerminal}
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
                  <button onClick={openFolder} title="Open a different folder" aria-label="Open a different folder" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}><DexIcon name="folder-open" size={11} /></button>
                  <button onClick={refreshProject} aria-label="Refresh project files" title="Refresh project files" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}><DexIcon name="refresh" size={11} /></button>
                  <button onClick={closeProject} title="Close project" aria-label="Close project" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2 }}><DexIcon name="close" size={11} /></button>
                </div>
                {currentFilePath && projectContains(project, currentFilePath) && (
                  <button type="button" style={S.fileActionBtn} onClick={() => loadEditorFromPath(currentFilePath, undefined, true)}>
                    Reload current file
                  </button>
                )}
                {project.writable === false && <div style={{ padding: '0 8px', fontSize: 11 }}>
                  <button type="button" onClick={openFolder}>Select folder to enable editing</button>
                </div>}
                {project.limited && <div style={{ padding: '0 8px', fontSize: 11 }}>Project listing limit reached.</div>}
                {!!project.unreadable && <div style={{ padding: '0 8px', fontSize: 11 }}>{project.unreadable} entries could not be listed.</div>}
                <input
                  value={workspaceQuery}
                  onChange={e => {
                    projectSearch.current?.abort();
                    setWorkspaceQuery(e.target.value);
                    setWorkspaceHits([]);
                    setWorkspaceBusy(false);
                    setWorkspaceSearched(false);
                    setWorkspaceSearchNote('');
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') void searchWorkspace(workspaceQuery); }}
                  placeholder="Search in project…"
                  aria-label="Search in project"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 8px', fontSize: 11, background: 'var(--color-bg-inset, rgba(255,255,255,0.04))', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', outline: 'none' }}
                />
                {workspaceBusy && <div style={{ fontSize: 10, opacity: 0.5, padding: '2px var(--space-2)' }}>{searchPhrase}…</div>}
                {workspaceSearchNote && <div role="status" style={{ padding: '0 8px', fontSize: 11 }}>{workspaceSearchNote}</div>}
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
                ) : workspaceSearched ? (
                  <div role="status" style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-2)' }}>No project matches</div>
                ) : (
                  <ProjectFileList key={`${project.root}:${project.files.length}`} files={project.files}
                    active={currentFilePath} onOpen={loadEditorFromPath} />
                )}
              </div>
            )
          )}
          {!!workspaceError && <div role="alert" style={{ fontSize: 11, padding: '4px 8px' }}>{workspaceError}</div>}
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
                  onClick={() => openGeneratedTab(t.fileName, t.code)}
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
              value={fileName}
              readOnly={!sessionReady || !!currentFilePath}
              onChange={e => {
                const name = e.target.value;
                patchTab(activeTab.id, tab => ({ ...tab, name, welcome: false }));
              }}
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

        {gitOpen && <ProjectGit
          key={project?.root ?? ''}
          project={project}
          revision={gitRevision}
          onClose={() => setGitOpen(false)}
          onOpenFile={loadEditorFromPath}
        />}

        {/* Editor + Output */}
        <div style={{ ...S.editorLayout, gridTemplateColumns: outputCollapsed ? 'minmax(0, 1fr)' : 'minmax(0, 3fr) minmax(0, 2fr)' }}>
          {/* Code Editor */}
          <div style={S.editorPane}>
            <EditorTabs session={session} panelId={editorPanelId} onSelect={activateTab} onClose={closeEditorTab} onNew={handleNewFile} />
            <div role="tabpanel" id={editorPanelId} aria-labelledby={editorTabElementId(editorPanelId, activeTab.id)}
              style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            {(!sessionReady || activeTab.status === 'pending') && (
              <div role="status" className="dex-editor-recovery-status">{sessionReady ? 'Opening file…' : 'Restoring editor tabs…'}</div>
            )}
            {(activeTab.status === 'conflict' || activeTab.status === 'unavailable') && (
              <div className="dex-editor-recovery-status">
                <span role="status">{activeTab.status === 'conflict' ? 'The file has changed on disk. Your draft is still open.' : 'This file could not be read from disk.'}</span>
                {currentFilePath && <button type="button" onClick={() => loadEditorFromPath(currentFilePath, undefined, true)}>Reload from disk</button>}
                {isModified && <button type="button" onClick={handleSaveAs}>Save draft as…</button>}
              </div>
            )}
            {syntax.status !== 'unsupported' && showProblems && (
              <section id={problemsId} aria-label="Syntax diagnostics" className="dex-editor-problems">
                {syntax.status === 'checking' && <div role="status">Checking syntax…</div>}
                {syntax.status === 'error' && <div role="status">{syntax.error}</div>}
                {syntax.status === 'ready' && (syntax.problems.length ? (
                  <ul>
                    {syntax.problems.map(problem => (
                      <li key={`${problem.line}:${problem.column}:${problem.code}`}>
                        <button type="button" onClick={() => jumpToLine(problem.line, problem.column)}>
                          <span className="dex-editor-problem-location">{problem.line}:{problem.column}</span>
                          <span>{problem.message}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <div role="status">No syntax errors.</div>)}
              </section>
            )}
            <div style={S.paneHeader}>
              <span>Editor</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {fileName.includes('.') ? '.' + fileName.split('.').pop() : ''}
                </span>
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
                <LineNumbers count={lineCount} top={gutter.top} height={gutter.height} width={gutterWidth} />
                {/* Syntax highlight overlay */}
                {useHighlight && <pre
                  ref={highlightRef}
                  style={{...S.highlightOverlay, fontSize, left: gutterWidth}}
                  dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
                  aria-hidden="true"
                />}
                {/* Actual textarea */}
                <textarea
                  key={activeTab.id}
                  ref={editorRef}
                  data-document-id={activeTab.id}
                  value={code}
                  readOnly={editorReadOnly}
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
                  style={{...S.editor, fontSize, left: gutterWidth, color: useHighlight ? 'transparent' : 'var(--color-text-primary)'}}
                  aria-label="DexScript code editor"
                />
              </div>
            )}
            </div>
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
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Draft recovery stores working copies on this device"
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: draftState === 'storing'
                  ? 'var(--color-text-tertiary)'
                  : 'var(--color-accent, #4A9EFF)',
              }}
            />
            {draftState === 'error' ? 'Draft recovery unavailable' :
              draftState === 'storing' ? 'Storing drafts…' :
              isModified ? 'Unsaved edits' :
              currentFilePath && activeTab.status === 'ready' ? 'Saved' : 'Draft recovery'}
          </span>
          <button type="button" onClick={toggleProjectTasks} aria-pressed={tasksOpen} className="dex-project-tasks-toggle">
            Tasks
          </button>
          <button type="button" onClick={() => setGitOpen(value => !value)} aria-pressed={gitOpen} className="dex-project-tasks-toggle">
            Git
          </button>
          {syntax.status !== 'unsupported' && <button type="button" className="dex-project-tasks-toggle"
            onClick={() => setShowProblems(value => !value)} aria-expanded={showProblems} aria-controls={problemsId}>
            Problems{syntax.status === 'ready' ? ` (${syntax.problems.length})` : ''}
          </button>}
          <button
            type="button"
            onClick={toggleTerminal}
            title="Toggle terminal (Ctrl+`)"
            aria-label="Toggle terminal"
            aria-pressed={terminalOpen}
            style={{
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

        {(terminalState !== 'closed' || taskState !== 'closed') && (
          <div hidden={!terminalOpen && !tasksOpen} style={{ ...S.panelDock, display: terminalOpen || tasksOpen ? 'flex' : 'none', height: panelHeight }}>
            {/* Draggable divider — drag up/down to resize the panel */}
            <div
              style={S.panelResizer}
              onMouseDown={handlePanelResizeStart}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize bottom panel"
              title="Drag to resize"
            >
              <div style={S.panelResizerGrip} aria-hidden="true" />
            </div>
            {terminalState !== 'closed' && <div hidden={!terminalOpen} style={{ ...S.panelBody, display: terminalOpen ? 'flex' : 'none' }}>
              <TerminalTabs cwd={project?.root ?? getStoredProjectRoot() ?? undefined}
                visible={terminalOpen} onClose={() => setTerminalState('closed')} />
            </div>}
            {taskState !== 'closed' && <div hidden={!tasksOpen} style={{ ...S.panelBody, display: tasksOpen ? 'flex' : 'none' }}>
              <ProjectTasks root={project?.root ?? null} visible={tasksOpen} dirty={isModified} onOpenLocation={openEditorPath} />
            </div>}
          </div>
        )}
        <ConfirmHost />
      </section>
    </div>
  );

  // Full-screen mode: portal the editor over the whole viewport (above the DEX
  // top bar + launcher) so it truly fills the screen — the window-frame `contain`
  // would otherwise trap a fixed overlay inside the app window.
  return fullscreen
    ? createPortal(
        <div {...appearance} style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'var(--color-bg-base)' }}>{shell}</div>,
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
    lineHeight: `${EDITOR_LINE_HEIGHT}px`,
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
    lineHeight: `${EDITOR_LINE_HEIGHT}px`,
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
    lineHeight: `${EDITOR_LINE_HEIGHT}px`,
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
