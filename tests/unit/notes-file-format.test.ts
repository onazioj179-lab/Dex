// =============================================================================
// DEX Platform — Notes export / import conversion
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { fileToNote, markdownToDoc, noteToFileText, safeFileName, parseInlineMarkdown } from '../../src/renderer/DEXAPPLICATIONS/notes/notesFileFormat';
import { docToMarkdown, docToPlainText, serializeDoc } from '../../src/renderer/DEXAPPLICATIONS/notes/NotesDocumentModel';

const MD = [
  '# Trip plan',
  '',
  'Pack **light** and bring *one* `charger`.',
  '',
  '## Checklist',
  '- [x] Passport',
  '- [ ] Tickets',
  '',
  '1. Fly',
  '2. Rest',
  '',
  '> Slow is smooth.',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '---',
  '',
  '| Day | City |',
  '| --- | --- |',
  '| 1 | Lagos |',
].join('\n');

describe('Notes import', () => {
  it('reads markdown: title from the first heading, structure kept', () => {
    const { title, doc } = fileToNote('C:/x/trip.md', MD);
    expect(title).toBe('Trip plan');
    const types = doc.content.map(n => n.type);
    expect(types).toEqual(['paragraph', 'heading', 'bullet_list', 'ordered_list', 'blockquote', 'code_block', 'horizontal_rule', 'table']);
    const checks = doc.content[2].content!;
    expect(checks.map(c => [c.type, c.attrs?.checked])).toEqual([['checklist_item', true], ['checklist_item', false]]);
    expect(doc.content[5].attrs?.language).toBe('js');
    const text = docToPlainText(doc);
    expect(text).toContain('Passport');
    expect(text).toContain('Lagos');
    expect(text).toContain('const a = 1;');
  });

  it('turns inline markdown into marks and keeps only safe links', () => {
    const runs = parseInlineMarkdown('a **b** [site](https://x.com) [bad](javascript:alert(1)) c');
    expect(runs.find(r => r.text === 'b')?.marks?.[0].type).toBe('bold');
    expect(runs.find(r => r.text === 'site')?.marks?.[0]).toEqual({ type: 'link', attrs: { href: 'https://x.com' } });
    expect(runs.find(r => r.text === 'bad')?.marks).toBeUndefined();
  });

  it('uses the file name as title for plain text', () => {
    const { title, doc } = fileToNote('notes/Shopping list.txt', 'eggs\r\nmilk');
    expect(title).toBe('Shopping list');
    expect(docToPlainText(doc)).toContain('eggs');
    expect(docToPlainText(doc)).toContain('milk');
  });

  it('round-trips its own JSON export and rejects other JSON', () => {
    const doc = markdownToDoc('hello **world**');
    const out = noteToFileText({ title: 'Round', content: serializeDoc(doc) }, 'json');
    const back = fileToNote('Round.json', out);
    expect(back.title).toBe('Round');
    expect(back.doc).toEqual(doc);
    expect(() => fileToNote('x.json', '{"a":1}')).toThrow(/not a note export/);
    expect(() => fileToNote('x.json', 'nope')).toThrow(/not a note export/);
  });

  it('refuses unknown file types with a readable message', () => {
    expect(() => fileToNote('photo.png', 'x')).toThrow(/can import/);
  });
});

describe('Notes export', () => {
  const content = serializeDoc(markdownToDoc('Body with **bold**.\n\n- one\n- two'));

  it('markdown starts with the title and keeps formatting', () => {
    const md = noteToFileText({ title: 'My note', content }, 'markdown');
    expect(md.startsWith('# My note\n\n')).toBe(true);
    expect(md).toContain('**bold**');
    expect(md).toContain('- one');
    // and re-imports to the same title + text
    const back = fileToNote('My note.md', md);
    expect(back.title).toBe('My note');
    expect(docToMarkdown(back.doc)).toContain('**bold**');
  });

  it('html is a full escaped page that re-imports with its title', () => {
    const html = noteToFileText({ title: 'A <b> & C', content }, 'html');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A &lt;b&gt; &amp; C</title>');
    expect(html).not.toContain('<title>A <b>');
  });

  it('txt is title plus plain text', () => {
    const txt = noteToFileText({ title: 'T', content }, 'txt');
    expect(txt.startsWith('T\n\n')).toBe(true);
    expect(txt).toContain('bold');
    expect(txt).not.toContain('**');
  });

  it('makes Windows-safe file names', () => {
    expect(safeFileName('a/b:c*?"<>|', 'md')).toBe('a_b_c______.md');
    expect(safeFileName('', 'txt')).toBe('Untitled note.txt');
    expect(safeFileName('...', 'txt')).toBe('Untitled note.txt');
  });
});
