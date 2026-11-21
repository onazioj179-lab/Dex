// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX Platform -- Terminal
// In-app shell terminal panel. Pure DOM (no xterm.js dependency) so it works
// with our existing renderer bundle and IPC sandbox.
//
// Architecture:
//   - Spawns a session via `pty:spawn`.
//   - Subscribes to `pty:data` and `pty:exit` events.
//   - Renders an append-only output buffer + an inline input line.
//   - Sends keystrokes (lines) via `pty:write`.
//
// Limitations vs full xterm:
//   - Line-buffered (Enter sends `\r\n`, no character-mode).
//   - Strips most ANSI escape sequences for safe display; preserves color
//     and bright via 16-color palette.
// ===========================================================================
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauri } from '../services/platform/tauriCompat';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useAppPreference } from '../store/appPreferences';
import { buildDexCommands, matchTerminalCommand, resolveShortcut, suggestDexCommands } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { describeCapabilities, type CapabilityStatus } from '../uki/permissions';
import { parseAnsi, type Span } from '../../shared/term/ansiParser';
import { sendToNotes } from '../services/sendTo';

const TerminalViewport = lazy(() => import('./TerminalViewport'));
const MAX_REPLAY = 256 * 1024;
const MAX_TRANSCRIPT_LINES = 8000;
const MAX_TRANSCRIPT_LINE = 32 * 1024;

// ---------------------------------------------------------------------------
// IPC bridge accessor
// ---------------------------------------------------------------------------
interface ElectronBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on?: (channel: string, listener: (...args: unknown[]) => void) => () => void;
  removeListener?: (channel: string, listener: (...args: unknown[]) => void) => void;
}

const bridge = (): ElectronBridge | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { electron?: ElectronBridge };
  return w.electron && typeof w.electron.invoke === 'function' ? w.electron : null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface TerminalProps {
  /** Auto-spawn a session on mount. Default true. */
  autoSpawn?: boolean;
  /** Whether this panel can take focus and send visible geometry. */
  visible?: boolean;
  /** Working directory hint for the spawned shell. */
  cwd?: string;
  /** Optional shell override (e.g. 'pwsh.exe', '/bin/bash'). */
  shell?: string;
  /** Called when the panel is requested to close (e.g. user pressed Ctrl+D on empty line). */
  onClose?: () => void;
  /** Visible height in px. Defaults to flex-fill. */
  height?: number | string;
  /**
   * Reports the command currently running in this session (or null when idle)
   * so the host (TerminalTabs) can auto-title the tab. Best-effort.
   */
  onRunningCommand?: (cmd: string | null) => void;
}

interface Line { id: number; spans: Span[]; }

// ---------------------------------------------------------------------------
// Persistence (localStorage) — command history + saved snippets/aliases.
// All access is guarded; a corrupt or unavailable store degrades to in-memory.
// ---------------------------------------------------------------------------
const HISTORY_KEY = 'dex.terminal.history.v1';
const SNIPPETS_KEY = 'dex.terminal.snippets.v1';
const MAX_PERSISTED_HISTORY = 500;

interface Snippet { id: string; name: string; command: string; }

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — keep working in-memory */
  }
}

function loadHistory(): string[] {
  const v = readJson<unknown>(HISTORY_KEY, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function loadSnippets(): Snippet[] {
  const v = readJson<unknown>(SNIPPETS_KEY, []);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Snippet =>
    !!x && typeof x === 'object'
    && typeof (x as Snippet).id === 'string'
    && typeof (x as Snippet).name === 'string'
    && typeof (x as Snippet).command === 'string');
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

// A shell that dies almost immediately is a failed start (e.g. missing binary),
// not a normal exit — those get a bounded, backed-off retry. A clean exit after
// real use does NOT retry. This is what stops the terminal crash-respawn loop.
const MAX_SPAWN_RETRIES = 3;
const FAST_EXIT_MS = 1500;

/** Longest common prefix of a list of strings (for Tab completion). */
function longestCommonPrefix(items: readonly string[]): string {
  if (items.length === 0) return '';
  let prefix = items[0];
  for (const s of items) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

export const Terminal: React.FC<TerminalProps> = ({ autoSpawn = true, visible = true, cwd, shell, onClose, height, onRunningCommand }) => {
  const fontSize = Number(useAppPreference('dexcode', 'terminalFontSize'));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nativeSession, setNativeSession] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [viewportOpened, setViewportOpened] = useState(false);
  const [viewportSession, setViewportSession] = useState('');
  const stream = useRef({ replay: '', listeners: new Set<(data: string) => void>() });
  const inputQueue = useRef({ current: null as string | null, tail: Promise.resolve() });
  const sizeQueue = useRef({ current: null as string | null, pending: null as { cols: number; rows: number } | null, running: false });
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  // History is shared across sessions and persisted to localStorage. We seed
  // from storage on first mount so prior commands are immediately available to
  // ArrowUp / Ctrl+R reverse-search.
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  // Saved snippets / aliases palette (persisted). Toggled with Ctrl+S.
  const [snippets, setSnippets] = useState<Snippet[]>(() => loadSnippets());
  const [showSnippets, setShowSnippets] = useState(false);
  const [snippetName, setSnippetName] = useState('');
  const [snippetCmd, setSnippetCmd] = useState('');
  // Scrollback search (Ctrl+F): query + which match is focused. null = off.
  const [scrollSearch, setScrollSearch] = useState<{ q: string; idx: number } | null>(null);
  // Per-command exit-code badges, keyed by the line id that introduced the
  // command echo. Populated when the session reports an exit code.
  const [exitBadges, setExitBadges] = useState<Record<number, number>>({});
  // Reverse history search (Ctrl+R): `q` is the query, `idx` selects among
  // matches (newest first); null means search mode is off.
  const [revSearch, setRevSearch] = useState<{ q: string; idx: number } | null>(null);
  // Live `dex <cmd>` suggestion dropdown: `suggestIdx` selects among the ranked
  // matches as the user types. The matches themselves are derived (useMemo) from
  // the input below, so there is no parallel suggestion store to keep in sync.
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const retriesRef = useRef(0);
  const startSessionRef = useRef<(() => void) | null>(null);
  const lineIdRef = useRef(0);
  const bufferRef = useRef('');
  const pendingLinesRef = useRef<Line[]>([]);
  const flushRafRef = useRef<number | null>(null);
  const colorStateRef = useRef<{ color?: string; bold?: boolean }>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldFollowOutputRef = useRef(true);
  // Tracks the most recent shell command sent (for tab auto-title) and the line
  // id of its echo (so an exit-code badge can be attached to the right line).
  const runningCmdRef = useRef<string | null>(null);
  const lastCmdLineIdRef = useRef<number | null>(null);
  const onRunningCommandRef = useRef(onRunningCommand);
  onRunningCommandRef.current = onRunningCommand;

  const subscribeViewport = useCallback((write: (data: string) => void) => {
    const output = stream.current;
    if (output.replay) write(output.replay);
    output.listeners.add(write);
    return () => { output.listeners.delete(write); };
  }, []);

  const publishViewport = useCallback((data: string) => {
    const output = stream.current;
    output.replay = (output.replay + data).slice(-MAX_REPLAY);
    output.listeners.forEach(write => write(data));
  }, []);

  const flushTailBuffer = useCallback(() => {
    const tail = bufferRef.current;
    if (!tail) return;
    bufferRef.current = '';
    const { spans, color, bold } = parseAnsi(tail, colorStateRef.current.color, colorStateRef.current.bold);
    colorStateRef.current = { color, bold };
    setLines(prev => {
      const next = prev.concat({ id: ++lineIdRef.current, spans: spans.length ? spans : [{ text: '' }] });
      return next.length > 8000 ? next.slice(next.length - 8000) : next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Append output (buffer until newline, then commit lines)
  // -------------------------------------------------------------------------
  const appendOutput = useCallback((chunk: string) => {
    bufferRef.current += chunk;
    const parts = bufferRef.current.split(/\r?\n/);
    bufferRef.current = parts.pop() ?? '';
    if (bufferRef.current.length > MAX_TRANSCRIPT_LINE) {
      parts.push(bufferRef.current.slice(0, MAX_TRANSCRIPT_LINE));
      bufferRef.current = bufferRef.current.slice(MAX_TRANSCRIPT_LINE);
    }
    if (parts.length === 0) return;
    for (const raw of parts) {
      const { spans, color, bold } = parseAnsi(raw, colorStateRef.current.color, colorStateRef.current.bold);
      colorStateRef.current = { color, bold };
      pendingLinesRef.current.push({ id: ++lineIdRef.current, spans: spans.length ? spans : [{ text: '' }] });
    }
    if (pendingLinesRef.current.length > MAX_TRANSCRIPT_LINES) {
      pendingLinesRef.current = pendingLinesRef.current.slice(-MAX_TRANSCRIPT_LINES);
    }
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const pending = pendingLinesRef.current;
      pendingLinesRef.current = [];
      if (pending.length === 0) return;
      setLines(prev => {
        const next = prev.concat(pending);
        return next.length > MAX_TRANSCRIPT_LINES ? next.slice(-MAX_TRANSCRIPT_LINES) : next;
      });
    });
  }, []);

  // -------------------------------------------------------------------------
  // IPC subscription + spawn
  // -------------------------------------------------------------------------
  useEffect(() => {
    const b = bridge();
    if (!b) {
      setError('The native terminal connection is unavailable.');
      return;
    }
    let mounted = true;
    let dataOff: (() => void) | null = null;
    let exitOff: (() => void) | null = null;
    let activeId: string | null = null;
    let spawning = false;
    const native = isTauri();
    let listening = false;
    let spawnedAt = 0;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    setSessionId(null);
    setNativeSession(false);
    setSessionEnded(false);

    const handleSpawnFailure = (msg: string) => {
      if (!mounted) return;
      // Surface the reason immediately so the user (and tests) see WHY the
      // terminal didn't start, instead of a silent "starting…" while we retry
      // in the background. `unavailable` is only set once retries are spent.
      setError(msg);
      if (retriesRef.current >= MAX_SPAWN_RETRIES) {
        setUnavailable(true);
        return;
      }
      retriesRef.current += 1;
      // Exponential backoff with jitter so rapid failures can't busy-loop.
      const delay = 400 * 2 ** (retriesRef.current - 1) + Math.floor(Math.random() * 200);
      appendOutput(`\r\n[retrying terminal in ${Math.round(delay / 100) / 10}s — attempt ${retriesRef.current}/${MAX_SPAWN_RETRIES}]\r\n`);
      backoffTimer = setTimeout(() => { if (mounted) startSession(); }, delay);
    };

    const startSession = () => {
      if (!mounted || spawning || activeId) return;
      if (backoffTimer) {
        clearTimeout(backoffTimer);
        backoffTimer = null;
      }
      spawning = true;
      setUnavailable(false);
      setError(null);
      setSessionEnded(false);
      stream.current.replay = '';
      spawnedAt = Date.now();
      const start = async () => {
        const r = await b.invoke('pty:spawn', { cwd, shell, ...(native ? { deferEvents: true } : {}) }) as
          { sessionId?: string; error?: string; interactive?: boolean } | null;
        if (!mounted) {
          if (r?.sessionId) void b.invoke('pty:kill', { sessionId: r.sessionId }).catch(() => {});
          return;
        }
        if (!r?.sessionId || r.error) {
          handleSpawnFailure(r?.error || 'The terminal did not return a session.');
          return;
        }
        activeId = r.sessionId;
        inputQueue.current = { current: r.sessionId, tail: Promise.resolve() };
        sizeQueue.current = { current: r.sessionId, pending: null, running: false };
        setSessionId(r.sessionId);
        setNativeSession(r.interactive === true);
        setViewportSession(r.sessionId);
        if (native) {
          const response = await b.invoke('pty:attach', { sessionId: r.sessionId }) as { success?: boolean; error?: string } | null;
          if (!response?.success && mounted && activeId === r.sessionId) {
            activeId = null;
            inputQueue.current.current = null;
            setSessionId(null);
            void b.invoke('pty:kill', { sessionId: r.sessionId }).catch(() => {});
            handleSpawnFailure(response?.error ?? 'Could not connect terminal output.');
          }
        }
      };
      void start().catch(err => {
        if (activeId) {
          void b.invoke('pty:kill', { sessionId: activeId }).catch(() => {});
          activeId = null;
          inputQueue.current.current = null;
          if (mounted) setSessionId(null);
        }
        if (mounted) handleSpawnFailure(String(err));
      }).finally(() => {
        spawning = false;
      });
    };

    const onData = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; data?: string };
      if (payload?.sessionId === activeId && typeof payload.data === 'string') {
        appendOutput(payload.data);
        publishViewport(payload.data);
      }
    };
    const onExit = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; code?: number };
      if (payload?.sessionId !== activeId) return;
      const code = payload.code ?? null;
      const ranMs = Date.now() - spawnedAt;
      flushTailBuffer();
      const message = code === null ? '\r\n[session ended]\r\n' : `\r\n[session exited code=${code}]\r\n`;
      appendOutput(message);
      publishViewport(message);
      activeId = null;
      inputQueue.current.current = null;
      sizeQueue.current.current = null;
      if (!mounted) return;
      // Attach an exit-code badge to the most recent command line, if any.
      const badgeLine = lastCmdLineIdRef.current;
      if (!native && code !== null && badgeLine !== null) {
        setExitBadges(prev => ({ ...prev, [badgeLine]: code }));
      }
      runningCmdRef.current = null;
      try { onRunningCommandRef.current?.(null); } catch { /* host detached */ }
      setSessionId(null);
      setSessionEnded(true);
      // -1 is our "shell unavailable" sentinel; a non-zero fast exit is also a
      // failed start. Either way retry (bounded). A clean/long-lived exit does
      // not loop — it just resets the retry budget for a manual restart.
      if (code === -1 || (code !== null && code !== 0 && ranMs < FAST_EXIT_MS)) {
        handleSpawnFailure(`shell exited early (code ${code})`);
      } else {
        retriesRef.current = 0;
      }
    };

    if (native) {
      const connect = async () => {
        if (!mounted || listening) return;
        listening = true;
        try {
          const owner = getCurrentWebviewWindow();
          if (!dataOff) {
            const remove = await owner.listen('pty:data', event => onData(event.payload));
            if (!mounted) { remove(); return; }
            dataOff = remove;
          }
          if (!exitOff) {
            const remove = await owner.listen('pty:exit', event => onExit(event.payload));
            if (!mounted) { remove(); return; }
            exitOff = remove;
          }
          startSession();
        } catch {
          if (mounted) setError('Could not subscribe to native terminal events.');
        } finally {
          listening = false;
        }
      };
      startSessionRef.current = () => { void connect(); };
      if (autoSpawn) void connect();
    } else {
      startSessionRef.current = startSession;
      if (b.on) {
        dataOff = b.on('pty:data', onData);
        exitOff = b.on('pty:exit', onExit);
      }
      if (autoSpawn) startSession();
    }

    return () => {
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      if (backoffTimer) clearTimeout(backoffTimer);
      flushTailBuffer();
      mounted = false;
      inputQueue.current.current = null;
      sizeQueue.current.current = null;
      startSessionRef.current = null;
      if (dataOff) dataOff();
      if (exitOff) exitOff();
      if (activeId) {
        b.invoke('pty:kill', { sessionId: activeId }).catch(() => { /* shutting down */ });
      }
    };
  }, [autoSpawn, cwd, shell, appendOutput, flushTailBuffer, publishViewport]);

  // Manual restart from the unavailable state — resets the retry budget.
  const handleRetry = useCallback(() => {
    retriesRef.current = 0;
    setUnavailable(false);
    setError(null);
    startSessionRef.current?.();
  }, []);

  // -------------------------------------------------------------------------
  // Persist history + snippets to localStorage (capped, guarded).
  // -------------------------------------------------------------------------
  useEffect(() => {
    const capped = history.length > MAX_PERSISTED_HISTORY ? history.slice(history.length - MAX_PERSISTED_HISTORY) : history;
    writeJson(HISTORY_KEY, capped);
  }, [history]);

  useEffect(() => { writeJson(SNIPPETS_KEY, snippets); }, [snippets]);

  // Keep history in sync across mounted sessions/tabs that share this storage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      try {
        if (e.key === HISTORY_KEY) setHistory(loadHistory());
        else if (e.key === SNIPPETS_KEY) setSnippets(loadSnippets());
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // -------------------------------------------------------------------------
  // Auto-scroll on new output
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldFollowOutputRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldFollowOutputRef.current = distance <= 20;
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // -------------------------------------------------------------------------
  // Send input
  // -------------------------------------------------------------------------
  const writeTerminal = useCallback((data: string) => {
    const b = bridge();
    const queue = inputQueue.current;
    if (!b || !sessionId || queue.current !== sessionId) return;
    const report = (reason: string) => {
      const message = `\r\n[Terminal input failed: ${reason}]\r\n`;
      appendOutput(message);
      publishViewport(message);
    };
    if (data.length > MAX_REPLAY) {
      report('paste is too large');
      return;
    }
    queue.tail = queue.tail.then(async () => {
      for (let offset = 0; offset < data.length;) {
        if (queue.current !== sessionId) return;
        let end = Math.min(data.length, offset + 16000);
        const last = data.charCodeAt(end - 1);
        if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--;
        const response = await b.invoke('pty:write', { sessionId, data: data.slice(offset, end) }) as
          { success?: boolean; error?: string } | null;
        if (!response || response.success === false) {
          if (queue.current === sessionId) report(response?.error ?? 'session unavailable');
          return;
        }
        offset = end;
      }
    }).catch(() => { if (queue.current === sessionId) report('no response from the shell'); });
  }, [appendOutput, publishViewport, sessionId]);

  const resizeTerminal = useCallback((cols: number, rows: number) => {
    const queue = sizeQueue.current;
    const b = bridge();
    if (!sessionId || !b || queue.current !== sessionId) return;
    queue.pending = { cols, rows };
    if (queue.running) return;
    queue.running = true;
    const send = async () => {
      try {
        while (queue.current === sessionId && queue.pending) {
          const size = queue.pending;
          queue.pending = null;
          await b.invoke('pty:resize', { sessionId, ...size });
        }
      } finally {
        queue.running = false;
      }
    };
    void send().catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    const surface = scrollRef.current;
    if (!surface || !nativeSession || !sessionId || !visible || interactive) return;
    let lastSize = '';
    const measure = () => {
      if (!surface.clientWidth || !surface.clientHeight) return;
      const cols = Math.max(1, Math.floor((surface.clientWidth - 20) / (fontSize * 0.6)));
      const rows = Math.max(1, Math.floor((surface.clientHeight - 16) / (fontSize * 1.45)));
      const key = `${cols}:${rows}`;
      if (key === lastSize) return;
      lastSize = key;
      resizeTerminal(cols, rows);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(surface);
    measure();
    return () => observer?.disconnect();
  }, [nativeSession, sessionId, visible, interactive, fontSize, resizeTerminal]);

  const send = useCallback((text: string) => {
    if (!sessionId) return;
    // The echo of `${text}\r\n` becomes exactly one committed line; its id is the
    // next value lineIdRef will yield. Capture it so an exit-code badge can be
    // attached to this command later.
    if (text.trim()) {
      lastCmdLineIdRef.current = lineIdRef.current + 1;
      runningCmdRef.current = text.trim();
      try { onRunningCommandRef.current?.(text.trim()); } catch { /* host detached */ }
    }
    // The native TTY already echoes input. Legacy pipe sessions need local echo.
    if (!nativeSession) appendOutput(`${text}\r\n`);
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
    writeTerminal(text + (nativeSession ? '\r' : isWindows ? '\r\n' : '\n'));
  }, [sessionId, appendOutput, nativeSession, writeTerminal]);

  // -------------------------------------------------------------------------
  // DEX commands -- the in-terminal `dex <cmd>` runner. Reads the ONE canonical
  // command catalog (shared/commands/dexCommands), so it stays in lock-step
  // with the palette / keyboard / UKI. App commands launch via the running-apps
  // store; everything else points the user at its shortcut. Lines starting with
  // `dex` are handled locally and NOT forwarded to the OS shell.
  // -------------------------------------------------------------------------
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const dexCommands = useMemo(() => buildDexCommands(APP_DEFINITIONS), []);

  const handleDexInput = useCallback((raw: string): boolean => {
    const value = raw.trim();
    if (!/^dex(\s|$)/i.test(value)) return false; // not a DEX command -> shell
    appendOutput(`${value}\r\n`);
    const rest = value.replace(/^dex\s*/i, '').trim();

    if (rest === '' || rest === 'help' || rest === 'list') {
      const rows = dexCommands.map((c) => {
        const sc = resolveShortcut(c, isMac);
        return `  ${c.terminal.padEnd(14)}${(sc || '').padEnd(18)}${c.label}`;
      });
      appendOutput(
        `DEX commands  ·  run as: dex <name>\r\n` +
        `  ${'name'.padEnd(14)}${'shortcut'.padEnd(18)}description\r\n` +
        rows.join('\r\n') + '\r\n',
      );
      return true;
    }

    // `dex perms` -- transparency: what UKI can and cannot access right now.
    if (rest === 'perms' || rest === 'permissions' || rest === 'access') {
      void (async () => {
        try {
          const caps = await describeCapabilities();
          const dot = (s: CapabilityStatus) =>
            s === 'granted' ? '\x1b[32m●\x1b[0m'
            : s === 'hard-denied' ? '\x1b[31m✕\x1b[0m'
            : '\x1b[90m○\x1b[0m';
          const rows = caps.map((c) => {
            const exp = c.status === 'granted' && c.expiresTs
              ? ` \x1b[90m(until ${new Date(c.expiresTs).toLocaleTimeString()})\x1b[0m`
              : '';
            return `  ${dot(c.status)} ${c.label.padEnd(20)} ${c.status}${exp}\r\n` +
              `      \x1b[90m${c.rationale}\x1b[0m`;
          });
          appendOutput(
            `UKI access — what UKI can and cannot do right now\r\n` +
            `  \x1b[32m●\x1b[0m granted   \x1b[90m○\x1b[0m not granted   \x1b[31m✕\x1b[0m blocked by this build\r\n` +
            rows.join('\r\n') + '\r\n' +
            `Grant or revoke in Settings -> Permissions -> UKI Assistant Access; session grants lapse automatically.\r\n`,
          );
        } catch {
          appendOutput(`dex: could not read UKI permissions\r\n`);
        }
      })();
      return true;
    }

    const m = matchTerminalCommand(dexCommands, `dex ${rest}`);
    if (!m) {
      appendOutput(`dex: unknown command '${rest.split(/\s+/)[0]}' — try 'dex list'\r\n`);
      return true;
    }
    const { command, args } = m;
    try {
      executeDexCommand(command, args); // app launch OR dispatch the dex-command action bus
      const verb = command.appId ? `Opening ${command.label.replace(/^Open /, '')}…` : `Ran ${command.label}`;
      appendOutput(`\x1b[32m${verb}\x1b[0m\r\n`);
    } catch {
      appendOutput(`dex: failed to run ${command.id}\r\n`);
    }
    return true;
  }, [dexCommands, isMac, appendOutput]);

  // Matches for the active reverse search, newest first. Empty when off.
  const revMatches = useMemo(() => {
    if (!revSearch || !revSearch.q) return [] as string[];
    const q = revSearch.q.toLowerCase();
    return [...history].reverse().filter((h) => h.toLowerCase().includes(q));
  }, [revSearch, history]);
  const revMatch = revMatches.length
    ? revMatches[Math.min(revSearch?.idx ?? 0, revMatches.length - 1)]
    : null;

  // Completion candidates for `dex <name>`: terminal-only builtins + catalog.
  const dexCompletionNames = useMemo(
    () => [...new Set(['help', 'list', 'perms', ...dexCommands.map((c) => c.terminal)])].filter(Boolean),
    [dexCommands],
  );

  // Live suggestion dropdown for `dex <partial>`. Shows ONLY while the line is a
  // `dex` command being typed (exactly "dex", or "dex <word…>") -- never for a
  // normal shell command. `null` query means "don't show"; '' means the catalog
  // head. Suppressed in reverse-search mode so the two affordances never overlap.
  const dexSuggestQuery = useMemo<string | null>(() => {
    if (revSearch) return null;
    const m = /^\s*dex(?:\s+(.*))?$/i.exec(input);
    if (!m) return null;
    return m[1] ?? '';
  }, [input, revSearch]);

  // Ranked `dex` matches, sharing the same typo-tolerant resolver as UKI/palette.
  const dexSuggestions = useMemo(
    () => (dexSuggestQuery === null ? [] : suggestDexCommands(dexCommands, dexSuggestQuery, 6)),
    [dexCommands, dexSuggestQuery],
  );
  // Escape hides the open dropdown WITHOUT clearing what the user typed. The
  // suppression lifts as soon as the query changes again (see the effect below),
  // so the next keystroke brings the suggestions back.
  const [suggestDismissed, setSuggestDismissed] = useState<string | null>(null);
  useEffect(() => {
    setSuggestDismissed((d) => (d !== null && d !== dexSuggestQuery ? null : d));
  }, [dexSuggestQuery]);
  const showSuggest = dexSuggestions.length > 0 && suggestDismissed !== dexSuggestQuery;

  // Clamp the selection whenever the candidate list changes (e.g. the user typed
  // another character and the match set shrank), so it never points past the end.
  useEffect(() => { setSuggestIdx((i) => (i >= dexSuggestions.length ? 0 : i)); }, [dexSuggestions.length]);

  // Accept a suggestion: fill the prompt with `dex <alias>` and run it through the
  // SAME local dex path Enter uses (handleDexInput), then record history -- no new
  // executor. Mirrors the Enter branch in onKey so behaviour stays identical.
  const acceptSuggestion = useCallback((cmd: typeof dexCommands[number]) => {
    const value = `dex ${cmd.terminal}`;
    setHistory((h) => (h[h.length - 1] !== value ? [...h, value] : h));
    setHistoryIdx(null);
    setInput('');
    setSuggestIdx(0);
    if (handleDexInput(value)) return;
    send(value);
  }, [handleDexInput, send]);

  // -------------------------------------------------------------------------
  // Scrollback search (Ctrl+F): find query in the current buffer, with match
  // line-ids for highlighting and a focused match to scroll into view.
  // -------------------------------------------------------------------------
  const lineText = useCallback((l: Line) => l.spans.map((s) => s.text).join(''), []);
  const scrollMatchIds = useMemo(() => {
    if (!scrollSearch || !scrollSearch.q) return [] as number[];
    const q = scrollSearch.q.toLowerCase();
    return lines.filter((l) => lineText(l).toLowerCase().includes(q)).map((l) => l.id);
  }, [scrollSearch, lines, lineText]);
  const focusedMatchId = scrollMatchIds.length
    ? scrollMatchIds[Math.min(scrollSearch?.idx ?? 0, scrollMatchIds.length - 1)]
    : null;

  // Scroll the focused match into view (and pause output-follow while searching).
  useEffect(() => {
    if (focusedMatchId === null) return;
    shouldFollowOutputRef.current = false;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-line-id="${focusedMatchId}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [focusedMatchId]);

  // -------------------------------------------------------------------------
  // Snippets / aliases + Send to Notes.
  // -------------------------------------------------------------------------
  const insertSnippet = useCallback((cmd: string) => {
    setInput(cmd);
    setShowSnippets(false);
    setHistoryIdx(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const saveSnippet = useCallback(() => {
    const name = snippetName.trim();
    const command = snippetCmd.trim();
    if (!command) { toast('error', 'Snippet needs a command'); return; }
    const snip: Snippet = {
      id: `s${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      name: name || command,
      command,
    };
    setSnippets((prev) => [...prev, snip]);
    setSnippetName('');
    setSnippetCmd('');
    toast('success', 'Snippet saved');
  }, [snippetName, snippetCmd]);

  const deleteSnippet = useCallback((id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const sendBufferToNotes = useCallback(() => {
    try {
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      const selected = sel && !sel.isCollapsed ? sel.toString() : '';
      const text = selected || lines.map(lineText).join('\n');
      if (!text.trim()) { toast('info', 'Nothing to send'); return; }
      void sendToNotes(text, selected ? 'Terminal selection' : 'Terminal output');
    } catch {
      toast('error', 'Could not send to Notes');
    }
  }, [lines, lineText]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // --- Scrollback search mode intercepts navigation/commit keys. Typing and
    // Backspace edit the query via the search field's own onChange.
    if (scrollSearch) {
      if (e.key === 'Enter') {
        e.preventDefault();
        setScrollSearch((p) => (p && scrollMatchIds.length ? { ...p, idx: (p.idx + 1) % scrollMatchIds.length } : p));
        return;
      }
      if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setScrollSearch(null);
        shouldFollowOutputRef.current = true;
        return;
      }
    }
    // --- Reverse history search mode intercepts navigation/commit keys. Typing
    // and Backspace fall through to the input's onChange, which edits the query.
    if (revSearch) {
      if (e.key === 'Enter') {
        e.preventDefault();
        setInput(revMatch ?? revSearch.q);
        setRevSearch(null);
      } else if (e.key === 'Escape' || (e.ctrlKey && (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 'c'))) {
        e.preventDefault();
        setRevSearch(null);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setRevSearch((p) => (p ? { ...p, idx: p.idx + 1 } : p)); // cycle to older match
      }
      return;
    }

    // --- `dex <cmd>` suggestion dropdown intercepts navigation/commit/dismiss.
    // It only fires while the dropdown is visible. Tab now COMPLETES the line with
    // the highlighted suggestion (fills it, does not run) -- previously Tab had no
    // handler and fell through to the input default, blurring the terminal (the
    // "Tab does nothing" bug). Enter still accepts + runs.
    if (showSuggest) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIdx((i) => (i + 1) % dexSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIdx((i) => (i - 1 + dexSuggestions.length) % dexSuggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const pick = dexSuggestions[Math.min(suggestIdx, dexSuggestions.length - 1)];
        if (pick) { setInput(`dex ${pick.command.terminal}`); setSuggestIdx(0); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const pick = dexSuggestions[Math.min(suggestIdx, dexSuggestions.length - 1)];
        if (pick) { acceptSuggestion(pick.command); return; }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestDismissed(dexSuggestQuery);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input;
      if (value === '' && onClose) { onClose(); return; }
      setHistory(h => (value && h[h.length - 1] !== value ? [...h, value] : h));
      setHistoryIdx(null);
      setInput('');
      if (handleDexInput(value)) return; // DEX command handled locally
      send(value);
    } else if (e.key === 'Tab') {
      // Completion: dex subcommands from the catalog, else complete from history.
      e.preventDefault();
      const dexMatch = /^dex\s+(.*)$/i.exec(input);
      if (dexMatch) {
        const partial = dexMatch[1];
        const cands = dexCompletionNames.filter((n) => n.startsWith(partial));
        if (cands.length === 1) {
          setInput(`dex ${cands[0]} `);
        } else if (cands.length > 1) {
          const common = longestCommonPrefix(cands);
          if (common.length > partial.length) setInput(`dex ${common}`);
          appendOutput(`${input}\r\n  ${cands.join('   ')}\r\n`);
        }
      } else if (input.trim()) {
        const m = [...history].reverse().find((h) => h !== input && h.startsWith(input));
        if (m) setInput(m);
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      setRevSearch({ q: '', idx: 0 });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setScrollSearch({ q: '', idx: 0 });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      // Toggle the snippets / aliases palette; prefill the command with the
      // current line so "save this command" is one keystroke away.
      e.preventDefault();
      setShowSnippets((open) => {
        if (!open && input.trim()) setSnippetCmd(input.trim());
        return !open;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === null) return;
      const next = historyIdx + 1;
      if (next >= history.length) { setHistoryIdx(null); setInput(''); }
      else { setHistoryIdx(next); setInput(history[next]); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setLines([]);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      // If the user has selected output text, Ctrl+C means "copy" — let the
      // browser handle it natively and do NOT also send SIGINT / clear the line.
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
      // Otherwise: send SIGINT via control-char and discard the pending line.
      e.preventDefault();
      writeTerminal('\x03');
      setInput('');
    }
  }, [input, history, historyIdx, onClose, send, sessionId, handleDexInput, revSearch, revMatch, dexCompletionNames, appendOutput, showSuggest, dexSuggestions, suggestIdx, dexSuggestQuery, acceptSuggestion, scrollSearch, scrollMatchIds, writeTerminal]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      data-testid="dex-terminal"
      style={{
        display: 'flex', flexDirection: 'column',
        height: height ?? '100%', minHeight: 160,
        background: '#0c0c0c',
        color: '#d0d0d0',
        fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace',
        fontSize,
        lineHeight: 1.45,
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      onClick={() => { if (!interactive) inputRef.current?.focus(); }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 10px',
          background: '#161616',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10, color: '#999',
          letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600,
        }}
      >
        <span>Terminal {sessionId ? `· ${sessionId}` : unavailable ? '· unavailable' : error ? '· error' : sessionEnded ? '· ended' : '· starting…'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(unavailable || (!sessionId && (error || sessionEnded))) && (
            <button
              type="button"
              onClick={handleRetry}
              title="Restart terminal"
              aria-label="Restart terminal"
              style={{
                background: 'transparent', color: 'var(--color-accent, #4a9eff)', border: 'none',
                fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
              }}
            >
              {sessionEnded && !error ? 'Restart' : 'Retry'}
            </button>
          )}
          {nativeSession && (
            <button type="button" aria-pressed={interactive}
              onClick={() => { setViewportOpened(true); setInteractive(value => !value); }}
              style={{ background: 'transparent', color: '#d0d0d0', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              Interactive
            </button>
          )}
          <div style={{ display: interactive && nativeSession ? 'none' : 'contents' }}>
          <button
            type="button"
            onClick={() => { setScrollSearch((p) => (p ? null : { q: '', idx: 0 })); setTimeout(() => searchInputRef.current?.focus(), 0); }}
            title="Search scrollback (Ctrl+F)"
            aria-label="Search scrollback"
            style={{
              background: 'transparent', color: scrollSearch ? 'var(--color-accent, #4a9eff)' : '#999', border: 'none',
              fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
            }}
          >
            Find
          </button>
          <button
            type="button"
            onClick={() => setShowSnippets((o) => !o)}
            title="Saved snippets (Ctrl+S)"
            aria-label="Saved snippets"
            style={{
              background: 'transparent', color: showSnippets ? 'var(--color-accent, #4a9eff)' : '#999', border: 'none',
              fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
            }}
          >
            Snippets
          </button>
          <button
            type="button"
            onClick={sendBufferToNotes}
            title="Send output (or selection) to Notes"
            aria-label="Send to Notes"
            style={{
              background: 'transparent', color: '#999', border: 'none',
              fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
            }}
          >
            To Notes
          </button>
          <button
            type="button"
            onClick={() => { setLines([]); setExitBadges({}); }}
            title="Clear (Ctrl+L)"
            aria-label="Clear terminal"
            style={{
              background: 'transparent', color: '#999', border: 'none',
              fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
            }}
          >
            Clear
          </button>
          </div>
        </div>
      </div>
      {viewportOpened && nativeSession && <Suspense fallback={interactive ? <div role="status">Opening interactive terminal…</div> : null}>
        <TerminalViewport key={viewportSession} active={interactive && visible} fontSize={fontSize}
          subscribe={subscribeViewport} onInput={writeTerminal} onResize={resizeTerminal} />
      </Suspense>}
      <div style={{ display: interactive && nativeSession ? 'none' : 'contents' }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: 'var(--space-2) 10px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}
      >
        {(unavailable || (!sessionId && error)) && (
          <div
            role="alert"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
              margin: '4px 0 10px',
              padding: '10px 12px',
              background: 'rgba(255,95,95,0.08)',
              border: '1px solid rgba(255,95,95,0.32)',
              borderRadius: 4,
              color: '#ffb3b3',
            }}
          >
            <span style={{ color: 'var(--color-error, #ff5f5f)', fontWeight: 600 }}>
              Terminal unavailable — the shell couldn’t start.
            </span>
            {error && <span style={{ color: '#cc8a8a', fontSize: 11 }}>{error}</span>}
            <button
              type="button"
              onClick={handleRetry}
              style={{
                background: 'transparent', color: 'var(--color-accent, #4a9eff)',
                border: '1px solid var(--color-accent, #4a9eff)', borderRadius: 4,
                fontSize: 11, cursor: 'pointer', padding: '3px 12px', fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {error && sessionId && <div style={{ color: 'var(--color-error, #ff5f5f)' }}>{error}</div>}
        {lines.map(l => {
          const isMatch = scrollMatchIds.includes(l.id);
          const isFocused = l.id === focusedMatchId;
          const badge = exitBadges[l.id];
          return (
            <div
              key={l.id}
              data-line-id={l.id}
              style={{
                background: isFocused ? 'rgba(255,214,10,0.22)' : isMatch ? 'rgba(255,214,10,0.10)' : undefined,
                display: badge !== undefined ? 'flex' : undefined,
                alignItems: badge !== undefined ? 'center' : undefined,
                gap: badge !== undefined ? 8 : undefined,
              }}
            >
              <span style={{ flex: badge !== undefined ? 1 : undefined, minWidth: 0 }}>
                {l.spans.map((sp, i) => (
                  <span key={i} style={{ color: sp.color, fontWeight: sp.bold ? 600 : 400 }}>{sp.text}</span>
                ))}
              </span>
              {badge !== undefined && (
                <span
                  title={`Exit code ${badge}`}
                  style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 8,
                    background: badge === 0 ? 'rgba(61,166,106,0.18)' : 'rgba(255,95,95,0.18)',
                    color: badge === 0 ? '#5fd38a' : '#ff8a8a',
                    border: `1px solid ${badge === 0 ? 'rgba(61,166,106,0.4)' : 'rgba(255,95,95,0.4)'}`,
                  }}
                >
                  {`exit ${badge}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {scrollSearch && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: '#0a0a0a',
            color: '#999', fontSize: 11,
          }}
        >
          <span style={{ color: '#c9a227', fontWeight: 600 }}>Find</span>
          <input
            ref={searchInputRef}
            value={scrollSearch.q}
            onChange={(e) => setScrollSearch({ q: e.target.value, idx: 0 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setScrollSearch((p) => (p && scrollMatchIds.length ? { ...p, idx: (p.idx + (e.shiftKey ? -1 + scrollMatchIds.length : 1)) % scrollMatchIds.length } : p));
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setScrollSearch(null);
                shouldFollowOutputRef.current = true;
                inputRef.current?.focus();
              }
            }}
            placeholder="Search scrollback…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search scrollback"
            style={{
              flex: 1, background: 'transparent', color: '#e0e0e0', border: 'none', outline: 'none',
              fontFamily: 'inherit', fontSize: 'inherit',
            }}
          />
          <span style={{ color: '#666', flexShrink: 0 }}>
            {scrollSearch.q
              ? scrollMatchIds.length
                ? `${Math.min(scrollSearch.idx, scrollMatchIds.length - 1) + 1}/${scrollMatchIds.length}`
                : 'no matches'
              : ''}
          </span>
          <button
            type="button"
            onClick={() => setScrollSearch((p) => (p && scrollMatchIds.length ? { ...p, idx: (p.idx + 1) % scrollMatchIds.length } : p))}
            title="Next match (Enter)"
            aria-label="Next match"
            style={{ background: 'transparent', color: '#999', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '0 4px' }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => { setScrollSearch(null); shouldFollowOutputRef.current = true; inputRef.current?.focus(); }}
            title="Close search (Esc)"
            aria-label="Close search"
            style={{ background: 'transparent', color: '#999', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '0 4px' }}
          >
            Close
          </button>
        </div>
      )}
      {showSnippets && (
        <div
          onClick={(e) => e.stopPropagation()}
          aria-label="Saved command snippets"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: '#0a0a0a',
            fontSize: 11,
            maxHeight: 200,
            overflowY: 'auto',
            padding: '6px 10px',
          }}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              placeholder="Name (optional)"
              spellCheck={false}
              autoComplete="off"
              aria-label="Snippet name"
              style={{
                width: 120, background: '#141414', color: '#e0e0e0',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, outline: 'none',
                fontFamily: 'inherit', fontSize: 'inherit', padding: '3px 6px',
              }}
            />
            <input
              value={snippetCmd}
              onChange={(e) => setSnippetCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSnippet(); } }}
              placeholder="Command to save…"
              spellCheck={false}
              autoComplete="off"
              aria-label="Snippet command"
              style={{
                flex: 1, background: '#141414', color: '#e0e0e0',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, outline: 'none',
                fontFamily: 'inherit', fontSize: 'inherit', padding: '3px 6px',
              }}
            />
            <button
              type="button"
              onClick={saveSnippet}
              title="Save snippet"
              style={{
                background: 'transparent', color: 'var(--color-accent, #4a9eff)',
                border: '1px solid var(--color-accent, #4a9eff)', borderRadius: 4,
                fontSize: 11, cursor: 'pointer', padding: '2px 10px', fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              Save
            </button>
          </div>
          {snippets.length === 0 ? (
            <div style={{ color: '#666', padding: '4px 2px' }}>No saved snippets. Type a command above and Save, or open this with a command on the prompt (Ctrl+S).</div>
          ) : (
            snippets.map((s) => (
              <div
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 2px' }}
              >
                <button
                  type="button"
                  onClick={() => insertSnippet(s.command)}
                  title="Insert into prompt"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    color: '#b8b8b8', fontFamily: 'inherit', fontSize: 'inherit', padding: 0,
                  }}
                >
                  <span style={{ color: '#e0e0e0', fontWeight: 600, flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ color: '#3da66a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSnippet(s.id)}
                  aria-label={`Delete snippet ${s.name}`}
                  title="Delete snippet"
                  style={{ background: 'transparent', color: '#999', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0, padding: '0 4px' }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
      {revSearch && (
        <div
          style={{
            padding: '3px 10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: '#0a0a0a',
            color: '#999', fontSize: 11,
          }}
        >
          <span style={{ color: '#c9a227' }}>(reverse-i-search)</span>
          {` ‘${revSearch.q}’: `}
          <span style={{ color: '#e0e0e0' }}>{revMatch ?? ''}</span>
          {revMatches.length > 1 && (
            <span style={{ color: '#666' }}>{`  (${Math.min(revSearch.idx, revMatches.length - 1) + 1}/${revMatches.length})`}</span>
          )}
        </div>
      )}
      {showSuggest && (
        <div
          role="listbox"
          aria-label="DEX command suggestions"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: '#0a0a0a',
            fontSize: 11,
            maxHeight: 156,
            overflowY: 'auto',
          }}
        >
          {dexSuggestions.map((s, i) => {
            const active = i === Math.min(suggestIdx, dexSuggestions.length - 1);
            const sc = resolveShortcut(s.command, isMac);
            return (
              <div
                key={s.command.id}
                role="option"
                aria-selected={active}
                // mousedown (not click) so the row commits before the input blurs.
                onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s.command); }}
                onMouseEnter={() => setSuggestIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  background: active ? '#1d1d1d' : 'transparent',
                  color: active ? '#e0e0e0' : '#b8b8b8',
                }}
              >
                <span style={{ color: '#3da66a', fontWeight: 600, flexShrink: 0 }}>{`dex ${s.command.terminal}`}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.command.label}</span>
                {sc && <span style={{ color: '#666', flexShrink: 0, letterSpacing: '0.02em' }}>{sc}</span>}
              </div>
            );
          })}
        </div>
      )}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
        }}
      >
        <span style={{ color: revSearch ? '#c9a227' : '#3da66a', fontWeight: 600 }}>{revSearch ? '?' : '$'}</span>
        <input
          ref={inputRef}
          value={revSearch ? revSearch.q : input}
          onChange={e => { if (revSearch) setRevSearch({ q: e.target.value, idx: 0 }); else setInput(e.target.value); }}
          onKeyDown={onKey}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label="Terminal input"
          disabled={!sessionId}
          style={{
            flex: 1,
            background: 'transparent',
            color: '#e0e0e0',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        />
      </div>
      </div>
    </div>
  );
};

export default Terminal;
