// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

export interface ViewportSize {
  width: number;
  height: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorkspaceOptions {
  topReserve?: number;
  dockReserve?: number;
  leftReserve?: number;
  rightReserve?: number;
  padding?: number;
  minWidth?: number;
  minHeight?: number;
}

export function getWorkspaceBounds(viewport: ViewportSize, options: WorkspaceOptions = {}): WindowBounds {
  const padding = Math.max(0, Math.floor(options.padding ?? 0));
  const topReserve = Math.max(0, Math.floor(options.topReserve ?? 0));
  const dockReserve = Math.max(0, Math.floor(options.dockReserve ?? 0));
  const leftReserve = Math.max(0, Math.floor(options.leftReserve ?? 0));
  const rightReserve = Math.max(0, Math.floor(options.rightReserve ?? 0));
  const minWidth = Math.max(1, Math.floor(options.minWidth ?? 320));
  const minHeight = Math.max(1, Math.floor(options.minHeight ?? 220));

  const x = leftReserve + padding;
  const y = topReserve + padding;
  const rawWidth = Math.floor(viewport.width - leftReserve - rightReserve - padding * 2);
  const rawHeight = Math.floor(viewport.height - topReserve - dockReserve - padding * 2);

  return {
    x,
    y,
    w: Math.max(minWidth, rawWidth),
    h: Math.max(minHeight, rawHeight),
  };
}

export function fitWindowToWorkspace(
  preferred: { w: number; h: number },
  workspace: WindowBounds,
  cascade = 0,
): WindowBounds {
  const w = Math.min(Math.max(260, Math.floor(preferred.w)), workspace.w);
  const h = Math.min(Math.max(220, Math.floor(preferred.h)), workspace.h);
  const centered: WindowBounds = {
    x: workspace.x + Math.round((workspace.w - w) / 2) + cascade,
    y: workspace.y + Math.round((workspace.h - h) / 2) + cascade,
    w,
    h,
  };
  return clampWindowToWorkspace(centered, workspace);
}

export function clampWindowToWorkspace(bounds: WindowBounds, workspace: WindowBounds): WindowBounds {
  const w = Math.min(Math.max(260, Math.floor(bounds.w)), workspace.w);
  const h = Math.min(Math.max(220, Math.floor(bounds.h)), workspace.h);
  const maxX = workspace.x + workspace.w - w;
  const maxY = workspace.y + workspace.h - h;
  return {
    x: Math.max(workspace.x, Math.min(Math.floor(bounds.x), maxX)),
    y: Math.max(workspace.y, Math.min(Math.floor(bounds.y), maxY)),
    w,
    h,
  };
}

export function isSameWindowBounds(a: WindowBounds, b: WindowBounds, tolerance = 0): boolean {
  return Math.abs(a.x - b.x) <= tolerance
    && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.w - b.w) <= tolerance
    && Math.abs(a.h - b.h) <= tolerance;
}