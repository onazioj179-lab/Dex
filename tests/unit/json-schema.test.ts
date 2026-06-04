import { describe, it, expect } from 'vitest';
import { validateArgs, pickSchemaFields, type ArgsSchema } from '../../src/shared/uki/jsonSchema';

const schema: ArgsSchema = {
  name: { type: 'string', required: true },
  count: { type: 'number' },
  mode: { type: 'string', enum: ['a', 'b'] },
};

describe('json schema', () => {
  it('accepts a valid object', () => {
    expect(validateArgs({ name: 'x', count: 5, mode: 'a' }, schema)).toEqual({ valid: true, errors: [] });
  });

  it('flags a missing required field', () => {
    const r = validateArgs({ count: 1 }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('missing required field: name');
  });

  it('flags a wrong type', () => {
    const r = validateArgs({ name: 'x', count: 'oops' }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('count must be number'))).toBe(true);
  });

  it('flags an out-of-enum value', () => {
    const r = validateArgs({ name: 'x', mode: 'z' }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('mode must be one of'))).toBe(true);
  });

  it('rejects non-objects and recognizes arrays', () => {
    expect(validateArgs('nope', schema).valid).toBe(false);
    expect(validateArgs({ tags: [1, 2] }, { tags: { type: 'array' }, name: { type: 'string' } }).valid).toBe(true);
  });

  it('picks only schema fields', () => {
    expect(pickSchemaFields({ name: 'x', extra: 1, count: 2 }, schema)).toEqual({ name: 'x', count: 2 });
  });
});
