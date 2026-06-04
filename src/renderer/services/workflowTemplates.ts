// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workflow Templates / Continuity Engine
 * -----------------------------------------------------------------------------
 * A workflow template is a named workspace recipe — "Design", "Music",
 * "Research", "Development", "Study", "Writing" — declaring which apps to open
 * and a thematic accent. `instantiateWorkflow()` turns a template into a fresh
 * `.dexproject` manifest pre-loaded with a starter `WorkspaceSnapshot` (apps
 * tiled into a grid layout), so opening it restores the full layout + apps in
 * one click. This is the data half of the roadmap's "Workspace Continuity
 * Engine" + "Workflow Templates"; the shell turns the snapshot into live
 * windows via its window registry.
 *
 * App ids are the canonical ids from store/runningApps.ts (e.g. VINX = the
 * 'videoeditor' id; DexCode ships an integrated terminal, so there is no
 * separate terminal app). Pure data + helpers — no DOM, no IO.
 */

import { createDexProject, setProjectWorkspace, type DexProjectManifest } from './DexProject';
import type { WorkspaceSnapshot, WindowPlacement } from '../../shared/phase15/workspaceSnapshot';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /** Canonical app ids to open, in priority order (first = primary/focused). */
  apps: readonly string[];
  /** Tags applied to the new project. */
  tags: readonly string[];
  /** Thematic accent hint (hex) for the workspace. */
  accent: string;
}

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'design',
    name: 'Design Workspace',
    description: 'Visual design with image editing, asset files, and reference.',
    apps: ['prism', 'files', 'browser'],
    tags: ['design'],
    accent: '#BF5AF2',
  },
  {
    id: 'music',
    name: 'Music Workspace',
    description: 'Music production with the audio workstation, files, and notes.',
    apps: ['imosion', 'files', 'notes'],
    tags: ['music'],
    accent: '#FF6B35',
  },
  {
    id: 'research',
    name: 'Research Workspace',
    description: 'Research with the browser, notes, and the knowledge graph.',
    apps: ['browser', 'notes', 'nexus'],
    tags: ['research'],
    accent: '#4A9EFF',
  },
  {
    id: 'development',
    name: 'Development Workspace',
    description: 'Coding with the editor (integrated terminal), browser, and files.',
    apps: ['dexcode', 'browser', 'files'],
    tags: ['dev'],
    accent: '#30D158',
  },
  {
    id: 'study',
    name: 'Study Workspace',
    description: 'Focused study with notes, the PDF reader, and the browser.',
    apps: ['notes', 'pdfviewer', 'browser'],
    tags: ['study'],
    accent: '#FF9F0A',
  },
  {
    id: 'writing',
    name: 'Writing Workspace',
    description: 'Distraction-light writing with notes and reference.',
    apps: ['notes', 'browser'],
    tags: ['writing'],
    accent: '#FFD60A',
  },
];

/** Look up a template by id (case-insensitive). */
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  const k = id.toLowerCase();
  return WORKFLOW_TEMPLATES.find((t) => t.id === k);
}

export interface ViewportSize {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT: ViewportSize = { width: 1920, height: 1080 };
const GAP = 16;

/**
 * Tile N apps into a deterministic grid of window placements. Uses an
 * (almost) square grid so 2 apps split side-by-side, 3–4 fill a 2×2, etc.
 */
export function tileApps(
  apps: readonly string[],
  viewport: ViewportSize = DEFAULT_VIEWPORT,
  now: number = Date.now(),
): WindowPlacement[] {
  const n = apps.length;
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(320, Math.floor((viewport.width - GAP * (cols + 1)) / cols));
  const cellH = Math.max(240, Math.floor((viewport.height - GAP * (rows + 1)) / rows));
  return apps.map((appId, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: `${appId}_${now.toString(36)}_${i}`,
      appId,
      x: GAP + col * (cellW + GAP),
      y: GAP + row * (cellH + GAP),
      width: cellW,
      height: cellH,
      minimized: false,
      maximized: false,
      z: i + 1,
    };
  });
}

/** Build a starter workspace snapshot for a template's apps. */
export function buildWorkflowSnapshot(
  template: WorkflowTemplate,
  viewport?: ViewportSize,
  now: number = Date.now(),
): WorkspaceSnapshot {
  const windows = tileApps(template.apps, viewport, now);
  return {
    version: 1,
    label: template.name,
    createdAt: now,
    focusedId: windows[0]?.id ?? null,
    windows,
  };
}

/**
 * Instantiate a new project from a workflow template, pre-loaded with a
 * starter workspace (apps + tiled layout) ready to restore in one click.
 * Returns null for an unknown template id.
 */
export function instantiateWorkflow(
  templateId: string,
  name?: string,
  viewport?: ViewportSize,
): DexProjectManifest | null {
  const template = getWorkflowTemplate(templateId);
  if (!template) return null;
  const now = Date.now();
  const project = createDexProject({
    name: name?.trim() || template.name,
    appId: template.apps[0],
    palette: { colors: [template.accent.toLowerCase()] },
    tags: [...template.tags],
  });
  const snapshot = buildWorkflowSnapshot(template, viewport, now);
  return setProjectWorkspace(project, snapshot);
}
