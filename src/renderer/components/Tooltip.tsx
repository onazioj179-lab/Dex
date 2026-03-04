/**
 * DEX Tooltip System
 * Tooltips and popovers for helpful information
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
type TooltipTrigger = 'hover' | 'click' | 'focus';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: TooltipPosition;
  trigger?: TooltipTrigger;
  delay?: number;
  disabled?: boolean;
  maxWidth?: number;
  showArrow?: boolean;
}

interface PopoverProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: TooltipPosition;
  trigger?: TooltipTrigger;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  closeOnClickOutside?: boolean;
  showArrow?: boolean;
  maxWidth?: number;
}

// ==================== TOOLTIP ====================

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  trigger = 'hover',
  delay = 200,
  disabled = false,
  maxWidth = 250,
  showArrow = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        y = triggerRect.top - tooltipRect.height - gap;
        break;
      case 'bottom':
        x = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        y = triggerRect.bottom + gap;
        break;
      case 'left':
        x = triggerRect.left - tooltipRect.width - gap;
        y = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        break;
      case 'right':
        x = triggerRect.right + gap;
        y = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        break;
    }

    // Keep tooltip in viewport
    x = Math.max(8, Math.min(x, window.innerWidth - tooltipRect.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - tooltipRect.height - 8));

    setCoords({ x, y });
  }, [position]);

  const show = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [disabled, delay]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  const toggle = useCallback(() => {
    if (isVisible) {
      hide();
    } else {
      show();
    }
  }, [isVisible, show, hide]);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const triggerProps: Record<string, any> = {};

  if (trigger === 'hover') {
    triggerProps.onMouseEnter = show;
    triggerProps.onMouseLeave = hide;
  } else if (trigger === 'click') {
    triggerProps.onClick = toggle;
  } else if (trigger === 'focus') {
    triggerProps.onFocus = show;
    triggerProps.onBlur = hide;
  }

  const arrowStyles: Record<TooltipPosition, React.CSSProperties> = {
    top: {
      bottom: -4,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    bottom: {
      top: -4,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    left: {
      right: -4,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
    right: {
      left: -4,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
  };

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      display: 'inline-flex',
    },
    tooltip: {
      position: 'fixed',
      left: coords.x,
      top: coords.y,
      padding: '8px 12px',
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
      fontSize: 13,
      color: 'var(--color-text-primary)',
      maxWidth,
      zIndex: 10001,
      animation: 'tooltipFade 0.15s ease-out',
    },
    arrow: {
      position: 'absolute',
      width: 8,
      height: 8,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderTop: 'none',
      borderLeft: 'none',
      ...arrowStyles[position],
    },
  };

  return (
    <>
      <style>{`
        @keyframes tooltipFade {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div ref={triggerRef} style={styles.trigger} {...triggerProps}>
        {children}
      </div>
      {isVisible && (
        <div ref={tooltipRef} style={styles.tooltip}>
          {content}
          {showArrow && <div style={styles.arrow} />}
        </div>
      )}
    </>
  );
};

// ==================== POPOVER ====================

export const Popover: React.FC<PopoverProps> = ({
  content,
  children,
  position = 'bottom',
  trigger = 'click',
  isOpen: controlledIsOpen,
  onOpenChange,
  closeOnClickOutside = true,
  showArrow = true,
  maxWidth = 300,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const gap = 10;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        y = triggerRect.top - popoverRect.height - gap;
        break;
      case 'bottom':
        x = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        y = triggerRect.bottom + gap;
        break;
      case 'left':
        x = triggerRect.left - popoverRect.width - gap;
        y = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        break;
      case 'right':
        x = triggerRect.right + gap;
        y = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        break;
    }

    // Keep in viewport
    x = Math.max(8, Math.min(x, window.innerWidth - popoverRect.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - popoverRect.height - 8));

    setCoords({ x, y });
  }, [position]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
    }
  }, [isOpen, calculatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen || !closeOnClickOutside) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeOnClickOutside, setIsOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, setIsOpen]);

  const triggerProps: Record<string, any> = {};

  if (trigger === 'hover') {
    triggerProps.onMouseEnter = () => setIsOpen(true);
    triggerProps.onMouseLeave = () => setIsOpen(false);
  } else if (trigger === 'click') {
    triggerProps.onClick = () => setIsOpen(!isOpen);
  } else if (trigger === 'focus') {
    triggerProps.onFocus = () => setIsOpen(true);
    triggerProps.onBlur = () => setIsOpen(false);
  }

  const arrowStyles: Record<TooltipPosition, React.CSSProperties> = {
    top: {
      bottom: -6,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    bottom: {
      top: -6,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    },
    left: {
      right: -6,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
    right: {
      left: -6,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    },
  };

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      display: 'inline-flex',
    },
    popover: {
      position: 'fixed',
      left: coords.x,
      top: coords.y,
      padding: 16,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      maxWidth,
      zIndex: 10001,
      animation: 'popoverFade 0.2s ease-out',
    },
    arrow: {
      position: 'absolute',
      width: 12,
      height: 12,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderTop: 'none',
      borderLeft: 'none',
      ...arrowStyles[position],
    },
  };

  return (
    <>
      <style>{`
        @keyframes popoverFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div ref={triggerRef} style={styles.trigger} {...triggerProps}>
        {children}
      </div>
      {isOpen && (
        <div ref={popoverRef} style={styles.popover}>
          {content}
          {showArrow && <div style={styles.arrow} />}
        </div>
      )}
    </>
  );
};

// ==================== INFO TOOLTIP ====================

interface InfoTooltipProps {
  content: React.ReactNode;
  position?: TooltipPosition;
  size?: number;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  position = 'top',
  size = 16,
}) => {
  const styles: React.CSSProperties = {
    width: size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    cursor: 'help',
  };

  return (
    <Tooltip content={content} position={position}>
      <span style={styles}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
    </Tooltip>
  );
};

// ==================== KEYBOARD SHORTCUT TOOLTIP ====================

interface ShortcutTooltipProps {
  label: string;
  shortcut: string;
  children: React.ReactElement;
  position?: TooltipPosition;
}

export const ShortcutTooltip: React.FC<ShortcutTooltipProps> = ({
  label,
  shortcut,
  children,
  position = 'top',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    content: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    },
    label: {
      color: 'var(--color-text-primary)',
    },
    shortcut: {
      padding: '2px 6px',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: 'monospace',
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <Tooltip
      position={position}
      content={
        <div style={styles.content}>
          <span style={styles.label}>{label}</span>
          <span style={styles.shortcut}>{shortcut}</span>
        </div>
      }
    >
      {children}
    </Tooltip>
  );
};

export default Tooltip;
