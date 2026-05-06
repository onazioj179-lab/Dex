// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - AXL CAD Modeling Engine
// Professional 3D parametric modeling system
// Items 551-575 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface CADProject {
  id: string;
  name: string;
  created: number;
  modified: number;
  units: Units;
  parts: Part[];
  assemblies: Assembly[];
  drawings: Drawing[];
}

export interface Units {
  length: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  angle: 'deg' | 'rad';
  mass: 'g' | 'kg' | 'lb';
}

export interface Part {
  id: string;
  name: string;
  features: Feature[];
  sketches: Sketch[];
  parameters: Parameter[];
  material?: Material;
  appearance?: Appearance;
  boundingBox: BoundingBox;
}

export interface Assembly {
  id: string;
  name: string;
  components: AssemblyComponent[];
  constraints: AssemblyConstraint[];
}

export interface Drawing {
  id: string;
  name: string;
  sheets: DrawingSheet[];
}

export interface DrawingSheet {
  id: string;
  size: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Legal' | 'Tabloid';
  scale: number;
  views: DrawingView[];
  dimensions: DrawingDimension[];
  annotations: DrawingAnnotation[];
}

export interface DrawingView {
  id: string;
  type: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric' | 'section' | 'detail';
  position: Point2D;
  scale: number;
  partId: string;
  hiddenLines: boolean;
}

export interface DrawingDimension {
  id: string;
  type: 'linear' | 'angular' | 'radial' | 'diameter' | 'ordinate';
  references: string[];
  value: number;
  tolerance?: { upper: number; lower: number };
  position: Point2D;
}

export interface DrawingAnnotation {
  id: string;
  type: 'note' | 'leader' | 'symbol' | 'balloon';
  text: string;
  position: Point2D;
}

// =============================================================================
// GEOMETRY TYPES
// =============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Plane {
  origin: Point3D;
  normal: Vector3D;
  xAxis: Vector3D;
  yAxis: Vector3D;
}

export interface BoundingBox {
  min: Point3D;
  max: Point3D;
}

export interface Matrix4 {
  elements: number[]; // 16 elements
}

// =============================================================================
// SKETCH TYPES
// =============================================================================

export interface Sketch {
  id: string;
  name: string;
  plane: Plane;
  entities: SketchEntity[];
  constraints: SketchConstraint[];
  dimensions: SketchDimension[];
  fullyConstrained: boolean;
}

export type SketchEntity = 
  | SketchPoint
  | SketchLine
  | SketchArc
  | SketchCircle
  | SketchEllipse
  | SketchSpline
  | SketchRectangle
  | SketchPolygon
  | SketchSlot;

export interface SketchPoint {
  type: 'point';
  id: string;
  position: Point2D;
  construction: boolean;
}

export interface SketchLine {
  type: 'line';
  id: string;
  start: Point2D;
  end: Point2D;
  construction: boolean;
}

export interface SketchArc {
  type: 'arc';
  id: string;
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  construction: boolean;
}

export interface SketchCircle {
  type: 'circle';
  id: string;
  center: Point2D;
  radius: number;
  construction: boolean;
}

export interface SketchEllipse {
  type: 'ellipse';
  id: string;
  center: Point2D;
  majorRadius: number;
  minorRadius: number;
  rotation: number;
  construction: boolean;
}

export interface SketchSpline {
  type: 'spline';
  id: string;
  points: Point2D[];
  tangents?: { start?: Vector3D; end?: Vector3D };
  construction: boolean;
}

export interface SketchRectangle {
  type: 'rectangle';
  id: string;
  corner1: Point2D;
  corner2: Point2D;
  construction: boolean;
}

export interface SketchPolygon {
  type: 'polygon';
  id: string;
  center: Point2D;
  vertices: number;
  radius: number;
  inscribed: boolean;
  construction: boolean;
}

export interface SketchSlot {
  type: 'slot';
  id: string;
  center1: Point2D;
  center2: Point2D;
  width: number;
  construction: boolean;
}

// Sketch Constraints
export type SketchConstraint =
  | ConstraintCoincident
  | ConstraintHorizontal
  | ConstraintVertical
  | ConstraintParallel
  | ConstraintPerpendicular
  | ConstraintTangent
  | ConstraintEqual
  | ConstraintConcentric
  | ConstraintMidpoint
  | ConstraintSymmetric
  | ConstraintFix;

export interface ConstraintCoincident {
  type: 'coincident';
  id: string;
  entity1: string;
  entity2: string;
  point1?: 'start' | 'end' | 'center';
  point2?: 'start' | 'end' | 'center';
}

export interface ConstraintHorizontal {
  type: 'horizontal';
  id: string;
  entityId: string;
}

export interface ConstraintVertical {
  type: 'vertical';
  id: string;
  entityId: string;
}

export interface ConstraintParallel {
  type: 'parallel';
  id: string;
  entity1: string;
  entity2: string;
}

export interface ConstraintPerpendicular {
  type: 'perpendicular';
  id: string;
  entity1: string;
  entity2: string;
}

export interface ConstraintTangent {
  type: 'tangent';
  id: string;
  entity1: string;
  entity2: string;
}

export interface ConstraintEqual {
  type: 'equal';
  id: string;
  entity1: string;
  entity2: string;
}

export interface ConstraintConcentric {
  type: 'concentric';
  id: string;
  entity1: string;
  entity2: string;
}

export interface ConstraintMidpoint {
  type: 'midpoint';
  id: string;
  pointEntity: string;
  lineEntity: string;
}

export interface ConstraintSymmetric {
  type: 'symmetric';
  id: string;
  entity1: string;
  entity2: string;
  axisEntity: string;
}

export interface ConstraintFix {
  type: 'fix';
  id: string;
  entityId: string;
}

// Sketch Dimensions
export interface SketchDimension {
  id: string;
  type: 'linear' | 'angular' | 'radial' | 'diameter';
  entities: string[];
  value: number;
  driven: boolean;  // true = reference dimension, false = driving dimension
}

// =============================================================================
// FEATURE TYPES
// =============================================================================

export type Feature = 
  | FeatureExtrude
  | FeatureRevolve
  | FeatureSweep
  | FeatureLoft
  | FeatureFillet
  | FeatureChamfer
  | FeatureShell
  | FeatureDraft
  | FeatureHole
  | FeatureThread
  | FeaturePattern
  | FeatureMirror
  | FeatureCombine
  | FeatureSplit
  | FeatureMove
  | FeatureScale;

export interface FeatureExtrude {
  type: 'extrude';
  id: string;
  name: string;
  sketchId: string;
  profiles: string[];        // Profile/region IDs from sketch
  operation: 'new' | 'add' | 'cut' | 'intersect';
  
  // Extent
  direction1: {
    type: 'blind' | 'throughAll' | 'toSurface' | 'toBody' | 'symmetric';
    distance?: number;
    surfaceId?: string;
    bodyId?: string;
  };
  direction2?: {
    type: 'blind' | 'throughAll' | 'toSurface' | 'toBody';
    distance?: number;
    surfaceId?: string;
    bodyId?: string;
  };
  
  // Taper
  taperAngle?: number;
  
  // Result
  suppressed: boolean;
}

export interface FeatureRevolve {
  type: 'revolve';
  id: string;
  name: string;
  sketchId: string;
  profiles: string[];
  axisEntity: string;        // Line entity ID for axis
  operation: 'new' | 'add' | 'cut' | 'intersect';
  
  // Extent
  extent: {
    type: 'full' | 'angle' | 'toSurface';
    angle1?: number;
    angle2?: number;
    surfaceId?: string;
  };
  
  suppressed: boolean;
}

export interface FeatureSweep {
  type: 'sweep';
  id: string;
  name: string;
  profileSketchId: string;
  profiles: string[];
  pathSketchId: string;
  pathEntity: string;
  operation: 'new' | 'add' | 'cut' | 'intersect';
  
  // Options
  orientation: 'perpendicular' | 'parallel' | 'normal';
  twist?: number;
  scale?: number;
  
  suppressed: boolean;
}

export interface FeatureLoft {
  type: 'loft';
  id: string;
  name: string;
  sections: { sketchId: string; profiles: string[] }[];
  operation: 'new' | 'add' | 'cut' | 'intersect';
  
  // Guide curves
  guides?: { sketchId: string; entity: string }[];
  
  // Options
  closed: boolean;
  ruled: boolean;
  
  suppressed: boolean;
}

export interface FeatureFillet {
  type: 'fillet';
  id: string;
  name: string;
  edges: string[];
  radius: number;
  
  // Variable radius
  variableRadius?: { position: number; radius: number }[];
  
  // Options
  tangentPropagation: boolean;
  
  suppressed: boolean;
}

export interface FeatureChamfer {
  type: 'chamfer';
  id: string;
  name: string;
  edges: string[];
  
  // Type
  chamferType: 'equalDistance' | 'distance1Distance2' | 'distanceAngle';
  distance1: number;
  distance2?: number;
  angle?: number;
  
  suppressed: boolean;
}

export interface FeatureShell {
  type: 'shell';
  id: string;
  name: string;
  faces: string[];          // Faces to remove
  thickness: number;
  direction: 'inside' | 'outside' | 'both';
  
  suppressed: boolean;
}

export interface FeatureDraft {
  type: 'draft';
  id: string;
  name: string;
  faces: string[];
  neutralPlane: string;     // Face or plane ID
  angle: number;
  
  suppressed: boolean;
}

export interface FeatureHole {
  type: 'hole';
  id: string;
  name: string;
  positions: Point3D[];
  
  holeType: 'simple' | 'counterbore' | 'countersink' | 'tapped';
  diameter: number;
  depth: number | 'throughAll';
  
  // Counterbore
  cbDiameter?: number;
  cbDepth?: number;
  
  // Countersink
  csAngle?: number;
  csDiameter?: number;
  
  // Thread
  threadType?: string;
  threadSize?: string;
  
  suppressed: boolean;
}

export interface FeatureThread {
  type: 'thread';
  id: string;
  name: string;
  faces: string[];          // Cylindrical faces
  threadType: 'ISO' | 'UNC' | 'UNF' | 'Metric' | 'custom';
  size: string;
  pitch?: number;
  length: number | 'full';
  handed: 'right' | 'left';
  
  suppressed: boolean;
}

export interface FeaturePattern {
  type: 'pattern';
  id: string;
  name: string;
  features: string[];
  
  patternType: 'linear' | 'circular' | 'sketch';
  
  // Linear pattern
  direction1?: { axis: Vector3D; count: number; spacing: number };
  direction2?: { axis: Vector3D; count: number; spacing: number };
  
  // Circular pattern
  axis?: Vector3D;
  center?: Point3D;
  count?: number;
  angle?: number;
  
  // Sketch pattern
  sketchId?: string;
  
  suppressed: boolean;
}

export interface FeatureMirror {
  type: 'mirror';
  id: string;
  name: string;
  features: string[];
  mirrorPlane: string;      // Face or plane ID
  
  suppressed: boolean;
}

export interface FeatureCombine {
  type: 'combine';
  id: string;
  name: string;
  targetBody: string;
  toolBodies: string[];
  operation: 'add' | 'cut' | 'intersect';
  keepTools: boolean;
  
  suppressed: boolean;
}

export interface FeatureSplit {
  type: 'split';
  id: string;
  name: string;
  bodyToSplit: string;
  splitTool: string;        // Face, plane, or sketch
  
  suppressed: boolean;
}

export interface FeatureMove {
  type: 'move';
  id: string;
  name: string;
  bodies: string[];
  transform: Matrix4;
  
  suppressed: boolean;
}

export interface FeatureScale {
  type: 'scale';
  id: string;
  name: string;
  bodies: string[];
  scaleFactor: number | Point3D;
  scalePoint: Point3D;
  
  suppressed: boolean;
}

// =============================================================================
// MATERIALS & APPEARANCE
// =============================================================================

export interface Material {
  id: string;
  name: string;
  category: string;
  
  // Physical properties
  density: number;          // kg/m³
  youngsModulus: number;    // Pa
  poissonsRatio: number;
  yieldStrength: number;    // Pa
  tensileStrength: number;  // Pa
  thermalConductivity: number;
  specificHeat: number;
  thermalExpansion: number;
}

export interface Appearance {
  id: string;
  name: string;
  
  // Color
  baseColor: string;
  metallic: number;
  roughness: number;
  
  // Maps
  diffuseMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  
  // Opacity
  opacity: number;
  
  // Emission
  emissive: string;
  emissiveIntensity: number;
}

// Assembly Types
export interface AssemblyComponent {
  id: string;
  partId?: string;
  assemblyId?: string;     // For sub-assemblies
  name: string;
  transform: Matrix4;
  suppressed: boolean;
  flexible: boolean;       // For sub-assemblies
}

export type AssemblyConstraint =
  | ConstraintMate
  | ConstraintAlign
  | ConstraintInsert
  | ConstraintAngle
  | ConstraintTangentAssembly
  | ConstraintGear
  | ConstraintRack;

export interface ConstraintMate {
  type: 'mate';
  id: string;
  component1: string;
  face1: string;
  component2: string;
  face2: string;
  offset: number;
  flip: boolean;
}

export interface ConstraintAlign {
  type: 'align';
  id: string;
  component1: string;
  entity1: string;        // Axis, edge, or plane
  component2: string;
  entity2: string;
  offset: number;
}

export interface ConstraintInsert {
  type: 'insert';
  id: string;
  component1: string;
  face1: string;          // Cylindrical face
  component2: string;
  face2: string;
  offset: number;
}

export interface ConstraintAngle {
  type: 'angle';
  id: string;
  component1: string;
  face1: string;
  component2: string;
  face2: string;
  angle: number;
}

export interface ConstraintTangentAssembly {
  type: 'tangent';
  id: string;
  component1: string;
  face1: string;
  component2: string;
  face2: string;
}

export interface ConstraintGear {
  type: 'gear';
  id: string;
  component1: string;
  axis1: string;
  teeth1: number;
  component2: string;
  axis2: string;
  teeth2: number;
}

export interface ConstraintRack {
  type: 'rack';
  id: string;
  pinionComponent: string;
  pinionAxis: string;
  pinionPitchRadius: number;
  rackComponent: string;
  rackDirection: string;
}

// Parameters
export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit: string;
  expression?: string;
  comment?: string;
}

// =============================================================================
// ITEM 551-560: MODELING ENGINE
// =============================================================================

export class ModelingEngine {
  private parts: Map<string, Part> = new Map();
  private assemblies: Map<string, Assembly> = new Map();
  private materials: Map<string, Material> = new Map();
  private appearances: Map<string, Appearance> = new Map();
  
  constructor() {
    this.initializeDefaultMaterials();
    this.initializeDefaultAppearances();
  }
  
  private initializeDefaultMaterials(): void {
    const defaultMaterials: Material[] = [
      {
        id: 'steel-1045',
        name: 'Steel AISI 1045',
        category: 'Steel',
        density: 7850,
        youngsModulus: 200e9,
        poissonsRatio: 0.29,
        yieldStrength: 310e6,
        tensileStrength: 565e6,
        thermalConductivity: 49.8,
        specificHeat: 486,
        thermalExpansion: 11.5e-6
      },
      {
        id: 'aluminum-6061',
        name: 'Aluminum 6061-T6',
        category: 'Aluminum',
        density: 2700,
        youngsModulus: 68.9e9,
        poissonsRatio: 0.33,
        yieldStrength: 276e6,
        tensileStrength: 310e6,
        thermalConductivity: 167,
        specificHeat: 896,
        thermalExpansion: 23.6e-6
      },
      {
        id: 'abs-plastic',
        name: 'ABS Plastic',
        category: 'Plastic',
        density: 1050,
        youngsModulus: 2.3e9,
        poissonsRatio: 0.35,
        yieldStrength: 40e6,
        tensileStrength: 44e6,
        thermalConductivity: 0.17,
        specificHeat: 1400,
        thermalExpansion: 90e-6
      }
    ];
    
    for (const mat of defaultMaterials) {
      this.materials.set(mat.id, mat);
    }
  }
  
  private initializeDefaultAppearances(): void {
    const defaultAppearances: Appearance[] = [
      {
        id: 'chrome',
        name: 'Chrome',
        baseColor: '#c0c0c0',
        metallic: 1,
        roughness: 0.1,
        opacity: 1,
        emissive: '#000000',
        emissiveIntensity: 0
      },
      {
        id: 'matte-gray',
        name: 'Matte Gray',
        baseColor: '#808080',
        metallic: 0,
        roughness: 0.8,
        opacity: 1,
        emissive: '#000000',
        emissiveIntensity: 0
      },
      {
        id: 'red-plastic',
        name: 'Red Plastic',
        baseColor: '#cc0000',
        metallic: 0,
        roughness: 0.4,
        opacity: 1,
        emissive: '#000000',
        emissiveIntensity: 0
      }
    ];
    
    for (const app of defaultAppearances) {
      this.appearances.set(app.id, app);
    }
  }
  
  // =============================================================================
  // PART OPERATIONS
  // =============================================================================
  
  createPart(name: string): Part {
    const part: Part = {
      id: this.generateId(),
      name,
      features: [],
      sketches: [],
      parameters: [],
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      }
    };
    
    this.parts.set(part.id, part);
    return part;
  }
  
  deletePart(partId: string): void {
    this.parts.delete(partId);
  }
  
  getPart(partId: string): Part | undefined {
    return this.parts.get(partId);
  }
  
  // =============================================================================
  // ITEM 561-565: SKETCH OPERATIONS
  // =============================================================================
  
  createSketch(partId: string, plane: Plane, name?: string): Sketch {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const sketch: Sketch = {
      id: this.generateId(),
      name: name || `Sketch ${part.sketches.length + 1}`,
      plane,
      entities: [],
      constraints: [],
      dimensions: [],
      fullyConstrained: false
    };
    
    part.sketches.push(sketch);
    return sketch;
  }
  
  // Sketch entity creation
  addSketchPoint(sketch: Sketch, position: Point2D, construction = false): SketchPoint {
    const point: SketchPoint = {
      type: 'point',
      id: this.generateId(),
      position,
      construction
    };
    sketch.entities.push(point);
    return point;
  }
  
  addSketchLine(sketch: Sketch, start: Point2D, end: Point2D, construction = false): SketchLine {
    const line: SketchLine = {
      type: 'line',
      id: this.generateId(),
      start,
      end,
      construction
    };
    sketch.entities.push(line);
    return line;
  }
  
  addSketchCircle(sketch: Sketch, center: Point2D, radius: number, construction = false): SketchCircle {
    const circle: SketchCircle = {
      type: 'circle',
      id: this.generateId(),
      center,
      radius,
      construction
    };
    sketch.entities.push(circle);
    return circle;
  }
  
  addSketchArc(sketch: Sketch, center: Point2D, radius: number, startAngle: number, endAngle: number, construction = false): SketchArc {
    const arc: SketchArc = {
      type: 'arc',
      id: this.generateId(),
      center,
      radius,
      startAngle,
      endAngle,
      construction
    };
    sketch.entities.push(arc);
    return arc;
  }
  
  addSketchRectangle(sketch: Sketch, corner1: Point2D, corner2: Point2D, construction = false): SketchRectangle {
    const rect: SketchRectangle = {
      type: 'rectangle',
      id: this.generateId(),
      corner1,
      corner2,
      construction
    };
    sketch.entities.push(rect);
    return rect;
  }
  
  addSketchPolygon(sketch: Sketch, center: Point2D, vertices: number, radius: number, inscribed = true, construction = false): SketchPolygon {
    const polygon: SketchPolygon = {
      type: 'polygon',
      id: this.generateId(),
      center,
      vertices,
      radius,
      inscribed,
      construction
    };
    sketch.entities.push(polygon);
    return polygon;
  }
  
  addSketchSpline(sketch: Sketch, points: Point2D[], construction = false): SketchSpline {
    const spline: SketchSpline = {
      type: 'spline',
      id: this.generateId(),
      points,
      construction
    };
    sketch.entities.push(spline);
    return spline;
  }
  
  addSketchSlot(sketch: Sketch, center1: Point2D, center2: Point2D, width: number, construction = false): SketchSlot {
    const slot: SketchSlot = {
      type: 'slot',
      id: this.generateId(),
      center1,
      center2,
      width,
      construction
    };
    sketch.entities.push(slot);
    return slot;
  }
  
  // Sketch constraints
  addCoincidentConstraint(sketch: Sketch, entity1: string, entity2: string, point1?: 'start' | 'end' | 'center', point2?: 'start' | 'end' | 'center'): ConstraintCoincident {
    const constraint: ConstraintCoincident = {
      type: 'coincident',
      id: this.generateId(),
      entity1,
      entity2,
      point1,
      point2
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addHorizontalConstraint(sketch: Sketch, entityId: string): ConstraintHorizontal {
    const constraint: ConstraintHorizontal = {
      type: 'horizontal',
      id: this.generateId(),
      entityId
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addVerticalConstraint(sketch: Sketch, entityId: string): ConstraintVertical {
    const constraint: ConstraintVertical = {
      type: 'vertical',
      id: this.generateId(),
      entityId
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addParallelConstraint(sketch: Sketch, entity1: string, entity2: string): ConstraintParallel {
    const constraint: ConstraintParallel = {
      type: 'parallel',
      id: this.generateId(),
      entity1,
      entity2
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addPerpendicularConstraint(sketch: Sketch, entity1: string, entity2: string): ConstraintPerpendicular {
    const constraint: ConstraintPerpendicular = {
      type: 'perpendicular',
      id: this.generateId(),
      entity1,
      entity2
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addTangentConstraint(sketch: Sketch, entity1: string, entity2: string): ConstraintTangent {
    const constraint: ConstraintTangent = {
      type: 'tangent',
      id: this.generateId(),
      entity1,
      entity2
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  addEqualConstraint(sketch: Sketch, entity1: string, entity2: string): ConstraintEqual {
    const constraint: ConstraintEqual = {
      type: 'equal',
      id: this.generateId(),
      entity1,
      entity2
    };
    sketch.constraints.push(constraint);
    this.updateSketchConstraintStatus(sketch);
    return constraint;
  }
  
  // Sketch dimensions
  addLinearDimension(sketch: Sketch, entities: string[], value: number, driven = false): SketchDimension {
    const dim: SketchDimension = {
      id: this.generateId(),
      type: 'linear',
      entities,
      value,
      driven
    };
    sketch.dimensions.push(dim);
    this.updateSketchConstraintStatus(sketch);
    return dim;
  }
  
  addAngularDimension(sketch: Sketch, entities: string[], value: number, driven = false): SketchDimension {
    const dim: SketchDimension = {
      id: this.generateId(),
      type: 'angular',
      entities,
      value,
      driven
    };
    sketch.dimensions.push(dim);
    this.updateSketchConstraintStatus(sketch);
    return dim;
  }
  
  addRadialDimension(sketch: Sketch, entityId: string, value: number, driven = false): SketchDimension {
    const dim: SketchDimension = {
      id: this.generateId(),
      type: 'radial',
      entities: [entityId],
      value,
      driven
    };
    sketch.dimensions.push(dim);
    this.updateSketchConstraintStatus(sketch);
    return dim;
  }
  
  private updateSketchConstraintStatus(sketch: Sketch): void {
    // Simplified DOF calculation
    // Each entity has certain degrees of freedom
    // Each constraint removes some DOF
    // Sketch is fully constrained when DOF = 0
    
    let totalDOF = 0;
    
    for (const entity of sketch.entities) {
      switch (entity.type) {
        case 'point':
          totalDOF += 2;
          break;
        case 'line':
          totalDOF += 4; // 2 endpoints
          break;
        case 'circle':
          totalDOF += 3; // center + radius
          break;
        case 'arc':
          totalDOF += 5; // center + radius + 2 angles
          break;
        case 'rectangle':
          totalDOF += 4; // 2 corners
          break;
        default:
          totalDOF += 2;
      }
    }
    
    // Each constraint removes DOF
    totalDOF -= sketch.constraints.length;
    totalDOF -= sketch.dimensions.filter(d => !d.driven).length;
    
    sketch.fullyConstrained = totalDOF <= 0;
  }
  
  // =============================================================================
  // ITEM 566-575: FEATURE OPERATIONS
  // =============================================================================
  
  addExtrude(partId: string, options: {
    sketchId: string;
    profiles: string[];
    operation: 'new' | 'add' | 'cut' | 'intersect';
    distance: number;
    symmetric?: boolean;
    taperAngle?: number;
  }): FeatureExtrude {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureExtrude = {
      type: 'extrude',
      id: this.generateId(),
      name: `Extrude ${part.features.filter(f => f.type === 'extrude').length + 1}`,
      sketchId: options.sketchId,
      profiles: options.profiles,
      operation: options.operation,
      direction1: {
        type: options.symmetric ? 'symmetric' : 'blind',
        distance: options.distance
      },
      taperAngle: options.taperAngle,
      suppressed: false
    };
    
    part.features.push(feature);
    this.updatePartBoundingBox(part);
    return feature;
  }
  
  addRevolve(partId: string, options: {
    sketchId: string;
    profiles: string[];
    axisEntity: string;
    operation: 'new' | 'add' | 'cut' | 'intersect';
    angle?: number;
    full?: boolean;
  }): FeatureRevolve {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureRevolve = {
      type: 'revolve',
      id: this.generateId(),
      name: `Revolve ${part.features.filter(f => f.type === 'revolve').length + 1}`,
      sketchId: options.sketchId,
      profiles: options.profiles,
      axisEntity: options.axisEntity,
      operation: options.operation,
      extent: {
        type: options.full ? 'full' : 'angle',
        angle1: options.angle || 360
      },
      suppressed: false
    };
    
    part.features.push(feature);
    this.updatePartBoundingBox(part);
    return feature;
  }
  
  addFillet(partId: string, edges: string[], radius: number): FeatureFillet {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureFillet = {
      type: 'fillet',
      id: this.generateId(),
      name: `Fillet ${part.features.filter(f => f.type === 'fillet').length + 1}`,
      edges,
      radius,
      tangentPropagation: true,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addChamfer(partId: string, edges: string[], distance: number, angle?: number): FeatureChamfer {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureChamfer = {
      type: 'chamfer',
      id: this.generateId(),
      name: `Chamfer ${part.features.filter(f => f.type === 'chamfer').length + 1}`,
      edges,
      chamferType: angle ? 'distanceAngle' : 'equalDistance',
      distance1: distance,
      angle,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addShell(partId: string, faces: string[], thickness: number, direction: 'inside' | 'outside' | 'both' = 'inside'): FeatureShell {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureShell = {
      type: 'shell',
      id: this.generateId(),
      name: `Shell ${part.features.filter(f => f.type === 'shell').length + 1}`,
      faces,
      thickness,
      direction,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addHole(partId: string, options: {
    positions: Point3D[];
    holeType: 'simple' | 'counterbore' | 'countersink' | 'tapped';
    diameter: number;
    depth: number | 'throughAll';
    cbDiameter?: number;
    cbDepth?: number;
    csAngle?: number;
    csDiameter?: number;
    threadType?: string;
    threadSize?: string;
  }): FeatureHole {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureHole = {
      type: 'hole',
      id: this.generateId(),
      name: `Hole ${part.features.filter(f => f.type === 'hole').length + 1}`,
      ...options,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addLinearPattern(partId: string, features: string[], direction: Vector3D, count: number, spacing: number): FeaturePattern {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeaturePattern = {
      type: 'pattern',
      id: this.generateId(),
      name: `Linear Pattern ${part.features.filter(f => f.type === 'pattern').length + 1}`,
      features,
      patternType: 'linear',
      direction1: { axis: direction, count, spacing },
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addCircularPattern(partId: string, features: string[], axis: Vector3D, center: Point3D, count: number, angle?: number): FeaturePattern {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeaturePattern = {
      type: 'pattern',
      id: this.generateId(),
      name: `Circular Pattern ${part.features.filter(f => f.type === 'pattern').length + 1}`,
      features,
      patternType: 'circular',
      axis,
      center,
      count,
      angle: angle || 360,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  addMirror(partId: string, features: string[], mirrorPlane: string): FeatureMirror {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const feature: FeatureMirror = {
      type: 'mirror',
      id: this.generateId(),
      name: `Mirror ${part.features.filter(f => f.type === 'mirror').length + 1}`,
      features,
      mirrorPlane,
      suppressed: false
    };
    
    part.features.push(feature);
    return feature;
  }
  
  suppressFeature(partId: string, featureId: string, suppressed: boolean): void {
    const part = this.parts.get(partId);
    if (!part) return;
    
    const feature = part.features.find(f => f.id === featureId);
    if (feature) {
      feature.suppressed = suppressed;
      this.updatePartBoundingBox(part);
    }
  }
  
  reorderFeature(partId: string, featureId: string, newIndex: number): void {
    const part = this.parts.get(partId);
    if (!part) return;
    
    const currentIndex = part.features.findIndex(f => f.id === featureId);
    if (currentIndex === -1) return;
    
    const [feature] = part.features.splice(currentIndex, 1);
    part.features.splice(newIndex, 0, feature);
    this.updatePartBoundingBox(part);
  }
  
  private updatePartBoundingBox(part: Part): void {
    // Simplified bounding box update
    // In a real implementation, this would compute based on actual geometry
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (const feature of part.features) {
      if (feature.suppressed) continue;
      
      if (feature.type === 'extrude') {
        const distance = feature.direction1.distance || 0;
        maxZ = Math.max(maxZ, distance);
        minZ = Math.min(minZ, 0);
        
        // Estimate from sketch
        const sketch = part.sketches.find(s => s.id === feature.sketchId);
        if (sketch) {
          for (const entity of sketch.entities) {
            if (entity.type === 'rectangle') {
              minX = Math.min(minX, entity.corner1.x, entity.corner2.x);
              maxX = Math.max(maxX, entity.corner1.x, entity.corner2.x);
              minY = Math.min(minY, entity.corner1.y, entity.corner2.y);
              maxY = Math.max(maxY, entity.corner1.y, entity.corner2.y);
            } else if (entity.type === 'circle') {
              minX = Math.min(minX, entity.center.x - entity.radius);
              maxX = Math.max(maxX, entity.center.x + entity.radius);
              minY = Math.min(minY, entity.center.y - entity.radius);
              maxY = Math.max(maxY, entity.center.y + entity.radius);
            }
          }
        }
      }
    }
    
    if (minX === Infinity) {
      part.boundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      };
    } else {
      part.boundingBox = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ }
      };
    }
  }
  
  // =============================================================================
  // PARAMETER MANAGEMENT
  // =============================================================================
  
  addParameter(partId: string, name: string, value: number, unit: string, expression?: string): Parameter {
    const part = this.parts.get(partId);
    if (!part) throw new Error('Part not found');
    
    const param: Parameter = {
      id: this.generateId(),
      name,
      value,
      unit,
      expression
    };
    
    part.parameters.push(param);
    return param;
  }
  
  updateParameter(partId: string, parameterId: string, value: number): void {
    const part = this.parts.get(partId);
    if (!part) return;
    
    const param = part.parameters.find(p => p.id === parameterId);
    if (param) {
      param.value = value;
      // In a real implementation, this would trigger a model rebuild
      this.updatePartBoundingBox(part);
    }
  }
  
  evaluateExpression(partId: string, expression: string): number {
    const part = this.parts.get(partId);
    if (!part) return 0;
    
    // Simple expression evaluation
    // Replace parameter names with values
    let expr = expression;
    for (const param of part.parameters) {
      expr = expr.replace(new RegExp(`\\b${param.name}\\b`, 'g'), param.value.toString());
    }
    
    // Safe math evaluation (no dynamic code)
    try {
      // Very basic: only handle simple arithmetic
      const tokens = expr.match(/[\d.]+|[+\-*/()]/g) || [];
      let result = 0;
      let currentOp = '+';
      
      for (const token of tokens) {
        if (['+', '-', '*', '/'].includes(token)) {
          currentOp = token;
        } else if (!isNaN(parseFloat(token))) {
          const num = parseFloat(token);
          switch (currentOp) {
            case '+': result += num; break;
            case '-': result -= num; break;
            case '*': result *= num; break;
            case '/': result /= num; break;
          }
        }
      }
      
      return result;
    } catch {
      return 0;
    }
  }
  
  // =============================================================================
  // MATERIAL ASSIGNMENT
  // =============================================================================
  
  assignMaterial(partId: string, materialId: string): void {
    const part = this.parts.get(partId);
    const material = this.materials.get(materialId);
    
    if (part && material) {
      part.material = material;
    }
  }
  
  assignAppearance(partId: string, appearanceId: string): void {
    const part = this.parts.get(partId);
    const appearance = this.appearances.get(appearanceId);
    
    if (part && appearance) {
      part.appearance = appearance;
    }
  }
  
  // =============================================================================
  // UTILITIES
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Standard planes
  getXYPlane(): Plane {
    return {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 }
    };
  }
  
  getXZPlane(): Plane {
    return {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 0, z: 1 }
    };
  }
  
  getYZPlane(): Plane {
    return {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      xAxis: { x: 0, y: 1, z: 0 },
      yAxis: { x: 0, y: 0, z: 1 }
    };
  }
  
  // Getters
  getAllParts(): Part[] {
    return Array.from(this.parts.values());
  }
  
  getAllMaterials(): Material[] {
    return Array.from(this.materials.values());
  }
  
  getAllAppearances(): Appearance[] {
    return Array.from(this.appearances.values());
  }
}

// =============================================================================
// ITEMS 221-225: PARAMETRIC MODELING
// =============================================================================

export interface ParametricFeature {
  id: string;
  name: string;
  type: ParametricFeatureType;
  parameters: Record<string, ParameterValue>;
  dependencies: string[];
  expressions: Record<string, string>;
  suppressed: boolean;
}

export type ParametricFeatureType = 
  | 'sketch' | 'extrude' | 'revolve' | 'sweep' | 'loft'
  | 'fillet' | 'chamfer' | 'shell' | 'draft' | 'pattern'
  | 'mirror' | 'split' | 'combine' | 'hole' | 'thread';

export interface ParameterValue {
  value: number | string | boolean;
  unit?: string;
  min?: number;
  max?: number;
  expression?: string;
}

export interface FeatureTree {
  features: ParametricFeature[];
  globalParameters: Record<string, ParameterValue>;
}

export function createParametricFeature(type: ParametricFeatureType, params: Record<string, unknown>): ParametricFeature {
  return {
    id: `feat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)}1`,
    type,
    parameters: Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, { value: v as number | string | boolean }])
    ),
    dependencies: [],
    expressions: {},
    suppressed: false,
  };
}

export function evaluateExpression(expr: string, context: Record<string, number>): number {
  // Safe expression evaluator
  const sanitized = expr.replace(/[^0-9+\-*/().a-zA-Z_\s]/g, '');
  let result = sanitized;
  
  for (const [name, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
  }
  
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return ${result}`)() as number;
  } catch {
    return 0;
  }
}

// =============================================================================
// ITEMS 226-230: CONSTRAINT SYSTEM
// =============================================================================

export interface Constraint {
  id: string;
  type: ConstraintType;
  entities: string[];
  value?: number;
  driven: boolean;
  satisfied: boolean;
}

export type ConstraintType = 
  | 'fixed' | 'horizontal' | 'vertical' | 'coincident' | 'collinear'
  | 'parallel' | 'perpendicular' | 'tangent' | 'equal' | 'symmetric'
  | 'distance' | 'angle' | 'radius' | 'diameter' | 'midpoint';

export interface ConstraintSolver {
  constraints: Constraint[];
  tolerance: number;
  maxIterations: number;
}

export function createConstraint(type: ConstraintType, entities: string[], value?: number): Constraint {
  return {
    id: `const_${Date.now()}`,
    type,
    entities,
    value,
    driven: value !== undefined,
    satisfied: false,
  };
}

export function getConstraintDOF(type: ConstraintType): number {
  const dofMap: Record<ConstraintType, number> = {
    fixed: 2,
    horizontal: 1,
    vertical: 1,
    coincident: 2,
    collinear: 1,
    parallel: 1,
    perpendicular: 1,
    tangent: 1,
    equal: 1,
    symmetric: 1,
    distance: 1,
    angle: 1,
    radius: 1,
    diameter: 1,
    midpoint: 2,
  };
  return dofMap[type] || 0;
}

// =============================================================================
// ITEMS 231-235: 3D PRINTING TOOLS
// =============================================================================

export interface PrintSettings {
  printer: PrinterProfile;
  material: PrintMaterial;
  quality: PrintQuality;
  supports: SupportSettings;
  infill: InfillSettings;
}

export interface PrinterProfile {
  name: string;
  bedSize: { x: number; y: number; z: number };
  nozzleDiameter: number;
  heatedBed: boolean;
  enclosure: boolean;
}

export interface PrintMaterial {
  type: 'PLA' | 'ABS' | 'PETG' | 'TPU' | 'Nylon' | 'Resin';
  density: number;
  nozzleTemp: number;
  bedTemp: number;
  shrinkage: number;
}

export interface PrintQuality {
  layerHeight: number;
  wallThickness: number;
  topBottomLayers: number;
  printSpeed: number;
}

export interface SupportSettings {
  enabled: boolean;
  type: 'normal' | 'tree' | 'organic';
  angle: number;
  density: number;
}

export interface InfillSettings {
  pattern: 'grid' | 'lines' | 'triangles' | 'honeycomb' | 'gyroid';
  density: number;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  printer: { name: 'Generic FDM', bedSize: { x: 220, y: 220, z: 250 }, nozzleDiameter: 0.4, heatedBed: true, enclosure: false },
  material: { type: 'PLA', density: 1.24, nozzleTemp: 210, bedTemp: 60, shrinkage: 0.002 },
  quality: { layerHeight: 0.2, wallThickness: 1.2, topBottomLayers: 4, printSpeed: 50 },
  supports: { enabled: false, type: 'normal', angle: 45, density: 15 },
  infill: { pattern: 'grid', density: 20 },
};

export function estimatePrintTime(volume: number, settings: PrintSettings): number {
  const layerVolume = settings.printer.bedSize.x * settings.printer.bedSize.y * settings.quality.layerHeight;
  const layers = Math.ceil(volume / layerVolume);
  const timePerLayer = 60 / settings.quality.printSpeed; // minutes
  return layers * timePerLayer * 60; // seconds
}

export function estimateMaterialUsage(volume: number, settings: PrintSettings): number {
  const infillVolume = volume * (settings.infill.density / 100);
  const shellVolume = volume * 0.3; // Approximate
  return (infillVolume + shellVolume) * settings.material.density; // grams
}

// =============================================================================
// ITEMS 236-240: CAM TOOLPATHS
// =============================================================================

export interface ToolpathOperation {
  id: string;
  type: ToolpathType;
  tool: CuttingTool;
  geometry: string[]; // Feature IDs
  parameters: ToolpathParameters;
  toolpath?: ToolpathPoint[];
}

export type ToolpathType = 
  | 'facing' | 'pocket' | 'contour' | 'drilling' | 'boring'
  | 'threading' | 'engraving' | 'adaptive' | '3d-roughing' | '3d-finishing';

export interface CuttingTool {
  id: string;
  name: string;
  type: 'endmill' | 'ballnose' | 'chamfer' | 'drill' | 'tap' | 'facemill';
  diameter: number;
  fluteLength: number;
  overallLength: number;
  fluteCount: number;
  material: 'hss' | 'carbide' | 'coated-carbide' | 'ceramic';
}

export interface ToolpathParameters {
  stepover: number;
  stepdown: number;
  feedRate: number;
  plungeRate: number;
  spindleSpeed: number;
  coolant: 'off' | 'flood' | 'mist' | 'through-spindle';
  direction: 'climb' | 'conventional';
  retractHeight: number;
}

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedRate: number;
  spindleSpeed: number;
  type: 'rapid' | 'linear' | 'arc-cw' | 'arc-ccw';
}

export const DEFAULT_TOOLPATH_PARAMS: ToolpathParameters = {
  stepover: 50, // percent of tool diameter
  stepdown: 2,
  feedRate: 1000,
  plungeRate: 300,
  spindleSpeed: 10000,
  coolant: 'flood',
  direction: 'climb',
  retractHeight: 5,
};

export function estimateMachiningTime(toolpath: ToolpathPoint[]): number {
  let time = 0;
  
  for (let i = 1; i < toolpath.length; i++) {
    const prev = toolpath[i - 1];
    const curr = toolpath[i];
    
    const dist = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) +
      Math.pow(curr.y - prev.y, 2) +
      Math.pow(curr.z - prev.z, 2)
    );
    
    const feedRate = curr.type === 'rapid' ? 10000 : curr.feedRate;
    time += (dist / feedRate) * 60; // seconds
  }
  
  return time;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createModelingEngine = () => new ModelingEngine();

export default { 
  ModelingEngine, 
  createModelingEngine,
  // Parametric
  createParametricFeature,
  evaluateExpression,
  // Constraints
  createConstraint,
  getConstraintDOF,
  // 3D Printing
  DEFAULT_PRINT_SETTINGS,
  estimatePrintTime,
  estimateMaterialUsage,
  // CAM
  DEFAULT_TOOLPATH_PARAMS,
  estimateMachiningTime,
};
