// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, zipStored, htmlToDocumentXml, noteToDocx, bytesToBase64 } from '../../src/renderer/DEXAPPLICATIONS/notes/docxExport';
import { docToHTML, deserializeDoc } from '../../src/renderer/DEXAPPLICATIONS/notes/NotesDocumentModel';

/** Read a stored ZIP back (local headers only) so the test checks the bytes Word will read. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    expect(crc32(data)).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    p += 30 + nameLen + size;
  }
  expect(dv.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return out;
}

describe('Notes → Word (.docx)', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('packs every Office part into a valid stored ZIP', () => {
    const parts = unzip(noteToDocx('Plan', '<p>Hello</p>'));
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml',
    ]);
    for (const xml of Object.values(parts)) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    }
  });

  it('maps headings, marks, lists, quotes, code and tables', () => {
    const x = htmlToDocumentXml('T & C', '<h2>Goals</h2><p><strong>Bold</strong> <em>it</em> H<sub>2</sub>O x<sup>2</sup> <mark>hi</mark></p>'
      + '<ul><li>one<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol><blockquote><p>quoted</p></blockquote>'
      + '<pre><code>a = 1\nb = 2</code></pre><table><tr><th>K</th><th>V</th></tr><tr><td>a</td><td>1</td></tr></table><hr>');
    expect(x).toContain('T &amp; C');
    expect(x).toContain('<w:pStyle w:val="Heading2"/>');
    expect(x).toContain('<w:b/>');
    expect(x).toContain('<w:vertAlign w:val="subscript"/>');
    expect(x).toContain('<w:vertAlign w:val="superscript"/>');
    expect(x).toContain('<w:highlight w:val="yellow"/>');
    expect(x).toContain('<w:ilvl w:val="1"/><w:numId w:val="1"/>');
    expect(x).toContain('<w:numId w:val="2"/>');
    expect(x).toContain('<w:pStyle w:val="Quote"/>');
    expect(x.match(/<w:pStyle w:val="Code"\/>/g)).toHaveLength(2);
    expect(x).toContain('<w:tbl>');
    expect(x).toContain('<w:pBdr>');
  });

  it('exports a real note from the Notes model, superscript included', () => {
    const doc = deserializeDoc(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E=mc' }, { type: 'text', text: '2', marks: [{ type: 'superscript' }] }] }] }));
    const html = docToHTML(doc);
    expect(html).toContain('<sup>2</sup>');
    const bytes = noteToDocx('Physics', html);
    expect(unzip(bytes)['word/document.xml']).toContain('superscript');
    // Leave a copy for opening by hand: %TEMP%/dex-notes-docx/Physics.docx
    const dir = join(tmpdir(), 'dex-notes-docx');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Physics.docx'), bytes);
    expect(atob(bytesToBase64(bytes)).length).toBe(bytes.length);
  });

  it('zips files of any content', () => {
    const z = zipStored([{ name: 'a.txt', data: new Uint8Array([1, 2, 3]) }]);
    expect(z.length).toBe(30 + 5 + 3 + 46 + 5 + 22);
  });
});
