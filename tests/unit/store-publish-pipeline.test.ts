// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planPublish, type PublishSubmission } from '../../src/shared/store/publishPipeline';
import type { ValidationReport, ValidationStatus } from '../../src/shared/store/validationGate';

function report(status: ValidationStatus): ValidationReport {
  return { status, checks: [], reasons: status === 'approved' ? [] : ['needs attention'], evaluatedAt: 1 };
}
function sub(over: Partial<PublishSubmission> = {}): PublishSubmission {
  return { packageId: 'dex.app.magnify', version: '1.0.0', hasSignature: true, validation: report('approved'), ...over };
}

describe('publish pipeline (#E3)', () => {
  it('publishes an approved, signed app with the full ordered step list', () => {
    const r = planPublish(sub());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('approved');
    expect(r.steps.map(s => s.kind)).toEqual(['validate', 'require-signature', 'cosign', 'catalog-upsert']);
    expect(r.steps.find(s => s.kind === 'catalog-upsert')).toMatchObject({ packageId: 'dex.app.magnify', version: '1.0.0', status: 'approved' });
  });

  it('blocks an unsigned submission', () => {
    const r = planPublish(sub({ hasSignature: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unsigned/);
  });

  it('blocks a rejected validation with its reasons', () => {
    const r = planPublish(sub({ validation: report('rejected') }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rejected/);
  });

  it('blocks pending by default, allows when requireApproved=false', () => {
    expect(planPublish(sub({ validation: report('pending') })).ok).toBe(false);
    expect(planPublish(sub({ validation: report('pending'), requireApproved: false })).ok).toBe(true);
  });
});
