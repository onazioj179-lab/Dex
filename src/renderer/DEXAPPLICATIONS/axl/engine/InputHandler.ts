// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Input Handler -- pointer, keyboard, orbit, pan, zoom, selection
// ═══════════════════════════════════════════════════════════════════════════

import type { AXLProject, Vec3, ToolMode, Measurement } from '../types';
import { vec3 } from '../utils/math';

export interface InputState {
  isDown: boolean;
  button: number;
  lastX: number;
  lastY: number;
  measureStart: Vec3 | null;
}

export interface InputCallbacks {
  onOrbit: (dAzimuth: number, dElevation: number) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (delta: number) => void;
  onSelect: (partId: string | null) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  onMeasure: (measurement: { type: Measurement['type']; points: Vec3[]; value: number }) => void;
  onContextMenu: (x: number, y: number, partId: string | null) => void;
}

export class InputHandler {
  private state: InputState = {
    isDown: false,
    button: 0,
    lastX: 0,
    lastY: 0,
    measureStart: null,
  };

  private canvas: HTMLCanvasElement | null = null;
  private callbacks: InputCallbacks | null = null;
  private tool: ToolMode = 'select';
  private project: AXLProject | null = null;
  private gridSnap = 1;

  attach(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  detach() {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
  }

  setTool(tool: ToolMode) { this.tool = tool; }
  setProject(project: AXLProject) { this.project = project; this.gridSnap = project.gridSnap; }

  private onPointerDown = (e: PointerEvent) => {
    this.state.isDown = true;
    this.state.button = e.button;
    this.state.lastX = e.clientX;
    this.state.lastY = e.clientY;

    // Capture pointer for smooth dragging (touch/pen only to not block clicks)
    if (e.pointerType !== 'mouse') {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    if (this.tool === 'select' && e.button === 0) {
      this.handleSelection(e);
    }

    if (this.tool === 'measure' && e.button === 0) {
      this.handleMeasure(e);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.state.isDown) return;
    const dx = e.clientX - this.state.lastX;
    const dy = e.clientY - this.state.lastY;
    this.state.lastX = e.clientX;
    this.state.lastY = e.clientY;

    // Right-click or middle-click = orbit
    if (this.state.button === 2 || this.state.button === 1) {
      this.callbacks?.onOrbit(dx * 0.5, dy * 0.5);
    }

    // Left-click + move tool = translate selected part
    if (this.state.button === 0 && this.tool === 'move') {
      const snap = this.gridSnap;
      this.callbacks?.onMoveSelected(
        Math.round(dx / snap) * snap,
        Math.round(-dy / snap) * snap,
      );
    }

    // Left-click + rotate tool = orbit instead
    if (this.state.button === 0 && this.tool === 'rotate') {
      this.callbacks?.onOrbit(dx * 0.3, dy * 0.3);
    }
  };

  private onPointerUp = (_e: PointerEvent) => {
    this.state.isDown = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.callbacks?.onZoom(e.deltaY > 0 ? -0.1 : 0.1);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (!this.canvas || !this.project) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = this.hitTest(mx, my);
    this.callbacks?.onContextMenu(e.clientX, e.clientY, hit);
  };

  private handleSelection(e: PointerEvent) {
    if (!this.canvas || !this.project) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = this.hitTest(mx, my);
    this.callbacks?.onSelect(hit);
  }

  private handleMeasure(e: PointerEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    // Center on the CSS-pixel rect (not canvas.width/height, which are in device
    // pixels) so measure points stay correct on HiDPI displays, matching hitTest.
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = -(e.clientY - rect.top - rect.height / 2);

    if (!this.state.measureStart) {
      this.state.measureStart = vec3(mx, my, 0);
    } else {
      const start = this.state.measureStart;
      const end = vec3(mx, my, 0);
      const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      this.callbacks?.onMeasure({ type: 'distance', points: [start, end], value: dist });
      this.state.measureStart = null;
    }
  }

  private hitTest(mx: number, my: number): string | null {
    if (!this.canvas || !this.project) return null;
    // mx/my arrive in CSS pixels (from getBoundingClientRect), so center on the
    // CSS-pixel size rather than canvas.width/height (device pixels) for HiDPI.
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    for (const part of [...this.project.assembly.parts].reverse()) {
      const px = cx + part.transform.position.x;
      const py = cy - part.transform.position.y;
      const hitRadius = 30;
      if (Math.abs(mx - px) < hitRadius && Math.abs(my - py) < hitRadius) {
        return part.id;
      }
    }
    return null;
  }
}
