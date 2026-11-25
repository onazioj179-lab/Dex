/**
 * DEX Platform - Color Picker
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional color picker with HSL/RGB/HEX, palette, and history
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { sendToNotes } from '../../services/sendTo';
import { useSavedColors, saveColor, removeColor } from '../../services/sharedColors';

import { ColorWorkbench } from './ColorWorkbench';
import { setStudioMode } from './creativeStudio/studioMode';
import { sendCreativeInput } from '../../services/creativeIntake';
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, relativeLuminance, type HSL } from '../../../shared/creative/colorUtils';
import { nearestColorName, parseHexList } from '../../../shared/creative/paletteTools';

export { contrastRatio } from '../../../shared/creative/colorUtils';

const hslToHex = (h: number, s: number, l: number) => rgbToHex(hslToRgb({ h, s, l }));

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
      return Array.isArray(parsed) ? parseHexList(parsed.flatMap(value => {
        if (typeof value !== 'string') return [];
        const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
        if (rgb) return [rgbToHex({ r: +rgb[1], g: +rgb[2], b: +rgb[3] })];
        const hsl = /^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/.exec(value);
        return [hsl ? hslToHex(+hsl[1], +hsl[2], +hsl[3]) : value];
      }).join(' ')).slice(0, 12) : [];
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
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [hueLocked, setHueLocked] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [sampling, setSampling] = useState(false);
  const EyeDropper = (window as Window & { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const hex = selectedHex ?? hslToHex(hsl.h, hsl.s, hsl.l);
  const rgb = hexToRgb(hex)!;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const hsb = [hsl.h, Math.round(max === 0 ? 0 : (max - min) * 100 / max), Math.round(max / 2.55)];
  const remember = (value: string) => setHistory(previous => [value, ...previous.filter(item => item !== value)].slice(0, 12));

  const pick = (value: string) => {
    const parsed = hexToRgb(value);
    if (!parsed) return;
    const coords = rgbToHsl(parsed);
    const next = hueLocked ? hslToHex(hsl.h, coords.s, coords.l) : rgbToHex(parsed);
    setHsl({ ...coords, h: hueLocked ? hsl.h : coords.h });
    setSelectedHex(next);
    setHexInput(next);
    remember(next);
  };
  const adjust = (key: keyof HSL, value: number) => {
    const next = { ...hsl, [key]: value };
    setSelectedHex(null);
    setHsl(next);
  };
  const sample = async () => {
    if (!EyeDropper || sampling) return;
    setSampleError('');
    setSampling(true);
    try {
      pick((await new EyeDropper().open()).sRGBHex);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setSampleError('Screen sampling is unavailable.');
    } finally { setSampling(false); }
  };

  useEffect(() => {
    setHexInput(hex);
  }, [hex]);

  // Save history to localStorage when it changes
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const copy = useCallback((text: string) => {
    if (!navigator.clipboard?.writeText) { setSampleError('Clipboard is unavailable.'); return; }
    void navigator.clipboard.writeText(text).then(() => {
      setSampleError('');
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }, () => setSampleError('Could not copy to the clipboard.'));
    // DEX color ecosystem: copied colors also flow into the Omni Clipboard (typed
    // automatically as a color clip), so they're reusable + sendable across DEX.
    try { (window as any).__dexClipboardStore?.getState?.().add(text, { sourceAppId: 'colorpicker', sourceAppName: 'Colors' }); } catch { /* optional */ }
    remember(hex);
  }, [hex]);

  const handleHexInput = (value: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) pick(value);
    else setHexInput(value);
  };

  // Black or white, whichever contrasts more (crossover at luminance ~0.18;
  // the old 0.35 put white on mid blues at 2.9:1).
  const previewOnDark = relativeLuminance(rgb) > 0.179;
  // Shared library (AssetLibrary 'palette'): saved here, shown in PRISM, kept in dex.db.
  const saved = useSavedColors();
  const isSaved = saved.includes(hex.toLowerCase());

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
        .cp-slider::-webkit-slider-thumb:active { transform: scale(0.96); }
        .cp-slider::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: #fff; border: 2px solid rgba(0,0,0,0.18);
          box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer;
        }
        .cp-chip { transition: transform 0.12s ease, box-shadow 0.15s ease, filter 0.15s ease; }
        .cp-chip:hover { filter: brightness(1.06); }
        .cp-chip:active { transform: scale(0.98); }
        .cp-swatch { transition: transform 0.12s ease, box-shadow 0.15s ease; }
        .cp-swatch:hover { box-shadow: 0 0 0 1px var(--color-border-strong); }
        .cp-swatch:active { transform: scale(0.96); }
        .cp-hex { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
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
          <input type="range" min={0} max={360} value={hsl.h} className="cp-slider" onPointerUp={() => remember(hex)} onKeyUp={() => remember(hex)}
            disabled={hueLocked} onChange={e => adjust('h', +e.target.value)}
            aria-label="Hue" aria-valuetext={`${hsl.h} degrees`}
            style={{ ...s.slider, background: `linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)` }} />
          <span style={s.sliderVal}>{hsl.h}°</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>S</span>
          <input type="range" min={0} max={100} value={hsl.s} className="cp-slider" onPointerUp={() => remember(hex)} onKeyUp={() => remember(hex)}
            onChange={e => adjust('s', +e.target.value)}
            aria-label="Saturation" aria-valuetext={`${hsl.s} percent`}
            style={{ ...s.slider, background: `linear-gradient(to right, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})` }} />
          <span style={s.sliderVal}>{hsl.s}%</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel}>L</span>
          <input type="range" min={0} max={100} value={hsl.l} className="cp-slider" onPointerUp={() => remember(hex)} onKeyUp={() => remember(hex)}
            onChange={e => adjust('l', +e.target.value)}
            aria-label="Lightness" aria-valuetext={`${hsl.l} percent`}
            style={{ ...s.slider, background: `linear-gradient(to right, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)` }} />
          <span style={s.sliderVal}>{hsl.l}%</span>
        </div>
      </div>

      {/* Tools: exact value, eyedropper, hue lock, nearest name */}
      <div style={s.toolRow}>
        <input
          value={hexInput}
          onChange={e => handleHexInput(e.target.value)}
          style={s.hexInput}
          placeholder="#000000"
          maxLength={7}
          aria-label="Hex color value"
          spellCheck={false}
        />
        <button type="button" style={s.toolPill} disabled={!EyeDropper || sampling} onClick={() => void sample()}
          title={EyeDropper ? 'Sample a pixel on screen' : 'Screen sampling is unavailable in this runtime'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>
          {sampling ? 'Pick a pixel…' : 'Eyedropper'}
        </button>
        <button type="button" style={{ ...s.toolPill, ...(hueLocked ? s.toolPillOn : null) }} aria-pressed={hueLocked}
          onClick={() => setHueLocked(v => !v)} title="Keep the hue while you adjust saturation and lightness">
          Lock hue
        </button>
        <span style={s.colorName} title="Nearest reference swatch">{nearestColorName(hex)}</span>
        {sampleError && <span role="status" style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{sampleError}</span>}
      </div>

      {/* Values: click any to copy */}
      <div style={s.values}>
        {([
          ['HEX', hex.toUpperCase(), hex.toUpperCase()],
          ['RGB', `${rgb.r}, ${rgb.g}, ${rgb.b}`, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
          ['HSL', `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`, `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`],
          ['HSB', `${hsb[0]}°, ${hsb[1]}%, ${hsb[2]}%`, `${hsb[0]}°, ${hsb[1]}%, ${hsb[2]}%`],
          ['CSS', '--swatch', `--swatch: ${hex};`],
        ] as const).map(([label, shown, value]) => (
          <button key={label} type="button" onClick={() => copy(value)} className="cp-chip" style={s.valueChip}
            title={`Copy ${label}`} aria-label={`Copy ${label} ${shown}`}>
            <span style={s.valueLabel}>{label}</span>
            <span style={s.valueText}>{shown}</span>
          </button>
        ))}
      </div>

      {copied && <div style={s.copiedToast} role="status">Copied</div>}

      {/* Use it elsewhere */}
      <div style={s.actions}>
        <button type="button" style={{ ...s.toolPill, ...(isSaved ? s.toolPillOn : null) }} aria-pressed={isSaved}
          onClick={() => (isSaved ? removeColor(hex) : saveColor(hex, 'colorpicker'))}
          title={isSaved ? 'Remove from the shared colour library' : 'Save to the shared colour library (PRISM shows it too)'}>
          {isSaved ? 'Saved to library' : 'Save to library'}
        </button>
        <button type="button" style={s.toolPill} title="Send swatch to Notes" aria-label="Send to Notes" onClick={() => sendToNotes(
          `Color ${hex.toUpperCase()}
HEX: ${hex.toUpperCase()}
RGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})
HSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
          `Color ${hex.toUpperCase()}`,
        )}>Notes</button>
        <button type="button" style={s.toolPill} aria-label="Send to Canvas" onClick={() => { setStudioMode('board'); sendCreativeInput('canvas', hex); }}>Canvas</button>
        <button type="button" style={s.toolPill} aria-label="Send to Pixel Art" onClick={() => sendCreativeInput('pixelart', hex)}>Pixel Art</button>
        <button type="button" style={s.toolPill} aria-label="Use in QR Code" onClick={() => sendCreativeInput('qrcode-color', hex)}>QR code</button>
      </div>

      {/* Saved (shared library) */}
      {saved.length > 0 && (
        <div style={s.section}>
          <div className="dex-label-caps" style={s.sectionLabel}>Saved</div>
          <div style={s.palette}>
            {saved.map((c) => (
              <button key={c} onClick={() => pick(c)}
                onContextMenu={(e) => { e.preventDefault(); removeColor(c); }}
                style={{ ...s.swatch, background: c, boxShadow: c === hex.toLowerCase() ? '0 0 0 2px var(--color-accent)' : 'none' }}
                title={`${c.toUpperCase()} (right-click to remove)`} aria-label={`Use saved color ${c}`} />
            ))}
          </div>
        </div>
      )}

      {/* Presets */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionLabel}>Presets</div>
        <div style={s.palette}>
          {PRESETS.map((c, i) => (
            <button key={`${c}-${i}`} onClick={() => pick(c)}
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
              <button key={c} onClick={() => pick(c)}
                style={{ ...s.swatch, background: c }}
                title={c} aria-label={`Reuse recent color ${c}`} />
            ))}
          </div>
        </div>
      )}

      <div style={s.section}><ColorWorkbench hex={hex} hsl={hsl} pick={pick} copy={copy} /></div>
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
  toolRow: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '0 var(--space-5) var(--space-3)',
  },
  toolPill: {
    height: 28, padding: '0 12px', borderRadius: 9999, border: 'none', cursor: 'pointer', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
    background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  toolPillOn: { background: 'var(--color-accent-fill)', color: 'var(--color-accent-text)' },
  colorName: { marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
  actions: {
    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 var(--space-5) var(--space-4)',
  },
  values: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 6, padding: '0 var(--space-5) var(--space-3)',
  },
  valueChip: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, border: 'none',
    padding: '8px 12px', borderRadius: 14,
    background: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)',
    cursor: 'pointer',
    transition: 'all 0.15s ease', textAlign: 'left',
    fontFamily: 'var(--font-family)',
  },
  valueLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'none', letterSpacing: '0.01em',
  },
  valueText: {
    fontSize: 12.5, color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  copiedToast: {
    textAlign: 'center', fontSize: 12, fontWeight: 600,
    color: 'var(--color-success)', padding: '4px 0',
  },
  hexRow: { padding: '0 var(--space-5) var(--space-3)' },
  hexInput: {
    width: 96, height: 28, padding: '0 12px', borderRadius: 9999, border: 'none',
    background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
    color: 'var(--color-text-primary)', fontSize: 12.5,
    fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
  },
  section: { padding: '0 var(--space-5) var(--space-3)' },
  sectionLabel: {
    marginBottom: 'var(--space-2)',
  },
  palette: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  swatch: {
    width: 26, height: 26, borderRadius: 9999, border: 'none',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
};

ColorPicker.displayName = 'ColorPicker';
export default memo(ColorPicker);
