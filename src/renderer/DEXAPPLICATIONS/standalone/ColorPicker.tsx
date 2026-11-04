/**
 * DEX Platform - Color Picker
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional color picker with HSL/RGB/HEX, palette, and history
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { sendToNotes } from '../../services/sendTo';

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

import { hexToRgb as sharedHexToRgb } from '../../../shared/creative/colorUtils';
const hexToRgb = (hex: string) => sharedHexToRgb(hex) ?? { r: 0, g: 0, b: 0 };

// Real hex values so clicking a swatch can be parsed by hexToHsl. The brand
// colors are resolved from the base design-system tokens (error/warning/success/
// accent/text-tertiary) rather than `var(--...)` strings, which hexToHsl can't read.
const PRESETS = [
  '#FF453A', '#FF9F0A', '#FFD60A', '#34C759', '#30D158',
  '#64D2FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#AC8E68',
  '#8E8E93', '#AEAEB2', '#48484A', '#F5F5F7', '#1C1C1E',
  '#4A9EFF', '#0A84FF', '#007AFF', '#5856D6', '#AF52DE',
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

// WCAG 2.x relative luminance + contrast ratio (pure, unit-tested). Used for the
// accessibility readout so designers can check legibility against black/white.
function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => { const cs = c / 255; return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relLuminance(hexA), l2 = relLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

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
    // DEX color ecosystem: copied colors also flow into the Omni Clipboard (typed
    // automatically as a color clip), so they're reusable + sendable across DEX.
    try { (window as any).__dexClipboardStore?.getState?.().add(text, { sourceAppId: 'colorpicker', sourceAppName: 'Colors' }); } catch { /* optional */ }
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

  const previewOnDark = relLuminance(hex) > 0.35;

  return (
    <div style={s.container}>
      <style>{`
        .cp-slider { -webkit-appearance: none; appearance: none; outline: none; }
        .cp-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff;
          border: 2px solid rgba(0,0,0,0.18);
          box-shadow: 0 1px 4px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.5) inset;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .cp-slider::-webkit-slider-thumb:hover { transform: scale(1.14); }
        .cp-slider::-webkit-slider-thumb:active { transform: scale(0.96); }
        .cp-slider::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff; border: 2px solid rgba(0,0,0,0.18);
          box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
        }
        .cp-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(74,158,255,0.4); }
        .cp-slider:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 4px rgba(74,158,255,0.4); }
        .cp-chip { transition: transform 0.12s ease, box-shadow 0.15s ease, filter 0.15s ease; }
        .cp-chip:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .cp-chip:active { transform: scale(0.98); }
        .cp-swatch { transition: transform 0.12s ease, box-shadow 0.15s ease; }
        .cp-swatch:hover { transform: scale(1.12); z-index: 1; box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
        .cp-swatch:active { transform: scale(1.02); }
        .cp-hex { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .cp-hex:focus-visible { box-shadow: 0 0 0 3px rgba(74,158,255,0.35); }
        .cp-chip:focus-visible,
        .cp-swatch:focus-visible {
          outline: 2px solid var(--color-accent, #4A9EFF);
          outline-offset: 2px;
        }
      `}</style>
      {/* Color preview */}
      <div style={{ ...s.previewBar, background: hex }}>
        <button
          onClick={() => copy(hex.toUpperCase())}
          style={{ ...s.previewText, color: previewOnDark ? '#000' : '#fff', textShadow: previewOnDark ? '0 1px 2px rgba(255,255,255,0.35)' : '0 1px 3px rgba(0,0,0,0.55)' }}
          title="Copy HEX"
          aria-label={`Current color ${hex.toUpperCase()}, click to copy`}
        >
          {hex.toUpperCase()}
        </button>
      </div>

      {/* HSL Sliders */}
      <div style={s.sliders}>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>H</span>
          <input type="range" min={0} max={360} value={hsl.h} className="cp-slider"
            onChange={e => setHsl(p => ({ ...p, h: +e.target.value }))}
            aria-label="Hue" aria-valuetext={`${hsl.h} degrees`}
            style={{ ...s.slider, background: `linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)` }} />
          <span style={s.sliderVal}>{hsl.h}°</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>S</span>
          <input type="range" min={0} max={100} value={hsl.s} className="cp-slider"
            onChange={e => setHsl(p => ({ ...p, s: +e.target.value }))}
            aria-label="Saturation" aria-valuetext={`${hsl.s} percent`}
            style={{ ...s.slider, background: `linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})` }} />
          <span style={s.sliderVal}>{hsl.s}%</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>L</span>
          <input type="range" min={0} max={100} value={hsl.l} className="cp-slider"
            onChange={e => setHsl(p => ({ ...p, l: +e.target.value }))}
            aria-label="Lightness" aria-valuetext={`${hsl.l} percent`}
            style={{ ...s.slider, background: `linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)` }} />
          <span style={s.sliderVal}>{hsl.l}%</span>
        </div>
      </div>

      {/* Values */}
      <div style={s.values}>
        <button onClick={() => copy(hex)} className="dex-liquid-glass cp-chip" style={s.valueChip} title="Copy HEX">
          <span style={s.valueLabel}>HEX</span>
          <span style={s.valueText}>{hex.toUpperCase()}</span>
        </button>
        <button onClick={() => copy(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)} className="dex-liquid-glass cp-chip" style={s.valueChip} title="Copy RGB">
          <span style={s.valueLabel}>RGB</span>
          <span style={s.valueText}>{rgb.r}, {rgb.g}, {rgb.b}</span>
        </button>
        <button onClick={() => copy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)} className="dex-liquid-glass cp-chip" style={s.valueChip} title="Copy HSL">
          <span style={s.valueLabel}>HSL</span>
          <span style={s.valueText}>{hsl.h}, {hsl.s}%, {hsl.l}%</span>
        </button>
        <button
          onClick={() => sendToNotes(
            `Color ${hex.toUpperCase()}\nHEX: ${hex.toUpperCase()}\nRGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\nHSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
            `Color ${hex.toUpperCase()}`,
          )}
          className="dex-liquid-glass cp-chip"
          style={s.valueChip}
          title="Send swatch to Notes"
        >
          <span style={s.valueLabel}>SEND</span>
          <span style={s.valueText}>Notes</span>
        </button>
      </div>

      {copied && <div style={s.copiedToast}>Copied</div>}

      {/* HEX input */}
      <div style={s.hexRow}>
        <input
          value={hexInput}
          onChange={e => handleHexInput(e.target.value)}
          className="dex-liquid-glass"
          style={s.hexInput}
          placeholder="#000000"
          maxLength={7}
          aria-label="Hex color value"
        />
      </div>

      {/* Presets */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionLabel}>Presets</div>
        <div style={s.palette}>
          {PRESETS.map((c, i) => (
            <button key={`${c}-${i}`} onClick={() => setHsl(hexToHsl(c))}
              style={{ ...s.swatch, background: c, boxShadow: c === hex ? '0 0 0 2px var(--color-accent)' : 'none' }}
              title={c} aria-label={`Use preset color ${c}`} />
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={s.section}>
          <div className="dex-label-caps" style={s.sectionLabel}>Recent</div>
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
                title={c} aria-label={`Reuse recent color ${c}`} />
            ))}
          </div>
        </div>
      )}

      {/* WCAG contrast — legibility of this color against white / black */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionLabel}>Contrast</div>
        {([['#FFFFFF', 'on white'], ['#000000', 'on black']] as const).map(([bg, label]) => {
          const ratio = contrastRatio(hex, bg);
          const aa = ratio >= 4.5, aaa = ratio >= 7;
          return (
            <div key={bg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px var(--space-1)', fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{ratio.toFixed(2)}:1 <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span></span>
              <span style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                <span style={{ color: aa ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>AA</span>
                <span style={{ color: aaa ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>AAA</span>
              </span>
            </div>
          );
        })}
      </div>
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
    justifyContent: 'flex-end', padding: 'var(--space-3)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  previewText: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    fontVariantNumeric: 'tabular-nums',
  },
  sliders: {
    padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
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
    display: 'flex', gap: 'var(--space-2)', padding: '0 var(--space-5) var(--space-3)',
  },
  valueChip: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
    padding: 'var(--space-2) 10px', borderRadius: 14,
    cursor: 'pointer',
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
  hexRow: { padding: '0 var(--space-5) var(--space-3)' },
  hexInput: {
    width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 14,
    color: 'var(--color-text-primary)', fontSize: 14,
    fontFamily: 'var(--font-mono)', outline: 'none',
    textAlign: 'center', boxSizing: 'border-box',
  },
  section: { padding: '0 var(--space-5) var(--space-3)' },
  sectionLabel: {
    marginBottom: 'var(--space-2)',
  },
  palette: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  swatch: {
    width: 28, height: 28, borderRadius: 10, border: 'none',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
};

ColorPicker.displayName = 'ColorPicker';
export default memo(ColorPicker);
