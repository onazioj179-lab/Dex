// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ColorPicker - HSL/HEX/RGB color selection
 * 
 * Features:
 * - Hue/Saturation/Lightness sliders
 * - Direct hex input
 * - Alpha channel support
 * - Eyedropper (via EyeDropper API)
 * - Recent colors memory
 * - Preset swatches
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, radius } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a?: number; // 0-1
}

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a?: number; // 0-1
}

export interface ColorPickerProps {
  /** Current color (hex string) */
  value: string;
  /** Color change callback */
  onChange: (color: string) => void;
  /** Show alpha slider */
  showAlpha?: boolean;
  /** Preset colors */
  presets?: string[];
  /** Recent colors (managed externally) */
  recentColors?: string[];
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode (just swatch + popup) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Color Conversion Utilities
// ---------------------------------------------------------------------------

const hexToHSL = (hex: string): HSLColor => {
  const rgb = hexToRGB(hex);
  return rgbToHSL(rgb);
};

const hexToRGB = (hex: string): RGBColor => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: result[4] ? parseInt(result[4], 16) / 255 : 1,
  };
};

const rgbToHex = (rgb: RGBColor): string => {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const hex = `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  if (rgb.a !== undefined && rgb.a < 1) {
    return hex + toHex(rgb.a * 255);
  }
  return hex;
};

const rgbToHSL = (rgb: RGBColor): HSLColor => {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  if (max === min) {
    return { h: 0, s: 0, l: l * 100, a: rgb.a };
  }
  
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  
  return { h: h * 360, s: s * 100, l: l * 100, a: rgb.a };
};

const hslToRGB = (hsl: HSLColor): RGBColor => {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v, a: hsl.a };
  }
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
    a: hsl.a,
  };
};

const hslToHex = (hsl: HSLColor): string => {
  return rgbToHex(hslToRGB(hsl));
};

// ---------------------------------------------------------------------------
// Default Presets
// ---------------------------------------------------------------------------

const DEFAULT_PRESETS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#00ffff', '#ff00ff', '#ff8000', '#8000ff',
  '#0080ff', '#ff0080', '#808080', '#c0c0c0', '#400000',
  '#004000', '#000040', '#404040', '#800000', '#008000',
];

// ---------------------------------------------------------------------------
// Slider Component
// ---------------------------------------------------------------------------

interface ColorSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  gradient: string;
  label: string;
}

const ColorSlider: React.FC<ColorSliderProps> = ({
  value,
  min,
  max,
  onChange,
  gradient,
  label,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX);
  };

  const updateValue = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(min + ratio * (max - min));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX);
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: colors.text.secondary, width: 12 }}>
        {label}
      </span>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{
          flex: 1,
          height: 12,
          background: gradient,
          borderRadius: radius.sm,
          cursor: 'pointer',
          position: 'relative',
          border: `1px solid ${colors.border.subtle}`,
        }}
      >
        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${percent}%`,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            background: colors.bg.elevated,
            border: `2px solid ${colors.border.default}`,
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: colors.text.tertiary, width: 28, textAlign: 'right' }}>
        {Math.round(value)}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Saturation/Lightness Area
// ---------------------------------------------------------------------------

interface SatLightAreaProps {
  hue: number;
  saturation: number;
  lightness: number;
  onChange: (s: number, l: number) => void;
}

const SatLightArea: React.FC<SatLightAreaProps> = ({
  hue,
  saturation,
  lightness,
  onChange,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX, e.clientY);
  };

  const updateValue = (clientX: number, clientY: number) => {
    if (!areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(x * 100, (1 - y) * 100);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX, e.clientY);
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={areaRef}
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: 120,
        borderRadius: radius.sm,
        cursor: 'crosshair',
        position: 'relative',
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))
        `,
        border: `1px solid ${colors.border.subtle}`,
      }}
    >
      {/* Cursor */}
      <div
        style={{
          position: 'absolute',
          left: `${saturation}%`,
          top: `${100 - lightness}%`,
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          border: '2px solid white',
          borderRadius: '50%',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  showAlpha = false,
  presets = DEFAULT_PRESETS,
  recentColors = [],
  disabled = false,
  compact = false,
}) => {
  const [hsl, setHSL] = useState<HSLColor>(() => hexToHSL(value));
  const [hexInput, setHexInput] = useState(value);
  const [showPicker, setShowPicker] = useState(!compact);

  // Sync with external value
  useEffect(() => {
    const newHSL = hexToHSL(value);
    setHSL(newHSL);
    setHexInput(value);
  }, [value]);

  // Update color
  const updateColor = useCallback((newHSL: HSLColor) => {
    setHSL(newHSL);
    const hex = hslToHex(newHSL);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  // Handle hex input
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHexInput(e.target.value);
  };

  const handleHexBlur = () => {
    const cleaned = hexInput.startsWith('#') ? hexInput : '#' + hexInput;
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(cleaned)) {
      onChange(cleaned);
    } else {
      setHexInput(value);
    }
  };

  // Eyedropper
  const handleEyedropper = async () => {
    if (!('EyeDropper' in window)) return;
    try {
      // @ts-expect-error EyeDropper API
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex);
    } catch {
      // User cancelled
    }
  };

  const swatchStyle = (color: string, size = 24): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: radius.xs,
    background: color,
    border: `1px solid ${colors.border.subtle}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform 0.1s ease',
  });

  // Compact mode: just swatch
  if (compact && !showPicker) {
    return (
      <button
        onClick={() => setShowPicker(true)}
        disabled={disabled}
        style={{
          ...swatchStyle(value, 28),
          padding: 0,
          outline: 'none',
        }}
        title="Click to pick color"
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: compact ? 12 : 0,
        background: compact ? colors.bg.surface : 'transparent',
        borderRadius: compact ? radius.md : 0,
        border: compact ? `1px solid ${colors.border.default}` : 'none',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        minWidth: 220,
      }}
    >
      {/* Close button for compact mode */}
      {compact && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowPicker(false)}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: colors.text.secondary,
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Saturation/Lightness area */}
      <SatLightArea
        hue={hsl.h}
        saturation={hsl.s}
        lightness={hsl.l}
        onChange={(s, l) => updateColor({ ...hsl, s, l })}
      />

      {/* Hue slider */}
      <ColorSlider
        value={hsl.h}
        min={0}
        max={360}
        onChange={(h) => updateColor({ ...hsl, h })}
        gradient="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
        label="H"
      />

      {/* Alpha slider */}
      {showAlpha && (
        <ColorSlider
          value={(hsl.a ?? 1) * 100}
          min={0}
          max={100}
          onChange={(a) => updateColor({ ...hsl, a: a / 100 })}
          gradient={`linear-gradient(to right, transparent, ${hslToHex({ ...hsl, a: 1 })})`}
          label="A"
        />
      )}

      {/* Hex input and eyedropper */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ ...swatchStyle(value), flexShrink: 0 }} />
        
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          style={{
            flex: 1,
            height: 28,
            padding: '0 8px',
            background: colors.bg.inset,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.sm,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: colors.text.primary,
            outline: 'none',
          }}
        />

        {'EyeDropper' in window && (
          <button
            onClick={handleEyedropper}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              background: colors.bg.hover,
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.text.secondary,
            }}
            title="Pick color from screen"
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <path
                d="M12 2L9 5M9 5L4.5 9.5L3 11L2 12L3 11 4.5 9.5 9 5ZM5 3L11 9"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Preset swatches */}
      {presets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {presets.map((color, i) => (
            <button
              key={i}
              onClick={() => onChange(color)}
              style={{
                ...swatchStyle(color, 20),
                padding: 0,
                outline: 'none',
              }}
              title={color}
            />
          ))}
        </div>
      )}

      {/* Recent colors */}
      {recentColors.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: colors.text.tertiary, marginBottom: 4 }}>
            Recent
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {recentColors.slice(0, 10).map((color, i) => (
              <button
                key={i}
                onClick={() => onChange(color)}
                style={{
                  ...swatchStyle(color, 18),
                  padding: 0,
                  outline: 'none',
                }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hook for managing recent colors
// ---------------------------------------------------------------------------

export const useRecentColors = (key = 'dex-recent-colors', maxColors = 20) => {
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addRecentColor = useCallback((color: string) => {
    setRecentColors(prev => {
      const normalized = color.toLowerCase();
      const filtered = prev.filter(c => c.toLowerCase() !== normalized);
      const updated = [normalized, ...filtered].slice(0, maxColors);
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  }, [key, maxColors]);

  return { recentColors, addRecentColor };
};

export default ColorPicker;
