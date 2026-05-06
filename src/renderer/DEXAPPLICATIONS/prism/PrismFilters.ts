// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - PRISM Advanced Filters System
// Professional image filters rivaling Photoshop/Affinity Photo
// Items 101-125 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface FilterResult {
  imageData: ImageData;
  processingTime: number;
}

export interface ConvolutionKernel {
  matrix: number[];
  size: number;
  divisor?: number;
  offset?: number;
}

// =============================================================================
// ITEM 101: GAUSSIAN BLUR
// =============================================================================

export function gaussianBlur(
  imageData: ImageData,
  radius: number,   // 0.1-250
  quality: 'fast' | 'high' = 'high'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  
  if (radius < 0.1) return result;
  
  if (quality === 'fast') {
    // Stack blur approximation (faster)
    return stackBlur(result, Math.round(radius));
  }
  
  // True Gaussian blur
  const kernel = createGaussianKernel(radius);
  return separableConvolve(result, kernel);
}

function createGaussianKernel(radius: number): number[] {
  const size = Math.ceil(radius * 3) * 2 + 1;
  const kernel: number[] = [];
  const sigma = radius / 2;
  let sum = 0;
  
  for (let i = 0; i < size; i++) {
    const x = i - Math.floor(size / 2);
    const g = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(g);
    sum += g;
  }
  
  // Normalize
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

function separableConvolve(imageData: ImageData, kernel: number[]): ImageData {
  const { data, width, height } = imageData;
  const temp = new Uint8ClampedArray(data);
  const halfSize = Math.floor(kernel.length / 2);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const kx = Math.min(width - 1, Math.max(0, x + k - halfSize));
        const idx = (y * width + kx) * 4;
        
        r += data[idx] * kernel[k];
        g += data[idx + 1] * kernel[k];
        b += data[idx + 2] * kernel[k];
        a += data[idx + 3] * kernel[k];
      }
      
      const idx = (y * width + x) * 4;
      temp[idx] = r;
      temp[idx + 1] = g;
      temp[idx + 2] = b;
      temp[idx + 3] = a;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const ky = Math.min(height - 1, Math.max(0, y + k - halfSize));
        const idx = (ky * width + x) * 4;
        
        r += temp[idx] * kernel[k];
        g += temp[idx + 1] * kernel[k];
        b += temp[idx + 2] * kernel[k];
        a += temp[idx + 3] * kernel[k];
      }
      
      const idx = (y * width + x) * 4;
      imageData.data[idx] = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
      imageData.data[idx + 3] = a;
    }
  }
  
  return imageData;
}

function stackBlur(imageData: ImageData, radius: number): ImageData {
  // Fast box blur approximation
  const passes = 3;
  const boxRadius = Math.ceil(radius / passes);
  
  for (let i = 0; i < passes; i++) {
    boxBlur(imageData, boxRadius);
  }
  
  return imageData;
}

function boxBlur(imageData: ImageData, radius: number): void {
  const { data, width, height } = imageData;
  const iarr = 1 / (radius + radius + 1);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      const ti = y * width * 4 + c;
      
      for (let i = -radius; i <= radius; i++) {
        const idx = ti + Math.max(0, Math.min(width - 1, i)) * 4;
        sum += data[idx];
      }
      
      for (let x = 0; x < width; x++) {
        data[ti + x * 4] = sum * iarr;
        
        const li = ti + Math.max(0, x - radius) * 4;
        const ri = ti + Math.min(width - 1, x + radius + 1) * 4;
        sum += data[ri] - data[li];
      }
    }
  }
  
  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      const ti = x * 4 + c;
      
      for (let i = -radius; i <= radius; i++) {
        const idx = ti + Math.max(0, Math.min(height - 1, i)) * width * 4;
        sum += data[idx];
      }
      
      for (let y = 0; y < height; y++) {
        data[ti + y * width * 4] = sum * iarr;
        
        const li = ti + Math.max(0, y - radius) * width * 4;
        const ri = ti + Math.min(height - 1, y + radius + 1) * width * 4;
        sum += data[ri] - data[li];
      }
    }
  }
}

// =============================================================================
// ITEM 102: MOTION BLUR
// =============================================================================

export function motionBlur(
  imageData: ImageData,
  angle: number,    // 0-360 degrees
  distance: number  // 1-2000 pixels
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const rad = angle * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const samples = Math.max(1, Math.round(distance));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;
      
      for (let i = 0; i < samples; i++) {
        const t = (i / samples - 0.5) * distance;
        const sx = Math.round(x + dx * t);
        const sy = Math.round(y + dy * t);
        
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const idx = (sy * width + sx) * 4;
          r += imageData.data[idx];
          g += imageData.data[idx + 1];
          b += imageData.data[idx + 2];
          a += imageData.data[idx + 3];
          count++;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
      data[idx + 3] = a / count;
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 103: RADIAL BLUR
// =============================================================================

export function radialBlur(
  imageData: ImageData,
  centerX: number,  // 0-1 normalized
  centerY: number,
  amount: number,   // 1-100
  quality: 'draft' | 'good' | 'best' = 'good'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = centerX * width;
  const cy = centerY * height;
  
  const samples = quality === 'draft' ? 8 : quality === 'good' ? 16 : 32;
  const strength = amount / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let i = 0; i < samples; i++) {
        const t = (i / samples) * strength * dist / 100;
        const angle = Math.atan2(dy, dx);
        const sx = Math.round(cx + Math.cos(angle) * (dist - t));
        const sy = Math.round(cy + Math.sin(angle) * (dist - t));
        
        const csx = Math.max(0, Math.min(width - 1, sx));
        const csy = Math.max(0, Math.min(height - 1, sy));
        const idx = (csy * width + csx) * 4;
        
        r += imageData.data[idx];
        g += imageData.data[idx + 1];
        b += imageData.data[idx + 2];
        a += imageData.data[idx + 3];
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = r / samples;
      data[idx + 1] = g / samples;
      data[idx + 2] = b / samples;
      data[idx + 3] = a / samples;
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 104: LENS BLUR (DEPTH OF FIELD)
// =============================================================================

export function lensBlur(
  imageData: ImageData,
  radius: number,        // 1-100
  brightness: number,    // 0-100 (specular highlights)
  threshold: number,     // 0-255
  bladeCount: number,    // 3-12 (iris blades)
  rotation: number       // 0-360
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  // Create bokeh kernel (aperture shape)
  const kernelSize = Math.ceil(radius * 2) + 1;
  const kernel = createBokehKernel(kernelSize, bladeCount, rotation);
  const halfKernel = Math.floor(kernelSize / 2);
  
  const brightnessFactor = 1 + brightness / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let weightSum = 0;
      
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const weight = kernel[ky * kernelSize + kx];
          if (weight === 0) continue;
          
          const sx = Math.max(0, Math.min(width - 1, x + kx - halfKernel));
          const sy = Math.max(0, Math.min(height - 1, y + ky - halfKernel));
          const idx = (sy * width + sx) * 4;
          
          // Boost bright pixels (specular highlights)
          const lum = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
          const boost = lum > threshold ? brightnessFactor : 1;
          
          r += imageData.data[idx] * weight * boost;
          g += imageData.data[idx + 1] * weight * boost;
          b += imageData.data[idx + 2] * weight * boost;
          a += imageData.data[idx + 3] * weight;
          weightSum += weight * boost;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = Math.min(255, r / weightSum);
      data[idx + 1] = Math.min(255, g / weightSum);
      data[idx + 2] = Math.min(255, b / weightSum);
      data[idx + 3] = a / weightSum;
    }
  }
  
  return result;
}

function createBokehKernel(size: number, blades: number, rotation: number): Float32Array {
  const kernel = new Float32Array(size * size);
  const center = size / 2;
  const radius = center - 1;
  const rotRad = rotation * Math.PI / 180;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // Check if inside polygon (aperture blades)
        const angle = Math.atan2(dy, dx) + rotRad;
        const polyRadius = radius / Math.cos(Math.PI / blades - Math.abs((angle % (2 * Math.PI / blades)) - Math.PI / blades));
        
        if (dist <= Math.min(radius, polyRadius)) {
          kernel[y * size + x] = 1;
        }
      }
    }
  }
  
  return kernel;
}

// =============================================================================
// ITEM 105: SHARPEN
// =============================================================================

export function sharpen(
  imageData: ImageData,
  amount: number,   // 0-500
  radius: number,   // 0.1-1000
  threshold: number // 0-255
): ImageData {
  // Unsharp mask
  const blurred = gaussianBlur(
    new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height),
    radius,
    'fast'
  );
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const blurData = blurred.data;
  
  const factor = amount / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = data[i + c] - blurData[i + c];
      
      // Apply threshold
      if (Math.abs(diff) > threshold) {
        data[i + c] = clamp(data[i + c] + diff * factor);
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 106: HIGH PASS
// =============================================================================

export function highPass(imageData: ImageData, radius: number): ImageData {
  const blurred = gaussianBlur(
    new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height),
    radius,
    'fast'
  );
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const blurData = blurred.data;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp((data[i] - blurData[i]) + 128);
    data[i + 1] = clamp((data[i + 1] - blurData[i + 1]) + 128);
    data[i + 2] = clamp((data[i + 2] - blurData[i + 2]) + 128);
  }
  
  return result;
}

// =============================================================================
// ITEM 107: EMBOSS
// =============================================================================

export function emboss(
  imageData: ImageData,
  angle: number,    // 0-360
  height: number,   // 1-10
  amount: number    // 1-500
): ImageData {
  const rad = angle * Math.PI / 180;
  const dx = Math.round(Math.cos(rad) * height);
  const dy = Math.round(Math.sin(rad) * height);
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height: h } = imageData;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const x1 = Math.max(0, Math.min(width - 1, x - dx));
      const y1 = Math.max(0, Math.min(h - 1, y - dy));
      const x2 = Math.max(0, Math.min(width - 1, x + dx));
      const y2 = Math.max(0, Math.min(h - 1, y + dy));
      
      const idx1 = (y1 * width + x1) * 4;
      const idx2 = (y2 * width + x2) * 4;
      
      for (let c = 0; c < 3; c++) {
        const diff = (imageData.data[idx2 + c] - imageData.data[idx1 + c]) * (amount / 100);
        data[idx + c] = clamp(128 + diff);
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 108: FIND EDGES
// =============================================================================

export function findEdges(imageData: ImageData, method: 'sobel' | 'prewitt' | 'laplacian' = 'sobel'): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  let kernelX: number[], kernelY: number[];
  
  switch (method) {
    case 'sobel':
      kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      break;
    case 'prewitt':
      kernelX = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
      kernelY = [-1, -1, -1, 0, 0, 0, 1, 1, 1];
      break;
    case 'laplacian':
      kernelX = [0, 1, 0, 1, -4, 1, 0, 1, 0];
      kernelY = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // Not used
      break;
  }
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
          const ki = (ky + 1) * 3 + (kx + 1);
          
          gx += gray * kernelX[ki];
          if (method !== 'laplacian') {
            gy += gray * kernelY[ki];
          }
        }
      }
      
      const magnitude = method === 'laplacian' 
        ? Math.abs(gx)
        : Math.sqrt(gx * gx + gy * gy);
      
      const idx = (y * width + x) * 4;
      data[idx] = clamp(magnitude);
      data[idx + 1] = clamp(magnitude);
      data[idx + 2] = clamp(magnitude);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 109: OIL PAINT
// =============================================================================

export function oilPaint(
  imageData: ImageData,
  radius: number,        // 1-5
  smoothness: number     // 1-255
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const intRadius = Math.ceil(radius);
  const levels = Math.max(1, Math.min(256, smoothness));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const intensityCount = new Int32Array(levels);
      const averageR = new Float32Array(levels);
      const averageG = new Float32Array(levels);
      const averageB = new Float32Array(levels);
      
      for (let ky = -intRadius; ky <= intRadius; ky++) {
        for (let kx = -intRadius; kx <= intRadius; kx++) {
          const sx = Math.max(0, Math.min(width - 1, x + kx));
          const sy = Math.max(0, Math.min(height - 1, y + ky));
          const idx = (sy * width + sx) * 4;
          
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          
          const intensity = Math.floor((r + g + b) / 3 * (levels - 1) / 255);
          
          intensityCount[intensity]++;
          averageR[intensity] += r;
          averageG[intensity] += g;
          averageB[intensity] += b;
        }
      }
      
      // Find most frequent intensity
      let maxCount = 0;
      let maxIndex = 0;
      for (let i = 0; i < levels; i++) {
        if (intensityCount[i] > maxCount) {
          maxCount = intensityCount[i];
          maxIndex = i;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = averageR[maxIndex] / maxCount;
      data[idx + 1] = averageG[maxIndex] / maxCount;
      data[idx + 2] = averageB[maxIndex] / maxCount;
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 110: PIXELATE
// =============================================================================

export function pixelate(imageData: ImageData, cellSize: number): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const size = Math.max(1, Math.round(cellSize));
  
  for (let cellY = 0; cellY < height; cellY += size) {
    for (let cellX = 0; cellX < width; cellX += size) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      
      // Average colors in cell
      for (let y = cellY; y < cellY + size && y < height; y++) {
        for (let x = cellX; x < cellX + size && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += imageData.data[idx];
          g += imageData.data[idx + 1];
          b += imageData.data[idx + 2];
          a += imageData.data[idx + 3];
          count++;
        }
      }
      
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      a = Math.round(a / count);
      
      // Fill cell
      for (let y = cellY; y < cellY + size && y < height; y++) {
        for (let x = cellX; x < cellX + size && x < width; x++) {
          const idx = (y * width + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 111: CRYSTALLIZE
// =============================================================================

export function crystallize(imageData: ImageData, cellSize: number): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  // Generate Voronoi cells
  const numCells = Math.floor((width * height) / (cellSize * cellSize));
  const seeds: { x: number; y: number; r: number; g: number; b: number; a: number }[] = [];
  
  for (let i = 0; i < numCells; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const idx = (y * width + x) * 4;
    
    seeds.push({
      x, y,
      r: imageData.data[idx],
      g: imageData.data[idx + 1],
      b: imageData.data[idx + 2],
      a: imageData.data[idx + 3]
    });
  }
  
  // Assign each pixel to nearest seed
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let nearest = seeds[0];
      
      for (const seed of seeds) {
        const dx = x - seed.x;
        const dy = y - seed.y;
        const dist = dx * dx + dy * dy;
        
        if (dist < minDist) {
          minDist = dist;
          nearest = seed;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = nearest.r;
      data[idx + 1] = nearest.g;
      data[idx + 2] = nearest.b;
      data[idx + 3] = nearest.a;
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 112: NOISE (ADD)
// =============================================================================

export function addNoise(
  imageData: ImageData,
  amount: number,     // 0-100
  distribution: 'uniform' | 'gaussian' = 'gaussian',
  monochromatic: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  
  const strength = amount * 2.55;
  
  for (let i = 0; i < data.length; i += 4) {
    let noiseR: number, noiseG: number, noiseB: number;
    
    if (distribution === 'gaussian') {
      // Box-Muller transform for Gaussian
      const u1 = Math.random();
      const u2 = Math.random();
      const mag = strength * Math.sqrt(-2 * Math.log(u1));
      noiseR = mag * Math.cos(2 * Math.PI * u2);
      
      if (monochromatic) {
        noiseG = noiseB = noiseR;
      } else {
        noiseG = mag * Math.sin(2 * Math.PI * u2);
        const u3 = Math.random();
        const u4 = Math.random();
        noiseB = strength * Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
      }
    } else {
      noiseR = (Math.random() - 0.5) * 2 * strength;
      if (monochromatic) {
        noiseG = noiseB = noiseR;
      } else {
        noiseG = (Math.random() - 0.5) * 2 * strength;
        noiseB = (Math.random() - 0.5) * 2 * strength;
      }
    }
    
    data[i] = clamp(data[i] + noiseR);
    data[i + 1] = clamp(data[i + 1] + noiseG);
    data[i + 2] = clamp(data[i + 2] + noiseB);
  }
  
  return result;
}

// =============================================================================
// ITEM 113: DENOISE (REDUCE NOISE)
// =============================================================================

export function denoise(
  imageData: ImageData,
  strength: number,     // 0-10
  preserveDetail: number // 0-100
): ImageData {
  // Non-local means denoising (simplified)
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const patchSize = 3;
  const searchSize = 7;
  const halfPatch = Math.floor(patchSize / 2);
  const halfSearch = Math.floor(searchSize / 2);
  const h2 = strength * strength * 100;
  const detailFactor = 1 - preserveDetail / 100;
  
  for (let y = halfPatch; y < height - halfPatch; y++) {
    for (let x = halfPatch; x < width - halfPatch; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;
      
      for (let sy = -halfSearch; sy <= halfSearch; sy++) {
        for (let sx = -halfSearch; sx <= halfSearch; sx++) {
          const ny = y + sy;
          const nx = x + sx;
          
          if (ny < halfPatch || ny >= height - halfPatch ||
              nx < halfPatch || nx >= width - halfPatch) continue;
          
          // Calculate patch distance
          let dist = 0;
          for (let py = -halfPatch; py <= halfPatch; py++) {
            for (let px = -halfPatch; px <= halfPatch; px++) {
              const idx1 = ((y + py) * width + (x + px)) * 4;
              const idx2 = ((ny + py) * width + (nx + px)) * 4;
              
              for (let c = 0; c < 3; c++) {
                const d = imageData.data[idx1 + c] - imageData.data[idx2 + c];
                dist += d * d;
              }
            }
          }
          
          const weight = Math.exp(-dist / h2);
          const idx = (ny * width + nx) * 4;
          
          sumR += imageData.data[idx] * weight;
          sumG += imageData.data[idx + 1] * weight;
          sumB += imageData.data[idx + 2] * weight;
          sumWeight += weight;
        }
      }
      
      const idx = (y * width + x) * 4;
      const filtered = {
        r: sumR / sumWeight,
        g: sumG / sumWeight,
        b: sumB / sumWeight
      };
      
      // Blend with original based on detail preservation
      data[idx] = imageData.data[idx] * (1 - detailFactor) + filtered.r * detailFactor;
      data[idx + 1] = imageData.data[idx + 1] * (1 - detailFactor) + filtered.g * detailFactor;
      data[idx + 2] = imageData.data[idx + 2] * (1 - detailFactor) + filtered.b * detailFactor;
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 114: GRAIN
// =============================================================================

export function addGrain(
  imageData: ImageData,
  intensity: number,  // 0-100
  size: number,       // 1-100 (grain size)
  softness: number    // 0-100
): ImageData {
  // First generate grain pattern
  const grainWidth = Math.ceil(imageData.width / Math.max(1, size / 10));
  const grainHeight = Math.ceil(imageData.height / Math.max(1, size / 10));
  
  const grain = new Float32Array(grainWidth * grainHeight);
  for (let i = 0; i < grain.length; i++) {
    grain[i] = (Math.random() - 0.5) * 2;
  }
  
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const strength = intensity * 2.55;
  const soft = softness / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sample grain with bilinear interpolation
      const gx = x * grainWidth / width;
      const gy = y * grainHeight / height;
      
      const gx0 = Math.floor(gx);
      const gy0 = Math.floor(gy);
      const gx1 = Math.min(grainWidth - 1, gx0 + 1);
      const gy1 = Math.min(grainHeight - 1, gy0 + 1);
      
      const fx = gx - gx0;
      const fy = gy - gy0;
      
      const g00 = grain[gy0 * grainWidth + gx0];
      const g10 = grain[gy0 * grainWidth + gx1];
      const g01 = grain[gy1 * grainWidth + gx0];
      const g11 = grain[gy1 * grainWidth + gx1];
      
      const grainValue = g00 * (1 - fx) * (1 - fy) +
                         g10 * fx * (1 - fy) +
                         g01 * (1 - fx) * fy +
                         g11 * fx * fy;
      
      const noise = grainValue * strength;
      const idx = (y * width + x) * 4;
      
      // Apply grain more to midtones (film-like)
      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const midtoneFactor = 1 - Math.abs(lum - 128) / 128 * soft;
      
      data[idx] = clamp(data[idx] + noise * midtoneFactor);
      data[idx + 1] = clamp(data[idx + 1] + noise * midtoneFactor);
      data[idx + 2] = clamp(data[idx + 2] + noise * midtoneFactor);
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 115: VIGNETTE
// =============================================================================

export function vignette(
  imageData: ImageData,
  amount: number,     // -100 to 100
  midpoint: number,   // 0-100
  roundness: number,  // -100 to 100
  feather: number,    // 0-100
  highlight: number   // 0-100
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  
  const midpointNorm = midpoint / 100;
  const featherNorm = Math.max(0.01, feather / 100);
  const roundnessNorm = 1 + roundness / 100;
  const amountNorm = amount / 100;
  const highlightNorm = highlight / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy * roundnessNorm;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate vignette factor
      let factor = (dist - midpointNorm) / featherNorm;
      factor = Math.max(0, Math.min(1, factor));
      factor = factor * factor * (3 - 2 * factor); // Smoothstep
      
      const idx = (y * width + x) * 4;
      
      if (amountNorm < 0) {
        // Darken
        const darken = 1 + amountNorm * factor;
        data[idx] = clamp(data[idx] * darken);
        data[idx + 1] = clamp(data[idx + 1] * darken);
        data[idx + 2] = clamp(data[idx + 2] * darken);
      } else {
        // Lighten (highlight mode)
        const lighten = amountNorm * factor * highlightNorm;
        data[idx] = clamp(data[idx] + (255 - data[idx]) * lighten);
        data[idx + 1] = clamp(data[idx + 1] + (255 - data[idx + 1]) * lighten);
        data[idx + 2] = clamp(data[idx + 2] + (255 - data[idx + 2]) * lighten);
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 116: CHROMATIC ABERRATION
// =============================================================================

export function chromaticAberration(
  imageData: ImageData,
  redOffset: { x: number; y: number },
  blueOffset: { x: number; y: number },
  radial: boolean = true
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      let redOffsetX = redOffset.x;
      let redOffsetY = redOffset.y;
      let blueOffsetX = blueOffset.x;
      let blueOffsetY = blueOffset.y;
      
      if (radial) {
        // Scale offset by distance from center
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        
        redOffsetX *= dist;
        redOffsetY *= dist;
        blueOffsetX *= dist;
        blueOffsetY *= dist;
      }
      
      // Sample red channel
      const rx = Math.round(x + redOffsetX);
      const ry = Math.round(y + redOffsetY);
      if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
        data[idx] = imageData.data[(ry * width + rx) * 4];
      }
      
      // Green stays in place
      data[idx + 1] = imageData.data[idx + 1];
      
      // Sample blue channel
      const bx = Math.round(x + blueOffsetX);
      const by = Math.round(y + blueOffsetY);
      if (bx >= 0 && bx < width && by >= 0 && by < height) {
        data[idx + 2] = imageData.data[(by * width + bx) * 4 + 2];
      }
      
      data[idx + 3] = imageData.data[idx + 3];
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 117: LENS DISTORTION
// =============================================================================

export function lensDistortion(
  imageData: ImageData,
  distortion: number,      // -100 to 100 (barrel to pincushion)
  verticalPerspective: number,
  horizontalPerspective: number,
  scale: number            // 50-150
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  
  const k = distortion / 100;
  const vPersp = verticalPerspective / 100;
  const hPersp = horizontalPerspective / 100;
  const scaleFactor = scale / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalize coordinates to -1 to 1
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      
      const r2 = nx * nx + ny * ny;
      
      // Apply barrel/pincushion distortion
      const distFactor = 1 + k * r2;
      
      // Apply distortion
      let sx = nx * distFactor;
      let sy = ny * distFactor;
      
      // Apply perspective
      const perspFactor = 1 / (1 + vPersp * sy + hPersp * sx);
      sx *= perspFactor;
      sy *= perspFactor;
      
      // Apply scale
      sx /= scaleFactor;
      sy /= scaleFactor;
      
      // Convert back to pixel coordinates
      const srcX = sx * cx + cx;
      const srcY = sy * cy + cy;
      
      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const fx = srcX - x0;
        const fy = srcY - y0;
        
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = imageData.data[(y0 * width + x0) * 4 + c];
          const v10 = imageData.data[(y0 * width + x1) * 4 + c];
          const v01 = imageData.data[(y1 * width + x0) * 4 + c];
          const v11 = imageData.data[(y1 * width + x1) * 4 + c];
          
          data[idx + c] = v00 * (1 - fx) * (1 - fy) +
                          v10 * fx * (1 - fy) +
                          v01 * (1 - fx) * fy +
                          v11 * fx * fy;
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 118: PERSPECTIVE WARP
// =============================================================================

export function perspectiveWarp(
  imageData: ImageData,
  corners: { tl: { x: number; y: number }; tr: { x: number; y: number }; 
             bl: { x: number; y: number }; br: { x: number; y: number } }
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  // Calculate perspective transform matrix
  const srcCorners = [
    [0, 0], [width, 0], [0, height], [width, height]
  ];
  const dstCorners = [
    [corners.tl.x, corners.tl.y],
    [corners.tr.x, corners.tr.y],
    [corners.bl.x, corners.bl.y],
    [corners.br.x, corners.br.y]
  ];
  
  // Inverse transform for each destination pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Bilinear interpolation of source position
      const u = x / width;
      const v = y / height;
      
      const srcX = (1 - v) * ((1 - u) * 0 + u * width) + v * ((1 - u) * 0 + u * width);
      const srcY = (1 - u) * ((1 - v) * 0 + v * height) + u * ((1 - v) * 0 + v * height);
      
      // More accurate perspective transform would use homogeneous coordinates
      // This is simplified bilinear interpolation
      
      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const fx = srcX - x0;
        const fy = srcY - y0;
        
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = imageData.data[(y0 * width + x0) * 4 + c];
          const v10 = imageData.data[(y0 * width + x0 + 1) * 4 + c];
          const v01 = imageData.data[((y0 + 1) * width + x0) * 4 + c];
          const v11 = imageData.data[((y0 + 1) * width + x0 + 1) * 4 + c];
          
          data[idx + c] = v00 * (1 - fx) * (1 - fy) +
                          v10 * fx * (1 - fy) +
                          v01 * (1 - fx) * fy +
                          v11 * fx * fy;
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 119: LIQUIFY
// =============================================================================

export function liquify(
  imageData: ImageData,
  tool: 'push' | 'expand' | 'contract' | 'twist',
  centerX: number,
  centerY: number,
  radius: number,
  strength: number,
  angle?: number  // For twist
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const strengthNorm = strength / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < radius && dist > 0) {
        const factor = Math.pow(1 - dist / radius, 2) * strengthNorm;
        let srcX = x, srcY = y;
        
        switch (tool) {
          case 'push':
            srcX = x - dx * factor;
            srcY = y - dy * factor;
            break;
          case 'expand':
            srcX = centerX + dx / (1 + factor);
            srcY = centerY + dy / (1 + factor);
            break;
          case 'contract':
            srcX = centerX + dx * (1 + factor);
            srcY = centerY + dy * (1 + factor);
            break;
          case 'twist':
            const twistAngle = factor * (angle || Math.PI / 4);
            srcX = centerX + dx * Math.cos(twistAngle) - dy * Math.sin(twistAngle);
            srcY = centerY + dx * Math.sin(twistAngle) + dy * Math.cos(twistAngle);
            break;
        }
        
        if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const fx = srcX - x0;
          const fy = srcY - y0;
          
          const idx = (y * width + x) * 4;
          
          for (let c = 0; c < 4; c++) {
            const v00 = imageData.data[(y0 * width + x0) * 4 + c];
            const v10 = imageData.data[(y0 * width + x0 + 1) * 4 + c];
            const v01 = imageData.data[((y0 + 1) * width + x0) * 4 + c];
            const v11 = imageData.data[((y0 + 1) * width + x0 + 1) * 4 + c];
            
            data[idx + c] = v00 * (1 - fx) * (1 - fy) +
                            v10 * fx * (1 - fy) +
                            v01 * (1 - fx) * fy +
                            v11 * fx * fy;
          }
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 120: SPHERIZE
// =============================================================================

export function spherize(
  imageData: ImageData,
  amount: number,     // -100 to 100
  mode: 'normal' | 'horizontal' | 'vertical' = 'normal'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = width / 2;
  const cy = height / 2;
  const amountNorm = amount / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      
      let factor: number;
      
      switch (mode) {
        case 'horizontal':
          factor = Math.sqrt(1 - nx * nx * amountNorm);
          break;
        case 'vertical':
          factor = Math.sqrt(1 - ny * ny * amountNorm);
          break;
        default:
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) {
            const idx = (y * width + x) * 4;
            for (let c = 0; c < 4; c++) {
              data[idx + c] = imageData.data[idx + c];
            }
            continue;
          }
          factor = Math.sqrt(1 - r2 * amountNorm);
      }
      
      let srcX: number, srcY: number;
      
      if (mode === 'horizontal') {
        srcX = cx + nx / factor * cx;
        srcY = y;
      } else if (mode === 'vertical') {
        srcX = x;
        srcY = cy + ny / factor * cy;
      } else {
        srcX = cx + nx / factor * cx;
        srcY = cy + ny / factor * cy;
      }
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        for (let c = 0; c < 4; c++) {
          data[idx + c] = imageData.data[srcIdx + c];
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 121: POLAR COORDINATES
// =============================================================================

export function polarCoordinates(
  imageData: ImageData,
  direction: 'rectangular-to-polar' | 'polar-to-rectangular'
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let srcX: number, srcY: number;
      
      if (direction === 'rectangular-to-polar') {
        // Input: angle (x) and radius (y)
        const angle = (x / width) * 2 * Math.PI - Math.PI;
        const radius = (y / height) * maxRadius;
        
        srcX = cx + radius * Math.cos(angle);
        srcY = cy + radius * Math.sin(angle);
      } else {
        // Input: x, y -> Output: angle, radius
        const dx = x - cx;
        const dy = y - cy;
        const angle = Math.atan2(dy, dx);
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        srcX = ((angle + Math.PI) / (2 * Math.PI)) * width;
        srcY = (radius / maxRadius) * height;
      }
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        for (let c = 0; c < 4; c++) {
          data[idx + c] = imageData.data[srcIdx + c];
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 122: DISPLACE
// =============================================================================

export function displace(
  imageData: ImageData,
  displacementMap: ImageData,
  horizontalScale: number,  // -999 to 999
  verticalScale: number,
  wrap: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sample displacement map (scaled to image size if different)
      const mapX = Math.floor(x * displacementMap.width / width);
      const mapY = Math.floor(y * displacementMap.height / height);
      const mapIdx = (mapY * displacementMap.width + mapX) * 4;
      
      // Red channel controls horizontal, green controls vertical
      const dispX = (displacementMap.data[mapIdx] / 255 - 0.5) * 2 * horizontalScale;
      const dispY = (displacementMap.data[mapIdx + 1] / 255 - 0.5) * 2 * verticalScale;
      
      let srcX = x + dispX;
      let srcY = y + dispY;
      
      if (wrap) {
        srcX = ((srcX % width) + width) % width;
        srcY = ((srcY % height) + height) % height;
      }
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        for (let c = 0; c < 4; c++) {
          data[idx + c] = imageData.data[srcIdx + c];
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 123: TILE
// =============================================================================

export function tile(
  imageData: ImageData,
  tilesX: number,
  tilesY: number,
  offset: number = 0  // Percentage offset for alternating rows
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const tileWidth = width / tilesX;
  const tileHeight = height / tilesY;
  const offsetPixels = (offset / 100) * tileWidth;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tileRow = Math.floor(y / tileHeight);
      const rowOffset = (tileRow % 2) * offsetPixels;
      
      const srcX = ((x + rowOffset) % tileWidth) / tileWidth * width;
      const srcY = (y % tileHeight) / tileHeight * height;
      
      const idx = (y * width + x) * 4;
      const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
      
      for (let c = 0; c < 4; c++) {
        data[idx + c] = imageData.data[srcIdx + c];
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 124: RIPPLE/WAVE
// =============================================================================

export function wave(
  imageData: ImageData,
  amplitudeX: number,   // 1-999
  amplitudeY: number,
  wavelengthX: number,  // 1-999
  wavelengthY: number,
  type: 'sine' | 'triangle' | 'square' = 'sine',
  wrap: boolean = false
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data.fill(0)),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const waveFunction = (t: number): number => {
    const normalized = (t % 1 + 1) % 1;
    switch (type) {
      case 'sine':
        return Math.sin(normalized * 2 * Math.PI);
      case 'triangle':
        return Math.abs(normalized * 4 - 2) - 1;
      case 'square':
        return normalized < 0.5 ? 1 : -1;
    }
  };
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dispX = waveFunction(y / wavelengthY) * amplitudeX;
      const dispY = waveFunction(x / wavelengthX) * amplitudeY;
      
      let srcX = x + dispX;
      let srcY = y + dispY;
      
      if (wrap) {
        srcX = ((srcX % width) + width) % width;
        srcY = ((srcY % height) + height) % height;
      }
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        for (let c = 0; c < 4; c++) {
          data[idx + c] = imageData.data[srcIdx + c];
        }
      }
    }
  }
  
  return result;
}

// =============================================================================
// ITEM 125: CUSTOM CONVOLUTION
// =============================================================================

export function convolve(
  imageData: ImageData,
  kernel: ConvolutionKernel
): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  const data = result.data;
  const { width, height } = imageData;
  
  const { matrix, size, divisor = 1, offset = 0 } = kernel;
  const halfSize = Math.floor(size / 2);
  
  for (let y = halfSize; y < height - halfSize; y++) {
    for (let x = halfSize; x < width - halfSize; x++) {
      let r = 0, g = 0, b = 0;
      
      for (let ky = 0; ky < size; ky++) {
        for (let kx = 0; kx < size; kx++) {
          const idx = ((y + ky - halfSize) * width + (x + kx - halfSize)) * 4;
          const weight = matrix[ky * size + kx];
          
          r += imageData.data[idx] * weight;
          g += imageData.data[idx + 1] * weight;
          b += imageData.data[idx + 2] * weight;
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = clamp(r / divisor + offset);
      data[idx + 1] = clamp(g / divisor + offset);
      data[idx + 2] = clamp(b / divisor + offset);
    }
  }
  
  return result;
}

// Common convolution kernels
export const CONVOLUTION_KERNELS = {
  sharpen: {
    matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    size: 3
  },
  sharpenMore: {
    matrix: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
    size: 3
  },
  blur: {
    matrix: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    size: 3,
    divisor: 9
  },
  embossLight: {
    matrix: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    size: 3
  },
  edgeDetect: {
    matrix: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    size: 3
  },
  relief: {
    matrix: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    size: 3,
    offset: 128
  }
};

// =============================================================================
// UTILITY
// =============================================================================

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// =============================================================================
// ITEMS 161-165: AI IMAGE TOOLS
// =============================================================================

export interface AIImageTool {
  id: string;
  name: string;
  description: string;
  category: 'enhancement' | 'generation' | 'editing' | 'analysis';
  inputType: 'image' | 'mask' | 'both';
  outputType: 'image' | 'mask' | 'data';
}

export const AI_IMAGE_TOOLS: AIImageTool[] = [
  {
    id: 'background-removal',
    name: 'Background Removal',
    description: 'AI-powered automatic background removal',
    category: 'editing',
    inputType: 'image',
    outputType: 'mask',
  },
  {
    id: 'object-selection',
    name: 'Smart Object Selection',
    description: 'Select objects with a single click',
    category: 'editing',
    inputType: 'image',
    outputType: 'mask',
  },
  {
    id: 'content-aware-fill',
    name: 'Content-Aware Fill',
    description: 'Intelligently fill selected areas',
    category: 'editing',
    inputType: 'both',
    outputType: 'image',
  },
  {
    id: 'super-resolution',
    name: 'AI Upscaling',
    description: 'Upscale images with AI enhancement',
    category: 'enhancement',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'noise-reduction-ai',
    name: 'AI Noise Reduction',
    description: 'Advanced AI-powered noise removal',
    category: 'enhancement',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'face-enhancement',
    name: 'Face Enhancement',
    description: 'Enhance facial features and skin',
    category: 'enhancement',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'style-transfer',
    name: 'Style Transfer',
    description: 'Apply artistic styles to images',
    category: 'generation',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'colorize',
    name: 'AI Colorization',
    description: 'Automatically colorize black and white images',
    category: 'generation',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'depth-estimation',
    name: 'Depth Map',
    description: 'Generate depth maps from images',
    category: 'analysis',
    inputType: 'image',
    outputType: 'image',
  },
  {
    id: 'image-segmentation',
    name: 'Semantic Segmentation',
    description: 'Segment image into meaningful regions',
    category: 'analysis',
    inputType: 'image',
    outputType: 'mask',
  },
];

// =============================================================================
// ITEMS 166-170: SMART ADJUSTMENTS
// =============================================================================

export interface SmartAdjustment {
  id: string;
  name: string;
  description: string;
  category: 'auto' | 'preset' | 'creative';
  apply: (imageData: ImageData) => ImageData;
}

export const SMART_ADJUSTMENTS: SmartAdjustment[] = [
  {
    id: 'auto-enhance',
    name: 'Auto Enhance',
    description: 'Automatically improve contrast, colors, and sharpness',
    category: 'auto',
    apply: (imageData) => {
      // Auto levels + slight saturation boost + subtle sharpening
      let result = autoLevels(imageData);
      result = adjustSaturation(result, 1.1);
      result = sharpen(result, 30, 1, 0); // amount=30, radius=1, threshold=0
      return result;
    },
  },
  {
    id: 'auto-color',
    name: 'Auto Color',
    description: 'Automatically correct color cast',
    category: 'auto',
    apply: autoWhiteBalance,
  },
  {
    id: 'auto-contrast',
    name: 'Auto Contrast',
    description: 'Automatically optimize contrast',
    category: 'auto',
    apply: autoContrast,
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Boost colors while protecting skin tones',
    category: 'preset',
    apply: (imageData) => adjustVibrance(imageData, 40),
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    description: 'High contrast with rich blacks',
    category: 'preset',
    apply: (imageData) => {
      let result = adjustCurves(imageData, [[0, 0], [64, 40], [192, 220], [255, 255]]);
      result = adjustSaturation(result, 1.15);
      return result;
    },
  },
  {
    id: 'matte',
    name: 'Matte',
    description: 'Lifted blacks for a matte film look',
    category: 'creative',
    apply: (imageData) => {
      return adjustCurves(imageData, [[0, 20], [255, 240]]);
    },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Faded vintage photo look',
    category: 'creative',
    apply: (imageData) => {
      let result = adjustSaturation(imageData, 0.8);
      result = adjustCurves(result, [[0, 15], [128, 135], [255, 245]]);
      result = applyColorTint(result, '#ffe4c4', 0.1);
      return result;
    },
  },
];

function autoLevels(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Find min/max for each channel
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    rMin = Math.min(rMin, data[i]);
    rMax = Math.max(rMax, data[i]);
    gMin = Math.min(gMin, data[i + 1]);
    gMax = Math.max(gMax, data[i + 1]);
    bMin = Math.min(bMin, data[i + 2]);
    bMax = Math.max(bMax, data[i + 2]);
  }
  
  const rRange = rMax - rMin || 1;
  const gRange = gMax - gMin || 1;
  const bRange = bMax - bMin || 1;
  
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = clamp(((result.data[i] - rMin) / rRange) * 255);
    result.data[i + 1] = clamp(((result.data[i + 1] - gMin) / gRange) * 255);
    result.data[i + 2] = clamp(((result.data[i + 2] - bMin) / bRange) * 255);
  }
  
  return result;
}

function autoWhiteBalance(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  let rSum = 0, gSum = 0, bSum = 0;
  const pixels = width * height;
  
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  
  const rAvg = rSum / pixels;
  const gAvg = gSum / pixels;
  const bAvg = bSum / pixels;
  const gray = (rAvg + gAvg + bAvg) / 3;
  
  const rScale = gray / (rAvg || 1);
  const gScale = gray / (gAvg || 1);
  const bScale = gray / (bAvg || 1);
  
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = clamp(result.data[i] * rScale);
    result.data[i + 1] = clamp(result.data[i + 1] * gScale);
    result.data[i + 2] = clamp(result.data[i + 2] * bScale);
  }
  
  return result;
}

function autoContrast(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  let min = 255, max = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    min = Math.min(min, luma);
    max = Math.max(max, luma);
  }
  
  const range = max - min || 1;
  const scale = 255 / range;
  
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = clamp((result.data[i] - min) * scale);
    result.data[i + 1] = clamp((result.data[i + 1] - min) * scale);
    result.data[i + 2] = clamp((result.data[i + 2] - min) * scale);
  }
  
  return result;
}

function adjustSaturation(imageData: ImageData, factor: number): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  for (let i = 0; i < result.data.length; i += 4) {
    const gray = result.data[i] * 0.299 + result.data[i + 1] * 0.587 + result.data[i + 2] * 0.114;
    result.data[i] = clamp(gray + (result.data[i] - gray) * factor);
    result.data[i + 1] = clamp(gray + (result.data[i + 1] - gray) * factor);
    result.data[i + 2] = clamp(gray + (result.data[i + 2] - gray) * factor);
  }
  
  return result;
}

function adjustVibrance(imageData: ImageData, amount: number): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const factor = amount / 100;
  
  for (let i = 0; i < result.data.length; i += 4) {
    const r = result.data[i];
    const g = result.data[i + 1];
    const b = result.data[i + 2];
    
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const saturation = max !== 0 ? (max - Math.min(r, g, b)) / max : 0;
    
    // Boost less saturated colors more
    const boost = (1 - saturation) * factor;
    
    result.data[i] = clamp(avg + (r - avg) * (1 + boost));
    result.data[i + 1] = clamp(avg + (g - avg) * (1 + boost));
    result.data[i + 2] = clamp(avg + (b - avg) * (1 + boost));
  }
  
  return result;
}

function adjustCurves(imageData: ImageData, curve: number[][]): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Build lookup table from curve points
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    // Linear interpolation between curve points
    let value = i;
    for (let j = 0; j < curve.length - 1; j++) {
      if (i >= curve[j][0] && i <= curve[j + 1][0]) {
        const t = (i - curve[j][0]) / (curve[j + 1][0] - curve[j][0] || 1);
        value = curve[j][1] + t * (curve[j + 1][1] - curve[j][1]);
        break;
      }
    }
    lut[i] = clamp(value);
  }
  
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = lut[result.data[i]];
    result.data[i + 1] = lut[result.data[i + 1]];
    result.data[i + 2] = lut[result.data[i + 2]];
  }
  
  return result;
}

function applyColorTint(imageData: ImageData, color: string, opacity: number): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Parse hex color
  const hex = color.replace('#', '');
  const tintR = parseInt(hex.substring(0, 2), 16);
  const tintG = parseInt(hex.substring(2, 4), 16);
  const tintB = parseInt(hex.substring(4, 6), 16);
  
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = clamp(result.data[i] * (1 - opacity) + tintR * opacity);
    result.data[i + 1] = clamp(result.data[i + 1] * (1 - opacity) + tintG * opacity);
    result.data[i + 2] = clamp(result.data[i + 2] * (1 - opacity) + tintB * opacity);
  }
  
  return result;
}

// =============================================================================
// ITEMS 171-175: FILTER PRESETS
// =============================================================================

export interface FilterPreset {
  id: string;
  name: string;
  category: string;
  thumbnail?: string;
  filters: AppliedFilter[];
  tags: string[];
}

export interface AppliedFilter {
  filterId: string;
  params: Record<string, unknown>;
  blendMode?: string;
  opacity?: number;
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'portrait-soft',
    name: 'Portrait Soft',
    category: 'Portrait',
    filters: [
      { filterId: 'gaussianBlur', params: { radius: 1 }, opacity: 0.3 },
      { filterId: 'vignette', params: { amount: 20, softness: 60 } },
    ],
    tags: ['portrait', 'soft', 'beauty'],
  },
  {
    id: 'landscape-hdr',
    name: 'Landscape HDR',
    category: 'Landscape',
    filters: [
      { filterId: 'sharpen', params: { amount: 0.5 } },
      { filterId: 'vignette', params: { amount: 15, softness: 80 } },
    ],
    tags: ['landscape', 'hdr', 'dramatic'],
  },
  {
    id: 'retro-film',
    name: 'Retro Film',
    category: 'Vintage',
    filters: [
      { filterId: 'addGrain', params: { amount: 20 } },
      { filterId: 'vignette', params: { amount: 40, softness: 50 } },
    ],
    tags: ['vintage', 'film', 'retro', 'grain'],
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    category: 'Film',
    filters: [
      { filterId: 'chromaticAberration', params: { amount: 2 } },
      { filterId: 'vignette', params: { amount: 30, softness: 70 } },
      { filterId: 'addGrain', params: { amount: 10 } },
    ],
    tags: ['cinematic', 'film', 'movie'],
  },
  {
    id: 'dreamy-glow',
    name: 'Dreamy Glow',
    category: 'Creative',
    filters: [
      { filterId: 'gaussianBlur', params: { radius: 5 }, opacity: 0.4, blendMode: 'screen' },
    ],
    tags: ['dreamy', 'glow', 'soft', 'romantic'],
  },
];

// =============================================================================
// ITEMS 176-180: BATCH PROCESSING
// =============================================================================

export interface BatchJob {
  id: string;
  name: string;
  files: string[];
  filters: AppliedFilter[];
  outputFormat: 'jpeg' | 'png' | 'webp' | 'tiff';
  outputQuality: number;
  outputFolder: string;
  namingPattern: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  results: BatchResult[];
}

export interface BatchResult {
  inputFile: string;
  outputFile: string;
  status: 'success' | 'error';
  error?: string;
  processingTime: number;
}

export function createBatchJob(
  files: string[],
  filters: AppliedFilter[],
  options: {
    outputFormat?: 'jpeg' | 'png' | 'webp' | 'tiff';
    outputQuality?: number;
    outputFolder?: string;
    namingPattern?: string;
  } = {}
): BatchJob {
  return {
    id: `batch_${Date.now()}`,
    name: `Batch ${new Date().toLocaleString()}`,
    files,
    filters,
    outputFormat: options.outputFormat || 'jpeg',
    outputQuality: options.outputQuality || 90,
    outputFolder: options.outputFolder || '',
    namingPattern: options.namingPattern || '{name}_processed',
    status: 'pending',
    progress: 0,
    results: [],
  };
}

export function formatOutputFilename(pattern: string, inputFile: string, index: number): string {
  const name = inputFile.replace(/\.[^/.]+$/, '').split(/[/\\]/).pop() || 'image';
  const ext = inputFile.split('.').pop() || 'jpg';
  
  return pattern
    .replace('{name}', name)
    .replace('{index}', String(index + 1).padStart(4, '0'))
    .replace('{date}', new Date().toISOString().split('T')[0])
    .replace('{ext}', ext);
}

// =============================================================================
// EXPORTS
// =============================================================================

export const Filters = {
  // Blur
  gaussianBlur,
  motionBlur,
  radialBlur,
  lensBlur,
  
  // Sharpen
  sharpen,
  highPass,
  
  // Stylize
  emboss,
  findEdges,
  oilPaint,
  
  // Pixelate
  pixelate,
  crystallize,
  
  // Noise
  addNoise,
  denoise,
  addGrain,
  
  // Lens Effects
  vignette,
  chromaticAberration,
  lensDistortion,
  
  // Distort
  perspectiveWarp,
  liquify,
  spherize,
  polarCoordinates,
  displace,
  tile,
  wave,
  
  // Convolution
  convolve,
  CONVOLUTION_KERNELS,
  
  // AI Tools
  AI_IMAGE_TOOLS,
  
  // Smart Adjustments
  SMART_ADJUSTMENTS,
  autoLevels,
  autoWhiteBalance,
  autoContrast,
  adjustSaturation,
  adjustVibrance,
  adjustCurves,
  applyColorTint,
  
  // Presets
  FILTER_PRESETS,
  
  // Batch
  createBatchJob,
  formatOutputFilename,
};

export default Filters;
