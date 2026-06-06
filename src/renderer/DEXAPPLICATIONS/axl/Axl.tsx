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
 * @license    MIT License
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import CreativeCommandBar from '../../components/CreativeCommandBar';
import { enginePendingApplier, type OpApplyResult } from '../../../shared/uki/creativeCommand';
import type { CreativeOp } from '../../../shared/uki/creativeActions';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAutoSave } from '../../utils/useAutoSave';
import { useAppTracking } from '../../services/usePatternLearning';
import { loadEngagement, saveEngagement, recordAppUsage, incrementStat, checkAchievements } from '../../services/engagement';
import DexIcon from '../../components/DexIcon';
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';
import { useCollaborationFeatures, collabButtonStyles } from '../../hooks/useCollaborationFeatures';

// ─── Extracted Modules ────────────────────────────────────────────────────
import type {
  Vec3, PrimitiveType, BooleanOp, ConstraintType, SimulationType,
  ViewMode, ToolMode, Part, PartFeature, Measurement, GDTAnnotation,
} from './types';
import { MATERIAL_DB, STD_PARTS_LIBRARY, GDT_SYMBOLS } from './constants';
import { genId, vec3, defaultTransform, calcVolume, calcWeight, formatWeight, stressColor, computeVonMisesSimple } from './utils/math';
import { exportProject as doExport } from './utils/export';
import { useProjectStore } from './stores/projectStore';
import { useViewportStore } from './stores/viewportStore';
import { useUIStore } from './stores/uiStore';
import { AXLRenderer } from './engine';
import type { RenderState } from './engine';
import AXLToolbar from './components/Toolbar';
import FeatureTree from './components/FeatureTree';
import PropertiesPanel from './components/PropertiesPanel';

// ==================== APP IDENTITY ====================
export const AXL_VERSION = '1.0.0';
export const AXL_BUILD_DATE = '2026-04-11';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const AXL: React.FC = () => {
  const { showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('axl');
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedGuard(isDirty);
  const collab = useCollaborationFeatures({ appId: 'axl', projectName: 'AXL Project', autoCheckpointInterval: 300000 });
  // Track app usage
  useAppTracking('axl');
  useEffect(() => {
    const eng = loadEngagement();
    const updated = recordAppUsage(eng, 'axl');
    saveEngagement(checkAchievements(updated).state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stores ───────────────────────────────────────────────────────────
  const project = useProjectStore(s => s.project);
  useAutoSave('axl', useCallback(() => ({ project }), [project]), isDirty, 30_000);
  const simResults = useProjectStore(s => s.simResults);
  const pStore = useProjectStore();
  const { tool, selectedPartId, gridVisible } = useViewportStore();
  const vStore = useViewportStore();
  const ui = useUIStore();

  // ─── Local State (transient UI) ───────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [cameraAngle, setCameraAngle] = useState<{ azimuth: number; elevation: number; distance: number }>({ azimuth: 45, elevation: 30, distance: 500 });
  const [wireframe, setWireframe] = useState(false);
  const [simType, setSimType] = useState<SimulationType>('stress');
  const [simForce, setSimForce] = useState(1000);
  const [simRunning, setSimRunning] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [libCategory, setLibCategory] = useState(0);
  const [aiInput, setAiInput] = useState('');
  const [featureType, setFeatureType] = useState<'extrude' | 'revolve' | 'chamfer' | 'fillet' | 'pattern'>('extrude');
  const [featureParams, setFeatureParams] = useState<Record<string, number>>({ depth: 20, angle: 360, distance: 2, radius: 3, count: 4, spacing: 30 });
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
  const lastMouse = useRef({ x: 0, y: 0, down: false, button: 0 });
  const measureStart = useRef<Vec3 | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });

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
        const vol = calcVolume((feat.primitiveType as PrimitiveType) || 'box', feat as Record<string, number>);
        return { name: p.name, weight: calcWeight(vol * 1e-9, p.material.density), material: p.material.name };
      });
      return breakdown.map(b => `\u2022 ${b.name}: ${formatWeight(b.weight)} (${b.material})`).join('\n') + `\n\u2500\u2500\u2500\u2500\u2500\nTotal: ${formatWeight(breakdown.reduce((s, b) => s + b.weight, 0))}`;
    }

    if (q.includes('help') || q.includes('how') || q.includes('what can')) {
      return 'I can help with:\n\u2022 Material selection\n\u2022 Tolerance & GD&T advice\n\u2022 Simulation analysis\n\u2022 Assembly review\n\u2022 Weight breakdown\n\u2022 Feature guidance';
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

  // ROADMAP-600 #095/#296-301 — real local handlers: route the read-only CAD
  // analysis ops to Axl's own `aiAnalyze` (real volume/weight/tolerance compute,
  // posted into the AI panel); engine ops (DFM, topology optimise) honestly skip.
  const handleAxlOp = useCallback((op: CreativeOp): OpApplyResult | Promise<OpApplyResult> => {
    const queryFor: Record<string, string> = {
      massProperties: 'weight and mass breakdown',
      gdtSuggest: 'tolerance and GD&T fit recommendations',
      parametricSuggest: 'what can you do — feature guidance',
    };
    const q = queryFor[op.op];
    if (q) {
      const answer = aiAnalyze(q);
      ui.addAIMessage({ role: 'assistant', content: answer, timestamp: Date.now() });
      return { outcome: 'applied', note: answer.split('\n')[0].slice(0, 90) };
    }
    return enginePendingApplier('Axl')(op);
  }, [aiAnalyze, ui]);

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
        const results = parts.map(p => {
          const feat = p.features[0];
          const params = feat?.params || {};
          const vol = calcVolume((params.primitiveType as PrimitiveType) || 'box', params as Record<string, number>);
          const area = Math.pow(vol, 2 / 3);
          const I = area * area / 12;
          const stress = computeVonMisesSimple(simForce, area, I, Math.sqrt(area) / 2, Math.pow(vol, 1 / 3));
          const ratio = Math.min(stress / p.material.tensileStrength, 1.5);
          return { partId: p.id, ratio, stress };
        });
        const maxStress = Math.max(...results.map(r => r.stress));
        const minTensile = Math.min(...parts.map(p => p.material.tensileStrength));
        pStore.setSimResults({ maxStress, safetyFactor: minTensile / maxStress, stressMap: results.map(r => ({ partId: r.partId, ratio: r.ratio })), converged: true, timestamp: Date.now() });
        ui.showToast(`Stress analysis complete -- SF: ${(minTensile / maxStress).toFixed(2)}`);
      } else if (simType === 'thermal') {
        const ambientTemp = 25;
        const heatInput = simForce;
        const results = parts.map(p => {
          const feat = p.features[0]?.params || {};
          const vol = calcVolume((feat.primitiveType as PrimitiveType) || 'box', feat as Record<string, number>);
          const surfaceArea = Math.pow(vol, 2 / 3) * 6;
          const k = p.material.thermalConductivity;
          const thickness = Math.pow(vol, 1 / 3);
          const deltaT = (heatInput * (thickness / 1000)) / (k * (surfaceArea / 1e6));
          const ratio = Math.min(deltaT / 200, 1.5);
          return { partId: p.id, ratio, stress: ambientTemp + deltaT };
        });
        const maxTemp = Math.max(...results.map(r => r.stress));
        pStore.setSimResults({ maxStress: maxTemp, safetyFactor: 200 / (maxTemp - ambientTemp), stressMap: results.map(r => ({ partId: r.partId, ratio: r.ratio })), converged: true, timestamp: Date.now() });
        ui.showToast(`Thermal analysis -- Peak: ${maxTemp.toFixed(1)}\u00b0C`);
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
  const handleExport = useCallback((format: 'stl' | 'dxf' | 'pdf' | 'json' | 'png' | 'gltf') => {
    doExport(project, format, canvasRef.current);
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
      hoveredPartId: null,
      stressMap: simResults?.stressMap ?? null,
    };
  }, [cameraAngle, gridVisible, project, selectedPartId, simResults, viewMode, wireframe]);

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

    ctx.fillStyle = 'var(--color-bg-elevated)';
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (gridVisible) {
      const gridSize = 20;
      const gridCount = 30;
      const cx = w / 2, cy = h / 2;
      ctx.strokeStyle = 'var(--color-bg-hover)';
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
      ctx.strokeStyle = 'var(--color-error)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 80, cy); ctx.stroke();
      ctx.fillStyle = 'var(--color-error)'; ctx.font = '10px system-ui'; ctx.fillText('X', cx + 84, cy + 4);
      ctx.strokeStyle = 'var(--color-success)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 80); ctx.stroke();
      ctx.fillStyle = 'var(--color-success)'; ctx.fillText('Y', cx + 4, cy - 84);
      ctx.strokeStyle = 'var(--color-accent)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 50, cy + 30); ctx.stroke();
      ctx.fillStyle = 'var(--color-accent)'; ctx.fillText('Z', cx - 62, cy + 38);
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
            ctx.fillStyle = 'var(--color-text-tertiary)';
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
            ctx.fillStyle = 'var(--color-text-tertiary)';
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
            ctx.fillStyle = 'var(--color-text-tertiary)';
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
            ctx.fillStyle = 'var(--color-text-tertiary)';
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
            ctx.fillStyle = 'var(--color-text-tertiary)';
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
        ctx.strokeStyle = 'var(--color-accent)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const sz = Math.max((params.width as number) || 50, (params.radius as number) ? (params.radius as number) * 2 : 50, 50);
        ctx.strokeRect(-sz / 2 - 6, -sz / 2 - 6, sz + 12, sz + 12);
        ctx.setLineDash([]);
      }

      ctx.restore();
    });

    // Measurements overlay
    project.measurements.forEach(m => {
      if (m.points.length >= 2) {
        const p1 = { x: w / 2 + m.points[0].x, y: h / 2 - m.points[0].y };
        const p2 = { x: w / 2 + m.points[1].x, y: h / 2 - m.points[1].y };
        ctx.strokeStyle = 'var(--color-warning)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'var(--color-warning)';
        ctx.font = '10px system-ui';
        ctx.fillText(m.label, (p1.x + p2.x) / 2 + 5, (p1.y + p2.y) / 2 - 5);
      }
    });

    // GD&T annotations overlay
    project.annotations.forEach(a => {
      const px = w / 2 + a.position.x;
      const py = h / 2 - a.position.y;
      const frameText = `${a.symbol} ${a.tolerance} | ${a.datum}`;
      ctx.font = '10px monospace';
      const tw = ctx.measureText(frameText).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px + 15, py - 18, tw, 18);
      ctx.strokeStyle = 'var(--color-accent)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 15, py - 18, tw, 18);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 15, py - 9); ctx.stroke();
      ctx.fillStyle = 'var(--color-accent)';
      ctx.fillText(frameText, px + 21, py - 5);
    });

    // Camera info
    ctx.fillStyle = 'var(--color-text-tertiary)';
    ctx.font = '10px system-ui';
    ctx.fillText(`${viewMode.toUpperCase()} | Grid: ${project.gridSnap}${project.units} | Parts: ${parts.length}`, 12, h - 10);
    ctx.fillText(`Az: ${cameraAngle.azimuth.toFixed(0)}\u00b0 El: ${cameraAngle.elevation.toFixed(0)}\u00b0`, w - 140, h - 10);
    ctx.restore(); // undo DPR scale
  }, [buildRendererState, project, gridVisible, wireframe, cameraAngle, selectedPartId, simResults, viewMode]);

  // Keep render function ref in sync (avoids restarting rAF loop on state change)
  renderFnRef.current = renderViewport;

  // ─── Canvas resize & render loop ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new AXLRenderer();
    renderer.init(canvas);
    rendererRef.current = renderer;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = parent.clientWidth * dpr;
        canvas.height = parent.clientHeight * dpr;
        canvas.style.width = parent.clientWidth + 'px';
        canvas.style.height = parent.clientHeight + 'px';
        renderer.resize();
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
      renderViewportRef.current();
      animRef.current = requestAnimationFrame(loop);
    };
    // Only render when tab is visible
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current);
      } else {
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
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    lastMouse.current = { x: e.clientX, y: e.clientY, down: true, button: e.button };
    // Capture pointer for all types (mouse, touch, pen) to ensure smooth drag
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }

    // Capture undo BEFORE any drag mutations begin
    if (e.button === 0 && (tool === 'move' || tool === 'rotate' || tool === 'scale') && selectedPartId) {
      pStore.pushUndo();
    }

    if (tool === 'select') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = rect.width, h = rect.height;
      // Use same isometric projection as rendering for accurate hit-testing
      const azRad = cameraAngle.azimuth * Math.PI / 180;
      const elRad = cameraAngle.elevation * Math.PI / 180;
      const camScale = 500 / Math.max(100, cameraAngle.distance);
      let effAz = azRad, effEl = elRad;
      if (viewMode === 'front') { effAz = 0; effEl = 0; }
      else if (viewMode === 'top') { effAz = 0; effEl = Math.PI / 2 * 0.99; }
      else if (viewMode === 'right') { effAz = Math.PI / 2; effEl = 0; }
      let hit: string | null = null;
      for (const part of [...project.assembly.parts].reverse()) {
        const px = part.transform.position.x;
        const py = part.transform.position.y;
        const pz = part.transform.position.z || 0;
        const isoX = px * Math.cos(effAz) - pz * Math.sin(effAz);
        const isoY = -py * Math.cos(effEl) + (px * Math.sin(effAz) + pz * Math.cos(effAz)) * Math.sin(effEl);
        const sx = w / 2 + isoX * camScale;
        const sy = h / 2 + isoY * camScale;
        const sz = 30;
        if (Math.abs(mx - sx) < sz && Math.abs(my - sy) < sz) {
          hit = part.id;
          break;
        }
      }
      vStore.setSelectedPartId(hit);
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
  }, [tool, project, pStore, vStore, ui]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!lastMouse.current.down) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current.x = e.clientX;
    lastMouse.current.y = e.clientY;

    if (lastMouse.current.button === 2 || lastMouse.current.button === 1) {
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
        pStore.updatePartTransform(selectedPartId, 'position', 'x', Math.round((part.transform.position.x + worldDx) / snap) * snap);
        pStore.updatePartTransform(selectedPartId, 'position', 'y', Math.round((part.transform.position.y + worldDy) / snap) * snap);
        pStore.updatePartTransform(selectedPartId, 'position', 'z', Math.round((part.transform.position.z + worldDz) / snap) * snap);
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
  }, [tool, selectedPartId, project.gridSnap, project.assembly.parts, pStore]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    lastMouse.current.down = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [tool, selectedPartId, pStore]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    setCameraAngle(prev => ({
      ...prev,
      distance: Math.max(100, Math.min(2000, prev.distance + e.deltaY * 0.5)),
    }));
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
        if (k === 'i') { e.preventDefault(); ui.toggleAI(); return; }          // Ctrl+I  AI copilot
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
          doExport(project, 'json');
          ui.showToast('Exported project as JSON');
          return;
        }
        if (k === 'n') {                                                        // Ctrl+N  new project (reset)
          e.preventDefault();
          pStore.newProject();
          vStore.setSelectedPartId(null);
          ui.showToast('New project started');
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
  }, [applyStandardView, pStore, vStore, ui, selectedPartId, project.assembly.parts]);

  // ─── Styles ───────────────────────────────────────────────────────────
  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 12,
    background: active ? '#0d2847' : 'transparent',
    border: active ? '1px solid #153d6b' : '1px solid transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  });

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', overflow: 'hidden', fontFamily: 'var(--font-family)', fontSize: '11px', position: 'relative', contain: 'layout style' } as React.CSSProperties} onClick={() => setCtxMenu(p => ({ ...p, visible: false }))}>
      <style>{`
        .axl-ctx-item:hover { background: rgba(10,132,255,0.15) !important; }
        .axl-ctx-item:active { background: rgba(10,132,255,0.25) !important; }
        button { font-family: inherit; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle, #333) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle, #333); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border, #555); }
        input[type="range"] { -webkit-appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: #0a84ff; cursor: pointer; margin-top: -4px; border: none; }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(10,132,255,0.15); border-radius: 2px; }
      `}</style>

      {/* ─── Top Toolbar ─────────────────────────────────────────────── */}
      <div data-testid="axl-tools">
        <AXLToolbar
          onExport={handleExport}
          onRunSimulation={runSimulation}
          onAddFeature={addFeatureToSelected}
          sendToMenu={
            <>
              <SendToMenu sourceApp="axl" assetKind="model" getAsset={() => ({ name: `${project.name}.axl`, data: JSON.stringify(project), mimeType: 'application/json' })} />
              {collab.canShare && (
                <button onClick={collab.openShareDialog} aria-label="Share project" style={collabButtonStyles} title="Share project">
                  <DexIcon name="user-plus" size={14} /> Share
                </button>
              )}
            </>
          }
        />
      </div>

      {/* ─── Main Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ─── Left Panel: Feature Tree ──────────────────────────────── */}
        <div data-testid="axl-hierarchy">
          <FeatureTree />
        </div>

        {/* ─── 3D Viewport ───────────────────────────────────────────── */}
        <div data-testid="axl-viewport" style={{ flex: 1, position: 'relative', cursor: tool === 'move' ? 'grab' : tool === 'measure' ? 'crosshair' : tool === 'rotate' ? 'alias' : tool === 'scale' ? 'nwse-resize' : 'default' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e) => {
            e.preventDefault();
            // Handle file drops (STL, JSON from filesystem)
            if (e.dataTransfer.files.length > 0) {
              const file = e.dataTransfer.files[0];
              if (file.name.toLowerCase().endsWith('.json')) {
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const data = JSON.parse(reader.result as string);
                    if (data.name && data.assembly) { pStore.loadProject(data); vStore.setSelectedPartId(null); ui.showToast('Project loaded'); }
                    else { ui.showToast('Invalid AXL project file'); }
                  } catch { ui.showToast('Failed to parse project file'); }
                };
                reader.readAsText(file);
              } else if (file.name.toLowerCase().endsWith('.stl')) {
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const text = reader.result as string;
                    const vertexRe = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
                    let match: RegExpExecArray | null;
                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                    let count = 0;
                    while ((match = vertexRe.exec(text)) !== null) {
                      const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
                      if (x < minX) minX = x; if (x > maxX) maxX = x;
                      if (y < minY) minY = y; if (y > maxY) maxY = y;
                      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                      count++;
                    }
                    if (count === 0) { ui.showToast('No vertices found in STL'); return; }
                    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY), d = Math.max(1, maxZ - minZ);
                    const partName = file.name.replace(/\.stl$/i, '');
                    pStore.addPrimitive('box', { width: w, height: h, depth: d }, partName);
                    ui.showToast(`STL dropped: ${partName} (${(count / 3).toFixed(0)} faces)`);
                  } catch { ui.showToast('Failed to import STL'); }
                };
                reader.readAsText(file);
              }
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
            onWheel={handleWheel}
            onContextMenu={e => { e.preventDefault(); setCtxMenu({ visible: true, x: e.clientX, y: e.clientY }); }}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', imageRendering: 'auto' }}
          />

          {/* ── Blender-style Viewport Header Bar ──────────────────── */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', background: 'var(--color-bg-surface-solid, #1E1E22)', borderBottom: '1px solid var(--color-border-subtle)', zIndex: 10 }}>
            {/* Viewport Mode */}
            <div style={{ display: 'flex', background: 'var(--color-bg-hover)', borderRadius: 6, padding: 2 }}>
              {[
                { mode: '3d' as ViewMode, label: '3D', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
                { mode: 'front' as ViewMode, label: 'Front', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="12" cy="12" r="2"/></svg> },
                { mode: 'top' as ViewMode, label: 'Top', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="3" x2="21" y2="21"/><line x1="21" y1="3" x2="3" y2="21"/></svg> },
                { mode: 'right' as ViewMode, label: 'Right', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v16H6z"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
                { mode: 'drawing' as ViewMode, label: '2D', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg> },
              ].map(v => (
                <button key={v.mode} onClick={() => applyStandardView(v.mode)}
                  title={`${v.label} (${v.mode === '3d' ? '1' : v.mode === 'front' ? '2' : v.mode === 'top' ? '3' : v.mode === 'right' ? '4' : '5'})`}
                  style={{ padding: '3px 8px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, transition: 'all 0.12s', background: viewMode === v.mode ? '#0d2847' : 'transparent', color: viewMode === v.mode ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

            {/* Shading Mode */}
            <div style={{ display: 'flex', background: 'var(--color-bg-hover)', borderRadius: 6, padding: 2 }}>
              <button onClick={() => setWireframe(false)} title="Solid" style={{ padding: '3px 7px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: !wireframe ? '#1e3a28' : 'transparent', color: !wireframe ? 'var(--color-success)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Solid
              </button>
              <button onClick={() => setWireframe(true)} title="Wireframe (W)" style={{ padding: '3px 7px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: wireframe ? '#0d2847' : 'transparent', color: wireframe ? 'var(--color-accent)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><line x1="3" y1="8" x2="12" y2="13"/><line x1="21" y1="8" x2="12" y2="13"/><line x1="12" y1="13" x2="12" y2="22"/></svg> Wire
              </button>
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

            {/* Viewport Overlays */}
            <button onClick={vStore.toggleGrid} title="Toggle Grid (Ctrl+G)" style={{ padding: '3px 7px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: gridVisible ? '#2e2410' : 'transparent', color: gridVisible ? 'var(--color-warning)' : 'var(--color-text-tertiary)', transition: 'all 0.12s' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg> Grid
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
            <div style={{ position: 'absolute', top: 42, left: 10, background: 'var(--color-bg-surface-solid, #141416)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', padding: '8px 10px', fontSize: 10, zIndex: 10, minWidth: 140 }}>
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
            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', padding: 12, fontSize: 11, maxWidth: 320 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 6 }}>
                {simType === 'stress' ? 'STRESS ANALYSIS' : simType === 'thermal' ? 'THERMAL ANALYSIS' : 'MOTION STUDY'}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                    {simType === 'stress' ? 'Max Stress' : simType === 'thermal' ? 'Peak Temp' : 'Max Deflection'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: simResults.safetyFactor > 2 ? 'var(--color-success)' : simResults.safetyFactor > 1 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                    {simType === 'stress' ? `${simResults.maxStress.toFixed(1)} MPa` : simType === 'thermal' ? `${simResults.maxStress.toFixed(1)}\u00b0C` : `${simResults.maxStress.toFixed(3)}${project.units}`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Safety Factor</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: simResults.safetyFactor > 2 ? 'var(--color-success)' : simResults.safetyFactor > 1 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                    {simResults.safetyFactor.toFixed(2)}\u00d7
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                {simType === 'thermal' ? `Heat: ${simForce}W` : `Force: ${simForce}N`} | {project.assembly.parts.length} parts analyzed
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 60, height: 6, borderRadius: 3, background: 'linear-gradient(to right, rgb(0,255,40), rgb(255,255,40), rgb(255,0,40))' }} />
                <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>Low \u2192 High</span>
              </div>
              {/* Per-part stress breakdown */}
              {simResults.stressMap.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 6 }}>
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
                style={{ marginTop: 8, fontSize: 9, color: 'var(--color-text-secondary)', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '3px 8px', cursor: 'pointer' }}>
                Clear Results
              </button>
            </div>
          )}

          {/* Simulation controls */}
          {ui.showSimulation && !simResults && (
            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', padding: 12, fontSize: 11, width: 260 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 8 }}>SIMULATION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Type:
                  <select value={simType} onChange={e => setSimType(e.target.value as SimulationType)}
                    style={{ marginLeft: 8, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }}>
                    <option value="stress">Static Stress</option>
                    <option value="motion">Motion Study</option>
                    <option value="thermal">Thermal</option>
                  </select>
                </label>
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  {simType === 'thermal' ? 'Heat (W):' : 'Force (N):'}
                  <input type="number" value={simForce} onChange={e => setSimForce(Number(e.target.value))}
                    style={{ marginLeft: 8, width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
                {simType !== 'thermal' && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 3 }}>LOAD DIRECTION</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(['X', 'Y', 'Z'] as const).map(axis => {
                        const colors = { X: 'var(--color-error)', Y: 'var(--color-success)', Z: 'var(--color-accent)' };
                        return (
                          <button key={axis} aria-label={`Apply load along ${axis} axis`} style={{ flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: colors[axis] }}>
                            {axis} <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 3 }}>MESH QUALITY</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {(['Coarse', 'Medium', 'Fine'] as const).map(q => (
                      <button key={q} style={{ flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: q === 'Medium' ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)', background: q === 'Medium' ? '#0d2847' : 'var(--color-border-subtle)', color: q === 'Medium' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                {simType === 'stress' && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 3 }}>BOUNDARY</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(['Fixed', 'Pinned', 'Roller'] as const).map(bc => (
                        <button key={bc} style={{ flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: bc === 'Fixed' ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)', background: bc === 'Fixed' ? '#0d2847' : 'var(--color-border-subtle)', color: bc === 'Fixed' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                          {bc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={runSimulation} disabled={simRunning}
                  style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, background: '#0d2847', color: 'var(--color-accent)', border: '1px solid #153d6b', borderRadius: 10, cursor: simRunning ? 'wait' : 'pointer' }}>
                  {simRunning ? 'Running...' : 'Run Simulation'}
                </button>
              </div>
            </div>
          )}

          {/* Measurement Readout Panel */}
          {tool === 'measure' && project.measurements.length > 0 && (
            <div style={{ position: 'absolute', top: 42, right: 250, background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', padding: 10, fontSize: 10, maxWidth: 220, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.8px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2"><path d="M2 12h5l2-9 4 18 3-9h6"/></svg>
                MEASUREMENTS ({project.measurements.length})
              </div>
              {project.measurements.map((m, i) => (
                <div key={m.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 2, background: 'var(--color-border-subtle)', borderRadius: 6 }}>
                  <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontSize: 8, width: 14 }}>#{i + 1}</span>
                  <span style={{ flex: 1, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{m.value.toFixed(2)} {project.units}</span>
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
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', padding: '6px 16px', fontSize: 11, color: 'var(--color-text-primary)', animation: 'dex-snap-in 0.2s ease-out' }}>
              {ui.toastMsg}
            </div>
          )}
        </div>

        {/* ─── Right Panel: Properties ───────────────────────────────── */}
        <PropertiesPanel />

        {/* ─── Parts Library Panel (overlay) ──────────────────────────── */}
        {ui.showPartsLibrary && (
          <div style={{ position: 'absolute', top: 42, left: 'min(220px, 32%)', width: 'clamp(220px, calc(100% - 244px), 320px)', bottom: 0, background: 'var(--color-bg-elevated)', borderRight: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Standard Parts</span>
              <button onClick={ui.togglePartsLibrary} aria-label="Close parts library" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>&times;</button>
            </div>

            <div style={{ display: 'flex', padding: '6px 8px', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--color-border-subtle)' }}>
              {STD_PARTS_LIBRARY.map((cat, i) => (
                <button key={cat.category} onClick={() => setLibCategory(i)}
                  style={{ padding: '4px 10px', fontSize: 9, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: libCategory === i ? '#0d2847' : 'transparent', color: libCategory === i ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                  <DexIcon name={cat.icon} size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} /> {cat.category}
                </button>
              ))}
            </div>

            <div style={{ padding: '6px 8px' }}>
              <input value={libSearch} onChange={e => setLibSearch(e.target.value)}
                placeholder="Search parts..."
                style={{ width: '100%', background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, padding: '5px 10px', color: 'var(--color-text-primary)', fontSize: 11, outline: 'none' }} />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {STD_PARTS_LIBRARY[libCategory]?.parts
                .filter(p => !libSearch || p.name.toLowerCase().includes(libSearch.toLowerCase()))
                .map(part => (
                  <div key={part.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 2, borderRadius: 6, cursor: 'pointer', background: 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      pStore.addPrimitive('box', { width: 10, height: 10, depth: 10 }, part.name);
                      ui.showToast(`Added ${part.name}`);
                    }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
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
          <div style={{ position: 'absolute', top: 42, right: 12, width: 'min(260px, calc(100% - 24px))', maxHeight: 'calc(100% - 48px)', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Add Feature</span>
              <button onClick={ui.toggleFeatureCreate} aria-label="Close feature create" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>\u00d7</button>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {(['extrude', 'revolve', 'chamfer', 'fillet', 'pattern'] as const).map(ft => (
                  <button key={ft} onClick={() => setFeatureType(ft)}
                    style={{ padding: '4px 8px', fontSize: 9, fontWeight: 600, borderRadius: 12, cursor: 'pointer',
                      background: featureType === ft ? '#0d2847' : 'var(--color-border-subtle)',
                      color: featureType === ft ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      border: featureType === ft ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)' }}>
                    {ft.charAt(0).toUpperCase() + ft.slice(1)}
                  </button>
                ))}
              </div>

              {featureType === 'extrude' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Depth ({project.units}):
                  <input type="number" value={featureParams.depth} onChange={e => setFeatureParams(p => ({ ...p, depth: Number(e.target.value) }))}
                    style={{ marginLeft: 8, width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
              )}
              {featureType === 'revolve' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Angle (\u00b0):
                  <input type="number" value={featureParams.angle} onChange={e => setFeatureParams(p => ({ ...p, angle: Number(e.target.value) }))}
                    style={{ marginLeft: 8, width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
              )}
              {featureType === 'chamfer' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Distance ({project.units}):
                  <input type="number" value={featureParams.distance} step={0.5} onChange={e => setFeatureParams(p => ({ ...p, distance: Number(e.target.value) }))}
                    style={{ marginLeft: 8, width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
              )}
              {featureType === 'fillet' && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                  Radius ({project.units}):
                  <input type="number" value={featureParams.radius} step={0.5} onChange={e => setFeatureParams(p => ({ ...p, radius: Number(e.target.value) }))}
                    style={{ marginLeft: 8, width: 70, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                </label>
              )}
              {featureType === 'pattern' && (
                <>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    Count:
                    <input type="number" value={featureParams.count} min={2} max={50} onChange={e => setFeatureParams(p => ({ ...p, count: Number(e.target.value) }))}
                      style={{ marginLeft: 8, width: 50, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                  </label>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    Spacing ({project.units}):
                    <input type="number" value={featureParams.spacing} onChange={e => setFeatureParams(p => ({ ...p, spacing: Number(e.target.value) }))}
                      style={{ marginLeft: 8, width: 60, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
                  </label>
                </>
              )}

              <button onClick={addFeatureToSelected} disabled={!selectedPartId}
                style={{ padding: '7px 12px', fontSize: 10, fontWeight: 600, borderRadius: 10, cursor: selectedPartId ? 'pointer' : 'not-allowed',
                  background: selectedPartId ? '#0d2847' : 'var(--color-border-subtle)',
                  color: selectedPartId ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border: selectedPartId ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)' }}>
                {selectedPartId ? `Apply ${featureType.charAt(0).toUpperCase() + featureType.slice(1)}` : 'Select a part first'}
              </button>
            </div>
          </div>
        )}

        {/* ─── GD&T Creation Panel (overlay) ─────────────────────────── */}
        {ui.showGDTCreate && (
          <div style={{ position: 'absolute', top: 42, right: 12, width: 'min(260px, calc(100% - 24px))', maxHeight: 'calc(100% - 48px)', background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>GD&T Annotation</span>
              <button onClick={ui.toggleGDTCreate} aria-label="Close GD&T create" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>\u00d7</button>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>SYMBOL</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                {GDT_SYMBOLS.map(g => (
                  <button key={g.symbol} onClick={() => setGdtSymbol(g.symbol)} title={g.name}
                    style={{ padding: '5px 0', fontSize: 14, textAlign: 'center', borderRadius: 12, cursor: 'pointer',
                      background: gdtSymbol === g.symbol ? '#0d2847' : 'var(--color-border-subtle)',
                      color: gdtSymbol === g.symbol ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      border: gdtSymbol === g.symbol ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)' }}>
                    {g.symbol}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Tolerance:
                <input value={gdtTolerance} onChange={e => setGdtTolerance(e.target.value)}
                  style={{ marginLeft: 8, width: 80, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none' }} />
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Datum:
                <input value={gdtDatum} onChange={e => setGdtDatum(e.target.value)} maxLength={3}
                  style={{ marginLeft: 8, width: 40, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 6px', outline: 'none', textTransform: 'uppercase' }} />
              </label>

              <div style={{ padding: '8px 12px', background: 'var(--color-border-subtle)', borderRadius: 10, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 16, color: 'var(--color-accent)' }}>{gdtSymbol}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{gdtTolerance}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>|</span>
                <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600 }}>{gdtDatum}</span>
              </div>

              <button onClick={addGDTAnnotation} disabled={!selectedPartId}
                style={{ padding: '7px 12px', fontSize: 10, fontWeight: 600, borderRadius: 10, cursor: selectedPartId ? 'pointer' : 'not-allowed',
                  background: selectedPartId ? '#0d2847' : 'var(--color-border-subtle)',
                  color: selectedPartId ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border: selectedPartId ? '1px solid #153d6b' : '1px solid var(--color-bg-hover)' }}>
                {selectedPartId ? 'Add Annotation' : 'Select a part first'}
              </button>

              {project.annotations.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 4 }}>ANNOTATIONS ({project.annotations.length})</div>
                  {project.annotations.map(a => {
                    const part = project.assembly.parts.find(p => p.id === a.attachedTo);
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 10, color: 'var(--color-text-secondary)', borderRadius: 12, background: 'var(--color-border-subtle)' }}>
                        <span style={{ fontSize: 14, color: 'var(--color-accent)' }}>{a.symbol}</span>
                        <span style={{ fontFamily: 'monospace' }}>{a.tolerance}</span>
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
          <div style={{ position: 'absolute', top: 42, right: 240, width: 270, background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 520 }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Assembly Constraints</span>
              <button aria-label="Close constraints panel" onClick={ui.toggleConstraintPanel} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>&times;</button>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>ADD CONSTRAINT</div>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Type:
                <select value={cType} onChange={e => setCType(e.target.value as ConstraintType)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  {(['mate','align','offset','angle','concentric','fixed','tangent','distance','coincident','parallel','perpendicular'] as ConstraintType[]).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Part A:
                <select value={cPartA} onChange={e => setCPartA(e.target.value)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  <option value="">— select —</option>
                  {project.assembly.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Part B:
                <select value={cPartB} onChange={e => setCPartB(e.target.value)}
                  style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }}>
                  <option value="">— select —</option>
                  {project.assembly.parts.filter(p => p.id !== cPartA).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {(cType === 'distance' || cType === 'offset' || cType === 'angle') && (
                <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Value:
                  <input type="number" value={cValue} onChange={e => setCValue(e.target.value)} min={0}
                    style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, color: 'var(--color-text-primary)', fontSize: 10, padding: '3px 6px', outline: 'none' }} />
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 9 }}>{cType === 'angle' ? '°' : project.units}</span>
                </label>
              )}
              <button
                onClick={() => {
                  if (!cPartA || !cPartB || cPartA === cPartB) { ui.showToast('Select two different parts'); return; }
                  pStore.addConstraint(cType, cPartA, cPartB, parseFloat(cValue) || 0);
                  ui.showToast(`${cType} constraint added`);
                  setCPartA(''); setCPartB(''); setCValue('0');
                  window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'axlExports', amount: 0 } }));
                }}
                disabled={!cPartA || !cPartB}
                style={{ padding: '7px 12px', fontSize: 10, fontWeight: 600, borderRadius: 10, cursor: (!cPartA || !cPartB) ? 'not-allowed' : 'pointer', background: (!cPartA || !cPartB) ? 'var(--color-border-subtle)' : '#0d2847', color: (!cPartA || !cPartB) ? 'var(--color-text-tertiary)' : 'var(--color-accent)', border: (!cPartA || !cPartB) ? '1px solid var(--color-bg-hover)' : '1px solid #153d6b' }}>
                {(!cPartA || !cPartB) ? 'Select parts above' : 'Add Constraint'}
              </button>
            </div>
            {project.assembly.constraints.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 2 }}>EXISTING CONSTRAINTS ({project.assembly.constraints.length})</div>
                {project.assembly.constraints.map(c => {
                  const pa = project.assembly.parts.find(p => p.id === c.partA);
                  const pb = project.assembly.parts.find(p => p.id === c.partB);
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', fontSize: 10, color: 'var(--color-text-secondary)', borderRadius: 10, background: 'var(--color-border-subtle)' }}>
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

        {/* ─── Settings Panel (overlay) ─────────────────────── */}
        {ui.showSettings && (
          <div style={{ position: 'absolute', top: 42, right: 0, width: 'min(300px, calc(100% - 24px))', bottom: 0, background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Settings</span>
              <button aria-label="Close settings" onClick={() => ui.toggleSettings()} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>UNITS</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['mm', 'in', 'm'] as const).map(u => (
                    <button key={u} onClick={() => pStore.setUnits(u)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid ' + (project.units === u ? '#153d6b' : 'var(--color-bg-hover)'), background: project.units === u ? '#0d2847' : 'var(--color-border-subtle)', color: project.units === u ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{u}</button>
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
                    <button key={v} onClick={() => { vStore.setStandardView(v); applyStandardView(v === 'isometric' ? '3d' : v); }} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{v === 'isometric' ? 'Iso' : v}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, marginBottom: 6 }}>PROJECT</div>
                <button onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = '.json';
                  input.onchange = () => {
                    const file = input.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const data = JSON.parse(reader.result as string);
                        if (data.name && data.assembly) { pStore.loadProject(data); vStore.setSelectedPartId(null); ui.showToast('Project loaded'); }
                        else { ui.showToast('Invalid project file'); }
                      } catch { ui.showToast('Failed to parse project file'); }
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>Import Project (JSON)</button>
                <button onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = '.stl';
                  input.onchange = () => {
                    const file = input.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const text = reader.result as string;
                        // Parse ASCII STL: collect all vertex lines
                        const vertexRe = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
                        let match: RegExpExecArray | null;
                        let minX = Infinity, minY = Infinity, minZ = Infinity;
                        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                        let count = 0;
                        while ((match = vertexRe.exec(text)) !== null) {
                          const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
                          if (x < minX) minX = x; if (x > maxX) maxX = x;
                          if (y < minY) minY = y; if (y > maxY) maxY = y;
                          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                          count++;
                        }
                        if (count === 0) { ui.showToast('No vertices found in STL'); return; }
                        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
                        const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY), d = Math.max(1, maxZ - minZ);
                        const partName = file.name.replace(/\.stl$/i, '');
                        pStore.addPrimitive('box', { width: w, height: h, depth: d }, partName);
                        ui.showToast(`STL imported: ${partName} (${count / 3} faces, ${w.toFixed(1)}×${h.toFixed(1)}×${d.toFixed(1)}${project.units})`);
                      } catch (err) { ui.showToast('Failed to import STL file'); }
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>Import Part (STL)</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── AI Design Copilot Panel (overlay) ─────────────────────── */}
        {ui.showAI && (
          <div style={{ position: 'absolute', top: 42, right: 0, width: 'min(320px, calc(100% - 24px))', bottom: 0, background: 'var(--color-bg-elevated)', borderLeft: '1px solid var(--color-border-subtle)', zIndex: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z"/></svg>
                <span style={{ fontSize: 12, fontWeight: 600 }}>AI Design Copilot</span>
              </div>
              <button onClick={ui.toggleAI} aria-label="Close AI panel" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}>\u00d7</button>
            </div>

            <div style={{ padding: '8px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--color-border-subtle)' }}>
              {['Recommend material', 'Check tolerances', 'Weight breakdown', 'Assembly review', 'What can you do?'].map(q => (
                <button key={q} onClick={() => {
                  setAiInput(q);
                  ui.addAIMessage({ role: 'user', content: q, timestamp: Date.now() });
                  setTimeout(() => ui.addAIMessage({ role: 'assistant', content: aiAnalyze(q), timestamp: Date.now() }), 300);
                }}
                  style={{ fontSize: 8, padding: '3px 7px', borderRadius: 10, background: '#0d2847', color: 'var(--color-accent)', border: '1px solid #153d6b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {q}
                </button>
              ))}
            </div>

            {/* ROADMAP-600 #095 — natural-language command bar */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <CreativeCommandBar
                appId="axl"
                facts={{ partId: selectedPartId ?? undefined }}
                onApplyOp={handleAxlOp}
                examples={['mass properties', 'check tolerances', 'parametric suggestions']}
                placeholder="Tell Axl what to model…"
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ui.aiMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                  <div>Ask about materials, tolerances,<br/>simulation, or assembly.</div>
                </div>
              )}
              {ui.aiMessages.map((msg, i) => (
                <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '8px 10px', borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px', background: msg.role === 'user' ? '#0d2847' : 'var(--color-bg-hover)', fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              ))}
            </div>

            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-bg-hover)', display: 'flex', gap: 6 }}>
              <input
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendAIMessage(); }}
                placeholder="Ask about your design..."
                style={{ flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '6px 10px', color: 'var(--color-text-primary)', fontSize: 11, outline: 'none' }}
              />
              <button onClick={sendAIMessage}
                style={{ padding: '6px 10px', background: '#0d2847', border: '1px solid #153d6b', borderRadius: 12, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── BOM Table Overlay ────────────────────────────────────────── */}
      {ui.showBOM && project.bom.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={ui.toggleBOM}>
          <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 16, border: '1px solid var(--color-border-subtle)', padding: 20, maxWidth: 700, maxHeight: '70vh', overflow: 'auto', width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Bill of Materials \u2014 {project.name}</div>
              <button onClick={ui.toggleBOM} aria-label="Close bill of materials" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16 }}>\u00d7</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['#', 'Name', 'Qty', 'Material', 'Weight', 'Dimensions'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.bom.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '5px 8px', color: 'var(--color-text-secondary)' }}>{row.partNumber}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: '5px 8px' }}>{row.quantity}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--color-text-secondary)' }}>{row.material}</td>
                    <td style={{ padding: '5px 8px' }}>{formatWeight(row.weight)}</td>
                    <td style={{ padding: '5px 8px', fontSize: 9, color: 'var(--color-text-tertiary)' }}>{row.dimensions}</td>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', height: 24, background: 'var(--color-bg-surface)', borderTop: '1px solid var(--color-border)', fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
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
          {simRunning ? 'Simulating...' : 'Ready'}
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
        return (
          <div style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 'var(--z-max)', minWidth: 160, background: 'var(--color-bg-elevated)', border: '1px solid #333', borderRadius: 8, padding: '4px 0', boxShadow: 'var(--pg-shadow-context)' }} onClick={e => e.stopPropagation()}>
            {menuItems.map((item, i) => item === null
              ? <div key={i} style={{ height: 1, background: '#333', margin: '4px 8px' }} />
              : <div key={i} className="axl-ctx-item" onClick={() => { item.fn(); setCtxMenu(p => ({ ...p, visible: false })); }} style={{ padding: '6px 14px', fontSize: 11, color: (item as any).danger ? 'var(--color-error)' : '#e0e0e0', cursor: 'pointer', borderRadius: 4, margin: '0 4px' }}>{item.label}</div>
            )}
          </div>
        );
      })()}
      {showShortcutsPanel && <KeyboardShortcutsPanel appId="axl" onClose={() => setShowShortcutsPanel(false)} />}
    </div>
  );
};

export default memo(AXL);
