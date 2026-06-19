/**
 * DEX Platform - Markdown Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Live preview markdown editor with syntax highlighting
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import DOMPurify from 'dompurify';
import { lintMarkdown } from '../../../shared/format/markdownLint';

const MarkdownEditor: React.FC = () => {
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [wordWrap, setWordWrap] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [fileName, setFileName] = useState('untitled.md');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Simple markdown to HTML parser
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

    // Checkboxes
    html = html.replace(/\[x\]/g, '[x]');
    html = html.replace(/\[ \]/g, '[ ]');

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
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [content]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); insertFormatting('**'); }
      if (e.key === 'i') { e.preventDefault(); insertFormatting('*'); }
      if (e.key === 'k') { e.preventDefault(); insertFormatting('[', '](url)'); }
      if (e.key === 'e') { e.preventDefault(); insertFormatting('`'); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [insertFormatting]);

  const stats = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    const lines = content.split('\n').length;
    return { words, chars, lines };
  }, [content]);

  const lintIssues = useMemo(() => lintMarkdown(content), [content]);

  const exportMd = useCallback(() => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, fileName]);

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
          <button style={s.fmtBtn} onClick={() => insertFormatting('`')} title="Code (Ctrl+E)" aria-label="Inline code">&lt;/&gt;</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('[', '](url)')} title="Link (Ctrl+K)" aria-label="Link">LNK</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('# ', '')} title="Heading" aria-label="Heading">H</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('- ', '')} title="List" aria-label="List">•</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('> ', '')} title="Quote" aria-label="Blockquote">"</button>
          <button style={s.fmtBtn} onClick={() => insertFormatting('```\n', '\n```')} title="Code block" aria-label="Code block">{ '{ }' }</button>
        </div>
        <div style={s.toolbarRight}>
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
          <button style={{ ...s.fmtBtn, color: 'var(--color-accent, #4a9eff)' }} onClick={exportMd} title="Download .md" aria-label="Export markdown">
            DL
          </button>
        </div>
      </div>

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
          <div style={{ ...s.pane, borderRight: viewMode === 'split' ? '1px solid var(--color-border, rgba(255,255,255,0.08))' : 'none' }}>
            <textarea
              ref={editorRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{ ...s.editor, whiteSpace: wordWrap ? 'pre-wrap' : 'pre' }}
              spellCheck={false}
              aria-label="Markdown editor"
            />
          </div>
        )}
        {viewMode !== 'editor' && (
          <div style={s.pane}>
            <div
              style={s.preview}
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
    width: 28, height: 28, borderRadius: 4, border: 'none',
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
    outline: 'none', tabSize: 2,
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
