// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus model (de)serialization (export/import, persistence, sync). Converts a
 * `NexusModel` to a plain JSON-safe object and back, using only the model's
 * public API. Pure: no DOM, no IO.
 */

import { NexusModel, type NexusEntity, type NexusEntityKind, type NexusRelation } from './model';

const ALL_KINDS: NexusEntityKind[] =
  ['project', 'idea', 'person', 'file', 'asset', 'session', 'research', 'conversation'];

export interface SerializedModel {
  version: 1;
  entities: NexusEntity[];
  relations: NexusRelation[];
}

/** Serialize a model to a plain object. */
export function serializeModel(model: NexusModel): SerializedModel {
  const entities: NexusEntity[] = [];
  const relations: NexusRelation[] = [];
  for (const kind of ALL_KINDS) {
    for (const e of model.byKind(kind)) {
      entities.push(e);
      for (const rel of model.relationsFrom(e.id)) relations.push(rel);
    }
  }
  return { version: 1, entities, relations };
}

/** Rebuild a model from serialized data (tolerant of missing fields). */
export function deserializeModel(data: SerializedModel): NexusModel {
  const model = new NexusModel();
  for (const e of data.entities ?? []) {
    if (e && typeof e.id === 'string') model.upsertEntity(e);
  }
  for (const r of data.relations ?? []) {
    if (r && typeof r.from === 'string' && typeof r.to === 'string') {
      model.link(r.from, r.to, r.kind ?? 'related', r.weight ?? 1);
    }
  }
  return model;
}

/** JSON string round-trip helpers. */
export function toJSON(model: NexusModel): string {
  return JSON.stringify(serializeModel(model));
}

export function fromJSON(json: string): NexusModel {
  return deserializeModel(JSON.parse(json) as SerializedModel);
}
