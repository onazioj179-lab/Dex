// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Types -- Engineering Design Studio
// ═══════════════════════════════════════════════════════════════════════════

export type ToolMode = 'select' | 'move' | 'rotate' | 'scale' | 'measure' | 'dimension' | 'extrude' | 'revolve' | 'pen' | 'sketch' | 'constraint';
export type ViewMode = '3d' | 'front' | 'top' | 'right' | 'drawing';
export type PrimitiveType = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'tube' | 'wedge';
export type BooleanOp = 'union' | 'subtract' | 'intersect';
export type ConstraintType = 'mate' | 'align' | 'offset' | 'angle' | 'concentric' | 'fixed' | 'tangent' | 'distance' | 'coincident' | 'parallel' | 'perpendicular';
export type SimulationType = 'stress' | 'motion' | 'thermal' | 'modal' | 'buckling' | 'fatigue';

export interface Vec3 { x: number; y: number; z: number }
export interface Transform { position: Vec3; rotation: Vec3; scale: Vec3 }

export interface Material {
  id: string;
  name: string;
  color: string;
  density: number;       // kg/m³
  youngsModulus: number;  // GPa
  tensileStrength: number; // MPa
  thermalConductivity: number; // W/(m·K)
  yieldStrength?: number; // MPa
  thermalExpansion?: number; // 1/K
}

export interface PartFeature {
  id: string;
  type: 'primitive' | 'boolean' | 'extrude' | 'revolve' | 'chamfer' | 'fillet' | 'pattern' | 'mirror' | 'sketch';
  name: string;
  params: Record<string, number | string | boolean>;
  visible: boolean;
  locked: boolean;
  suppressed?: boolean;
  parentId?: string;
}

export interface Part {
  id: string;
  name: string;
  transform: Transform;
  material: Material;
  features: PartFeature[];
  meshVertexCount: number;
  visible: boolean;
  selected: boolean;
  color: string;
}

export interface Constraint {
  id: string;
  type: ConstraintType;
  partA: string;
  partB: string;
  faceA?: number;
  faceB?: number;
  value: number;
  satisfied: boolean;
  locked?: boolean;
}

export interface Assembly {
  id: string;
  name: string;
  parts: Part[];
  constraints: Constraint[];
  exploded: boolean;
  explodeDistance: number;
}

export interface Measurement {
  id: string;
  type: 'distance' | 'angle' | 'area' | 'volume';
  points: Vec3[];
  value: number;
  unit: string;
  label: string;
}

export interface GDTAnnotation {
  id: string;
  symbol: string;
  tolerance: string;
  datum: string;
  position: Vec3;
  attachedTo: string;
}

export interface BOMEntry {
  partNumber: number;
  name: string;
  quantity: number;
  material: string;
  weight: number;
  dimensions: string;
  description: string;
}

export interface DrawingView {
  id: string;
  type: 'front' | 'top' | 'right' | 'section' | 'isometric' | 'detail';
  position: { x: number; y: number };
  scale: number;
  visible: boolean;
  sectionPlane?: Vec3;
  sectionDirection?: Vec3;
  detailCenter?: { x: number; y: number };
  detailRadius?: number;
}

export interface DimensionLine {
  id: string;
  type: 'linear' | 'angular' | 'radial' | 'diameter' | 'ordinate';
  points: { x: number; y: number }[];
  value: number;
  tolerance?: { upper: number; lower: number };
  text?: string;
}

// Sketch types for parametric modeling
export interface SketchPoint { x: number; y: number; constrained?: boolean }

export interface SketchEntity {
  id: string;
  type: 'line' | 'arc' | 'circle' | 'rectangle' | 'spline';
  points: SketchPoint[];
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  controlPoints?: SketchPoint[]; // for splines
}

export interface SketchConstraint {
  id: string;
  type: 'horizontal' | 'vertical' | 'coincident' | 'tangent' | 'perpendicular' | 'equal' | 'fixed' | 'parallel';
  entityA: string;
  entityB?: string;
  pointIndexA?: number;
  pointIndexB?: number;
  satisfied: boolean;
}

export interface SketchDimension {
  id: string;
  type: 'linear' | 'angular' | 'radial';
  entityA: string;
  entityB?: string;
  value: number;
  driven: boolean; // driven = display only, driving = controls geometry
}

export interface Sketch {
  id: string;
  name: string;
  plane: { origin: Vec3; normal: Vec3 };
  entities: SketchEntity[];
  constraints: SketchConstraint[];
  dimensions: SketchDimension[];
  closed: boolean;
}

// Parameter table for parametric modeling
export interface Parameter {
  name: string;
  value: number;
  expression?: string; // e.g. "hole_diameter * 2"
  unit?: string;
}

export interface SimulationResult {
  maxStress: number;
  safetyFactor: number;
  stressMap: { partId: string; ratio: number }[];
  converged?: boolean;
  timestamp?: number;
  type?: SimulationType;
  // Real FE solver outputs (present when the stress study ran the truss FEA).
  maxDisplacement?: number;   // largest nodal displacement magnitude (model units)
  feaSolved?: boolean;        // true when produced by the direct-stiffness solver
  elementCount?: number;      // number of FE members solved
}

export interface AXLProject {
  name: string;
  units: 'mm' | 'in' | 'm';
  gridSnap: number;
  assembly: Assembly;
  measurements: Measurement[];
  annotations: GDTAnnotation[];
  bom: BOMEntry[];
  drawingViews: DrawingView[];
  dimensionLines: DimensionLine[];
  sketches: Sketch[];
  parameters: Parameter[];
  createdAt: number;
  modifiedAt: number;
  version: number;
}

// Camera state -- azimuth/elevation/distance used by 2D Canvas viewport,
// position/target/up/fov/near/far used by WebGL Renderer
export interface CameraState {
  azimuth?: number;
  elevation?: number;
  distance?: number;
  target?: Vec3;
  position?: Vec3;
  up?: Vec3;
  fov?: number;
  near?: number;
  far?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Modifier System (Blender-like non-destructive modeling)
// ═══════════════════════════════════════════════════════════════════════════

export type ModifierType = 
  | 'mirror'           // Mirror geometry across axis
  | 'array'            // Repeat geometry along axis
  | 'bevel'            // Bevel edges
  | 'solidify'         // Add thickness to surfaces
  | 'subdivision'      // Subdivide and smooth
  | 'boolean'          // Union/subtract/intersect with another part
  | 'decimate'         // Reduce polygon count
  | 'lattice'          // Deform with lattice cage
  | 'simpleDeform'     // Bend/twist/taper/stretch
  | 'shrinkwrap'       // Project onto target surface
  | 'weld'             // Merge close vertices
  | 'triangulate'      // Convert to triangles
  | 'wireframe'        // Convert to wireframe mesh
  | 'smooth'           // Smooth vertex positions
  | 'shell';           // Create hollow shell

export interface ModifierBase {
  id: string;
  type: ModifierType;
  name: string;
  enabled: boolean;
  showInViewport: boolean;
  showInRender: boolean;
  expanded: boolean;     // UI state for collapsed/expanded
}

export interface MirrorModifier extends ModifierBase {
  type: 'mirror';
  axis: { x: boolean; y: boolean; z: boolean };
  useBisect: boolean;
  bisectFlip: boolean;
  mergeThreshold: number;
  mirrorObject?: string; // part ID to mirror around
}

export interface ArrayModifier extends ModifierBase {
  type: 'array';
  fitType: 'fixed' | 'fitLength' | 'fitCurve';
  count: number;
  offset: Vec3;           // Relative offset
  constantOffset: Vec3;   // Constant offset in units
  useRelativeOffset: boolean;
  useConstantOffset: boolean;
  mergeVertices: boolean;
  mergeThreshold: number;
  capStart?: string;      // part ID for cap
  capEnd?: string;
}

export interface BevelModifier extends ModifierBase {
  type: 'bevel';
  amount: number;
  segments: number;
  limitMethod: 'none' | 'angle' | 'weight' | 'vertices';
  angleLimit: number;
  profile: number;        // 0-1, 0.5 = circular
  clamp: boolean;
  harden: boolean;
  miterOuter: 'sharp' | 'arc' | 'patch';
  miterInner: 'sharp' | 'arc';
}

export interface SolidifyModifier extends ModifierBase {
  type: 'solidify';
  thickness: number;
  offset: number;         // -1 to 1
  evenThickness: boolean;
  fillRim: boolean;
  rimOnly: boolean;
  qualityMode: 'simple' | 'complex';
}

export interface SubdivisionModifier extends ModifierBase {
  type: 'subdivision';
  levels: number;         // viewport
  renderLevels: number;
  qualityMode: 'catmull' | 'simple';
  useCreases: boolean;
  boundarySmooth: 'preserve' | 'smooth';
  uvSmooth: 'none' | 'preserve' | 'corners' | 'all';
}

export interface BooleanModifier extends ModifierBase {
  type: 'boolean';
  operation: BooleanOp;
  targetPart: string;     // part ID
  solver: 'fast' | 'exact';
  selfIntersection: boolean;
  overlap: number;
}

export interface DecimateModifier extends ModifierBase {
  type: 'decimate';
  mode: 'collapse' | 'unsubdiv' | 'dissolve';
  ratio: number;          // for collapse
  iterations: number;     // for unsubdiv
  angleLimit: number;     // for dissolve
  triangulate: boolean;
  symmetry: boolean;
}

export interface LatticeModifier extends ModifierBase {
  type: 'lattice';
  resolution: Vec3;
  deformPoints: Vec3[];   // flattened lattice control points
  strength: number;
}

export interface SimpleDeformModifier extends ModifierBase {
  type: 'simpleDeform';
  mode: 'twist' | 'bend' | 'taper' | 'stretch';
  angle: number;
  factor: number;
  axis: 'X' | 'Y' | 'Z';
  limits: { start: number; end: number };
  lockAxis: { x: boolean; y: boolean };
}

export interface SmoothModifier extends ModifierBase {
  type: 'smooth';
  factor: number;
  iterations: number;
  axis: { x: boolean; y: boolean; z: boolean };
}

export interface WireframeModifier extends ModifierBase {
  type: 'wireframe';
  thickness: number;
  offset: number;
  useBoundary: boolean;
  replaceOriginal: boolean;
}

export interface ShellModifier extends ModifierBase {
  type: 'shell';
  thickness: number;
  removeInnerFaces: boolean;
}

export type Modifier = 
  | MirrorModifier 
  | ArrayModifier 
  | BevelModifier 
  | SolidifyModifier 
  | SubdivisionModifier 
  | BooleanModifier 
  | DecimateModifier 
  | LatticeModifier 
  | SimpleDeformModifier 
  | SmoothModifier
  | WireframeModifier
  | ShellModifier;

// Add modifiers to Part
export interface PartWithModifiers extends Part {
  modifiers: Modifier[];
}
