// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX 5.6 — Project Spaces + UKI workspace awareness.
// Covers the semantic `kind` elevation of a Stage and the end-to-end wiring that
// makes the active Project Space visible to UKI (the reserved workspaceId field
// and the system-prompt context).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  STAGE_KIND_META,
  STAGE_KINDS,
  migrateStagePersist,
  useStageStore,
  type StageKind,
} from '../../src/renderer/store/stageStore';
import { bindStageStore, getActiveWorkspace, liveContext } from '../../src/renderer/uki/context';
import { buildSystemPrompt } from '../../src/renderer/uki/identity';
import { ContextBus } from '../../src/renderer/services/ContextBus';
import { openWorkflowSpace, templateKind } from '../../src/renderer/services/projectSpaces';
import { WORKFLOW_TEMPLATES } from '../../src/renderer/services/workflowTemplates';
import { suggestWorkflows } from '../../src/renderer/uki/operator';
import { recordStageActivity, spaceAt } from '../../src/renderer/store/stageActivityLog';

describe('STAGE_KIND_META', () => {
  it('describes every kind with label, accent, and a UKI hint', () => {
    expect(STAGE_KINDS.length).toBeGreaterThanOrEqual(7);
    for (const kind of STAGE_KINDS) {
      const meta = STAGE_KIND_META[kind];
      expect(meta).toBeTruthy();
      expect(meta.label).toBeTruthy();
      expect(meta.accent).toBeTruthy();
      expect(meta.hint).toBeTruthy();
    }
  });

  it('includes the neutral default plus the creative/dev/research kinds', () => {
    expect(STAGE_KINDS).toEqual(
      expect.arrayContaining(['general', 'development', 'design', 'audio', 'video', 'research', 'personal'])
    );
  });
});

describe('migrateStagePersist', () => {
  it('defaults a missing kind to general and preserves an explicit one', () => {
    const migrated = migrateStagePersist({
      activeStageId: 'a',
      stages: [
        { id: 'a', name: 'Old', posture: 'work' },               // pre-5.6: no kind
        { id: 'b', name: 'Studio', posture: 'edit', kind: 'design' },
      ],
    }) as { stages: Array<{ kind?: string }> };
    expect(migrated.stages[0].kind).toBe('general');
    expect(migrated.stages[1].kind).toBe('design');
  });

  it('is a no-op on shapes without a stages array', () => {
    expect(migrateStagePersist(null)).toBeNull();
    expect(migrateStagePersist({ foo: 1 })).toEqual({ foo: 1 });
  });
});

describe('getActiveWorkspace (UKI awareness)', () => {
  function fakeStore(activeStageId: string, stages: Array<{ id: string; name: string; kind?: string }>) {
    bindStageStore({ getState: () => ({ activeStageId, stages }) });
  }

  beforeEach(() => {
    // Reset to a known store before each case.
    bindStageStore({ getState: () => ({ activeStageId: undefined, stages: [] }) });
  });

  it('returns the active stage as a named, kind-tagged workspace', () => {
    fakeStore('s2', [
      { id: 's1', name: 'Inbox', kind: 'personal' },
      { id: 's2', name: 'DEX Core', kind: 'development' },
    ]);
    expect(getActiveWorkspace()).toEqual({ id: 's2', name: 'DEX Core', kind: 'development' });
  });

  it('defaults a missing kind to general', () => {
    fakeStore('s1', [{ id: 's1', name: 'Scratch' }]);
    expect(getActiveWorkspace()).toEqual({ id: 's1', name: 'Scratch', kind: 'general' });
  });

  it('returns undefined when the active id matches no stage', () => {
    fakeStore('ghost', [{ id: 's1', name: 'Scratch', kind: 'general' }]);
    expect(getActiveWorkspace()).toBeUndefined();
  });

  it('flows into liveContext so prompt builders can read it', () => {
    fakeStore('s1', [{ id: 's1', name: 'Mix Session', kind: 'audio' }]);
    expect(liveContext().activeWorkspace).toEqual({ id: 's1', name: 'Mix Session', kind: 'audio' });
  });
});

describe('Stage layout capture (Project Space persistence)', () => {
  it('captureWindows stores window geometry the switch restores from', () => {
    const api = useStageStore.getState();
    const id = api.createStage({ name: 'Layout Test', kind: 'development' });
    api.captureWindows(id, [
      { appId: 'files', x: 10, y: 20, width: 800, height: 600, z: 1 },
      { appId: 'notes', x: 820, y: 20, width: 400, height: 600, z: 2, minimized: true },
    ], 'files');
    const stage = useStageStore.getState().getStage(id);
    expect(stage?.windows).toHaveLength(2);
    expect(stage?.windows[0]).toMatchObject({ appId: 'files', x: 10, width: 800 });
    expect(stage?.windows[1].minimized).toBe(true);
    expect(stage?.focusedAppId).toBe('files');
    useStageStore.getState().deleteStage(id);
  });

  it('setActiveStage announces the switch with both stage ids (drives restore)', () => {
    ContextBus._setThrottle(0);
    const api = useStageStore.getState();
    const id = api.createStage({ name: 'Switch Test' });
    const events: Array<{ stageId: string; previousStageId?: string }> = [];
    const off = ContextBus.on('continuity:stage', (p) => events.push(p));
    const prev = useStageStore.getState().activeStageId;
    api.setActiveStage(id);
    off();
    expect(events.at(-1)).toEqual({ stageId: id, previousStageId: prev });
    useStageStore.getState().setActiveStage(prev);
    useStageStore.getState().deleteStage(id);
  });
});

describe('openWorkflowSpace (workflow template -> Project Space)', () => {
  const byId = (id: string) => WORKFLOW_TEMPLATES.find((t) => t.id === id)!;

  it('maps template tags onto a Project Space kind', () => {
    expect(templateKind(byId('development'))).toBe('development');
    expect(templateKind(byId('music'))).toBe('audio');
    expect(templateKind(byId('design'))).toBe('design');
    expect(templateKind(byId('research'))).toBe('research');
  });

  it('opens a workflow as an active, kind-tagged space pre-loaded with its tiled windows', () => {
    const ok = openWorkflowSpace('development');
    expect(ok).toBe(true);
    const st = useStageStore.getState();
    const active = st.stages.find((s) => s.id === st.activeStageId);
    expect(active?.kind).toBe('development');
    expect(active?.windows.length).toBeGreaterThan(0);
    expect(active?.windows.map((w) => w.appId)).toContain('dexcode');
    // every carried window has restorable geometry
    expect(active?.windows.every((w) => typeof w.width === 'number' && typeof w.x === 'number')).toBe(true);
    // cleanup
    st.setActiveStage('stage-default');
    st.deleteStage(active!.id);
  });

  it('returns false for an unknown template', () => {
    expect(openWorkflowSpace('does-not-exist')).toBe(false);
  });
});

describe('suggestWorkflows (workspace-aware, UKI)', () => {
  it('biases suggestions toward the active space kind even with no open apps', () => {
    const dev = suggestWorkflows([], 3, 'development');
    expect(dev[0].id).toBe('development');
    const design = suggestWorkflows([], 3, 'design');
    expect(design[0].id).toBe('design');
    const audio = suggestWorkflows([], 3, 'audio');
    expect(audio[0].id).toBe('music');
  });

  it('still ranks open apps, and the space kind breaks ties upward', () => {
    // 'research' workspace + browser open: research (tag match +2, browser +1) leads.
    const out = suggestWorkflows(['browser'], 3, 'research');
    expect(out[0].id).toBe('research');
  });

  it('falls back to the default head with no signal at all', () => {
    expect(suggestWorkflows([], 3).length).toBe(3);
    // an unmapped kind (general) contributes no bias
    expect(suggestWorkflows([], 3, 'general').length).toBe(3);
  });
});

describe('stageActivityLog (Rewind attribution)', () => {
  it('attributes a timestamp to the space active at that moment', () => {
    recordStageActivity({ stageId: 'sa', name: 'Alpha', kind: 'development', ts: 1000 });
    recordStageActivity({ stageId: 'sb', name: 'Beta', kind: 'design', ts: 2000 });
    expect(spaceAt(1500)?.stageId).toBe('sa');   // between alpha and beta
    expect(spaceAt(2500)?.name).toBe('Beta');    // after beta
    expect(spaceAt(2500)?.kind).toBe('design');
  });

  it('ignores consecutive repeats of the same space', () => {
    recordStageActivity({ stageId: 'rep', name: 'Rep', kind: 'general', ts: 3000 });
    recordStageActivity({ stageId: 'rep', name: 'Rep', kind: 'general', ts: 3100 });
    // the second (repeat) was a no-op, so the transition timestamp stays 3000
    expect(spaceAt(3200)?.stageId).toBe('rep');
    expect(spaceAt(3050)?.stageId).toBe('rep');
  });

  it('returns undefined before the log has any coverage', () => {
    expect(spaceAt(-1)).toBeUndefined();
  });
});

describe('buildSystemPrompt workspace grounding', () => {
  it('folds the active workspace into the context line', () => {
    const prompt = buildSystemPrompt({ activeWorkspace: { name: 'Album Art', kind: 'design' } });
    expect(prompt).toContain('workspace=Album Art(design)');
  });

  it('omits the workspace bit when none is active', () => {
    expect(buildSystemPrompt({})).not.toContain('workspace=');
  });
});
