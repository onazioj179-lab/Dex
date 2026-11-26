// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { docToHTML, htmlToDoc, serializeDoc } from '../../src/renderer/DEXAPPLICATIONS/notes/NotesDocumentModel';
import { formatNoteExport } from '../../src/renderer/DEXAPPLICATIONS/notes/notesExport';
import { importWordDocument } from '../../src/renderer/DEXAPPLICATIONS/notes/wordImport';
import { answerUkiIdentity, buildSystemPrompt } from '../../src/renderer/uki/identity';

describe('Notes document export', () => {
  it('preserves alignment, headings, inline marks, table cells and escaped links', () => {
    const doc = htmlToDoc('<h2 style="text-align:center">Quarter &amp; Year</h2>' +
      '<p><strong>Revenue</strong> <a href="https://example.com/?a=1&amp;b=2">Source</a></p>' +
      '<table><tr><th>Q1</th></tr><tr><td>200</td></tr></table>');
    expect(docToHTML(doc)).toContain('<h2 style="text-align:center">');
    const result = formatNoteExport({ title: 'Budget <Draft>', content: serializeDoc(doc), plain_text: '' }, 'docx');
    expect(result.extension).toBe('docx');
    const xml = new DOMParser().parseFromString(result.content, 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(result.content).toContain('Budget &lt;Draft&gt;');
    expect(result.content).toContain('<w:jc w:val="center"/>');
    expect(result.content).toContain('<w:outlineLvl w:val="1"/>');
    expect(result.content).toContain('<w:tbl>');
    expect('relationships' in result && result.relationships).toContain('a=1&amp;b=2');
  });

  it('exports editable lists with separate numbering, nested levels and custom starts', () => {
    const doc = htmlToDoc('<ol start="4"><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol>' +
      '<ol><li>Restarted</li></ol>');
    const file = formatNoteExport({ title: 'Outline', content: serializeDoc(doc), plain_text: '' }, 'docx');
    expect(file.content).toContain('<w:ilvl w:val="1"/><w:numId w:val="2"/>');
    expect(file.content.match(/w:numId w:val="1"/g)).toHaveLength(2);
    expect(file.content).toContain('<w:numId w:val="3"/>');
    expect(file.numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(file.numbering).toContain('<w:startOverride w:val="4"/>');
    expect(file.relationships).toContain('Target="numbering.xml"');
  });

  it('retains pasted inline images and embeds each unique image once with its alt text', () => {
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tfoAAAAASUVORK5CYII=';
    const source = 'data:image/png;base64,' + pixel;
    const doc = htmlToDoc('<p>Before <img src="' + source + '" alt="A &amp; B"> after</p>' +
      '<img src="' + source + '"><img src="https://example.com/photo.png" alt="Remote">');
    expect(docToHTML(doc)).toContain(source);
    const file = formatNoteExport({ title: 'Pictures', content: serializeDoc(doc), plain_text: '' }, 'docx');
    expect(file.images).toEqual([{ format: 'png', base64: pixel }]);
    expect(file.content).toContain('<wp:extent cx="9525" cy="9525"/>');
    expect(file.content).toContain('descr="A &amp; B"');
    expect(file.content.match(/r:embed="rIdImage1"/g)).toHaveLength(2);
    expect(file.relationships).toContain('Target="media/image1.png"');
    expect(file.content).toContain('[Image · Remote]');
    expect(file.relationships).not.toContain('example.com');
  });

  it('imports heading and list structure, links, line breaks, tables and embedded images', () => {
    const input = htmlToDoc('<h2 style="text-align:center">Heading</h2>' +
      '<ol start="4"><li><strong>One</strong><ul><li>Nested</li></ul></li><li>Two</li></ol>' +
      '<p><a href="https://example.com/">Link</a><br>Second line</p>' +
      '<table><tr><td>Cell</td></tr></table>' +
      '<p><img alt="Pixel" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></p>');
    const file = formatNoteExport({ title: 'Round trip', content: serializeDoc(input), plain_text: '' }, 'docx');
    const imported = importWordDocument({
      document: file.content, numbering: file.numbering, relationships: file.relationships,
      images: Object.fromEntries((file.images ?? []).map(({ format, base64 }, i) =>
        ['word/media/image' + (i + 1) + '.' + format, 'data:image/' + format + ';base64,' + base64])),
    });
    const html = docToHTML(imported);
    expect(html).toContain('<h2 style="text-align:center"><strong>Heading</strong></h2>');
    expect(html).toContain('<ol start="4"><li><strong>One</strong><ul><li>Nested</li></ul></li><li>Two</li></ol>');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('<br>Second line');
    expect(html).toContain('<td>Cell</td>');
    expect(html).toContain('alt="Pixel"');
  });

  it('rejects DTD declarations before converting imported XML', () => {
    expect(() => importWordDocument({ document: '<!DOCTYPE document>' })).toThrow('unsupported XML declarations');
  });
});

describe('UKI identity', () => {
  it('answers explicit attribution and keeps the creator out of the general prompt', () => {
    expect(answerUkiIdentity('Who created you?')).toBe('Onazi Treaur OJ created DEX and UKI.');
    expect(answerUkiIdentity('Who inspired you?')).toContain('Ada Lovelace');
    expect(answerUkiIdentity('Who created Python?')).toBeNull();
    expect(buildSystemPrompt()).toContain('Ada Lovelace');
    expect(buildSystemPrompt()).not.toContain('Onazi Treaur OJ');
  });
});
