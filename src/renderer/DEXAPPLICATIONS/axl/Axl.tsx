/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AXL — Engineering Design Studio
 * ═══════════════════════════════════════════════════════════════════════════
 * Professional CAD application for mechanical/manufacturing engineers.
 * Parametric modeling, 2D technical drawing, assembly, simulation.
 * Isometric 2D canvas rendering with engineering-grade data models.
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    DEX Software License Agreement v1.0 (proprietary)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { clampEventToViewport } from '../../utils/menuPosition';
import { enginePendingApplier, type OpApplyResult } from '../../../shared/uki/creativeCommand';
import type { CreativeOp } from '../../../shared/uki/creativeActions';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import AutosaveIndicator from '../../components/AutosaveIndicator';
import { useConfirm } from '../../components/ConfirmDialog';
import { useAppTracking } from '../../services/usePatternLearning';
import { loadEngagement, saveEngagement, recordAppUsage, incrementStat, checkAchievements } from '../../services/engagement';
import { rewardUnlocks } from '../../services/achievementEngine';
import DexIcon from '../../components/DexIcon';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { DexSearchInput } from '../../styles/components';

// ─── Extracted Modules ────────────────────────────────────────────────────
import type {
  Vec3, PrimitiveType, BooleanOp, ConstraintType, SimulationType,
  ViewMode, ToolMode, Part, PartFeature, Measurement, GDTAnnotation,
} from './types';
import { MATERIAL_DB, STD_PARTS_LIBRARY, GDT_SYMBOLS } from './constants';
import { genId, vec3, defaultTransform, calcVolume, calcWeight, formatWeight, stressColor } from './utils/math';
import { alignSnapPosition, primitiveHalfExtents, type SnapGuide } from './utils/alignSnap';
import { computeModalStudy, computeBucklingStudy } from './engine/modalBuckling';
import { evaluateExpression, type ParamScope } from './utils/exprEval';

// Expression-capable feature-parameter input: accepts a plain number OR a
// parametric expression ("width / 2", "bolt_d * 1.5") evaluated against the
// project parameter table — same discipline as the PropertiesPanel transform
// inputs. Commits on Enter/blur; Escape reverts; errors surface via onError.
const FeatureExprInput: React.FC<{
  value: number;
  scope: ParamScope;
  onCommit: (n: number) => void;
  onError: (msg: string) => void;
  width?: number;
  min?: number;
  max?: number;
  ariaLabel?: string;
}> = ({ value, scope, onCommit, onError, width = 70, min, max, ariaLabel }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const raw = draft.trim();
    setDraft(null);
    if (!raw) return;
    let n = Number(raw);
    if (!Number.isFinite(n)) {
      try { n = evaluateExpression(raw, scope); } catch (err) { onError((err as Error).message); return; }
    }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      title='Number or expression, e.g. "width / 2"'
      value={draft ?? String(Math.round(value * 1000) / 1000)}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => { setDraft(String(value)); e.currentTarget.select(); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      style={{ marginLeft: 'var(--space-2)', width, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }}
    />
  );
};
import { primitiveMassProperties, type PrimitiveKind, type PrimitiveDims } from './axlMassProperties';
import { detectInterferences } from './AxlInspect';
import { importCadFile } from './AxlImport';
import { useAxlSaveStatus, parseAxlProject } from './axlPersistence';
import type { InterferencePair, NamedView } from './types';
import { exportProject as doExport, type AxlExportFormat } from './utils/export';
import { useProjectStore } from './stores/projectStore';
import { useAppCheckpoints } from '../../hooks/useAppCheckpoints';
import { useViewportStore } from './stores/viewportStore';
import { useUIStore } from './stores/uiStore';
import { AXLRenderer, solveTruss, deriveTrussFromParts, defaultTrussModel, solveTrussModes } from './engine';
import type { RenderState, FEResult } from './engine';
import AXLToolbar from './components/Toolbar';
import SketchOverlay from './components/SketchOverlay';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';
import { ResizablePanel } from '../../components/ResizablePanel';
import { keyEventForApp, isTypingTarget } from '../../shell/input/appKeyScope';
import { useResourcePressure } from '../../services/resourcePressure';

// ==================== APP IDENTITY ====================
export const AXL_VERSION = '1.0.0';
export const AXL_BUILD_DATE = '2026-04-11';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const AXL: React.FC = () => {
  // The project is written to app storage on every change (projectStore +
  // axlPersistence). Leaving warns only while that write is failing.
  const saveStatus = useAxlSaveStatus();
  useUnsavedGuard(!saveStatus.ok);
  const { confirm, ConfirmHost } = useConfirm();
  const collab = useCollaborationFeatures({ appId: 'axl', projectName: 'AXL Project', autoCheckpointInterval: 300000 });
  // Track app usage
  useAppTracking('axl');
  useEffect(() => {
    const eng = loadEngagement();
    const updated = recordAppUsage(eng, 'axl');
    const checkRes = checkAchievements(updated);
    saveEngagement(checkRes.state);
    rewardUnlocks(checkRes.newUnlocks);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stores ───────────────────────────────────────────────────────────
  const project = useProjectStore(s => s.project);
  const simResults = useProjectStore(s => s.simResults);
  const pStore = useProjectStore();
  // Saved versions of the project (listed and restored from Collab Hub).
  const checkpoints = useAppCheckpoints({
    appId: 'axl',
    appName: 'AXL',
    getSnapshot: () => JSON.stringify(useProjectStore.getState().project),
    onRestore: (data) => {
      const parsed = parseAxlProject(data);
      if (!parsed.ok) throw new Error(parsed.reason);
      useProjectStore.getState().loadProject(parsed.project);
    },
  });
  const { tool, selectedPartId, hoveredPartId, gridVisible, snapEnabled } = useViewportStore();
  const vStore = useViewportStore();
  const ui = useUIStore();

  // ─── Local State (transient UI) ───────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [cameraAngle, setCameraAngle] = useState<{ azimuth: number; elevation: number; distance: number }>({ azimuth: 45, elevation: 30, distance: 500 });
  const [wireframe, setWireframe] = useState(false);
  const [simType, setSimType] = useState<SimulationType>('stress');
  const [simForce, setSimForce] = useState(1000);
  const [simRunning, setSimRunning] = useState(false);
  // Live solver verbs ("Simulating / Stepping physics / Solving") for the sim
  // button + status badge, replacing frozen "Running..."/"Simulating...".
  const simPhrase = useWorkingPhrase(simRunning, 'simulate');
  const [libSearch, setLibSearch] = useState('');
  const [libCategory, setLibCategory] = useState(0);
  const [aiInput, setAiInput] = useState('');
  const [featureType, setFeatureType] = useState<'extrude' | 'revolve' | 'chamfer' | 'fillet' | 'pattern' | 'shell' | 'draft' | 'rib'>('extrude');
  const [featureParams, setFeatureParams] = useState<Record<string, number>>({ depth: 20, angle: 360, distance: 2, radius: 3, count: 4, spacing: 30, thickness: 3, draftAngle: 5 });
  // Parameter scope for expression-capable feature inputs ("width / 2")
  const featureScope = useMemo<ParamScope>(() => {
    const scope: ParamScope = {};
    project.parameters.forEach(prm => { scope[prm.name] = prm.value; });
    return scope;
  }, [project.parameters]);
  const featureExprError = useCallback((msg: string) => ui.showToast(msg), [ui]);
  const [gdtSymbol, setGdtSymbol] = useState('\u2316');
  const [gdtTolerance, setGdtTolerance] = useState('0.05');
  const [gdtDatum, setGdtDatum] = useState('A');
  // Constraint form state
  const [cType, setCType] = useState<ConstraintType>('mate');
  const [cPartA, setCPartA] = useState('');
  const [cPartB, setCPartB] = useState('');
  const [cValue, setCValue] = useState('0');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AXLRenderer | null>(null);
  const animRef = useRef<number>(0);
  const renderFnRef = useRef<() => void>(() => {});
  // Render-on-demand: the viewport only redraws when something that affects the
  // image actually changed. React re-renders this component on every such state
  // change (camera, project, selection, sim results...), and the assignment of
  // renderFnRef below flags this dirty. An idle AXL window then costs ~0 GPU/CPU
  // instead of pinning a core at a steady 60fps redraw.
  const needsRenderRef = useRef(true);
  const lastMouse = useRef({ x: 0, y: 0, down: false, button: 0 });
  const measureStart = useRef<Vec3 | null>(null);
  // Alignment-snap inference guides (world-space center pairs) drawn while a
  // move drag is snapped onto another part's axis. Ref, not state: per-frame
  // data that the render loop reads directly.
  const snapGuidesRef = useRef<SnapGuide[]>([]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });

  // Inspector (Configurations / Named Views / Interference) transient state
  const [interferenceResults, setInterferenceResults] = useState<InterferencePair[] | null>(null);
  const [clearanceGap, setClearanceGap] = useState(0);
  const [newConfigName, setNewConfigName] = useState('');
  const [newViewName, setNewViewName] = useState('');

  // Section view (clipping plane) + mesh import
  const [section, setSection] = useState<{ enabled: boolean; axis: 'x' | 'y' | 'z'; offset: number; flip: boolean }>({ enabled: false, axis: 'x', offset: 0, flip: false });
  const importInputRef = useRef<HTMLInputElement>(null);

  // ─── Creative Suite Inbox ─────────────────────────────────────────────
  useCreativeInbox('axl', useCallback((asset: { name: string; sourceApp: string; kind?: string; data?: string }) => {
    if (asset.data && (asset.kind === 'image' || asset.kind === 'model' || asset.kind === 'drawing')) {
      // Import as a new box primitive representing the received asset
      pStore.addPrimitive('box', { width: 50, height: 50, depth: 50 }, asset.name || 'Imported Part');
    }
    ui.showToast(`Imported "${asset.name}" from ${asset.sourceApp}`);
  }, [pStore, ui]));

  // ─── Derived ──────────────────────────────────────────────────────────
  const selectedPart = useMemo(() =>
    project.assembly.parts.find(p => p.id === selectedPartId) || null,
    [project, selectedPartId]
  );

  const totalWeight = useMemo(() =>
    project.assembly.parts.reduce((sum, p) => {
      const feat = p.features[0];
      const params = feat?.params || {};
      const vol = calcVolume((params.primitiveType as PrimitiveType) || 'box', params as Record<string, number>);
      return sum + calcWeight(vol * 1e-9, p.material.density);
    }, 0),
    [project]
  );

  const filteredLibParts = useMemo(() => {
    const cat = STD_PARTS_LIBRARY[libCategory];
    if (!cat) return [];
    if (!libSearch) return cat.parts;
    const q = libSearch.toLowerCase();
    return cat.parts.filter(p => p.name.toLowerCase().includes(q) || p.sizeRange.toLowerCase().includes(q));
  }, [libCategory, libSearch]);

  // ─── AI Analyze ───────────────────────────────────────────────────────
  const aiAnalyze = useCallback((query: string): string => {
    const q = query.toLowerCase();
    const parts = project.assembly.parts;
    const sel = parts.find(p => p.id === selectedPartId);

    if (q.includes('material') || q.includes('recommend')) {
      if (sel) {
        const feat = sel.features[0];
        const params = feat?.params || {};
        const vol = calcVolume((params.primitiveType as PrimitiveType) || 'box', params as Record<string, number>);
        const weight = calcWeight(vol * 1e-9, sel.material.density);
        const suggestions: string[] = [];
        if (weight > 1) suggestions.push('Consider Aluminum 6061 or 7075 for lighter weight with good strength.');
        if (sel.material.tensileStrength < 200) suggestions.push('Current material has low tensile strength. Steel 4140 or Titanium 6Al-4V would be stronger.');
        if (q.includes('heat') || q.includes('thermal')) suggestions.push(`Current thermal conductivity: ${sel.material.thermalConductivity} W/(m\u00b7K). Copper C110 (388) or Aluminum 6061 (167) are better heat conductors.`);
        if (q.includes('light') || q.includes('weight')) {
          const lighter = MATERIAL_DB.filter(m => m.density < sel.material.density).sort((a, b) => b.tensileStrength / b.density - a.tensileStrength / a.density);
          if (lighter.length > 0) suggestions.push(`Best strength-to-weight: ${lighter[0].name} (${lighter[0].density} kg/m\u00b3, ${lighter[0].tensileStrength} MPa)`);
        }
        return suggestions.length > 0 ? suggestions.join('\n') : `${sel.name} uses ${sel.material.name} (${sel.material.density} kg/m\u00b3). Looks appropriate for this geometry.`;
      }
      return 'Select a part first, then ask about material recommendations.';
    }

    if (q.includes('tolerance') || q.includes('gd&t') || q.includes('fit')) {
      if (sel) {
        const feat = sel.features[0]?.params;
        if (feat?.primitiveType === 'cylinder') {
          return `Cylinder (\u2300${(feat.radius as number) * 2}${project.units}):\n\u2022 Clearance fit: H7/f6\n\u2022 Transition fit: H7/k6\n\u2022 Press fit: H7/p6\nUse GD&T \u2316 Position with datum reference for assembly.`;
        }
        return `For ${sel.name}:\n\u2022 General machining: \u00b10.1${project.units}\n\u2022 Precision: \u00b10.025${project.units}\n\u2022 Tight: \u00b10.01${project.units}`;
      }
      return 'Select a part to get tolerance recommendations.';
    }

    if (q.includes('stress') || q.includes('safe') || q.includes('sim')) {
      if (simResults) {
        const sf = simResults.safetyFactor;
        if (sf < 1) return `Safety factor ${sf.toFixed(2)} -- WILL FAIL under ${simForce}N. Increase wall thickness or use stronger material.`;
        if (sf < 2) return `Safety factor ${sf.toFixed(2)} -- marginal. For static loads minimum 2x, for dynamic/fatigue loads 3-4x recommended.`;
        return `Safety factor ${sf.toFixed(2)} -- adequate. Max stress ${simResults.maxStress.toFixed(1)} MPa across ${parts.length} parts.`;
      }
      return 'Run a simulation first (click Simulation button), then ask me about results.';
    }

    if (q.includes('assembl') || q.includes('constrain') || q.includes('mate')) {
      const orphanParts = parts.filter(p => !project.assembly.constraints.some(c => c.partA === p.id || c.partB === p.id));
      if (orphanParts.length > 0 && parts.length > 1) {
        return `${orphanParts.length} part(s) have no constraints: ${orphanParts.map(p => p.name).join(', ')}.`;
      }
      if (parts.length < 2) return 'Add at least 2 parts to create an assembly with constraints.';
      return `Assembly has ${parts.length} parts with ${project.assembly.constraints.length} constraints. All parts are constrained.`;
    }

    if (q.includes('weight') || q.includes('mass') || q.includes('cost')) {
      if (parts.length === 0) return 'No parts in assembly yet.';
      const breakdown = parts.map(p => {
        const feat = p.features[0]?.params || {};
        const ptype = (feat.primitiveType as PrimitiveType) || 'box';
        const vol = calcVolume(ptype, feat as Record<string, number>);
        // Accurate closed-form mass properties (volume/area/centroid) for the
        // primitive; null for non-primitive feature stacks -> weight only.
        const mp = primitiveMassProperties(ptype as PrimitiveKind, feat as PrimitiveDims);
        return { name: p.name, weight: calcWeight(vol * 1e-9, p.material.density), material: p.material.name, area: mp?.surfaceArea };
      });
      return breakdown.map(b => {
        const area = b.area != null ? `, area ${Math.round(b.area)} mm\u00b2` : '';
        return `\u2022 ${b.name}: ${formatWeight(b.weight)} (${b.material})${area}`;
      }).join('\n') + `\n\u2500\u2500\u2500\u2500\u2500\nTotal: ${formatWeight(breakdown.reduce((s, b) => s + b.weight, 0))}`;
    }

    return `Assembly: ${parts.length} parts, ${project.assembly.constraints.length} constraints. Units: ${project.units}. Ask about materials, tolerances, simulation, or assembly.`;
  }, [project, selectedPartId, simResults, simForce]);

  const sendAIMessage = useCallback(() => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    ui.addAIMessage({ role: 'user', content: userMsg, timestamp: Date.now() });
    setAiInput('');
    setTimeout(() => {
      const response = aiAnalyze(userMsg);
      ui.addAIMessage({ role: 'assistant', content: response, timestamp: Date.now() });
    }, 300);
  }, [aiInput, aiAnalyze, ui]);

  // ─── Feature Creation ─────────────────────────────────────────────────
  const addFeatureToSelected = useCallback(() => {
    if (!selectedPartId) { ui.showToast('Select a part first'); return; }
    const feature: PartFeature = {
      id: genId(),
      type: featureType,
      name: `${featureType.charAt(0).toUpperCase() + featureType.slice(1)} ${Date.now().toString(36).slice(-3)}`,
      params: { ...featureParams },
      visible: true,
      locked: false,
    };
    pStore.addFeature(selectedPartId, feature);
    ui.toggleFeatureCreate();
    ui.showToast(`${featureType} feature added`);
  }, [selectedPartId, featureType, featureParams, pStore, ui]);

  // ─── GD&T Annotation ─────────────────────────────────────────────────
  const addGDTAnnotation = useCallback(() => {
    if (!selectedPartId) { ui.showToast('Select a part first'); return; }
    const sel = project.assembly.parts.find(p => p.id === selectedPartId);
    if (!sel) return;
    const annotation: GDTAnnotation = {
      id: genId(),
      symbol: gdtSymbol,
      tolerance: gdtTolerance,
      datum: gdtDatum,
      position: { ...sel.transform.position },
      attachedTo: selectedPartId,
    };
    pStore.addAnnotation(annotation);
    ui.toggleGDTCreate();
    ui.showToast(`GD&T ${gdtSymbol} annotation added`);
  }, [selectedPartId, project, gdtSymbol, gdtTolerance, gdtDatum, pStore, ui]);

  // ─── Simulation ───────────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    if (project.assembly.parts.length === 0) { ui.showToast('Add parts before simulating'); return; }
    setSimRunning(true);
    // Run computation asynchronously via microtask to keep UI responsive
    requestAnimationFrame(() => {
      const t0 = performance.now();
      const parts = project.assembly.parts;
      if (simType === 'stress') {
        // ── REAL 2D truss finite-element analysis (direct-stiffness method) ──
        // Derive an FE model from the parts (one node per part, members from
        // assembly constraints or a chain/frame fallback); solve K.u = F for
        // nodal displacements; recover per-element axial stress / von Mises /
        // safety factor. Geometry/material are in consistent N-mm-MPa units.
        try {
          // Representative cross-sectional area from the part's primitive
          // volume: A ~ vol^(2/3) in mm^2 (vol returned in mm^3).
          const fePartsInput = parts.map(p => {
            const feat = p.features[0];
            const params = (feat?.params || {}) as Record<string, any>;
            const vol = calcVolume((params.primitiveType as PrimitiveType) || 'box', params);
            const area = Math.max(Math.pow(Math.max(vol, 1), 2 / 3), 1); // mm^2
            // Young's modulus: type stores GPa -> convert to MPa (N/mm^2).
            const E = Math.max(p.material.youngsModulus * 1000, 1);
            return { id: p.id, x: p.transform.position.x, y: p.transform.position.y, E, area };
          });
          const edges = project.assembly.constraints.map(c => ({ a: c.partA, b: c.partB }));
          // Yield input: prefer material yieldStrength, fall back to a fraction
          // of tensile strength; use the weakest part as the global yield.
          const yieldOf = (mat: typeof parts[number]['material']) =>
            mat.yieldStrength && mat.yieldStrength > 0 ? mat.yieldStrength : mat.tensileStrength * 0.6;
          const minYield = Math.min(...parts.map(p => yieldOf(p.material)));

          const derived = deriveTrussFromParts(fePartsInput, edges, simForce, minYield);
          let fe: FEResult;
          const stressByPart = new Map<string, number>();
          let isDefaultModel = false;

          if (derived) {
            fe = solveTruss(derived.model);
            // Assign each element's von Mises stress to both connected parts;
            // keep the worst-case stress seen at each part for coloring.
            fe.elements.forEach((er, i) => {
              const ep = derived.elementParts[i];
              for (const id of [ep.a, ep.b]) {
                stressByPart.set(id, Math.max(stressByPart.get(id) ?? 0, er.vonMises));
              }
            });
          } else {
            // Geometry can't map to >=2 FE nodes: solve a real default demo
            // truss so the study still produces meaningful numbers.
            isDefaultModel = true;
            const E = Math.max((parts[0]?.material.youngsModulus ?? 200) * 1000, 1);
            const area = 100; // mm^2 representative member
            fe = solveTruss(defaultTrussModel(simForce, E, area, minYield));
            const single = parts[0];
            if (single) stressByPart.set(single.id, fe.maxVonMises);
          }

          // Build the per-part stress map (ratio = stress / yield).
          const stressMap = parts.map(p => {
            const stress = stressByPart.get(p.id) ?? 0;
            const y = yieldOf(p.material);
            return { partId: p.id, ratio: y > 0 ? stress / y : 0 };
          });

          pStore.setSimResults({
            type: 'stress',
            maxStress: fe.maxVonMises,
            safetyFactor: Number.isFinite(fe.minSafetyFactor) ? fe.minSafetyFactor : 999,
            maxDisplacement: fe.maxDisplacement,
            feaSolved: true,
            elementCount: fe.elements.length,
            stressMap,
            converged: fe.converged,
            timestamp: Date.now(),
          });
          ui.showToast(
            `FEA complete -- ${fe.elements.length} elements, ` +
            `max ${fe.maxVonMises.toFixed(1)} MPa, SF ${(Number.isFinite(fe.minSafetyFactor) ? fe.minSafetyFactor : 999).toFixed(2)}` +
            (isDefaultModel ? ' (default truss)' : '')
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'FEA solve failed.';
          window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Simulation failed: ${msg}` } }));
        }
      } else if (simType === 'thermal') {
        const ambientTemp = 25;
        const heatInput = simForce;
        const results = parts.map(p => {
          const feat = p.features[0]?.params || {};
          const ptype = (feat.primitiveType as PrimitiveType) || 'box';
          const vol = calcVolume(ptype, feat as Record<string, number>);
          // Accurate surface area from the primitive's closed form; fall back to the
          // vol^(2/3) estimate for non-primitive parts. Drives the thermal deltaT.
          const surfaceArea = primitiveMassProperties(ptype as PrimitiveKind, feat as PrimitiveDims)?.surfaceArea ?? Math.pow(vol, 2 / 3) * 6;
          const k = p.material.thermalConductivity;
          const thickness = Math.pow(vol, 1 / 3);
          const deltaT = (heatInput * (thickness / 1000)) / (k * (surfaceArea / 1e6));
          const ratio = Math.min(deltaT / 200, 1.5);
          return { partId: p.id, ratio, stress: ambientTemp + deltaT };
        });
        const maxTemp = Math.max(...results.map(r => r.stress));
        pStore.setSimResults({ maxStress: maxTemp, safetyFactor: 200 / (maxTemp - ambientTemp), stressMap: results.map(r => ({ partId: r.partId, ratio: r.ratio })), converged: true, timestamp: Date.now() });
        ui.showToast(`Thermal analysis -- Peak: ${maxTemp.toFixed(1)}\u00b0C`);
      } else if (simType === 'modal' || simType === 'buckling') {
        // \u2500\u2500 Analytical modal / buckling studies (engine/modalBuckling) \u2500\u2500
        // Previously these SimulationType values silently fell through to the
        // motion study. Same per-part beam idealization the motion study uses.
        const inputs = parts.map(p => {
          const feat = p.features[0]?.params || {};
          const vol = calcVolume((feat.primitiveType as PrimitiveType) || 'box', feat as Record<string, number>);
          return { id: p.id, youngsModulusGPa: p.material.youngsModulus, densityKgM3: p.material.density, volumeMm3: vol };
        });
        if (simType === 'modal') {
          const study = computeModalStudy(inputs, simForce);
          // Prefer REAL assembly modes: when the parts derive a valid truss
          // (same derivation the stress FEA uses), solve the generalized
          // eigenproblem K \u03c6 = \u03c9\u00b2 M \u03c6 with a lumped mass matrix. The per-part
          // analytical study keeps driving the resonance coloring; the
          // study-level f\u2081/separation come from the actual assembly.
          let minF1 = study.minF1Hz;
          let separation = study.separationFactor;
          let feaSolved = false;
          let elementCount: number | undefined;
          try {
            const fePartsInput = parts.map(p => {
              const feat = (p.features[0]?.params || {}) as Record<string, any>;
              const vol = calcVolume((feat.primitiveType as PrimitiveType) || 'box', feat as Record<string, number>);
              return {
                id: p.id,
                x: p.transform.position.x,
                y: p.transform.position.y,
                E: Math.max(p.material.youngsModulus * 1000, 1), // GPa -> MPa
                area: Math.max(Math.pow(Math.max(vol, 1), 2 / 3), 1),
                density: Math.max(p.material.density, 1) * 1e-12, // kg/m\u00b3 -> tonne/mm\u00b3
              };
            });
            const edges = project.assembly.constraints.map(c => ({ a: c.partA, b: c.partB }));
            const derived = deriveTrussFromParts(fePartsInput, edges, simForce, 250);
            if (derived) {
              const avgDensity = (parts.reduce((s, p) => s + Math.max(p.material.density, 1), 0) / parts.length || 7850) * 1e-12;
              const modes = solveTrussModes(derived.model, avgDensity, 3);
              if (modes.converged && modes.frequenciesHz.length > 0 && modes.frequenciesHz[0] > 0) {
                minF1 = modes.frequenciesHz[0];
                separation = simForce > 0 ? Math.min(minF1 / simForce, 999) : 999;
                feaSolved = true;
                elementCount = derived.model.elements.length;
              }
            }
          } catch { /* degenerate geometry \u2014 the analytical study stands */ }
          pStore.setSimResults({
            type: 'modal',
            maxStress: minF1,
            safetyFactor: separation,
            stressMap: study.parts.map(r => ({ partId: r.partId, ratio: r.ratio })),
            feaSolved,
            elementCount,
            converged: true,
            timestamp: Date.now(),
          });
          ui.showToast(feaSolved
            ? `Modal (FE assembly, ${elementCount} members) -- f\u2081 ${minF1.toFixed(0)} Hz, separation ${separation.toFixed(1)}\u00d7`
            : `Modal analysis -- lowest f\u2081 ${minF1.toFixed(0)} Hz, separation ${separation.toFixed(1)}\u00d7`);
        } else {
          const study = computeBucklingStudy(inputs, simForce);
          pStore.setSimResults({
            type: 'buckling',
            maxStress: study.minCriticalLoadN,
            safetyFactor: study.minSafetyFactor,
            stressMap: study.parts.map(r => ({ partId: r.partId, ratio: r.ratio })),
            converged: true,
            timestamp: Date.now(),
          });
          ui.showToast(`Buckling analysis -- critical load ${(study.minCriticalLoadN / 1000).toFixed(1)} kN, SF ${study.minSafetyFactor.toFixed(1)}\u00d7`);
        }
      } else {
        const g = 9810;
        const results = parts.map(p => {
          const feat = p.features[0]?.params || {};
          const vol = calcVolume((feat.primitiveType as PrimitiveType) || 'box', feat as Record<string, number>);
          const mass = calcWeight(vol * 1e-9, p.material.density);
          const E = Math.max(p.material.youngsModulus * 1000, 1e-6);
          const I = Math.max(Math.pow(vol, 2 / 3) * Math.pow(vol, 2 / 3) / 12, 1e-12);
          const L = Math.max(Math.pow(vol, 1 / 3), 0.001);
          const totalForce = simForce + mass * g / 1000;
          const deflection = (totalForce * L * L * L) / (3 * E * I);
          const ratio = Math.min(deflection / (L * 0.01), 1.5);
          return { partId: p.id, ratio, stress: deflection };
        });
        const maxDeflection = Math.max(...results.map(r => r.stress));
        pStore.setSimResults({ maxStress: maxDeflection, safetyFactor: 1 / Math.max(maxDeflection / 10, 0.01), stressMap: results.map(r => ({ partId: r.partId, ratio: r.ratio })), converged: true, timestamp: Date.now() });
        ui.showToast(`Motion study -- Max deflection: ${maxDeflection.toFixed(3)}${project.units}`);
      }
      const elapsed = (performance.now() - t0).toFixed(1);
      setSimRunning(false);
    });
  }, [project, simForce, simType, pStore, ui]);

  // ─── Export ───────────────────────────────────────────────────────────
  const handleExport = useCallback((format: AxlExportFormat) => {
    let msg: string | undefined;
    try { msg = doExport(project, format, canvasRef.current) ?? undefined; }
    catch (err) { ui.showToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`); return; }
    if (msg === 'Canvas not available') { ui.showToast('Export failed: the 3D view is not ready yet.'); return; }
    ui.showToast(`Exported as ${format.toUpperCase()}`);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'axlExports', amount: 1 } }));
  }, [project, ui]);

  const applyStandardView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'front') {
      setCameraAngle({ azimuth: 0, elevation: 0, distance: 500 });
    } else if (mode === 'top') {
      setCameraAngle({ azimuth: 0, elevation: 89, distance: 500 });
    } else if (mode === 'right') {
      setCameraAngle({ azimuth: 90, elevation: 0, distance: 500 });
    } else if (mode === '3d') {
      setCameraAngle({ azimuth: 45, elevation: 30, distance: 500 });
    }
  }, []);

  // ─── Inspector: Interference / Clearance ──────────────────────────────
  const runInterferenceCheck = useCallback(() => {
    const pairs = detectInterferences(project.assembly.parts, clearanceGap);
    setInterferenceResults(pairs);
    const hits = pairs.filter(p => p.status === 'interference').length;
    const clears = pairs.length - hits;
    ui.showToast(
      hits === 0 && clears === 0
        ? 'No interferences detected'
        : `${hits} interference${hits === 1 ? '' : 's'}` + (clears ? `, ${clears} clearance issue${clears === 1 ? '' : 's'}` : '')
    );
  }, [project.assembly.parts, clearanceGap, ui]);

  // ─── Inspector: Named Views ───────────────────────────────────────────
  const saveCurrentView = useCallback(() => {
    const name = newViewName.trim() || `View ${project.namedViews.length + 1}`;
    pStore.saveNamedView({
      name,
      azimuth: cameraAngle.azimuth,
      elevation: cameraAngle.elevation,
      distance: cameraAngle.distance,
      viewMode,
    });
    setNewViewName('');
    ui.showToast(`Saved view "${name}"`);
  }, [newViewName, project.namedViews.length, pStore, cameraAngle, viewMode, ui]);

  const applyNamedView = useCallback((view: NamedView) => {
    setViewMode(view.viewMode);
    setCameraAngle({ azimuth: view.azimuth, elevation: view.elevation, distance: view.distance });
    ui.showToast(`View "${view.name}"`);
  }, [ui]);

  // ─── Inspector: Configurations ────────────────────────────────────────
  const saveCurrentConfig = useCallback(() => {
    const name = newConfigName.trim() || `Config ${project.configurations.length + 1}`;
    pStore.saveConfiguration(name);
    setNewConfigName('');
    ui.showToast(`Saved configuration "${name}"`);
  }, [newConfigName, project.configurations.length, pStore, ui]);

  // ─── Mesh Import (OBJ / STL / STEP) ───────────────────────────────────
  const handleImportFile = useCallback(async (file: File) => {
    try {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      // STL may be binary; read those as ArrayBuffer, text formats as text.
      const data: string | ArrayBuffer = ext === 'stl' ? await file.arrayBuffer() : await file.text();
      const result = importCadFile(file.name, data);
      if (!result) { ui.showToast(`Could not read ${file.name}`); return; }
      const baseName = file.name.replace(/\.[^.]+$/, '');
      if (result.kind === 'mesh') {
        const id = pStore.addMeshPart(baseName, result.mesh);
        vStore.setSelectedPartId(id);
        ui.showToast(`Imported ${baseName} — ${result.triangles.toLocaleString()} triangles`);
      } else {
        // STEP: imported as a box sized to the file's real point extent.
        const id = pStore.addPrimitive('box', { width: result.width, height: result.height, depth: result.depth }, baseName);
        vStore.setSelectedPartId(id);
        ui.showToast(`Imported STEP extent — ${result.pointCount.toLocaleString()} points`);
      }
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'axlImports', amount: 1 } }));
    } catch {
      ui.showToast(`Failed to import ${file.name}`);
    }
  }, [pStore, vStore, ui]);

  const triggerImport = useCallback(() => importInputRef.current?.click(), []);

  // ─── Replacing the open project ───────────────────────────────────────
  // The open project exists only in app storage, so New and Open keep it as a
  // Collab Hub checkpoint first. If that fails (storage full), ask.
  const checkpointSaveNow = checkpoints.saveNow;
  const keepCurrentProject = useCallback(async (what: string): Promise<{ go: boolean; kept: boolean }> => {
    const res = checkpointSaveNow(`Before ${what}`);
    if (res.ok) return { go: true, kept: true };
    const go = await confirm({
      title: 'Replace the current project?',
      message: `It could not be kept as a checkpoint (${res.error}). Export it first (Ctrl+E) if you want to keep it.`,
      confirmLabel: 'Replace it',
      tone: 'destructive',
    });
    return { go, kept: false };
  }, [checkpointSaveNow, confirm]);

  const openProjectFile = useCallback(async (file: File) => {
    let text: string;
    try { text = await file.text(); } catch { ui.showToast(`Could not read ${file.name}`); return; }
    const parsed = parseAxlProject(text);
    if (!parsed.ok) { ui.showToast(`${file.name}: ${parsed.reason}`); return; }
    const keep = await keepCurrentProject('opening another project');
    if (!keep.go) return;
    pStore.loadProject(parsed.project);
    vStore.setSelectedPartId(null);
    ui.showToast([`Opened ${parsed.project.name}.`, ...parsed.notes, keep.kept ? 'The previous project is in Collab Hub checkpoints.' : ''].filter(Boolean).join(' '));
  }, [keepCurrentProject, pStore, vStore, ui]);

  const pickProjectFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.axl';
    input.onchange = () => { const file = input.files?.[0]; if (file) void openProjectFile(file); };
    input.click();
  }, [openProjectFile]);

  // ─── UKI-driven AXL ───────────────────────────────────────────────────
  // The natural-language command bar (CreativeCommandBar) routes recognised
  // goals here as CreativeOps. Read-only ops answer through aiAnalyze; mutating
  // ops execute REAL store actions (add a part, shell/draft/rib it, run a study,
  // section, explode, BOM, export). Anything still engine-bound skips honestly.
  const handleAxlOp = useCallback((op: CreativeOp): OpApplyResult | Promise<OpApplyResult> => {
    const req = String((op.params?.request ?? op.params?.goal ?? '') || '').toLowerCase();
    const sel = project.assembly.parts.find(p => p.id === selectedPartId) || null;

    // Read-only analysis -> aiAnalyze.
    const queryFor: Record<string, string> = {
      massProperties: 'weight and mass breakdown',
      gdtSuggest: 'tolerance and GD&T fit recommendations',
      parametricSuggest: 'what can you do — feature guidance',
    };
    if (queryFor[op.op]) {
      const answer = aiAnalyze(queryFor[op.op]);
      ui.addAIMessage({ role: 'assistant', content: answer, timestamp: Date.now() });
      return { outcome: 'applied', note: answer.split('\n')[0].slice(0, 90) };
    }

    switch (op.op) {
      case 'addPrimitive': {
        const map: Record<string, PrimitiveType> = { cube: 'box', block: 'box', plate: 'box', box: 'box', cylinder: 'cylinder', rod: 'cylinder', shaft: 'cylinder', sphere: 'sphere', ball: 'sphere', cone: 'cone', tube: 'tube', pipe: 'tube', torus: 'torus', ring: 'torus', wedge: 'wedge', ramp: 'wedge' };
        const key = Object.keys(map).find(k => req.includes(k)) || 'box';
        const type = map[key];
        const id = pStore.addPrimitive(type);
        vStore.setSelectedPartId(id);
        ui.showToast(`Added ${type}`);
        return { outcome: 'applied', note: `Added ${type}` };
      }
      case 'shellPart':
      case 'draftPart':
      case 'ribPart': {
        if (!sel) return { outcome: 'skipped', note: 'Select a part first' };
        const kind = op.op === 'shellPart' ? 'shell' : op.op === 'draftPart' ? 'draft' : 'rib';
        const num = parseFloat((req.match(/(\d+(\.\d+)?)/) || [])[1] || '');
        const params: Record<string, number> = kind === 'draft'
          ? { draftAngle: Number.isFinite(num) ? num : 5 }
          : { thickness: Number.isFinite(num) ? num : 3 };
        pStore.addFeature(sel.id, { id: genId(), type: kind, name: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} (AI)`, params, visible: true, locked: false });
        ui.showToast(`${kind} applied to ${sel.name}`);
        return { outcome: 'applied', note: `${kind} on ${sel.name}` };
      }
      case 'runSimulation': {
        const t: SimulationType = req.includes('thermal') || req.includes('heat') ? 'thermal' : req.includes('motion') || req.includes('deflect') ? 'motion' : 'stress';
        setSimType(t);
        if (!ui.showSimulation) ui.toggleSimulation();
        requestAnimationFrame(() => runSimulation());
        return { outcome: 'applied', note: `Running ${t} study` };
      }
      case 'explode': {
        pStore.toggleExplodedView();
        return { outcome: 'applied', note: 'Toggled exploded view' };
      }
      case 'section': {
        const axis: 'x' | 'y' | 'z' = req.includes('y') ? 'y' : req.includes('z') ? 'z' : 'x';
        setSection(s => ({ ...s, enabled: true, axis }));
        if (!ui.showInspector) ui.toggleInspector();
        ui.setInspectorTab('section');
        return { outcome: 'applied', note: `Section on ${axis.toUpperCase()}` };
      }
      case 'interference': {
        runInterferenceCheck();
        if (!ui.showInspector) ui.toggleInspector();
        ui.setInspectorTab('interference');
        return { outcome: 'applied', note: 'Ran interference check' };
      }
      case 'generateBOM': {
        pStore.generateBOM();
        if (!ui.showBOM) ui.toggleBOM();
        return { outcome: 'applied', note: 'Generated BOM' };
      }
      case 'newSketch': {
        if (!ui.showSketch) ui.toggleSketch();
        return { outcome: 'applied', note: 'Opened the 2D sketcher' };
      }
      case 'exportModel': {
        const fmts: AxlExportFormat[] = ['stl', 'obj', '3mf', 'dxf', 'pdf', 'json', 'png', 'gltf'];
        const fmt = fmts.find(f => req.includes(f)) || 'stl';
        handleExport(fmt);
        return { outcome: 'applied', note: `Exported ${fmt.toUpperCase()}` };
      }
      default:
        return enginePendingApplier('Axl')(op);
    }
  }, [aiAnalyze, ui, project.assembly.parts, selectedPartId, pStore, vStore, runSimulation, runInterferenceCheck, handleExport]);

  // Example prompts surfaced in the AXL command bar.
  const axlAiExamples = useMemo(() => [
    'add a cylinder', 'shell it 2mm', 'run a stress study',
    'section along x', 'check interference', 'generate bom',
  ], []);

  const buildRendererState = useCallback((): RenderState => {
    const azimuth = (cameraAngle.azimuth * Math.PI) / 180;
    const elevation = (cameraAngle.elevation * Math.PI) / 180;
    const distance = Math.max(100, cameraAngle.distance);
    const cosElevation = Math.cos(elevation);
    const position = {
      x: Math.cos(azimuth) * cosElevation * distance,
      y: -Math.sin(azimuth) * cosElevation * distance,
      z: Math.sin(elevation) * distance,
    };

    return {
      project,
      camera: {
        position,
        target: vec3(0, 0, 0),
        up: viewMode === 'top' ? vec3(0, 1, 0) : vec3(0, 0, 1),
        fov: viewMode === 'drawing' ? 18 : 45,
        near: 0.1,
        far: 10000,
      },
      viewMode: wireframe ? 'wireframe' : viewMode === 'drawing' ? 'hidden-line' : 'solid',
      projection: viewMode === 'drawing' ? 'orthographic' : 'perspective',
      shadingMode: wireframe ? 'flat' : 'smooth',
      gridVisible,
      showEdges: wireframe,
      selectedPartId,
      hoveredPartId,
      stressMap: simResults?.stressMap ?? null,
      section: section.enabled ? { axis: section.axis, offset: section.offset, flip: section.flip } : null,
    };
  }, [cameraAngle, gridVisible, project, selectedPartId, hoveredPartId, simResults, viewMode, wireframe, section]);

  // ─── 3D Viewport Rendering (Canvas 2D) ────────────────────────────────
  const renderViewport = useCallback(() => {
    const renderer = rendererRef.current;
    if (renderer?.isWebGL) {
      renderer.render(buildRendererState());
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Canvas 2D cannot resolve CSS custom properties — assigning 'var(--x)' to
    // fillStyle/strokeStyle is silently IGNORED (the previous color sticks), so
    // every var()-based color below was painting wrong (black grid, invisible
    // selection ring, unthemed HUD). Resolve the theme tokens to literals once
    // per frame; fallbacks match the dark theme's real values.
    const theme = (() => {
      const cs = getComputedStyle(canvas);
      const v = (name: string, fallback: string) => (cs.getPropertyValue(name) || '').trim() || fallback;
      return {
        bg: v('--color-bg-elevated', '#141416'),
        gridLine: v('--color-bg-hover', 'rgba(255,255,255,0.07)'),
        accent: v('--color-accent', '#0a84ff'),
        error: v('--color-error', '#ff453a'),
        success: v('--color-success', '#32d74b'),
        warning: v('--color-warning', '#ff9f0a'),
        hud: v('--color-text-tertiary', 'rgba(255,255,255,0.45)'),
      };
    })();

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (gridVisible) {
      const gridSize = 20;
      const gridCount = 30;
      const cx = w / 2, cy = h / 2;
      ctx.strokeStyle = theme.gridLine;
      ctx.lineWidth = 0.5;
      for (let i = -gridCount; i <= gridCount; i++) {
        const x = cx + i * gridSize * Math.cos(cameraAngle.azimuth * Math.PI / 180);
        const y = cy + i * gridSize * Math.sin(cameraAngle.elevation * Math.PI / 180) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - gridCount * gridSize, y);
        ctx.lineTo(x + gridCount * gridSize, y);
        ctx.stroke();
        const x2 = cx + i * gridSize;
        ctx.beginPath();
        ctx.moveTo(x2, cy - gridCount * gridSize * 0.5);
        ctx.lineTo(x2, cy + gridCount * gridSize * 0.5);
        ctx.stroke();
      }
      // Axis lines
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.error;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 80, cy); ctx.stroke();
      ctx.fillStyle = theme.error; ctx.font = '10px system-ui'; ctx.fillText('X', cx + 84, cy + 4);
      ctx.strokeStyle = theme.success;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 80); ctx.stroke();
      ctx.fillStyle = theme.success; ctx.fillText('Y', cx + 4, cy - 84);
      ctx.strokeStyle = theme.accent;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 50, cy + 30); ctx.stroke();
      ctx.fillStyle = theme.accent; ctx.fillText('Z', cx - 62, cy + 38);
    }

    // Render parts
    const parts = project.assembly.parts;
    // Camera projection helpers
    const azRad = cameraAngle.azimuth * Math.PI / 180;
    const elRad = cameraAngle.elevation * Math.PI / 180;
    const camScale = 500 / Math.max(100, cameraAngle.distance);
    // Lock camera for standard views
    let effAz = azRad, effEl = elRad;
    if (viewMode === 'front') { effAz = 0; effEl = 0; }
    else if (viewMode === 'top') { effAz = 0; effEl = Math.PI / 2 * 0.99; }
    else if (viewMode === 'right') { effAz = Math.PI / 2; effEl = 0; }
    parts.forEach(part => {
      if (!part.visible) return;
      const feat = part.features[0];
      if (!feat) return;
      const params = feat.params;
      // Project 3D position through camera angle
      const px = part.transform.position.x;
      const py = part.transform.position.y;
      const pz = part.transform.position.z || 0;
      let isoX = px * Math.cos(effAz) - pz * Math.sin(effAz);
      let isoY = -py * Math.cos(effEl) + (px * Math.sin(effAz) + pz * Math.cos(effAz)) * Math.sin(effEl);
      // Apply exploded view offset
      if (project.assembly.exploded) {
        const dist = project.assembly.explodeDistance || 50;
        const mag = Math.sqrt(px * px + py * py + (pz * pz)) || 1;
        isoX += (px / mag) * dist * Math.cos(effAz);
        isoY -= (py / mag) * dist * Math.cos(effEl);
      }
      const cx = w / 2 + isoX * camScale;
      const cy = h / 2 + isoY * camScale;

      let fillColor = part.color;
      if (simResults) {
        const sm = simResults.stressMap.find(s => s.partId === part.id);
        if (sm) fillColor = stressColor(sm.ratio);
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(part.transform.rotation.z * Math.PI / 180);
      ctx.scale(part.transform.scale.x, part.transform.scale.y);

      const primType = params.primitiveType as string;

      if (wireframe) {
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = fillColor;
        // Add shadow for depth
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 6;
      }

      switch (primType) {
        case 'box': {
          const bw = (params.width as number) || 50;
          const bh = (params.height as number) || 50;
          if (wireframe) {
            ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
            const d = (params.depth as number || 50) * 0.4;
            ctx.strokeRect(-bw / 2 - d * 0.3, -bh / 2 - d * 0.3, bw, bh);
            ctx.beginPath();
            ctx.moveTo(-bw / 2, -bh / 2); ctx.lineTo(-bw / 2 - d * 0.3, -bh / 2 - d * 0.3);
            ctx.moveTo(bw / 2, -bh / 2); ctx.lineTo(bw / 2 - d * 0.3, -bh / 2 - d * 0.3);
            ctx.moveTo(bw / 2, bh / 2); ctx.lineTo(bw / 2 - d * 0.3, bh / 2 - d * 0.3);
            ctx.moveTo(-bw / 2, bh / 2); ctx.lineTo(-bw / 2 - d * 0.3, bh / 2 - d * 0.3);
            ctx.stroke();
          } else {
            // Front face with gradient
            const frontGrad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
            frontGrad.addColorStop(0, fillColor);
            frontGrad.addColorStop(1, `${fillColor}bb`);
            ctx.fillStyle = frontGrad;
            ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
            // Edge highlight on front face
            ctx.strokeStyle = `${fillColor}55`;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
            // Top face (lighter)
            ctx.fillStyle = `${fillColor}cc`;
            const d = (params.depth as number || 50) * 0.3;
            ctx.beginPath();
            ctx.moveTo(-bw / 2, -bh / 2);
            ctx.lineTo(-bw / 2 - d * 0.3, -bh / 2 - d * 0.5);
            ctx.lineTo(bw / 2 - d * 0.3, -bh / 2 - d * 0.5);
            ctx.lineTo(bw / 2, -bh / 2);
            ctx.closePath();
            ctx.fill();
            // Right side face (darker)
            ctx.fillStyle = `${fillColor}66`;
            ctx.beginPath();
            ctx.moveTo(bw / 2, -bh / 2);
            ctx.lineTo(bw / 2 - d * 0.3, -bh / 2 - d * 0.5);
            ctx.lineTo(bw / 2 - d * 0.3, bh / 2 - d * 0.5);
            ctx.moveTo(bw / 2, bh / 2);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'cylinder': {
          const r = (params.radius as number) || 25;
          const ch = (params.height as number) || 50;
          if (wireframe) {
            ctx.beginPath(); ctx.ellipse(0, -ch / 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, ch / 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-r, -ch / 2); ctx.lineTo(-r, ch / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(r, -ch / 2); ctx.lineTo(r, ch / 2); ctx.stroke();
          } else {
            // Body with horizontal gradient
            const cylGrad = ctx.createLinearGradient(-r, 0, r, 0);
            cylGrad.addColorStop(0, `${fillColor}88`);
            cylGrad.addColorStop(0.4, fillColor);
            cylGrad.addColorStop(0.6, fillColor);
            cylGrad.addColorStop(1, `${fillColor}66`);
            ctx.fillStyle = cylGrad;
            ctx.fillRect(-r, -ch / 2, r * 2, ch);
            // Top ellipse (lighter)
            ctx.fillStyle = `${fillColor}dd`;
            ctx.beginPath(); ctx.ellipse(0, -ch / 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `${fillColor}44`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            // Bottom edge
            ctx.beginPath(); ctx.ellipse(0, ch / 2, r, r * 0.3, 0, Math.PI, Math.PI * 2); ctx.strokeStyle = `${fillColor}33`; ctx.stroke();
          }
          break;
        }
        case 'sphere': {
          const sr = (params.radius as number) || 25;
          ctx.beginPath();
          ctx.arc(0, 0, sr, 0, Math.PI * 2);
          if (wireframe) {
            ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, 0, sr, sr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
          } else {
            // Radial gradient for 3D sphere look
            const sphereGrad = ctx.createRadialGradient(-sr * 0.3, -sr * 0.3, sr * 0.1, 0, 0, sr);
            sphereGrad.addColorStop(0, '#ffffff44');
            sphereGrad.addColorStop(0.3, fillColor);
            sphereGrad.addColorStop(1, `${fillColor}55`);
            ctx.fillStyle = sphereGrad;
            ctx.fill();
            // Equator ellipse for depth
            ctx.strokeStyle = `${fillColor}44`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.ellipse(0, 0, sr, sr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }
        case 'cone': {
          const cr = (params.radius as number) || 25;
          const cch = (params.height as number) || 50;
          ctx.beginPath();
          ctx.moveTo(0, -cch / 2);
          ctx.lineTo(-cr, cch / 2);
          ctx.lineTo(cr, cch / 2);
          ctx.closePath();
          if (wireframe) ctx.stroke(); else ctx.fill();
          break;
        }
        case 'torus': {
          const tR = (params.ringRadius as number) || 30;
          const tr = (params.tubeRadius as number) || 10;
          if (wireframe) {
            ctx.beginPath(); ctx.ellipse(0, 0, tR + tr, (tR + tr) * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, 0, Math.max(tR - tr, 1), Math.max((tR - tr) * 0.35, 1), 0, 0, Math.PI * 2); ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, tR + tr, (tR + tr) * 0.35, 0, 0, Math.PI * 2);
            ctx.ellipse(0, 0, Math.max(tR - tr, 1), Math.max((tR - tr) * 0.35, 1), 0, 0, Math.PI * 2);
            ctx.fill('evenodd');
          }
          break;
        }
        case 'tube': {
          const tOuter = (params.outerRadius as number) || 25;
          const tInner = (params.innerRadius as number) || 18;
          const tHeight = (params.height as number) || 50;
          if (wireframe) {
            ctx.beginPath(); ctx.ellipse(0, -tHeight / 2, tOuter, tOuter * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, tHeight / 2, tOuter, tOuter * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, -tHeight / 2, tInner, tInner * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-tOuter, -tHeight / 2); ctx.lineTo(-tOuter, tHeight / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(tOuter, -tHeight / 2); ctx.lineTo(tOuter, tHeight / 2); ctx.stroke();
          } else {
            ctx.fillRect(-tOuter, -tHeight / 2, tOuter * 2, tHeight);
            ctx.beginPath(); ctx.ellipse(0, -tHeight / 2, tOuter, tOuter * 0.3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.rect(-tOuter - 1, -tHeight / 2 - 1, (tOuter + 1) * 2, tHeight + 2);
            ctx.rect(-tInner, -tHeight / 2, tInner * 2, tHeight);
            ctx.clip('evenodd');
            ctx.fillRect(-tOuter, -tHeight / 2, tOuter * 2, tHeight);
            ctx.restore();
          }
          break;
        }
        case 'wedge': {
          const ww = (params.width as number) || 50;
          const wh = (params.height as number) || 50;
          const wd = (params.depth as number) || 50;
          ctx.beginPath();
          ctx.moveTo(-ww / 2, wh / 2);
          ctx.lineTo(ww / 2, wh / 2);
          ctx.lineTo(ww / 2, -wh / 2);
          ctx.closePath();
          if (wireframe) ctx.stroke(); else ctx.fill();
          if (!wireframe) {
            ctx.fillStyle = `${fillColor}66`;
            const dOff = wd * 0.2;
            ctx.beginPath();
            ctx.moveTo(ww / 2, -wh / 2);
            ctx.lineTo(ww / 2 - dOff, -wh / 2 - dOff * 0.5);
            ctx.lineTo(ww / 2 - dOff, wh / 2 - dOff * 0.5);
            ctx.lineTo(ww / 2, wh / 2);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        default:
          ctx.fillRect(-25, -25, 50, 50);
      }

      // Non-primitive features (extrude, revolve, chamfer, fillet, pattern)
      // reset shadow for features
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      part.features.forEach(f => {
        if (f.type === 'primitive' || f.type === 'boolean' || !f.visible || f.suppressed) return;
        const fp = f.params;
        ctx.save();
        switch (f.type) {
          case 'extrude': {
            const depth = (fp.depth as number) || 20;
            const dOff = depth * 0.4;
            ctx.strokeStyle = `${fillColor}cc`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            // Draw extrusion envelope lines extending from corners
            const sz = (params.width as number) || (params.radius as number) ? ((params.radius as number) || 25) * 2 : 50;
            const halfSz = sz / 2;
            ctx.beginPath();
            ctx.moveTo(-halfSz, -halfSz); ctx.lineTo(-halfSz - dOff * 0.3, -halfSz - dOff * 0.5);
            ctx.moveTo(halfSz, -halfSz); ctx.lineTo(halfSz - dOff * 0.3, -halfSz - dOff * 0.5);
            ctx.moveTo(-halfSz, halfSz); ctx.lineTo(-halfSz - dOff * 0.3, halfSz - dOff * 0.5);
            ctx.moveTo(halfSz, halfSz); ctx.lineTo(halfSz - dOff * 0.3, halfSz - dOff * 0.5);
            ctx.stroke();
            // Extruded face outline
            ctx.fillStyle = `${fillColor}33`;
            ctx.beginPath();
            ctx.moveTo(-halfSz - dOff * 0.3, -halfSz - dOff * 0.5);
            ctx.lineTo(halfSz - dOff * 0.3, -halfSz - dOff * 0.5);
            ctx.lineTo(halfSz - dOff * 0.3, halfSz - dOff * 0.5);
            ctx.lineTo(-halfSz - dOff * 0.3, halfSz - dOff * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.setLineDash([]);
            // Label
            ctx.fillStyle = theme.hud;
            ctx.font = '8px system-ui';
            ctx.fillText(`E:${depth}`, -halfSz - dOff * 0.3, halfSz - dOff * 0.5 + 10);
            break;
          }
          case 'revolve': {
            const angle = (fp.angle as number) || 360;
            const r = (params.radius as number) || 25;
            ctx.strokeStyle = `${fillColor}88`;
            ctx.lineWidth = 0.7;
            ctx.setLineDash([2, 2]);
            // Draw sweep arc indicating revolve
            const sweepRad = (angle * Math.PI) / 180;
            const sweepR = r + 12;
            ctx.beginPath();
            ctx.arc(0, 0, sweepR, -Math.PI / 2, -Math.PI / 2 + sweepRad);
            ctx.stroke();
            // Arrow at end
            const endAngle = -Math.PI / 2 + sweepRad;
            const ax = Math.cos(endAngle) * sweepR;
            const ay = Math.sin(endAngle) * sweepR;
            ctx.setLineDash([]);
            ctx.fillStyle = `${fillColor}aa`;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 4, ay - 3);
            ctx.lineTo(ax - 4, ay + 3);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = theme.hud;
            ctx.font = '8px system-ui';
            ctx.fillText(`R:${angle}°`, ax + 5, ay);
            break;
          }
          case 'chamfer': {
            const dist = (fp.distance as number) || 2;
            const sz = (params.width as number) || (params.radius as number) ? ((params.radius as number) || 25) * 2 : 50;
            const halfSz = sz / 2;
            const cDist = Math.min(dist * 3, halfSz * 0.4); // Visual scale
            ctx.strokeStyle = '#FFD60A88';
            ctx.lineWidth = 1.2;
            // Draw chamfer cuts at corners
            const corners = [[-halfSz, -halfSz], [halfSz, -halfSz], [halfSz, halfSz], [-halfSz, halfSz]];
            corners.forEach(([cx2, cy2]) => {
              ctx.beginPath();
              ctx.moveTo(cx2 + (cx2 < 0 ? cDist : -cDist), cy2);
              ctx.lineTo(cx2, cy2 + (cy2 < 0 ? cDist : -cDist));
              ctx.stroke();
            });
            ctx.fillStyle = theme.hud;
            ctx.font = '8px system-ui';
            ctx.fillText(`C:${dist}`, halfSz + 4, -halfSz);
            break;
          }
          case 'fillet': {
            const rad = (fp.radius as number) || 3;
            const sz = (params.width as number) || (params.radius as number) ? ((params.radius as number) || 25) * 2 : 50;
            const halfSz = sz / 2;
            const fRad = Math.min(rad * 3, halfSz * 0.4); // Visual scale
            ctx.strokeStyle = '#30D15888';
            ctx.lineWidth = 1.2;
            // Draw fillet arcs at corners
            ctx.beginPath(); ctx.arc(-halfSz + fRad, -halfSz + fRad, fRad, Math.PI, Math.PI * 1.5); ctx.stroke();
            ctx.beginPath(); ctx.arc(halfSz - fRad, -halfSz + fRad, fRad, Math.PI * 1.5, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(halfSz - fRad, halfSz - fRad, fRad, 0, Math.PI * 0.5); ctx.stroke();
            ctx.beginPath(); ctx.arc(-halfSz + fRad, halfSz - fRad, fRad, Math.PI * 0.5, Math.PI); ctx.stroke();
            ctx.fillStyle = theme.hud;
            ctx.font = '8px system-ui';
            ctx.fillText(`R:${rad}`, halfSz + 4, -halfSz);
            break;
          }
          case 'pattern': {
            const count = (fp.count as number) || 4;
            const spacing = (fp.spacing as number) || 30;
            ctx.strokeStyle = `${fillColor}44`;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 3]);
            const r = (params.radius as number) || 25;
            const sz = (params.width as number) || r * 2;
            // Draw ghost copies at pattern offsets
            for (let i = 1; i < count; i++) {
              const ox = i * spacing;
              ctx.strokeRect(ox - sz / 2, -sz / 2, sz, sz);
            }
            ctx.setLineDash([]);
            ctx.fillStyle = theme.hud;
            ctx.font = '8px system-ui';
            ctx.fillText(`×${count}`, spacing * (count - 1) + sz / 2 + 4, 0);
            break;
          }
        }
        ctx.restore();
      });

      // Boolean features
      part.features.forEach(f => {
        if (f.type !== 'boolean' || !f.visible) return;
        const bOp = f.params.operation as string;
        const bx = (f.params.bOffsetX as number) || 0;
        const by = -(f.params.bOffsetY as number) || 0;
        const bPrim = f.params.bPrimType as string;
        const bw = (f.params.bWidth as number) || 50;
        const bh = (f.params.bHeight as number) || 50;
        const br = (f.params.bRadius as number) || 25;

        if (bOp === 'subtract') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = 1;
        } else if (bOp === 'intersect') {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.globalAlpha = 1;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = fillColor;
          ctx.globalAlpha = 0.85;
        }

        ctx.save();
        ctx.translate(bx, by);
        switch (bPrim) {
          case 'sphere':
            ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill(); break;
          case 'cylinder':
            ctx.fillRect(-br, -bh / 2, br * 2, bh); break;
          case 'cone':
            ctx.beginPath(); ctx.moveTo(0, -bh / 2); ctx.lineTo(-br, bh / 2); ctx.lineTo(br, bh / 2); ctx.closePath(); ctx.fill(); break;
          default:
            ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      });

      // Selection highlight
      if (part.id === selectedPartId) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const sz = Math.max((params.width as number) || 50, (params.radius as number) ? (params.radius as number) * 2 : 50, 50);
        ctx.strokeRect(-sz / 2 - 6, -sz / 2 - 6, sz + 12, sz + 12);
        ctx.setLineDash([]);
      }

      // Hover highlight -- a lighter SOLID ring so the part under the pointer
      // reads as clickable before you commit (selection keeps the dashed ring).
      if (part.id === hoveredPartId && part.id !== selectedPartId) {
        ctx.strokeStyle = theme.accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        const hz = Math.max((params.width as number) || 50, (params.radius as number) ? (params.radius as number) * 2 : 50, 50);
        ctx.strokeRect(-hz / 2 - 4, -hz / 2 - 4, hz + 8, hz + 8);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    });

    // Alignment-snap inference guides: while a move drag is snapped onto
    // another part's axis, draw a dashed line through the two aligned centers
    // (SolidWorks/Figma-style) so the snap reads as intentional, not a jump.
    if (snapGuidesRef.current.length) {
      const projGuide = (p: Vec3) => {
        const gx = p.x * Math.cos(effAz) - (p.z || 0) * Math.sin(effAz);
        const gy = -p.y * Math.cos(effEl) + (p.x * Math.sin(effAz) + (p.z || 0) * Math.cos(effAz)) * Math.sin(effEl);
        return { x: w / 2 + gx * camScale, y: h / 2 + gy * camScale };
      };
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      snapGuidesRef.current.forEach(g => {
        const pa = projGuide(g.a);
        const pb = projGuide(g.b);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.setLineDash([]);
        [pa, pb].forEach(pt => { ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.stroke(); });
        ctx.setLineDash([5, 4]);
      });
      ctx.setLineDash([]);
    }

    // Measurements overlay
    project.measurements.forEach(m => {
      if (m.points.length >= 2) {
        const p1 = { x: w / 2 + m.points[0].x, y: h / 2 - m.points[0].y };
        const p2 = { x: w / 2 + m.points[1].x, y: h / 2 - m.points[1].y };
        ctx.strokeStyle = theme.warning;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = theme.warning;
        ctx.font = '10px system-ui';
        ctx.fillText(m.label, (p1.x + p2.x) / 2 + 5, (p1.y + p2.y) / 2 - 5);
      }
    });

    // GD&T annotations overlay
    project.annotations.forEach(a => {
      // Smart Annotation: project the callout's model-space position through the
      // SAME camera transform parts use, so it tracks its feature as you orbit /
      // zoom / explode (previously it sat at a raw screen offset and detached).
      // The frame/text below stays in screen pixels -> readable at any zoom.
      const ax0 = a.position.x, ay0 = a.position.y, az0 = a.position.z || 0;
      let aIsoX = ax0 * Math.cos(effAz) - az0 * Math.sin(effAz);
      let aIsoY = -ay0 * Math.cos(effEl) + (ax0 * Math.sin(effAz) + az0 * Math.cos(effAz)) * Math.sin(effEl);
      if (project.assembly.exploded) {
        const dist = project.assembly.explodeDistance || 50;
        const mag = Math.sqrt(ax0 * ax0 + ay0 * ay0 + az0 * az0) || 1;
        aIsoX += (ax0 / mag) * dist * Math.cos(effAz);
        aIsoY -= (ay0 / mag) * dist * Math.cos(effEl);
      }
      const px = w / 2 + aIsoX * camScale;
      const py = h / 2 + aIsoY * camScale;
      const frameText = `${a.symbol} ${a.tolerance} | ${a.datum}`;
      ctx.font = '10px monospace';
      const tw = ctx.measureText(frameText).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px + 15, py - 18, tw, 18);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 15, py - 18, tw, 18);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 15, py - 9); ctx.stroke();
      ctx.fillStyle = theme.accent;
      ctx.fillText(frameText, px + 21, py - 5);
    });

    // Camera info
    ctx.fillStyle = theme.hud;
    ctx.font = '10px system-ui';
    ctx.fillText(`${viewMode.toUpperCase()} | Grid: ${project.gridSnap}${project.units} | Parts: ${parts.length}`, 12, h - 10);
    ctx.fillText(`Az: ${cameraAngle.azimuth.toFixed(0)}\u00b0 El: ${cameraAngle.elevation.toFixed(0)}\u00b0`, w - 140, h - 10);
    ctx.restore(); // undo DPR scale
  }, [buildRendererState, project, gridVisible, wireframe, cameraAngle, selectedPartId, hoveredPartId, simResults, viewMode]);

  // Keep render function ref in sync (avoids restarting rAF loop on state change)
  // and flag the viewport dirty: any state change that re-runs this render is,
  // by definition, something the next frame must reflect.
  renderFnRef.current = renderViewport;
  needsRenderRef.current = true;

  // ─── Canvas resize & render loop ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new AXLRenderer();
    renderer.init(canvas);
    rendererRef.current = renderer;
    // DEX memory pressure: drop off-screen GPU meshes (on-screen parts stay).
    renderer.setMemoryPressure(useResourcePressure.getState().level);
    const unsubPressure = useResourcePressure.subscribe((st, prev) => {
      if (st.level !== prev.level) renderer.setMemoryPressure(st.level);
    });

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = parent.clientWidth * dpr;
        canvas.height = parent.clientHeight * dpr;
        canvas.style.width = parent.clientWidth + 'px';
        canvas.style.height = parent.clientHeight + 'px';
        renderer.resize();
        needsRenderRef.current = true; // new backing-store size needs a redraw
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    const renderViewportRef = renderFnRef;
    renderViewportRef.current = renderViewport;
    let running = true;
    const loop = () => {
      if (!running) return;
      // Render only when the scene is dirty. The flag is raised by any state
      // change (via renderFnRef assignment) and by resize; we clear it after
      // drawing so a static view settles to zero per-frame work.
      if (needsRenderRef.current) {
        needsRenderRef.current = false;
        renderViewportRef.current();
      }
      animRef.current = requestAnimationFrame(loop);
    };
    // Only render when tab is visible
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current);
      } else {
        needsRenderRef.current = true; // repaint once the tab is visible again
        animRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      ro.disconnect();
      unsubPressure();
      renderer.dispose();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => { if (ui.showExport) ui.toggleExport(); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [ui.showExport, ui.toggleExport]);

  // ─── Mouse interaction ────────────────────────────────────────────────

  // Shared screen-space hit-test for click-select AND hover. Uses the SAME
  // camera transform as rendering (including the exploded-view offset the old
  // inline test ignored) and carries cameraAngle/viewMode in its deps — the
  // previous inline version captured a stale camera, so after orbiting, clicks
  // tested against the OLD view until an unrelated project change rebuilt it.
  const hitTestAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = rect.width, h = rect.height;
    const azRad = cameraAngle.azimuth * Math.PI / 180;
    const elRad = cameraAngle.elevation * Math.PI / 180;
    const camScale = 500 / Math.max(100, cameraAngle.distance);
    let effAz = azRad, effEl = elRad;
    if (viewMode === 'front') { effAz = 0; effEl = 0; }
    else if (viewMode === 'top') { effAz = 0; effEl = Math.PI / 2 * 0.99; }
    else if (viewMode === 'right') { effAz = Math.PI / 2; effEl = 0; }
    for (const part of [...project.assembly.parts].reverse()) {
      if (!part.visible) continue;
      const px = part.transform.position.x;
      const py = part.transform.position.y;
      const pz = part.transform.position.z || 0;
      let isoX = px * Math.cos(effAz) - pz * Math.sin(effAz);
      let isoY = -py * Math.cos(effEl) + (px * Math.sin(effAz) + pz * Math.cos(effAz)) * Math.sin(effEl);
      if (project.assembly.exploded) {
        const dist = project.assembly.explodeDistance || 50;
        const mag = Math.sqrt(px * px + py * py + pz * pz) || 1;
        isoX += (px / mag) * dist * Math.cos(effAz);
        isoY -= (py / mag) * dist * Math.cos(effEl);
      }
      const sx = w / 2 + isoX * camScale;
      const sy = h / 2 + isoY * camScale;
      if (Math.abs(mx - sx) < 30 && Math.abs(my - sy) < 30) return part.id;
    }
    return null;
  }, [cameraAngle, viewMode, project.assembly.parts, project.assembly.exploded, project.assembly.explodeDistance]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    lastMouse.current = { x: e.clientX, y: e.clientY, down: true, button: e.button };
    // Capture pointer for all types (mouse, touch, pen) to ensure smooth drag
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }

    // Capture undo BEFORE any drag mutations begin
    if (e.button === 0 && (tool === 'move' || tool === 'rotate' || tool === 'scale') && selectedPartId) {
      pStore.pushUndo();
    }

    if (tool === 'select') {
      vStore.setSelectedPartId(hitTestAtPoint(e.clientX, e.clientY));
    }

    if (tool === 'measure') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = -(e.clientY - rect.top - rect.height / 2);
      if (!measureStart.current) {
        measureStart.current = vec3(mx, my, 0);
      } else {
        const start = measureStart.current;
        const end = vec3(mx, my, 0);
        const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
        pStore.addMeasurement('distance', [start, end], dist);
        measureStart.current = null;
        ui.showToast(`Distance: ${dist.toFixed(1)} ${project.units}`);
      }
    }
  }, [tool, project, pStore, vStore, ui, hitTestAtPoint]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!lastMouse.current.down) {
      // Hover feedback: highlight the part under the pointer and switch the
      // cursor, so the viewport reads as interactive before you click.
      const id = hitTestAtPoint(e.clientX, e.clientY);
      if (id !== hoveredPartId) vStore.setHoveredPartId(id);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = id ? (tool === 'move' ? 'move' : 'pointer') : '';
      return;
    }
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current.x = e.clientX;
    lastMouse.current.y = e.clientY;

    // Orbit on right/middle drag, OR on a plain LEFT drag unless we're actively
    // transforming a selected part (move/rotate/scale tools). Left-drag-to-orbit
    // is the intuitive default every 3D/CAD tool uses -- previously orbit was
    // right/middle-only, so a natural left-drag did nothing and the viewport felt
    // completely broken.
    const transformingPart = lastMouse.current.button === 0 && !!selectedPartId &&
      (tool === 'move' || tool === 'rotate' || tool === 'scale');
    const leftOrbit = lastMouse.current.button === 0 && !transformingPart;
    if (lastMouse.current.button === 2 || lastMouse.current.button === 1 || leftOrbit) {
      setCameraAngle(prev => ({
        azimuth: prev.azimuth + dx * 0.5,
        elevation: Math.max(-89, Math.min(89, prev.elevation + dy * 0.5)),
        distance: prev.distance,
      }));
    }

    if (lastMouse.current.button === 0 && tool === 'move' && selectedPartId) {
      const snap = project.gridSnap;
      const camScale = 500 / Math.max(100, cameraAngle.distance);
      // Invert the isometric projection so screen-space drag maps to world-space movement
      const azRad = cameraAngle.azimuth * Math.PI / 180;
      const elRad = cameraAngle.elevation * Math.PI / 180;
      const cosAz = Math.cos(azRad), sinAz = Math.sin(azRad);
      const cosEl = Math.cos(elRad), sinEl = Math.sin(elRad);
      const sdx = dx / camScale;
      const sdy = dy / camScale;
      // Inverse of: isoX = px*cosAz - pz*sinAz, isoY = -py*cosEl + (px*sinAz + pz*cosAz)*sinEl
      const worldDx = sdx * cosAz + sdy * sinAz * sinEl;
      const worldDy = -sdy * cosEl;
      const worldDz = -sdx * sinAz + sdy * cosAz * sinEl;
      const part = project.assembly.parts.find(p => p.id === selectedPartId);
      if (part) {
        // Alignment inference (utils/alignSnap): pull an axis onto the NEAREST
        // candidate within ~8 screen px (tolerance scales with zoom) — center
        // alignment, face-touch, or face-flush against other parts' extents —
        // so parts line up and mate like real CAD instead of only landing on
        // grid multiples. Alt bypasses ALL snapping for free placement; the
        // viewport-store snap toggle turns inference off persistently.
        const movedFeat = (part.features[0]?.params || {}) as Record<string, unknown>;
        const { position, guides } = alignSnapPosition(
          {
            x: part.transform.position.x + worldDx,
            y: part.transform.position.y + worldDy,
            z: (part.transform.position.z || 0) + worldDz,
          },
          project.assembly.parts
            .filter(p => p.id !== selectedPartId && p.visible)
            .map(p => {
              const feat = (p.features[0]?.params || {}) as Record<string, unknown>;
              return {
                id: p.id,
                position: { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z || 0 },
                halfExtents: primitiveHalfExtents(feat.primitiveType as string | undefined, feat, p.transform.scale),
              };
            }),
          {
            tolerance: Math.max(1, 8 / camScale),
            gridSnap: snap,
            snapEnabled,
            free: e.altKey,
            movedHalfExtents: primitiveHalfExtents(movedFeat.primitiveType as string | undefined, movedFeat, part.transform.scale),
          },
        );
        snapGuidesRef.current = guides;
        pStore.updatePartTransform(selectedPartId, 'position', 'x', position.x);
        pStore.updatePartTransform(selectedPartId, 'position', 'y', position.y);
        pStore.updatePartTransform(selectedPartId, 'position', 'z', position.z);
      }
    }

    if (lastMouse.current.button === 0 && tool === 'rotate' && selectedPartId) {
      const part = project.assembly.parts.find(p => p.id === selectedPartId);
      if (part) {
        pStore.updatePartTransform(selectedPartId, 'rotation', 'z', part.transform.rotation.z + dx);
      }
    }

    if (lastMouse.current.button === 0 && tool === 'scale' && selectedPartId) {
      const scaleFactor = 1 - dy * 0.005;
      const part = project.assembly.parts.find(p => p.id === selectedPartId);
      if (part) {
        pStore.updatePartTransform(selectedPartId, 'scale', 'x', Math.max(0.05, part.transform.scale.x * scaleFactor));
        pStore.updatePartTransform(selectedPartId, 'scale', 'y', Math.max(0.05, part.transform.scale.y * scaleFactor));
        pStore.updatePartTransform(selectedPartId, 'scale', 'z', Math.max(0.05, part.transform.scale.z * scaleFactor));
      }
    }
  }, [tool, selectedPartId, hoveredPartId, project.gridSnap, project.assembly.parts, pStore, vStore, cameraAngle, snapEnabled, hitTestAtPoint]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    lastMouse.current.down = false;
    if (snapGuidesRef.current.length) {
      snapGuidesRef.current = [];
      needsRenderRef.current = true; // erase the inference guides
    }
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [tool, selectedPartId, pStore]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    setCameraAngle(prev => {
      // Multiplicative (constant-fraction) zoom: gives equally fine control whether
      // zoomed in close or far out, instead of a fixed linear step that crawls when
      // near and jumps when far. ~12% per notch, direction follows wheel sign.
      const factor = Math.exp(Math.sign(e.deltaY) * 0.12 * Math.min(Math.abs(e.deltaY) / 100, 3));
      return { ...prev, distance: Math.max(100, Math.min(2000, prev.distance * factor)) };
    });
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'axl') || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();

      // ── Ctrl+Shift combos ──
      if (e.ctrlKey && e.shiftKey) {
        if (k === 'z') { e.preventDefault(); pStore.redo(); return; }          // Ctrl+Shift+Z  redo (alt)
        if (k === 'e') { e.preventDefault(); ui.toggleExport(); return; }      // Ctrl+Shift+E  export dialog
        if (k === 's') { e.preventDefault(); ui.toggleSimulation(); return; }  // Ctrl+Shift+S  simulation panel
        if (k === 'd') { e.preventDefault(); ui.toggleDrawing(); return; }     // Ctrl+Shift+D  drawing mode
        return;
      }

      // ── Ctrl combos ──
      if (e.ctrlKey) {
        if (k === 'z') { e.preventDefault(); pStore.undo(); return; }          // Ctrl+Z  undo
        if (k === 'y') { e.preventDefault(); pStore.redo(); return; }          // Ctrl+Y  redo
        if (k === 'd' && selectedPartId) {                                      // Ctrl+D  duplicate part
          e.preventDefault();
          const newId = pStore.duplicatePart(selectedPartId);
          if (newId) vStore.setSelectedPartId(newId);
          return;
        }
        if (k === 'g') { e.preventDefault(); vStore.toggleGrid(); return; }    // Ctrl+G  toggle grid
        if (k === 'b') { e.preventDefault(); ui.toggleBOM(); return; }         // Ctrl+B  toggle BOM
        if (k === 'p') { e.preventDefault(); ui.togglePartsLibrary(); return; }// Ctrl+P  parts library
        if (k === 'f') { e.preventDefault(); ui.toggleFeatureCreate(); return; }// Ctrl+F  feature creator
        if (k === ',') { e.preventDefault(); ui.toggleSettings(); return; }    // Ctrl+,  settings
        if (k === 'a') {                                                        // Ctrl+A  select all (first part)
          e.preventDefault();
          const parts = project.assembly.parts;
          if (parts.length > 0 && !selectedPartId) vStore.setSelectedPartId(parts[0].id);
          else vStore.setSelectedPartId(null);
          return;
        }
        if (k === 'e') {                                                        // Ctrl+E  quick export JSON
          e.preventDefault();
          doExport(useProjectStore.getState().project, 'json');
          ui.showToast('Exported project as JSON');
          return;
        }
        if (k === 'n') {                                                        // Ctrl+N  new project (reset)
          e.preventDefault();
          void (async () => {
            const keep = await keepCurrentProject('starting a new project');
            if (!keep.go) return;
            pStore.newProject();
            vStore.setSelectedPartId(null);
            ui.showToast(keep.kept ? 'New project started. The previous one is in Collab Hub checkpoints.' : 'New project started');
          })();
          return;
        }
        return; // consume unknown Ctrl combos gracefully
      }

      // ── Single-key shortcuts (no modifier) ──
      if (k === 'delete' && selectedPartId) { pStore.deletePart(selectedPartId); vStore.setSelectedPartId(null); }
      else if (k === 'escape') { vStore.setSelectedPartId(null); vStore.setTool('select'); }
      else if (k === 'v') vStore.setTool('select');
      else if (k === 'g') vStore.setTool('move');
      else if (k === 'r') vStore.setTool('rotate');
      else if (k === 's') vStore.setTool('scale');
      else if (k === 'm') vStore.setTool('measure');
      else if (k === 'w') setWireframe(prev => !prev);
      else if (k === 'x') pStore.toggleExplodedView();
      else if (k === 'i') ui.toggleInspector();                                              // I = inspector (configs/views/interference)
      else if (k === 'f') applyStandardView('front');                                      // F = front view reset
      else if (k === 't') applyStandardView('top');                                        // T = top view
      else if (k === ' ') { e.preventDefault(); ui.toggleSimulation(); }                  // Space = simulation
      else if (k === '1') applyStandardView('3d');
      else if (k === '2') applyStandardView('front');
      else if (k === '3') applyStandardView('top');
      else if (k === '4') applyStandardView('right');
      else if (k === '5') applyStandardView('drawing');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applyStandardView, pStore, vStore, ui, selectedPartId, project.assembly.parts, keepCurrentProject]);

  // ─── Styles ───────────────────────────────────────────────────────────
  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 10,
    background: active ? 'var(--color-accent-light)' : 'transparent',
    border: active ? '1px solid var(--color-accent-muted)' : '1px solid transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  });

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="axl-root dex-theme-dark" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', overflow: 'hidden', minHeight: 0, fontFamily: 'var(--font-family)', fontSize: '11px', position: 'relative', contain: 'layout style' } as React.CSSProperties} onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}>
      <style>{`
        .axl-ctx-item:hover { background: var(--color-bg-hover) !important; }
        .axl-ctx-item:active { background: var(--color-bg-active) !important; }
        .axl-close {
          background: transparent; border: none; cursor: pointer;
          color: var(--color-text-tertiary); font-size: 14px; line-height: 1;
          padding: 2px 6px; border-radius: var(--radius-sm, 3px);
          transition: background 0.12s ease, color 0.12s ease;
        }
        .axl-close:hover { background: rgba(255,255,255,0.08); color: var(--color-text-primary); }
        :where(.axl-root) button { font-family: inherit; }
        :where(.axl-root) button:active { transform: scale(0.97); }
        :where(.axl-root), :where(.axl-root) * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle, #333) transparent; }
        :where(.axl-root) ::-webkit-scrollbar { width: 6px; height: 6px; }
        :where(.axl-root) ::-webkit-scrollbar-track { background: transparent; }
        :where(.axl-root) ::-webkit-scrollbar-thumb { background: var(--color-border-subtle, #333); border-radius: 3px; }
        :where(.axl-root) ::-webkit-scrollbar-thumb:hover { background: var(--color-border, #555); }
        :where(.axl-root) input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        :where(.axl-root) input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: var(--color-accent); cursor: pointer; margin-top: -4px; border: none; }
        :where(.axl-root) input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: var(--color-accent-light); border-radius: 2px; }
      `}</style>

      <ConfirmHost />
      {/* Hidden file input driving OBJ/STL/STEP import */}
      <input ref={importInputRef} type="file" accept=".obj,.stl,.step,.stp" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />

      {/* ─── Top Toolbar ─────────────────────────────────────────────── */}
      <div data-testid="axl-tools">
        <AXLToolbar
          onExport={handleExport}
          onSaveCheckpoint={() => { const res = checkpoints.saveNow(); window.dispatchEvent(new CustomEvent('dex-toast', { detail: res.ok ? { type: 'success', message: 'Checkpoint saved' } : { type: 'error', message: res.error } })); }}
          onRunSimulation={runSimulation}
          onImport={triggerImport}
          onAddFeature={addFeatureToSelected}
          sendToMenu={
            <>
              <span title={saveStatus.ok ? 'AXL keeps the project in app storage on every change' : saveStatus.error}>
                <AutosaveIndicator
                  state={saveStatus.ok ? (saveStatus.savedAt ? 'saved' : 'idle') : 'error'}
                  lastSavedAt={saveStatus.savedAt}
                  label={saveStatus.ok ? (saveStatus.savedAt ? undefined : 'Up to date') : 'Not saved'}
                />
              </span>
              <SendToMenu sourceApp="axl" assetKind="model" getAsset={() => ({ name: `${project.name}.axl`, data: JSON.stringify(project), mimeType: 'application/json' })} />
              {collab.canShare && (
                <button onClick={collab.openShareDialog} aria-label="Share project" style={collabButtonStyles}>
                  <DexIcon name="user-plus" size={14} /> Share
                </button>
              )}
            </>
          }
        />
      </div>

      {/* ─── Main Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ─── Left Panel: Feature Tree ──────────────────────────────── */}
        <div data-testid="axl-hierarchy" style={{ display: 'flex', flexShrink: 0 }}>
          <ResizablePanel
            resizeDirections={['e']}
            initialWidth={220}
            defaultWidth={220}
            minWidth={160}
            maxWidth={480}
            storageKey="axl-feature-tree"
            style={{ height: '100%', flexShrink: 0 }}
          >
            <FeatureTree />
          </ResizablePanel>
        </div>

        {/* ─── 3D Viewport ───────────────────────────────────────────── */}
        <div data-testid="axl-viewport" style={{ flex: 1, minWidth: 0, position: 'relative', cursor: tool === 'move' ? 'grab' : tool === 'measure' ? 'crosshair' : tool === 'rotate' ? 'alias' : tool === 'scale' ? 'nwse-resize' : 'default' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e) => {
            e.preventDefault();
            // Handle file drops (STL, JSON from filesystem)
            if (e.dataTransfer.files.length > 0) {
              const file = e.dataTransfer.files[0];
              const lower = file.name.toLowerCase();
              if (lower.endsWith('.json') || lower.endsWith('.axl')) void openProjectFile(file);
              else if (/\.(stl|obj|step|stp)$/.test(lower)) void handleImportFile(file);
              else ui.showToast(`AXL can't open ${file.name}. Drop a project (.json) or a mesh (.stl, .obj, .step).`);
              return;
            }
            const partData = e.dataTransfer.getData('application/x-axl-part');
            if (partData) {
              try {
                const part = JSON.parse(partData);
                const categoryPrimitiveMap: Record<string, PrimitiveType> = {
                  'Fasteners': 'cylinder', 'Bearings': 'torus', 'Gears': 'cylinder', 'Springs': 'cylinder', 'Structural': 'box',
                };
                const primType = categoryPrimitiveMap[part.category] || 'cylinder';
                const addPrim = pStore.addPrimitive as (type: PrimitiveType, params?: Record<string, number>, name?: string) => string;
                const newPartId = addPrim(primType, part.params, part.name);
                vStore.setSelectedPartId(newPartId);
                ui.showToast(`Dropped ${part.name}`);
              } catch { /* ignore malformed data */ }
            }
          }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={() => { if (hoveredPartId) vStore.setHoveredPartId(null); }}
            onWheel={handleWheel}
            onContextMenu={e => { e.preventDefault(); const p = clampEventToViewport(e); setCtxMenu({ visible: true, x: p.left, y: p.top }); }}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', imageRendering: 'auto' }}
          />

          {/* ── 2D Sketch overlay (draw profile -> extrude/revolve solid) ── */}
          {ui.showSketch && (
            <SketchOverlay
              units={project.units}
              onCommitMesh={(name, mesh) => {
                const id = pStore.addMeshPart(name, mesh);
                vStore.setSelectedPartId(id);
                ui.showToast(`${name} created`);
              }}
              onClose={() => ui.toggleSketch()}
            />
          )}

          {/* ── Blender-style Viewport Header Bar ──────────────────── */}
          <div className="dex-axl-rail dex-mat-opaque" role="toolbar" aria-label="Viewport" style={{ position: 'absolute', top: 6, left: 8, right: 8, height: 32, display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', borderRadius: 9999, zIndex: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {/* Viewport Mode */}
            <div style={{ display: 'flex', background: 'var(--color-bg-hover)', borderRadius: 9999, padding: 2 }}>
              {[
                { mode: '3d' as ViewMode, label: '3D', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
                { mode: 'front' as ViewMode, label: 'Front', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="12" cy="12" r="2"/></svg> },
                { mode: 'top' as ViewMode, label: 'Top', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="3" x2="21" y2="21"/><line x1="21" y1="3" x2="3" y2="21"/></svg> },
                { mode: 'right' as ViewMode, label: 'Right', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v16H6z"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
                { mode: 'drawing' as ViewMode, label: '2D', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg> },
              ].map(v => (
                <button key={v.mode} onClick={() => applyStandardView(v.mode)} aria-label={v.label}
                  style={{ width: 24, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', background: viewMode === v.mode ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent', color: viewMode === v.mode ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                  {v.icon}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

            {/* Shading Mode */}
            <div style={{ display: 'flex', background: 'var(--color-bg-hover)', borderRadius: 9999, padding: 2 }}>
              <button onClick={() => setWireframe(false)} aria-label="Solid shading" style={{ width: 24, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: !wireframe ? '#1e3a28' : 'transparent', color: !wireframe ? 'var(--color-success)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </button>
              <button onClick={() => setWireframe(true)} aria-label="Wireframe shading" style={{ width: 24, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: wireframe ? 'var(--color-accent-light)' : 'transparent', color: wireframe ? 'var(--color-accent)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><line x1="3" y1="8" x2="12" y2="13"/><line x1="21" y1="8" x2="12" y2="13"/><line x1="12" y1="13" x2="12" y2="22"/></svg>
              </button>
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

            {/* Viewport Overlays */}
            <button onClick={vStore.toggleGrid} aria-label="Toggle grid" style={{ width: 24, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: gridVisible ? '#2e2410' : 'transparent', color: gridVisible ? 'var(--color-warning)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            </button>

            <div style={{ width: 1, height: 16, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

            {/* Inspector: Configurations / Named Views / Interference */}
            <button onClick={() => ui.toggleInspector()} aria-label="Inspector" style={{ width: 24, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ui.showInspector ? 'var(--color-accent-light)' : 'transparent', color: ui.showInspector ? 'var(--color-accent)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>

            <div style={{ flex: 1 }} />

            {/* Viewport Info */}
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' }}>
              Az {cameraAngle.azimuth.toFixed(0)}&deg; &middot; El {cameraAngle.elevation.toFixed(0)}&deg; &middot; D {cameraAngle.distance.toFixed(0)}
            </span>
          </div>

          {/* ── Axis Orientation Gizmo (Blender-style) ───────────────── */}
          <div style={{ position: 'absolute', top: 42, right: 12, width: 70, height: 70, zIndex: 10 }}>
            <svg width="70" height="70" viewBox="0 0 70 70" style={{ overflow: 'visible' }}>
              {/* Background circle */}
              <circle cx="35" cy="35" r="30" fill="rgba(0,0,0,0.3)" stroke="var(--color-border-subtle)" strokeWidth="1" />
              {/* Z axis (blue - into screen) */}
              {(() => {
                const azRad = cameraAngle.azimuth * Math.PI / 180;
                const elRad = cameraAngle.elevation * Math.PI / 180;
                const len = 22;
                // X axis (red)
                const xEndX = 35 + len * Math.cos(azRad);
                const xEndY = 35 - len * Math.sin(elRad) * Math.sin(azRad) * 0.3;
                // Y axis (green - up)
                const yEndX = 35;
                const yEndY = 35 - len * Math.cos(elRad);
                // Z axis (blue)
                const zEndX = 35 - len * Math.sin(azRad);
                const zEndY = 35 - len * Math.sin(elRad) * Math.cos(azRad) * 0.3;
                return (
                  <>
                    <line x1="35" y1="35" x2={zEndX} y2={zEndY} stroke="#0A84FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                    <circle cx={zEndX} cy={zEndY} r="4" fill="#0A84FF" opacity="0.9" />
                    <text x={zEndX} y={zEndY + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="6" fontWeight="700">Z</text>
                    <line x1="35" y1="35" x2={xEndX} y2={xEndY} stroke="#FF453A" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                    <circle cx={xEndX} cy={xEndY} r="4" fill="#FF453A" opacity="0.9" />
                    <text x={xEndX} y={xEndY + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="6" fontWeight="700">X</text>
                    <line x1="35" y1="35" x2={yEndX} y2={yEndY} stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                    <circle cx={yEndX} cy={yEndY} r="4" fill="#30D158" opacity="0.9" />
                    <text x={yEndX} y={yEndY + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="6" fontWeight="700">Y</text>
                    <circle cx="35" cy="35" r="2.5" fill="var(--color-text-tertiary)" />
                  </>
                );
              })()}
            </svg>
          </div>

          {/* ── Object Info Overlay (Blender N-panel style) ──────────── */}
          {selectedPart && (
            <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, left: 10, borderRadius: 14, padding: 'var(--space-2) 10px', fontSize: 10, zIndex: 10, minWidth: 140 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: selectedPart.color }} />
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedPart.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--color-text-tertiary)', fontSize: 9 }}>
                <span>Pos: {selectedPart.transform.position.x.toFixed(1)}, {selectedPart.transform.position.y.toFixed(1)}, {(selectedPart.transform.position.z || 0).toFixed(1)}</span>
                <span>Rot: {selectedPart.transform.rotation.z.toFixed(1)}&deg;</span>
                <span>Scale: {selectedPart.transform.scale.x.toFixed(2)}</span>
                <span style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>{selectedPart.material.name} &middot; {selectedPart.features.length} feat</span>
              </div>
            </div>
          )}

          {/* Simulation results overlay */}
          {simResults && ui.showSimulation && (
            <div className="dex-axl-panel-strong" style={{ position: 'absolute', bottom: 10, left: 10, borderRadius: 14, padding: 'var(--space-3)', fontSize: 11, maxWidth: 320 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 6 }}>
                {simType === 'stress' ? 'STRESS ANALYSIS' : simType === 'thermal' ? 'THERMAL ANALYSIS' : simType === 'modal' ? 'MODAL ANALYSIS' : simType === 'buckling' ? 'BUCKLING ANALYSIS' : 'MOTION STUDY'}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                    {simType === 'stress' ? 'Max Stress' : simType === 'thermal' ? 'Peak Temp' : simType === 'modal' ? 'Lowest f\u2081' : simType === 'buckling' ? 'Critical Load' : 'Max Deflection'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: simResults.safetyFactor > 2 ? 'var(--color-success)' : simResults.safetyFactor > 1 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                    {simType === 'stress' ? `${simResults.maxStress.toFixed(1)} MPa`
                      : simType === 'thermal' ? `${simResults.maxStress.toFixed(1)}\u00b0C`
                      : simType === 'modal' ? `${simResults.maxStress.toFixed(0)} Hz`
                      : simType === 'buckling' ? `${(simResults.maxStress / 1000).toFixed(1)} kN`
                      : `${simResults.maxStress.toFixed(3)}${project.units}`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{simType === 'modal' ? 'Separation' : 'Safety Factor'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: simResults.safetyFactor > 2 ? 'var(--color-success)' : simResults.safetyFactor > 1 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                    {simResults.safetyFactor.toFixed(2)}&times;
                  </div>
                </div>
                {simType === 'stress' && simResults.feaSolved && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Max Displ.</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {(simResults.maxDisplacement ?? 0).toFixed(3)}{project.units}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                {simType === 'thermal' ? `Heat: ${simForce}W` : simType === 'modal' ? `Excitation: ${simForce}Hz` : `Force: ${simForce}N`} | {project.assembly.parts.length} parts analyzed
                {simType === 'stress' && simResults.feaSolved ? ` | ${simResults.elementCount ?? 0} FE elements (direct stiffness)` : ''}
              </div>
              <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 60, height: 6, borderRadius: 4, background: 'linear-gradient(to right, rgb(0,255,40), rgb(255,255,40), rgb(255,0,40))' }} />
                <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>Low \u2192 High</span>
              </div>
              {/* Per-part stress breakdown */}
              {simResults.stressMap.length > 0 && (
                <div style={{ marginTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.5px', marginBottom: 4 }}>PER-PART BREAKDOWN</div>
                  <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                    {simResults.stressMap.map((sm: { partId: string; ratio: number }) => {
                      const part = project.assembly.parts.find(p => p.id === sm.partId);
                      if (!part) return null;
                      const pct = Math.min(sm.ratio * 100, 150);
                      const color = sm.ratio > 1 ? 'var(--color-error)' : sm.ratio > 0.7 ? 'var(--color-warning)' : 'var(--color-success)';
                      const status = sm.ratio > 1 ? 'FAIL' : sm.ratio > 0.7 ? 'WARN' : 'OK';
                      return (
                        <div key={sm.partId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 9 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: part.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{part.name}</span>
                          <div style={{ width: 50, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 2, background: color }} />
                          </div>
                          <span style={{ color, fontWeight: 700, fontSize: 8, width: 28, textAlign: 'right', flexShrink: 0 }}>{status}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={() => { pStore.setSimResults(null); ui.toggleSimulation(); }}
                style={{ marginTop: 'var(--space-2)', fontSize: 9, color: 'var(--color-text-secondary)', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 9999, padding: '3px var(--space-2)', cursor: 'pointer' }}>
                Clear Results
              </button>
            </div>
          )}

          {/* Simulation controls */}
          {ui.showSimulation && !simResults && (
            <div className="dex-axl-panel-strong" style={{ position: 'absolute', bottom: 10, left: 10, borderRadius: 14, padding: 'var(--space-3)', fontSize: 11, width: 260 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 'var(--space-2)' }}>SIMULATION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Type:
                  <select value={simType} onChange={e => setSimType(e.target.value as SimulationType)}
                    style={{ marginLeft: 'var(--space-2)', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }}>
                    <option value="stress">Static Stress</option>
                    <option value="motion">Motion Study</option>
                    <option value="thermal">Thermal</option>
                    <option value="modal">Modal (Frequency)</option>
                    <option value="buckling">Buckling</option>
                  </select>
                </label>
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  {simType === 'thermal' ? 'Heat (W):' : simType === 'modal' ? 'Excitation (Hz):' : 'Force (N):'}
                  <input type="number" value={simForce} onChange={e => setSimForce(Number(e.target.value))}
                    style={{ marginLeft: 'var(--space-2)', width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
                <button onClick={runSimulation} disabled={simRunning}
                  style={{ padding: '6px var(--space-3)', fontSize: 10, fontWeight: 600, background: 'var(--color-accent-light)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-muted)', borderRadius: 9999, cursor: simRunning ? 'wait' : 'pointer', boxShadow: 'none' }}>
                  {simRunning ? `${simPhrase}...` : 'Run Simulation'}
                </button>
              </div>
            </div>
          )}

          {/* Measurement Readout Panel */}
          {tool === 'measure' && project.measurements.length > 0 && (
            <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 250, borderRadius: 14, padding: 10, fontSize: 10, maxWidth: 220, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6"/></svg>
                MEASUREMENTS ({project.measurements.length})
              </div>
              {project.measurements.map((m, i) => (
                <div key={m.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 2, background: 'var(--color-border-subtle)', borderRadius: 4 }}>
                  <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontSize: 8, width: 14 }}>#{i + 1}</span>
                  <span style={{ flex: 1, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{m.value.toFixed(2)} {project.units}</span>
                  <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{m.type}</span>
                </div>
              ))}
              <div style={{ marginTop: 4, fontSize: 9, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 4 }}>
                Total: {project.measurements.reduce((s, m) => s + m.value, 0).toFixed(2)} {project.units}
              </div>
            </div>
          )}

          {/* Toast */}
          {ui.toastMsg && (
            <div className="dex-axl-panel-strong" style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', borderRadius: 14, padding: '6px var(--space-4)', fontSize: 11, color: 'var(--color-text-primary)', animation: 'dex-snap-in 0.2s ease-out' }}>
              {ui.toastMsg}
            </div>
          )}
        </div>

        {/* ─── Right Panel: Properties ───────────────────────────────── */}
        <ResizablePanel
          resizeDirections={['w']}
          initialWidth={240}
          defaultWidth={240}
          minWidth={160}
          maxWidth={480}
          storageKey="axl-properties"
          style={{ height: '100%', flexShrink: 0 }}
        >
          <PropertiesPanel />
        </ResizablePanel>

        {/* ─── Parts Library Panel (overlay) ──────────────────────────── */}
        {ui.showPartsLibrary && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, left: 'min(220px, 32%)', width: 'clamp(220px, calc(100% - 244px), 320px)', bottom: 0, borderRadius: 0, boxShadow: 'none', borderRight: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Standard Parts</span>
              <button onClick={ui.togglePartsLibrary} aria-label="Close parts library" className="axl-close">&times;</button>
            </div>

            <div style={{ display: 'flex', padding: '6px var(--space-2)', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--color-border-subtle)' }}>
              {STD_PARTS_LIBRARY.map((cat, i) => (
                <button key={cat.category} onClick={() => setLibCategory(i)}
                  style={{ padding: '4px 10px', fontSize: 9, fontWeight: 600, borderRadius: 9999, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: libCategory === i ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'transparent', color: libCategory === i ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                  <DexIcon name={cat.icon} size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} /> {cat.category}
                </button>
              ))}
            </div>

            <div style={{ padding: '6px var(--space-2)' }}>
              <DexSearchInput
                size="sm"
                fullWidth
                value={libSearch}
                onChange={e => setLibSearch(e.target.value)}
                onClear={() => setLibSearch('')}
                placeholder="Search parts..."
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px var(--space-2)' }}>
              {STD_PARTS_LIBRARY[libCategory]?.parts
                .filter(p => !libSearch || p.name.toLowerCase().includes(libSearch.toLowerCase()))
                .map(part => (
                  <div key={part.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-2)', marginBottom: 2, borderRadius: 4, cursor: 'pointer', background: 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      pStore.addPrimitive('box', { width: 10, height: 10, depth: 10 }, part.name);
                      ui.showToast(`Added ${part.name}`);
                    }}>
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                      <DexIcon name="package" size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)' }}>{part.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{part.sizeRange}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ─── Feature Creation Panel (overlay) ──────────────────────── */}
        {ui.showFeatureCreate && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 12, width: 'min(260px, calc(100% - 24px))', maxHeight: 'calc(100% - 48px)', borderRadius: 14, borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Add Feature</span>
              <button onClick={ui.toggleFeatureCreate} aria-label="Close feature create" className="axl-close">&times;</button>
            </div>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', overflow: 'auto' }}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {(['extrude', 'revolve', 'chamfer', 'fillet', 'pattern', 'shell', 'draft', 'rib'] as const).map(ft => (
                  <button key={ft} onClick={() => setFeatureType(ft)}
                    style={{ padding: '4px var(--space-2)', fontSize: 9, fontWeight: 600, borderRadius: 9999, cursor: 'pointer',
                      background: featureType === ft ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)',
                      color: featureType === ft ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      border: featureType === ft ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-bg-hover)' }}>
                    {ft.charAt(0).toUpperCase() + ft.slice(1)}
                  </button>
                ))}
              </div>

              {featureType === 'extrude' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Depth ({project.units}):
                  <FeatureExprInput value={featureParams.depth} scope={featureScope} ariaLabel="Extrude depth" onCommit={n => setFeatureParams(p => ({ ...p, depth: n }))} onError={featureExprError} />
                </label>
              )}
              {featureType === 'revolve' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Angle (&deg;):
                  <FeatureExprInput value={featureParams.angle} scope={featureScope} ariaLabel="Revolve angle" onCommit={n => setFeatureParams(p => ({ ...p, angle: n }))} onError={featureExprError} />
                </label>
              )}
              {featureType === 'chamfer' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Distance ({project.units}):
                  <FeatureExprInput value={featureParams.distance} scope={featureScope} ariaLabel="Chamfer distance" onCommit={n => setFeatureParams(p => ({ ...p, distance: n }))} onError={featureExprError} />
                </label>
              )}
              {featureType === 'fillet' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Radius ({project.units}):
                  <FeatureExprInput value={featureParams.radius} scope={featureScope} ariaLabel="Fillet radius" onCommit={n => setFeatureParams(p => ({ ...p, radius: n }))} onError={featureExprError} />
                </label>
              )}
              {featureType === 'pattern' && (
                <>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    Count:
                    <FeatureExprInput value={featureParams.count} scope={featureScope} width={50} min={2} max={50} ariaLabel="Pattern count" onCommit={n => setFeatureParams(p => ({ ...p, count: Math.round(n) }))} onError={featureExprError} />
                  </label>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    Spacing ({project.units}):
                    <FeatureExprInput value={featureParams.spacing} scope={featureScope} width={60} ariaLabel="Pattern spacing" onCommit={n => setFeatureParams(p => ({ ...p, spacing: n }))} onError={featureExprError} />
                  </label>
                </>
              )}
              {(featureType === 'shell' || featureType === 'rib') && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  {featureType === 'shell' ? 'Wall thickness' : 'Rib thickness'} ({project.units}):
                  <FeatureExprInput value={featureParams.thickness} scope={featureScope} min={0.5} ariaLabel="Wall/rib thickness" onCommit={n => setFeatureParams(p => ({ ...p, thickness: n }))} onError={featureExprError} />
                </label>
              )}
              {featureType === 'draft' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Draft angle (&deg;):
                  <FeatureExprInput value={featureParams.draftAngle} scope={featureScope} min={0} max={45} ariaLabel="Draft angle" onCommit={n => setFeatureParams(p => ({ ...p, draftAngle: n }))} onError={featureExprError} />
                </label>
              )}

              <button onClick={addFeatureToSelected} disabled={!selectedPartId}
                style={{ padding: '7px var(--space-3)', fontSize: 10, fontWeight: 600, borderRadius: 9999, boxShadow: 'none', cursor: selectedPartId ? 'pointer' : 'not-allowed',
                  background: selectedPartId ? 'var(--color-accent-light)' : 'var(--color-border-subtle)',
                  color: selectedPartId ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border: selectedPartId ? '1px solid var(--color-accent-muted)' : '1px solid var(--color-bg-hover)' }}>
                {selectedPartId ? `Apply ${featureType.charAt(0).toUpperCase() + featureType.slice(1)}` : 'Select a part first'}
              </button>
            </div>
          </div>
        )}

        {/* ─── GD&T Creation Panel (overlay) ─────────────────────────── */}
        {ui.showGDTCreate && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 12, width: 'min(260px, calc(100% - 24px))', maxHeight: 'calc(100% - 48px)', borderRadius: 14, borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>GD&T Annotation</span>
              <button onClick={ui.toggleGDTCreate} aria-label="Close GD&T create" className="axl-close">&times;</button>
            </div>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>SYMBOL</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                {GDT_SYMBOLS.map(g => (
                  <button key={g.symbol} onClick={() => setGdtSymbol(g.symbol)}
                    style={{ padding: '5px 0', fontSize: 14, textAlign: 'center', borderRadius: 10, cursor: 'pointer',
                      background: gdtSymbol === g.symbol ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)',
                      color: gdtSymbol === g.symbol ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      border: gdtSymbol === g.symbol ? '1px solid var(--dex-focus-color, #fff)' : '1px solid var(--color-bg-hover)' }}>
                    {g.symbol}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Tolerance:
                <input value={gdtTolerance} onChange={e => setGdtTolerance(e.target.value)}
                  style={{ marginLeft: 'var(--space-2)', width: 80, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Datum:
                <input value={gdtDatum} onChange={e => setGdtDatum(e.target.value)} maxLength={3}
                  style={{ marginLeft: 'var(--space-2)', width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none', textTransform: 'uppercase' }} />
              </label>

              <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-border-subtle)', borderRadius: 10, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 16, color: 'var(--color-accent)' }}>{gdtSymbol}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{gdtTolerance}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>|</span>
                <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600 }}>{gdtDatum}</span>
              </div>

              <button onClick={addGDTAnnotation} disabled={!selectedPartId}
                style={{ padding: '7px var(--space-3)', fontSize: 10, fontWeight: 600, borderRadius: 9999, boxShadow: 'none', cursor: selectedPartId ? 'pointer' : 'not-allowed',
                  background: selectedPartId ? 'var(--color-accent-light)' : 'var(--color-border-subtle)',
                  color: selectedPartId ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border: selectedPartId ? '1px solid var(--color-accent-muted)' : '1px solid var(--color-bg-hover)' }}>
                {selectedPartId ? 'Add Annotation' : 'Select a part first'}
              </button>

              {project.annotations.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 4 }}>ANNOTATIONS ({project.annotations.length})</div>
                  {project.annotations.map(a => {
                    const part = project.assembly.parts.find(p => p.id === a.attachedTo);
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 10, color: 'var(--color-text-secondary)', borderRadius: 10, background: 'var(--color-border-subtle)' }}>
                        <span style={{ fontSize: 14, color: 'var(--color-accent)' }}>{a.symbol}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{a.tolerance}</span>
                        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{a.datum}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--color-text-tertiary)' }}>{part?.name || '?'}</span>
                        <button aria-label="Delete annotation" onClick={() => pStore.removeAnnotation(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', fontSize: 10 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Assembly Constraints Panel ────────────────────────────── */}
        {ui.showConstraintPanel && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 240, width: 270, borderRadius: 14, borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 520 }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Assembly Constraints</span>
              <button aria-label="Close constraints panel" onClick={ui.toggleConstraintPanel} className="axl-close">&times;</button>
            </div>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>ADD CONSTRAINT</div>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Type:
                <select value={cType} onChange={e => setCType(e.target.value as ConstraintType)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  {(['mate','align','offset','angle','concentric','fixed','tangent','distance','coincident','parallel','perpendicular'] as ConstraintType[]).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Part A:
                <select value={cPartA} onChange={e => setCPartA(e.target.value)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  <option value="">— select —</option>
                  {project.assembly.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Part B:
                <select value={cPartB} onChange={e => setCPartB(e.target.value)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  <option value="">— select —</option>
                  {project.assembly.parts.filter(p => p.id !== cPartA).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {(cType === 'distance' || cType === 'offset' || cType === 'angle') && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Value:
                  <input type="number" value={cValue} onChange={e => setCValue(e.target.value)} min={0}
                    style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }} />
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 9 }}>{cType === 'angle' ? '°' : project.units}</span>
                </label>
              )}
              <button
                onClick={() => {
                  if (!cPartA || !cPartB || cPartA === cPartB) { ui.showToast('Select two different parts'); return; }
                  // addConstraint now runs the solver; report whether geometry snapped.
                  pStore.addConstraint(cType, cPartA, cPartB, parseFloat(cValue) || 0);
                  const res = pStore.solveConstraints();
                  ui.showToast(res.unsatisfied > 0
                    ? `${cType} added -- ${res.unsatisfied} constraint(s) unsatisfied`
                    : res.moved > 0 ? `${cType} solved -- ${res.moved} part(s) repositioned` : `${cType} constraint added`);
                  setCPartA(''); setCPartB(''); setCValue('0');
                  window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'axlExports', amount: 0 } }));
                }}
                disabled={!cPartA || !cPartB}
                style={{ padding: '7px var(--space-3)', fontSize: 10, fontWeight: 600, borderRadius: 9999, boxShadow: 'none', cursor: (!cPartA || !cPartB) ? 'not-allowed' : 'pointer', background: (!cPartA || !cPartB) ? 'var(--color-border-subtle)' : 'var(--color-accent-light)', color: (!cPartA || !cPartB) ? 'var(--color-text-tertiary)' : 'var(--color-accent)', border: (!cPartA || !cPartB) ? '1px solid var(--color-bg-hover)' : '1px solid var(--color-accent-muted)' }}>
                {(!cPartA || !cPartB) ? 'Select parts above' : 'Add Constraint'}
              </button>
            </div>
            {project.assembly.constraints.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-3) 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>EXISTING CONSTRAINTS ({project.assembly.constraints.length})</span>
                  {/* Manual re-solve: parts can drift after a move/rotate; this re-snaps them. */}
                  <button aria-label="Re-solve constraints" onClick={() => {
                    pStore.pushUndo();
                    const res = pStore.solveConstraints();
                    ui.showToast(res.unsatisfied > 0 ? `Solved -- ${res.unsatisfied} unsatisfied` : res.moved > 0 ? `Solved -- ${res.moved} part(s) moved` : 'All constraints satisfied');
                  }} style={{ fontSize: 8, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-accent-light)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-muted)', cursor: 'pointer' }}>Re-solve</button>
                </div>
                {project.assembly.constraints.map(c => {
                  const pa = project.assembly.parts.find(p => p.id === c.partA);
                  const pb = project.assembly.parts.find(p => p.id === c.partB);
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px var(--space-2)', fontSize: 10, color: 'var(--color-text-secondary)', borderRadius: 10, background: 'var(--color-border-subtle)' }}>
                      <span style={{ color: c.satisfied ? 'var(--color-success)' : 'var(--color-warning)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{c.type}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pa?.name || '?'} ↔ {pb?.name || '?'}{c.value ? ` (${c.value}${project.units})` : ''}</span>
                      <button aria-label={`Remove ${c.type} constraint`} onClick={() => pStore.removeConstraint(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Inspector Panel: Configurations / Views / Interference ─── */}
        {ui.showInspector && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 0, width: 'min(308px, calc(100% - 24px))', bottom: 0, borderRadius: 0, boxShadow: 'none', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>Inspector</span>
              <button aria-label="Close inspector" onClick={() => ui.toggleInspector()} className="axl-close">&times;</button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, padding: '6px var(--space-2)', borderBottom: '1px solid var(--color-bg-hover)' }}>
              {([
                { id: 'configs' as const, label: 'Configs' },
                { id: 'views' as const, label: 'Views' },
                { id: 'interference' as const, label: 'Clash' },
                { id: 'section' as const, label: 'Section' },
              ]).map(t => (
                <button key={t.id} onClick={() => ui.setInspectorTab(t.id)}
                  style={{ flex: 1, padding: '4px 6px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, transition: 'all 0.12s', background: ui.inspectorTab === t.id ? 'var(--color-accent-light)' : 'transparent', color: ui.inspectorTab === t.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ── Configurations / Design Variants ── */}
              {ui.inspectorTab === 'configs' && (
                <>
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    Snapshot the current placement and driving geometry as a design variant, then switch between variants non-destructively.
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={newConfigName} onChange={e => setNewConfigName(e.target.value)} placeholder="Configuration name"
                      onKeyDown={e => { if (e.key === 'Enter') saveCurrentConfig(); }}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 11, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' }} />
                    <button onClick={saveCurrentConfig} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-accent-fill)', color: '#fff', whiteSpace: 'nowrap' }}>Capture</button>
                  </div>
                  {project.configurations.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '16px 0' }}>No configurations yet</div>
                  )}
                  {project.configurations.map(cfg => (
                    <div key={cfg.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px var(--space-2)', borderRadius: 10, background: cfg.id === project.activeConfigId ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', border: cfg.id === project.activeConfigId ? '1px solid var(--color-accent-muted)' : '1px solid transparent' }}>
                      <button onClick={() => pStore.applyConfiguration(cfg.id)} title="Apply configuration" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cfg.id === project.activeConfigId ? '● ' : ''}{cfg.name}
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>{cfg.parts.length} parts</span>
                      </button>
                      <button aria-label="Delete configuration" onClick={() => pStore.deleteConfiguration(cfg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* ── Named Views / Saved Cameras ── */}
              {ui.inspectorTab === 'views' && (
                <>
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    Save the current camera as a named view and jump back to it anytime.
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={newViewName} onChange={e => setNewViewName(e.target.value)} placeholder="View name"
                      onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); }}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 11, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' }} />
                    <button onClick={saveCurrentView} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-accent-fill)', color: '#fff', whiteSpace: 'nowrap' }}>Save View</button>
                  </div>
                  {project.namedViews.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '16px 0' }}>No saved views yet</div>
                  )}
                  {project.namedViews.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px var(--space-2)', borderRadius: 10, background: 'var(--color-border-subtle)' }}>
                      <button onClick={() => applyNamedView(v)} title="Go to view" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.name}
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{v.viewMode} · Az {v.azimuth.toFixed(0)}° El {v.elevation.toFixed(0)}°</span>
                      </button>
                      <button aria-label="Delete view" onClick={() => pStore.deleteNamedView(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* ── Interference / Clearance Check ── */}
              {ui.inspectorTab === 'interference' && (
                <>
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    Broad-phase bounding-volume scan across all visible parts. Flags overlapping bodies and (optionally) pairs closer than a minimum clearance.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Min clearance</label>
                    <input type="number" value={clearanceGap} min={0} step={1} onChange={e => setClearanceGap(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 64, padding: '5px 6px', fontSize: 11, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{project.units}</span>
                    <button onClick={runInterferenceCheck} style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 10, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-accent-fill)', color: '#fff', whiteSpace: 'nowrap' }}>Run Check</button>
                  </div>
                  {interferenceResults === null && (
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '16px 0' }}>Run a check to see results</div>
                  )}
                  {interferenceResults !== null && interferenceResults.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--color-success)', textAlign: 'center', padding: '16px 0', fontWeight: 600 }}>✓ No interferences detected</div>
                  )}
                  {interferenceResults?.map((pair, i) => {
                    const isHit = pair.status === 'interference';
                    const col = isHit ? 'var(--color-error)' : 'var(--color-warning)';
                    return (
                      <div key={`${pair.partAId}-${pair.partBId}-${i}`} onClick={() => vStore.setSelectedPartId(pair.partAId)} style={{ cursor: 'pointer', padding: '6px var(--space-2)', borderRadius: 10, background: 'var(--color-border-subtle)', borderLeft: `2px solid ${col}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: col }}>{isHit ? 'Interfere' : 'Clearance'}</span>
                          <span style={{ flex: 1, fontSize: 10, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pair.partAName} ↔ {pair.partBName}</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                          {isHit
                            ? `overlap ${pair.overlap.toFixed(1)} ${project.units}`
                            : `gap ${(-pair.overlap).toFixed(1)} ${project.units}`}
                          {` · centers ${pair.centerDistance.toFixed(1)} ${project.units}`}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Section View (clipping plane) ── */}
              {ui.inspectorTab === 'section' && (
                <>
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    Slice the model with a clipping plane to reveal internal structure. Cuts every part in the viewport.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={section.enabled} onChange={e => setSection(s => ({ ...s, enabled: e.target.checked }))} />
                    Enable section plane
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', width: 36 }}>Axis</span>
                    {(['x', 'y', 'z'] as const).map(ax => (
                      <button key={ax} disabled={!section.enabled} onClick={() => setSection(s => ({ ...s, axis: ax }))}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 10, border: 'none', cursor: section.enabled ? 'pointer' : 'default', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: section.enabled ? 1 : 0.4, background: section.axis === ax ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', color: section.axis === ax ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{ax}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', width: 36 }}>Offset</span>
                    <input type="range" min={-150} max={150} step={1} value={section.offset} disabled={!section.enabled}
                      onChange={e => setSection(s => ({ ...s, offset: Number(e.target.value) }))} style={{ flex: 1, opacity: section.enabled ? 1 : 0.4 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{section.offset} {project.units}</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-primary)', cursor: 'pointer', opacity: section.enabled ? 1 : 0.4 }}>
                    <input type="checkbox" disabled={!section.enabled} checked={section.flip} onChange={e => setSection(s => ({ ...s, flip: e.target.checked }))} />
                    Flip side
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Settings Panel (overlay) ─────────────────────── */}
        {ui.showSettings && (
          <div className="dex-axl-panel-strong" style={{ position: 'absolute', top: 42, right: 0, width: 'min(300px, calc(100% - 24px))', bottom: 0, borderRadius: 0, boxShadow: 'none', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)' }}>Settings</span>
              <button aria-label="Close settings" onClick={() => ui.toggleSettings()} className="axl-close">&times;</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>UNITS</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['mm', 'in', 'm'] as const).map(u => (
                    <button key={u} onClick={() => pStore.setUnits(u)} style={{ flex: 1, padding: '6px 0', borderRadius: 9999, border: '1px solid ' + (project.units === u ? 'var(--dex-focus-color, #fff)' : 'var(--color-bg-hover)'), background: project.units === u ? 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' : 'var(--color-border-subtle)', color: project.units === u ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{u}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>GRID SNAP</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={vStore.snapEnabled} onChange={() => vStore.toggleSnap()} style={{ accentColor: 'var(--color-accent)' }} />
                  Snap to grid
                </label>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>VIEW</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['isometric', 'front', 'top', 'right'] as const).map(v => (
                    <button key={v} onClick={() => { vStore.setStandardView(v); applyStandardView(v === 'isometric' ? '3d' : v); }} style={{ flex: 1, padding: '6px 0', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{v === 'isometric' ? 'Iso' : v}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>PROJECT</div>
                <button onClick={pickProjectFile} style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>Open Project (JSON)</button>
                <button onClick={triggerImport} style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 9999, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>Import Part (STL, OBJ, STEP)</button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ─── BOM Table Overlay ────────────────────────────────────────── */}
      {ui.showBOM && project.bom.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={ui.toggleBOM}>
          <div className="dex-axl-panel-strong" style={{ borderRadius: 14, padding: 'var(--space-5)', maxWidth: 700, maxHeight: '70vh', overflow: 'auto', width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Bill of Materials \u2014 {project.name}</div>
              <button onClick={ui.toggleBOM} aria-label="Close bill of materials" className="axl-close">&times;</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['#', 'Name', 'Qty', 'Material', 'Weight', 'Dimensions'].map(h => (
                    <th key={h} style={{ padding: '6px var(--space-2)', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.bom.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '5px var(--space-2)', color: 'var(--color-text-secondary)' }}>{row.partNumber}</td>
                    <td style={{ padding: '5px var(--space-2)', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '5px var(--space-2)' }}>{row.quantity}</td>
                    <td style={{ padding: '5px var(--space-2)', color: 'var(--color-text-secondary)' }}>{row.material}</td>
                    <td style={{ padding: '5px var(--space-2)' }}>{formatWeight(row.weight)}</td>
                    <td style={{ padding: '5px var(--space-2)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>{row.dimensions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Total: {project.bom.length} items, {project.bom.reduce((s, r) => s + r.quantity, 0)} parts</span>
              <span>Total Weight: {formatWeight(project.bom.reduce((s, r) => s + r.weight, 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar - Blender style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-3)', height: 24, background: 'var(--color-bg-surface)', borderTop: '1px solid var(--color-border)', fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          {project.assembly.parts.length} objects
        </span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>Verts: ~{project.assembly.parts.reduce((s, p) => s + p.meshVertexCount, 0)}</span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>{formatWeight(totalWeight)}</span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span>Grid: {project.gridSnap}{project.units}</span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {tool === 'select' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2"><path d="M3 3l7 16 3-7 7-3L3 3z"/></svg>}
          {tool === 'move' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>}
          {tool === 'rotate' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>}
          {tool === 'scale' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#BF5AF2" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>}
          {tool === 'measure' && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6"/></svg>}
          <span style={{ color: tool === 'select' ? 'var(--color-accent)' : tool === 'move' ? 'var(--color-success)' : tool === 'rotate' ? 'var(--color-warning)' : tool === 'scale' ? '#BF5AF2' : 'var(--color-warning)' }}>{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
        </span>
        <span style={{ color: 'var(--color-border-subtle)' }}>|</span>
        <span style={{ color: simRunning ? 'var(--color-warning)' : 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: simRunning ? 'var(--color-warning)' : 'var(--color-success)' }} />
          {simRunning ? `${simPhrase}...` : 'Ready'}
        </span>
      </div>

      {/* Right-click context menu */}
      {ctxMenu.visible && (() => {
        const selPart = selectedPartId ? project.assembly.parts.find(p => p.id === selectedPartId) : null;
        const partItems = selPart ? [
          { label: 'Duplicate Part', fn: () => { pStore.duplicatePart(selectedPartId!); } },
          { label: 'Add Feature...', fn: () => { addFeatureToSelected(); } },
          null,
          { label: 'Delete Part', fn: () => { pStore.deletePart(selectedPartId!); vStore.setSelectedPartId(null); }, danger: true },
          null,
        ] : [];
        const viewItems = [
          { label: 'Front View', fn: () => applyStandardView('front') },
          { label: 'Top View', fn: () => applyStandardView('top') },
          { label: 'Right View', fn: () => applyStandardView('right') },
          { label: '3D View', fn: () => applyStandardView('3d') },
          null,
          { label: 'Add Box', fn: () => pStore.addPrimitive('box') },
          { label: 'Add Cylinder', fn: () => pStore.addPrimitive('cylinder') },
          { label: 'Add Sphere', fn: () => pStore.addPrimitive('sphere') },
        ];
        const menuItems = [...partItems, ...viewItems];
        // Clamp to the viewport so the menu never opens off-screen at right/bottom
        // edges (separators ~9px tall, items ~25px; width fixed at 160).
        const MENU_W = 160;
        const estHeight = menuItems.reduce((h, it) => h + (it === null ? 9 : 25), 8);
        const left = Math.max(4, Math.min(ctxMenu.x, window.innerWidth - MENU_W - 4));
        const top = Math.max(4, Math.min(ctxMenu.y, window.innerHeight - estHeight - 4));
        return (
          <div className="dex-axl-panel-strong" style={{ position: 'fixed', left, top, zIndex: 'var(--z-max)', width: MENU_W, borderRadius: 14, padding: '4px 0', boxShadow: 'var(--pg-shadow-context)' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px var(--space-2)' }} />
              : <div key={i} className="axl-ctx-item" onClick={() => { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); }} style={{ padding: '6px 14px', fontSize: 11, color: (item as any).danger ? 'var(--color-error)' : '#e0e0e0', cursor: 'pointer', borderRadius: 10, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default memo(AXL);
