// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus live ingestion (ROADMAP-600 §2.P #502). Pure mapper from normalized
 * ContextBus-derived events to NexusModel mutations, so the memory graph fills
 * up *live* as you work instead of staying a static Canvas2D demo.
 *
 * The renderer adapter subscribes to ContextBus (file opened, project switched,
 * note created, app launched…), normalizes each into an `IngestEvent`, and calls
 * `ingestEvent` against a shared model instance. This file stays pure (no DOM /
 * IO / timers) and is therefore unit-testable.
 */

// DEX v6.0 — Nexus live ingest

import { NexusModel, type NexusEntityKind } from './model';

export interface IngestParent {
  kind: NexusEntityKind;
  ref: string;
  label?: string;
}

export interface IngestEvent {
  /** Entity kind (aligned with memory views). */
  kind: NexusEntityKind;
  /** Stable reference: path, id, or name. Combined with kind to form the id. */
  ref: string;
  /** Display label (defaults to `ref`). */
  label?: string;
  /** Event time, epoch ms. */
  ts: number;
  tags?: string[];
  /** Parent that "contains" this entity (e.g. project → file). */
  parent?: IngestParent;
  /** Other entities present at the same time → symmetric co-occurrence links. */
  coOccurWith?: ReadonlyArray<{ kind: NexusEntityKind; ref: string }>;
}

/** Deterministic entity id from (kind, ref) so repeated events converge. */
export function entityId(kind: NexusEntityKind, ref: string): string {
  return `${kind}:${ref}`;
}

/**
 * Apply one event to the model. Upserts the entity (and parent), adds a
 * contains/in relation to the parent, and infers co-occurrence with any
 * concurrent entities. Returns the entity id.
 */
export function ingestEvent(model: NexusModel, ev: IngestEvent): string {
  const id = entityId(ev.kind, ev.ref);
  model.upsertEntity({ id, kind: ev.kind, label: ev.label ?? ev.ref, ts: ev.ts, tags: ev.tags });

  if (ev.parent) {
    const pid = entityId(ev.parent.kind, ev.parent.ref);
    model.upsertEntity({ id: pid, kind: ev.parent.kind, label: ev.parent.label ?? ev.parent.ref, ts: ev.ts });
    model.link(pid, id, 'contains', 1);
    model.link(id, pid, 'in', 1);
  }

  if (ev.coOccurWith && ev.coOccurWith.length > 0) {
    for (const c of ev.coOccurWith) {
      const cid = entityId(c.kind, c.ref);
      if (!model.hasEntity(cid)) {
        model.upsertEntity({ id: cid, kind: c.kind, label: c.ref, ts: ev.ts });
      }
    }
    const ids = [id, ...ev.coOccurWith.map((c) => entityId(c.kind, c.ref))];
    model.inferCoOccurrence(ids, 1);
  }

  return id;
}

/** Apply a batch of events in order. */
export function ingestEvents(model: NexusModel, events: readonly IngestEvent[]): void {
  for (const ev of events) ingestEvent(model, ev);
}
