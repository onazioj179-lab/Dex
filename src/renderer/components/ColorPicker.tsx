/**
 * DEX Color Picker Component
 * Advanced color selection with swatches, gradients, and eyedropper
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================
export interface ColorValue {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  alpha: number;
}

export interface ColorSwatch {
  id: string;
  name: string;
  color: string;
  group?: string;
}

// ==================== COLOR UTILITIES ====================
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

export const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

export const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
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
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

export const parseColor = (color: string): ColorValue | null => {
  // Try hex
  const rgb = hexToRgb(color.replace('#', ''));
  if (rgb) {
    return {
      hex: color.startsWith('#') ? color : '#' + color,
      rgb,
      hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
      alpha: 1,
    };
  }

  // Try rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    const rgbVal = { r: parseInt(r), g: parseInt(g), b: parseInt(b) };
    return {
      hex: rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b),
      rgb: rgbVal,
      hsl: rgbToHsl(rgbVal.r, rgbVal.g, rgbVal.b),
      alpha: a ? parseFloat(a) : 1,
    };
  }

  return null;
};

// ==================== DEFAULT SWATCHES ====================
export const DEFAULT_SWATCHES: ColorSwatch[] = [
  // Grays
  { id: 'white', name: 'White', color: '#ffffff', group: 'Grayscale' },
  { id: 'gray-100', name: 'Gray 100', color: '#f7f7f7', group: 'Grayscale' },
  { id: 'gray-300', name: 'Gray 300', color: '#d1d1d1', group: 'Grayscale' },
  { id: 'gray-500', name: 'Gray 500', color: '#8e8e8e', group: 'Grayscale' },
  { id: 'gray-700', name: 'Gray 700', color: '#5a5a5a', group: 'Grayscale' },
  { id: 'gray-900', name: 'Gray 900', color: '#2d2d2d', group: 'Grayscale' },
  { id: 'black', name: 'Black', color: '#000000', group: 'Grayscale' },
  
  // Colors
  { id: 'red', name: 'Red', color: '#ff3b30', group: 'Colors' },
  { id: 'orange', name: 'Orange', color: '#ff9f0a', group: 'Colors' },
  { id: 'yellow', name: 'Yellow', color: '#ffcc00', group: 'Colors' },
  { id: 'green', name: 'Green', color: '#34c759', group: 'Colors' },
  { id: 'teal', name: 'Teal', color: '#5ac8fa', group: 'Colors' },
  { id: 'blue', name: 'Blue', color: '#007aff', group: 'Colors' },
  { id: 'indigo', name: 'Indigo', color: '#5856d6', group: 'Colors' },
  { id: 'purple', name: 'Purple', color: '#af52de', group: 'Colors' },
  { id: 'pink', name: 'Pink', color: '#ff2d55', group: 'Colors' },
];

// ==================== COLOR AREA COMPONENT ====================
interface ColorAreaProps {
  hue: number;
  saturation: number;
  lightness: number;
  onChange: (s: number, l: number) => void;
}

const ColorArea: React.FC<ColorAreaProps> = memo(({ hue, saturation, lightness, onChange }) => {
  const areaRef = useRef<HTMLDivElement>(null);

  const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(x * 100), Math.round((1 - y) * 100));
  }, [onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleInteraction(e);
    
    const handleMouseMove = (e: MouseEvent) => handleInteraction(e);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleInteraction]);

  return (
    <div
      ref={areaRef}
      style={{
        ...areaStyles.container,
        background: `hsl(${hue}, 100%, 50%)`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div style={areaStyles.saturationOverlay} />
      <div style={areaStyles.lightnessOverlay} />
      <div
        style={{
          ...areaStyles.pointer,
          left: `${saturation}%`,
          top: `${100 - lightness}%`,
        }}
      />
    </div>
  );
});

ColorArea.displayName = 'ColorArea';

// ==================== HUE SLIDER ====================
interface HueSliderProps {
  hue: number;
  onChange: (hue: number) => void;
}

const HueSlider: React.FC<HueSliderProps> = memo(({ hue, onChange }) => {
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360));
  }, [onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleInteraction(e);
    
    const handleMouseMove = (e: MouseEvent) => handleInteraction(e);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleInteraction]);

  return (
    <div ref={sliderRef} style={hueStyles.container} onMouseDown={handleMouseDown}>
      <div style={{ ...hueStyles.pointer, left: `${(hue / 360) * 100}%` }} />
    </div>
  );
});

HueSlider.displayName = 'HueSlider';

// ==================== ALPHA SLIDER ====================
interface AlphaSliderProps {
  color: string;
  alpha: number;
  onChange: (alpha: number) => void;
}

const AlphaSlider: React.FC<AlphaSliderProps> = memo(({ color, alpha, onChange }) => {
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 100) / 100);
  }, [onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleInteraction(e);
    
    const handleMouseMove = (e: MouseEvent) => handleInteraction(e);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleInteraction]);

  return (
    <div ref={sliderRef} style={alphaStyles.container} onMouseDown={handleMouseDown}>
      <div style={alphaStyles.checkerboard} />
      <div 
        style={{ 
          ...alphaStyles.gradient,
          background: `linear-gradient(to right, transparent, ${color})`,
        }} 
      />
      <div style={{ ...alphaStyles.pointer, left: `${alpha * 100}%` }} />
    </div>
  );
});

AlphaSlider.displayName = 'AlphaSlider';

// ==================== INPUT FIELDS ====================
interface ColorInputsProps {
  color: ColorValue;
  mode: 'hex' | 'rgb' | 'hsl';
  onChange: (color: ColorValue) => void;
  onModeChange: (mode: 'hex' | 'rgb' | 'hsl') => void;
}

const ColorInputs: React.FC<ColorInputsProps> = memo(({ color, mode, onChange, onModeChange }) => {
  const handleHexChange = (value: string) => {
    const parsed = parseColor(value);
    if (parsed) onChange(parsed);
  };

  const handleRgbChange = (channel: 'r' | 'g' | 'b', value: number) => {
    const rgb = { ...color.rgb, [channel]: value };
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    onChange({
      hex,
      rgb,
      hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
      alpha: color.alpha,
    });
  };

  const handleHslChange = (channel: 'h' | 's' | 'l', value: number) => {
    const hsl = { ...color.hsl, [channel]: value };
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    onChange({
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      rgb,
      hsl,
      alpha: color.alpha,
    });
  };

  return (
    <div style={inputStyles.container}>
      <div style={inputStyles.modeSelector}>
        {(['hex', 'rgb', 'hsl'] as const).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            style={{
              ...inputStyles.modeBtn,
              ...(mode === m ? inputStyles.modeBtnActive : {}),
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={inputStyles.fields}>
        {mode === 'hex' && (
          <input
            type="text"
            value={color.hex}
            onChange={e => handleHexChange(e.target.value)}
            style={inputStyles.input}
          />
        )}

        {mode === 'rgb' && (
          <>
            <div style={inputStyles.field}>
              <span>R</span>
              <input
                type="number"
                min={0}
                max={255}
                value={color.rgb.r}
                onChange={e => handleRgbChange('r', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
            <div style={inputStyles.field}>
              <span>G</span>
              <input
                type="number"
                min={0}
                max={255}
                value={color.rgb.g}
                onChange={e => handleRgbChange('g', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
            <div style={inputStyles.field}>
              <span>B</span>
              <input
                type="number"
                min={0}
                max={255}
                value={color.rgb.b}
                onChange={e => handleRgbChange('b', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
          </>
        )}

        {mode === 'hsl' && (
          <>
            <div style={inputStyles.field}>
              <span>H</span>
              <input
                type="number"
                min={0}
                max={360}
                value={color.hsl.h}
                onChange={e => handleHslChange('h', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
            <div style={inputStyles.field}>
              <span>S</span>
              <input
                type="number"
                min={0}
                max={100}
                value={color.hsl.s}
                onChange={e => handleHslChange('s', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
            <div style={inputStyles.field}>
              <span>L</span>
              <input
                type="number"
                min={0}
                max={100}
                value={color.hsl.l}
                onChange={e => handleHslChange('l', parseInt(e.target.value) || 0)}
                style={inputStyles.numberInput}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

ColorInputs.displayName = 'ColorInputs';

// ==================== SWATCHES COMPONENT ====================
interface SwatchesProps {
  swatches: ColorSwatch[];
  onSelect: (color: string) => void;
  onAdd?: (color: string) => void;
  currentColor?: string;
}

const Swatches: React.FC<SwatchesProps> = memo(({ swatches, onSelect, onAdd, currentColor }) => {
  return (
    <div style={swatchStyles.container}>
      {swatches.map(swatch => (
        <button
          key={swatch.id}
          onClick={() => onSelect(swatch.color)}
          title={swatch.name}
          style={{
            ...swatchStyles.swatch,
            background: swatch.color,
            ...(currentColor === swatch.color ? swatchStyles.swatchActive : {}),
          }}
        />
      ))}
      {onAdd && (
        <button
          onClick={() => currentColor && onAdd(currentColor)}
          style={swatchStyles.addBtn}
          title="Add to swatches"
        >
          +
        </button>
      )}
    </div>
  );
});

Swatches.displayName = 'Swatches';

// ==================== MAIN COLOR PICKER ====================
interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  showAlpha?: boolean;
  showSwatches?: boolean;
  swatches?: ColorSwatch[];
  onSwatchAdd?: (swatch: ColorSwatch) => void;
  style?: React.CSSProperties;
}

export const ColorPicker: React.FC<ColorPickerProps> = memo(({
  color,
  onChange,
  showAlpha = true,
  showSwatches = true,
  swatches = DEFAULT_SWATCHES,
  onSwatchAdd,
  style,
}) => {
  const [inputMode, setInputMode] = useState<'hex' | 'rgb' | 'hsl'>('hex');
  const [colorValue, setColorValue] = useState<ColorValue>(() => {
    return parseColor(color) || {
      hex: '#007aff',
      rgb: { r: 0, g: 122, b: 255 },
      hsl: { h: 211, s: 100, l: 50 },
      alpha: 1,
    };
  });

  useEffect(() => {
    const parsed = parseColor(color);
    if (parsed) setColorValue(parsed);
  }, [color]);

  const handleColorChange = useCallback((newColor: ColorValue) => {
    setColorValue(newColor);
    if (newColor.alpha < 1) {
      onChange(`rgba(${newColor.rgb.r}, ${newColor.rgb.g}, ${newColor.rgb.b}, ${newColor.alpha})`);
    } else {
      onChange(newColor.hex);
    }
  }, [onChange]);

  const handleHslChange = useCallback((s: number, l: number) => {
    const hsl = { h: colorValue.hsl.h, s, l };
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    handleColorChange({
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      rgb,
      hsl,
      alpha: colorValue.alpha,
    });
  }, [colorValue, handleColorChange]);

  const handleHueChange = useCallback((h: number) => {
    const hsl = { ...colorValue.hsl, h };
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    handleColorChange({
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      rgb,
      hsl,
      alpha: colorValue.alpha,
    });
  }, [colorValue, handleColorChange]);

  const handleAlphaChange = useCallback((alpha: number) => {
    handleColorChange({ ...colorValue, alpha });
  }, [colorValue, handleColorChange]);

  const handleSwatchSelect = useCallback((swatchColor: string) => {
    const parsed = parseColor(swatchColor);
    if (parsed) handleColorChange(parsed);
  }, [handleColorChange]);

  const handleSwatchAdd = useCallback(() => {
    if (onSwatchAdd) {
      onSwatchAdd({
        id: `custom-${Date.now()}`,
        name: colorValue.hex,
        color: colorValue.hex,
        group: 'Custom',
      });
    }
  }, [colorValue, onSwatchAdd]);

  return (
    <div style={{ ...pickerStyles.container, ...style }}>
      {/* Color Area */}
      <ColorArea
        hue={colorValue.hsl.h}
        saturation={colorValue.hsl.s}
        lightness={colorValue.hsl.l}
        onChange={handleHslChange}
      />

      {/* Sliders */}
      <div style={pickerStyles.sliders}>
        <HueSlider hue={colorValue.hsl.h} onChange={handleHueChange} />
        {showAlpha && (
          <AlphaSlider
            color={colorValue.hex}
            alpha={colorValue.alpha}
            onChange={handleAlphaChange}
          />
        )}
      </div>

      {/* Preview */}
      <div style={pickerStyles.preview}>
        <div style={pickerStyles.previewLabel}>
          <span style={{ ...pickerStyles.previewSwatch, background: colorValue.hex }} />
          <span>{colorValue.hex}</span>
          {showAlpha && <span style={pickerStyles.alphaLabel}>{Math.round(colorValue.alpha * 100)}%</span>}
        </div>
      </div>

      {/* Inputs */}
      <ColorInputs
        color={colorValue}
        mode={inputMode}
        onChange={handleColorChange}
        onModeChange={setInputMode}
      />

      {/* Swatches */}
      {showSwatches && (
        <Swatches
          swatches={swatches}
          onSelect={handleSwatchSelect}
          onAdd={onSwatchAdd ? handleSwatchAdd : undefined}
          currentColor={colorValue.hex}
        />
      )}
    </div>
  );
});

ColorPicker.displayName = 'ColorPicker';

// ==================== STYLES ====================
const pickerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    borderRadius: 8,
    width: 240,
  },
  sliders: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  preview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--color-text-primary, #fff)',
    fontFamily: 'monospace',
  },
  previewSwatch: {
    width: 24,
    height: 24,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.2)',
  },
  alphaLabel: {
    color: 'var(--color-text-tertiary, #666)',
  },
};

const areaStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: 140,
    borderRadius: 6,
    cursor: 'crosshair',
  },
  saturationOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to right, #fff, transparent)',
    borderRadius: 6,
  },
  lightnessOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, #000, transparent)',
    borderRadius: 6,
  },
  pointer: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    borderRadius: '50%',
    border: '2px solid #fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  },
};

const hueStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: 12,
    borderRadius: 6,
    background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
    cursor: 'pointer',
  },
  pointer: {
    position: 'absolute',
    top: -2,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  },
};

const alphaStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  checkerboard: {
    position: 'absolute',
    inset: 0,
    background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Crect fill='%23888' x='0' y='0' width='4' height='4'/%3E%3Crect fill='%23888' x='4' y='4' width='4' height='4'/%3E%3C/svg%3E")`,
    backgroundSize: '8px 8px',
  },
  gradient: {
    position: 'absolute',
    inset: 0,
    borderRadius: 6,
  },
  pointer: {
    position: 'absolute',
    top: -2,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  },
};

const inputStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  modeSelector: {
    display: 'flex',
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-tertiary, #666)',
    fontSize: 10,
    cursor: 'pointer',
  },
  modeBtnActive: {
    background: 'var(--color-accent, #007aff)',
    borderColor: 'var(--color-accent, #007aff)',
    color: '#fff',
  },
  fields: {
    display: 'flex',
    gap: 8,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    fontSize: 10,
    color: 'var(--color-text-tertiary, #666)',
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg-tertiary, #333)',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  numberInput: {
    width: '100%',
    padding: '4px 6px',
    background: 'var(--color-bg-tertiary, #333)',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
};

const swatchStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.15s',
  },
  swatchActive: {
    transform: 'scale(1.2)',
    boxShadow: '0 0 0 2px var(--color-accent, #007aff)',
  },
  addBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: '1px dashed var(--color-border, rgba(255,255,255,0.2))',
    background: 'transparent',
    color: 'var(--color-text-tertiary, #666)',
    fontSize: 12,
    cursor: 'pointer',
  },
};

export default ColorPicker;
