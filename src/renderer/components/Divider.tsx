/**
 * DEX Divider Component
 * Visual separators and dividers
 */

import React from 'react';

// ==================== TYPES ====================

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  thickness?: number;
  margin?: number;
  label?: string;
  labelPosition?: 'left' | 'center' | 'right';
}

interface SectionDividerProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

interface FancyDividerProps {
  type?: 'gradient' | 'fade' | 'ornament' | 'double';
  color?: string;
  height?: number;
}

interface SpacerProps {
  size?: number;
  horizontal?: boolean;
}

// ==================== DIVIDER ====================

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  variant = 'solid',
  color,
  thickness = 1,
  margin = 16,
  label,
  labelPosition = 'center',
}) => {
  const isHorizontal = orientation === 'horizontal';

  const getBorderStyle = () => {
    switch (variant) {
      case 'dashed':
        return 'dashed';
      case 'dotted':
        return 'dotted';
      default:
        return 'solid';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      margin: isHorizontal ? `${margin}px 0` : `0 ${margin}px`,
      width: isHorizontal ? '100%' : 'auto',
      height: isHorizontal ? 'auto' : '100%',
      flexDirection: isHorizontal ? 'row' : 'column',
    },
    line: {
      flex: 1,
      [isHorizontal ? 'borderTop' : 'borderLeft']: `${thickness}px ${getBorderStyle()} ${color || 'var(--color-border)'}`,
    },
    label: {
      padding: isHorizontal ? '0 16px' : '16px 0',
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
  };

  if (!label) {
    return (
      <div style={styles.container}>
        <div style={styles.line} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {labelPosition !== 'left' && <div style={styles.line} />}
      <span style={styles.label}>{label}</span>
      {labelPosition !== 'right' && <div style={styles.line} />}
    </div>
  );
};

// ==================== SECTION DIVIDER ====================

export const SectionDivider: React.FC<SectionDividerProps> = ({
  title,
  subtitle,
  action,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '24px 0 16px',
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 16,
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    subtitle: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
    action: {
      flexShrink: 0,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.content as any}>
        {title && <h3 style={styles.title}>{title}</h3>}
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
};

// ==================== FANCY DIVIDER ====================

export const FancyDivider: React.FC<FancyDividerProps> = ({
  type = 'gradient',
  color = 'var(--color-accent)',
  height = 2,
}) => {
  const getStyle = (): React.CSSProperties => {
    switch (type) {
      case 'gradient':
        return {
          height,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        };
      case 'fade':
        return {
          height,
          background: `linear-gradient(90deg, transparent, var(--color-border) 20%, var(--color-border) 80%, transparent)`,
        };
      case 'ornament':
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        };
      case 'double':
        return {
          height: height * 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        };
      default:
        return {};
    }
  };

  if (type === 'ornament') {
    return (
      <div style={{ ...getStyle(), margin: '24px 0' } as any}>
        <div style={{ flex: 1, height, background: 'var(--color-border)' }} />
        <span style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>sparkle</span>
        <div style={{ flex: 1, height, background: 'var(--color-border)' }} />
      </div>
    );
  }

  if (type === 'double') {
    return (
      <div style={{ ...getStyle(), margin: '24px 0' } as any}>
        <div style={{ height, background: 'var(--color-border)' }} />
        <div style={{ height, background: 'var(--color-border)' }} />
      </div>
    );
  }

  return <div style={{ ...getStyle(), margin: '24px 0', borderRadius: height / 2 }} />;
};

// ==================== SPACER ====================

export const Spacer: React.FC<SpacerProps> = ({
  size = 16,
  horizontal = false,
}) => {
  const styles: React.CSSProperties = {
    [horizontal ? 'width' : 'height']: size,
    [horizontal ? 'height' : 'width']: 'auto',
    flexShrink: 0,
  };

  return <div style={styles} />;
};

// ==================== LIST DIVIDER ====================

interface ListDividerProps {
  inset?: number;
  variant?: 'full' | 'inset' | 'middle';
}

export const ListDivider: React.FC<ListDividerProps> = ({
  inset = 16,
  variant = 'full',
}) => {
  const getMargin = () => {
    switch (variant) {
      case 'inset':
        return `0 0 0 ${inset}px`;
      case 'middle':
        return `0 ${inset}px`;
      default:
        return 0;
    }
  };

  const styles: React.CSSProperties = {
    height: 1,
    margin: getMargin(),
    background: 'var(--color-border)',
  };

  return <div style={styles} />;
};

// ==================== TITLED DIVIDER ====================

interface TitledDividerProps {
  title: string;
  icon?: React.ReactNode;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export const TitledDivider: React.FC<TitledDividerProps> = ({
  title,
  icon,
  color,
  align = 'center',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      margin: '24px 0',
    },
    line: {
      flex: 1,
      height: 1,
      background: 'var(--color-border)',
    },
    lineShort: {
      width: 40,
      height: 1,
      background: 'var(--color-border)',
    },
    label: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 16px',
      background: color || 'var(--color-bg-tertiary)',
      borderRadius: 16,
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    icon: {
      fontSize: 14,
    },
  };

  return (
    <div style={styles.container}>
      {align !== 'left' && <div style={align === 'right' ? styles.lineShort : styles.line} />}
      <span style={styles.label}>
        {icon && <span style={styles.icon}>{icon}</span>}
        {title}
      </span>
      {align !== 'right' && <div style={align === 'left' ? styles.lineShort : styles.line} />}
    </div>
  );
};

// ==================== STEP DIVIDER ====================

interface StepDividerProps {
  steps: { label: string; completed?: boolean }[];
  currentStep?: number;
  color?: string;
}

export const StepDivider: React.FC<StepDividerProps> = ({
  steps,
  currentStep = 0,
  color = 'var(--color-accent)',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
    },
    step: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    },
    dot: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
    },
    dotActive: {
      background: color,
      color: '#fff',
    },
    dotCompleted: {
      background: color,
      color: '#fff',
    },
    dotInactive: {
      background: 'var(--color-bg-tertiary)',
      border: '2px solid var(--color-border)',
      color: 'var(--color-text-muted)',
    },
    line: {
      flex: 1,
      height: 2,
      margin: '0 8px',
    },
    lineActive: {
      background: color,
    },
    lineInactive: {
      background: 'var(--color-border)',
    },
    label: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      textAlign: 'center',
      maxWidth: 80,
    },
  };

  return (
    <div style={styles.container}>
      {steps.map((step, index) => {
        const isCompleted = step.completed || index < currentStep;
        const isActive = index === currentStep;

        return (
          <React.Fragment key={index}>
            <div style={styles.step as any}>
              <div
                style={{
                  ...styles.dot,
                  ...(isActive ? styles.dotActive : isCompleted ? styles.dotCompleted : styles.dotInactive),
                }}
              >
                {isCompleted ? 'check' : index + 1}
              </div>
              <span style={styles.label as any}>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                style={{
                  ...styles.line,
                  ...(isCompleted ? styles.lineActive : styles.lineInactive),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ==================== WAVE DIVIDER ====================

interface WaveDividerProps {
  color?: string;
  height?: number;
  flip?: boolean;
}

export const WaveDivider: React.FC<WaveDividerProps> = ({
  color = 'var(--color-bg-secondary)',
  height = 60,
  flip = false,
}) => {
  const styles: React.CSSProperties = {
    width: '100%',
    height,
    transform: flip ? 'rotate(180deg)' : undefined,
    overflow: 'hidden',
  };

  return (
    <div style={styles}>
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        <path
          d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
          fill={color}
        />
      </svg>
    </div>
  );
};

export default Divider;
