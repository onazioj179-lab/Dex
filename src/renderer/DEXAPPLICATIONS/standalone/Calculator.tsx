/**
 * DEX Platform - Calculator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional calculator with scientific mode
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppTracking } from '../../services/usePatternLearning';

// ===========================================================================
// DEX CALCULATOR - Clean Native Design
// Professional, minimal, Apple-inspired calculator
// ===========================================================================

const Calculator: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('calculator');

  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [mode, setMode] = useState<'basic' | 'scientific'>('basic');
  const [showHistory, setShowHistory] = useState(false);
  const [lastOperator, setLastOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [previousValue, setPreviousValue] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-calculator-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.warn('[Calculator] Failed to load history:', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dex-calculator-history', JSON.stringify(history.slice(0, 50)));
    } catch (e) {
      console.warn('[Calculator] Failed to save history:', e);
    }
  }, [history]);

  const formatNumber = (num: number | string): string => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return 'Error';
    if (!isFinite(n)) return 'Error';
    if (Math.abs(n) >= 1e10) return n.toExponential(4);
    const str = n.toLocaleString('en-US', { maximumFractionDigits: 10 });
    return str.length > 14 ? n.toExponential(4) : str;
  };

  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' || display === 'Error' ? digit : display.replace(/,/g, '') + digit);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = () => {
    if (waitingForOperand || display === 'Error') {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clear = () => {
    setDisplay('0');
    setExpression('');
    setLastOperator(null);
    setPreviousValue(null);
    setWaitingForOperand(false);
  };

  const toggleSign = () => {
    const value = parseFloat(display.replace(/,/g, ''));
    if (!isFinite(value)) return;
    setDisplay(formatNumber(-value));
  };

  const percentage = () => {
    const value = parseFloat(display.replace(/,/g, ''));
    if (!isFinite(value)) return;
    setDisplay(formatNumber(value / 100));
  };

  const performOperation = (op: string) => {
    const value = parseFloat(display.replace(/,/g, ''));
    if (!isFinite(value)) return;
    
    if (previousValue !== null && lastOperator && !waitingForOperand) {
      let result: number;
      switch (lastOperator) {
        case '+': result = previousValue + value; break;
        case '-': result = previousValue - value; break;
        case '*': result = previousValue * value; break;
        case '/': result = previousValue / value; break;
        default: result = value;
      }
      setDisplay(formatNumber(result));
      setPreviousValue(result);
      setExpression(`${formatNumber(result)} ${op}`);
    } else {
      setPreviousValue(value);
      setExpression(`${formatNumber(value)} ${op}`);
    }
    
    setLastOperator(op);
    setWaitingForOperand(true);
  };

  const equals = () => {
    if (previousValue === null || !lastOperator) return;
    const value = parseFloat(display.replace(/,/g, ''));
    if (!isFinite(value) || !isFinite(previousValue)) return;
    let result: number;
    
    switch (lastOperator) {
      case '+': result = previousValue + value; break;
      case '-': result = previousValue - value; break;
      case '*': result = previousValue * value; break;
      case '/': result = previousValue / value; break;
      default: return;
    }
    
    const expr = `${formatNumber(previousValue)} ${lastOperator} ${formatNumber(value)}`;
    const resultStr = formatNumber(result);
    
    setHistory(prev => [{ expr, result: resultStr }, ...prev]);
    setDisplay(resultStr);
    setExpression('');
    setPreviousValue(null);
    setLastOperator(null);
    setWaitingForOperand(true);
  };

  const scientificFn = (fn: string) => {
    const value = parseFloat(display.replace(/,/g, ''));
    if (!isFinite(value) && fn !== 'pi' && fn !== 'e') return;
    let result: number;
    
    switch (fn) {
      case 'sin': result = Math.sin(value * Math.PI / 180); break;
      case 'cos': result = Math.cos(value * Math.PI / 180); break;
      case 'tan': result = Math.tan(value * Math.PI / 180); break;
      case 'ln': result = Math.log(value); break;
      case 'log': result = Math.log10(value); break;
      case 'sqrt': result = Math.sqrt(value); break;
      case 'x2': result = value * value; break;
      case 'x3': result = value * value * value; break;
      case '1/x': result = 1 / value; break;
      case 'pi': result = Math.PI; break;
      case 'e': result = Math.E; break;
      case '!': result = factorial(value); break;
      default: return;
    }
    
    setDisplay(formatNumber(result));
    setWaitingForOperand(true);
  };

  const factorial = (n: number): number => {
    if (n < 0 || n > 170) return NaN;
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  // Keyboard support -- use ref to always capture latest closures without re-registering
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>();
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
    else if (e.key === '.') inputDecimal();
    else if (e.key === '+') performOperation('+');
    else if (e.key === '-') performOperation('-');
    else if (e.key === '*') performOperation('*');
    else if (e.key === '/') performOperation('/');
    else if (e.key === 'Enter' || e.key === '=') equals();
    else if (e.key === 'Escape') clear();
    else if (e.key === 'Backspace') {
      const raw = display.replace(/,/g, '');
      setDisplay(raw.length > 1 ? formatNumber(parseFloat(raw.slice(0, -1)) || 0) : '0');
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const btnStyle = (variant: 'num' | 'op' | 'func' | 'equal'): React.CSSProperties => {
    const base: React.CSSProperties = {
      border: 'none',
      borderRadius: '50%',
      width: '64px',
      height: '64px',
      fontSize: variant === 'op' || variant === 'equal' ? '24px' : '20px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      boxShadow: 'var(--shadow-md)',
    };
    
    const variants: Record<string, React.CSSProperties> = {
      num: { 
        background: 'var(--color-bg-surface)', 
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-subtle)',
      },
      op: { 
        background: 'linear-gradient(180deg, var(--color-accent) 0%, #0060df 100%)', 
        color: 'var(--color-text-inverse)',
        boxShadow: '0 2px 12px rgba(10,132,255,0.4)',
        border: 'none',
      },
      func: { 
        background: 'var(--color-bg-hover)', 
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-default)',
      },
      equal: { 
        background: 'linear-gradient(180deg, var(--color-success) 0%, #1fa848 100%)', 
        color: 'var(--color-text-inverse)',
        boxShadow: '0 2px 12px rgba(48,209,88,0.4)',
        border: 'none',
      },
    };
    
    return { ...base, ...variants[variant] };
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.modeToggle}>
          <button
            aria-label="Basic mode"
            style={{ ...styles.modeBtn, ...(mode === 'basic' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('basic')}
          >Basic</button>
          <button
            aria-label="Scientific mode"
            style={{ ...styles.modeBtn, ...(mode === 'scientific' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('scientific')}
          >Scientific</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={styles.historyBtn} onClick={() => setShowHistory(!showHistory)} aria-label="Toggle history">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

        </div>
      </div>

      <div style={styles.main}>
        {/* Display */}
        <div style={styles.displayArea}>
          {expression && <div style={styles.expression}>{expression}</div>}
          <div style={styles.display}>{display}</div>
          {memory !== 0 && <div style={styles.memoryBadge}>M</div>}
        </div>

        {/* Keypad */}
        <div style={{ ...styles.keypad, gridTemplateColumns: mode === 'scientific' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
          {mode === 'scientific' && (
            <>
              <button style={btnStyle('func')} onClick={() => scientificFn('sin')} aria-label="Sine">sin</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('cos')} aria-label="Cosine">cos</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('tan')} aria-label="Tangent">tan</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('ln')} aria-label="Natural logarithm">ln</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('log')} aria-label="Logarithm">log</button>
              
              <button style={btnStyle('func')} onClick={() => scientificFn('sqrt')} aria-label="Square root">sqrt</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('x2')} aria-label="Square">x^2</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('x3')} aria-label="Cube">x^3</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('pi')} aria-label="Pi">pi</button>
              <button style={btnStyle('func')} onClick={() => scientificFn('e')} aria-label="Euler number">e</button>
            </>
          )}
          
          <button style={btnStyle('func')} onClick={clear} aria-label="Clear all">AC</button>
          <button style={btnStyle('func')} onClick={toggleSign} aria-label="Toggle sign">+/-</button>
          <button style={btnStyle('func')} onClick={percentage} aria-label="Percentage">%</button>
          <button style={btnStyle('op')} onClick={() => performOperation('/')} aria-label="Divide">/</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => scientificFn('!')} aria-label="Factorial">x!</button>}
          
          <button style={btnStyle('num')} onClick={() => inputDigit('7')} aria-label="7">7</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('8')} aria-label="8">8</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('9')} aria-label="9">9</button>
          <button style={btnStyle('op')} onClick={() => performOperation('*')} aria-label="Multiply">x</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => scientificFn('1/x')} aria-label="Reciprocal">1/x</button>}
          
          <button style={btnStyle('num')} onClick={() => inputDigit('4')} aria-label="4">4</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('5')} aria-label="5">5</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('6')} aria-label="6">6</button>
          <button style={btnStyle('op')} onClick={() => performOperation('-')} aria-label="Subtract">-</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => setMemory(memory + parseFloat(display.replace(/,/g, '')))} aria-label="Memory add">M+</button>}
          
          <button style={btnStyle('num')} onClick={() => inputDigit('1')} aria-label="1">1</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('2')} aria-label="2">2</button>
          <button style={btnStyle('num')} onClick={() => inputDigit('3')} aria-label="3">3</button>
          <button style={btnStyle('op')} onClick={() => performOperation('+')} aria-label="Add">+</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => { setDisplay(formatNumber(memory)); setWaitingForOperand(true); }} aria-label="Memory recall">MR</button>}
          
          <button style={{ ...btnStyle('num'), gridColumn: 'span 2', width: '100%', borderRadius: '36px' }} onClick={() => inputDigit('0')} aria-label="0">0</button>
          <button style={btnStyle('num')} onClick={inputDecimal} aria-label="Decimal point">.</button>
          <button style={btnStyle('equal')} onClick={equals} aria-label="Equals">=</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => setMemory(0)} aria-label="Memory clear">MC</button>}
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div style={styles.historyPanel}>
          <div style={styles.historyHeader}>
            <span style={styles.historyTitle}>History</span>
            {history.length > 0 && (
              <button style={styles.clearHistoryBtn} onClick={() => setHistory([])} aria-label="Clear history">Clear</button>
            )}
          </div>
          <div style={styles.historyList}>
            {history.length === 0 ? (
              <div style={styles.emptyHistory}>No calculations yet</div>
            ) : (
              history.map((item, idx) => (
                <div key={idx} style={styles.historyItem} onClick={() => { setDisplay(item.result); setWaitingForOperand(true); }}>
                  <div style={styles.historyExpr}>{item.expr}</div>
                  <div style={styles.historyResult}>= {item.result}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
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
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    height: '44px',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  modeToggle: {
    display: 'flex',
    background: 'var(--color-bg-hover)',
    borderRadius: '8px',
    padding: '2px',
    border: '1px solid var(--color-border-subtle)',
    gap: '2px',
  },
  modeBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  modeBtnActive: {
    background: 'linear-gradient(180deg, var(--color-accent) 0%, #0060df 100%)',
    color: 'var(--color-text-inverse)',
    boxShadow: '0 2px 8px rgba(10,132,255,0.4)',
  },
  historyBtn: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '20px',
    maxWidth: 'min(400px, 100%)',
    margin: '0 auto',
    width: '100%',
  },
  displayArea: {
    textAlign: 'right',
    padding: '20px 16px',
    minHeight: '110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    position: 'relative',
    background: 'var(--color-bg-surface)',
    borderRadius: '12px',
    marginBottom: '16px',
    border: '1px solid var(--color-border-subtle)',
  },
  expression: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    marginBottom: '8px',
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
  display: {
    fontSize: '48px',
    fontWeight: 300,
    letterSpacing: 0,
    lineHeight: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: 'var(--color-text-primary)',
  },
  memoryBadge: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    background: 'var(--color-accent-light)',
    color: 'var(--color-accent)',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    border: '1px solid rgba(10,132,255,0.3)',
  },
  keypad: {
    display: 'grid',
    gap: '10px',
    justifyItems: 'center',
  },
  historyPanel: {
    position: 'absolute',
    top: '44px',
    right: '0',
    bottom: '0',
    width: 'min(260px, 82vw)',
    background: 'var(--color-bg-surface)',
    borderLeft: '1px solid var(--color-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
  },
  historyTitle: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-tertiary)',
  },
  clearHistoryBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },
  historyList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },
  emptyHistory: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    padding: '48px 20px',
    fontSize: '12px',
    fontWeight: 500,
  },
  historyItem: {
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
    background: 'var(--color-bg-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid var(--color-border-subtle)',
  },
  historyExpr: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
    fontWeight: 500,
  },
  historyResult: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.5px',
    color: 'var(--color-text-primary)',
  },
};

Calculator.displayName = 'Calculator';
export default memo(Calculator);
