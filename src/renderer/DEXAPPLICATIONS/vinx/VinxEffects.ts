// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - VINX Video Effects & Transitions System
// Professional video effects rivaling After Effects/DaVinci Resolve
// Items 176-200 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface EffectParameter {
  name: string;
  type: 'number' | 'color' | 'point' | 'angle' | 'boolean' | 'select' | 'curve';
  defaultValue: unknown;
  min?: number;
  max?: number;
  options?: string[];
  unit?: string;
  animatable: boolean;
}

export interface VideoEffect {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: EffectParameter[];
  gpuAccelerated: boolean;
  process: (frame: ImageData, params: Record<string, unknown>, time: number) => ImageData;
}

export interface TransitionEffect {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: EffectParameter[];
  defaultDuration: number;
  render: (
    frameA: ImageData | null,
    frameB: ImageData | null,
    progress: number,
    params: Record<string, unknown>
  ) => ImageData;
}

export interface Keyframe {
  time: number;
  value: unknown;
  easing: EasingFunction;
}

export type EasingFunction = 
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-quart'
  | 'ease-out-quart'
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-out-bounce';

// =============================================================================
// ITEM 176: EFFECT PROCESSOR
// =============================================================================

export class EffectProcessor {
  private effects: Map<string, VideoEffect> = new Map();
  private transitions: Map<string, TransitionEffect> = new Map();
  private offscreenCanvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  
  constructor(width: number, height: number) {
    this.offscreenCanvas = new OffscreenCanvas(width, height);
    this.ctx = this.offscreenCanvas.getContext('2d')!;
    this.registerBuiltInEffects();
    this.registerBuiltInTransitions();
  }
  
  resize(width: number, height: number): void {
    this.offscreenCanvas = new OffscreenCanvas(width, height);
    this.ctx = this.offscreenCanvas.getContext('2d')!;
  }
  
  registerEffect(effect: VideoEffect): void {
    this.effects.set(effect.id, effect);
  }
  
  registerTransition(transition: TransitionEffect): void {
    this.transitions.set(transition.id, transition);
  }
  
  getEffect(id: string): VideoEffect | undefined {
    return this.effects.get(id);
  }
  
  getTransition(id: string): TransitionEffect | undefined {
    return this.transitions.get(id);
  }
  
  getAllEffects(): VideoEffect[] {
    return Array.from(this.effects.values());
  }
  
  getAllTransitions(): TransitionEffect[] {
    return Array.from(this.transitions.values());
  }
  
  getEffectsByCategory(category: string): VideoEffect[] {
    return this.getAllEffects().filter(e => e.category === category);
  }
  
  applyEffect(
    frame: ImageData,
    effectId: string,
    params: Record<string, unknown>,
    time: number
  ): ImageData {
    const effect = this.effects.get(effectId);
    if (!effect) return frame;
    
    return effect.process(frame, params, time);
  }
  
  applyTransition(
    frameA: ImageData | null,
    frameB: ImageData | null,
    transitionId: string,
    progress: number,
    params: Record<string, unknown>
  ): ImageData {
    const transition = this.transitions.get(transitionId);
    if (!transition) {
      return frameB || frameA || new ImageData(1, 1);
    }
    
    return transition.render(frameA, frameB, progress, params);
  }
  
  // =============================================================================
  // ITEM 177: BUILT-IN VIDEO EFFECTS
  // =============================================================================
  
  private registerBuiltInEffects(): void {
    // Blur
    this.registerEffect({
      id: 'blur',
      name: 'Gaussian Blur',
      category: 'Blur & Sharpen',
      description: 'Apply gaussian blur to the image',
      parameters: [
        { name: 'radius', type: 'number', defaultValue: 5, min: 0, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => gaussianBlur(frame, params.radius as number)
    });
    
    this.registerEffect({
      id: 'directional-blur',
      name: 'Directional Blur',
      category: 'Blur & Sharpen',
      description: 'Blur in a specific direction',
      parameters: [
        { name: 'angle', type: 'angle', defaultValue: 0, min: 0, max: 360, animatable: true },
        { name: 'length', type: 'number', defaultValue: 10, min: 0, max: 200, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => directionalBlur(frame, params.angle as number, params.length as number)
    });
    
    // Color Correction
    this.registerEffect({
      id: 'brightness-contrast',
      name: 'Brightness & Contrast',
      category: 'Color Correction',
      description: 'Adjust brightness and contrast',
      parameters: [
        { name: 'brightness', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'contrast', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => brightnessContrast(frame, params.brightness as number, params.contrast as number)
    });
    
    this.registerEffect({
      id: 'hue-saturation',
      name: 'Hue/Saturation',
      category: 'Color Correction',
      description: 'Adjust hue, saturation, and lightness',
      parameters: [
        { name: 'hue', type: 'number', defaultValue: 0, min: -180, max: 180, unit: '°', animatable: true },
        { name: 'saturation', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'lightness', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => hueSaturation(frame, params.hue as number, params.saturation as number, params.lightness as number)
    });
    
    this.registerEffect({
      id: 'color-balance',
      name: 'Color Balance',
      category: 'Color Correction',
      description: 'Adjust color balance in shadows, midtones, and highlights',
      parameters: [
        { name: 'shadowsCyan', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'shadowsMagenta', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'shadowsYellow', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'midtonesCyan', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'midtonesMagenta', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'midtonesYellow', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'highlightsCyan', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'highlightsMagenta', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'highlightsYellow', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => colorBalance(frame, params)
    });
    
    this.registerEffect({
      id: 'curves',
      name: 'Curves',
      category: 'Color Correction',
      description: 'Advanced tonal adjustment using curves',
      parameters: [
        { name: 'rgbCurve', type: 'curve', defaultValue: [[0, 0], [255, 255]], animatable: false },
        { name: 'redCurve', type: 'curve', defaultValue: [[0, 0], [255, 255]], animatable: false },
        { name: 'greenCurve', type: 'curve', defaultValue: [[0, 0], [255, 255]], animatable: false },
        { name: 'blueCurve', type: 'curve', defaultValue: [[0, 0], [255, 255]], animatable: false }
      ],
      gpuAccelerated: false,
      process: (frame, params) => applyCurves(frame, params)
    });
    
    this.registerEffect({
      id: 'levels',
      name: 'Levels',
      category: 'Color Correction',
      description: 'Adjust input and output levels',
      parameters: [
        { name: 'inputBlack', type: 'number', defaultValue: 0, min: 0, max: 255, animatable: true },
        { name: 'inputWhite', type: 'number', defaultValue: 255, min: 0, max: 255, animatable: true },
        { name: 'gamma', type: 'number', defaultValue: 1, min: 0.1, max: 10, animatable: true },
        { name: 'outputBlack', type: 'number', defaultValue: 0, min: 0, max: 255, animatable: true },
        { name: 'outputWhite', type: 'number', defaultValue: 255, min: 0, max: 255, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => applyLevels(frame, params)
    });
    
    // Stylize
    this.registerEffect({
      id: 'glow',
      name: 'Glow',
      category: 'Stylize',
      description: 'Add a soft glow effect',
      parameters: [
        { name: 'threshold', type: 'number', defaultValue: 128, min: 0, max: 255, animatable: true },
        { name: 'radius', type: 'number', defaultValue: 10, min: 0, max: 100, animatable: true },
        { name: 'intensity', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => glow(frame, params.threshold as number, params.radius as number, params.intensity as number)
    });
    
    this.registerEffect({
      id: 'vignette',
      name: 'Vignette',
      category: 'Stylize',
      description: 'Add a vignette effect',
      parameters: [
        { name: 'amount', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true },
        { name: 'softness', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true },
        { name: 'roundness', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'color', type: 'color', defaultValue: '#000000', animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => vignette(frame, params)
    });
    
    this.registerEffect({
      id: 'film-grain',
      name: 'Film Grain',
      category: 'Stylize',
      description: 'Add realistic film grain',
      parameters: [
        { name: 'amount', type: 'number', defaultValue: 30, min: 0, max: 100, animatable: true },
        { name: 'size', type: 'number', defaultValue: 1, min: 0.5, max: 5, animatable: true },
        { name: 'softness', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true }
      ],
      gpuAccelerated: false,
      process: (frame, params, time) => filmGrain(frame, params, time)
    });
    
    this.registerEffect({
      id: 'chromatic-aberration',
      name: 'Chromatic Aberration',
      category: 'Stylize',
      description: 'Add color fringing effect',
      parameters: [
        { name: 'amount', type: 'number', defaultValue: 5, min: 0, max: 50, animatable: true },
        { name: 'angle', type: 'angle', defaultValue: 0, min: 0, max: 360, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => chromaticAberration(frame, params.amount as number, params.angle as number)
    });
    
    // Distort
    this.registerEffect({
      id: 'lens-distortion',
      name: 'Lens Distortion',
      category: 'Distort',
      description: 'Apply barrel or pincushion distortion',
      parameters: [
        { name: 'distortion', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true },
        { name: 'anamorphicSqueeze', type: 'number', defaultValue: 0, min: -100, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => lensDistortion(frame, params.distortion as number, params.anamorphicSqueeze as number)
    });
    
    this.registerEffect({
      id: 'wave-warp',
      name: 'Wave Warp',
      category: 'Distort',
      description: 'Create wave distortion',
      parameters: [
        { name: 'type', type: 'select', defaultValue: 'sine', options: ['sine', 'triangle', 'square'], animatable: false },
        { name: 'amplitude', type: 'number', defaultValue: 20, min: 0, max: 200, animatable: true },
        { name: 'wavelength', type: 'number', defaultValue: 100, min: 1, max: 500, animatable: true },
        { name: 'direction', type: 'angle', defaultValue: 0, min: 0, max: 360, animatable: true },
        { name: 'speed', type: 'number', defaultValue: 1, min: -10, max: 10, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params, time) => waveWarp(frame, params, time)
    });
    
    // Keying
    this.registerEffect({
      id: 'chroma-key',
      name: 'Chroma Key (Green Screen)',
      category: 'Keying',
      description: 'Remove a specific color (green/blue screen)',
      parameters: [
        { name: 'keyColor', type: 'color', defaultValue: '#00ff00', animatable: false },
        { name: 'tolerance', type: 'number', defaultValue: 40, min: 0, max: 100, animatable: true },
        { name: 'edgeSoftness', type: 'number', defaultValue: 5, min: 0, max: 50, animatable: true },
        { name: 'spillSuppression', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => chromaKey(frame, params)
    });
    
    this.registerEffect({
      id: 'luma-key',
      name: 'Luma Key',
      category: 'Keying',
      description: 'Key based on brightness',
      parameters: [
        { name: 'threshold', type: 'number', defaultValue: 128, min: 0, max: 255, animatable: true },
        { name: 'softness', type: 'number', defaultValue: 10, min: 0, max: 100, animatable: true },
        { name: 'invert', type: 'boolean', defaultValue: false, animatable: false }
      ],
      gpuAccelerated: true,
      process: (frame, params) => lumaKey(frame, params)
    });
    
    // Transform
    this.registerEffect({
      id: 'transform',
      name: 'Transform',
      category: 'Transform',
      description: 'Move, scale, and rotate',
      parameters: [
        { name: 'positionX', type: 'number', defaultValue: 0, min: -5000, max: 5000, animatable: true },
        { name: 'positionY', type: 'number', defaultValue: 0, min: -5000, max: 5000, animatable: true },
        { name: 'scaleX', type: 'number', defaultValue: 100, min: 0, max: 1000, unit: '%', animatable: true },
        { name: 'scaleY', type: 'number', defaultValue: 100, min: 0, max: 1000, unit: '%', animatable: true },
        { name: 'rotation', type: 'angle', defaultValue: 0, min: -3600, max: 3600, animatable: true },
        { name: 'anchorX', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: true },
        { name: 'anchorY', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: true },
        { name: 'opacity', type: 'number', defaultValue: 100, min: 0, max: 100, unit: '%', animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => transform(frame, params)
    });
    
    // Generate
    this.registerEffect({
      id: 'solid-color',
      name: 'Solid Color',
      category: 'Generate',
      description: 'Generate a solid color',
      parameters: [
        { name: 'color', type: 'color', defaultValue: '#000000', animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => solidColor(frame, params.color as string)
    });
    
    this.registerEffect({
      id: 'gradient',
      name: 'Gradient',
      category: 'Generate',
      description: 'Generate a gradient',
      parameters: [
        { name: 'type', type: 'select', defaultValue: 'linear', options: ['linear', 'radial'], animatable: false },
        { name: 'startColor', type: 'color', defaultValue: '#000000', animatable: true },
        { name: 'endColor', type: 'color', defaultValue: '#ffffff', animatable: true },
        { name: 'angle', type: 'angle', defaultValue: 0, min: 0, max: 360, animatable: true },
        { name: 'blendMode', type: 'select', defaultValue: 'normal', options: ['normal', 'add', 'multiply', 'screen', 'overlay'], animatable: false }
      ],
      gpuAccelerated: true,
      process: (frame, params) => gradient(frame, params)
    });
    
    // Time
    this.registerEffect({
      id: 'echo',
      name: 'Echo',
      category: 'Time',
      description: 'Create trailing echo effect',
      parameters: [
        { name: 'echoTime', type: 'number', defaultValue: 0.1, min: 0.01, max: 5, unit: 's', animatable: true },
        { name: 'numEchoes', type: 'number', defaultValue: 4, min: 1, max: 20, animatable: false },
        { name: 'decay', type: 'number', defaultValue: 0.5, min: 0, max: 1, animatable: true },
        { name: 'operator', type: 'select', defaultValue: 'add', options: ['add', 'maximum', 'minimum', 'screen'], animatable: false }
      ],
      gpuAccelerated: false,
      process: (frame, params, time) => echo(frame, params, time)
    });
    
    // Noise & Grain
    this.registerEffect({
      id: 'denoise',
      name: 'Denoise',
      category: 'Noise',
      description: 'Reduce noise in footage',
      parameters: [
        { name: 'strength', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true },
        { name: 'preserveDetail', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: true }
      ],
      gpuAccelerated: true,
      process: (frame, params) => denoise(frame, params.strength as number, params.preserveDetail as number)
    });
  }
  
  // =============================================================================
  // ITEM 178-185: BUILT-IN TRANSITIONS
  // =============================================================================
  
  private registerBuiltInTransitions(): void {
    // Dissolve transitions
    this.registerTransition({
      id: 'cross-dissolve',
      name: 'Cross Dissolve',
      category: 'Dissolve',
      description: 'Simple cross dissolve',
      parameters: [],
      defaultDuration: 30,
      render: crossDissolve
    });
    
    this.registerTransition({
      id: 'dip-to-black',
      name: 'Dip to Black',
      category: 'Dissolve',
      description: 'Fade through black',
      parameters: [],
      defaultDuration: 30,
      render: dipToBlack
    });
    
    this.registerTransition({
      id: 'dip-to-white',
      name: 'Dip to White',
      category: 'Dissolve',
      description: 'Fade through white',
      parameters: [],
      defaultDuration: 30,
      render: dipToWhite
    });
    
    this.registerTransition({
      id: 'dip-to-color',
      name: 'Dip to Color',
      category: 'Dissolve',
      description: 'Fade through a custom color',
      parameters: [
        { name: 'color', type: 'color', defaultValue: '#ff0000', animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => dipToColor(a, b, p, params.color as string)
    });
    
    // Wipe transitions
    this.registerTransition({
      id: 'wipe-left',
      name: 'Wipe Left',
      category: 'Wipe',
      description: 'Wipe from right to left',
      parameters: [
        { name: 'softness', type: 'number', defaultValue: 0, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => wipe(a, b, p, 'left', params.softness as number)
    });
    
    this.registerTransition({
      id: 'wipe-right',
      name: 'Wipe Right',
      category: 'Wipe',
      description: 'Wipe from left to right',
      parameters: [
        { name: 'softness', type: 'number', defaultValue: 0, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => wipe(a, b, p, 'right', params.softness as number)
    });
    
    this.registerTransition({
      id: 'wipe-up',
      name: 'Wipe Up',
      category: 'Wipe',
      description: 'Wipe from bottom to top',
      parameters: [
        { name: 'softness', type: 'number', defaultValue: 0, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => wipe(a, b, p, 'up', params.softness as number)
    });
    
    this.registerTransition({
      id: 'wipe-down',
      name: 'Wipe Down',
      category: 'Wipe',
      description: 'Wipe from top to bottom',
      parameters: [
        { name: 'softness', type: 'number', defaultValue: 0, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => wipe(a, b, p, 'down', params.softness as number)
    });
    
    this.registerTransition({
      id: 'iris-wipe',
      name: 'Iris Wipe',
      category: 'Wipe',
      description: 'Circular iris wipe',
      parameters: [
        { name: 'centerX', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false },
        { name: 'centerY', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false },
        { name: 'softness', type: 'number', defaultValue: 0, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: irisWipe
    });
    
    // Slide transitions
    this.registerTransition({
      id: 'slide-left',
      name: 'Slide Left',
      category: 'Slide',
      description: 'Slide B over A from right',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => slide(a, b, p, 'left')
    });
    
    this.registerTransition({
      id: 'slide-right',
      name: 'Slide Right',
      category: 'Slide',
      description: 'Slide B over A from left',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => slide(a, b, p, 'right')
    });
    
    this.registerTransition({
      id: 'push-left',
      name: 'Push Left',
      category: 'Slide',
      description: 'B pushes A to the left',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => push(a, b, p, 'left')
    });
    
    this.registerTransition({
      id: 'push-right',
      name: 'Push Right',
      category: 'Slide',
      description: 'B pushes A to the right',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => push(a, b, p, 'right')
    });
    
    // Zoom transitions
    this.registerTransition({
      id: 'zoom-in',
      name: 'Zoom In',
      category: 'Zoom',
      description: 'Zoom into B',
      parameters: [
        { name: 'centerX', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false },
        { name: 'centerY', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => zoomTransition(a, b, p, 'in', params)
    });
    
    this.registerTransition({
      id: 'zoom-out',
      name: 'Zoom Out',
      category: 'Zoom',
      description: 'Zoom out from A',
      parameters: [
        { name: 'centerX', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false },
        { name: 'centerY', type: 'number', defaultValue: 50, min: 0, max: 100, unit: '%', animatable: false }
      ],
      defaultDuration: 30,
      render: (a, b, p, params) => zoomTransition(a, b, p, 'out', params)
    });
    
    // 3D transitions
    this.registerTransition({
      id: 'cube-left',
      name: 'Cube Left',
      category: '3D',
      description: '3D cube rotation',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => cubeTransition(a, b, p, 'left')
    });
    
    this.registerTransition({
      id: 'flip-horizontal',
      name: 'Flip Horizontal',
      category: '3D',
      description: '3D horizontal flip',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => flipTransition(a, b, p, 'horizontal')
    });
    
    this.registerTransition({
      id: 'flip-vertical',
      name: 'Flip Vertical',
      category: '3D',
      description: '3D vertical flip',
      parameters: [],
      defaultDuration: 30,
      render: (a, b, p) => flipTransition(a, b, p, 'vertical')
    });
    
    // Stylized transitions
    this.registerTransition({
      id: 'glitch',
      name: 'Glitch',
      category: 'Stylized',
      description: 'Digital glitch effect',
      parameters: [
        { name: 'intensity', type: 'number', defaultValue: 50, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 15,
      render: glitchTransition
    });
    
    this.registerTransition({
      id: 'pixelate',
      name: 'Pixelate',
      category: 'Stylized',
      description: 'Pixelate through transition',
      parameters: [
        { name: 'maxSize', type: 'number', defaultValue: 50, min: 2, max: 200, animatable: false }
      ],
      defaultDuration: 30,
      render: pixelateTransition
    });
    
    this.registerTransition({
      id: 'blur-cross',
      name: 'Blur Cross',
      category: 'Stylized',
      description: 'Dissolve through blur',
      parameters: [
        { name: 'maxBlur', type: 'number', defaultValue: 30, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: blurCrossTransition
    });
    
    this.registerTransition({
      id: 'light-leak',
      name: 'Light Leak',
      category: 'Stylized',
      description: 'Organic light leak transition',
      parameters: [
        { name: 'color', type: 'color', defaultValue: '#ff8800', animatable: false },
        { name: 'intensity', type: 'number', defaultValue: 75, min: 0, max: 100, animatable: false }
      ],
      defaultDuration: 30,
      render: lightLeakTransition
    });
  }
}

// =============================================================================
// ITEMS 186-195: EFFECT IMPLEMENTATIONS
// =============================================================================

function gaussianBlur(frame: ImageData, radius: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  if (radius < 0.5) return result;
  
  const kernel = createGaussianKernel(radius);
  const halfSize = Math.floor(kernel.length / 2);
  const temp = new Uint8ClampedArray(data);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const kx = Math.min(width - 1, Math.max(0, x + k - halfSize));
        const idx = (y * width + kx) * 4;
        
        r += frame.data[idx] * kernel[k];
        g += frame.data[idx + 1] * kernel[k];
        b += frame.data[idx + 2] * kernel[k];
        a += frame.data[idx + 3] * kernel[k];
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
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  
  return result;
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
  
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

function directionalBlur(frame: ImageData, angle: number, length: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const rad = angle * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const samples = Math.max(1, Math.round(length));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;
      
      for (let i = 0; i < samples; i++) {
        const t = (i / samples - 0.5) * length;
        const sx = Math.round(x + dx * t);
        const sy = Math.round(y + dy * t);
        
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const idx = (sy * width + sx) * 4;
          r += frame.data[idx];
          g += frame.data[idx + 1];
          b += frame.data[idx + 2];
          a += frame.data[idx + 3];
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

function brightnessContrast(frame: ImageData, brightness: number, contrast: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  const b = brightness * 2.55;
  const c = (contrast + 100) / 100;
  const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255));
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(factor * (data[i] + b - 128) + 128);
    data[i + 1] = clamp(factor * (data[i + 1] + b - 128) + 128);
    data[i + 2] = clamp(factor * (data[i + 2] + b - 128) + 128);
  }
  
  return result;
}

function hueSaturation(frame: ImageData, hue: number, saturation: number, lightness: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  const hueShift = hue / 180;
  const satFactor = (saturation + 100) / 100;
  const lightFactor = lightness / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    // Adjust
    h = (h + hueShift + 1) % 1;
    s = Math.max(0, Math.min(1, s * satFactor));
    l = Math.max(0, Math.min(1, l + lightFactor));
    
    // HSL to RGB
    let newR, newG, newB;
    
    if (s === 0) {
      newR = newG = newB = l;
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
      
      newR = hue2rgb(p, q, h + 1/3);
      newG = hue2rgb(p, q, h);
      newB = hue2rgb(p, q, h - 1/3);
    }
    
    data[i] = Math.round(newR * 255);
    data[i + 1] = Math.round(newG * 255);
    data[i + 2] = Math.round(newB * 255);
  }
  
  return result;
}

function colorBalance(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    
    // Determine weights for shadows/midtones/highlights
    const shadowWeight = 1 - smoothstep(0, 0.3, lum);
    const highlightWeight = smoothstep(0.7, 1, lum);
    const midtoneWeight = 1 - shadowWeight - highlightWeight;
    
    const sc = (params.shadowsCyan as number || 0) * shadowWeight;
    const sm = (params.shadowsMagenta as number || 0) * shadowWeight;
    const sy = (params.shadowsYellow as number || 0) * shadowWeight;
    
    const mc = (params.midtonesCyan as number || 0) * midtoneWeight;
    const mm = (params.midtonesMagenta as number || 0) * midtoneWeight;
    const my = (params.midtonesYellow as number || 0) * midtoneWeight;
    
    const hc = (params.highlightsCyan as number || 0) * highlightWeight;
    const hm = (params.highlightsMagenta as number || 0) * highlightWeight;
    const hy = (params.highlightsYellow as number || 0) * highlightWeight;
    
    data[i] = clamp(r - (sc + mc + hc) * 2.55);
    data[i + 1] = clamp(g - (sm + mm + hm) * 2.55);
    data[i + 2] = clamp(b - (sy + my + hy) * 2.55);
  }
  
  return result;
}

function applyCurves(frame: ImageData, params: Record<string, unknown>): ImageData {
  // Build lookup tables from curves
  const rgbLUT = buildCurveLUT(params.rgbCurve as number[][]);
  const rLUT = buildCurveLUT(params.redCurve as number[][]);
  const gLUT = buildCurveLUT(params.greenCurve as number[][]);
  const bLUT = buildCurveLUT(params.blueCurve as number[][]);
  
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgbLUT[rLUT[data[i]]];
    data[i + 1] = rgbLUT[gLUT[data[i + 1]]];
    data[i + 2] = rgbLUT[bLUT[data[i + 2]]];
  }
  
  return result;
}

function buildCurveLUT(points: number[][]): Uint8Array {
  const lut = new Uint8Array(256);
  
  if (!points || points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  
  // Sort points by x
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  
  for (let i = 0; i < 256; i++) {
    let y = i;
    
    // Find surrounding points
    for (let j = 0; j < sorted.length - 1; j++) {
      const [x1, y1] = sorted[j];
      const [x2, y2] = sorted[j + 1];
      
      if (i >= x1 && i <= x2) {
        const t = (i - x1) / (x2 - x1);
        y = y1 + (y2 - y1) * t;
        break;
      }
    }
    
    lut[i] = clamp(y);
  }
  
  return lut;
}

function applyLevels(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  const inBlack = params.inputBlack as number;
  const inWhite = params.inputWhite as number;
  const gamma = params.gamma as number;
  const outBlack = params.outputBlack as number;
  const outWhite = params.outputWhite as number;
  
  const inRange = inWhite - inBlack;
  const outRange = outWhite - outBlack;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = data[i + c];
      
      // Input levels
      val = (val - inBlack) / inRange;
      val = Math.max(0, Math.min(1, val));
      
      // Gamma
      val = Math.pow(val, 1 / gamma);
      
      // Output levels
      val = val * outRange + outBlack;
      
      data[i + c] = clamp(val);
    }
  }
  
  return result;
}

function glow(frame: ImageData, threshold: number, radius: number, intensity: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  
  // Create brightness mask
  const mask = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  for (let i = 0; i < mask.data.length; i += 4) {
    const lum = (mask.data[i] * 0.299 + mask.data[i + 1] * 0.587 + mask.data[i + 2] * 0.114);
    const val = lum > threshold ? 255 : 0;
    mask.data[i] = val;
    mask.data[i + 1] = val;
    mask.data[i + 2] = val;
  }
  
  // Blur the mask
  const blurred = gaussianBlur(mask, radius);
  
  // Add blurred glow to original
  const { data } = result;
  const blurData = blurred.data;
  const factor = intensity / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] + blurData[i] * factor);
    data[i + 1] = clamp(data[i + 1] + blurData[i + 1] * factor);
    data[i + 2] = clamp(data[i + 2] + blurData[i + 2] * factor);
  }
  
  return result;
}

function vignette(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const amount = (params.amount as number) / 100;
  const softness = (params.softness as number) / 100;
  const roundness = (params.roundness as number) / 100;
  const color = hexToRgb(params.color as string);
  
  const cx = width / 2;
  const cy = height / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy * (1 + roundness);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let factor = smoothstep(1 - softness, 1 + softness, dist * 2);
      factor *= amount;
      
      const idx = (y * width + x) * 4;
      data[idx] = clamp(data[idx] * (1 - factor) + color.r * factor);
      data[idx + 1] = clamp(data[idx + 1] * (1 - factor) + color.g * factor);
      data[idx + 2] = clamp(data[idx + 2] * (1 - factor) + color.b * factor);
    }
  }
  
  return result;
}

function filmGrain(frame: ImageData, params: Record<string, unknown>, time: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const amount = (params.amount as number) * 2.55;
  const size = params.size as number;
  const softness = (params.softness as number) / 100;
  
  // Use time to seed random (consistent per frame)
  const seed = Math.floor(time * 1000);
  const random = seededRandom(seed);
  
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const noise = (random() - 0.5) * 2 * amount;
      
      for (let dy = 0; dy < size && y + dy < height; dy++) {
        for (let dx = 0; dx < size && x + dx < width; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const midtoneFactor = 1 - Math.abs(lum - 128) / 128 * softness;
          
          data[idx] = clamp(data[idx] + noise * midtoneFactor);
          data[idx + 1] = clamp(data[idx + 1] + noise * midtoneFactor);
          data[idx + 2] = clamp(data[idx + 2] + noise * midtoneFactor);
        }
      }
    }
  }
  
  return result;
}

function chromaticAberration(frame: ImageData, amount: number, angle: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const rad = angle * Math.PI / 180;
  const dx = Math.cos(rad) * amount;
  const dy = Math.sin(rad) * amount;
  
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distX = (x - cx) / cx;
      const distY = (y - cy) / cy;
      const dist = Math.sqrt(distX * distX + distY * distY);
      
      const offsetX = dx * dist;
      const offsetY = dy * dist;
      
      const idx = (y * width + x) * 4;
      
      // Red channel offset
      const rx = Math.round(x + offsetX);
      const ry = Math.round(y + offsetY);
      if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
        data[idx] = frame.data[(ry * width + rx) * 4];
      }
      
      // Green stays
      data[idx + 1] = frame.data[idx + 1];
      
      // Blue channel offset
      const bx = Math.round(x - offsetX);
      const by = Math.round(y - offsetY);
      if (bx >= 0 && bx < width && by >= 0 && by < height) {
        data[idx + 2] = frame.data[(by * width + bx) * 4 + 2];
      }
      
      data[idx + 3] = frame.data[idx + 3];
    }
  }
  
  return result;
}

function lensDistortion(frame: ImageData, distortion: number, squeeze: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data.fill(0)), frame.width, frame.height);
  const { data, width, height } = result;
  
  const cx = width / 2;
  const cy = height / 2;
  const k = distortion / 100;
  const sq = 1 + squeeze / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy * sq;
      
      const r2 = nx * nx + ny * ny;
      const distFactor = 1 + k * r2;
      
      const srcX = nx * distFactor * cx + cx;
      const srcY = ny * distFactor * cy / sq + cy;
      
      if (srcX >= 0 && srcX < width - 1 && srcY >= 0 && srcY < height - 1) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const fx = srcX - x0;
        const fy = srcY - y0;
        
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = frame.data[(y0 * width + x0) * 4 + c];
          const v10 = frame.data[(y0 * width + x0 + 1) * 4 + c];
          const v01 = frame.data[((y0 + 1) * width + x0) * 4 + c];
          const v11 = frame.data[((y0 + 1) * width + x0 + 1) * 4 + c];
          
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

function waveWarp(frame: ImageData, params: Record<string, unknown>, time: number): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data.fill(0)), frame.width, frame.height);
  const { data, width, height } = result;
  
  const type = params.type as string;
  const amplitude = params.amplitude as number;
  const wavelength = params.wavelength as number;
  const direction = (params.direction as number) * Math.PI / 180;
  const speed = params.speed as number;
  
  const waveFunc = (t: number): number => {
    const normalized = ((t % 1) + 1) % 1;
    switch (type) {
      case 'sine': return Math.sin(normalized * 2 * Math.PI);
      case 'triangle': return Math.abs(normalized * 4 - 2) - 1;
      case 'square': return normalized < 0.5 ? 1 : -1;
      default: return Math.sin(normalized * 2 * Math.PI);
    }
  };
  
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = (x * dx + y * dy) / wavelength + time * speed;
      const offset = waveFunc(dist) * amplitude;
      
      const srcX = x - offset * dy;
      const srcY = y + offset * dx;
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        for (let c = 0; c < 4; c++) {
          data[idx + c] = frame.data[srcIdx + c];
        }
      }
    }
  }
  
  return result;
}

function chromaKey(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  const keyColor = hexToRgb(params.keyColor as string);
  const tolerance = (params.tolerance as number) / 100;
  const softness = (params.edgeSoftness as number) / 100;
  const spillSupp = (params.spillSuppression as number) / 100;
  
  const keyHSL = rgbToHsl(keyColor.r, keyColor.g, keyColor.b);
  
  for (let i = 0; i < data.length; i += 4) {
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    
    // Calculate color distance
    const hueDist = Math.abs(hsl.h - keyHSL.h);
    const satDist = Math.abs(hsl.s - keyHSL.s);
    const dist = Math.sqrt(hueDist * hueDist + satDist * satDist * 0.5);
    
    // Calculate alpha
    let alpha = smoothstep(tolerance, tolerance + softness, dist);
    
    // Spill suppression
    if (spillSupp > 0 && alpha > 0) {
      const spillAmount = Math.max(0, 1 - dist / (tolerance + softness)) * spillSupp;
      if (keyHSL.h < 0.2 || keyHSL.h > 0.8) {
        // Red key - reduce red
        data[i] = clamp(data[i] - spillAmount * 50);
      } else if (keyHSL.h > 0.25 && keyHSL.h < 0.42) {
        // Green key - reduce green
        data[i + 1] = clamp(data[i + 1] - spillAmount * 50);
      } else if (keyHSL.h > 0.55 && keyHSL.h < 0.72) {
        // Blue key - reduce blue
        data[i + 2] = clamp(data[i + 2] - spillAmount * 50);
      }
    }
    
    data[i + 3] = clamp(alpha * 255);
  }
  
  return result;
}

function lumaKey(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  
  const threshold = params.threshold as number;
  const softness = (params.softness as number) * 2.55;
  const invert = params.invert as boolean;
  
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    
    let alpha = smoothstep(threshold - softness, threshold + softness, lum);
    if (invert) alpha = 1 - alpha;
    
    data[i + 3] = clamp(alpha * 255);
  }
  
  return result;
}

function transform(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data.fill(0)), frame.width, frame.height);
  const { data, width, height } = result;
  
  const posX = params.positionX as number;
  const posY = params.positionY as number;
  const scaleX = (params.scaleX as number) / 100;
  const scaleY = (params.scaleY as number) / 100;
  const rotation = (params.rotation as number) * Math.PI / 180;
  const anchorX = (params.anchorX as number) / 100 * width;
  const anchorY = (params.anchorY as number) / 100 * height;
  const opacity = (params.opacity as number) / 100;
  
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Translate to anchor
      let tx = x - anchorX - posX;
      let ty = y - anchorY - posY;
      
      // Rotate
      const rx = tx * cos - ty * sin;
      const ry = tx * sin + ty * cos;
      
      // Scale
      const sx = rx / scaleX + anchorX;
      const sy = ry / scaleY + anchorY;
      
      if (sx >= 0 && sx < width - 1 && sy >= 0 && sy < height - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = frame.data[(y0 * width + x0) * 4 + c];
          const v10 = frame.data[(y0 * width + x0 + 1) * 4 + c];
          const v01 = frame.data[((y0 + 1) * width + x0) * 4 + c];
          const v11 = frame.data[((y0 + 1) * width + x0 + 1) * 4 + c];
          
          let val = v00 * (1 - fx) * (1 - fy) +
                    v10 * fx * (1 - fy) +
                    v01 * (1 - fx) * fy +
                    v11 * fx * fy;
          
          if (c === 3) val *= opacity;
          data[idx + c] = val;
        }
      }
    }
  }
  
  return result;
}

function solidColor(frame: ImageData, color: string): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data } = result;
  const rgb = hexToRgb(color);
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
  }
  
  return result;
}

function gradient(frame: ImageData, params: Record<string, unknown>): ImageData {
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const type = params.type as string;
  const startColor = hexToRgb(params.startColor as string);
  const endColor = hexToRgb(params.endColor as string);
  const angle = (params.angle as number) * Math.PI / 180;
  const blendMode = params.blendMode as string;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let t: number;
      
      if (type === 'linear') {
        const nx = x / width - 0.5;
        const ny = y / height - 0.5;
        t = (nx * Math.cos(angle) + ny * Math.sin(angle) + 0.5);
      } else {
        const nx = (x - width / 2) / (width / 2);
        const ny = (y - height / 2) / (height / 2);
        t = Math.sqrt(nx * nx + ny * ny);
      }
      
      t = Math.max(0, Math.min(1, t));
      
      const gr = startColor.r + (endColor.r - startColor.r) * t;
      const gg = startColor.g + (endColor.g - startColor.g) * t;
      const gb = startColor.b + (endColor.b - startColor.b) * t;
      
      const idx = (y * width + x) * 4;
      
      // Blend with original
      const [r, g, b] = blend(
        data[idx], data[idx + 1], data[idx + 2],
        gr, gg, gb,
        blendMode
      );
      
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    }
  }
  
  return result;
}

function echo(frame: ImageData, params: Record<string, unknown>, time: number): ImageData {
  // Echo effect needs frame buffer - simplified single frame version
  return frame;
}

function denoise(frame: ImageData, strength: number, preserveDetail: number): ImageData {
  // Simplified bilateral filter approximation
  const result = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  const { data, width, height } = result;
  
  const radius = Math.ceil(strength / 20);
  const sigmaSpace = radius / 2;
  const sigmaColor = preserveDetail * 2.55;
  
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4;
      const centerR = data[idx];
      const centerG = data[idx + 1];
      const centerB = data[idx + 2];
      
      let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nidx = ((y + dy) * width + (x + dx)) * 4;
          
          const spatialDist = Math.sqrt(dx * dx + dy * dy);
          const colorDist = Math.sqrt(
            (data[nidx] - centerR) ** 2 +
            (data[nidx + 1] - centerG) ** 2 +
            (data[nidx + 2] - centerB) ** 2
          );
          
          const w = Math.exp(-(spatialDist ** 2) / (2 * sigmaSpace ** 2)) *
                    Math.exp(-(colorDist ** 2) / (2 * sigmaColor ** 2));
          
          sumR += data[nidx] * w;
          sumG += data[nidx + 1] * w;
          sumB += data[nidx + 2] * w;
          sumW += w;
        }
      }
      
      data[idx] = sumR / sumW;
      data[idx + 1] = sumG / sumW;
      data[idx + 2] = sumB / sumW;
    }
  }
  
  return result;
}

// =============================================================================
// ITEMS 196-200: TRANSITION IMPLEMENTATIONS
// =============================================================================

function crossDissolve(a: ImageData | null, b: ImageData | null, progress: number): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  if (!a) return b!;
  if (!b) return a;
  
  const result = new ImageData(new Uint8ClampedArray(a.data), a.width, a.height);
  const { data } = result;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = a.data[i] * (1 - progress) + b.data[i] * progress;
    data[i + 1] = a.data[i + 1] * (1 - progress) + b.data[i + 1] * progress;
    data[i + 2] = a.data[i + 2] * (1 - progress) + b.data[i + 2] * progress;
    data[i + 3] = a.data[i + 3] * (1 - progress) + b.data[i + 3] * progress;
  }
  
  return result;
}

function dipToBlack(a: ImageData | null, b: ImageData | null, progress: number): ImageData {
  return dipToColor(a, b, progress, '#000000');
}

function dipToWhite(a: ImageData | null, b: ImageData | null, progress: number): ImageData {
  return dipToColor(a, b, progress, '#ffffff');
}

function dipToColor(a: ImageData | null, b: ImageData | null, progress: number, color: string): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  
  const template = a || b!;
  const result = new ImageData(new Uint8ClampedArray(template.data.length), template.width, template.height);
  const { data } = result;
  const rgb = hexToRgb(color);
  
  const fadePoint = 0.5;
  
  for (let i = 0; i < data.length; i += 4) {
    if (progress < fadePoint) {
      // Fade A to color
      const t = progress / fadePoint;
      if (a) {
        data[i] = a.data[i] * (1 - t) + rgb.r * t;
        data[i + 1] = a.data[i + 1] * (1 - t) + rgb.g * t;
        data[i + 2] = a.data[i + 2] * (1 - t) + rgb.b * t;
      } else {
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
      }
    } else {
      // Fade color to B
      const t = (progress - fadePoint) / (1 - fadePoint);
      if (b) {
        data[i] = rgb.r * (1 - t) + b.data[i] * t;
        data[i + 1] = rgb.g * (1 - t) + b.data[i + 1] * t;
        data[i + 2] = rgb.b * (1 - t) + b.data[i + 2] * t;
      } else {
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
      }
    }
    data[i + 3] = 255;
  }
  
  return result;
}

function wipe(a: ImageData | null, b: ImageData | null, progress: number, direction: string, softness: number): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  
  const template = a || b!;
  const result = new ImageData(new Uint8ClampedArray(template.data), template.width, template.height);
  const { data, width, height } = result;
  
  const soft = softness / 100 * Math.max(width, height) / 10;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let t: number;
      
      switch (direction) {
        case 'left':
          t = (1 - x / width - progress) / (soft / width || 0.01);
          break;
        case 'right':
          t = (x / width - progress) / (soft / width || 0.01);
          break;
        case 'up':
          t = (1 - y / height - progress) / (soft / height || 0.01);
          break;
        case 'down':
          t = (y / height - progress) / (soft / height || 0.01);
          break;
        default:
          t = 0;
      }
      
      t = Math.max(0, Math.min(1, t + 0.5));
      
      const idx = (y * width + x) * 4;
      
      if (a && b) {
        data[idx] = a.data[idx] * (1 - t) + b.data[idx] * t;
        data[idx + 1] = a.data[idx + 1] * (1 - t) + b.data[idx + 1] * t;
        data[idx + 2] = a.data[idx + 2] * (1 - t) + b.data[idx + 2] * t;
        data[idx + 3] = a.data[idx + 3] * (1 - t) + b.data[idx + 3] * t;
      } else if (b) {
        data[idx] = b.data[idx] * t;
        data[idx + 1] = b.data[idx + 1] * t;
        data[idx + 2] = b.data[idx + 2] * t;
        data[idx + 3] = 255 * t;
      } else if (a) {
        data[idx] = a.data[idx] * (1 - t);
        data[idx + 1] = a.data[idx + 1] * (1 - t);
        data[idx + 2] = a.data[idx + 2] * (1 - t);
        data[idx + 3] = 255 * (1 - t);
      }
    }
  }
  
  return result;
}

function irisWipe(a: ImageData | null, b: ImageData | null, progress: number, params: Record<string, unknown>): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  
  const template = a || b!;
  const result = new ImageData(new Uint8ClampedArray(template.data), template.width, template.height);
  const { data, width, height } = result;
  
  const cx = (params.centerX as number || 50) / 100 * width;
  const cy = (params.centerY as number || 50) / 100 * height;
  const softness = (params.softness as number || 0) / 100;
  const maxRadius = Math.sqrt(width * width + height * height) / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxRadius;
      let t = smoothstep(progress - softness, progress + softness, dist);
      
      const idx = (y * width + x) * 4;
      
      if (a && b) {
        data[idx] = a.data[idx] * t + b.data[idx] * (1 - t);
        data[idx + 1] = a.data[idx + 1] * t + b.data[idx + 1] * (1 - t);
        data[idx + 2] = a.data[idx + 2] * t + b.data[idx + 2] * (1 - t);
        data[idx + 3] = 255;
      }
    }
  }
  
  return result;
}

function slide(a: ImageData | null, b: ImageData | null, progress: number, direction: string): ImageData {
  if (!b) return a || new ImageData(1, 1);
  
  const result = new ImageData(new Uint8ClampedArray(b.data), b.width, b.height);
  const { data, width, height } = result;
  
  // Draw A first if exists
  if (a) {
    for (let i = 0; i < data.length; i++) {
      data[i] = a.data[i];
    }
  }
  
  // Overlay B sliding in
  const offsetX = direction === 'left' ? width * (1 - progress) : direction === 'right' ? -width * (1 - progress) : 0;
  const offsetY = direction === 'up' ? height * (1 - progress) : direction === 'down' ? -height * (1 - progress) : 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - offsetX;
      const srcY = y - offsetY;
      
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const idx = (y * width + x) * 4;
        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
        
        data[idx] = b.data[srcIdx];
        data[idx + 1] = b.data[srcIdx + 1];
        data[idx + 2] = b.data[srcIdx + 2];
        data[idx + 3] = b.data[srcIdx + 3];
      }
    }
  }
  
  return result;
}

function push(a: ImageData | null, b: ImageData | null, progress: number, direction: string): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  
  const template = a || b!;
  const result = new ImageData(new Uint8ClampedArray(template.data.length), template.width, template.height);
  const { data, width, height } = result;
  
  const offsetA = direction === 'left' ? -width * progress : direction === 'right' ? width * progress : 0;
  const offsetB = direction === 'left' ? width * (1 - progress) : direction === 'right' ? -width * (1 - progress) : 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Try A
      if (a) {
        const srcX = x - offsetA;
        if (srcX >= 0 && srcX < width) {
          const srcIdx = (y * width + Math.floor(srcX)) * 4;
          data[idx] = a.data[srcIdx];
          data[idx + 1] = a.data[srcIdx + 1];
          data[idx + 2] = a.data[srcIdx + 2];
          data[idx + 3] = a.data[srcIdx + 3];
          continue;
        }
      }
      
      // Try B
      if (b) {
        const srcX = x - offsetB;
        if (srcX >= 0 && srcX < width) {
          const srcIdx = (y * width + Math.floor(srcX)) * 4;
          data[idx] = b.data[srcIdx];
          data[idx + 1] = b.data[srcIdx + 1];
          data[idx + 2] = b.data[srcIdx + 2];
          data[idx + 3] = b.data[srcIdx + 3];
        }
      }
    }
  }
  
  return result;
}

function zoomTransition(a: ImageData | null, b: ImageData | null, progress: number, direction: string, params: Record<string, unknown>): ImageData {
  // Simplified zoom - would need proper scaling
  return crossDissolve(a, b, progress);
}

function cubeTransition(a: ImageData | null, b: ImageData | null, progress: number, direction: string): ImageData {
  // 3D cube would need WebGL - fallback to cross dissolve
  return crossDissolve(a, b, progress);
}

function flipTransition(a: ImageData | null, b: ImageData | null, progress: number, direction: string): ImageData {
  // 3D flip would need WebGL - fallback to cross dissolve
  return crossDissolve(a, b, progress);
}

function glitchTransition(a: ImageData | null, b: ImageData | null, progress: number, params: Record<string, unknown>): ImageData {
  if (!a && !b) return new ImageData(1, 1);
  
  const template = a || b!;
  const result = new ImageData(new Uint8ClampedArray(template.data), template.width, template.height);
  const { data, width, height } = result;
  const intensity = (params.intensity as number || 50) / 100;
  
  // Create glitch blocks
  const numBlocks = Math.floor(10 * intensity);
  const source = progress < 0.5 ? a : b;
  
  if (source) {
    for (let i = 0; i < data.length; i++) {
      data[i] = source.data[i];
    }
  }
  
  // Add random offset blocks
  for (let block = 0; block < numBlocks; block++) {
    const y = Math.floor(Math.random() * height);
    const h = Math.floor(Math.random() * 20 * intensity) + 5;
    const offset = Math.floor((Math.random() - 0.5) * 100 * intensity);
    
    for (let dy = 0; dy < h && y + dy < height; dy++) {
      for (let x = 0; x < width; x++) {
        const srcX = (x + offset + width) % width;
        const idx = ((y + dy) * width + x) * 4;
        const srcIdx = ((y + dy) * width + srcX) * 4;
        
        if (source) {
          data[idx] = source.data[srcIdx];
          data[idx + 1] = source.data[srcIdx + 1];
          data[idx + 2] = source.data[srcIdx + 2];
        }
      }
    }
  }
  
  // Blend towards target
  if (a && b) {
    for (let i = 0; i < data.length; i += 4) {
      const t = progress;
      data[i] = data[i] * (1 - t * 0.3) + b.data[i] * t * 0.3;
      data[i + 1] = data[i + 1] * (1 - t * 0.3) + b.data[i + 1] * t * 0.3;
      data[i + 2] = data[i + 2] * (1 - t * 0.3) + b.data[i + 2] * t * 0.3;
    }
  }
  
  return result;
}

function pixelateTransition(a: ImageData | null, b: ImageData | null, progress: number, params: Record<string, unknown>): ImageData {
  const maxSize = params.maxSize as number || 50;
  const size = Math.ceil(maxSize * Math.sin(progress * Math.PI));
  
  if (size <= 1) {
    return progress < 0.5 ? (a || new ImageData(1, 1)) : (b || new ImageData(1, 1));
  }
  
  const source = progress < 0.5 ? a : b;
  if (!source) return new ImageData(1, 1);
  
  const result = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  const { data, width, height } = result;
  
  for (let cellY = 0; cellY < height; cellY += size) {
    for (let cellX = 0; cellX < width; cellX += size) {
      let r = 0, g = 0, b = 0, count = 0;
      
      for (let y = cellY; y < cellY + size && y < height; y++) {
        for (let x = cellX; x < cellX + size && x < width; x++) {
          const idx = (y * width + x) * 4;
          r += source.data[idx];
          g += source.data[idx + 1];
          b += source.data[idx + 2];
          count++;
        }
      }
      
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      
      for (let y = cellY; y < cellY + size && y < height; y++) {
        for (let x = cellX; x < cellX + size && x < width; x++) {
          const idx = (y * width + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
      }
    }
  }
  
  return result;
}

function blurCrossTransition(a: ImageData | null, b: ImageData | null, progress: number, params: Record<string, unknown>): ImageData {
  const maxBlur = params.maxBlur as number || 30;
  const blurAmount = maxBlur * Math.sin(progress * Math.PI);
  
  const blendedA = a ? gaussianBlur(a, blurAmount) : null;
  const blendedB = b ? gaussianBlur(b, blurAmount) : null;
  
  return crossDissolve(blendedA, blendedB, progress);
}

function lightLeakTransition(a: ImageData | null, b: ImageData | null, progress: number, params: Record<string, unknown>): ImageData {
  const template = a || b;
  if (!template) return new ImageData(1, 1);
  
  const result = new ImageData(new Uint8ClampedArray(template.data), template.width, template.height);
  const { data, width, height } = result;
  
  const color = hexToRgb(params.color as string || '#ff8800');
  const intensity = (params.intensity as number || 75) / 100;
  
  // First blend A to B
  if (a && b) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = a.data[i] * (1 - progress) + b.data[i] * progress;
      data[i + 1] = a.data[i + 1] * (1 - progress) + b.data[i + 1] * progress;
      data[i + 2] = a.data[i + 2] * (1 - progress) + b.data[i + 2] * progress;
    }
  }
  
  // Add light leak
  const leakIntensity = Math.sin(progress * Math.PI) * intensity;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const leakFactor = Math.exp(-((nx - 0.5) ** 2) * 4) * leakIntensity;
      
      const idx = (y * width + x) * 4;
      data[idx] = clamp(data[idx] + color.r * leakFactor);
      data[idx + 1] = clamp(data[idx + 1] + color.g * leakFactor);
      data[idx + 2] = clamp(data[idx + 2] + color.b * leakFactor);
    }
  }
  
  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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
  
  return { h, s, l };
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
}

function blend(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, mode: string): [number, number, number] {
  switch (mode) {
    case 'add':
      return [clamp(r1 + r2), clamp(g1 + g2), clamp(b1 + b2)];
    case 'multiply':
      return [clamp(r1 * r2 / 255), clamp(g1 * g2 / 255), clamp(b1 * b2 / 255)];
    case 'screen':
      return [
        clamp(255 - (255 - r1) * (255 - r2) / 255),
        clamp(255 - (255 - g1) * (255 - g2) / 255),
        clamp(255 - (255 - b1) * (255 - b2) / 255)
      ];
    case 'overlay':
      return [
        r1 < 128 ? clamp(2 * r1 * r2 / 255) : clamp(255 - 2 * (255 - r1) * (255 - r2) / 255),
        g1 < 128 ? clamp(2 * g1 * g2 / 255) : clamp(255 - 2 * (255 - g1) * (255 - g2) / 255),
        b1 < 128 ? clamp(2 * b1 * b2 / 255) : clamp(255 - 2 * (255 - b1) * (255 - b2) / 255)
      ];
    default:
      return [r2, g2, b2];
  }
}

// =============================================================================
// ITEMS 121-130: AI-POWERED VIDEO EFFECTS
// =============================================================================

export interface AIEffectConfig {
  modelPath?: string;
  useGPU: boolean;
  qualityPreset: 'fast' | 'balanced' | 'quality';
}

export const AI_EFFECT_PRESETS = {
  'auto-color': {
    name: 'Auto Color Correction',
    description: 'AI-powered automatic color correction',
    category: 'AI',
  },
  'auto-stabilize': {
    name: 'Auto Stabilization',
    description: 'AI-powered video stabilization',
    category: 'AI',
  },
  'background-removal': {
    name: 'Background Removal',
    description: 'AI-powered automatic background removal',
    category: 'AI',
  },
  'face-blur': {
    name: 'Face Blur',
    description: 'Automatically detect and blur faces',
    category: 'AI',
  },
  'object-tracking': {
    name: 'Object Tracking',
    description: 'Track objects across frames',
    category: 'AI',
  },
  'super-resolution': {
    name: 'Super Resolution',
    description: 'AI upscaling for better quality',
    category: 'AI',
  },
  'style-transfer': {
    name: 'Style Transfer',
    description: 'Apply artistic styles to video',
    category: 'AI',
  },
  'noise-reduction-ai': {
    name: 'AI Noise Reduction',
    description: 'Advanced AI-powered noise reduction',
    category: 'AI',
  },
} as const;

// =============================================================================
// ITEMS 131-135: SMART CLIP ANALYSIS
// =============================================================================

export interface ClipAnalysis {
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  colorProfile: 'sdr' | 'hdr' | 'hlg';
  hasAudio: boolean;
  audioTracks: number;
  dominantColors: string[];
  averageBrightness: number;
  contrastLevel: 'low' | 'medium' | 'high';
  motionLevel: 'static' | 'slow' | 'medium' | 'fast';
  scenes: SceneInfo[];
  faces: FaceInfo[];
  audioLevels: { peak: number; rms: number };
}

export interface SceneInfo {
  startTime: number;
  endTime: number;
  type: 'cut' | 'fade' | 'dissolve' | 'wipe';
  confidence: number;
}

export interface FaceInfo {
  startTime: number;
  endTime: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  trackId: string;
}

export async function analyzeClip(videoPath: string): Promise<ClipAnalysis> {
  // This would integrate with FFprobe and AI models
  return {
    duration: 0,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    colorProfile: 'sdr',
    hasAudio: true,
    audioTracks: 1,
    dominantColors: [],
    averageBrightness: 128,
    contrastLevel: 'medium',
    motionLevel: 'medium',
    scenes: [],
    faces: [],
    audioLevels: { peak: -3, rms: -18 },
  };
}

// =============================================================================
// ITEMS 136-140: EFFECT PRESETS & TEMPLATES
// =============================================================================

export interface EffectPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  effects: AppliedEffect[];
  tags: string[];
  author?: string;
  rating?: number;
}

export interface AppliedEffect {
  effectId: string;
  params: Record<string, unknown>;
  keyframes?: Record<string, Keyframe[]>;
  blendMode?: string;
  opacity?: number;
}

export const BUILT_IN_PRESETS: EffectPreset[] = [
  {
    id: 'cinematic-look',
    name: 'Cinematic Look',
    description: 'Film-like color grading with letterbox',
    category: 'Film',
    effects: [
      { effectId: 'curves', params: { rgbCurve: [[0, 5], [64, 50], [192, 220], [255, 250]] } },
      { effectId: 'vignette', params: { amount: 30, softness: 70 } },
      { effectId: 'film-grain', params: { amount: 15, size: 1.2 } },
    ],
    tags: ['cinematic', 'film', 'movie'],
  },
  {
    id: 'vintage-8mm',
    name: 'Vintage 8mm',
    description: 'Classic 8mm film look',
    category: 'Retro',
    effects: [
      { effectId: 'hue-saturation', params: { saturation: -20 } },
      { effectId: 'levels', params: { inputBlack: 15, inputWhite: 240, gamma: 1.1 } },
      { effectId: 'vignette', params: { amount: 50, softness: 40 } },
      { effectId: 'film-grain', params: { amount: 40, size: 2 } },
    ],
    tags: ['vintage', 'retro', '8mm', 'old'],
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    description: 'Vibrant neon color scheme',
    category: 'Stylized',
    effects: [
      { effectId: 'hue-saturation', params: { saturation: 40 } },
      { effectId: 'color-balance', params: { highlightsCyan: -30, highlightsMagenta: 20 } },
      { effectId: 'glow', params: { threshold: 180, radius: 15, intensity: 40 } },
    ],
    tags: ['neon', 'vibrant', 'night', 'cyberpunk'],
  },
  {
    id: 'documentary',
    name: 'Documentary',
    description: 'Clean documentary style',
    category: 'Professional',
    effects: [
      { effectId: 'brightness-contrast', params: { contrast: 10 } },
      { effectId: 'hue-saturation', params: { saturation: -10 } },
      { effectId: 'denoise', params: { strength: 30, preserveDetail: 70 } },
    ],
    tags: ['documentary', 'clean', 'professional'],
  },
  {
    id: 'dreamy-soft',
    name: 'Dreamy Soft',
    description: 'Soft, dreamlike appearance',
    category: 'Stylized',
    effects: [
      { effectId: 'blur', params: { radius: 2 } },
      { effectId: 'glow', params: { threshold: 100, radius: 20, intensity: 30 } },
      { effectId: 'hue-saturation', params: { lightness: 10 } },
    ],
    tags: ['dreamy', 'soft', 'romantic'],
  },
  {
    id: 'action-punch',
    name: 'Action Punch',
    description: 'High contrast action look',
    category: 'Action',
    effects: [
      { effectId: 'brightness-contrast', params: { contrast: 30 } },
      { effectId: 'hue-saturation', params: { saturation: 20 } },
      { effectId: 'chromatic-aberration', params: { amount: 3 } },
    ],
    tags: ['action', 'high-contrast', 'intense'],
  },
];

export function findPresetsByTag(tag: string): EffectPreset[] {
  return BUILT_IN_PRESETS.filter(p => p.tags.includes(tag.toLowerCase()));
}

export function findPresetsByCategory(category: string): EffectPreset[] {
  return BUILT_IN_PRESETS.filter(p => p.category === category);
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createEffectProcessor = (width: number, height: number) => 
  new EffectProcessor(width, height);

export default EffectProcessor;
