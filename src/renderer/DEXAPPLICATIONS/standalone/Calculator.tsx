/**
 * DEX Platform - Calculator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional calculator with scientific mode
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useAppWindowId, isExtraWindow } from '../../services/appWindows';
import { useAppTracking } from '../../services/usePatternLearning';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import {
  appendDigit, applyOperator, backspaceEntry, evaluateNatural, formatEntry, formatResult, parseDisplay,
  type BinaryOp,
} from './calculatorEngine';

export { evaluateNatural } from './calculatorEngine';

// ===========================================================================
// DEX CALCULATOR
// Keys fill a responsive grid; the pending operator stays highlighted; the
// keyboard works while the calculator has focus (not app-wide, since DEX keeps
// apps mounted in the background).
// ===========================================================================

const OP_SYMBOL: Record<BinaryOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

type KeyVariant = 'num' | 'op' | 'func' | 'equal';

// Defined outside Calculator so keys keep their identity (and focus) across renders.
const Key: React.FC<{
  variant: KeyVariant; label: string; onPress: () => void; children: React.ReactNode;
  span?: number; pressed?: boolean;
}> = ({ variant, label, onPress, children, span, pressed }) => (
  <button
    type="button"
    className={`dex-calc-key dex-calc-key--${variant}${pressed ? ' is-pressed' : ''}`}
    onClick={onPress}
    aria-label={label}
    aria-pressed={pressed === undefined ? undefined : pressed}
    style={span ? { gridColumn: `span ${span}` } : undefined}
  >{children}</button>
);

const Calculator: React.FC = () => {
  const winId = useAppWindowId('calculator');
  // ===== PATTERN LEARNING =====
  useAppTracking('calculator');
  const [naturalInput, setNaturalInput] = useState('');

  // `display` holds the raw entry while typing ("1234.50") and a formatted
  // result after an operation; it is grouped for display either way.
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<{ id: string; expr: string; result: string }[]>([]);
  const [mode, setMode] = useState<'basic' | 'scientific'>('basic');
  const [showHistory, setShowHistory] = useState(false);
  const [lastOperator, setLastOperator] = useState<BinaryOp | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  // Pressing = again repeats the last operation (5 + 2 = = gives 9).
  const repeatRef = useRef<{ op: BinaryOp; operand: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const pushHistory = (expr: string, result: string) => {
    if (result === 'Error') return;
    // Cap the in-memory array (not just the persisted copy) so a long session
    // of calculations can't grow history without bound.
    setHistory(prev => [{ id: `calc-${Date.now()}`, expr, result }, ...prev].slice(0, 50));
  };

  const showValue = (n: number) => {
    setDisplay(formatResult(n));
    setWaitingForOperand(true);
  };

  const inputDigit = (digit: string) => {
    if (waitingForOperand || display === 'Error') {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(appendDigit(display.replace(/,/g, ''), digit));
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand || display === 'Error') {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display.replace(/,/g, '') + '.');
    }
  };

  const clearAll = () => {
    setDisplay('0');
    setExpression('');
    setLastOperator(null);
    setPreviousValue(null);
    setWaitingForOperand(false);
    repeatRef.current = null;
  };

  // "C" clears only the current entry; "AC" resets everything.
  const entryActive = !waitingForOperand && display !== '0';
  const clearKey = () => {
    if (entryActive) setDisplay('0');
    else clearAll();
  };

  const backspace = () => {
    if (waitingForOperand) return; // results are not editable, like macOS
    setDisplay(backspaceEntry(display.replace(/,/g, '')));
  };

  const toggleSign = () => {
    if (display === 'Error') return;
    const raw = display.replace(/,/g, '');
    if (waitingForOperand) { showValue(-parseDisplay(raw)); return; }
    setDisplay(raw.startsWith('-') ? raw.slice(1) : raw === '0' ? '-0' : '-' + raw);
  };

  const percentage = () => {
    const value = parseDisplay(display);
    if (!isFinite(value)) return;
    // With a pending + or −, % means "percent of the first operand" (100 + 10% = 110).
    const pct = previousValue !== null && (lastOperator === '+' || lastOperator === '-')
      ? previousValue * value / 100
      : value / 100;
    showValue(pct);
  };

  const performOperation = (op: BinaryOp) => {
    const value = parseDisplay(display);
    if (!isFinite(value)) return;
    repeatRef.current = null;

    if (previousValue !== null && lastOperator && !waitingForOperand) {
      const result = applyOperator(previousValue, lastOperator, value);
      const shown = formatResult(result);
      setDisplay(shown);
      if (!isFinite(result)) { setPreviousValue(null); setLastOperator(null); setExpression(''); setWaitingForOperand(true); return; }
      setPreviousValue(result);
      setExpression(`${shown} ${OP_SYMBOL[op]}`);
    } else {
      setPreviousValue(value);
      setExpression(`${formatResult(value)} ${OP_SYMBOL[op]}`);
    }

    setLastOperator(op);
    setWaitingForOperand(true);
  };

  const equals = () => {
    const value = parseDisplay(display);
    if (previousValue === null || !lastOperator) {
      const rep = repeatRef.current;
      if (!rep || !isFinite(value)) return;
      const result = applyOperator(value, rep.op, rep.operand);
      const shown = formatResult(result);
      pushHistory(`${formatResult(value)} ${OP_SYMBOL[rep.op]} ${formatResult(rep.operand)}`, shown);
      setDisplay(shown);
      setWaitingForOperand(true);
      return;
    }
    if (!isFinite(value) || !isFinite(previousValue)) return;
    const result = applyOperator(previousValue, lastOperator, value);
    const shown = formatResult(result);
    pushHistory(`${formatResult(previousValue)} ${OP_SYMBOL[lastOperator]} ${formatResult(value)}`, shown);
    repeatRef.current = isFinite(result) ? { op: lastOperator, operand: value } : null;
    setDisplay(shown);
    setExpression(isFinite(result) ? '' : (lastOperator === '/' && value === 0 ? 'Cannot divide by zero' : ''));
    setPreviousValue(null);
    setLastOperator(null);
    setWaitingForOperand(true);
  };

  const factorial = (n: number): number => {
    if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  const scientificFn = (fn: string) => {
    const value = parseDisplay(display);
    if (!isFinite(value) && fn !== 'pi' && fn !== 'e') return;
    let result: number;

    switch (fn) {
      case 'sin': result = Math.sin(value * Math.PI / 180); break;
      case 'cos': result = Math.cos(value * Math.PI / 180); break;
      case 'tan': result = Math.abs(value % 180) === 90 ? NaN : Math.tan(value * Math.PI / 180); break;
      case 'ln': result = Math.log(value); break;
      case 'log': result = Math.log10(value); break;
      case 'sqrt': result = Math.sqrt(value); break;
      case 'x2': result = value * value; break;
      case 'x3': result = value * value * value; break;
      case '1/x': result = value === 0 ? NaN : 1 / value; break;
      case 'pi': result = Math.PI; break;
      case 'e': result = Math.E; break;
      case '!': result = factorial(value); break;
      default: return;
    }

    showValue(result);
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
    const resultStr = formatResult(res.value);
    pushHistory(res.expr, resultStr);
    setDisplay(resultStr);
    setExpression(res.expr);
    setNaturalInput('');
    setPreviousValue(null);
    setLastOperator(null);
    setWaitingForOperand(true);
  };

  // Keyboard support while the calculator has focus. Handled keys call
  // preventDefault so Enter on a focused key doesn't also "click" it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') copyResult();
      return;
    }
    let handled = true;
    if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
    else if (e.key === '.' || e.key === ',') inputDecimal();
    else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') performOperation(e.key);
    else if (e.key === 'x' || e.key === 'X') performOperation('*');
    else if (e.key === 'Enter' || e.key === '=') equals();
    else if (e.key === '%') percentage();
    else if (e.key === 'Escape') { if (showHistory) setShowHistory(false); else clearAll(); }
    else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') clearKey();
    else if (e.key === 'Backspace') backspace();
    else handled = false;
    if (handled) e.preventDefault();
  };

  // Focus the calculator on open so typing works immediately.
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);

  // UKI app-context: expose the current expression, displayed value (last
  // result), and the active mode so the assistant knows what the user is
  // computing. A ref keeps the resolver reading live state — register once.
  const ukiCtxRef = useRef({ display, expression, mode });
  ukiCtxRef.current = { display, expression, mode };
  useEffect(() => {
    if (isExtraWindow(winId)) return; // UKI hooks belong to the app's first window
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
  }, [winId]);

  const shown = waitingForOperand || display === 'Error' ? display : formatEntry(display);
  const displaySize = shown.length > 14 ? 24 : shown.length > 10 ? 30 : 40;

  const opKey = (op: BinaryOp, label: string) => (
    <Key variant="op" label={label} onPress={() => performOperation(op)}
      pressed={lastOperator === op && waitingForOperand}>{OP_SYMBOL[op]}</Key>
  );
  const sci = mode === 'scientific';

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className="dex-calc" style={styles.container}>
      <style>{CALC_CSS}</style>
      {/* Header */}
      <div style={styles.header}>
        <div role="group" aria-label="Calculator mode" style={styles.modeToggle}>
          <button
            type="button"
            aria-pressed={mode === 'basic'}
            className="dex-calc-seg"
            onClick={() => setMode('basic')}
          >Basic</button>
          <button
            type="button"
            aria-pressed={mode === 'scientific'}
            className="dex-calc-seg"
            onClick={() => setMode('scientific')}
          >Scientific</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" className="dex-calc-icon" onClick={copyResult} aria-label="Copy result" title="Copy result">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button type="button" className="dex-calc-icon" onClick={sendResult} aria-label="Send result to app" title="Send to app (Flow)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
          </button>
          <button type="button" className="dex-calc-icon" onClick={() => setShowHistory(!showHistory)} aria-label="Toggle history" aria-expanded={showHistory} title="History">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={styles.main}>
        {/* Natural-language input: units, percents, functions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            className="dex-calc-input"
            value={naturalInput}
            onChange={e => setNaturalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runNatural(); }}
            placeholder="Try: 5 km in mi · 20% of 80 · sqrt(2)"
            aria-label="Natural calculation input"
          />
          <button type="button" className="dex-calc-key dex-calc-key--equal" onClick={runNatural} aria-label="Evaluate expression" title="Evaluate" style={{ width: 44, minHeight: 36 }}>=</button>
        </div>
        {/* Display */}
        <div style={styles.displayArea}>
          {memory !== 0 && <div style={styles.memoryBadge} aria-label="Memory in use">M</div>}
          <div style={styles.expression} aria-hidden={!expression}>{expression || ' '}</div>
          <div style={{ ...styles.display, fontSize: displaySize }} aria-live="polite" aria-label={`Display ${shown}`}>{shown}</div>
        </div>

        {/* Keypad */}
        <div style={{ ...styles.keypad, gridTemplateColumns: sci ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
          {sci && (
            <>
              <Key variant="func" label="Sine (degrees)" onPress={() => scientificFn('sin')}>sin</Key>
              <Key variant="func" label="Cosine (degrees)" onPress={() => scientificFn('cos')}>cos</Key>
              <Key variant="func" label="Tangent (degrees)" onPress={() => scientificFn('tan')}>tan</Key>
              <Key variant="func" label="Natural logarithm" onPress={() => scientificFn('ln')}>ln</Key>
              <Key variant="func" label="Logarithm base 10" onPress={() => scientificFn('log')}>log</Key>

              <Key variant="func" label="Square root" onPress={() => scientificFn('sqrt')}>√x</Key>
              <Key variant="func" label="Square" onPress={() => scientificFn('x2')}>x²</Key>
              <Key variant="func" label="Cube" onPress={() => scientificFn('x3')}>x³</Key>
              <Key variant="func" label="Pi" onPress={() => scientificFn('pi')}>π</Key>
              <Key variant="func" label="Euler number" onPress={() => scientificFn('e')}>e</Key>
            </>
          )}

          <Key variant="func" label={entryActive ? 'Clear entry' : 'Clear all'} onPress={clearKey}>{entryActive ? 'C' : 'AC'}</Key>
          <Key variant="func" label="Toggle sign" onPress={toggleSign}>+/−</Key>
          <Key variant="func" label="Percentage" onPress={percentage}>%</Key>
          {opKey('/', 'Divide')}
          {sci && <Key variant="func" label="Factorial" onPress={() => scientificFn('!')}>x!</Key>}

          <Key variant="num" label="7" onPress={() => inputDigit('7')}>7</Key>
          <Key variant="num" label="8" onPress={() => inputDigit('8')}>8</Key>
          <Key variant="num" label="9" onPress={() => inputDigit('9')}>9</Key>
          {opKey('*', 'Multiply')}
          {sci && <Key variant="func" label="Reciprocal" onPress={() => scientificFn('1/x')}>1/x</Key>}

          <Key variant="num" label="4" onPress={() => inputDigit('4')}>4</Key>
          <Key variant="num" label="5" onPress={() => inputDigit('5')}>5</Key>
          <Key variant="num" label="6" onPress={() => inputDigit('6')}>6</Key>
          {opKey('-', 'Subtract')}
          {sci && <Key variant="func" label="Memory add" onPress={() => { const v = parseDisplay(display); if (isFinite(v)) setMemory(memory + v); }}>M+</Key>}

          <Key variant="num" label="1" onPress={() => inputDigit('1')}>1</Key>
          <Key variant="num" label="2" onPress={() => inputDigit('2')}>2</Key>
          <Key variant="num" label="3" onPress={() => inputDigit('3')}>3</Key>
          {opKey('+', 'Add')}
          {sci && <Key variant="func" label="Memory recall" onPress={() => showValue(memory)}>MR</Key>}

          <Key variant="num" label="0" onPress={() => inputDigit('0')} span={2}>0</Key>
          <Key variant="num" label="Decimal point" onPress={inputDecimal}>.</Key>
          <Key variant="equal" label="Equals" onPress={equals}>=</Key>
          {sci && <Key variant="func" label="Memory clear" onPress={() => setMemory(0)}>MC</Key>}
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div style={styles.historyPanel} role="region" aria-label="Calculation history">
          <div style={styles.historyHeader}>
            <span className="dex-label-caps">History</span>
            {history.length > 0 && (
              <button type="button" className="dex-calc-link" onClick={() => setHistory([])} aria-label="Clear history">Clear</button>
            )}
          </div>
          <div style={styles.historyList}>
            {history.length === 0 ? (
              <div style={styles.emptyHistory}>No calculations yet</div>
            ) : (
              history.map((item) => (
                <button type="button" key={item.id} className="dex-calc-history-item" title={`${item.expr} = ${item.result}`} aria-label={`Reuse result ${item.result}`} onClick={() => { setDisplay(item.result); setWaitingForOperand(true); }}>
                  <div style={styles.historyExpr}>{item.expr}</div>
                  <div style={styles.historyResult}>= {item.result}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Hover / press / focus states need real pseudo-classes, so the keys are styled
// here (scoped to .dex-calc). Colours are theme tokens: correct in light and dark.
const CALC_CSS = `
.dex-calc { outline: none; }
.dex-calc-key {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; min-height: 40px;
  border: 1px solid transparent; border-radius: var(--radius-lg, 14px);
  font: 500 17px/1 var(--dex-font-ui); font-variant-numeric: tabular-nums;
  cursor: pointer; user-select: none;
  transition: background-color 120ms ease, transform 120ms cubic-bezier(0.2, 0, 0, 1), filter 120ms ease;
}
.dex-calc-key--num { background: var(--color-bg-surface); color: var(--color-text-primary); border-color: var(--color-border-subtle); }
.dex-calc-key--func {
  background: color-mix(in srgb, var(--color-text-primary) 9%, var(--color-bg-surface));
  color: var(--color-text-primary); font-size: 15px;
}
.dex-calc-key--op {
  background: color-mix(in srgb, var(--color-accent) 16%, transparent); color: var(--color-accent);
  font-size: 20px;
}
.dex-calc-key--op.is-pressed { background: var(--color-accent-fill); color: var(--color-accent-text, #fff); }
.dex-calc-key--equal { background: var(--color-accent-fill); color: var(--color-accent-text, #fff); font-size: 20px; }
.dex-calc-key:hover { filter: brightness(1.06); }
:root[data-theme="light"] .dex-calc-key:hover, .light-mode .dex-calc-key:hover { filter: brightness(0.96); }
.dex-calc-key:active { transform: scale(0.95); }
.dex-calc-seg {
  height: 26px; padding: 0 var(--space-3); border: none; border-radius: var(--radius-sm, 6px);
  background: transparent; color: var(--color-text-secondary);
  font: 600 12px/1 var(--dex-font-ui); cursor: pointer; transition: background-color 120ms ease;
}
.dex-calc-seg[aria-pressed="true"] { background: var(--color-bg-surface); color: var(--color-text-primary); box-shadow: var(--shadow-sm); }
.dex-calc-icon {
  display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border: none; border-radius: var(--radius-sm, 6px); background: transparent;
  color: var(--color-text-secondary); cursor: pointer; transition: background-color 120ms ease;
}
.dex-calc-icon:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.dex-calc-input {
  flex: 1; min-width: 0; height: 36px; padding: 0 var(--space-3);
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md, 10px);
  background: var(--color-bg-surface); color: var(--color-text-primary);
  font: 13px var(--dex-font-ui); outline: none;
}
.dex-calc-link {
  border: none; background: transparent; color: var(--color-accent); cursor: pointer;
  font: 600 12px var(--dex-font-ui); padding: 4px var(--space-2); border-radius: var(--radius-sm, 6px);
}
.dex-calc-history-item {
  display: block; width: 100%; text-align: right; padding: var(--space-3);
  margin-bottom: var(--space-2); border-radius: var(--radius-md, 10px);
  background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle);
  color: inherit; cursor: pointer; font-family: var(--dex-font-ui);
}
.dex-calc-history-item:hover { background: var(--color-bg-hover); }
@media (prefers-reduced-motion: reduce) {
  .dex-calc-key, .dex-calc-seg, .dex-calc-icon { transition: none; }
  .dex-calc-key:active { transform: none; }
}
`;

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
    padding: '0 var(--space-3)',
    height: 'var(--app-header-height, 44px)',
    flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  modeToggle: {
    display: 'flex',
    borderRadius: 'var(--radius-md, 10px)',
    padding: 2,
    gap: 2,
    background: 'var(--color-bg-secondary)',
  },
  main: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    width: '100%',
    // A calculator reads best at phone-like proportions; in a maximized window
    // the column stays centred instead of stretching keys edge to edge.
    maxWidth: 460,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  displayArea: {
    textAlign: 'right',
    padding: 'var(--space-3) var(--space-4)',
    minHeight: 88,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    position: 'relative',
    borderRadius: 'var(--radius-lg, 14px)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
  },
  expression: {
    fontSize: 13,
    color: 'var(--color-text-tertiary)',
    marginBottom: 'var(--space-2)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  display: {
    fontWeight: 300,
    lineHeight: 1.1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  memoryBadge: {
    position: 'absolute',
    top: 'var(--space-2)',
    left: 'var(--space-3)',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: 10,
    fontWeight: 700,
  },
  keypad: {
    flexShrink: 0,
    display: 'grid',
    gridAutoRows: 'clamp(40px, 9vh, 64px)',
    gap: 'var(--space-2)',
  },
  historyPanel: {
    position: 'absolute',
    top: 'var(--app-header-height, 44px)',
    right: 0,
    bottom: 0,
    width: 'min(260px, 82vw)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-glass-strong)',
    backdropFilter: 'var(--glass-blur)',
    borderLeft: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-lg)',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  historyList: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-3)',
  },
  emptyHistory: {
    textAlign: 'center',
    color: 'var(--color-text-tertiary)',
    padding: '48px var(--space-5)',
    fontSize: 12,
    fontWeight: 500,
  },
  historyExpr: {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    marginBottom: 4,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyResult: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
};

Calculator.displayName = 'Calculator';
export default memo(Calculator);
