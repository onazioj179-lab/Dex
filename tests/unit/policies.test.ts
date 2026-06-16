// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, expect, it } from 'vitest';
import {
  DATA_CATEGORIES,
  DATA_POLICY_VERSION,
  POLICY_CONTACT_EMAIL,
  POLICY_METADATA,
  REQUIRED_POLICY_SLUGS,
  getRequiredPolicyVersions,
} from '../../src/shared/policies';
import { POLICY_DOCUMENTS, getPolicyDocument } from '../../src/shared/policyDocuments';

describe('DEX policy metadata', () => {
  it('declares required terms and privacy policies', () => {
    expect(REQUIRED_POLICY_SLUGS).toEqual(['terms', 'privacy']);
    expect(getRequiredPolicyVersions()).toMatchObject({ terms: '2.2.0', privacy: '2.2.0' });
  });

  it('keeps every metadata entry backed by bundled policy text', () => {
    expect(POLICY_DOCUMENTS).toHaveLength(POLICY_METADATA.length);
    for (const policy of POLICY_METADATA) {
      const document = getPolicyDocument(policy.slug);
      expect(document.title).toBe(policy.title);
      expect(document.body.length).toBeGreaterThan(80);
    }
  });

  it('captures company-favorable data improvement language', () => {
    const terms = getPolicyDocument('terms').body;
    expect(terms).toContain('operate, secure, maintain, troubleshoot, personalize, improve, develop, train, test, and support');
    expect(terms).toContain('worldwide, non-exclusive, royalty-free');
  });

  it('models required diagnostics and optional analytics separately', () => {
    const required = DATA_CATEGORIES.find(c => c.id === 'requiredDiagnostics');
    const optional = DATA_CATEGORIES.find(c => c.id === 'optionalAnalytics');
    expect(required?.defaultState).toBe('required');
    expect(optional?.defaultState).toBe('off');
  });

  it('keeps sensitive content never-by-default', () => {
    const sensitive = DATA_CATEGORIES.find(c => c.id === 'sensitiveContent');
    expect(sensitive?.defaultState).toBe('never-by-default');
    expect(sensitive?.examples).toContain('passwords');
  });

  it('uses the approved contact and data policy version', () => {
    expect(POLICY_CONTACT_EMAIL).toBe('onazi75@gmail.com');
    expect(DATA_POLICY_VERSION).toBe('2.2.0');
  });
});
