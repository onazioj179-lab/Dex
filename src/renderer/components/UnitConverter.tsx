/**
 * DEX Unit Converter
 * Convert between units: length, weight, temperature, volume, speed, data, time
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface UnitCategory {
  name: string;
  icon: string;
  units: { id: string; label: string; factor: number; offset?: number }[];
}

// factor: multiply by this to get base unit. offset: for temperature.

const CATEGORIES: UnitCategory[] = [
  {
    name: 'Length', icon: 'L',
    units: [
      { id: 'mm', label: 'Millimeters', factor: 0.001 },
      { id: 'cm', label: 'Centimeters', factor: 0.01 },
      { id: 'm', label: 'Meters', factor: 1 },
      { id: 'km', label: 'Kilometers', factor: 1000 },
      { id: 'in', label: 'Inches', factor: 0.0254 },
      { id: 'ft', label: 'Feet', factor: 0.3048 },
      { id: 'yd', label: 'Yards', factor: 0.9144 },
      { id: 'mi', label: 'Miles', factor: 1609.344 },
    ],
  },
  {
    name: 'Weight', icon: 'W',
    units: [
      { id: 'mg', label: 'Milligrams', factor: 0.001 },
      { id: 'g', label: 'Grams', factor: 1 },
      { id: 'kg', label: 'Kilograms', factor: 1000 },
      { id: 't', label: 'Tonnes', factor: 1000000 },
      { id: 'oz', label: 'Ounces', factor: 28.3495 },
      { id: 'lb', label: 'Pounds', factor: 453.592 },
      { id: 'st', label: 'Stones', factor: 6350.29 },
    ],
  },
  {
    name: 'Temperature', icon: 'T',
    units: [
      { id: 'c', label: 'Celsius', factor: 1, offset: 0 },
      { id: 'f', label: 'Fahrenheit', factor: 1, offset: 0 },
      { id: 'k', label: 'Kelvin', factor: 1, offset: 0 },
    ],
  },
  {
    name: 'Volume', icon: 'V',
    units: [
      { id: 'ml', label: 'Milliliters', factor: 0.001 },
      { id: 'l', label: 'Liters', factor: 1 },
      { id: 'gal_us', label: 'Gallons (US)', factor: 3.78541 },
      { id: 'gal_uk', label: 'Gallons (UK)', factor: 4.54609 },
      { id: 'cup', label: 'Cups', factor: 0.236588 },
      { id: 'tbsp', label: 'Tablespoons', factor: 0.0147868 },
      { id: 'tsp', label: 'Teaspoons', factor: 0.00492892 },
      { id: 'fl_oz', label: 'Fluid Ounces', factor: 0.0295735 },
    ],
  },
  {
    name: 'Speed', icon: 'S',
    units: [
      { id: 'mps', label: 'Meters/sec', factor: 1 },
      { id: 'kph', label: 'km/h', factor: 0.277778 },
      { id: 'mph', label: 'mph', factor: 0.44704 },
      { id: 'knot', label: 'Knots', factor: 0.514444 },
      { id: 'ftps', label: 'Feet/sec', factor: 0.3048 },
    ],
  },
  {
    name: 'Data', icon: 'D',
    units: [
      { id: 'bit', label: 'Bits', factor: 1 },
      { id: 'byte', label: 'Bytes', factor: 8 },
      { id: 'kb', label: 'Kilobytes', factor: 8192 },
      { id: 'mb', label: 'Megabytes', factor: 8388608 },
      { id: 'gb', label: 'Gigabytes', factor: 8589934592 },
      { id: 'tb', label: 'Terabytes', factor: 8796093022208 },
    ],
  },
  {
    name: 'Time', icon: 'Ti',
    units: [
      { id: 'ms', label: 'Milliseconds', factor: 0.001 },
      { id: 'sec', label: 'Seconds', factor: 1 },
      { id: 'min', label: 'Minutes', factor: 60 },
      { id: 'hr', label: 'Hours', factor: 3600 },
      { id: 'day', label: 'Days', factor: 86400 },
      { id: 'week', label: 'Weeks', factor: 604800 },
      { id: 'month', label: 'Months (avg)', factor: 2629746 },
      { id: 'year', label: 'Years', factor: 31557600 },
    ],
  },
];

// ============================================================================
// CONVERSION
// ============================================================================

function convertTemperature(value: number, from: string, to: string): number {
  // Convert to Celsius first
  let c: number;
  if (from === 'c') c = value;
  else if (from === 'f') c = (value - 32) * 5 / 9;
  else c = value - 273.15; // kelvin
  // Convert from Celsius to target
  if (to === 'c') return c;
  if (to === 'f') return c * 9 / 5 + 32;
  return c + 273.15; // kelvin
}

function convert(value: number, fromId: string, toId: string, category: UnitCategory): number {
  if (category.name === 'Temperature') return convertTemperature(value, fromId, toId);
  const fromUnit = category.units.find(u => u.id === fromId);
  const toUnit = category.units.find(u => u.id === toId);
  if (!fromUnit || !toUnit) return value;
  const base = value * fromUnit.factor;
  return base / toUnit.factor;
}

function formatResult(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return '0';
  if (Math.abs(n) < 0.000001 && n !== 0) return n.toExponential(4);
  if (Math.abs(n) > 999999999) return n.toExponential(4);
  // Show up to 6 decimal places, strip trailing zeros
  return parseFloat(n.toFixed(6)).toString();
}

// ============================================================================
// STORAGE
// ============================================================================

interface ConversionHistory {
  from: string;
  to: string;
  value: number;
  result: string;
  category: string;
  timestamp: number;
}

const STORAGE_KEY = 'dex-unit-converter';

function loadHistory(): ConversionHistory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveHistory(h: ConversionHistory[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(0, 30))); } catch {}
}

// ============================================================================
// COMPONENT
// ============================================================================

export const UnitConverter: React.FC = memo(() => {
  const [catIdx, setCatIdx] = useState(0);
  const [fromId, setFromId] = useState(CATEGORIES[0].units[0].id);
  const [toId, setToId] = useState(CATEGORIES[0].units[1].id);
  const [inputValue, setInputValue] = useState('1');
  const [history, setHistory] = useState<ConversionHistory[]>(loadHistory);

  const category = CATEGORIES[catIdx];

  const result = useMemo(() => {
    const val = parseFloat(inputValue);
    if (isNaN(val)) return '0';
    return formatResult(convert(val, fromId, toId, category));
  }, [inputValue, fromId, toId, category]);

  const switchCategory = useCallback((idx: number) => {
    setCatIdx(idx);
    setFromId(CATEGORIES[idx].units[0].id);
    setToId(CATEGORIES[idx].units[Math.min(1, CATEGORIES[idx].units.length - 1)].id);
    setInputValue('1');
  }, []);

  const swapUnits = useCallback(() => {
    setFromId(toId);
    setToId(fromId);
  }, [fromId, toId]);

  const saveConversion = useCallback(() => {
    const entry: ConversionHistory = {
      from: fromId, to: toId,
      value: parseFloat(inputValue) || 0,
      result, category: category.name,
      timestamp: Date.now(),
    };
    const updated = [entry, ...history].slice(0, 30);
    setHistory(updated);
    saveHistory(updated);
  }, [fromId, toId, inputValue, result, category.name, history]);

  const fromUnit = category.units.find(u => u.id === fromId);
  const toUnit = category.units.find(u => u.id === toId);

  return (
    <div style={styles.container}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Unit Converter</h2>

      {/* Category tabs */}
      <div style={styles.catRow}>
        {CATEGORIES.map((c, i) => (
          <button key={c.name} onClick={() => switchCategory(i)}
            style={{ ...styles.catTab, ...(catIdx === i ? styles.catTabActive : {}) }}>
            {c.name}
          </button>
        ))}
      </div>

      {/* From -> To */}
      <div style={styles.converterPanel}>
        {/* From */}
        <div style={styles.unitSection}>
          <select value={fromId} onChange={e => setFromId(e.target.value)} style={styles.unitSelect} aria-label="From unit">
            {category.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
            style={styles.valueInput} placeholder="Enter value" aria-label="Input value" autoFocus />
        </div>

        {/* Swap */}
        <button onClick={swapUnits} style={styles.swapBtn} aria-label="Swap units">⇆</button>

        {/* To */}
        <div style={styles.unitSection}>
          <select value={toId} onChange={e => setToId(e.target.value)} style={styles.unitSelect} aria-label="To unit">
            {category.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <div style={styles.resultDisplay}>{result}</div>
        </div>
      </div>

      {/* Summary */}
      <div style={styles.summary}>
        {inputValue || '0'} {fromUnit?.label} = <strong>{result}</strong> {toUnit?.label}
      </div>

      <button onClick={saveConversion} style={styles.saveBtn}>Save to History</button>

      {/* Quick reference: all conversions from current value */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>All conversions</h3>
        <div style={styles.allConversions}>
          {category.units.filter(u => u.id !== fromId).map(u => (
            <div key={u.id} style={styles.convRow}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                {formatResult(convert(parseFloat(inputValue) || 0, fromId, u.id, category))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>History</h3>
          <div style={styles.historyList}>
            {history.slice(0, 10).map((h, i) => (
              <div key={i} style={styles.historyItem}>
                <span style={{ fontSize: 11 }}>{h.value} {h.from} = {h.result} {h.to}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{h.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

UnitConverter.displayName = 'UnitConverter';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 12 },
  catRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  catTab: { padding: '4px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  catTabActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  converterPanel: { display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  unitSection: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
  unitSelect: { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none' },
  valueInput: { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 16, fontWeight: 700, fontFamily: 'monospace', outline: 'none', textAlign: 'center' },
  resultDisplay: { padding: '8px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.08)', fontSize: 16, fontWeight: 700, fontFamily: 'monospace', textAlign: 'center', color: '#3b82f6' },
  swapBtn: { width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 13, textAlign: 'center', padding: '8px 0', color: 'var(--color-text-muted)' },
  saveBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'center' },
  allConversions: { display: 'flex', flexDirection: 'column', gap: 2 },
  convRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.01)' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 2 },
  historyItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.01)' },
};

export default UnitConverter;
