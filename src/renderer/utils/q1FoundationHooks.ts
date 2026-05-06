// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Q1 Foundation Renderer Hooks
// Client-side integration for Q1 security hardening systems
// ===========================================================================

declare global {
  interface Window {
    q1Foundation: {
      // Auth Hardening
      validatePassword: (password: string) => Promise<{ valid: boolean; errors: string[] }>;
      calculatePasswordStrength: (password: string) => Promise<{
        score: number;
        level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
        feedback: string[];
        estimatedCrackTime: string;
      }>;
      validatePIN: (pin: string) => Promise<{ valid: boolean; errors: string[] }>;
      getLockoutStatus: () => Promise<{
        lockedOut: boolean;
        remainingSeconds: number;
        attemptsMade: number;
        maxAttempts: number;
      }>;
      getAuthAuditLog: (count?: number) => Promise<Array<{
        id: string;
        timestamp: number;
        event: string;
        method: string;
        success: boolean;
        failureReason?: string;
      }>>;
      recordActivity: () => void;
      
      // Vault Hardening
      generatePassword: (options?: {
        length?: number;
        uppercase?: boolean;
        lowercase?: boolean;
        numbers?: boolean;
        symbols?: boolean;
        excludeSimilar?: boolean;
        excludeAmbiguous?: boolean;
      }) => Promise<string>;
      checkPasswordBreach: (password: string) => Promise<{
        breached: boolean;
        breachCount: number;
        lastBreachDate?: string;
        sources?: string[];
      }>;
      getVaultAccessHistory: (filters?: {
        itemId?: string;
        action?: string;
        startTime?: number;
        endTime?: number;
        limit?: number;
      }) => Promise<Array<{
        id: string;
        timestamp: number;
        action: string;
        itemId?: string;
        itemType: string;
        success: boolean;
      }>>;
      scheduleClipboardClear: (clipboardId: string) => void;
      clearClipboardNow: () => void;
      logVaultAccess: (entry: {
        action: string;
        itemType: string;
        itemId?: string;
        success: boolean;
        failureReason?: string;
      }) => void;
      
      // Session Hardening
      getAllTabs: () => Promise<Array<{
        id: string;
        url: string;
        title: string;
        isActive: boolean;
        isResponsive: boolean;
        memoryUsage?: number;
      }>>;
      getTabHealth: (tabId: string) => Promise<{
        id: string;
        status: 'healthy' | 'warning' | 'critical' | 'unresponsive';
        memoryUsageMB: number;
        lastResponseTime: number;
        issues: string[];
      } | null>;
      getAllTabHealth: () => Promise<Array<{
        id: string;
        status: string;
        memoryUsageMB: number;
        issues: string[];
      }>>;
      captureSessionSnapshot: (reason?: string) => Promise<{
        id: string;
        timestamp: number;
        tabs: Array<{ id: string; url: string; title: string }>;
      } | null>;
      getLatestSnapshot: () => Promise<{
        id: string;
        timestamp: number;
        tabs: Array<{ id: string; url: string; title: string }>;
      } | null>;
      
      // Q1 Foundation Status
      getStatus: () => Promise<Array<{
        name: string;
        initialized: boolean;
        healthy: boolean;
        lastCheck: number;
        metrics: Record<string, number | string>;
      }>>;
      getReport: () => Promise<{
        timestamp: number;
        overallHealth: 'healthy' | 'degraded' | 'unhealthy';
        systems: Array<{ name: string; initialized: boolean; healthy: boolean }>;
        recommendations: string[];
      }>;
      isInitialized: () => Promise<boolean>;
    };
  }
}

// ===========================================================================
// REACT HOOKS
// ===========================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// -------------------------------------------------------------------------
// AUTH HARDENING HOOKS
// -------------------------------------------------------------------------

/**
 * Hook for password validation and strength checking
 */
export function usePasswordValidation() {
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] });
  const [strength, setStrength] = useState<{
    score: number;
    level: string;
    feedback: string[];
    estimatedCrackTime: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkPassword = useCallback(async (pwd: string) => {
    if (!pwd) {
      setValidation({ valid: true, errors: [] });
      setStrength(null);
      return;
    }

    setIsChecking(true);
    try {
      const [validationResult, strengthResult] = await Promise.all([
        window.q1Foundation.validatePassword(pwd),
        window.q1Foundation.calculatePasswordStrength(pwd),
      ]);
      setValidation(validationResult);
      setStrength(strengthResult);
    } catch (error) {
      console.error('Password validation failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      checkPassword(password);
    }, 300);
    return () => clearTimeout(debounce);
  }, [password, checkPassword]);

  return {
    password,
    setPassword,
    validation,
    strength,
    isChecking,
    isValid: validation.valid && (strength?.score ?? 0) >= 40,
  };
}

/**
 * Hook for PIN validation
 */
export function usePINValidation() {
  const [pin, setPIN] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] });
  const [isChecking, setIsChecking] = useState(false);

  const checkPIN = useCallback(async (p: string) => {
    if (!p) {
      setValidation({ valid: true, errors: [] });
      return;
    }

    setIsChecking(true);
    try {
      const result = await window.q1Foundation.validatePIN(p);
      setValidation(result);
    } catch (error) {
      console.error('PIN validation failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkPIN(pin);
  }, [pin, checkPIN]);

  return {
    pin,
    setPIN,
    validation,
    isChecking,
    isValid: validation.valid,
  };
}

/**
 * Hook for lockout status monitoring
 */
export function useLockoutStatus() {
  const [status, setStatus] = useState<{
    lockedOut: boolean;
    remainingSeconds: number;
    attemptsMade: number;
    maxAttempts: number;
  } | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await window.q1Foundation.getLockoutStatus();
        setStatus(result);
      } catch (error) {
        console.error('Failed to get lockout status:', error);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return status;
}

// -------------------------------------------------------------------------
// VAULT HARDENING HOOKS
// -------------------------------------------------------------------------

/**
 * Hook for password generation
 */
export function usePasswordGenerator() {
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [options, setOptions] = useState({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeSimilar: true,
    excludeAmbiguous: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const password = await window.q1Foundation.generatePassword(options);
      setGeneratedPassword(password);
      return password;
    } catch (error) {
      console.error('Password generation failed:', error);
      return '';
    } finally {
      setIsGenerating(false);
    }
  }, [options]);

  return {
    generatedPassword,
    options,
    setOptions,
    generate,
    isGenerating,
  };
}

/**
 * Hook for breach checking
 */
export function useBreachCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<{
    breached: boolean;
    breachCount: number;
    lastBreachDate?: string;
    sources?: string[];
  } | null>(null);

  const checkPassword = useCallback(async (password: string) => {
    if (!password) {
      setResult(null);
      return null;
    }

    setIsChecking(true);
    try {
      const breachResult = await window.q1Foundation.checkPasswordBreach(password);
      setResult(breachResult);
      return breachResult;
    } catch (error) {
      console.error('Breach check failed:', error);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    checkPassword,
    result,
    isChecking,
  };
}

/**
 * Hook for vault access history
 */
export function useVaultAccessHistory(limit: number = 50) {
  const [history, setHistory] = useState<Array<{
    id: string;
    timestamp: number;
    action: string;
    itemId?: string;
    itemType: string;
    success: boolean;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.q1Foundation.getVaultAccessHistory({ limit });
      setHistory(result);
    } catch (error) {
      console.error('Failed to get vault access history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, isLoading, refresh };
}

// -------------------------------------------------------------------------
// SESSION HARDENING HOOKS
// -------------------------------------------------------------------------

/**
 * Hook for tab health monitoring
 */
export function useTabHealth() {
  const [tabHealth, setTabHealth] = useState<Array<{
    id: string;
    status: string;
    memoryUsageMB: number;
    issues: string[];
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const health = await window.q1Foundation.getAllTabHealth();
        setTabHealth(health);
      } catch (error) {
        console.error('Failed to get tab health:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Reduced: was 5s, now 30s
    return () => clearInterval(interval);
  }, []);

  const unhealthyTabs = tabHealth.filter(t => t.status !== 'healthy');
  const criticalTabs = tabHealth.filter(t => t.status === 'critical' || t.status === 'unresponsive');

  return {
    tabHealth,
    unhealthyTabs,
    criticalTabs,
    isLoading,
    hasIssues: unhealthyTabs.length > 0,
  };
}

/**
 * Hook for session snapshots
 */
export function useSessionSnapshots() {
  const [latestSnapshot, setLatestSnapshot] = useState<{
    id: string;
    timestamp: number;
    tabs: Array<{ id: string; url: string; title: string }>;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const snapshot = await window.q1Foundation.getLatestSnapshot();
        setLatestSnapshot(snapshot);
      } catch (error) {
        console.error('Failed to get latest snapshot:', error);
      }
    };
    fetchLatest();
  }, []);

  const captureSnapshot = useCallback(async (reason?: string) => {
    setIsCapturing(true);
    try {
      const snapshot = await window.q1Foundation.captureSessionSnapshot(reason);
      if (snapshot) {
        setLatestSnapshot(snapshot);
      }
      return snapshot;
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return {
    latestSnapshot,
    captureSnapshot,
    isCapturing,
  };
}

// -------------------------------------------------------------------------
// Q1 FOUNDATION STATUS HOOKS
// -------------------------------------------------------------------------

/**
 * Hook for Q1 Foundation overall status
 */
export function useQ1Status() {
  const [status, setStatus] = useState<Array<{
    name: string;
    initialized: boolean;
    healthy: boolean;
    lastCheck: number;
    metrics: Record<string, number | string>;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await window.q1Foundation.getStatus();
        setStatus(result);
      } catch (error) {
        console.error('Failed to get Q1 status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const allHealthy = status.every(s => s.healthy);
  const unhealthySystems = status.filter(s => !s.healthy);

  return {
    status,
    isLoading,
    allHealthy,
    unhealthySystems,
  };
}

/**
 * Hook for Q1 Foundation health report
 */
export function useQ1Report() {
  const [report, setReport] = useState<{
    timestamp: number;
    overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    systems: Array<{ name: string; initialized: boolean; healthy: boolean }>;
    recommendations: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.q1Foundation.getReport();
      setReport(result);
    } catch (error) {
      console.error('Failed to get Q1 report:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    report,
    isLoading,
    refresh,
  };
}

// -------------------------------------------------------------------------
// ACTIVITY TRACKING
// -------------------------------------------------------------------------

/**
 * Hook for automatic activity recording (extends auth session)
 */
export function useActivityTracking() {
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    const recordActivity = () => {
      const now = Date.now();
      // Only record if at least 5 seconds since last activity
      if (now - lastActivityRef.current > 5000) {
        lastActivityRef.current = now;
        window.q1Foundation.recordActivity();
      }
    };

    // Track various user activities
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, recordActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, recordActivity);
      });
    };
  }, []);
}

// -------------------------------------------------------------------------
// CLIPBOARD SECURITY
// -------------------------------------------------------------------------

/**
 * Hook for secure clipboard operations
 */
export function useSecureClipboard() {
  const [lastCopyId, setLastCopyId] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (text: string, autoDelete: boolean = true) => {
    try {
      await navigator.clipboard.writeText(text);
      
      if (autoDelete) {
        const copyId = crypto.randomUUID();
        setLastCopyId(copyId);
        window.q1Foundation.scheduleClipboardClear(copyId);
        
        // Log the copy action
        window.q1Foundation.logVaultAccess({
          action: 'copy',
          itemType: 'credential',
          success: true,
        });
      }
      
      return true;
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      return false;
    }
  }, []);

  const clearClipboard = useCallback(() => {
    window.q1Foundation.clearClipboardNow();
    setLastCopyId(null);
  }, []);

  return {
    copyToClipboard,
    clearClipboard,
    hasPendingClear: lastCopyId !== null,
  };
}

// Export all hooks
export default {
  usePasswordValidation,
  usePINValidation,
  useLockoutStatus,
  usePasswordGenerator,
  useBreachCheck,
  useVaultAccessHistory,
  useTabHealth,
  useSessionSnapshots,
  useQ1Status,
  useQ1Report,
  useActivityTracking,
  useSecureClipboard,
};
