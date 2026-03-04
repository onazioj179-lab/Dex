/**
 * DEX Accordion Component
 * Expandable/collapsible content panels
 */

import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface AccordionItem {
  id: string;
  title: string | React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultExpanded?: string[];
  expanded?: string[];
  onChange?: (expandedIds: string[]) => void;
  allowMultiple?: boolean;
  variant?: 'default' | 'bordered' | 'separated' | 'flush';
  size?: 'small' | 'medium' | 'large';
  iconPosition?: 'left' | 'right';
  animationDuration?: number;
}

interface AccordionItemProps {
  item: AccordionItem;
  isExpanded: boolean;
  onToggle: () => void;
  variant: 'default' | 'bordered' | 'separated' | 'flush';
  size: 'small' | 'medium' | 'large';
  iconPosition: 'left' | 'right';
  animationDuration: number;
  isFirst?: boolean;
  isLast?: boolean;
}

interface CollapsibleProps {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  animationDuration?: number;
}

// ==================== ACCORDION CONTEXT ====================

interface AccordionContextValue {
  expanded: string[];
  toggle: (id: string) => void;
  variant: 'default' | 'bordered' | 'separated' | 'flush';
  size: 'small' | 'medium' | 'large';
  iconPosition: 'left' | 'right';
  animationDuration: number;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

// ==================== ACCORDION ====================

export const Accordion: React.FC<AccordionProps> = ({
  items,
  defaultExpanded = [],
  expanded: controlledExpanded,
  onChange,
  allowMultiple = false,
  variant = 'default',
  size = 'medium',
  iconPosition = 'right',
  animationDuration = 200,
}) => {
  const [internalExpanded, setInternalExpanded] = useState<string[]>(defaultExpanded);
  const expanded = controlledExpanded ?? internalExpanded;

  const toggle = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (item?.disabled) return;

    let newExpanded: string[];

    if (expanded.includes(id)) {
      newExpanded = expanded.filter(e => e !== id);
    } else {
      newExpanded = allowMultiple ? [...expanded, id] : [id];
    }

    setInternalExpanded(newExpanded);
    onChange?.(newExpanded);
  }, [expanded, allowMultiple, items, onChange]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      ...(variant === 'separated' && { gap: 8 }),
    },
  };

  return (
    <AccordionContext.Provider value={{ expanded, toggle, variant, size, iconPosition, animationDuration }}>
      <div style={styles.container}>
        {items.map((item, index) => (
          <AccordionPanel
            key={item.id}
            item={item}
            isExpanded={expanded.includes(item.id)}
            onToggle={() => toggle(item.id)}
            variant={variant}
            size={size}
            iconPosition={iconPosition}
            animationDuration={animationDuration}
            isFirst={index === 0}
            isLast={index === items.length - 1}
          />
        ))}
      </div>
    </AccordionContext.Provider>
  );
};

// ==================== ACCORDION PANEL ====================

const AccordionPanel: React.FC<AccordionItemProps> = ({
  item,
  isExpanded,
  onToggle,
  variant,
  size,
  iconPosition,
  animationDuration,
  isFirst,
  isLast,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(isExpanded ? 'auto' : 0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (isExpanded) {
      // Expand
      setIsAnimating(true);
      const scrollHeight = content.scrollHeight;
      setHeight(scrollHeight);
      const timer = setTimeout(() => {
        setHeight('auto');
        setIsAnimating(false);
      }, animationDuration);
      return () => clearTimeout(timer);
    } else {
      // Collapse
      if (height === 'auto') {
        setHeight(content.scrollHeight);
        requestAnimationFrame(() => {
          setIsAnimating(true);
          setHeight(0);
        });
      } else {
        setHeight(0);
      }
      const timer = setTimeout(() => setIsAnimating(false), animationDuration);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, animationDuration]);

  // Size config
  const sizeConfig = {
    small: { padding: '8px 12px', fontSize: 13, iconSize: 12 },
    medium: { padding: '12px 16px', fontSize: 14, iconSize: 14 },
    large: { padding: '16px 20px', fontSize: 16, iconSize: 16 },
  };

  const config = sizeConfig[size];

  // Border radius based on position
  const getBorderRadius = () => {
    if (variant === 'separated') return 6;
    if (variant === 'flush') return 0;
    if (isFirst && isLast) return 6;
    if (isFirst) return '6px 6px 0 0';
    if (isLast) return '0 0 6px 6px';
    return 0;
  };

  const styles: Record<string, React.CSSProperties> = {
    panel: {
      overflow: 'hidden',
      ...(variant === 'bordered' && {
        border: '1px solid var(--color-border)',
        borderRadius: getBorderRadius(),
        ...(!isFirst && { borderTop: 'none' }),
      }),
      ...(variant === 'separated' && {
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }),
      ...(variant === 'flush' && {
        borderBottom: '1px solid var(--color-border)',
      }),
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      padding: config.padding,
      fontSize: config.fontSize,
      fontWeight: 500,
      color: item.disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
      background: variant === 'default' || variant === 'flush' ? 'transparent' : 'var(--color-bg-secondary)',
      border: 'none',
      cursor: item.disabled ? 'not-allowed' : 'pointer',
      textAlign: 'left',
      transition: 'background 0.15s',
    },
    headerHover: {
      background: 'var(--color-bg-hover)',
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      fontSize: config.iconSize,
      color: 'var(--color-text-muted)',
      transition: `transform ${animationDuration}ms ease`,
      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
      ...(iconPosition === 'right' && { marginLeft: 'auto' }),
    },
    title: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 6px',
      fontSize: 11,
      fontWeight: 600,
      background: 'var(--color-accent)',
      color: 'white',
      borderRadius: 9,
    },
    contentWrapper: {
      height: typeof height === 'number' ? height : 'auto',
      overflow: 'hidden',
      transition: isAnimating ? `height ${animationDuration}ms ease` : 'none',
    },
    content: {
      padding: config.padding,
      paddingTop: 0,
      color: 'var(--color-text-secondary)',
      fontSize: config.fontSize,
    },
  };

  return (
    <div style={styles.panel}>
      <button
        style={styles.header}
        onClick={onToggle}
        disabled={item.disabled}
        aria-expanded={isExpanded}
      >
        {iconPosition === 'left' && (
          <span style={styles.icon}>▼</span>
        )}
        {item.icon && <span>{item.icon}</span>}
        <span style={styles.title}>
          {item.title}
          {item.badge !== undefined && (
            <span style={styles.badge}>{item.badge}</span>
          )}
        </span>
        {iconPosition === 'right' && (
          <span style={styles.icon}>▼</span>
        )}
      </button>

      <div style={styles.contentWrapper}>
        <div ref={contentRef} style={styles.content}>
          {item.content}
        </div>
      </div>
    </div>
  );
};

// ==================== COLLAPSIBLE ====================

export const Collapsible: React.FC<CollapsibleProps> = ({
  children,
  trigger,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  animationDuration = 200,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(defaultOpen ? 'auto' : 0);
  const [isAnimating, setIsAnimating] = useState(false);

  const open = controlledOpen ?? internalOpen;

  const toggle = useCallback(() => {
    if (disabled) return;
    const newOpen = !open;
    setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  }, [disabled, open, onOpenChange]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (open) {
      setIsAnimating(true);
      const scrollHeight = content.scrollHeight;
      setHeight(scrollHeight);
      const timer = setTimeout(() => {
        setHeight('auto');
        setIsAnimating(false);
      }, animationDuration);
      return () => clearTimeout(timer);
    } else {
      if (height === 'auto') {
        setHeight(content.scrollHeight);
        requestAnimationFrame(() => {
          setIsAnimating(true);
          setHeight(0);
        });
      } else {
        setHeight(0);
      }
      const timer = setTimeout(() => setIsAnimating(false), animationDuration);
      return () => clearTimeout(timer);
    }
  }, [open, animationDuration]);

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    contentWrapper: {
      height: typeof height === 'number' ? height : 'auto',
      overflow: 'hidden',
      transition: isAnimating ? `height ${animationDuration}ms ease` : 'none',
    },
  };

  return (
    <div>
      <div style={styles.trigger} onClick={toggle}>
        {typeof trigger === 'function' ? (trigger as any)({ open }) : trigger}
      </div>
      <div style={styles.contentWrapper}>
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
};

// ==================== DETAILS (Native-like) ====================

interface DetailsProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  icon?: boolean;
}

export const Details: React.FC<DetailsProps> = ({
  summary,
  children,
  open: controlledOpen,
  defaultOpen = false,
  onToggle,
  icon = true,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;

  const handleToggle = useCallback(() => {
    const newOpen = !open;
    setInternalOpen(newOpen);
    onToggle?.(newOpen);
  }, [open, onToggle]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: '100%',
    },
    summary: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 0',
      cursor: 'pointer',
      userSelect: 'none',
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    icon: {
      display: 'inline-block',
      transition: 'transform 0.2s ease',
      transform: open ? 'rotate(90deg)' : 'rotate(0)',
      color: 'var(--color-text-muted)',
    },
    content: {
      paddingLeft: icon ? 20 : 0,
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.summary} onClick={handleToggle}>
        {icon && <span style={styles.icon}>▶</span>}
        {summary}
      </div>
      {open && <div style={styles.content}>{children}</div>}
    </div>
  );
};

// ==================== HOOK: useAccordion ====================

export const useAccordion = (initialExpanded: string[] = [], allowMultiple = false) => {
  const [expanded, setExpanded] = useState<string[]>(initialExpanded);

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      if (prev.includes(id)) {
        return prev.filter(e => e !== id);
      }
      return allowMultiple ? [...prev, id] : [id];
    });
  }, [allowMultiple]);

  const expand = useCallback((id: string) => {
    setExpanded(prev => {
      if (prev.includes(id)) return prev;
      return allowMultiple ? [...prev, id] : [id];
    });
  }, [allowMultiple]);

  const collapse = useCallback((id: string) => {
    setExpanded(prev => prev.filter(e => e !== id));
  }, []);

  const expandAll = useCallback((ids: string[]) => {
    setExpanded(ids);
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded([]);
  }, []);

  const isExpanded = useCallback((id: string) => expanded.includes(id), [expanded]);

  return {
    expanded,
    toggle,
    expand,
    collapse,
    expandAll,
    collapseAll,
    isExpanded,
  };
};

export default Accordion;
