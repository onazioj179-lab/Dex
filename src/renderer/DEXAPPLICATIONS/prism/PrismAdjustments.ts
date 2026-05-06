// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - PRISM Advanced Adjustments System
// Professional image adjustments rivaling Lightroom/Capture One
// Items 76-100 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface AdjustmentResult {
  imageData: ImageData;
  histogram?: HistogramData;
  stats?: ImageStats;
}

export interface HistogramData {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luminance: Uint32Array;
}

export interface ImageStats {
  mean: { r: number; g: number; b: number; l: number };
  stdDev: { r: number; g: number; b: number; l: number };
  min: { r: number; g: number; b: number };
  max: { r: number; g: number; b: number };
  clipping: { shadows: number; highlights: number };
}

// =============================================================================
// ITEM 76: BRIGHTNESS/CONTRAST
// =============================================================================

export function adjustBrightnessContrast(
  imageData: ImageData,
  brightness: number,    // -100 to 100
  contrast: number,      // -100 to 100
  useLegacy: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  if (useLegacy) {
    // Legacy linear adjustment
    const brightnessOffset = brightness * 2.55;
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(contrastFactor * (data[i] + brightnessOffset - 128) + 128);
      data[i + 1] = clamp(contrastFactor * (data[i + 1] + brightnessOffset - 128) + 128);
      data[i + 2] = clamp(contrastFactor * (data[i + 2] + brightnessOffset - 128) + 128);
    }
  } else {
    // Modern perceptual adjustment
    const brightnessPow = brightness > 0 
      ? 1 - brightness / 100 * 0.5 
      : 1 + brightness / 100 * 0.5;
    
    const contrastPow = contrast > 0
      ? 1 + contrast / 100
      : 1 / (1 - contrast / 100);
    
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let val = data[i + c] / 255;
        
        // Apply brightness
        val = Math.pow(val, brightnessPow);
        
        // Apply contrast
        val = Math.pow(val, 1 / contrastPow);
        val = (val - 0.5) * contrastPow + 0.5;
        
        data[i + c] = clamp(val * 255);
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 77: LEVELS
// =============================================================================

export function adjustLevels(
  imageData: ImageData,
  inputBlack: number,      // 0-255
  inputGamma: number,      // 0.1-10
  inputWhite: number,      // 0-255
  outputBlack: number,     // 0-255
  outputWhite: number,     // 0-255
  channel: 'rgb' | 'red' | 'green' | 'blue' = 'rgb'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Build lookup table
  const lut = new Uint8Array(256);
  const inputRange = inputWhite - inputBlack;
  const outputRange = outputWhite - outputBlack;
  
  for (let i = 0; i < 256; i++) {
    let val = (i - inputBlack) / inputRange;
    val = Math.max(0, Math.min(1, val));
    val = Math.pow(val, 1 / inputGamma);
    val = val * outputRange + outputBlack;
    lut[i] = Math.round(Math.max(0, Math.min(255, val)));
  }
  
  // Apply lookup table
  for (let i = 0; i < data.length; i += 4) {
    if (channel === 'rgb' || channel === 'red') {
      data[i] = lut[data[i]];
    }
    if (channel === 'rgb' || channel === 'green') {
      data[i + 1] = lut[data[i + 1]];
    }
    if (channel === 'rgb' || channel === 'blue') {
      data[i + 2] = lut[data[i + 2]];
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 78: CURVES
// =============================================================================

export function adjustCurves(
  imageData: ImageData,
  curvePoints: { input: number; output: number }[],
  channel: 'rgb' | 'red' | 'green' | 'blue' = 'rgb'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Build spline curve lookup table
  const lut = buildSplineLUT(curvePoints);
  
  // Apply lookup table
  for (let i = 0; i < data.length; i += 4) {
    if (channel === 'rgb' || channel === 'red') {
      data[i] = lut[data[i]];
    }
    if (channel === 'rgb' || channel === 'green') {
      data[i + 1] = lut[data[i + 1]];
    }
    if (channel === 'rgb' || channel === 'blue') {
      data[i + 2] = lut[data[i + 2]];
    }
  }
  
  return result;
}

function buildSplineLUT(points: { input: number; output: number }[]): Uint8Array {
  const lut = new Uint8Array(256);
  
  // Sort points by input
  const sorted = [...points].sort((a, b) => a.input - b.input);
  
  // Ensure endpoints
  if (sorted.length === 0 || sorted[0].input > 0) {
    sorted.unshift({ input: 0, output: 0 });
  }
  if (sorted[sorted.length - 1].input < 255) {
    sorted.push({ input: 255, output: 255 });
  }
  
  // Cubic spline interpolation
  const n = sorted.length - 1;
  const h: number[] = [];
  const alpha: number[] = [];
  const l: number[] = [1];
  const mu: number[] = [0];
  const z: number[] = [0];
  
  for (let i = 0; i < n; i++) {
    h[i] = sorted[i + 1].input - sorted[i].input;
  }
  
  for (let i = 1; i < n; i++) {
    alpha[i] = (3 / h[i]) * (sorted[i + 1].output - sorted[i].output) -
               (3 / h[i - 1]) * (sorted[i].output - sorted[i - 1].output);
  }
  
  for (let i = 1; i < n; i++) {
    l[i] = 2 * (sorted[i + 1].input - sorted[i - 1].input) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  
  const c: number[] = new Array(n + 1).fill(0);
  const b: number[] = new Array(n).fill(0);
  const d: number[] = new Array(n).fill(0);
  
  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (sorted[j + 1].output - sorted[j].output) / h[j] -
           h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  
  // Generate LUT
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < n - 1 && x > sorted[seg + 1].input) {
      seg++;
    }
    
    const dx = x - sorted[seg].input;
    const y = sorted[seg].output + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
    lut[x] = Math.round(Math.max(0, Math.min(255, y)));
  }
  
  return lut;
}

// =============================================================================
// ITEM 79: EXPOSURE
// =============================================================================

export function adjustExposure(
  imageData: ImageData,
  exposure: number,    // -5 to +5 EV
  offset: number,      // -0.5 to +0.5
  gamma: number        // 0.01 to 9.99
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const exposureFactor = Math.pow(2, exposure);
  
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = data[i + c] / 255;
      
      // Apply exposure
      val *= exposureFactor;
      
      // Apply offset
      val += offset;
      
      // Apply gamma
      if (val > 0) {
        val = Math.pow(val, 1 / gamma);
      }
      
      data[i + c] = clamp(val * 255);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 80: VIBRANCE
// =============================================================================

export function adjustVibrance(
  imageData: ImageData,
  vibrance: number,     // -100 to 100
  saturation: number    // -100 to 100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const vibranceFactor = vibrance / 100;
  const saturationFactor = 1 + saturation / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Calculate saturation level
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const satLevel = maxC === 0 ? 0 : (maxC - minC) / maxC;
    
    // Vibrance affects less-saturated colors more
    const vibranceAmount = vibranceFactor * (1 - satLevel);
    
    // Calculate gray value
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Apply saturation and vibrance
    const totalSat = saturationFactor + vibranceAmount;
    
    data[i] = clamp(gray + (r - gray) * totalSat);
    data[i + 1] = clamp(gray + (g - gray) * totalSat);
    data[i + 2] = clamp(gray + (b - gray) * totalSat);
  }
  
  return result;
}

// =============================================================================
// ITEM 81: HUE/SATURATION
// =============================================================================

export function adjustHueSaturation(
  imageData: ImageData,
  hue: number,           // -180 to 180
  saturation: number,    // -100 to 100
  lightness: number,     // -100 to 100
  colorize: boolean = false,
  colorizeHue: number = 0,
  colorizeSat: number = 25
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const hueShift = hue / 360;
  const satFactor = 1 + saturation / 100;
  const lightFactor = lightness / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    let { h, s, l } = rgbToHsl(r, g, b);
    
    if (colorize) {
      h = colorizeHue / 360;
      s = colorizeSat / 100;
    } else {
      h = (h + hueShift + 1) % 1;
      s = Math.max(0, Math.min(1, s * satFactor));
    }
    
    // Apply lightness
    if (lightFactor > 0) {
      l = l + (1 - l) * lightFactor;
    } else {
      l = l * (1 + lightFactor);
    }
    
    const { r: nr, g: ng, b: nb } = hslToRgb(h, s, l);
    
    data[i] = Math.round(nr * 255);
    data[i + 1] = Math.round(ng * 255);
    data[i + 2] = Math.round(nb * 255);
  }
  
  return result;
}

// =============================================================================
// ITEM 82: COLOR BALANCE
// =============================================================================

export function adjustColorBalance(
  imageData: ImageData,
  shadows: { cyan: number; magenta: number; yellow: number },
  midtones: { cyan: number; magenta: number; yellow: number },
  highlights: { cyan: number; magenta: number; yellow: number },
  preserveLuminosity: boolean = true
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Calculate tonal ranges
    const shadowWeight = Math.max(0, 1 - lum / 128);
    const highlightWeight = Math.max(0, (lum - 128) / 127);
    const midtoneWeight = 1 - shadowWeight - highlightWeight;
    
    // Apply color balance
    const redShift = 
      shadows.cyan * shadowWeight + 
      midtones.cyan * midtoneWeight + 
      highlights.cyan * highlightWeight;
    const greenShift = 
      shadows.magenta * shadowWeight + 
      midtones.magenta * midtoneWeight + 
      highlights.magenta * highlightWeight;
    const blueShift = 
      shadows.yellow * shadowWeight + 
      midtones.yellow * midtoneWeight + 
      highlights.yellow * highlightWeight;
    
    r = clamp(r - redShift * 2.55);
    g = clamp(g - greenShift * 2.55);
    b = clamp(b - blueShift * 2.55);
    
    // Preserve luminosity
    if (preserveLuminosity) {
      const newLum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (newLum !== 0) {
        const lumRatio = lum / newLum;
        r = clamp(r * lumRatio);
        g = clamp(g * lumRatio);
        b = clamp(b * lumRatio);
      }
    }
    
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  
  return result;
}

// =============================================================================
// ITEM 83: BLACK & WHITE
// =============================================================================

export function adjustBlackWhite(
  imageData: ImageData,
  reds: number,        // 0-300%
  yellows: number,
  greens: number,
  cyans: number,
  blues: number,
  magentas: number,
  tint?: { hue: number; saturation: number }
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Normalize weights
  const weights = {
    r: reds / 100,
    y: yellows / 100,
    g: greens / 100,
    c: cyans / 100,
    b: blues / 100,
    m: magentas / 100
  };
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    // Determine color contributions
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    
    let gray = 0;
    
    // Red channel contribution
    gray += r * weights.r * (r === maxC ? 1 : 0.5);
    
    // Green channel contribution
    gray += g * weights.g * (g === maxC ? 1 : 0.5);
    
    // Blue channel contribution
    gray += b * weights.b * (b === maxC ? 1 : 0.5);
    
    // Yellow (R+G)
    const yellowComponent = Math.min(r, g);
    gray += yellowComponent * weights.y * 0.5;
    
    // Cyan (G+B)
    const cyanComponent = Math.min(g, b);
    gray += cyanComponent * weights.c * 0.5;
    
    // Magenta (R+B)
    const magentaComponent = Math.min(r, b);
    gray += magentaComponent * weights.m * 0.5;
    
    // Normalize
    gray = Math.max(0, Math.min(1, gray / 2));
    
    // Apply tint
    if (tint && tint.saturation > 0) {
      const { r: tr, g: tg, b: tb } = hslToRgb(tint.hue / 360, tint.saturation / 100, gray);
      data[i] = Math.round(tr * 255);
      data[i + 1] = Math.round(tg * 255);
      data[i + 2] = Math.round(tb * 255);
    } else {
      data[i] = Math.round(gray * 255);
      data[i + 1] = Math.round(gray * 255);
      data[i + 2] = Math.round(gray * 255);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 84: PHOTO FILTER
// =============================================================================

export function applyPhotoFilter(
  imageData: ImageData,
  filterColor: string,
  density: number,        // 0-100
  preserveLuminance: boolean = true
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const { r: fr, g: fg, b: fb } = hexToRgb(filterColor);
  const densityFactor = density / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Blend with filter color
    let newR = r * (1 - densityFactor) + fr * densityFactor;
    let newG = g * (1 - densityFactor) + fg * densityFactor;
    let newB = b * (1 - densityFactor) + fb * densityFactor;
    
    if (preserveLuminance) {
      const newLum = 0.299 * newR + 0.587 * newG + 0.114 * newB;
      if (newLum !== 0) {
        const lumRatio = lum / newLum;
        newR = clamp(newR * lumRatio);
        newG = clamp(newG * lumRatio);
        newB = clamp(newB * lumRatio);
      }
    }
    
    data[i] = clamp(newR);
    data[i + 1] = clamp(newG);
    data[i + 2] = clamp(newB);
  }
  
  return result;
}

// =============================================================================
// ITEM 85: CHANNEL MIXER
// =============================================================================

export function mixChannels(
  imageData: ImageData,
  outputChannel: 'red' | 'green' | 'blue',
  redSource: number,     // -200 to 200
  greenSource: number,
  blueSource: number,
  constant: number,      // -100 to 100
  monochrome: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const rs = redSource / 100;
  const gs = greenSource / 100;
  const bs = blueSource / 100;
  const constVal = constant * 2.55;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const mixed = clamp(r * rs + g * gs + b * bs + constVal);
    
    if (monochrome) {
      data[i] = mixed;
      data[i + 1] = mixed;
      data[i + 2] = mixed;
    } else {
      switch (outputChannel) {
        case 'red':
          data[i] = mixed;
          break;
        case 'green':
          data[i + 1] = mixed;
          break;
        case 'blue':
          data[i + 2] = mixed;
          break;
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 86: SELECTIVE COLOR
// =============================================================================

export function selectiveColor(
  imageData: ImageData,
  colorRange: 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'whites' | 'neutrals' | 'blacks',
  cyan: number,          // -100 to 100
  magenta: number,
  yellow: number,
  black: number,
  relative: boolean = true
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const { h, s, l } = rgbToHsl(r / 255, g / 255, b / 255);
    
    // Determine if pixel is in the color range
    const weight = getColorRangeWeight(colorRange, h, s, l);
    
    if (weight > 0) {
      // Convert to CMY
      let c = 255 - r;
      let m = 255 - g;
      let y = 255 - b;
      
      // Apply adjustments
      const cAdj = cyan / 100 * weight;
      const mAdj = magenta / 100 * weight;
      const yAdj = yellow / 100 * weight;
      const kAdj = black / 100 * weight;
      
      if (relative) {
        c = clamp(c + c * cAdj);
        m = clamp(m + m * mAdj);
        y = clamp(y + y * yAdj);
        
        // Black affects all
        c = clamp(c + c * kAdj);
        m = clamp(m + m * kAdj);
        y = clamp(y + y * kAdj);
      } else {
        c = clamp(c + cAdj * 255);
        m = clamp(m + mAdj * 255);
        y = clamp(y + yAdj * 255);
        
        c = clamp(c + kAdj * 255);
        m = clamp(m + kAdj * 255);
        y = clamp(y + kAdj * 255);
      }
      
      // Convert back to RGB
      data[i] = 255 - c;
      data[i + 1] = 255 - m;
      data[i + 2] = 255 - y;
    }
  }
  
  return result;
}

function getColorRangeWeight(
  range: string,
  h: number,   // 0-1
  s: number,
  l: number
): number {
  const hDeg = h * 360;
  
  switch (range) {
    case 'reds':
      return s > 0.1 ? Math.max(0, 1 - Math.min(Math.abs(hDeg - 0), Math.abs(hDeg - 360)) / 30) : 0;
    case 'yellows':
      return s > 0.1 ? Math.max(0, 1 - Math.abs(hDeg - 60) / 30) : 0;
    case 'greens':
      return s > 0.1 ? Math.max(0, 1 - Math.abs(hDeg - 120) / 30) : 0;
    case 'cyans':
      return s > 0.1 ? Math.max(0, 1 - Math.abs(hDeg - 180) / 30) : 0;
    case 'blues':
      return s > 0.1 ? Math.max(0, 1 - Math.abs(hDeg - 240) / 30) : 0;
    case 'magentas':
      return s > 0.1 ? Math.max(0, 1 - Math.abs(hDeg - 300) / 30) : 0;
    case 'whites':
      return l > 0.85 ? (l - 0.85) / 0.15 : 0;
    case 'neutrals':
      return s < 0.15 && l > 0.15 && l < 0.85 ? (0.15 - s) / 0.15 : 0;
    case 'blacks':
      return l < 0.15 ? (0.15 - l) / 0.15 : 0;
    default:
      return 0;
  }
}

// =============================================================================
// ITEM 87: INVERT
// =============================================================================

export function invert(imageData: ImageData): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  
  return result;
}

// =============================================================================
// ITEM 88: POSTERIZE
// =============================================================================

export function posterize(imageData: ImageData, levels: number): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  levels = Math.max(2, Math.min(255, levels));
  const step = 255 / (levels - 1);
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i] / step) * step);
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
  }
  
  return result;
}

// =============================================================================
// ITEM 89: THRESHOLD
// =============================================================================

export function threshold(imageData: ImageData, level: number): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = gray >= level ? 255 : 0;
    
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
  
  return result;
}

// =============================================================================
// ITEM 90: GRADIENT MAP
// =============================================================================

export function gradientMap(
  imageData: ImageData,
  stops: { position: number; color: string }[],
  dither: boolean = false,
  reverse: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Sort stops
  const sortedStops = [...stops].sort((a, b) => 
    reverse ? b.position - a.position : a.position - b.position
  );
  
  // Build color LUT
  const lutR = new Uint8Array(256);
  const lutG = new Uint8Array(256);
  const lutB = new Uint8Array(256);
  
  for (let i = 0; i < 256; i++) {
    const pos = i / 255;
    const { r, g, b } = sampleGradient(sortedStops, pos);
    lutR[i] = r;
    lutG[i] = g;
    lutB[i] = b;
  }
  
  // Apply
  for (let i = 0; i < data.length; i += 4) {
    let gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    
    if (dither) {
      gray = Math.max(0, Math.min(255, gray + (Math.random() - 0.5) * 10));
    }
    
    data[i] = lutR[gray];
    data[i + 1] = lutG[gray];
    data[i + 2] = lutB[gray];
  }
  
  return result;
}

function sampleGradient(stops: { position: number; color: string }[], position: number): { r: number; g: number; b: number } {
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  if (stops.length === 1) return hexToRgb(stops[0].color);
  
  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (position >= stops[i].position && position <= stops[i + 1].position) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  
  // Interpolate
  const t = (position - lower.position) / (upper.position - lower.position);
  const c1 = hexToRgb(lower.color);
  const c2 = hexToRgb(upper.color);
  
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t)
  };
}

// =============================================================================
// ITEM 91: SHADOWS/HIGHLIGHTS
// =============================================================================

export function adjustShadowsHighlights(
  imageData: ImageData,
  shadowAmount: number,    // 0-100
  highlightAmount: number, // 0-100
  shadowToneWidth: number, // 0-100
  highlightToneWidth: number,
  colorCorrection: number, // -100 to 100
  midtoneContrast: number  // -100 to 100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const shadowFactor = shadowAmount / 100;
  const highlightFactor = highlightAmount / 100;
  const shadowWidth = shadowToneWidth / 100;
  const highlightWidth = highlightToneWidth / 100;
  const colorFactor = colorCorrection / 100;
  const contrastFactor = midtoneContrast / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Calculate shadow weight (darker pixels)
    const shadowWeight = Math.max(0, 1 - lum / (128 + shadowWidth * 127));
    
    // Calculate highlight weight (brighter pixels)
    const highlightWeight = Math.max(0, (lum - 128 + highlightWidth * 127) / 127);
    
    // Calculate adjustment factors
    const shadowAdj = shadowWeight * shadowFactor;
    const highlightAdj = highlightWeight * highlightFactor;
    
    // Apply adjustments
    let newR = r;
    let newG = g;
    let newB = b;
    
    // Shadows: brighten
    newR = newR + (255 - newR) * shadowAdj;
    newG = newG + (255 - newG) * shadowAdj;
    newB = newB + (255 - newB) * shadowAdj;
    
    // Highlights: darken
    newR = newR - newR * highlightAdj;
    newG = newG - newG * highlightAdj;
    newB = newB - newB * highlightAdj;
    
    // Apply color correction
    if (colorFactor !== 0) {
      const adjustment = shadowWeight * shadowAdj + highlightWeight * highlightAdj;
      const correction = colorFactor * adjustment;
      
      newR = clamp(newR + (newR - 128) * correction);
      newG = clamp(newG + (newG - 128) * correction);
      newB = clamp(newB + (newB - 128) * correction);
    }
    
    // Apply midtone contrast
    if (contrastFactor !== 0) {
      const midWeight = 1 - shadowWeight - highlightWeight;
      const contrast = 1 + contrastFactor * midWeight;
      
      newR = clamp((newR - 128) * contrast + 128);
      newG = clamp((newG - 128) * contrast + 128);
      newB = clamp((newB - 128) * contrast + 128);
    }
    
    data[i] = clamp(newR);
    data[i + 1] = clamp(newG);
    data[i + 2] = clamp(newB);
  }
  
  return result;
}

// =============================================================================
// ITEM 92: CLARITY
// =============================================================================

export function adjustClarity(
  imageData: ImageData,
  clarity: number,     // -100 to 100
  radius: number = 50  // 10-500
): ImageData {
  // Clarity is essentially local contrast enhancement
  const blurred = gaussianBlur(imageData, radius);
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const blurData = blurred.data;
  
  const clarityFactor = clarity / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurData[i + c];
      const diff = original - blur;
      
      // Add back high-frequency detail
      data[i + c] = clamp(original + diff * clarityFactor);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 93: DEHAZE
// =============================================================================

export function dehaze(
  imageData: ImageData,
  amount: number    // -100 to 100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Estimate atmospheric light (brightest region)
  let maxLum = 0;
  let atmosphericR = 255;
  let atmosphericG = 255;
  let atmosphericB = 255;
  
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum > maxLum) {
      maxLum = lum;
      atmosphericR = data[i];
      atmosphericG = data[i + 1];
      atmosphericB = data[i + 2];
    }
  }
  
  // Apply dark channel prior dehazing
  const dehazeFactor = amount / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Dark channel (minimum of normalized color channels)
    const darkChannel = Math.min(
      r / atmosphericR,
      g / atmosphericG,
      b / atmosphericB
    );
    
    // Transmission estimate
    const transmission = 1 - dehazeFactor * darkChannel;
    const t = Math.max(0.1, transmission);
    
    // Recover scene radiance
    data[i] = clamp((r - atmosphericR * (1 - t)) / t);
    data[i + 1] = clamp((g - atmosphericG * (1 - t)) / t);
    data[i + 2] = clamp((b - atmosphericB * (1 - t)) / t);
  }
  
  return result;
}

// =============================================================================
// ITEM 94: WHITE BALANCE
// =============================================================================

export function adjustWhiteBalance(
  imageData: ImageData,
  temperature: number,  // -100 to 100 (blue to yellow)
  tint: number          // -100 to 100 (green to magenta)
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Convert temperature to RGB multipliers
  const tempFactor = temperature / 100;
  const tintFactor = tint / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Temperature: shift between blue and yellow
    if (tempFactor > 0) {
      // Warmer (more red/yellow)
      r = clamp(r + tempFactor * 30);
      b = clamp(b - tempFactor * 30);
    } else {
      // Cooler (more blue)
      r = clamp(r + tempFactor * 30);
      b = clamp(b - tempFactor * 30);
    }
    
    // Tint: shift between green and magenta
    if (tintFactor > 0) {
      // More magenta
      g = clamp(g - tintFactor * 20);
      r = clamp(r + tintFactor * 10);
      b = clamp(b + tintFactor * 10);
    } else {
      // More green
      g = clamp(g - tintFactor * 20);
    }
    
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  
  return result;
}

// =============================================================================
// ITEM 95: SPLIT TONING
// =============================================================================

export function splitToning(
  imageData: ImageData,
  shadowHue: number,      // 0-360
  shadowSaturation: number, // 0-100
  highlightHue: number,
  highlightSaturation: number,
  balance: number          // -100 to 100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const shadowColor = hslToRgb(shadowHue / 360, shadowSaturation / 100, 0.5);
  const highlightColor = hslToRgb(highlightHue / 360, highlightSaturation / 100, 0.5);
  const balanceFactor = (balance + 100) / 200; // 0 to 1
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Calculate shadow and highlight weights with balance
    let shadowWeight = Math.max(0, (1 - lum) * (1 - balanceFactor) * 2);
    let highlightWeight = Math.max(0, lum * balanceFactor * 2);
    
    shadowWeight *= shadowSaturation / 100;
    highlightWeight *= highlightSaturation / 100;
    
    // Blend colors
    data[i] = clamp(r * (1 - shadowWeight - highlightWeight) + 
                    shadowColor.r * shadowWeight + 
                    highlightColor.r * highlightWeight);
    data[i + 1] = clamp(g * (1 - shadowWeight - highlightWeight) + 
                        shadowColor.g * shadowWeight + 
                        highlightColor.g * highlightWeight);
    data[i + 2] = clamp(b * (1 - shadowWeight - highlightWeight) + 
                        shadowColor.b * shadowWeight + 
                        highlightColor.b * highlightWeight);
  }
  
  return result;
}

// =============================================================================
// ITEM 96: TONE CURVE
// =============================================================================

export function toneCurve(
  imageData: ImageData,
  rgbCurve: { input: number; output: number }[],
  redCurve?: { input: number; output: number }[],
  greenCurve?: { input: number; output: number }[],
  blueCurve?: { input: number; output: number }[]
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  // Build LUTs
  const rgbLut = buildSplineLUT(rgbCurve);
  const redLut = redCurve ? buildSplineLUT(redCurve) : null;
  const greenLut = greenCurve ? buildSplineLUT(greenCurve) : null;
  const blueLut = blueCurve ? buildSplineLUT(blueCurve) : null;
  
  for (let i = 0; i < data.length; i += 4) {
    // Apply RGB curve first
    let r = rgbLut[data[i]];
    let g = rgbLut[data[i + 1]];
    let b = rgbLut[data[i + 2]];
    
    // Apply individual channel curves
    if (redLut) r = redLut[r];
    if (greenLut) g = greenLut[g];
    if (blueLut) b = blueLut[b];
    
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  
  return result;
}

// =============================================================================
// ITEM 97: HSL ADJUSTMENT
// =============================================================================

export function adjustHSL(
  imageData: ImageData,
  colorRange: 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta' | 'all',
  hueShift: number,      // -100 to 100
  saturation: number,    // -100 to 100
  luminance: number      // -100 to 100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const hueRanges: Record<string, [number, number]> = {
    'red': [345, 15],
    'orange': [15, 45],
    'yellow': [45, 75],
    'green': [75, 165],
    'aqua': [165, 195],
    'blue': [195, 255],
    'purple': [255, 285],
    'magenta': [285, 345],
    'all': [0, 360]
  };
  
  const [rangeStart, rangeEnd] = hueRanges[colorRange] || [0, 360];
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    let { h, s, l } = rgbToHsl(r, g, b);
    const hueDeg = h * 360;
    
    // Calculate weight based on hue
    let weight = 0;
    if (colorRange === 'all') {
      weight = 1;
    } else {
      if (rangeStart > rangeEnd) {
        // Wraps around (e.g., red)
        weight = (hueDeg >= rangeStart || hueDeg <= rangeEnd) 
          ? 1 - Math.min(
              Math.abs(hueDeg - rangeStart),
              Math.abs(hueDeg - rangeEnd),
              Math.abs(hueDeg - rangeStart - 360),
              Math.abs(hueDeg - rangeEnd + 360)
            ) / 30
          : 0;
      } else {
        if (hueDeg >= rangeStart && hueDeg <= rangeEnd) {
          const center = (rangeStart + rangeEnd) / 2;
          const halfWidth = (rangeEnd - rangeStart) / 2;
          weight = 1 - Math.abs(hueDeg - center) / halfWidth;
        }
      }
      weight = Math.max(0, weight) * s; // Weight by saturation too
    }
    
    if (weight > 0) {
      // Apply hue shift
      h = (h + (hueShift / 100) * 0.5 * weight + 1) % 1;
      
      // Apply saturation
      const satAdj = 1 + (saturation / 100) * weight;
      s = Math.max(0, Math.min(1, s * satAdj));
      
      // Apply luminance
      const lumAdj = (luminance / 100) * weight;
      if (lumAdj > 0) {
        l = l + (1 - l) * lumAdj;
      } else {
        l = l * (1 + lumAdj);
      }
      
      const { r: nr, g: ng, b: nb } = hslToRgb(h, s, l);
      
      data[i] = Math.round(nr * 255);
      data[i + 1] = Math.round(ng * 255);
      data[i + 2] = Math.round(nb * 255);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 98: MATCH COLOR
// =============================================================================

export function matchColor(
  sourceImage: ImageData,
  targetImage: ImageData,
  luminance: number,       // 0-200
  colorIntensity: number,  // 0-200
  fade: number             // 0-100
): ImageData {
  // Calculate statistics of both images
  const sourceStats = calculateImageStats(sourceImage);
  const targetStats = calculateImageStats(targetImage);
  
  const result = new ImageData(
    new Uint8ClampedArray(sourceImage.data),
    sourceImage.width,
    sourceImage.height
  );
  const data = result.data;
  
  const lumFactor = luminance / 100;
  const colorFactor = colorIntensity / 100;
  const fadeFactor = 1 - fade / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Normalize to target statistics
    let newR = (r - sourceStats.mean.r) / sourceStats.stdDev.r * targetStats.stdDev.r * colorFactor + targetStats.mean.r;
    let newG = (g - sourceStats.mean.g) / sourceStats.stdDev.g * targetStats.stdDev.g * colorFactor + targetStats.mean.g;
    let newB = (b - sourceStats.mean.b) / sourceStats.stdDev.b * targetStats.stdDev.b * colorFactor + targetStats.mean.b;
    
    // Apply luminance adjustment
    const sourceLum = 0.299 * r + 0.587 * g + 0.114 * b;
    const targetLum = 0.299 * newR + 0.587 * newG + 0.114 * newB;
    const lumAdj = (sourceLum - targetLum) * (1 - lumFactor);
    
    newR += lumAdj;
    newG += lumAdj;
    newB += lumAdj;
    
    // Fade back to original
    newR = r * (1 - fadeFactor) + newR * fadeFactor;
    newG = g * (1 - fadeFactor) + newG * fadeFactor;
    newB = b * (1 - fadeFactor) + newB * fadeFactor;
    
    data[i] = clamp(newR);
    data[i + 1] = clamp(newG);
    data[i + 2] = clamp(newB);
  }
  
  return result;
}

// =============================================================================
// ITEM 99: AUTO ADJUSTMENTS
// =============================================================================

export function autoLevels(imageData: ImageData): ImageData {
  const histogram = calculateHistogram(imageData);
  const pixelCount = imageData.width * imageData.height;
  const clipPercent = 0.001; // 0.1% clipping
  const clipPixels = Math.floor(pixelCount * clipPercent);
  
  // Find black and white points for each channel
  const channels = ['red', 'green', 'blue'] as const;
  const adjustments: Record<string, { black: number; white: number }> = {};
  
  for (const channel of channels) {
    let cumulative = 0;
    let blackPoint = 0;
    let whitePoint = 255;
    
    // Find black point
    for (let i = 0; i < 256; i++) {
      cumulative += histogram[channel][i];
      if (cumulative > clipPixels) {
        blackPoint = i;
        break;
      }
    }
    
    // Find white point
    cumulative = 0;
    for (let i = 255; i >= 0; i--) {
      cumulative += histogram[channel][i];
      if (cumulative > clipPixels) {
        whitePoint = i;
        break;
      }
    }
    
    adjustments[channel] = { black: blackPoint, white: whitePoint };
  }
  
  // Apply adjustments
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const rAdj = adjustments.red;
    const gAdj = adjustments.green;
    const bAdj = adjustments.blue;
    
    data[i] = clamp((data[i] - rAdj.black) * 255 / (rAdj.white - rAdj.black));
    data[i + 1] = clamp((data[i + 1] - gAdj.black) * 255 / (gAdj.white - gAdj.black));
    data[i + 2] = clamp((data[i + 2] - bAdj.black) * 255 / (bAdj.white - bAdj.black));
  }
  
  return result;
}

export function autoContrast(imageData: ImageData): ImageData {
  // Similar to auto levels but uses luminance
  const histogram = calculateHistogram(imageData);
  const pixelCount = imageData.width * imageData.height;
  const clipPercent = 0.001;
  const clipPixels = Math.floor(pixelCount * clipPercent);
  
  let cumulative = 0;
  let blackPoint = 0;
  let whitePoint = 255;
  
  // Find black point using luminance
  for (let i = 0; i < 256; i++) {
    cumulative += histogram.luminance[i];
    if (cumulative > clipPixels) {
      blackPoint = i;
      break;
    }
  }
  
  // Find white point
  cumulative = 0;
  for (let i = 255; i >= 0; i--) {
    cumulative += histogram.luminance[i];
    if (cumulative > clipPixels) {
      whitePoint = i;
      break;
    }
  }
  
  return adjustLevels(imageData, blackPoint, 1, whitePoint, 0, 255, 'rgb');
}

export function autoColor(imageData: ImageData): ImageData {
  // Remove color cast by aligning channel means
  const stats = calculateImageStats(imageData);
  
  const avgMean = (stats.mean.r + stats.mean.g + stats.mean.b) / 3;
  
  const rShift = avgMean - stats.mean.r;
  const gShift = avgMean - stats.mean.g;
  const bShift = avgMean - stats.mean.b;
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] + rShift);
    data[i + 1] = clamp(data[i + 1] + gShift);
    data[i + 2] = clamp(data[i + 2] + bShift);
  }
  
  return result;
}

// =============================================================================
// ITEM 100: HISTOGRAM & STATISTICS
// =============================================================================

export function calculateHistogram(imageData: ImageData): HistogramData {
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luminance = new Uint32Array(256);
  
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    red[data[i]]++;
    green[data[i + 1]]++;
    blue[data[i + 2]]++;
    
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    luminance[lum]++;
  }
  
  return { red, green, blue, luminance };
}

export function calculateImageStats(imageData: ImageData): ImageStats {
  const data = imageData.data;
  const pixelCount = data.length / 4;
  
  let sumR = 0, sumG = 0, sumB = 0, sumL = 0;
  let minR = 255, minG = 255, minB = 255;
  let maxR = 0, maxG = 0, maxB = 0;
  let clippedShadows = 0, clippedHighlights = 0;
  
  // First pass: means and min/max
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    
    sumR += r;
    sumG += g;
    sumB += b;
    sumL += l;
    
    minR = Math.min(minR, r);
    minG = Math.min(minG, g);
    minB = Math.min(minB, b);
    
    maxR = Math.max(maxR, r);
    maxG = Math.max(maxG, g);
    maxB = Math.max(maxB, b);
    
    if (r === 0 || g === 0 || b === 0) clippedShadows++;
    if (r === 255 || g === 255 || b === 255) clippedHighlights++;
  }
  
  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanL = sumL / pixelCount;
  
  // Second pass: standard deviation
  let varR = 0, varG = 0, varB = 0, varL = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    
    varR += (r - meanR) ** 2;
    varG += (g - meanG) ** 2;
    varB += (b - meanB) ** 2;
    varL += (l - meanL) ** 2;
  }
  
  return {
    mean: { r: meanR, g: meanG, b: meanB, l: meanL },
    stdDev: {
      r: Math.sqrt(varR / pixelCount),
      g: Math.sqrt(varG / pixelCount),
      b: Math.sqrt(varB / pixelCount),
      l: Math.sqrt(varL / pixelCount)
    },
    min: { r: minR, g: minG, b: minB },
    max: { r: maxR, g: maxG, b: maxB },
    clipping: {
      shadows: clippedShadows / pixelCount * 100,
      highlights: clippedHighlights / pixelCount * 100
    }
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  let h = 0, s = 0;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
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
  
  return { r, g, b };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function gaussianBlur(imageData: ImageData, radius: number): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  
  // Simplified box blur approximation for performance
  const passes = 3;
  const boxRadius = Math.ceil(radius / passes);
  
  for (let pass = 0; pass < passes; pass++) {
    boxBlurH(result, boxRadius);
    boxBlurV(result, boxRadius);
  }
  
  return result;
}

function boxBlurH(imageData: ImageData, radius: number): void {
  const { data, width, height } = imageData;
  const iarr = 1 / (radius + radius + 1);
  
  for (let y = 0; y < height; y++) {
    let ti = y * width * 4;
    let li = ti;
    let ri = ti + radius * 4;
    
    const fv = [data[ti], data[ti + 1], data[ti + 2], data[ti + 3]];
    const lv = [data[ti + (width - 1) * 4], data[ti + (width - 1) * 4 + 1], data[ti + (width - 1) * 4 + 2], data[ti + (width - 1) * 4 + 3]];
    
    let val = fv.map(v => v * (radius + 1));
    
    for (let j = 0; j < radius; j++) {
      const idx = Math.min(j, width - 1) * 4;
      for (let c = 0; c < 4; c++) {
        val[c] += data[ti + idx + c];
      }
    }
    
    for (let j = 0; j <= radius; j++) {
      const idx = Math.min(j + radius, width - 1) * 4;
      for (let c = 0; c < 4; c++) {
        val[c] += data[ti + idx + c] - fv[c];
        data[ti + j * 4 + c] = Math.round(val[c] * iarr);
      }
    }
    
    for (let j = radius + 1; j < width - radius; j++) {
      for (let c = 0; c < 4; c++) {
        val[c] += data[ri + c] - data[li + c];
        data[ti + j * 4 + c] = Math.round(val[c] * iarr);
      }
      ri += 4;
      li += 4;
    }
    
    for (let j = width - radius; j < width; j++) {
      for (let c = 0; c < 4; c++) {
        val[c] += lv[c] - data[li + c];
        data[ti + j * 4 + c] = Math.round(val[c] * iarr);
      }
      li += 4;
    }
  }
}

function boxBlurV(imageData: ImageData, radius: number): void {
  const { data, width, height } = imageData;
  const iarr = 1 / (radius + radius + 1);
  
  for (let x = 0; x < width; x++) {
    let ti = x * 4;
    let li = ti;
    let ri = ti + radius * width * 4;
    
    const fv = [data[ti], data[ti + 1], data[ti + 2], data[ti + 3]];
    const lv = [data[ti + (height - 1) * width * 4], data[ti + (height - 1) * width * 4 + 1], data[ti + (height - 1) * width * 4 + 2], data[ti + (height - 1) * width * 4 + 3]];
    
    let val = fv.map(v => v * (radius + 1));
    
    for (let j = 0; j < radius; j++) {
      const idx = Math.min(j, height - 1) * width * 4;
      for (let c = 0; c < 4; c++) {
        val[c] += data[ti + idx + c];
      }
    }
    
    for (let j = 0; j <= radius; j++) {
      const idx = Math.min(j + radius, height - 1) * width * 4;
      for (let c = 0; c < 4; c++) {
        val[c] += data[ti + idx + c] - fv[c];
        data[ti + j * width * 4 + c] = Math.round(val[c] * iarr);
      }
    }
    
    for (let j = radius + 1; j < height - radius; j++) {
      for (let c = 0; c < 4; c++) {
        val[c] += data[ri + c] - data[li + c];
        data[ti + j * width * 4 + c] = Math.round(val[c] * iarr);
      }
      ri += width * 4;
      li += width * 4;
    }
    
    for (let j = height - radius; j < height; j++) {
      for (let c = 0; c < 4; c++) {
        val[c] += lv[c] - data[li + c];
        data[ti + j * width * 4 + c] = Math.round(val[c] * iarr);
      }
      li += width * 4;
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const Adjustments = {
  // Basic
  brightnessContrast: adjustBrightnessContrast,
  levels: adjustLevels,
  curves: adjustCurves,
  exposure: adjustExposure,
  
  // Color
  vibrance: adjustVibrance,
  hueSaturation: adjustHueSaturation,
  colorBalance: adjustColorBalance,
  blackWhite: adjustBlackWhite,
  photoFilter: applyPhotoFilter,
  channelMixer: mixChannels,
  selectiveColor: selectiveColor,
  
  // Tonal
  invert,
  posterize,
  threshold,
  gradientMap,
  shadowsHighlights: adjustShadowsHighlights,
  
  // Advanced
  clarity: adjustClarity,
  dehaze,
  whiteBalance: adjustWhiteBalance,
  splitToning,
  toneCurve,
  hsl: adjustHSL,
  matchColor,
  
  // Auto
  autoLevels,
  autoContrast,
  autoColor,
  
  // Analysis
  histogram: calculateHistogram,
  stats: calculateImageStats
};

export default Adjustments;
