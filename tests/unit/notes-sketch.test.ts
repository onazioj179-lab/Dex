// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Notes sketch / handwritten-signature pad: cropping, the explicit
// "not a cryptographic signature" alt text, and persistence of the inserted
// image through the note document model (save -> reload).
//
import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { strokeBounds, sketchAltText } from '../../src/renderer/DEXAPPLICATIONS/notes/SketchPad';
import { htmlToDoc, docToHTML, serializeDoc, deserializeDoc } from '../../src/renderer/DEXAPPLICATIONS/notes/NotesDocumentModel';

describe('SketchPad helpers', () => {
  it('crops to what was drawn (with padding) and reports empty pads', () => {
    expect(strokeBounds([])).toBeNull();
    const b = strokeBounds([{ color: '#000', width: 2, points: [{ x: 100, y: 50 }, { x: 200, y: 80 }] }], 8)!;
    expect(b).toEqual({ x: 90, y: 40, w: 120, h: 50 });
  });

  it('labels signatures as images, not cryptographic signatures', () => {
    expect(sketchAltText('signature')).toMatch(/not a cryptographic digital signature/);
    expect(sketchAltText('sketch')).toBe('Sketch');
  });
});

describe('inserted drawing persists', () => {
  it('round-trips a data-URL image through save and reload', () => {
    const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const alt = sketchAltText('signature');
    const saved = serializeDoc(htmlToDoc(`<p><img src="${src}" alt="${alt}" /></p>`));
    const html = DOMPurify.sanitize(docToHTML(deserializeDoc(saved)));
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img');
    expect(img?.getAttribute('src')).toBe(src);
    expect(img?.getAttribute('alt')).toBe(alt);
  });
});

describe('images inside paragraphs (contenteditable inserts/pastes)', () => {
  it('keeps the image and the surrounding text', () => {
    const doc = htmlToDoc('<p>before <img src="data:image/png;base64,AAAA" alt="pic" /> after</p>');
    const types = doc.content.map((n) => n.type);
    expect(types).toEqual(['paragraph', 'image', 'paragraph']);
    expect(docToHTML(doc)).toContain('<img src="data:image/png;base64,AAAA" alt="pic" />');
  });
});
