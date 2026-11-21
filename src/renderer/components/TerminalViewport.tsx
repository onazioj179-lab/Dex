// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import { Terminal as Emulator } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

interface Props {
  active: boolean;
  fontSize: number;
  subscribe: (write: (data: string) => void) => () => void;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export default function TerminalViewport({ active, fontSize, subscribe, onInput, onResize }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const emulator = useRef<Emulator | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const search = useRef<SearchAddon | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<boolean | null>(null);
  const input = useRef(onInput);
  const resize = useRef(onResize);
  const initialFontSize = useRef(fontSize);
  input.current = onInput;
  resize.current = onResize;

  useEffect(() => {
    if (!host.current) return;
    const terminal = new Emulator({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: initialFontSize.current,
      theme: { background: '#0c0c0c', foreground: '#d0d0d0', cursor: '#d0d0d0' },
      scrollback: 8000,
      screenReaderMode: true,
      cursorBlink: false,
    });
    const addon = new FitAddon();
    terminal.loadAddon(addon);
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    terminal.open(host.current);
    emulator.current = terminal;
    fit.current = addon;
    search.current = searchAddon;
    const output = subscribe(data => terminal.write(data));
    const writes = terminal.onData(data => input.current(data));
    terminal.parser.registerOscHandler(52, () => true);
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        event.stopPropagation();
        setFindOpen(true);
        return false;
      }
      if (event.type !== 'keydown' || !event.ctrlKey || event.key.toLowerCase() !== 'c' || !terminal.hasSelection()) return true;
      event.preventDefault();
      void navigator.clipboard?.writeText(terminal.getSelection()).catch(() => {});
      return false;
    });
    return () => {
      output();
      writes.dispose();
      terminal.dispose();
      emulator.current = null;
      fit.current = null;
      search.current = null;
    };
  }, [subscribe]);

  useEffect(() => {
    const surface = host.current;
    const terminal = emulator.current;
    if (!active || !surface || !terminal) return;
    terminal.options.fontSize = fontSize;
    let frame = 0;
    let lastSize = '';
    const measure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (surface.clientWidth === 0 || surface.clientHeight === 0) return;
        const dimensions = fit.current?.proposeDimensions();
        if (!dimensions) return;
        const cols = Math.min(500, dimensions.cols);
        const rows = Math.min(300, dimensions.rows);
        const key = `${cols}:${rows}`;
        if (lastSize === key) return;
        lastSize = key;
        terminal.resize(cols, rows);
        resize.current(cols, rows);
      });
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(surface);
    measure();
    if (!findOpen) terminal.focus();
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, fontSize, subscribe, findOpen]);

  const find = (text: string, reverse = false) => {
    if (!text) {
      search.current?.clearDecorations();
      setFound(null);
      return;
    }
    setFound((reverse ? search.current?.findPrevious(text) : search.current?.findNext(text)) ?? false);
  };
  const closeFind = () => {
    search.current?.clearDecorations();
    setFindOpen(false);
  };

  return <div hidden={!active} style={{ display: active ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, padding: '4px 8px' }}>
    {findOpen && <div role="search" aria-label="Interactive terminal scrollback" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input autoFocus value={query} aria-label="Find in terminal scrollback" onChange={event => {
        setQuery(event.target.value);
        find(event.target.value);
      }} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Enter') find(query, event.shiftKey);
        if (event.key === 'Escape') closeFind();
      }} />
      {found === false && <span role="status">No matches</span>}
      <button type="button" onClick={() => find(query, true)}>Previous</button>
      <button type="button" onClick={() => find(query)}>Next</button>
      <button type="button" onClick={closeFind}>Close find</button>
    </div>}
    <div ref={host} aria-label="Interactive terminal" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }} />
  </div>;
}
