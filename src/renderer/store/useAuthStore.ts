// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// AUTH STORE - Authentication State Management
// Zustand store for auth state in renderer
// ===========================================================================

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AuthState {
  isLocked: boolean;
  isEnabled: boolean;
  method: 'none' | 'biometric' | 'password' | 'pin' | 'biometric+password' | 'biometric+pin';
  hasPassword: boolean;
  hasPin: boolean;
  hasBiometric: boolean;
  biometricsAvailable: boolean;
  lockoutStatus: {
    isLockedOut: boolean;
    remainingMinutes: number;
    attemptsRemaining: number;
  };
  isLoading: boolean;
  error: string | null;
  sessionToken: string | null;
}

export interface AuthConfig {
  enabled: boolean;
  method: 'none' | 'biometric' | 'password' | 'pin' | 'biometric+password' | 'biometric+pin';
  pinLength: 4 | 6;
  lockOnSleep: boolean;
  lockOnMinimize: boolean;
  timeoutMinutes: number;
  requireOnLaunch: boolean;
  requireOnResume: boolean;
  maxAttempts: number;
  lockoutMinutes: number;
}

interface AuthStore extends AuthState {
  config: AuthConfig | null;
  
  // Actions
  initialize: () => Promise<void>;
  refreshState: () => Promise<void>;
  
  // Authentication
  authenticateWithPassword: (password: string) => Promise<boolean>;
  authenticateWithPin: (pin: string) => Promise<boolean>;
  authenticateWithBiometric: () => Promise<boolean>;
  
  // Setup
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  setPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  enableBiometric: () => Promise<{ success: boolean; error?: string }>;
  
  // Management
  lock: () => Promise<void>;
  updateConfig: (updates: Partial<AuthConfig>) => Promise<void>;
  clearCredentials: (currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
  
  // Change credentials (requires current credential verification)
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  
  // Recovery
  generateRecoveryCodes: () => Promise<{ success: boolean; codes?: string[] }>;
  authenticateWithRecovery: (code: string) => Promise<boolean>;
  
  // Idle warning
  idleWarning: { active: boolean; seconds: number } | null;
  setIdleWarning: (warning: { active: boolean; seconds: number } | null) => void;
  
  // Internal
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

// Store cleanup function for state change listener
let _authStateCleanup: (() => void) | null = null;

export const useAuthStore = create<AuthStore>()(devtools(
  (set, get) => ({
  // Initial state
  isLocked: true,
  isEnabled: false,
  method: 'none',
  hasPassword: false,
  hasPin: false,
  hasBiometric: false,
  biometricsAvailable: false,
  lockoutStatus: {
    isLockedOut: false,
    remainingMinutes: 0,
    attemptsRemaining: 5,
  },
  isLoading: true,
  error: null,
  sessionToken: null,
  config: null,

  // Initialize auth system
  initialize: async () => {
    set({ isLoading: true, error: null });
    
    try {
      // Check if biometrics available
      const biometricsAvailable = await window.dex?.auth?.biometricsAvailable() ?? false;
      
      // Get current state
      const state = await window.dex?.auth?.getState();
      const config = await window.dex?.auth?.getConfig();
      
      if (state) {
        set({
          isLocked: state.isLocked,
          isEnabled: state.isEnabled,
          method: state.method as AuthState['method'],
          hasPassword: state.hasPassword,
          hasPin: state.hasPin,
          hasBiometric: state.hasBiometric,
          lockoutStatus: state.lockoutStatus,
          biometricsAvailable,
          config: config || null,
          isLoading: false,
        });
      } else {
        set({ isLoading: false, isLocked: false });
      }
      
      // Listen for state changes - cleanup previous listener first
      if (typeof _authStateCleanup === 'function') {
        _authStateCleanup();
        _authStateCleanup = null;
      }
      const unsubscribe = window.dex?.auth?.onStateChange?.((newState: any) => {
        set({
          isLocked: newState.isLocked,
          isEnabled: newState.isEnabled,
          method: newState.method,
          hasPassword: newState.hasPassword,
          hasPin: newState.hasPin,
          hasBiometric: newState.hasBiometric,
          lockoutStatus: newState.lockoutStatus,
        });
      });
      _authStateCleanup = typeof unsubscribe === 'function' ? unsubscribe : null;
    } catch (error) {
      console.error('[AuthStore] Failed to initialize:', error);
      set({ isLoading: false, isLocked: false, error: 'Failed to initialize authentication' });
    }
  },

  refreshState: async () => {
    try {
      const state = await window.dex?.auth?.getState();
      const config = await window.dex?.auth?.getConfig();
      
      if (state) {
        set({
          isLocked: state.isLocked,
          isEnabled: state.isEnabled,
          method: state.method as AuthState['method'],
          hasPassword: state.hasPassword,
          hasPin: state.hasPin,
          hasBiometric: state.hasBiometric,
          lockoutStatus: state.lockoutStatus,
          config: config || null,
        });
      }
    } catch (error) {
      console.error('[AuthStore] Failed to refresh state:', error);
    }
  },

  // Authentication methods
  authenticateWithPassword: async (password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.authenticatePassword(password);
      
      if (result?.success) {
        set({ isLocked: false, sessionToken: result.token, isLoading: false, error: null });
        return true;
      } else {
        set({ error: result?.error || 'Authentication failed', isLoading: false });
        await get().refreshState(); // Update lockout status
        return false;
      }
    } catch (error) {
      set({ error: 'Authentication failed', isLoading: false });
      return false;
    }
  },

  authenticateWithPin: async (pin: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.authenticatePin(pin);
      
      if (result?.success) {
        set({ isLocked: false, sessionToken: result.token, isLoading: false, error: null });
        return true;
      } else {
        set({ error: result?.error || 'Authentication failed', isLoading: false });
        await get().refreshState();
        return false;
      }
    } catch (error) {
      set({ error: 'Authentication failed', isLoading: false });
      return false;
    }
  },

  authenticateWithBiometric: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.authenticateBiometric();
      
      if (result?.success) {
        set({ isLocked: false, sessionToken: result.token, isLoading: false, error: null });
        return true;
      } else {
        set({ error: result?.error || 'Biometric authentication failed', isLoading: false });
        await get().refreshState();
        return false;
      }
    } catch (error) {
      set({ error: 'Biometric authentication failed', isLoading: false });
      return false;
    }
  },

  // Setup methods
  setPassword: async (password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.setPassword(password);
      set({ isLoading: false });
      
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to set password' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to set password' };
    }
  },

  setPin: async (pin: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.setPin(pin);
      set({ isLoading: false });
      
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to set PIN' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to set PIN' };
    }
  },

  enableBiometric: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const result = await window.dex?.auth?.enableBiometric();
      set({ isLoading: false });
      
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to enable biometric' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to enable biometric authentication' };
    }
  },

  // Management
  lock: async () => {
    try {
      await window.dex?.auth?.lock();
      set({ isLocked: true, sessionToken: null });
    } catch (error) {
      console.error('[AuthStore] Failed to lock:', error);
    }
  },

  updateConfig: async (updates: Partial<AuthConfig>) => {
    try {
      await window.dex?.auth?.updateConfig(updates);
      await get().refreshState();
    } catch (error) {
      console.error('[AuthStore] Failed to update config:', error);
    }
  },

  clearCredentials: async (currentPassword?: string) => {
    set({ isLoading: true });
    
    try {
      const result = await window.dex?.auth?.clearCredentials(currentPassword);
      set({ isLoading: false });
      
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to clear credentials' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to clear credentials' };
    }
  },

  // Change credentials (requires current credential verification)
  changePassword: async (currentPassword: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.dex?.auth?.changePassword(currentPassword, newPassword);
      set({ isLoading: false });
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to change password' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to change password' };
    }
  },

  changePin: async (currentPin: string, newPin: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.dex?.auth?.changePin(currentPin, newPin);
      set({ isLoading: false });
      if (result?.success) {
        await get().refreshState();
        return { success: true };
      }
      return { success: false, error: result?.error || 'Failed to change PIN' };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: 'Failed to change PIN' };
    }
  },

  // Recovery
  generateRecoveryCodes: async () => {
    try {
      const result = await window.dex?.auth?.generateRecoveryCodes();
      return result || { success: false };
    } catch {
      return { success: false };
    }
  },

  authenticateWithRecovery: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.dex?.auth?.authenticateRecovery(code);
      if (result?.success) {
        set({ isLocked: false, sessionToken: result.token, isLoading: false, error: null });
        return true;
      }
      set({ error: result?.error || 'Invalid recovery code', isLoading: false });
      return false;
    } catch {
      set({ error: 'Recovery authentication failed', isLoading: false });
      return false;
    }
  },

  // Idle warning
  idleWarning: null,
  setIdleWarning: (warning) => set({ idleWarning: warning }),

  // Internal
  setError: (error: string | null) => set({ error }),
  setLoading: (isLoading: boolean) => set({ isLoading }),
}), { name: 'AuthStore', enabled: import.meta.env.DEV }));

// ---- Selectors ----
export const selectIsLocked = (s: AuthStore) => s.isLocked;
export const selectAuthMethod = (s: AuthStore) => s.method;
export const selectAuthLoading = (s: AuthStore) => s.isLoading;
export const selectAuthError = (s: AuthStore) => s.error;
export const selectLockoutStatus = (s: AuthStore) => s.lockoutStatus;

export default useAuthStore;
