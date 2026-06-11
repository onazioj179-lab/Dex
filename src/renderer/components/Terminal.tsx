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
import React, { useCallback, useEffect, useRef, useState } from 'react';

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

export const Terminal: React.FC<TerminalProps> = ({ autoSpawn = true, cwd, shell, onClose, height }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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

    const onData = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; data?: string };
      if (payload?.sessionId === activeId && typeof payload.data === 'string') {
        appendOutput(payload.data);
      }
    };
    const onExit = (...args: unknown[]) => {
      const payload = args[args.length - 1] as { sessionId?: string; code?: number };
      if (payload?.sessionId === activeId) {
        flushTailBuffer();
        appendOutput(`\r\n[session exited code=${payload.code ?? 0}]\r\n`);
        if (mounted) setSessionId(null);
      }
    };

    if (b.on) {
      dataOff = b.on('pty:data', onData);
      exitOff = b.on('pty:exit', onExit);
    }

    if (autoSpawn) {
      b.invoke('pty:spawn', { cwd, shell }).then(res => {
        const r = res as { sessionId?: string; error?: string };
        if (!mounted) return;
        if (r.error) { setError(r.error); return; }
        if (r.sessionId) { activeId = r.sessionId; setSessionId(r.sessionId); }
      }).catch(err => {
        if (mounted) setError(String(err));
      });
    }

    return () => {
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      flushTailBuffer();
      mounted = false;
      if (dataOff) dataOff();
      if (exitOff) exitOff();
      if (activeId) {
        b.invoke('pty:kill', { sessionId: activeId }).catch(() => { /* shutting down */ });
      }
    };
  }, [autoSpawn, cwd, shell, appendOutput, flushTailBuffer]);

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

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input;
      if (value === '' && onClose) { onClose(); return; }
      setHistory(h => (value && h[h.length - 1] !== value ? [...h, value] : h));
      setHistoryIdx(null);
      setInput('');
      send(value);
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
  }, [input, history, historyIdx, onClose, send, sessionId]);

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
        <span>Terminal {sessionId ? `· ${sessionId}` : error ? '· error' : '· starting…'}</span>
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
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '8px 10px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}
      >
        {error && <div style={{ color: '#ff5f5f' }}>{error}</div>}
        {lines.map(l => (
          <div key={l.id}>
            {l.spans.map((sp, i) => (
              <span key={i} style={{ color: sp.color, fontWeight: sp.bold ? 600 : 400 }}>{sp.text}</span>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
        }}
      >
        <span style={{ color: '#3da66a', fontWeight: 600 }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
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
