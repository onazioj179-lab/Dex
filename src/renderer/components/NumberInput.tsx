/**
 * DEX Number Input Component
 * Numeric input with increment/decrement controls
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ==================== TYPES ====================

interface NumberInputProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'unstyled';
  showButtons?: boolean;
  buttonsPosition?: 'left' | 'right' | 'sides';
  allowNegative?: boolean;
  allowDecimal?: boolean;
  prefix?: string;
  suffix?: string;
  format?: (value: number) => string;
  parse?: (value: string) => number;
  clampOnBlur?: boolean;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

interface CurrencyInputProps {
  value?: number;
  onChange?: (value: number) => void;
  currency?: string;
  locale?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
}

interface PercentInputProps {
  value?: number; // 0-100
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  precision?: number;
  disabled?: boolean;
  showSymbol?: boolean;
}

interface QuantityInputProps {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

// ==================== NUMBER INPUT ====================

export const NumberInput: React.FC<NumberInputProps> = ({
  value: controlledValue,
  defaultValue = 0,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision,
  disabled = false,
  readOnly = false,
  placeholder,
  size = 'md',
  variant = 'default',
  showButtons = true,
  buttonsPosition = 'right',
  allowNegative = true,
  allowDecimal = true,
  prefix,
  suffix,
  format,
  parse,
  clampOnBlur = true,
  onBlur,
  onFocus,
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [inputValue, setInputValue] = useState(String(defaultValue));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const incrementIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const value = controlledValue ?? internalValue;

  const clamp = useCallback((val: number): number => {
    return Math.min(max, Math.max(min, val));
  }, [min, max]);

  const formatValue = useCallback((val: number): string => {
    if (format) return format(val);
    if (precision !== undefined) {
      return val.toFixed(precision);
    }
    return String(val);
  }, [format, precision]);

  const parseValue = useCallback((str: string): number => {
    if (parse) return parse(str);
    
    // Remove any non-numeric characters except minus and decimal
    let cleaned = str.replace(/[^\d.-]/g, '');
    
    if (!allowNegative) {
      cleaned = cleaned.replace(/-/g, '');
    }
    
    if (!allowDecimal) {
      cleaned = cleaned.split('.')[0];
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }, [parse, allowNegative, allowDecimal]);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatValue(value));
    }
  }, [value, isFocused, formatValue]);

  const updateValue = useCallback((newValue: number) => {
    const clamped = clamp(newValue);
    setInternalValue(clamped);
    onChange?.(clamped);
  }, [clamp, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    const parsed = parseValue(raw);
    if (!isNaN(parsed)) {
      setInternalValue(parsed);
      onChange?.(parsed);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);

    if (clampOnBlur) {
      const clamped = clamp(parseValue(inputValue));
      updateValue(clamped);
      setInputValue(formatValue(clamped));
    }

    onBlur?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const increment = useCallback(() => {
    if (disabled || readOnly) return;
    updateValue(value + step);
  }, [value, step, disabled, readOnly, updateValue]);

  const decrement = useCallback(() => {
    if (disabled || readOnly) return;
    updateValue(value - step);
  }, [value, step, disabled, readOnly, updateValue]);

  const startIncrement = (direction: 'up' | 'down') => {
    if (direction === 'up') {
      increment();
    } else {
      decrement();
    }

    incrementIntervalRef.current = setInterval(() => {
      if (direction === 'up') {
        setInternalValue(prev => {
          const newVal = clamp(prev + step);
          onChange?.(newVal);
          return newVal;
        });
      } else {
        setInternalValue(prev => {
          const newVal = clamp(prev - step);
          onChange?.(newVal);
          return newVal;
        });
      }
    }, 100);
  };

  const stopIncrement = () => {
    if (incrementIntervalRef.current) {
      clearInterval(incrementIntervalRef.current);
      incrementIntervalRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      increment();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      decrement();
    }
  };

  const sizes = {
    sm: { height: 28, fontSize: 12, buttonWidth: 24, padding: '0 8px' },
    md: { height: 36, fontSize: 14, buttonWidth: 32, padding: '0 12px' },
    lg: { height: 44, fontSize: 16, buttonWidth: 40, padding: '0 16px' },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'stretch',
      borderRadius: 6,
      border: variant === 'unstyled' ? 'none' : '1px solid var(--color-border)',
      background: variant === 'filled' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
      overflow: 'hidden',
      opacity: disabled ? 0.5 : 1,
    },
    containerFocused: {
      borderColor: 'var(--color-accent)',
      boxShadow: '0 0 0 2px rgba(var(--color-accent-rgb), 0.2)',
    },
    inputWrapper: {
      display: 'flex',
      alignItems: 'center',
      flex: 1,
      padding: s.padding,
      gap: 4,
    },
    input: {
      flex: 1,
      border: 'none',
      background: 'none',
      outline: 'none',
      fontSize: s.fontSize,
      color: 'var(--color-text)',
      fontFamily: 'inherit',
      minWidth: 40,
      textAlign: 'left',
    },
    prefix: {
      fontSize: s.fontSize,
      color: 'var(--color-text-muted)',
    },
    suffix: {
      fontSize: s.fontSize,
      color: 'var(--color-text-muted)',
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.buttonWidth,
      height: s.height,
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      cursor: disabled || readOnly ? 'not-allowed' : 'pointer',
      color: 'var(--color-text)',
      fontSize: s.fontSize,
      transition: 'background 0.15s',
      userSelect: 'none',
    },
    buttonLeft: {
      borderRight: '1px solid var(--color-border)',
    },
    buttonRight: {
      borderLeft: '1px solid var(--color-border)',
    },
    verticalButtons: {
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid var(--color-border)',
    },
    verticalButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.buttonWidth * 0.75,
      flex: 1,
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      cursor: disabled || readOnly ? 'not-allowed' : 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 8,
      transition: 'background 0.15s',
    },
  };

  const renderButtons = () => {
    if (!showButtons) return null;

    if (buttonsPosition === 'sides') {
      return null; // Buttons rendered separately
    }

    if (buttonsPosition === 'left') {
      return (
        <div style={styles.verticalButtons}>
          <button
            style={styles.verticalButton}
            onMouseDown={() => startIncrement('up')}
            onMouseUp={stopIncrement}
            onMouseLeave={stopIncrement}
            disabled={disabled || readOnly || value >= max}
            tabIndex={-1}
          >
            ▲
          </button>
          <button
            style={{ ...styles.verticalButton, borderTop: '1px solid var(--color-border)' }}
            onMouseDown={() => startIncrement('down')}
            onMouseUp={stopIncrement}
            onMouseLeave={stopIncrement}
            disabled={disabled || readOnly || value <= min}
            tabIndex={-1}
          >
            ▼
          </button>
        </div>
      );
    }

    return (
      <div style={styles.verticalButtons}>
        <button
          style={styles.verticalButton}
          onMouseDown={() => startIncrement('up')}
          onMouseUp={stopIncrement}
          onMouseLeave={stopIncrement}
          disabled={disabled || readOnly || value >= max}
          tabIndex={-1}
        >
          ▲
        </button>
        <button
          style={{ ...styles.verticalButton, borderTop: '1px solid var(--color-border)' }}
          onMouseDown={() => startIncrement('down')}
          onMouseUp={stopIncrement}
          onMouseLeave={stopIncrement}
          disabled={disabled || readOnly || value <= min}
          tabIndex={-1}
        >
          ▼
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        ...styles.container,
        ...(isFocused && variant !== 'unstyled' ? styles.containerFocused : {}),
      }}
    >
      {showButtons && buttonsPosition === 'sides' && (
        <button
          style={{ ...styles.button, ...styles.buttonLeft }}
          onMouseDown={() => startIncrement('down')}
          onMouseUp={stopIncrement}
          onMouseLeave={stopIncrement}
          disabled={disabled || readOnly || value <= min}
          tabIndex={-1}
        >
          −
        </button>
      )}

      {buttonsPosition === 'left' && renderButtons()}

      <div style={styles.inputWrapper}>
        {prefix && <span style={styles.prefix}>{prefix}</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          style={styles.input}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
        />
        {suffix && <span style={styles.suffix}>{suffix}</span>}
      </div>

      {buttonsPosition === 'right' && renderButtons()}

      {showButtons && buttonsPosition === 'sides' && (
        <button
          style={{ ...styles.button, ...styles.buttonRight }}
          onMouseDown={() => startIncrement('up')}
          onMouseUp={stopIncrement}
          onMouseLeave={stopIncrement}
          disabled={disabled || readOnly || value >= max}
          tabIndex={-1}
        >
          +
        </button>
      )}
    </div>
  );
};

// ==================== CURRENCY INPUT ====================

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value: controlledValue,
  onChange,
  currency = 'USD',
  locale = 'en-US',
  min = 0,
  max = Infinity,
  disabled = false,
  placeholder,
}) => {
  const [internalValue, setInternalValue] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const value = controlledValue ?? internalValue;

  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CNY: '¥',
    INR: '₹',
    NGN: '₦',
  };

  const symbol = currencySymbols[currency] || currency;

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatCurrency(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.]/g, '');
    setInputValue(raw);

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      setInternalValue(clamped);
      onChange?.(clamped);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setInputValue(formatCurrency(value));
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      opacity: disabled ? 0.5 : 1,
    },
    containerFocused: {
      borderColor: 'var(--color-accent)',
      boxShadow: '0 0 0 2px rgba(var(--color-accent-rgb), 0.2)',
    },
    symbol: {
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    input: {
      flex: 1,
      border: 'none',
      background: 'none',
      outline: 'none',
      fontSize: 14,
      color: 'var(--color-text)',
      fontFamily: 'inherit',
      minWidth: 80,
      textAlign: 'right',
    },
  };

  return (
    <div
      style={{
        ...styles.container,
        ...(isFocused ? styles.containerFocused : {}),
      }}
    >
      <span style={styles.symbol}>{symbol}</span>
      <input
        type="text"
        inputMode="decimal"
        style={styles.input}
        value={inputValue}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder || '0.00'}
      />
    </div>
  );
};

// ==================== PERCENT INPUT ====================

export const PercentInput: React.FC<PercentInputProps> = ({
  value: controlledValue,
  onChange,
  min = 0,
  max = 100,
  precision = 0,
  disabled = false,
  showSymbol = true,
}) => {
  const [internalValue, setInternalValue] = useState(0);
  const value = controlledValue ?? internalValue;

  const handleChange = (newValue: number) => {
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  return (
    <NumberInput
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
      step={1}
      precision={precision}
      suffix={showSymbol ? '%' : undefined}
      disabled={disabled}
      showButtons
      buttonsPosition="right"
    />
  );
};

// ==================== QUANTITY INPUT ====================

export const QuantityInput: React.FC<QuantityInputProps> = ({
  value: controlledValue,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  size = 'md',
  disabled = false,
}) => {
  const [internalValue, setInternalValue] = useState(min);
  const value = controlledValue ?? internalValue;

  const handleChange = (newValue: number) => {
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  const sizes = {
    sm: { height: 28, fontSize: 12 },
    md: { height: 36, fontSize: 14 },
    lg: { height: 44, fontSize: 16 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
      overflow: 'hidden',
      opacity: disabled ? 0.5 : 1,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.height,
      height: s.height,
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: 'var(--color-text)',
      fontSize: s.fontSize + 4,
      fontWeight: 600,
      transition: 'background 0.15s',
    },
    value: {
      minWidth: 48,
      height: s.height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: s.fontSize,
      fontWeight: 600,
      color: 'var(--color-text)',
      borderLeft: '1px solid var(--color-border)',
      borderRight: '1px solid var(--color-border)',
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={styles.button}
        onClick={() => handleChange(Math.max(min, value - step))}
        disabled={disabled || value <= min}
      >
        −
      </button>
      <div style={styles.value}>{value}</div>
      <button
        style={styles.button}
        onClick={() => handleChange(Math.min(max, value + step))}
        disabled={disabled || value >= max}
      >
        +
      </button>
    </div>
  );
};

// ==================== RANGE NUMBER INPUT ====================

interface RangeNumberInputProps {
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  separator?: string;
}

export const RangeNumberInput: React.FC<RangeNumberInputProps> = ({
  minValue,
  maxValue,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  separator = '—',
}) => {
  const handleMinChange = (value: number) => {
    const clampedValue = Math.min(value, maxValue);
    onChange(clampedValue, maxValue);
  };

  const handleMaxChange = (value: number) => {
    const clampedValue = Math.max(value, minValue);
    onChange(minValue, clampedValue);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    separator: {
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
  };

  return (
    <div style={styles.container}>
      <NumberInput
        value={minValue}
        onChange={handleMinChange}
        min={min}
        max={maxValue}
        step={step}
        disabled={disabled}
        showButtons
      />
      <span style={styles.separator}>{separator}</span>
      <NumberInput
        value={maxValue}
        onChange={handleMaxChange}
        min={minValue}
        max={max}
        step={step}
        disabled={disabled}
        showButtons
      />
    </div>
  );
};

export default NumberInput;
