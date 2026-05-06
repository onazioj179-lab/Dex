// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Export Utilities -- STL, DXF, PDF, JSON, PNG
// ═══════════════════════════════════════════════════════════════════════════

import type { AXLProject, Vec3, PrimitiveType } from '../types';
import { vec3, calcVolume, calcWeight, formatWeight } from './math';

export function exportProject(project: AXLProject, format: 'stl' | 'dxf' | 'pdf' | 'json' | 'png' | 'gltf', canvas?: HTMLCanvasElement | null) {
  const fileName = project.name.replace(/\s+/g, '_');

  switch (format) {
    case 'png': return exportPNG(canvas, fileName);
    case 'json': return exportJSON(project, fileName);
    case 'stl': return exportSTL(project, fileName);
    case 'dxf': return exportDXF(project, fileName);
    case 'pdf': return exportPDF(project, canvas, fileName);
    case 'gltf': return exportGLTF(project, fileName);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPNG(canvas: HTMLCanvasElement | null | undefined, fileName: string): string {
  if (!canvas) return 'Canvas not available';
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${fileName}.png`;
  a.click();
  return 'Exported as PNG screenshot';
}

function exportJSON(project: AXLProject, fileName: string): string {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  downloadBlob(blob, `${fileName}.json`);
  return 'Exported as JSON project';
}

function exportSTL(project: AXLProject, fileName: string): string {
  const lines: string[] = ['solid AXL_Export'];

  project.assembly.parts.forEach(part => {
    if (!part.visible) return;
    const feat = part.features[0];
    if (!feat) return;
    const params = feat.params;
    const px = part.transform.position.x;
    const py = part.transform.position.y;
    const pz = part.transform.position.z;
    const primType = params.primitiveType as string;

    const addTriangle = (n: Vec3, v1: Vec3, v2: Vec3, v3: Vec3) => {
      lines.push(`  facet normal ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}`);
      lines.push('    outer loop');
      lines.push(`      vertex ${(v1.x + px).toFixed(6)} ${(v1.y + py).toFixed(6)} ${(v1.z + pz).toFixed(6)}`);
      lines.push(`      vertex ${(v2.x + px).toFixed(6)} ${(v2.y + py).toFixed(6)} ${(v2.z + pz).toFixed(6)}`);
      lines.push(`      vertex ${(v3.x + px).toFixed(6)} ${(v3.y + py).toFixed(6)} ${(v3.z + pz).toFixed(6)}`);
      lines.push('    endloop');
      lines.push('  endfacet');
    };

    if (primType === 'box') {
      const w = ((params.width as number) || 50) / 2;
      const h = ((params.height as number) || 50) / 2;
      const d = ((params.depth as number) || 50) / 2;
      addTriangle(vec3(0, 0, 1), vec3(-w, -h, d), vec3(w, -h, d), vec3(w, h, d));
      addTriangle(vec3(0, 0, 1), vec3(-w, -h, d), vec3(w, h, d), vec3(-w, h, d));
      addTriangle(vec3(0, 0, -1), vec3(w, -h, -d), vec3(-w, -h, -d), vec3(-w, h, -d));
      addTriangle(vec3(0, 0, -1), vec3(w, -h, -d), vec3(-w, h, -d), vec3(w, h, -d));
      addTriangle(vec3(0, 1, 0), vec3(-w, h, -d), vec3(-w, h, d), vec3(w, h, d));
      addTriangle(vec3(0, 1, 0), vec3(-w, h, -d), vec3(w, h, d), vec3(w, h, -d));
      addTriangle(vec3(0, -1, 0), vec3(-w, -h, d), vec3(-w, -h, -d), vec3(w, -h, -d));
      addTriangle(vec3(0, -1, 0), vec3(-w, -h, d), vec3(w, -h, -d), vec3(w, -h, d));
      addTriangle(vec3(1, 0, 0), vec3(w, -h, d), vec3(w, -h, -d), vec3(w, h, -d));
      addTriangle(vec3(1, 0, 0), vec3(w, -h, d), vec3(w, h, -d), vec3(w, h, d));
      addTriangle(vec3(-1, 0, 0), vec3(-w, -h, -d), vec3(-w, -h, d), vec3(-w, h, d));
      addTriangle(vec3(-1, 0, 0), vec3(-w, -h, -d), vec3(-w, h, d), vec3(-w, h, -d));
    } else if (primType === 'cylinder' || primType === 'cone') {
      const r = (params.radius as number) || 25;
      const ht = ((params.height as number) || 50) / 2;
      const topR = primType === 'cone' ? 0 : r;
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const c2 = Math.cos(a2), s2 = Math.sin(a2);
        const nx = (c1 + c2) / 2, nz = (s1 + s2) / 2;
        addTriangle(vec3(nx, 0, nz), vec3(r * c1, -ht, r * s1), vec3(r * c2, -ht, r * s2), vec3(topR * c2, ht, topR * s2));
        if (topR > 0) {
          addTriangle(vec3(nx, 0, nz), vec3(r * c1, -ht, r * s1), vec3(topR * c2, ht, topR * s2), vec3(topR * c1, ht, topR * s1));
        }
        addTriangle(vec3(0, -1, 0), vec3(0, -ht, 0), vec3(r * c2, -ht, r * s2), vec3(r * c1, -ht, r * s1));
        if (topR > 0) {
          addTriangle(vec3(0, 1, 0), vec3(0, ht, 0), vec3(topR * c1, ht, topR * s1), vec3(topR * c2, ht, topR * s2));
        }
      }
    } else if (primType === 'sphere') {
      const r = (params.radius as number) || 25;
      const stacks = 8, slices = 16;
      for (let i = 0; i < stacks; i++) {
        const phi1 = (i / stacks) * Math.PI;
        const phi2 = ((i + 1) / stacks) * Math.PI;
        for (let j = 0; j < slices; j++) {
          const theta1 = (j / slices) * Math.PI * 2;
          const theta2 = ((j + 1) / slices) * Math.PI * 2;
          const v1 = vec3(r * Math.sin(phi1) * Math.cos(theta1), r * Math.cos(phi1), r * Math.sin(phi1) * Math.sin(theta1));
          const v2 = vec3(r * Math.sin(phi1) * Math.cos(theta2), r * Math.cos(phi1), r * Math.sin(phi1) * Math.sin(theta2));
          const v3 = vec3(r * Math.sin(phi2) * Math.cos(theta2), r * Math.cos(phi2), r * Math.sin(phi2) * Math.sin(theta2));
          const v4 = vec3(r * Math.sin(phi2) * Math.cos(theta1), r * Math.cos(phi2), r * Math.sin(phi2) * Math.sin(theta1));
          const n = vec3((v1.x + v3.x) / (2 * r), (v1.y + v3.y) / (2 * r), (v1.z + v3.z) / (2 * r));
          addTriangle(n, v1, v2, v3);
          addTriangle(n, v1, v3, v4);
        }
      }
    } else {
      const w = ((params.width as number) || (params.outerRadius as number) || 25);
      const h = ((params.height as number) || 50) / 2;
      addTriangle(vec3(0, 0, 1), vec3(-w, -h, w), vec3(w, -h, w), vec3(w, h, w));
      addTriangle(vec3(0, 0, 1), vec3(-w, -h, w), vec3(w, h, w), vec3(-w, h, w));
      addTriangle(vec3(0, 0, -1), vec3(w, -h, -w), vec3(-w, -h, -w), vec3(-w, h, -w));
      addTriangle(vec3(0, 0, -1), vec3(w, -h, -w), vec3(-w, h, -w), vec3(w, h, -w));
    }
  });

  lines.push('endsolid AXL_Export');
  const blob = new Blob([lines.join('\n')], { type: 'model/stl' });
  downloadBlob(blob, `${fileName}.stl`);
  return `Exported real STL — ${project.assembly.parts.length} parts`;
}

function exportDXF(project: AXLProject, fileName: string): string {
  const dxfLines: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', project.units === 'mm' ? '4' : project.units === 'in' ? '1' : '6',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  project.assembly.parts.forEach(part => {
    if (!part.visible) return;
    const feat = part.features[0];
    if (!feat) return;
    const params = feat.params;
    const px = part.transform.position.x;
    const py = part.transform.position.y;
    const primType = params.primitiveType as string;

    if (primType === 'box' || primType === 'wedge') {
      const w = ((params.width as number) || 50) / 2;
      const h = ((params.height as number) || 50) / 2;
      const corners = [[-w, -h], [w, -h], [w, h], [-w, h]];
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = corners[i];
        const [x2, y2] = corners[(i + 1) % 4];
        dxfLines.push('0', 'LINE', '8', part.name,
          '10', String(px + x1), '20', String(py + y1), '30', '0',
          '11', String(px + x2), '21', String(py + y2), '31', '0');
      }
    } else {
      const r = (params.radius as number) || (params.ringRadius as number) || (params.outerRadius as number) || 25;
      dxfLines.push('0', 'CIRCLE', '8', part.name,
        '10', String(px), '20', String(py), '30', '0',
        '40', String(r));
    }
  });

  dxfLines.push('0', 'ENDSEC', '0', 'EOF');
  const blob = new Blob([dxfLines.join('\n')], { type: 'application/dxf' });
  downloadBlob(blob, `${fileName}.dxf`);
  return `Exported real DXF — ${project.assembly.parts.length} entities`;
}

function exportPDF(project: AXLProject, canvas: HTMLCanvasElement | null | undefined, fileName: string): string {
  if (!canvas) return 'Canvas not available';

  const tw = project.assembly.parts.reduce((sum, p) => {
    const ft = p.features[0]; const pr = ft?.params || {};
    const vol = calcVolume((pr.primitiveType as PrimitiveType) || 'box', pr as Record<string, number>);
    return sum + calcWeight(vol * 1e-9, p.material.density);
  }, 0);

  // Build PDF objects and compute byte offsets dynamically
  const objects: string[] = [];
  // 1: Catalog
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  // 2: Pages
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);
  // 3: Page
  objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${canvas.width} ${canvas.height}] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>\nendobj`);
  // 4: Font (Helvetica — built-in PDF base font)
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);
  // 5: Content stream
  const streamContent = `BT\n/F1 16 Tf\n36 ${canvas.height - 40} Td\n(AXL Drawing: ${project.name}) Tj\n0 -24 Td\n/F1 10 Tf\n(Parts: ${project.assembly.parts.length} | Units: ${project.units} | Weight: ${formatWeight(tw)}) Tj\n0 -16 Td\n(Generated by AXL Engineering Design Studio) Tj\nET`;
  objects.push(`5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`);

  // Build final PDF with computed xref offsets
  const header = `%PDF-1.4\n`;
  let body = '';
  const offsets: number[] = [];
  let pos = header.length;
  for (const obj of objects) {
    offsets.push(pos);
    const entry = obj + '\n';
    body += entry;
    pos += entry.length;
  }
  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += off.toString().padStart(10, '0') + ' 00000 n \n';
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const pdfContent = header + body + xref;
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  downloadBlob(blob, `${fileName}.pdf`);
  return 'Exported as PDF drawing sheet';
}

// ---------------------------------------------------------------------------
// GLTF 2.0 EXPORT — Embeds geometry + PBR materials as single .gltf JSON
// ---------------------------------------------------------------------------

function exportGLTF(project: AXLProject, fileName: string): string {
  const nodes: any[] = [];
  const meshes: any[] = [];
  const accessors: any[] = [];
  const bufferViews: any[] = [];
  const materials: any[] = [];
  const bufferData: number[] = [];

  let byteOffset = 0;

  project.assembly.parts.forEach((part, partIdx) => {
    if (!part.visible) return;
    const feat = part.features[0];
    if (!feat) return;
    const params = feat.params;
    const primType = (params.primitiveType as string) || 'box';

    // Generate triangulated mesh data for the primitive
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    if (primType === 'box') {
      const w = ((params.width as number) || 50) / 2;
      const h = ((params.height as number) || 50) / 2;
      const d = ((params.depth as number) || 50) / 2;
      // 6 faces × 4 vertices × 3 components
      const faces: [Vec3, Vec3, [number, number, number, number]][] = [
        [vec3(0, 0, 1), vec3(0, 0, 0), [-w, -h, d, w, -h, d, w, h, d, -w, h, d] as any],
        [vec3(0, 0, -1), vec3(0, 0, 0), [w, -h, -d, -w, -h, -d, -w, h, -d, w, h, -d] as any],
        [vec3(0, 1, 0), vec3(0, 0, 0), [-w, h, d, w, h, d, w, h, -d, -w, h, -d] as any],
        [vec3(0, -1, 0), vec3(0, 0, 0), [-w, -h, -d, w, -h, -d, w, -h, d, -w, -h, d] as any],
        [vec3(1, 0, 0), vec3(0, 0, 0), [w, -h, d, w, -h, -d, w, h, -d, w, h, d] as any],
        [vec3(-1, 0, 0), vec3(0, 0, 0), [-w, -h, -d, -w, -h, d, -w, h, d, -w, h, -d] as any],
      ];
      faces.forEach(([normal, , verts], fi) => {
        const base = fi * 4;
        const v = verts as unknown as number[];
        for (let i = 0; i < 4; i++) {
          positions.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
          normals.push(normal.x, normal.y, normal.z);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    } else if (primType === 'sphere') {
      const r = (params.radius as number) || 25;
      const stacks = 12, slices = 18;
      for (let i = 0; i <= stacks; i++) {
        const phi = (i / stacks) * Math.PI;
        for (let j = 0; j <= slices; j++) {
          const theta = (j / slices) * Math.PI * 2;
          const x = r * Math.sin(phi) * Math.cos(theta);
          const y = r * Math.cos(phi);
          const z = r * Math.sin(phi) * Math.sin(theta);
          positions.push(x, y, z);
          normals.push(x / r, y / r, z / r);
        }
      }
      for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
          const a = i * (slices + 1) + j;
          const b = a + slices + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    } else {
      // Cylinder/cone fallback as 16-segment prism
      const r = (params.radius as number) || 25;
      const ht = ((params.height as number) || 50) / 2;
      const topR = primType === 'cone' ? 0 : r;
      const seg = 16;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        positions.push(r * c, -ht, r * s);
        normals.push(c, 0, s);
        positions.push(topR * c, ht, topR * s);
        normals.push(c, 0, s);
      }
      for (let i = 0; i < seg; i++) {
        const b = i * 2;
        indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }

    // PBR material
    const mat = part.material;
    const metalness = mat.density > 5000 ? 0.9 : mat.density > 2000 ? 0.5 : 0.1;
    const roughness = 1 - metalness * 0.5;
    const matIdx = materials.length;
    materials.push({
      name: mat.name,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRGBA(mat.color),
        metallicFactor: metalness,
        roughnessFactor: roughness,
      },
    });

    // Pack buffer data
    const posStart = byteOffset;
    for (const v of positions) { bufferData.push(v); byteOffset += 4; }
    const normStart = byteOffset;
    for (const v of normals) { bufferData.push(v); byteOffset += 4; }
    const idxStart = byteOffset;
    for (const v of indices) { bufferData.push(v); byteOffset += 2; }
    // Pad to 4-byte boundary
    if (byteOffset % 4 !== 0) { bufferData.push(0); byteOffset += 2; }

    const posCount = positions.length / 3;
    const idxCount = indices.length;

    // Compute bounds
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const posAccessor = accessors.length;
    accessors.push({ bufferView: bufferViews.length, componentType: 5126, count: posCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
    bufferViews.push({ buffer: 0, byteOffset: posStart, byteLength: posCount * 12 });

    const normAccessor = accessors.length;
    accessors.push({ bufferView: bufferViews.length, componentType: 5126, count: posCount, type: 'VEC3' });
    bufferViews.push({ buffer: 0, byteOffset: normStart, byteLength: posCount * 12 });

    const idxAccessor = accessors.length;
    accessors.push({ bufferView: bufferViews.length, componentType: 5123, count: idxCount, type: 'SCALAR' });
    bufferViews.push({ buffer: 0, byteOffset: idxStart, byteLength: idxCount * 2 });

    meshes.push({
      name: part.name,
      primitives: [{ attributes: { POSITION: posAccessor, NORMAL: normAccessor }, indices: idxAccessor, material: matIdx }],
    });

    const px = part.transform.position;
    nodes.push({
      name: part.name,
      mesh: meshes.length - 1,
      translation: [px.x, px.y, px.z],
    });
  });

  // Build binary buffer
  const floatArray = new Float32Array(bufferData);
  const uint8 = new Uint8Array(floatArray.buffer);
  const base64 = btoa(String.fromCharCode(...uint8));

  const gltf = {
    asset: { version: '2.0', generator: 'AXL Engineering Design Studio' },
    scene: 0,
    scenes: [{ name: project.name, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    materials,
    buffers: [{ uri: `data:application/octet-stream;base64,${base64}`, byteLength: uint8.byteLength }],
  };

  const blob = new Blob([JSON.stringify(gltf, null, 2)], { type: 'model/gltf+json' });
  downloadBlob(blob, `${fileName}.gltf`);
  return `Exported GLTF 2.0 — ${nodes.length} nodes, PBR materials`;
}

function hexToRGBA(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b, 1.0];
}
