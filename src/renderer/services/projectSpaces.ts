// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX 5.6 — Workflow → Project Space bridge.
 * -----------------------------------------------------------------------------
 * Unifies three previously-dormant systems into one working feature:
 *   - `workflowTemplates.instantiateWorkflow()` already builds a `.dexproject`
 *     manifest pre-loaded with a tiled `WorkspaceSnapshot` (but was never called).
 *   - `stageStore` Project Spaces now restore window layouts on switch (5.6 b2).
 *   - `DexProject.announceProjectFocus()` emits `continuity:project` (consumed by
 *     the UKI operator + Nexus), but had no producer.
 *
 * `openWorkflowSpace()` turns a workflow template into a live, kind-tagged
 * Project Space: it creates the space pre-loaded with the template's window
 * layout, activates it (the shell's `continuity:stage` handler opens + places the
 * apps), and announces the project so UKI/Nexus become aware of it.
 */

import {
  instantiateWorkflow,
  getWorkflowTemplate,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from './workflowTemplates';
import { announceProjectFocus } from './DexProject';
import { useStageStore, type StageKind, type StageWindowRef } from '../store/stageStore';

/** Map a template's tags onto a semantic Project Space kind. */
const TAG_TO_KIND: Record<string, StageKind> = {
  design: 'design',
  music: 'audio',
  research: 'research',
  dev: 'development',
  study: 'research',
  writing: 'personal',
};

export function templateKind(t: WorkflowTemplate): StageKind {
  for (const tag of t.tags) {
    const k = TAG_TO_KIND[tag];
    if (k) return k;
  }
  return 'general';
}

/**
 * Open a workflow template as a live Project Space. Returns true on success,
 * false for an unknown template id. Reuses the 5.6 stage-switch restore: the new
 * space carries the template's tiled window layout, so activating it opens and
 * places those apps; existing windows that aren't part of the space are closed
 * (through the veto-aware path). UKI/Nexus are told via `continuity:project`.
 */
export function openWorkflowSpace(templateId: string): boolean {
  const t = getWorkflowTemplate(templateId);
  if (!t) return false;

  const viewport = typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : undefined;
  const manifest = instantiateWorkflow(templateId, undefined, viewport);
  if (!manifest) return false;

  // Carry the manifest's WorkspaceSnapshot into the stage as geometry-bearing
  // window refs so the switch restores the full tiled layout.
  const windows: StageWindowRef[] = (manifest.workspace?.windows ?? []).map((w) => ({
    appId: w.appId,
    windowId: w.id,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    z: w.z,
    minimized: w.minimized,
    maximized: w.maximized,
  }));

  const api = useStageStore.getState();
  const id = api.createStage({ name: t.name, kind: templateKind(t), accent: t.accent, windows });
  api.setActiveStage(id);
  // Light up the long-dormant project channel (UKI operator + Nexus consume it).
  announceProjectFocus(manifest, 'workflow-open');
  return true;
}

export { WORKFLOW_TEMPLATES, type WorkflowTemplate };
