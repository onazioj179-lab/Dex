// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Creative Suite Professional Enhancements (Phase 2: Items 926-975)
// Premium features for AXL, PRISM, VINX, IMOSION, and FLUX
// =============================================================================

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

// =============================================================================
// AXL - ENGINEERING DESIGN STUDIO (Items 926-935)
// =============================================================================

// ---------------------------------------------------------------------------
// 926. Smart Dimension Annotations
// ---------------------------------------------------------------------------

export interface DimensionAnnotation {
  id: string;
  type: 'linear' | 'angular' | 'radial' | 'diameter' | 'ordinate' | 'arc-length';
  value: number;
  unit: 'mm' | 'in' | 'cm' | 'm' | 'ft';
  precision: number;
  startPoint: { x: number; y: number; z: number };
  endPoint: { x: number; y: number; z: number };
  midPoint?: { x: number; y: number; z: number };
  offsetDistance: number;
  textOffset: { x: number; y: number };
  style: DimensionStyle;
  tolerance?: { upper: number; lower: number; type: 'bilateral' | 'unilateral' | 'limit' };
  prefix?: string;
  suffix?: string;
  isReference?: boolean;
}

export interface DimensionStyle {
  arrowType: 'filled' | 'open' | 'dot' | 'tick' | 'architectural';
  arrowSize: number;
  lineThickness: number;
  lineColor: string;
  textSize: number;
  textColor: string;
  fontFamily: string;
  extensionLineGap: number;
  extensionLineOvershoot: number;
}

const defaultDimensionStyle: DimensionStyle = {
  arrowType: 'filled',
  arrowSize: 3,
  lineThickness: 1,
  lineColor: '#4A9EFF',
  textSize: 10,
  textColor: '#FFFFFF',
  fontFamily: 'Inter, sans-serif',
  extensionLineGap: 2,
  extensionLineOvershoot: 2,
};

export function createDimension(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  type: DimensionAnnotation['type'] = 'linear',
  unit: DimensionAnnotation['unit'] = 'mm'
): DimensionAnnotation {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const value = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    id: `dim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    value,
    unit,
    precision: 2,
    startPoint: start,
    endPoint: end,
    offsetDistance: 15,
    textOffset: { x: 0, y: 0 },
    style: { ...defaultDimensionStyle },
  };
}

export function formatDimensionValue(dim: DimensionAnnotation): string {
  const val = dim.value.toFixed(dim.precision);
  let result = `${dim.prefix || ''}${val}${dim.suffix || ''}`;
  
  if (dim.tolerance) {
    if (dim.tolerance.type === 'bilateral') {
      result += ` ±${dim.tolerance.upper.toFixed(dim.precision)}`;
    } else if (dim.tolerance.type === 'limit') {
      result += ` (${(dim.value + dim.tolerance.upper).toFixed(dim.precision)} / ${(dim.value - dim.tolerance.lower).toFixed(dim.precision)})`;
    }
  }
  
  return result;
}

export function renderDimensionToCanvas(
  ctx: CanvasRenderingContext2D,
  dim: DimensionAnnotation,
  scale: number = 1
): void {
  const { startPoint, endPoint, style, offsetDistance } = dim;
  
  // Calculate perpendicular offset direction
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / length;
  const perpY = dx / length;
  
  // Offset points
  const ox = perpX * offsetDistance * scale;
  const oy = perpY * offsetDistance * scale;
  
  const p1 = { x: startPoint.x * scale, y: startPoint.y * scale };
  const p2 = { x: endPoint.x * scale, y: endPoint.y * scale };
  const op1 = { x: p1.x + ox, y: p1.y + oy };
  const op2 = { x: p2.x + ox, y: p2.y + oy };
  
  ctx.save();
  ctx.strokeStyle = style.lineColor;
  ctx.lineWidth = style.lineThickness;
  ctx.fillStyle = style.textColor;
  ctx.font = `${style.textSize}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Extension lines
  const gap = style.extensionLineGap * scale;
  const overshoot = style.extensionLineOvershoot * scale;
  
  ctx.beginPath();
  ctx.moveTo(p1.x + perpX * gap, p1.y + perpY * gap);
  ctx.lineTo(op1.x + perpX * overshoot, op1.y + perpY * overshoot);
  ctx.moveTo(p2.x + perpX * gap, p2.y + perpY * gap);
  ctx.lineTo(op2.x + perpX * overshoot, op2.y + perpY * overshoot);
  ctx.stroke();
  
  // Dimension line
  ctx.beginPath();
  ctx.moveTo(op1.x, op1.y);
  ctx.lineTo(op2.x, op2.y);
  ctx.stroke();
  
  // Arrowheads
  drawArrowhead(ctx, op1.x, op1.y, dx / length, dy / length, style);
  drawArrowhead(ctx, op2.x, op2.y, -dx / length, -dy / length, style);
  
  // Text
  const textX = (op1.x + op2.x) / 2 + dim.textOffset.x;
  const textY = (op1.y + op2.y) / 2 + dim.textOffset.y - 4;
  
  // Text background
  const text = formatDimensionValue(dim);
  const metrics = ctx.measureText(text);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(textX - metrics.width / 2 - 4, textY - style.textSize / 2 - 2, metrics.width + 8, style.textSize + 4);
  
  ctx.fillStyle = style.textColor;
  ctx.fillText(text, textX, textY);
  
  ctx.restore();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  style: DimensionStyle
): void {
  const size = style.arrowSize;
  const angle = Math.atan2(dy, dx);
  
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  if (style.arrowType === 'filled') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size * 2, -size);
    ctx.lineTo(-size * 2, size);
    ctx.closePath();
    ctx.fillStyle = style.lineColor;
    ctx.fill();
  } else if (style.arrowType === 'tick') {
    ctx.beginPath();
    ctx.moveTo(-size, -size);
    ctx.lineTo(size, size);
    ctx.stroke();
  }
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 927. Parametric Constraint Visualization
// ---------------------------------------------------------------------------

export interface Constraint {
  id: string;
  type: 'coincident' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'tangent' | 'equal' | 'fixed' | 'concentric';
  entities: string[]; // IDs of constrained entities
  value?: number; // For dimension constraints
  status: 'satisfied' | 'under-constrained' | 'over-constrained' | 'conflicting';
  priority: number;
}

export interface ConstraintVisualization {
  constraint: Constraint;
  position: { x: number; y: number };
  symbol: string;
  color: string;
}

const constraintSymbols: Record<Constraint['type'], string> = {
  coincident: '●',
  horizontal: '─',
  vertical: '│',
  parallel: '∥',
  perpendicular: '⊥',
  tangent: '○',
  equal: '=',
  fixed: 'fixed',
  concentric: '◎',
};

const constraintColors: Record<Constraint['status'], string> = {
  satisfied: '#34C759',
  'under-constrained': '#FF9F0A',
  'over-constrained': '#FF453A',
  conflicting: '#FF2D55',
};

export function getConstraintVisualization(constraint: Constraint, position: { x: number; y: number }): ConstraintVisualization {
  return {
    constraint,
    position,
    symbol: constraintSymbols[constraint.type],
    color: constraintColors[constraint.status],
  };
}

export function renderConstraints(
  ctx: CanvasRenderingContext2D,
  visualizations: ConstraintVisualization[]
): void {
  ctx.save();
  ctx.font = '12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (const viz of visualizations) {
    const { position, symbol, color } = viz;
    
    // Background circle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(position.x, position.y, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Symbol
    ctx.fillStyle = color;
    ctx.fillText(symbol, position.x, position.y);
  }
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 928. 3D Viewport Gizmo (Navigation Cube)
// ---------------------------------------------------------------------------

export interface ViewportGizmo {
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  size: number;
  rotation: { azimuth: number; elevation: number };
}

export const standardViews = {
  front: { azimuth: 0, elevation: 0 },
  back: { azimuth: 180, elevation: 0 },
  left: { azimuth: -90, elevation: 0 },
  right: { azimuth: 90, elevation: 0 },
  top: { azimuth: 0, elevation: 90 },
  bottom: { azimuth: 0, elevation: -90 },
  isometric: { azimuth: 45, elevation: 35 },
  isometricBack: { azimuth: -135, elevation: 35 },
};

export function renderViewportGizmo(
  ctx: CanvasRenderingContext2D,
  gizmo: ViewportGizmo
): void {
  const { size, rotation } = gizmo;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;
  
  // Convert rotation to radians
  const az = (rotation.azimuth * Math.PI) / 180;
  const el = (rotation.elevation * Math.PI) / 180;
  
  // Axis directions (projected to 2D)
  const axes = [
    { name: 'X', color: '#FF453A', dir: { x: Math.cos(az), y: Math.sin(el) * Math.sin(az) } },
    { name: 'Y', color: '#34C759', dir: { x: Math.sin(az), y: -Math.sin(el) * Math.cos(az) } },
    { name: 'Z', color: '#4A9EFF', dir: { x: 0, y: -Math.cos(el) } },
  ];
  
  ctx.save();
  ctx.translate(cx, cy);
  
  // Draw axes
  for (const axis of axes) {
    ctx.strokeStyle = axis.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(axis.dir.x * radius, axis.dir.y * radius);
    ctx.stroke();
    
    // Axis label
    ctx.fillStyle = axis.color;
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(axis.name, axis.dir.x * (radius + 10), axis.dir.y * (radius + 10));
  }
  
  // Center dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 929-930. Command Palette for AXL
// ---------------------------------------------------------------------------

export interface CommandItem {
  id: string;
  name: string;
  category: 'file' | 'edit' | 'view' | 'sketch' | 'feature' | 'assembly' | 'simulation' | 'export';
  shortcut?: string;
  icon?: string;
  action: () => void;
  keywords?: string[];
}

export function searchCommands(commands: CommandItem[], query: string): CommandItem[] {
  if (!query) return commands.slice(0, 10);
  
  const q = query.toLowerCase();
  return commands
    .filter(cmd => 
      cmd.name.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(q))
    )
    .sort((a, b) => {
      // Exact match first
      const aExact = a.name.toLowerCase().startsWith(q);
      const bExact = b.name.toLowerCase().startsWith(q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 15);
}

export function useCommandPalette(commands: CommandItem[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const filteredCommands = useMemo(() => searchCommands(commands, query), [commands, query]);
  
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);
  
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  
  const executeSelected = useCallback(() => {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) {
      cmd.action();
      close();
    }
  }, [filteredCommands, selectedIndex, close]);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open();
    }
    
    if (!isOpen) return;
    
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') executeSelected();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
  }, [isOpen, open, close, executeSelected, filteredCommands.length]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  return {
    isOpen,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    filteredCommands,
    open,
    close,
    executeSelected,
  };
}


// =============================================================================
// PRISM - IMAGE EDITOR (Items 936-945)
// =============================================================================

// ---------------------------------------------------------------------------
// 936. Non-Destructive Adjustment Layers
// ---------------------------------------------------------------------------

export interface AdjustmentLayer {
  id: string;
  type: AdjustmentType;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  mask?: Uint8ClampedArray;
  values: Record<string, number>;
}

export type AdjustmentType = 
  | 'brightness-contrast'
  | 'levels'
  | 'curves'
  | 'hue-saturation'
  | 'color-balance'
  | 'vibrance'
  | 'exposure'
  | 'gradient-map'
  | 'selective-color'
  | 'channel-mixer'
  | 'black-white'
  | 'photo-filter';

export type BlendMode = 
  | 'normal' | 'multiply' | 'screen' | 'overlay' 
  | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn'
  | 'darken' | 'lighten' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

const adjustmentDefaults: Record<AdjustmentType, Record<string, number>> = {
  'brightness-contrast': { brightness: 0, contrast: 0 },
  'levels': { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 },
  'curves': { /* Complex - requires point array */ },
  'hue-saturation': { hue: 0, saturation: 0, lightness: 0 },
  'color-balance': { shadowsRed: 0, shadowsGreen: 0, shadowsBlue: 0, midtonesRed: 0, midtonesGreen: 0, midtonesBlue: 0, highlightsRed: 0, highlightsGreen: 0, highlightsBlue: 0 },
  'vibrance': { vibrance: 0, saturation: 0 },
  'exposure': { exposure: 0, offset: 0, gamma: 1 },
  'gradient-map': { /* Complex */ },
  'selective-color': { /* Complex */ },
  'channel-mixer': { redRed: 100, redGreen: 0, redBlue: 0, greenRed: 0, greenGreen: 100, greenBlue: 0, blueRed: 0, blueGreen: 0, blueBlue: 100 },
  'black-white': { red: 40, yellow: 60, green: 40, cyan: 60, blue: 20, magenta: 80, tint: 0 },
  'photo-filter': { warming: 0, cooling: 0, density: 25 },
};

export function createAdjustmentLayer(type: AdjustmentType, name?: string): AdjustmentLayer {
  return {
    id: `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    name: name || type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    values: { ...adjustmentDefaults[type] },
  };
}

export function applyAdjustmentToPixels(
  imageData: ImageData,
  adjustment: AdjustmentLayer
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  
  const { type, values, opacity, mask } = adjustment;
  const factor = opacity / 100;
  
  for (let i = 0; i < result.data.length; i += 4) {
    const pixelIndex = i / 4;
    const maskValue = mask ? mask[pixelIndex] / 255 : 1;
    const blend = factor * maskValue;
    
    let r = result.data[i];
    let g = result.data[i + 1];
    let b = result.data[i + 2];
    
    // Original values for blending
    const origR = r;
    const origG = g;
    const origB = b;
    
    switch (type) {
      case 'brightness-contrast': {
        const brightness = values.brightness || 0;
        const contrast = values.contrast || 0;
        const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        r = contrastFactor * (r - 128) + 128 + brightness;
        g = contrastFactor * (g - 128) + 128 + brightness;
        b = contrastFactor * (b - 128) + 128 + brightness;
        break;
      }
      case 'hue-saturation': {
        const hueShift = values.hue || 0;
        const satMult = 1 + (values.saturation || 0) / 100;
        const lightShift = values.lightness || 0;
        const [h, s, l] = rgbToHsl(r, g, b);
        const newH = (h + hueShift / 360) % 1;
        const newS = Math.max(0, Math.min(1, s * satMult));
        const newL = Math.max(0, Math.min(1, l + lightShift / 100));
        [r, g, b] = hslToRgb(newH, newS, newL);
        break;
      }
      case 'vibrance': {
        const vib = (values.vibrance || 0) / 100;
        const sat = (values.saturation || 0) / 100;
        const max = Math.max(r, g, b);
        const avg = (r + g + b) / 3;
        const amt = ((max - avg) / 128) * vib;
        r = r + (r - avg) * (amt + sat);
        g = g + (g - avg) * (amt + sat);
        b = b + (b - avg) * (amt + sat);
        break;
      }
    }
    
    // Blend with original based on opacity and mask
    result.data[i] = Math.round(origR * (1 - blend) + Math.max(0, Math.min(255, r)) * blend);
    result.data[i + 1] = Math.round(origG * (1 - blend) + Math.max(0, Math.min(255, g)) * blend);
    result.data[i + 2] = Math.round(origB * (1 - blend) + Math.max(0, Math.min(255, b)) * blend);
  }
  
  return result;
}

// Color conversion helpers
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
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
  
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
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
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ---------------------------------------------------------------------------
// 937-938. Color Grading Wheels (Lift/Gamma/Gain)
// ---------------------------------------------------------------------------

export interface ColorWheelState {
  lift: { x: number; y: number; brightness: number };   // Shadows
  gamma: { x: number; y: number; brightness: number };  // Midtones
  gain: { x: number; y: number; brightness: number };   // Highlights
}

export function createColorWheelState(): ColorWheelState {
  return {
    lift: { x: 0, y: 0, brightness: 0 },
    gamma: { x: 0, y: 0, brightness: 0 },
    gain: { x: 0, y: 0, brightness: 0 },
  };
}

export function applyColorGrading(
  imageData: ImageData,
  grading: ColorWheelState
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  
  for (let i = 0; i < result.data.length; i += 4) {
    let r = result.data[i] / 255;
    let g = result.data[i + 1] / 255;
    let b = result.data[i + 2] / 255;
    
    // Calculate luminance for shadow/mid/highlight separation
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    // Shadow influence (lift) - more effect on dark pixels
    const shadowWeight = 1 - lum;
    r += grading.lift.x * 0.1 * shadowWeight + grading.lift.brightness * 0.1 * shadowWeight;
    g += -grading.lift.y * 0.1 * shadowWeight + grading.lift.brightness * 0.1 * shadowWeight;
    b += -grading.lift.x * 0.1 * shadowWeight + grading.lift.brightness * 0.1 * shadowWeight;
    
    // Midtone influence (gamma) - bell curve centered at 0.5
    const midWeight = 1 - Math.abs(lum - 0.5) * 2;
    r += grading.gamma.x * 0.1 * midWeight + grading.gamma.brightness * 0.1 * midWeight;
    g += -grading.gamma.y * 0.1 * midWeight + grading.gamma.brightness * 0.1 * midWeight;
    b += -grading.gamma.x * 0.1 * midWeight + grading.gamma.brightness * 0.1 * midWeight;
    
    // Highlight influence (gain) - more effect on bright pixels
    const highWeight = lum;
    r += grading.gain.x * 0.1 * highWeight + grading.gain.brightness * 0.1 * highWeight;
    g += -grading.gain.y * 0.1 * highWeight + grading.gain.brightness * 0.1 * highWeight;
    b += -grading.gain.x * 0.1 * highWeight + grading.gain.brightness * 0.1 * highWeight;
    
    result.data[i] = Math.max(0, Math.min(255, r * 255));
    result.data[i + 1] = Math.max(0, Math.min(255, g * 255));
    result.data[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
  
  return result;
}

export function renderColorWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  value: { x: number; y: number },
  label: string
): void {
  ctx.save();
  
  // Draw color wheel background
  const gradient = ctx.createConicGradient(0, x, y);
  gradient.addColorStop(0, 'hsl(0, 100%, 50%)');
  gradient.addColorStop(0.166, 'hsl(60, 100%, 50%)');
  gradient.addColorStop(0.333, 'hsl(120, 100%, 50%)');
  gradient.addColorStop(0.5, 'hsl(180, 100%, 50%)');
  gradient.addColorStop(0.666, 'hsl(240, 100%, 50%)');
  gradient.addColorStop(0.833, 'hsl(300, 100%, 50%)');
  gradient.addColorStop(1, 'hsl(360, 100%, 50%)');
  
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Center indicator
  const indicatorX = x + value.x * radius;
  const indicatorY = y + value.y * radius;
  
  ctx.beginPath();
  ctx.arc(indicatorX, indicatorY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Label
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + radius + 16);
  
  ctx.restore();
}


// =============================================================================
// VINX - VIDEO EDITOR (Items 946-955)
// =============================================================================

// ---------------------------------------------------------------------------
// 946. Magnetic Timeline Snapping
// ---------------------------------------------------------------------------

export interface SnapPoint {
  time: number;
  type: 'clip-start' | 'clip-end' | 'marker' | 'playhead' | 'beat';
  label?: string;
}

export interface MagneticSnapResult {
  snapped: boolean;
  snapTime: number;
  snapType: SnapPoint['type'] | null;
  distance: number;
}

export function findMagneticSnap(
  currentTime: number,
  snapPoints: SnapPoint[],
  threshold: number = 0.1, // seconds
  enabled: boolean = true
): MagneticSnapResult {
  if (!enabled || snapPoints.length === 0) {
    return { snapped: false, snapTime: currentTime, snapType: null, distance: Infinity };
  }
  
  let closestPoint: SnapPoint | null = null;
  let closestDistance = Infinity;
  
  for (const point of snapPoints) {
    const distance = Math.abs(point.time - currentTime);
    if (distance < closestDistance && distance <= threshold) {
      closestDistance = distance;
      closestPoint = point;
    }
  }
  
  if (closestPoint) {
    return {
      snapped: true,
      snapTime: closestPoint.time,
      snapType: closestPoint.type,
      distance: closestDistance,
    };
  }
  
  return { snapped: false, snapTime: currentTime, snapType: null, distance: Infinity };
}

export function generateClipSnapPoints(
  clips: Array<{ id: string; startTime: number; duration: number }>
): SnapPoint[] {
  const points: SnapPoint[] = [];
  
  for (const clip of clips) {
    points.push({ time: clip.startTime, type: 'clip-start' });
    points.push({ time: clip.startTime + clip.duration, type: 'clip-end' });
  }
  
  return points;
}

// ---------------------------------------------------------------------------
// 947-948. J/K/L Shuttle Playback Control
// ---------------------------------------------------------------------------

export interface ShuttleState {
  speed: number; // -8 to 8 (negative = reverse)
  direction: 'forward' | 'reverse' | 'paused';
}

export function createShuttleState(): ShuttleState {
  return { speed: 0, direction: 'paused' };
}

const shuttleSpeeds = [0, 0.25, 0.5, 1, 1.5, 2, 4, 8];

export function handleShuttleKey(
  state: ShuttleState,
  key: 'j' | 'k' | 'l'
): ShuttleState {
  switch (key) {
    case 'k':
      // Stop
      return { speed: 0, direction: 'paused' };
      
    case 'l':
      // Forward - increase speed
      if (state.direction === 'reverse') {
        // Switch to forward
        return { speed: 1, direction: 'forward' };
      }
      const nextForward = shuttleSpeeds.findIndex(s => s > state.speed);
      return {
        speed: nextForward >= 0 ? shuttleSpeeds[nextForward] : state.speed,
        direction: 'forward',
      };
      
    case 'j':
      // Reverse - increase reverse speed
      if (state.direction === 'forward') {
        // Switch to reverse
        return { speed: 1, direction: 'reverse' };
      }
      const nextReverse = shuttleSpeeds.findIndex(s => s > state.speed);
      return {
        speed: nextReverse >= 0 ? shuttleSpeeds[nextReverse] : state.speed,
        direction: 'reverse',
      };
  }
}

// ---------------------------------------------------------------------------
// 949-950. Advanced Waveform Visualization
// ---------------------------------------------------------------------------

export interface WaveformStyle {
  color: string;
  backgroundColor: string;
  midlineColor: string;
  peakColor: string;
  showMidline: boolean;
  showPeaks: boolean;
  smoothing: number; // 0-1
  scale: number;
}

const defaultWaveformStyle: WaveformStyle = {
  color: 'rgba(74, 158, 255, 0.8)',
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  midlineColor: 'rgba(255, 255, 255, 0.2)',
  peakColor: 'rgba(255, 69, 58, 0.8)',
  showMidline: true,
  showPeaks: true,
  smoothing: 0.3,
  scale: 1,
};

export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  style: Partial<WaveformStyle> = {}
): void {
  const s = { ...defaultWaveformStyle, ...style };
  const midY = y + height / 2;
  
  ctx.save();
  
  // Background
  ctx.fillStyle = s.backgroundColor;
  ctx.fillRect(x, y, width, height);
  
  // Midline
  if (s.showMidline) {
    ctx.strokeStyle = s.midlineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x + width, midY);
    ctx.stroke();
  }
  
  // Waveform
  ctx.fillStyle = s.color;
  const samplesPerPixel = peaks.length / width;
  
  for (let i = 0; i < width; i++) {
    const startSample = Math.floor(i * samplesPerPixel);
    const endSample = Math.floor((i + 1) * samplesPerPixel);
    
    let min = 0, max = 0;
    for (let j = startSample; j < endSample && j < peaks.length; j++) {
      const val = peaks[j] * s.scale;
      min = Math.min(min, val);
      max = Math.max(max, val);
    }
    
    const barHeight = Math.max(1, (max - min) * (height / 2));
    const barY = midY - (max * (height / 2));
    
    ctx.fillRect(x + i, barY, 1, barHeight);
  }
  
  ctx.restore();
}


// =============================================================================
// IMOSION - DAW (Items 956-965)
// =============================================================================

// ---------------------------------------------------------------------------
// 956-958. Real-Time Spectrum Analyzer
// ---------------------------------------------------------------------------

export interface SpectrumAnalyzerConfig {
  fftSize: 256 | 512 | 1024 | 2048 | 4096;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  barCount: number;
  colorMode: 'gradient' | 'solid' | 'rainbow';
  showPeakHold: boolean;
  peakHoldTime: number; // ms
}

const defaultSpectrumConfig: SpectrumAnalyzerConfig = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -90,
  maxDecibels: -10,
  barCount: 64,
  colorMode: 'gradient',
  showPeakHold: true,
  peakHoldTime: 1500,
};

export function createSpectrumAnalyzer(
  audioContext: AudioContext,
  config: Partial<SpectrumAnalyzerConfig> = {}
): { analyser: AnalyserNode; dataArray: Uint8Array; config: SpectrumAnalyzerConfig } {
  const cfg = { ...defaultSpectrumConfig, ...config };
  
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = cfg.fftSize;
  analyser.smoothingTimeConstant = cfg.smoothingTimeConstant;
  analyser.minDecibels = cfg.minDecibels;
  analyser.maxDecibels = cfg.maxDecibels;
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  return { analyser, dataArray, config: cfg };
}

export function renderSpectrumAnalyzer(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  config: SpectrumAnalyzerConfig,
  peakHolds?: number[]
): void {
  const { barCount, colorMode } = config;
  const barWidth = width / barCount - 1;
  const samplesPerBar = Math.floor(dataArray.length / barCount);
  
  ctx.save();
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x, y, width, height);
  
  for (let i = 0; i < barCount; i++) {
    // Average samples for this bar
    let sum = 0;
    const startIdx = i * samplesPerBar;
    for (let j = 0; j < samplesPerBar; j++) {
      sum += dataArray[startIdx + j];
    }
    const value = sum / samplesPerBar / 255;
    const barHeight = value * height;
    
    // Color
    if (colorMode === 'gradient') {
      const gradient = ctx.createLinearGradient(0, y + height, 0, y);
      gradient.addColorStop(0, '#34C759');
      gradient.addColorStop(0.5, '#FFD60A');
      gradient.addColorStop(1, '#FF453A');
      ctx.fillStyle = gradient;
    } else if (colorMode === 'rainbow') {
      ctx.fillStyle = `hsl(${(i / barCount) * 360}, 80%, 50%)`;
    } else {
      ctx.fillStyle = '#4A9EFF';
    }
    
    ctx.fillRect(
      x + i * (barWidth + 1),
      y + height - barHeight,
      barWidth,
      barHeight
    );
    
    // Peak hold
    if (config.showPeakHold && peakHolds && peakHolds[i] !== undefined) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(
        x + i * (barWidth + 1),
        y + height - peakHolds[i] * height,
        barWidth,
        2
      );
    }
  }
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 959-960. MIDI Piano Roll
// ---------------------------------------------------------------------------

export interface MIDINote {
  id: string;
  pitch: number; // 0-127
  velocity: number; // 0-127
  startTime: number; // in beats
  duration: number; // in beats
  channel: number;
}

export interface PianoRollConfig {
  startOctave: number;
  endOctave: number;
  beatsPerMeasure: number;
  pixelsPerBeat: number;
  noteHeight: number;
  gridDivision: number; // beats per grid line
  showVelocity: boolean;
  snapToGrid: boolean;
}

const defaultPianoRollConfig: PianoRollConfig = {
  startOctave: 2,
  endOctave: 7,
  beatsPerMeasure: 4,
  pixelsPerBeat: 40,
  noteHeight: 12,
  gridDivision: 0.25, // 16th notes
  showVelocity: true,
  snapToGrid: true,
};

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const note = noteNames[pitch % 12];
  return `${note}${octave}`;
}

export function renderPianoRoll(
  ctx: CanvasRenderingContext2D,
  notes: MIDINote[],
  x: number,
  y: number,
  width: number,
  height: number,
  config: Partial<PianoRollConfig> = {},
  viewOffset: { x: number; y: number } = { x: 0, y: 0 }
): void {
  const cfg = { ...defaultPianoRollConfig, ...config };
  const totalNotes = (cfg.endOctave - cfg.startOctave + 1) * 12;
  const keyWidth = 60;
  const gridWidth = width - keyWidth;
  
  ctx.save();
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(x, y, width, height);
  
  // Piano keys
  for (let i = 0; i < totalNotes; i++) {
    const noteY = y + (totalNotes - 1 - i) * cfg.noteHeight - viewOffset.y;
    if (noteY < y - cfg.noteHeight || noteY > y + height) continue;
    
    const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
    ctx.fillStyle = isBlack ? '#1C1C1E' : '#2C2C2E';
    ctx.fillRect(x, noteY, keyWidth, cfg.noteHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(x, noteY, keyWidth, cfg.noteHeight);
    
    // Note name on C
    if (i % 12 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(pitchToNoteName(i + cfg.startOctave * 12), x + keyWidth - 4, noteY + cfg.noteHeight - 2);
    }
  }
  
  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  const beatsInView = gridWidth / cfg.pixelsPerBeat;
  const startBeat = Math.floor(viewOffset.x / cfg.pixelsPerBeat);
  
  for (let beat = startBeat; beat < startBeat + beatsInView + 1; beat += cfg.gridDivision) {
    const lineX = x + keyWidth + beat * cfg.pixelsPerBeat - viewOffset.x;
    if (lineX < x + keyWidth || lineX > x + width) continue;
    
    ctx.strokeStyle = beat % cfg.beatsPerMeasure === 0 
      ? 'rgba(255, 255, 255, 0.3)'
      : beat % 1 === 0 
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(255, 255, 255, 0.05)';
    
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + height);
    ctx.stroke();
  }
  
  // MIDI Notes
  for (const note of notes) {
    const noteIdx = note.pitch - cfg.startOctave * 12;
    if (noteIdx < 0 || noteIdx >= totalNotes) continue;
    
    const noteX = x + keyWidth + note.startTime * cfg.pixelsPerBeat - viewOffset.x;
    const noteY = y + (totalNotes - 1 - noteIdx) * cfg.noteHeight - viewOffset.y;
    const noteWidth = note.duration * cfg.pixelsPerBeat;
    
    if (noteX > x + width || noteX + noteWidth < x + keyWidth) continue;
    if (noteY < y - cfg.noteHeight || noteY > y + height) continue;
    
    // Note color based on velocity
    const hue = 210; // Blue
    const lightness = 40 + (note.velocity / 127) * 30;
    ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
    
    ctx.fillRect(noteX, noteY + 1, noteWidth - 1, cfg.noteHeight - 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(noteX, noteY + 1, noteWidth - 1, cfg.noteHeight - 2);
  }
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 961-962. LUFS Metering
// ---------------------------------------------------------------------------

export interface LUFSMeterState {
  momentary: number;   // 400ms window
  shortTerm: number;   // 3s window
  integrated: number;  // Full program
  range: number;       // Loudness range (LRA)
  truePeak: number;    // dBTP
}

export function createLUFSMeterState(): LUFSMeterState {
  return {
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    range: 0,
    truePeak: -Infinity,
  };
}

export function renderLUFSMeter(
  ctx: CanvasRenderingContext2D,
  state: LUFSMeterState,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const barWidth = (width - 40) / 4;
  const labels = ['M', 'S', 'I', 'TP'];
  const values = [state.momentary, state.shortTerm, state.integrated, state.truePeak];
  const targets = [-14, -14, -14, -1]; // Streaming targets
  
  ctx.save();
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(x, y, width, height);
  
  // Scale labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'right';
  
  const minDB = -60;
  const maxDB = 0;
  const scale = height / (maxDB - minDB);
  
  for (let db = 0; db >= minDB; db -= 10) {
    const labelY = y + (maxDB - db) * scale;
    ctx.fillText(`${db}`, x + 20, labelY + 3);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(x + 25, labelY);
    ctx.lineTo(x + width, labelY);
    ctx.stroke();
  }
  
  // Bars
  for (let i = 0; i < 4; i++) {
    const barX = x + 30 + i * (barWidth + 4);
    const value = Math.max(minDB, Math.min(maxDB, values[i]));
    const barHeight = (value - minDB) * scale;
    const targetY = y + (maxDB - targets[i]) * scale;
    
    // Bar gradient
    const gradient = ctx.createLinearGradient(0, y + height, 0, y);
    gradient.addColorStop(0, '#34C759');
    gradient.addColorStop(0.5, '#FFD60A');
    gradient.addColorStop(0.85, '#FF9F0A');
    gradient.addColorStop(1, '#FF453A');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, y + height - barHeight, barWidth, barHeight);
    
    // Target line
    ctx.strokeStyle = '#4A9EFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(barX, targetY);
    ctx.lineTo(barX + barWidth, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], barX + barWidth / 2, y + height + 14);
    
    // Value
    ctx.fillStyle = isFinite(value) ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(
      isFinite(value) ? value.toFixed(1) : '-∞',
      barX + barWidth / 2,
      y - 6
    );
  }
  
  ctx.restore();
}


// =============================================================================
// FLUX - MOTION GRAPHICS (Items 966-975)
// =============================================================================

// ---------------------------------------------------------------------------
// 966-968. Graph Editor with Bezier Curves
// ---------------------------------------------------------------------------

export interface GraphKeyframe {
  time: number;
  value: number;
  inHandle: { x: number; y: number };
  outHandle: { x: number; y: number };
  interpolation: 'linear' | 'bezier' | 'hold' | 'auto';
}

export interface GraphEditorConfig {
  timeRange: { start: number; end: number };
  valueRange: { min: number; max: number };
  gridLinesX: number;
  gridLinesY: number;
  curveColor: string;
  handleColor: string;
  keyframeColor: string;
  selectedColor: string;
}

const defaultGraphConfig: GraphEditorConfig = {
  timeRange: { start: 0, end: 100 },
  valueRange: { min: 0, max: 100 },
  gridLinesX: 10,
  gridLinesY: 10,
  curveColor: '#4A9EFF',
  handleColor: '#FF9F0A',
  keyframeColor: '#FFFFFF',
  selectedColor: '#FFD60A',
};

export function renderGraphEditor(
  ctx: CanvasRenderingContext2D,
  keyframes: GraphKeyframe[],
  x: number,
  y: number,
  width: number,
  height: number,
  config: Partial<GraphEditorConfig> = {},
  selectedIndices: number[] = []
): void {
  const cfg = { ...defaultGraphConfig, ...config };
  const { timeRange, valueRange, gridLinesX, gridLinesY } = cfg;
  
  const timeToX = (t: number) => x + ((t - timeRange.start) / (timeRange.end - timeRange.start)) * width;
  const valueToY = (v: number) => y + height - ((v - valueRange.min) / (valueRange.max - valueRange.min)) * height;
  const xToTime = (px: number) => timeRange.start + ((px - x) / width) * (timeRange.end - timeRange.start);
  const yToValue = (py: number) => valueRange.max - ((py - y) / height) * (valueRange.max - valueRange.min);
  
  ctx.save();
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(x, y, width, height);
  
  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // Vertical grid
  for (let i = 0; i <= gridLinesX; i++) {
    const gx = x + (width / gridLinesX) * i;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + height);
    ctx.stroke();
  }
  
  // Horizontal grid
  for (let i = 0; i <= gridLinesY; i++) {
    const gy = y + (height / gridLinesY) * i;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + width, gy);
    ctx.stroke();
  }
  
  // Draw curve
  if (keyframes.length >= 2) {
    ctx.strokeStyle = cfg.curveColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];
      
      const p1 = { x: timeToX(k1.time), y: valueToY(k1.value) };
      const p2 = { x: timeToX(k2.time), y: valueToY(k2.value) };
      
      if (i === 0) ctx.moveTo(p1.x, p1.y);
      
      if (k1.interpolation === 'linear') {
        ctx.lineTo(p2.x, p2.y);
      } else if (k1.interpolation === 'hold') {
        ctx.lineTo(p2.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      } else {
        // Bezier
        const cp1 = {
          x: p1.x + k1.outHandle.x * (p2.x - p1.x),
          y: p1.y - k1.outHandle.y * (p1.y - p2.y),
        };
        const cp2 = {
          x: p2.x - (1 - k2.inHandle.x) * (p2.x - p1.x),
          y: p2.y + k2.inHandle.y * (p1.y - p2.y),
        };
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
      }
    }
    
    ctx.stroke();
  }
  
  // Draw keyframes
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const kx = timeToX(kf.time);
    const ky = valueToY(kf.value);
    const selected = selectedIndices.includes(i);
    
    // Handles
    if (kf.interpolation === 'bezier') {
      ctx.strokeStyle = cfg.handleColor;
      ctx.lineWidth = 1;
      
      // In handle
      const inX = kx - (1 - kf.inHandle.x) * 30;
      const inY = ky + kf.inHandle.y * 30;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(inX, inY);
      ctx.stroke();
      ctx.fillStyle = cfg.handleColor;
      ctx.beginPath();
      ctx.arc(inX, inY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Out handle
      const outX = kx + kf.outHandle.x * 30;
      const outY = ky - kf.outHandle.y * 30;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(outX, outY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(outX, outY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Keyframe diamond
    ctx.fillStyle = selected ? cfg.selectedColor : cfg.keyframeColor;
    ctx.beginPath();
    ctx.moveTo(kx, ky - 6);
    ctx.lineTo(kx + 6, ky);
    ctx.lineTo(kx, ky + 6);
    ctx.lineTo(kx - 6, ky);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 969-970. Motion Path Visualization
// ---------------------------------------------------------------------------

export interface MotionPath {
  points: Array<{ x: number; y: number; time: number }>;
  closed: boolean;
  showTangents: boolean;
  showVelocity: boolean;
}

export function renderMotionPath(
  ctx: CanvasRenderingContext2D,
  path: MotionPath,
  color: string = '#4A9EFF',
  currentTime?: number
): void {
  if (path.points.length < 2) return;
  
  ctx.save();
  
  // Draw path
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);
  
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  
  if (path.closed) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw points
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Velocity indicator
    if (path.showVelocity && i < path.points.length - 1) {
      const next = path.points[i + 1];
      const timeDelta = next.time - p.time;
      const dist = Math.sqrt((next.x - p.x) ** 2 + (next.y - p.y) ** 2);
      const velocity = timeDelta > 0 ? dist / timeDelta : 0;
      
      // Draw velocity bar
      const barHeight = Math.min(30, velocity * 0.5);
      ctx.fillStyle = 'rgba(74, 158, 255, 0.5)';
      ctx.fillRect(p.x - 2, p.y - barHeight - 8, 4, barHeight);
    }
  }
  
  // Current position indicator
  if (currentTime !== undefined) {
    const pos = getPositionAtTime(path, currentTime);
    if (pos) {
      ctx.fillStyle = '#FFD60A';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  
  ctx.restore();
}

export function getPositionAtTime(
  path: MotionPath,
  time: number
): { x: number; y: number } | null {
  if (path.points.length === 0) return null;
  if (path.points.length === 1) return { x: path.points[0].x, y: path.points[0].y };
  
  // Find the two points to interpolate between
  for (let i = 0; i < path.points.length - 1; i++) {
    const p1 = path.points[i];
    const p2 = path.points[i + 1];
    
    if (time >= p1.time && time <= p2.time) {
      const t = (time - p1.time) / (p2.time - p1.time);
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };
    }
  }
  
  // Before first point or after last point
  if (time < path.points[0].time) return { x: path.points[0].x, y: path.points[0].y };
  const last = path.points[path.points.length - 1];
  return { x: last.x, y: last.y };
}

// ---------------------------------------------------------------------------
// 971-972. Expression Editor Syntax Highlighting
// ---------------------------------------------------------------------------

export interface ExpressionToken {
  type: 'keyword' | 'function' | 'property' | 'number' | 'string' | 'operator' | 'comment' | 'error';
  value: string;
  start: number;
  end: number;
}

const expressionKeywords = ['var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'function', 'true', 'false', 'null', 'undefined'];
const expressionFunctions = ['Math', 'sin', 'cos', 'tan', 'abs', 'round', 'floor', 'ceil', 'min', 'max', 'pow', 'sqrt', 'random', 'time', 'value', 'wiggle', 'linear', 'ease', 'easeIn', 'easeOut', 'loopIn', 'loopOut', 'clamp', 'lerp', 'toComp', 'fromComp'];
const expressionProperties = ['position', 'scale', 'rotation', 'opacity', 'anchorPoint', 'transform', 'effect', 'comp', 'layer', 'thisComp', 'thisLayer', 'thisProperty', 'numKeys', 'key', 'velocity', 'speed'];

export function tokenizeExpression(code: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let i = 0;
  
  while (i < code.length) {
    // Skip whitespace
    if (/\s/.test(code[i])) {
      i++;
      continue;
    }
    
    // Comments
    if (code.substring(i, i + 2) === '//') {
      const start = i;
      while (i < code.length && code[i] !== '\n') i++;
      tokens.push({ type: 'comment', value: code.substring(start, i), start, end: i });
      continue;
    }
    
    // Numbers
    if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i + 1]))) {
      const start = i;
      while (i < code.length && /[0-9.]/.test(code[i])) i++;
      tokens.push({ type: 'number', value: code.substring(start, i), start, end: i });
      continue;
    }
    
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      const start = i;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      tokens.push({ type: 'string', value: code.substring(start, i), start, end: i });
      continue;
    }
    
    // Identifiers (keywords, functions, properties)
    if (/[a-zA-Z_]/.test(code[i])) {
      const start = i;
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) i++;
      const value = code.substring(start, i);
      
      let type: ExpressionToken['type'] = 'property';
      if (expressionKeywords.includes(value)) type = 'keyword';
      else if (expressionFunctions.includes(value)) type = 'function';
      else if (expressionProperties.includes(value)) type = 'property';
      
      tokens.push({ type, value, start, end: i });
      continue;
    }
    
    // Operators
    if (/[+\-*/%=<>!&|^~?:;,.()\[\]{}]/.test(code[i])) {
      tokens.push({ type: 'operator', value: code[i], start: i, end: i + 1 });
      i++;
      continue;
    }
    
    // Unknown
    tokens.push({ type: 'error', value: code[i], start: i, end: i + 1 });
    i++;
  }
  
  return tokens;
}

export const expressionTokenColors: Record<ExpressionToken['type'], string> = {
  keyword: '#FF79C6',
  function: '#8BE9FD',
  property: '#50FA7B',
  number: '#BD93F9',
  string: '#F1FA8C',
  operator: '#FFFFFF',
  comment: '#6272A4',
  error: '#FF5555',
};

export function renderHighlightedExpression(
  ctx: CanvasRenderingContext2D,
  tokens: ExpressionToken[],
  x: number,
  y: number,
  lineHeight: number = 18
): void {
  ctx.save();
  ctx.font = '12px "SF Mono", "Fira Code", monospace';
  ctx.textBaseline = 'top';
  
  let currentX = x;
  let currentY = y;
  
  for (const token of tokens) {
    const lines = token.value.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        currentY += lineHeight;
        currentX = x;
      }
      
      ctx.fillStyle = expressionTokenColors[token.type];
      ctx.fillText(lines[i], currentX, currentY);
      currentX += ctx.measureText(lines[i]).width;
    }
  }
  
  ctx.restore();
}


// =============================================================================
// CREATIVE APP SETTINGS HOOK
// =============================================================================

export interface CreativeAppSettings {
  qualityMode: 'performance' | 'balanced' | 'quality';
  gpuAcceleration: boolean;
  autoSaveInterval: string;
  maxUndoSteps: number;
  showTips: boolean;
  darkUI: boolean;
}

const defaultCreativeSettings: CreativeAppSettings = {
  qualityMode: 'balanced',
  gpuAcceleration: true,
  autoSaveInterval: '30',
  maxUndoSteps: 50,
  showTips: true,
  darkUI: true,
};

/**
 * Hook to read and subscribe to creative app settings from localStorage.
 * Settings are managed in Settings.tsx and stored in 'dex-creative-app-settings'.
 */
export function useCreativeAppSettings(appId: string): CreativeAppSettings {
  const [settings, setSettings] = useState<CreativeAppSettings>(() => {
    try {
      const raw = localStorage.getItem('dex-creative-app-settings');
      if (raw) {
        const all = JSON.parse(raw);
        return { ...defaultCreativeSettings, ...all[appId] };
      }
    } catch { /* ignore */ }
    return defaultCreativeSettings;
  });

  useEffect(() => {
    // Listen for storage changes (in case settings are changed in another tab/window)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'dex-creative-app-settings') {
        try {
          const all = JSON.parse(e.newValue || '{}');
          setSettings({ ...defaultCreativeSettings, ...all[appId] });
        } catch { /* ignore */ }
      }
    };

    // Also poll periodically since storage events don't fire in same window
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('dex-creative-app-settings');
        if (raw) {
          const all = JSON.parse(raw);
          setSettings(prev => {
            const next = { ...defaultCreativeSettings, ...all[appId] };
            // Only update if something changed
            if (JSON.stringify(prev) !== JSON.stringify(next)) return next;
            return prev;
          });
        }
      } catch { /* ignore */ }
    }, 2000);

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [appId]);

  return settings;
}

/**
 * Get creative app settings synchronously (non-reactive).
 */
export function getCreativeAppSettings(appId: string): CreativeAppSettings {
  try {
    const raw = localStorage.getItem('dex-creative-app-settings');
    if (raw) {
      const all = JSON.parse(raw);
      return { ...defaultCreativeSettings, ...all[appId] };
    }
  } catch { /* ignore */ }
  return defaultCreativeSettings;
}


// =============================================================================
// EXPORTS
// =============================================================================

export {
  // AXL
  defaultDimensionStyle,
  constraintSymbols,
  constraintColors,
  
  // PRISM
  adjustmentDefaults,
  
  // VINX
  shuttleSpeeds,
  defaultWaveformStyle,
  
  // IMOSION
  defaultSpectrumConfig,
  defaultPianoRollConfig,
  noteNames,
  
  // FLUX
  defaultGraphConfig,
  expressionKeywords,
  expressionFunctions,
  expressionProperties,
};
