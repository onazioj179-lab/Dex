// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - FLUX 3D & Effects System
// Professional 3D compositing and visual effects
// Items 476-500 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface Camera3D {
  id: string;
  name: string;
  type: 'oneNode' | 'twoNode';
  
  // Transform
  position: Vector3;
  rotation: Vector3;
  pointOfInterest?: Vector3;  // For two-node camera
  
  // Lens
  zoom: number;               // mm
  filmSize: number;           // mm
  fov: number;                // degrees (calculated)
  
  // Depth of Field
  dofEnabled: boolean;
  focusDistance: number;
  aperture: number;           // f-stop
  blurLevel: number;
  
  // Options
  depthOfField: boolean;
  motionBlur: boolean;
}

export interface Light3D {
  id: string;
  name: string;
  type: LightType;
  
  // Transform
  position: Vector3;
  rotation: Vector3;
  pointOfInterest?: Vector3;
  
  // Properties
  color: string;
  intensity: number;          // 0-100
  
  // Shadows
  castsShadows: boolean;
  shadowDarkness: number;     // 0-100
  shadowDiffusion: number;
  
  // Light-specific
  coneAngle?: number;         // For spot
  coneFeather?: number;
  falloff?: FalloffType;
  falloffStart?: number;
  falloffEnd?: number;
}

export type LightType = 'ambient' | 'parallel' | 'spot' | 'point';
export type FalloffType = 'none' | 'smooth' | 'inverse' | 'inverseClamped';

export interface Material3D {
  id: string;
  name: string;
  
  // Surface
  diffuse: MaterialProperty;
  specular: MaterialProperty;
  shininess: number;
  
  // Reflection/Refraction
  reflectionIntensity: number;
  reflectionSharpness: number;
  refractionIndex: number;
  
  // Texture
  textureMap?: string;        // Asset ID
  bumpMap?: string;
  normalMap?: string;
  
  // Options
  metal: number;
  roughness: number;
  ambient: number;
}

export interface MaterialProperty {
  color: string;
  intensity: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Matrix4x4 {
  elements: number[];         // 16 elements
}

// Effect Types
export interface EffectDefinition {
  id: string;
  name: string;
  category: EffectCategory;
  parameters: EffectParameterDef[];
  process: (input: ImageData, params: Map<string, unknown>, frame: number) => ImageData;
}

export type EffectCategory = 
  | 'blur' | 'sharpen' | 'distort' | 'color' | 'generate'
  | 'keying' | 'matte' | 'stylize' | 'transition' | 'time'
  | '3d' | 'audio' | 'expression' | 'text' | 'utility';

export interface EffectParameterDef {
  id: string;
  name: string;
  type: 'number' | 'color' | 'point' | 'angle' | 'checkbox' | 'dropdown' | 'layer';
  default: unknown;
  min?: number;
  max?: number;
  options?: string[];
}

export interface EffectInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  expanded: boolean;
  parameters: Map<string, AnimatableValue>;
}

export interface AnimatableValue {
  value: unknown;
  keyframes: ValueKeyframe[];
}

export interface ValueKeyframe {
  time: number;
  value: unknown;
  easing: string;
}

// =============================================================================
// ITEM 476: 3D ENGINE
// =============================================================================

export class Engine3D {
  private cameras: Map<string, Camera3D> = new Map();
  private lights: Map<string, Light3D> = new Map();
  private materials: Map<string, Material3D> = new Map();
  
  private activeCamera: Camera3D | null = null;
  private viewMatrix: Matrix4x4 = { elements: new Array(16).fill(0) };
  private projectionMatrix: Matrix4x4 = { elements: new Array(16).fill(0) };
  
  constructor() {
    this.initIdentityMatrices();
  }
  
  private initIdentityMatrices(): void {
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    this.viewMatrix.elements = [...identity];
    this.projectionMatrix.elements = [...identity];
  }
  
  // =============================================================================
  // ITEM 477-480: CAMERA SYSTEM
  // =============================================================================
  
  createCamera(name: string, type: 'oneNode' | 'twoNode' = 'twoNode'): Camera3D {
    const camera: Camera3D = {
      id: this.generateId(),
      name,
      type,
      position: { x: 0, y: 0, z: -1000 },
      rotation: { x: 0, y: 0, z: 0 },
      pointOfInterest: type === 'twoNode' ? { x: 0, y: 0, z: 0 } : undefined,
      zoom: 35,               // 35mm lens
      filmSize: 36,           // Full frame
      fov: this.calculateFOV(35, 36),
      dofEnabled: false,
      focusDistance: 500,
      aperture: 5.6,
      blurLevel: 100,
      depthOfField: false,
      motionBlur: false
    };
    
    this.cameras.set(camera.id, camera);
    
    if (!this.activeCamera) {
      this.activeCamera = camera;
      this.updateViewMatrix();
    }
    
    return camera;
  }
  
  setActiveCamera(cameraId: string): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      this.activeCamera = camera;
      this.updateViewMatrix();
    }
  }
  
  setCameraPosition(cameraId: string, position: Vector3): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.position = position;
      if (camera === this.activeCamera) {
        this.updateViewMatrix();
      }
    }
  }
  
  setCameraRotation(cameraId: string, rotation: Vector3): void {
    const camera = this.cameras.get(cameraId);
    if (camera && camera.type === 'oneNode') {
      camera.rotation = rotation;
      if (camera === this.activeCamera) {
        this.updateViewMatrix();
      }
    }
  }
  
  setCameraPointOfInterest(cameraId: string, poi: Vector3): void {
    const camera = this.cameras.get(cameraId);
    if (camera && camera.type === 'twoNode') {
      camera.pointOfInterest = poi;
      if (camera === this.activeCamera) {
        this.updateViewMatrix();
      }
    }
  }
  
  setCameraLens(cameraId: string, zoom: number, filmSize: number = 36): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.zoom = zoom;
      camera.filmSize = filmSize;
      camera.fov = this.calculateFOV(zoom, filmSize);
      this.updateProjectionMatrix();
    }
  }
  
  setCameraDepthOfField(cameraId: string, enabled: boolean, focusDistance?: number, aperture?: number): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.dofEnabled = enabled;
      if (focusDistance !== undefined) camera.focusDistance = focusDistance;
      if (aperture !== undefined) camera.aperture = aperture;
    }
  }
  
  private calculateFOV(zoom: number, filmSize: number): number {
    return 2 * Math.atan(filmSize / (2 * zoom)) * (180 / Math.PI);
  }
  
  private updateViewMatrix(): void {
    if (!this.activeCamera) return;
    
    const cam = this.activeCamera;
    const eye = cam.position;
    const target = cam.pointOfInterest || this.calculateTarget(cam);
    const up = { x: 0, y: 1, z: 0 };
    
    this.viewMatrix = this.lookAt(eye, target, up);
  }
  
  private calculateTarget(cam: Camera3D): Vector3 {
    // For one-node camera, calculate target from rotation
    const rx = cam.rotation.x * Math.PI / 180;
    const ry = cam.rotation.y * Math.PI / 180;
    
    return {
      x: cam.position.x + Math.sin(ry) * Math.cos(rx) * 1000,
      y: cam.position.y + Math.sin(rx) * 1000,
      z: cam.position.z + Math.cos(ry) * Math.cos(rx) * 1000
    };
  }
  
  private updateProjectionMatrix(): void {
    if (!this.activeCamera) return;
    
    const fov = this.activeCamera.fov * Math.PI / 180;
    const aspect = 16 / 9;    // Would come from composition
    const near = 1;
    const far = 10000;
    
    this.projectionMatrix = this.perspective(fov, aspect, near, far);
  }
  
  private lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4x4 {
    const zAxis = this.normalize(this.subtract(eye, target));
    const xAxis = this.normalize(this.cross(up, zAxis));
    const yAxis = this.cross(zAxis, xAxis);
    
    return {
      elements: [
        xAxis.x, yAxis.x, zAxis.x, 0,
        xAxis.y, yAxis.y, zAxis.y, 0,
        xAxis.z, yAxis.z, zAxis.z, 0,
        -this.dot(xAxis, eye), -this.dot(yAxis, eye), -this.dot(zAxis, eye), 1
      ]
    };
  }
  
  private perspective(fov: number, aspect: number, near: number, far: number): Matrix4x4 {
    const f = 1 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);
    
    return {
      elements: [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (near + far) * rangeInv, -1,
        0, 0, near * far * rangeInv * 2, 0
      ]
    };
  }
  
  // =============================================================================
  // ITEM 481-485: LIGHTING SYSTEM
  // =============================================================================
  
  createLight(name: string, type: LightType): Light3D {
    const light: Light3D = {
      id: this.generateId(),
      name,
      type,
      position: { x: 0, y: 500, z: -500 },
      rotation: { x: -45, y: 0, z: 0 },
      color: '#ffffff',
      intensity: 100,
      castsShadows: type !== 'ambient',
      shadowDarkness: 50,
      shadowDiffusion: 10,
      coneAngle: type === 'spot' ? 45 : undefined,
      coneFeather: type === 'spot' ? 50 : undefined,
      falloff: type === 'point' || type === 'spot' ? 'smooth' : 'none',
      falloffStart: 500,
      falloffEnd: 1500
    };
    
    this.lights.set(light.id, light);
    return light;
  }
  
  setLightPosition(lightId: string, position: Vector3): void {
    const light = this.lights.get(lightId);
    if (light) {
      light.position = position;
    }
  }
  
  setLightRotation(lightId: string, rotation: Vector3): void {
    const light = this.lights.get(lightId);
    if (light) {
      light.rotation = rotation;
    }
  }
  
  setLightColor(lightId: string, color: string, intensity?: number): void {
    const light = this.lights.get(lightId);
    if (light) {
      light.color = color;
      if (intensity !== undefined) light.intensity = intensity;
    }
  }
  
  setLightShadows(lightId: string, enabled: boolean, darkness?: number, diffusion?: number): void {
    const light = this.lights.get(lightId);
    if (light) {
      light.castsShadows = enabled;
      if (darkness !== undefined) light.shadowDarkness = darkness;
      if (diffusion !== undefined) light.shadowDiffusion = diffusion;
    }
  }
  
  setSpotLightCone(lightId: string, angle: number, feather: number): void {
    const light = this.lights.get(lightId);
    if (light && light.type === 'spot') {
      light.coneAngle = angle;
      light.coneFeather = feather;
    }
  }
  
  setLightFalloff(lightId: string, type: FalloffType, start?: number, end?: number): void {
    const light = this.lights.get(lightId);
    if (light && (light.type === 'point' || light.type === 'spot')) {
      light.falloff = type;
      if (start !== undefined) light.falloffStart = start;
      if (end !== undefined) light.falloffEnd = end;
    }
  }
  
  calculateLighting(position: Vector3, normal: Vector3): { r: number; g: number; b: number } {
    let totalR = 0, totalG = 0, totalB = 0;
    
    for (const light of this.lights.values()) {
      const lightDir = this.normalize(this.subtract(light.position, position));
      const lightColor = this.parseColor(light.color);
      const intensity = light.intensity / 100;
      
      let attenuation = 1;
      
      // Calculate attenuation based on falloff
      if (light.falloff && light.falloff !== 'none' && light.falloffStart !== undefined && light.falloffEnd !== undefined) {
        const distance = this.length(this.subtract(light.position, position));
        attenuation = this.calculateFalloff(distance, light.falloff, light.falloffStart, light.falloffEnd);
      }
      
      // Calculate cone attenuation for spot lights
      if (light.type === 'spot' && light.coneAngle !== undefined) {
        const spotDir = this.getSpotDirection(light);
        const spotAngle = Math.acos(this.dot(this.negate(lightDir), spotDir)) * 180 / Math.PI;
        
        if (spotAngle > light.coneAngle) {
          attenuation = 0;
        } else if (light.coneFeather && spotAngle > light.coneAngle - light.coneFeather) {
          attenuation *= 1 - (spotAngle - (light.coneAngle - light.coneFeather)) / light.coneFeather;
        }
      }
      
      // Calculate diffuse
      const diffuse = Math.max(0, this.dot(normal, lightDir));
      
      totalR += lightColor.r * intensity * diffuse * attenuation;
      totalG += lightColor.g * intensity * diffuse * attenuation;
      totalB += lightColor.b * intensity * diffuse * attenuation;
      
      // Ambient lights don't need normal calculation
      if (light.type === 'ambient') {
        totalR += lightColor.r * intensity;
        totalG += lightColor.g * intensity;
        totalB += lightColor.b * intensity;
      }
    }
    
    return {
      r: Math.min(1, totalR),
      g: Math.min(1, totalG),
      b: Math.min(1, totalB)
    };
  }
  
  private calculateFalloff(distance: number, type: FalloffType, start: number, end: number): number {
    if (distance <= start) return 1;
    if (distance >= end) return 0;
    
    const t = (distance - start) / (end - start);
    
    switch (type) {
      case 'smooth':
        return 1 - t;
      case 'inverse':
        return 1 / (1 + t * t);
      case 'inverseClamped':
        return Math.max(0, 1 - t * t);
      default:
        return 1;
    }
  }
  
  private getSpotDirection(light: Light3D): Vector3 {
    const rx = light.rotation.x * Math.PI / 180;
    const ry = light.rotation.y * Math.PI / 180;
    
    return {
      x: Math.sin(ry) * Math.cos(rx),
      y: -Math.sin(rx),
      z: Math.cos(ry) * Math.cos(rx)
    };
  }
  
  // =============================================================================
  // ITEM 486-490: MATERIAL SYSTEM
  // =============================================================================
  
  createMaterial(name: string): Material3D {
    const material: Material3D = {
      id: this.generateId(),
      name,
      diffuse: { color: '#808080', intensity: 100 },
      specular: { color: '#ffffff', intensity: 50 },
      shininess: 10,
      reflectionIntensity: 0,
      reflectionSharpness: 100,
      refractionIndex: 1,
      metal: 0,
      roughness: 50,
      ambient: 20
    };
    
    this.materials.set(material.id, material);
    return material;
  }
  
  setMaterialDiffuse(materialId: string, color: string, intensity?: number): void {
    const material = this.materials.get(materialId);
    if (material) {
      material.diffuse.color = color;
      if (intensity !== undefined) material.diffuse.intensity = intensity;
    }
  }
  
  setMaterialSpecular(materialId: string, color: string, intensity?: number, shininess?: number): void {
    const material = this.materials.get(materialId);
    if (material) {
      material.specular.color = color;
      if (intensity !== undefined) material.specular.intensity = intensity;
      if (shininess !== undefined) material.shininess = shininess;
    }
  }
  
  setMaterialReflection(materialId: string, intensity: number, sharpness?: number): void {
    const material = this.materials.get(materialId);
    if (material) {
      material.reflectionIntensity = intensity;
      if (sharpness !== undefined) material.reflectionSharpness = sharpness;
    }
  }
  
  setMaterialTexture(materialId: string, textureAssetId: string, mapType: 'diffuse' | 'bump' | 'normal'): void {
    const material = this.materials.get(materialId);
    if (material) {
      switch (mapType) {
        case 'diffuse': material.textureMap = textureAssetId; break;
        case 'bump': material.bumpMap = textureAssetId; break;
        case 'normal': material.normalMap = textureAssetId; break;
      }
    }
  }
  
  // =============================================================================
  // VECTOR MATH HELPERS
  // =============================================================================
  
  private subtract(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }
  
  private cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  
  private dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  
  private length(v: Vector3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  
  private normalize(v: Vector3): Vector3 {
    const len = this.length(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
  
  private negate(v: Vector3): Vector3 {
    return { x: -v.x, y: -v.y, z: -v.z };
  }
  
  private parseColor(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0.5, g: 0.5, b: 0.5 };
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Getters
  getCameras(): Camera3D[] {
    return Array.from(this.cameras.values());
  }
  
  getLights(): Light3D[] {
    return Array.from(this.lights.values());
  }
  
  getMaterials(): Material3D[] {
    return Array.from(this.materials.values());
  }
  
  getActiveCamera(): Camera3D | null {
    return this.activeCamera;
  }
  
  getViewMatrix(): Matrix4x4 {
    return this.viewMatrix;
  }
  
  getProjectionMatrix(): Matrix4x4 {
    return this.projectionMatrix;
  }
}

// =============================================================================
// ITEM 491-495: EFFECTS ENGINE
// =============================================================================

export class EffectsEngine {
  private effects: Map<string, EffectDefinition> = new Map();
  
  constructor() {
    this.registerBuiltinEffects();
  }
  
  private registerBuiltinEffects(): void {
    // Blur Effects
    this.registerEffect({
      id: 'gaussian-blur',
      name: 'Gaussian Blur',
      category: 'blur',
      parameters: [
        { id: 'blurriness', name: 'Blurriness', type: 'number', default: 10, min: 0, max: 500 },
        { id: 'blurDimensions', name: 'Blur Dimensions', type: 'dropdown', default: 0, options: ['Horizontal & Vertical', 'Horizontal', 'Vertical'] }
      ],
      process: this.processGaussianBlur.bind(this)
    });
    
    this.registerEffect({
      id: 'radial-blur',
      name: 'Radial Blur',
      category: 'blur',
      parameters: [
        { id: 'amount', name: 'Amount', type: 'number', default: 10, min: 0, max: 100 },
        { id: 'center', name: 'Center', type: 'point', default: { x: 0.5, y: 0.5 } },
        { id: 'type', name: 'Type', type: 'dropdown', default: 0, options: ['Spin', 'Zoom'] }
      ],
      process: this.processRadialBlur.bind(this)
    });
    
    this.registerEffect({
      id: 'directional-blur',
      name: 'Directional Blur',
      category: 'blur',
      parameters: [
        { id: 'direction', name: 'Direction', type: 'angle', default: 0 },
        { id: 'blurLength', name: 'Blur Length', type: 'number', default: 10, min: 0, max: 500 }
      ],
      process: this.processDirectionalBlur.bind(this)
    });
    
    // Color Correction
    this.registerEffect({
      id: 'curves',
      name: 'Curves',
      category: 'color',
      parameters: [
        { id: 'channel', name: 'Channel', type: 'dropdown', default: 0, options: ['RGB', 'Red', 'Green', 'Blue', 'Alpha'] }
      ],
      process: this.processCurves.bind(this)
    });
    
    this.registerEffect({
      id: 'levels',
      name: 'Levels',
      category: 'color',
      parameters: [
        { id: 'inputBlack', name: 'Input Black', type: 'number', default: 0, min: 0, max: 255 },
        { id: 'inputWhite', name: 'Input White', type: 'number', default: 255, min: 0, max: 255 },
        { id: 'gamma', name: 'Gamma', type: 'number', default: 1, min: 0.1, max: 10 },
        { id: 'outputBlack', name: 'Output Black', type: 'number', default: 0, min: 0, max: 255 },
        { id: 'outputWhite', name: 'Output White', type: 'number', default: 255, min: 0, max: 255 }
      ],
      process: this.processLevels.bind(this)
    });
    
    this.registerEffect({
      id: 'hue-saturation',
      name: 'Hue/Saturation',
      category: 'color',
      parameters: [
        { id: 'hue', name: 'Hue', type: 'number', default: 0, min: -180, max: 180 },
        { id: 'saturation', name: 'Saturation', type: 'number', default: 0, min: -100, max: 100 },
        { id: 'lightness', name: 'Lightness', type: 'number', default: 0, min: -100, max: 100 }
      ],
      process: this.processHueSaturation.bind(this)
    });
    
    // Distort
    this.registerEffect({
      id: 'bulge',
      name: 'Bulge',
      category: 'distort',
      parameters: [
        { id: 'center', name: 'Center', type: 'point', default: { x: 0.5, y: 0.5 } },
        { id: 'radius', name: 'Radius', type: 'number', default: 200, min: 0, max: 2000 },
        { id: 'height', name: 'Height', type: 'number', default: 0.5, min: -2, max: 2 }
      ],
      process: this.processBulge.bind(this)
    });
    
    this.registerEffect({
      id: 'wave-warp',
      name: 'Wave Warp',
      category: 'distort',
      parameters: [
        { id: 'waveType', name: 'Wave Type', type: 'dropdown', default: 0, options: ['Sine', 'Square', 'Triangle', 'Sawtooth'] },
        { id: 'waveHeight', name: 'Wave Height', type: 'number', default: 20, min: 0, max: 500 },
        { id: 'waveWidth', name: 'Wave Width', type: 'number', default: 100, min: 1, max: 1000 },
        { id: 'direction', name: 'Direction', type: 'angle', default: 0 },
        { id: 'waveSpeed', name: 'Wave Speed', type: 'number', default: 1, min: 0, max: 10 },
        { id: 'phase', name: 'Phase', type: 'number', default: 0, min: 0, max: 360 }
      ],
      process: this.processWaveWarp.bind(this)
    });
    
    // Generate
    this.registerEffect({
      id: 'fractal-noise',
      name: 'Fractal Noise',
      category: 'generate',
      parameters: [
        { id: 'noiseType', name: 'Noise Type', type: 'dropdown', default: 0, options: ['Soft Linear', 'Block', 'Turbulent Smooth', 'Turbulent Sharp'] },
        { id: 'contrast', name: 'Contrast', type: 'number', default: 100, min: 0, max: 400 },
        { id: 'brightness', name: 'Brightness', type: 'number', default: 0, min: -100, max: 100 },
        { id: 'scale', name: 'Scale', type: 'number', default: 100, min: 10, max: 1000 },
        { id: 'complexity', name: 'Complexity', type: 'number', default: 6, min: 1, max: 20 },
        { id: 'evolution', name: 'Evolution', type: 'number', default: 0, min: 0, max: 360 }
      ],
      process: this.processFractalNoise.bind(this)
    });
    
    this.registerEffect({
      id: 'gradient-ramp',
      name: 'Gradient Ramp',
      category: 'generate',
      parameters: [
        { id: 'startPoint', name: 'Start Point', type: 'point', default: { x: 0, y: 0.5 } },
        { id: 'startColor', name: 'Start Color', type: 'color', default: '#000000' },
        { id: 'endPoint', name: 'End Point', type: 'point', default: { x: 1, y: 0.5 } },
        { id: 'endColor', name: 'End Color', type: 'color', default: '#ffffff' },
        { id: 'rampShape', name: 'Ramp Shape', type: 'dropdown', default: 0, options: ['Linear', 'Radial'] }
      ],
      process: this.processGradientRamp.bind(this)
    });
    
    // Keying
    this.registerEffect({
      id: 'keylight',
      name: 'Keylight',
      category: 'keying',
      parameters: [
        { id: 'screenColor', name: 'Screen Color', type: 'color', default: '#00ff00' },
        { id: 'screenGain', name: 'Screen Gain', type: 'number', default: 100, min: 0, max: 200 },
        { id: 'screenBalance', name: 'Screen Balance', type: 'number', default: 50, min: 0, max: 100 },
        { id: 'clipBlack', name: 'Clip Black', type: 'number', default: 0, min: 0, max: 100 },
        { id: 'clipWhite', name: 'Clip White', type: 'number', default: 100, min: 0, max: 100 }
      ],
      process: this.processKeylight.bind(this)
    });
    
    // Stylize
    this.registerEffect({
      id: 'glow',
      name: 'Glow',
      category: 'stylize',
      parameters: [
        { id: 'glowThreshold', name: 'Glow Threshold', type: 'number', default: 60, min: 0, max: 100 },
        { id: 'glowRadius', name: 'Glow Radius', type: 'number', default: 25, min: 0, max: 200 },
        { id: 'glowIntensity', name: 'Glow Intensity', type: 'number', default: 1, min: 0, max: 4 },
        { id: 'glowColor', name: 'Glow Color', type: 'dropdown', default: 0, options: ['A & B Colors', 'Original Colors'] }
      ],
      process: this.processGlow.bind(this)
    });
    
    this.registerEffect({
      id: 'drop-shadow',
      name: 'Drop Shadow',
      category: 'stylize',
      parameters: [
        { id: 'shadowColor', name: 'Shadow Color', type: 'color', default: '#000000' },
        { id: 'opacity', name: 'Opacity', type: 'number', default: 75, min: 0, max: 100 },
        { id: 'direction', name: 'Direction', type: 'angle', default: 135 },
        { id: 'distance', name: 'Distance', type: 'number', default: 5, min: 0, max: 200 },
        { id: 'softness', name: 'Softness', type: 'number', default: 5, min: 0, max: 100 }
      ],
      process: this.processDropShadow.bind(this)
    });
  }
  
  private registerEffect(effect: EffectDefinition): void {
    this.effects.set(effect.id, effect);
  }
  
  getEffect(id: string): EffectDefinition | undefined {
    return this.effects.get(id);
  }
  
  getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
    return Array.from(this.effects.values()).filter(e => e.category === category);
  }
  
  getAllEffects(): EffectDefinition[] {
    return Array.from(this.effects.values());
  }
  
  applyEffect(effectId: string, input: ImageData, params: Map<string, unknown>, frame: number): ImageData {
    const effect = this.effects.get(effectId);
    if (!effect) return input;
    
    return effect.process(input, params, frame);
  }
  
  // =============================================================================
  // ITEM 496-500: EFFECT PROCESSORS
  // =============================================================================
  
  private processGaussianBlur(input: ImageData, params: Map<string, unknown>): ImageData {
    const blurriness = (params.get('blurriness') as number) || 10;
    const output = new ImageData(input.width, input.height);
    
    // Box blur approximation (3 passes = good Gaussian approximation)
    const boxSize = Math.max(1, Math.round(blurriness / 3));
    let current: Uint8ClampedArray = new Uint8ClampedArray(input.data);
    
    for (let pass = 0; pass < 3; pass++) {
      current = this.boxBlur(current, input.width, input.height, boxSize);
    }
    
    output.data.set(current);
    return output;
  }
  
  private boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
    const output = new Uint8ClampedArray(data.length);
    const size = radius * 2 + 1;
    
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (y * width + sx) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        output[idx] = r / count;
        output[idx + 1] = g / count;
        output[idx + 2] = b / count;
        output[idx + 3] = a / count;
      }
    }
    
    // Vertical pass
    const temp = new Uint8ClampedArray(output.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (sy * width + x) * 4;
          r += output[idx];
          g += output[idx + 1];
          b += output[idx + 2];
          a += output[idx + 3];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        temp[idx] = r / count;
        temp[idx + 1] = g / count;
        temp[idx + 2] = b / count;
        temp[idx + 3] = a / count;
      }
    }
    
    return temp;
  }
  
  private processRadialBlur(input: ImageData, params: Map<string, unknown>): ImageData {
    const output = new ImageData(input.width, input.height);
    const amount = (params.get('amount') as number) || 10;
    const center = (params.get('center') as { x: number; y: number }) || { x: 0.5, y: 0.5 };
    
    const cx = center.x * input.width;
    const cy = center.y * input.height;
    const samples = Math.max(4, Math.round(amount));
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        
        for (let i = 0; i < samples; i++) {
          const t = i / samples;
          const sx = Math.round(cx + (x - cx) * (1 - t * amount / 100));
          const sy = Math.round(cy + (y - cy) * (1 - t * amount / 100));
          
          const clampedX = Math.min(input.width - 1, Math.max(0, sx));
          const clampedY = Math.min(input.height - 1, Math.max(0, sy));
          const idx = (clampedY * input.width + clampedX) * 4;
          
          r += input.data[idx];
          g += input.data[idx + 1];
          b += input.data[idx + 2];
          a += input.data[idx + 3];
        }
        
        const idx = (y * input.width + x) * 4;
        output.data[idx] = r / samples;
        output.data[idx + 1] = g / samples;
        output.data[idx + 2] = b / samples;
        output.data[idx + 3] = a / samples;
      }
    }
    
    return output;
  }
  
  private processDirectionalBlur(input: ImageData, params: Map<string, unknown>): ImageData {
    const direction = (params.get('direction') as number) || 0;
    const length = (params.get('blurLength') as number) || 10;
    const output = new ImageData(input.width, input.height);
    
    const rad = direction * Math.PI / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const samples = Math.max(2, Math.round(length));
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        
        for (let i = -samples / 2; i <= samples / 2; i++) {
          const sx = Math.round(x + dx * i);
          const sy = Math.round(y + dy * i);
          
          const clampedX = Math.min(input.width - 1, Math.max(0, sx));
          const clampedY = Math.min(input.height - 1, Math.max(0, sy));
          const idx = (clampedY * input.width + clampedX) * 4;
          
          r += input.data[idx];
          g += input.data[idx + 1];
          b += input.data[idx + 2];
          a += input.data[idx + 3];
        }
        
        const idx = (y * input.width + x) * 4;
        output.data[idx] = r / (samples + 1);
        output.data[idx + 1] = g / (samples + 1);
        output.data[idx + 2] = b / (samples + 1);
        output.data[idx + 3] = a / (samples + 1);
      }
    }
    
    return output;
  }
  
  private processCurves(input: ImageData, params: Map<string, unknown>): ImageData {
    // Placeholder - would need curve control points
    return input;
  }
  
  private processLevels(input: ImageData, params: Map<string, unknown>): ImageData {
    const inputBlack = (params.get('inputBlack') as number) || 0;
    const inputWhite = (params.get('inputWhite') as number) || 255;
    const gamma = (params.get('gamma') as number) || 1;
    const outputBlack = (params.get('outputBlack') as number) || 0;
    const outputWhite = (params.get('outputWhite') as number) || 255;
    
    const output = new ImageData(input.width, input.height);
    const inputRange = inputWhite - inputBlack;
    const outputRange = outputWhite - outputBlack;
    
    for (let i = 0; i < input.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let value = input.data[i + c];
        
        // Input levels
        value = (value - inputBlack) / inputRange;
        value = Math.max(0, Math.min(1, value));
        
        // Gamma
        value = Math.pow(value, 1 / gamma);
        
        // Output levels
        value = outputBlack + value * outputRange;
        
        output.data[i + c] = Math.round(value);
      }
      output.data[i + 3] = input.data[i + 3];
    }
    
    return output;
  }
  
  private processHueSaturation(input: ImageData, params: Map<string, unknown>): ImageData {
    const hueShift = (params.get('hue') as number) || 0;
    const satShift = (params.get('saturation') as number) || 0;
    const lightShift = (params.get('lightness') as number) || 0;
    
    const output = new ImageData(input.width, input.height);
    
    for (let i = 0; i < input.data.length; i += 4) {
      const r = input.data[i] / 255;
      const g = input.data[i + 1] / 255;
      const b = input.data[i + 2] / 255;
      
      // RGB to HSL
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        
        h /= 6;
      }
      
      // Apply adjustments
      h = (h + hueShift / 360 + 1) % 1;
      s = Math.max(0, Math.min(1, s + satShift / 100));
      const newL = Math.max(0, Math.min(1, l + lightShift / 100));
      
      // HSL to RGB
      let newR, newG, newB;
      
      if (s === 0) {
        newR = newG = newB = newL;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        
        const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
        const p = 2 * newL - q;
        
        newR = hue2rgb(p, q, h + 1/3);
        newG = hue2rgb(p, q, h);
        newB = hue2rgb(p, q, h - 1/3);
      }
      
      output.data[i] = Math.round(newR * 255);
      output.data[i + 1] = Math.round(newG * 255);
      output.data[i + 2] = Math.round(newB * 255);
      output.data[i + 3] = input.data[i + 3];
    }
    
    return output;
  }
  
  private processBulge(input: ImageData, params: Map<string, unknown>): ImageData {
    const center = (params.get('center') as { x: number; y: number }) || { x: 0.5, y: 0.5 };
    const radius = (params.get('radius') as number) || 200;
    const height = (params.get('height') as number) || 0.5;
    
    const output = new ImageData(input.width, input.height);
    const cx = center.x * input.width;
    const cy = center.y * input.height;
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        let sx = x, sy = y;
        
        if (dist < radius) {
          const amount = 1 - dist / radius;
          const bulge = height * Math.sin(amount * Math.PI / 2);
          const factor = 1 + bulge;
          
          sx = cx + dx / factor;
          sy = cy + dy / factor;
        }
        
        // Bilinear interpolation
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, input.width - 1);
        const y1 = Math.min(y0 + 1, input.height - 1);
        const fx = sx - x0;
        const fy = sy - y0;
        
        const clampedX0 = Math.max(0, x0);
        const clampedY0 = Math.max(0, y0);
        
        const idx00 = (clampedY0 * input.width + clampedX0) * 4;
        const idx10 = (clampedY0 * input.width + x1) * 4;
        const idx01 = (y1 * input.width + clampedX0) * 4;
        const idx11 = (y1 * input.width + x1) * 4;
        
        const idx = (y * input.width + x) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = input.data[idx00 + c];
          const v10 = input.data[idx10 + c];
          const v01 = input.data[idx01 + c];
          const v11 = input.data[idx11 + c];
          
          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;
          
          output.data[idx + c] = Math.round(v0 * (1 - fy) + v1 * fy);
        }
      }
    }
    
    return output;
  }
  
  private processWaveWarp(input: ImageData, params: Map<string, unknown>, frame: number): ImageData {
    const waveHeight = (params.get('waveHeight') as number) || 20;
    const waveWidth = (params.get('waveWidth') as number) || 100;
    const direction = (params.get('direction') as number) || 0;
    const waveSpeed = (params.get('waveSpeed') as number) || 1;
    const phase = (params.get('phase') as number) || 0;
    
    const output = new ImageData(input.width, input.height);
    const rad = direction * Math.PI / 180;
    const phaseOffset = (phase + frame * waveSpeed * 10) * Math.PI / 180;
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        // Calculate wave offset
        const pos = x * Math.cos(rad) + y * Math.sin(rad);
        const wave = Math.sin(pos * 2 * Math.PI / waveWidth + phaseOffset) * waveHeight;
        
        const sx = x - wave * Math.sin(rad);
        const sy = y + wave * Math.cos(rad);
        
        const clampedX = Math.min(input.width - 1, Math.max(0, Math.round(sx)));
        const clampedY = Math.min(input.height - 1, Math.max(0, Math.round(sy)));
        
        const srcIdx = (clampedY * input.width + clampedX) * 4;
        const dstIdx = (y * input.width + x) * 4;
        
        output.data[dstIdx] = input.data[srcIdx];
        output.data[dstIdx + 1] = input.data[srcIdx + 1];
        output.data[dstIdx + 2] = input.data[srcIdx + 2];
        output.data[dstIdx + 3] = input.data[srcIdx + 3];
      }
    }
    
    return output;
  }
  
  private processFractalNoise(input: ImageData, params: Map<string, unknown>, frame: number): ImageData {
    const contrast = (params.get('contrast') as number) || 100;
    const brightness = (params.get('brightness') as number) || 0;
    const scale = (params.get('scale') as number) || 100;
    const complexity = (params.get('complexity') as number) || 6;
    const evolution = (params.get('evolution') as number) || 0;
    
    const output = new ImageData(input.width, input.height);
    const seed = (evolution + frame * 0.1) * Math.PI / 180;
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        let noise = 0;
        let amplitude = 1;
        let frequency = 100 / scale;
        let maxAmplitude = 0;
        
        for (let o = 0; o < complexity; o++) {
          noise += this.simplex2D(x * frequency + seed, y * frequency + seed) * amplitude;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        
        noise = noise / maxAmplitude; // Normalize to -1 to 1
        noise = (noise + 1) / 2;      // Normalize to 0 to 1
        
        // Apply contrast and brightness
        noise = (noise - 0.5) * (contrast / 100) + 0.5;
        noise = noise + brightness / 100;
        noise = Math.max(0, Math.min(1, noise));
        
        const value = Math.round(noise * 255);
        const idx = (y * input.width + x) * 4;
        
        output.data[idx] = value;
        output.data[idx + 1] = value;
        output.data[idx + 2] = value;
        output.data[idx + 3] = 255;
      }
    }
    
    return output;
  }
  
  private simplex2D(x: number, y: number): number {
    // Simplified Perlin-like noise
    const floor = Math.floor;
    const ix = floor(x);
    const iy = floor(y);
    const fx = x - ix;
    const fy = y - iy;
    
    const hash = (x: number, y: number) => {
      const h = (x * 12.9898 + y * 78.233) * 43758.5453;
      return (h - floor(h)) * 2 - 1;
    };
    
    const n00 = hash(ix, iy);
    const n10 = hash(ix + 1, iy);
    const n01 = hash(ix, iy + 1);
    const n11 = hash(ix + 1, iy + 1);
    
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const sx = smooth(fx);
    const sy = smooth(fy);
    
    const n0 = n00 * (1 - sx) + n10 * sx;
    const n1 = n01 * (1 - sx) + n11 * sx;
    
    return n0 * (1 - sy) + n1 * sy;
  }
  
  private processGradientRamp(input: ImageData, params: Map<string, unknown>): ImageData {
    const startPoint = (params.get('startPoint') as { x: number; y: number }) || { x: 0, y: 0.5 };
    const startColor = (params.get('startColor') as string) || '#000000';
    const endPoint = (params.get('endPoint') as { x: number; y: number }) || { x: 1, y: 0.5 };
    const endColor = (params.get('endColor') as string) || '#ffffff';
    
    const output = new ImageData(input.width, input.height);
    
    const sc = this.parseHexColor(startColor);
    const ec = this.parseHexColor(endColor);
    
    const sx = startPoint.x * input.width;
    const sy = startPoint.y * input.height;
    const ex = endPoint.x * input.width;
    const ey = endPoint.y * input.height;
    
    const dx = ex - sx;
    const dy = ey - sy;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const px = x - sx;
        const py = y - sy;
        
        let t = length > 0 ? (px * dx + py * dy) / (length * length) : 0;
        t = Math.max(0, Math.min(1, t));
        
        const idx = (y * input.width + x) * 4;
        output.data[idx] = Math.round(sc.r + (ec.r - sc.r) * t);
        output.data[idx + 1] = Math.round(sc.g + (ec.g - sc.g) * t);
        output.data[idx + 2] = Math.round(sc.b + (ec.b - sc.b) * t);
        output.data[idx + 3] = 255;
      }
    }
    
    return output;
  }
  
  private processKeylight(input: ImageData, params: Map<string, unknown>): ImageData {
    const screenColor = (params.get('screenColor') as string) || '#00ff00';
    const screenGain = (params.get('screenGain') as number) || 100;
    const clipBlack = (params.get('clipBlack') as number) || 0;
    const clipWhite = (params.get('clipWhite') as number) || 100;
    
    const output = new ImageData(input.width, input.height);
    const keyColor = this.parseHexColor(screenColor);
    
    for (let i = 0; i < input.data.length; i += 4) {
      const r = input.data[i];
      const g = input.data[i + 1];
      const b = input.data[i + 2];
      
      // Calculate color difference from key
      const dr = Math.abs(r - keyColor.r);
      const dg = Math.abs(g - keyColor.g);
      const db = Math.abs(b - keyColor.b);
      
      const diff = Math.sqrt(dr * dr + dg * dg + db * db) / (255 * Math.sqrt(3));
      
      // Calculate alpha based on difference
      let alpha = (diff * screenGain / 100);
      alpha = (alpha - clipBlack / 100) / ((clipWhite - clipBlack) / 100);
      alpha = Math.max(0, Math.min(1, alpha));
      
      output.data[i] = r;
      output.data[i + 1] = g;
      output.data[i + 2] = b;
      output.data[i + 3] = Math.round(alpha * 255);
    }
    
    return output;
  }
  
  private processGlow(input: ImageData, params: Map<string, unknown>): ImageData {
    const threshold = (params.get('glowThreshold') as number) || 60;
    const radius = (params.get('glowRadius') as number) || 25;
    const intensity = (params.get('glowIntensity') as number) || 1;
    
    // Extract bright areas
    const bright = new ImageData(input.width, input.height);
    for (let i = 0; i < input.data.length; i += 4) {
      const luminance = (input.data[i] * 0.299 + input.data[i + 1] * 0.587 + input.data[i + 2] * 0.114) / 255;
      
      if (luminance > threshold / 100) {
        bright.data[i] = input.data[i];
        bright.data[i + 1] = input.data[i + 1];
        bright.data[i + 2] = input.data[i + 2];
        bright.data[i + 3] = 255;
      } else {
        bright.data[i] = 0;
        bright.data[i + 1] = 0;
        bright.data[i + 2] = 0;
        bright.data[i + 3] = 0;
      }
    }
    
    // Blur the bright areas
    const blurred = this.processGaussianBlur(bright, new Map([['blurriness', radius]]));
    
    // Composite
    const output = new ImageData(input.width, input.height);
    for (let i = 0; i < input.data.length; i += 4) {
      output.data[i] = Math.min(255, input.data[i] + blurred.data[i] * intensity);
      output.data[i + 1] = Math.min(255, input.data[i + 1] + blurred.data[i + 1] * intensity);
      output.data[i + 2] = Math.min(255, input.data[i + 2] + blurred.data[i + 2] * intensity);
      output.data[i + 3] = input.data[i + 3];
    }
    
    return output;
  }
  
  private processDropShadow(input: ImageData, params: Map<string, unknown>): ImageData {
    const shadowColor = (params.get('shadowColor') as string) || '#000000';
    const opacity = (params.get('opacity') as number) || 75;
    const direction = (params.get('direction') as number) || 135;
    const distance = (params.get('distance') as number) || 5;
    const softness = (params.get('softness') as number) || 5;
    
    const output = new ImageData(input.width, input.height);
    const color = this.parseHexColor(shadowColor);
    
    const rad = direction * Math.PI / 180;
    const dx = Math.round(Math.cos(rad) * distance);
    const dy = Math.round(Math.sin(rad) * distance);
    
    // Create shadow from alpha
    const shadow = new ImageData(input.width, input.height);
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const sx = x - dx;
        const sy = y - dy;
        
        if (sx >= 0 && sx < input.width && sy >= 0 && sy < input.height) {
          const srcIdx = (sy * input.width + sx) * 4;
          const alpha = input.data[srcIdx + 3];
          
          const idx = (y * input.width + x) * 4;
          shadow.data[idx] = color.r;
          shadow.data[idx + 1] = color.g;
          shadow.data[idx + 2] = color.b;
          shadow.data[idx + 3] = Math.round(alpha * opacity / 100);
        }
      }
    }
    
    // Blur shadow
    const blurred = softness > 0 ? this.processGaussianBlur(shadow, new Map([['blurriness', softness]])) : shadow;
    
    // Composite: shadow behind original
    for (let i = 0; i < output.data.length; i += 4) {
      const sa = blurred.data[i + 3] / 255;
      const da = input.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      
      if (oa > 0) {
        output.data[i] = (blurred.data[i] * sa + input.data[i] * da * (1 - sa)) / oa;
        output.data[i + 1] = (blurred.data[i + 1] * sa + input.data[i + 1] * da * (1 - sa)) / oa;
        output.data[i + 2] = (blurred.data[i + 2] * sa + input.data[i + 2] * da * (1 - sa)) / oa;
        output.data[i + 3] = Math.round(oa * 255);
      }
    }
    
    return output;
  }
  
  private parseHexColor(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 128, g: 128, b: 128 };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createEngine3D = () => new Engine3D();
export const createEffectsEngine = () => new EffectsEngine();

export default { Engine3D, EffectsEngine };
