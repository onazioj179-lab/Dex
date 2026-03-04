/**
 * DEX Toggle Component
 * Toggle switch and checkbox variants
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
  labelPosition?: 'left' | 'right';
}

interface SwitchGroupProps {
  options: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface CheckboxGroupProps {
  options: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  value?: string[];
  onChange?: (values: string[]) => void;
  disabled?: boolean;
  direction?: 'horizontal' | 'vertical';
}

interface RadioProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
  value?: string;
}

interface RadioGroupProps {
  options: {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  direction?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
}

// ==================== TOGGLE ====================

export const Toggle: React.FC<ToggleProps> = ({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
  labelPosition = 'right',
}) => {
  const [checked, setChecked] = useState(defaultChecked);

  const isChecked = controlledChecked !== undefined ? controlledChecked : checked;

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !isChecked;
    setChecked(newValue);
    onChange?.(newValue);
  };

  const sizes = {
    sm: { width: 36, height: 20, thumb: 14 },
    md: { width: 44, height: 24, thumb: 18 },
    lg: { width: 52, height: 28, thumb: 22 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      flexDirection: labelPosition === 'left' ? 'row-reverse' : 'row',
    },
    toggle: {
      position: 'relative',
      width: s.width,
      height: s.height,
      borderRadius: s.height / 2,
      background: isChecked ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
      border: '2px solid',
      borderColor: isChecked ? 'var(--color-accent)' : 'var(--color-border)',
      transition: 'all 0.2s',
    },
    thumb: {
      position: 'absolute',
      top: (s.height - s.thumb - 4) / 2,
      left: isChecked ? s.width - s.thumb - 4 : 2,
      width: s.thumb,
      height: s.thumb,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      transition: 'left 0.2s',
    },
    labelContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    label: {
      fontSize: size === 'sm' ? 13 : size === 'md' ? 14 : 16,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    description: {
      fontSize: size === 'sm' ? 11 : size === 'md' ? 12 : 13,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container} onClick={handleToggle}>
      <div style={styles.toggle}>
        <div style={styles.thumb} />
      </div>

      {(label || description) && (
        <div style={styles.labelContainer as any}>
          {label && <span style={styles.label}>{label}</span>}
          {description && <span style={styles.description}>{description}</span>}
        </div>
      )}
    </div>
  );
};

// ==================== SWITCH GROUP ====================

export const SwitchGroup: React.FC<SwitchGroupProps> = ({
  options,
  value: controlledValue,
  onChange,
  disabled = false,
  size = 'md',
}) => {
  const [value, setValue] = useState(options[0]?.value || '');

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleSelect = (v: string) => {
    if (disabled) return;
    setValue(v);
    onChange?.(v);
  };

  const sizes = {
    sm: { height: 32, fontSize: 12, padding: '0 12px' },
    md: { height: 40, fontSize: 14, padding: '0 16px' },
    lg: { height: 48, fontSize: 16, padding: '0 20px' },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      padding: 4,
    },
    option: {
      height: s.height,
      padding: s.padding,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      fontSize: s.fontSize,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s',
    },
    optionActive: {
      background: 'var(--color-accent)',
      color: '#fff',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    optionDisabled: {
      opacity: 0.5,
    },
  };

  return (
    <div style={styles.container}>
      {options.map(option => (
        <button
          key={option.value}
          style={{
            ...styles.option,
            ...(currentValue === option.value ? styles.optionActive : {}),
            ...(option.disabled || disabled ? styles.optionDisabled : {}),
          }}
          onClick={() => !option.disabled && handleSelect(option.value)}
          disabled={option.disabled || disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

// ==================== CHECKBOX ====================

export const Checkbox: React.FC<CheckboxProps> = ({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  disabled = false,
  indeterminate = false,
  label,
  description,
  size = 'md',
}) => {
  const [checked, setChecked] = useState(defaultChecked);

  const isChecked = controlledChecked !== undefined ? controlledChecked : checked;

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !isChecked;
    setChecked(newValue);
    onChange?.(newValue);
  };

  const sizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const boxSize = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    checkbox: {
      width: boxSize,
      height: boxSize,
      borderRadius: 4,
      border: '2px solid',
      borderColor: isChecked || indeterminate ? 'var(--color-accent)' : 'var(--color-border)',
      background: isChecked || indeterminate ? 'var(--color-accent)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.15s',
    },
    checkmark: {
      color: '#fff',
      fontSize: boxSize * 0.6,
      fontWeight: 700,
    },
    labelContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingTop: 1,
    },
    label: {
      fontSize: size === 'sm' ? 13 : size === 'md' ? 14 : 16,
      color: 'var(--color-text)',
      lineHeight: 1.4,
    },
    description: {
      fontSize: size === 'sm' ? 11 : size === 'md' ? 12 : 13,
      color: 'var(--color-text-muted)',
      lineHeight: 1.4,
    },
  };

  return (
    <div style={styles.container} onClick={handleToggle}>
      <div style={styles.checkbox}>
        {(isChecked || indeterminate) && (
          <span style={styles.checkmark}>
            {indeterminate ? '−' : 'check'}
          </span>
        )}
      </div>

      {(label || description) && (
        <div style={styles.labelContainer as any}>
          {label && <span style={styles.label}>{label}</span>}
          {description && <span style={styles.description}>{description}</span>}
        </div>
      )}
    </div>
  );
};

// ==================== CHECKBOX GROUP ====================

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
  options,
  value: controlledValue,
  onChange,
  disabled = false,
  direction = 'vertical',
}) => {
  const [values, setValues] = useState<string[]>([]);

  const currentValues = controlledValue !== undefined ? controlledValue : values;

  const handleToggle = (optionValue: string, checked: boolean) => {
    let newValues: string[];
    if (checked) {
      newValues = [...currentValues, optionValue];
    } else {
      newValues = currentValues.filter(v => v !== optionValue);
    }
    setValues(newValues);
    onChange?.(newValues);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: direction === 'horizontal' ? 'row' : 'column',
      gap: direction === 'horizontal' ? 16 : 12,
      flexWrap: 'wrap',
    },
  };

  return (
    <div style={styles.container}>
      {options.map(option => (
        <Checkbox
          key={option.value}
          label={option.label}
          checked={currentValues.includes(option.value)}
          onChange={(checked) => handleToggle(option.value, checked)}
          disabled={option.disabled || disabled}
        />
      ))}
    </div>
  );
};

// ==================== RADIO ====================

export const Radio: React.FC<RadioProps> = ({
  checked = false,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  name,
  value,
}) => {
  const handleClick = () => {
    if (disabled || checked) return;
    onChange?.(true);
  };

  const sizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const boxSize = sizes[size];
  const dotSize = boxSize * 0.5;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    radio: {
      width: boxSize,
      height: boxSize,
      borderRadius: '50%',
      border: '2px solid',
      borderColor: checked ? 'var(--color-accent)' : 'var(--color-border)',
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.15s',
    },
    dot: {
      width: dotSize,
      height: dotSize,
      borderRadius: '50%',
      background: 'var(--color-accent)',
    },
    labelContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingTop: 1,
    },
    label: {
      fontSize: size === 'sm' ? 13 : size === 'md' ? 14 : 16,
      color: 'var(--color-text)',
      lineHeight: 1.4,
    },
    description: {
      fontSize: size === 'sm' ? 11 : size === 'md' ? 12 : 13,
      color: 'var(--color-text-muted)',
      lineHeight: 1.4,
    },
  };

  return (
    <div style={styles.container} onClick={handleClick}>
      <div style={styles.radio}>
        {checked && <div style={styles.dot} />}
      </div>

      {(label || description) && (
        <div style={styles.labelContainer as any}>
          {label && <span style={styles.label}>{label}</span>}
          {description && <span style={styles.description}>{description}</span>}
        </div>
      )}
    </div>
  );
};

// ==================== RADIO GROUP ====================

export const RadioGroup: React.FC<RadioGroupProps> = ({
  options,
  value: controlledValue,
  onChange,
  disabled = false,
  direction = 'vertical',
  size = 'md',
}) => {
  const [value, setValue] = useState(options[0]?.value || '');

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleSelect = (optionValue: string) => {
    setValue(optionValue);
    onChange?.(optionValue);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: direction === 'horizontal' ? 'row' : 'column',
      gap: direction === 'horizontal' ? 20 : 12,
      flexWrap: 'wrap',
    },
  };

  return (
    <div style={styles.container}>
      {options.map(option => (
        <Radio
          key={option.value}
          label={option.label}
          description={option.description}
          checked={currentValue === option.value}
          onChange={() => handleSelect(option.value)}
          disabled={option.disabled || disabled}
          size={size}
        />
      ))}
    </div>
  );
};

// ==================== RADIO CARD GROUP ====================

interface RadioCardProps {
  options: {
    value: string;
    title: string;
    description?: string;
    icon?: React.ReactNode;
  }[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  columns?: number;
}

export const RadioCardGroup: React.FC<RadioCardProps> = ({
  options,
  value: controlledValue,
  onChange,
  disabled = false,
  columns = 2,
}) => {
  const [value, setValue] = useState(options[0]?.value || '');

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    setValue(optionValue);
    onChange?.(optionValue);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 12,
    },
    card: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 16,
      background: 'var(--color-bg-secondary)',
      border: '2px solid transparent',
      borderRadius: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    },
    cardSelected: {
      borderColor: 'var(--color-accent)',
      background: 'rgba(var(--color-accent-rgb), 0.05)',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    },
    icon: {
      fontSize: 24,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      lineHeight: 1.5,
    },
    indicator: {
      width: 18,
      height: 18,
      borderRadius: '50%',
      border: '2px solid var(--color-border)',
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    indicatorSelected: {
      borderColor: 'var(--color-accent)',
    },
    indicatorDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--color-accent)',
    },
  };

  return (
    <div style={styles.container}>
      {options.map(option => {
        const isSelected = currentValue === option.value;

        return (
          <div
            key={option.value}
            style={{
              ...styles.card,
              ...(isSelected ? styles.cardSelected : {}),
            } as any}
            onClick={() => handleSelect(option.value)}
          >
            <div style={styles.header}>
              {option.icon && <span style={styles.icon}>{option.icon}</span>}
              <span style={styles.title}>{option.title}</span>
              <div
                style={{
                  ...styles.indicator,
                  ...(isSelected ? styles.indicatorSelected : {}),
                }}
              >
                {isSelected && <div style={styles.indicatorDot} />}
              </div>
            </div>
            {option.description && (
              <span style={styles.description}>{option.description}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Toggle;
