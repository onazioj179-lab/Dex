// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { ingestEvent, ingestEvents, entityId } from '../../src/shared/nexus/ingest';

describe('Nexus live ingest', () => {
  it('upserts an entity and links it under its parent project', () => {
    const m = new NexusModel();
    const id = ingestEvent(m, {
      kind: 'file', ref: 'src/main.rs', ts: 100,
      parent: { kind: 'project', ref: 'DEX', label: 'DEX' },
    });
    expect(id).toBe(entityId('file', 'src/main.rs'));
    expect(m.hasEntity(id)).toBe(true);

    const projectId = entityId('project', 'DEX');
    expect(m.hasEntity(projectId)).toBe(true);
    // project -> contains -> file
    const related = m.relatedTo(projectId).map((e) => e.id);
    expect(related).toContain(id);
  });

  it('converges on repeated events (deterministic id, forward ts)', () => {
    const m = new NexusModel();
    ingestEvent(m, { kind: 'project', ref: 'DEX', label: 'DEX', ts: 1 });
    ingestEvent(m, { kind: 'project', ref: 'DEX', label: 'DEX v6', ts: 5 });
    expect(m.entityCount()).toBe(1);
    const e = m.getEntity(entityId('project', 'DEX'))!;
    expect(e.label).toBe('DEX v6');
    expect(e.ts).toBe(5);
  });

  it('infers co-occurrence between concurrently-open entities', () => {
    const m = new NexusModel();
    ingestEvent(m, {
      kind: 'file', ref: 'a.ts', ts: 10,
      coOccurWith: [{ kind: 'file', ref: 'b.ts' }, { kind: 'idea', ref: 'todo' }],
    });
    const aId = entityId('file', 'a.ts');
    const bId = entityId('file', 'b.ts');
    expect(m.hasEntity(bId)).toBe(true);
    expect(m.relatedTo(aId).map((e) => e.id)).toContain(bId);
  });

  it('applies a batch of events in order', () => {
    const m = new NexusModel();
    ingestEvents(m, [
      { kind: 'project', ref: 'P', ts: 1 },
      { kind: 'file', ref: 'f1', ts: 2, parent: { kind: 'project', ref: 'P' } },
      { kind: 'file', ref: 'f2', ts: 3, parent: { kind: 'project', ref: 'P' } },
    ]);
    expect(m.entityCount()).toBe(3);
    expect(m.byKind('file').length).toBe(2);
  });
});
