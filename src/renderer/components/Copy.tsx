/**
 * DEX Copy & Clipboard Utility Component
 * Copy to clipboard with visual feedback
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

interface CopyButtonProps {
  text: string;
  onCopy?: (text: string) => void;
  children?: React.ReactNode;
  successDuration?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'button' | 'text';
  successMessage?: string;
}

interface CopyFieldProps {
  value: string;
  label?: string;
  onCopy?: (text: string) => void;
  mask?: boolean;
  showMaskToggle?: boolean;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: number;
  onCopy?: (code: string) => void;
}

interface ShareButtonProps {
  title: string;
  text?: string;
  url: string;
  onShare?: () => void;
  onFallbackCopy?: () => void;
}

// ==================== COPY BUTTON ====================

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  onCopy,
  children,
  successDuration = 2000,
  size = 'md',
  variant = 'icon',
  successMessage = 'Copied!',
}) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const sizeConfig = {
    sm: { padding: '4px 8px', fontSize: 11, iconSize: 12 },
    md: { padding: '6px 12px', fontSize: 13, iconSize: 14 },
    lg: { padding: '8px 16px', fontSize: 15, iconSize: 16 },
  };

  const config = sizeConfig[size];

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(false);
      onCopy?.(text);

      setTimeout(() => {
        setCopied(false);
      }, successDuration);
    } catch (err) {
      setError(true);
      setTimeout(() => setError(false), successDuration);
    }
  }, [text, onCopy, successDuration]);

  const getButtonStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      cursor: 'pointer',
      transition: 'all 0.15s',
      border: 'none',
      fontFamily: 'inherit',
    };

    if (variant === 'icon') {
      return {
        ...baseStyles,
        width: config.iconSize + 16,
        height: config.iconSize + 16,
        padding: 0,
        background: 'transparent',
        borderRadius: 4,
        color: copied ? '#10b981' : error ? '#ef4444' : 'var(--color-text-muted)',
      };
    }

    if (variant === 'text') {
      return {
        ...baseStyles,
        padding: 0,
        background: 'transparent',
        fontSize: config.fontSize,
        color: copied ? '#10b981' : error ? '#ef4444' : 'var(--color-accent)',
      };
    }

    return {
      ...baseStyles,
      padding: config.padding,
      background: copied
        ? 'rgba(16, 185, 129, 0.1)'
        : error
        ? 'rgba(239, 68, 68, 0.1)'
        : 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: config.fontSize,
      color: copied ? '#10b981' : error ? '#ef4444' : 'var(--color-text)',
    };
  };

  const getIcon = () => {
    if (copied) return 'check';
    if (error) return 'x';
    return 'clipboard';
  };

  const getLabel = () => {
    if (copied) return successMessage;
    if (error) return 'Failed';
    return children || 'Copy';
  };

  return (
    <button
      style={getButtonStyles()}
      onClick={handleCopy}
      title={copied ? successMessage : 'Copy to clipboard'}
    >
      <span style={{ fontSize: config.iconSize }}>{getIcon()}</span>
      {variant !== 'icon' && <span>{getLabel()}</span>}
    </button>
  );
};

// ==================== COPY FIELD ====================

export const CopyField: React.FC<CopyFieldProps> = ({
  value,
  label,
  onCopy,
  mask = false,
  showMaskToggle = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [masked, setMasked] = useState(mask);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.(value);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const displayValue = masked ? '•'.repeat(Math.min(value.length, 24)) : value;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    label: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
    },
    field: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 6,
      border: '1px solid var(--color-border)',
    },
    value: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'monospace',
      color: 'var(--color-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 14,
      color: 'var(--color-text-muted)',
      transition: 'background 0.15s, color 0.15s',
    },
    copySuccess: {
      color: '#10b981',
    },
  };

  return (
    <div style={styles.container}>
      {label && <span style={styles.label}>{label}</span>}
      <div style={styles.field}>
        <span style={styles.value}>{displayValue}</span>
        <div style={styles.actions}>
          {showMaskToggle && mask && (
            <button
              style={styles.button}
              onClick={() => setMasked(!masked)}
              title={masked ? 'Show' : 'Hide'}
            >
              {masked ? 'eye' : 'eye-off'}
            </button>
          )}
          <button
            style={{ ...styles.button, ...(copied ? styles.copySuccess : {}) }}
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? 'check' : 'clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== CODE BLOCK ====================

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  showLineNumbers = true,
  maxHeight = 400,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);

  const lines = code.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.(code);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
    },
    language: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    copyButton: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 500,
      color: copied ? '#10b981' : 'var(--color-text-muted)',
      transition: 'color 0.15s',
    },
    codeWrapper: {
      maxHeight,
      overflowY: 'auto',
      padding: '12px 0',
    },
    line: {
      display: 'flex',
      fontSize: 13,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      lineHeight: 1.6,
    },
    lineNumber: {
      width: 40,
      paddingRight: 16,
      textAlign: 'right',
      color: 'var(--color-text-muted)',
      userSelect: 'none',
      flexShrink: 0,
    },
    lineContent: {
      flex: 1,
      color: 'var(--color-text)',
      whiteSpace: 'pre',
      paddingRight: 16,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.language}>{language || 'code'}</span>
        <button style={styles.copyButton} onClick={handleCopy}>
          <span>{copied ? 'check' : 'clipboard'}</span>
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div style={styles.codeWrapper}>
        {lines.map((line, i) => (
          <div key={i} style={styles.line}>
            {showLineNumbers && (
              <span style={styles.lineNumber}>{i + 1}</span>
            )}
            <span style={styles.lineContent}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SHARE BUTTON ====================

export const ShareButton: React.FC<ShareButtonProps> = ({
  title,
  text,
  url,
  onShare,
  onFallbackCopy,
}) => {
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);

  const canShare = typeof navigator.share === 'function';

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        setShared(true);
        onShare?.();
        setTimeout(() => setShared(false), 2000);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          handleCopyFallback();
        }
      }
    } else {
      handleCopyFallback();
    }
  };

  const handleCopyFallback = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onFallbackCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: shared || copied ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      color: shared || copied ? '#10b981' : 'var(--color-text)',
      transition: 'all 0.15s',
    },
    icon: {
      fontSize: 16,
    },
  };

  const getLabel = () => {
    if (shared) return 'Shared!';
    if (copied) return 'Link copied!';
    return canShare ? 'Share' : 'Copy link';
  };

  const getIcon = () => {
    if (shared || copied) return 'check';
    return canShare ? 'upload' : 'link';
  };

  return (
    <button style={styles.button} onClick={handleShare}>
      <span style={styles.icon}>{getIcon()}</span>
      <span>{getLabel()}</span>
    </button>
  );
};

// ==================== COPY LINK BUTTON ====================

interface CopyLinkButtonProps {
  url?: string;
  onCopy?: (url: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({
  url = window.location.href,
  onCopy,
  size = 'md',
}) => {
  const [copied, setCopied] = useState(false);

  const sizeConfig = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '8px 16px', fontSize: 13 },
    lg: { padding: '10px 20px', fontSize: 14 },
  };

  const config = sizeConfig[size];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopy?.(url);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: config.padding,
      background: copied ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: config.fontSize,
      fontWeight: 500,
      color: copied ? '#10b981' : 'var(--color-text)',
      transition: 'all 0.15s',
    },
  };

  return (
    <button style={styles.button} onClick={handleCopy}>
      <span>{copied ? 'check' : 'link'}</span>
      <span>{copied ? 'Copied!' : 'Copy link'}</span>
    </button>
  );
};

// ==================== USE CLIPBOARD HOOK ====================

export const useClipboard = (resetDelay = 2000) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);

      setTimeout(() => setCopied(false), resetDelay);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Copy failed'));
      setCopied(false);
      return false;
    }
  }, [resetDelay]);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setError(null);
      return text;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Paste failed'));
      return null;
    }
  }, []);

  return { copied, error, copy, paste };
};

export default CopyButton;
