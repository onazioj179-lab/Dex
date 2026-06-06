// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { beforeEach, describe, expect, it } from 'vitest';
import { DATA_POLICY_VERSION } from '../../src/shared/policies';
import {
  OPTIONAL_ANALYTICS_STORAGE_KEY,
  POLICY_ACCEPTANCE_STORAGE_KEY,
  acceptCurrentPolicies,
  clearPolicyAcceptance,
  hasAcceptedCurrentPolicies,
  isOptionalAnalyticsEnabled,
  readPolicyAcceptance,
  setOptionalAnalyticsEnabled,
} from '../../src/renderer/utils/policyConsent';

describe('policyConsent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts unaccepted', () => {
    expect(readPolicyAcceptance()).toBeNull();
    expect(hasAcceptedCurrentPolicies()).toBe(false);
  });

  it('stores current policy acceptance', () => {
    const record = acceptCurrentPolicies();
    expect(record.dataPolicyVersion).toBe(DATA_POLICY_VERSION);
    expect(record.policies.terms).toBe('2.1.0');
    expect(record.policies.privacy).toBe('2.1.0');
    expect(hasAcceptedCurrentPolicies()).toBe(true);
  });

  it('rejects stale policy versions', () => {
    acceptCurrentPolicies();
    const stale = readPolicyAcceptance();
    localStorage.setItem(POLICY_ACCEPTANCE_STORAGE_KEY, JSON.stringify({ ...stale, dataPolicyVersion: '1.0.0' }));
    expect(hasAcceptedCurrentPolicies()).toBe(false);
  });

  it('clears acceptance', () => {
    acceptCurrentPolicies();
    clearPolicyAcceptance();
    expect(readPolicyAcceptance()).toBeNull();
  });

  it('stores optional analytics separately from required policy acceptance', () => {
    expect(isOptionalAnalyticsEnabled()).toBe(false);
    setOptionalAnalyticsEnabled(true);
    expect(localStorage.getItem(OPTIONAL_ANALYTICS_STORAGE_KEY)).toBe('1');
    expect(isOptionalAnalyticsEnabled()).toBe(true);
    setOptionalAnalyticsEnabled(false);
    expect(isOptionalAnalyticsEnabled()).toBe(false);
  });
});
