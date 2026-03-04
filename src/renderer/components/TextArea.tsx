/**
 * DEX TextArea Component
 * Multi-line text input with auto-resize
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';

// ==================== TYPES ====================

interface TextAreaProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  rows?: number;
  maxRows?: number;
  minRows?: number;
  autoResize?: boolean;
  maxLength?: number;
  showCount?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  name?: string;
  id?: string;
}

interface MarkdownEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showPreview?: boolean;
  minHeight?: number;
}

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  language?: string;
  placeholder?: string;
  disabled?: boolean;
  lineNumbers?: boolean;
  minHeight?: number;
}

interface MentionTextAreaProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  mentions?: { id: string; name: string; avatar?: string }[];
  onMention?: (mention: { id: string; name: string }) => void;
  trigger?: string;
}

// ==================== TEXTAREA ====================

export const TextArea: React.FC<TextAreaProps> = ({
  value: controlledValue,
  defaultValue = '',
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled = false,
  readOnly = false,
  rows = 4,
  maxRows = 10,
  minRows = 2,
  autoResize = true,
  maxLength,
  showCount = false,
  resize = 'vertical',
  size = 'md',
  error,
  name,
  id,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  useEffect(() => {
    if (autoResize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';

      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const minHeight = lineHeight * minRows;
      const maxHeight = lineHeight * maxRows;

      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

      textarea.style.height = `${newHeight}px`;
    }
  }, [currentValue, autoResize, minRows, maxRows]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (maxLength && newValue.length > maxLength) return;

    setValue(newValue);
    onChange?.(newValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const sizes = {
    sm: { fontSize: 12, padding: 8 },
    md: { fontSize: 14, padding: 12 },
    lg: { fontSize: 16, padding: 16 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
    },
    textarea: {
      width: '100%',
      minHeight: autoResize ? undefined : rows * 20,
      padding: s.padding,
      fontSize: s.fontSize,
      lineHeight: 1.5,
      color: 'var(--color-text)',
      background: 'var(--color-bg-secondary)',
      border: `1px solid ${error ? '#ef4444' : isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 8,
      resize: autoResize ? 'none' : resize,
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
    },
    textareaFocused: {
      boxShadow: `0 0 0 2px ${error ? 'rgba(239, 68, 68, 0.2)' : 'rgba(var(--color-accent-rgb), 0.2)'}`,
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },
    error: {
      fontSize: 12,
      color: '#ef4444',
    },
    count: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginLeft: 'auto',
    },
    countWarning: {
      color: '#f59e0b',
    },
    countError: {
      color: '#ef4444',
    },
  };

  const charCount = currentValue.length;
  const charPercent = maxLength ? (charCount / maxLength) * 100 : 0;

  return (
    <div style={styles.container}>
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={currentValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        rows={autoResize ? undefined : rows}
        maxLength={maxLength}
        style={{
          ...styles.textarea,
          ...(isFocused ? styles.textareaFocused : {}),
        }}
      />

      {(error || showCount) && (
        <div style={styles.footer}>
          {error && <span style={styles.error}>{error}</span>}
          {showCount && (
            <span
              style={{
                ...styles.count,
                ...(charPercent > 90 ? styles.countWarning : {}),
                ...(charPercent >= 100 ? styles.countError : {}),
              }}
            >
              {charCount}{maxLength && ` / ${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== MARKDOWN EDITOR ====================

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value: controlledValue,
  onChange,
  placeholder = 'Write your markdown here...',
  disabled = false,
  showPreview = true,
  minHeight = 200,
}) => {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onChange?.(e.target.value);
  };

  const insertFormat = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = currentValue.substring(start, end);
    const newValue =
      currentValue.substring(0, start) +
      before +
      selectedText +
      after +
      currentValue.substring(end);

    setValue(newValue);
    onChange?.(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        end + before.length
      );
    }, 0);
  };

  const toolbar = [
    { icon: 'B', action: () => insertFormat('**', '**'), title: 'Bold' },
    { icon: 'I', action: () => insertFormat('*', '*'), title: 'Italic' },
    { icon: '~~', action: () => insertFormat('~~', '~~'), title: 'Strikethrough' },
    { icon: 'H1', action: () => insertFormat('# '), title: 'Heading 1' },
    { icon: 'H2', action: () => insertFormat('## '), title: 'Heading 2' },
    { icon: '•', action: () => insertFormat('- '), title: 'Bullet List' },
    { icon: '1.', action: () => insertFormat('1. '), title: 'Numbered List' },
    { icon: '[ ]', action: () => insertFormat('- [ ] '), title: 'Task' },
    { icon: 'link', action: () => insertFormat('[', '](url)'), title: 'Link' },
    { icon: 'camera', action: () => insertFormat('![alt](', ')'), title: 'Image' },
    { icon: '`', action: () => insertFormat('`', '`'), title: 'Inline Code' },
    { icon: '```', action: () => insertFormat('```\n', '\n```'), title: 'Code Block' },
    { icon: '>', action: () => insertFormat('> '), title: 'Quote' },
    { icon: '---', action: () => insertFormat('\n---\n'), title: 'Divider' },
  ];

  const renderMarkdown = (text: string): string => {
    // Simple markdown rendering for preview
    return text
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^- \[x\] (.*)$/gm, 'check-square $1')
      .replace(/^- \[ \] (.*)$/gm, 'square $1')
      .replace(/^- (.*)$/gm, '• $1')
      .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n/g, '<br>');
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 2,
      padding: 8,
      background: 'var(--color-bg-tertiary)',
      borderBottom: '1px solid var(--color-border)',
    },
    toolbarButton: {
      padding: '4px 8px',
      background: 'none',
      border: 'none',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    modeTabs: {
      display: 'flex',
      marginLeft: 'auto',
      gap: 4,
    },
    modeTab: {
      padding: '4px 12px',
      background: 'var(--color-bg-secondary)',
      border: 'none',
      borderRadius: 4,
      fontSize: 12,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
    },
    modeTabActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    content: {
      display: 'flex',
      flex: 1,
    },
    editor: {
      flex: 1,
      minHeight,
      padding: 12,
      border: 'none',
      background: 'var(--color-bg-secondary)',
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--color-text)',
      fontFamily: 'monospace',
      resize: 'none',
      outline: 'none',
    },
    preview: {
      flex: 1,
      minHeight,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--color-text)',
      overflow: 'auto',
    },
    divider: {
      width: 1,
      background: 'var(--color-border)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        {toolbar.map((item, i) => (
          <button
            key={i}
            style={styles.toolbarButton}
            onClick={item.action}
            title={item.title}
            disabled={disabled}
          >
            {item.icon}
          </button>
        ))}

        {showPreview && (
          <div style={styles.modeTabs}>
            {(['write', 'split', 'preview'] as const).map(m => (
              <button
                key={m}
                style={{
                  ...styles.modeTab,
                  ...(mode === m ? styles.modeTabActive : {}),
                }}
                onClick={() => setMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={styles.content}>
        {(mode === 'write' || mode === 'split') && (
          <textarea
            ref={textareaRef}
            style={{
              ...styles.editor,
              ...(mode === 'split' ? { borderRight: '1px solid var(--color-border)' } : {}),
            }}
            value={currentValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}

        {(mode === 'preview' || mode === 'split') && (
          <div
            style={styles.preview}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(currentValue)) }}
          />
        )}
      </div>
    </div>
  );
};

// ==================== CODE EDITOR ====================

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value: controlledValue,
  onChange,
  language = 'javascript',
  placeholder = 'Enter code...',
  disabled = false,
  lineNumbers = true,
  minHeight = 200,
}) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;
  const lines = currentValue.split('\n');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onChange?.(e.target.value);
  };

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Tab key
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue =
        currentValue.substring(0, start) +
        '  ' +
        currentValue.substring(end);

      setValue(newValue);
      onChange?.(newValue);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      overflow: 'hidden',
      fontFamily: 'monospace',
    },
    lineNumbers: {
      width: 48,
      padding: '12px 8px',
      background: 'var(--color-bg-tertiary)',
      borderRight: '1px solid var(--color-border)',
      textAlign: 'right',
      userSelect: 'none',
      overflow: 'hidden',
    },
    lineNumber: {
      fontSize: 13,
      lineHeight: '20px',
      color: 'var(--color-text-muted)',
    },
    editor: {
      flex: 1,
      minHeight,
      padding: 12,
      border: 'none',
      background: 'var(--color-bg-secondary)',
      fontSize: 13,
      lineHeight: '20px',
      color: 'var(--color-text)',
      fontFamily: 'inherit',
      resize: 'none',
      outline: 'none',
      whiteSpace: 'pre',
      overflowX: 'auto',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: 'var(--color-bg-tertiary)',
      borderBottom: '1px solid var(--color-border)',
    },
    language: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
    },
  };

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden' }}>
      <div style={styles.header}>
        <span style={styles.language}>{language}</span>
      </div>
      <div style={styles.container}>
        {lineNumbers && (
          <div ref={lineNumbersRef} style={styles.lineNumbers}>
            {lines.map((_, i) => (
              <div key={i} style={styles.lineNumber}>
                {i + 1}
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          style={styles.editor}
          value={currentValue}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

// ==================== MENTION TEXTAREA ====================

export const MentionTextArea: React.FC<MentionTextAreaProps> = ({
  value: controlledValue,
  onChange,
  placeholder = 'Type @ to mention someone...',
  mentions = [],
  onMention,
  trigger = '@',
}) => {
  const [value, setValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const filteredMentions = mentions.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);

    // Check for trigger character
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const triggerMatch = textBeforeCursor.match(new RegExp(`${trigger}([^\\s]*)$`));

    if (triggerMatch) {
      setQuery(triggerMatch[1]);
      setIsOpen(true);
      setSelectedIndex(0);

      // Calculate dropdown position
      const textarea = textareaRef.current;
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        // Simple positioning - could be improved with proper caret tracking
        setPosition({
          top: 60,
          left: 20,
        });
      }
    } else {
      setIsOpen(false);
      setQuery('');
    }
  };

  const insertMention = (mention: { id: string; name: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = currentValue.substring(0, cursorPos);
    const textAfterCursor = currentValue.substring(cursorPos);

    // Find the trigger position
    const triggerPos = textBeforeCursor.lastIndexOf(trigger);
    const beforeTrigger = textBeforeCursor.substring(0, triggerPos);
    const newValue = `${beforeTrigger}${trigger}${mention.name} ${textAfterCursor}`;

    setValue(newValue);
    onChange?.(newValue);
    onMention?.(mention);
    setIsOpen(false);
    setQuery('');

    setTimeout(() => {
      const newCursorPos = triggerPos + trigger.length + mention.name.length + 1;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredMentions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : filteredMentions.length - 1
        );
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredMentions[selectedIndex]) {
          insertMention(filteredMentions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    textarea: {
      width: '100%',
      minHeight: 100,
      padding: 12,
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      background: 'var(--color-bg-secondary)',
      fontSize: 14,
      lineHeight: 1.5,
      color: 'var(--color-text)',
      resize: 'vertical',
      outline: 'none',
    },
    dropdown: {
      position: 'absolute',
      top: position.top,
      left: position.left,
      width: 240,
      maxHeight: 200,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      overflow: 'auto',
      zIndex: 1000,
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      cursor: 'pointer',
    },
    optionHighlighted: {
      background: 'var(--color-bg-tertiary)',
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      color: '#fff',
    },
    name: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
  };

  return (
    <div style={styles.container}>
      <textarea
        ref={textareaRef}
        style={styles.textarea}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {isOpen && filteredMentions.length > 0 && (
        <div style={styles.dropdown}>
          {filteredMentions.map((mention, i) => (
            <div
              key={mention.id}
              style={{
                ...styles.option,
                ...(i === selectedIndex ? styles.optionHighlighted : {}),
              }}
              onClick={() => insertMention(mention)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div style={styles.avatar}>
                {mention.avatar || mention.name.charAt(0).toUpperCase()}
              </div>
              <span style={styles.name}>{mention.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TextArea;
