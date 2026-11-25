// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { collectTriangles, stlText, objText, indexMesh, threeMfBytes } from '../../src/renderer/DEXAPPLICATIONS/axl/utils/export';
import type { AXLProject } from '../../src/renderer/DEXAPPLICATIONS/axl/types';

function project(parts: Array<{ prim: string; params: Record<string, number>; x?: number }>): AXLProject {
  return {
    name: 'Bracket',
    assembly: {
      parts: parts.map((p, i) => ({
        id: `p${i}`, name: `Part ${i + 1}`, visible: true,
        transform: { position: { x: p.x ?? 0, y: 0, z: 0 } },
        features: [{ params: { primitiveType: p.prim, ...p.params } }],
      })),
    },
  } as unknown as AXLProject;
}

describe('AXL mesh exports', () => {
  const box = project([{ prim: 'box', params: { width: 20, height: 10, depth: 4 }, x: 100 }]);

  it('tessellates a box into 12 triangles at the part position', () => {
    const t = collectTriangles(box);
    expect(t).toHaveLength(12);
    const xs = t.flatMap((x) => [x.a.x, x.b.x, x.c.x]);
    expect(Math.min(...xs)).toBe(90);
    expect(Math.max(...xs)).toBe(110);
  });

  it('writes the same triangles as STL', () => {
    const s = stlText(collectTriangles(box));
    expect(s.startsWith('solid AXL_Export')).toBe(true);
    expect(s.match(/facet normal/g)).toHaveLength(12);
  });

  it('welds shared corners: a box has 8 vertices, not 36', () => {
    const m = indexMesh(collectTriangles(box));
    expect(m.vertices).toHaveLength(8);
    expect(m.faces).toHaveLength(12);
    const obj = objText(collectTriangles(box), 'Bracket');
    expect(obj.match(/^v /gm)).toHaveLength(8);
    expect(obj.match(/^f /gm)).toHaveLength(12);
    expect(obj).toContain('g Part_1');
  });

  it('drops degenerate cone-tip triangles', () => {
    const cone = indexMesh(collectTriangles(project([{ prim: 'cone', params: { radius: 10, height: 20 } }])));
    for (const [a, b, c] of cone.faces) expect(new Set([a, b, c]).size).toBe(3);
  });

  it('packs a valid 3MF (ZIP with the model in millimetres)', () => {
    const bytes = threeMfBytes(collectTriangles(box), 'Bracket');
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('3D/3dmodel.model');
    expect(text).toContain('unit="millimeter"');
    expect(text.match(/<vertex /g)).toHaveLength(8);
    expect(text.match(/<triangle /g)).toHaveLength(12);
    const model = text.slice(text.indexOf('<?xml version="1.0" encoding="UTF-8"?><model'), text.indexOf('</model>') + 8);
    expect(new DOMParser().parseFromString(model, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });
});
