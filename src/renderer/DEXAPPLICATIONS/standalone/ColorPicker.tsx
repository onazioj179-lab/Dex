/**
 * DEX Platform - Color Picker
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional color picker with HSL/RGB/HEX, palette, and history
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';

interface HSL { h: number; s: number; l: number }

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hexToHsl = (hex: string): HSL => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hexToRgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const PRESETS = [
  'var(--color-error)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-success)',
  '#64D2FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#AC8E68',
  'var(--color-text-tertiary)', 'var(--color-text-tertiary)', '#48484A', '#F5F5F7', '#1C1C1E',
  'var(--color-accent)', 'var(--color-accent)', '#007AFF', '#5856D6', '#AF52DE',
];

const STORAGE_KEY = 'dex-colorpicker-history';

const loadHistory = (): string[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    }
  } catch { /* ignore */ }
  return [];
};

const saveHistory = (history: string[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
};

const ColorPicker: React.FC = () => {
  const [hsl, setHsl] = useState<HSL>({ h: 210, s: 100, l: 60 });
  const [hexInput, setHexInput] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const historyLoadedRef = useRef(true); // Already loaded from initializer
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const hex = hslToHex(hsl.h, hsl.s, hsl.l);
  const rgb = hexToRgb(hex);

  useEffect(() => {
    setHexInput(hex);
  }, [hex]);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (historyLoadedRef.current) {
      saveHistory(history);
    }
  }, [history]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => { /* clipboard blocked */ });
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
    setHistory(prev => {
      const next = [text, ...prev.filter(c => c !== text)].slice(0, 12);
      return next;
    });
  }, []);

  const handleHexInput = useCallback((val: string) => {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setHsl(hexToHsl(val));
    }
  }, []);

  return (
    <div style={s.container}>
      {/* Color preview */}
      <div style={{ ...s.previewBar, background: hex }}>
        <div style={s.previewText}>{hex.toUpperCase()}</div>
      </div>

      {/* HSL Sliders */}
      <div style={s.sliders}>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>H</span>
          <input type="range" min={0} max={360} value={hsl.h}
            onChange={e => setHsl(p => ({ ...p, h: +e.target.value }))}
            style={{ ...s.slider, background: `linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)` }} />
          <span style={s.sliderVal}>{hsl.h}°</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>S</span>
          <input type="range" min={0} max={100} value={hsl.s}
            onChange={e => setHsl(p => ({ ...p, s: +e.target.value }))}
            style={{ ...s.slider, background: `linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})` }} />
          <span style={s.sliderVal}>{hsl.s}%</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>L</span>
          <input type="range" min={0} max={100} value={hsl.l}
            onChange={e => setHsl(p => ({ ...p, l: +e.target.value }))}
            style={{ ...s.slider, background: `linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)` }} />
          <span style={s.sliderVal}>{hsl.l}%</span>
        </div>
      </div>

      {/* Values */}
      <div style={s.values}>
        <button onClick={() => copy(hex)} style={s.valueChip} title="Copy HEX">
          <span style={s.valueLabel}>HEX</span>
          <span style={s.valueText}>{hex.toUpperCase()}</span>
        </button>
        <button onClick={() => copy(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)} style={s.valueChip} title="Copy RGB">
          <span style={s.valueLabel}>RGB</span>
          <span style={s.valueText}>{rgb.r}, {rgb.g}, {rgb.b}</span>
        </button>
        <button onClick={() => copy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)} style={s.valueChip} title="Copy HSL">
          <span style={s.valueLabel}>HSL</span>
          <span style={s.valueText}>{hsl.h}, {hsl.s}%, {hsl.l}%</span>
        </button>
      </div>

      {copied && <div style={s.copiedToast}>Copied!</div>}

      {/* HEX input */}
      <div style={s.hexRow}>
        <input
          value={hexInput}
          onChange={e => handleHexInput(e.target.value)}
          style={s.hexInput}
          placeholder="#000000"
          maxLength={7}
        />
      </div>

      {/* Presets */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Presets</div>
        <div style={s.palette}>
          {PRESETS.map(c => (
            <button key={c} onClick={() => setHsl(hexToHsl(c))}
              style={{ ...s.swatch, background: c, boxShadow: c === hex ? '0 0 0 2px var(--color-accent)' : 'none' }}
              title={c} />
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Recent</div>
          <div style={s.palette}>
            {history.map(c => (
              <button key={c} onClick={() => {
                if (c.startsWith('#')) {
                  setHsl(hexToHsl(c));
                } else {
                  // Parse rgb(...) or hsl(...) back to HSL
                  const rgbMatch = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                  if (rgbMatch) {
                    const tmpHex = '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
                    setHsl(hexToHsl(tmpHex));
                  }
                  const hslMatch = c.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
                  if (hslMatch) {
                    setHsl({ h: parseInt(hslMatch[1]), s: parseInt(hslMatch[2]), l: parseInt(hslMatch[3]) });
                  }
                }
                copy(c);
              }}
                style={{ ...s.swatch, background: c }}
                title={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto',
  },
  previewBar: {
    height: 80, display: 'flex', alignItems: 'flex-end',
    justifyContent: 'flex-end', padding: 12, flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  previewText: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    fontVariantNumeric: 'tabular-nums',
  },
  sliders: {
    padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
  },
  sliderRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sliderLabel: {
    width: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
  },
  slider: {
    flex: 1, height: 8, borderRadius: 4, appearance: 'none' as any,
    outline: 'none', cursor: 'pointer',
  },
  sliderVal: {
    width: 40, fontSize: 12, color: 'var(--color-text-secondary)',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  },
  values: {
    display: 'flex', gap: 8, padding: '0 20px 12px',
  },
  valueChip: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
    padding: '8px 10px', borderRadius: 8, border: 'none',
    background: 'var(--color-bg-surface)', cursor: 'pointer',
    transition: 'all 0.15s ease', textAlign: 'left',
    fontFamily: 'var(--font-family)',
  },
  valueLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  valueText: {
    fontSize: 13, color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  copiedToast: {
    textAlign: 'center', fontSize: 12, fontWeight: 600,
    color: 'var(--color-success)', padding: '4px 0',
  },
  hexRow: { padding: '0 20px 12px' },
  hexInput: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-inset)',
    color: 'var(--color-text-primary)', fontSize: 14,
    fontFamily: 'var(--font-mono)', outline: 'none',
    textAlign: 'center', boxSizing: 'border-box',
  },
  section: { padding: '0 20px 12px' },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
  },
  palette: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  swatch: {
    width: 28, height: 28, borderRadius: 6, border: 'none',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
};

ColorPicker.displayName = 'ColorPicker';
export default memo(ColorPicker);
