import { describe, it, expect } from 'vitest';
import { scopedQuery } from '../../src/renderer/services/commandScope';

describe('command scope', () => {
  it('scopes in:settings to the settings category', () => {
    const r = scopedQuery('in:settings theme');
    expect(r.text).toBe('theme');
    expect([...(r.allowedCategories ?? [])]).toEqual(['settings']);
  });

  it('scopes in:apps to the app category, keeping the name as text', () => {
    const r = scopedQuery('in:apps prism');
    expect(r.text).toBe('prism');
    expect([...(r.allowedCategories ?? [])]).toEqual(['app']);
  });

  it('maps workflows/commands kinds to the action category', () => {
    expect([...(scopedQuery('kind:workflows').allowedCategories ?? [])]).toEqual(['action']);
    expect([...(scopedQuery('type:commands foo').allowedCategories ?? [])]).toEqual(['action']);
  });

  it('is unscoped for a plain query', () => {
    const r = scopedQuery('prism');
    expect(r.text).toBe('prism');
    expect(r.allowedCategories).toBeNull();
  });

  it('falls back to unscoped when the kind has no palette category', () => {
    const r = scopedQuery('in:notes meeting');
    expect(r.text).toBe('meeting');
    expect(r.allowedCategories).toBeNull();
  });
});
