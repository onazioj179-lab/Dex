// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - FLUX Animation Core System
// Professional animation rivaling After Effects/Motion quality
// Items 451-475 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface FluxProject {
  id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  duration: number;          // frames
  backgroundColor: string;
  compositions: Composition[];
  assets: Asset[];
  createdAt: number;
  updatedAt: number;
}

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;          // frames
  backgroundColor: string;
  layers: Layer[];
  guides: Guide[];
  markers: Marker[];
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  shy: boolean;
  
  // Timing
  inPoint: number;           // frame
  outPoint: number;          // frame
  startTime: number;         // offset
  
  // Transform
  transform: Transform;
  
  // Parenting
  parentId?: string;
  
  // Content
  source?: Asset | Composition;
  
  // Effects
  effects: Effect[];
  
  // Masks
  masks: Mask[];
  
  // Blending
  blendMode: BlendMode;
  opacity: AnimatableProperty<number>;
  
  // 3D
  is3D: boolean;
  
  // Motion blur
  motionBlur: boolean;
  
  // Track matte
  trackMatte?: { layerId: string; mode: TrackMatteMode };
  
  // Time remapping
  timeRemap?: AnimatableProperty<number>;
}

export type LayerType = 
  | 'solid' | 'shape' | 'text' | 'image' | 'video' | 'audio'
  | 'composition' | 'null' | 'adjustment' | 'camera' | 'light';

export interface Transform {
  anchorPoint: AnimatableProperty<Vector3>;
  position: AnimatableProperty<Vector3>;
  scale: AnimatableProperty<Vector3>;
  rotation: AnimatableProperty<Vector3>;    // X, Y, Z rotation
  opacity: AnimatableProperty<number>;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface AnimatableProperty<T> {
  value: T;
  keyframes: Keyframe<T>[];
  expression?: string;
}

export interface Keyframe<T> {
  id: string;
  time: number;              // frame
  value: T;
  easing: EasingType;
  easingParams?: EasingParams;
  spatialTangents?: { in: Vector2; out: Vector2 };
  selected: boolean;
}

export type EasingType = 
  | 'linear' | 'hold'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'bezier' | 'bounce' | 'elastic' | 'spring';

export interface EasingParams {
  // For bezier
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // For spring/elastic
  mass?: number;
  stiffness?: number;
  damping?: number;
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'composition' | 'solid' | 'folder';
  path?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  data?: ImageBitmap | HTMLVideoElement | AudioBuffer;
}

export interface Effect {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  expanded: boolean;
  parameters: Map<string, AnimatableProperty<unknown>>;
}

export interface Mask {
  id: string;
  name: string;
  path: MaskPath;
  mode: MaskMode;
  inverted: boolean;
  feather: AnimatableProperty<number>;
  opacity: AnimatableProperty<number>;
  expansion: AnimatableProperty<number>;
}

export interface MaskPath {
  closed: boolean;
  vertices: AnimatableProperty<Vector2[]>;
  inTangents: AnimatableProperty<Vector2[]>;
  outTangents: AnimatableProperty<Vector2[]>;
}

export type MaskMode = 'add' | 'subtract' | 'intersect' | 'lighten' | 'darken' | 'difference';

export type BlendMode = 
  | 'normal' | 'dissolve'
  | 'darken' | 'multiply' | 'colorBurn' | 'linearBurn' | 'darkerColor'
  | 'lighten' | 'screen' | 'colorDodge' | 'linearDodge' | 'lighterColor'
  | 'overlay' | 'softLight' | 'hardLight' | 'vividLight' | 'linearLight' | 'pinLight' | 'hardMix'
  | 'difference' | 'exclusion' | 'subtract' | 'divide'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

export type TrackMatteMode = 'alpha' | 'alphaInverted' | 'luma' | 'lumaInverted';

export interface Guide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number;
  locked: boolean;
}

export interface Marker {
  id: string;
  time: number;
  duration: number;
  comment: string;
  color: string;
  protected: boolean;
}

// =============================================================================
// ITEM 451: ANIMATION ENGINE
// =============================================================================

export class AnimationEngine {
  private project: FluxProject | null = null;
  private activeComposition: Composition | null = null;
  private currentFrame: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1;
  private loopPlayback: boolean = true;
  private workAreaStart: number = 0;
  private workAreaEnd: number = 0;
  
  // Canvas
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  
  // Caching
  private frameCache: Map<number, ImageBitmap> = new Map();
  private maxCacheSize: number = 100;
  
  // Playback
  private animationFrameId: number = 0;
  private lastFrameTime: number = 0;
  
  // Callbacks
  private onFrameChange?: (frame: number) => void;
  private onPlayStateChange?: (playing: boolean) => void;
  private onRender?: (imageData: ImageData) => void;
  
  constructor() {}
  
  // =============================================================================
  // ITEM 452-455: PROJECT MANAGEMENT
  // =============================================================================
  
  createProject(name: string, width: number = 1920, height: number = 1080, fps: number = 30): FluxProject {
    const project: FluxProject = {
      id: this.generateId(),
      name,
      fps,
      width,
      height,
      duration: fps * 10,    // 10 seconds default
      backgroundColor: '#000000',
      compositions: [],
      assets: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Create main composition
    const mainComp = this.createComposition('Main Comp', width, height, fps, fps * 10);
    project.compositions.push(mainComp);
    
    this.project = project;
    this.activeComposition = mainComp;
    this.workAreaEnd = mainComp.duration;
    
    // Initialize canvas
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    
    return project;
  }
  
  createComposition(name: string, width: number, height: number, fps: number, duration: number): Composition {
    return {
      id: this.generateId(),
      name,
      width,
      height,
      fps,
      duration,
      backgroundColor: '#000000',
      layers: [],
      guides: [],
      markers: []
    };
  }
  
  setActiveComposition(compositionId: string): void {
    if (!this.project) return;
    
    const comp = this.project.compositions.find(c => c.id === compositionId);
    if (comp) {
      this.activeComposition = comp;
      this.currentFrame = 0;
      this.workAreaStart = 0;
      this.workAreaEnd = comp.duration;
      this.frameCache.clear();
      
      if (this.canvas) {
        this.canvas.width = comp.width;
        this.canvas.height = comp.height;
      }
    }
  }
  
  // =============================================================================
  // ITEM 456-460: LAYER MANAGEMENT
  // =============================================================================
  
  createSolidLayer(name: string, color: string, width?: number, height?: number): Layer {
    const comp = this.activeComposition;
    if (!comp) throw new Error('No active composition');
    
    return this.createLayer({
      name,
      type: 'solid',
      source: {
        id: this.generateId(),
        name: `${name} Source`,
        type: 'solid',
        width: width ?? comp.width,
        height: height ?? comp.height,
        color
      } as Asset & { color: string }
    });
  }
  
  createShapeLayer(name: string): Layer {
    return this.createLayer({
      name,
      type: 'shape'
    });
  }
  
  createTextLayer(name: string, text: string = 'New Text'): Layer {
    const layer = this.createLayer({
      name,
      type: 'text'
    });
    
    // Text properties would be stored in layer data
    return layer;
  }
  
  createNullLayer(name: string = 'Null'): Layer {
    return this.createLayer({
      name,
      type: 'null'
    });
  }
  
  createAdjustmentLayer(name: string = 'Adjustment Layer'): Layer {
    return this.createLayer({
      name,
      type: 'adjustment'
    });
  }
  
  createCameraLayer(name: string = 'Camera'): Layer {
    const layer = this.createLayer({
      name,
      type: 'camera',
      is3D: true
    });
    
    // Camera-specific properties
    layer.transform.position.value = { x: 0, y: 0, z: -1000 };
    
    return layer;
  }
  
  createLightLayer(name: string = 'Light'): Layer {
    return this.createLayer({
      name,
      type: 'light',
      is3D: true
    });
  }
  
  private createLayer(config: Partial<Layer>): Layer {
    const comp = this.activeComposition;
    if (!comp) throw new Error('No active composition');
    
    const layer: Layer = {
      id: this.generateId(),
      name: config.name || 'New Layer',
      type: config.type || 'solid',
      visible: true,
      locked: false,
      solo: false,
      shy: false,
      inPoint: 0,
      outPoint: comp.duration,
      startTime: 0,
      transform: this.createDefaultTransform(comp),
      effects: [],
      masks: [],
      blendMode: 'normal',
      opacity: { value: 100, keyframes: [] },
      is3D: config.is3D || false,
      motionBlur: false,
      ...config
    };
    
    comp.layers.unshift(layer); // Add to top
    return layer;
  }
  
  private createDefaultTransform(comp: Composition): Transform {
    return {
      anchorPoint: { value: { x: comp.width / 2, y: comp.height / 2, z: 0 }, keyframes: [] },
      position: { value: { x: comp.width / 2, y: comp.height / 2, z: 0 }, keyframes: [] },
      scale: { value: { x: 100, y: 100, z: 100 }, keyframes: [] },
      rotation: { value: { x: 0, y: 0, z: 0 }, keyframes: [] },
      opacity: { value: 100, keyframes: [] }
    };
  }
  
  duplicateLayer(layerId: string): Layer | null {
    const comp = this.activeComposition;
    if (!comp) return null;
    
    const layer = comp.layers.find(l => l.id === layerId);
    if (!layer) return null;
    
    const duplicate: Layer = JSON.parse(JSON.stringify(layer));
    duplicate.id = this.generateId();
    duplicate.name = `${layer.name} Copy`;
    
    // Generate new IDs for keyframes
    this.regenerateIds(duplicate);
    
    const index = comp.layers.indexOf(layer);
    comp.layers.splice(index, 0, duplicate);
    
    return duplicate;
  }
  
  deleteLayer(layerId: string): void {
    const comp = this.activeComposition;
    if (!comp) return;
    
    const index = comp.layers.findIndex(l => l.id === layerId);
    if (index !== -1 && !comp.layers[index].locked) {
      comp.layers.splice(index, 1);
    }
  }
  
  reorderLayer(layerId: string, newIndex: number): void {
    const comp = this.activeComposition;
    if (!comp) return;
    
    const currentIndex = comp.layers.findIndex(l => l.id === layerId);
    if (currentIndex === -1) return;
    
    const [layer] = comp.layers.splice(currentIndex, 1);
    comp.layers.splice(Math.max(0, Math.min(newIndex, comp.layers.length)), 0, layer);
  }
  
  parentLayer(childId: string, parentId: string | null): void {
    const comp = this.activeComposition;
    if (!comp) return;
    
    const child = comp.layers.find(l => l.id === childId);
    if (child) {
      child.parentId = parentId || undefined;
    }
  }
  
  // =============================================================================
  // ITEM 461-465: KEYFRAME ANIMATION
  // =============================================================================
  
  addKeyframe<T>(layerId: string, propertyPath: string, value: T, frame?: number): Keyframe<T> | null {
    const layer = this.getLayer(layerId);
    if (!layer) return null;
    
    const property = this.getProperty<T>(layer, propertyPath);
    if (!property) return null;
    
    const time = frame ?? this.currentFrame;
    
    // Check if keyframe exists at this time
    const existingIndex = property.keyframes.findIndex(k => k.time === time);
    
    const keyframe: Keyframe<T> = {
      id: this.generateId(),
      time,
      value,
      easing: 'easeInOut',
      selected: false
    };
    
    if (existingIndex !== -1) {
      property.keyframes[existingIndex] = keyframe;
    } else {
      // Insert in sorted order
      const insertIndex = property.keyframes.findIndex(k => k.time > time);
      if (insertIndex === -1) {
        property.keyframes.push(keyframe);
      } else {
        property.keyframes.splice(insertIndex, 0, keyframe);
      }
    }
    
    this.clearFrameCache();
    return keyframe;
  }
  
  deleteKeyframe(layerId: string, propertyPath: string, keyframeId: string): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    
    const property = this.getProperty(layer, propertyPath);
    if (!property) return;
    
    const index = property.keyframes.findIndex(k => k.id === keyframeId);
    if (index !== -1) {
      property.keyframes.splice(index, 1);
      this.clearFrameCache();
    }
  }
  
  moveKeyframes(layerId: string, propertyPath: string, keyframeIds: string[], deltaFrames: number): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    
    const property = this.getProperty(layer, propertyPath);
    if (!property) return;
    
    for (const keyframe of property.keyframes) {
      if (keyframeIds.includes(keyframe.id)) {
        keyframe.time = Math.max(0, keyframe.time + deltaFrames);
      }
    }
    
    // Re-sort
    property.keyframes.sort((a, b) => a.time - b.time);
    this.clearFrameCache();
  }
  
  setKeyframeEasing(layerId: string, propertyPath: string, keyframeId: string, easing: EasingType, params?: EasingParams): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    
    const property = this.getProperty(layer, propertyPath);
    if (!property) return;
    
    const keyframe = property.keyframes.find(k => k.id === keyframeId);
    if (keyframe) {
      keyframe.easing = easing;
      keyframe.easingParams = params;
      this.clearFrameCache();
    }
  }
  
  getValueAtTime<T>(property: AnimatableProperty<T>, frame: number): T {
    if (property.keyframes.length === 0) {
      return property.value;
    }
    
    // Find surrounding keyframes
    let prevKf: Keyframe<T> | null = null;
    let nextKf: Keyframe<T> | null = null;
    
    for (const kf of property.keyframes) {
      if (kf.time <= frame) {
        prevKf = kf;
      } else {
        nextKf = kf;
        break;
      }
    }
    
    if (!prevKf) return property.keyframes[0].value;
    if (!nextKf) return prevKf.value;
    if (prevKf.easing === 'hold') return prevKf.value;
    
    // Interpolate
    const t = (frame - prevKf.time) / (nextKf.time - prevKf.time);
    const easedT = this.applyEasing(t, prevKf.easing, prevKf.easingParams);
    
    return this.interpolateValue(prevKf.value, nextKf.value, easedT);
  }
  
  private applyEasing(t: number, easing: EasingType, params?: EasingParams): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'hold':
        return 0;
      case 'easeIn':
        return t * t;
      case 'easeOut':
        return 1 - (1 - t) * (1 - t);
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'bezier':
        if (params) {
          return this.bezierEasing(t, params.x1 ?? 0.4, params.y1 ?? 0, params.x2 ?? 0.6, params.y2 ?? 1);
        }
        return t;
      case 'bounce':
        return this.bounceEasing(t);
      case 'elastic':
        return this.elasticEasing(t, params?.damping ?? 0.3);
      case 'spring':
        return this.springEasing(t, params?.mass ?? 1, params?.stiffness ?? 100, params?.damping ?? 10);
      default:
        return t;
    }
  }
  
  private bezierEasing(t: number, x1: number, y1: number, x2: number, y2: number): number {
    // Simplified cubic bezier - would need proper implementation
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    
    const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
    
    // Newton-Raphson to find t for x
    let guess = t;
    for (let i = 0; i < 4; i++) {
      const slope = (3 * ax * guess + 2 * bx) * guess + cx;
      if (slope === 0) break;
      guess -= (sampleX(guess) - t) / slope;
    }
    
    return sampleY(guess);
  }
  
  private bounceEasing(t: number): number {
    const n1 = 7.5625;
    const d1 = 2.75;
    
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
  
  private elasticEasing(t: number, damping: number): number {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / damping / 3) + 1;
  }
  
  private springEasing(t: number, mass: number, stiffness: number, damping: number): number {
    // Simplified spring physics
    const omega = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    
    if (zeta < 1) {
      const omegaD = omega * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + (zeta * omega / omegaD) * Math.sin(omegaD * t));
    }
    return 1 - Math.exp(-omega * t) * (1 + omega * t);
  }
  
  private interpolateValue<T>(a: T, b: T, t: number): T {
    if (typeof a === 'number' && typeof b === 'number') {
      return (a + (b - a) * t) as T;
    }
    
    if (this.isVector3(a) && this.isVector3(b)) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t
      } as T;
    }
    
    if (this.isVector2(a) && this.isVector2(b)) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      } as T;
    }
    
    // For non-interpolatable values, return a until we reach b
    return t < 1 ? a : b;
  }
  
  private isVector3(v: unknown): v is Vector3 {
    return typeof v === 'object' && v !== null && 'x' in v && 'y' in v && 'z' in v;
  }
  
  private isVector2(v: unknown): v is Vector2 {
    return typeof v === 'object' && v !== null && 'x' in v && 'y' in v && !('z' in v);
  }
  
  // =============================================================================
  // ITEM 466-470: PLAYBACK
  // =============================================================================
  
  play(): void {
    if (this.isPlaying || !this.activeComposition) return;
    
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.onPlayStateChange?.(true);
    
    this.playbackLoop();
  }
  
  pause(): void {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.onPlayStateChange?.(false);
  }
  
  stop(): void {
    this.pause();
    this.currentFrame = this.workAreaStart;
    this.onFrameChange?.(this.currentFrame);
  }
  
  private playbackLoop(): void {
    if (!this.isPlaying || !this.activeComposition) return;
    
    const now = performance.now();
    const frameDuration = 1000 / (this.activeComposition.fps * this.playbackSpeed);
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= frameDuration) {
      this.currentFrame++;
      
      if (this.currentFrame >= this.workAreaEnd) {
        if (this.loopPlayback) {
          this.currentFrame = this.workAreaStart;
        } else {
          this.pause();
          return;
        }
      }
      
      this.lastFrameTime = now - (elapsed % frameDuration);
      this.onFrameChange?.(this.currentFrame);
      this.renderFrame(this.currentFrame);
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.playbackLoop());
  }
  
  goToFrame(frame: number): void {
    this.currentFrame = Math.max(0, Math.min(frame, (this.activeComposition?.duration ?? 0) - 1));
    this.onFrameChange?.(this.currentFrame);
    this.renderFrame(this.currentFrame);
  }
  
  nextFrame(): void {
    this.goToFrame(this.currentFrame + 1);
  }
  
  prevFrame(): void {
    this.goToFrame(this.currentFrame - 1);
  }
  
  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.1, Math.min(8, speed));
  }
  
  setWorkArea(start: number, end: number): void {
    this.workAreaStart = Math.max(0, start);
    this.workAreaEnd = Math.min(end, this.activeComposition?.duration ?? 0);
  }
  
  setLoop(loop: boolean): void {
    this.loopPlayback = loop;
  }
  
  // =============================================================================
  // ITEM 471-475: RENDERING
  // =============================================================================
  
  renderFrame(frame: number): ImageData | null {
    if (!this.ctx || !this.canvas || !this.activeComposition) return null;
    
    const comp = this.activeComposition;
    
    // Check cache
    if (this.frameCache.has(frame)) {
      const cached = this.frameCache.get(frame)!;
      this.ctx.drawImage(cached, 0, 0);
      const imageData = this.ctx.getImageData(0, 0, comp.width, comp.height);
      this.onRender?.(imageData);
      return imageData;
    }
    
    // Clear
    this.ctx.fillStyle = comp.backgroundColor;
    this.ctx.fillRect(0, 0, comp.width, comp.height);
    
    // Render layers bottom to top
    const visibleLayers = comp.layers.filter(l => 
      l.visible && frame >= l.inPoint && frame < l.outPoint
    ).reverse();
    
    for (const layer of visibleLayers) {
      this.renderLayer(layer, frame);
    }
    
    // Cache if under limit
    if (this.frameCache.size < this.maxCacheSize) {
      createImageBitmap(this.canvas).then(bitmap => {
        this.frameCache.set(frame, bitmap);
      });
    }
    
    const imageData = this.ctx.getImageData(0, 0, comp.width, comp.height);
    this.onRender?.(imageData);
    
    return imageData;
  }
  
  private renderLayer(layer: Layer, frame: number): void {
    if (!this.ctx) return;
    
    // Calculate local frame (with time remapping)
    let localFrame = frame - layer.inPoint + layer.startTime;
    if (layer.timeRemap) {
      localFrame = this.getValueAtTime(layer.timeRemap, frame);
    }
    
    // Get animated transform values
    const transform = layer.transform;
    const anchorPoint = this.getValueAtTime(transform.anchorPoint, frame);
    const position = this.getValueAtTime(transform.position, frame);
    const scale = this.getValueAtTime(transform.scale, frame);
    const rotation = this.getValueAtTime(transform.rotation, frame);
    const opacity = this.getValueAtTime(transform.opacity, frame);
    
    // Apply parent transform
    if (layer.parentId) {
      const parent = this.getLayer(layer.parentId);
      if (parent) {
        this.applyParentTransform(parent, frame);
      }
    }
    
    this.ctx.save();
    
    // Apply transform
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate((rotation.z * Math.PI) / 180);
    this.ctx.scale(scale.x / 100, scale.y / 100);
    this.ctx.translate(-anchorPoint.x, -anchorPoint.y);
    
    // Apply opacity
    this.ctx.globalAlpha = opacity / 100;
    
    // Apply blend mode
    this.ctx.globalCompositeOperation = this.mapBlendMode(layer.blendMode);
    
    // Render based on type
    switch (layer.type) {
      case 'solid':
        this.renderSolid(layer);
        break;
      case 'shape':
        this.renderShape(layer, frame);
        break;
      case 'text':
        this.renderText(layer, frame);
        break;
      case 'image':
        this.renderImage(layer);
        break;
      case 'video':
        this.renderVideo(layer, localFrame);
        break;
      case 'composition':
        this.renderNestedComp(layer, localFrame);
        break;
      case 'adjustment':
        // Adjustment layers affect layers below
        break;
      case 'null':
        // Null layers are invisible
        break;
    }
    
    this.ctx.restore();
  }
  
  private applyParentTransform(parent: Layer, frame: number): void {
    if (!this.ctx) return;
    
    // Recursively apply parent transforms
    if (parent.parentId) {
      const grandparent = this.getLayer(parent.parentId);
      if (grandparent) {
        this.applyParentTransform(grandparent, frame);
      }
    }
    
    const transform = parent.transform;
    const anchorPoint = this.getValueAtTime(transform.anchorPoint, frame);
    const position = this.getValueAtTime(transform.position, frame);
    const scale = this.getValueAtTime(transform.scale, frame);
    const rotation = this.getValueAtTime(transform.rotation, frame);
    
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate((rotation.z * Math.PI) / 180);
    this.ctx.scale(scale.x / 100, scale.y / 100);
    this.ctx.translate(-anchorPoint.x, -anchorPoint.y);
  }
  
  private renderSolid(layer: Layer): void {
    if (!this.ctx || !layer.source) return;
    
    const source = layer.source as Asset & { color?: string };
    this.ctx.fillStyle = source.color || '#808080';
    this.ctx.fillRect(0, 0, source.width || 100, source.height || 100);
  }
  
  private renderShape(layer: Layer, frame: number): void {
    // Would render vector shapes
    if (!this.ctx) return;
    
    // Placeholder for shape rendering
    this.ctx.fillStyle = '#808080';
    this.ctx.fillRect(0, 0, 100, 100);
  }
  
  private renderText(layer: Layer, frame: number): void {
    // Would render text with proper styling
    if (!this.ctx) return;
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '48px sans-serif';
    this.ctx.fillText('Text', 0, 48);
  }
  
  private renderImage(layer: Layer): void {
    if (!this.ctx || !layer.source || !('data' in layer.source) || !layer.source.data) return;
    
    this.ctx.drawImage(layer.source.data as ImageBitmap, 0, 0);
  }
  
  private renderVideo(layer: Layer, frame: number): void {
    if (!this.ctx || !layer.source || !('data' in layer.source) || !layer.source.data) return;
    
    const video = layer.source.data as HTMLVideoElement;
    const fps = ('fps' in layer.source && layer.source.fps) || 30;
    video.currentTime = frame / fps;
    
    this.ctx.drawImage(video, 0, 0);
  }
  
  private renderNestedComp(layer: Layer, frame: number): void {
    if (!layer.source || !this.project) return;
    
    const comp = this.project.compositions.find(c => c.id === (layer.source as Composition).id);
    if (!comp) return;
    
    // Would recursively render composition
  }
  
  private mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
    const modeMap: Record<BlendMode, GlobalCompositeOperation> = {
      'normal': 'source-over',
      'dissolve': 'source-over',
      'darken': 'darken',
      'multiply': 'multiply',
      'colorBurn': 'color-burn',
      'linearBurn': 'color-burn',
      'darkerColor': 'darken',
      'lighten': 'lighten',
      'screen': 'screen',
      'colorDodge': 'color-dodge',
      'linearDodge': 'lighter',
      'lighterColor': 'lighten',
      'overlay': 'overlay',
      'softLight': 'soft-light',
      'hardLight': 'hard-light',
      'vividLight': 'hard-light',
      'linearLight': 'hard-light',
      'pinLight': 'hard-light',
      'hardMix': 'hard-light',
      'difference': 'difference',
      'exclusion': 'exclusion',
      'subtract': 'difference',
      'divide': 'difference',
      'hue': 'hue',
      'saturation': 'saturation',
      'color': 'color',
      'luminosity': 'luminosity'
    };
    
    return modeMap[mode] || 'source-over';
  }
  
  private clearFrameCache(): void {
    for (const bitmap of this.frameCache.values()) {
      bitmap.close();
    }
    this.frameCache.clear();
  }
  
  // =============================================================================
  // CALLBACKS
  // =============================================================================
  
  onFrame(callback: (frame: number) => void): void {
    this.onFrameChange = callback;
  }
  
  onPlayState(callback: (playing: boolean) => void): void {
    this.onPlayStateChange = callback;
  }
  
  onRenderFrame(callback: (imageData: ImageData) => void): void {
    this.onRender = callback;
  }
  
  // =============================================================================
  // HELPERS
  // =============================================================================
  
  private getLayer(layerId: string): Layer | undefined {
    return this.activeComposition?.layers.find(l => l.id === layerId);
  }
  
  private getProperty<T>(layer: Layer, path: string): AnimatableProperty<T> | undefined {
    const parts = path.split('.');
    let current: unknown = layer;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return current as AnimatableProperty<T>;
  }
  
  private regenerateIds(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    
    if ('id' in obj) {
      (obj as { id: string }).id = this.generateId();
    }
    
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(item => this.regenerateIds(item));
      } else if (typeof value === 'object') {
        this.regenerateIds(value);
      }
    }
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Getters
  getProject(): FluxProject | null {
    return this.project;
  }
  
  getActiveComposition(): Composition | null {
    return this.activeComposition;
  }
  
  getCurrentFrame(): number {
    return this.currentFrame;
  }
  
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
  
  getLayers(): Layer[] {
    return this.activeComposition?.layers ?? [];
  }
  
  dispose(): void {
    this.pause();
    this.clearFrameCache();
    this.project = null;
    this.activeComposition = null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createAnimationEngine = () => new AnimationEngine();

export default AnimationEngine;
