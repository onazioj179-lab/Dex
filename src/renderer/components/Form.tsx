/**
 * DEX Form Components
 * Form inputs, validation, and state management
 */

import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface FormField {
  name: string;
  value: any;
  error?: string;
  touched: boolean;
  dirty: boolean;
}

interface FormState {
  fields: Record<string, FormField>;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
}

type ValidationRule = (value: any, formValues?: Record<string, any>) => string | undefined;

interface FieldConfig {
  initialValue?: any;
  validate?: ValidationRule[];
}

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'filled' | 'flushed';
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  size?: 'small' | 'medium' | 'large';
  placeholder?: string;
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  size?: 'small' | 'medium' | 'large';
  indeterminate?: boolean;
}

interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  error?: string;
}

interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

// ==================== INPUT ====================

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  size = 'medium',
  variant = 'default',
  disabled,
  className,
  style,
  ...props
}) => {
  const [focused, setFocused] = useState(false);

  const sizeConfig = {
    small: { height: 32, padding: '0 10px', fontSize: 13 },
    medium: { height: 40, padding: '0 12px', fontSize: 14 },
    large: { height: 48, padding: '0 16px', fontSize: 16 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: '100%',
      ...style,
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    inputWrapper: {
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      height: config.height,
      borderRadius: variant === 'flushed' ? 0 : 6,
      border: variant === 'flushed'
        ? 'none'
        : `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderBottom: variant === 'flushed'
        ? `2px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`
        : undefined,
      background: variant === 'filled' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused && variant !== 'flushed' ? `0 0 0 3px rgba(var(--color-accent-rgb), 0.1)` : 'none',
      opacity: disabled ? 0.6 : 1,
    },
    input: {
      flex: 1,
      height: '100%',
      padding: config.padding,
      paddingLeft: leftIcon ? 36 : undefined,
      paddingRight: rightIcon ? 36 : undefined,
      fontSize: config.fontSize,
      color: 'var(--color-text)',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      width: '100%',
    },
    icon: {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: '100%',
      color: 'var(--color-text-muted)',
      pointerEvents: 'none',
    },
    iconLeft: {
      left: 0,
    },
    iconRight: {
      right: 0,
    },
    hint: {
      fontSize: 12,
      color: error ? 'var(--color-error)' : 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <div style={styles.inputWrapper}>
        {leftIcon && (
          <span style={{ ...styles.icon, ...styles.iconLeft }}>{leftIcon}</span>
        )}
        <input
          {...props}
          disabled={disabled}
          style={styles.input}
          onFocus={e => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
        {rightIcon && (
          <span style={{ ...styles.icon, ...styles.iconRight }}>{rightIcon}</span>
        )}
      </div>
      {(error || hint) && <span style={styles.hint}>{error || hint}</span>}
    </div>
  );
};

// ==================== TEXTAREA ====================

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  hint,
  autoResize = false,
  minRows = 3,
  maxRows = 10,
  disabled,
  style,
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!autoResize || !textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.style.height = 'auto';

    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
    const minHeight = lineHeight * minRows + 16;
    const maxHeight = lineHeight * maxRows + 16;

    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [props.value, autoResize, minRows, maxRows]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: '100%',
      ...style,
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    textarea: {
      padding: '8px 12px',
      fontSize: 14,
      lineHeight: 1.5,
      color: 'var(--color-text)',
      background: 'var(--color-bg-secondary)',
      border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 6,
      outline: 'none',
      resize: autoResize ? 'none' : 'vertical',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused ? `0 0 0 3px rgba(var(--color-accent-rgb), 0.1)` : 'none',
      opacity: disabled ? 0.6 : 1,
      minHeight: minRows * 20 + 16,
    },
    hint: {
      fontSize: 12,
      color: error ? 'var(--color-error)' : 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <textarea
        ref={textareaRef}
        {...props}
        disabled={disabled}
        style={styles.textarea}
        onFocus={e => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      {(error || hint) && <span style={styles.hint}>{error || hint}</span>}
    </div>
  );
};

// ==================== SELECT ====================

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  hint,
  options,
  size = 'medium',
  placeholder,
  disabled,
  style,
  ...props
}) => {
  const [focused, setFocused] = useState(false);

  const sizeConfig = {
    small: { height: 32, padding: '0 10px', fontSize: 13 },
    medium: { height: 40, padding: '0 12px', fontSize: 14 },
    large: { height: 48, padding: '0 16px', fontSize: 16 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: '100%',
      ...style,
    },
    label: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    select: {
      height: config.height,
      padding: config.padding,
      paddingRight: 32,
      fontSize: config.fontSize,
      color: 'var(--color-text)',
      background: 'var(--color-bg-secondary)',
      border: `1px solid ${error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 6,
      outline: 'none',
      cursor: 'pointer',
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: focused ? `0 0 0 3px rgba(var(--color-accent-rgb), 0.1)` : 'none',
      opacity: disabled ? 0.6 : 1,
    },
    hint: {
      fontSize: 12,
      color: error ? 'var(--color-error)' : 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <select
        {...props}
        disabled={disabled}
        style={styles.select}
        onFocus={e => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {(error || hint) && <span style={styles.hint}>{error || hint}</span>}
    </div>
  );
};

// ==================== CHECKBOX ====================

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  error,
  size = 'medium',
  indeterminate = false,
  disabled,
  style,
  ...props
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const sizeConfig = {
    small: { box: 16, fontSize: 13 },
    medium: { box: 18, fontSize: 14 },
    large: { box: 22, fontSize: 16 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      ...style,
    },
    checkbox: {
      width: config.box,
      height: config.box,
      cursor: 'inherit',
      accentColor: 'var(--color-accent)',
    },
    label: {
      fontSize: config.fontSize,
      color: 'var(--color-text)',
    },
  };

  return (
    <label style={styles.container}>
      <input
        ref={checkboxRef}
        type="checkbox"
        {...props}
        disabled={disabled}
        style={styles.checkbox}
      />
      {label && <span style={styles.label}>{label}</span>}
    </label>
  );
};

// ==================== RADIO GROUP ====================

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  options,
  orientation = 'vertical',
  size = 'medium',
  error,
}) => {
  const sizeConfig = {
    small: { radio: 16, fontSize: 13 },
    medium: { radio: 18, fontSize: 14 },
    large: { radio: 22, fontSize: 16 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: orientation === 'vertical' ? 'column' : 'row',
      gap: orientation === 'vertical' ? 8 : 16,
    },
    option: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
    },
    optionDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    radio: {
      width: config.radio,
      height: config.radio,
      cursor: 'inherit',
      accentColor: 'var(--color-accent)',
    },
    label: {
      fontSize: config.fontSize,
      color: 'var(--color-text)',
    },
    error: {
      fontSize: 12,
      color: 'var(--color-error)',
      marginTop: 4,
    },
  };

  return (
    <div>
      <div style={styles.container}>
        {options.map(option => (
          <label
            key={option.value}
            style={{
              ...styles.option,
              ...(option.disabled ? styles.optionDisabled : {}),
            }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              style={styles.radio}
            />
            <span style={styles.label}>{option.label}</span>
          </label>
        ))}
      </div>
      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
};

// ==================== SWITCH ====================

export const Switch: React.FC<SwitchProps> = ({
  checked = false,
  onChange,
  label,
  disabled = false,
  size = 'medium',
}) => {
  const sizeConfig = {
    small: { width: 32, height: 18, thumb: 14 },
    medium: { width: 44, height: 24, thumb: 20 },
    large: { width: 56, height: 30, thumb: 26 },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
    },
    track: {
      position: 'relative',
      width: config.width,
      height: config.height,
      background: checked ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
      border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: config.height / 2,
      transition: 'all 0.2s ease',
    },
    thumb: {
      position: 'absolute',
      top: (config.height - config.thumb) / 2 - 1,
      left: checked ? config.width - config.thumb - (config.height - config.thumb) / 2 - 1 : (config.height - config.thumb) / 2 - 1,
      width: config.thumb,
      height: config.thumb,
      background: 'white',
      borderRadius: '50%',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 0.2s ease',
    },
    label: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
  };

  const handleClick = () => {
    if (!disabled) {
      onChange?.(!checked);
    }
  };

  return (
    <div style={styles.container} onClick={handleClick}>
      <div style={styles.track}>
        <div style={styles.thumb} />
      </div>
      {label && <span style={styles.label}>{label}</span>}
    </div>
  );
};

// ==================== FORM HOOK ====================

export const useForm = <T extends Record<string, any>>(
  initialValues: T,
  validationRules?: Partial<Record<keyof T, ValidationRule[]>>
) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = useCallback((name: keyof T, value: any): string | undefined => {
    const rules = validationRules?.[name];
    if (!rules) return undefined;

    for (const rule of rules) {
      const error = rule(value, values);
      if (error) return error;
    }
    return undefined;
  }, [validationRules, values]);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    Object.keys(values).forEach(key => {
      const error = validate(key as keyof T, values[key as keyof T]);
      if (error) {
        newErrors[key as keyof T] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validate]);

  const setValue = useCallback((name: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
    const error = validate(name, value);
    setErrors(prev => ({ ...prev, [name]: error }));
  }, [validate]);

  const setFieldTouched = useCallback((name: keyof T) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const error = validate(name, values[name]);
    setErrors(prev => ({ ...prev, [name]: error }));
  }, [validate, values]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setValue(name as keyof T, finalValue);
  }, [setValue]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name } = e.target;
    setFieldTouched(name as keyof T);
  }, [setFieldTouched]);

  const handleSubmit = useCallback((onSubmit: (values: T) => Promise<void> | void) => {
    return async (e?: React.FormEvent) => {
      e?.preventDefault();

      const allTouched = Object.keys(values).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {}
      );
      setTouched(allTouched);

      if (!validateAll()) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    };
  }, [values, validateAll]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const getFieldProps = useCallback((name: keyof T) => ({
    name,
    value: values[name],
    onChange: handleChange,
    onBlur: handleBlur,
    error: touched[name] ? errors[name] : undefined,
  }), [values, errors, touched, handleChange, handleBlur]);

  const isValid = Object.keys(errors).every(key => !errors[key as keyof T]);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    setValue,
    setFieldTouched,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    getFieldProps,
    validateAll,
  };
};

// ==================== VALIDATION RULES ====================

export const ValidationRules = {
  required: (message = 'This field is required'): ValidationRule => (value) => {
    if (value === undefined || value === null || value === '') return message;
    return undefined;
  },

  minLength: (min: number, message?: string): ValidationRule => (value) => {
    if (typeof value === 'string' && value.length < min) {
      return message || `Must be at least ${min} characters`;
    }
    return undefined;
  },

  maxLength: (max: number, message?: string): ValidationRule => (value) => {
    if (typeof value === 'string' && value.length > max) {
      return message || `Must be at most ${max} characters`;
    }
    return undefined;
  },

  email: (message = 'Invalid email address'): ValidationRule => (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof value === 'string' && !emailRegex.test(value)) {
      return message;
    }
    return undefined;
  },

  pattern: (regex: RegExp, message = 'Invalid format'): ValidationRule => (value) => {
    if (typeof value === 'string' && !regex.test(value)) {
      return message;
    }
    return undefined;
  },

  min: (min: number, message?: string): ValidationRule => (value) => {
    if (typeof value === 'number' && value < min) {
      return message || `Must be at least ${min}`;
    }
    return undefined;
  },

  max: (max: number, message?: string): ValidationRule => (value) => {
    if (typeof value === 'number' && value > max) {
      return message || `Must be at most ${max}`;
    }
    return undefined;
  },

  match: (fieldName: string, message?: string): ValidationRule => (value, formValues) => {
    if (formValues && value !== formValues[fieldName]) {
      return message || `Must match ${fieldName}`;
    }
    return undefined;
  },
};

export default { Input, TextArea, Select, Checkbox, RadioGroup, Switch, useForm, ValidationRules };
