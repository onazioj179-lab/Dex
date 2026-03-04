/**
 * DEX Prism Image Editor Feature Enhancements
 * Smart Guides, Rulers, Non-Destructive Editing, Batch Operations
 */

// ==================== SMART GUIDES ====================
export interface SmartGuide {
  type: 'horizontal' | 'vertical' | 'center-h' | 'center-v' | 'edge' | 'spacing';
  position: number;
  sourceLayerId?: string;
  color: string;
}

export interface GuideSettings {
  enabled: boolean;
  showRulers: boolean;
  snapToGuides: boolean;
  snapToEdges: boolean;
  snapToCenter: boolean;
  snapDistance: number;
  guideColor: string;
  rulerUnits: 'px' | 'in' | 'cm' | 'mm' | '%';
}

export const DEFAULT_GUIDE_SETTINGS: GuideSettings = {
  enabled: true,
  showRulers: true,
  snapToGuides: true,
  snapToEdges: true,
  snapToCenter: true,
  snapDistance: 8,
  guideColor: '#00d4ff',
  rulerUnits: 'px',
};

// ==================== PIXEL GRID ====================
export interface PixelGridSettings {
  enabled: boolean;
  showAt: number; // Zoom level to show grid (e.g., 800 = 800%)
  color: string;
  opacity: number;
}

export const DEFAULT_PIXEL_GRID: PixelGridSettings = {
  enabled: true,
  showAt: 800,
  color: '#ffffff',
  opacity: 0.15,
};

// ==================== CANVAS ROTATION ====================
export interface CanvasRotation {
  angle: number;
  centerX: number;
  centerY: number;
}

export const ROTATION_PRESETS = [
  { label: '0', value: 0 },
  { label: '15', value: 15 },
  { label: '30', value: 30 },
  { label: '45', value: 45 },
  { label: '90', value: 90 },
  { label: '180', value: 180 },
  { label: '-15', value: -15 },
  { label: '-30', value: -30 },
  { label: '-45', value: -45 },
  { label: '-90', value: -90 },
];

// ==================== NON-DESTRUCTIVE EDITING ====================
export interface EditHistory {
  id: string;
  type: 'adjustment' | 'filter' | 'transform' | 'layer' | 'mask';
  name: string;
  timestamp: number;
  enabled: boolean;
  params: Record<string, unknown>;
  layerId?: string;
}

export interface AdjustmentLayer {
  id: string;
  name: string;
  type: AdjustmentType;
  enabled: boolean;
  opacity: number;
  blendMode: BlendMode;
  params: Record<string, number>;
  mask?: LayerMask;
}

export type AdjustmentType = 
  | 'brightness-contrast'
  | 'levels'
  | 'curves'
  | 'hue-saturation'
  | 'color-balance'
  | 'vibrance'
  | 'photo-filter'
  | 'channel-mixer'
  | 'gradient-map'
  | 'selective-color'
  | 'black-white'
  | 'invert'
  | 'posterize'
  | 'threshold';

export type BlendMode = 
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light'
  | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface LayerMask {
  id: string;
  data: ImageData | null;
  enabled: boolean;
  inverted: boolean;
  linked: boolean;
}

// ==================== ADJUSTMENT PRESETS ====================
export const ADJUSTMENT_PRESETS: { type: AdjustmentType; name: string; params: Record<string, number> }[] = [
  // Brightness/Contrast
  { type: 'brightness-contrast', name: 'Brighten', params: { brightness: 20, contrast: 0 } },
  { type: 'brightness-contrast', name: 'Darken', params: { brightness: -20, contrast: 0 } },
  { type: 'brightness-contrast', name: 'High Contrast', params: { brightness: 0, contrast: 40 } },
  { type: 'brightness-contrast', name: 'Low Contrast', params: { brightness: 0, contrast: -30 } },
  
  // Hue/Saturation
  { type: 'hue-saturation', name: 'Vibrant', params: { hue: 0, saturation: 30, lightness: 0 } },
  { type: 'hue-saturation', name: 'Desaturated', params: { hue: 0, saturation: -50, lightness: 0 } },
  { type: 'hue-saturation', name: 'Warm Shift', params: { hue: 15, saturation: 10, lightness: 0 } },
  { type: 'hue-saturation', name: 'Cool Shift', params: { hue: -15, saturation: 10, lightness: 0 } },
  
  // Vibrance
  { type: 'vibrance', name: 'Natural Boost', params: { vibrance: 40, saturation: 10 } },
  { type: 'vibrance', name: 'Subtle', params: { vibrance: 20, saturation: 0 } },
  
  // Color Balance
  { type: 'color-balance', name: 'Warm Shadows', params: { shadowR: 15, shadowG: 5, shadowB: -10, midR: 0, midG: 0, midB: 0, highR: 0, highG: 0, highB: 0 } },
  { type: 'color-balance', name: 'Cool Highlights', params: { shadowR: 0, shadowG: 0, shadowB: 0, midR: 0, midG: 0, midB: 0, highR: -10, highG: 0, highB: 15 } },
  { type: 'color-balance', name: 'Teal & Orange', params: { shadowR: -5, shadowG: 10, shadowB: 15, midR: 0, midG: 0, midB: 0, highR: 15, highG: 5, highB: -10 } },
];

// ==================== QUICK EXPORT ====================
export interface QuickExportSettings {
  format: 'png' | 'jpg' | 'webp' | 'gif' | 'svg' | 'psd' | 'tiff';
  quality: number;
  scale: number;
  preserveTransparency: boolean;
  colorProfile: 'srgb' | 'display-p3' | 'adobe-rgb';
  metadata: boolean;
}

export const QUICK_EXPORT_PRESETS: { id: string; name: string; settings: Partial<QuickExportSettings> }[] = [
  { id: 'web-png', name: 'Web PNG', settings: { format: 'png', quality: 100, scale: 1, preserveTransparency: true } },
  { id: 'web-jpg', name: 'Web JPEG', settings: { format: 'jpg', quality: 85, scale: 1, preserveTransparency: false } },
  { id: 'web-optimized', name: 'Web Optimized', settings: { format: 'webp', quality: 80, scale: 1, preserveTransparency: true } },
  { id: 'social-media', name: 'Social Media', settings: { format: 'jpg', quality: 90, scale: 1 } },
  { id: 'print-high', name: 'Print Quality', settings: { format: 'tiff', quality: 100, scale: 1, colorProfile: 'adobe-rgb' } },
  { id: 'thumbnail', name: 'Thumbnail', settings: { format: 'jpg', quality: 75, scale: 0.25 } },
  { id: 'retina-2x', name: 'Retina 2x', settings: { format: 'png', quality: 100, scale: 2 } },
  { id: 'retina-3x', name: 'Retina 3x', settings: { format: 'png', quality: 100, scale: 3 } },
];

// ==================== BATCH OPERATIONS ====================
export interface BatchOperation {
  id: string;
  type: 'resize' | 'format' | 'filter' | 'watermark' | 'rename';
  params: Record<string, unknown>;
}

export interface BatchJob {
  id: string;
  name: string;
  files: string[];
  operations: BatchOperation[];
  outputFolder: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

export const BATCH_RESIZE_PRESETS = [
  { label: '1920x1080 (Full HD)', width: 1920, height: 1080 },
  { label: '1280x720 (HD)', width: 1280, height: 720 },
  { label: '1080x1080 (Square)', width: 1080, height: 1080 },
  { label: '800x600 (Web)', width: 800, height: 600 },
  { label: '400x400 (Thumbnail)', width: 400, height: 400 },
  { label: '200x200 (Icon)', width: 200, height: 200 },
  { label: '50% Scale', width: -50, height: -50 },
  { label: '25% Scale', width: -25, height: -25 },
];

// ==================== IMAGE COMPARISON ====================
export interface CompareSettings {
  enabled: boolean;
  mode: 'side-by-side' | 'overlay' | 'split' | 'onion-skin';
  splitPosition: number; // 0-100%
  overlayOpacity: number;
  beforeLabel: string;
  afterLabel: string;
}

export const DEFAULT_COMPARE_SETTINGS: CompareSettings = {
  enabled: false,
  mode: 'split',
  splitPosition: 50,
  overlayOpacity: 50,
  beforeLabel: 'Before',
  afterLabel: 'After',
};

// ==================== HISTOGRAM ====================
export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  luminance: number[];
}

export interface HistogramSettings {
  showRGB: boolean;
  showLuminance: boolean;
  showOverexposed: boolean;
  showUnderexposed: boolean;
  overexposedColor: string;
  underexposedColor: string;
  threshold: number;
}

export const DEFAULT_HISTOGRAM_SETTINGS: HistogramSettings = {
  showRGB: true,
  showLuminance: true,
  showOverexposed: true,
  showUnderexposed: true,
  overexposedColor: '#ff0000',
  underexposedColor: '#0066ff',
  threshold: 250,
};

// ==================== COLOR PALETTE GENERATOR ====================
export interface ColorPalette {
  id: string;
  name: string;
  colors: PaletteColor[];
  createdAt: number;
}

export interface PaletteColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  name?: string;
}

export type PaletteGenerationMethod = 
  | 'dominant'     // Most common colors
  | 'vibrant'      // Most vibrant colors
  | 'muted'        // Muted/pastel colors
  | 'complementary'// Complementary color scheme
  | 'analogous'    // Analogous colors
  | 'triadic'      // Triadic color scheme
  | 'split-complementary';

// ==================== SELECTION TOOLS ====================
export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

export interface SelectionSettings {
  feather: number;
  antiAlias: boolean;
  mode: SelectionMode;
}

export const DEFAULT_SELECTION_SETTINGS: SelectionSettings = {
  feather: 0,
  antiAlias: true,
  mode: 'new',
};

// ==================== TRANSFORM SETTINGS ====================
export interface TransformSettings {
  maintainAspectRatio: boolean;
  transformFromCenter: boolean;
  interpolation: 'nearest' | 'bilinear' | 'bicubic';
  showBoundingBox: boolean;
}

export const DEFAULT_TRANSFORM_SETTINGS: TransformSettings = {
  maintainAspectRatio: true,
  transformFromCenter: false,
  interpolation: 'bicubic',
  showBoundingBox: true,
};

// ==================== UTILITY FUNCTIONS ====================

// Generate unique ID
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Convert hex to RGB
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// Convert RGB to hex
export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

// Convert RGB to HSL
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

// Calculate histogram from image data
export const calculateHistogram = (imageData: ImageData): HistogramData => {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const luminance = new Array(256).fill(0);
  
  for (let i = 0; i < imageData.data.length; i += 4) {
    const rVal = imageData.data[i];
    const gVal = imageData.data[i + 1];
    const bVal = imageData.data[i + 2];
    
    r[rVal]++;
    g[gVal]++;
    b[bVal]++;
    
    // Calculate luminance (perceived brightness)
    const lum = Math.round(0.299 * rVal + 0.587 * gVal + 0.114 * bVal);
    luminance[lum]++;
  }
  
  return { r, g, b, luminance };
};

// Extract dominant colors from image
export const extractDominantColors = (imageData: ImageData, count: number = 5): PaletteColor[] => {
  const colorMap = new Map<string, number>();
  
  // Sample every 4th pixel for performance
  for (let i = 0; i < imageData.data.length; i += 16) {
    const r = Math.round(imageData.data[i] / 32) * 32;
    const g = Math.round(imageData.data[i + 1] / 32) * 32;
    const b = Math.round(imageData.data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  
  // Sort by frequency and take top colors
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);
  
  return sortedColors.map(([key]) => {
    const [r, g, b] = key.split(',').map(Number);
    return {
      hex: rgbToHex(r, g, b),
      rgb: { r, g, b },
      hsl: rgbToHsl(r, g, b),
    };
  });
};

// Calculate snap position
export const calculateSnapPosition = (
  value: number,
  guides: SmartGuide[],
  settings: GuideSettings
): { snapped: number; guide: SmartGuide | null } => {
  if (!settings.enabled || !settings.snapToGuides) {
    return { snapped: value, guide: null };
  }
  
  for (const guide of guides) {
    if (Math.abs(value - guide.position) <= settings.snapDistance) {
      return { snapped: guide.position, guide };
    }
  }
  
  return { snapped: value, guide: null };
};

// Convert units
export const convertUnits = (
  value: number,
  from: 'px' | 'in' | 'cm' | 'mm' | '%',
  to: 'px' | 'in' | 'cm' | 'mm' | '%',
  dpi: number = 72,
  totalSize: number = 100
): number => {
  // First convert to pixels
  let pixels = value;
  switch (from) {
    case 'in': pixels = value * dpi; break;
    case 'cm': pixels = value * dpi / 2.54; break;
    case 'mm': pixels = value * dpi / 25.4; break;
    case '%': pixels = value * totalSize / 100; break;
  }
  
  // Then convert from pixels to target
  switch (to) {
    case 'px': return pixels;
    case 'in': return pixels / dpi;
    case 'cm': return pixels * 2.54 / dpi;
    case 'mm': return pixels * 25.4 / dpi;
    case '%': return pixels * 100 / totalSize;
  }
  
  return pixels;
};

// Save color palettes
export const savePalettes = (palettes: ColorPalette[]) => {
  try {
    localStorage.setItem('dex-prism-palettes', JSON.stringify(palettes));
  } catch { /* storage unavailable */ }
};

// Load color palettes
export const loadPalettes = (): ColorPalette[] => {
  try {
    const saved = localStorage.getItem('dex-prism-palettes');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Save edit history
export const saveEditHistory = (projectId: string, history: EditHistory[]) => {
  try {
    localStorage.setItem(`dex-prism-history-${projectId}`, JSON.stringify(history));
  } catch { /* storage unavailable */ }
};

// Load edit history
export const loadEditHistory = (projectId: string): EditHistory[] => {
  try {
    const saved = localStorage.getItem(`dex-prism-history-${projectId}`);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export default {
  DEFAULT_GUIDE_SETTINGS,
  DEFAULT_PIXEL_GRID,
  DEFAULT_COMPARE_SETTINGS,
  DEFAULT_HISTOGRAM_SETTINGS,
  DEFAULT_SELECTION_SETTINGS,
  DEFAULT_TRANSFORM_SETTINGS,
  ROTATION_PRESETS,
  ADJUSTMENT_PRESETS,
  QUICK_EXPORT_PRESETS,
  BATCH_RESIZE_PRESETS,
  generateId,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  calculateHistogram,
  extractDominantColors,
  calculateSnapPosition,
  convertUnits,
  savePalettes,
  loadPalettes,
  saveEditHistory,
  loadEditHistory,
};
