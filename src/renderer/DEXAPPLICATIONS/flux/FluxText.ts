// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - FLUX Text & Shapes System
// Professional text animation and shape layer tools
// Items 501-525 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface TextLayer {
  id: string;
  name: string;
  type: 'point' | 'paragraph';
  
  // Content
  sourceText: AnimatableString;
  
  // Typography
  font: FontProperties;
  paragraphStyle: ParagraphStyle;
  
  // Transform
  position: AnimatablePoint;
  anchor: AnimatablePoint;
  scale: AnimatablePoint;
  rotation: AnimatableNumber;
  opacity: AnimatableNumber;
  
  // Path
  pathOptions?: TextPathOptions;
  
  // 3D
  enable3D: boolean;
  rotationX: AnimatableNumber;
  rotationY: AnimatableNumber;
  rotationZ: AnimatableNumber;
  
  // Animators
  animators: TextAnimator[];
}

export interface FontProperties {
  family: string;
  style: string;           // Regular, Bold, Italic, etc.
  size: AnimatableNumber;
  tracking: AnimatableNumber;
  leading: AnimatableNumber | 'auto';
  baselineShift: AnimatableNumber;
  
  // Fill
  fillColor: AnimatableColor;
  fillEnabled: boolean;
  
  // Stroke
  strokeColor: AnimatableColor;
  strokeWidth: AnimatableNumber;
  strokeEnabled: boolean;
  strokeOverFill: boolean;
  
  // Options
  allCaps: boolean;
  smallCaps: boolean;
  superscript: boolean;
  subscript: boolean;
  
  // OpenType
  ligatures: boolean;
  kerning: 'metrics' | 'optical' | number;
}

export interface ParagraphStyle {
  alignment: TextAlignment;
  justifyLast: JustifyLast;
  
  // Spacing
  firstLineIndent: number;
  leftIndent: number;
  rightIndent: number;
  spaceBefore: number;
  spaceAfter: number;
  
  // Box (for paragraph text)
  boxWidth?: number;
  boxHeight?: number;
  boxTextAlignment: VerticalAlignment;
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';
export type JustifyLast = 'left' | 'center' | 'right' | 'full';
export type VerticalAlignment = 'top' | 'center' | 'bottom';

export interface TextPathOptions {
  pathId: string;          // Reference to mask or shape path
  firstMargin: number;
  lastMargin: number;
  forceAlignment: boolean;
  perpendicularToPath: boolean;
  reverse: boolean;
}

// =============================================================================
// TEXT ANIMATORS
// =============================================================================

export interface TextAnimator {
  id: string;
  name: string;
  enabled: boolean;
  
  // Selector
  selector: TextSelector;
  
  // Properties
  properties: TextAnimatorProperties;
}

export interface TextSelector {
  type: 'range' | 'expression' | 'wiggly';
  
  // Range selector
  start: AnimatableNumber;
  end: AnimatableNumber;
  offset: AnimatableNumber;
  
  // Based On
  basedOn: 'characters' | 'charactersExcludingSpaces' | 'words' | 'lines';
  
  // Mode
  mode: 'add' | 'subtract' | 'intersect' | 'min' | 'max' | 'difference';
  
  // Shape
  shape: 'square' | 'rampUp' | 'rampDown' | 'triangle' | 'round' | 'smooth';
  
  // Advanced
  amount: AnimatableNumber;
  ease: AnimatableNumber;
  randomize: boolean;
  randomSeed: number;
}

export interface TextAnimatorProperties {
  // Position
  position?: AnimatablePoint3D;
  
  // Anchor Point
  anchor?: AnimatablePoint3D;
  
  // Scale
  scale?: AnimatablePoint3D;
  
  // Skew
  skew?: AnimatableNumber;
  skewAxis?: AnimatableNumber;
  
  // Rotation
  rotation?: AnimatableNumber;
  rotationX?: AnimatableNumber;
  rotationY?: AnimatableNumber;
  rotationZ?: AnimatableNumber;
  
  // Opacity
  opacity?: AnimatableNumber;
  
  // Fill
  fillColor?: AnimatableColor;
  fillHue?: AnimatableNumber;
  fillSaturation?: AnimatableNumber;
  fillBrightness?: AnimatableNumber;
  
  // Stroke
  strokeColor?: AnimatableColor;
  strokeWidth?: AnimatableNumber;
  strokeHue?: AnimatableNumber;
  strokeSaturation?: AnimatableNumber;
  strokeBrightness?: AnimatableNumber;
  
  // Tracking
  tracking?: AnimatableNumber;
  
  // Line
  lineAnchor?: AnimatableNumber;
  lineSpacing?: AnimatableNumber;
  
  // Character
  characterOffset?: AnimatableNumber;
  characterValue?: AnimatableNumber;
  
  // Blur
  blur?: AnimatableNumber;
}

// =============================================================================
// SHAPE LAYERS
// =============================================================================

export interface ShapeLayer {
  id: string;
  name: string;
  
  // Transform
  position: AnimatablePoint;
  anchor: AnimatablePoint;
  scale: AnimatablePoint;
  rotation: AnimatableNumber;
  opacity: AnimatableNumber;
  
  // 3D
  enable3D: boolean;
  rotationX: AnimatableNumber;
  rotationY: AnimatableNumber;
  rotationZ: AnimatableNumber;
  
  // Contents
  contents: ShapeGroup[];
}

export interface ShapeGroup {
  id: string;
  name: string;
  type: 'group';
  
  // Transform
  transform: ShapeTransform;
  
  // Contents
  contents: ShapeItem[];
  
  // Blend
  blendMode: BlendMode;
}

export type ShapeItem = 
  | ShapePath
  | ShapeRectangle
  | ShapeEllipse
  | ShapePolyStar
  | ShapeFill
  | ShapeStroke
  | ShapeGradientFill
  | ShapeGradientStroke
  | ShapeTrimPaths
  | ShapeMergePaths
  | ShapeOffsetPaths
  | ShapePuckerBloat
  | ShapeRepeater
  | ShapeRoundCorners
  | ShapeTwist
  | ShapeWigglePaths
  | ShapeWiggleTransform
  | ShapeZigZag;

export interface ShapeTransform {
  anchor: AnimatablePoint;
  position: AnimatablePoint;
  scale: AnimatablePoint;
  rotation: AnimatableNumber;
  skew: AnimatableNumber;
  skewAxis: AnimatableNumber;
  opacity: AnimatableNumber;
}

export interface ShapePath {
  type: 'path';
  id: string;
  name: string;
  closed: boolean;
  path: AnimatablePath;
  direction: 'clockwise' | 'counterClockwise';
}

export interface ShapeRectangle {
  type: 'rectangle';
  id: string;
  name: string;
  position: AnimatablePoint;
  size: AnimatablePoint;
  roundness: AnimatableNumber;
  direction: 'clockwise' | 'counterClockwise';
}

export interface ShapeEllipse {
  type: 'ellipse';
  id: string;
  name: string;
  position: AnimatablePoint;
  size: AnimatablePoint;
  direction: 'clockwise' | 'counterClockwise';
}

export interface ShapePolyStar {
  type: 'polyStar';
  id: string;
  name: string;
  shapeType: 'star' | 'polygon';
  position: AnimatablePoint;
  points: AnimatableNumber;
  rotation: AnimatableNumber;
  outerRadius: AnimatableNumber;
  outerRoundness: AnimatableNumber;
  innerRadius?: AnimatableNumber;     // Star only
  innerRoundness?: AnimatableNumber;  // Star only
  direction: 'clockwise' | 'counterClockwise';
}

export interface ShapeFill {
  type: 'fill';
  id: string;
  name: string;
  color: AnimatableColor;
  opacity: AnimatableNumber;
  fillRule: 'nonZero' | 'evenOdd';
  blendMode: BlendMode;
}

export interface ShapeStroke {
  type: 'stroke';
  id: string;
  name: string;
  color: AnimatableColor;
  opacity: AnimatableNumber;
  width: AnimatableNumber;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashes?: StrokeDash[];
  blendMode: BlendMode;
}

export interface StrokeDash {
  type: 'dash' | 'gap' | 'offset';
  value: AnimatableNumber;
}

export interface ShapeGradientFill {
  type: 'gradientFill';
  id: string;
  name: string;
  gradientType: 'linear' | 'radial';
  startPoint: AnimatablePoint;
  endPoint: AnimatablePoint;
  colors: GradientColorStop[];
  opacity: AnimatableNumber;
  highlightLength?: AnimatableNumber; // Radial only
  highlightAngle?: AnimatableNumber;  // Radial only
  blendMode: BlendMode;
}

export interface ShapeGradientStroke {
  type: 'gradientStroke';
  id: string;
  name: string;
  gradientType: 'linear' | 'radial';
  startPoint: AnimatablePoint;
  endPoint: AnimatablePoint;
  colors: GradientColorStop[];
  opacity: AnimatableNumber;
  width: AnimatableNumber;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  blendMode: BlendMode;
}

export interface GradientColorStop {
  position: number;    // 0-1
  color: string;       // Hex
}

// Shape Operations
export interface ShapeTrimPaths {
  type: 'trimPaths';
  id: string;
  name: string;
  start: AnimatableNumber;
  end: AnimatableNumber;
  offset: AnimatableNumber;
  trimMode: 'simultaneously' | 'individually';
}

export interface ShapeMergePaths {
  type: 'mergePaths';
  id: string;
  name: string;
  mode: 'merge' | 'add' | 'subtract' | 'intersect' | 'excludeIntersections';
}

export interface ShapeOffsetPaths {
  type: 'offsetPaths';
  id: string;
  name: string;
  amount: AnimatableNumber;
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  copies: number;
  copyOffset: AnimatableNumber;
}

export interface ShapePuckerBloat {
  type: 'puckerBloat';
  id: string;
  name: string;
  amount: AnimatableNumber;  // -100 to 100
}

export interface ShapeRepeater {
  type: 'repeater';
  id: string;
  name: string;
  copies: AnimatableNumber;
  offset: AnimatableNumber;
  composite: 'above' | 'below';
  transform: RepeaterTransform;
}

export interface RepeaterTransform {
  anchor: AnimatablePoint;
  position: AnimatablePoint;
  scale: AnimatablePoint;
  rotation: AnimatableNumber;
  startOpacity: AnimatableNumber;
  endOpacity: AnimatableNumber;
}

export interface ShapeRoundCorners {
  type: 'roundCorners';
  id: string;
  name: string;
  radius: AnimatableNumber;
}

export interface ShapeTwist {
  type: 'twist';
  id: string;
  name: string;
  angle: AnimatableNumber;
  center: AnimatablePoint;
}

export interface ShapeWigglePaths {
  type: 'wigglePaths';
  id: string;
  name: string;
  size: AnimatableNumber;
  detail: AnimatableNumber;
  points: 'corner' | 'smooth';
  wigglesPerSecond: number;
  correlation: number;
  temporalPhase: number;
  spatialPhase: number;
}

export interface ShapeWiggleTransform {
  type: 'wiggleTransform';
  id: string;
  name: string;
  wigglesPerSecond: number;
  correlation: number;
  temporalPhase: number;
  spatialPhase: number;
  transformType: 'transform' | 'anchor' | 'position' | 'scale' | 'rotation' | 'skew';
  wiggleAmount: AnimatableNumber;
}

export interface ShapeZigZag {
  type: 'zigZag';
  id: string;
  name: string;
  size: AnimatableNumber;
  ridgesPerSegment: AnimatableNumber;
  points: 'corner' | 'smooth';
}

// =============================================================================
// ANIMATABLE TYPES
// =============================================================================

export interface AnimatableNumber {
  value: number;
  keyframes: Keyframe<number>[];
}

export interface AnimatablePoint {
  value: { x: number; y: number };
  keyframes: Keyframe<{ x: number; y: number }>[];
}

export interface AnimatablePoint3D {
  value: { x: number; y: number; z: number };
  keyframes: Keyframe<{ x: number; y: number; z: number }>[];
}

export interface AnimatableColor {
  value: string;
  keyframes: Keyframe<string>[];
}

export interface AnimatableString {
  value: string;
  keyframes: Keyframe<string>[];
}

export interface AnimatablePath {
  value: PathData;
  keyframes: Keyframe<PathData>[];
}

export interface PathData {
  vertices: { x: number; y: number }[];
  inTangents: { x: number; y: number }[];
  outTangents: { x: number; y: number }[];
  closed: boolean;
}

export interface Keyframe<T> {
  time: number;
  value: T;
  easing: EasingType;
  spatialTangent?: { in: { x: number; y: number }; out: { x: number; y: number } };
}

export type EasingType = 'linear' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';

export type BlendMode = 
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'colorDodge' | 'colorBurn' | 'hardLight' | 'softLight' | 'difference'
  | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

// =============================================================================
// ITEM 501-508: TEXT ENGINE
// =============================================================================

export class TextEngine {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private loadedFonts: Set<string> = new Set();
  
  constructor(width: number = 1920, height: number = 1080) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  async loadFont(family: string, url: string): Promise<void> {
    if (this.loadedFonts.has(family)) return;
    
    try {
      const font = new FontFace(family, `url(${url})`);
      await font.load();
      (self as unknown as { fonts: FontFaceSet }).fonts.add(font);
      this.loadedFonts.add(family);
    } catch (error) {
      console.warn(`Failed to load font: ${family}`, error);
    }
  }
  
  createTextLayer(name: string, text: string, type: 'point' | 'paragraph' = 'point'): TextLayer {
    return {
      id: this.generateId(),
      name,
      type,
      sourceText: { value: text, keyframes: [] },
      font: {
        family: 'Arial',
        style: 'Regular',
        size: { value: 72, keyframes: [] },
        tracking: { value: 0, keyframes: [] },
        leading: 'auto',
        baselineShift: { value: 0, keyframes: [] },
        fillColor: { value: '#ffffff', keyframes: [] },
        fillEnabled: true,
        strokeColor: { value: '#000000', keyframes: [] },
        strokeWidth: { value: 0, keyframes: [] },
        strokeEnabled: false,
        strokeOverFill: false,
        allCaps: false,
        smallCaps: false,
        superscript: false,
        subscript: false,
        ligatures: true,
        kerning: 'metrics'
      },
      paragraphStyle: {
        alignment: 'left',
        justifyLast: 'left',
        firstLineIndent: 0,
        leftIndent: 0,
        rightIndent: 0,
        spaceBefore: 0,
        spaceAfter: 0,
        boxTextAlignment: 'top'
      },
      position: { value: { x: 960, y: 540 }, keyframes: [] },
      anchor: { value: { x: 0, y: 0 }, keyframes: [] },
      scale: { value: { x: 100, y: 100 }, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      opacity: { value: 100, keyframes: [] },
      enable3D: false,
      rotationX: { value: 0, keyframes: [] },
      rotationY: { value: 0, keyframes: [] },
      rotationZ: { value: 0, keyframes: [] },
      animators: []
    };
  }
  
  setFont(layer: TextLayer, options: Partial<FontProperties>): void {
    Object.assign(layer.font, options);
  }
  
  setParagraphStyle(layer: TextLayer, options: Partial<ParagraphStyle>): void {
    Object.assign(layer.paragraphStyle, options);
  }
  
  // =============================================================================
  // ITEM 509-515: TEXT ANIMATORS
  // =============================================================================
  
  addAnimator(layer: TextLayer, name: string = 'Animator 1'): TextAnimator {
    const animator: TextAnimator = {
      id: this.generateId(),
      name,
      enabled: true,
      selector: {
        type: 'range',
        start: { value: 0, keyframes: [] },
        end: { value: 100, keyframes: [] },
        offset: { value: 0, keyframes: [] },
        basedOn: 'characters',
        mode: 'add',
        shape: 'square',
        amount: { value: 100, keyframes: [] },
        ease: { value: 20, keyframes: [] },
        randomize: false,
        randomSeed: 0
      },
      properties: {}
    };
    
    layer.animators.push(animator);
    return animator;
  }
  
  setAnimatorProperty(animator: TextAnimator, property: keyof TextAnimatorProperties, value: unknown): void {
    (animator.properties as Record<string, unknown>)[property] = value;
  }
  
  removeAnimator(layer: TextLayer, animatorId: string): void {
    layer.animators = layer.animators.filter(a => a.id !== animatorId);
  }
  
  // Calculate per-character animation weights
  calculateAnimatorWeights(animator: TextAnimator, charIndex: number, totalChars: number, frame: number): number {
    const selector = animator.selector;
    const start = this.getValue(selector.start, frame) / 100;
    const end = this.getValue(selector.end, frame) / 100;
    const offset = this.getValue(selector.offset, frame) / 100;
    
    // Normalize character position
    const pos = (charIndex + 0.5) / totalChars;
    const offsetPos = (pos - offset + 1) % 1;
    
    // Check if in range
    if (offsetPos < start || offsetPos > end) {
      return 0;
    }
    
    // Calculate position within range
    const rangePos = (offsetPos - start) / (end - start);
    
    // Apply shape
    let weight = this.calculateSelectorShape(rangePos, selector.shape);
    
    // Apply amount
    weight *= this.getValue(selector.amount, frame) / 100;
    
    // Apply randomize
    if (selector.randomize) {
      const random = this.seededRandom(charIndex + selector.randomSeed);
      weight *= random;
    }
    
    return Math.max(0, Math.min(1, weight));
  }
  
  private calculateSelectorShape(pos: number, shape: TextSelector['shape']): number {
    switch (shape) {
      case 'square':
        return 1;
      case 'rampUp':
        return pos;
      case 'rampDown':
        return 1 - pos;
      case 'triangle':
        return 1 - Math.abs(pos - 0.5) * 2;
      case 'round':
        return Math.sin(pos * Math.PI);
      case 'smooth':
        return 0.5 - Math.cos(pos * Math.PI) * 0.5;
      default:
        return 1;
    }
  }
  
  private seededRandom(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  
  // =============================================================================
  // ITEM 516-520: TEXT RENDERING
  // =============================================================================
  
  renderText(layer: TextLayer, frame: number): ImageData {
    const text = this.getValue(layer.sourceText, frame);
    const fontSize = this.getValue(layer.font.size, frame);
    const position = this.getValue(layer.position, frame);
    const scale = this.getValue(layer.scale, frame);
    const rotation = this.getValue(layer.rotation, frame);
    const opacity = this.getValue(layer.opacity, frame);
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set up transform
    this.ctx.save();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(rotation * Math.PI / 180);
    this.ctx.scale(scale.x / 100, scale.y / 100);
    this.ctx.globalAlpha = opacity / 100;
    
    // Build font string
    const fontStyle = layer.font.style.toLowerCase().includes('italic') ? 'italic' : 'normal';
    const fontWeight = layer.font.style.toLowerCase().includes('bold') ? 'bold' : 'normal';
    this.ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${layer.font.family}"`;
    this.ctx.textAlign = this.mapAlignment(layer.paragraphStyle.alignment);
    this.ctx.textBaseline = 'middle';
    
    // Apply animators and render characters
    const chars = text.split('');
    let currentX = 0;
    
    // Calculate total width for alignment
    const totalWidth = chars.reduce((sum, char) => {
      return sum + this.ctx.measureText(char).width;
    }, 0);
    
    // Start position based on alignment
    if (layer.paragraphStyle.alignment === 'center') {
      currentX = -totalWidth / 2;
    } else if (layer.paragraphStyle.alignment === 'right') {
      currentX = -totalWidth;
    }
    
    for (let i = 0; i < chars.length; i++) {
      this.ctx.save();
      
      // Apply animator transformations
      for (const animator of layer.animators) {
        if (!animator.enabled) continue;
        
        const weight = this.calculateAnimatorWeights(animator, i, chars.length, frame);
        this.applyAnimatorToContext(animator, weight, frame);
      }
      
      // Draw character
      const char = chars[i];
      const charWidth = this.ctx.measureText(char).width;
      
      // Fill
      if (layer.font.fillEnabled) {
        this.ctx.fillStyle = this.getValue(layer.font.fillColor, frame);
        this.ctx.fillText(char, currentX + charWidth / 2, 0);
      }
      
      // Stroke
      if (layer.font.strokeEnabled) {
        this.ctx.strokeStyle = this.getValue(layer.font.strokeColor, frame);
        this.ctx.lineWidth = this.getValue(layer.font.strokeWidth, frame);
        this.ctx.strokeText(char, currentX + charWidth / 2, 0);
      }
      
      // Add tracking
      const tracking = this.getValue(layer.font.tracking, frame);
      currentX += charWidth + (tracking / 1000) * fontSize;
      
      this.ctx.restore();
    }
    
    this.ctx.restore();
    
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }
  
  private applyAnimatorToContext(animator: TextAnimator, weight: number, frame: number): void {
    const props = animator.properties;
    
    if (props.position) {
      const pos = this.getValue(props.position, frame);
      this.ctx.translate(pos.x * weight, pos.y * weight);
    }
    
    if (props.scale) {
      const scale = this.getValue(props.scale, frame);
      const sx = 1 + (scale.x / 100 - 1) * weight;
      const sy = 1 + (scale.y / 100 - 1) * weight;
      this.ctx.scale(sx, sy);
    }
    
    if (props.rotation) {
      const rot = this.getValue(props.rotation, frame);
      this.ctx.rotate(rot * weight * Math.PI / 180);
    }
    
    if (props.opacity) {
      const op = this.getValue(props.opacity, frame);
      this.ctx.globalAlpha *= 1 - (1 - op / 100) * weight;
    }
  }
  
  private mapAlignment(align: TextAlignment): CanvasTextAlign {
    switch (align) {
      case 'left': return 'left';
      case 'center': return 'center';
      case 'right': return 'right';
      case 'justify': return 'left';
      default: return 'left';
    }
  }
  
  // =============================================================================
  // TEXT PRESETS
  // =============================================================================
  
  createTypewriterPreset(layer: TextLayer, startFrame: number, duration: number): void {
    const animator = this.addAnimator(layer, 'Typewriter');
    
    animator.selector.basedOn = 'characters';
    animator.selector.start.keyframes = [
      { time: startFrame, value: 0, easing: 'linear' },
      { time: startFrame + duration, value: 100, easing: 'linear' }
    ];
    animator.selector.end.value = 100;
    animator.selector.shape = 'rampUp';
    
    animator.properties.opacity = { value: 0, keyframes: [] };
  }
  
  createScaleInPreset(layer: TextLayer, startFrame: number, duration: number): void {
    const animator = this.addAnimator(layer, 'Scale In');
    
    animator.selector.start.keyframes = [
      { time: startFrame, value: 0, easing: 'linear' },
      { time: startFrame + duration, value: 100, easing: 'linear' }
    ];
    
    animator.properties.scale = { value: { x: 0, y: 0, z: 100 }, keyframes: [] };
    animator.properties.opacity = { value: 0, keyframes: [] };
  }
  
  createWavePreset(layer: TextLayer): void {
    const animator = this.addAnimator(layer, 'Wave');
    
    animator.selector.type = 'wiggly';
    animator.selector.shape = 'round';
    
    animator.properties.position = { value: { x: 0, y: -20, z: 0 }, keyframes: [] };
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private getValue<T>(prop: { value: T; keyframes: Keyframe<T>[] }, frame: number): T {
    if (prop.keyframes.length === 0) {
      return prop.value;
    }
    
    // Find surrounding keyframes
    const sorted = [...prop.keyframes].sort((a, b) => a.time - b.time);
    
    if (frame <= sorted[0].time) {
      return sorted[0].value;
    }
    
    if (frame >= sorted[sorted.length - 1].time) {
      return sorted[sorted.length - 1].value;
    }
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (frame >= sorted[i].time && frame <= sorted[i + 1].time) {
        const t = (frame - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        return this.interpolate(sorted[i].value, sorted[i + 1].value, t);
      }
    }
    
    return prop.value;
  }
  
  private interpolate<T>(a: T, b: T, t: number): T {
    if (typeof a === 'number' && typeof b === 'number') {
      return (a + (b - a) * t) as T;
    }
    
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(a as object)) {
        result[key] = this.interpolate(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          t
        );
      }
      return result as T;
    }
    
    // For non-interpolatable types (strings), return a if t < 0.5, b otherwise
    return t < 0.5 ? a : b;
  }
}

// =============================================================================
// ITEM 521-525: SHAPE ENGINE
// =============================================================================

export class ShapeEngine {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  
  constructor(width: number = 1920, height: number = 1080) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  createShapeLayer(name: string): ShapeLayer {
    return {
      id: this.generateId(),
      name,
      position: { value: { x: 960, y: 540 }, keyframes: [] },
      anchor: { value: { x: 0, y: 0 }, keyframes: [] },
      scale: { value: { x: 100, y: 100 }, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      opacity: { value: 100, keyframes: [] },
      enable3D: false,
      rotationX: { value: 0, keyframes: [] },
      rotationY: { value: 0, keyframes: [] },
      rotationZ: { value: 0, keyframes: [] },
      contents: []
    };
  }
  
  addGroup(layer: ShapeLayer, name: string = 'Group 1'): ShapeGroup {
    const group: ShapeGroup = {
      id: this.generateId(),
      name,
      type: 'group',
      transform: this.createShapeTransform(),
      contents: [],
      blendMode: 'normal'
    };
    
    layer.contents.push(group);
    return group;
  }
  
  private createShapeTransform(): ShapeTransform {
    return {
      anchor: { value: { x: 0, y: 0 }, keyframes: [] },
      position: { value: { x: 0, y: 0 }, keyframes: [] },
      scale: { value: { x: 100, y: 100 }, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      skew: { value: 0, keyframes: [] },
      skewAxis: { value: 0, keyframes: [] },
      opacity: { value: 100, keyframes: [] }
    };
  }
  
  // Add shape primitives
  addRectangle(group: ShapeGroup, name: string = 'Rectangle'): ShapeRectangle {
    const rect: ShapeRectangle = {
      type: 'rectangle',
      id: this.generateId(),
      name,
      position: { value: { x: 0, y: 0 }, keyframes: [] },
      size: { value: { x: 100, y: 100 }, keyframes: [] },
      roundness: { value: 0, keyframes: [] },
      direction: 'clockwise'
    };
    
    group.contents.push(rect);
    return rect;
  }
  
  addEllipse(group: ShapeGroup, name: string = 'Ellipse'): ShapeEllipse {
    const ellipse: ShapeEllipse = {
      type: 'ellipse',
      id: this.generateId(),
      name,
      position: { value: { x: 0, y: 0 }, keyframes: [] },
      size: { value: { x: 100, y: 100 }, keyframes: [] },
      direction: 'clockwise'
    };
    
    group.contents.push(ellipse);
    return ellipse;
  }
  
  addPolyStar(group: ShapeGroup, type: 'star' | 'polygon', name?: string): ShapePolyStar {
    const shape: ShapePolyStar = {
      type: 'polyStar',
      id: this.generateId(),
      name: name || (type === 'star' ? 'Star' : 'Polygon'),
      shapeType: type,
      position: { value: { x: 0, y: 0 }, keyframes: [] },
      points: { value: type === 'star' ? 5 : 6, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      outerRadius: { value: 100, keyframes: [] },
      outerRoundness: { value: 0, keyframes: [] },
      innerRadius: type === 'star' ? { value: 50, keyframes: [] } : undefined,
      innerRoundness: type === 'star' ? { value: 0, keyframes: [] } : undefined,
      direction: 'clockwise'
    };
    
    group.contents.push(shape);
    return shape;
  }
  
  addPath(group: ShapeGroup, name: string = 'Path'): ShapePath {
    const path: ShapePath = {
      type: 'path',
      id: this.generateId(),
      name,
      closed: true,
      path: {
        value: {
          vertices: [],
          inTangents: [],
          outTangents: [],
          closed: true
        },
        keyframes: []
      },
      direction: 'clockwise'
    };
    
    group.contents.push(path);
    return path;
  }
  
  // Add styling
  addFill(group: ShapeGroup, color: string = '#ffffff'): ShapeFill {
    const fill: ShapeFill = {
      type: 'fill',
      id: this.generateId(),
      name: 'Fill',
      color: { value: color, keyframes: [] },
      opacity: { value: 100, keyframes: [] },
      fillRule: 'nonZero',
      blendMode: 'normal'
    };
    
    group.contents.push(fill);
    return fill;
  }
  
  addStroke(group: ShapeGroup, color: string = '#ffffff', width: number = 2): ShapeStroke {
    const stroke: ShapeStroke = {
      type: 'stroke',
      id: this.generateId(),
      name: 'Stroke',
      color: { value: color, keyframes: [] },
      opacity: { value: 100, keyframes: [] },
      width: { value: width, keyframes: [] },
      lineCap: 'round',
      lineJoin: 'round',
      miterLimit: 4,
      blendMode: 'normal'
    };
    
    group.contents.push(stroke);
    return stroke;
  }
  
  addGradientFill(group: ShapeGroup, type: 'linear' | 'radial' = 'linear'): ShapeGradientFill {
    const fill: ShapeGradientFill = {
      type: 'gradientFill',
      id: this.generateId(),
      name: 'Gradient Fill',
      gradientType: type,
      startPoint: { value: { x: -50, y: 0 }, keyframes: [] },
      endPoint: { value: { x: 50, y: 0 }, keyframes: [] },
      colors: [
        { position: 0, color: '#000000' },
        { position: 1, color: '#ffffff' }
      ],
      opacity: { value: 100, keyframes: [] },
      blendMode: 'normal'
    };
    
    group.contents.push(fill);
    return fill;
  }
  
  // Add modifiers
  addTrimPaths(group: ShapeGroup): ShapeTrimPaths {
    const trim: ShapeTrimPaths = {
      type: 'trimPaths',
      id: this.generateId(),
      name: 'Trim Paths',
      start: { value: 0, keyframes: [] },
      end: { value: 100, keyframes: [] },
      offset: { value: 0, keyframes: [] },
      trimMode: 'simultaneously'
    };
    
    group.contents.push(trim);
    return trim;
  }
  
  addRepeater(group: ShapeGroup, copies: number = 3): ShapeRepeater {
    const repeater: ShapeRepeater = {
      type: 'repeater',
      id: this.generateId(),
      name: 'Repeater',
      copies: { value: copies, keyframes: [] },
      offset: { value: 0, keyframes: [] },
      composite: 'below',
      transform: {
        anchor: { value: { x: 0, y: 0 }, keyframes: [] },
        position: { value: { x: 100, y: 0 }, keyframes: [] },
        scale: { value: { x: 100, y: 100 }, keyframes: [] },
        rotation: { value: 0, keyframes: [] },
        startOpacity: { value: 100, keyframes: [] },
        endOpacity: { value: 100, keyframes: [] }
      }
    };
    
    group.contents.push(repeater);
    return repeater;
  }
  
  addRoundCorners(group: ShapeGroup, radius: number = 10): ShapeRoundCorners {
    const round: ShapeRoundCorners = {
      type: 'roundCorners',
      id: this.generateId(),
      name: 'Round Corners',
      radius: { value: radius, keyframes: [] }
    };
    
    group.contents.push(round);
    return round;
  }
  
  addWigglePaths(group: ShapeGroup): ShapeWigglePaths {
    const wiggle: ShapeWigglePaths = {
      type: 'wigglePaths',
      id: this.generateId(),
      name: 'Wiggle Paths',
      size: { value: 10, keyframes: [] },
      detail: { value: 3, keyframes: [] },
      points: 'smooth',
      wigglesPerSecond: 2,
      correlation: 50,
      temporalPhase: 0,
      spatialPhase: 0
    };
    
    group.contents.push(wiggle);
    return wiggle;
  }
  
  addZigZag(group: ShapeGroup): ShapeZigZag {
    const zigzag: ShapeZigZag = {
      type: 'zigZag',
      id: this.generateId(),
      name: 'Zig Zag',
      size: { value: 10, keyframes: [] },
      ridgesPerSegment: { value: 5, keyframes: [] },
      points: 'corner'
    };
    
    group.contents.push(zigzag);
    return zigzag;
  }
  
  // =============================================================================
  // SHAPE RENDERING
  // =============================================================================
  
  renderShape(layer: ShapeLayer, frame: number): ImageData {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const position = this.getValue(layer.position, frame);
    const anchor = this.getValue(layer.anchor, frame);
    const scale = this.getValue(layer.scale, frame);
    const rotation = this.getValue(layer.rotation, frame);
    const opacity = this.getValue(layer.opacity, frame);
    
    this.ctx.save();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(rotation * Math.PI / 180);
    this.ctx.scale(scale.x / 100, scale.y / 100);
    this.ctx.translate(-anchor.x, -anchor.y);
    this.ctx.globalAlpha = opacity / 100;
    
    for (const group of layer.contents) {
      this.renderGroup(group, frame);
    }
    
    this.ctx.restore();
    
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }
  
  private renderGroup(group: ShapeGroup, frame: number): void {
    this.ctx.save();
    
    // Apply group transform
    const transform = group.transform;
    const position = this.getValue(transform.position, frame);
    const anchor = this.getValue(transform.anchor, frame);
    const scale = this.getValue(transform.scale, frame);
    const rotation = this.getValue(transform.rotation, frame);
    const opacity = this.getValue(transform.opacity, frame);
    
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(rotation * Math.PI / 180);
    this.ctx.scale(scale.x / 100, scale.y / 100);
    this.ctx.translate(-anchor.x, -anchor.y);
    this.ctx.globalAlpha *= opacity / 100;
    
    // Set blend mode
    this.ctx.globalCompositeOperation = this.mapBlendMode(group.blendMode);
    
    // Build paths first, then apply fills and strokes
    const paths: Path2D[] = [];
    
    for (const item of group.contents) {
      switch (item.type) {
        case 'rectangle':
          paths.push(this.buildRectanglePath(item, frame));
          break;
        case 'ellipse':
          paths.push(this.buildEllipsePath(item, frame));
          break;
        case 'polyStar':
          paths.push(this.buildPolyStarPath(item, frame));
          break;
        case 'path':
          paths.push(this.buildCustomPath(item, frame));
          break;
      }
    }
    
    // Apply styling (fills and strokes)
    for (const item of group.contents) {
      for (const path of paths) {
        switch (item.type) {
          case 'fill':
            this.ctx.fillStyle = this.getValue(item.color, frame);
            this.ctx.globalAlpha *= this.getValue(item.opacity, frame) / 100;
            this.ctx.fill(path);
            break;
          case 'stroke':
            this.ctx.strokeStyle = this.getValue(item.color, frame);
            this.ctx.lineWidth = this.getValue(item.width, frame);
            this.ctx.lineCap = item.lineCap;
            this.ctx.lineJoin = item.lineJoin;
            this.ctx.globalAlpha *= this.getValue(item.opacity, frame) / 100;
            this.ctx.stroke(path);
            break;
          case 'gradientFill':
            this.ctx.fillStyle = this.createGradient(item, frame);
            this.ctx.globalAlpha *= this.getValue(item.opacity, frame) / 100;
            this.ctx.fill(path);
            break;
        }
      }
    }
    
    this.ctx.restore();
  }
  
  private buildRectanglePath(rect: ShapeRectangle, frame: number): Path2D {
    const path = new Path2D();
    const pos = this.getValue(rect.position, frame);
    const size = this.getValue(rect.size, frame);
    const roundness = this.getValue(rect.roundness, frame);
    
    const x = pos.x - size.x / 2;
    const y = pos.y - size.y / 2;
    const r = Math.min(roundness, Math.min(size.x, size.y) / 2);
    
    if (r > 0) {
      path.roundRect(x, y, size.x, size.y, r);
    } else {
      path.rect(x, y, size.x, size.y);
    }
    
    return path;
  }
  
  private buildEllipsePath(ellipse: ShapeEllipse, frame: number): Path2D {
    const path = new Path2D();
    const pos = this.getValue(ellipse.position, frame);
    const size = this.getValue(ellipse.size, frame);
    
    path.ellipse(pos.x, pos.y, size.x / 2, size.y / 2, 0, 0, Math.PI * 2);
    
    return path;
  }
  
  private buildPolyStarPath(shape: ShapePolyStar, frame: number): Path2D {
    const path = new Path2D();
    const pos = this.getValue(shape.position, frame);
    const points = this.getValue(shape.points, frame);
    const rotation = this.getValue(shape.rotation, frame);
    const outerRadius = this.getValue(shape.outerRadius, frame);
    
    const innerRadius = shape.innerRadius 
      ? this.getValue(shape.innerRadius, frame) 
      : outerRadius;
    
    const angleStep = Math.PI / points;
    const startAngle = (rotation - 90) * Math.PI / 180;
    
    const isStar = shape.shapeType === 'star';
    const totalPoints = isStar ? points * 2 : points;
    
    for (let i = 0; i < totalPoints; i++) {
      const angle = startAngle + i * angleStep;
      const radius = isStar ? (i % 2 === 0 ? outerRadius : innerRadius) : outerRadius;
      
      const x = pos.x + Math.cos(angle) * radius;
      const y = pos.y + Math.sin(angle) * radius;
      
      if (i === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    
    path.closePath();
    return path;
  }
  
  private buildCustomPath(pathItem: ShapePath, frame: number): Path2D {
    const path = new Path2D();
    const pathData = this.getValue(pathItem.path, frame);
    
    if (pathData.vertices.length === 0) return path;
    
    path.moveTo(pathData.vertices[0].x, pathData.vertices[0].y);
    
    for (let i = 1; i < pathData.vertices.length; i++) {
      const prev = pathData.vertices[i - 1];
      const curr = pathData.vertices[i];
      const out = pathData.outTangents[i - 1];
      const in_ = pathData.inTangents[i];
      
      if (out.x === 0 && out.y === 0 && in_.x === 0 && in_.y === 0) {
        path.lineTo(curr.x, curr.y);
      } else {
        path.bezierCurveTo(
          prev.x + out.x, prev.y + out.y,
          curr.x + in_.x, curr.y + in_.y,
          curr.x, curr.y
        );
      }
    }
    
    if (pathData.closed) {
      path.closePath();
    }
    
    return path;
  }
  
  private createGradient(fill: ShapeGradientFill, frame: number): CanvasGradient {
    const start = this.getValue(fill.startPoint, frame);
    const end = this.getValue(fill.endPoint, frame);
    
    let gradient: CanvasGradient;
    
    if (fill.gradientType === 'linear') {
      gradient = this.ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    } else {
      const radius = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
      gradient = this.ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, radius);
    }
    
    for (const stop of fill.colors) {
      gradient.addColorStop(stop.position, stop.color);
    }
    
    return gradient;
  }
  
  private mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
    const mapping: Record<BlendMode, GlobalCompositeOperation> = {
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
      'luminosity': 'luminosity'
    };
    
    return mapping[mode] || 'source-over';
  }
  
  private getValue<T>(prop: { value: T; keyframes: Keyframe<T>[] }, frame: number): T {
    if (prop.keyframes.length === 0) {
      return prop.value;
    }
    
    const sorted = [...prop.keyframes].sort((a, b) => a.time - b.time);
    
    if (frame <= sorted[0].time) return sorted[0].value;
    if (frame >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (frame >= sorted[i].time && frame <= sorted[i + 1].time) {
        const t = (frame - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        return this.interpolate(sorted[i].value, sorted[i + 1].value, t);
      }
    }
    
    return prop.value;
  }
  
  private interpolate<T>(a: T, b: T, t: number): T {
    if (typeof a === 'number' && typeof b === 'number') {
      return (a + (b - a) * t) as T;
    }
    
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(a as object)) {
        result[key] = this.interpolate(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          t
        );
      }
      return result as T;
    }
    
    return t < 0.5 ? a : b;
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createTextEngine = (width?: number, height?: number) => new TextEngine(width, height);
export const createShapeEngine = (width?: number, height?: number) => new ShapeEngine(width, height);

export default { TextEngine, ShapeEngine };
