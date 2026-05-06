// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - VINX Color Grading System
// Professional color grading rivaling DaVinci Resolve
// Items 226-250 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface ColorWheelValues {
  lift: { r: number; g: number; b: number; master: number };
  gamma: { r: number; g: number; b: number; master: number };
  gain: { r: number; g: number; b: number; master: number };
  offset: { r: number; g: number; b: number; master: number };
}

export interface PrimaryCorrection {
  temperature: number;      // -100 to 100 (Kelvin shift)
  tint: number;            // -100 to 100 (Magenta-Green)
  contrast: number;        // -100 to 100
  pivot: number;           // 0 to 1
  saturation: number;      // 0 to 200
  vibrance: number;        // -100 to 100
  highlights: number;      // -100 to 100
  shadows: number;         // -100 to 100
  whites: number;          // -100 to 100
  blacks: number;          // -100 to 100
  exposure: number;        // -5 to +5 stops
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ColorCurves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
  hue: CurvePoint[];
  saturation: CurvePoint[];
  luminance: CurvePoint[];
}

export interface HSLQualifier {
  enabled: boolean;
  hue: { center: number; range: number; softness: number };
  saturation: { low: number; high: number; softness: number };
  luminance: { low: number; high: number; softness: number };
  denoise: number;
  blur: number;
  invert: boolean;
}

export interface PowerWindow {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon' | 'gradient' | 'curve';
  enabled: boolean;
  inverted: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  softness: number;
  opacity: number;
  feather: { inner: number; outer: number };
  points?: { x: number; y: number }[];  // For polygon/curve
  tracking?: WindowTracking;
}

export interface WindowTracking {
  enabled: boolean;
  mode: 'point' | 'area' | 'object';
  keyframes: Map<number, { x: number; y: number; scale: number; rotation: number }>;
}

export interface ColorGrade {
  id: string;
  name: string;
  primary: PrimaryCorrection;
  wheels: ColorWheelValues;
  curves: ColorCurves;
  qualifier?: HSLQualifier;
  window?: PowerWindow;
  nodes: GradeNode[];
}

export interface GradeNode {
  id: string;
  type: 'serial' | 'parallel' | 'layer';
  enabled: boolean;
  name: string;
  correction: NodeCorrection;
  inputs: string[];
  output: string;
}

export interface NodeCorrection {
  primary?: Partial<PrimaryCorrection>;
  wheels?: Partial<ColorWheelValues>;
  curves?: Partial<ColorCurves>;
  qualifier?: HSLQualifier;
  window?: PowerWindow;
  blendMode: BlendMode;
  opacity: number;
}

export type BlendMode = 
  | 'normal' | 'add' | 'subtract' | 'multiply' | 'screen'
  | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge'
  | 'color-burn' | 'darken' | 'lighten' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface LUT {
  id: string;
  name: string;
  type: '1D' | '3D';
  size: number;
  data: Float32Array;
}

export interface ColorSpace {
  name: string;
  gamut: 'Rec709' | 'Rec2020' | 'P3' | 'ACES' | 'sRGB';
  gamma: 'linear' | 'sRGB' | 'Rec709' | 'PQ' | 'HLG' | 'Log';
}

export interface ScopeData {
  waveform: ImageData;
  vectorscope: ImageData;
  histogram: { r: number[]; g: number[]; b: number[]; luma: number[] };
  parade: { r: ImageData; g: ImageData; b: ImageData };
}

// =============================================================================
// ITEM 226: COLOR GRADING ENGINE
// =============================================================================

export class ColorGradingEngine {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private grades: Map<string, ColorGrade> = new Map();
  private luts: Map<string, LUT> = new Map();
  private currentColorSpace: ColorSpace;
  private workingColorSpace: ColorSpace;
  
  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
    
    this.currentColorSpace = {
      name: 'Rec.709',
      gamut: 'Rec709',
      gamma: 'Rec709'
    };
    
    this.workingColorSpace = {
      name: 'Linear Rec.709',
      gamut: 'Rec709',
      gamma: 'linear'
    };
  }
  
  resize(width: number, height: number): void {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  // =============================================================================
  // ITEM 227: PRIMARY COLOR CORRECTION
  // =============================================================================
  
  applyPrimaryCorrection(frame: ImageData, correction: PrimaryCorrection): ImageData {
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      
      // Linearize
      r = this.srgbToLinear(r);
      g = this.srgbToLinear(g);
      b = this.srgbToLinear(b);
      
      // Temperature & Tint
      const temp = correction.temperature / 100;
      const tint = correction.tint / 100;
      r += temp * 0.1;
      b -= temp * 0.1;
      g += tint * 0.05;
      r -= tint * 0.025;
      b -= tint * 0.025;
      
      // Exposure
      const exposureFactor = Math.pow(2, correction.exposure);
      r *= exposureFactor;
      g *= exposureFactor;
      b *= exposureFactor;
      
      // Convert to HSL for some adjustments
      let [h, s, l] = this.rgbToHsl(r, g, b);
      
      // Shadows/Highlights
      const shadowFactor = l < 0.25 ? (0.25 - l) / 0.25 : 0;
      const highlightFactor = l > 0.75 ? (l - 0.75) / 0.25 : 0;
      const midFactor = 1 - shadowFactor - highlightFactor;
      
      l += correction.shadows / 200 * shadowFactor;
      l += correction.highlights / 200 * highlightFactor;
      
      // Blacks/Whites
      if (l < 0.1) {
        l += correction.blacks / 500 * (0.1 - l) / 0.1;
      }
      if (l > 0.9) {
        l += correction.whites / 500 * (l - 0.9) / 0.1;
      }
      
      // Contrast
      const pivot = correction.pivot;
      const contrastFactor = (correction.contrast + 100) / 100;
      l = pivot + (l - pivot) * contrastFactor;
      
      // Vibrance (saturation boost for less saturated colors)
      const vibranceFactor = 1 + (correction.vibrance / 100) * (1 - s);
      s *= vibranceFactor;
      
      // Saturation
      s *= correction.saturation / 100;
      
      // Back to RGB
      [r, g, b] = this.hslToRgb(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));
      
      // Gamma encode
      r = this.linearToSrgb(Math.max(0, Math.min(1, r)));
      g = this.linearToSrgb(Math.max(0, Math.min(1, g)));
      b = this.linearToSrgb(Math.max(0, Math.min(1, b)));
      
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
    }
    
    return result;
  }
  
  // =============================================================================
  // ITEM 228: COLOR WHEELS (LIFT/GAMMA/GAIN/OFFSET)
  // =============================================================================
  
  applyColorWheels(frame: ImageData, wheels: ColorWheelValues): ImageData {
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      
      // Linearize
      r = this.srgbToLinear(r);
      g = this.srgbToLinear(g);
      b = this.srgbToLinear(b);
      
      // Offset (add)
      r += (wheels.offset.r + wheels.offset.master) * 0.5;
      g += (wheels.offset.g + wheels.offset.master) * 0.5;
      b += (wheels.offset.b + wheels.offset.master) * 0.5;
      
      // Lift (shadows - affects dark regions more)
      const liftR = 1 + (wheels.lift.r + wheels.lift.master) * 0.5;
      const liftG = 1 + (wheels.lift.g + wheels.lift.master) * 0.5;
      const liftB = 1 + (wheels.lift.b + wheels.lift.master) * 0.5;
      
      r = r * liftR + (1 - r) * (liftR - 1) * (1 - r);
      g = g * liftG + (1 - g) * (liftG - 1) * (1 - g);
      b = b * liftB + (1 - b) * (liftB - 1) * (1 - b);
      
      // Gamma (midtones - power function)
      const gammaR = 1 / (1 + (wheels.gamma.r + wheels.gamma.master) * 0.5);
      const gammaG = 1 / (1 + (wheels.gamma.g + wheels.gamma.master) * 0.5);
      const gammaB = 1 / (1 + (wheels.gamma.b + wheels.gamma.master) * 0.5);
      
      r = Math.pow(Math.max(0, r), gammaR);
      g = Math.pow(Math.max(0, g), gammaG);
      b = Math.pow(Math.max(0, b), gammaB);
      
      // Gain (highlights - multiply)
      const gainR = 1 + (wheels.gain.r + wheels.gain.master) * 0.5;
      const gainG = 1 + (wheels.gain.g + wheels.gain.master) * 0.5;
      const gainB = 1 + (wheels.gain.b + wheels.gain.master) * 0.5;
      
      r *= gainR;
      g *= gainG;
      b *= gainB;
      
      // Gamma encode
      r = this.linearToSrgb(Math.max(0, Math.min(1, r)));
      g = this.linearToSrgb(Math.max(0, Math.min(1, g)));
      b = this.linearToSrgb(Math.max(0, Math.min(1, b)));
      
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
    }
    
    return result;
  }
  
  // =============================================================================
  // ITEM 229: COLOR CURVES
  // =============================================================================
  
  applyCurves(frame: ImageData, curves: ColorCurves): ImageData {
    // Build lookup tables from curves
    const masterLUT = this.buildCurveLUT(curves.master);
    const redLUT = this.buildCurveLUT(curves.red);
    const greenLUT = this.buildCurveLUT(curves.green);
    const blueLUT = this.buildCurveLUT(curves.blue);
    
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    for (let i = 0; i < data.length; i += 4) {
      // Apply individual channel curves then master
      data[i] = masterLUT[redLUT[data[i]]];
      data[i + 1] = masterLUT[greenLUT[data[i + 1]]];
      data[i + 2] = masterLUT[blueLUT[data[i + 2]]];
    }
    
    // Apply HSL curves if present
    if (curves.hue.length > 2 || curves.saturation.length > 2 || curves.luminance.length > 2) {
      this.applyHSLCurves(result, curves);
    }
    
    return result;
  }
  
  private buildCurveLUT(points: CurvePoint[]): Uint8Array {
    const lut = new Uint8Array(256);
    
    if (!points || points.length < 2) {
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }
    
    // Sort by x
    const sorted = [...points].sort((a, b) => a.x - b.x);
    
    // Ensure endpoints
    if (sorted[0].x > 0) sorted.unshift({ x: 0, y: sorted[0].y });
    if (sorted[sorted.length - 1].x < 1) sorted.push({ x: 1, y: sorted[sorted.length - 1].y });
    
    // Cubic spline interpolation
    const splineY = this.cubicSplineInterpolate(sorted);
    
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const y = splineY(x);
      lut[i] = Math.round(Math.max(0, Math.min(255, y * 255)));
    }
    
    return lut;
  }
  
  private cubicSplineInterpolate(points: CurvePoint[]): (x: number) => number {
    const n = points.length;
    
    return (x: number): number => {
      // Find segment
      let i = 0;
      for (let j = 1; j < n; j++) {
        if (x <= points[j].x) {
          i = j - 1;
          break;
        }
      }
      
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(n - 1, i + 1)];
      const p3 = points[Math.min(n - 1, i + 2)];
      
      const t = (x - p1.x) / (p2.x - p1.x || 1);
      const t2 = t * t;
      const t3 = t2 * t;
      
      // Catmull-Rom spline
      return 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
    };
  }
  
  private applyHSLCurves(frame: ImageData, curves: ColorCurves): void {
    const hueLUT = this.buildHueCurveLUT(curves.hue);
    const satLUT = this.buildCurveLUT(curves.saturation);
    const lumLUT = this.buildCurveLUT(curves.luminance);
    
    const { data } = frame;
    
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = this.rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      
      // Apply HSL curves
      const newH = hueLUT[Math.round(h * 255)] / 255;
      const newS = satLUT[Math.round(s * 255)] / 255;
      const newL = lumLUT[Math.round(l * 255)] / 255;
      
      const [r, g, b] = this.hslToRgb(newH, newS, newL);
      
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
    }
  }
  
  private buildHueCurveLUT(points: CurvePoint[]): Uint8Array {
    // Hue is circular, so we need to handle wrapping
    const lut = new Uint8Array(256);
    
    if (!points || points.length < 2) {
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }
    
    // Simple linear interpolation for hue (wrapping)
    const sorted = [...points].sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      let y = x;
      
      for (let j = 0; j < sorted.length - 1; j++) {
        if (x >= sorted[j].x && x <= sorted[j + 1].x) {
          const t = (x - sorted[j].x) / (sorted[j + 1].x - sorted[j].x);
          y = sorted[j].y + (sorted[j + 1].y - sorted[j].y) * t;
          break;
        }
      }
      
      // Handle hue wrapping
      y = ((y % 1) + 1) % 1;
      lut[i] = Math.round(y * 255);
    }
    
    return lut;
  }
  
  // =============================================================================
  // ITEM 230: HSL QUALIFIER (SECONDARY COLOR SELECTION)
  // =============================================================================
  
  applyQualifier(frame: ImageData, qualifier: HSLQualifier): ImageData {
    if (!qualifier.enabled) return frame;
    
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const mask = new Float32Array(frame.width * frame.height);
    
    // Generate qualification mask
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const idx = (y * frame.width + x) * 4;
        const [h, s, l] = this.rgbToHsl(
          frame.data[idx] / 255,
          frame.data[idx + 1] / 255,
          frame.data[idx + 2] / 255
        );
        
        // Calculate qualification for each channel
        const hueQual = this.calculateHueQualification(h, qualifier.hue);
        const satQual = this.calculateRangeQualification(s, qualifier.saturation);
        const lumQual = this.calculateRangeQualification(l, qualifier.luminance);
        
        // Combine qualifications
        let qual = hueQual * satQual * lumQual;
        
        if (qualifier.invert) qual = 1 - qual;
        
        mask[y * frame.width + x] = qual;
      }
    }
    
    // Apply denoise to mask
    if (qualifier.denoise > 0) {
      this.denoiseMask(mask, frame.width, frame.height, qualifier.denoise);
    }
    
    // Apply blur to mask
    if (qualifier.blur > 0) {
      this.blurMask(mask, frame.width, frame.height, qualifier.blur);
    }
    
    // Apply mask to alpha channel
    for (let i = 0; i < mask.length; i++) {
      result.data[i * 4 + 3] = Math.round(mask[i] * 255);
    }
    
    return result;
  }
  
  private calculateHueQualification(hue: number, config: { center: number; range: number; softness: number }): number {
    const center = config.center;
    const range = config.range / 2;
    const softness = config.softness;
    
    // Calculate circular distance
    let dist = Math.abs(hue - center);
    if (dist > 0.5) dist = 1 - dist;
    
    if (dist <= range) return 1;
    if (dist >= range + softness) return 0;
    
    return 1 - (dist - range) / softness;
  }
  
  private calculateRangeQualification(value: number, config: { low: number; high: number; softness: number }): number {
    const low = config.low;
    const high = config.high;
    const softness = config.softness;
    
    if (value >= low && value <= high) return 1;
    if (value < low - softness || value > high + softness) return 0;
    
    if (value < low) {
      return 1 - (low - value) / softness;
    } else {
      return 1 - (value - high) / softness;
    }
  }
  
  private denoiseMask(mask: Float32Array, width: number, height: number, amount: number): void {
    // Simple median filter for noise reduction
    const radius = Math.ceil(amount / 20);
    const temp = new Float32Array(mask);
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const values: number[] = [];
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            values.push(temp[(y + dy) * width + (x + dx)]);
          }
        }
        
        values.sort((a, b) => a - b);
        mask[y * width + x] = values[Math.floor(values.length / 2)];
      }
    }
  }
  
  private blurMask(mask: Float32Array, width: number, height: number, amount: number): void {
    // Gaussian blur
    const radius = Math.ceil(amount);
    const kernel = this.createGaussianKernel(radius);
    const temp = new Float32Array(mask);
    
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weight = 0;
        
        for (let k = -radius; k <= radius; k++) {
          const kx = Math.min(width - 1, Math.max(0, x + k));
          sum += temp[y * width + kx] * kernel[k + radius];
          weight += kernel[k + radius];
        }
        
        mask[y * width + x] = sum / weight;
      }
    }
    
    // Vertical pass
    temp.set(mask);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weight = 0;
        
        for (let k = -radius; k <= radius; k++) {
          const ky = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[ky * width + x] * kernel[k + radius];
          weight += kernel[k + radius];
        }
        
        mask[y * width + x] = sum / weight;
      }
    }
  }
  
  private createGaussianKernel(radius: number): Float32Array {
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size);
    const sigma = radius / 2;
    
    for (let i = 0; i < size; i++) {
      const x = i - radius;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    }
    
    return kernel;
  }
  
  // =============================================================================
  // ITEM 231: POWER WINDOWS
  // =============================================================================
  
  applyPowerWindow(frame: ImageData, window: PowerWindow): ImageData {
    if (!window.enabled) return frame;
    
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data, width, height } = result;
    
    const cx = window.position.x * width;
    const cy = window.position.y * height;
    const w = window.size.width * width / 2;
    const h = window.size.height * height / 2;
    const rotation = window.rotation * Math.PI / 180;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Transform point relative to window center
        const dx = x - cx;
        const dy = y - cy;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        
        let inside: number;
        
        switch (window.type) {
          case 'circle':
            const dist = Math.sqrt((rx / w) ** 2 + (ry / h) ** 2);
            inside = this.calculateWindowFalloff(dist, window);
            break;
            
          case 'rectangle':
            const distX = Math.abs(rx) / w;
            const distY = Math.abs(ry) / h;
            inside = this.calculateWindowFalloff(Math.max(distX, distY), window);
            break;
            
          case 'gradient':
            inside = this.calculateWindowFalloff((ry / h + 1) / 2, window);
            break;
            
          case 'polygon':
            inside = this.pointInPolygon(x / width, y / height, window.points || []) ? 1 : 0;
            break;
            
          default:
            inside = 1;
        }
        
        if (window.inverted) inside = 1 - inside;
        inside *= window.opacity;
        
        const idx = (y * width + x) * 4;
        data[idx + 3] = Math.round(data[idx + 3] * inside);
      }
    }
    
    return result;
  }
  
  private calculateWindowFalloff(distance: number, window: PowerWindow): number {
    const inner = 1 - window.feather.inner;
    const outer = 1 + window.feather.outer;
    
    if (distance <= inner) return 1;
    if (distance >= outer) return 0;
    
    const t = (distance - inner) / (outer - inner);
    return Math.pow(1 - t, window.softness + 1);
  }
  
  private pointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
    if (points.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (((points[i].y > y) !== (points[j].y > y)) &&
          (x < (points[j].x - points[i].x) * (y - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
  
  // =============================================================================
  // ITEM 232: NODE-BASED GRADING
  // =============================================================================
  
  createGrade(): ColorGrade {
    const id = this.generateId();
    
    const grade: ColorGrade = {
      id,
      name: 'Grade ' + (this.grades.size + 1),
      primary: this.createDefaultPrimary(),
      wheels: this.createDefaultWheels(),
      curves: this.createDefaultCurves(),
      nodes: [{
        id: this.generateId(),
        type: 'serial',
        enabled: true,
        name: 'Node 1',
        correction: {
          blendMode: 'normal',
          opacity: 1
        },
        inputs: [],
        output: 'output'
      }]
    };
    
    this.grades.set(id, grade);
    return grade;
  }
  
  addNode(gradeId: string, type: GradeNode['type']): GradeNode | null {
    const grade = this.grades.get(gradeId);
    if (!grade) return null;
    
    const node: GradeNode = {
      id: this.generateId(),
      type,
      enabled: true,
      name: `Node ${grade.nodes.length + 1}`,
      correction: {
        blendMode: 'normal',
        opacity: 1
      },
      inputs: [],
      output: ''
    };
    
    grade.nodes.push(node);
    return node;
  }
  
  connectNodes(gradeId: string, sourceNodeId: string, targetNodeId: string): void {
    const grade = this.grades.get(gradeId);
    if (!grade) return;
    
    const targetNode = grade.nodes.find(n => n.id === targetNodeId);
    if (targetNode) {
      targetNode.inputs.push(sourceNodeId);
    }
  }
  
  applyGrade(frame: ImageData, gradeId: string): ImageData {
    const grade = this.grades.get(gradeId);
    if (!grade) return frame;
    
    let result = frame;
    
    // Apply each enabled node in order
    for (const node of grade.nodes) {
      if (!node.enabled) continue;
      result = this.applyNode(result, node, grade);
    }
    
    return result;
  }
  
  private applyNode(frame: ImageData, node: GradeNode, grade: ColorGrade): ImageData {
    let result = frame;
    
    // Apply node corrections
    if (node.correction.primary) {
      const primary = { ...grade.primary, ...node.correction.primary };
      result = this.applyPrimaryCorrection(result, primary);
    }
    
    if (node.correction.wheels) {
      const wheels = { ...grade.wheels, ...node.correction.wheels };
      result = this.applyColorWheels(result, wheels);
    }
    
    if (node.correction.curves) {
      const curves = { ...grade.curves, ...node.correction.curves };
      result = this.applyCurves(result, curves);
    }
    
    if (node.correction.qualifier) {
      result = this.applyQualifier(result, node.correction.qualifier);
    }
    
    if (node.correction.window) {
      result = this.applyPowerWindow(result, node.correction.window);
    }
    
    return result;
  }
  
  // =============================================================================
  // ITEM 233: LUT SUPPORT
  // =============================================================================
  
  loadLUT(name: string, data: string, type: '1D' | '3D' = '3D'): LUT {
    const id = this.generateId();
    
    // Parse .cube file format
    const lines = data.split('\n');
    let size = 0;
    const values: number[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') continue;
      
      if (trimmed.startsWith('LUT_3D_SIZE') || trimmed.startsWith('LUT_1D_SIZE')) {
        size = parseInt(trimmed.split(/\s+/)[1]);
        continue;
      }
      
      if (trimmed.startsWith('TITLE') || trimmed.startsWith('DOMAIN')) continue;
      
      const parts = trimmed.split(/\s+/).map(parseFloat);
      if (parts.length >= 3) {
        values.push(parts[0], parts[1], parts[2]);
      }
    }
    
    const lut: LUT = {
      id,
      name,
      type,
      size,
      data: new Float32Array(values)
    };
    
    this.luts.set(id, lut);
    return lut;
  }
  
  applyLUT(frame: ImageData, lutId: string): ImageData {
    const lut = this.luts.get(lutId);
    if (!lut) return frame;
    
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    if (lut.type === '1D') {
      this.apply1DLUT(data, lut);
    } else {
      this.apply3DLUT(data, lut);
    }
    
    return result;
  }
  
  private apply1DLUT(data: Uint8ClampedArray, lut: LUT): void {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      const ri = Math.min(lut.size - 1, Math.floor(r * (lut.size - 1)));
      const gi = Math.min(lut.size - 1, Math.floor(g * (lut.size - 1)));
      const bi = Math.min(lut.size - 1, Math.floor(b * (lut.size - 1)));
      
      data[i] = Math.round(lut.data[ri * 3] * 255);
      data[i + 1] = Math.round(lut.data[gi * 3 + 1] * 255);
      data[i + 2] = Math.round(lut.data[bi * 3 + 2] * 255);
    }
  }
  
  private apply3DLUT(data: Uint8ClampedArray, lut: LUT): void {
    const size = lut.size;
    const sizem1 = size - 1;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255 * sizem1;
      const g = data[i + 1] / 255 * sizem1;
      const b = data[i + 2] / 255 * sizem1;
      
      // Trilinear interpolation
      const r0 = Math.floor(r), r1 = Math.min(sizem1, r0 + 1);
      const g0 = Math.floor(g), g1 = Math.min(sizem1, g0 + 1);
      const b0 = Math.floor(b), b1 = Math.min(sizem1, b0 + 1);
      
      const fr = r - r0;
      const fg = g - g0;
      const fb = b - b0;
      
      const idx = (bi: number, gi: number, ri: number) => 
        ((bi * size + gi) * size + ri) * 3;
      
      const interp = (channel: number): number => {
        const c000 = lut.data[idx(b0, g0, r0) + channel];
        const c100 = lut.data[idx(b0, g0, r1) + channel];
        const c010 = lut.data[idx(b0, g1, r0) + channel];
        const c110 = lut.data[idx(b0, g1, r1) + channel];
        const c001 = lut.data[idx(b1, g0, r0) + channel];
        const c101 = lut.data[idx(b1, g0, r1) + channel];
        const c011 = lut.data[idx(b1, g1, r0) + channel];
        const c111 = lut.data[idx(b1, g1, r1) + channel];
        
        const c00 = c000 * (1 - fr) + c100 * fr;
        const c01 = c001 * (1 - fr) + c101 * fr;
        const c10 = c010 * (1 - fr) + c110 * fr;
        const c11 = c011 * (1 - fr) + c111 * fr;
        
        const c0 = c00 * (1 - fg) + c10 * fg;
        const c1 = c01 * (1 - fg) + c11 * fg;
        
        return c0 * (1 - fb) + c1 * fb;
      };
      
      data[i] = Math.round(Math.max(0, Math.min(1, interp(0))) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, interp(1))) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, interp(2))) * 255);
    }
  }
  
  // =============================================================================
  // ITEM 234: COLOR SPACE TRANSFORMS
  // =============================================================================
  
  transformColorSpace(frame: ImageData, source: ColorSpace, target: ColorSpace): ImageData {
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      
      // Decode source gamma
      [r, g, b] = this.decodeGamma([r, g, b], source.gamma);
      
      // Convert gamut if different
      if (source.gamut !== target.gamut) {
        [r, g, b] = this.convertGamut([r, g, b], source.gamut, target.gamut);
      }
      
      // Encode target gamma
      [r, g, b] = this.encodeGamma([r, g, b], target.gamma);
      
      data[i] = Math.round(Math.max(0, Math.min(1, r)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
    }
    
    return result;
  }
  
  private decodeGamma(rgb: number[], gamma: ColorSpace['gamma']): number[] {
    const decode = (v: number): number => {
      switch (gamma) {
        case 'linear':
          return v;
        case 'sRGB':
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        case 'Rec709':
          return v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45);
        case 'PQ':
          // Simplified PQ EOTF
          const m1 = 0.1593017578125;
          const m2 = 78.84375;
          const c1 = 0.8359375;
          const c2 = 18.8515625;
          const c3 = 18.6875;
          const Vm = Math.pow(v, 1 / m2);
          return Math.pow(Math.max(Vm - c1, 0) / (c2 - c3 * Vm), 1 / m1) * 10000;
        case 'HLG':
          const a = 0.17883277;
          const b = 0.28466892;
          const c = 0.55991073;
          return v <= 0.5 ? v * v / 3 : (Math.exp((v - c) / a) + b) / 12;
        case 'Log':
          return Math.pow(10, (v - 0.4) / 0.4) - 0.01;
        default:
          return v;
      }
    };
    
    return rgb.map(decode);
  }
  
  private encodeGamma(rgb: number[], gamma: ColorSpace['gamma']): number[] {
    const encode = (v: number): number => {
      switch (gamma) {
        case 'linear':
          return v;
        case 'sRGB':
          return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        case 'Rec709':
          return v < 0.018 ? v * 4.5 : 1.099 * Math.pow(v, 0.45) - 0.099;
        case 'Log':
          return 0.4 * Math.log10(v + 0.01) + 0.4;
        default:
          return v;
      }
    };
    
    return rgb.map(encode);
  }
  
  private convertGamut(rgb: number[], source: string, target: string): number[] {
    // Simplified gamut conversion via XYZ
    // Real implementation would use proper 3x3 matrices
    return rgb; // Placeholder - would implement full matrix transforms
  }
  
  // =============================================================================
  // ITEM 235: SCOPES (WAVEFORM, VECTORSCOPE, HISTOGRAM)
  // =============================================================================
  
  generateScopes(frame: ImageData): ScopeData {
    return {
      waveform: this.generateWaveform(frame),
      vectorscope: this.generateVectorscope(frame),
      histogram: this.generateHistogram(frame),
      parade: this.generateParade(frame)
    };
  }
  
  private generateWaveform(frame: ImageData): ImageData {
    const width = 256;
    const height = 256;
    const scope = new ImageData(width, height);
    const { data: srcData, width: srcWidth, height: srcHeight } = frame;
    const { data: dstData } = scope;
    
    // Initialize to black
    dstData.fill(0);
    for (let i = 3; i < dstData.length; i += 4) {
      dstData[i] = 255;
    }
    
    // Plot luma values
    for (let y = 0; y < srcHeight; y++) {
      for (let x = 0; x < srcWidth; x++) {
        const idx = (y * srcWidth + x) * 4;
        const luma = srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114;
        
        const scopeX = Math.floor(x / srcWidth * width);
        const scopeY = height - 1 - Math.floor(luma / 255 * (height - 1));
        const scopeIdx = (scopeY * width + scopeX) * 4;
        
        dstData[scopeIdx] = Math.min(255, dstData[scopeIdx] + 15);
        dstData[scopeIdx + 1] = Math.min(255, dstData[scopeIdx + 1] + 15);
        dstData[scopeIdx + 2] = Math.min(255, dstData[scopeIdx + 2] + 15);
      }
    }
    
    return scope;
  }
  
  private generateVectorscope(frame: ImageData): ImageData {
    const size = 256;
    const scope = new ImageData(size, size);
    const { data: srcData, width, height } = frame;
    const { data: dstData } = scope;
    
    // Initialize with dark background
    for (let i = 0; i < dstData.length; i += 4) {
      dstData[i] = dstData[i + 1] = dstData[i + 2] = 20;
      dstData[i + 3] = 255;
    }
    
    // Draw crosshairs
    const center = size / 2;
    for (let i = 0; i < size; i++) {
      const idx1 = (center * size + i) * 4;
      const idx2 = (i * size + center) * 4;
      dstData[idx1] = dstData[idx1 + 1] = dstData[idx1 + 2] = 40;
      dstData[idx2] = dstData[idx2 + 1] = dstData[idx2 + 2] = 40;
    }
    
    // Plot color vectors
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = srcData[idx] / 255;
        const g = srcData[idx + 1] / 255;
        const b = srcData[idx + 2] / 255;
        
        // RGB to YUV
        const cb = -0.169 * r - 0.331 * g + 0.5 * b;
        const cr = 0.5 * r - 0.419 * g - 0.081 * b;
        
        const scopeX = Math.floor(center + cb * size * 0.9);
        const scopeY = Math.floor(center - cr * size * 0.9);
        
        if (scopeX >= 0 && scopeX < size && scopeY >= 0 && scopeY < size) {
          const scopeIdx = (scopeY * size + scopeX) * 4;
          dstData[scopeIdx] = Math.min(255, dstData[scopeIdx] + 20);
          dstData[scopeIdx + 1] = Math.min(255, dstData[scopeIdx + 1] + 20);
          dstData[scopeIdx + 2] = Math.min(255, dstData[scopeIdx + 2] + 20);
        }
      }
    }
    
    return scope;
  }
  
  private generateHistogram(frame: ImageData): { r: number[]; g: number[]; b: number[]; luma: number[] } {
    const r = new Array(256).fill(0);
    const g = new Array(256).fill(0);
    const b = new Array(256).fill(0);
    const luma = new Array(256).fill(0);
    
    const { data, width, height } = frame;
    const total = width * height;
    
    for (let i = 0; i < data.length; i += 4) {
      r[data[i]]++;
      g[data[i + 1]]++;
      b[data[i + 2]]++;
      
      const l = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      luma[l]++;
    }
    
    // Normalize
    const normalize = (arr: number[]): number[] => {
      const max = Math.max(...arr);
      return arr.map(v => v / max);
    };
    
    return {
      r: normalize(r),
      g: normalize(g),
      b: normalize(b),
      luma: normalize(luma)
    };
  }
  
  private generateParade(frame: ImageData): { r: ImageData; g: ImageData; b: ImageData } {
    const width = 256;
    const height = 256;
    const { data: srcData, width: srcWidth, height: srcHeight } = frame;
    
    const createChannel = (channelIdx: number): ImageData => {
      const scope = new ImageData(width, height);
      const { data: dstData } = scope;
      
      dstData.fill(0);
      for (let i = 3; i < dstData.length; i += 4) {
        dstData[i] = 255;
      }
      
      for (let y = 0; y < srcHeight; y++) {
        for (let x = 0; x < srcWidth; x++) {
          const idx = (y * srcWidth + x) * 4;
          const value = srcData[idx + channelIdx];
          
          const scopeX = Math.floor(x / srcWidth * width);
          const scopeY = height - 1 - Math.floor(value / 255 * (height - 1));
          const scopeIdx = (scopeY * width + scopeX) * 4;
          
          dstData[scopeIdx + channelIdx] = Math.min(255, dstData[scopeIdx + channelIdx] + 20);
        }
      }
      
      return scope;
    };
    
    return {
      r: createChannel(0),
      g: createChannel(1),
      b: createChannel(2)
    };
  }
  
  // =============================================================================
  // ITEM 236-240: FILM EMULATION
  // =============================================================================
  
  applyFilmEmulation(frame: ImageData, stock: string): ImageData {
    const filmStocks: Record<string, (frame: ImageData) => ImageData> = {
      'kodak-5219': this.kodak5219.bind(this),
      'kodak-5207': this.kodak5207.bind(this),
      'fuji-3510': this.fuji3510.bind(this),
      'arri-logc': this.arriLogC.bind(this),
      'red-logfilm': this.redLogFilm.bind(this)
    };
    
    const emulation = filmStocks[stock];
    return emulation ? emulation(frame) : frame;
  }
  
  private kodak5219(frame: ImageData): ImageData {
    // Kodak Vision3 500T emulation
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    
    // Apply characteristic curve, slight warm tone, reduced saturation in shadows
    this.applyFilmCurve(result, [
      { x: 0, y: 0.02 },
      { x: 0.18, y: 0.18 },
      { x: 0.5, y: 0.52 },
      { x: 1, y: 0.98 }
    ]);
    
    // Warm shadows, cool highlights
    this.applyColorWheels(result, {
      lift: { r: 0.02, g: 0, b: -0.02, master: 0 },
      gamma: { r: 0, g: 0, b: 0, master: 0 },
      gain: { r: -0.01, g: 0, b: 0.02, master: 0 },
      offset: { r: 0, g: 0, b: 0, master: 0 }
    });
    
    return result;
  }
  
  private kodak5207(frame: ImageData): ImageData {
    // Kodak Vision3 250D emulation
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    
    this.applyFilmCurve(result, [
      { x: 0, y: 0.01 },
      { x: 0.18, y: 0.17 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.99 }
    ]);
    
    // Slightly cooler, higher contrast
    this.applyPrimaryCorrection(result, {
      ...this.createDefaultPrimary(),
      contrast: 5,
      temperature: -3
    });
    
    return result;
  }
  
  private fuji3510(frame: ImageData): ImageData {
    // Fuji Eterna emulation
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    
    // Lower contrast, slight green in midtones
    this.applyColorWheels(result, {
      lift: { r: 0, g: 0.01, b: 0, master: 0.01 },
      gamma: { r: -0.01, g: 0.02, b: -0.01, master: 0 },
      gain: { r: 0, g: 0, b: 0, master: 0 },
      offset: { r: 0, g: 0, b: 0, master: 0 }
    });
    
    return result;
  }
  
  private arriLogC(frame: ImageData): ImageData {
    // ARRI LogC to Rec.709 transform
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data } = result;
    
    // LogC constants
    const a = 5.555556;
    const b = 0.052272;
    const c = 0.247190;
    const d = 0.385537;
    const e = 5.367655;
    const f = 0.092809;
    const cut = 0.010591;
    const ec = e * cut + f;
    
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let v = data[i + ch] / 255;
        
        // LogC to linear
        if (v > ec) {
          v = (Math.pow(10, (v - d) / c) - b) / a;
        } else {
          v = (v - f) / e;
        }
        
        // Linear to sRGB
        v = this.linearToSrgb(Math.max(0, Math.min(1, v)));
        data[i + ch] = Math.round(v * 255);
      }
    }
    
    return result;
  }
  
  private redLogFilm(frame: ImageData): ImageData {
    // RED Log Film to Rec.709
    return this.arriLogC(frame); // Similar transform
  }
  
  private applyFilmCurve(frame: ImageData, points: CurvePoint[]): void {
    const lut = this.buildCurveLUT(points);
    const { data } = frame;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
  }
  
  // =============================================================================
  // ITEM 241-245: SKIN TONE TOOLS
  // =============================================================================
  
  detectSkinTones(frame: ImageData): Float32Array {
    const mask = new Float32Array(frame.width * frame.height);
    const { data, width, height } = frame;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Multiple skin detection methods combined
        const isSkin = this.isSkinToneRGB(r, g, b) &&
                       this.isSkinToneYCbCr(r, g, b) &&
                       this.isSkinToneHSV(r, g, b);
        
        mask[y * width + x] = isSkin ? 1 : 0;
      }
    }
    
    // Smooth mask
    this.blurMask(mask, width, height, 2);
    
    return mask;
  }
  
  private isSkinToneRGB(r: number, g: number, b: number): boolean {
    return r > 95 && g > 40 && b > 20 &&
           Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
           Math.abs(r - g) > 15 && r > g && r > b;
  }
  
  private isSkinToneYCbCr(r: number, g: number, b: number): boolean {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    
    return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
  }
  
  private isSkinToneHSV(r: number, g: number, b: number): boolean {
    const [h, s] = this.rgbToHsl(r / 255, g / 255, b / 255);
    return h >= 0 && h <= 0.1 && s >= 0.2 && s <= 0.6;
  }
  
  adjustSkinTones(
    frame: ImageData,
    mask: Float32Array,
    adjustment: { hue: number; saturation: number; luminance: number }
  ): ImageData {
    const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
    const { data, width, height } = result;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const skinAmount = mask[y * width + x];
        
        if (skinAmount < 0.01) continue;
        
        let [h, s, l] = this.rgbToHsl(
          data[idx] / 255,
          data[idx + 1] / 255,
          data[idx + 2] / 255
        );
        
        // Apply adjustments weighted by skin mask
        h = (h + adjustment.hue / 360 * skinAmount + 1) % 1;
        s = Math.max(0, Math.min(1, s * (1 + adjustment.saturation / 100 * skinAmount)));
        l = Math.max(0, Math.min(1, l + adjustment.luminance / 200 * skinAmount));
        
        const [r, g, b] = this.hslToRgb(h, s, l);
        
        data[idx] = Math.round(r * 255);
        data[idx + 1] = Math.round(g * 255);
        data[idx + 2] = Math.round(b * 255);
      }
    }
    
    return result;
  }
  
  // =============================================================================
  // ITEM 246-250: UTILITY & PRESETS
  // =============================================================================
  
  createPreset(name: string, grade: ColorGrade): { name: string; data: string } {
    return {
      name,
      data: JSON.stringify(grade)
    };
  }
  
  loadPreset(data: string): ColorGrade | null {
    try {
      const grade = JSON.parse(data) as ColorGrade;
      grade.id = this.generateId();
      this.grades.set(grade.id, grade);
      return grade;
    } catch {
      return null;
    }
  }
  
  matchColor(source: ImageData, target: ImageData): PrimaryCorrection {
    // Calculate statistics for both images
    const sourceStats = this.calculateColorStats(source);
    const targetStats = this.calculateColorStats(target);
    
    // Calculate correction needed
    return {
      temperature: (targetStats.avgTemp - sourceStats.avgTemp) * 50,
      tint: (targetStats.avgTint - sourceStats.avgTint) * 50,
      contrast: (targetStats.contrast - sourceStats.contrast) * 100,
      pivot: 0.5,
      saturation: (targetStats.saturation / sourceStats.saturation) * 100,
      vibrance: 0,
      highlights: (targetStats.avgHighlight - sourceStats.avgHighlight) * 100,
      shadows: (targetStats.avgShadow - sourceStats.avgShadow) * 100,
      whites: 0,
      blacks: 0,
      exposure: Math.log2(targetStats.avgLuma / sourceStats.avgLuma)
    };
  }
  
  private calculateColorStats(frame: ImageData) {
    const { data } = frame;
    let sumR = 0, sumG = 0, sumB = 0;
    let sumLuma = 0, sumSat = 0;
    let minLuma = 1, maxLuma = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      sumR += r;
      sumG += g;
      sumB += b;
      
      const [h, s, l] = this.rgbToHsl(r, g, b);
      sumLuma += l;
      sumSat += s;
      minLuma = Math.min(minLuma, l);
      maxLuma = Math.max(maxLuma, l);
    }
    
    const count = data.length / 4;
    
    return {
      avgR: sumR / count,
      avgG: sumG / count,
      avgB: sumB / count,
      avgLuma: sumLuma / count,
      avgTemp: (sumR / count - sumB / count),
      avgTint: (sumG / count - (sumR / count + sumB / count) / 2),
      saturation: sumSat / count,
      contrast: maxLuma - minLuma,
      avgShadow: minLuma,
      avgHighlight: maxLuma
    };
  }
  
  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private createDefaultPrimary(): PrimaryCorrection {
    return {
      temperature: 0,
      tint: 0,
      contrast: 0,
      pivot: 0.5,
      saturation: 100,
      vibrance: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      exposure: 0
    };
  }
  
  private createDefaultWheels(): ColorWheelValues {
    return {
      lift: { r: 0, g: 0, b: 0, master: 0 },
      gamma: { r: 0, g: 0, b: 0, master: 0 },
      gain: { r: 0, g: 0, b: 0, master: 0 },
      offset: { r: 0, g: 0, b: 0, master: 0 }
    };
  }
  
  private createDefaultCurves(): ColorCurves {
    return {
      master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      hue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      saturation: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      luminance: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    };
  }
  
  private srgbToLinear(v: number): number {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  
  private linearToSrgb(v: number): number {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }
  
  private rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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
  
  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) return [l, l, l];
    
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    return [
      hue2rgb(p, q, h + 1/3),
      hue2rgb(p, q, h),
      hue2rgb(p, q, h - 1/3)
    ];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createColorGradingEngine = (width: number, height: number) =>
  new ColorGradingEngine(width, height);

export default ColorGradingEngine;
