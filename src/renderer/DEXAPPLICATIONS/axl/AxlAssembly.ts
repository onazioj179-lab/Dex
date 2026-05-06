// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - AXL CAD Assembly Engine
// Professional assembly management and constraint solver
// Items 576-600 of the 1000-item improvement plan
// =============================================================================

import type { 
  Part, Assembly, AssemblyComponent, AssemblyConstraint,
  Matrix4, Point3D, Vector3D, Plane
} from './AxlModeling';

// =============================================================================
// ASSEMBLY TYPES
// =============================================================================

export interface AssemblyState {
  components: Map<string, ComponentState>;
  constraints: AssemblyConstraint[];
  degreeOfFreedom: number;
  solved: boolean;
  errors: ConstraintError[];
}

export interface ComponentState {
  component: AssemblyComponent;
  worldTransform: Matrix4;
  localTransform: Matrix4;
  grounded: boolean;
  dof: DOFState;
}

export interface DOFState {
  translationX: boolean;
  translationY: boolean;
  translationZ: boolean;
  rotationX: boolean;
  rotationY: boolean;
  rotationZ: boolean;
}

export interface ConstraintError {
  constraintId: string;
  type: 'overconstrained' | 'underconstrained' | 'conflict' | 'invalid';
  message: string;
}

// Constraint result after solving
export interface ConstraintResult {
  satisfied: boolean;
  error: number;
  transforms: Map<string, Matrix4>;
}

// Motion analysis
export interface MotionStudy {
  id: string;
  name: string;
  type: 'basic' | 'animation' | 'simulation';
  duration: number;
  fps: number;
  drivers: MotionDriver[];
  results: MotionResult[];
}

export interface MotionDriver {
  id: string;
  constraintId: string;
  parameter: 'distance' | 'angle' | 'rotation';
  startValue: number;
  endValue: number;
  interpolation: 'linear' | 'ease' | 'sine' | 'step';
}

export interface MotionResult {
  time: number;
  componentStates: Map<string, Matrix4>;
  interference?: InterferenceResult[];
}

export interface InterferenceResult {
  component1: string;
  component2: string;
  volume: number;
  penetrationDepth: number;
  contactPoints: Point3D[];
}

// BOM (Bill of Materials)
export interface BOMEntry {
  itemNumber: number;
  partNumber: string;
  description: string;
  quantity: number;
  material?: string;
  mass?: number;
  unit: string;
  source?: string;
  notes?: string;
}

export interface BOM {
  id: string;
  assemblyId: string;
  entries: BOMEntry[];
  totalMass: number;
  created: number;
  modified: number;
}

// Exploded View
export interface ExplodedView {
  id: string;
  name: string;
  steps: ExplosionStep[];
}

export interface ExplosionStep {
  id: string;
  order: number;
  components: string[];
  direction: Vector3D;
  distance: number;
  autoSpacing: boolean;
}

// =============================================================================
// ITEM 576-585: ASSEMBLY ENGINE
// =============================================================================

export class AssemblyEngine {
  private assemblies: Map<string, Assembly> = new Map();
  private states: Map<string, AssemblyState> = new Map();
  private parts: Map<string, Part> = new Map();
  private explodedViews: Map<string, ExplodedView[]> = new Map();
  private motionStudies: Map<string, MotionStudy[]> = new Map();
  
  // =============================================================================
  // ASSEMBLY MANAGEMENT
  // =============================================================================
  
  createAssembly(name: string): Assembly {
    const assembly: Assembly = {
      id: this.generateId(),
      name,
      components: [],
      constraints: []
    };
    
    this.assemblies.set(assembly.id, assembly);
    this.initializeAssemblyState(assembly);
    
    return assembly;
  }
  
  deleteAssembly(assemblyId: string): void {
    this.assemblies.delete(assemblyId);
    this.states.delete(assemblyId);
    this.explodedViews.delete(assemblyId);
    this.motionStudies.delete(assemblyId);
  }
  
  getAssembly(assemblyId: string): Assembly | undefined {
    return this.assemblies.get(assemblyId);
  }
  
  private initializeAssemblyState(assembly: Assembly): void {
    const state: AssemblyState = {
      components: new Map(),
      constraints: assembly.constraints,
      degreeOfFreedom: 0,
      solved: true,
      errors: []
    };
    
    this.states.set(assembly.id, state);
  }
  
  // =============================================================================
  // COMPONENT MANAGEMENT
  // =============================================================================
  
  addComponent(assemblyId: string, options: {
    partId?: string;
    subAssemblyId?: string;
    name: string;
    transform?: Matrix4;
    grounded?: boolean;
  }): AssemblyComponent {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const component: AssemblyComponent = {
      id: this.generateId(),
      partId: options.partId,
      assemblyId: options.subAssemblyId,
      name: options.name,
      transform: options.transform || this.identityMatrix(),
      suppressed: false,
      flexible: false
    };
    
    assembly.components.push(component);
    
    // Update state
    const state = this.states.get(assemblyId);
    if (state) {
      state.components.set(component.id, {
        component,
        worldTransform: component.transform,
        localTransform: component.transform,
        grounded: options.grounded || assembly.components.length === 1, // First component is grounded
        dof: options.grounded ? this.lockedDOF() : this.freeDOF()
      });
      
      this.updateDOF(assemblyId);
    }
    
    return component;
  }
  
  removeComponent(assemblyId: string, componentId: string): void {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) return;
    
    assembly.components = assembly.components.filter(c => c.id !== componentId);
    
    // Remove constraints referencing this component
    assembly.constraints = assembly.constraints.filter(c => {
      const constraintAny = c as unknown as Record<string, unknown>;
      return constraintAny.component1 !== componentId && constraintAny.component2 !== componentId;
    });
    
    const state = this.states.get(assemblyId);
    if (state) {
      state.components.delete(componentId);
      this.updateDOF(assemblyId);
    }
  }
  
  moveComponent(assemblyId: string, componentId: string, transform: Matrix4): void {
    const state = this.states.get(assemblyId);
    if (!state) return;
    
    const compState = state.components.get(componentId);
    if (!compState || compState.grounded) return;
    
    compState.localTransform = transform;
    compState.worldTransform = transform;
    
    // Re-solve constraints
    this.solveConstraints(assemblyId);
  }
  
  groundComponent(assemblyId: string, componentId: string, grounded: boolean): void {
    const state = this.states.get(assemblyId);
    if (!state) return;
    
    const compState = state.components.get(componentId);
    if (compState) {
      compState.grounded = grounded;
      compState.dof = grounded ? this.lockedDOF() : this.freeDOF();
      this.updateDOF(assemblyId);
    }
  }
  
  // =============================================================================
  // ITEM 586-590: CONSTRAINT SYSTEM
  // =============================================================================
  
  addMateConstraint(assemblyId: string, component1: string, face1: string, component2: string, face2: string, offset = 0, flip = false): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'mate',
      id: this.generateId(),
      component1,
      face1,
      component2,
      face2,
      offset,
      flip
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  addAlignConstraint(assemblyId: string, component1: string, entity1: string, component2: string, entity2: string, offset = 0): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'align',
      id: this.generateId(),
      component1,
      entity1,
      component2,
      entity2,
      offset
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  addInsertConstraint(assemblyId: string, component1: string, face1: string, component2: string, face2: string, offset = 0): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'insert',
      id: this.generateId(),
      component1,
      face1,
      component2,
      face2,
      offset
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  addAngleConstraint(assemblyId: string, component1: string, face1: string, component2: string, face2: string, angle: number): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'angle',
      id: this.generateId(),
      component1,
      face1,
      component2,
      face2,
      angle
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  addTangentConstraint(assemblyId: string, component1: string, face1: string, component2: string, face2: string): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'tangent',
      id: this.generateId(),
      component1,
      face1,
      component2,
      face2
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  addGearConstraint(assemblyId: string, component1: string, axis1: string, teeth1: number, component2: string, axis2: string, teeth2: number): AssemblyConstraint {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const constraint: AssemblyConstraint = {
      type: 'gear',
      id: this.generateId(),
      component1,
      axis1,
      teeth1,
      component2,
      axis2,
      teeth2
    };
    
    assembly.constraints.push(constraint);
    this.solveConstraints(assemblyId);
    
    return constraint;
  }
  
  removeConstraint(assemblyId: string, constraintId: string): void {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) return;
    
    assembly.constraints = assembly.constraints.filter(c => c.id !== constraintId);
    this.solveConstraints(assemblyId);
  }
  
  updateConstraintValue(assemblyId: string, constraintId: string, property: string, value: unknown): void {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) return;
    
    const constraint = assembly.constraints.find(c => c.id === constraintId);
    if (constraint) {
      (constraint as unknown as Record<string, unknown>)[property] = value;
      this.solveConstraints(assemblyId);
    }
  }
  
  // =============================================================================
  // CONSTRAINT SOLVER
  // =============================================================================
  
  solveConstraints(assemblyId: string): boolean {
    const assembly = this.assemblies.get(assemblyId);
    const state = this.states.get(assemblyId);
    if (!assembly || !state) return false;
    
    state.errors = [];
    
    // Iterative constraint solver
    const maxIterations = 100;
    const tolerance = 0.001;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      let maxError = 0;
      
      for (const constraint of assembly.constraints) {
        const result = this.applyConstraint(assemblyId, constraint);
        
        if (!result.satisfied) {
          maxError = Math.max(maxError, result.error);
          
          // Apply transforms
          for (const [compId, transform] of result.transforms) {
            const compState = state.components.get(compId);
            if (compState && !compState.grounded) {
              compState.worldTransform = this.multiplyMatrices(compState.worldTransform, transform);
            }
          }
        }
      }
      
      if (maxError < tolerance) {
        state.solved = true;
        this.updateDOF(assemblyId);
        return true;
      }
    }
    
    state.solved = false;
    state.errors.push({
      constraintId: '',
      type: 'underconstrained',
      message: 'Constraint solver did not converge'
    });
    
    return false;
  }
  
  private applyConstraint(assemblyId: string, constraint: AssemblyConstraint): ConstraintResult {
    const state = this.states.get(assemblyId);
    if (!state) return { satisfied: false, error: Infinity, transforms: new Map() };
    
    switch (constraint.type) {
      case 'mate':
        return this.solveMateConstraint(state, constraint);
      case 'align':
        return this.solveAlignConstraint(state, constraint);
      case 'insert':
        return this.solveInsertConstraint(state, constraint);
      case 'angle':
        return this.solveAngleConstraint(state, constraint);
      default:
        return { satisfied: true, error: 0, transforms: new Map() };
    }
  }
  
  private solveMateConstraint(state: AssemblyState, constraint: AssemblyConstraint & { type: 'mate' }): ConstraintResult {
    const comp1 = state.components.get(constraint.component1);
    const comp2 = state.components.get(constraint.component2);
    
    if (!comp1 || !comp2) {
      return { satisfied: false, error: Infinity, transforms: new Map() };
    }
    
    // Get face normals and positions (simplified - would need actual geometry)
    const normal1 = this.getFaceNormal(constraint.face1);
    const normal2 = this.getFaceNormal(constraint.face2);
    const pos1 = this.getFaceCenter(constraint.face1);
    const pos2 = this.getFaceCenter(constraint.face2);
    
    // Transform by component transforms
    const worldNormal1 = this.transformVector(normal1, comp1.worldTransform);
    const worldNormal2 = this.transformVector(normal2, comp2.worldTransform);
    const worldPos1 = this.transformPoint(pos1, comp1.worldTransform);
    const worldPos2 = this.transformPoint(pos2, comp2.worldTransform);
    
    // Calculate error
    const targetNormal = constraint.flip ? worldNormal1 : this.negateVector(worldNormal1);
    const normalError = this.vectorDistance(worldNormal2, targetNormal);
    const positionError = this.pointDistance(worldPos1, worldPos2) - constraint.offset;
    
    const error = normalError + Math.abs(positionError);
    
    if (error < 0.001) {
      return { satisfied: true, error: 0, transforms: new Map() };
    }
    
    // Calculate correction transform
    const transforms = new Map<string, Matrix4>();
    
    if (!comp2.grounded) {
      // Move comp2 to satisfy constraint
      const correction = this.createTranslation(
        worldPos1.x - worldPos2.x + constraint.offset * worldNormal1.x,
        worldPos1.y - worldPos2.y + constraint.offset * worldNormal1.y,
        worldPos1.z - worldPos2.z + constraint.offset * worldNormal1.z
      );
      transforms.set(constraint.component2, correction);
    }
    
    return { satisfied: false, error, transforms };
  }
  
  private solveAlignConstraint(state: AssemblyState, constraint: AssemblyConstraint & { type: 'align' }): ConstraintResult {
    const comp1 = state.components.get(constraint.component1);
    const comp2 = state.components.get(constraint.component2);
    
    if (!comp1 || !comp2) {
      return { satisfied: false, error: Infinity, transforms: new Map() };
    }
    
    // Get axis directions (simplified)
    const axis1 = this.getEntityAxis(constraint.entity1);
    const axis2 = this.getEntityAxis(constraint.entity2);
    
    const worldAxis1 = this.transformVector(axis1, comp1.worldTransform);
    const worldAxis2 = this.transformVector(axis2, comp2.worldTransform);
    
    const error = this.vectorDistance(worldAxis1, worldAxis2);
    
    return { satisfied: error < 0.001, error, transforms: new Map() };
  }
  
  private solveInsertConstraint(state: AssemblyState, constraint: AssemblyConstraint & { type: 'insert' }): ConstraintResult {
    // Insert = mate + concentric (axis alignment + face contact)
    const mateResult = this.solveMateConstraint(state, { ...constraint, type: 'mate', flip: false });
    
    // Additional axis alignment would go here
    
    return mateResult;
  }
  
  private solveAngleConstraint(state: AssemblyState, constraint: AssemblyConstraint & { type: 'angle' }): ConstraintResult {
    const comp1 = state.components.get(constraint.component1);
    const comp2 = state.components.get(constraint.component2);
    
    if (!comp1 || !comp2) {
      return { satisfied: false, error: Infinity, transforms: new Map() };
    }
    
    const normal1 = this.getFaceNormal(constraint.face1);
    const normal2 = this.getFaceNormal(constraint.face2);
    
    const worldNormal1 = this.transformVector(normal1, comp1.worldTransform);
    const worldNormal2 = this.transformVector(normal2, comp2.worldTransform);
    
    const currentAngle = Math.acos(this.dotProduct(worldNormal1, worldNormal2)) * 180 / Math.PI;
    const error = Math.abs(currentAngle - constraint.angle);
    
    return { satisfied: error < 0.1, error, transforms: new Map() };
  }
  
  private updateDOF(assemblyId: string): void {
    const state = this.states.get(assemblyId);
    const assembly = this.assemblies.get(assemblyId);
    if (!state || !assembly) return;
    
    let totalDOF = 0;
    
    for (const compState of state.components.values()) {
      if (compState.grounded) continue;
      
      // Each free component has 6 DOF
      let compDOF = 6;
      
      // Constraints reduce DOF
      for (const constraint of assembly.constraints) {
        const constraintAny = constraint as unknown as Record<string, unknown>;
        if (constraintAny.component1 === compState.component.id || 
            constraintAny.component2 === compState.component.id) {
          switch (constraint.type) {
            case 'mate': compDOF -= 3; break;      // Removes 3 DOF (position + 2 rotation)
            case 'align': compDOF -= 2; break;    // Removes 2 DOF (2 rotation)
            case 'insert': compDOF -= 5; break;   // Removes 5 DOF (position + 2 rotation + 1 translation)
            case 'angle': compDOF -= 1; break;    // Removes 1 DOF (1 rotation)
            case 'tangent': compDOF -= 1; break;  // Removes 1 DOF
          }
        }
      }
      
      totalDOF += Math.max(0, compDOF);
      
      // Update component DOF state
      compState.dof = {
        translationX: compDOF > 0,
        translationY: compDOF > 1,
        translationZ: compDOF > 2,
        rotationX: compDOF > 3,
        rotationY: compDOF > 4,
        rotationZ: compDOF > 5
      };
    }
    
    state.degreeOfFreedom = totalDOF;
  }
  
  // =============================================================================
  // ITEM 591-595: EXPLODED VIEWS
  // =============================================================================
  
  createExplodedView(assemblyId: string, name: string): ExplodedView {
    const view: ExplodedView = {
      id: this.generateId(),
      name,
      steps: []
    };
    
    const views = this.explodedViews.get(assemblyId) || [];
    views.push(view);
    this.explodedViews.set(assemblyId, views);
    
    return view;
  }
  
  addExplosionStep(assemblyId: string, viewId: string, options: {
    components: string[];
    direction: Vector3D;
    distance: number;
    autoSpacing?: boolean;
  }): ExplosionStep {
    const views = this.explodedViews.get(assemblyId);
    if (!views) throw new Error('No exploded views for this assembly');
    
    const view = views.find(v => v.id === viewId);
    if (!view) throw new Error('Exploded view not found');
    
    const step: ExplosionStep = {
      id: this.generateId(),
      order: view.steps.length + 1,
      components: options.components,
      direction: this.normalizeVector(options.direction),
      distance: options.distance,
      autoSpacing: options.autoSpacing || false
    };
    
    view.steps.push(step);
    return step;
  }
  
  autoExplode(assemblyId: string, viewId: string): void {
    const assembly = this.assemblies.get(assemblyId);
    const views = this.explodedViews.get(assemblyId);
    if (!assembly || !views) return;
    
    const view = views.find(v => v.id === viewId);
    if (!view) return;
    
    // Clear existing steps
    view.steps = [];
    
    // Auto-generate explosion based on assembly hierarchy and constraints
    const processed = new Set<string>();
    let order = 1;
    
    // Start with components that have fewer constraints (easier to remove)
    const componentConstraintCount = new Map<string, number>();
    
    for (const comp of assembly.components) {
      let count = 0;
      for (const constraint of assembly.constraints) {
        const constraintAny = constraint as unknown as Record<string, unknown>;
        if (constraintAny.component1 === comp.id || constraintAny.component2 === comp.id) {
          count++;
        }
      }
      componentConstraintCount.set(comp.id, count);
    }
    
    const sortedComponents = [...assembly.components].sort((a, b) => {
      return (componentConstraintCount.get(a.id) || 0) - (componentConstraintCount.get(b.id) || 0);
    });
    
    for (const comp of sortedComponents) {
      if (processed.has(comp.id)) continue;
      
      // Determine explosion direction based on constraints
      let direction: Vector3D = { x: 0, y: 1, z: 0 }; // Default up
      
      for (const constraint of assembly.constraints) {
        const constraintAny = constraint as unknown as Record<string, unknown>;
        if (constraintAny.component1 === comp.id || constraintAny.component2 === comp.id) {
          if (constraint.type === 'mate' || constraint.type === 'insert') {
            // Use face normal as explosion direction
            const faceId = constraintAny.component1 === comp.id 
              ? constraintAny.face1 as string
              : constraintAny.face2 as string;
            direction = this.getFaceNormal(faceId);
            break;
          }
        }
      }
      
      view.steps.push({
        id: this.generateId(),
        order: order++,
        components: [comp.id],
        direction,
        distance: 50, // Default distance
        autoSpacing: true
      });
      
      processed.add(comp.id);
    }
  }
  
  getExplodedTransforms(assemblyId: string, viewId: string, progress: number = 1): Map<string, Matrix4> {
    const views = this.explodedViews.get(assemblyId);
    const state = this.states.get(assemblyId);
    if (!views || !state) return new Map();
    
    const view = views.find(v => v.id === viewId);
    if (!view) return new Map();
    
    const transforms = new Map<string, Matrix4>();
    
    for (const step of view.steps) {
      const effectiveProgress = Math.min(1, Math.max(0, progress));
      const effectiveDistance = step.distance * effectiveProgress;
      
      const translation = this.createTranslation(
        step.direction.x * effectiveDistance,
        step.direction.y * effectiveDistance,
        step.direction.z * effectiveDistance
      );
      
      for (const compId of step.components) {
        const compState = state.components.get(compId);
        if (compState) {
          transforms.set(compId, this.multiplyMatrices(compState.worldTransform, translation));
        }
      }
    }
    
    return transforms;
  }
  
  // =============================================================================
  // ITEM 596-600: BILL OF MATERIALS
  // =============================================================================
  
  generateBOM(assemblyId: string): BOM {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) throw new Error('Assembly not found');
    
    const bom: BOM = {
      id: this.generateId(),
      assemblyId,
      entries: [],
      totalMass: 0,
      created: Date.now(),
      modified: Date.now()
    };
    
    // Count parts
    const partCounts = new Map<string, number>();
    
    for (const component of assembly.components) {
      if (component.suppressed) continue;
      
      if (component.partId) {
        const count = partCounts.get(component.partId) || 0;
        partCounts.set(component.partId, count + 1);
      } else if (component.assemblyId) {
        // Recursively add sub-assembly parts
        const subBom = this.generateBOM(component.assemblyId);
        for (const entry of subBom.entries) {
          const existing = bom.entries.find(e => e.partNumber === entry.partNumber);
          if (existing) {
            existing.quantity += entry.quantity;
          } else {
            bom.entries.push({ ...entry, itemNumber: bom.entries.length + 1 });
          }
        }
        bom.totalMass += subBom.totalMass;
      }
    }
    
    // Create entries for parts
    let itemNumber = bom.entries.length + 1;
    for (const [partId, quantity] of partCounts) {
      const part = this.parts.get(partId);
      
      const entry: BOMEntry = {
        itemNumber: itemNumber++,
        partNumber: partId,
        description: part?.name || 'Unknown Part',
        quantity,
        material: part?.material?.name,
        mass: this.calculatePartMass(part),
        unit: 'ea',
        source: 'Make'
      };
      
      bom.entries.push(entry);
      bom.totalMass += (entry.mass || 0) * quantity;
    }
    
    return bom;
  }
  
  private calculatePartMass(part?: Part): number {
    if (!part || !part.material) return 0;
    
    // Calculate volume from bounding box (simplified)
    const bbox = part.boundingBox;
    const volume = (bbox.max.x - bbox.min.x) * 
                   (bbox.max.y - bbox.min.y) * 
                   (bbox.max.z - bbox.min.z) / 1e9; // mm³ to m³
    
    return volume * part.material.density;
  }
  
  exportBOMToCSV(bom: BOM): string {
    const headers = ['Item', 'Part Number', 'Description', 'Qty', 'Material', 'Mass (kg)', 'Unit', 'Source', 'Notes'];
    const rows = [headers.join(',')];
    
    for (const entry of bom.entries) {
      const row = [
        entry.itemNumber,
        `"${entry.partNumber}"`,
        `"${entry.description}"`,
        entry.quantity,
        `"${entry.material || ''}"`,
        entry.mass?.toFixed(3) || '',
        entry.unit,
        `"${entry.source || ''}"`,
        `"${entry.notes || ''}"`
      ];
      rows.push(row.join(','));
    }
    
    rows.push('');
    rows.push(`Total Mass:,${bom.totalMass.toFixed(3)} kg`);
    
    return rows.join('\n');
  }
  
  // =============================================================================
  // INTERFERENCE DETECTION
  // =============================================================================
  
  checkInterference(assemblyId: string): InterferenceResult[] {
    const assembly = this.assemblies.get(assemblyId);
    const state = this.states.get(assemblyId);
    if (!assembly || !state) return [];
    
    const results: InterferenceResult[] = [];
    const components = Array.from(state.components.values());
    
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const comp1 = components[i];
        const comp2 = components[j];
        
        const interference = this.checkComponentInterference(comp1, comp2);
        if (interference) {
          results.push(interference);
        }
      }
    }
    
    return results;
  }
  
  private checkComponentInterference(comp1: ComponentState, comp2: ComponentState): InterferenceResult | null {
    // Simplified AABB collision check
    const bbox1 = this.getTransformedBoundingBox(comp1);
    const bbox2 = this.getTransformedBoundingBox(comp2);
    
    if (bbox1.max.x < bbox2.min.x || bbox1.min.x > bbox2.max.x) return null;
    if (bbox1.max.y < bbox2.min.y || bbox1.min.y > bbox2.max.y) return null;
    if (bbox1.max.z < bbox2.min.z || bbox1.min.z > bbox2.max.z) return null;
    
    // Calculate overlap
    const overlapX = Math.min(bbox1.max.x, bbox2.max.x) - Math.max(bbox1.min.x, bbox2.min.x);
    const overlapY = Math.min(bbox1.max.y, bbox2.max.y) - Math.max(bbox1.min.y, bbox2.min.y);
    const overlapZ = Math.min(bbox1.max.z, bbox2.max.z) - Math.max(bbox1.min.z, bbox2.min.z);
    
    const volume = overlapX * overlapY * overlapZ;
    const penetration = Math.min(overlapX, overlapY, overlapZ);
    
    return {
      component1: comp1.component.id,
      component2: comp2.component.id,
      volume,
      penetrationDepth: penetration,
      contactPoints: [] // Would need actual geometry to compute
    };
  }
  
  private getTransformedBoundingBox(comp: ComponentState): { min: Point3D; max: Point3D } {
    // Simplified - return unit cube transformed
    const corners = [
      { x: -1, y: -1, z: -1 },
      { x: 1, y: -1, z: -1 },
      { x: -1, y: 1, z: -1 },
      { x: 1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 },
      { x: 1, y: -1, z: 1 },
      { x: -1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 }
    ];
    
    const transformed = corners.map(c => this.transformPoint(c, comp.worldTransform));
    
    return {
      min: {
        x: Math.min(...transformed.map(p => p.x)),
        y: Math.min(...transformed.map(p => p.y)),
        z: Math.min(...transformed.map(p => p.z))
      },
      max: {
        x: Math.max(...transformed.map(p => p.x)),
        y: Math.max(...transformed.map(p => p.y)),
        z: Math.max(...transformed.map(p => p.z))
      }
    };
  }
  
  // =============================================================================
  // MOTION STUDY
  // =============================================================================
  
  createMotionStudy(assemblyId: string, name: string, type: 'basic' | 'animation' | 'simulation' = 'basic'): MotionStudy {
    const study: MotionStudy = {
      id: this.generateId(),
      name,
      type,
      duration: 1,
      fps: 30,
      drivers: [],
      results: []
    };
    
    const studies = this.motionStudies.get(assemblyId) || [];
    studies.push(study);
    this.motionStudies.set(assemblyId, studies);
    
    return study;
  }
  
  addMotionDriver(assemblyId: string, studyId: string, options: {
    constraintId: string;
    parameter: 'distance' | 'angle' | 'rotation';
    startValue: number;
    endValue: number;
    interpolation?: 'linear' | 'ease' | 'sine' | 'step';
  }): MotionDriver {
    const studies = this.motionStudies.get(assemblyId);
    if (!studies) throw new Error('No motion studies for this assembly');
    
    const study = studies.find(s => s.id === studyId);
    if (!study) throw new Error('Motion study not found');
    
    const driver: MotionDriver = {
      id: this.generateId(),
      constraintId: options.constraintId,
      parameter: options.parameter,
      startValue: options.startValue,
      endValue: options.endValue,
      interpolation: options.interpolation || 'linear'
    };
    
    study.drivers.push(driver);
    return driver;
  }
  
  runMotionStudy(assemblyId: string, studyId: string): MotionResult[] {
    const studies = this.motionStudies.get(assemblyId);
    const assembly = this.assemblies.get(assemblyId);
    if (!studies || !assembly) return [];
    
    const study = studies.find(s => s.id === studyId);
    if (!study) return [];
    
    const results: MotionResult[] = [];
    const totalFrames = study.duration * study.fps;
    
    for (let frame = 0; frame <= totalFrames; frame++) {
      const time = frame / study.fps;
      const progress = frame / totalFrames;
      
      // Apply drivers
      for (const driver of study.drivers) {
        const constraint = assembly.constraints.find(c => c.id === driver.constraintId);
        if (!constraint) continue;
        
        const value = this.interpolateValue(
          driver.startValue,
          driver.endValue,
          progress,
          driver.interpolation
        );
        
        (constraint as unknown as Record<string, unknown>)[driver.parameter === 'distance' ? 'offset' : 'angle'] = value;
      }
      
      // Solve and record
      this.solveConstraints(assemblyId);
      
      const state = this.states.get(assemblyId);
      if (state) {
        const componentStates = new Map<string, Matrix4>();
        for (const [id, compState] of state.components) {
          componentStates.set(id, { ...compState.worldTransform });
        }
        
        results.push({
          time,
          componentStates,
          interference: this.checkInterference(assemblyId)
        });
      }
    }
    
    study.results = results;
    return results;
  }
  
  private interpolateValue(start: number, end: number, t: number, type: string): number {
    switch (type) {
      case 'linear':
        return start + (end - start) * t;
      case 'ease':
        const ease = t * t * (3 - 2 * t);
        return start + (end - start) * ease;
      case 'sine':
        return start + (end - start) * (0.5 - Math.cos(t * Math.PI) * 0.5);
      case 'step':
        return t < 1 ? start : end;
      default:
        return start + (end - start) * t;
    }
  }
  
  // =============================================================================
  // HELPER METHODS
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private identityMatrix(): Matrix4 {
    return {
      elements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    };
  }
  
  private freeDOF(): DOFState {
    return {
      translationX: true,
      translationY: true,
      translationZ: true,
      rotationX: true,
      rotationY: true,
      rotationZ: true
    };
  }
  
  private lockedDOF(): DOFState {
    return {
      translationX: false,
      translationY: false,
      translationZ: false,
      rotationX: false,
      rotationY: false,
      rotationZ: false
    };
  }
  
  private createTranslation(x: number, y: number, z: number): Matrix4 {
    return {
      elements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1
      ]
    };
  }
  
  private multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const result = new Array(16).fill(0);
    
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        for (let i = 0; i < 4; i++) {
          result[row * 4 + col] += a.elements[row * 4 + i] * b.elements[i * 4 + col];
        }
      }
    }
    
    return { elements: result };
  }
  
  private transformPoint(p: Point3D, m: Matrix4): Point3D {
    const e = m.elements;
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
    
    return {
      x: (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / w,
      y: (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / w,
      z: (e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]) / w
    };
  }
  
  private transformVector(v: Vector3D, m: Matrix4): Vector3D {
    const e = m.elements;
    return {
      x: e[0] * v.x + e[4] * v.y + e[8] * v.z,
      y: e[1] * v.x + e[5] * v.y + e[9] * v.z,
      z: e[2] * v.x + e[6] * v.y + e[10] * v.z
    };
  }
  
  private normalizeVector(v: Vector3D): Vector3D {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
  
  private negateVector(v: Vector3D): Vector3D {
    return { x: -v.x, y: -v.y, z: -v.z };
  }
  
  private dotProduct(a: Vector3D, b: Vector3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  
  private vectorDistance(a: Vector3D, b: Vector3D): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }
  
  private pointDistance(a: Point3D, b: Point3D): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }
  
  // Geometry helpers (simplified - would need actual geometry)
  private getFaceNormal(faceId: string): Vector3D {
    // Parse face ID to determine normal (simplified)
    if (faceId.includes('top')) return { x: 0, y: 0, z: 1 };
    if (faceId.includes('bottom')) return { x: 0, y: 0, z: -1 };
    if (faceId.includes('front')) return { x: 0, y: 1, z: 0 };
    if (faceId.includes('back')) return { x: 0, y: -1, z: 0 };
    if (faceId.includes('left')) return { x: -1, y: 0, z: 0 };
    if (faceId.includes('right')) return { x: 1, y: 0, z: 0 };
    return { x: 0, y: 0, z: 1 };
  }
  
  private getFaceCenter(faceId: string): Point3D {
    // Would compute from actual geometry
    return { x: 0, y: 0, z: 0 };
  }
  
  private getEntityAxis(entityId: string): Vector3D {
    // Would compute from actual geometry
    return { x: 0, y: 0, z: 1 };
  }
  
  // Getters
  getAssemblyState(assemblyId: string): AssemblyState | undefined {
    return this.states.get(assemblyId);
  }
  
  getExplodedViews(assemblyId: string): ExplodedView[] {
    return this.explodedViews.get(assemblyId) || [];
  }
  
  getMotionStudies(assemblyId: string): MotionStudy[] {
    return this.motionStudies.get(assemblyId) || [];
  }
  
  setPart(partId: string, part: Part): void {
    this.parts.set(partId, part);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createAssemblyEngine = () => new AssemblyEngine();

export default { AssemblyEngine, createAssemblyEngine };
