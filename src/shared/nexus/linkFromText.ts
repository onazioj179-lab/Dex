// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Auto-link Nexus entities from text (note → memory graph). Scans note/text
 * content for [[wiki-links]] and @mentions that match existing entity labels and
 * creates relations from the source entity to each match. Integration layer
 * composing `mentions` + the `NexusModel`. Pure: no DOM, no IO.
 */

import type { NexusModel, NexusEntity, NexusEntityKind } from './model';
import { extractWikiLinks, extractMentions } from '../uki/mentions';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

/** Build a label → entity lookup (lowercased; first match wins). */
function labelIndex(model: NexusModel): Map<string, NexusEntity> {
  const index = new Map<string, NexusEntity>();
  for (const k of ALL_KINDS) {
    for (const e of model.byKind(k)) {
      const key = e.label.toLowerCase();
      if (!index.has(key)) index.set(key, e);
    }
  }
  return index;
}

export interface LinkResult {
  linked: string[]; // ids that were linked to
  unresolved: string[]; // references with no matching entity
}

/**
 * Create relations from `sourceId` to every existing entity referenced (by
 * [[wiki-link]] or @mention) in `text`. Returns the linked and unresolved refs.
 * Mutates the model (adds relations) — the one effectful op, kept explicit.
 */
export function linkFromText(model: NexusModel, sourceId: string, text: string, relationKind = 'mentions'): LinkResult {
  const result: LinkResult = { linked: [], unresolved: [] };
  if (!model.hasEntity(sourceId)) return result;

  const index = labelIndex(model);
  const refs = [...extractWikiLinks(text), ...extractMentions(text)];
  const seen = new Set<string>();

  for (const ref of refs) {
    const target = index.get(ref.toLowerCase());
    if (target && target.id !== sourceId && !seen.has(target.id)) {
      seen.add(target.id);
      model.link(sourceId, target.id, relationKind);
      result.linked.push(target.id);
    } else if (!target) {
      result.unresolved.push(ref);
    }
  }
  return result;
}
