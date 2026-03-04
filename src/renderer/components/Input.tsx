/**
 * DEX Input Components
 * Enhanced text input fields
 */

import React, { useState, useRef, useCallback, forwardRef } from 'react';

// ==================== TYPES ====================

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'flushed';
  clearable?: boolean;
  onClear?: () => void;
}

interface PasswordInputProps extends Omit<InputProps, 'type'> {
  showStrength?: boolean;
}

interface SearchInputProps extends Omit<InputProps, 'type'> {
  onSearch?: (value: string) => void;
  loading?: boolean;
}

interface CurrencyInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  value?: number;
  onChange?: (value: number) => void;
  currency?: string;
  locale?: string;
}

interface MaskedInputProps extends Omit<InputProps, 'onChange'> {
  mask: string;
  maskChar?: string;
  onChange?: (value: string, unmasked: string) => void;
}

// ==================== INPUT ====================

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  prefix,
  suffix,
  size = 'md',
  variant = 'default',
  clearable = false,
  onClear,
  className,
  style,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);

  const sizes = {
    sm: { height: 32, padding: 8, fontSize: 13 },
    md: { height: 40, padding: 12, fontSize: 14 },
    lg: { height: 48, padding: 16, fontSize: 16 },
  };

  const s = sizes[size];

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'filled':
        return {
          background: 'var(--color-bg-tertiary)',
          border: 'none',
        };
      case 'flushed':
        return {
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${error ? '#ef4444' : isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          borderRadius: 0,
          paddingLeft: 0,
          paddingRight: 0,
        };
      default:
        return {
          background: 'var(--color-bg-secondary)',
          border: `1px solid ${error ? '#ef4444' : isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      width: '100%',
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    inputWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
    },
    input: {
      width: '100%',
      height: s.height,
      padding: `0 ${s.padding}px`,
      paddingLeft: leftIcon || prefix ? s.height : s.padding,
      paddingRight: rightIcon || clearable || suffix ? s.height : s.padding,
      fontSize: s.fontSize,
      color: 'var(--color-text)',
      borderRadius: 8,
      outline: 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      ...getVariantStyles(),
      boxShadow: isFocused && variant === 'default' ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : undefined,
    },
    icon: {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.height,
      height: s.height,
      color: 'var(--color-text-muted)',
      pointerEvents: 'none',
    },
    leftIcon: {
      left: 0,
    },
    rightIcon: {
      right: 0,
    },
    addon: {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      height: '100%',
      padding: `0 ${s.padding}px`,
      color: 'var(--color-text-muted)',
      fontSize: s.fontSize,
    },
    prefix: {
      left: 0,
      borderRight: '1px solid var(--color-border)',
      background: 'var(--color-bg-tertiary)',
      borderRadius: '8px 0 0 8px',
    },
    suffix: {
      right: 0,
      borderLeft: '1px solid var(--color-border)',
      background: 'var(--color-bg-tertiary)',
      borderRadius: '0 8px 8px 0',
    },
    clearButton: {
      position: 'absolute',
      right: 8,
      width: 24,
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
      transition: 'color 0.15s',
    },
    hint: {
      fontSize: 12,
      color: error ? '#ef4444' : 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container as any}>
      {label && <label style={styles.label}>{label}</label>}

      <div style={styles.inputWrapper as any}>
        {prefix && (
          <span style={{ ...styles.addon, ...styles.prefix } as any}>
            {prefix}
          </span>
        )}

        {leftIcon && (
          <span style={{ ...styles.icon, ...styles.leftIcon } as any}>
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          style={{
            ...styles.input,
            ...(prefix ? { paddingLeft: s.height + s.padding } : {}),
            ...(suffix ? { paddingRight: s.height + s.padding } : {}),
            ...style,
          }}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />

        {clearable && props.value && (
          <button
            type="button"
            style={styles.clearButton as any}
            onClick={() => onClear?.()}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
            }}
          >
            ×
          </button>
        )}

        {rightIcon && !clearable && (
          <span style={{ ...styles.icon, ...styles.rightIcon } as any}>
            {rightIcon}
          </span>
        )}

        {suffix && (
          <span style={{ ...styles.addon, ...styles.suffix } as any}>
            {suffix}
          </span>
        )}
      </div>

      {(error || hint) && (
        <span style={styles.hint}>{error || hint}</span>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// ==================== PASSWORD INPUT ====================

export const PasswordInput: React.FC<PasswordInputProps> = ({
  showStrength = false,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState(0);

  const calculateStrength = (password: string): number => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(4, Math.floor(score * 4 / 6));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (showStrength) {
      setStrength(calculateStrength(e.target.value));
    }
    props.onChange?.(e);
  };

  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['#ef4444', '#f59e0b', '#22c55e', '#22c55e'];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    toggleButton: {
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    strength: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    strengthBars: {
      display: 'flex',
      gap: 4,
      flex: 1,
    },
    strengthBar: {
      height: 4,
      flex: 1,
      borderRadius: 2,
      transition: 'background 0.2s',
    },
    strengthLabel: {
      fontSize: 11,
      fontWeight: 500,
      minWidth: 50,
      textAlign: 'right',
    },
  };

  return (
    <div style={styles.container as any}>
      <Input
        {...props}
        type={showPassword ? 'text' : 'password'}
        onChange={handleChange}
        rightIcon={
          <button
            type="button"
            style={styles.toggleButton}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'eye' : 'eye‍message-square'}
          </button>
        }
      />

      {showStrength && props.value && (
        <div style={styles.strength}>
          <div style={styles.strengthBars}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  ...styles.strengthBar,
                  background: i < strength ? strengthColors[strength - 1] : 'var(--color-border)',
                }}
              />
            ))}
          </div>
          <span
            style={{
              ...styles.strengthLabel,
              color: strengthColors[strength - 1] || 'var(--color-text-muted)',
            } as any}
          >
            {strength > 0 ? strengthLabels[strength - 1] : ''}
          </span>
        </div>
      )}
    </div>
  );
};

// ==================== SEARCH INPUT ====================

export const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  loading = false,
  ...props
}) => {
  const [value, setValue] = useState(props.value?.toString() || '');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch?.(value);
    }
  };

  const spinnerStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    border: '2px solid var(--color-border)',
    borderTopColor: 'var(--color-accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  };

  return (
    <Input
      {...props}
      type="search"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        props.onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      leftIcon="search"
      rightIcon={loading ? <div style={spinnerStyle} /> : undefined}
      clearable={!loading && !!value}
      onClear={() => {
        setValue('');
        onSearch?.('');
      }}
    />
  );
};

// ==================== CURRENCY INPUT ====================

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value = 0,
  onChange,
  currency = 'USD',
  locale = 'en-US',
  ...props
}) => {
  const [displayValue, setDisplayValue] = useState('');

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  }, [locale, currency]);

  const parseCurrency = useCallback((str: string): number => {
    const cleaned = str.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setDisplayValue(rawValue);

    const numericValue = parseCurrency(rawValue);
    onChange?.(numericValue);
  };

  const handleBlur = () => {
    setDisplayValue(formatCurrency(value));
  };

  const handleFocus = () => {
    setDisplayValue(value.toString());
  };

  React.useEffect(() => {
    setDisplayValue(formatCurrency(value));
  }, [value, formatCurrency]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
};

// ==================== MASKED INPUT ====================

export const MaskedInput: React.FC<MaskedInputProps> = ({
  mask,
  maskChar = '_',
  onChange,
  ...props
}) => {
  const [displayValue, setDisplayValue] = useState('');

  const applyMask = useCallback((value: string): { masked: string; unmasked: string } => {
    let unmasked = value.replace(/[^a-zA-Z0-9]/g, '');
    let masked = '';
    let valueIndex = 0;

    for (const char of mask) {
      if (valueIndex >= unmasked.length) {
        masked += maskChar;
      } else if (char === '9') {
        // Digit
        if (/\d/.test(unmasked[valueIndex])) {
          masked += unmasked[valueIndex];
          valueIndex++;
        } else {
          masked += maskChar;
        }
      } else if (char === 'a') {
        // Letter
        if (/[a-zA-Z]/.test(unmasked[valueIndex])) {
          masked += unmasked[valueIndex];
          valueIndex++;
        } else {
          masked += maskChar;
        }
      } else if (char === '*') {
        // Any alphanumeric
        masked += unmasked[valueIndex];
        valueIndex++;
      } else {
        masked += char;
      }
    }

    return { masked, unmasked: unmasked.slice(0, valueIndex) };
  }, [mask, maskChar]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const { masked, unmasked } = applyMask(rawValue);
    setDisplayValue(masked);
    onChange?.(masked, unmasked);
  };

  return (
    <Input
      {...props}
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder={props.placeholder || mask.replace(/[9a*]/g, maskChar)}
    />
  );
};

// ==================== PIN INPUT ====================

interface PinInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  masked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
}

export const PinInput: React.FC<PinInputProps> = ({
  length = 6,
  value = '',
  onChange,
  onComplete,
  masked = false,
  size = 'md',
  error = false,
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sizes = {
    sm: { width: 32, height: 40, fontSize: 16 },
    md: { width: 40, height: 48, fontSize: 20 },
    lg: { width: 48, height: 56, fontSize: 24 },
  };

  const s = sizes[size];

  const handleChange = (index: number, char: string) => {
    const newValue = value.split('');
    newValue[index] = char;
    const result = newValue.join('').slice(0, length);

    onChange?.(result);

    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (result.length === length) {
      onComplete?.(result);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange?.(pasted);

    if (pasted.length === length) {
      onComplete?.(pasted);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 8,
    },
    input: {
      width: s.width,
      height: s.height,
      textAlign: 'center',
      fontSize: s.fontSize,
      fontWeight: 600,
      background: 'var(--color-bg-secondary)',
      border: `2px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
      borderRadius: 8,
      color: 'var(--color-text)',
      outline: 'none',
      transition: 'border-color 0.15s',
    },
  };

  return (
    <div style={styles.container}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => {
            e.target.style.borderColor = error ? '#ef4444' : 'var(--color-accent)';
            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? '#ef4444' : 'var(--color-border)';
            e.target.style.boxShadow = 'none';
          }}
          style={styles.input as any}
        />
      ))}
    </div>
  );
};

// ==================== OTP INPUT ====================

interface OtpInputProps extends PinInputProps {
  resendDelay?: number;
  onResend?: () => void;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  resendDelay = 60,
  onResend,
  ...props
}) => {
  const [countdown, setCountdown] = useState(resendDelay);
  const [canResend, setCanResend] = useState(false);

  React.useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleResend = () => {
    if (canResend) {
      onResend?.();
      setCountdown(resendDelay);
      setCanResend(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    },
    resend: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
    },
    resendButton: {
      background: 'none',
      border: 'none',
      color: 'var(--color-accent)',
      cursor: 'pointer',
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.container as any}>
      <PinInput {...props} />

      <div style={styles.resend}>
        {canResend ? (
          <button style={styles.resendButton} onClick={handleResend}>
            Resend code
          </button>
        ) : (
          <span>Resend code in {countdown}s</span>
        )}
      </div>
    </div>
  );
};

export default Input;
