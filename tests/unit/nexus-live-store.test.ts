// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import ContextBus from '../../src/renderer/services/ContextBus';
import {
  installNexusIngest, getNexusModel, onNexusChange, _resetNexusLive,
} from '../../src/renderer/services/nexus/nexusLiveStore';
import { entityId } from '../../src/shared/nexus/ingest';

beforeEach(() => {
  ContextBus._reset();
  ContextBus._setThrottle(0); // disable per-frame coalescing for deterministic tests
  _resetNexusLive();
});

describe('Nexus live store (#502 ContextBus wiring)', () => {
  it('ingests live ContextBus activity into the shared model', () => {
    let changes = 0;
    onNexusChange(() => { changes += 1; });
    installNexusIngest();

    ContextBus.emit('continuity:project', { projectId: 'DEX', source: 'test' });
    ContextBus.emit('file:opened', { appId: 'forge', path: 'C:/dex/src/main.rs' });

    const m = getNexusModel();
    expect(m.hasEntity(entityId('project', 'DEX'))).toBe(true);
    expect(m.hasEntity(entityId('file', 'C:/dex/src/main.rs'))).toBe(true);
    expect(m.getEntity(entityId('file', 'C:/dex/src/main.rs'))!.label).toBe('main.rs');
    // file is linked under the active project
    expect(m.relatedTo(entityId('project', 'DEX')).map((e) => e.id))
      .toContain(entityId('file', 'C:/dex/src/main.rs'));
    expect(changes).toBeGreaterThanOrEqual(2);
  });

  it('back-fills from the ContextBus replay ring on install', () => {
    ContextBus.emit('app:opened', { appId: 'nexus', ts: 1 }); // before install
    installNexusIngest();
    expect(getNexusModel().hasEntity(entityId('session', 'app:nexus'))).toBe(true);
  });

  it('stops ingesting after uninstall', () => {
    const off = installNexusIngest();
    off();
    ContextBus.emit('continuity:project', { projectId: 'P2', source: 'test' });
    expect(getNexusModel().hasEntity(entityId('project', 'P2'))).toBe(false);
  });
});
