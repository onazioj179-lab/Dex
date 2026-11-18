// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { sequenceDigest, resultIsStale, applyAction, emptyProject, normalizeProject } from '../../src/renderer/DEXAPPLICATIONS/bio/bioProject';

describe('Bio result provenance', () => {
  it('fingerprints residues and topology deterministically', () => {
    expect(sequenceDigest('ACGT')).toBe(sequenceDigest('ACGT'));
    expect(sequenceDigest('ACGT')).not.toBe(sequenceDigest('ACGA'));
    expect(sequenceDigest('ACGT', true)).not.toBe(sequenceDigest('ACGT', false));
    expect(sequenceDigest('ACGT')).toMatch(/^4-[0-9a-f]{8}$/);
  });

  it('marks a saved result stale when its sequence changes or is deleted, and keeps the fields through save/load', () => {
    const seq = { id: 's1', name: 'p', seq: 'ACGT', kind: 'dna' as const, source: 'entered' as const, notes: '', createdAt: 0, updatedAt: 0 };
    let p = { ...emptyProject(), sequences: [seq] };
    p = applyAction(p, { type: 'save-result', result: { sequenceId: 's1', sequenceName: 'p', title: 't', values: { Length: '4 nt' }, inputDigest: sequenceDigest('ACGT'), appVersion: '7.0.2' } });
    const r = normalizeProject(JSON.parse(JSON.stringify(p))).results[0];
    expect(r.inputDigest).toBe(sequenceDigest('ACGT'));
    expect(resultIsStale(r, p.sequences)).toBeNull();
    expect(resultIsStale(r, [{ ...seq, seq: 'ACGTT' }])).toBe('changed');
    expect(resultIsStale(r, [])).toBe('deleted');
    // Older results without a fingerprint are not called stale (unknown, not changed).
    expect(resultIsStale({ ...r, inputDigest: undefined }, [{ ...seq, seq: 'GG' }])).toBeNull();
  });
});
