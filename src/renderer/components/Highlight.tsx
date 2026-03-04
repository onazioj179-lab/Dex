/**
 * DEX Highlight Components
 * Text highlighting and annotation tools
 */

import React, { useState, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface HighlightProps {
  text: string;
  searchTerms: string | string[];
  highlightColor?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

interface TextAnnotation {
  id: string;
  start: number;
  end: number;
  color: string;
  label?: string;
  comment?: string;
}

interface AnnotatedTextProps {
  text: string;
  annotations: TextAnnotation[];
  onAnnotationClick?: (annotation: TextAnnotation) => void;
  onAnnotationHover?: (annotation: TextAnnotation | null) => void;
}

interface MarkdownHighlightProps {
  content: string;
  language?: string;
}

interface DiffHighlightProps {
  original: string;
  modified: string;
  showLineNumbers?: boolean;
}

// ==================== HIGHLIGHT ====================

export const Highlight: React.FC<HighlightProps> = ({
  text,
  searchTerms,
  highlightColor = 'rgba(255, 235, 59, 0.5)',
  caseSensitive = false,
  wholeWord = false,
}) => {
  const terms = Array.isArray(searchTerms) ? searchTerms : [searchTerms];

  const getHighlightedText = useMemo(() => {
    if (!terms.length || !terms.some(t => t.trim())) {
      return text;
    }

    const escapedTerms = terms
      .filter(t => t.trim())
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (!escapedTerms.length) return text;

    const boundary = wholeWord ? '\\b' : '';
    const pattern = new RegExp(
      `(${boundary}${escapedTerms.join('|')}${boundary})`,
      caseSensitive ? 'g' : 'gi'
    );

    const parts = text.split(pattern);

    return parts.map((part, index) => {
      const isMatch = escapedTerms.some(term =>
        caseSensitive
          ? part === term || (new RegExp(`^${term}$`).test(part))
          : part.toLowerCase() === term.toLowerCase() || (new RegExp(`^${term}$`, 'i').test(part))
      );

      if (isMatch) {
        return (
          <mark
            key={index}
            style={{
              background: highlightColor,
              padding: '1px 2px',
              borderRadius: 2,
            }}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }, [text, terms, highlightColor, caseSensitive, wholeWord]);

  return <span>{getHighlightedText}</span>;
};

// ==================== ANNOTATED TEXT ====================

export const AnnotatedText: React.FC<AnnotatedTextProps> = ({
  text,
  annotations,
  onAnnotationClick,
  onAnnotationHover,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Sort annotations by start position
  const sortedAnnotations = useMemo(
    () => [...annotations].sort((a, b) => a.start - b.start),
    [annotations]
  );

  // Build segments with annotations
  const segments = useMemo(() => {
    const result: Array<{
      text: string;
      annotation?: TextAnnotation;
    }> = [];

    let currentPos = 0;

    for (const annotation of sortedAnnotations) {
      // Add text before annotation
      if (annotation.start > currentPos) {
        result.push({
          text: text.slice(currentPos, annotation.start),
        });
      }

      // Add annotated text
      result.push({
        text: text.slice(annotation.start, annotation.end),
        annotation,
      });

      currentPos = annotation.end;
    }

    // Add remaining text
    if (currentPos < text.length) {
      result.push({
        text: text.slice(currentPos),
      });
    }

    return result;
  }, [text, sortedAnnotations]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      lineHeight: 1.8,
    },
    annotation: {
      position: 'relative',
      cursor: 'pointer',
      borderRadius: 2,
      padding: '2px 0',
      transition: 'opacity 0.15s',
    },
    tooltip: {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 12px',
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      whiteSpace: 'nowrap',
      zIndex: 100,
      marginBottom: 8,
    },
    label: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 4,
    },
    comment: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {segments.map((segment, index) => {
        if (!segment.annotation) {
          return <span key={index}>{segment.text}</span>;
        }

        const { annotation } = segment;
        const isHovered = hoveredId === annotation.id;

        return (
          <span
            key={index}
            style={{
              ...styles.annotation,
              background: annotation.color + '40',
              borderBottom: `2px solid ${annotation.color}`,
            } as any}
            onClick={() => onAnnotationClick?.(annotation)}
            onMouseEnter={() => {
              setHoveredId(annotation.id);
              onAnnotationHover?.(annotation);
            }}
            onMouseLeave={() => {
              setHoveredId(null);
              onAnnotationHover?.(null);
            }}
          >
            {segment.text}

            {isHovered && (annotation.label || annotation.comment) && (
              <div style={styles.tooltip as any}>
                {annotation.label && (
                  <div style={styles.label}>{annotation.label}</div>
                )}
                {annotation.comment && (
                  <div style={styles.comment}>{annotation.comment}</div>
                )}
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
};

// ==================== CODE HIGHLIGHT ====================

interface CodeHighlightProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

export const CodeHighlight: React.FC<CodeHighlightProps> = ({
  code,
  language = 'javascript',
  showLineNumbers = true,
  highlightLines = [],
}) => {
  const lines = code.split('\n');

  // Simple syntax highlighting (basic token matching)
  const highlightSyntax = (line: string): React.ReactNode => {
    const tokens: Array<{ type: string; value: string }> = [];
    let remaining = line;

    const patterns = [
      { type: 'comment', pattern: /(\/\/.*|\/\*[\s\S]*?\*\/)/ },
      { type: 'string', pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/ },
      { type: 'keyword', pattern: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|null|undefined|true|false)\b/ },
      { type: 'number', pattern: /\b(\d+\.?\d*)\b/ },
      { type: 'function', pattern: /\b([a-zA-Z_]\w*)(?=\()/ },
      { type: 'operator', pattern: /(=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%=<>!&|^~])/ },
    ];

    while (remaining) {
      let matched = false;

      for (const { type, pattern } of patterns) {
        const match = remaining.match(pattern);
        if (match && match.index === 0) {
          tokens.push({ type, value: match[0] });
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Check for word or single character
        const wordMatch = remaining.match(/^[a-zA-Z_]\w*/);
        if (wordMatch) {
          tokens.push({ type: 'identifier', value: wordMatch[0] });
          remaining = remaining.slice(wordMatch[0].length);
        } else {
          tokens.push({ type: 'plain', value: remaining[0] });
          remaining = remaining.slice(1);
        }
      }
    }

    const colors: Record<string, string> = {
      comment: '#6b7280',
      string: '#22c55e',
      keyword: '#8b5cf6',
      number: '#f59e0b',
      function: '#3b82f6',
      operator: '#ec4899',
      identifier: 'var(--color-text)',
      plain: 'var(--color-text)',
    };

    return tokens.map((token, i) => (
      <span key={i} style={{ color: colors[token.type] || 'inherit' }}>
        {token.value}
      </span>
    ));
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: 13,
      lineHeight: 1.6,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: 'var(--color-bg-tertiary)',
      borderBottom: '1px solid var(--color-border)',
    },
    language: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
    },
    code: {
      display: 'flex',
      overflowX: 'auto',
      padding: '16px 0',
    },
    lineNumbers: {
      display: 'flex',
      flexDirection: 'column',
      paddingRight: 16,
      paddingLeft: 16,
      textAlign: 'right',
      color: 'var(--color-text-muted)',
      userSelect: 'none',
      borderRight: '1px solid var(--color-border)',
    },
    lines: {
      flex: 1,
      paddingLeft: 16,
      paddingRight: 16,
    },
    line: {
      whiteSpace: 'pre',
    },
    highlightedLine: {
      background: 'rgba(59, 130, 246, 0.1)',
      marginLeft: -16,
      marginRight: -16,
      paddingLeft: 16,
      paddingRight: 16,
      borderLeft: '3px solid var(--color-accent)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.language}>{language}</span>
      </div>

      <div style={styles.code}>
        {showLineNumbers && (
          <div style={styles.lineNumbers as any}>
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}

        <div style={styles.lines as any}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                ...styles.line,
                ...(highlightLines.includes(i + 1) ? styles.highlightedLine : {}),
              }}
            >
              {highlightSyntax(line) || ' '}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==================== DIFF HIGHLIGHT ====================

export const DiffHighlight: React.FC<DiffHighlightProps> = ({
  original,
  modified,
  showLineNumbers = true,
}) => {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  // Simple diff algorithm (line-by-line comparison)
  const diff = useMemo(() => {
    const result: Array<{
      type: 'unchanged' | 'added' | 'removed';
      content: string;
      lineNumber?: number;
    }> = [];

    let origIndex = 0;
    let modIndex = 0;

    while (origIndex < originalLines.length || modIndex < modifiedLines.length) {
      const origLine = originalLines[origIndex];
      const modLine = modifiedLines[modIndex];

      if (origLine === modLine) {
        result.push({ type: 'unchanged', content: origLine, lineNumber: origIndex + 1 });
        origIndex++;
        modIndex++;
      } else if (origLine && !modifiedLines.includes(origLine, modIndex)) {
        result.push({ type: 'removed', content: origLine, lineNumber: origIndex + 1 });
        origIndex++;
      } else if (modLine && !originalLines.includes(modLine, origIndex)) {
        result.push({ type: 'added', content: modLine, lineNumber: modIndex + 1 });
        modIndex++;
      } else {
        if (origLine) {
          result.push({ type: 'removed', content: origLine, lineNumber: origIndex + 1 });
          origIndex++;
        }
        if (modLine) {
          result.push({ type: 'added', content: modLine, lineNumber: modIndex + 1 });
          modIndex++;
        }
      }
    }

    return result;
  }, [originalLines, modifiedLines]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      fontSize: 13,
      lineHeight: 1.6,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    line: {
      display: 'flex',
      padding: '0 16px',
    },
    lineNumber: {
      width: 40,
      textAlign: 'right',
      paddingRight: 16,
      color: 'var(--color-text-muted)',
      userSelect: 'none',
    },
    indicator: {
      width: 20,
      textAlign: 'center',
      fontWeight: 600,
    },
    content: {
      flex: 1,
      whiteSpace: 'pre',
    },
    added: {
      background: 'rgba(34, 197, 94, 0.1)',
      color: '#22c55e',
    },
    removed: {
      background: 'rgba(239, 68, 68, 0.1)',
      color: '#ef4444',
    },
    unchanged: {
      background: 'transparent',
      color: 'var(--color-text)',
    },
  };

  return (
    <div style={styles.container}>
      {diff.map((line, index) => (
        <div
          key={index}
          style={{
            ...styles.line,
            ...styles[line.type],
          }}
        >
          {showLineNumbers && (
            <span style={styles.lineNumber as any}>{line.lineNumber}</span>
          )}
          <span style={styles.indicator as any}>
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          <span style={styles.content}>{line.content}</span>
        </div>
      ))}
    </div>
  );
};

// ==================== SEARCH HIGHLIGHT ====================

interface SearchHighlightProps {
  text: string;
  query: string;
  currentMatch?: number;
  onMatchChange?: (matchIndex: number, totalMatches: number) => void;
}

export const SearchHighlight: React.FC<SearchHighlightProps> = ({
  text,
  query,
  currentMatch = 0,
  onMatchChange,
}) => {
  const matches = useMemo(() => {
    if (!query) return [];

    const result: Array<{ start: number; end: number }> = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      result.push({ start: pos, end: pos + query.length });
      pos += 1;
    }

    return result;
  }, [text, query]);

  React.useEffect(() => {
    onMatchChange?.(currentMatch, matches.length);
  }, [currentMatch, matches.length, onMatchChange]);

  if (!query || matches.length === 0) {
    return <span>{text}</span>;
  }

  const parts: Array<{ text: string; isMatch: boolean; isCurrent: boolean }> = [];
  let lastEnd = 0;

  matches.forEach((match, index) => {
    if (match.start > lastEnd) {
      parts.push({
        text: text.slice(lastEnd, match.start),
        isMatch: false,
        isCurrent: false,
      });
    }

    parts.push({
      text: text.slice(match.start, match.end),
      isMatch: true,
      isCurrent: index === currentMatch,
    });

    lastEnd = match.end;
  });

  if (lastEnd < text.length) {
    parts.push({
      text: text.slice(lastEnd),
      isMatch: false,
      isCurrent: false,
    });
  }

  return (
    <span>
      {parts.map((part, index) => {
        if (!part.isMatch) {
          return <span key={index}>{part.text}</span>;
        }

        return (
          <mark
            key={index}
            style={{
              background: part.isCurrent ? '#f59e0b' : 'rgba(255, 235, 59, 0.5)',
              padding: '1px 2px',
              borderRadius: 2,
              color: part.isCurrent ? '#000' : 'inherit',
            }}
          >
            {part.text}
          </mark>
        );
      })}
    </span>
  );
};

export default Highlight;
