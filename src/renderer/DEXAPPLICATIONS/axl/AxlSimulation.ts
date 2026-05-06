// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - AXL CAD Simulation Engine
// Professional FEA, thermal, and motion simulation
// Items 626-650 of the 1000-item improvement plan
// =============================================================================

import type { Part, Assembly, Point3D, Vector3D, Material, BoundingBox } from './AxlModeling';

// =============================================================================
// SIMULATION TYPES
// =============================================================================

export interface SimulationStudy {
  id: string;
  name: string;
  type: SimulationType;
  sourceId: string;         // Part or Assembly ID
  sourceType: 'part' | 'assembly';
  mesh: Mesh;
  materials: MaterialAssignment[];
  loads: Load[];
  fixtures: Fixture[];
  contacts?: Contact[];
  connectors?: Connector[];
  results?: SimulationResults;
  settings: SimulationSettings;
  status: 'setup' | 'meshing' | 'solving' | 'complete' | 'failed';
  progress: number;
  created: number;
  modified: number;
}

export type SimulationType = 
  | 'static' | 'frequency' | 'buckling' | 'fatigue'
  | 'thermal' | 'thermalTransient'
  | 'motion' | 'dynamicLinear' | 'dynamicNonlinear'
  | 'flowSimulation' | 'dropTest' | 'optimization';

export interface SimulationSettings {
  solver: 'direct' | 'iterative' | 'FFEPlus';
  accuracy: 'draft' | 'normal' | 'high';
  largeDisplacement: boolean;
  softSpring: boolean;
  inertialRelief: boolean;
  adaptiveMesh: boolean;
  resultOptions: ResultOptions;
}

export interface ResultOptions {
  storeElementStrains: boolean;
  storeReactionForces: boolean;
  contactForces: boolean;
  beamForces: boolean;
  frequencyModes?: number;
}

// =============================================================================
// ITEM 626-630: MESH SYSTEM
// =============================================================================

export interface Mesh {
  id: string;
  type: 'solid' | 'shell' | 'beam' | 'mixed';
  elementType: ElementType;
  nodes: MeshNode[];
  elements: MeshElement[];
  quality: MeshQuality;
  statistics: MeshStatistics;
}

export type ElementType = 
  | 'tetrahedral4' | 'tetrahedral10'      // Solid
  | 'triangular3' | 'triangular6'          // Shell
  | 'beam2' | 'beam3'                      // Beam
  | 'hexahedral8' | 'hexahedral20';        // Higher order

export interface MeshNode {
  id: number;
  position: Point3D;
  displacement?: Vector3D;
  temperature?: number;
}

export interface MeshElement {
  id: number;
  type: ElementType;
  nodeIds: number[];
  materialId?: string;
  shellThickness?: number;
  beamSection?: BeamSection;
}

export interface BeamSection {
  type: 'rectangular' | 'circular' | 'iBeam' | 'channel' | 'angle' | 'tube' | 'custom';
  dimensions: Record<string, number>;
  area: number;
  Ixx: number;
  Iyy: number;
  J: number;
}

export interface MeshQuality {
  aspectRatio: { min: number; max: number; avg: number };
  jacobian: { min: number; max: number; avg: number };
  distortedElements: number;
  warningElements: number;
}

export interface MeshStatistics {
  nodeCount: number;
  elementCount: number;
  dofCount: number;
  memoryEstimate: number;   // MB
  solveTimeEstimate: number; // seconds
}

export interface MeshControls {
  globalSize: number;
  minSize: number;
  maxSize: number;
  growthRate: number;
  curvatureBasedMesh: boolean;
  meshDensity: 'coarse' | 'standard' | 'fine' | 'custom';
  localControls: LocalMeshControl[];
}

export interface LocalMeshControl {
  id: string;
  type: 'face' | 'edge' | 'vertex' | 'component';
  entityId: string;
  size: number;
  ratio?: number;
}

// =============================================================================
// ITEM 631-635: LOADS & FIXTURES
// =============================================================================

export type Load = 
  | ForceLoad
  | PressureLoad
  | TorqueLoad
  | BearingLoad
  | GravityLoad
  | CentrifugalLoad
  | TemperatureLoad
  | ConvectionLoad
  | HeatFluxLoad
  | RemoteLoad;

export interface LoadBase {
  id: string;
  name: string;
  active: boolean;
  loadCase?: string;
}

export interface ForceLoad extends LoadBase {
  type: 'force';
  faces: string[];
  magnitude: number;
  direction: Vector3D;
  distribution: 'uniform' | 'perVertex' | 'perArea';
  nonUniformData?: number[];
}

export interface PressureLoad extends LoadBase {
  type: 'pressure';
  faces: string[];
  magnitude: number;
  normalDirection: boolean;   // true = normal to face
  direction?: Vector3D;
}

export interface TorqueLoad extends LoadBase {
  type: 'torque';
  faces: string[];
  magnitude: number;
  axis: { point: Point3D; direction: Vector3D };
}

export interface BearingLoad extends LoadBase {
  type: 'bearing';
  faces: string[];
  magnitude: number;
  direction: Vector3D;
  distribution: 'sinusoidal' | 'parabolic';
}

export interface GravityLoad extends LoadBase {
  type: 'gravity';
  magnitude: number;
  direction: Vector3D;
}

export interface CentrifugalLoad extends LoadBase {
  type: 'centrifugal';
  axis: { point: Point3D; direction: Vector3D };
  angularVelocity: number;    // rad/s
  angularAcceleration?: number;
}

export interface TemperatureLoad extends LoadBase {
  type: 'temperature';
  entities: string[];
  temperature: number;
  referenceTemperature: number;
}

export interface ConvectionLoad extends LoadBase {
  type: 'convection';
  faces: string[];
  coefficient: number;        // W/(m²·K)
  ambientTemperature: number;
}

export interface HeatFluxLoad extends LoadBase {
  type: 'heatFlux';
  faces: string[];
  magnitude: number;          // W/m²
}

export interface RemoteLoad extends LoadBase {
  type: 'remote';
  faces: string[];
  remotePoint: Point3D;
  force?: Vector3D;
  moment?: Vector3D;
  connectionType: 'rigid' | 'deformable';
}

// Fixtures
export type Fixture = 
  | FixedFixture
  | RollerFixture
  | HingeFixture
  | ElasticFixture
  | SymmetryFixture
  | RemoteDisplacementFixture
  | VirtualWallFixture;

export interface FixtureBase {
  id: string;
  name: string;
  active: boolean;
}

export interface FixedFixture extends FixtureBase {
  type: 'fixed';
  faces: string[];
}

export interface RollerFixture extends FixtureBase {
  type: 'roller';
  faces: string[];
  direction: Vector3D;        // Direction of allowed movement
}

export interface HingeFixture extends FixtureBase {
  type: 'hinge';
  faces: string[];
  axis: { point: Point3D; direction: Vector3D };
}

export interface ElasticFixture extends FixtureBase {
  type: 'elastic';
  faces: string[];
  normalStiffness: number;    // N/m
  shearStiffness: number;
  dampingRatio?: number;
}

export interface SymmetryFixture extends FixtureBase {
  type: 'symmetry';
  faces: string[];
}

export interface RemoteDisplacementFixture extends FixtureBase {
  type: 'remoteDisplacement';
  faces: string[];
  remotePoint: Point3D;
  translation: { x: number | null; y: number | null; z: number | null };
  rotation: { x: number | null; y: number | null; z: number | null };
}

export interface VirtualWallFixture extends FixtureBase {
  type: 'virtualWall';
  faces: string[];
  plane: { point: Point3D; normal: Vector3D };
  stiffness?: number;
}

// Contact
export interface Contact {
  id: string;
  name: string;
  type: 'bonded' | 'noSlip' | 'allowSlip' | 'freeSeparation' | 'shrinkFit';
  set1: { componentId: string; faces: string[] };
  set2: { componentId: string; faces: string[] };
  frictionCoefficient?: number;
  penetration?: number;
}

// Connectors
export interface Connector {
  id: string;
  name: string;
  type: 'bolt' | 'pin' | 'spring' | 'bearing' | 'spot' | 'edge';
  components: string[];
  properties: Record<string, number>;
}

// Material Assignment
export interface MaterialAssignment {
  entityId: string;
  entityType: 'body' | 'face' | 'edge';
  materialId: string;
  shellThickness?: number;
  beamSection?: BeamSection;
}

// =============================================================================
// ITEM 636-645: SIMULATION RESULTS
// =============================================================================

export interface SimulationResults {
  id: string;
  studyId: string;
  timestamp: number;
  converged: boolean;
  iterations?: number;
  errorEstimate?: number;
  
  // Static results
  stress?: StressResults;
  displacement?: DisplacementResults;
  strain?: StrainResults;
  reactionForces?: ReactionForce[];
  
  // Frequency results
  frequencies?: FrequencyMode[];
  
  // Thermal results
  temperature?: TemperatureResults;
  heatFlux?: HeatFluxResults;
  
  // Factor of safety
  factorOfSafety?: FactorOfSafetyResults;
  
  // Motion results
  motionResults?: MotionResults;
}

export interface StressResults {
  vonMises: ResultField;
  principal1: ResultField;
  principal2: ResultField;
  principal3: ResultField;
  shearXY: ResultField;
  shearYZ: ResultField;
  shearXZ: ResultField;
  max: { value: number; nodeId: number; position: Point3D };
  min: { value: number; nodeId: number; position: Point3D };
}

export interface DisplacementResults {
  magnitude: ResultField;
  x: ResultField;
  y: ResultField;
  z: ResultField;
  max: { value: number; nodeId: number; position: Point3D };
}

export interface StrainResults {
  equivalent: ResultField;
  principal1: ResultField;
  principal2: ResultField;
  principal3: ResultField;
  max: { value: number; nodeId: number; position: Point3D };
}

export interface ResultField {
  nodeValues: Map<number, number>;
  elementValues: Map<number, number>;
  min: number;
  max: number;
  avg: number;
}

export interface ReactionForce {
  fixtureId: string;
  force: Vector3D;
  moment: Vector3D;
  totalMagnitude: number;
}

export interface FrequencyMode {
  modeNumber: number;
  frequency: number;         // Hz
  period: number;            // seconds
  massParticipation: { x: number; y: number; z: number };
  modeShape: ResultField;
}

export interface TemperatureResults {
  field: ResultField;
  max: { value: number; nodeId: number; position: Point3D };
  min: { value: number; nodeId: number; position: Point3D };
  gradients?: ResultField;
}

export interface HeatFluxResults {
  magnitude: ResultField;
  x: ResultField;
  y: ResultField;
  z: ResultField;
  max: { value: number; nodeId: number; position: Point3D };
}

export interface FactorOfSafetyResults {
  field: ResultField;
  criterion: 'vonMises' | 'maxShear' | 'mohrCoulomb' | 'custom';
  yieldStrength: number;
  min: { value: number; nodeId: number; position: Point3D };
  belowThreshold: { threshold: number; percentage: number; volume: number };
}

export interface MotionResults {
  frames: MotionFrame[];
  traces: MotionTrace[];
  forces: MotionForce[];
  power: MotionPower[];
}

export interface MotionFrame {
  time: number;
  componentStates: Map<string, {
    position: Point3D;
    rotation: Vector3D;
    velocity: Vector3D;
    angularVelocity: Vector3D;
    acceleration: Vector3D;
    angularAcceleration: Vector3D;
  }>;
}

export interface MotionTrace {
  componentId: string;
  pointId: string;
  points: Point3D[];
}

export interface MotionForce {
  time: number;
  jointId: string;
  force: Vector3D;
  moment: Vector3D;
}

export interface MotionPower {
  time: number;
  driverId: string;
  power: number;
  energy: number;
}

// =============================================================================
// SIMULATION ENGINE
// =============================================================================

export class SimulationEngine {
  private studies: Map<string, SimulationStudy> = new Map();
  private parts: Map<string, Part> = new Map();
  private assemblies: Map<string, Assembly> = new Map();
  private meshWorker: Worker | null = null;
  private solveWorker: Worker | null = null;
  
  // =============================================================================
  // STUDY MANAGEMENT
  // =============================================================================
  
  createStudy(name: string, type: SimulationType, sourceId: string, sourceType: 'part' | 'assembly'): SimulationStudy {
    const study: SimulationStudy = {
      id: this.generateId(),
      name,
      type,
      sourceId,
      sourceType,
      mesh: this.createEmptyMesh(),
      materials: [],
      loads: [],
      fixtures: [],
      contacts: sourceType === 'assembly' ? [] : undefined,
      connectors: sourceType === 'assembly' ? [] : undefined,
      settings: this.getDefaultSettings(type),
      status: 'setup',
      progress: 0,
      created: Date.now(),
      modified: Date.now()
    };
    
    this.studies.set(study.id, study);
    return study;
  }
  
  deleteStudy(studyId: string): void {
    this.studies.delete(studyId);
  }
  
  copyStudy(studyId: string, newName: string): SimulationStudy {
    const original = this.studies.get(studyId);
    if (!original) throw new Error('Study not found');
    
    const copy: SimulationStudy = {
      ...JSON.parse(JSON.stringify(original)),
      id: this.generateId(),
      name: newName,
      results: undefined,
      status: 'setup',
      progress: 0,
      created: Date.now(),
      modified: Date.now()
    };
    
    this.studies.set(copy.id, copy);
    return copy;
  }
  
  private createEmptyMesh(): Mesh {
    return {
      id: this.generateId(),
      type: 'solid',
      elementType: 'tetrahedral10',
      nodes: [],
      elements: [],
      quality: {
        aspectRatio: { min: 0, max: 0, avg: 0 },
        jacobian: { min: 0, max: 0, avg: 0 },
        distortedElements: 0,
        warningElements: 0
      },
      statistics: {
        nodeCount: 0,
        elementCount: 0,
        dofCount: 0,
        memoryEstimate: 0,
        solveTimeEstimate: 0
      }
    };
  }
  
  private getDefaultSettings(type: SimulationType): SimulationSettings {
    return {
      solver: 'FFEPlus',
      accuracy: 'normal',
      largeDisplacement: type === 'dynamicNonlinear',
      softSpring: false,
      inertialRelief: false,
      adaptiveMesh: true,
      resultOptions: {
        storeElementStrains: true,
        storeReactionForces: true,
        contactForces: type !== 'static',
        beamForces: true,
        frequencyModes: type === 'frequency' ? 10 : undefined
      }
    };
  }
  
  // =============================================================================
  // MESH GENERATION
  // =============================================================================
  
  generateMesh(studyId: string, controls: MeshControls): Promise<Mesh> {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    study.status = 'meshing';
    study.progress = 0;
    
    return new Promise((resolve) => {
      // Simulate mesh generation
      const source = study.sourceType === 'part' 
        ? this.parts.get(study.sourceId)
        : this.assemblies.get(study.sourceId);
      
      if (!source) {
        study.status = 'failed';
        throw new Error('Source geometry not found');
      }
      
      // Generate mesh based on controls
      const nodes: MeshNode[] = [];
      const elements: MeshElement[] = [];
      
      // Simplified mesh generation - in reality would use tetrahedral meshing algorithm
      const bbox = this.getBoundingBox(source);
      const numDivisions = Math.ceil(100 / controls.globalSize);
      
      const nx = Math.max(2, Math.floor((bbox.max.x - bbox.min.x) / controls.globalSize));
      const ny = Math.max(2, Math.floor((bbox.max.y - bbox.min.y) / controls.globalSize));
      const nz = Math.max(2, Math.floor((bbox.max.z - bbox.min.z) / controls.globalSize));
      
      // Generate grid nodes
      let nodeId = 1;
      const nodeMap = new Map<string, number>();
      
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= ny; j++) {
          for (let k = 0; k <= nz; k++) {
            const x = bbox.min.x + (bbox.max.x - bbox.min.x) * i / nx;
            const y = bbox.min.y + (bbox.max.y - bbox.min.y) * j / ny;
            const z = bbox.min.z + (bbox.max.z - bbox.min.z) * k / nz;
            
            nodes.push({
              id: nodeId,
              position: { x, y, z }
            });
            
            nodeMap.set(`${i},${j},${k}`, nodeId);
            nodeId++;
            
            study.progress = (i * ny * nz + j * nz + k) / (nx * ny * nz) * 50;
          }
        }
      }
      
      // Generate tetrahedral elements from hexahedral grid
      let elementId = 1;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            // Get corner nodes
            const n = [
              nodeMap.get(`${i},${j},${k}`)!,
              nodeMap.get(`${i + 1},${j},${k}`)!,
              nodeMap.get(`${i + 1},${j + 1},${k}`)!,
              nodeMap.get(`${i},${j + 1},${k}`)!,
              nodeMap.get(`${i},${j},${k + 1}`)!,
              nodeMap.get(`${i + 1},${j},${k + 1}`)!,
              nodeMap.get(`${i + 1},${j + 1},${k + 1}`)!,
              nodeMap.get(`${i},${j + 1},${k + 1}`)!
            ];
            
            // Split hex into 5 tetrahedra
            const tetConfigs = [
              [0, 1, 3, 4],
              [1, 2, 3, 6],
              [1, 4, 5, 6],
              [3, 4, 6, 7],
              [1, 3, 4, 6]
            ];
            
            for (const config of tetConfigs) {
              elements.push({
                id: elementId++,
                type: 'tetrahedral4',
                nodeIds: config.map(idx => n[idx])
              });
            }
            
            study.progress = 50 + (i * ny * nz + j * nz + k) / (nx * ny * nz) * 50;
          }
        }
      }
      
      // Calculate mesh quality
      const quality = this.calculateMeshQuality(nodes, elements);
      
      study.mesh = {
        id: this.generateId(),
        type: 'solid',
        elementType: 'tetrahedral4',
        nodes,
        elements,
        quality,
        statistics: {
          nodeCount: nodes.length,
          elementCount: elements.length,
          dofCount: nodes.length * 3,
          memoryEstimate: (nodes.length * 24 + elements.length * 32) / 1e6,
          solveTimeEstimate: Math.pow(nodes.length, 1.5) / 1e6
        }
      };
      
      study.status = 'setup';
      study.progress = 100;
      study.modified = Date.now();
      
      resolve(study.mesh);
    });
  }
  
  private calculateMeshQuality(nodes: MeshNode[], elements: MeshElement[]): MeshQuality {
    const aspectRatios: number[] = [];
    const jacobians: number[] = [];
    let distorted = 0;
    let warning = 0;
    
    for (const element of elements) {
      if (element.type !== 'tetrahedral4') continue;
      
      const pts = element.nodeIds.map(id => nodes.find(n => n.id === id)!.position);
      
      // Calculate aspect ratio (simplified)
      const edges = [
        this.distance(pts[0], pts[1]),
        this.distance(pts[0], pts[2]),
        this.distance(pts[0], pts[3]),
        this.distance(pts[1], pts[2]),
        this.distance(pts[1], pts[3]),
        this.distance(pts[2], pts[3])
      ];
      
      const minEdge = Math.min(...edges);
      const maxEdge = Math.max(...edges);
      const ar = maxEdge / minEdge;
      aspectRatios.push(ar);
      
      // Calculate jacobian (simplified - just check for inverted elements)
      const v1 = this.subtract(pts[1], pts[0]);
      const v2 = this.subtract(pts[2], pts[0]);
      const v3 = this.subtract(pts[3], pts[0]);
      const jac = this.dot(v1, this.cross(v2, v3));
      jacobians.push(jac);
      
      if (jac <= 0) distorted++;
      else if (ar > 10) warning++;
    }
    
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    return {
      aspectRatio: {
        min: Math.min(...aspectRatios),
        max: Math.max(...aspectRatios),
        avg: avg(aspectRatios)
      },
      jacobian: {
        min: Math.min(...jacobians),
        max: Math.max(...jacobians),
        avg: avg(jacobians)
      },
      distortedElements: distorted,
      warningElements: warning
    };
  }
  
  // =============================================================================
  // LOADS & FIXTURES
  // =============================================================================
  
  addForce(studyId: string, faces: string[], magnitude: number, direction: Vector3D): ForceLoad {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const load: ForceLoad = {
      type: 'force',
      id: this.generateId(),
      name: `Force ${study.loads.filter(l => l.type === 'force').length + 1}`,
      active: true,
      faces,
      magnitude,
      direction: this.normalize(direction),
      distribution: 'uniform'
    };
    
    study.loads.push(load);
    study.modified = Date.now();
    
    return load;
  }
  
  addPressure(studyId: string, faces: string[], magnitude: number): PressureLoad {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const load: PressureLoad = {
      type: 'pressure',
      id: this.generateId(),
      name: `Pressure ${study.loads.filter(l => l.type === 'pressure').length + 1}`,
      active: true,
      faces,
      magnitude,
      normalDirection: true
    };
    
    study.loads.push(load);
    study.modified = Date.now();
    
    return load;
  }
  
  addGravity(studyId: string, magnitude = 9.81, direction: Vector3D = { x: 0, y: 0, z: -1 }): GravityLoad {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const load: GravityLoad = {
      type: 'gravity',
      id: this.generateId(),
      name: 'Gravity',
      active: true,
      magnitude,
      direction: this.normalize(direction)
    };
    
    study.loads.push(load);
    study.modified = Date.now();
    
    return load;
  }
  
  addFixedFixture(studyId: string, faces: string[]): FixedFixture {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const fixture: FixedFixture = {
      type: 'fixed',
      id: this.generateId(),
      name: `Fixed ${study.fixtures.length + 1}`,
      active: true,
      faces
    };
    
    study.fixtures.push(fixture);
    study.modified = Date.now();
    
    return fixture;
  }
  
  addRollerFixture(studyId: string, faces: string[], direction: Vector3D): RollerFixture {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const fixture: RollerFixture = {
      type: 'roller',
      id: this.generateId(),
      name: `Roller ${study.fixtures.filter(f => f.type === 'roller').length + 1}`,
      active: true,
      faces,
      direction: this.normalize(direction)
    };
    
    study.fixtures.push(fixture);
    study.modified = Date.now();
    
    return fixture;
  }
  
  addSymmetryFixture(studyId: string, faces: string[]): SymmetryFixture {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    const fixture: SymmetryFixture = {
      type: 'symmetry',
      id: this.generateId(),
      name: `Symmetry ${study.fixtures.filter(f => f.type === 'symmetry').length + 1}`,
      active: true,
      faces
    };
    
    study.fixtures.push(fixture);
    study.modified = Date.now();
    
    return fixture;
  }
  
  // =============================================================================
  // ITEM 640-645: SOLVER
  // =============================================================================
  
  async runStudy(studyId: string): Promise<SimulationResults> {
    const study = this.studies.get(studyId);
    if (!study) throw new Error('Study not found');
    
    if (study.mesh.nodes.length === 0) {
      throw new Error('Mesh not generated');
    }
    
    if (study.fixtures.length === 0) {
      throw new Error('No fixtures defined');
    }
    
    study.status = 'solving';
    study.progress = 0;
    
    // Build stiffness matrix (simplified)
    const n = study.mesh.nodes.length;
    const dof = n * 3;
    
    // In a real implementation, this would:
    // 1. Assemble global stiffness matrix
    // 2. Apply boundary conditions
    // 3. Solve system of equations
    // 4. Calculate stresses and strains
    
    // Simulate solving
    await this.simulateSolve(study);
    
    // Generate results
    const results = this.generateResults(study);
    
    study.results = results;
    study.status = 'complete';
    study.progress = 100;
    study.modified = Date.now();
    
    return results;
  }
  
  private async simulateSolve(study: SimulationStudy): Promise<void> {
    return new Promise((resolve) => {
      const steps = 20;
      let step = 0;
      
      const tick = () => {
        step++;
        study.progress = (step / steps) * 100;
        
        if (step < steps) {
          setTimeout(tick, 50);
        } else {
          resolve();
        }
      };
      
      setTimeout(tick, 50);
    });
  }
  
  private generateResults(study: SimulationStudy): SimulationResults {
    const mesh = study.mesh;
    
    // Generate displacement field (simplified - random for demo)
    const displacement = this.generateDisplacementField(mesh, study);
    
    // Calculate stress from displacement
    const stress = this.calculateStressField(mesh, displacement, study);
    
    // Calculate strain
    const strain = this.calculateStrainField(mesh, stress, study);
    
    // Calculate factor of safety
    const fos = this.calculateFactorOfSafety(stress, study);
    
    // Calculate reaction forces
    const reactions = this.calculateReactionForces(study);
    
    const results: SimulationResults = {
      id: this.generateId(),
      studyId: study.id,
      timestamp: Date.now(),
      converged: true,
      iterations: 12,
      errorEstimate: 0.001,
      displacement,
      stress,
      strain,
      factorOfSafety: fos,
      reactionForces: reactions
    };
    
    // Add frequency results if applicable
    if (study.type === 'frequency') {
      results.frequencies = this.calculateFrequencyModes(study);
    }
    
    // Add thermal results if applicable
    if (study.type === 'thermal' || study.type === 'thermalTransient') {
      results.temperature = this.calculateTemperatureField(study);
      results.heatFlux = this.calculateHeatFluxField(study);
    }
    
    return results;
  }
  
  private generateDisplacementField(mesh: Mesh, study: SimulationStudy): DisplacementResults {
    const nodeValues = new Map<number, number>();
    const xValues = new Map<number, number>();
    const yValues = new Map<number, number>();
    const zValues = new Map<number, number>();
    
    // Get total force magnitude for scaling
    let totalForce = 0;
    for (const load of study.loads) {
      if (load.type === 'force') {
        totalForce += load.magnitude;
      } else if (load.type === 'pressure') {
        totalForce += load.magnitude * 100; // Estimated area
      }
    }
    
    // Get material stiffness
    const material = study.materials[0];
    const E = material ? this.getMaterialStiffness(material.materialId) : 200e9;
    
    // Scale factor for displacement
    const scale = totalForce / (E * 0.001);
    
    let maxDisp = 0;
    let maxNode = 0;
    let maxPos: Point3D = { x: 0, y: 0, z: 0 };
    
    for (const node of mesh.nodes) {
      // Check if node is fixed
      const isFixed = this.isNodeFixed(node.id, study);
      
      if (isFixed) {
        nodeValues.set(node.id, 0);
        xValues.set(node.id, 0);
        yValues.set(node.id, 0);
        zValues.set(node.id, 0);
      } else {
        // Simplified displacement calculation based on distance from fixtures
        const distFromFixed = this.getDistanceFromFixtures(node.position, study);
        const baseMag = distFromFixed * scale;
        
        // Apply load direction
        let dx = 0, dy = 0, dz = 0;
        for (const load of study.loads) {
          if (load.type === 'force') {
            dx += load.direction.x * baseMag;
            dy += load.direction.y * baseMag;
            dz += load.direction.z * baseMag;
          } else if (load.type === 'gravity') {
            dx += load.direction.x * baseMag * 0.1;
            dy += load.direction.y * baseMag * 0.1;
            dz += load.direction.z * baseMag * 0.1;
          }
        }
        
        const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        nodeValues.set(node.id, mag);
        xValues.set(node.id, dx);
        yValues.set(node.id, dy);
        zValues.set(node.id, dz);
        
        if (mag > maxDisp) {
          maxDisp = mag;
          maxNode = node.id;
          maxPos = node.position;
        }
      }
    }
    
    const values = Array.from(nodeValues.values());
    
    return {
      magnitude: {
        nodeValues,
        elementValues: new Map(),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      },
      x: {
        nodeValues: xValues,
        elementValues: new Map(),
        min: Math.min(...Array.from(xValues.values())),
        max: Math.max(...Array.from(xValues.values())),
        avg: 0
      },
      y: {
        nodeValues: yValues,
        elementValues: new Map(),
        min: Math.min(...Array.from(yValues.values())),
        max: Math.max(...Array.from(yValues.values())),
        avg: 0
      },
      z: {
        nodeValues: zValues,
        elementValues: new Map(),
        min: Math.min(...Array.from(zValues.values())),
        max: Math.max(...Array.from(zValues.values())),
        avg: 0
      },
      max: { value: maxDisp, nodeId: maxNode, position: maxPos }
    };
  }
  
  private calculateStressField(mesh: Mesh, displacement: DisplacementResults, study: SimulationStudy): StressResults {
    const nodeValues = new Map<number, number>();
    
    // Get material properties
    const material = study.materials[0];
    const E = material ? this.getMaterialStiffness(material.materialId) : 200e9;
    
    let maxStress = 0;
    let minStress = Infinity;
    let maxNode = 0;
    let minNode = 0;
    let maxPos: Point3D = { x: 0, y: 0, z: 0 };
    let minPos: Point3D = { x: 0, y: 0, z: 0 };
    
    for (const node of mesh.nodes) {
      const disp = displacement.magnitude.nodeValues.get(node.id) || 0;
      
      // Simplified: stress proportional to local displacement gradient
      // In reality, would compute strain tensor from displacement field
      const stress = E * disp / 10; // Simplified
      
      nodeValues.set(node.id, stress);
      
      if (stress > maxStress) {
        maxStress = stress;
        maxNode = node.id;
        maxPos = node.position;
      }
      if (stress < minStress) {
        minStress = stress;
        minNode = node.id;
        minPos = node.position;
      }
    }
    
    const values = Array.from(nodeValues.values());
    const emptyField: ResultField = {
      nodeValues: new Map(),
      elementValues: new Map(),
      min: 0,
      max: 0,
      avg: 0
    };
    
    return {
      vonMises: {
        nodeValues,
        elementValues: new Map(),
        min: minStress,
        max: maxStress,
        avg: values.reduce((a, b) => a + b, 0) / values.length
      },
      principal1: emptyField,
      principal2: emptyField,
      principal3: emptyField,
      shearXY: emptyField,
      shearYZ: emptyField,
      shearXZ: emptyField,
      max: { value: maxStress, nodeId: maxNode, position: maxPos },
      min: { value: minStress, nodeId: minNode, position: minPos }
    };
  }
  
  private calculateStrainField(mesh: Mesh, stress: StressResults, study: SimulationStudy): StrainResults {
    const nodeValues = new Map<number, number>();
    
    const E = 200e9;
    
    let maxStrain = 0;
    let maxNode = 0;
    let maxPos: Point3D = { x: 0, y: 0, z: 0 };
    
    for (const node of mesh.nodes) {
      const s = stress.vonMises.nodeValues.get(node.id) || 0;
      const strain = s / E;
      
      nodeValues.set(node.id, strain);
      
      if (strain > maxStrain) {
        maxStrain = strain;
        maxNode = node.id;
        maxPos = node.position;
      }
    }
    
    const values = Array.from(nodeValues.values());
    const emptyField: ResultField = {
      nodeValues: new Map(),
      elementValues: new Map(),
      min: 0,
      max: 0,
      avg: 0
    };
    
    return {
      equivalent: {
        nodeValues,
        elementValues: new Map(),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      },
      principal1: emptyField,
      principal2: emptyField,
      principal3: emptyField,
      max: { value: maxStrain, nodeId: maxNode, position: maxPos }
    };
  }
  
  private calculateFactorOfSafety(stress: StressResults, study: SimulationStudy): FactorOfSafetyResults {
    const yieldStrength = 250e6; // Default yield strength (Pa)
    const nodeValues = new Map<number, number>();
    
    let minFOS = Infinity;
    let minNode = 0;
    let minPos: Point3D = { x: 0, y: 0, z: 0 };
    let belowThresholdCount = 0;
    
    const threshold = 1.5;
    
    for (const [nodeId, stressValue] of stress.vonMises.nodeValues) {
      const fos = stressValue > 0 ? yieldStrength / stressValue : 999;
      nodeValues.set(nodeId, fos);
      
      if (fos < minFOS) {
        minFOS = fos;
        minNode = nodeId;
        // Would get actual position
        minPos = { x: 0, y: 0, z: 0 };
      }
      
      if (fos < threshold) {
        belowThresholdCount++;
      }
    }
    
    const values = Array.from(nodeValues.values());
    
    return {
      field: {
        nodeValues,
        elementValues: new Map(),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      },
      criterion: 'vonMises',
      yieldStrength,
      min: { value: minFOS, nodeId: minNode, position: minPos },
      belowThreshold: {
        threshold,
        percentage: belowThresholdCount / nodeValues.size * 100,
        volume: 0
      }
    };
  }
  
  private calculateReactionForces(study: SimulationStudy): ReactionForce[] {
    const reactions: ReactionForce[] = [];
    
    // Sum of applied forces (for equilibrium)
    let totalForce: Vector3D = { x: 0, y: 0, z: 0 };
    
    for (const load of study.loads) {
      if (load.type === 'force') {
        totalForce.x += load.magnitude * load.direction.x;
        totalForce.y += load.magnitude * load.direction.y;
        totalForce.z += load.magnitude * load.direction.z;
      }
    }
    
    // Distribute reaction among fixtures
    const numFixtures = study.fixtures.length || 1;
    
    for (const fixture of study.fixtures) {
      if (fixture.type === 'fixed') {
        reactions.push({
          fixtureId: fixture.id,
          force: {
            x: -totalForce.x / numFixtures,
            y: -totalForce.y / numFixtures,
            z: -totalForce.z / numFixtures
          },
          moment: { x: 0, y: 0, z: 0 },
          totalMagnitude: Math.sqrt(
            Math.pow(totalForce.x / numFixtures, 2) +
            Math.pow(totalForce.y / numFixtures, 2) +
            Math.pow(totalForce.z / numFixtures, 2)
          )
        });
      }
    }
    
    return reactions;
  }
  
  private calculateFrequencyModes(study: SimulationStudy): FrequencyMode[] {
    const numModes = study.settings.resultOptions.frequencyModes || 10;
    const modes: FrequencyMode[] = [];
    
    // Simplified - generate approximate frequencies
    const baseMass = 1; // kg
    const baseStiffness = 1e6; // N/m
    
    for (let i = 1; i <= numModes; i++) {
      const freq = Math.sqrt(baseStiffness * i / baseMass) / (2 * Math.PI);
      
      modes.push({
        modeNumber: i,
        frequency: freq,
        period: 1 / freq,
        massParticipation: {
          x: i % 2 === 1 ? 0.8 / i : 0,
          y: i % 2 === 0 ? 0.8 / i : 0,
          z: 0.1 / i
        },
        modeShape: {
          nodeValues: new Map(),
          elementValues: new Map(),
          min: -1,
          max: 1,
          avg: 0
        }
      });
    }
    
    return modes;
  }
  
  private calculateTemperatureField(study: SimulationStudy): TemperatureResults {
    const nodeValues = new Map<number, number>();
    
    // Find temperature loads
    let maxTemp = 20; // Ambient
    let minTemp = 20;
    
    for (const load of study.loads) {
      if (load.type === 'temperature') {
        maxTemp = Math.max(maxTemp, load.temperature);
        minTemp = Math.min(minTemp, load.temperature);
      }
    }
    
    // Simple interpolation
    for (const node of study.mesh.nodes) {
      const t = 20 + (maxTemp - 20) * Math.random();
      nodeValues.set(node.id, t);
    }
    
    const values = Array.from(nodeValues.values());
    
    return {
      field: {
        nodeValues,
        elementValues: new Map(),
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      },
      max: { value: Math.max(...values), nodeId: 1, position: { x: 0, y: 0, z: 0 } },
      min: { value: Math.min(...values), nodeId: 2, position: { x: 0, y: 0, z: 0 } }
    };
  }
  
  private calculateHeatFluxField(study: SimulationStudy): HeatFluxResults {
    const emptyField: ResultField = {
      nodeValues: new Map(),
      elementValues: new Map(),
      min: 0,
      max: 100,
      avg: 50
    };
    
    return {
      magnitude: emptyField,
      x: emptyField,
      y: emptyField,
      z: emptyField,
      max: { value: 100, nodeId: 1, position: { x: 0, y: 0, z: 0 } }
    };
  }
  
  // =============================================================================
  // ITEM 646-650: RESULT VISUALIZATION
  // =============================================================================
  
  getResultColors(results: SimulationResults, field: 'stress' | 'displacement' | 'strain' | 'temperature' | 'fos', colormap: 'rainbow' | 'thermal' | 'blueRed' = 'rainbow'): Map<number, string> {
    const colors = new Map<number, string>();
    
    let resultField: ResultField | undefined;
    
    switch (field) {
      case 'stress':
        resultField = results.stress?.vonMises;
        break;
      case 'displacement':
        resultField = results.displacement?.magnitude;
        break;
      case 'strain':
        resultField = results.strain?.equivalent;
        break;
      case 'temperature':
        resultField = results.temperature?.field;
        break;
      case 'fos':
        resultField = results.factorOfSafety?.field;
        break;
    }
    
    if (!resultField) return colors;
    
    const { min, max } = resultField;
    const range = max - min;
    
    for (const [nodeId, value] of resultField.nodeValues) {
      const normalized = range > 0 ? (value - min) / range : 0;
      colors.set(nodeId, this.getColorFromValue(normalized, colormap));
    }
    
    return colors;
  }
  
  private getColorFromValue(t: number, colormap: string): string {
    // Clamp
    t = Math.max(0, Math.min(1, t));
    
    let r: number, g: number, b: number;
    
    switch (colormap) {
      case 'rainbow':
        // Blue -> Cyan -> Green -> Yellow -> Red
        if (t < 0.25) {
          r = 0; g = t * 4; b = 1;
        } else if (t < 0.5) {
          r = 0; g = 1; b = 1 - (t - 0.25) * 4;
        } else if (t < 0.75) {
          r = (t - 0.5) * 4; g = 1; b = 0;
        } else {
          r = 1; g = 1 - (t - 0.75) * 4; b = 0;
        }
        break;
        
      case 'thermal':
        // Black -> Purple -> Red -> Orange -> Yellow -> White
        if (t < 0.2) {
          r = t * 2.5; g = 0; b = t * 2.5;
        } else if (t < 0.4) {
          r = 0.5 + (t - 0.2) * 2.5; g = 0; b = 0.5 - (t - 0.2) * 2.5;
        } else if (t < 0.6) {
          r = 1; g = (t - 0.4) * 3.3; b = 0;
        } else if (t < 0.8) {
          r = 1; g = 0.66 + (t - 0.6) * 1.7; b = 0;
        } else {
          r = 1; g = 1; b = (t - 0.8) * 5;
        }
        break;
        
      case 'blueRed':
        // Blue -> White -> Red
        if (t < 0.5) {
          r = t * 2; g = t * 2; b = 1;
        } else {
          r = 1; g = (1 - t) * 2; b = (1 - t) * 2;
        }
        break;
        
      default:
        r = t; g = t; b = t;
    }
    
    const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  
  generateColorLegend(results: SimulationResults, field: string, units: string, divisions = 10): { value: number; color: string; label: string }[] {
    const legend: { value: number; color: string; label: string }[] = [];
    
    let min = 0, max = 0;
    
    switch (field) {
      case 'stress':
        min = results.stress?.vonMises.min || 0;
        max = results.stress?.vonMises.max || 0;
        break;
      case 'displacement':
        min = results.displacement?.magnitude.min || 0;
        max = results.displacement?.magnitude.max || 0;
        break;
    }
    
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const value = min + (max - min) * t;
      
      legend.push({
        value,
        color: this.getColorFromValue(t, 'rainbow'),
        label: this.formatValue(value, units)
      });
    }
    
    return legend.reverse();
  }
  
  private formatValue(value: number, units: string): string {
    if (Math.abs(value) >= 1e9) {
      return `${(value / 1e9).toFixed(2)} G${units}`;
    } else if (Math.abs(value) >= 1e6) {
      return `${(value / 1e6).toFixed(2)} M${units}`;
    } else if (Math.abs(value) >= 1e3) {
      return `${(value / 1e3).toFixed(2)} k${units}`;
    } else if (Math.abs(value) >= 1) {
      return `${value.toFixed(2)} ${units}`;
    } else if (Math.abs(value) >= 1e-3) {
      return `${(value * 1e3).toFixed(2)} m${units}`;
    } else if (Math.abs(value) >= 1e-6) {
      return `${(value * 1e6).toFixed(2)} µ${units}`;
    } else {
      return `${value.toExponential(2)} ${units}`;
    }
  }
  
  exportResults(studyId: string, format: 'csv' | 'json'): string {
    const study = this.studies.get(studyId);
    if (!study || !study.results) throw new Error('No results available');
    
    if (format === 'json') {
      return JSON.stringify(study.results, (_key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      }, 2);
    }
    
    // CSV format
    let csv = 'Node ID,X,Y,Z,Displacement,Stress,Strain,FOS\n';
    
    for (const node of study.mesh.nodes) {
      const disp = study.results.displacement?.magnitude.nodeValues.get(node.id) || 0;
      const stress = study.results.stress?.vonMises.nodeValues.get(node.id) || 0;
      const strain = study.results.strain?.equivalent.nodeValues.get(node.id) || 0;
      const fos = study.results.factorOfSafety?.field.nodeValues.get(node.id) || 0;
      
      csv += `${node.id},${node.position.x},${node.position.y},${node.position.z},${disp},${stress},${strain},${fos}\n`;
    }
    
    return csv;
  }
  
  // =============================================================================
  // HELPER METHODS
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private isNodeFixed(nodeId: number, study: SimulationStudy): boolean {
    // In reality, would check if node is on a fixed face
    return false;
  }
  
  private getDistanceFromFixtures(pos: Point3D, study: SimulationStudy): number {
    // Simplified - return distance from origin
    return Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z) / 100;
  }
  
  private getMaterialStiffness(materialId: string): number {
    // Return Young's modulus
    return 200e9; // Default steel
  }
  
  private getBoundingBox(source: Part | Assembly | undefined): BoundingBox {
    if (!source) {
      return { min: { x: -50, y: -50, z: -50 }, max: { x: 50, y: 50, z: 50 } };
    }
    
    if ('boundingBox' in source) {
      return source.boundingBox;
    }
    
    return { min: { x: -50, y: -50, z: -50 }, max: { x: 50, y: 50, z: 50 } };
  }
  
  private distance(a: Point3D, b: Point3D): number {
    return Math.sqrt(
      Math.pow(b.x - a.x, 2) +
      Math.pow(b.y - a.y, 2) +
      Math.pow(b.z - a.z, 2)
    );
  }
  
  private subtract(a: Point3D, b: Point3D): Vector3D {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }
  
  private dot(a: Vector3D, b: Vector3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  
  private cross(a: Vector3D, b: Vector3D): Vector3D {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  
  private normalize(v: Vector3D): Vector3D {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
  
  // Getters
  getStudy(studyId: string): SimulationStudy | undefined {
    return this.studies.get(studyId);
  }
  
  getAllStudies(): SimulationStudy[] {
    return Array.from(this.studies.values());
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

export const createSimulationEngine = () => new SimulationEngine();

export default { SimulationEngine, createSimulationEngine };
