/**
 * DEX Platform - Markdown Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Live preview markdown editor with syntax highlighting
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import DOMPurify from 'dompurify';
import { lintMarkdown } from '../../../shared/format/markdownLint';
import { sendToNotes } from '../../services/sendTo';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';

const STORAGE_KEY = 'dex-markdown-content';
const FILE_KEY = 'dex-markdown-filename';

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

const MarkdownEditor: React.FC = () => {
  const [content, setContent] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [wordWrap, setWordWrap] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [fileName, setFileName] = useState(() => {
    try { return localStorage.getItem(FILE_KEY) || 'untitled.md'; } catch { return 'untitled.md'; }
  });

  // Find / replace state
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // Guards re-entrant scroll events while we mirror one pane onto the other.
  const syncingFrom = useRef<'editor' | 'preview' | null>(null);

  // Persist content + filename (debounced) so a reload keeps the document.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, content); } catch { /* ignore */ }
    }, 300);
    return () => window.clearTimeout(id);
  }, [content]);
  useEffect(() => {
    try { localStorage.setItem(FILE_KEY, fileName); } catch { /* ignore */ }
  }, [fileName]);

  // Document outline (v6 Track G): parse ATX headings + their source offset so the
  // TOC can jump the editor caret to a section. Pure derivation from content.
  const headings = useMemo(() => {
    const out: { level: number; text: string; index: number }[] = [];
    const re = /^(#{1,6})\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out.push({ level: m[1].length, text: m[2].trim(), index: m.index });
    return out;
  }, [content]);

  const jumpToHeading = (index: number) => {
    const ta = editorRef.current;
    if (!ta) return;
    if (viewMode === 'preview') setViewMode('split');
    ta.focus();
    ta.setSelectionRange(index, index); // Chromium scrolls the caret into view
  };

  // Build the find regex (shared by match-count + replace-all). Returns null on
  // an empty query or an invalid user-supplied pattern in regex mode.
  const buildFindRegex = useCallback((): RegExp | null => {
    if (!findQuery) return null;
    const flags = 'g' + (caseSensitive ? '' : 'i');
    try {
      const source = useRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(source, flags);
    } catch {
      return null; // invalid regex while typing -> treat as no match
    }
  }, [findQuery, useRegex, caseSensitive]);

  const matchCount = useMemo(() => {
    const re = buildFindRegex();
    if (!re) return 0;
    return (content.match(re) || []).length;
  }, [buildFindRegex, content]);

  const replaceAll = useCallback(() => {
    const re = buildFindRegex();
    if (!re) { toast('info', 'No matches to replace'); return; }
    const count = (content.match(re) || []).length;
    if (count === 0) { toast('info', 'No matches to replace'); return; }
    // $-substitution in replacement is only meaningful in regex mode; escape it
    // for literal mode so "$1" in the replacement field stays literal.
    const repl = useRegex ? replaceValue : replaceValue.replace(/\$/g, '$$$$');
    setContent(content.replace(re, repl));
    toast('success', `Replaced ${count} match${count === 1 ? '' : 'es'}`);
  }, [buildFindRegex, content, replaceValue, useRegex]);

  const renderMarkdown = useMemo(() => {
    let html = content;
    // Sanitize HTML entities to prevent XSS
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks (before other processing)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:var(--color-bg-hover, rgba(255,255,255,0.06));padding:12px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5"><code>${code.trim()}</code></pre>`
    );

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-hover, rgba(255,255,255,0.08));padding:2px 6px;border-radius:3px;font-size:0.9em">$1</code>');

    // Headings
    html = html.replace(/^###### (.+)$/gm, '<h6 style="font-size:13px;margin:12px 0 6px;color:var(--color-text-secondary)">$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5 style="font-size:14px;margin:12px 0 6px">$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4 style="font-size:15px;margin:14px 0 8px">$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:17px;margin:16px 0 8px">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:20px;margin:20px 0 10px;padding-bottom:4px;border-bottom:1px solid var(--color-border, rgba(255,255,255,0.1))">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:26px;margin:24px 0 12px;font-weight:700">$1</h1>');

    // GitHub-flavored task list checkboxes. Render BEFORE generic bullet lists so
    // the checkbox markup wins. data-line carries the 0-based source line index so
    // a click in the preview can flip the matching "- [ ] / - [x]" in the source.
    {
      // Map each task entry back to its RAW source line index. We match against
      // raw lines (not the entity-escaped html) and track a cursor so duplicate
      // task lines each resolve to a distinct, correct source index.
      const rawTaskLines: number[] = [];
      content.split('\n').forEach((l, i) => { if (/^- \[[ xX]\] .+$/.test(l)) rawTaskLines.push(i); });
      let taskCursor = 0;
      html = html.replace(/^- \[([ xX])\] (.+)$/gm, (_full, mark: string, label: string) => {
        const checked = mark.toLowerCase() === 'x';
        const lineIdx = taskCursor < rawTaskLines.length ? rawTaskLines[taskCursor++] : -1;
        // label is already entity-escaped here (we ran on escaped html), so it is
        // safe to embed directly without re-escaping.
        const idAttr = lineIdx >= 0 ? ` data-task-line="${lineIdx}"` : '';
        return `<div style="display:flex;align-items:flex-start;gap:8px;margin:3px 0;margin-left:20px"><input type="checkbox"${checked ? ' checked' : ''}${idAttr} style="margin-top:4px;cursor:pointer" /><span${checked ? ' style="opacity:0.6;text-decoration:line-through"' : ''}>${label}</span></div>`;
      });
    }

    // Bold + Italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--color-accent, #4a9eff);margin:8px 0;padding:4px 12px;color:var(--color-text-secondary)">$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--color-border, rgba(255,255,255,0.1));margin:16px 0"/>');

    // Tables
    html = html.replace(/^\|(.*)\|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-:]+$/.test(c))) return ''; // separator row
      const tag = 'td';
      return `<tr>${cells.map(c => `<${tag} style="padding:6px 12px;border:1px solid var(--color-border, rgba(255,255,255,0.1))">${c.trim()}</${tag}>`).join('')}</tr>`;
    });
    html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
      if (match.includes('<tr>')) return `<table style="border-collapse:collapse;margin:8px 0;width:100%">${match}</table>`;
      return match;
    });

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li style="margin:2px 0;margin-left:20px">$1</li>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:2px 0;margin-left:20px;list-style:decimal">$1</li>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--color-accent, #4a9eff);text-decoration:none">$1</a>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;border-radius:6px;margin:8px 0"/>');

    // Paragraphs (preserve line breaks)
    html = html.replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.6">');
    html = `<p style="margin:8px 0;line-height:1.6">${html}</p>`;

    // Sanitize before it reaches dangerouslySetInnerHTML: markdown link/image
    // URLs are untrusted, so block javascript:/data-script URLs, inline event
    // handlers, and attribute injection while preserving the safe formatting
    // markup (DOMPurify keeps style attrs + standard tags this renderer emits).
    // USE_PROFILES html-only: this renderer emits plain HTML, never SVG/MathML,
    // so disallowing those namespaces removes that whole attack surface for free.
    // ADD_ATTR keeps the data-task-line hook + checkbox checked state that the
    // task-list toggle relies on (DOMPurify strips unknown data-* otherwise).
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['data-task-line', 'checked', 'type'] });
  }, [content]);

  // Toggle a task list checkbox from the rendered preview. Flips the source line's
  // "- [ ]" <-> "- [x]" by line index carried on the checkbox's data attribute.
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' || (target as HTMLInputElement).type !== 'checkbox') return;
    const lineAttr = target.getAttribute('data-task-line');
    if (lineAttr == null) return;
    e.preventDefault();
    const lineIdx = parseInt(lineAttr, 10);
    if (Number.isNaN(lineIdx)) return;
    setContent(prev => {
      const lines = prev.split('\n');
      const line = lines[lineIdx];
      if (line == null) return prev;
      if (/^- \[ \] /.test(line)) lines[lineIdx] = line.replace(/^- \[ \] /, '- [x] ');
      else if (/^- \[[xX]\] /.test(line)) lines[lineIdx] = line.replace(/^- \[[xX]\] /, '- [ ] ');
      else return prev;
      return lines.join('\n');
    });
  }, []);

  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = content;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
    setContent(newText);
    setTimeout(() => {
      el.focus();
      el.selectionStart = start + prefix.length;
      el.selectionEnd = end + prefix.length;
    }, 0);
  }, [content]);

  // Insert a block snippet at the start of the current line(s). Used by the
  // list / quote / heading toolbar actions where wrapping a selection is wrong.
  const insertBlock = useCallback((makeLine: (line: string, i: number) => string) => {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = content;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const block = text.substring(lineStart, end);
    const transformed = block.split('\n').map(makeLine).join('\n');
    const newText = text.substring(0, lineStart) + transformed + text.substring(end);
    setContent(newText);
    setTimeout(() => {
      el.focus();
      el.selectionStart = lineStart;
      el.selectionEnd = lineStart + transformed.length;
    }, 0);
  }, [content]);

  const insertSnippet = useCallback((snippet: string) => {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = content;
    const newText = text.substring(0, start) + snippet + text.substring(end);
    setContent(newText);
    setTimeout(() => {
      el.focus();
      const pos = start + snippet.length;
      el.selectionStart = pos;
      el.selectionEnd = pos;
    }, 0);
  }, [content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); insertFormatting('**'); }
      if (e.key === 'i') { e.preventDefault(); insertFormatting('*'); }
      if (e.key === 'k') { e.preventDefault(); insertFormatting('[', '](url)'); }
      if (e.key === 'e') { e.preventDefault(); insertFormatting('`'); }
      if (e.key === 'f') { e.preventDefault(); setShowFind(true); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [insertFormatting]);

  const stats = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    const lines = content.split('\n').length;
    // Average adult reading speed ~ 200 wpm.
    const minutes = Math.max(1, Math.round(words / 200));
    const readTime = words === 0 ? '0 min' : `${minutes} min`;
    return { words, chars, lines, readTime };
  }, [content]);

  const lintIssues = useMemo(() => lintMarkdown(content), [content]);

  // -- uki context: surface the open document to the assistant. Registered once
  // on mount; a latest-value ref (refreshed each render) keeps the pure resolver
  // reading live state without re-registering. "Unsaved" compares the live
  // content against the value last persisted to localStorage (debounced save).
  const ukiCtxRef = useRef({ fileName, content, words: stats.words });
  useEffect(() => { ukiCtxRef.current = { fileName, content, words: stats.words }; });
  useEffect(() => {
    registerUkiAppContext('markdown', () => {
      const c = ukiCtxRef.current;
      let unsaved = false;
      try { unsaved = (localStorage.getItem(STORAGE_KEY) ?? '') !== c.content; } catch { /* ignore */ }
      return {
        appId: 'markdown',
        currentFile: c.fileName,
        custom: {
          fileName: c.fileName,
          words: c.words,
          chars: c.content.length,
          unsaved,
        },
      };
    });
    // Let UKI read the open markdown document as a callable action (read-only).
    registerUkiAppAction('markdown', {
      id: 'markdown.readDocument',
      description: 'read the full markdown text currently open in the editor.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      if (!c.content) return 'The markdown document is empty.';
      return `# ${c.fileName}\n${c.content}`.slice(0, 6000);
    });
    return () => {
      unregisterUkiAppContext('markdown');
      unregisterUkiAppAction('markdown.readDocument');
    };
  }, []);

  // Proportional scroll sync between editor + preview panes.
  const handleEditorScroll = useCallback(() => {
    if (viewMode !== 'split') return;
    if (syncingFrom.current === 'preview') return;
    const ed = editorRef.current;
    const pv = previewRef.current;
    if (!ed || !pv) return;
    syncingFrom.current = 'editor';
    const edMax = ed.scrollHeight - ed.clientHeight;
    const pvMax = pv.scrollHeight - pv.clientHeight;
    const ratio = edMax > 0 ? ed.scrollTop / edMax : 0;
    pv.scrollTop = ratio * pvMax;
    requestAnimationFrame(() => { syncingFrom.current = null; });
  }, [viewMode]);

  const handlePreviewScroll = useCallback(() => {
    if (viewMode !== 'split') return;
    if (syncingFrom.current === 'editor') return;
    const ed = editorRef.current;
    const pv = previewRef.current;
    if (!ed || !pv) return;
    syncingFrom.current = 'preview';
    const edMax = ed.scrollHeight - ed.clientHeight;
    const pvMax = pv.scrollHeight - pv.clientHeight;
    const ratio = pvMax > 0 ? pv.scrollTop / pvMax : 0;
    ed.scrollTop = ratio * edMax;
    requestAnimationFrame(() => { syncingFrom.current = null; });
  }, [viewMode]);

  const exportMd = useCallback(() => {
    try {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', 'Markdown downloaded');
    } catch {
      toast('error', 'Could not download file');
    }
  }, [content, fileName]);

  const copyHtml = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(renderMarkdown);
      toast('success', 'HTML copied to clipboard');
    } catch {
      toast('error', 'Could not copy HTML');
    }
  }, [renderMarkdown]);

  const handleSendToNotes = useCallback(() => {
    if (!content.trim()) { toast('info', 'Nothing to send'); return; }
    void sendToNotes(content, fileName.replace(/\.md$/, ''));
  }, [content, fileName]);

  const tableSnippet = '\n| Column A | Column B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n';

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.toolbarLeft}>
          <input
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            style={s.fileNameInput}
            aria-label="File name"
          />
          <div style={s.divider} />
          <button style={s.fmtBtn} onClick={() => insertFormatting('**')} title="Bold (Ctrl+B)" aria-label="Bold"><strong>B</strong></button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('*')} title="Italic (Ctrl+I)" aria-label="Italic"><em>I</em></button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('`')} title="Inline code (Ctrl+E)" aria-label="Inline code">&lt;/&gt;</button>
          <button style={s.fmtBtn} onClick={() => insertSnippet('```\n\n```\n')} title="Code block" aria-label="Code block">{ '{ }' }</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('[', '](url)')} title="Link (Ctrl+K)" aria-label="Link">LNK</button>
          <button style={s.fmtBtn} onClick={() => insertBlock(l => l.startsWith('# ') ? l : `# ${l}`)} title="Heading" aria-label="Heading">H</button>
          <button style={s.fmtBtn} onClick={() => insertBlock(l => l.startsWith('- ') ? l : `- ${l}`)} title="Bullet list" aria-label="Bullet list">•</button>
          <button style={s.fmtBtn} onClick={() => insertBlock((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, '')}`)} title="Numbered list" aria-label="Numbered list">1.</button>
          <button style={s.fmtBtn} onClick={() => insertBlock(l => l.startsWith('> ') ? l : `> ${l}`)} title="Blockquote" aria-label="Blockquote">"</button>
          <button style={s.fmtBtn} onClick={() => insertSnippet(tableSnippet)} title="Table" aria-label="Table">⊞</button>
        </div>
        <div style={s.toolbarRight}>
          <button style={{ ...s.fmtBtn, ...(showFind ? { color: 'var(--color-accent, #4a9eff)' } : {}) }} onClick={() => setShowFind(v => !v)} title="Find / replace (Ctrl+F)" aria-label="Find and replace" aria-pressed={showFind}>⌕</button>
          <button style={{ ...s.fmtBtn, ...(showToc ? { color: 'var(--color-accent, #4a9eff)' } : {}) }} onClick={() => setShowToc(v => !v)} title="Outline" aria-label="Toggle outline" aria-pressed={showToc}>TOC</button>
          <div style={s.viewToggle}>
            {(['editor', 'split', 'preview'] as const).map(mode => (
              <button
                key={mode}
                style={{ ...s.viewBtn, background: viewMode === mode ? 'var(--color-accent-soft, rgba(74,158,255,0.2))' : 'transparent', color: viewMode === mode ? 'var(--color-accent, #4a9eff)' : 'var(--color-text-secondary)' }}
                onClick={() => setViewMode(mode)}
                aria-label={`${mode} view`}
              >
                {mode === 'editor' ? 'EDIT' : mode === 'split' ? 'SPLIT' : 'VIEW'}
              </button>
            ))}
          </div>
          <button style={s.fmtBtn} onClick={() => setWordWrap(!wordWrap)} title="Toggle word wrap" aria-label="Toggle word wrap">
            {wordWrap ? '↩' : '→'}
          </button>
          <div style={s.divider} />
          <button style={s.fmtBtn} onClick={copyHtml} title="Copy rendered HTML" aria-label="Copy HTML">HTML</button>
          <button style={s.fmtBtn} onClick={handleSendToNotes} title="Send to Notes" aria-label="Send to Notes">→N</button>
          <button style={{ ...s.fmtBtn, color: 'var(--color-accent, #4a9eff)' }} onClick={exportMd} title="Download .md" aria-label="Export markdown">
            DL
          </button>
        </div>
      </div>

      {/* Find / replace bar */}
      {showFind && (
        <div style={s.findBar}>
          <input
            value={findQuery}
            onChange={e => setFindQuery(e.target.value)}
            placeholder="Find"
            style={s.findInput}
            aria-label="Find"
            autoFocus
          />
          <input
            value={replaceValue}
            onChange={e => setReplaceValue(e.target.value)}
            placeholder="Replace"
            style={s.findInput}
            aria-label="Replace with"
          />
          <span style={s.matchCount}>{matchCount} match{matchCount === 1 ? '' : 'es'}</span>
          <button
            style={{ ...s.findToggle, ...(useRegex ? s.findToggleOn : {}) }}
            onClick={() => setUseRegex(v => !v)}
            title="Use regular expression"
            aria-label="Use regular expression"
            aria-pressed={useRegex}
          >.*</button>
          <button
            style={{ ...s.findToggle, ...(caseSensitive ? s.findToggleOn : {}) }}
            onClick={() => setCaseSensitive(v => !v)}
            title="Match case"
            aria-label="Match case"
            aria-pressed={caseSensitive}
          >Aa</button>
          <button style={s.findAction} onClick={replaceAll} disabled={matchCount === 0}>Replace all</button>
          <button style={s.findClose} onClick={() => setShowFind(false)} aria-label="Close find">✕</button>
        </div>
      )}

      {/* Editor / Preview Panes */}
      <div style={s.panes}>
        {showToc && (
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--color-border, rgba(255,255,255,0.08))', overflow: 'auto', padding: 'var(--space-2)' }}>
            <div className="dex-label-caps" style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '4px 6px' }}>Outline</div>
            {headings.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 6px' }}>No headings yet</div>
            ) : headings.map((h, i) => (
              <button
                key={i}
                onClick={() => jumpToHeading(h.index)}
                title={h.text}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', paddingLeft: 6 + (h.level - 1) * 10, background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
        {viewMode !== 'preview' && (
          <div style={{ ...s.pane, borderRight: viewMode === 'split' ? '1px solid var(--color-border, rgba(255,255,255,0.08))' : 'none', overflow: 'hidden' }}>
            <textarea
              ref={editorRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onScroll={handleEditorScroll}
              style={{ ...s.editor, whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }}
              spellCheck={false}
              aria-label="Markdown editor"
            />
          </div>
        )}
        {viewMode !== 'editor' && (
          <div ref={previewRef} style={s.pane} onScroll={handlePreviewScroll}>
            <div
              style={s.preview}
              onClick={handlePreviewClick}
              dangerouslySetInnerHTML={{ __html: renderMarkdown }}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={s.statusBar}>
        <span>{stats.words} words</span>
        <span>{stats.chars} chars</span>
        <span>{stats.lines} lines</span>
        <span>{stats.readTime} read</span>
        {lintIssues.length > 0 && (
          <span
            style={{ color: 'var(--color-warning)', cursor: 'default' }}
            title={lintIssues.map(i => `Line ${i.line}: ${i.message}`).join('\n')}
          >
            {lintIssues.length} issue{lintIssues.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px var(--space-3)', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
    flexShrink: 0, gap: 'var(--space-2)',
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 4 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 6 },
  fileNameInput: {
    background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-family)',
    outline: 'none', width: 130, padding: '4px 6px',
  },
  divider: {
    width: 1, height: 18, background: 'var(--color-border, rgba(255,255,255,0.1))', margin: '0 4px',
  },
  fmtBtn: {
    minWidth: 28, height: 28, padding: '0 4px', borderRadius: 4, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-family)',
  },
  viewToggle: {
    display: 'flex', background: 'var(--color-bg-elevated)',
    borderRadius: 4, padding: 2,
  },
  viewBtn: {
    padding: '4px var(--space-2)', borderRadius: 3, border: 'none',
    fontSize: 12, cursor: 'pointer',
  },
  findBar: {
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '6px var(--space-3)',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
    background: 'var(--color-bg-elevated)',
  },
  findInput: {
    background: 'var(--color-bg-base)', border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 13,
    padding: '4px 8px', outline: 'none', width: 160, fontFamily: 'var(--font-family)',
  },
  matchCount: { fontSize: 11, color: 'var(--color-text-secondary)', minWidth: 64 },
  findToggle: {
    width: 26, height: 26, borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)',
  },
  findToggleOn: {
    background: 'var(--color-accent-soft, rgba(74,158,255,0.2))', color: 'var(--color-accent, #4a9eff)',
    borderColor: 'var(--color-accent, #4a9eff)',
  },
  findAction: {
    padding: '4px 10px', borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    background: 'transparent', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer',
    fontFamily: 'var(--font-family)',
  },
  findClose: {
    marginLeft: 'auto', width: 26, height: 26, borderRadius: 4, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer',
  },
  panes: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },
  pane: {
    flex: 1, overflow: 'auto', minWidth: 0,
  },
  editor: {
    width: '100%', height: '100%', resize: 'none',
    background: 'transparent', border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 14, lineHeight: 1.6, padding: 'var(--space-4) var(--space-5)',
    fontFamily: 'var(--font-mono)',
    outline: 'none', tabSize: 2, overflow: 'auto',
  },
  preview: {
    padding: 'var(--space-4) var(--space-6)', fontSize: 14, lineHeight: 1.7,
    color: 'var(--color-text-primary)',
  },
  statusBar: {
    display: 'flex', gap: 'var(--space-4)', padding: '4px var(--space-4)',
    borderTop: '1px solid var(--color-border, rgba(255,255,255,0.08))',
    fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0,
  },
};

export default memo(MarkdownEditor);
