// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { describe, expect, it } from 'vitest';
import { parseEnv, serializeEnv } from '../../src/renderer/DEXAPPLICATIONS/standalone/EnvManager';

describe('Env Manager file format', () => {
  it('round-trips escaped values and inline comments', () => {
    const entries = [
      { key: 'MESSAGE', value: '  "hello" # world\nsecond line\t', comment: 'sample' },
      { key: 'DIR', value: 'C:\\new\\tools\\', comment: 'Windows path' },
      { key: 'EMPTY', value: '' },
    ];
    expect(parseEnv(serializeEnv(entries))).toEqual(entries);
  });

  it('handles literal single quotes, unquoted comments, and an export prefix', () => {
    expect(parseEnv("export LABEL='value # one' # keep\nPORT=8080 # example")).toEqual([
      { key: 'LABEL', value: 'value # one', comment: 'keep' },
      { key: 'PORT', value: '8080', comment: 'example' },
    ]);
  });

  it('skips malformed assignments and keeps duplicate lines visible to the importer', () => {
    expect(parseEnv('invalid key=broken\nNO_END="oops\nKEY=first\nKEY=last')).toEqual([
      { key: 'KEY', value: 'first' },
      { key: 'KEY', value: 'last' },
    ]);
  });
});
