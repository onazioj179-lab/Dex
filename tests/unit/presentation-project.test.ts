/** DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. */
import { describe, expect, it } from 'vitest';
import { parsePresentationProject, safePresentationImage } from '../../src/renderer/DEXAPPLICATIONS/standalone/presentationProject';

const project = () => ({ format: 'dex-presentation', version: 1, themeId: 'midnight', slides: [{
  id: 'slide', background: '#1a1a1f', transition: 'fade', notes: 'Speaker notes', layout: 'blank',
  blocks: [{ id: 'text', type: 'text', x: 10, y: 20, width: 400, height: 80, content: 'Editable text', style: { fontSize: 24, color: '#fff' } }],
}] });

describe('presentation project files', () => {
  it('round trips editable content, geometry and notes', () => {
    const parsed = parsePresentationProject(JSON.stringify(project()));
    expect(parsed).toEqual(project());
    expect(parsePresentationProject(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('rejects unsupported schemas, duplicate IDs and invalid geometry', () => {
    expect(() => parsePresentationProject('{}')).toThrow();
    const duplicate = project();
    duplicate.slides.push(duplicate.slides[0]);
    expect(() => parsePresentationProject(JSON.stringify(duplicate))).toThrow('Invalid slide');
    const invalid = project();
    invalid.slides[0].blocks[0].width = -1;
    expect(() => parsePresentationProject(JSON.stringify(invalid))).toThrow('Invalid slide block');
  });

  it('removes unknown action fields and rejects executable image addresses', () => {
    const input = project();
    Object.assign(input.slides[0].blocks[0], { nativeAction: 'delete-files' });
    expect(parsePresentationProject(JSON.stringify(input)).slides[0].blocks[0]).not.toHaveProperty('nativeAction');
    for (const url of ['javascript:alert(1)', 'file:///secret', 'data:image/svg+xml,<svg/>', 'https://user:pass@example.com/a.png']) {
      expect(safePresentationImage(url)).toBe(false);
    }
    expect(safePresentationImage('https://example.com/photo.png')).toBe(true);
    expect(safePresentationImage('data:image/png;base64,AAAA')).toBe(true);
  });
});
