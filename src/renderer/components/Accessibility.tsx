/**
 * DEX Accessibility Utilities
 * ARIA helpers and screen reader utilities
 */

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface LiveRegionProps {
  children: React.ReactNode;
  role?: 'status' | 'alert' | 'log' | 'marquee' | 'timer';
  'aria-live'?: 'off' | 'polite' | 'assertive';
  'aria-atomic'?: boolean;
  'aria-relevant'?: 'additions' | 'removals' | 'text' | 'all';
}

interface ScreenReaderOnlyProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  focusable?: boolean;
}

interface DescribedByProps {
  children: React.ReactElement;
  description: string;
}

// ==================== LIVE REGION ====================

export const LiveRegion: React.FC<LiveRegionProps> = ({
  children,
  role = 'status',
  'aria-live': ariaLive = 'polite',
  'aria-atomic': ariaAtomic = true,
  'aria-relevant': ariaRelevant = 'additions text' as const,
}) => {
  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-atomic={ariaAtomic}
      aria-relevant={ariaRelevant as 'additions text'}
    >
      {children}
    </div>
  );
};

// ==================== SCREEN READER ONLY ====================

export const ScreenReaderOnly: React.FC<ScreenReaderOnlyProps> = ({
  children,
  as: Component = 'span',
  focusable = false,
}) => {
  const styles: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  };

  // For focusable sr-only elements, styles are applied inline
  const focusableStyles: React.CSSProperties = {
    ...styles,
  };

  return React.createElement(
    Component,
    {
      style: focusable ? focusableStyles : styles,
      tabIndex: focusable ? 0 : undefined,
    },
    children
  );
};

// ==================== DESCRIBED BY ====================

export const DescribedBy: React.FC<DescribedByProps> = ({
  children,
  description,
}) => {
  const id = useRef(`desc-${Math.random().toString(36).substr(2, 9)}`);

  return (
    <>
      {React.cloneElement(children, {
        'aria-describedby': id.current,
      })}
      <span
        id={id.current}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>
    </>
  );
};

// ==================== LABELED BY ====================

interface LabeledByProps {
  children: React.ReactElement;
  label: string;
}

export const LabeledBy: React.FC<LabeledByProps> = ({
  children,
  label,
}) => {
  const id = useRef(`label-${Math.random().toString(36).substr(2, 9)}`);

  return (
    <>
      <span
        id={id.current}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {label}
      </span>
      {React.cloneElement(children, {
        'aria-labelledby': id.current,
      })}
    </>
  );
};

// ==================== ANNOUNCER CONTEXT ====================

interface AnnouncerContextValue {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | null>(null);

export const useAnnouncer = (): AnnouncerContextValue => {
  const context = useContext(AnnouncerContext);
  if (!context) {
    throw new Error('useAnnouncer must be used within an AnnouncerProvider');
  }
  return context;
};

interface AnnouncerProviderProps {
  children: React.ReactNode;
}

export const AnnouncerProvider: React.FC<AnnouncerProviderProps> = ({
  children,
}) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (priority === 'assertive') {
      setAssertiveMessage(message);
      setTimeout(() => setAssertiveMessage(''), 100);
    } else {
      setPoliteMessage(message);
      setTimeout(() => setPoliteMessage(''), 100);
    }
  }, []);

  const srOnlyStyles: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  };

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={srOnlyStyles as any}
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={srOnlyStyles as any}
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
};

// ==================== USE ID ====================

let idCounter = 0;

export const useId = (prefix: string = 'id'): string => {
  const [id] = useState(() => `${prefix}-${++idCounter}`);
  return id;
};

// ==================== USE DISCLOSURE ====================

interface UseDisclosureReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  getButtonProps: () => {
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
  };
  getPanelProps: () => {
    id: string;
    hidden: boolean;
  };
}

export const useDisclosure = (
  defaultOpen: boolean = false
): UseDisclosureReturn => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const id = useId('disclosure');

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const getButtonProps = useCallback(
    () => ({
      'aria-expanded': isOpen,
      'aria-controls': id,
      onClick: toggle,
    }),
    [isOpen, id, toggle]
  );

  const getPanelProps = useCallback(
    () => ({
      id,
      hidden: !isOpen,
    }),
    [id, isOpen]
  );

  return {
    isOpen,
    open,
    close,
    toggle,
    getButtonProps,
    getPanelProps,
  };
};

// ==================== USE LABEL ====================

interface UseLabelReturn {
  labelId: string;
  inputId: string;
  getLabelProps: () => {
    id: string;
    htmlFor: string;
  };
  getInputProps: () => {
    id: string;
    'aria-labelledby': string;
  };
}

export const useLabel = (): UseLabelReturn => {
  const labelId = useId('label');
  const inputId = useId('input');

  const getLabelProps = useCallback(
    () => ({
      id: labelId,
      htmlFor: inputId,
    }),
    [labelId, inputId]
  );

  const getInputProps = useCallback(
    () => ({
      id: inputId,
      'aria-labelledby': labelId,
    }),
    [inputId, labelId]
  );

  return {
    labelId,
    inputId,
    getLabelProps,
    getInputProps,
  };
};

// ==================== USE DESCRIPTION ====================

interface UseDescriptionReturn {
  descriptionId: string;
  getDescriptionProps: () => {
    id: string;
  };
  getInputProps: () => {
    'aria-describedby': string;
  };
}

export const useDescription = (): UseDescriptionReturn => {
  const descriptionId = useId('description');

  const getDescriptionProps = useCallback(
    () => ({
      id: descriptionId,
    }),
    [descriptionId]
  );

  const getInputProps = useCallback(
    () => ({
      'aria-describedby': descriptionId,
    }),
    [descriptionId]
  );

  return {
    descriptionId,
    getDescriptionProps,
    getInputProps,
  };
};

// ==================== ACCESSIBLE ICON ====================

interface AccessibleIconProps {
  icon: React.ReactNode;
  label: string;
}

export const AccessibleIcon: React.FC<AccessibleIconProps> = ({
  icon,
  label,
}) => {
  return (
    <span role="img" aria-label={label}>
      {icon}
    </span>
  );
};

// ==================== ACCESSIBLE BUTTON ====================

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  children,
  loading = false,
  loadingLabel = 'Loading',
  disabled,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-disabled={disabled || loading}
    >
      {loading ? (
        <>
          <span aria-hidden="true">Loading...</span>
          <span
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {loadingLabel}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

// ==================== ACCESSIBLE FORM FIELD ====================

interface AccessibleFormFieldProps {
  children: React.ReactElement;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
}

export const AccessibleFormField: React.FC<AccessibleFormFieldProps> = ({
  children,
  label,
  description,
  error,
  required,
}) => {
  const labelId = useId('label');
  const descriptionId = useId('description');
  const errorId = useId('error');

  const describedBy = [
    description ? descriptionId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    label: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    required: {
      color: '#f44336',
      marginLeft: 4,
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    error: {
      fontSize: 12,
      color: '#f44336',
    },
  };

  return (
    <div style={styles.container as any}>
      <label id={labelId} style={styles.label}>
        {label}
        {required && (
          <span style={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {React.cloneElement(children, {
        'aria-labelledby': labelId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': !!error,
        'aria-required': required,
      })}
      {description && (
        <span id={descriptionId} style={styles.description}>
          {description}
        </span>
      )}
      {error && (
        <span id={errorId} style={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

// ==================== HEADING LEVEL CONTEXT ====================

const HeadingLevelContext = createContext<number>(1);

interface HeadingProviderProps {
  children: React.ReactNode;
  level?: number;
}

export const HeadingProvider: React.FC<HeadingProviderProps> = ({
  children,
  level,
}) => {
  const parentLevel = useContext(HeadingLevelContext);
  const currentLevel = level ?? parentLevel;

  return (
    <HeadingLevelContext.Provider value={currentLevel}>
      {children}
    </HeadingLevelContext.Provider>
  );
};

export const Section: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const level = useContext(HeadingLevelContext);

  return (
    <HeadingLevelContext.Provider value={Math.min(level + 1, 6)}>
      <section>{children}</section>
    </HeadingLevelContext.Provider>
  );
};

interface HeadingProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Heading: React.FC<HeadingProps> = ({
  children,
  className,
  style,
}) => {
  const level = useContext(HeadingLevelContext);
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  return React.createElement(Tag, { className, style }, children);
};

// ==================== USE REDUCED MOTION ====================

export const useReducedMotion = (): boolean => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
};

// ==================== USE HIGH CONTRAST ====================

export const useHighContrast = (): boolean => {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    setHighContrast(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setHighContrast(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return highContrast;
};

// ==================== PROGRESS WITH ANNOUNCEMENT ====================

interface AccessibleProgressProps {
  value: number;
  max?: number;
  label: string;
  announceOnComplete?: boolean;
}

export const AccessibleProgress: React.FC<AccessibleProgressProps> = ({
  value,
  max = 100,
  label,
  announceOnComplete = true,
}) => {
  const prevValue = useRef(value);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (announceOnComplete && value >= max && prevValue.current < max) {
      setAnnouncement(`${label} complete`);
      setTimeout(() => setAnnouncement(''), 100);
    }
    prevValue.current = value;
  }, [value, max, label, announceOnComplete]);

  const percentage = Math.round((value / max) * 100);

  return (
    <>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        aria-valuetext={`${percentage}% complete`}
        style={{
          height: 8,
          borderRadius: 4,
          background: 'var(--color-bg-tertiary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {announcement && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {announcement}
        </div>
      )}
    </>
  );
};

export default LiveRegion;
