// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Upgrading from 6.x with older accepted policy versions must show only the
// updated-policy screen, and accepting it must not run first-run defaults
// (resetting the installed-apps list or onboarding preferences).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { OnboardingWizard, useOnboardingCheck } from '../../src/renderer/components/Onboarding';
import { useInstalledAppsStore } from '../../src/renderer/store/installedAppsStore';
import { hasAcceptedCurrentPolicies, POLICY_ACCEPTANCE_STORAGE_KEY } from '../../src/renderer/utils/policyConsent';

const OLD_ACCEPTANCE = JSON.stringify({
  acceptedAt: '2026-11-01T10:35:03.163Z',
  appVersion: '6.1.0',
  dataPolicyVersion: '2.2.0',
  policies: { terms: '2.2.0', privacy: '2.2.0' },
});
const OLD_PREFS = '{"analyticsEnabled":false,"crashReportsEnabled":true,"autoUpdatesEnabled":true,"loadSample":false,"mine":1}';

describe('upgrade with outdated policy acceptance', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dex-welcomed', '1');
    localStorage.setItem(POLICY_ACCEPTANCE_STORAGE_KEY, OLD_ACCEPTANCE);
    localStorage.setItem('dex-onboarding-prefs', OLD_PREFS);
  });

  it('asks for policy review only, not the first-run wizard', () => {
    const { result } = renderHook(() => useOnboardingCheck());
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.policyReviewOnly).toBe(true);
  });

  it('accepting records the new versions and leaves apps and preferences alone', async () => {
    vi.useFakeTimers();
    const essentials = vi.spyOn(useInstalledAppsStore.getState(), 'applyEssentials');
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} policyReviewOnly />);

    expect(screen.queryByText('Welcome to DEX')).toBeNull();
    expect(screen.getByText('Updated Terms & Privacy')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Accept and Continue'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(hasAcceptedCurrentPolicies()).toBe(true);
    expect(essentials).not.toHaveBeenCalled();
    expect(localStorage.getItem('dex-onboarding-prefs')).toBe(OLD_PREFS);
    vi.useRealTimers();
  });

  it('a first-time user still gets the full wizard', () => {
    localStorage.clear();
    const { result } = renderHook(() => useOnboardingCheck());
    expect(result.current.needsOnboarding).toBe(true);
    expect(result.current.policyReviewOnly).toBe(false);
  });
});
