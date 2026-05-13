// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 3 - Desktop Workflow + Multitasking core primitives.
 *
 * Canonical window/workspace lifecycle store and a small library of tiling
 * presets. Existing shell code (StageManager, FloatingWindow, depth manager)
 * registers windows with this store as it migrates.
 */

export interface WindowSnapshot {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
  readonly minimized: boolean;
  readonly focused: boolean;
}

export interface WorkspaceSnapshot {
  readonly id: string;
  readonly name: string;
  readonly displayId?: string;
}

export interface LifecycleSnapshot {
  readonly workspaces: WorkspaceSnapshot[];
  readonly windows: WindowSnapshot[];
  readonly activeWorkspaceId: string | null;
  readonly takenAt: number;
}

export type LifecycleEvent =
  | { readonly type: 'workspace-created'; readonly workspace: WorkspaceSnapshot }
  | { readonly type: 'workspace-removed'; readonly workspaceId: string }
  | { readonly type: 'workspace-activated'; readonly workspaceId: string }
  | { readonly type: 'window-created'; readonly window: WindowSnapshot }
  | { readonly type: 'window-removed'; readonly windowId: string }
  | { readonly type: 'window-changed'; readonly window: WindowSnapshot };

export type LifecycleListener = (event: LifecycleEvent) => void;

/**
 * In-memory canonical store. Single source of truth for window + workspace
 * shape. Subscribers receive every mutation event.
 */
export class WindowLifecycleStore {
  private readonly workspaces = new Map<string, WorkspaceSnapshot>();
  private readonly windows = new Map<string, WindowSnapshot>();
  private active: string | null = null;
  private nextZ = 1;
  private readonly listeners = new Set<LifecycleListener>();

  subscribe(listener: LifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  createWorkspace(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
    if (this.workspaces.has(workspace.id)) throw new Error(`workspace ${workspace.id} already exists`);
    this.workspaces.set(workspace.id, workspace);
    if (this.active === null) this.active = workspace.id;
    this.emit({ type: 'workspace-created', workspace });
    return workspace;
  }

  removeWorkspace(workspaceId: string): void {
    if (!this.workspaces.has(workspaceId)) return;
    for (const [id, w] of this.windows) {
      if (w.workspaceId === workspaceId) {
        this.windows.delete(id);
        this.emit({ type: 'window-removed', windowId: id });
      }
    }
    this.workspaces.delete(workspaceId);
    if (this.active === workspaceId) {
      this.active = this.workspaces.keys().next().value ?? null;
    }
    this.emit({ type: 'workspace-removed', workspaceId });
  }

  activateWorkspace(workspaceId: string): void {
    if (!this.workspaces.has(workspaceId)) throw new Error(`unknown workspace ${workspaceId}`);
    this.active = workspaceId;
    this.emit({ type: 'workspace-activated', workspaceId });
  }

  createWindow(input: Omit<WindowSnapshot, 'z' | 'focused' | 'minimized'> & Partial<Pick<WindowSnapshot, 'z' | 'focused' | 'minimized'>>): WindowSnapshot {
    if (this.windows.has(input.id)) throw new Error(`window ${input.id} already exists`);
    if (!this.workspaces.has(input.workspaceId)) throw new Error(`unknown workspace ${input.workspaceId}`);
    const w: WindowSnapshot = {
      z: input.z ?? this.nextZ++,
      focused: input.focused ?? false,
      minimized: input.minimized ?? false,
      ...input,
    };
    this.nextZ = Math.max(this.nextZ, w.z + 1);
    this.windows.set(w.id, w);
    this.emit({ type: 'window-created', window: w });
    return w;
  }

  removeWindow(windowId: string): void {
    if (!this.windows.delete(windowId)) return;
    this.emit({ type: 'window-removed', windowId });
  }

  updateWindow(windowId: string, patch: Partial<Omit<WindowSnapshot, 'id'>>): WindowSnapshot {
    const cur = this.windows.get(windowId);
    if (!cur) throw new Error(`unknown window ${windowId}`);
    const next: WindowSnapshot = { ...cur, ...patch, id: cur.id };
    this.windows.set(windowId, next);
    this.emit({ type: 'window-changed', window: next });
    return next;
  }

  focusWindow(windowId: string): WindowSnapshot {
    const w = this.windows.get(windowId);
    if (!w) throw new Error(`unknown window ${windowId}`);
    for (const [id, other] of this.windows) {
      if (other.focused && id !== windowId) {
        this.windows.set(id, { ...other, focused: false });
        this.emit({ type: 'window-changed', window: this.windows.get(id)! });
      }
    }
    const next: WindowSnapshot = { ...w, focused: true, minimized: false, z: this.nextZ++ };
    this.windows.set(windowId, next);
    this.emit({ type: 'window-changed', window: next });
    return next;
  }

  listWindows(workspaceId?: string): WindowSnapshot[] {
    const all = Array.from(this.windows.values());
    return workspaceId ? all.filter((w) => w.workspaceId === workspaceId) : all;
  }

  listWorkspaces(): WorkspaceSnapshot[] {
    return Array.from(this.workspaces.values());
  }

  activeWorkspaceId(): string | null {
    return this.active;
  }

  snapshot(now: number = Date.now()): LifecycleSnapshot {
    return {
      workspaces: this.listWorkspaces(),
      windows: this.listWindows(),
      activeWorkspaceId: this.active,
      takenAt: now,
    };
  }

  restore(snap: LifecycleSnapshot): void {
    this.workspaces.clear();
    this.windows.clear();
    this.nextZ = 1;
    for (const w of snap.workspaces) this.workspaces.set(w.id, w);
    for (const w of snap.windows) {
      this.windows.set(w.id, w);
      this.nextZ = Math.max(this.nextZ, w.z + 1);
    }
    this.active = snap.activeWorkspaceId;
  }

  private emit(event: LifecycleEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch { /* listener isolation */ }
    }
  }
}

export interface TilingViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TilingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type TilingPreset = 'maximize' | 'splitH' | 'splitV' | 'quad' | 'mainSidebar' | 'thirds';

export function tile(preset: TilingPreset, count: number, viewport: TilingViewport): TilingRect[] {
  if (count <= 0) return [];
  const { x, y, width: w, height: h } = viewport;
  switch (preset) {
    case 'maximize':
      return [{ x, y, width: w, height: h }];
    case 'splitH': {
      const cols = Math.max(1, count);
      const cw = Math.floor(w / cols);
      return Array.from({ length: cols }, (_, i) => ({ x: x + i * cw, y, width: cw, height: h }));
    }
    case 'splitV': {
      const rows = Math.max(1, count);
      const rh = Math.floor(h / rows);
      return Array.from({ length: rows }, (_, i) => ({ x, y: y + i * rh, width: w, height: rh }));
    }
    case 'quad': {
      const cw = Math.floor(w / 2);
      const rh = Math.floor(h / 2);
      const cells = [
        { x, y, width: cw, height: rh },
        { x: x + cw, y, width: cw, height: rh },
        { x, y: y + rh, width: cw, height: rh },
        { x: x + cw, y: y + rh, width: cw, height: rh },
      ];
      return cells.slice(0, Math.min(4, count));
    }
    case 'mainSidebar': {
      if (count === 1) return [{ x, y, width: w, height: h }];
      const mainW = Math.floor(w * 0.66);
      const sideW = w - mainW;
      const sideCount = count - 1;
      const sideH = Math.floor(h / sideCount);
      const out: TilingRect[] = [{ x, y, width: mainW, height: h }];
      for (let i = 0; i < sideCount; i++) {
        out.push({ x: x + mainW, y: y + i * sideH, width: sideW, height: sideH });
      }
      return out;
    }
    case 'thirds': {
      const cw = Math.floor(w / 3);
      const cols = Math.min(3, count);
      return Array.from({ length: cols }, (_, i) => ({ x: x + i * cw, y, width: cw, height: h }));
    }
  }
}
