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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_DEFINITIONS } from '../store/runningApps';
import { buildDexCommands, matchTerminalCommand, resolveShortcut, suggestDexCommands } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { describeCapabilities, type CapabilityStatus } from '../uki/permissions';

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
// Lightweight ANSI parser -- handles SGR (color) codes, strips others.
// ---------------------------------------------------------------------------
const ANSI_REGEX = /\x1b\[([\d;?]*)([A-Za-z])/g;
const ANSI_COLORS_FG: Record<number, string> = {
  30: '#1e1e1e', 31: '#ff5f5f', 32: '#3da66a', 33: '#ffb020',
  34: '#4a9eff', 35: '#c678dd', 36: '#56b6c2', 37: '#d0d0d0',
  90: '#666666', 91: '#ff8080', 92: '#5dd685', 93: '#ffd166',
  94: '#7ab8ff', 95: '#dd9cff', 96: '#7fdfee', 97: '#ffffff',
};

interface Span { text: string; color?: string; bold?: boolean; }

function parseAnsi(input: string, prevColor?: string, prevBold?: boolean): { spans: Span[]; color?: string; bold?: boolean } {
  const spans: Span[] = [];
  let cursor = 0;
  let color = prevColor;
  let bold = prevBold;
  let m: RegExpExecArray | null;
  ANSI_REGEX.lastIndex = 0;
  while ((m = ANSI_REGEX.exec(input)) !== null) {
    if (m.index > cursor) spans.push({ text: input.slice(cursor, m.index), color, bold });
    if (m[2] === 'm') {
      const codes = m[1].split(';').filter(Boolean).map(Number);
      if (codes.length === 0) { color = undefined; bold = false; }
      for (const c of codes) {
        if (c === 0) { color = undefined; bold = false; }
        else if (c === 1) { bold = true; }
        else if (c === 22) { bold = false; }
        else if (c === 39) { color = undefined; }
        else if (ANSI_COLORS_FG[c]) { color = ANSI_COLORS_FG[c]; }
      }
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < input.length) spans.push({ text: input.slice(cursor), color, bold });
  return { spans, color, bold };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface TerminalProps {
  /** Auto-spawn a session on mount. Default true. */
  autoSpawn?: boolean;
  /** Working directory hint for the spawned shell. */
  cwd?: string;
  /** Optional shell override (e.g. 'pwsh.exe', '/bin/bash'). */
  shell?: string;
  /** Called when the panel is requested to close (e.g. user pressed Ctrl+D on empty line). */
  onClose?: () => void;
  /** Visible height in px. Defaults to flex-fill. */
  height?: number | string;
}

interface Line { id: number; spans: Span[]; }

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

export const Terminal: React.FC<TerminalProps> = ({ autoSpawn = true, cwd, shell, onClose, height }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
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
  const shouldFollowOutputRef = useRef(true);

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
    if (parts.length === 0) return;
    for (const raw of parts) {
      const { spans, color, bold } = parseAnsi(raw, colorStateRef.current.color, colorStateRef.current.bold);
      colorStateRef.current = { color, bold };
      pendingLinesRef.current.push({ id: ++lineIdRef.current, spans: spans.length ? spans : [{ text: '' }] });
    }
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const pending = pendingLinesRef.current;
      pendingLinesRef.current = [];
      if (pending.length === 0) return;
      setLines(prev => {
        const next = prev.concat(pending);
        return next.length > 8000 ? next.slice(next.length - 8000) : next;
      });
    });
  }, []);

  // -------------------------------------------------------------------------
  // IPC subscription + spawn
  // -------------------------------------------------------------------------
  useEffect(() => {
    const b = bridge();
    if (!b) {
      setError('Terminal IPC unavailable (running outside Electron).');
      return;
    }
    let mounted = true;
    let dataOff: (() => void) | null = null;
    let exitOff: (() => void) | null = null;
    let activeId: string | null = null;
    let spawnedAt = 0;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (!mounted) return;
      setUnavailable(false);
      setError(null);
      spawnedAt = Date.now();
      b.invoke('pty:spawn', { cwd, shell }).then(res => {
        const r = res as { sessionId?: string; error?: string };
        if (!mounted) return;
        if (r.error) { handleSpawnFailure(r.error); return; }
        if (r.sessionId) { activeId = r.sessionId; setSessionId(r.sessionId); }
      }).catch(err => {
        if (mounted) handleSpawnFailure(String(err));
      });
    };
    startSessionRef.current = startSession;

    const onData = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; data?: string };
      if (payload?.sessionId === activeId && typeof payload.data === 'string') {
        appendOutput(payload.data);
      }
    };
    const onExit = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; code?: number };
      if (payload?.sessionId !== activeId) return;
      const code = payload.code ?? 0;
      const ranMs = Date.now() - spawnedAt;
      flushTailBuffer();
      appendOutput(`\r\n[session exited code=${code}]\r\n`);
      activeId = null;
      if (!mounted) return;
      setSessionId(null);
      // -1 is our "shell unavailable" sentinel; a non-zero fast exit is also a
      // failed start. Either way retry (bounded). A clean/long-lived exit does
      // not loop — it just resets the retry budget for a manual restart.
      if (code === -1 || (code !== 0 && ranMs < FAST_EXIT_MS)) {
        handleSpawnFailure(`shell exited early (code ${code})`);
      } else {
        retriesRef.current = 0;
      }
    };

    if (b.on) {
      dataOff = b.on('pty:data', onData);
      exitOff = b.on('pty:exit', onExit);
    }

    if (autoSpawn) startSession();

    return () => {
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      if (backoffTimer) clearTimeout(backoffTimer);
      flushTailBuffer();
      mounted = false;
      startSessionRef.current = null;
      if (dataOff) dataOff();
      if (exitOff) exitOff();
      if (activeId) {
        b.invoke('pty:kill', { sessionId: activeId }).catch(() => { /* shutting down */ });
      }
    };
  }, [autoSpawn, cwd, shell, appendOutput, flushTailBuffer]);

  // Manual restart from the unavailable state — resets the retry budget.
  const handleRetry = useCallback(() => {
    retriesRef.current = 0;
    setUnavailable(false);
    setError(null);
    startSessionRef.current?.();
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
  const send = useCallback((text: string) => {
    const b = bridge();
    if (!b || !sessionId) return;
    // Echo locally so the line appears immediately
    appendOutput(`${text}\r\n`);
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
    b.invoke('pty:write', { sessionId, data: text + (isWindows ? '\r\n' : '\n') }).catch(() => { /* */ });
  }, [sessionId, appendOutput]);

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

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
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
    // It only fires while the dropdown is visible; Tab is intentionally left to
    // the existing completion below, so muscle memory is preserved.
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
      // Send SIGINT via control-char
      const b = bridge();
      if (b && sessionId) b.invoke('pty:write', { sessionId, data: '\x03' }).catch(() => {});
      setInput('');
    }
  }, [input, history, historyIdx, onClose, send, sessionId, handleDexInput, revSearch, revMatch, dexCompletionNames, appendOutput, showSuggest, dexSuggestions, suggestIdx, dexSuggestQuery, acceptSuggestion]);

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
        fontSize: 12,
        lineHeight: 1.45,
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      onClick={() => inputRef.current?.focus()}
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
        <span>Terminal {sessionId ? `· ${sessionId}` : unavailable ? '· unavailable' : error ? '· error' : '· starting…'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(unavailable || (!sessionId && error)) && (
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
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => setLines([])}
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
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: 'var(--space-2) 10px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}
      >
        {error && <div style={{ color: 'var(--color-error, #ff5f5f)' }}>{error}</div>}
        {lines.map(l => (
          <div key={l.id}>
            {l.spans.map((sp, i) => (
              <span key={i} style={{ color: sp.color, fontWeight: sp.bold ? 600 : 400 }}>{sp.text}</span>
            ))}
          </div>
        ))}
      </div>
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
  );
};

export default Terminal;
