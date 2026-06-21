/**
 * DEX Platform - Unit Converter
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional unit converter — length, weight, temperature, volume, speed, data
 */
import React, { useState, useMemo, useCallback, memo } from 'react';
import { resolveUnitQuery } from '../../../shared/format/unitSearch';

type Category = 'length' | 'weight' | 'temperature' | 'volume' | 'speed' | 'data' | 'energy';

interface UnitDef { label: string; symbol: string; toBase: (v: number) => number; fromBase: (v: number) => number }

const UNITS: Record<Category, UnitDef[]> = {
  length: [
    { label: 'Meters', symbol: 'm', toBase: v => v, fromBase: v => v },
    { label: 'Kilometers', symbol: 'km', toBase: v => v * 1000, fromBase: v => v / 1000 },
    { label: 'Centimeters', symbol: 'cm', toBase: v => v / 100, fromBase: v => v * 100 },
    { label: 'Millimeters', symbol: 'mm', toBase: v => v / 1000, fromBase: v => v * 1000 },
    { label: 'Miles', symbol: 'mi', toBase: v => v * 1609.344, fromBase: v => v / 1609.344 },
    { label: 'Feet', symbol: 'ft', toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
    { label: 'Inches', symbol: 'in', toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
    { label: 'Yards', symbol: 'yd', toBase: v => v * 0.9144, fromBase: v => v / 0.9144 },
  ],
  weight: [
    { label: 'Kilograms', symbol: 'kg', toBase: v => v, fromBase: v => v },
    { label: 'Grams', symbol: 'g', toBase: v => v / 1000, fromBase: v => v * 1000 },
    { label: 'Milligrams', symbol: 'mg', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
    { label: 'Pounds', symbol: 'lb', toBase: v => v * 0.453592, fromBase: v => v / 0.453592 },
    { label: 'Ounces', symbol: 'oz', toBase: v => v * 0.0283495, fromBase: v => v / 0.0283495 },
    { label: 'Tonnes', symbol: 't', toBase: v => v * 1000, fromBase: v => v / 1000 },
  ],
  temperature: [
    { label: 'Celsius', symbol: '°C', toBase: v => v, fromBase: v => v },
    { label: 'Fahrenheit', symbol: '°F', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
    { label: 'Kelvin', symbol: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
  ],
  volume: [
    { label: 'Liters', symbol: 'L', toBase: v => v, fromBase: v => v },
    { label: 'Milliliters', symbol: 'mL', toBase: v => v / 1000, fromBase: v => v * 1000 },
    { label: 'Gallons (US)', symbol: 'gal', toBase: v => v * 3.78541, fromBase: v => v / 3.78541 },
    { label: 'Quarts', symbol: 'qt', toBase: v => v * 0.946353, fromBase: v => v / 0.946353 },
    { label: 'Cups', symbol: 'cup', toBase: v => v * 0.236588, fromBase: v => v / 0.236588 },
    { label: 'Fluid Oz', symbol: 'fl oz', toBase: v => v * 0.0295735, fromBase: v => v / 0.0295735 },
  ],
  speed: [
    { label: 'km/h', symbol: 'km/h', toBase: v => v, fromBase: v => v },
    { label: 'mph', symbol: 'mph', toBase: v => v * 1.60934, fromBase: v => v / 1.60934 },
    { label: 'm/s', symbol: 'm/s', toBase: v => v * 3.6, fromBase: v => v / 3.6 },
    { label: 'Knots', symbol: 'kn', toBase: v => v * 1.852, fromBase: v => v / 1.852 },
  ],
  data: [
    { label: 'Bytes', symbol: 'B', toBase: v => v, fromBase: v => v },
    { label: 'Kilobytes', symbol: 'KB', toBase: v => v * 1024, fromBase: v => v / 1024 },
    { label: 'Megabytes', symbol: 'MB', toBase: v => v * 1048576, fromBase: v => v / 1048576 },
    { label: 'Gigabytes', symbol: 'GB', toBase: v => v * 1073741824, fromBase: v => v / 1073741824 },
    { label: 'Terabytes', symbol: 'TB', toBase: v => v * 1099511627776, fromBase: v => v / 1099511627776 },
  ],
  energy: [
    { label: 'Joules', symbol: 'J', toBase: v => v, fromBase: v => v },
    { label: 'Kilojoules', symbol: 'kJ', toBase: v => v * 1000, fromBase: v => v / 1000 },
    { label: 'Calories', symbol: 'cal', toBase: v => v * 4.184, fromBase: v => v / 4.184 },
    { label: 'Kilocalories', symbol: 'kcal', toBase: v => v * 4184, fromBase: v => v / 4184 },
    { label: 'Watt-hours', symbol: 'Wh', toBase: v => v * 3600, fromBase: v => v / 3600 },
    { label: 'Kilowatt-hours', symbol: 'kWh', toBase: v => v * 3.6e6, fromBase: v => v / 3.6e6 },
  ],
};

const CAT_ICONS: Record<Category, string> = {
  length: 'L', weight: 'W', temperature: 'T', volume: 'V', speed: 'S', data: 'D', energy: 'E',
};

const CATEGORIES: Category[] = ['length', 'weight', 'temperature', 'volume', 'speed', 'data', 'energy'];

const UnitConverter: React.FC = () => {
  const [category, setCategory] = useState<Category>('length');
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);
  const [inputValue, setInputValue] = useState('1');
  const [unitQuery, setUnitQuery] = useState('');

  const units = UNITS[category];

  // Jump to a unit typed into the search box (e.g. "km", "pounds", "MB").
  const runUnitSearch = useCallback(() => {
    const match = resolveUnitQuery(UNITS, unitQuery);
    if (!match) return;
    const cat = match.category as Category;
    setCategory(cat);
    setFromIdx(match.index);
    setToIdx(prev => prev === match.index ? (match.index + 1) % UNITS[cat].length : prev);
    setUnitQuery('');
  }, [unitQuery]);

  const result = useMemo(() => {
    const val = parseFloat(inputValue);
    if (isNaN(val)) return '';
    const base = units[fromIdx].toBase(val);
    const out = units[toIdx].fromBase(base);
    return out.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }, [inputValue, fromIdx, toIdx, units]);

  const swap = useCallback(() => {
    setFromIdx(toIdx);
    setToIdx(fromIdx);
  }, [fromIdx, toIdx]);

  // Copy the converted value to the clipboard. Guarded — clipboard access can be
  // blocked (insecure context / permissions) and must not throw into the UI.
  const copyResult = useCallback(() => {
    if (!result) return;
    try {
      void navigator.clipboard?.writeText(result).catch(() => { /* clipboard blocked */ });
    } catch { /* clipboard unavailable */ }
  }, [result]);

  const handleCategoryChange = useCallback((cat: Category) => {
    setCategory(cat);
    setFromIdx(0);
    setToIdx(1);
    setInputValue('1');
  }, []);

  return (
    <div style={s.container}>
      {/* Unit search */}
      <div style={s.searchBar}>
        <input
          type="text"
          value={unitQuery}
          onChange={e => setUnitQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runUnitSearch(); }}
          onBlur={runUnitSearch}
          placeholder="Find a unit — e.g. km, pounds, MB, kWh"
          style={s.search}
          aria-label="Find a unit"
        />
      </div>

      {/* Category tabs */}
      <div style={s.tabs}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            style={{
              ...s.tab,
              ...(cat === category ? s.tabActive : {}),
            }}
            title={cat}
          >
            <span style={{ fontSize: 16 }}>{CAT_ICONS[cat]}</span>
            <span style={s.tabLabel}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* Converter */}
      <div style={s.converterArea}>
        {/* From */}
        <div style={s.unitBlock}>
          <select
            value={fromIdx}
            onChange={e => setFromIdx(Number(e.target.value))}
            style={s.select}
          >
            {units.map((u, i) => <option key={i} value={i}>{u.label} ({u.symbol})</option>)}
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            style={s.input}
            placeholder="0"
          />
        </div>

        {/* Swap button */}
        <button onClick={swap} style={s.swapBtn} title="Swap units">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>

        {/* To */}
        <div style={s.unitBlock}>
          <select
            value={toIdx}
            onChange={e => setToIdx(Number(e.target.value))}
            style={s.select}
          >
            {units.map((u, i) => <option key={i} value={i}>{u.label} ({u.symbol})</option>)}
          </select>
          <div style={s.resultRow}>
            <div style={s.resultDisplay}>
              {result || '—'}
            </div>
            <button
              onClick={copyResult}
              style={{ ...s.copyBtn, ...(!result ? s.copyBtnDisabled : {}) }}
              title="Copy result"
              aria-label="Copy result"
              disabled={!result}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Formula */}
      {inputValue && result && (
        <div style={s.formula}>
          {inputValue} {units[fromIdx].symbol} = {result} {units[toIdx].symbol}
        </div>
      )}

      {/* Quick reference grid */}
      <div style={s.refGrid}>
        <div className="dex-label-caps" style={s.refHeader}>Quick Reference</div>
        <div style={s.refTable}>
          {[1, 10, 100, 1000].map(val => {
            const base = units[fromIdx].toBase(val);
            const converted = units[toIdx].fromBase(base);
            return (
              <div key={val} style={s.refRow}>
                <span style={s.refFrom}>{val.toLocaleString()} {units[fromIdx].symbol}</span>
                <span style={s.refArrow}>→</span>
                <span style={s.refTo}>{converted.toLocaleString('en-US', { maximumFractionDigits: 4 })} {units[toIdx].symbol}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
  },
  searchBar: {
    padding: 'var(--space-3) var(--space-4) 0', flexShrink: 0,
  },
  search: {
    width: '100%', padding: '8px var(--space-3)', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-inset)',
    color: 'var(--color-text-primary)', fontSize: 13, outline: 'none',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  tabs: {
    display: 'flex', gap: 4, padding: 'var(--space-3) var(--space-4)', flexShrink: 0,
    overflowX: 'auto', borderBottom: '1px solid var(--color-border-subtle)',
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px var(--space-3)', borderRadius: 6, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family)',
  },
  tabActive: {
    background: 'var(--color-accent-light)', color: 'var(--color-accent)',
  },
  tabLabel: { fontSize: 12 },
  converterArea: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 'var(--space-3)', padding: 'var(--space-6) var(--space-5)',
  },
  unitBlock: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  select: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500,
    cursor: 'pointer', outline: 'none', fontFamily: 'var(--font-family)',
  },
  input: {
    width: '100%', padding: '14px var(--space-4)', borderRadius: 10,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-inset)',
    color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 300,
    outline: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  resultRow: {
    width: '100%', display: 'flex', alignItems: 'stretch', gap: 'var(--space-2)',
  },
  resultDisplay: {
    flex: 1, padding: '14px var(--space-4)', borderRadius: 10,
    background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-light)',
    color: 'var(--color-accent)', fontSize: 24, fontWeight: 400,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
    minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    boxSizing: 'border-box',
  },
  copyBtn: {
    width: 44, borderRadius: 10, flexShrink: 0,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  copyBtnDisabled: {
    opacity: 0.4, cursor: 'not-allowed',
  },
  swapBtn: {
    width: 40, height: 40, borderRadius: '50%',
    border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease', flexShrink: 0,
  },
  formula: {
    textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)',
    padding: '0 var(--space-5) var(--space-4)', fontVariantNumeric: 'tabular-nums',
  },
  refGrid: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  refHeader: {
    padding: 'var(--space-3) var(--space-5) var(--space-2)',
  },
  refTable: { flex: 1, overflow: 'auto', padding: '0 var(--space-5) var(--space-4)' },
  refRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '6px 0', fontSize: 14, fontVariantNumeric: 'tabular-nums',
  },
  refFrom: { flex: 1, color: 'var(--color-text-secondary)' },
  refArrow: { color: 'var(--color-text-muted)', fontSize: 12 },
  refTo: { flex: 1, textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 500 },
};

UnitConverter.displayName = 'UnitConverter';
export default memo(UnitConverter);
