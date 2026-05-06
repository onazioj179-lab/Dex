// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - PRISM Advanced Brush Engine
// Professional brush system rivaling Photoshop/Procreate
// Items 26-50 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;   // 0-1, pen pressure
  tiltX: number;      // -90 to 90, pen tilt
  tiltY: number;      // -90 to 90, pen tilt
  timestamp: number;
}

export interface BrushSettings {
  // Core properties
  id: string;
  name: string;
  category: BrushCategory;
  
  // Size & Shape
  size: number;           // 1-5000 px
  sizeJitter: number;     // 0-100%
  sizePressure: boolean;  // Size responds to pressure
  sizeTilt: boolean;      // Size responds to tilt
  
  minSize: number;        // 0-100% of size
  roundness: number;      // 0-100%
  angle: number;          // 0-360 degrees
  angleJitter: number;    // 0-100%
  
  // Hardness & Softness
  hardness: number;       // 0-100%
  hardnessJitter: number;
  
  // Opacity & Flow
  opacity: number;        // 0-100%
  opacityJitter: number;
  opacityPressure: boolean;
  
  flow: number;           // 0-100%
  flowJitter: number;
  flowPressure: boolean;
  
  // Spacing
  spacing: number;        // 1-1000%
  spacingJitter: number;
  
  // Scattering
  scatter: number;        // 0-1000%
  scatterCount: number;   // 1-16
  scatterBothAxes: boolean;
  
  // Texture
  textureId: string | null;
  textureScale: number;
  textureDepth: number;
  textureBlendMode: TextureBlendMode;
  
  // Dual Brush
  dualBrushId: string | null;
  dualBrushMode: DualBrushMode;
  
  // Color Dynamics
  foregroundBackgroundJitter: number;
  hueJitter: number;
  saturationJitter: number;
  brightnessJitter: number;
  purityJitter: number;
  
  // Transfer
  wetEdges: boolean;
  buildup: boolean;
  smoothing: number;      // 0-100%
  
  // Shape Dynamics
  flipX: boolean;
  flipY: boolean;
  
  // Brush Tip
  tipShape: BrushTipShape;
  customTipData: string | null;  // Base64 encoded brush tip
  
  // Eraser Mode
  eraserMode: boolean;
  
  // Blend Mode
  blendMode: BrushBlendMode;
}

export type BrushCategory = 
  | 'general' 
  | 'dry-media' 
  | 'wet-media' 
  | 'special-effects'
  | 'airbrush'
  | 'mixer'
  | 'smudge'
  | 'eraser'
  | 'custom';

export type BrushTipShape = 
  | 'round' 
  | 'square' 
  | 'ellipse' 
  | 'fan' 
  | 'flat' 
  | 'filbert'
  | 'rake'
  | 'custom';

export type TextureBlendMode = 
  | 'multiply' 
  | 'subtract' 
  | 'darken' 
  | 'overlay' 
  | 'colorDodge' 
  | 'colorBurn';

export type DualBrushMode = 
  | 'multiply' 
  | 'darken' 
  | 'subtract' 
  | 'colorBurn';

export type BrushBlendMode = 
  | 'normal' 
  | 'multiply' 
  | 'screen' 
  | 'overlay' 
  | 'darken' 
  | 'lighten'
  | 'colorDodge' 
  | 'colorBurn' 
  | 'hardLight' 
  | 'softLight'
  | 'difference' 
  | 'exclusion' 
  | 'hue' 
  | 'saturation' 
  | 'color' 
  | 'luminosity'
  | 'behind' 
  | 'clear';

export interface BrushStroke {
  id: string;
  points: BrushPoint[];
  settings: BrushSettings;
  color: BrushColor;
  startTime: number;
  endTime: number;
}

export interface BrushColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface BrushTexture {
  id: string;
  name: string;
  data: ImageData;
  scale: number;
}

export interface BrushPreset {
  id: string;
  name: string;
  category: BrushCategory;
  settings: BrushSettings;
  thumbnail: string;  // Base64 encoded preview
  author?: string;
  tags?: string[];
}

// =============================================================================
// ITEM 26: BRUSH ENGINE CORE
// =============================================================================

export class BrushEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: BrushSettings;
  private color: BrushColor;
  private currentStroke: BrushPoint[] = [];
  private lastPoint: BrushPoint | null = null;
  private brushTipCache: Map<string, ImageData> = new Map();
  private textureCache: Map<string, ImageData> = new Map();
  
  // Smoothing state
  private smoothingBuffer: BrushPoint[] = [];
  private smoothingIndex: number = 0;
  
  // Random state for jitter
  private rngSeed: number = Date.now();
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.settings = createDefaultBrushSettings();
    this.color = { r: 0, g: 0, b: 0, a: 255 };
  }
  
  setSettings(settings: Partial<BrushSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.invalidateBrushTipCache();
  }
  
  setColor(color: BrushColor): void {
    this.color = color;
  }
  
  beginStroke(point: BrushPoint): void {
    this.currentStroke = [point];
    this.lastPoint = point;
    this.smoothingBuffer = [point];
    this.smoothingIndex = 0;
    this.rngSeed = Date.now();
    
    // Paint first dab
    this.paintDab(point);
  }
  
  continueStroke(point: BrushPoint): void {
    if (!this.lastPoint) return;
    
    // Apply smoothing
    const smoothed = this.applySmoothing(point);
    
    // Calculate spacing
    const spacing = this.calculateSpacing();
    const distance = this.pointDistance(this.lastPoint, smoothed);
    const steps = Math.max(1, Math.floor(distance / spacing));
    
    // Interpolate points
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const interpolated = this.interpolatePoint(this.lastPoint, smoothed, t);
      this.paintDab(interpolated);
    }
    
    this.currentStroke.push(smoothed);
    this.lastPoint = smoothed;
  }
  
  endStroke(): BrushStroke {
    const stroke: BrushStroke = {
      id: generateId(),
      points: [...this.currentStroke],
      settings: { ...this.settings },
      color: { ...this.color },
      startTime: this.currentStroke[0]?.timestamp || Date.now(),
      endTime: Date.now()
    };
    
    this.currentStroke = [];
    this.lastPoint = null;
    this.smoothingBuffer = [];
    
    return stroke;
  }
  
  // =============================================================================
  // ITEM 27: BRUSH DAB PAINTING
  // =============================================================================
  
  private paintDab(point: BrushPoint): void {
    const ctx = this.ctx;
    
    // Calculate dynamic properties based on pressure/tilt
    const dynamicSize = this.calculateDynamicSize(point);
    const dynamicOpacity = this.calculateDynamicOpacity(point);
    const dynamicHardness = this.calculateDynamicHardness(point);
    const dynamicAngle = this.calculateDynamicAngle(point);
    const dynamicColor = this.calculateDynamicColor(point);
    
    // Apply scattering
    const scatterPoints = this.calculateScatter(point);
    
    ctx.save();
    
    // Set blend mode
    ctx.globalCompositeOperation = this.getCompositeOperation(this.settings.blendMode);
    ctx.globalAlpha = dynamicOpacity / 100;
    
    for (const scatterPoint of scatterPoints) {
      ctx.save();
      ctx.translate(scatterPoint.x, scatterPoint.y);
      ctx.rotate(dynamicAngle * Math.PI / 180);
      
      // Apply flip
      const scaleX = this.settings.flipX ? -1 : 1;
      const scaleY = this.settings.flipY ? -1 : 1;
      ctx.scale(scaleX, scaleY);
      
      // Get or create brush tip
      const brushTip = this.getBrushTip(dynamicSize, dynamicHardness);
      
      // Apply texture
      if (this.settings.textureId) {
        this.applyTexture(brushTip, scatterPoint);
      }
      
      // Apply color
      this.colorBrushTip(brushTip, dynamicColor);
      
      // Draw brush tip
      ctx.drawImage(
        this.imageDataToCanvas(brushTip),
        -dynamicSize / 2,
        -dynamicSize / 2
      );
      
      ctx.restore();
    }
    
    ctx.restore();
  }
  
  // =============================================================================
  // ITEM 28: DYNAMIC SIZE
  // =============================================================================
  
  private calculateDynamicSize(point: BrushPoint): number {
    let size = this.settings.size;
    
    // Pressure sensitivity
    if (this.settings.sizePressure) {
      const pressureFactor = this.settings.minSize / 100 + 
        point.pressure * (1 - this.settings.minSize / 100);
      size *= pressureFactor;
    }
    
    // Tilt sensitivity
    if (this.settings.sizeTilt) {
      const tilt = Math.sqrt(point.tiltX ** 2 + point.tiltY ** 2) / 90;
      size *= (1 - tilt * 0.5);
    }
    
    // Size jitter
    if (this.settings.sizeJitter > 0) {
      const jitter = 1 + (this.random() - 0.5) * 2 * (this.settings.sizeJitter / 100);
      size *= jitter;
    }
    
    return Math.max(1, Math.min(5000, size));
  }
  
  // =============================================================================
  // ITEM 29: DYNAMIC OPACITY
  // =============================================================================
  
  private calculateDynamicOpacity(point: BrushPoint): number {
    let opacity = this.settings.opacity;
    
    // Pressure sensitivity
    if (this.settings.opacityPressure) {
      opacity *= point.pressure;
    }
    
    // Opacity jitter
    if (this.settings.opacityJitter > 0) {
      const jitter = 1 - this.random() * (this.settings.opacityJitter / 100);
      opacity *= jitter;
    }
    
    // Flow
    const flowMultiplier = this.settings.flow / 100;
    if (this.settings.flowPressure) {
      opacity *= flowMultiplier * point.pressure;
    } else {
      opacity *= flowMultiplier;
    }
    
    // Flow jitter
    if (this.settings.flowJitter > 0) {
      const jitter = 1 - this.random() * (this.settings.flowJitter / 100);
      opacity *= jitter;
    }
    
    return Math.max(0, Math.min(100, opacity));
  }
  
  // =============================================================================
  // ITEM 30: DYNAMIC HARDNESS
  // =============================================================================
  
  private calculateDynamicHardness(point: BrushPoint): number {
    let hardness = this.settings.hardness;
    
    // Hardness jitter
    if (this.settings.hardnessJitter > 0) {
      const jitter = 1 - this.random() * (this.settings.hardnessJitter / 100);
      hardness *= jitter;
    }
    
    return Math.max(0, Math.min(100, hardness));
  }
  
  // =============================================================================
  // ITEM 31: DYNAMIC ANGLE
  // =============================================================================
  
  private calculateDynamicAngle(point: BrushPoint): number {
    let angle = this.settings.angle;
    
    // Direction following (for strokes)
    if (this.lastPoint) {
      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      if (dx !== 0 || dy !== 0) {
        const strokeAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        angle = (angle + strokeAngle) % 360;
      }
    }
    
    // Tilt influence
    if (point.tiltX !== 0 || point.tiltY !== 0) {
      const tiltAngle = Math.atan2(point.tiltY, point.tiltX) * 180 / Math.PI;
      angle = (angle + tiltAngle * 0.5) % 360;
    }
    
    // Angle jitter
    if (this.settings.angleJitter > 0) {
      const jitter = (this.random() - 0.5) * 2 * (this.settings.angleJitter / 100) * 180;
      angle += jitter;
    }
    
    return angle % 360;
  }
  
  // =============================================================================
  // ITEM 32: COLOR DYNAMICS
  // =============================================================================
  
  private calculateDynamicColor(point: BrushPoint): BrushColor {
    let { r, g, b, a } = this.color;
    
    // Convert to HSB for manipulation
    let { h, s, v } = rgbToHsv(r, g, b);
    
    // Hue jitter
    if (this.settings.hueJitter > 0) {
      const jitter = (this.random() - 0.5) * 2 * (this.settings.hueJitter / 100);
      h = (h + jitter + 1) % 1;
    }
    
    // Saturation jitter
    if (this.settings.saturationJitter > 0) {
      const jitter = (this.random() - 0.5) * 2 * (this.settings.saturationJitter / 100);
      s = Math.max(0, Math.min(1, s + jitter));
    }
    
    // Brightness jitter
    if (this.settings.brightnessJitter > 0) {
      const jitter = (this.random() - 0.5) * 2 * (this.settings.brightnessJitter / 100);
      v = Math.max(0, Math.min(1, v + jitter));
    }
    
    // Purity jitter (saturation towards gray)
    if (this.settings.purityJitter > 0) {
      const jitter = this.random() * (this.settings.purityJitter / 100);
      s = s * (1 - jitter);
    }
    
    // Convert back to RGB
    const rgb = hsvToRgb(h, s, v);
    
    return { r: rgb.r, g: rgb.g, b: rgb.b, a };
  }
  
  // =============================================================================
  // ITEM 33: SCATTERING
  // =============================================================================
  
  private calculateScatter(point: BrushPoint): BrushPoint[] {
    const points: BrushPoint[] = [];
    const count = this.settings.scatterCount;
    const scatter = this.settings.scatter / 100 * this.settings.size;
    
    for (let i = 0; i < count; i++) {
      if (i === 0 && this.settings.scatter === 0) {
        points.push(point);
        continue;
      }
      
      let offsetX = (this.random() - 0.5) * 2 * scatter;
      let offsetY = 0;
      
      if (this.settings.scatterBothAxes) {
        offsetY = (this.random() - 0.5) * 2 * scatter;
      }
      
      // Add spacing jitter
      if (this.settings.spacingJitter > 0) {
        const jitter = 1 + (this.random() - 0.5) * (this.settings.spacingJitter / 100);
        offsetX *= jitter;
        offsetY *= jitter;
      }
      
      points.push({
        ...point,
        x: point.x + offsetX,
        y: point.y + offsetY
      });
    }
    
    return points;
  }
  
  // =============================================================================
  // ITEM 34: BRUSH TIP GENERATION
  // =============================================================================
  
  private getBrushTip(size: number, hardness: number): ImageData {
    const cacheKey = `${this.settings.tipShape}-${Math.round(size)}-${Math.round(hardness)}-${this.settings.roundness}`;
    
    if (this.brushTipCache.has(cacheKey)) {
      return new ImageData(
        new Uint8ClampedArray(this.brushTipCache.get(cacheKey)!.data),
        Math.round(size),
        Math.round(size)
      );
    }
    
    const tipSize = Math.round(size);
    const canvas = document.createElement('canvas');
    canvas.width = tipSize;
    canvas.height = tipSize;
    const ctx = canvas.getContext('2d')!;
    
    switch (this.settings.tipShape) {
      case 'round':
        this.generateRoundTip(ctx, tipSize, hardness);
        break;
      case 'square':
        this.generateSquareTip(ctx, tipSize, hardness);
        break;
      case 'ellipse':
        this.generateEllipseTip(ctx, tipSize, hardness, this.settings.roundness);
        break;
      case 'fan':
        this.generateFanTip(ctx, tipSize, hardness);
        break;
      case 'flat':
        this.generateFlatTip(ctx, tipSize, hardness);
        break;
      case 'filbert':
        this.generateFilbertTip(ctx, tipSize, hardness);
        break;
      case 'rake':
        this.generateRakeTip(ctx, tipSize, hardness);
        break;
      case 'custom':
        if (this.settings.customTipData) {
          this.generateCustomTip(ctx, tipSize, this.settings.customTipData);
        } else {
          this.generateRoundTip(ctx, tipSize, hardness);
        }
        break;
    }
    
    const imageData = ctx.getImageData(0, 0, tipSize, tipSize);
    this.brushTipCache.set(cacheKey, imageData);
    
    return imageData;
  }
  
  private generateRoundTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    const center = size / 2;
    const radius = size / 2;
    
    if (hardness >= 100) {
      // Hard brush - solid circle
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
    } else {
      // Soft brush - radial gradient
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
      const hardRadius = hardness / 100;
      
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(hardRadius, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  }
  
  private generateSquareTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    if (hardness >= 100) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size, size);
    } else {
      // Soft square with feathered edges
      const feather = (100 - hardness) / 100 * size * 0.3;
      
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const distX = Math.min(x, size - x - 1);
          const distY = Math.min(y, size - y - 1);
          const dist = Math.min(distX, distY);
          
          const alpha = dist < feather ? dist / feather : 1;
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  
  private generateEllipseTip(ctx: CanvasRenderingContext2D, size: number, hardness: number, roundness: number): void {
    const center = size / 2;
    const radiusX = size / 2;
    const radiusY = radiusX * (roundness / 100);
    
    ctx.beginPath();
    ctx.ellipse(center, center, radiusX, radiusY, 0, 0, Math.PI * 2);
    
    if (hardness >= 100) {
      ctx.fillStyle = 'white';
      ctx.fill();
    } else {
      // Create elliptical gradient
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = size;
      tempCanvas.height = size;
      const tempCtx = tempCanvas.getContext('2d')!;
      
      tempCtx.scale(1, roundness / 100);
      const gradient = tempCtx.createRadialGradient(center, center / (roundness / 100), 0, center, center / (roundness / 100), radiusX);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(hardness / 100, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      
      tempCtx.fillStyle = gradient;
      tempCtx.fillRect(0, 0, size, size);
      
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }
  
  private generateFanTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    const center = size / 2;
    const bristleCount = 12;
    const bristleWidth = size / (bristleCount * 2);
    
    for (let i = 0; i < bristleCount; i++) {
      const x = (i / (bristleCount - 1)) * size * 0.8 + size * 0.1;
      const length = size * 0.4 * (1 - Math.abs(i - bristleCount / 2) / (bristleCount / 2) * 0.3);
      
      ctx.beginPath();
      ctx.moveTo(x, center + size * 0.2);
      ctx.lineTo(x - bristleWidth / 2, center - length);
      ctx.lineTo(x + bristleWidth / 2, center - length);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${hardness / 100})`;
      ctx.fill();
    }
  }
  
  private generateFlatTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    const width = size;
    const height = size * 0.15;
    const y = (size - height) / 2;
    
    if (hardness >= 100) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, y, width, height);
    } else {
      const feather = (100 - hardness) / 100 * height;
      const gradient = ctx.createLinearGradient(0, y, 0, y + height);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(feather / height, 'rgba(255,255,255,1)');
      gradient.addColorStop(1 - feather / height, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, width, height);
    }
  }
  
  private generateFilbertTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    // Oval shape with rounded ends
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size / 2, size / 4, 0, 0, Math.PI * 2);
    
    if (hardness >= 100) {
      ctx.fillStyle = 'white';
    } else {
      ctx.fillStyle = `rgba(255,255,255,${hardness / 100})`;
    }
    ctx.fill();
  }
  
  private generateRakeTip(ctx: CanvasRenderingContext2D, size: number, hardness: number): void {
    const prongs = 5;
    const prongWidth = size / (prongs * 2);
    const gap = prongWidth;
    
    for (let i = 0; i < prongs; i++) {
      const x = i * (prongWidth + gap) + gap / 2;
      
      ctx.beginPath();
      ctx.ellipse(x + prongWidth / 2, size / 2, prongWidth / 2, size / 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${hardness / 100})`;
      ctx.fill();
    }
  }
  
  private generateCustomTip(ctx: CanvasRenderingContext2D, size: number, dataUrl: string): void {
    const img = new Image();
    img.src = dataUrl;
    ctx.drawImage(img, 0, 0, size, size);
  }
  
  // =============================================================================
  // ITEM 35: WET EDGES
  // =============================================================================
  
  applyWetEdges(imageData: ImageData): void {
    if (!this.settings.wetEdges) return;
    
    const { data, width, height } = imageData;
    
    // Detect edges and increase opacity there
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        
        if (alpha === 0) continue;
        
        // Check neighbors
        const neighbors = [
          data[((y - 1) * width + x) * 4 + 3],
          data[((y + 1) * width + x) * 4 + 3],
          data[(y * width + x - 1) * 4 + 3],
          data[(y * width + x + 1) * 4 + 3]
        ];
        
        const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / 4;
        
        // If this is an edge pixel
        if (Math.abs(alpha - avgNeighbor) > 30) {
          data[idx + 3] = Math.min(255, alpha * 1.5);
        } else {
          data[idx + 3] = Math.max(0, alpha * 0.7);
        }
      }
    }
  }
  
  // =============================================================================
  // ITEM 36: TEXTURE APPLICATION
  // =============================================================================
  
  private applyTexture(brushTip: ImageData, point: BrushPoint): void {
    if (!this.settings.textureId) return;
    
    const texture = this.textureCache.get(this.settings.textureId);
    if (!texture) return;
    
    const { data } = brushTip;
    const scale = this.settings.textureScale;
    const depth = this.settings.textureDepth / 100;
    
    for (let y = 0; y < brushTip.height; y++) {
      for (let x = 0; x < brushTip.width; x++) {
        const idx = (y * brushTip.width + x) * 4;
        
        // Sample texture at offset position
        const texX = Math.floor((point.x + x) / scale) % texture.width;
        const texY = Math.floor((point.y + y) / scale) % texture.height;
        const texIdx = (texY * texture.width + texX) * 4;
        const texValue = texture.data[texIdx] / 255;
        
        // Apply texture based on blend mode
        switch (this.settings.textureBlendMode) {
          case 'multiply':
            data[idx + 3] = Math.round(data[idx + 3] * (1 - depth + depth * texValue));
            break;
          case 'subtract':
            data[idx + 3] = Math.round(data[idx + 3] * Math.max(0, 1 - depth * (1 - texValue)));
            break;
          case 'darken':
            if (texValue < 0.5) {
              data[idx + 3] = Math.round(data[idx + 3] * (1 - depth + depth * texValue * 2));
            }
            break;
          case 'overlay':
            const base = data[idx + 3] / 255;
            const result = base < 0.5 
              ? 2 * base * texValue 
              : 1 - 2 * (1 - base) * (1 - texValue);
            data[idx + 3] = Math.round(255 * (1 - depth + depth * result));
            break;
        }
      }
    }
  }
  
  loadTexture(id: string, imageData: ImageData): void {
    this.textureCache.set(id, imageData);
  }
  
  // =============================================================================
  // ITEM 37: DUAL BRUSH
  // =============================================================================
  
  applyDualBrush(primaryTip: ImageData, dualTip: ImageData): void {
    if (!this.settings.dualBrushId) return;
    
    const { data } = primaryTip;
    const dualData = dualTip.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const primaryAlpha = data[i + 3] / 255;
      const dualAlpha = dualData[i + 3] / 255;
      
      let resultAlpha: number;
      
      switch (this.settings.dualBrushMode) {
        case 'multiply':
          resultAlpha = primaryAlpha * dualAlpha;
          break;
        case 'darken':
          resultAlpha = Math.min(primaryAlpha, dualAlpha);
          break;
        case 'subtract':
          resultAlpha = Math.max(0, primaryAlpha - dualAlpha);
          break;
        case 'colorBurn':
          resultAlpha = primaryAlpha === 0 ? 0 : Math.max(0, 1 - (1 - dualAlpha) / primaryAlpha);
          break;
        default:
          resultAlpha = primaryAlpha;
      }
      
      data[i + 3] = Math.round(resultAlpha * 255);
    }
  }
  
  // =============================================================================
  // ITEM 38: STROKE SMOOTHING
  // =============================================================================
  
  private applySmoothing(point: BrushPoint): BrushPoint {
    if (this.settings.smoothing === 0) return point;
    
    const bufferSize = Math.floor(this.settings.smoothing / 10) + 1;
    
    this.smoothingBuffer.push(point);
    if (this.smoothingBuffer.length > bufferSize) {
      this.smoothingBuffer.shift();
    }
    
    // Weighted average - more recent points have more weight
    let totalWeight = 0;
    let sumX = 0, sumY = 0, sumPressure = 0;
    
    for (let i = 0; i < this.smoothingBuffer.length; i++) {
      const weight = (i + 1) / this.smoothingBuffer.length;
      const p = this.smoothingBuffer[i];
      
      sumX += p.x * weight;
      sumY += p.y * weight;
      sumPressure += p.pressure * weight;
      totalWeight += weight;
    }
    
    return {
      ...point,
      x: sumX / totalWeight,
      y: sumY / totalWeight,
      pressure: sumPressure / totalWeight
    };
  }
  
  // =============================================================================
  // ITEM 39: SPACING CALCULATION
  // =============================================================================
  
  private calculateSpacing(): number {
    let spacing = this.settings.size * (this.settings.spacing / 100);
    
    // Minimum spacing to prevent overlapping dabs
    spacing = Math.max(1, spacing);
    
    // Adjust for roundness
    if (this.settings.roundness < 100) {
      spacing *= (this.settings.roundness / 100);
    }
    
    return spacing;
  }
  
  // =============================================================================
  // ITEM 40: MIXER BRUSH SIMULATION
  // =============================================================================
  
  mixColors(existingColor: BrushColor, newColor: BrushColor, wetness: number, mix: number): BrushColor {
    // Wetness: how much paint the brush picks up
    // Mix: how much existing color mixes with brush color
    
    const pickupAmount = wetness / 100;
    const mixAmount = mix / 100;
    
    // Blend brush color with picked up color
    const blendedR = existingColor.r * pickupAmount + newColor.r * (1 - pickupAmount);
    const blendedG = existingColor.g * pickupAmount + newColor.g * (1 - pickupAmount);
    const blendedB = existingColor.b * pickupAmount + newColor.b * (1 - pickupAmount);
    
    // Mix with original brush color
    return {
      r: Math.round(blendedR * mixAmount + this.color.r * (1 - mixAmount)),
      g: Math.round(blendedG * mixAmount + this.color.g * (1 - mixAmount)),
      b: Math.round(blendedB * mixAmount + this.color.b * (1 - mixAmount)),
      a: Math.round((existingColor.a + newColor.a) / 2)
    };
  }
  
  // =============================================================================
  // ITEM 41: SMUDGE TOOL
  // =============================================================================
  
  smudge(point: BrushPoint, strength: number): void {
    if (!this.lastPoint) return;
    
    const ctx = this.ctx;
    const size = this.calculateDynamicSize(point);
    const radius = size / 2;
    
    // Get source pixels
    const sourceX = Math.round(this.lastPoint.x - radius);
    const sourceY = Math.round(this.lastPoint.y - radius);
    const sourceData = ctx.getImageData(sourceX, sourceY, size, size);
    
    // Get destination pixels
    const destX = Math.round(point.x - radius);
    const destY = Math.round(point.y - radius);
    const destData = ctx.getImageData(destX, destY, size, size);
    
    const strengthFactor = (strength / 100) * point.pressure;
    
    // Blend source into destination
    for (let i = 0; i < sourceData.data.length; i += 4) {
      const px = (i / 4) % size;
      const py = Math.floor((i / 4) / size);
      const dist = Math.sqrt((px - radius) ** 2 + (py - radius) ** 2);
      
      if (dist > radius) continue;
      
      const falloff = 1 - (dist / radius);
      const blend = strengthFactor * falloff;
      
      destData.data[i] = Math.round(destData.data[i] * (1 - blend) + sourceData.data[i] * blend);
      destData.data[i + 1] = Math.round(destData.data[i + 1] * (1 - blend) + sourceData.data[i + 1] * blend);
      destData.data[i + 2] = Math.round(destData.data[i + 2] * (1 - blend) + sourceData.data[i + 2] * blend);
      destData.data[i + 3] = Math.round(destData.data[i + 3] * (1 - blend) + sourceData.data[i + 3] * blend);
    }
    
    ctx.putImageData(destData, destX, destY);
  }
  
  // =============================================================================
  // ITEM 42: BLUR BRUSH
  // =============================================================================
  
  blurBrush(point: BrushPoint, strength: number): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    
    const blurRadius = Math.ceil(strength / 20);
    const kernel = createGaussianKernel1D(blurRadius * 2 + 1, blurRadius / 2);
    
    // Horizontal blur
    const temp = new Uint8ClampedArray(imageData.data);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        let r = 0, g = 0, b = 0, a = 0, weightSum = 0;
        
        for (let k = -blurRadius; k <= blurRadius; k++) {
          const kx = px + k;
          if (kx < 0 || kx >= size) continue;
          
          const idx = (py * size + kx) * 4;
          const weight = kernel[k + blurRadius];
          
          r += temp[idx] * weight;
          g += temp[idx + 1] * weight;
          b += temp[idx + 2] * weight;
          a += temp[idx + 3] * weight;
          weightSum += weight;
        }
        
        const idx = (py * size + px) * 4;
        imageData.data[idx] = Math.round(r / weightSum);
        imageData.data[idx + 1] = Math.round(g / weightSum);
        imageData.data[idx + 2] = Math.round(b / weightSum);
        imageData.data[idx + 3] = Math.round(a / weightSum);
      }
    }
    
    // Apply with brush mask
    const mask = this.getBrushTip(size, this.settings.hardness);
    for (let i = 0; i < size * size; i++) {
      const maskAlpha = mask.data[i * 4 + 3] / 255;
      const origIdx = i * 4;
      
      imageData.data[origIdx] = Math.round(temp[origIdx] * (1 - maskAlpha) + imageData.data[origIdx] * maskAlpha);
      imageData.data[origIdx + 1] = Math.round(temp[origIdx + 1] * (1 - maskAlpha) + imageData.data[origIdx + 1] * maskAlpha);
      imageData.data[origIdx + 2] = Math.round(temp[origIdx + 2] * (1 - maskAlpha) + imageData.data[origIdx + 2] * maskAlpha);
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 43: SHARPEN BRUSH
  // =============================================================================
  
  sharpenBrush(point: BrushPoint, strength: number): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    const original = new Uint8ClampedArray(imageData.data);
    
    // Unsharp mask kernel
    const sharpenAmount = 1 + (strength / 100) * 2;
    
    for (let py = 1; py < size - 1; py++) {
      for (let px = 1; px < size - 1; px++) {
        const idx = (py * size + px) * 4;
        
        for (let c = 0; c < 3; c++) {
          const center = original[idx + c];
          const neighbors = 
            original[((py - 1) * size + px) * 4 + c] +
            original[((py + 1) * size + px) * 4 + c] +
            original[(py * size + px - 1) * 4 + c] +
            original[(py * size + px + 1) * 4 + c];
          
          const laplacian = center * 4 - neighbors;
          const sharpened = center + laplacian * (sharpenAmount - 1);
          
          imageData.data[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
      }
    }
    
    // Apply with brush mask
    const mask = this.getBrushTip(size, this.settings.hardness);
    for (let i = 0; i < size * size; i++) {
      const maskAlpha = mask.data[i * 4 + 3] / 255 * point.pressure;
      const origIdx = i * 4;
      
      for (let c = 0; c < 3; c++) {
        imageData.data[origIdx + c] = Math.round(
          original[origIdx + c] * (1 - maskAlpha) + 
          imageData.data[origIdx + c] * maskAlpha
        );
      }
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 44: DODGE TOOL
  // =============================================================================
  
  dodge(point: BrushPoint, exposure: number, range: 'shadows' | 'midtones' | 'highlights'): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    
    const exposureFactor = exposure / 100 * point.pressure;
    const mask = this.getBrushTip(size, this.settings.hardness);
    
    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const maskAlpha = mask.data[idx + 3] / 255;
      
      if (maskAlpha === 0) continue;
      
      let r = imageData.data[idx];
      let g = imageData.data[idx + 1];
      let b = imageData.data[idx + 2];
      
      const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      
      let rangeMask = 1;
      switch (range) {
        case 'shadows':
          rangeMask = 1 - luminance;
          break;
        case 'midtones':
          rangeMask = 1 - Math.abs(luminance - 0.5) * 2;
          break;
        case 'highlights':
          rangeMask = luminance;
          break;
      }
      
      const effect = exposureFactor * maskAlpha * rangeMask;
      
      r = Math.min(255, r + (255 - r) * effect);
      g = Math.min(255, g + (255 - g) * effect);
      b = Math.min(255, b + (255 - b) * effect);
      
      imageData.data[idx] = Math.round(r);
      imageData.data[idx + 1] = Math.round(g);
      imageData.data[idx + 2] = Math.round(b);
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 45: BURN TOOL
  // =============================================================================
  
  burn(point: BrushPoint, exposure: number, range: 'shadows' | 'midtones' | 'highlights'): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    
    const exposureFactor = exposure / 100 * point.pressure;
    const mask = this.getBrushTip(size, this.settings.hardness);
    
    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const maskAlpha = mask.data[idx + 3] / 255;
      
      if (maskAlpha === 0) continue;
      
      let r = imageData.data[idx];
      let g = imageData.data[idx + 1];
      let b = imageData.data[idx + 2];
      
      const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      
      let rangeMask = 1;
      switch (range) {
        case 'shadows':
          rangeMask = 1 - luminance;
          break;
        case 'midtones':
          rangeMask = 1 - Math.abs(luminance - 0.5) * 2;
          break;
        case 'highlights':
          rangeMask = luminance;
          break;
      }
      
      const effect = exposureFactor * maskAlpha * rangeMask;
      
      r = Math.max(0, r * (1 - effect));
      g = Math.max(0, g * (1 - effect));
      b = Math.max(0, b * (1 - effect));
      
      imageData.data[idx] = Math.round(r);
      imageData.data[idx + 1] = Math.round(g);
      imageData.data[idx + 2] = Math.round(b);
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 46: SPONGE TOOL
  // =============================================================================
  
  sponge(point: BrushPoint, flow: number, mode: 'saturate' | 'desaturate'): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    
    const flowFactor = flow / 100 * point.pressure;
    const mask = this.getBrushTip(size, this.settings.hardness);
    
    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const maskAlpha = mask.data[idx + 3] / 255;
      
      if (maskAlpha === 0) continue;
      
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      
      // Convert to HSL
      let { h, s, l } = rgbToHsl(r, g, b);
      
      // Adjust saturation
      const effect = flowFactor * maskAlpha;
      if (mode === 'saturate') {
        s = Math.min(1, s + (1 - s) * effect);
      } else {
        s = Math.max(0, s * (1 - effect));
      }
      
      // Convert back to RGB
      const { r: nr, g: ng, b: nb } = hslToRgb(h, s, l);
      
      imageData.data[idx] = nr;
      imageData.data[idx + 1] = ng;
      imageData.data[idx + 2] = nb;
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 47: COLOR REPLACEMENT BRUSH
  // =============================================================================
  
  replaceColor(
    point: BrushPoint, 
    targetColor: BrushColor, 
    replacementColor: BrushColor,
    tolerance: number,
    preserveLuminosity: boolean
  ): void {
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    const imageData = ctx.getImageData(x, y, size, size);
    
    const mask = this.getBrushTip(size, this.settings.hardness);
    
    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const maskAlpha = mask.data[idx + 3] / 255 * point.pressure;
      
      if (maskAlpha === 0) continue;
      
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      
      // Check if color is within tolerance
      const colorDist = Math.sqrt(
        (r - targetColor.r) ** 2 +
        (g - targetColor.g) ** 2 +
        (b - targetColor.b) ** 2
      );
      
      if (colorDist <= tolerance * 4.42) {  // 442 is max RGB distance
        let newR = replacementColor.r;
        let newG = replacementColor.g;
        let newB = replacementColor.b;
        
        if (preserveLuminosity) {
          const originalLum = r * 0.299 + g * 0.587 + b * 0.114;
          const newLum = newR * 0.299 + newG * 0.587 + newB * 0.114;
          const lumRatio = newLum > 0 ? originalLum / newLum : 1;
          
          newR = Math.min(255, newR * lumRatio);
          newG = Math.min(255, newG * lumRatio);
          newB = Math.min(255, newB * lumRatio);
        }
        
        const blend = maskAlpha * (1 - colorDist / (tolerance * 4.42));
        
        imageData.data[idx] = Math.round(r * (1 - blend) + newR * blend);
        imageData.data[idx + 1] = Math.round(g * (1 - blend) + newG * blend);
        imageData.data[idx + 2] = Math.round(b * (1 - blend) + newB * blend);
      }
    }
    
    ctx.putImageData(imageData, x, y);
  }
  
  // =============================================================================
  // ITEM 48: PATTERN STAMP
  // =============================================================================
  
  private patternCache: Map<string, ImageData> = new Map();
  
  loadPattern(id: string, imageData: ImageData): void {
    this.patternCache.set(id, imageData);
  }
  
  patternStamp(point: BrushPoint, patternId: string, aligned: boolean, offset: { x: number; y: number }): void {
    const pattern = this.patternCache.get(patternId);
    if (!pattern) return;
    
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const mask = this.getBrushTip(size, this.settings.hardness);
    
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const maskIdx = (py * size + px) * 4;
        const maskAlpha = mask.data[maskIdx + 3] / 255 * point.pressure;
        
        if (maskAlpha === 0) continue;
        
        // Calculate pattern coordinates
        let patX: number, patY: number;
        
        if (aligned) {
          patX = Math.floor((point.x - radius + px + offset.x) % pattern.width);
          patY = Math.floor((point.y - radius + py + offset.y) % pattern.height);
        } else {
          patX = px % pattern.width;
          patY = py % pattern.height;
        }
        
        if (patX < 0) patX += pattern.width;
        if (patY < 0) patY += pattern.height;
        
        const patIdx = (patY * pattern.width + patX) * 4;
        
        // Get pattern color
        const patR = pattern.data[patIdx];
        const patG = pattern.data[patIdx + 1];
        const patB = pattern.data[patIdx + 2];
        const patA = pattern.data[patIdx + 3] / 255;
        
        // Draw to canvas
        const canvasX = Math.round(point.x - radius + px);
        const canvasY = Math.round(point.y - radius + py);
        
        ctx.fillStyle = `rgba(${patR},${patG},${patB},${maskAlpha * patA})`;
        ctx.fillRect(canvasX, canvasY, 1, 1);
      }
    }
  }
  
  // =============================================================================
  // ITEM 49: HISTORY BRUSH
  // =============================================================================
  
  private historySnapshot: ImageData | null = null;
  
  setHistorySnapshot(imageData: ImageData): void {
    this.historySnapshot = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
  }
  
  historyBrush(point: BrushPoint): void {
    if (!this.historySnapshot) return;
    
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    const radius = size / 2;
    
    const x = Math.round(point.x - radius);
    const y = Math.round(point.y - radius);
    
    const mask = this.getBrushTip(size, this.settings.hardness);
    const currentData = ctx.getImageData(x, y, size, size);
    
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const maskIdx = (py * size + px) * 4;
        const maskAlpha = mask.data[maskIdx + 3] / 255 * point.pressure;
        
        if (maskAlpha === 0) continue;
        
        const histX = x + px;
        const histY = y + py;
        
        if (histX < 0 || histX >= this.historySnapshot.width ||
            histY < 0 || histY >= this.historySnapshot.height) continue;
        
        const histIdx = (histY * this.historySnapshot.width + histX) * 4;
        const currIdx = (py * size + px) * 4;
        
        // Blend history into current
        currentData.data[currIdx] = Math.round(
          currentData.data[currIdx] * (1 - maskAlpha) +
          this.historySnapshot.data[histIdx] * maskAlpha
        );
        currentData.data[currIdx + 1] = Math.round(
          currentData.data[currIdx + 1] * (1 - maskAlpha) +
          this.historySnapshot.data[histIdx + 1] * maskAlpha
        );
        currentData.data[currIdx + 2] = Math.round(
          currentData.data[currIdx + 2] * (1 - maskAlpha) +
          this.historySnapshot.data[histIdx + 2] * maskAlpha
        );
        currentData.data[currIdx + 3] = Math.round(
          currentData.data[currIdx + 3] * (1 - maskAlpha) +
          this.historySnapshot.data[histIdx + 3] * maskAlpha
        );
      }
    }
    
    ctx.putImageData(currentData, x, y);
  }
  
  // =============================================================================
  // ITEM 50: ART HISTORY BRUSH
  // =============================================================================
  
  artHistoryBrush(
    point: BrushPoint, 
    style: 'tight' | 'loose' | 'dab' | 'curl' | 'swirl',
    fidelity: number,
    area: number
  ): void {
    if (!this.historySnapshot) return;
    
    const ctx = this.ctx;
    const size = Math.round(this.calculateDynamicSize(point));
    
    // Sample colors from history
    const sampleRadius = area;
    const samples: BrushColor[] = [];
    
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const sx = Math.round(point.x + Math.cos(angle) * sampleRadius * this.random());
      const sy = Math.round(point.y + Math.sin(angle) * sampleRadius * this.random());
      
      if (sx >= 0 && sx < this.historySnapshot.width &&
          sy >= 0 && sy < this.historySnapshot.height) {
        const idx = (sy * this.historySnapshot.width + sx) * 4;
        samples.push({
          r: this.historySnapshot.data[idx],
          g: this.historySnapshot.data[idx + 1],
          b: this.historySnapshot.data[idx + 2],
          a: this.historySnapshot.data[idx + 3]
        });
      }
    }
    
    if (samples.length === 0) return;
    
    // Generate artistic strokes based on style
    switch (style) {
      case 'tight':
        this.paintTightStrokes(point, samples, size, fidelity);
        break;
      case 'loose':
        this.paintLooseStrokes(point, samples, size, fidelity);
        break;
      case 'dab':
        this.paintDabStrokes(point, samples, size, fidelity);
        break;
      case 'curl':
        this.paintCurlStrokes(point, samples, size, fidelity);
        break;
      case 'swirl':
        this.paintSwirlStrokes(point, samples, size, fidelity);
        break;
    }
  }
  
  private paintTightStrokes(point: BrushPoint, samples: BrushColor[], size: number, fidelity: number): void {
    const ctx = this.ctx;
    
    for (const color of samples) {
      const length = size * (0.5 + this.random() * 0.5);
      const angle = this.random() * Math.PI * 2;
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${fidelity / 100})`;
      ctx.lineWidth = size * 0.1;
      ctx.lineCap = 'round';
      
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(
        point.x + Math.cos(angle) * length,
        point.y + Math.sin(angle) * length
      );
      ctx.stroke();
    }
  }
  
  private paintLooseStrokes(point: BrushPoint, samples: BrushColor[], size: number, fidelity: number): void {
    const ctx = this.ctx;
    
    for (const color of samples) {
      const length = size * (1 + this.random());
      const angle = this.random() * Math.PI * 2;
      const curve = (this.random() - 0.5) * size;
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${fidelity / 100})`;
      ctx.lineWidth = size * 0.15;
      ctx.lineCap = 'round';
      
      ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(
        point.x + Math.cos(angle) * length * 0.5 + curve,
        point.y + Math.sin(angle) * length * 0.5 + curve,
        point.x + Math.cos(angle) * length,
        point.y + Math.sin(angle) * length
      );
      ctx.stroke();
    }
  }
  
  private paintDabStrokes(point: BrushPoint, samples: BrushColor[], size: number, fidelity: number): void {
    const ctx = this.ctx;
    
    for (const color of samples) {
      const dabSize = size * (0.3 + this.random() * 0.7);
      const offsetX = (this.random() - 0.5) * size;
      const offsetY = (this.random() - 0.5) * size;
      
      ctx.beginPath();
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${fidelity / 100})`;
      ctx.ellipse(
        point.x + offsetX,
        point.y + offsetY,
        dabSize / 2,
        dabSize / 3,
        this.random() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
  
  private paintCurlStrokes(point: BrushPoint, samples: BrushColor[], size: number, fidelity: number): void {
    const ctx = this.ctx;
    
    for (const color of samples) {
      const curls = 2 + Math.floor(this.random() * 3);
      const angle = this.random() * Math.PI * 2;
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${fidelity / 100})`;
      ctx.lineWidth = size * 0.1;
      ctx.lineCap = 'round';
      
      ctx.moveTo(point.x, point.y);
      
      for (let i = 0; i < curls * 10; i++) {
        const t = i / (curls * 10);
        const r = t * size;
        const a = angle + t * curls * Math.PI * 2;
        
        ctx.lineTo(
          point.x + Math.cos(a) * r,
          point.y + Math.sin(a) * r
        );
      }
      
      ctx.stroke();
    }
  }
  
  private paintSwirlStrokes(point: BrushPoint, samples: BrushColor[], size: number, fidelity: number): void {
    const ctx = this.ctx;
    
    const avgColor = {
      r: Math.round(samples.reduce((s, c) => s + c.r, 0) / samples.length),
      g: Math.round(samples.reduce((s, c) => s + c.g, 0) / samples.length),
      b: Math.round(samples.reduce((s, c) => s + c.b, 0) / samples.length)
    };
    
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, size);
    gradient.addColorStop(0, `rgba(${avgColor.r},${avgColor.g},${avgColor.b},${fidelity / 100})`);
    gradient.addColorStop(1, `rgba(${avgColor.r},${avgColor.g},${avgColor.b},0)`);
    
    ctx.beginPath();
    ctx.fillStyle = gradient;
    
    // Swirl path
    const swirls = 3;
    ctx.moveTo(point.x, point.y);
    
    for (let i = 0; i <= swirls * 20; i++) {
      const t = i / (swirls * 20);
      const r = t * size;
      const a = t * swirls * Math.PI * 2;
      
      ctx.lineTo(
        point.x + Math.cos(a) * r,
        point.y + Math.sin(a) * r
      );
    }
    
    ctx.fill();
  }
  
  // =============================================================================
  // HELPER METHODS
  // =============================================================================
  
  private colorBrushTip(brushTip: ImageData, color: BrushColor): void {
    const { data } = brushTip;
    
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = Math.round(alpha * (color.a / 255));
    }
  }
  
  private imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  private getCompositeOperation(mode: BrushBlendMode): GlobalCompositeOperation {
    const modeMap: Record<BrushBlendMode, GlobalCompositeOperation> = {
      'normal': 'source-over',
      'multiply': 'multiply',
      'screen': 'screen',
      'overlay': 'overlay',
      'darken': 'darken',
      'lighten': 'lighten',
      'colorDodge': 'color-dodge',
      'colorBurn': 'color-burn',
      'hardLight': 'hard-light',
      'softLight': 'soft-light',
      'difference': 'difference',
      'exclusion': 'exclusion',
      'hue': 'hue',
      'saturation': 'saturation',
      'color': 'color',
      'luminosity': 'luminosity',
      'behind': 'destination-over',
      'clear': 'destination-out'
    };
    return modeMap[mode] || 'source-over';
  }
  
  private random(): number {
    // Simple LCG for reproducible randomness
    this.rngSeed = (this.rngSeed * 1103515245 + 12345) & 0x7fffffff;
    return this.rngSeed / 0x7fffffff;
  }
  
  private pointDistance(a: BrushPoint, b: BrushPoint): number {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }
  
  private interpolatePoint(a: BrushPoint, b: BrushPoint, t: number): BrushPoint {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      pressure: a.pressure + (b.pressure - a.pressure) * t,
      tiltX: a.tiltX + (b.tiltX - a.tiltX) * t,
      tiltY: a.tiltY + (b.tiltY - a.tiltY) * t,
      timestamp: a.timestamp + (b.timestamp - a.timestamp) * t
    };
  }
  
  private invalidateBrushTipCache(): void {
    this.brushTipCache.clear();
  }
}

// =============================================================================
// BRUSH PRESETS
// =============================================================================

export function createDefaultBrushSettings(): BrushSettings {
  return {
    id: generateId(),
    name: 'Default Brush',
    category: 'general',
    size: 30,
    sizeJitter: 0,
    sizePressure: true,
    sizeTilt: false,
    minSize: 25,
    roundness: 100,
    angle: 0,
    angleJitter: 0,
    hardness: 100,
    hardnessJitter: 0,
    opacity: 100,
    opacityJitter: 0,
    opacityPressure: false,
    flow: 100,
    flowJitter: 0,
    flowPressure: false,
    spacing: 25,
    spacingJitter: 0,
    scatter: 0,
    scatterCount: 1,
    scatterBothAxes: false,
    textureId: null,
    textureScale: 100,
    textureDepth: 50,
    textureBlendMode: 'multiply',
    dualBrushId: null,
    dualBrushMode: 'multiply',
    foregroundBackgroundJitter: 0,
    hueJitter: 0,
    saturationJitter: 0,
    brightnessJitter: 0,
    purityJitter: 0,
    wetEdges: false,
    buildup: false,
    smoothing: 0,
    flipX: false,
    flipY: false,
    tipShape: 'round',
    customTipData: null,
    eraserMode: false,
    blendMode: 'normal'
  };
}

export const DEFAULT_BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'hard-round',
    name: 'Hard Round',
    category: 'general',
    settings: { ...createDefaultBrushSettings(), hardness: 100 },
    thumbnail: ''
  },
  {
    id: 'soft-round',
    name: 'Soft Round',
    category: 'general',
    settings: { ...createDefaultBrushSettings(), hardness: 0 },
    thumbnail: ''
  },
  {
    id: 'airbrush',
    name: 'Airbrush',
    category: 'airbrush',
    settings: { 
      ...createDefaultBrushSettings(), 
      hardness: 0, 
      flow: 10, 
      flowPressure: true,
      buildup: true
    },
    thumbnail: ''
  },
  {
    id: 'pencil',
    name: 'Pencil',
    category: 'dry-media',
    settings: { 
      ...createDefaultBrushSettings(), 
      size: 5,
      hardness: 100,
      opacity: 90,
      sizeJitter: 5
    },
    thumbnail: ''
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    category: 'dry-media',
    settings: { 
      ...createDefaultBrushSettings(), 
      size: 20,
      hardness: 30,
      opacity: 80,
      sizeJitter: 20,
      angleJitter: 10
    },
    thumbnail: ''
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    category: 'wet-media',
    settings: { 
      ...createDefaultBrushSettings(), 
      hardness: 0,
      opacity: 30,
      flow: 50,
      wetEdges: true,
      buildup: true
    },
    thumbnail: ''
  },
  {
    id: 'oil-brush',
    name: 'Oil Brush',
    category: 'wet-media',
    settings: { 
      ...createDefaultBrushSettings(), 
      size: 40,
      hardness: 70,
      tipShape: 'flat',
      spacing: 15
    },
    thumbnail: ''
  },
  {
    id: 'spray-paint',
    name: 'Spray Paint',
    category: 'special-effects',
    settings: { 
      ...createDefaultBrushSettings(), 
      size: 100,
      hardness: 0,
      scatter: 100,
      scatterCount: 8,
      scatterBothAxes: true,
      spacing: 10
    },
    thumbnail: ''
  },
  {
    id: 'grass',
    name: 'Grass',
    category: 'special-effects',
    settings: { 
      ...createDefaultBrushSettings(), 
      size: 60,
      tipShape: 'rake',
      scatter: 50,
      scatterCount: 3,
      angleJitter: 30,
      sizeJitter: 40
    },
    thumbnail: ''
  },
  {
    id: 'eraser-hard',
    name: 'Hard Eraser',
    category: 'eraser',
    settings: { 
      ...createDefaultBrushSettings(), 
      hardness: 100,
      eraserMode: true,
      blendMode: 'clear'
    },
    thumbnail: ''
  },
  {
    id: 'eraser-soft',
    name: 'Soft Eraser',
    category: 'eraser',
    settings: { 
      ...createDefaultBrushSettings(), 
      hardness: 0,
      eraserMode: true,
      blendMode: 'clear'
    },
    thumbnail: ''
  }
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  
  return { 
    r: Math.round(r * 255), 
    g: Math.round(g * 255), 
    b: Math.round(b * 255) 
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  
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
  
  return { 
    r: Math.round(r * 255), 
    g: Math.round(g * 255), 
    b: Math.round(b * 255) 
  };
}

function createGaussianKernel1D(size: number, sigma: number): Float32Array {
  const kernel = new Float32Array(size);
  const center = Math.floor(size / 2);
  let sum = 0;
  
  for (let i = 0; i < size; i++) {
    const x = i - center;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  generateId
};

export default BrushEngine;
