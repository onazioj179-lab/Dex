// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Simple Mode Manager
// Zero-config default state with progressive disclosure
// Phase 64: Trust and zero-friction adoption
// ===========================================================================

import { useState, useEffect, useCallback } from 'react';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SimpleModeConfig {
  enabled: boolean;
  hiddenFeatures: string[];
  enabledAdvanced: string[];
}

export interface FeatureVisibility {
  // Core (always visible)
  home: boolean;
  notes: boolean;
  tasks: boolean;
  search: boolean;
  
  // Progressive (hidden in simple mode)
  code: boolean;
  workflows: boolean;
  actions: boolean;
  scheduler: boolean;
  transfers: boolean;
  
  // Advanced (require explicit opt-in)
  ai: boolean;
  scripts: boolean;
  plugins: boolean;
  voice: boolean;
  analytics: boolean;
  
  // System (always available in settings)
  settings: boolean;
  power: boolean;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'dex:simpleMode';

const DEFAULT_CONFIG: SimpleModeConfig = {
  enabled: true, // Simple mode on by default for new users
  hiddenFeatures: [],
  enabledAdvanced: [],
};

// Features hidden in simple mode
const SIMPLE_MODE_HIDDEN: string[] = [
  'code',
  'workflows',
  'actions',
  'scheduler',
  'transfers',
  'analytics',
];

// Features that require explicit enabling
const ADVANCED_FEATURES: string[] = [
  'ai',
  'scripts',
  'plugins',
  'voice',
];

// -----------------------------------------------------------------------------
// Simple Mode Hook
// -----------------------------------------------------------------------------

export function useSimpleMode() {
  const [config, setConfig] = useState<SimpleModeConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  // Load config from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch {
      // Parse failed or localStorage unavailable - use defaults silently
    }
    setLoaded(true);
  }, []);

  // Save config to storage
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      } catch {
        // localStorage unavailable (private browsing) - config will reset on reload
      }
    }
  }, [config, loaded]);

  // Toggle simple mode
  const toggleSimpleMode = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  }, []);

  // Enable advanced mode
  const enableAdvancedMode = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      enabled: false,
    }));
  }, []);

  // Enable specific advanced feature
  const enableFeature = useCallback((feature: string) => {
    setConfig(prev => ({
      ...prev,
      enabledAdvanced: [...new Set([...prev.enabledAdvanced, feature])],
    }));
  }, []);

  // Disable specific advanced feature
  const disableFeature = useCallback((feature: string) => {
    setConfig(prev => ({
      ...prev,
      enabledAdvanced: prev.enabledAdvanced.filter(f => f !== feature),
    }));
  }, []);

  // Check if feature is visible
  const isFeatureVisible = useCallback((feature: string): boolean => {
    // Always visible features
    if (['home', 'notes', 'tasks', 'search', 'settings'].includes(feature)) {
      return true;
    }

    // Advanced features require explicit enabling
    if (ADVANCED_FEATURES.includes(feature)) {
      return config.enabledAdvanced.includes(feature);
    }

    // In simple mode, hide progressive features
    if (config.enabled && SIMPLE_MODE_HIDDEN.includes(feature)) {
      return false;
    }

    return true;
  }, [config]);

  // Check if feature is advanced
  const isAdvancedFeature = useCallback((feature: string): boolean => {
    return ADVANCED_FEATURES.includes(feature);
  }, []);

  // Get feature visibility map
  const featureVisibility: FeatureVisibility = {
    home: true,
    notes: true,
    tasks: true,
    search: true,
    settings: true,
    power: true,
    
    code: isFeatureVisible('code'),
    workflows: isFeatureVisible('workflows'),
    actions: isFeatureVisible('actions'),
    scheduler: isFeatureVisible('scheduler'),
    transfers: isFeatureVisible('transfers'),
    
    ai: isFeatureVisible('ai'),
    scripts: isFeatureVisible('scripts'),
    plugins: isFeatureVisible('plugins'),
    voice: isFeatureVisible('voice'),
    analytics: isFeatureVisible('analytics'),
  };

  return {
    simpleMode: config.enabled,
    config,
    loaded,
    toggleSimpleMode,
    enableAdvancedMode,
    enableFeature,
    disableFeature,
    isFeatureVisible,
    isAdvancedFeature,
    featureVisibility,
  };
}

// -----------------------------------------------------------------------------
// Simple Mode Context (for app-wide access)
// -----------------------------------------------------------------------------

import React, { createContext, useContext } from 'react';

interface SimpleModeContextValue {
  simpleMode: boolean;
  loaded: boolean;
  toggleSimpleMode: () => void;
  enableAdvancedMode: () => void;
  enableFeature: (feature: string) => void;
  disableFeature: (feature: string) => void;
  isFeatureVisible: (feature: string) => boolean;
  isAdvancedFeature: (feature: string) => boolean;
  featureVisibility: FeatureVisibility;
}

const SimpleModeContext = createContext<SimpleModeContextValue | null>(null);

export const SimpleModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useSimpleMode();
  return (
    <SimpleModeContext.Provider value={value}>
      {children}
    </SimpleModeContext.Provider>
  );
};

export const useSimpleModeContext = (): SimpleModeContextValue => {
  const context = useContext(SimpleModeContext);
  if (!context) {
    throw new Error('useSimpleModeContext must be used within SimpleModeProvider');
  }
  return context;
};

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

export const getDefaultConfig = (): SimpleModeConfig => DEFAULT_CONFIG;

export const isFirstTimeUser = (): boolean => {
  try {
    return !localStorage.getItem('dex:firstRunComplete');
  } catch {
    // localStorage unavailable - treat as first time user
    return true;
  }
};

export const markOnboardingComplete = (): void => {
  try {
    localStorage.setItem('dex:firstRunComplete', 'true');
  } catch {
    // localStorage unavailable (private browsing) - onboarding will show again
  }
};

export default useSimpleMode;
