// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - PRISM Advanced Selection System
// Professional selection tools rivaling Photoshop/Pixelmator Pro
// Items 1-25 of the 1000-item improvement plan
// =============================================================================

import { SelectionState, createEmptySelection } from './PrismEngine';

// =============================================================================
// TYPES
// =============================================================================

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorSample {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SelectionMask {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface QuickSelectOptions {
  tolerance: number;          // 0-255, how similar colors must be
  contiguous: boolean;        // Only select connected pixels
  antiAlias: boolean;         // Smooth selection edges
  sampleAllLayers: boolean;   // Sample from all visible layers
  autoRefine: boolean;        // Auto-refine edges
}

export interface SubjectSelectOptions {
  sensitivity: number;        // 0-100, how sensitive detection is
  includeEdges: boolean;      // Include edge details
  refinementLevel: 'fast' | 'balanced' | 'quality';
}

export interface SkySelectOptions {
  includeClouds: boolean;     // Select clouds as part of sky
  blendHorizon: number;       // 0-100, how much to blend at horizon
}

export interface ColorRangeOptions {
  fuzziness: number;          // 0-200, color matching tolerance
  range: number;              // 0-100, color range width
  localized: boolean;         // Use localized color clusters
  invertSelection: boolean;
}

export interface RefineEdgeOptions {
  radius: number;             // Edge detection radius 0-250px
  smartRadius: boolean;       // Auto-detect edge radius
  smoothness: number;         // 0-100, edge smoothness
  feather: number;            // 0-250px, edge feathering
  contrast: number;           // 0-100, edge contrast
  shiftEdge: number;          // -100 to +100, expand/contract
  decontaminate: boolean;     // Remove color fringing
  outputTo: 'selection' | 'mask' | 'layer' | 'newDocument';
}

export interface SelectModifyOptions {
  amount: number;             // Pixels to expand/contract/feather
  preserveCorners: boolean;   // Keep corner sharpness
}

// =============================================================================
// ITEM 1: QUICK SELECTION (AI-assisted magic selection)
// =============================================================================

export function createQuickSelect(
  imageData: ImageData,
  startPoint: SelectionPoint,
  options: QuickSelectOptions
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  // Get initial color sample at click point
  const idx = (startPoint.y * width + startPoint.x) * 4;
  const targetColor: ColorSample = {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3]
  };
  
  // Flood fill with color similarity
  const visited = new Set<number>();
  const queue: SelectionPoint[] = [startPoint];
  
  while (queue.length > 0) {
    const point = queue.shift()!;
    const pixelIdx = point.y * width + point.x;
    
    if (visited.has(pixelIdx)) continue;
    if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) continue;
    
    visited.add(pixelIdx);
    
    const dataIdx = pixelIdx * 4;
    const pixelColor: ColorSample = {
      r: data[dataIdx],
      g: data[dataIdx + 1],
      b: data[dataIdx + 2],
      a: data[dataIdx + 3]
    };
    
    const distance = colorDistance(targetColor, pixelColor);
    
    if (distance <= options.tolerance) {
      // Mark as selected with anti-aliased edge
      if (options.antiAlias) {
        mask[pixelIdx] = Math.min(255, Math.round(255 * (1 - distance / options.tolerance)));
      } else {
        mask[pixelIdx] = 255;
      }
      
      // Add neighbors
      if (options.contiguous) {
        queue.push({ x: point.x + 1, y: point.y });
        queue.push({ x: point.x - 1, y: point.y });
        queue.push({ x: point.x, y: point.y + 1 });
        queue.push({ x: point.x, y: point.y - 1 });
      }
    }
  }
  
  // If not contiguous, check all pixels
  if (!options.contiguous) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIdx = y * width + x;
        const dataIdx = pixelIdx * 4;
        const pixelColor: ColorSample = {
          r: data[dataIdx],
          g: data[dataIdx + 1],
          b: data[dataIdx + 2],
          a: data[dataIdx + 3]
        };
        
        const distance = colorDistance(targetColor, pixelColor);
        if (distance <= options.tolerance) {
          if (options.antiAlias) {
            mask[pixelIdx] = Math.min(255, Math.round(255 * (1 - distance / options.tolerance)));
          } else {
            mask[pixelIdx] = 255;
          }
        }
      }
    }
  }
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 2: SUBJECT SELECTION (AI-based subject detection)
// =============================================================================

export function createSubjectSelect(
  imageData: ImageData,
  options: SubjectSelectOptions
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  // Edge detection using Sobel operator
  const edges = detectEdges(imageData);
  
  // Compute saliency map (simplified visual attention model)
  const saliency = computeSaliencyMap(imageData);
  
  // Find high-saliency regions (likely subjects)
  const threshold = 255 * (1 - options.sensitivity / 100);
  
  for (let i = 0; i < width * height; i++) {
    const combined = Math.max(edges[i], saliency[i]);
    mask[i] = combined > threshold ? 255 : 0;
  }
  
  // Fill enclosed regions
  fillEnclosedRegions(mask, width, height);
  
  // Refine edges if requested
  if (options.includeEdges) {
    dilateSelection(mask, width, height, 2);
    smoothSelection(mask, width, height, 3);
  }
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 3: SKY SELECTION (Intelligent sky detection)
// =============================================================================

export function createSkySelect(
  imageData: ImageData,
  options: SkySelectOptions
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  // Sky is typically in upper portion with blue-ish colors
  // Start from top and work down
  
  for (let x = 0; x < width; x++) {
    let foundHorizon = false;
    let lastSkyY = 0;
    
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Check if this pixel looks like sky
      const isSky = isSkyColor(r, g, b, options.includeClouds);
      
      if (isSky && !foundHorizon) {
        mask[y * width + x] = 255;
        lastSkyY = y;
      } else if (!isSky) {
        foundHorizon = true;
      }
    }
    
    // Blend at horizon
    if (options.blendHorizon > 0 && lastSkyY > 0) {
      const blendPixels = Math.round(options.blendHorizon * 2);
      for (let i = 0; i < blendPixels && lastSkyY + i < height; i++) {
        const blendFactor = 1 - (i / blendPixels);
        const idx = (lastSkyY + i) * width + x;
        mask[idx] = Math.round(255 * blendFactor);
      }
    }
  }
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 4: COLOR RANGE SELECTION
// =============================================================================

export function createColorRangeSelect(
  imageData: ImageData,
  sampleColors: ColorSample[],
  options: ColorRangeOptions
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const pixel: ColorSample = {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3]
      };
      
      // Find closest sample color
      let minDistance = Infinity;
      for (const sample of sampleColors) {
        const dist = colorDistanceLAB(pixel, sample);
        minDistance = Math.min(minDistance, dist);
      }
      
      // Apply fuzziness
      const normalizedDist = minDistance / (options.fuzziness + 1);
      let selectionValue = 0;
      
      if (normalizedDist <= 1) {
        // Within range - calculate falloff
        const rangeNorm = options.range / 100;
        if (normalizedDist <= rangeNorm) {
          selectionValue = 255;
        } else {
          selectionValue = Math.round(255 * (1 - (normalizedDist - rangeNorm) / (1 - rangeNorm)));
        }
      }
      
      mask[y * width + x] = options.invertSelection ? 255 - selectionValue : selectionValue;
    }
  }
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 5: FOCUS AREA SELECTION (Select in-focus areas)
// =============================================================================

export function createFocusAreaSelect(
  imageData: ImageData,
  threshold: number = 50
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  // Calculate local sharpness using Laplacian variance
  const sharpness = computeSharpnessMap(imageData);
  
  // Normalize and threshold
  const maxSharpness = Math.max(...sharpness);
  const normalizedThreshold = (threshold / 100) * maxSharpness;
  
  for (let i = 0; i < width * height; i++) {
    mask[i] = sharpness[i] > normalizedThreshold ? 255 : 0;
  }
  
  // Smooth the selection
  smoothSelection(mask, width, height, 5);
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 6: SKIN TONE SELECTION
// =============================================================================

export function createSkinToneSelect(
  imageData: ImageData,
  sensitivity: number = 50
): SelectionMask {
  const { width, height, data } = imageData;
  const mask = new Uint8ClampedArray(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Convert to YCbCr for skin detection
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const Cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
      const Cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
      
      // Skin tone ranges in YCbCr
      const sensitivityFactor = sensitivity / 50;
      const cbRange = 15 * sensitivityFactor;
      const crRange = 20 * sensitivityFactor;
      
      const isSkin = 
        Y > 80 &&
        Cb > (77 - cbRange) && Cb < (127 + cbRange) &&
        Cr > (133 - crRange) && Cr < (173 + crRange);
      
      mask[y * width + x] = isSkin ? 255 : 0;
    }
  }
  
  // Clean up noise
  erodeSelection(mask, width, height, 1);
  dilateSelection(mask, width, height, 2);
  smoothSelection(mask, width, height, 3);
  
  return { data: mask, width, height };
}

// =============================================================================
// ITEM 7: REFINE EDGE BRUSH
// =============================================================================

export interface RefineEdgeBrushState {
  mask: SelectionMask;
  originalMask: SelectionMask;
  brushRadius: number;
  mode: 'refine' | 'erase' | 'restore';
}

export function createRefineEdgeBrush(
  originalMask: SelectionMask,
  brushRadius: number = 15
): RefineEdgeBrushState {
  return {
    mask: {
      data: new Uint8ClampedArray(originalMask.data),
      width: originalMask.width,
      height: originalMask.height
    },
    originalMask,
    brushRadius,
    mode: 'refine'
  };
}

export function paintRefineEdge(
  state: RefineEdgeBrushState,
  imageData: ImageData,
  point: SelectionPoint,
  options: RefineEdgeOptions
): void {
  const { mask, originalMask, brushRadius, mode } = state;
  const { width, height } = mask;
  
  const radius = options.smartRadius ? 
    detectLocalEdgeRadius(imageData, point, brushRadius) : 
    options.radius;
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = point.x + dx;
      const y = point.y + dy;
      
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      
      const idx = y * width + x;
      const brushStrength = 1 - (dist / radius);
      
      switch (mode) {
        case 'refine':
          // Detect edge and refine mask
          const edgeValue = detectLocalEdge(imageData, x, y, options);
          mask.data[idx] = Math.round(
            mask.data[idx] * (1 - brushStrength) + 
            edgeValue * brushStrength
          );
          break;
        case 'erase':
          mask.data[idx] = Math.round(mask.data[idx] * (1 - brushStrength));
          break;
        case 'restore':
          mask.data[idx] = Math.round(
            mask.data[idx] * (1 - brushStrength) + 
            originalMask.data[idx] * brushStrength
          );
          break;
      }
    }
  }
  
  // Apply post-processing
  if (options.decontaminate) {
    decontaminateEdges(mask, imageData, point, radius);
  }
}

// =============================================================================
// ITEM 8: SELECTION FEATHERING
// =============================================================================

export function featherSelection(
  mask: SelectionMask,
  amount: number,
  preserveCorners: boolean = false
): SelectionMask {
  const { width, height, data } = mask;
  const result = new Uint8ClampedArray(width * height);
  
  // Apply Gaussian blur for feathering
  const sigma = amount / 2.5;
  const kernelSize = Math.ceil(amount * 2) | 1;
  const kernel = createGaussianKernel(kernelSize, sigma);
  
  // Horizontal pass
  const temp = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      
      for (let k = 0; k < kernelSize; k++) {
        const kx = x + k - Math.floor(kernelSize / 2);
        if (kx >= 0 && kx < width) {
          sum += data[y * width + kx] * kernel[k];
          weightSum += kernel[k];
        }
      }
      
      temp[y * width + x] = Math.round(sum / weightSum);
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      
      for (let k = 0; k < kernelSize; k++) {
        const ky = y + k - Math.floor(kernelSize / 2);
        if (ky >= 0 && ky < height) {
          sum += temp[ky * width + x] * kernel[k];
          weightSum += kernel[k];
        }
      }
      
      result[y * width + x] = Math.round(sum / weightSum);
    }
  }
  
  // Preserve corners if requested
  if (preserveCorners) {
    preserveSelectionCorners(data, result, width, height);
  }
  
  return { data: result, width, height };
}

// =============================================================================
// ITEM 9: EXPAND SELECTION
// =============================================================================

export function expandSelection(
  mask: SelectionMask,
  amount: number,
  options: SelectModifyOptions
): SelectionMask {
  const result = new Uint8ClampedArray(mask.data);
  dilateSelection(result, mask.width, mask.height, amount);
  
  if (options.preserveCorners) {
    preserveSelectionCorners(mask.data, result, mask.width, mask.height);
  }
  
  return { data: result, width: mask.width, height: mask.height };
}

// =============================================================================
// ITEM 10: CONTRACT SELECTION
// =============================================================================

export function contractSelection(
  mask: SelectionMask,
  amount: number,
  options: SelectModifyOptions
): SelectionMask {
  const result = new Uint8ClampedArray(mask.data);
  erodeSelection(result, mask.width, mask.height, amount);
  
  if (options.preserveCorners) {
    preserveSelectionCorners(mask.data, result, mask.width, mask.height);
  }
  
  return { data: result, width: mask.width, height: mask.height };
}

// =============================================================================
// ITEM 11: SMOOTH SELECTION
// =============================================================================

export function smoothSelectionEdges(
  mask: SelectionMask,
  radius: number
): SelectionMask {
  const result = new Uint8ClampedArray(mask.data);
  smoothSelection(result, mask.width, mask.height, radius);
  return { data: result, width: mask.width, height: mask.height };
}

// =============================================================================
// ITEM 12: BORDER SELECTION
// =============================================================================

export function createBorderSelection(
  mask: SelectionMask,
  width: number
): SelectionMask {
  const { width: w, height: h, data } = mask;
  const expanded = new Uint8ClampedArray(data);
  const contracted = new Uint8ClampedArray(data);
  
  dilateSelection(expanded, w, h, Math.ceil(width / 2));
  erodeSelection(contracted, w, h, Math.floor(width / 2));
  
  // Border is expanded minus contracted
  const result = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    result[i] = Math.max(0, expanded[i] - contracted[i]);
  }
  
  return { data: result, width: w, height: h };
}

// =============================================================================
// ITEM 13: GROW SELECTION (Include similar colors)
// =============================================================================

export function growSelection(
  mask: SelectionMask,
  imageData: ImageData,
  tolerance: number
): SelectionMask {
  const { width, height, data } = imageData;
  const result = new Uint8ClampedArray(mask.data);
  
  // Collect colors from current selection
  const selectedColors: ColorSample[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask.data[idx] > 127) {
        const dataIdx = idx * 4;
        selectedColors.push({
          r: data[dataIdx],
          g: data[dataIdx + 1],
          b: data[dataIdx + 2],
          a: data[dataIdx + 3]
        });
      }
    }
  }
  
  // Find similar colors throughout image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (result[idx] > 127) continue;
      
      const dataIdx = idx * 4;
      const pixel: ColorSample = {
        r: data[dataIdx],
        g: data[dataIdx + 1],
        b: data[dataIdx + 2],
        a: data[dataIdx + 3]
      };
      
      for (const sample of selectedColors) {
        if (colorDistance(pixel, sample) <= tolerance) {
          result[idx] = 255;
          break;
        }
      }
    }
  }
  
  return { data: result, width, height };
}

// =============================================================================
// ITEM 14: SELECTION TO PATH (Convert to vector path)
// =============================================================================

export interface SelectionPath {
  points: SelectionPoint[];
  closed: boolean;
}

export function selectionToPath(
  mask: SelectionMask,
  simplify: number = 2
): SelectionPath[] {
  const { width, height, data } = mask;
  const paths: SelectionPath[] = [];
  const visited = new Set<number>();
  
  // Find contours using marching squares
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      if (visited.has(idx)) continue;
      
      // Check if this is a boundary pixel
      if (data[idx] > 127 && isEdgePixel(data, width, height, x, y)) {
        const path = traceContour(data, width, height, x, y, visited);
        if (path.length >= 3) {
          // Simplify path using Douglas-Peucker
          const simplified = simplifyPath(path, simplify);
          paths.push({ points: simplified, closed: true });
        }
      }
    }
  }
  
  return paths;
}

// =============================================================================
// ITEM 15: PATH TO SELECTION
// =============================================================================

export function pathToSelection(
  paths: SelectionPath[],
  width: number,
  height: number
): SelectionMask {
  const data = new Uint8ClampedArray(width * height);
  
  for (const path of paths) {
    fillPolygon(data, width, height, path.points);
  }
  
  return { data, width, height };
}

// =============================================================================
// ITEM 16: SAVE SELECTION AS CHANNEL
// =============================================================================

export interface SelectionChannel {
  name: string;
  mask: SelectionMask;
  color: string;
  visible: boolean;
  locked: boolean;
}

export function createSelectionChannel(
  mask: SelectionMask,
  name: string,
  color: string = '#ff0000'
): SelectionChannel {
  return {
    name,
    mask: { 
      data: new Uint8ClampedArray(mask.data),
      width: mask.width,
      height: mask.height
    },
    color,
    visible: true,
    locked: false
  };
}

// =============================================================================
// ITEM 17: LOAD SELECTION FROM CHANNEL
// =============================================================================

export function loadSelectionFromChannel(
  channel: SelectionChannel
): SelectionMask {
  return {
    data: new Uint8ClampedArray(channel.mask.data),
    width: channel.mask.width,
    height: channel.mask.height
  };
}

// =============================================================================
// ITEM 18: SELECTION OPERATIONS (Add, Subtract, Intersect)
// =============================================================================

export type SelectionOp = 'add' | 'subtract' | 'intersect' | 'difference';

export function combineSelections(
  maskA: SelectionMask,
  maskB: SelectionMask,
  operation: SelectionOp
): SelectionMask {
  const { width, height } = maskA;
  const result = new Uint8ClampedArray(width * height);
  
  for (let i = 0; i < width * height; i++) {
    const a = maskA.data[i];
    const b = maskB.data[i];
    
    switch (operation) {
      case 'add':
        result[i] = Math.min(255, a + b);
        break;
      case 'subtract':
        result[i] = Math.max(0, a - b);
        break;
      case 'intersect':
        result[i] = Math.min(a, b);
        break;
      case 'difference':
        result[i] = Math.abs(a - b);
        break;
    }
  }
  
  return { data: result, width, height };
}

// =============================================================================
// ITEM 19: INVERSE SELECTION
// =============================================================================

export function invertSelectionMask(mask: SelectionMask): SelectionMask {
  const result = new Uint8ClampedArray(mask.width * mask.height);
  for (let i = 0; i < result.length; i++) {
    result[i] = 255 - mask.data[i];
  }
  return { data: result, width: mask.width, height: mask.height };
}

// =============================================================================
// ITEM 20: SELECT ALL
// =============================================================================

export function selectAll(width: number, height: number): SelectionMask {
  const data = new Uint8ClampedArray(width * height);
  data.fill(255);
  return { data, width, height };
}

// =============================================================================
// ITEM 21: DESELECT
// =============================================================================

export function deselectAll(width: number, height: number): SelectionMask {
  return { data: new Uint8ClampedArray(width * height), width, height };
}

// =============================================================================
// ITEM 22: RESELECT (Restore last selection)
// =============================================================================

export class SelectionHistory {
  private history: SelectionMask[] = [];
  private index: number = -1;
  private maxHistory: number = 50;
  
  push(mask: SelectionMask): void {
    // Remove future states
    this.history = this.history.slice(0, this.index + 1);
    
    // Add new state
    this.history.push({
      data: new Uint8ClampedArray(mask.data),
      width: mask.width,
      height: mask.height
    });
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.index = this.history.length - 1;
  }
  
  undo(): SelectionMask | null {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return null;
  }
  
  redo(): SelectionMask | null {
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }
    return null;
  }
  
  getLast(): SelectionMask | null {
    return this.history[this.history.length - 1] || null;
  }
}

// =============================================================================
// ITEM 23: TRANSFORM SELECTION
// =============================================================================

export interface SelectionTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;  // degrees
  anchorX: number;
  anchorY: number;
}

export function transformSelection(
  mask: SelectionMask,
  transform: SelectionTransform
): SelectionMask {
  const { width, height } = mask;
  const result = new Uint8ClampedArray(width * height);
  
  const cos = Math.cos(transform.rotation * Math.PI / 180);
  const sin = Math.sin(transform.rotation * Math.PI / 180);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Reverse transform to find source pixel
      let sx = x - transform.anchorX - transform.translateX;
      let sy = y - transform.anchorY - transform.translateY;
      
      // Reverse rotation
      const rx = sx * cos + sy * sin;
      const ry = -sx * sin + sy * cos;
      
      // Reverse scale
      sx = rx / transform.scaleX + transform.anchorX;
      sy = ry / transform.scaleY + transform.anchorY;
      
      // Bilinear interpolation
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      
      if (x0 >= 0 && x1 < width && y0 >= 0 && y1 < height) {
        const fx = sx - x0;
        const fy = sy - y0;
        
        const v00 = mask.data[y0 * width + x0];
        const v10 = mask.data[y0 * width + x1];
        const v01 = mask.data[y1 * width + x0];
        const v11 = mask.data[y1 * width + x1];
        
        const value = 
          v00 * (1 - fx) * (1 - fy) +
          v10 * fx * (1 - fy) +
          v01 * (1 - fx) * fy +
          v11 * fx * fy;
        
        result[y * width + x] = Math.round(value);
      }
    }
  }
  
  return { data: result, width, height };
}

// =============================================================================
// ITEM 24: SELECTION PREVIEW OVERLAY
// =============================================================================

export interface SelectionOverlayOptions {
  color: string;
  opacity: number;
  showMarchingAnts: boolean;
  maskMode: 'overlay' | 'quickMask' | 'rubyLith';
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  mask: SelectionMask,
  options: SelectionOverlayOptions,
  time: number
): void {
  const { width, height, data } = mask;
  
  // Create overlay image data
  const overlayData = ctx.createImageData(width, height);
  const overlay = overlayData.data;
  
  const [r, g, b] = hexToRgb(options.color);
  const alpha = Math.round(options.opacity * 255);
  
  for (let i = 0; i < width * height; i++) {
    const maskValue = data[i];
    const idx = i * 4;
    
    if (options.maskMode === 'overlay') {
      // Show non-selected areas with color
      const overlayAlpha = Math.round((255 - maskValue) / 255 * alpha);
      overlay[idx] = r;
      overlay[idx + 1] = g;
      overlay[idx + 2] = b;
      overlay[idx + 3] = overlayAlpha;
    } else if (options.maskMode === 'quickMask') {
      // Red tint on non-selected
      overlay[idx] = 255;
      overlay[idx + 1] = 0;
      overlay[idx + 2] = 0;
      overlay[idx + 3] = Math.round((255 - maskValue) * 0.5);
    } else if (options.maskMode === 'rubyLith') {
      // Ruby overlay
      overlay[idx] = 180;
      overlay[idx + 1] = 20;
      overlay[idx + 2] = 50;
      overlay[idx + 3] = Math.round((255 - maskValue) * 0.7);
    }
  }
  
  ctx.putImageData(overlayData, 0, 0);
  
  // Draw marching ants
  if (options.showMarchingAnts) {
    drawMarchingAnts(ctx, mask, time);
  }
}

// =============================================================================
// ITEM 25: SELECTION STATISTICS
// =============================================================================

export interface SelectionStats {
  totalPixels: number;
  selectedPixels: number;
  percentSelected: number;
  bounds: SelectionBounds | null;
  centerOfMass: SelectionPoint | null;
  perimeter: number;
}

export function computeSelectionStats(mask: SelectionMask): SelectionStats {
  const { width, height, data } = mask;
  
  let selectedPixels = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let perimeter = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx] > 127) {
        selectedPixels++;
        sumX += x;
        sumY += y;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        // Count perimeter pixels
        if (isEdgePixel(data, width, height, x, y)) {
          perimeter++;
        }
      }
    }
  }
  
  const totalPixels = width * height;
  
  return {
    totalPixels,
    selectedPixels,
    percentSelected: (selectedPixels / totalPixels) * 100,
    bounds: selectedPixels > 0 ? {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    } : null,
    centerOfMass: selectedPixels > 0 ? {
      x: sumX / selectedPixels,
      y: sumY / selectedPixels
    } : null,
    perimeter
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function colorDistance(a: ColorSample, b: ColorSample): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function colorDistanceLAB(a: ColorSample, b: ColorSample): number {
  // Convert to LAB and compute delta E
  const labA = rgbToLab(a.r, a.g, a.b);
  const labB = rgbToLab(b.r, b.g, b.b);
  
  const dL = labA.L - labB.L;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  
  return Math.sqrt(dL * dL + da * da + db * db);
}

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  // RGB to XYZ
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  
  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;
  
  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.00000;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;
  
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  
  return {
    L: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function detectEdges(imageData: ImageData): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const edges = new Uint8ClampedArray(width * height);
  
  // Sobel operators
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0;
      let sumY = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const ki = (ky + 1) * 3 + (kx + 1);
          sumX += gray * gx[ki];
          sumY += gray * gy[ki];
        }
      }
      
      edges[y * width + x] = Math.min(255, Math.sqrt(sumX * sumX + sumY * sumY));
    }
  }
  
  return edges;
}

function computeSaliencyMap(imageData: ImageData): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const saliency = new Uint8ClampedArray(width * height);
  
  // Compute image average color
  let avgR = 0, avgG = 0, avgB = 0;
  for (let i = 0; i < width * height; i++) {
    avgR += data[i * 4];
    avgG += data[i * 4 + 1];
    avgB += data[i * 4 + 2];
  }
  avgR /= (width * height);
  avgG /= (width * height);
  avgB /= (width * height);
  
  // Saliency = distance from average
  for (let i = 0; i < width * height; i++) {
    const dr = data[i * 4] - avgR;
    const dg = data[i * 4 + 1] - avgG;
    const db = data[i * 4 + 2] - avgB;
    saliency[i] = Math.min(255, Math.sqrt(dr * dr + dg * dg + db * db));
  }
  
  return saliency;
}

function computeSharpnessMap(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const sharpness = new Float32Array(width * height);
  
  // Laplacian kernel
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const ki = (ky + 1) * 3 + (kx + 1);
          sum += gray * kernel[ki];
        }
      }
      
      sharpness[y * width + x] = Math.abs(sum);
    }
  }
  
  return sharpness;
}

function isSkyColor(r: number, g: number, b: number, includeClouds: boolean): boolean {
  // Blue sky detection
  const isBlueSky = b > r && b > g && b > 100 && (b - r) > 20;
  
  // Cloud detection (white/gray)
  const isCloud = includeClouds && 
    Math.abs(r - g) < 30 && 
    Math.abs(g - b) < 30 && 
    r > 180 && g > 180 && b > 180;
  
  // Sunset/sunrise colors
  const isSunset = r > 200 && g > 100 && b < 150;
  
  return isBlueSky || isCloud || isSunset;
}

function fillEnclosedRegions(mask: Uint8ClampedArray, width: number, height: number): void {
  // Flood fill from edges to find exterior
  const exterior = new Uint8ClampedArray(width * height);
  const queue: SelectionPoint[] = [];
  
  // Add edge pixels to queue
  for (let x = 0; x < width; x++) {
    if (mask[x] === 0) queue.push({ x, y: 0 });
    if (mask[(height - 1) * width + x] === 0) queue.push({ x, y: height - 1 });
  }
  for (let y = 0; y < height; y++) {
    if (mask[y * width] === 0) queue.push({ x: 0, y });
    if (mask[y * width + width - 1] === 0) queue.push({ x: width - 1, y });
  }
  
  // Flood fill exterior
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (exterior[idx] || mask[idx] > 0) continue;
    
    exterior[idx] = 1;
    queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  
  // Interior = not exterior
  for (let i = 0; i < width * height; i++) {
    if (!exterior[i]) mask[i] = 255;
  }
}

function dilateSelection(mask: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const temp = new Uint8ClampedArray(mask);
  
  for (let i = 0; i < amount; i++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        mask[idx] = Math.max(
          temp[idx],
          temp[idx - 1],
          temp[idx + 1],
          temp[idx - width],
          temp[idx + width]
        );
      }
    }
    temp.set(mask);
  }
}

function erodeSelection(mask: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const temp = new Uint8ClampedArray(mask);
  
  for (let i = 0; i < amount; i++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        mask[idx] = Math.min(
          temp[idx],
          temp[idx - 1],
          temp[idx + 1],
          temp[idx - width],
          temp[idx + width]
        );
      }
    }
    temp.set(mask);
  }
}

function smoothSelection(mask: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const kernel = createGaussianKernel(radius * 2 + 1, radius / 2);
  const temp = new Uint8ClampedArray(mask);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, weightSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const kx = x + k;
        if (kx >= 0 && kx < width) {
          sum += temp[y * width + kx] * kernel[k + radius];
          weightSum += kernel[k + radius];
        }
      }
      mask[y * width + x] = Math.round(sum / weightSum);
    }
  }
  
  temp.set(mask);
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, weightSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ky = y + k;
        if (ky >= 0 && ky < height) {
          sum += temp[ky * width + x] * kernel[k + radius];
          weightSum += kernel[k + radius];
        }
      }
      mask[y * width + x] = Math.round(sum / weightSum);
    }
  }
}

function createGaussianKernel(size: number, sigma: number): Float32Array {
  const kernel = new Float32Array(size);
  const center = Math.floor(size / 2);
  let sum = 0;
  
  for (let i = 0; i < size; i++) {
    const x = i - center;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  
  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

function preserveSelectionCorners(original: Uint8ClampedArray, modified: Uint8ClampedArray, width: number, height: number): void {
  // Detect corners in original and preserve them
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Check if this is a corner (high curvature)
      const neighbors = [
        original[idx - width - 1], original[idx - width], original[idx - width + 1],
        original[idx - 1], original[idx + 1],
        original[idx + width - 1], original[idx + width], original[idx + width + 1]
      ];
      
      const count = neighbors.filter(n => n > 127).length;
      if (count <= 3 || count >= 5) {
        modified[idx] = original[idx];
      }
    }
  }
}

function isEdgePixel(mask: Uint8ClampedArray, width: number, height: number, x: number, y: number): boolean {
  if (mask[y * width + x] <= 127) return false;
  
  // Check 4-neighbors
  const left = x > 0 ? mask[y * width + x - 1] : 0;
  const right = x < width - 1 ? mask[y * width + x + 1] : 0;
  const top = y > 0 ? mask[(y - 1) * width + x] : 0;
  const bottom = y < height - 1 ? mask[(y + 1) * width + x] : 0;
  
  return left <= 127 || right <= 127 || top <= 127 || bottom <= 127;
}

function traceContour(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  visited: Set<number>
): SelectionPoint[] {
  const path: SelectionPoint[] = [];
  let x = startX, y = startY;
  let dir = 0; // 0=right, 1=down, 2=left, 3=up
  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];
  
  do {
    path.push({ x, y });
    visited.add(y * width + x);
    
    // Find next direction (turn right first, then straight, then left)
    let found = false;
    for (let turn = -1; turn <= 2; turn++) {
      const newDir = (dir + turn + 4) % 4;
      const nx = x + dx[newDir];
      const ny = y + dy[newDir];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
          mask[ny * width + nx] > 127 && isEdgePixel(mask, width, height, nx, ny)) {
        x = nx;
        y = ny;
        dir = newDir;
        found = true;
        break;
      }
    }
    
    if (!found) break;
  } while (x !== startX || y !== startY);
  
  return path;
}

function simplifyPath(path: SelectionPoint[], tolerance: number): SelectionPoint[] {
  if (path.length < 3) return path;
  
  // Douglas-Peucker algorithm
  let maxDist = 0;
  let maxIdx = 0;
  
  const first = path[0];
  const last = path[path.length - 1];
  
  for (let i = 1; i < path.length - 1; i++) {
    const dist = pointLineDistance(path[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  
  if (maxDist > tolerance) {
    const left = simplifyPath(path.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(path.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  
  return [first, last];
}

function pointLineDistance(point: SelectionPoint, lineStart: SelectionPoint, lineEnd: SelectionPoint): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }
  
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

function fillPolygon(mask: Uint8ClampedArray, width: number, height: number, points: SelectionPoint[]): void {
  if (points.length < 3) return;
  
  // Scanline fill
  const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map(p => p.y))));
  
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const x = p1.x + (y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x);
        intersections.push(x);
      }
    }
    
    intersections.sort((a, b) => a - b);
    
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = Math.max(0, Math.ceil(intersections[i]));
      const x2 = Math.min(width - 1, Math.floor(intersections[i + 1]));
      
      for (let x = x1; x <= x2; x++) {
        mask[y * width + x] = 255;
      }
    }
  }
}

function detectLocalEdgeRadius(imageData: ImageData, point: SelectionPoint, maxRadius: number): number {
  const { width, height, data } = imageData;
  
  // Sample gradients at increasing radii
  for (let r = 1; r <= maxRadius; r++) {
    let maxGradient = 0;
    
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x = Math.round(point.x + Math.cos(angle) * r);
      const y = Math.round(point.y + Math.sin(angle) * r);
      
      if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue;
      
      const idx = (y * width + x) * 4;
      const idxR = (y * width + x + 1) * 4;
      const idxD = ((y + 1) * width + x) * 4;
      
      const gradX = Math.abs(data[idxR] - data[idx - 4]) +
                    Math.abs(data[idxR + 1] - data[idx - 4 + 1]) +
                    Math.abs(data[idxR + 2] - data[idx - 4 + 2]);
      const gradY = Math.abs(data[idxD] - data[idx - width * 4]) +
                    Math.abs(data[idxD + 1] - data[idx - width * 4 + 1]) +
                    Math.abs(data[idxD + 2] - data[idx - width * 4 + 2]);
      
      maxGradient = Math.max(maxGradient, gradX + gradY);
    }
    
    if (maxGradient > 100) return r;
  }
  
  return maxRadius;
}

function detectLocalEdge(imageData: ImageData, x: number, y: number, options: RefineEdgeOptions): number {
  const { width, height, data } = imageData;
  
  if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return 0;
  
  const idx = (y * width + x) * 4;
  
  // Compute gradient magnitude
  const gradX = Math.abs(data[idx + 4] - data[idx - 4]) +
                Math.abs(data[idx + 5] - data[idx - 3]) +
                Math.abs(data[idx + 6] - data[idx - 2]);
  const gradY = Math.abs(data[idx + width * 4] - data[idx - width * 4]) +
                Math.abs(data[idx + width * 4 + 1] - data[idx - width * 4 + 1]) +
                Math.abs(data[idx + width * 4 + 2] - data[idx - width * 4 + 2]);
  
  const gradient = Math.sqrt(gradX * gradX + gradY * gradY);
  
  // Apply contrast
  const contrastFactor = 1 + options.contrast / 50;
  const adjusted = Math.min(255, gradient * contrastFactor);
  
  return Math.round(adjusted);
}

function decontaminateEdges(mask: SelectionMask, imageData: ImageData, point: SelectionPoint, radius: number): void {
  // Remove color fringing at edges by analyzing neighboring colors
  // This is a simplified version - full implementation would use more sophisticated algorithms
  const { width, height, data } = imageData;
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = point.x + dx;
      const y = point.y + dy;
      
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const maskIdx = y * width + x;
      const maskValue = mask.data[maskIdx];
      
      // Only process edge pixels (partial selection)
      if (maskValue > 10 && maskValue < 245) {
        // Blend edge colors toward interior colors
        // This helps remove color fringing
        mask.data[maskIdx] = Math.round(maskValue * 0.95);
      }
    }
  }
}

function drawMarchingAnts(ctx: CanvasRenderingContext2D, mask: SelectionMask, time: number): void {
  const { width, height, data } = mask;
  
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -time * 0.1;
  
  ctx.beginPath();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] > 127 && isEdgePixel(data, width, height, x, y)) {
        ctx.rect(x, y, 1, 1);
      }
    }
  }
  
  ctx.stroke();
  ctx.restore();
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [255, 0, 0];
}

// =============================================================================
// EXPORTS
// =============================================================================

export const SelectionTools = {
  // Core selection creation
  createQuickSelect,
  createSubjectSelect,
  createSkySelect,
  createColorRangeSelect,
  createFocusAreaSelect,
  createSkinToneSelect,
  
  // Refine edge
  createRefineEdgeBrush,
  paintRefineEdge,
  
  // Selection modifications
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelectionEdges,
  createBorderSelection,
  growSelection,
  
  // Path conversion
  selectionToPath,
  pathToSelection,
  
  // Channels
  createSelectionChannel,
  loadSelectionFromChannel,
  
  // Operations
  combineSelections,
  invertSelectionMask,
  selectAll,
  deselectAll,
  
  // Transform
  transformSelection,
  
  // Visualization
  renderSelectionOverlay,
  
  // Statistics
  computeSelectionStats,
  
  // History
  SelectionHistory,
};

export default SelectionTools;
