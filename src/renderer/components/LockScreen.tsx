// =============================================================================
// LOCK SCREEN - Full-Screen Authentication Overlay
// Renders when the app is locked, blocking all interaction behind it.
// Supports PIN (4/6 digit), password, and biometric authentication.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';

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
    setError,
    config,
  } = useAuthStore();

  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
    };
  }, []);

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
  }, [isLocked, setError]);

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
      if (!success) {
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
    if (!success) {
      triggerShake();
      showLocalError('Incorrect password');
      setPassword('');
    }
  }, [password, lockoutStatus.isLockedOut, isLoading, authenticateWithPassword, triggerShake, showLocalError]);

  // --- Biometric Authentication ---

  const handleBiometric = useCallback(async () => {
    if (lockoutStatus.isLockedOut || isLoading) return;
    const success = await authenticateWithBiometric();
    if (!success) {
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

  // Don't render if not locked or auth not enabled
  if (!isLocked || !isEnabled) return null;

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
    <div style={styles.overlay} role="dialog" aria-label="Lock Screen" aria-modal="true">
      <style>{lockScreenCSS}</style>

      <div style={styles.backdrop} />

      <div style={styles.content}>
        {/* Clock */}
        <div style={styles.clockSection}>
          <div style={styles.time}>
            {timeStr}
            <span style={styles.ampm}>{ampm}</span>
          </div>
          <div style={styles.date}>{dateStr}</div>
        </div>

        {/* Auth Section */}
        <div
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
                  if (digit === 'del') {
                    return (
                      <button
                        key={i}
                        style={styles.numpadKey}
                        className="lock-numpad-key"
                        onClick={() => handlePinDigit('del')}
                        disabled={lockoutStatus.isLockedOut || isLoading}
                        aria-label="Delete last digit"
                        tabIndex={0}
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
                      style={styles.numpadKey}
                      className="lock-numpad-key"
                      onClick={() => handlePinDigit(digit)}
                      disabled={lockoutStatus.isLockedOut || isLoading}
                      aria-label={`Digit ${digit}`}
                      tabIndex={0}
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
              disabled={lockoutStatus.isLockedOut || isLoading}
            >
              Use Biometrics
            </button>
          )}

          {/* Error message */}
          {displayError && !lockoutStatus.isLockedOut && (
            <div style={styles.errorMsg} role="alert">
              {displayError}
            </div>
          )}

          {/* Attempts remaining */}
          {!lockoutStatus.isLockedOut && lockoutStatus.attemptsRemaining < 5 && lockoutStatus.attemptsRemaining > 0 && (
            <div style={styles.attemptsMsg}>
              {lockoutStatus.attemptsRemaining} attempt{lockoutStatus.attemptsRemaining !== 1 ? 's' : ''} remaining
            </div>
          )}
        </div>
      </div>
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
    zIndex: 999999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #0a0a0c 0%, #1a1a2e 40%, #16213e 70%, #0f3460 100%)',
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
    color: '#ffffff',
    letterSpacing: -2,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  ampm: {
    fontSize: 20,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 8,
    verticalAlign: 'super',
  },
  date: {
    fontSize: 17,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
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
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
    textAlign: 'center',
  },
  lockoutBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 10,
    background: 'rgba(255,159,10,0.12)',
    border: '1px solid rgba(255,159,10,0.25)',
    color: '#ff9f0a',
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
    border: '2px solid rgba(255,255,255,0.35)',
    background: 'transparent',
    transition: 'all 0.2s ease',
  },
  pinDotFilled: {
    background: '#ffffff',
    borderColor: '#ffffff',
    boxShadow: '0 0 8px rgba(255,255,255,0.4)',
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
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.08)',
    color: '#ffffff',
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
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.08)',
    color: '#ffffff',
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
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockBtn: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: 'none',
    background: '#0a84ff',
    color: '#ffffff',
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
    color: '#ffffff',
    cursor: 'pointer',
    padding: 20,
    borderRadius: 20,
    transition: 'background 0.15s ease',
  },
  biometricLabel: {
    fontSize: 15,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
  },

  // Fallback / Error / Attempts
  fallbackLink: {
    background: 'none',
    border: 'none',
    color: '#0a84ff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '4px 8px',
    marginTop: 4,
    fontFamily: 'inherit',
  },
  errorMsg: {
    color: '#ff453a',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'center',
    marginTop: 4,
  },
  attemptsMsg: {
    color: 'rgba(255,255,255,0.4)',
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
    background: rgba(255,255,255,0.15) !important;
  }

  .lock-numpad-key:active:not(:disabled) {
    background: rgba(255,255,255,0.25) !important;
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
    background: rgba(255,255,255,0.06);
  }

  .lock-fallback-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .lock-toggle-vis:hover {
    color: rgba(255,255,255,0.7) !important;
  }
`;

export default LockScreen;
