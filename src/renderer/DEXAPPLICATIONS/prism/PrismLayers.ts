// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - PRISM Advanced Layer System
// Professional layer management rivaling Photoshop/Pixelmator Pro
// Items 51-75 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;           // 0-100
  blendMode: LayerBlendMode;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;          // degrees
  scale: { x: number; y: number };
  anchor: { x: number; y: number };  // 0-1 normalized
  mask: LayerMask | null;
  clippingMask: boolean;     // Clips to layer below
  effects: LayerEffect[];
  selected: boolean;
  expanded: boolean;         // For groups
  parentId: string | null;   // For group membership
  zIndex: number;
  thumbnail: string | null;  // Base64 encoded
  metadata: LayerMetadata;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  imageData: ImageData | null;
  smartObject: SmartObjectData | null;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: TextContent;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeData;
}

export interface AdjustmentLayer extends LayerBase {
  type: 'adjustment';
  adjustment: AdjustmentData;
}

export interface FillLayer extends LayerBase {
  type: 'fill';
  fill: FillData;
}

export interface GroupLayer extends LayerBase {
  type: 'group';
  children: string[];        // Layer IDs
  passThrough: boolean;      // Blend as group or pass through
}

export type Layer = ImageLayer | TextLayer | ShapeLayer | AdjustmentLayer | FillLayer | GroupLayer;

export type LayerBlendMode = 
  | 'normal' | 'dissolve'
  | 'darken' | 'multiply' | 'colorBurn' | 'linearBurn' | 'darkerColor'
  | 'lighten' | 'screen' | 'colorDodge' | 'linearDodge' | 'lighterColor'
  | 'overlay' | 'softLight' | 'hardLight' | 'vividLight' | 'linearLight' | 'pinLight' | 'hardMix'
  | 'difference' | 'exclusion' | 'subtract' | 'divide'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface LayerMask {
  enabled: boolean;
  linked: boolean;           // Move with layer
  inverted: boolean;
  density: number;           // 0-100
  feather: number;           // pixels
  data: ImageData | null;
  vectorMask: VectorMaskData | null;
}

export interface VectorMaskData {
  paths: VectorPath[];
  feather: number;
}

export interface VectorPath {
  id: string;
  points: VectorPoint[];
  closed: boolean;
  fillRule: 'nonzero' | 'evenodd';
}

export interface VectorPoint {
  anchor: { x: number; y: number };
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
  cornerRadius: number;
}

export interface LayerEffect {
  id: string;
  type: LayerEffectType;
  enabled: boolean;
  settings: LayerEffectSettings;
}

export type LayerEffectType = 
  | 'dropShadow' | 'innerShadow' 
  | 'outerGlow' | 'innerGlow'
  | 'bevelEmboss' | 'satin'
  | 'colorOverlay' | 'gradientOverlay' | 'patternOverlay'
  | 'stroke';

export interface LayerEffectSettings {
  // Common
  blendMode?: LayerBlendMode;
  opacity?: number;
  
  // Shadow/Glow
  color?: string;
  angle?: number;
  distance?: number;
  spread?: number;
  size?: number;
  contour?: string;
  noise?: number;
  
  // Bevel
  style?: 'outer' | 'inner' | 'emboss' | 'pillow' | 'stroke';
  technique?: 'smooth' | 'chisel-hard' | 'chisel-soft';
  depth?: number;
  direction?: 'up' | 'down';
  softness?: number;
  highlightMode?: LayerBlendMode;
  highlightColor?: string;
  highlightOpacity?: number;
  shadowMode?: LayerBlendMode;
  shadowColor?: string;
  shadowOpacity?: number;
  
  // Overlay
  gradient?: GradientData;
  pattern?: PatternData;
  scale?: number;
  
  // Stroke
  position?: 'outside' | 'inside' | 'center';
  fillType?: 'color' | 'gradient' | 'pattern';
}

export interface GradientData {
  type: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
  stops: GradientStop[];
  angle: number;
  scale: number;
  offset: { x: number; y: number };
  reverse: boolean;
  dither: boolean;
}

export interface GradientStop {
  position: number;  // 0-1
  color: string;
  opacity: number;
}

export interface PatternData {
  id: string;
  name: string;
  data: ImageData | null;
  scale: number;
  offset: { x: number; y: number };
}

export interface TextContent {
  text: string;
  font: FontSettings;
  paragraph: ParagraphSettings;
  bounds: 'point' | 'area';
  areaBounds?: { width: number; height: number };
  warp?: TextWarp;
}

export interface FontSettings {
  family: string;
  style: 'normal' | 'italic' | 'oblique';
  weight: number;            // 100-900
  size: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  kerning: 'auto' | 'metrics' | 'optical' | number;
  baseline: 'auto' | 'superscript' | 'subscript' | number;
  underline: boolean;
  strikethrough: boolean;
  smallCaps: boolean;
  allCaps: boolean;
}

export interface ParagraphSettings {
  alignment: 'left' | 'center' | 'right' | 'justify' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyAll';
  indent: { first: number; left: number; right: number };
  spacing: { before: number; after: number };
  hyphenation: boolean;
}

export interface TextWarp {
  style: WarpStyle;
  horizontal: boolean;
  bend: number;
  distortionH: number;
  distortionV: number;
}

export type WarpStyle = 
  | 'none' | 'arc' | 'arcLower' | 'arcUpper' | 'arch' | 'bulge' | 'shellLower' | 'shellUpper'
  | 'flag' | 'wave' | 'fish' | 'rise' | 'fisheye' | 'inflate' | 'squeeze' | 'twist';

export interface ShapeData {
  shapeType: ShapeType;
  fill: ShapeFill;
  stroke: ShapeStroke;
  path: VectorPath;
  shapeSettings: ShapeTypeSettings;
}

export type ShapeType = 
  | 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line' | 'custom';

export interface ShapeFill {
  type: 'none' | 'solid' | 'gradient' | 'pattern';
  color?: string;
  gradient?: GradientData;
  pattern?: PatternData;
}

export interface ShapeStroke {
  enabled: boolean;
  color: string;
  width: number;
  alignment: 'inside' | 'center' | 'outside';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
}

export interface ShapeTypeSettings {
  // Rectangle
  cornerRadius?: number | [number, number, number, number];
  
  // Polygon/Star
  sides?: number;
  innerRadius?: number;      // For stars
  
  // Line
  startArrow?: ArrowStyle;
  endArrow?: ArrowStyle;
}

export type ArrowStyle = 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval' | 'open';

export interface AdjustmentData {
  adjustmentType: AdjustmentType;
  settings: AdjustmentSettings;
}

export type AdjustmentType = 
  | 'brightness' | 'levels' | 'curves' | 'exposure'
  | 'vibrance' | 'hueSaturation' | 'colorBalance' | 'blackWhite'
  | 'photoFilter' | 'channelMixer' | 'colorLookup' | 'invert'
  | 'posterize' | 'threshold' | 'gradientMap' | 'selectiveColor';

export interface AdjustmentSettings {
  // Brightness/Contrast
  brightness?: number;
  contrast?: number;
  useLegacy?: boolean;
  
  // Levels
  inputLevels?: { black: number; gamma: number; white: number };
  outputLevels?: { black: number; white: number };
  channel?: 'rgb' | 'red' | 'green' | 'blue';
  
  // Curves
  curvePoints?: { input: number; output: number }[];
  
  // Exposure
  exposure?: number;
  offset?: number;
  gamma?: number;
  
  // Vibrance
  vibrance?: number;
  saturation?: number;
  
  // Hue/Saturation
  hue?: number;
  colorize?: boolean;
  colorizeHue?: number;
  colorizeSaturation?: number;
  
  // Color Balance
  shadows?: { cyan: number; magenta: number; yellow: number };
  midtones?: { cyan: number; magenta: number; yellow: number };
  highlights?: { cyan: number; magenta: number; yellow: number };
  preserveLuminosity?: boolean;
  
  // Black & White
  reds?: number;
  yellows?: number;
  greens?: number;
  cyans?: number;
  blues?: number;
  magentas?: number;
  tint?: { enabled: boolean; hue: number; saturation: number };
  
  // Photo Filter
  filterColor?: string;
  filterDensity?: number;
  preserveLuminance?: boolean;
  
  // Channel Mixer
  outputChannel?: 'red' | 'green' | 'blue';
  redSource?: number;
  greenSource?: number;
  blueSource?: number;
  constant?: number;
  monochrome?: boolean;
  
  // Posterize
  levels?: number;
  
  // Threshold
  threshold?: number;
  
  // Gradient Map
  gradientMapStops?: GradientStop[];
  dither?: boolean;
  reverse?: boolean;
}

export interface FillData {
  fillType: 'solid' | 'gradient' | 'pattern';
  color?: string;
  gradient?: GradientData;
  pattern?: PatternData;
}

export interface SmartObjectData {
  sourceType: 'embedded' | 'linked';
  sourcePath?: string;
  originalSize: { width: number; height: number };
  transforms: SmartObjectTransform[];
  filters: SmartFilter[];
}

export interface SmartObjectTransform {
  type: 'scale' | 'rotate' | 'skew' | 'distort' | 'perspective' | 'warp';
  values: number[];
}

export interface SmartFilter {
  id: string;
  name: string;
  type: string;
  settings: Record<string, any>;
  enabled: boolean;
  blendMode: LayerBlendMode;
  opacity: number;
}

export interface LayerMetadata {
  created: number;
  modified: number;
  author?: string;
  notes?: string;
  tags?: string[];
  colorLabel?: 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'gray';
}

// =============================================================================
// ITEM 51: LAYER MANAGER
// =============================================================================

export class LayerManager {
  private layers: Map<string, Layer> = new Map();
  private layerOrder: string[] = [];
  private selectedIds: Set<string> = new Set();
  private activeLayerId: string | null = null;
  private clipboard: Layer[] = [];
  private history: LayerHistoryState[] = [];
  private historyIndex: number = -1;
  private maxHistory: number = 100;
  
  // Event callbacks
  private onLayerChange?: (layers: Layer[]) => void;
  private onSelectionChange?: (selectedIds: string[]) => void;
  
  constructor() {}
  
  setOnLayerChange(callback: (layers: Layer[]) => void): void {
    this.onLayerChange = callback;
  }
  
  setOnSelectionChange(callback: (selectedIds: string[]) => void): void {
    this.onSelectionChange = callback;
  }
  
  // =============================================================================
  // ITEM 52: ADD LAYER
  // =============================================================================
  
  addLayer(layer: Layer, index?: number): string {
    this.saveHistory('Add Layer');
    
    this.layers.set(layer.id, layer);
    
    if (index !== undefined && index >= 0 && index <= this.layerOrder.length) {
      this.layerOrder.splice(index, 0, layer.id);
    } else {
      this.layerOrder.push(layer.id);
    }
    
    this.updateZIndices();
    this.notifyChange();
    
    return layer.id;
  }
  
  // =============================================================================
  // ITEM 53: REMOVE LAYER
  // =============================================================================
  
  removeLayer(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    this.saveHistory('Remove Layer');
    
    // Remove from group if in one
    if (layer.parentId) {
      const parent = this.layers.get(layer.parentId) as GroupLayer;
      if (parent && parent.type === 'group') {
        parent.children = parent.children.filter(childId => childId !== id);
      }
    }
    
    // If it's a group, remove all children
    if (layer.type === 'group') {
      for (const childId of (layer as GroupLayer).children) {
        this.layers.delete(childId);
        const orderIndex = this.layerOrder.indexOf(childId);
        if (orderIndex !== -1) {
          this.layerOrder.splice(orderIndex, 1);
        }
      }
    }
    
    this.layers.delete(id);
    const orderIndex = this.layerOrder.indexOf(id);
    if (orderIndex !== -1) {
      this.layerOrder.splice(orderIndex, 1);
    }
    
    this.selectedIds.delete(id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layerOrder[0] || null;
    }
    
    this.updateZIndices();
    this.notifyChange();
    
    return true;
  }
  
  // =============================================================================
  // ITEM 54: DUPLICATE LAYER
  // =============================================================================
  
  duplicateLayer(id: string): string | null {
    const original = this.layers.get(id);
    if (!original) return null;
    
    this.saveHistory('Duplicate Layer');
    
    const duplicate = this.deepCloneLayer(original);
    duplicate.id = generateId();
    duplicate.name = `${original.name} copy`;
    duplicate.selected = false;
    
    // Insert above original
    const index = this.layerOrder.indexOf(id) + 1;
    this.layers.set(duplicate.id, duplicate);
    this.layerOrder.splice(index, 0, duplicate.id);
    
    this.updateZIndices();
    this.notifyChange();
    
    return duplicate.id;
  }
  
  // =============================================================================
  // ITEM 55: MERGE LAYERS
  // =============================================================================
  
  mergeLayers(ids: string[], mergeName?: string): string | null {
    if (ids.length < 2) return null;
    
    const layersToMerge = ids
      .map(id => this.layers.get(id))
      .filter((l): l is Layer => l !== undefined)
      .sort((a, b) => b.zIndex - a.zIndex);
    
    if (layersToMerge.length < 2) return null;
    
    this.saveHistory('Merge Layers');
    
    // Get bounds of all layers
    const bounds = this.calculateLayersBounds(layersToMerge);
    
    // Create new merged layer
    const mergedLayer: ImageLayer = {
      id: generateId(),
      name: mergeName || `Merged ${layersToMerge[0].name}`,
      type: 'image',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x: bounds.x, y: bounds.y },
      size: { width: bounds.width, height: bounds.height },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: false,
      parentId: layersToMerge[0].parentId,
      zIndex: 0,
      thumbnail: null,
      imageData: null,
      smartObject: null,
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    // Render all layers to merge into imageData
    mergedLayer.imageData = this.renderLayersToImageData(layersToMerge, bounds);
    
    // Find insertion point (position of topmost layer)
    const topIndex = this.layerOrder.indexOf(layersToMerge[0].id);
    
    // Remove original layers
    for (const layer of layersToMerge) {
      this.layers.delete(layer.id);
      const idx = this.layerOrder.indexOf(layer.id);
      if (idx !== -1) this.layerOrder.splice(idx, 1);
    }
    
    // Insert merged layer
    this.layers.set(mergedLayer.id, mergedLayer);
    this.layerOrder.splice(topIndex, 0, mergedLayer.id);
    
    this.selectedIds.clear();
    this.selectedIds.add(mergedLayer.id);
    this.activeLayerId = mergedLayer.id;
    
    this.updateZIndices();
    this.notifyChange();
    
    return mergedLayer.id;
  }
  
  // =============================================================================
  // ITEM 56: FLATTEN IMAGE
  // =============================================================================
  
  flattenImage(): string | null {
    const allLayerIds = [...this.layerOrder];
    return this.mergeLayers(allLayerIds, 'Background');
  }
  
  // =============================================================================
  // ITEM 57: GROUP LAYERS
  // =============================================================================
  
  groupLayers(ids: string[], groupName?: string): string | null {
    if (ids.length === 0) return null;
    
    const layersToGroup = ids
      .map(id => this.layers.get(id))
      .filter((l): l is Layer => l !== undefined);
    
    if (layersToGroup.length === 0) return null;
    
    this.saveHistory('Group Layers');
    
    // Create group layer
    const group: GroupLayer = {
      id: generateId(),
      name: groupName || 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: true,
      parentId: layersToGroup[0].parentId,
      zIndex: 0,
      thumbnail: null,
      children: ids,
      passThrough: true,
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    // Update parent references
    for (const layer of layersToGroup) {
      layer.parentId = group.id;
    }
    
    // Find insertion point
    const indices = ids.map(id => this.layerOrder.indexOf(id)).filter(i => i !== -1);
    const topIndex = Math.min(...indices);
    
    // Remove layers from order (they stay in map but are now in group)
    for (const id of ids) {
      const idx = this.layerOrder.indexOf(id);
      if (idx !== -1) this.layerOrder.splice(idx, 1);
    }
    
    // Insert group
    this.layers.set(group.id, group);
    this.layerOrder.splice(topIndex, 0, group.id);
    
    this.selectedIds.clear();
    this.selectedIds.add(group.id);
    this.activeLayerId = group.id;
    
    this.updateZIndices();
    this.notifyChange();
    
    return group.id;
  }
  
  // =============================================================================
  // ITEM 58: UNGROUP LAYERS
  // =============================================================================
  
  ungroupLayers(groupId: string): string[] | null {
    const group = this.layers.get(groupId) as GroupLayer;
    if (!group || group.type !== 'group') return null;
    
    this.saveHistory('Ungroup Layers');
    
    const childIds = [...group.children];
    const groupIndex = this.layerOrder.indexOf(groupId);
    
    // Update children's parent reference
    for (const childId of childIds) {
      const child = this.layers.get(childId);
      if (child) {
        child.parentId = group.parentId;
      }
    }
    
    // Remove group from order
    this.layerOrder.splice(groupIndex, 1);
    
    // Insert children at group's position
    this.layerOrder.splice(groupIndex, 0, ...childIds);
    
    // Delete group
    this.layers.delete(groupId);
    
    this.selectedIds.clear();
    childIds.forEach(id => this.selectedIds.add(id));
    this.activeLayerId = childIds[0] || null;
    
    this.updateZIndices();
    this.notifyChange();
    
    return childIds;
  }
  
  // =============================================================================
  // ITEM 59: MOVE LAYER
  // =============================================================================
  
  moveLayer(id: string, newIndex: number): boolean {
    const currentIndex = this.layerOrder.indexOf(id);
    if (currentIndex === -1) return false;
    if (newIndex < 0 || newIndex >= this.layerOrder.length) return false;
    if (currentIndex === newIndex) return true;
    
    this.saveHistory('Move Layer');
    
    this.layerOrder.splice(currentIndex, 1);
    this.layerOrder.splice(newIndex, 0, id);
    
    this.updateZIndices();
    this.notifyChange();
    
    return true;
  }
  
  // =============================================================================
  // ITEM 60: REORDER LAYERS
  // =============================================================================
  
  reorderLayers(newOrder: string[]): boolean {
    if (newOrder.length !== this.layerOrder.length) return false;
    
    const orderSet = new Set(newOrder);
    if (orderSet.size !== newOrder.length) return false;
    
    for (const id of newOrder) {
      if (!this.layers.has(id)) return false;
    }
    
    this.saveHistory('Reorder Layers');
    this.layerOrder = [...newOrder];
    this.updateZIndices();
    this.notifyChange();
    
    return true;
  }
  
  // =============================================================================
  // ITEM 61: LAYER VISIBILITY
  // =============================================================================
  
  setLayerVisibility(id: string, visible: boolean): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    if (layer.visible === visible) return true;
    
    this.saveHistory('Toggle Visibility');
    layer.visible = visible;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  toggleLayerVisibility(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    return this.setLayerVisibility(id, !layer.visible);
  }
  
  // =============================================================================
  // ITEM 62: LAYER LOCK
  // =============================================================================
  
  setLayerLock(id: string, locked: boolean): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    layer.locked = locked;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 63: LAYER OPACITY
  // =============================================================================
  
  setLayerOpacity(id: string, opacity: number): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    this.saveHistory('Change Opacity');
    layer.opacity = Math.max(0, Math.min(100, opacity));
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 64: LAYER BLEND MODE
  // =============================================================================
  
  setLayerBlendMode(id: string, blendMode: LayerBlendMode): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    this.saveHistory('Change Blend Mode');
    layer.blendMode = blendMode;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 65: LAYER MASK
  // =============================================================================
  
  addLayerMask(id: string, maskType: 'revealAll' | 'hideAll' | 'fromSelection'): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    this.saveHistory('Add Layer Mask');
    
    const mask: LayerMask = {
      enabled: true,
      linked: true,
      inverted: false,
      density: 100,
      feather: 0,
      data: this.createMaskImageData(
        layer.size.width,
        layer.size.height,
        maskType === 'hideAll' ? 0 : 255
      ),
      vectorMask: null
    };
    
    layer.mask = mask;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  removeLayerMask(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer || !layer.mask) return false;
    
    this.saveHistory('Remove Layer Mask');
    layer.mask = null;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 66: CLIPPING MASK
  // =============================================================================
  
  setClippingMask(id: string, clipping: boolean): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    this.saveHistory('Set Clipping Mask');
    layer.clippingMask = clipping;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 67: LAYER EFFECTS
  // =============================================================================
  
  addLayerEffect(id: string, effectType: LayerEffectType): string | null {
    const layer = this.layers.get(id);
    if (!layer) return null;
    
    this.saveHistory('Add Layer Effect');
    
    const effect: LayerEffect = {
      id: generateId(),
      type: effectType,
      enabled: true,
      settings: this.getDefaultEffectSettings(effectType)
    };
    
    layer.effects.push(effect);
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return effect.id;
  }
  
  updateLayerEffect(layerId: string, effectId: string, settings: Partial<LayerEffectSettings>): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    
    const effect = layer.effects.find(e => e.id === effectId);
    if (!effect) return false;
    
    this.saveHistory('Update Layer Effect');
    effect.settings = { ...effect.settings, ...settings };
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  removeLayerEffect(layerId: string, effectId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;
    
    const index = layer.effects.findIndex(e => e.id === effectId);
    if (index === -1) return false;
    
    this.saveHistory('Remove Layer Effect');
    layer.effects.splice(index, 1);
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 68: SMART OBJECTS
  // =============================================================================
  
  convertToSmartObject(id: string): boolean {
    const layer = this.layers.get(id) as ImageLayer;
    if (!layer || layer.type !== 'image') return false;
    
    this.saveHistory('Convert to Smart Object');
    
    layer.smartObject = {
      sourceType: 'embedded',
      originalSize: { ...layer.size },
      transforms: [],
      filters: []
    };
    
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  rasterizeSmartObject(id: string): boolean {
    const layer = this.layers.get(id) as ImageLayer;
    if (!layer || layer.type !== 'image' || !layer.smartObject) return false;
    
    this.saveHistory('Rasterize Smart Object');
    
    // Apply transforms and filters to imageData
    // (Implementation would apply all smart transforms)
    
    layer.smartObject = null;
    layer.metadata.modified = Date.now();
    
    this.notifyChange();
    return true;
  }
  
  // =============================================================================
  // ITEM 69: ADJUSTMENT LAYERS
  // =============================================================================
  
  createAdjustmentLayer(type: AdjustmentType, settings?: Partial<AdjustmentSettings>): string {
    const adjustmentLayer: AdjustmentLayer = {
      id: generateId(),
      name: this.getAdjustmentLayerName(type),
      type: 'adjustment',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: false,
      parentId: null,
      zIndex: 0,
      thumbnail: null,
      adjustment: {
        adjustmentType: type,
        settings: { ...this.getDefaultAdjustmentSettings(type), ...settings }
      },
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    return this.addLayer(adjustmentLayer);
  }
  
  // =============================================================================
  // ITEM 70: FILL LAYERS
  // =============================================================================
  
  createFillLayer(fillType: 'solid' | 'gradient' | 'pattern', fillData: Partial<FillData>): string {
    const fillLayer: FillLayer = {
      id: generateId(),
      name: `${fillType.charAt(0).toUpperCase() + fillType.slice(1)} Fill`,
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: false,
      parentId: null,
      zIndex: 0,
      thumbnail: null,
      fill: {
        fillType,
        ...fillData
      },
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    return this.addLayer(fillLayer);
  }
  
  // =============================================================================
  // ITEM 71: TEXT LAYERS
  // =============================================================================
  
  createTextLayer(text: string, x: number, y: number, fontSettings?: Partial<FontSettings>): string {
    const textLayer: TextLayer = {
      id: generateId(),
      name: text.substring(0, 20) || 'Text',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x, y },
      size: { width: 0, height: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: false,
      parentId: null,
      zIndex: 0,
      thumbnail: null,
      text: {
        text,
        font: {
          family: 'Inter',
          style: 'normal',
          weight: 400,
          size: 24,
          color: '#000000',
          letterSpacing: 0,
          lineHeight: 1.2,
          kerning: 'auto',
          baseline: 'auto',
          underline: false,
          strikethrough: false,
          smallCaps: false,
          allCaps: false,
          ...fontSettings
        },
        paragraph: {
          alignment: 'left',
          indent: { first: 0, left: 0, right: 0 },
          spacing: { before: 0, after: 0 },
          hyphenation: false
        },
        bounds: 'point'
      },
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    return this.addLayer(textLayer);
  }
  
  // =============================================================================
  // ITEM 72: SHAPE LAYERS
  // =============================================================================
  
  createShapeLayer(
    shapeType: ShapeType,
    bounds: { x: number; y: number; width: number; height: number },
    fill?: Partial<ShapeFill>,
    stroke?: Partial<ShapeStroke>
  ): string {
    const shapeLayer: ShapeLayer = {
      id: generateId(),
      name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      type: 'shape',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      position: { x: bounds.x, y: bounds.y },
      size: { width: bounds.width, height: bounds.height },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      mask: null,
      clippingMask: false,
      effects: [],
      selected: true,
      expanded: false,
      parentId: null,
      zIndex: 0,
      thumbnail: null,
      shape: {
        shapeType,
        fill: {
          type: 'solid',
          color: '#000000',
          ...fill
        },
        stroke: {
          enabled: false,
          color: '#000000',
          width: 1,
          alignment: 'center',
          lineCap: 'round',
          lineJoin: 'round',
          miterLimit: 10,
          dashArray: [],
          dashOffset: 0,
          ...stroke
        },
        path: this.createShapePath(shapeType, bounds),
        shapeSettings: {}
      },
      metadata: {
        created: Date.now(),
        modified: Date.now()
      }
    };
    
    return this.addLayer(shapeLayer);
  }
  
  // =============================================================================
  // ITEM 73: LAYER SELECTION
  // =============================================================================
  
  selectLayer(id: string, addToSelection: boolean = false): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    if (!addToSelection) {
      // Deselect all
      for (const [, l] of this.layers) {
        l.selected = false;
      }
      this.selectedIds.clear();
    }
    
    layer.selected = true;
    this.selectedIds.add(id);
    this.activeLayerId = id;
    
    this.onSelectionChange?.(Array.from(this.selectedIds));
    return true;
  }
  
  deselectLayer(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    
    layer.selected = false;
    this.selectedIds.delete(id);
    
    if (this.activeLayerId === id) {
      this.activeLayerId = this.selectedIds.size > 0 
        ? Array.from(this.selectedIds)[0] 
        : null;
    }
    
    this.onSelectionChange?.(Array.from(this.selectedIds));
    return true;
  }
  
  selectAllLayers(): void {
    for (const [id, layer] of this.layers) {
      layer.selected = true;
      this.selectedIds.add(id);
    }
    this.onSelectionChange?.(Array.from(this.selectedIds));
  }
  
  deselectAllLayers(): void {
    for (const [, layer] of this.layers) {
      layer.selected = false;
    }
    this.selectedIds.clear();
    this.activeLayerId = null;
    this.onSelectionChange?.([]);
  }
  
  // =============================================================================
  // ITEM 74: COPY/PASTE LAYERS
  // =============================================================================
  
  copyLayers(ids?: string[]): void {
    const toCopy = ids || Array.from(this.selectedIds);
    this.clipboard = toCopy
      .map(id => this.layers.get(id))
      .filter((l): l is Layer => l !== undefined)
      .map(l => this.deepCloneLayer(l));
  }
  
  pasteLayers(): string[] {
    if (this.clipboard.length === 0) return [];
    
    this.saveHistory('Paste Layers');
    
    const pastedIds: string[] = [];
    
    for (const layer of this.clipboard) {
      const clone = this.deepCloneLayer(layer);
      clone.id = generateId();
      clone.name = `${layer.name} copy`;
      clone.position.x += 10;
      clone.position.y += 10;
      clone.selected = true;
      
      this.layers.set(clone.id, clone);
      this.layerOrder.push(clone.id);
      pastedIds.push(clone.id);
    }
    
    // Update selection
    this.deselectAllLayers();
    for (const id of pastedIds) {
      this.selectedIds.add(id);
      const layer = this.layers.get(id);
      if (layer) layer.selected = true;
    }
    this.activeLayerId = pastedIds[0];
    
    this.updateZIndices();
    this.notifyChange();
    
    return pastedIds;
  }
  
  cutLayers(ids?: string[]): void {
    const toCut = ids || Array.from(this.selectedIds);
    this.copyLayers(toCut);
    
    this.saveHistory('Cut Layers');
    
    for (const id of toCut) {
      this.layers.delete(id);
      const idx = this.layerOrder.indexOf(id);
      if (idx !== -1) this.layerOrder.splice(idx, 1);
      this.selectedIds.delete(id);
    }
    
    this.activeLayerId = this.layerOrder[0] || null;
    this.updateZIndices();
    this.notifyChange();
  }
  
  // =============================================================================
  // ITEM 75: LAYER HISTORY (UNDO/REDO)
  // =============================================================================
  
  private saveHistory(actionName: string): void {
    // Remove future states
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // Save current state
    const state: LayerHistoryState = {
      actionName,
      timestamp: Date.now(),
      layers: new Map(),
      layerOrder: [...this.layerOrder],
      selectedIds: new Set(this.selectedIds),
      activeLayerId: this.activeLayerId
    };
    
    for (const [id, layer] of this.layers) {
      state.layers.set(id, this.deepCloneLayer(layer));
    }
    
    this.history.push(state);
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.historyIndex = this.history.length - 1;
  }
  
  undo(): boolean {
    if (this.historyIndex <= 0) return false;
    
    this.historyIndex--;
    this.restoreHistory(this.history[this.historyIndex]);
    
    return true;
  }
  
  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) return false;
    
    this.historyIndex++;
    this.restoreHistory(this.history[this.historyIndex]);
    
    return true;
  }
  
  private restoreHistory(state: LayerHistoryState): void {
    this.layers = new Map();
    for (const [id, layer] of state.layers) {
      this.layers.set(id, this.deepCloneLayer(layer));
    }
    
    this.layerOrder = [...state.layerOrder];
    this.selectedIds = new Set(state.selectedIds);
    this.activeLayerId = state.activeLayerId;
    
    this.notifyChange();
    this.onSelectionChange?.(Array.from(this.selectedIds));
  }
  
  getHistoryList(): { name: string; timestamp: number; current: boolean }[] {
    return this.history.map((state, index) => ({
      name: state.actionName,
      timestamp: state.timestamp,
      current: index === this.historyIndex
    }));
  }
  
  // =============================================================================
  // HELPER METHODS
  // =============================================================================
  
  getLayer(id: string): Layer | undefined {
    return this.layers.get(id);
  }
  
  getAllLayers(): Layer[] {
    return this.layerOrder.map(id => this.layers.get(id)!).filter(l => l !== undefined);
  }
  
  getVisibleLayers(): Layer[] {
    return this.getAllLayers().filter(l => l.visible);
  }
  
  getSelectedLayers(): Layer[] {
    return Array.from(this.selectedIds)
      .map(id => this.layers.get(id))
      .filter((l): l is Layer => l !== undefined);
  }
  
  getActiveLayer(): Layer | null {
    return this.activeLayerId ? this.layers.get(this.activeLayerId) || null : null;
  }
  
  private updateZIndices(): void {
    this.layerOrder.forEach((id, index) => {
      const layer = this.layers.get(id);
      if (layer) {
        layer.zIndex = index;
      }
    });
  }
  
  private notifyChange(): void {
    this.onLayerChange?.(this.getAllLayers());
  }
  
  private deepCloneLayer(layer: Layer): Layer {
    return JSON.parse(JSON.stringify(layer));
  }
  
  private calculateLayersBounds(layers: Layer[]): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const layer of layers) {
      minX = Math.min(minX, layer.position.x);
      minY = Math.min(minY, layer.position.y);
      maxX = Math.max(maxX, layer.position.x + layer.size.width);
      maxY = Math.max(maxY, layer.position.y + layer.size.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  private renderLayersToImageData(layers: Layer[], bounds: { x: number; y: number; width: number; height: number }): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext('2d')!;
    
    // Render layers from bottom to top
    for (const layer of layers.reverse()) {
      this.renderLayerToContext(ctx, layer, bounds);
    }
    
    return ctx.getImageData(0, 0, bounds.width, bounds.height);
  }
  
  private renderLayerToContext(ctx: CanvasRenderingContext2D, layer: Layer, bounds: { x: number; y: number; width: number; height: number }): void {
    if (!layer.visible) return;
    
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = this.blendModeToComposite(layer.blendMode);
    
    const offsetX = layer.position.x - bounds.x;
    const offsetY = layer.position.y - bounds.y;
    
    ctx.translate(offsetX + layer.size.width * layer.anchor.x, offsetY + layer.size.height * layer.anchor.y);
    ctx.rotate(layer.rotation * Math.PI / 180);
    ctx.scale(layer.scale.x, layer.scale.y);
    ctx.translate(-layer.size.width * layer.anchor.x, -layer.size.height * layer.anchor.y);
    
    if (layer.type === 'image' && (layer as ImageLayer).imageData) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = layer.size.width;
      tempCanvas.height = layer.size.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.putImageData((layer as ImageLayer).imageData!, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    }
    
    ctx.restore();
  }
  
  private blendModeToComposite(blendMode: LayerBlendMode): GlobalCompositeOperation {
    const map: Record<LayerBlendMode, GlobalCompositeOperation> = {
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
      'linearDodge': 'color-dodge',
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
    
    return map[blendMode] || 'source-over';
  }
  
  private createMaskImageData(width: number, height: number, fillValue: number): ImageData {
    const imageData = new ImageData(width || 1, height || 1);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fillValue;
      data[i + 1] = fillValue;
      data[i + 2] = fillValue;
      data[i + 3] = 255;
    }
    
    return imageData;
  }
  
  private getDefaultEffectSettings(type: LayerEffectType): LayerEffectSettings {
    const defaults: Record<LayerEffectType, LayerEffectSettings> = {
      'dropShadow': {
        blendMode: 'multiply',
        color: '#000000',
        opacity: 75,
        angle: 120,
        distance: 5,
        spread: 0,
        size: 5,
        noise: 0
      },
      'innerShadow': {
        blendMode: 'multiply',
        color: '#000000',
        opacity: 75,
        angle: 120,
        distance: 5,
        spread: 0,
        size: 5,
        noise: 0
      },
      'outerGlow': {
        blendMode: 'screen',
        color: '#ffffff',
        opacity: 75,
        spread: 0,
        size: 10,
        noise: 0
      },
      'innerGlow': {
        blendMode: 'screen',
        color: '#ffffff',
        opacity: 75,
        spread: 0,
        size: 10,
        noise: 0
      },
      'bevelEmboss': {
        style: 'inner',
        technique: 'smooth',
        depth: 100,
        direction: 'up',
        size: 5,
        softness: 0,
        angle: 120,
        highlightMode: 'screen',
        highlightColor: '#ffffff',
        highlightOpacity: 75,
        shadowMode: 'multiply',
        shadowColor: '#000000',
        shadowOpacity: 75
      },
      'satin': {
        blendMode: 'multiply',
        color: '#000000',
        opacity: 50,
        angle: 19,
        distance: 11,
        size: 14
      },
      'colorOverlay': {
        blendMode: 'normal',
        color: '#000000',
        opacity: 100
      },
      'gradientOverlay': {
        blendMode: 'normal',
        opacity: 100,
        gradient: {
          type: 'linear',
          stops: [
            { position: 0, color: '#000000', opacity: 100 },
            { position: 1, color: '#ffffff', opacity: 100 }
          ],
          angle: 90,
          scale: 100,
          offset: { x: 0, y: 0 },
          reverse: false,
          dither: false
        }
      },
      'patternOverlay': {
        blendMode: 'normal',
        opacity: 100,
        scale: 100
      },
      'stroke': {
        size: 3,
        position: 'outside',
        blendMode: 'normal',
        opacity: 100,
        fillType: 'color',
        color: '#000000'
      }
    };
    
    return defaults[type] || {};
  }
  
  private getDefaultAdjustmentSettings(type: AdjustmentType): AdjustmentSettings {
    const defaults: Record<AdjustmentType, AdjustmentSettings> = {
      'brightness': { brightness: 0, contrast: 0 },
      'levels': { 
        inputLevels: { black: 0, gamma: 1, white: 255 },
        outputLevels: { black: 0, white: 255 },
        channel: 'rgb'
      },
      'curves': { curvePoints: [{ input: 0, output: 0 }, { input: 255, output: 255 }] },
      'exposure': { exposure: 0, offset: 0, gamma: 1 },
      'vibrance': { vibrance: 0, saturation: 0 },
      'hueSaturation': { hue: 0, saturation: 0, colorize: false },
      'colorBalance': {
        shadows: { cyan: 0, magenta: 0, yellow: 0 },
        midtones: { cyan: 0, magenta: 0, yellow: 0 },
        highlights: { cyan: 0, magenta: 0, yellow: 0 },
        preserveLuminosity: true
      },
      'blackWhite': {
        reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80,
        tint: { enabled: false, hue: 0, saturation: 0 }
      },
      'photoFilter': { filterColor: '#ec8a00', filterDensity: 25, preserveLuminance: true },
      'channelMixer': {
        outputChannel: 'red',
        redSource: 100, greenSource: 0, blueSource: 0, constant: 0,
        monochrome: false
      },
      'colorLookup': {},
      'invert': {},
      'posterize': { levels: 4 },
      'threshold': { threshold: 128 },
      'gradientMap': { gradientMapStops: [], dither: false, reverse: false },
      'selectiveColor': {}
    };
    
    return defaults[type] || {};
  }
  
  private getAdjustmentLayerName(type: AdjustmentType): string {
    const names: Record<AdjustmentType, string> = {
      'brightness': 'Brightness/Contrast',
      'levels': 'Levels',
      'curves': 'Curves',
      'exposure': 'Exposure',
      'vibrance': 'Vibrance',
      'hueSaturation': 'Hue/Saturation',
      'colorBalance': 'Color Balance',
      'blackWhite': 'Black & White',
      'photoFilter': 'Photo Filter',
      'channelMixer': 'Channel Mixer',
      'colorLookup': 'Color Lookup',
      'invert': 'Invert',
      'posterize': 'Posterize',
      'threshold': 'Threshold',
      'gradientMap': 'Gradient Map',
      'selectiveColor': 'Selective Color'
    };
    
    return names[type] || 'Adjustment';
  }
  
  private createShapePath(shapeType: ShapeType, bounds: { width: number; height: number }): VectorPath {
    const { width, height } = bounds;
    
    switch (shapeType) {
      case 'rectangle':
        return {
          id: generateId(),
          points: [
            { anchor: { x: 0, y: 0 }, handleIn: null, handleOut: null, cornerRadius: 0 },
            { anchor: { x: width, y: 0 }, handleIn: null, handleOut: null, cornerRadius: 0 },
            { anchor: { x: width, y: height }, handleIn: null, handleOut: null, cornerRadius: 0 },
            { anchor: { x: 0, y: height }, handleIn: null, handleOut: null, cornerRadius: 0 }
          ],
          closed: true,
          fillRule: 'nonzero'
        };
      
      case 'ellipse':
        const rx = width / 2;
        const ry = height / 2;
        const k = 0.5522847498; // Bezier approximation constant
        return {
          id: generateId(),
          points: [
            { 
              anchor: { x: rx, y: 0 }, 
              handleIn: { x: -rx * k, y: 0 }, 
              handleOut: { x: rx * k, y: 0 }, 
              cornerRadius: 0 
            },
            { 
              anchor: { x: width, y: ry }, 
              handleIn: { x: 0, y: -ry * k }, 
              handleOut: { x: 0, y: ry * k }, 
              cornerRadius: 0 
            },
            { 
              anchor: { x: rx, y: height }, 
              handleIn: { x: rx * k, y: 0 }, 
              handleOut: { x: -rx * k, y: 0 }, 
              cornerRadius: 0 
            },
            { 
              anchor: { x: 0, y: ry }, 
              handleIn: { x: 0, y: ry * k }, 
              handleOut: { x: 0, y: -ry * k }, 
              cornerRadius: 0 
            }
          ],
          closed: true,
          fillRule: 'nonzero'
        };
      
      default:
        return {
          id: generateId(),
          points: [],
          closed: true,
          fillRule: 'nonzero'
        };
    }
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface LayerHistoryState {
  actionName: string;
  timestamp: number;
  layers: Map<string, Layer>;
  layerOrder: string[];
  selectedIds: Set<string>;
  activeLayerId: string | null;
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { generateId };
export default LayerManager;
