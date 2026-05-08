// =============================================================================
// DEX Platform — Non-destructive AI assist planning
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Non-destructive AI helper primitives.
 *
 * This module never mutates source documents. It produces patch plans that can
 * be previewed, toggled, and reverted per operation. Intended for "AI as a
 * partner" workflows where users keep full control over complex structures.
 */

export interface StructureRef {
  id: string;
  kind: 'layer' | 'group' | 'node' | 'track' | 'clip' | 'object';
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
}

export interface DocumentStructure {
  refs: StructureRef[];
}

export interface AssistIntent {
  prompt: string;
  scopeIds: string[];
  mode: 'enhance' | 'cleanup' | 'arrange' | 'retime' | 'color-match';
}

export interface AssistChange {
  targetId: string;
  op: 'set-prop' | 'insert-node' | 'add-keyframe' | 'route-link';
  path: string;
  value: unknown;
}

export interface AssistPatch {
  id: string;
  intent: AssistIntent;
  changes: AssistChange[];
  warnings: string[];
  /** The source structure hash this patch was planned against. */
  baseHash: string;
}

function hashStructure(doc: DocumentStructure): string {
  const body = doc.refs
    .map(r => `${r.id}|${r.kind}|${r.parentId ?? ''}|${r.locked ? 1 : 0}|${r.hidden ? 1 : 0}`)
    .sort()
    .join('\n');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Plan a constrained patch only for unlocked/visible scoped refs.
 * Locked or hidden targets are skipped with warnings.
 */
export function planAssistPatch(doc: DocumentStructure, intent: AssistIntent): AssistPatch {
  const byId = new Map(doc.refs.map(r => [r.id, r]));
  const changes: AssistChange[] = [];
  const warnings: string[] = [];

  for (const id of intent.scopeIds) {
    const ref = byId.get(id);
    if (!ref) {
      warnings.push(`missing target: ${id}`);
      continue;
    }
    if (ref.locked) {
      warnings.push(`locked target skipped: ${id}`);
      continue;
    }
    if (ref.hidden) {
      warnings.push(`hidden target skipped: ${id}`);
      continue;
    }

    if (intent.mode === 'cleanup') {
      changes.push({ targetId: id, op: 'set-prop', path: 'noiseReduction', value: 0.15 });
    } else if (intent.mode === 'arrange') {
      changes.push({ targetId: id, op: 'set-prop', path: 'layoutPriority', value: 1 });
    } else if (intent.mode === 'retime') {
      changes.push({ targetId: id, op: 'add-keyframe', path: 'timeWarp', value: { t: 0, k: 1 } });
    } else if (intent.mode === 'color-match') {
      changes.push({ targetId: id, op: 'set-prop', path: 'grade.matchStrength', value: 0.5 });
    } else {
      changes.push({ targetId: id, op: 'set-prop', path: 'enhanceStrength', value: 0.35 });
    }
  }

  return {
    id: `patch-${Date.now().toString(36)}`,
    intent,
    changes,
    warnings,
    baseHash: hashStructure(doc),
  };
}

/**
 * Validate a patch against the current structure before apply.
 * Apply should be blocked if the structure diverged (stale patch).
 */
export function canApplyPatch(patch: AssistPatch, current: DocumentStructure): { ok: boolean; reason?: string } {
  const nowHash = hashStructure(current);
  if (nowHash !== patch.baseHash) {
    return { ok: false, reason: 'structure-changed' };
  }
  return { ok: true };
}
