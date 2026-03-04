/**
 * DEX Rich Text Editor
 * Markdown-style formatting for notes
 * Bold, Italic, Headers, Lists, Code blocks
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';

// ==================== TYPES ====================

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: (text: string, start: number, end: number) => { text: string; cursor: number };
}

// ==================== ICONS ====================

const Icons = {
  bold: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>,
  italic: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>,
  underline: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>,
  strikethrough: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>,
  h1: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h8"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M17 12l3-2v8"/></svg>,
  h2: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h8"/><path d="M4 6v12"/><path d="M12 6v12"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>,
  list: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
  orderedList: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>,
  quote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>,
  code: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  link: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  checkbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="9 11 12 14 22 4"/></svg>,
  divider: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"/></svg>,
};

// ==================== TOOLBAR ACTIONS ====================

const createToolbarButtons = (): ToolbarButton[] => [
  {
    id: 'bold',
    label: 'Bold',
    icon: Icons.bold,
    shortcut: 'Ctrl+B',
    action: (text, start, end) => {
      const selected = text.slice(start, end);
      const before = text.slice(0, start);
      const after = text.slice(end);
      const wrapped = `**${selected}**`;
      return { text: before + wrapped + after, cursor: start + 2 + selected.length };
    },
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: Icons.italic,
    shortcut: 'Ctrl+I',
    action: (text, start, end) => {
      const selected = text.slice(start, end);
      const before = text.slice(0, start);
      const after = text.slice(end);
      const wrapped = `*${selected}*`;
      return { text: before + wrapped + after, cursor: start + 1 + selected.length };
    },
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    icon: Icons.strikethrough,
    action: (text, start, end) => {
      const selected = text.slice(start, end);
      const before = text.slice(0, start);
      const after = text.slice(end);
      const wrapped = `~~${selected}~~`;
      return { text: before + wrapped + after, cursor: start + 2 + selected.length };
    },
  },
  {
    id: 'h1',
    label: 'Heading 1',
    icon: Icons.h1,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '# ' + after, cursor: start + 2 };
    },
  },
  {
    id: 'h2',
    label: 'Heading 2',
    icon: Icons.h2,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '## ' + after, cursor: start + 3 };
    },
  },
  {
    id: 'list',
    label: 'Bullet List',
    icon: Icons.list,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '- ' + after, cursor: start + 2 };
    },
  },
  {
    id: 'orderedList',
    label: 'Numbered List',
    icon: Icons.orderedList,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '1. ' + after, cursor: start + 3 };
    },
  },
  {
    id: 'checkbox',
    label: 'Checkbox',
    icon: Icons.checkbox,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '- [ ] ' + after, cursor: start + 6 };
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: Icons.quote,
    action: (text, start, _end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      return { text: before + '> ' + after, cursor: start + 2 };
    },
  },
  {
    id: 'code',
    label: 'Code',
    icon: Icons.code,
    shortcut: 'Ctrl+`',
    action: (text, start, end) => {
      const selected = text.slice(start, end);
      const before = text.slice(0, start);
      const after = text.slice(end);
      const hasNewlines = selected.includes('\n');
      const wrapped = hasNewlines ? `\`\`\`\n${selected}\n\`\`\`` : `\`${selected}\``;
      return { text: before + wrapped + after, cursor: start + wrapped.length };
    },
  },
  {
    id: 'link',
    label: 'Link',
    icon: Icons.link,
    shortcut: 'Ctrl+K',
    action: (text, start, end) => {
      const selected = text.slice(start, end);
      const before = text.slice(0, start);
      const after = text.slice(end);
      const wrapped = `[${selected}](url)`;
      return { text: before + wrapped + after, cursor: start + selected.length + 3 };
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    icon: Icons.divider,
    action: (text, start, _end) => {
      const before = text.slice(0, start);
      const after = text.slice(start);
      return { text: before + '\n---\n' + after, cursor: start + 5 };
    },
  },
];

// ==================== STYLES ====================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-primary)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
    padding: '8px 12px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border)',
  },
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    transition: 'background 0.15s, color 0.15s',
  },
  toolbarBtnHover: {
    background: 'var(--color-bg-glass)',
    color: 'var(--color-text-primary)',
  },
  toolbarSeparator: {
    width: '1px',
    height: '20px',
    background: 'var(--color-border)',
    margin: '6px 4px',
  },
  editorWrapper: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  editor: {
    flex: 1,
    padding: '16px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: '14px',
    lineHeight: '1.6',
    fontFamily: 'var(--font-mono, "SF Mono", Monaco, Consolas, monospace)',
    color: 'var(--color-text-primary)',
    overflow: 'auto',
  },
  preview: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
    borderLeft: '1px solid var(--color-border)',
    fontSize: '14px',
    lineHeight: '1.6',
    color: 'var(--color-text-primary)',
  },
  wordCount: {
    padding: '6px 12px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '16px',
  },
};

// ==================== MARKDOWN PREVIEW ====================

const renderMarkdown = (text: string): string => {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-glass);padding:2px 4px;border-radius:3px;">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--color-accent);">$1</a>')
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gm, '<div style="margin:4px 0;"><input type="checkbox" checked disabled style="margin-right:8px;"/>$1</div>')
    .replace(/^- \[ \] (.+)$/gm, '<div style="margin:4px 0;"><input type="checkbox" disabled style="margin-right:8px;"/>$1</div>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    // Quotes
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--color-accent);padding-left:12px;margin:8px 0;color:var(--color-text-secondary);">$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--color-border);margin:16px 0;"/>')
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
    .replace(/\n/g, '<br/>');

  return `<p style="margin:8px 0;">${html}</p>`;
};

// ==================== COMPONENT ====================

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start writing...',
  autoFocus = false,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolbarButtons = createToolbarButtons();

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Apply toolbar action
  const applyAction = useCallback((button: ToolbarButton) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const { text, cursor } = button.action(value, start, end);
    
    onChange(text);
    
    // Restore cursor position
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [value, onChange]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const shortcutMap: Record<string, string> = {
      'b': 'bold',
      'i': 'italic',
      '`': 'code',
    };

    const buttonId = shortcutMap[e.key.toLowerCase()];
    if (buttonId) {
      e.preventDefault();
      const button = toolbarButtons.find(b => b.id === buttonId);
      if (button) applyAction(button);
    }
  }, [toolbarButtons, applyAction]);

  // Count words and characters
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        {toolbarButtons.map((button, index) => (
          <React.Fragment key={button.id}>
            {(index === 3 || index === 5 || index === 8 || index === 10) && (
              <div style={styles.toolbarSeparator} />
            )}
            <button
              style={{
                ...styles.toolbarBtn,
                ...(hoveredBtn === button.id ? styles.toolbarBtnHover : {}),
              }}
              onClick={() => applyAction(button)}
              onMouseEnter={() => setHoveredBtn(button.id)}
              onMouseLeave={() => setHoveredBtn(null)}
              title={`${button.label}${button.shortcut ? ` (${button.shortcut})` : ''}`}
            >
              {button.icon}
            </button>
          </React.Fragment>
        ))}
        
        <div style={{ flex: 1 }} />
        
        <button
          style={{
            ...styles.toolbarBtn,
            width: 'auto',
            padding: '0 12px',
            fontSize: '12px',
            fontWeight: 500,
            ...(showPreview ? { background: 'var(--color-accent)', color: '#fff' } : {}),
          }}
          onClick={() => setShowPreview(!showPreview)}
          title="Toggle Preview"
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      <div style={styles.editorWrapper}>
        {!showPreview ? (
          <textarea
            ref={textareaRef}
            style={styles.editor}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck
          />
        ) : (
          <div 
            style={styles.preview}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(value)) }}
          />
        )}
      </div>

      <div style={styles.wordCount}>
        <span>{wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
};

// ==================== INLINE TOOLBAR ====================

interface InlineToolbarProps {
  selection: { x: number; y: number } | null;
  onFormat: (format: string) => void;
}

export const InlineToolbar: React.FC<InlineToolbarProps> = ({ selection, onFormat }) => {
  if (!selection) return null;

  const inlineStyles: Record<string, React.CSSProperties> = {
    container: {
      position: 'fixed',
      left: selection.x,
      top: selection.y - 44,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '2px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
    },
    btn: {
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <div style={inlineStyles.container}>
      <button style={inlineStyles.btn} onClick={() => onFormat('bold')}>{Icons.bold}</button>
      <button style={inlineStyles.btn} onClick={() => onFormat('italic')}>{Icons.italic}</button>
      <button style={inlineStyles.btn} onClick={() => onFormat('link')}>{Icons.link}</button>
      <button style={inlineStyles.btn} onClick={() => onFormat('code')}>{Icons.code}</button>
    </div>
  );
};

export default RichTextEditor;
