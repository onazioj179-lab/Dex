// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useEffect, useRef, useState } from 'react';
import { Terminal as Emulator } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import DexIcon from './DexIcon';
import { answerUkiIdentity, buildSystemPrompt } from '../uki/identity';
import { answerLocalSystemQuestion } from '../uki/systemAnswers';
import { askConfiguredLLM } from '../uki/providers/connect';
import type { ChatMessage } from '../uki/providers/types';

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
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const request = useRef<AbortController | null>(null);
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
      theme: { background: '#0c0c0c', foreground: '#e0e5ec', cursor: '#dceaff',
        selectionBackground: '#273f60', red: '#ff8484', green: '#8bdcb2', yellow: '#f0c987',
        blue: '#8ebcff', magenta: '#d9a8ff', cyan: '#82dce3', brightBlack: '#8290a1' },
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

  useEffect(() => () => request.current?.abort(), []);

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
    if (!findOpen && !chatOpen) terminal.focus();
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, fontSize, subscribe, findOpen, chatOpen]);

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

  const ask = async () => {
    const content = question.trim();
    if (!content || request.current) return;
    const controller = new AbortController();
    const user: ChatMessage = { role: 'user', content };
    const history = chat.slice(-8);
    const identity = answerUkiIdentity(content);
    setChat([...history, user]);
    setQuestion('');
    request.current = controller;
    setAsking(true);
    try {
      const answer = identity ?? await answerLocalSystemQuestion(content) ?? await askConfiguredLLM(content,
        buildSystemPrompt({ foregroundAppId: 'terminal' }) +
        '\nYou are replying in terminal chat. Explain output and shell concepts. Replies are advisory text.',
        { history, chatOptions: { maxTokens: 700 },
          fetchImpl: (url, init) => fetch(url, { ...init, signal: controller.signal }) });
      if (!controller.signal.aborted) {
        setChat([...history, user, { role: 'assistant', content: answer ?? 'No response is available. Check your UKI provider.' }]);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setAsking(false);
      }
    }
  };

  return <div hidden={!active} style={{ display: active ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, padding: '4px 8px' }}>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
      <button type="button" aria-expanded={chatOpen} onClick={() => setChatOpen(value => !value)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '4px 12px' }}>
        <DexIcon name="message-circle" size={13} /> UKI chat
      </button>
    </div>
    {chatOpen && <section aria-label="Terminal UKI chat" style={{ display: 'grid', gap: 8, padding: 8, border: '1px solid var(--color-border)' }}>
      <div aria-live="polite" style={{ overflow: 'auto', maxHeight: 128, whiteSpace: 'pre-wrap', fontSize: 12 }}>
        {chat.map((message, index) => <p key={index} style={{ marginBlock: 4 }}>
          <strong>{message.role === 'assistant' ? 'UKI' : 'You'}</strong>{' '}{message.content}
        </p>)}
      </div>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={event => { event.preventDefault(); void ask(); }}>
        <input autoFocus maxLength={4000} aria-label="Ask UKI in Terminal" value={question} onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => event.stopPropagation()} placeholder="Ask UKI" style={{ flex: 1, minWidth: 0 }} />
        <button disabled={asking || !question.trim()} type="submit">{asking ? 'Asking…' : 'Send'}</button>
      </form>
    </section>}
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
