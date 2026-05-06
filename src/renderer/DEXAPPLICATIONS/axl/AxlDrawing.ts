// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - AXL CAD Drawing Engine
// Professional 2D drafting and technical documentation
// Items 601-625 of the 1000-item improvement plan
// =============================================================================

import type { Part, Assembly, Point2D, Point3D, Vector3D, BoundingBox } from './AxlModeling';

// =============================================================================
// DRAWING TYPES
// =============================================================================

export interface DrawingDocument {
  id: string;
  name: string;
  sheets: DrawingSheet[];
  standards: DrawingStandards;
  created: number;
  modified: number;
}

export interface DrawingStandards {
  type: 'ISO' | 'ANSI' | 'DIN' | 'JIS' | 'GB' | 'custom';
  projectionType: 'firstAngle' | 'thirdAngle';
  units: 'mm' | 'in';
  precision: number;
  toleranceDisplay: 'limits' | 'deviation' | 'both';
}

export interface DrawingSheet {
  id: string;
  number: number;
  size: SheetSize;
  orientation: 'portrait' | 'landscape';
  scale: number;
  titleBlock: TitleBlock;
  border: Border;
  views: DrawingView[];
  dimensions: Dimension[];
  annotations: Annotation[];
  tables: Table[];
  geometricTolerances: GeometricTolerance[];
  surfaceFinishes: SurfaceFinish[];
  weldSymbols: WeldSymbol[];
}

export type SheetSize = 
  | 'A0' | 'A1' | 'A2' | 'A3' | 'A4'
  | 'ANSI_A' | 'ANSI_B' | 'ANSI_C' | 'ANSI_D' | 'ANSI_E'
  | 'custom';

export interface SheetDimensions {
  width: number;
  height: number;
}

export const SHEET_SIZES: Record<SheetSize, SheetDimensions> = {
  'A0': { width: 1189, height: 841 },
  'A1': { width: 841, height: 594 },
  'A2': { width: 594, height: 420 },
  'A3': { width: 420, height: 297 },
  'A4': { width: 297, height: 210 },
  'ANSI_A': { width: 279.4, height: 215.9 },
  'ANSI_B': { width: 431.8, height: 279.4 },
  'ANSI_C': { width: 558.8, height: 431.8 },
  'ANSI_D': { width: 863.6, height: 558.8 },
  'ANSI_E': { width: 1117.6, height: 863.6 },
  'custom': { width: 420, height: 297 }
};

// =============================================================================
// TITLE BLOCK & BORDER
// =============================================================================

export interface TitleBlock {
  template: 'ISO' | 'ANSI' | 'DIN' | 'custom';
  position: Point2D;
  width: number;
  height: number;
  fields: TitleBlockField[];
}

export interface TitleBlockField {
  id: string;
  name: string;
  value: string;
  position: Point2D;
  width: number;
  height: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  editable: boolean;
}

export interface Border {
  visible: boolean;
  margin: number;
  lineWeight: number;
  zones: boolean;
  zoneColumns: number;
  zoneRows: number;
}

// =============================================================================
// VIEWS
// =============================================================================

export interface DrawingView {
  id: string;
  name: string;
  type: ViewType;
  sourceId: string;           // Part or Assembly ID
  position: Point2D;          // Center position on sheet
  scale: number;
  rotation: number;
  
  // Projection
  viewDirection: Vector3D;
  upDirection: Vector3D;
  
  // Display
  displayStyle: DisplayStyle;
  hiddenLines: boolean;
  tangentEdges: 'visible' | 'phantom' | 'hidden';
  threads: boolean;
  centerMarks: boolean;
  centerLines: boolean;
  
  // View-specific
  parentViewId?: string;      // For projected/auxiliary views
  sectionData?: SectionData;
  detailData?: DetailData;
  breakData?: BreakData;
  
  // Computed
  boundingBox: BoundingBox2D;
  edges: Edge2D[];
}

export type ViewType = 
  | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
  | 'isometric' | 'dimetric' | 'trimetric'
  | 'section' | 'detail' | 'auxiliary' | 'projected'
  | 'broken' | 'partial';

export interface DisplayStyle {
  lineStyle: 'visible' | 'hidden' | 'center' | 'phantom' | 'cutting';
  lineWeight: number;
  color: string;
  shaded: boolean;
  edgesOnly: boolean;
}

export interface SectionData {
  cuttingPlane: {
    start: Point2D;
    end: Point2D;
    offset?: Point2D[];     // For offset sections
  };
  label: string;
  arrows: boolean;
  hatchPattern: HatchPattern;
  depth: 'full' | 'half' | 'partial';
  aligned: boolean;
  excludedComponents?: string[];
}

export interface HatchPattern {
  type: 'lines' | 'cross' | 'dots' | 'solid' | 'custom';
  angle: number;
  spacing: number;
  color: string;
  material?: string;        // Auto-hatch based on material
}

export interface DetailData {
  sourceViewId: string;
  boundary: CircleBoundary | RectangleBoundary;
  label: string;
  scaleFactor: number;
}

export interface CircleBoundary {
  type: 'circle';
  center: Point2D;
  radius: number;
}

export interface RectangleBoundary {
  type: 'rectangle';
  corner1: Point2D;
  corner2: Point2D;
}

export interface BreakData {
  type: 'straight' | 'zigzag' | 'cylindrical';
  breaks: BreakLine[];
}

export interface BreakLine {
  position: number;
  length: number;
}

export interface BoundingBox2D {
  min: Point2D;
  max: Point2D;
}

export interface Edge2D {
  type: 'line' | 'arc' | 'circle' | 'ellipse' | 'spline';
  visible: boolean;
  style: 'visible' | 'hidden' | 'center' | 'phantom';
  points: Point2D[];
  sourceEdgeId?: string;
}

// =============================================================================
// ITEM 601-610: DIMENSIONS
// =============================================================================

export type Dimension = 
  | LinearDimension
  | AlignedDimension
  | AngularDimension
  | RadialDimension
  | DiameterDimension
  | OrdinateDimension
  | ArcLengthDimension
  | ChainDimension
  | BaselineDimension;

export interface DimensionBase {
  id: string;
  viewId: string;
  value: number;
  tolerance?: Tolerance;
  prefix?: string;
  suffix?: string;
  overrideText?: string;
  style: DimensionStyle;
  position: Point2D;
  visible: boolean;
  inspectionDimension: boolean;
}

export interface LinearDimension extends DimensionBase {
  type: 'linear';
  direction: 'horizontal' | 'vertical' | 'rotated';
  point1: Point2D;
  point2: Point2D;
  angle?: number;           // For rotated
}

export interface AlignedDimension extends DimensionBase {
  type: 'aligned';
  point1: Point2D;
  point2: Point2D;
}

export interface AngularDimension extends DimensionBase {
  type: 'angular';
  vertex: Point2D;
  point1: Point2D;
  point2: Point2D;
  arcPosition: Point2D;
}

export interface RadialDimension extends DimensionBase {
  type: 'radial';
  center: Point2D;
  pointOnArc: Point2D;
  bent: boolean;
  bentAngle?: number;
}

export interface DiameterDimension extends DimensionBase {
  type: 'diameter';
  center: Point2D;
  pointOnCircle: Point2D;
  leaderPosition?: Point2D;
  foreshortened: boolean;
}

export interface OrdinateDimension extends DimensionBase {
  type: 'ordinate';
  origin: Point2D;
  point: Point2D;
  direction: 'x' | 'y';
  jogPosition?: Point2D;
}

export interface ArcLengthDimension extends DimensionBase {
  type: 'arcLength';
  center: Point2D;
  startAngle: number;
  endAngle: number;
  radius: number;
}

export interface ChainDimension extends DimensionBase {
  type: 'chain';
  points: Point2D[];
  direction: 'horizontal' | 'vertical' | 'aligned';
}

export interface BaselineDimension extends DimensionBase {
  type: 'baseline';
  basePoint: Point2D;
  points: Point2D[];
  direction: 'horizontal' | 'vertical';
  spacing: number;
}

// Tolerance
export interface Tolerance {
  type: 'symmetric' | 'deviation' | 'limits' | 'basic' | 'reference';
  upper?: number;
  lower?: number;
  fitType?: FitType;
}

export interface FitType {
  holeClass: string;        // e.g., 'H7'
  shaftClass: string;       // e.g., 'g6'
}

// Dimension Style
export interface DimensionStyle {
  textHeight: number;
  textFont: string;
  arrowStyle: 'filled' | 'open' | 'dot' | 'tick' | 'integral';
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;
  dimensionLineGap: number;
  textPosition: 'above' | 'center' | 'outside';
  textAlignment: 'aligned' | 'horizontal';
  unitFormat: 'decimal' | 'fractional' | 'architectural';
  precision: number;
  trailingZeros: boolean;
  dualDimension: boolean;
  dualUnits?: 'mm' | 'in';
  dualPrecision?: number;
}

// =============================================================================
// ITEM 611-615: ANNOTATIONS
// =============================================================================

export type Annotation =
  | Note
  | Leader
  | Balloon
  | Symbol
  | DatumFeature
  | DatumTarget
  | Flag;

export interface Note {
  type: 'note';
  id: string;
  text: string;
  position: Point2D;
  width?: number;           // For text wrapping
  style: TextStyle;
  border: 'none' | 'rectangle' | 'circle' | 'diamond';
}

export interface Leader {
  type: 'leader';
  id: string;
  text: string;
  points: Point2D[];        // Leader path
  arrowType: 'filled' | 'open' | 'dot' | 'none';
  terminatorSide: 'left' | 'right';
  style: TextStyle;
  attachmentType: 'edge' | 'face' | 'vertex';
  attachmentId?: string;
}

export interface Balloon {
  type: 'balloon';
  id: string;
  itemNumber: string;
  position: Point2D;
  leaderPoints: Point2D[];
  shape: 'circle' | 'triangle' | 'hexagon' | 'square' | 'diamond' | 'split';
  size: number;
  quantity?: number;
}

export interface Symbol {
  type: 'symbol';
  id: string;
  symbolType: SymbolType;
  position: Point2D;
  rotation: number;
  scale: number;
  parameters?: Record<string, unknown>;
}

export type SymbolType = 
  | 'centerMark' | 'centerLine' | 'revisionCloud'
  | 'dowelPin' | 'counterbore' | 'countersink' | 'depth'
  | 'diameterSymbol' | 'radiusSymbol' | 'squareSymbol'
  | 'arcLength' | 'slope' | 'conical';

export interface DatumFeature {
  type: 'datumFeature';
  id: string;
  letter: string;           // A, B, C, etc.
  position: Point2D;
  attachmentType: 'edge' | 'face' | 'centerLine';
  attachmentId: string;
  triangleDirection: 'left' | 'right' | 'up' | 'down';
}

export interface DatumTarget {
  type: 'datumTarget';
  id: string;
  datumLetter: string;
  targetNumber: number;
  position: Point2D;
  targetType: 'point' | 'line' | 'area';
  size?: number;            // For area targets
}

export interface Flag {
  type: 'flag';
  id: string;
  text: string;
  position: Point2D;
  shape: 'triangle' | 'rectangle' | 'pentagon';
  style: TextStyle;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  alignment: 'left' | 'center' | 'right';
  lineSpacing: number;
}

// =============================================================================
// ITEM 616-620: GD&T (GEOMETRIC DIMENSIONING & TOLERANCING)
// =============================================================================

export interface GeometricTolerance {
  id: string;
  viewId: string;
  position: Point2D;
  leader?: Point2D[];
  frames: ToleranceFrame[];
  compositeFrame: boolean;
}

export interface ToleranceFrame {
  symbol: GDTSymbol;
  tolerance1: ToleranceValue;
  tolerance2?: ToleranceValue;
  datumReferences: DatumReference[];
}

export type GDTSymbol =
  // Form
  | 'straightness' | 'flatness' | 'circularity' | 'cylindricity'
  // Orientation
  | 'perpendicularity' | 'angularity' | 'parallelism'
  // Location
  | 'position' | 'concentricity' | 'symmetry'
  // Runout
  | 'circularRunout' | 'totalRunout'
  // Profile
  | 'profileOfLine' | 'profileOfSurface';

export interface ToleranceValue {
  value: number;
  modifier?: ToleranceModifier;
}

export type ToleranceModifier = 'M' | 'L' | 'S' | 'P' | 'F' | 'T' | 'U';

export interface DatumReference {
  letter: string;
  modifier?: ToleranceModifier;
}

// =============================================================================
// ITEM 621-625: SURFACE FINISH & WELD SYMBOLS
// =============================================================================

export interface SurfaceFinish {
  id: string;
  viewId: string;
  position: Point2D;
  leader?: Point2D[];
  
  // Symbol type
  symbolType: 'basic' | 'machiningRequired' | 'machiningProhibited';
  
  // Ra value
  roughnessValue?: number;
  roughnessMax?: number;
  roughnessMin?: number;
  
  // Additional parameters
  productionMethod?: string;
  samplingLength?: number;
  direction?: 'parallel' | 'perpendicular' | 'crossed' | 'multi' | 'circular' | 'radial';
  machiningAllowance?: number;
  
  // Lay pattern
  laySymbol?: 'parallel' | 'perpendicular' | 'crossed' | 'multidirectional' | 
              'circular' | 'radial' | 'particulate';
}

export interface WeldSymbol {
  id: string;
  viewId: string;
  position: Point2D;
  leaderPoints: Point2D[];
  
  // Arrow side
  arrowSide: WeldSymbolSide;
  
  // Other side
  otherSide?: WeldSymbolSide;
  
  // Common elements
  allAround: boolean;
  fieldWeld: boolean;
  tail?: string;            // Process or specification
  contour?: 'flush' | 'convex' | 'concave';
  finishSymbol?: 'C' | 'G' | 'H' | 'M' | 'P' | 'R' | 'S' | 'U';
}

export interface WeldSymbolSide {
  weldType: WeldType;
  size?: number;
  length?: number;
  pitch?: number;
  angle?: number;
  rootOpening?: number;
  contour?: 'flush' | 'convex' | 'concave';
}

export type WeldType =
  | 'fillet' | 'plug' | 'slot' | 'spot' | 'seam' | 'back' | 'surfacing'
  | 'square' | 'V' | 'bevel' | 'U' | 'J' | 'flare-V' | 'flare-bevel'
  | 'scarf' | 'edge';

// Tables
export interface Table {
  id: string;
  type: 'BOM' | 'revision' | 'hole' | 'bend' | 'custom';
  position: Point2D;
  columns: TableColumn[];
  rows: TableRow[];
  style: TableStyle;
  autoPopulate: boolean;
}

export interface TableColumn {
  id: string;
  header: string;
  width: number;
  alignment: 'left' | 'center' | 'right';
  dataType: 'text' | 'number' | 'date' | 'auto';
}

export interface TableRow {
  id: string;
  cells: string[];
  height: number;
}

export interface TableStyle {
  headerHeight: number;
  rowHeight: number;
  borderWidth: number;
  headerColor: string;
  alternateRowColor?: string;
  textStyle: TextStyle;
  headerTextStyle: TextStyle;
}

// =============================================================================
// DRAWING ENGINE
// =============================================================================

export class DrawingEngine {
  private documents: Map<string, DrawingDocument> = new Map();
  private parts: Map<string, Part> = new Map();
  private assemblies: Map<string, Assembly> = new Map();
  
  private defaultDimensionStyle: DimensionStyle = {
    textHeight: 3.5,
    textFont: 'Arial',
    arrowStyle: 'filled',
    arrowSize: 2.5,
    extensionOffset: 1.5,
    extensionOvershoot: 2,
    dimensionLineGap: 1,
    textPosition: 'above',
    textAlignment: 'aligned',
    unitFormat: 'decimal',
    precision: 2,
    trailingZeros: false,
    dualDimension: false
  };
  
  private defaultTextStyle: TextStyle = {
    fontFamily: 'Arial',
    fontSize: 3.5,
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
    alignment: 'left',
    lineSpacing: 1.5
  };
  
  // =============================================================================
  // DOCUMENT MANAGEMENT
  // =============================================================================
  
  createDocument(name: string, standards?: Partial<DrawingStandards>): DrawingDocument {
    const doc: DrawingDocument = {
      id: this.generateId(),
      name,
      sheets: [],
      standards: {
        type: 'ISO',
        projectionType: 'firstAngle',
        units: 'mm',
        precision: 2,
        toleranceDisplay: 'deviation',
        ...standards
      },
      created: Date.now(),
      modified: Date.now()
    };
    
    this.documents.set(doc.id, doc);
    return doc;
  }
  
  deleteDocument(docId: string): void {
    this.documents.delete(docId);
  }
  
  // =============================================================================
  // SHEET MANAGEMENT
  // =============================================================================
  
  addSheet(docId: string, options?: {
    size?: SheetSize;
    orientation?: 'portrait' | 'landscape';
    scale?: number;
  }): DrawingSheet {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const size = options?.size || 'A3';
    const dims = SHEET_SIZES[size];
    
    const sheet: DrawingSheet = {
      id: this.generateId(),
      number: doc.sheets.length + 1,
      size,
      orientation: options?.orientation || 'landscape',
      scale: options?.scale || 1,
      titleBlock: this.createDefaultTitleBlock(doc.standards.type, dims),
      border: {
        visible: true,
        margin: 10,
        lineWeight: 0.7,
        zones: true,
        zoneColumns: 8,
        zoneRows: 6
      },
      views: [],
      dimensions: [],
      annotations: [],
      tables: [],
      geometricTolerances: [],
      surfaceFinishes: [],
      weldSymbols: []
    };
    
    doc.sheets.push(sheet);
    doc.modified = Date.now();
    
    return sheet;
  }
  
  private createDefaultTitleBlock(standard: string, sheetDims: SheetDimensions): TitleBlock {
    const width = 180;
    const height = 56;
    
    const fields: TitleBlockField[] = [
      { id: 'title', name: 'Title', value: '', position: { x: 10, y: height - 20 }, width: 100, height: 10, fontSize: 5, alignment: 'left', editable: true },
      { id: 'partNumber', name: 'Part No.', value: '', position: { x: 10, y: height - 35 }, width: 60, height: 8, fontSize: 3.5, alignment: 'left', editable: true },
      { id: 'revision', name: 'Rev', value: '-', position: { x: 160, y: height - 35 }, width: 15, height: 8, fontSize: 3.5, alignment: 'center', editable: true },
      { id: 'drawnBy', name: 'Drawn', value: '', position: { x: 10, y: height - 48 }, width: 40, height: 8, fontSize: 2.5, alignment: 'left', editable: true },
      { id: 'date', name: 'Date', value: new Date().toISOString().split('T')[0], position: { x: 55, y: height - 48 }, width: 30, height: 8, fontSize: 2.5, alignment: 'left', editable: true },
      { id: 'scale', name: 'Scale', value: '1:1', position: { x: 120, y: height - 48 }, width: 25, height: 8, fontSize: 2.5, alignment: 'center', editable: true },
      { id: 'sheet', name: 'Sheet', value: '1/1', position: { x: 150, y: height - 48 }, width: 25, height: 8, fontSize: 2.5, alignment: 'center', editable: false }
    ];
    
    return {
      template: standard as 'ISO' | 'ANSI' | 'DIN' | 'custom',
      position: { x: sheetDims.width - width - 10, y: 10 },
      width,
      height,
      fields
    };
  }
  
  // =============================================================================
  // VIEW OPERATIONS
  // =============================================================================
  
  addView(docId: string, sheetId: string, options: {
    type: ViewType;
    sourceId: string;
    position: Point2D;
    scale?: number;
    viewDirection?: Vector3D;
    hiddenLines?: boolean;
  }): DrawingView {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const viewDir = options.viewDirection || this.getStandardViewDirection(options.type, doc.standards.projectionType);
    const upDir = this.getUpDirection(viewDir);
    
    const view: DrawingView = {
      id: this.generateId(),
      name: `View ${sheet.views.length + 1}`,
      type: options.type,
      sourceId: options.sourceId,
      position: options.position,
      scale: options.scale || sheet.scale,
      rotation: 0,
      viewDirection: viewDir,
      upDirection: upDir,
      displayStyle: {
        lineStyle: 'visible',
        lineWeight: 0.35,
        color: '#000000',
        shaded: false,
        edgesOnly: true
      },
      hiddenLines: options.hiddenLines ?? true,
      tangentEdges: 'phantom',
      threads: true,
      centerMarks: true,
      centerLines: true,
      boundingBox: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
      edges: []
    };
    
    // Generate edges
    this.generateViewEdges(view);
    
    sheet.views.push(view);
    doc.modified = Date.now();
    
    return view;
  }
  
  addProjectedView(docId: string, sheetId: string, parentViewId: string, direction: 'left' | 'right' | 'top' | 'bottom'): DrawingView {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const parentView = sheet.views.find(v => v.id === parentViewId);
    if (!parentView) throw new Error('Parent view not found');
    
    const offset = 80;
    let position: Point2D;
    let viewType: ViewType;
    
    switch (direction) {
      case 'left':
        position = { x: parentView.position.x - offset, y: parentView.position.y };
        viewType = doc.standards.projectionType === 'firstAngle' ? 'right' : 'left';
        break;
      case 'right':
        position = { x: parentView.position.x + offset, y: parentView.position.y };
        viewType = doc.standards.projectionType === 'firstAngle' ? 'left' : 'right';
        break;
      case 'top':
        position = { x: parentView.position.x, y: parentView.position.y + offset };
        viewType = doc.standards.projectionType === 'firstAngle' ? 'bottom' : 'top';
        break;
      case 'bottom':
        position = { x: parentView.position.x, y: parentView.position.y - offset };
        viewType = doc.standards.projectionType === 'firstAngle' ? 'top' : 'bottom';
        break;
    }
    
    const view = this.addView(docId, sheetId, {
      type: viewType,
      sourceId: parentView.sourceId,
      position,
      scale: parentView.scale,
      hiddenLines: parentView.hiddenLines
    });
    
    view.parentViewId = parentViewId;
    view.type = 'projected';
    
    return view;
  }
  
  addSectionView(docId: string, sheetId: string, parentViewId: string, sectionLine: { start: Point2D; end: Point2D }, label: string): DrawingView {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const parentView = sheet.views.find(v => v.id === parentViewId);
    if (!parentView) throw new Error('Parent view not found');
    
    const view = this.addView(docId, sheetId, {
      type: 'section',
      sourceId: parentView.sourceId,
      position: { x: parentView.position.x + 150, y: parentView.position.y },
      scale: parentView.scale
    });
    
    view.parentViewId = parentViewId;
    view.sectionData = {
      cuttingPlane: sectionLine,
      label,
      arrows: true,
      hatchPattern: {
        type: 'lines',
        angle: 45,
        spacing: 3,
        color: '#000000'
      },
      depth: 'full',
      aligned: false
    };
    
    return view;
  }
  
  addDetailView(docId: string, sheetId: string, parentViewId: string, boundary: CircleBoundary | RectangleBoundary, label: string, scaleFactor = 2): DrawingView {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const parentView = sheet.views.find(v => v.id === parentViewId);
    if (!parentView) throw new Error('Parent view not found');
    
    const view = this.addView(docId, sheetId, {
      type: 'detail',
      sourceId: parentView.sourceId,
      position: { x: parentView.position.x + 120, y: parentView.position.y + 80 },
      scale: parentView.scale * scaleFactor
    });
    
    view.parentViewId = parentViewId;
    view.detailData = {
      sourceViewId: parentViewId,
      boundary,
      label,
      scaleFactor
    };
    
    return view;
  }
  
  private getStandardViewDirection(type: ViewType, projection: 'firstAngle' | 'thirdAngle'): Vector3D {
    const directions: Record<string, Vector3D> = {
      front: { x: 0, y: -1, z: 0 },
      back: { x: 0, y: 1, z: 0 },
      left: { x: 1, y: 0, z: 0 },
      right: { x: -1, y: 0, z: 0 },
      top: { x: 0, y: 0, z: -1 },
      bottom: { x: 0, y: 0, z: 1 },
      isometric: { x: -1, y: -1, z: -1 }
    };
    
    return directions[type] || directions.front;
  }
  
  private getUpDirection(viewDir: Vector3D): Vector3D {
    // Up is Z unless looking at Z, then use Y
    if (Math.abs(viewDir.z) > 0.9) {
      return { x: 0, y: 1, z: 0 };
    }
    return { x: 0, y: 0, z: 1 };
  }
  
  private generateViewEdges(view: DrawingView): void {
    // Would project 3D geometry to 2D
    // Simplified: generate sample edges
    view.edges = [
      { type: 'line', visible: true, style: 'visible', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
      { type: 'line', visible: true, style: 'visible', points: [{ x: 50, y: 0 }, { x: 50, y: 30 }] },
      { type: 'line', visible: true, style: 'visible', points: [{ x: 50, y: 30 }, { x: 0, y: 30 }] },
      { type: 'line', visible: true, style: 'visible', points: [{ x: 0, y: 30 }, { x: 0, y: 0 }] }
    ];
    
    view.boundingBox = {
      min: { x: -25, y: -15 },
      max: { x: 25, y: 15 }
    };
  }
  
  // =============================================================================
  // DIMENSION OPERATIONS
  // =============================================================================
  
  addLinearDimension(docId: string, sheetId: string, viewId: string, point1: Point2D, point2: Point2D, direction: 'horizontal' | 'vertical' | 'aligned' = 'aligned'): Dimension {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const view = sheet.views.find(v => v.id === viewId);
    if (!view) throw new Error('View not found');
    
    // Calculate value
    let value: number;
    if (direction === 'horizontal') {
      value = Math.abs(point2.x - point1.x) / view.scale;
    } else if (direction === 'vertical') {
      value = Math.abs(point2.y - point1.y) / view.scale;
    } else {
      value = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)) / view.scale;
    }
    
    const dim: LinearDimension = {
      type: 'linear',
      id: this.generateId(),
      viewId,
      direction: direction === 'aligned' ? 'horizontal' : direction,
      point1,
      point2,
      value,
      position: {
        x: (point1.x + point2.x) / 2,
        y: (point1.y + point2.y) / 2 + 10
      },
      style: { ...this.defaultDimensionStyle },
      visible: true,
      inspectionDimension: false
    };
    
    if (direction === 'aligned') {
      return this.addAlignedDimension(docId, sheetId, viewId, point1, point2);
    }
    
    sheet.dimensions.push(dim);
    doc.modified = Date.now();
    
    return dim;
  }
  
  addAlignedDimension(docId: string, sheetId: string, viewId: string, point1: Point2D, point2: Point2D): Dimension {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const view = sheet.views.find(v => v.id === viewId);
    if (!view) throw new Error('View not found');
    
    const value = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)) / view.scale;
    
    const dim: AlignedDimension = {
      type: 'aligned',
      id: this.generateId(),
      viewId,
      point1,
      point2,
      value,
      position: {
        x: (point1.x + point2.x) / 2,
        y: (point1.y + point2.y) / 2 + 8
      },
      style: { ...this.defaultDimensionStyle },
      visible: true,
      inspectionDimension: false
    };
    
    sheet.dimensions.push(dim);
    doc.modified = Date.now();
    
    return dim;
  }
  
  addDiameterDimension(docId: string, sheetId: string, viewId: string, center: Point2D, pointOnCircle: Point2D): Dimension {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const view = sheet.views.find(v => v.id === viewId);
    if (!view) throw new Error('View not found');
    
    const radius = Math.sqrt(Math.pow(pointOnCircle.x - center.x, 2) + Math.pow(pointOnCircle.y - center.y, 2));
    const value = (radius * 2) / view.scale;
    
    const dim: DiameterDimension = {
      type: 'diameter',
      id: this.generateId(),
      viewId,
      center,
      pointOnCircle,
      value,
      prefix: '⌀',
      position: { x: center.x + radius + 15, y: center.y },
      style: { ...this.defaultDimensionStyle },
      visible: true,
      inspectionDimension: false,
      foreshortened: false
    };
    
    sheet.dimensions.push(dim);
    doc.modified = Date.now();
    
    return dim;
  }
  
  addRadialDimension(docId: string, sheetId: string, viewId: string, center: Point2D, pointOnArc: Point2D): Dimension {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const view = sheet.views.find(v => v.id === viewId);
    if (!view) throw new Error('View not found');
    
    const value = Math.sqrt(Math.pow(pointOnArc.x - center.x, 2) + Math.pow(pointOnArc.y - center.y, 2)) / view.scale;
    
    const dim: RadialDimension = {
      type: 'radial',
      id: this.generateId(),
      viewId,
      center,
      pointOnArc,
      value,
      prefix: 'R',
      position: {
        x: (center.x + pointOnArc.x) / 2,
        y: (center.y + pointOnArc.y) / 2 + 5
      },
      style: { ...this.defaultDimensionStyle },
      visible: true,
      inspectionDimension: false,
      bent: false
    };
    
    sheet.dimensions.push(dim);
    doc.modified = Date.now();
    
    return dim;
  }
  
  addAngularDimension(docId: string, sheetId: string, viewId: string, vertex: Point2D, point1: Point2D, point2: Point2D): Dimension {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    // Calculate angle
    const angle1 = Math.atan2(point1.y - vertex.y, point1.x - vertex.x);
    const angle2 = Math.atan2(point2.y - vertex.y, point2.x - vertex.x);
    let value = Math.abs(angle2 - angle1) * 180 / Math.PI;
    if (value > 180) value = 360 - value;
    
    const midAngle = (angle1 + angle2) / 2;
    const radius = 20;
    
    const dim: AngularDimension = {
      type: 'angular',
      id: this.generateId(),
      viewId,
      vertex,
      point1,
      point2,
      value,
      suffix: '°',
      arcPosition: {
        x: vertex.x + radius * Math.cos(midAngle),
        y: vertex.y + radius * Math.sin(midAngle)
      },
      position: {
        x: vertex.x + (radius + 10) * Math.cos(midAngle),
        y: vertex.y + (radius + 10) * Math.sin(midAngle)
      },
      style: { ...this.defaultDimensionStyle },
      visible: true,
      inspectionDimension: false
    };
    
    sheet.dimensions.push(dim);
    doc.modified = Date.now();
    
    return dim;
  }
  
  setDimensionTolerance(docId: string, sheetId: string, dimId: string, tolerance: Tolerance): void {
    const doc = this.documents.get(docId);
    if (!doc) return;
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) return;
    
    const dim = sheet.dimensions.find(d => d.id === dimId);
    if (dim) {
      dim.tolerance = tolerance;
      doc.modified = Date.now();
    }
  }
  
  // =============================================================================
  // ANNOTATION OPERATIONS
  // =============================================================================
  
  addNote(docId: string, sheetId: string, text: string, position: Point2D): Note {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const note: Note = {
      type: 'note',
      id: this.generateId(),
      text,
      position,
      style: { ...this.defaultTextStyle },
      border: 'none'
    };
    
    sheet.annotations.push(note);
    doc.modified = Date.now();
    
    return note;
  }
  
  addLeader(docId: string, sheetId: string, text: string, points: Point2D[]): Leader {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const leader: Leader = {
      type: 'leader',
      id: this.generateId(),
      text,
      points,
      arrowType: 'filled',
      terminatorSide: 'left',
      style: { ...this.defaultTextStyle },
      attachmentType: 'edge'
    };
    
    sheet.annotations.push(leader);
    doc.modified = Date.now();
    
    return leader;
  }
  
  addBalloon(docId: string, sheetId: string, itemNumber: string, position: Point2D, leaderPoints: Point2D[]): Balloon {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const balloon: Balloon = {
      type: 'balloon',
      id: this.generateId(),
      itemNumber,
      position,
      leaderPoints,
      shape: 'circle',
      size: 8
    };
    
    sheet.annotations.push(balloon);
    doc.modified = Date.now();
    
    return balloon;
  }
  
  addGeometricTolerance(docId: string, sheetId: string, viewId: string, position: Point2D, frames: ToleranceFrame[]): GeometricTolerance {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const gt: GeometricTolerance = {
      id: this.generateId(),
      viewId,
      position,
      frames,
      compositeFrame: frames.length > 1
    };
    
    sheet.geometricTolerances.push(gt);
    doc.modified = Date.now();
    
    return gt;
  }
  
  addSurfaceFinish(docId: string, sheetId: string, viewId: string, position: Point2D, roughnessValue: number): SurfaceFinish {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const sf: SurfaceFinish = {
      id: this.generateId(),
      viewId,
      position,
      symbolType: 'machiningRequired',
      roughnessValue
    };
    
    sheet.surfaceFinishes.push(sf);
    doc.modified = Date.now();
    
    return sf;
  }
  
  // =============================================================================
  // TABLE OPERATIONS
  // =============================================================================
  
  addBOMTable(docId: string, sheetId: string, position: Point2D, bomEntries: Array<{ itemNumber: number; partNumber: string; description: string; quantity: number }>): Table {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const table: Table = {
      id: this.generateId(),
      type: 'BOM',
      position,
      columns: [
        { id: 'item', header: 'ITEM', width: 15, alignment: 'center', dataType: 'number' },
        { id: 'partNo', header: 'PART NO.', width: 40, alignment: 'left', dataType: 'text' },
        { id: 'desc', header: 'DESCRIPTION', width: 80, alignment: 'left', dataType: 'text' },
        { id: 'qty', header: 'QTY', width: 15, alignment: 'center', dataType: 'number' }
      ],
      rows: bomEntries.map(entry => ({
        id: this.generateId(),
        cells: [entry.itemNumber.toString(), entry.partNumber, entry.description, entry.quantity.toString()],
        height: 8
      })),
      style: {
        headerHeight: 10,
        rowHeight: 8,
        borderWidth: 0.35,
        headerColor: '#e0e0e0',
        textStyle: { ...this.defaultTextStyle, fontSize: 2.5 },
        headerTextStyle: { ...this.defaultTextStyle, fontSize: 2.5, bold: true }
      },
      autoPopulate: true
    };
    
    sheet.tables.push(table);
    doc.modified = Date.now();
    
    return table;
  }
  
  addRevisionTable(docId: string, sheetId: string, position: Point2D): Table {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const table: Table = {
      id: this.generateId(),
      type: 'revision',
      position,
      columns: [
        { id: 'rev', header: 'REV', width: 10, alignment: 'center', dataType: 'text' },
        { id: 'desc', header: 'DESCRIPTION', width: 80, alignment: 'left', dataType: 'text' },
        { id: 'date', header: 'DATE', width: 25, alignment: 'center', dataType: 'date' },
        { id: 'appr', header: 'APPROVED', width: 25, alignment: 'center', dataType: 'text' }
      ],
      rows: [],
      style: {
        headerHeight: 8,
        rowHeight: 6,
        borderWidth: 0.35,
        headerColor: '#e0e0e0',
        textStyle: { ...this.defaultTextStyle, fontSize: 2 },
        headerTextStyle: { ...this.defaultTextStyle, fontSize: 2, bold: true }
      },
      autoPopulate: false
    };
    
    sheet.tables.push(table);
    doc.modified = Date.now();
    
    return table;
  }
  
  // =============================================================================
  // AUTO-DIMENSION
  // =============================================================================
  
  autoDimension(docId: string, sheetId: string, viewId: string): Dimension[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) return [];
    
    const view = sheet.views.find(v => v.id === viewId);
    if (!view) return [];
    
    const addedDimensions: Dimension[] = [];
    
    // Analyze view edges and add appropriate dimensions
    for (const edge of view.edges) {
      if (edge.type === 'line' && edge.visible && edge.points.length >= 2) {
        const p1 = edge.points[0];
        const p2 = edge.points[edge.points.length - 1];
        
        // Horizontal line
        if (Math.abs(p1.y - p2.y) < 0.1) {
          const dim = this.addLinearDimension(docId, sheetId, viewId, p1, p2, 'horizontal');
          addedDimensions.push(dim);
        }
        // Vertical line
        else if (Math.abs(p1.x - p2.x) < 0.1) {
          const dim = this.addLinearDimension(docId, sheetId, viewId, p1, p2, 'vertical');
          addedDimensions.push(dim);
        }
      }
      
      if (edge.type === 'circle' && edge.points.length >= 2) {
        const center = edge.points[0];
        const pointOnCircle = edge.points[1];
        const dim = this.addDiameterDimension(docId, sheetId, viewId, center, pointOnCircle);
        addedDimensions.push(dim);
      }
    }
    
    return addedDimensions;
  }
  
  // =============================================================================
  // EXPORT
  // =============================================================================
  
  exportToDXF(docId: string): string {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    let dxf = '0\nSECTION\n2\nHEADER\n';
    dxf += '9\n$ACADVER\n1\nAC1027\n'; // AutoCAD 2013
    dxf += '0\nENDSEC\n';
    
    dxf += '0\nSECTION\n2\nENTITIES\n';
    
    for (const sheet of doc.sheets) {
      for (const view of sheet.views) {
        for (const edge of view.edges) {
          if (edge.type === 'line' && edge.points.length >= 2) {
            const p1 = edge.points[0];
            const p2 = edge.points[edge.points.length - 1];
            dxf += '0\nLINE\n';
            dxf += '8\n0\n';
            dxf += `10\n${view.position.x + p1.x}\n`;
            dxf += `20\n${view.position.y + p1.y}\n`;
            dxf += '30\n0\n';
            dxf += `11\n${view.position.x + p2.x}\n`;
            dxf += `21\n${view.position.y + p2.y}\n`;
            dxf += '31\n0\n';
          }
        }
      }
    }
    
    dxf += '0\nENDSEC\n';
    dxf += '0\nEOF\n';
    
    return dxf;
  }
  
  exportToSVG(docId: string, sheetId: string): string {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error('Document not found');
    
    const sheet = doc.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error('Sheet not found');
    
    const dims = SHEET_SIZES[sheet.size];
    const width = sheet.orientation === 'landscape' ? dims.width : dims.height;
    const height = sheet.orientation === 'landscape' ? dims.height : dims.width;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">\n`;
    
    // Border
    if (sheet.border.visible) {
      const m = sheet.border.margin;
      svg += `<rect x="${m}" y="${m}" width="${width - 2 * m}" height="${height - 2 * m}" fill="none" stroke="#000" stroke-width="${sheet.border.lineWeight}"/>\n`;
    }
    
    // Views
    for (const view of sheet.views) {
      svg += `<g transform="translate(${view.position.x}, ${height - view.position.y})">\n`;
      
      for (const edge of view.edges) {
        if (edge.type === 'line' && edge.points.length >= 2) {
          const style = edge.style === 'hidden' ? 'stroke-dasharray="2,1"' : '';
          svg += `<line x1="${edge.points[0].x}" y1="${-edge.points[0].y}" x2="${edge.points[1].x}" y2="${-edge.points[1].y}" stroke="#000" stroke-width="0.35" ${style}/>\n`;
        }
      }
      
      svg += '</g>\n';
    }
    
    // Dimensions
    for (const dim of sheet.dimensions) {
      const view = sheet.views.find(v => v.id === dim.viewId);
      if (!view) continue;
      
      const offsetX = view.position.x;
      const offsetY = height - view.position.y;
      
      svg += `<text x="${offsetX + dim.position.x}" y="${offsetY - dim.position.y}" font-size="${dim.style.textHeight}" text-anchor="middle">${dim.value.toFixed(dim.style.precision)}</text>\n`;
    }
    
    svg += '</svg>';
    
    return svg;
  }
  
  // =============================================================================
  // UTILITIES
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  getDocument(docId: string): DrawingDocument | undefined {
    return this.documents.get(docId);
  }
  
  getAllDocuments(): DrawingDocument[] {
    return Array.from(this.documents.values());
  }
  
  setPart(partId: string, part: Part): void {
    this.parts.set(partId, part);
  }
  
  setAssembly(assemblyId: string, assembly: Assembly): void {
    this.assemblies.set(assemblyId, assembly);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createDrawingEngine = () => new DrawingEngine();

export default { DrawingEngine, createDrawingEngine };
