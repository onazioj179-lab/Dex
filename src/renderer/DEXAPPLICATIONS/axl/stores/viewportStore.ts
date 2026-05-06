// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Viewport Store -- camera, tool modes, rendering state
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type { ToolMode, CameraState } from '../types';

export type ViewMode = 'solid' | 'wireframe' | 'hidden-line' | 'xray';
export type ProjectionMode = 'perspective' | 'orthographic';
export type ShadingMode = 'flat' | 'smooth' | 'pbr';
export type StandardView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric';

interface ViewportStore {
  // Camera
  camera: CameraState;
  setCamera: (camera: Partial<CameraState>) => void;
  setStandardView: (view: StandardView) => void;
  resetCamera: () => void;

  // Tool
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;

  // View display
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  projection: ProjectionMode;
  setProjection: (mode: ProjectionMode) => void;
  shadingMode: ShadingMode;
  setShadingMode: (mode: ShadingMode) => void;

  // Visual toggles
  gridVisible: boolean;
  toggleGrid: () => void;
  axisVisible: boolean;
  toggleAxis: () => void;
  originVisible: boolean;
  toggleOrigin: () => void;
  showEdges: boolean;
  toggleEdges: () => void;

  // Selection
  selectedPartId: string | null;
  setSelectedPartId: (id: string | null) => void;
  hoveredPartId: string | null;
  setHoveredPartId: (id: string | null) => void;

  // Viewport interaction
  isPanning: boolean;
  setIsPanning: (v: boolean) => void;
  isRotating: boolean;
  setIsRotating: (v: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
  panOffset: { x: number; y: number };
  setPanOffset: (offset: { x: number; y: number }) => void;

  // Snapping
  snapEnabled: boolean;
  toggleSnap: () => void;
  snapAngle: number;
  setSnapAngle: (angle: number) => void;
}

const DEFAULT_CAMERA: CameraState = {
  position: { x: 200, y: -200, z: 200 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  fov: 45,
  near: 0.1,
  far: 10000,
};

const STANDARD_VIEW_CAMERAS: Record<StandardView, CameraState> = {
  front:     { ...DEFAULT_CAMERA, position: { x: 0, y: -300, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  back:      { ...DEFAULT_CAMERA, position: { x: 0, y: 300, z: 0 },  up: { x: 0, y: 0, z: 1 } },
  left:      { ...DEFAULT_CAMERA, position: { x: -300, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  right:     { ...DEFAULT_CAMERA, position: { x: 300, y: 0, z: 0 },  up: { x: 0, y: 0, z: 1 } },
  top:       { ...DEFAULT_CAMERA, position: { x: 0, y: 0, z: 300 },  up: { x: 0, y: 1, z: 0 } },
  bottom:    { ...DEFAULT_CAMERA, position: { x: 0, y: 0, z: -300 }, up: { x: 0, y: -1, z: 0 } },
  isometric: DEFAULT_CAMERA,
};

export const useViewportStore = create<ViewportStore>()((set) => ({
  camera: DEFAULT_CAMERA,
  setCamera: (cam) => set(state => ({ camera: { ...state.camera, ...cam } })),
  setStandardView: (view) => set({ camera: STANDARD_VIEW_CAMERAS[view] }),
  resetCamera: () => set({ camera: DEFAULT_CAMERA }),

  tool: 'select' as ToolMode,
  setTool: (tool) => set({ tool }),

  viewMode: 'solid' as ViewMode,
  setViewMode: (mode) => set({ viewMode: mode }),
  projection: 'perspective' as ProjectionMode,
  setProjection: (mode) => set({ projection: mode }),
  shadingMode: 'smooth' as ShadingMode,
  setShadingMode: (mode) => set({ shadingMode: mode }),

  gridVisible: true,
  toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
  axisVisible: true,
  toggleAxis: () => set(state => ({ axisVisible: !state.axisVisible })),
  originVisible: true,
  toggleOrigin: () => set(state => ({ originVisible: !state.originVisible })),
  showEdges: true,
  toggleEdges: () => set(state => ({ showEdges: !state.showEdges })),

  selectedPartId: null,
  setSelectedPartId: (id) => set({ selectedPartId: id }),
  hoveredPartId: null,
  setHoveredPartId: (id) => set({ hoveredPartId: id }),

  isPanning: false,
  setIsPanning: (v) => set({ isPanning: v }),
  isRotating: false,
  setIsRotating: (v) => set({ isRotating: v }),
  zoom: 1,
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(10, z)) }),
  panOffset: { x: 0, y: 0 },
  setPanOffset: (offset) => set({ panOffset: offset }),

  snapEnabled: true,
  toggleSnap: () => set(state => ({ snapEnabled: !state.snapEnabled })),
  snapAngle: 15,
  setSnapAngle: (angle) => set({ snapAngle: angle }),
}));
