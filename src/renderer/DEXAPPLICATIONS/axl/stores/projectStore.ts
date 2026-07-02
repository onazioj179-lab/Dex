// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Project Store -- Zustand with persist
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AXLProject, Part, Constraint, ConstraintType, Measurement, GDTAnnotation,
  BOMEntry, Material, PartFeature, PrimitiveType, BooleanOp, Vec3,
  Transform, Sketch, SketchEntity, SketchConstraint, SketchDimension, Parameter,
  SimulationResult, Configuration, ConfigurationPart, NamedView,
} from '../types';
import { MATERIAL_DB } from '../constants';
import { genId, vec3, defaultTransform, calcVolume, calcWeight, formatWeight } from '../utils/math';
import { ConstraintSolver } from '../engine/ConstraintSolver';
import { snapshotConfiguration } from '../AxlInspect';

// The iterative solver understands a core set of geometric constraint types.
// The UI offers a few CAD-friendly aliases (mate/align/offset) that map onto
// those primitives so the engine can actually resolve them.
const SOLVER_TYPE_ALIAS: Record<string, ConstraintType> = {
  mate: 'coincident',
  align: 'parallel',
  offset: 'distance',
};

// Shared solver instance — stateless between solves, safe to reuse.
const constraintSolver = new ConstraintSolver();

function createDefaultProject(): AXLProject {
  const boxId = genId();
  const cylId = genId();
  return {
    name: 'Starter Project',
    units: 'mm',
    gridSnap: 1.0,
    assembly: {
      id: genId(),
      name: 'Main Assembly',
      parts: [
        {
          id: boxId,
          name: 'Base Plate',
          transform: { position: vec3(0, 0, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) },
          material: MATERIAL_DB[0],
          features: [{ id: genId(), type: 'primitive', name: 'box', params: { primitiveType: 'box', width: 80, height: 10, depth: 60 }, visible: true, locked: false }],
          meshVertexCount: 24,
          visible: true,
          selected: false,
          color: MATERIAL_DB[0].color,
        },
        {
          id: cylId,
          name: 'Shaft',
          transform: { position: vec3(0, 30, 0), rotation: vec3(0, 0, 0), scale: vec3(1, 1, 1) },
          material: MATERIAL_DB[0],
          features: [{ id: genId(), type: 'primitive', name: 'cylinder', params: { primitiveType: 'cylinder', radius: 12, height: 50, segments: 32 }, visible: true, locked: false }],
          meshVertexCount: 128,
          visible: true,
          selected: false,
          color: '#4a90d9',
        },
      ],
      constraints: [],
      exploded: false,
      explodeDistance: 50,
    },
    measurements: [],
    annotations: [],
    bom: [],
    drawingViews: [],
    dimensionLines: [],
    sketches: [],
    parameters: [],
    configurations: [],
    namedViews: [],
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    version: 1,
  };
}

interface UndoState {
  undoStack: AXLProject[];
  redoStack: AXLProject[];
}

interface ProjectStore {
  // Project data
  project: AXLProject;

  // Undo/Redo
  undoStack: AXLProject[];
  redoStack: AXLProject[];
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  // Project-level
  setProjectName: (name: string) => void;
  setUnits: (units: 'mm' | 'in' | 'm') => void;
  setGridSnap: (snap: number) => void;

  // Part operations
  addPrimitive: (type: PrimitiveType, customParams?: Record<string, number>, customName?: string) => string;
  addMeshPart: (name: string, mesh: { positions: number[]; normals: number[]; indices: number[] }) => string;
  deletePart: (partId: string) => void;
  duplicatePart: (partId: string) => string | null;
  applyBoolean: (op: BooleanOp, partIds: string[]) => void;
  setPartMaterial: (partId: string, mat: Material) => void;
  updatePartTransform: (partId: string, key: keyof Transform, axis: keyof Vec3, value: number) => void;
  togglePartVisibility: (partId: string) => void;
  addFeature: (partId: string, feature: PartFeature) => void;
  toggleFeatureSuppression: (partId: string, featureId: string) => void;

  // Constraints
  addConstraint: (type: ConstraintType, partAId: string, partBId: string, value?: number) => void;
  removeConstraint: (constraintId: string) => void;
  solveConstraints: () => { converged: boolean; moved: number; unsatisfied: number };

  // Assembly
  toggleExplodedView: () => void;
  setExplodeDistance: (distance: number) => void;

  // Measurements
  addMeasurement: (type: Measurement['type'], points: Vec3[], value: number) => void;
  removeMeasurement: (id: string) => void;

  // Annotations
  addAnnotation: (annotation: GDTAnnotation) => void;
  removeAnnotation: (id: string) => void;

  // BOM
  generateBOM: () => void;

  // Sketches
  addSketch: (sketch: Sketch) => void;
  updateSketch: (sketchId: string, sketch: Partial<Sketch>) => void;

  // Parameters
  setParameter: (name: string, value: number, expression?: string) => void;
  removeParameter: (name: string) => void;

  // Configurations / Design Variants
  saveConfiguration: (name: string) => string;
  applyConfiguration: (configId: string) => void;
  deleteConfiguration: (configId: string) => void;

  // Named Views / Saved Cameras
  saveNamedView: (view: Omit<NamedView, 'id'>) => string;
  deleteNamedView: (viewId: string) => void;

  // Simulation (results stored separately)
  simResults: SimulationResult | null;
  setSimResults: (results: SimulationResult | null) => void;

  // Reset
  newProject: () => void;
  loadProject: (project: AXLProject) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      project: createDefaultProject(),
      undoStack: [],
      redoStack: [],
      simResults: null,

      pushUndo: () => set((state: ProjectStore) => ({
        undoStack: [...state.undoStack.slice(-49), state.project],
        redoStack: [],
      })),

      undo: () => set((state: ProjectStore) => {
        if (state.undoStack.length === 0) return state;
        const last = state.undoStack[state.undoStack.length - 1];
        return {
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, state.project],
          project: last,
        };
      }),

      redo: () => set((state: ProjectStore) => {
        if (state.redoStack.length === 0) return state;
        const last = state.redoStack[state.redoStack.length - 1];
        return {
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, state.project],
          project: last,
        };
      }),

      setProjectName: (name: string) => set((state: ProjectStore) => ({
        project: { ...state.project, name, modifiedAt: Date.now() },
      })),

      setUnits: (units: 'mm' | 'in' | 'm') => set((state: ProjectStore) => ({
        project: { ...state.project, units, modifiedAt: Date.now() },
      })),

      setGridSnap: (snap: number) => set((state: ProjectStore) => ({
        project: { ...state.project, gridSnap: snap, modifiedAt: Date.now() },
      })),

      addPrimitive: (type: PrimitiveType, customParams?: Record<string, number>, customName?: string) => {
        const state = get();
        state.pushUndo();
        const defaults: Record<PrimitiveType, Record<string, number>> = {
          box: { width: 50, height: 50, depth: 50 },
          cylinder: { radius: 25, height: 50, segments: 32 },
          sphere: { radius: 25, segments: 32 },
          cone: { radius: 25, height: 50, segments: 32 },
          torus: { ringRadius: 30, tubeRadius: 10, segments: 32 },
          tube: { outerRadius: 25, innerRadius: 18, height: 50, segments: 32 },
          wedge: { width: 50, height: 50, depth: 50 },
        };
        const params = customParams ? { ...defaults[type], ...customParams } : defaults[type];
        const partId = genId();
        const part: Part = {
          id: partId,
          name: customName || `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.project.assembly.parts.length + 1}`,
          transform: defaultTransform(),
          material: MATERIAL_DB[0],
          features: [{
            id: genId(),
            type: 'primitive',
            name: type,
            params: { primitiveType: type, ...params },
            visible: true,
            locked: false,
          }],
          meshVertexCount: (params.segments || 8) * 4,
          visible: true,
          selected: false,
          color: MATERIAL_DB[0].color,
        };
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: { ...state.project.assembly, parts: [...state.project.assembly.parts, part] },
          },
        }));
        return partId;
      },

      addMeshPart: (name: string, mesh: { positions: number[]; normals: number[]; indices: number[] }) => {
        const state = get();
        state.pushUndo();
        const partId = genId();
        const part: Part = {
          id: partId,
          name: name || `Imported ${state.project.assembly.parts.length + 1}`,
          transform: defaultTransform(),
          material: MATERIAL_DB[0],
          features: [{
            id: genId(),
            type: 'mesh',
            name: name || 'Imported Mesh',
            params: { primitiveType: 'mesh' },
            visible: true,
            locked: false,
            mesh,
          }],
          meshVertexCount: mesh.positions.length / 3,
          visible: true,
          selected: false,
          color: MATERIAL_DB[0].color,
        };
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            modifiedAt: Date.now(),
            assembly: { ...s.project.assembly, parts: [...s.project.assembly.parts, part] },
          },
        }));
        return partId;
      },

      deletePart: (partId: string) => {
        get().pushUndo();
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.filter((p: Part) => p.id !== partId),
              constraints: state.project.assembly.constraints.filter((c: Constraint) => c.partA !== partId && c.partB !== partId),
            },
          },
        }));
      },

      duplicatePart: (partId: string) => {
        const state = get();
        const original = state.project.assembly.parts.find((p: Part) => p.id === partId);
        if (!original) return null;
        state.pushUndo();
        const newId = genId();
        const clone: Part = {
          ...original,
          id: newId,
          name: `${original.name} (Copy)`,
          transform: {
            ...original.transform,
            position: { ...original.transform.position, x: original.transform.position.x + 60 },
          },
          features: original.features.map((f: PartFeature) => ({ ...f, id: genId() })),
          selected: false,
        };
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: { ...state.project.assembly, parts: [...state.project.assembly.parts, clone] },
          },
        }));
        return newId;
      },

      applyBoolean: (op: BooleanOp, partIds: string[]) => {
        const state = get();
        const selected = state.project.assembly.parts.filter((p: Part) => partIds.includes(p.id));
        if (selected.length < 2) return;
        state.pushUndo();
        const [a, b] = selected;
        const bFeat = b.features[0];
        const feature: PartFeature = {
          id: genId(),
          type: 'boolean',
          name: `${op}: ${a.name} + ${b.name}`,
          params: {
            operation: op,
            targetPartId: b.id,
            bPrimType: bFeat?.params?.primitiveType || 'box',
            bOffsetX: b.transform.position.x - a.transform.position.x,
            bOffsetY: b.transform.position.y - a.transform.position.y,
            bOffsetZ: b.transform.position.z - a.transform.position.z,
            bWidth: bFeat?.params?.width || 50,
            bHeight: bFeat?.params?.height || 50,
            bDepth: bFeat?.params?.depth || 50,
            bRadius: bFeat?.params?.radius || 25,
            bOuterRadius: bFeat?.params?.outerRadius || 25,
            bInnerRadius: bFeat?.params?.innerRadius || 18,
            bRingRadius: bFeat?.params?.ringRadius || 30,
            bTubeRadius: bFeat?.params?.tubeRadius || 10,
            bSegments: bFeat?.params?.segments || 32,
          },
          visible: true,
          locked: false,
        };
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts
                .map((p: Part) => p.id === a.id ? { ...p, features: [...p.features, feature], name: `${op}(${a.name}, ${b.name})` } : p)
                .filter((p: Part) => p.id !== b.id),
            },
          },
        }));
      },

      setPartMaterial: (partId: string, mat: Material) => {
        get().pushUndo();
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map(p =>
                p.id === partId ? { ...p, material: mat, color: mat.color } : p
              ),
            },
          },
        }));
      },

      updatePartTransform: (partId: string, key: keyof Transform, axis: keyof Vec3, value: number) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map((p: Part) =>
                p.id === partId ? { ...p, transform: { ...p.transform, [key]: { ...p.transform[key], [axis]: value } } } : p
              ),
            },
          },
        }));
      },

      togglePartVisibility: (partId: string) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map((p: Part) =>
                p.id === partId ? { ...p, visible: !p.visible } : p
              ),
            },
          },
        }));
      },

      addFeature: (partId: string, feature: PartFeature) => {
        get().pushUndo();
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map((p: Part) =>
                p.id === partId ? { ...p, features: [...p.features, feature] } : p
              ),
            },
          },
        }));
      },

      toggleFeatureSuppression: (partId: string, featureId: string) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map((p: Part) =>
                p.id === partId ? {
                  ...p,
                  features: p.features.map((f: PartFeature) =>
                    f.id === featureId ? { ...f, suppressed: !f.suppressed } : f
                  ),
                } : p
              ),
            },
          },
        }));
      },

      addConstraint: (type: ConstraintType, partAId: string, partBId: string, value: number = 0) => {
        get().pushUndo();
        const c: Constraint = { id: genId(), type, partA: partAId, partB: partBId, value, satisfied: false };
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: { ...state.project.assembly, constraints: [...state.project.assembly.constraints, c] },
          },
        }));
        // Resolve geometry immediately so the new constraint actually snaps parts
        // together and its satisfied indicator reflects reality (smart placement).
        get().solveConstraints();
      },

      removeConstraint: (constraintId: string) => {
        get().pushUndo();
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              constraints: state.project.assembly.constraints.filter((c: Constraint) => c.id !== constraintId),
            },
          },
        }));
        // Re-solve the remaining set so satisfied flags stay accurate after removal.
        get().solveConstraints();
      },

      solveConstraints: () => {
        const { parts, constraints } = get().project.assembly;
        if (constraints.length === 0) return { converged: true, moved: 0, unsatisfied: 0 };
        // Map UI aliases (mate/align/offset) onto the solver's primitive types.
        const solverConstraints: Constraint[] = constraints.map((c: Constraint) =>
          SOLVER_TYPE_ALIAS[c.type] ? { ...c, type: SOLVER_TYPE_ALIAS[c.type] } : c
        );
        const result = constraintSolver.solve(parts, solverConstraints);
        let moved = 0;
        let unsatisfied = 0;
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            modifiedAt: Date.now(),
            assembly: {
              ...state.project.assembly,
              parts: state.project.assembly.parts.map((p: Part) => {
                const upd = result.partUpdates.get(p.id);
                if (!upd) return p;
                moved++;
                return { ...p, transform: { ...p.transform, ...upd } };
              }),
              constraints: state.project.assembly.constraints.map((c: Constraint) => {
                const ok = result.constraintStatus.get(c.id) ?? c.satisfied;
                if (!ok) unsatisfied++;
                return ok === c.satisfied ? c : { ...c, satisfied: ok };
              }),
            },
          },
        }));
        return { converged: result.converged, moved, unsatisfied };
      },

      toggleExplodedView: () => {
        get().pushUndo();
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            assembly: { ...state.project.assembly, exploded: !state.project.assembly.exploded },
          },
        }));
      },

      setExplodeDistance: (distance: number) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            assembly: { ...state.project.assembly, explodeDistance: distance },
          },
        }));
      },

      addMeasurement: (type: Measurement['type'], points: Vec3[], value: number) => {
        const units = get().project.units;
        const unit = type === 'angle' ? '\u00B0' : type === 'area' ? `${units}\u00B2` : type === 'volume' ? `${units}\u00B3` : units;
        const m: Measurement = { id: genId(), type, points, value, unit, label: `${type} = ${value.toFixed(2)} ${unit}` };
        set((state: ProjectStore) => ({
          project: { ...state.project, measurements: [...state.project.measurements, m] },
        }));
      },

      removeMeasurement: (id: string) => {
        set((state: ProjectStore) => ({
          project: { ...state.project, measurements: state.project.measurements.filter((m: Measurement) => m.id !== id) },
        }));
      },

      addAnnotation: (annotation: GDTAnnotation) => {
        set((state: ProjectStore) => ({
          project: { ...state.project, annotations: [...state.project.annotations, annotation], modifiedAt: Date.now() },
        }));
      },

      removeAnnotation: (id: string) => {
        set((state: ProjectStore) => ({
          project: { ...state.project, annotations: state.project.annotations.filter((a: GDTAnnotation) => a.id !== id) },
        }));
      },

      generateBOM: () => {
        const project = get().project;
        const bomMap = new Map<string, BOMEntry>();
        project.assembly.parts.forEach((p: Part, i: number) => {
          const feat = p.features[0];
          const params = feat?.params || {};
          const vol = calcVolume((params.primitiveType as PrimitiveType) || 'box', params as Record<string, number>);
          const volM3 = vol * 1e-9;
          const weight = calcWeight(volM3, p.material.density);
          const key = `${p.name}-${p.material.id}`;
          if (bomMap.has(key)) {
            const existing = bomMap.get(key)!;
            existing.quantity += 1;
            existing.weight += weight;
          } else {
            bomMap.set(key, {
              partNumber: i + 1,
              name: p.name,
              quantity: 1,
              material: p.material.name,
              weight,
              dimensions: Object.entries(params)
                .filter(([k]) => typeof params[k] === 'number' && k !== 'segments')
                .map(([k, v]) => `${k}: ${v}${project.units}`)
                .join(', '),
              description: feat?.name || '',
            });
          }
        });
        set((state: ProjectStore) => ({
          project: { ...state.project, bom: Array.from(bomMap.values()) },
        }));
      },

      addSketch: (sketch: Sketch) => {
        set((state: ProjectStore) => ({
          project: { ...state.project, sketches: [...state.project.sketches, sketch], modifiedAt: Date.now() },
        }));
      },

      updateSketch: (sketchId: string, updates: Partial<Sketch>) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            sketches: state.project.sketches.map((s: Sketch) =>
              s.id === sketchId ? { ...s, ...updates } : s
            ),
            modifiedAt: Date.now(),
          },
        }));
      },

      setParameter: (name: string, value: number, expression?: string) => {
        set((state: ProjectStore) => {
          const existing = state.project.parameters.findIndex((p: Parameter) => p.name === name);
          const params = [...state.project.parameters];
          if (existing >= 0) {
            params[existing] = { ...params[existing], value, expression };
          } else {
            params.push({ name, value, expression });
          }
          return { project: { ...state.project, parameters: params, modifiedAt: Date.now() } };
        });
      },

      removeParameter: (name: string) => {
        set((state: ProjectStore) => ({
          project: {
            ...state.project,
            parameters: state.project.parameters.filter((p: Parameter) => p.name !== name),
            modifiedAt: Date.now(),
          },
        }));
      },

      // ── Configurations / Design Variants ────────────────────────────────
      saveConfiguration: (name: string) => {
        const state = get();
        const id = genId();
        const config: Configuration = {
          id,
          name: name.trim() || `Config ${state.project.configurations.length + 1}`,
          parts: snapshotConfiguration(state.project.assembly.parts),
          parameters: state.project.parameters.map((p: Parameter) => ({ ...p })),
          createdAt: Date.now(),
        };
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            configurations: [...s.project.configurations, config],
            activeConfigId: id,
            modifiedAt: Date.now(),
          },
        }));
        return id;
      },

      applyConfiguration: (configId: string) => {
        const state = get();
        const config = state.project.configurations.find((c: Configuration) => c.id === configId);
        if (!config) return;
        state.pushUndo();
        const byId = new Map<string, ConfigurationPart>(
          config.parts.map((cp: ConfigurationPart) => [cp.partId, cp] as [string, ConfigurationPart])
        );
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            activeConfigId: configId,
            parameters: config.parameters.map((p: Parameter) => ({ ...p })),
            modifiedAt: Date.now(),
            assembly: {
              ...s.project.assembly,
              parts: s.project.assembly.parts.map((p: Part) => {
                const cp = byId.get(p.id);
                if (!cp) return p;
                // Restore transform, visibility, and the primary feature's params.
                const primIdx = p.features.findIndex((f: PartFeature) => f.type === 'primitive');
                const idx = primIdx >= 0 ? primIdx : 0;
                const features = p.features.map((f: PartFeature, i: number) =>
                  i === idx ? { ...f, params: { ...f.params, ...cp.params } } : f
                );
                return {
                  ...p,
                  visible: cp.visible,
                  transform: {
                    position: { ...cp.transform.position },
                    rotation: { ...cp.transform.rotation },
                    scale: { ...cp.transform.scale },
                  },
                  features,
                };
              }),
            },
          },
        }));
      },

      deleteConfiguration: (configId: string) => {
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            configurations: s.project.configurations.filter(c => c.id !== configId),
            activeConfigId: s.project.activeConfigId === configId ? undefined : s.project.activeConfigId,
            modifiedAt: Date.now(),
          },
        }));
      },

      // ── Named Views / Saved Cameras ─────────────────────────────────────
      saveNamedView: (view: Omit<NamedView, 'id'>) => {
        const id = genId();
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            namedViews: [...s.project.namedViews, { ...view, id }],
            modifiedAt: Date.now(),
          },
        }));
        return id;
      },

      deleteNamedView: (viewId: string) => {
        set((s: ProjectStore) => ({
          project: {
            ...s.project,
            namedViews: s.project.namedViews.filter(v => v.id !== viewId),
            modifiedAt: Date.now(),
          },
        }));
      },

      setSimResults: (results: SimulationResult | null) => set({ simResults: results }),

      newProject: () => set({
        project: createDefaultProject(),
        undoStack: [],
        redoStack: [],
        simResults: null,
      }),

      loadProject: (project: AXLProject) => set({
        project,
        undoStack: [],
        redoStack: [],
        simResults: null,
      }),
    }),
    {
      name: 'axl-project',
      partialize: (state) => ({ project: state.project }),
      merge: (persisted: any, current: any) => {
        const merged = { ...current, ...persisted };
        // If persisted project has no parts, replace with default starter project
        if (merged.project?.assembly?.parts?.length === 0) {
          merged.project = createDefaultProject();
        }
        // Backfill arrays added in later versions so projects saved before this
        // release don't crash on `.map`/`.length` of an undefined collection.
        if (merged.project) {
          merged.project.configurations = merged.project.configurations ?? [];
          merged.project.namedViews = merged.project.namedViews ?? [];
          merged.project.parameters = merged.project.parameters ?? [];
        }
        return merged;
      },
    }
  )
);
