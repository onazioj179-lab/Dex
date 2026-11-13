// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// AXL: a full store must not throw inside an edit and must show "Not saved";
// project files are checked before they replace the open project.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  axlStateStorage, getAxlSaveStatus, __resetAxlSaveStatus, parseAxlProject,
} from '../../src/renderer/DEXAPPLICATIONS/axl/axlPersistence';
import { __resetPersistOrWarn } from '../../src/renderer/utils/persistOrWarn';

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const part = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, features: [{ id: `${id}-f`, type: 'primitive', name: 'box', params: { primitiveType: 'box', width: 1, height: 1, depth: 1 }, visible: true, locked: false }],
  transform: { position: vec(), rotation: vec(), scale: vec(1, 1, 1) },
  material: { id: 'm', name: 'M', color: '#888', density: 1, youngsModulus: 1, tensileStrength: 1, thermalConductivity: 1 },
  meshVertexCount: 8, visible: true, selected: true, color: '#888', ...extra,
});

describe('AXL save status', () => {
  beforeEach(() => { __resetAxlSaveStatus(); __resetPersistOrWarn(); localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('records a successful write', () => {
    axlStateStorage.setItem('axl-project', '{"state":{}}');
    expect(getAxlSaveStatus().ok).toBe(true);
    expect(getAxlSaveStatus().savedAt).toBeTypeOf('number');
    expect(localStorage.getItem('axl-project')).toBe('{"state":{}}');
  });

  it('a full store does not throw, reports Not saved, and recovers on the next good write', () => {
    const toasts: unknown[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);
    window.addEventListener('dex-toast', onToast);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => axlStateStorage.setItem('axl-project', 'x')).not.toThrow();
    expect(() => axlStateStorage.setItem('axl-project', 'y')).not.toThrow();
    expect(getAxlSaveStatus().ok).toBe(false);
    expect(getAxlSaveStatus().error).toMatch(/storage is full/);
    expect(toasts).toHaveLength(1); // one warning per failure streak
    spy.mockRestore();
    axlStateStorage.setItem('axl-project', 'z');
    expect(getAxlSaveStatus().ok).toBe(true);
    window.removeEventListener('dex-toast', onToast);
  });
});

describe('parseAxlProject', () => {
  it('refuses non-JSON, non-projects and an assembly without a parts list', () => {
    expect(parseAxlProject('nope')).toEqual({ ok: false, reason: 'The file is not valid JSON.' });
    expect(parseAxlProject('{"layers":[]}').ok).toBe(false);
    const r = parseAxlProject(JSON.stringify({ name: 'x', assembly: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no parts list/);
  });

  it('drops unreadable parts and constraints to them, and says so', () => {
    const r = parseAxlProject(JSON.stringify({
      name: 'Bracket', units: 'in',
      assembly: {
        parts: [part('a'), part('b'), { id: 'c', features: [], transform: { position: vec(), rotation: vec() } }, 'junk'],
        constraints: [{ id: 'k1', partA: 'a', partB: 'b' }, { id: 'k2', partA: 'a', partB: 'c' }],
      },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.assembly.parts.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r.project.assembly.constraints.map((c) => c.id)).toEqual(['k1']);
    expect(r.project.units).toBe('in');
    expect(r.notes.join(' ')).toMatch(/2 parts could not be read/);
    expect(r.notes.join(' ')).toMatch(/1 constraint referred to a missing part and was left out/);
  });

  it('backfills lists and defaults, clears selection, keeps a missing material drawable', () => {
    const r = parseAxlProject(JSON.stringify({ assembly: { parts: [part('a', { material: undefined, color: undefined })] } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.project;
    expect(p.name).toBe('Imported Project');
    expect(p.units).toBe('mm');
    expect(p.parameters).toEqual([]);
    expect(p.configurations).toEqual([]);
    expect(p.namedViews).toEqual([]);
    expect(p.assembly.parts[0].selected).toBe(false);
    expect(typeof p.assembly.parts[0].material.color).toBe('string');
    expect(p.assembly.parts[0].color).toBe(p.assembly.parts[0].material.color);
  });

  it('refuses a file where no part can be read', () => {
    const r = parseAxlProject(JSON.stringify({ name: 'x', assembly: { parts: [{ id: 1 }, null] } }));
    expect(r).toEqual({ ok: false, reason: 'None of the 2 parts could be read.' });
  });

  it('round-trips what Export JSON writes', () => {
    const exported = { name: 'Rig', units: 'mm', gridSnap: 2, assembly: { id: 'as', name: 'Main', parts: [part('a')], constraints: [], exploded: false, explodeDistance: 50 }, parameters: [{ name: 'w', value: 3 }] };
    const r = parseAxlProject(JSON.stringify(exported));
    expect(r.ok && r.notes).toEqual([]);
    if (r.ok) { expect(r.project.gridSnap).toBe(2); expect(r.project.parameters).toEqual([{ name: 'w', value: 3 }]); }
  });
});
