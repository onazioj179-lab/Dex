/**
 * DEX Platform - Calculator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional calculator with scientific mode
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppTracking } from '../../services/usePatternLearning';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';

// ===========================================================================
// DEX CALCULATOR - Clean Native Design
// Professional, minimal, Apple-inspired calculator
// ===========================================================================

// Natural-language input: arithmetic ("sqrt(2)", "2+2*3"), percent ("20% of 80"),
// and common unit conversions ("5 km in mi", "180 lb to kg", "100 c in f"). Pure +
// self-contained so it stays easy to reason about. Returns null when unparseable.
const UNIT_ALIAS: Record<string, string> = {
  kilometers: 'km', kilometres: 'km', kilometer: 'km', kilometre: 'km', kms: 'km',
  meters: 'm', metres: 'm', meter: 'm', metre: 'm', centimeters: 'cm', millimeters: 'mm',
  miles: 'mi', mile: 'mi', yards: 'yd', yard: 'yd', feet: 'ft', foot: 'ft', inches: 'in', inch: 'in',
  kilograms: 'kg', kilogram: 'kg', kilo: 'kg', kilos: 'kg', grams: 'g', gram: 'g',
  milligrams: 'mg', pounds: 'lb', pound: 'lb', lbs: 'lb', ounces: 'oz', ounce: 'oz', tonnes: 't', tonne: 't', tons: 't',
  bytes: 'b', byte: 'b', kilobytes: 'kb', megabytes: 'mb', gigabytes: 'gb', terabytes: 'tb',
  celsius: 'c', centigrade: 'c', fahrenheit: 'f', kelvin: 'k',
};
const UNIT_FACTOR: Record<string, { dim: string; f: number }> = {
  km: { dim: 'len', f: 1000 }, m: { dim: 'len', f: 1 }, cm: { dim: 'len', f: 0.01 }, mm: { dim: 'len', f: 0.001 },
  mi: { dim: 'len', f: 1609.344 }, yd: { dim: 'len', f: 0.9144 }, ft: { dim: 'len', f: 0.3048 }, in: { dim: 'len', f: 0.0254 },
  kg: { dim: 'mass', f: 1000 }, g: { dim: 'mass', f: 1 }, mg: { dim: 'mass', f: 0.001 }, lb: { dim: 'mass', f: 453.592 }, oz: { dim: 'mass', f: 28.3495 }, t: { dim: 'mass', f: 1e6 },
  b: { dim: 'data', f: 1 }, kb: { dim: 'data', f: 1024 }, mb: { dim: 'data', f: 1024 ** 2 }, gb: { dim: 'data', f: 1024 ** 3 }, tb: { dim: 'data', f: 1024 ** 4 },
};
function toCelsius(v: number, u: string): number | null {
  if (u === 'c') return v; if (u === 'f') return (v - 32) * 5 / 9; if (u === 'k') return v - 273.15; return null;
}
function fromCelsius(c: number, u: string): number | null {
  if (u === 'c') return c; if (u === 'f') return c * 9 / 5 + 32; if (u === 'k') return c + 273.15; return null;
}
function convertUnits(amount: number, from: string, to: string): number | null {
  const f = UNIT_ALIAS[from] ?? from, t = UNIT_ALIAS[to] ?? to;
  if (['c', 'f', 'k'].includes(f) && ['c', 'f', 'k'].includes(t)) {
    const c = toCelsius(amount, f); return c === null ? null : fromCelsius(c, t);
  }
  const fu = UNIT_FACTOR[f], tu = UNIT_FACTOR[t];
  if (!fu || !tu || fu.dim !== tu.dim) return null;
  return (amount * fu.f) / tu.f;
}
export function evaluateNatural(raw: string): { value: number; expr: string } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  // Unit conversion: "<n> <unit> in|to <unit>"
  const conv = s.match(/^([\d.]+)\s*([a-z°]+)\s*(?:in|to|->)\s*([a-z°]+)$/);
  if (conv) {
    const r = convertUnits(parseFloat(conv[1]), conv[2], conv[3]);
    if (r !== null && isFinite(r)) return { value: r, expr: raw.trim() };
  }
  // "<n>% of <n>"
  const pct = s.match(/^([\d.]+)\s*%\s*of\s*([\d.]+)$/);
  if (pct) return { value: (parseFloat(pct[1]) / 100) * parseFloat(pct[2]), expr: raw.trim() };
  // Arithmetic with Math functions / constants / percent.
  let e = s.replace(/\^/g, '**')
    .replace(/\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|log2|log10|abs|round|floor|ceil|exp|sign)\s*\(/g, 'Math.$1(')
    .replace(/\blog\s*\(/g, 'Math.log10(')
    .replace(/\bln\s*\(/g, 'Math.log(')
    .replace(/\bpi\b/g, 'Math.PI').replace(/(?<![a-z])e(?![a-z])/g, 'Math.E')
    .replace(/(\d(?:\.\d+)?)\s*%/g, '($1/100)');
  // Whitelist: digits, operators, parens, dot, comma, whitespace, and Math.* calls.
  if (!/^[\d+\-*/().,%\s]*(?:Math\.[a-z0-9]+\([^)]*\)|Math\.(PI|E)|[\d+\-*/().,%\s])*$/i.test(e.replace(/Math\.[a-z0-9]+/gi, 'Math'))) {
    // Looser fallback: strip everything not in the safe set, then require it changed nothing illegal.
    if (/[a-z]/i.test(e.replace(/Math\.[a-z0-9]+/gi, ''))) return null;
  }
  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${e});`)() as unknown;
    if (typeof val === 'number' && isFinite(val)) return { value: val, expr: raw.trim() };
  } catch { /* not an expression */ }
  return null;
}

const Calculator: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('calculator');
  const [naturalInput, setNaturalInput] = useState('');

  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<{ id: string; expr: string; result: string }[]>([]);
  const [mode, setMode] = useState<'basic' | 'scientific'>('basic');
  const [showHistory, setShowHistory] = useState(false);
  const [lastOperator, setLastOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [previousValue, setPreviousValue] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-calculator-history');
      if (saved) {
        // Backfill stable ids for entries persisted before ids existed.
        const parsed = JSON.parse(saved) as { id?: string; expr: string; result: string }[];
        setHistory(parsed.map((h, i) => ({ id: h.id ?? `calc-old-${i}`, expr: h.expr, result: h.result })));
      }
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
    
    // Cap the in-memory array (not just the persisted copy) so a long session
    // of calculations can't grow history without bound.
    setHistory(prev => [{ id: `calc-${Date.now()}`, expr, result: resultStr }, ...prev].slice(0, 50));
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

  // Copy the current display value to the clipboard. Guarded — clipboard may be
  // blocked (insecure context / permissions) and must never throw into the UI.
  const copyResult = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(display).catch(() => { /* clipboard blocked */ });
      // DEX ecosystem: the result also lands in the Omni Clipboard (typed as a
      // number), so it's reusable + sendable across DEX.
      (window as any).__dexClipboardStore?.getState?.().add(display, { sourceAppId: 'calculator', sourceAppName: 'Calculator' });
    } catch { /* clipboard unavailable */ }
  }, [display]);

  // Send the latest result anywhere via DEX Flow (universal handoff) — Notes,
  // DexCode, the Browser, etc. — instead of being hard-wired to Notes only.
  const sendResult = useCallback(() => {
    const text = expression ? `${expression} ${display}` : display;
    try {
      window.dispatchEvent(new CustomEvent('dex-flow-open', { detail: { payload: { kind: 'text', content: text, source: 'calculator', label: 'Calculator result' } } }));
    } catch {
      try { void navigator.clipboard?.writeText(text).catch(() => { /* clipboard blocked */ }); } catch { /* clipboard unavailable */ }
    }
  }, [display, expression]);

  // Natural-language entry: evaluate the typed query, show the result, and log it.
  const runNatural = () => {
    const res = evaluateNatural(naturalInput);
    if (!res) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Could not parse that' } }));
      return;
    }
    const resultStr = formatNumber(res.value);
    setHistory(prev => [{ id: `calc-${Date.now()}`, expr: res.expr, result: resultStr }, ...prev].slice(0, 50));
    setDisplay(resultStr);
    setExpression(res.expr);
    setNaturalInput('');
    setWaitingForOperand(true);
  };

  // Keyboard support -- use ref to always capture latest closures without re-registering
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>();
  keyHandlerRef.current = (e: KeyboardEvent) => {
    // Don't hijack keystrokes while the user types in the natural-input field.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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

  // UKI app-context: expose the current expression, displayed value (last
  // result), and the active mode so the assistant knows what the user is
  // computing. A ref keeps the resolver reading live state — register once.
  const ukiCtxRef = useRef({ display, expression, mode });
  ukiCtxRef.current = { display, expression, mode };
  useEffect(() => {
    registerUkiAppContext('calculator', () => {
      const s = ukiCtxRef.current;
      return {
        appId: 'calculator',
        custom: {
          expression: s.expression || undefined,
          lastResult: s.display,
          mode: s.mode,
        },
      };
    });
    return () => unregisterUkiAppContext('calculator');
  }, []);

  const btnStyle = (variant: 'num' | 'op' | 'func' | 'equal'): React.CSSProperties => {
    const base: React.CSSProperties = {
      border: 'none',
      borderRadius: '50%',
      width: '48px',
      height: '48px',
      fontSize: variant === 'op' || variant === 'equal' ? '18px' : '15px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      fontFamily: 'var(--dex-font-ui)',
      boxShadow: 'var(--shadow-md)',
    };
    
    const variants: Record<string, React.CSSProperties> = {
      num: { 
        background: 'var(--color-bg-surface)', 
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-subtle)',
      },
      op: {
        background: 'linear-gradient(180deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 80%, #000) 100%)',
        color: 'var(--color-text-inverse)',
        boxShadow: '0 2px 12px color-mix(in srgb, var(--color-accent) 40%, transparent)',
        border: 'none',
      },
      func: { 
        background: 'var(--color-bg-hover)', 
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-default)',
      },
      equal: { 
        background: 'linear-gradient(180deg, var(--color-success) 0%, color-mix(in srgb, var(--color-success) 80%, #000) 100%)', 
        color: 'var(--color-text-inverse)',
        boxShadow: '0 2px 12px color-mix(in srgb, var(--color-success) 40%, transparent)',
        border: 'none',
      },
    };
    
    return { ...base, ...variants[variant] };
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div className="dex-liquid-glass" style={styles.header}>
        <div className="dex-liquid-glass" style={styles.modeToggle}>
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
          <button className="dex-liquid-glass" style={styles.historyBtn} onClick={copyResult} aria-label="Copy result" title="Copy result">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button className="dex-liquid-glass" style={styles.historyBtn} onClick={sendResult} aria-label="Send result to app" title="Send to app (Flow)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
          </button>
          <button className="dex-liquid-glass" style={styles.historyBtn} onClick={() => setShowHistory(!showHistory)} aria-label="Toggle history" title="History">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

        </div>
      </div>

      <div style={styles.main}>
        {/* Natural-language input: units, percents, functions */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            className="dex-liquid-glass"
            value={naturalInput}
            onChange={e => setNaturalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runNatural(); }}
            placeholder="Try: 5 km in mi · 20% of 80 · sqrt(2)"
            aria-label="Natural calculation input"
            style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 14, color: 'var(--color-text-primary)', fontSize: 13, outline: 'none', fontFamily: 'var(--dex-font-ui)' }}
          />
          <button onClick={runNatural} aria-label="Evaluate expression" title="Evaluate" style={{ padding: '0 14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'var(--color-accent-fill)', color: 'var(--color-text-inverse, #fff)', fontWeight: 600, fontSize: 15 }}>=</button>
        </div>
        {/* Display */}
        <div className="dex-liquid-glass-strong" style={styles.displayArea}>
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
          
          <button style={{ ...btnStyle('num'), gridColumn: 'span 2', width: '100%', borderRadius: '24px' }} onClick={() => inputDigit('0')} aria-label="0">0</button>
          <button style={btnStyle('num')} onClick={inputDecimal} aria-label="Decimal point">.</button>
          <button style={btnStyle('equal')} onClick={equals} aria-label="Equals">=</button>
          {mode === 'scientific' && <button style={btnStyle('func')} onClick={() => setMemory(0)} aria-label="Memory clear">MC</button>}
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="dex-liquid-glass-strong" style={styles.historyPanel}>
          <div style={styles.historyHeader}>
            <span className="dex-label-caps">History</span>
            {history.length > 0 && (
              <button style={styles.clearHistoryBtn} onClick={() => setHistory([])} aria-label="Clear history">Clear</button>
            )}
          </div>
          <div style={styles.historyList}>
            {history.length === 0 ? (
              <div style={styles.emptyHistory}>No calculations yet</div>
            ) : (
              history.map((item) => (
                <div key={item.id} role="button" tabIndex={0} title={`${item.expr} = ${item.result}`} aria-label={`Reuse result ${item.result}`} style={styles.historyItem} onClick={() => { setDisplay(item.result); setWaitingForOperand(true); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDisplay(item.result); setWaitingForOperand(true); } }}>
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
    fontFamily: 'var(--dex-font-ui)',
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    height: 'var(--app-header-height, 44px)',
    borderRadius: 0,
  },
  modeToggle: {
    display: 'flex',
    borderRadius: '10px',
    padding: '2px',
    gap: '2px',
  },
  modeBtn: {
    padding: 'var(--space-2) var(--space-4)',
    border: 'none',
    borderRadius: '10px',
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
    background: 'linear-gradient(180deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 80%, #000) 100%)',
    color: 'var(--color-text-inverse)',
    boxShadow: '0 2px 8px color-mix(in srgb, var(--color-accent) 40%, transparent)',
  },
  historyBtn: {
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 'var(--space-2)',
    borderRadius: '10px',
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
    padding: '14px',
    width: '100%',
  },
  displayArea: {
    textAlign: 'right',
    padding: 'var(--space-3) 14px',
    minHeight: '80px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    position: 'relative',
    borderRadius: '14px',
    marginBottom: '10px',
  },
  expression: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    marginBottom: 'var(--space-2)',
    fontWeight: 500,
    letterSpacing: '0.5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  display: {
    fontSize: '36px',
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
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
  },
  keypad: {
    display: 'grid',
    gap: 'var(--space-2)',
    justifyItems: 'center',
  },
  historyPanel: {
    position: 'absolute',
    top: '44px',
    right: '0',
    bottom: '0',
    width: 'min(260px, 82vw)',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  clearHistoryBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px var(--space-2)',
    borderRadius: '10px',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },
  historyList: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-3)',
  },
  emptyHistory: {
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    padding: '48px var(--space-5)',
    fontSize: '12px',
    fontWeight: 500,
  },
  historyItem: {
    padding: 'var(--space-3)',
    borderRadius: '10px',
    marginBottom: 'var(--space-2)',
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyResult: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.5px',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

Calculator.displayName = 'Calculator';
export default memo(Calculator);
