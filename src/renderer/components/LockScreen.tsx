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
import { space, radius, fontSize, fontWeight } from '../styles/tokens';

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

// Numpad keys shrink on narrow windows so the 3-column grid never overflows.
const NUMPAD_KEY_SIZE = 'clamp(56px, 12vw, 72px)';

// Auth widgets cap at their design width but never exceed the window.
const AUTH_MAX_WIDTH = 'min(320px, calc(100vw - 48px))';

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
            <div style={{ fontSize: 13, fontWeight: fontWeight.normal, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: space[2], flexShrink: 0 }}>
                <path d="M8 1L1 14h14L8 1z" stroke="var(--color-warning, #ff9f0a)" strokeWidth="1.5" fill="none" />
                <path d="M8 6v4M8 11.5v.5" stroke="var(--color-warning, #ff9f0a)" strokeWidth="1.5" strokeLinecap="round" />
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
                <div style={{ fontSize: fontSize.xs, color: 'rgba(255,214,10,0.85)', textAlign: 'center', marginTop: -space[1], marginBottom: space[1], display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: fontSize.sm, cursor: 'pointer', marginTop: space[3], padding: `${space[1]}px ${space[2]}px` }}
              onClick={() => setShowRecovery(true)}
            >
              Forgot PIN / Password?
            </button>
          )}

          {/* Recovery code input */}
          {showRecovery && (
            <div style={{ marginTop: space[4], width: '100%', maxWidth: 'min(280px, calc(100vw - 48px))' }}>
              <div style={{ fontSize: fontSize.sm, color: 'var(--color-text-secondary)', marginBottom: space[2], textAlign: 'center' }}>
                Enter a recovery code
              </div>
              <input
                type="text"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                style={{
                  width: '100%', padding: space[3], background: 'var(--color-border-subtle)',
                  border: '1px solid var(--color-border)', borderRadius: radius.xl,
                  color: 'var(--color-text-primary, #fff)', fontSize: fontSize.lg, textAlign: 'center',
                  fontFamily: 'monospace', letterSpacing: '2px',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onKeyDown={e => e.key === 'Enter' && handleRecoverySubmit()}
              />
              <div style={{ display: 'flex', gap: space[2], marginTop: '10px', justifyContent: 'center' }}>
                <button
                  onClick={handleRecoverySubmit}
                  disabled={isLoading || !recoveryCode.trim()}
                  style={{
                    padding: `${space[2]}px ${space[5]}px`, borderRadius: radius.lg, border: 'none',
                    background: 'rgba(74,158,255,0.3)', color: 'var(--color-accent-text, #fff)', fontSize: '13px',
                    cursor: 'pointer', opacity: (!recoveryCode.trim() || isLoading) ? 0.5 : 1,
                  }}
                >
                  Verify
                </button>
                <button
                  onClick={() => { setShowRecovery(false); setRecoveryCode(''); }}
                  style={{
                    padding: `${space[2]}px ${space[5]}px`, borderRadius: radius.lg, border: 'none',
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
          zIndex: 'var(--z-max)', padding: '10px var(--space-5)',
          background: 'linear-gradient(135deg, rgba(255,159,10,0.95), rgba(255,69,58,0.9))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space[3],
          fontSize: '13px', fontWeight: fontWeight.semibold, color: '#fff',
          flexWrap: 'wrap', textAlign: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          Screen will lock in {idleSeconds}s due to inactivity
          <button
            onClick={() => setIdleWarning(null)}
            style={{
              padding: '4px 14px', borderRadius: radius.md, border: '1px solid var(--color-text-tertiary)',
              background: 'var(--color-border)', color: '#fff', fontSize: fontSize.sm,
              cursor: 'pointer', fontWeight: fontWeight.semibold,
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
    gap: `clamp(${space[6]}px, 6vh, ${space[12]}px)`,
    maxWidth: '100%',
    maxHeight: '100%',
    padding: `${space[4]}px ${space[6]}px`,
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  clockSection: {
    textAlign: 'center',
  },
  time: {
    fontSize: 'clamp(44px, 10vw, 72px)',
    fontWeight: 200,
    color: 'var(--color-text-primary)',
    letterSpacing: -2,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  ampm: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.normal,
    color: 'var(--color-text-secondary)',
    marginLeft: space[2],
    verticalAlign: 'super',
  },
  date: {
    fontSize: 17,
    fontWeight: fontWeight.normal,
    color: 'var(--color-text-secondary)',
    marginTop: space[2],
  },
  authSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space[4],
    minWidth: 'min(280px, calc(100vw - 48px))',
    maxWidth: '100%',
  },
  authLabel: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
    color: 'var(--color-text-secondary)',
    marginBottom: space[1],
    textAlign: 'center',
  },
  lockoutBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px var(--space-4)',
    borderRadius: radius.xl,
    background: 'var(--color-warning-muted, rgba(255,159,10,0.12))',
    border: '1px solid rgba(255,159,10,0.25)',
    color: 'var(--color-warning)',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    marginBottom: space[2],
    maxWidth: AUTH_MAX_WIDTH,
    textAlign: 'center',
  },

  // PIN
  pinSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space[5],
  },
  pinDots: {
    display: 'flex',
    gap: 14,
    marginBottom: space[1],
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
    background: 'var(--color-text-primary, #ffffff)',
    borderColor: 'var(--color-text-primary)',
    boxShadow: '0 0 8px var(--color-text-tertiary)',
  },
  numpad: {
    display: 'grid',
    gridTemplateColumns: `repeat(3, ${NUMPAD_KEY_SIZE})`,
    gap: space[3],
    justifyContent: 'center',
  },
  numpadKey: {
    width: NUMPAD_KEY_SIZE,
    height: NUMPAD_KEY_SIZE,
    borderRadius: '50%',
    border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: fontSize['3xl'],
    fontWeight: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  numpadSpacer: {
    width: NUMPAD_KEY_SIZE,
    height: NUMPAD_KEY_SIZE,
  },

  // Password
  passwordSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    width: AUTH_MAX_WIDTH,
  },
  passwordField: {
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    width: '100%',
    height: 48,
    borderRadius: radius['2xl'],
    border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    fontSize: fontSize.lg,
    padding: '0 44px 0 var(--space-4)',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  toggleVisibility: {
    position: 'absolute',
    right: space[2],
    top: 0,
    bottom: 0,
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
    borderRadius: radius.xl,
    border: 'none',
    background: 'var(--color-accent)',
    color: 'var(--color-text-primary)',
    fontSize: 15,
    fontWeight: fontWeight.semibold,
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
    gap: space[4],
  },
  biometricBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space[4],
    background: 'none',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    padding: space[5],
    borderRadius: 14,
    transition: 'background 0.15s ease',
  },
  biometricLabel: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
    color: 'var(--color-text-secondary)',
  },

  // Fallback / Error / Attempts
  fallbackLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    padding: `${space[1]}px ${space[2]}px`,
    marginTop: space[1],
    fontFamily: 'inherit',
  },
  errorMsg: {
    color: 'var(--color-error)',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginTop: space[1],
  },
  attemptsMsg: {
    color: 'var(--color-text-tertiary)',
    fontSize: fontSize.sm,
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
    box-shadow: 0 0 0 2px var(--color-accent, #0a84ff);
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
