// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  getWorkflowTemplate,
  tileApps,
  buildWorkflowSnapshot,
  instantiateWorkflow,
} from '../../src/renderer/services/workflowTemplates';
import { isDexProjectManifest, getProjectWorkspace } from '../../src/renderer/services/DexProject';

describe('workflow templates', () => {
  it('exposes the six roadmap workspaces with non-empty app lists', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(['design', 'music', 'research', 'development', 'study', 'writing']);
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.apps.length).toBeGreaterThan(0);
      expect(t.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('looks templates up case-insensitively', () => {
    expect(getWorkflowTemplate('DESIGN')?.id).toBe('design');
    expect(getWorkflowTemplate('nope')).toBeUndefined();
  });

  it('tiles apps into non-overlapping, in-viewport placements', () => {
    const viewport = { width: 1600, height: 900 };
    const windows = tileApps(['a', 'b', 'c'], viewport, 1000);
    expect(windows).toHaveLength(3);
    for (const w of windows) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.width).toBeGreaterThan(0);
      expect(w.height).toBeGreaterThan(0);
      expect(w.minimized).toBe(false);
      expect(w.maximized).toBe(false);
    }
    // ids are unique
    expect(new Set(windows.map((w) => w.id)).size).toBe(3);
  });

  it('returns an empty layout for zero apps', () => {
    expect(tileApps([], { width: 100, height: 100 })).toEqual([]);
  });

  it('builds a snapshot focused on the primary app', () => {
    const tpl = getWorkflowTemplate('development')!;
    const snap = buildWorkflowSnapshot(tpl, { width: 1920, height: 1080 }, 2000);
    expect(snap.version).toBe(1);
    expect(snap.windows).toHaveLength(tpl.apps.length);
    expect(snap.focusedId).toBe(snap.windows[0].id);
    expect(snap.windows[0].appId).toBe('dexcode');
  });

  it('instantiates a valid project manifest carrying the workspace', () => {
    const project = instantiateWorkflow('research', 'My Lit Review');
    expect(project).not.toBeNull();
    expect(isDexProjectManifest(project!)).toBe(true);
    expect(project!.name).toBe('My Lit Review');
    expect(project!.tags).toContain('research');
    const ws = getProjectWorkspace(project!);
    expect(ws).toBeDefined();
    expect(ws!.windows.map((w) => w.appId)).toEqual(['browser', 'notes', 'nexus']);
  });

  it('returns null for an unknown template', () => {
    expect(instantiateWorkflow('imaginary')).toBeNull();
  });
});
