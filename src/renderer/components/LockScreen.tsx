// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// LOCK SCREEN - Full-Screen Authentication Overlay
// Renders when the app is locked, blocking all interaction behind it.
// Supports PIN (4/6 digit), password, and biometric authentication.
// Animated gradient background that runs continuously behind the login.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { sharedTick } from '../services/SharedTick';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type AuthMode = 'pin' | 'password' | 'biometric';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PIN_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

const SHAKE_DURATION = 520;
const ERROR_DISPLAY_MS = 3000;

// -----------------------------------------------------------------------------
// Animated Background - runs as a login background effect
// -----------------------------------------------------------------------------

const AnimatedBackground: React.FC = React.memo(() => (
  <>
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(160deg, #000000 0%, #0a0a0a 30%, #111111 60%, #0a0a0a 100%)',
    }} />
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse at 50% 40%, var(--color-border-subtle) 0%, transparent 60%)',
    }} />
  </>
));
AnimatedBackground.displayName = 'AnimatedBackground';

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export const LockScreen: React.FC = () => {
  const {
    isLocked,
    isEnabled,
    method,
    lockoutStatus,
    isLoading,
    error: storeError,
    authenticateWithPassword,
    authenticateWithPin,
    authenticateWithBiometric,
    authenticateWithRecovery,
    idleWarning,
    setIdleWarning,
    setError,
    config,
  } = useAuthStore();

  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [unlocking, setUnlocking] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [idleSeconds, setIdleSeconds] = useState(0);

  const passwordRef = useRef<HTMLInputElement>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout>>();
  const errorTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Determine the active authentication mode
  const authMode: AuthMode = useMemo(() => {
    if (method.includes('pin')) return 'pin';
    if (method.includes('password')) return 'password';
    if (method === 'biometric') return 'biometric';
    return 'pin';
  }, [method]);

  const pinLength = config?.pinLength ?? 4;

  // Clock tick
  useEffect(() => {
    if (!isLocked || !isEnabled) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 30_000);
    setCurrentTime(new Date());
    return () => clearInterval(interval);
  }, [isLocked, isEnabled]);

  // Pause/resume SharedTick while lock screen is visible
  useEffect(() => {
    if (isLocked && isEnabled) {
      sharedTick.pause();
      return () => { sharedTick.resume(); };
    }
  }, [isLocked, isEnabled]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
    };
  }, []);

  // Fade-out transition when unlocking
  useEffect(() => {
    if (!isLocked && unlocking) {
      const t = setTimeout(() => setUnlocking(false), 600);
      return () => clearTimeout(t);
    }
  }, [isLocked, unlocking]);

  // Focus password input when it mounts
  useEffect(() => {
    if (authMode === 'password' && isLocked) {
      setTimeout(() => passwordRef.current?.focus(), 200);
    }
  }, [authMode, isLocked]);

  // Reset fields when lock state changes
  useEffect(() => {
    setPin('');
    setPassword('');
    setLocalError('');
    setError(null);
    setShowRecovery(false);
    setRecoveryCode('');
  }, [isLocked, setError]);

  // Listen for idle warning from main process
  useEffect(() => {
    const handler = (_event: any, data: { secondsUntilLock: number }) => {
      setIdleWarning({ active: true, seconds: data.secondsUntilLock });
      setIdleSeconds(data.secondsUntilLock);
    };
    window.electron?.ipcRenderer?.on?.('auth:idleWarning', handler);

    let countdown: ReturnType<typeof setInterval>;
    if (idleWarning?.active) {
      countdown = setInterval(() => {
        setIdleSeconds(prev => {
          if (prev <= 1) {
            setIdleWarning(null);
            clearInterval(countdown);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      window.electron?.ipcRenderer?.off?.('auth:idleWarning', handler);
      if (countdown) clearInterval(countdown);
    };
  }, [idleWarning?.active, setIdleWarning]);

  // Recovery code submission
  const handleRecoverySubmit = useCallback(async () => {
    if (!recoveryCode.trim()) return;
    const ok = await authenticateWithRecovery(recoveryCode.trim());
    if (!ok) {
      triggerShake();
      showLocalError('Invalid recovery code');
    } else {
      setShowRecovery(false);
      setRecoveryCode('');
    }
  }, [recoveryCode, authenticateWithRecovery]);

  // Display error from store or local
  const displayError = localError || storeError || '';

  const triggerShake = useCallback(() => {
    setShake(true);
    shakeTimeout.current = setTimeout(() => setShake(false), SHAKE_DURATION);
  }, []);

  const showLocalError = useCallback((msg: string) => {
    setLocalError(msg);
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setLocalError(''), ERROR_DISPLAY_MS);
  }, []);

  // --- PIN Authentication ---

  const handlePinDigit = useCallback(async (digit: string) => {
    if (lockoutStatus.isLockedOut || isLoading) return;

    if (digit === 'del') {
      setPin(prev => prev.slice(0, -1));
      return;
    }

    const next = pin + digit;
    if (next.length > pinLength) return;
    setPin(next);

    if (next.length === pinLength) {
      const success = await authenticateWithPin(next);
      if (success) {
        setUnlocking(true);
      } else {
        triggerShake();
        showLocalError('Incorrect PIN');
        setTimeout(() => setPin(''), SHAKE_DURATION);
      }
    }
  }, [pin, pinLength, lockoutStatus.isLockedOut, isLoading, authenticateWithPin, triggerShake, showLocalError]);

  // --- Password Authentication ---

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutStatus.isLockedOut || isLoading || !password.trim()) return;

    const success = await authenticateWithPassword(password);
    if (success) {
      setUnlocking(true);
    } else {
      triggerShake();
      showLocalError('Incorrect password');
      setPassword('');
    }
  }, [password, lockoutStatus.isLockedOut, isLoading, authenticateWithPassword, triggerShake, showLocalError]);

  // --- Biometric Authentication ---

  const handleBiometric = useCallback(async () => {
    if (lockoutStatus.isLockedOut || isLoading) return;
    const success = await authenticateWithBiometric();
    if (success) {
      setUnlocking(true);
    } else {
      triggerShake();
      showLocalError('Biometric authentication failed');
    }
  }, [lockoutStatus.isLockedOut, isLoading, authenticateWithBiometric, triggerShake, showLocalError]);

  // Keyboard handler for PIN mode
  useEffect(() => {
    if (!isLocked || !isEnabled || authMode !== 'pin') return;

    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        handlePinDigit('del');
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, isEnabled, authMode, handlePinDigit]);

  // Auto-trigger biometric on mount if that is the primary method
  useEffect(() => {
    if (isLocked && isEnabled && method === 'biometric') {
      const timer = setTimeout(() => handleBiometric(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, isEnabled, method, handleBiometric]);

  // Always show lock screen on startup (as welcome screen if auth not enabled)
  // When auth is not enabled, user can click/press any key to dismiss
  const isWelcomeMode = !isEnabled;
  const [dismissed, setDismissed] = useState(() => {
    try { return !!sessionStorage.getItem('dex-lock-dismissed'); } catch { return false; }
  });

  // Dismiss welcome screen on click or keypress
  const handleWelcomeDismiss = useCallback(() => {
    if (!isWelcomeMode || dismissed) return;
    setUnlocking(true);
    setTimeout(() => {
      try { sessionStorage.setItem('dex-lock-dismissed', '1'); } catch (e) { console.warn('[DEX]', e); }
      setDismissed(true);
    }, 500);
  }, [isWelcomeMode, dismissed]);

  // Listen for keypress to dismiss welcome screen
  useEffect(() => {
    if (!isWelcomeMode || dismissed) return;
    const handler = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      handleWelcomeDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isWelcomeMode, dismissed, handleWelcomeDismiss]);

  // Don't render welcome/lock screen if auth is not enabled — go straight to desktop.
  // Critical: also bail when auth is disabled so a stray `isLocked: true` (e.g. initial
  // store default or a stale persisted flag) can never paint a blank full-screen overlay
  // over the live workspace.
  if (isWelcomeMode) return null;
  if (!isEnabled) return null;
  if (!isLocked && !unlocking) return null;

  // Format time
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const timeStr = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')}`;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const dateStr = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const lockoutMessage = lockoutStatus.isLockedOut
    ? `Too many attempts. Try again in ${lockoutStatus.remainingMinutes} minute${lockoutStatus.remainingMinutes !== 1 ? 's' : ''}.`
    : '';

  return (
    <div style={{
      ...styles.overlay,
      opacity: unlocking ? 0 : 1,
      transition: 'opacity 0.5s ease-out',
      pointerEvents: unlocking ? 'none' : 'auto',
    }} role="dialog" aria-label="Lock Screen" aria-modal="true">
      <style>{lockScreenCSS}</style>

      <AnimatedBackground />

      <div style={styles.content} onClick={isWelcomeMode ? handleWelcomeDismiss : undefined}>
        {/* Clock */}
        <div style={styles.clockSection}>
          <div style={styles.time}>
            {timeStr}
            <span style={styles.ampm}>{ampm}</span>
          </div>
          <div style={styles.date}>{dateStr}</div>
        </div>

        {/* Welcome mode: just show hint to continue */}
        {isWelcomeMode && (
          <div style={{ textAlign: 'center', animation: 'fadeInUp 1s ease-out 0.5s both' }}>
            <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>
              Click anywhere or press any key
            </div>
          </div>
        )}

        {/* Auth Section - only when auth is enabled */}
        {!isWelcomeMode && <div
          style={styles.authSection}
          className={shake ? 'lock-shake' : ''}
        >
          {/* Lockout Warning */}
          {lockoutStatus.isLockedOut && (
            <div style={styles.lockoutBanner} role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 8, flexShrink: 0 }}>
                <path d="M8 1L1 14h14L8 1z" stroke="#ff9f0a" strokeWidth="1.5" fill="none" />
                <path d="M8 6v4M8 11.5v.5" stroke="#ff9f0a" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {lockoutMessage}
            </div>
          )}

          {/* PIN Input */}
          {authMode === 'pin' && (
            <div style={styles.pinSection}>
              <div style={styles.authLabel}>Enter PIN</div>
              <div style={styles.pinDots} aria-label={`PIN entry, ${pin.length} of ${pinLength} digits entered`}>
                {Array.from({ length: pinLength }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.pinDot,
                      ...(i < pin.length ? styles.pinDotFilled : {}),
                    }}
                  />
                ))}
              </div>

              <div style={styles.numpad}>
                {PIN_DIGITS.map((digit, i) => {
                  if (digit === '') {
                    return <div key={i} style={styles.numpadSpacer} />;
                  }
                  const isDisabled = lockoutStatus.isLockedOut || isLoading;
                  if (digit === 'del') {
                    return (
                      <button
                        key={i}
                        style={{...styles.numpadKey, opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer'}}
                        className="lock-numpad-key"
                        onClick={() => handlePinDigit('del')}
                        disabled={isDisabled}
                        aria-label="Delete last digit"
                        aria-disabled={isDisabled}
                        tabIndex={isDisabled ? -1 : 0}
                      >
                        <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
                          <path
                            d="M7 1l-6 8 6 8h14V1H7zM11 6l4 4m0-4l-4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={i}
                      style={{...styles.numpadKey, opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer'}}
                      className="lock-numpad-key"
                      onClick={() => handlePinDigit(digit)}
                      disabled={isDisabled}
                      aria-label={`Digit ${digit}`}
                      aria-disabled={isDisabled}
                      tabIndex={isDisabled ? -1 : 0}
                    >
                      {digit}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Password Input */}
          {authMode === 'password' && (
            <form style={styles.passwordSection} onSubmit={handlePasswordSubmit}>
              <div style={styles.authLabel}>Enter Password</div>
              <div style={styles.passwordField}>
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => setCapsLockOn(e.getModifierState('CapsLock'))}
                  onKeyUp={e => setCapsLockOn(e.getModifierState('CapsLock'))}
                  placeholder="Password"
                  style={styles.passwordInput}
                  className="lock-password-input"
                  disabled={lockoutStatus.isLockedOut || isLoading}
                  autoComplete="current-password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  style={styles.toggleVisibility}
                  className="lock-toggle-vis"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              </div>
              {capsLockOn && !showPassword && (
                <div style={{ fontSize: 11, color: 'rgba(255,214,10,0.85)', textAlign: 'center', marginTop: -4, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12M12 12L7 17M12 12l5 5"/><rect x="5" y="3" width="14" height="6" rx="1"/></svg>
                  Caps Lock is on
                </div>
              )}
              <button
                type="submit"
                style={{
                  ...styles.unlockBtn,
                  ...(lockoutStatus.isLockedOut || isLoading ? styles.unlockBtnDisabled : {}),
                }}
                className="lock-unlock-btn"
                disabled={lockoutStatus.isLockedOut || isLoading || !password.trim()}
              >
                {isLoading ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>
          )}

          {/* Biometric Prompt */}
          {authMode === 'biometric' && (
            <div style={styles.biometricSection}>
              <button
                style={styles.biometricBtn}
                className="lock-biometric-btn"
                onClick={handleBiometric}
                disabled={lockoutStatus.isLockedOut || isLoading}
                aria-label="Authenticate with biometrics"
              >
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4z" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
                  <path d="M16 28c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M20 28c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M24 28v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={styles.biometricLabel}>
                  {isLoading ? 'Authenticating...' : 'Touch to Unlock'}
                </span>
              </button>
            </div>
          )}

          {/* Biometric fallback link when in pin/password mode */}
          {method.includes('biometric') && authMode !== 'biometric' && (
            <button
              style={styles.fallbackLink}
              className="lock-fallback-link"
              onClick={handleBiometric}
              aria-label="Authenticate with biometrics"
              disabled={lockoutStatus.isLockedOut || isLoading}
            >
              Use Biometrics
            </button>
          )}

          {/* Error message */}
          {displayError && !lockoutStatus.isLockedOut && (
            <div style={styles.errorMsg} role="alert" aria-live="assertive">
              {displayError}
            </div>
          )}

          {/* Attempts remaining */}
          {!lockoutStatus.isLockedOut && lockoutStatus.attemptsRemaining < 5 && lockoutStatus.attemptsRemaining > 0 && (
            <div style={styles.attemptsMsg}>
              {lockoutStatus.attemptsRemaining} attempt{lockoutStatus.attemptsRemaining !== 1 ? 's' : ''} remaining
            </div>
          )}

          {/* Recovery code link */}
          {(method.includes('pin') || method.includes('password')) && !showRecovery && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: '12px', cursor: 'pointer', marginTop: '12px', padding: '4px 8px' }}
              onClick={() => setShowRecovery(true)}
            >
              Forgot PIN / Password?
            </button>
          )}

          {/* Recovery code input */}
          {showRecovery && (
            <div style={{ marginTop: '16px', width: '100%', maxWidth: '280px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px', textAlign: 'center' }}>
                Enter a recovery code
              </div>
              <input
                type="text"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                style={{
                  width: '100%', padding: '12px', background: 'var(--color-border-subtle)',
                  border: '1px solid var(--color-border)', borderRadius: '8px',
                  color: '#fff', fontSize: '16px', textAlign: 'center',
                  fontFamily: 'monospace', letterSpacing: '2px',
                  outline: 'none',
                }}
                onKeyDown={e => e.key === 'Enter' && handleRecoverySubmit()}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'center' }}>
                <button
                  onClick={handleRecoverySubmit}
                  disabled={isLoading || !recoveryCode.trim()}
                  style={{
                    padding: '8px 20px', borderRadius: '6px', border: 'none',
                    background: 'rgba(74,158,255,0.3)', color: '#fff', fontSize: '13px',
                    cursor: 'pointer', opacity: (!recoveryCode.trim() || isLoading) ? 0.5 : 1,
                  }}
                >
                  Verify
                </button>
                <button
                  onClick={() => { setShowRecovery(false); setRecoveryCode(''); }}
                  style={{
                    padding: '8px 20px', borderRadius: '6px', border: 'none',
                    background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                    fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>}
      </div>

      {/* Idle warning overlay — shown before screen locks */}
      {!isLocked && idleWarning?.active && idleSeconds > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 'var(--z-max)', padding: '10px 20px',
          background: 'linear-gradient(135deg, rgba(255,159,10,0.95), rgba(255,69,58,0.9))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          fontSize: '13px', fontWeight: 600, color: '#fff',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          Screen will lock in {idleSeconds}s due to inactivity
          <button
            onClick={() => setIdleWarning(null)}
            style={{
              padding: '4px 14px', borderRadius: '4px', border: '1px solid var(--color-text-tertiary)',
              background: 'var(--color-border)', color: '#fff', fontSize: '12px',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Stay Active
          </button>
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 'var(--z-max)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 48,
  },
  clockSection: {
    textAlign: 'center',
  },
  time: {
    fontSize: 72,
    fontWeight: 200,
    color: 'var(--color-text-primary)',
    letterSpacing: -2,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  ampm: {
    fontSize: 20,
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    marginLeft: 8,
    verticalAlign: 'super',
  },
  date: {
    fontSize: 17,
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    marginTop: 8,
  },
  authSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    minWidth: 280,
  },
  authLabel: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
    textAlign: 'center',
  },
  lockoutBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 8,
    background: 'rgba(255,159,10,0.12)',
    border: '1px solid rgba(255,159,10,0.25)',
    color: 'var(--color-warning)',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 8,
    maxWidth: 320,
    textAlign: 'center',
  },

  // PIN
  pinSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  pinDots: {
    display: 'flex',
    gap: 14,
    marginBottom: 4,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid var(--color-text-tertiary)',
    background: 'transparent',
    transition: 'all 0.2s ease',
  },
  pinDotFilled: {
    background: '#ffffff',
    borderColor: 'var(--color-text-primary)',
    boxShadow: '0 0 8px var(--color-text-tertiary)',
  },
  numpad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 72px)',
    gap: 12,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: 28,
    fontWeight: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  numpadSpacer: {
    width: 72,
    height: 72,
  },

  // Password
  passwordSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    width: 320,
  },
  passwordField: {
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: 16,
    padding: '0 44px 0 16px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  toggleVisibility: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-accent)',
    color: 'var(--color-text-primary)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  unlockBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  // Biometric
  biometricSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  biometricBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: 20,
    borderRadius: 14,
    transition: 'background 0.15s ease',
  },
  biometricLabel: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },

  // Fallback / Error / Attempts
  fallbackLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '4px 8px',
    marginTop: 4,
    fontFamily: 'inherit',
  },
  errorMsg: {
    color: 'var(--color-error)',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'center',
    marginTop: 4,
  },
  attemptsMsg: {
    color: 'var(--color-text-tertiary)',
    fontSize: 12,
    textAlign: 'center',
  },
};

// -----------------------------------------------------------------------------
// CSS (animations + hover states that can't be done inline)
// -----------------------------------------------------------------------------

const lockScreenCSS = `
  [role="dialog"][aria-label="Lock Screen"] {
    -webkit-app-region: drag;
  }
  [role="dialog"][aria-label="Lock Screen"] > div:last-child {
    -webkit-app-region: no-drag;
  }

  @keyframes lockGradientShift {
    0% { background-position: 0% 50%; }
    25% { background-position: 100% 50%; }
    50% { background-position: 100% 0%; }
    75% { background-position: 0% 100%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes lockFloat0 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    33% { transform: translate(-40%, -60%) scale(1.1); }
    66% { transform: translate(-60%, -40%) scale(0.9); }
  }
  @keyframes lockFloat1 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-55%, -45%) scale(1.15); }
  }
  @keyframes lockFloat2 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    40% { transform: translate(-45%, -55%) scale(1.08); }
    80% { transform: translate(-55%, -48%) scale(0.95); }
  }
  @keyframes lockFloat3 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-48%, -55%) scale(1.12); }
  }
  @keyframes lockFloat4 {
    0%, 100% { transform: translate(-50%, -50%) scale(1); }
    35% { transform: translate(-55%, -48%) scale(1.06); }
    70% { transform: translate(-46%, -52%) scale(0.94); }
  }

  @keyframes lock-shake {
    0%, 100% { transform: translateX(0); }
    15% { transform: translateX(-12px); }
    30% { transform: translateX(10px); }
    45% { transform: translateX(-8px); }
    60% { transform: translateX(6px); }
    75% { transform: translateX(-3px); }
    90% { transform: translateX(1px); }
  }

  .lock-shake {
    animation: lock-shake ${SHAKE_DURATION}ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }

  .lock-numpad-key:hover:not(:disabled) {
    background: var(--color-border) !important;
  }

  .lock-numpad-key:active:not(:disabled) {
    background: var(--color-text-tertiary) !important;
    transform: scale(0.95);
  }

  .lock-numpad-key:focus-visible {
    box-shadow: 0 0 0 2px #0a84ff;
  }

  .lock-password-input:focus {
    border-color: rgba(10,132,255,0.6) !important;
    box-shadow: 0 0 0 3px rgba(10,132,255,0.15);
  }

  .lock-unlock-btn:hover:not(:disabled) {
    background: #0070e0 !important;
  }

  .lock-unlock-btn:active:not(:disabled) {
    background: #005bb5 !important;
    transform: scale(0.98);
  }

  .lock-biometric-btn:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  .lock-fallback-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .lock-toggle-vis:hover {
    color: var(--color-text-secondary) !important;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export default LockScreen;
