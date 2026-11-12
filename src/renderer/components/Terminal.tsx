// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Platform -- Terminal
// A real terminal: xterm.js on top of a native pseudoterminal (ConPTY on
// Windows, see src-tauri/src/terminal.rs).
//
//   - `pty:spawn` with the measured cols/rows; `pty:data` streams output,
//     `pty:exit` reports the exit code.
//   - Every keystroke goes to the shell as-is (`pty:write`), so the shell's own
//     line editing, history (PSReadLine / readline), completion, colours and
//     full-screen programs work.
//   - The panel is measured with the fit addon on every size change and the
//     pseudoconsole is resized to match (`pty:resize`).
//   - Copy: Ctrl+C with a selection, Ctrl+Shift+C, or right-click with a
//     selection. Paste: Ctrl+V, Ctrl+Shift+V, or right-click without one.
//   - `dex <cmd>` lines are DEX's own command layer: when the typed line is
//     known exactly (shared/term/lineTracker) it is discarded from the shell
//     and run locally; the result shows in a strip above the terminal so the
//     pseudoconsole's screen is never written behind the shell's back.
// ===========================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { APP_DEFINITIONS } from '../store/runningApps';
import { buildDexCommands, matchTerminalCommand, resolveShortcut } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { describeCapabilities } from '../uki/permissions';
import { createLineTracker, discardLineSequence, isDexCommandLine, trackInput } from '../../shared/term/lineTracker';
import { sendToNotes } from '../services/sendTo';

// ---------------------------------------------------------------------------
// IPC bridge accessor (looked up per call: never capture window.dex at module
// scope, it is not there yet in the packaged app when this module loads).
// ---------------------------------------------------------------------------
interface NativeBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  /** The Tauri bridge returns nothing (unsubscribe with `off`); test mocks may return an unsubscribe fn. */
  on?: (channel: string, listener: (...args: unknown[]) => void) => unknown;
  off?: (channel: string, listener: (...args: unknown[]) => void) => void;
}

const bridge = (): NativeBridge | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { dex?: NativeBridge };
  return w.dex && typeof w.dex.invoke === 'function' ? w.dex : null;
};

/** Subscribe to a native push channel; returns a working unsubscribe either way. */
function subscribe(b: NativeBridge, channel: string, fn: (...args: unknown[]) => void): () => void {
  const ret = b.on?.(channel, fn);
  return () => {
    if (typeof ret === 'function') (ret as () => void)();
    else b.off?.(channel, fn);
  };
}

const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export interface TerminalProps {
  /** Auto-spawn a session on mount. Default true. */
  autoSpawn?: boolean;
  /** Working directory for the shell. */
  cwd?: string;
  /** Optional shell override (e.g. 'pwsh.exe', 'cmd.exe'); validated natively. */
  shell?: string;
  /** Called when the panel asks to close. */
  onClose?: () => void;
  /** Visible height in px. Defaults to flex-fill. */
  height?: number | string;
  /** Reports the last command entered (or null) so TerminalTabs can title the tab. */
  onRunningCommand?: (cmd: string | null) => void;
  /** Text size in px (default 13). Changing it refits the terminal; the session keeps running. */
  fontSize?: number;
}

// ---------------------------------------------------------------------------
// Saved snippets (persisted). The shell keeps its own command history.
// ---------------------------------------------------------------------------
const SNIPPETS_KEY = 'dex.terminal.snippets.v1';
interface Snippet { id: string; name: string; command: string; }

function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(SNIPPETS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is Snippet =>
      !!x && typeof x === 'object'
      && typeof (x as Snippet).id === 'string'
      && typeof (x as Snippet).name === 'string'
      && typeof (x as Snippet).command === 'string');
  } catch {
    return [];
  }
}

function saveSnippets(list: Snippet[]): void {
  try { localStorage.setItem(SNIPPETS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

// A shell that dies almost immediately is a failed start (missing binary, bad
// cwd), not a normal exit: those get a bounded, backed-off retry.
const MAX_SPAWN_RETRIES = 3;
const FAST_EXIT_MS = 1500;

/** Graphite terminal palette; DEX blue cursor and selection. Literal colours:
 *  xterm.js paints to its own renderer and cannot read CSS variables. */
const THEME: ITheme = {
  background: '#0e0f11',
  foreground: '#d4d6da',
  cursor: '#0a84ff',
  cursorAccent: '#0e0f11',
  selectionBackground: 'rgba(10,132,255,0.35)',
  black: '#1c1e22', red: '#ff6b6b', green: '#5fd38a', yellow: '#e5c07b',
  blue: '#4aa3ff', magenta: '#c792ea', cyan: '#56c8d8', white: '#d4d6da',
  brightBlack: '#6b7078', brightRed: '#ff8a8a', brightGreen: '#7ee2a2', brightYellow: '#f0d38f',
  brightBlue: '#70b8ff', brightMagenta: '#d7a8f2', brightCyan: '#7fd8e4', brightWhite: '#ffffff',
};

const toolbarBtn = (active = false): React.CSSProperties => ({
  background: 'transparent',
  color: active ? 'var(--color-accent, #0a84ff)' : 'var(--color-text-tertiary, #8e8e93)',
  border: 'none', fontSize: 11, cursor: 'pointer', padding: '2px 6px', fontWeight: 500,
  fontFamily: 'inherit', borderRadius: 4,
});

type Status = 'starting' | 'running' | 'exited' | 'unavailable' | 'no-bridge';

export const Terminal: React.FC<TerminalProps> = ({ autoSpawn = true, cwd, shell, onClose, height, onRunningCommand, fontSize = 13 }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const trackerRef = useRef(createLineTracker());
  const startRef = useRef<(() => void) | null>(null);
  const retriesRef = useRef(0);
  const onRunningRef = useRef(onRunningCommand);
  onRunningRef.current = onRunningCommand;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [error, setError] = useState<string | null>(null);
  const [shellName, setShellName] = useState<string>('');
  const [sessionCwd, setSessionCwd] = useState<string>('');
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [dexResult, setDexResult] = useState<{ cmd: string; text: string; ok: boolean } | null>(null);
  const [find, setFind] = useState<{ q: string; hit: boolean | null } | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [showSnippets, setShowSnippets] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>(() => loadSnippets());
  const [snippetName, setSnippetName] = useState('');
  const [snippetCmd, setSnippetCmd] = useState('');

  const dexCommands = useMemo(() => buildDexCommands(APP_DEFINITIONS), []);

  const write = useCallback((data: string) => {
    const b = bridge();
    const id = sessionRef.current;
    if (!b || !id) return;
    b.invoke('pty:write', { sessionId: id, data }).catch(() => { /* session gone */ });
  }, []);

  // -------------------------------------------------------------------------
  // DEX command layer (`dex list`, `dex perms`, `dex open notes`, …)
  // -------------------------------------------------------------------------
  const runDexCommand = useCallback((raw: string) => {
    const value = raw.trim();
    const rest = value.replace(/^dex\s*/i, '').trim();
    const show = (text: string, ok = true) => setDexResult({ cmd: value, text, ok });

    if (rest === '' || rest === 'help' || rest === 'list') {
      const rows = dexCommands.map((c) => {
        const sc = resolveShortcut(c, isMac);
        return `${c.terminal.padEnd(14)}${(sc || '').padEnd(18)}${c.label}`;
      });
      show(`${'name'.padEnd(14)}${'shortcut'.padEnd(18)}description\n${rows.join('\n')}`);
      return;
    }
    if (rest === 'perms' || rest === 'permissions' || rest === 'access') {
      void describeCapabilities().then((caps) => {
        const rows = caps.map((c) => `${c.status === 'granted' ? '●' : c.status === 'hard-denied' ? '✕' : '○'} ${c.label.padEnd(20)} ${c.status}`);
        show(`UKI access right now (● granted  ○ not granted  ✕ blocked by this build)\n${rows.join('\n')}\nChange in Settings › Permissions › UKI Assistant Access.`);
      }).catch(() => show('Could not read UKI permissions.', false));
      return;
    }
    const m = matchTerminalCommand(dexCommands, `dex ${rest}`);
    if (!m) {
      show(`Unknown DEX command '${rest.split(/\s+/)[0]}'. Run 'dex list' for the list.`, false);
      return;
    }
    try {
      executeDexCommand(m.command, m.args);
      show(m.command.appId ? `Opening ${m.command.label.replace(/^Open /, '')}` : `Ran ${m.command.label}`);
    } catch {
      show(`Could not run ${m.command.id}.`, false);
    }
  }, [dexCommands]);
  const runDexRef = useRef(runDexCommand);
  runDexRef.current = runDexCommand;

  // -------------------------------------------------------------------------
  // xterm.js instance (one per mount)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let term: XTerm;
    try {
      term = new XTerm({
        fontFamily: '"Cascadia Mono", "Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace',
        fontSize: fontSizeRef.current,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 10000,
        allowProposedApi: true,
        theme: THEME,
        // ConPTY already translates line endings.
        convertEol: false,
        windowsPty: isWindows ? { backend: 'conpty' } : undefined,
      });
      const fit = new FitAddon();
      const search = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(search);
      term.loadAddon(new WebLinksAddon((_e, uri) => {
        // Open links with the OS default browser; never inside the shell webview.
        const b = bridge();
        if (b) b.invoke('shell:openExternal', uri).catch(() => { /* not available */ });
      }));
      term.open(host);
      fitRef.current = fit;
      searchRef.current = search;
      try { fit.fit(); } catch { /* not laid out yet */ }
    } catch (err) {
      // Headless/test environments without a layout engine.
      setError(`Terminal renderer unavailable: ${String(err)}`);
      return;
    }
    termRef.current = term;

    // Copy / paste / find shortcuts, Windows Terminal conventions.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'c' && (e.shiftKey || term.hasSelection())) {
        if (term.hasSelection()) {
          void navigator.clipboard?.writeText(term.getSelection()).catch(() => { /* denied */ });
          term.clearSelection();
        }
        e.preventDefault();
        return false;
      }
      // Let the browser's paste event reach xterm's textarea (handles bracketed paste).
      if (ctrl && k === 'v') return false;
      if (ctrl && k === 'f') {
        e.preventDefault();
        setFind((f) => f ?? { q: '', hit: null });
        setTimeout(() => findInputRef.current?.focus(), 0);
        return false;
      }
      return true;
    });

    const dataSub = term.onData((data) => {
      const res = trackInput(trackerRef.current, data);
      if (res.kind === 'enter') {
        if (isDexCommandLine(res.line)) {
          // Discard the typed line in the shell and handle it here.
          write(discardLineSequence(isWindows));
          runDexRef.current(res.line as string);
          return;
        }
        // A command for the shell replaces any earlier DEX command result.
        setDexResult(null);
        const cmd = res.line?.trim() || null;
        if (cmd) { try { onRunningRef.current?.(cmd); } catch { /* host detached */ } }
      }
      write(data);
    });
    const resizeSub = term.onResize(({ cols, rows }) => {
      const b = bridge();
      const id = sessionRef.current;
      if (b && id) b.invoke('pty:resize', { sessionId: id, cols, rows }).catch(() => { /* gone */ });
    });

    // Refit on every size change of the panel (window resize, split drag, tab show).
    let raf = 0;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (!host.offsetWidth || !host.offsetHeight) return; // hidden tab
          try { fitRef.current?.fit(); } catch { /* disposed */ }
        });
      })
      : null;
    ro?.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      term.dispose();
    };
  }, [write]);

  // Text size: applied to the live terminal, then refit so the shell learns
  // its new column/row count (xterm's onResize forwards it to the PTY).
  useEffect(() => {
    const term = termRef.current;
    if (!term || term.options.fontSize === fontSize) return;
    term.options.fontSize = fontSize;
    try { fitRef.current?.fit(); } catch { /* hidden or disposed */ }
  }, [fontSize]);

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    const b = bridge();
    if (!b) {
      setStatus('no-bridge');
      setError('The terminal needs the DEX desktop app.');
      return;
    }
    let mounted = true;
    let activeId: string | null = null;
    let spawnedAt = 0;
    let backoff: ReturnType<typeof setTimeout> | null = null;

    const failed = (msg: string) => {
      if (!mounted) return;
      setError(msg);
      if (retriesRef.current >= MAX_SPAWN_RETRIES) { setStatus('unavailable'); return; }
      retriesRef.current += 1;
      const delay = 400 * 2 ** (retriesRef.current - 1) + Math.floor(Math.random() * 200);
      backoff = setTimeout(() => { if (mounted) start(); }, delay);
    };

    const start = () => {
      if (!mounted) return;
      setStatus('starting');
      setError(null);
      setExitCode(null);
      trackerRef.current = createLineTracker();
      spawnedAt = Date.now();
      const t = termRef.current;
      const cols = t?.cols ?? 80;
      const rows = t?.rows ?? 24;
      b.invoke('pty:spawn', { cwd, shell, cols, rows }).then((res) => {
        const r = (res ?? {}) as { sessionId?: string; error?: string; shell?: string; cwd?: string };
        if (mounted) setSessionCwd(typeof r.cwd === 'string' ? r.cwd : '');
        if (!mounted) return;
        if (r.error) { failed(r.error); return; }
        if (!r.sessionId) { failed('The shell did not start.'); return; }
        activeId = r.sessionId;
        sessionRef.current = r.sessionId;
        setSessionId(r.sessionId);
        setShellName(r.shell ? r.shell.split(/[\\/]/).pop()!.replace(/\.exe$/i, '') : '');
        setStatus('running');
        // The panel may have been measured after spawn; sync the pseudoconsole.
        const tt = termRef.current;
        if (tt && (tt.cols !== cols || tt.rows !== rows)) {
          b.invoke('pty:resize', { sessionId: r.sessionId, cols: tt.cols, rows: tt.rows }).catch(() => {});
        }
        tt?.focus();
      }).catch((err) => failed(String(err)));
    };
    startRef.current = start;

    const onData = (...args: unknown[]) => {
      const p = args[args.length - 1] as { sessionId?: string; data?: string };
      if (p?.sessionId === activeId && typeof p.data === 'string') termRef.current?.write(p.data);
    };
    const onExit = (...args: unknown[]) => {
      const p = args[args.length - 1] as { sessionId?: string; code?: number | null };
      if (!p || p.sessionId !== activeId) return;
      const code = typeof p.code === 'number' ? p.code : -1;
      activeId = null;
      sessionRef.current = null;
      if (!mounted) return;
      setSessionId(null);
      setExitCode(code);
      setStatus('exited');
      try { onRunningRef.current?.(null); } catch { /* host detached */ }
      termRef.current?.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`);
      if (code !== 0 && Date.now() - spawnedAt < FAST_EXIT_MS) failed(`The shell exited right away (code ${code}).`);
      else retriesRef.current = 0;
    };
    const offData = subscribe(b, 'pty:data', onData);
    const offExit = subscribe(b, 'pty:exit', onExit);

    if (autoSpawn) start();

    return () => {
      mounted = false;
      startRef.current = null;
      if (backoff) clearTimeout(backoff);
      offData?.();
      offExit?.();
      if (activeId) b.invoke('pty:kill', { sessionId: activeId }).catch(() => { /* shutting down */ });
      sessionRef.current = null;
    };
  }, [autoSpawn, cwd, shell]);

  const restart = useCallback(() => {
    retriesRef.current = 0;
    const b = bridge();
    const id = sessionRef.current;
    if (b && id) {
      // Kill the current shell; its exit event resets state, then start fresh.
      b.invoke('pty:kill', { sessionId: id }).catch(() => {});
      sessionRef.current = null;
    }
    termRef.current?.reset();
    startRef.current?.();
  }, []);

  // -------------------------------------------------------------------------
  // Toolbar actions
  // -------------------------------------------------------------------------
  const runFind = useCallback((q: string, backwards = false) => {
    const s = searchRef.current;
    if (!s || !q) { setFind((f) => (f ? { ...f, q, hit: null } : f)); return; }
    const hit = backwards ? s.findPrevious(q) : s.findNext(q);
    setFind({ q, hit });
  }, []);

  const closeFind = useCallback(() => {
    searchRef.current?.clearDecorations();
    termRef.current?.clearSelection();
    setFind(null);
    termRef.current?.focus();
  }, []);

  const bufferText = useCallback((): string => {
    const t = termRef.current;
    if (!t) return '';
    if (t.hasSelection()) return t.getSelection();
    const buf = t.buffer.active;
    const out: string[] = [];
    for (let i = 0; i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '');
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out.join('\n');
  }, []);

  const toNotes = useCallback(() => {
    const t = termRef.current;
    const selected = !!t?.hasSelection();
    const text = bufferText();
    if (!text.trim()) { toast('info', 'Nothing to send'); return; }
    void sendToNotes(text, selected ? 'Terminal selection' : 'Terminal output');
  }, [bufferText]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    const t = termRef.current;
    if (!t) return;
    e.preventDefault();
    if (t.hasSelection()) {
      void navigator.clipboard?.writeText(t.getSelection()).catch(() => {});
      t.clearSelection();
    } else {
      void navigator.clipboard?.readText().then((text) => { if (text) t.paste(text); }).catch(() => {
        toast('info', 'Press Ctrl+V to paste');
      });
    }
    t.focus();
  }, []);

  const insertSnippet = useCallback((s: Snippet, run: boolean) => {
    const t = termRef.current;
    if (!t || !sessionRef.current) return;
    // Through xterm so bracketed paste and the line tracker see it as typed text.
    t.paste(s.command);
    if (run) {
      trackInput(trackerRef.current, '\r');
      write('\r');
      try { onRunningRef.current?.(s.command); } catch { /* host detached */ }
    }
    setShowSnippets(false);
    t.focus();
  }, [write]);

  const addSnippet = useCallback(() => {
    const command = snippetCmd.trim();
    if (!command) return;
    const name = snippetName.trim() || command.slice(0, 40);
    setSnippets((prev) => {
      const next = [...prev.filter((s) => s.name !== name), { id: `snip-${Date.now().toString(36)}`, name, command }];
      saveSnippets(next);
      return next;
    });
    setSnippetName('');
    setSnippetCmd('');
  }, [snippetCmd, snippetName]);

  const removeSnippet = useCallback((id: string) => {
    setSnippets((prev) => { const next = prev.filter((s) => s.id !== id); saveSnippets(next); return next; });
  }, []);

  const statusLabel =
    status === 'running' ? (shellName || 'shell')
      : status === 'starting' ? 'starting…'
        : status === 'exited' ? `exited (${exitCode ?? '?'})`
          : status === 'no-bridge' ? 'desktop app required'
            : 'unavailable';

  return (
    <div
      data-testid="dex-terminal"
      data-session-id={sessionId ?? undefined}
      style={{
        display: 'flex', flexDirection: 'column',
        // flex/width so it fills a split pane (a bare flex child shrinks to content).
        height: height ?? '100%', minHeight: 80, flex: 1, minWidth: 0, width: '100%',
        background: THEME.background,
        color: THEME.foreground,
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          height: 26, padding: '0 6px 0 10px', flexShrink: 0,
          background: '#15171a',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: 'var(--color-text-tertiary, #8e8e93)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: status === 'running' ? '#5fd38a' : status === 'starting' ? '#e5c07b' : '#6b7078',
            }}
          />
          <span title={status === 'running' && sessionCwd ? `Started in ${sessionCwd}` : undefined} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLabel}</span>
        </span>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {(status === 'exited' || status === 'unavailable') && (
            <button type="button" onClick={restart} title="Start a new shell" aria-label="Restart terminal" style={toolbarBtn(true)}>Restart</button>
          )}
          <button
            type="button"
            onClick={() => { setFind((f) => (f ? null : { q: '', hit: null })); setTimeout(() => findInputRef.current?.focus(), 0); }}
            title="Find in output (Ctrl+F)" aria-label="Search scrollback" aria-pressed={!!find} style={toolbarBtn(!!find)}
          >Find</button>
          <button type="button" onClick={() => setShowSnippets((o) => !o)} title="Saved commands" aria-label="Saved snippets" aria-pressed={showSnippets} style={toolbarBtn(showSnippets)}>Snippets</button>
          <button type="button" onClick={toNotes} title="Send output (or selection) to Notes" aria-label="Send to Notes" style={toolbarBtn()}>To Notes</button>
          <button
            type="button"
            onClick={() => { termRef.current?.clear(); termRef.current?.focus(); }}
            title="Clear scrollback" aria-label="Clear terminal" style={toolbarBtn()}
          >Clear</button>
          {onClose && (
            <button type="button" onClick={() => onCloseRef.current?.()} title="Close panel" aria-label="Close terminal panel" style={toolbarBtn()}>✕</button>
          )}
        </div>
      </div>

      {(status === 'unavailable' || status === 'no-bridge' || (error && status !== 'running')) && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            padding: '6px 10px', fontSize: 12,
            background: 'rgba(255,107,107,0.08)', borderBottom: '1px solid rgba(255,107,107,0.25)',
            color: '#ffb3b3',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            {status === 'no-bridge' ? error : `The shell couldn't start. ${error ?? ''}`}
          </span>
          {status === 'unavailable' && (
            <button type="button" onClick={restart} style={{ ...toolbarBtn(true), border: '1px solid currentColor' }}>Retry</button>
          )}
        </div>
      )}

      {dexResult && (
        <div
          role="status"
          aria-label="DEX command result"
          style={{
            flexShrink: 1, minHeight: 0, maxHeight: 'min(180px, 40%)', overflow: 'auto',
            padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: '#121418', fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: 12,
            whiteSpace: 'pre', color: dexResult.ok ? THEME.foreground : '#ffb3b3',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#6b7078', marginBottom: 2 }}>
            <span>{dexResult.cmd}</span>
            <button type="button" aria-label="Dismiss" onClick={() => { setDexResult(null); termRef.current?.focus(); }} style={toolbarBtn()}>✕</button>
          </div>
          {dexResult.text}
        </div>
      )}

      <div
        ref={hostRef}
        onContextMenu={onContextMenu}
        style={{ flex: 1, minHeight: 64, padding: '4px 0 0 8px', overflow: 'hidden' }}
      />

      {find && (
        <div
          style={{
            position: 'absolute', top: 30, right: 10, zIndex: 3,
            display: 'flex', alignItems: 'center', gap: 4, padding: 4,
            background: '#1c1e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <input
            ref={findInputRef}
            aria-label="Find in terminal output"
            placeholder="Find"
            value={find.q}
            onChange={(e) => runFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); runFind(find.q, e.shiftKey); }
              else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
            }}
            style={{
              width: 180, height: 22, padding: '0 6px', fontSize: 12, fontFamily: 'inherit',
              background: '#0e0f11', color: THEME.foreground,
              border: `1px solid ${find.hit === false ? 'rgba(255,107,107,0.6)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 4, outline: 'none',
            }}
          />
          <button type="button" aria-label="Previous match" title="Previous (Shift+Enter)" onClick={() => runFind(find.q, true)} style={toolbarBtn()}>↑</button>
          <button type="button" aria-label="Next match" title="Next (Enter)" onClick={() => runFind(find.q)} style={toolbarBtn()}>↓</button>
          <button type="button" aria-label="Close find" title="Close (Esc)" onClick={closeFind} style={toolbarBtn()}>✕</button>
        </div>
      )}

      {showSnippets && (
        <div
          role="dialog"
          aria-label="Saved snippets"
          style={{
            position: 'absolute', top: 30, right: 10, zIndex: 4, width: 320, maxHeight: '70%',
            display: 'flex', flexDirection: 'column',
            background: '#1c1e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)', fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              aria-label="Snippet name" placeholder="Name" value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              style={{ width: 80, height: 22, padding: '0 6px', fontSize: 12, background: '#0e0f11', color: THEME.foreground, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, outline: 'none' }}
            />
            <input
              aria-label="Snippet command" placeholder="Command" value={snippetCmd}
              onChange={(e) => setSnippetCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSnippet(); } }}
              style={{ flex: 1, minWidth: 0, height: 22, padding: '0 6px', fontSize: 12, fontFamily: '"Cascadia Mono", Consolas, monospace', background: '#0e0f11', color: THEME.foreground, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, outline: 'none' }}
            />
            <button type="button" onClick={addSnippet} disabled={!snippetCmd.trim()} style={toolbarBtn(true)}>Save</button>
          </div>
          <div style={{ overflowY: 'auto' }}>
            {snippets.length === 0 && (
              <div style={{ padding: '8px 10px', color: '#6b7078' }}>No saved commands yet.</div>
            )}
            {snippets.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px 3px 10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: THEME.foreground, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ color: '#6b7078', fontFamily: '"Cascadia Mono", Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command}</div>
                </div>
                <button type="button" title="Insert without running" aria-label={`Insert ${s.name}`} disabled={status !== 'running'} onClick={() => insertSnippet(s, false)} style={toolbarBtn()}>Insert</button>
                <button type="button" title="Run" aria-label={`Run ${s.name}`} disabled={status !== 'running'} onClick={() => insertSnippet(s, true)} style={toolbarBtn(true)}>Run</button>
                <button type="button" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => removeSnippet(s.id)} style={toolbarBtn()}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Terminal;
