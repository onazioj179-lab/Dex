import { describe, it, expect } from 'vitest';
import {
  computeRename,
  computeBatch,
  DEFAULT_RENAME_CONFIG,
  type RenameConfig,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/powerRenameEngine';

const cfg = (over: Partial<RenameConfig>): RenameConfig => ({ ...DEFAULT_RENAME_CONFIG, ...over });

describe('powerRenameEngine.computeRename', () => {
  it('is a no-op with the default config', () => {
    const r = computeRename('Photo.JPG', 0, DEFAULT_RENAME_CONFIG);
    expect(r.next).toBe('Photo.JPG');
    expect(r.changed).toBe(false);
  });

  it('does literal find/replace on the name part only, preserving the extension', () => {
    const r = computeRename('IMG_001.png', 0, cfg({ find: 'IMG_', replace: 'Vacation_' }));
    expect(r.next).toBe('Vacation_001.png');
    expect(r.changed).toBe(true);
  });

  it('is case-insensitive by default, case-sensitive when asked', () => {
    expect(computeRename('img.png', 0, cfg({ find: 'IMG', replace: 'X' })).next).toBe('X.png');
    expect(computeRename('img.png', 0, cfg({ find: 'IMG', replace: 'X', caseSensitive: true })).next).toBe('img.png');
  });

  it('supports regex with backreferences', () => {
    const r = computeRename('track-07.mp3', 0, cfg({ useRegex: true, find: 'track-(\\d+)', replace: 'Song $1' }));
    expect(r.next).toBe('Song 07.mp3');
  });

  it('reports invalid regex as an error without throwing', () => {
    const r = computeRename('a.txt', 0, cfg({ useRegex: true, find: '([', replace: 'x' }));
    expect(r.error).toBeTruthy();
    expect(r.next).toBe('a.txt');
  });

  it('applies case transforms to the name only', () => {
    expect(computeRename('my file.TXT', 0, cfg({ caseTransform: 'upper' })).next).toBe('MY FILE.TXT');
    expect(computeRename('my file.txt', 0, cfg({ caseTransform: 'title' })).next).toBe('My File.txt');
  });

  it('adds prefix and suffix', () => {
    expect(computeRename('doc.pdf', 0, cfg({ prefix: '2026_', suffix: '_final' })).next).toBe('2026_doc_final.pdf');
  });

  it('numbers a sequence with padding', () => {
    const c = cfg({ numbering: { enabled: true, start: 1, step: 1, padding: 3, position: 'suffix', separator: '-' } });
    expect(computeRename('a.txt', 0, c).next).toBe('a-001.txt');
    expect(computeRename('a.txt', 4, c).next).toBe('a-005.txt');
  });

  it('can replace within the extension', () => {
    expect(computeRename('clip.jpeg', 0, cfg({ scope: 'extension', find: 'jpeg', replace: 'jpg' })).next).toBe('clip.jpg');
  });

  it('treats dotfiles as having no extension', () => {
    expect(computeRename('.gitignore', 0, cfg({ prefix: 'x' })).next).toBe('x.gitignore');
  });
});

describe('powerRenameEngine.computeBatch', () => {
  it('flags collisions when two files map to the same name', () => {
    const out = computeBatch(['a.txt', 'b.txt'], cfg({ useRegex: true, find: '^.+', replace: 'same' }));
    expect(out[0].next).toBe('same.txt');
    expect(out[1].next).toBe('same.txt');
    expect(out[0].error).toMatch(/duplicate/i);
    expect(out[1].error).toMatch(/duplicate/i);
  });

  it('does not flag unchanged identical-extension files as collisions', () => {
    const out = computeBatch(['one.txt', 'two.txt'], DEFAULT_RENAME_CONFIG);
    expect(out.every(r => !r.error)).toBe(true);
  });

  it('numbers across the batch by index', () => {
    const c = cfg({ numbering: { enabled: true, start: 10, step: 5, padding: 2, position: 'prefix', separator: '_' } });
    const out = computeBatch(['x.md', 'y.md', 'z.md'], c);
    expect(out.map(r => r.next)).toEqual(['10_x.md', '15_y.md', '20_z.md']);
  });
});
