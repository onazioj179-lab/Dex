// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAuth = {
  biometricsAvailable: vi.fn(),
  getState: vi.fn(),
  getConfig: vi.fn(),
  onStateChange: vi.fn(),
  authenticatePassword: vi.fn(),
  authenticatePin: vi.fn(),
  authenticateBiometric: vi.fn(),
  setPassword: vi.fn(),
  setPin: vi.fn(),
  enableBiometric: vi.fn(),
  lock: vi.fn(),
  updateConfig: vi.fn(),
  clearCredentials: vi.fn(),
  changePassword: vi.fn(),
  changePin: vi.fn(),
  generateRecoveryCodes: vi.fn(),
  authenticateWithRecovery: vi.fn(),
};

Object.defineProperty(window, 'dex', {
  value: { auth: mockAuth },
  writable: true,
  configurable: true,
});

describe('useAuthStore', () => {
  let store: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../../src/renderer/store/useAuthStore');
    store = mod.useAuthStore;
    store.setState({
      isLocked: false,
      isEnabled: false,
      method: 'none' as const,
      hasPassword: false,
      hasPin: false,
      hasBiometric: false,
      biometricsAvailable: false,
      lockoutStatus: { isLockedOut: false, remainingMinutes: 0, attemptsRemaining: 5 },
      isLoading: false,
      error: null,
      sessionToken: null,
      config: null,
    });
  });

  describe('initial state', () => {
    it('starts unlocked with no auth enabled', () => {
      const state = store.getState();
      expect(state.isLocked).toBe(false);
      expect(state.isEnabled).toBe(false);
      expect(state.method).toBe('none');
      expect(state.sessionToken).toBeNull();
    });

    it('starts with no lockout', () => {
      const { lockoutStatus } = store.getState();
      expect(lockoutStatus.isLockedOut).toBe(false);
      expect(lockoutStatus.attemptsRemaining).toBe(5);
    });
  });

  describe('initialize', () => {
    it('loads auth state from backend', async () => {
      mockAuth.biometricsAvailable.mockResolvedValue(true);
      mockAuth.getState.mockResolvedValue({
        isLocked: true,
        isEnabled: true,
        method: 'password',
        hasPassword: true,
        hasPin: false,
        hasBiometric: false,
        lockoutStatus: { isLockedOut: false, remainingMinutes: 0, attemptsRemaining: 5 },
      });
      mockAuth.getConfig.mockResolvedValue({ enabled: true, method: 'password' });
      mockAuth.onStateChange.mockReturnValue(vi.fn());

      await store.getState().initialize();

      const state = store.getState();
      expect(state.isLocked).toBe(true);
      expect(state.isEnabled).toBe(true);
      expect(state.method).toBe('password');
      expect(state.hasPassword).toBe(true);
      expect(state.biometricsAvailable).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('defaults to unlocked when backend returns null', async () => {
      mockAuth.biometricsAvailable.mockResolvedValue(false);
      mockAuth.getState.mockResolvedValue(null);
      mockAuth.getConfig.mockResolvedValue(null);

      await store.getState().initialize();

      expect(store.getState().isLocked).toBe(false);
      expect(store.getState().isLoading).toBe(false);
    });

    it('handles initialization error gracefully', async () => {
      mockAuth.biometricsAvailable.mockRejectedValue(new Error('fail'));

      await store.getState().initialize();

      expect(store.getState().isLocked).toBe(false);
      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().error).toBe('Failed to initialize authentication');
    });
  });

  describe('authenticateWithPassword', () => {
    it('unlocks on success and stores session token', async () => {
      store.setState({ isLocked: true, isEnabled: true });
      mockAuth.authenticatePassword.mockResolvedValue({ success: true, token: 'tok-123' });

      const result = await store.getState().authenticateWithPassword('MyP@ssw0rd!');

      expect(result).toBe(true);
      expect(store.getState().isLocked).toBe(false);
      expect(store.getState().sessionToken).toBe('tok-123');
      expect(store.getState().error).toBeNull();
    });

    it('stays locked on failed auth', async () => {
      store.setState({ isLocked: true, isEnabled: true });
      mockAuth.authenticatePassword.mockResolvedValue({ success: false, error: 'Wrong password' });
      mockAuth.getState.mockResolvedValue({
        isLocked: true,
        isEnabled: true,
        method: 'password',
        hasPassword: true,
        hasPin: false,
        hasBiometric: false,
        lockoutStatus: { isLockedOut: false, remainingMinutes: 0, attemptsRemaining: 4 },
      });
      mockAuth.getConfig.mockResolvedValue(null);

      const result = await store.getState().authenticateWithPassword('wrong');

      expect(result).toBe(false);
      expect(store.getState().isLocked).toBe(true);
      expect(store.getState().error).toBe('Wrong password');
    });

    it('handles exception during auth', async () => {
      store.setState({ isLocked: true });
      mockAuth.authenticatePassword.mockRejectedValue(new Error('network'));

      const result = await store.getState().authenticateWithPassword('anything');

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Authentication failed');
    });
  });

  describe('authenticateWithPin', () => {
    it('unlocks on success', async () => {
      store.setState({ isLocked: true });
      mockAuth.authenticatePin.mockResolvedValue({ success: true, token: 'pin-tok' });

      const result = await store.getState().authenticateWithPin('123456');

      expect(result).toBe(true);
      expect(store.getState().isLocked).toBe(false);
      expect(store.getState().sessionToken).toBe('pin-tok');
    });

    it('stays locked on failure', async () => {
      store.setState({ isLocked: true });
      mockAuth.authenticatePin.mockResolvedValue({ success: false, error: 'Wrong PIN' });
      mockAuth.getState.mockResolvedValue(null);

      const result = await store.getState().authenticateWithPin('000000');

      expect(result).toBe(false);
      expect(store.getState().error).toBe('Wrong PIN');
    });
  });

  describe('authenticateWithBiometric', () => {
    it('unlocks on biometric success', async () => {
      store.setState({ isLocked: true });
      mockAuth.authenticateBiometric.mockResolvedValue({ success: true, token: 'bio-tok' });

      const result = await store.getState().authenticateWithBiometric();

      expect(result).toBe(true);
      expect(store.getState().isLocked).toBe(false);
    });

    it('stays locked on biometric failure', async () => {
      store.setState({ isLocked: true });
      mockAuth.authenticateBiometric.mockResolvedValue({ success: false, error: 'Not recognized' });
      mockAuth.getState.mockResolvedValue(null);

      const result = await store.getState().authenticateWithBiometric();

      expect(result).toBe(false);
    });
  });

  describe('setPassword', () => {
    it('reports success and refreshes state', async () => {
      mockAuth.setPassword.mockResolvedValue({ success: true });
      mockAuth.getState.mockResolvedValue({
        isLocked: false,
        isEnabled: true,
        method: 'password',
        hasPassword: true,
        hasPin: false,
        hasBiometric: false,
        lockoutStatus: { isLockedOut: false, remainingMinutes: 0, attemptsRemaining: 5 },
      });
      mockAuth.getConfig.mockResolvedValue(null);

      const result = await store.getState().setPassword('NewPassword123!');

      expect(result.success).toBe(true);
      expect(store.getState().isLoading).toBe(false);
    });

    it('reports failure from backend', async () => {
      mockAuth.setPassword.mockResolvedValue({ success: false, error: 'Too weak' });

      const result = await store.getState().setPassword('weak');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Too weak');
    });
  });

  describe('setPin', () => {
    it('reports success', async () => {
      mockAuth.setPin.mockResolvedValue({ success: true });
      mockAuth.getState.mockResolvedValue(null);

      const result = await store.getState().setPin('876543');

      expect(result.success).toBe(true);
    });
  });

  describe('error and loading management', () => {
    it('setError updates error state', () => {
      store.getState().setError('something went wrong');
      expect(store.getState().error).toBe('something went wrong');

      store.getState().setError(null);
      expect(store.getState().error).toBeNull();
    });

    it('setLoading updates loading state', () => {
      store.getState().setLoading(true);
      expect(store.getState().isLoading).toBe(true);

      store.getState().setLoading(false);
      expect(store.getState().isLoading).toBe(false);
    });
  });

  describe('idle warning', () => {
    it('sets and clears idle warning', () => {
      store.getState().setIdleWarning({ active: true, seconds: 30 });
      expect(store.getState().idleWarning).toEqual({ active: true, seconds: 30 });

      store.getState().setIdleWarning(null);
      expect(store.getState().idleWarning).toBeNull();
    });
  });
});
