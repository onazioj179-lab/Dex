/**
 * DEX Platform - Password Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Secure password generation and management
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppTracking } from '../../services/usePatternLearning';
import { useToastHelpers } from '../../components/Toast';

// ===========================================================================
// DEX PASSWORD GENERATOR - Secure Password Management
// Professional, minimal, secure password generation
// ===========================================================================

interface PasswordEntry {
  id: string;
  password: string;
  maskedPassword: string;
  strength: string;
  date: string;
  label?: string;
}

const PasswordGenerator: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('password');
  const toast = useToastHelpers();

  const [password, setPassword] = useState('');
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [history, setHistory] = useState<PasswordEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-pwd-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.warn('[PasswordGenerator] Failed to load history:', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dex-pwd-history', JSON.stringify(history));
    } catch (e) {
      console.warn('[PasswordGenerator] Failed to save history:', e);
    }
  }, [history]);

  const generate = useCallback((nextLength = length, nextOptions = options) => {
    let chars = '';
    if (nextOptions.uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (nextOptions.lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (nextOptions.numbers) chars += '0123456789';
    if (nextOptions.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';

    const array = new Uint32Array(nextLength);
    crypto.getRandomValues(array);
    setPassword(Array.from(array, v => chars[v % chars.length]).join(''));
    setCopied(false);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'passwordsGenerated', amount: 1 } }));
  }, [length, options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const getStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (pwd.length >= 16) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score += 2;

    if (score <= 3) return { label: 'Weak', pct: 25, color: 'var(--color-error)' };
    if (score <= 5) return { label: 'Fair', pct: 50, color: 'var(--color-warning)' };
    if (score <= 7) return { label: 'Good', pct: 75, color: 'var(--color-success)' };
    return { label: 'Strong', pct: 100, color: 'var(--color-accent)' };
  };

  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    toast.success('Copied to clipboard', 'Password will be cleared from clipboard in 30s');
    // Clear copied indicator
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    // Auto-clear clipboard after 30 seconds for security
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    clipboardTimerRef.current = setTimeout(() => {
      navigator.clipboard.writeText('').catch((e: unknown) => { console.warn('[DEX]', e); });
    }, 30000);
  };

  const maskPassword = (pwd: string): string => {
    if (pwd.length <= 4) return '*'.repeat(pwd.length);
    return pwd[0] + '*'.repeat(pwd.length - 2) + pwd[pwd.length - 1];
  };

  const save = () => {
    const strength = getStrength(password);
    setHistory(prev => [{
      id: Date.now().toString(),
      password: password,
      maskedPassword: maskPassword(password),
      strength: strength.label,
      date: new Date().toISOString(),
    }, ...prev.slice(0, 49)]);
  };

  const deleteEntry = (id: string) => setHistory(prev => prev.filter(h => h.id !== id));
  const clearAll = () => setHistory([]);

  const strength = getStrength(password);

  const Toggle: React.FC<{ label: string; active: boolean; onToggle: () => void }> = ({ label, active, onToggle }) => (
    <div className="pwgen-toggle" style={styles.toggle} onClick={onToggle}>
      <span style={styles.toggleLabel}>{label}</span>
      <div style={{ ...styles.toggleTrack, background: active ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
        <div style={{ ...styles.toggleKnob, transform: active ? 'translateX(20px)' : 'translateX(0)' }} />
      </div>
    </div>
  );

  return (
    <div style={styles.container} role="region" aria-label="Password Generator">
      <style>{`
        .pwgen-btn:hover { filter: brightness(1.2); transform: scale(1.02); }
        .pwgen-btn:active { transform: scale(0.98); }
        .pwgen-action:hover { background: var(--color-border-subtle) !important; }
        .pwgen-history-item:hover { background: var(--color-bg-hover) !important; border-color: var(--color-border) !important; }
        .pwgen-toggle:hover { background: var(--color-bg-hover) !important; }
        .pwgen-clear:hover { background: rgba(255,69,58,0.12) !important; }
      `}</style>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Password</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={{ ...styles.historyBtn, background: showHistory ? 'var(--color-accent)' : 'var(--color-border)' }} onClick={() => setShowHistory(!showHistory)} aria-label="Toggle history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

        </div>
      </div>

      <div style={styles.main}>
        {/* Password Display */}
        <div style={styles.displayCard}>
          <div style={styles.passwordBox}>
            <span style={styles.passwordText}>{password}</span>
          </div>
          
          {/* Strength Bar */}
          <div style={styles.strengthRow}>
            <div style={styles.strengthBar}>
              <div style={{ ...styles.strengthFill, width: `${strength.pct}%`, background: strength.color }} />
            </div>
            <span style={{ ...styles.strengthLabel, color: strength.color }}>{strength.label}</span>
          </div>

          {/* Action Buttons */}
          <div style={styles.actions}>
            <button className="pwgen-btn" style={{ ...styles.actionBtn, ...(copied ? styles.copiedBtn : {}) }} onClick={copy} aria-label={copied ? 'Copied to clipboard' : 'Copy password'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {copied ? <polyline points="20 6 9 17 4 12"/> : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>}
              </svg>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button className="pwgen-btn" style={{ ...styles.actionBtn, ...styles.generateBtn }} onClick={() => generate()} aria-label="Generate new password">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              <span>Generate</span>
            </button>
            <button className="pwgen-btn" style={styles.actionBtn} onClick={save} aria-label="Save password to history">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Length Slider */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Length</span>
            <span style={styles.lengthValue}>{length}</span>
          </div>
          <div style={styles.sliderContainer}>
            <input
              type="range"
              min="6"
              max="48"
              value={length}
              onChange={e => setLength(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.sliderLabels}>
              <span>6</span>
              <span>48</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div style={styles.section}>
          <span style={styles.sectionTitle}>Characters</span>
          <div style={styles.optionsGrid}>
            <Toggle label="Uppercase A-Z" active={options.uppercase} onToggle={() => setOptions(p => ({ ...p, uppercase: !p.uppercase }))} />
            <Toggle label="Lowercase a-z" active={options.lowercase} onToggle={() => setOptions(p => ({ ...p, lowercase: !p.lowercase }))} />
            <Toggle label="Numbers 0-9" active={options.numbers} onToggle={() => setOptions(p => ({ ...p, numbers: !p.numbers }))} />
            <Toggle label="Symbols !@#" active={options.symbols} onToggle={() => setOptions(p => ({ ...p, symbols: !p.symbols }))} />
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div style={styles.historyPanel}>
            <div style={styles.historyHeader}>
              <span style={styles.sectionTitle}>History</span>
              {history.length > 0 && (
                <button className="pwgen-clear" style={styles.clearBtn} onClick={clearAll} aria-label="Clear all history">Clear All</button>
              )}
            </div>
            <div style={styles.historyList}>
              {history.length === 0 ? (
                <div style={styles.emptyHistory}>No saved passwords</div>
              ) : (
                history.map(entry => (
                  <div key={entry.id} className="pwgen-history-item" style={styles.historyItem}>
                    <div style={styles.historyPassword}>{entry.maskedPassword || '********'}</div>
                    <div style={styles.historyMeta}>
                      <span>{entry.strength && <span style={{ marginRight: 6, opacity: 0.7 }}>{entry.strength}</span>}{new Date(entry.date).toLocaleDateString()}</span>
                      <div style={styles.historyActions}>
                        <button className="pwgen-action" style={{ ...styles.historyActionBtn, color: 'var(--color-accent, #0a84ff)' }} onClick={() => { if (entry.password) { navigator.clipboard.writeText(entry.password).then(() => toast.success('Copied to clipboard')).catch(() => {}); } }} aria-label="Copy password">Copy</button>
                        <button className="pwgen-action" style={{ ...styles.historyActionBtn, color: 'var(--color-error)' }} onClick={() => deleteEntry(entry.id)} aria-label="Delete password">Delete</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    height: '44px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.2px',
  },
  historyBtn: {
    width: '32px',
    height: '32px',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    boxShadow: 'var(--shadow-sm)',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  displayCard: {
    background: 'var(--color-bg-secondary)',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-md)',
  },
  passwordBox: {
    background: 'var(--color-bg-surface)',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid var(--color-border-subtle)',
  },
  passwordText: {
    fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Consolas, monospace",
    fontSize: '14px',
    letterSpacing: '1px',
    wordBreak: 'break-all',
    lineHeight: 1.6,
    color: 'var(--color-text-primary)',
  },
  strengthRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  strengthBar: {
    flex: 1,
    height: '6px',
    background: 'var(--color-bg-surface)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'all 0.2s ease',
    boxShadow: '0 0 8px currentColor',
  },
  strengthLabel: {
    fontSize: '11px',
    fontWeight: 700,
    minWidth: '50px',
    textAlign: 'right',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    color: 'var(--color-text-primary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  generateBtn: {
    background: 'linear-gradient(180deg, var(--color-accent) 0%, #0060df 100%)',
    border: 'none',
    boxShadow: '0 2px 8px rgba(10,132,255,0.4)',
  },
  copiedBtn: {
    background: 'linear-gradient(180deg, var(--color-success) 0%, #1fa848 100%)',
    border: 'none',
    boxShadow: '0 2px 8px rgba(48,209,88,0.4)',
  },
  section: {
    background: 'var(--color-bg-surface)',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid var(--color-border-subtle)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  lengthValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--color-accent)',
  },
  sliderContainer: {
    padding: '0 4px',
  },
  slider: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    background: 'var(--color-bg-surface)',
    appearance: 'none',
    cursor: 'pointer',
    accentColor: 'var(--color-accent)',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
  },
  optionsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '12px',
  },
  toggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'var(--color-bg-surface)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid var(--color-border-subtle)',
  },
  toggleLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  toggleTrack: {
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    padding: '2px',
    transition: 'all 0.2s ease',
  },
  toggleKnob: {
    width: '18px',
    height: '18px',
    borderRadius: '9px',
    background: 'var(--color-bg-elevated)',
    transition: 'transform 0.2s ease',
    boxShadow: 'var(--shadow-sm)',
  },
  historyPanel: {
    background: 'var(--color-bg-surface)',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid var(--color-border-subtle)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-error)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '3px',
    transition: 'all 0.15s ease',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '260px',
    overflow: 'auto',
  },
  emptyHistory: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    padding: '24px',
    fontSize: '12px',
    fontWeight: 500,
  },
  historyItem: {
    background: 'var(--color-bg-surface)',
    borderRadius: '6px',
    padding: '12px',
    border: '1px solid var(--color-border-subtle)',
    transition: 'all 0.15s ease',
  },
  historyPassword: {
    fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, monospace",
    fontSize: '11px',
    wordBreak: 'break-all',
    marginBottom: '8px',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  historyMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  historyActions: {
    display: 'flex',
    gap: '10px',
  },
  historyActionBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
};

PasswordGenerator.displayName = 'PasswordGenerator';
export default memo(PasswordGenerator);
