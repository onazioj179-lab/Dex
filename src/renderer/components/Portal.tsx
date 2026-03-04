/**
 * DEX Portal Component
 * Render content outside DOM hierarchy
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ==================== TYPES ====================

interface PortalProps {
  children: React.ReactNode;
  container?: Element | null;
  disabled?: boolean;
}

interface OverlayPortalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  lockScroll?: boolean;
  zIndex?: number;
}

interface TooltipPortalProps {
  targetRef: React.RefObject<HTMLElement>;
  isVisible: boolean;
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
}

interface DropdownPortalProps {
  targetRef: React.RefObject<HTMLElement>;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  offset?: number;
}

// ==================== PORTAL ====================

export const Portal: React.FC<PortalProps> = ({
  children,
  container,
  disabled = false,
}) => {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<Element | null>(null);

  useEffect(() => {
    setMounted(true);
    containerRef.current = container || document.body;
    return () => setMounted(false);
  }, [container]);

  if (disabled || !mounted || !containerRef.current) {
    return <>{children}</>;
  }

  return createPortal(children, containerRef.current);
};

// ==================== OVERLAY PORTAL ====================

export const OverlayPortal: React.FC<OverlayPortalProps> = ({
  isOpen,
  onClose,
  children,
  closeOnEscape = true,
  closeOnOverlayClick = true,
  lockScroll = true,
  zIndex = 1000,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Lock scroll
  useEffect(() => {
    if (!isOpen || !lockScroll) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, lockScroll]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;

    const focusableElements = overlayRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    firstElement?.focus();

    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex,
      animation: 'fadeIn 0.15s ease-out',
    },
    content: {
      position: 'relative',
      maxHeight: '90vh',
      maxWidth: '90vw',
      overflow: 'auto',
    },
  };

  return (
    <Portal>
      <div
        ref={overlayRef}
        style={styles.overlay as any}
        onClick={closeOnOverlayClick ? onClose : undefined}
      >
        <div style={styles.content} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </Portal>
  );
};

// ==================== TOOLTIP PORTAL ====================

export const TooltipPortal: React.FC<TooltipPortalProps> = ({
  targetRef,
  isVisible,
  children,
  placement = 'top',
  offset = 8,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible || !targetRef.current) return;

    const updatePosition = () => {
      const target = targetRef.current;
      const tooltip = tooltipRef.current;
      if (!target || !tooltip) return;

      const targetRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let top = 0;
      let left = 0;

      switch (placement) {
        case 'top':
          top = targetRect.top - tooltipRect.height - offset;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = targetRect.bottom + offset;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.left - tooltipRect.width - offset;
          break;
        case 'right':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.right + offset;
          break;
      }

      // Keep within viewport
      const padding = 8;
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, targetRef, placement, offset]);

  if (!isVisible) return null;

  const styles: React.CSSProperties = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    zIndex: 9999,
    animation: 'fadeIn 0.1s ease-out',
  };

  return (
    <Portal>
      <div ref={tooltipRef} style={styles}>
        {children}
      </div>
    </Portal>
  );
};

// ==================== DROPDOWN PORTAL ====================

export const DropdownPortal: React.FC<DropdownPortalProps> = ({
  targetRef,
  isOpen,
  onClose,
  children,
  placement = 'bottom-start',
  offset = 4,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const target = targetRef.current;
    const dropdown = dropdownRef.current;
    if (!target || !dropdown) return;

    const targetRect = target.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom-start':
        top = targetRect.bottom + offset;
        left = targetRect.left;
        break;
      case 'bottom-end':
        top = targetRect.bottom + offset;
        left = targetRect.right - dropdownRect.width;
        break;
      case 'top-start':
        top = targetRect.top - dropdownRect.height - offset;
        left = targetRect.left;
        break;
      case 'top-end':
        top = targetRect.top - dropdownRect.height - offset;
        left = targetRect.right - dropdownRect.width;
        break;
    }

    // Keep within viewport
    const padding = 8;
    left = Math.max(padding, Math.min(left, window.innerWidth - dropdownRect.width - padding));

    // Flip if needed
    if (top < padding) {
      top = targetRect.bottom + offset;
    }
    if (top + dropdownRect.height > window.innerHeight - padding) {
      top = targetRect.top - dropdownRect.height - offset;
    }

    setPosition({ top, left });
  }, [targetRef, placement, offset]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        targetRef.current &&
        !targetRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose, targetRef]);

  if (!isOpen) return null;

  const styles: React.CSSProperties = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    zIndex: 1000,
    animation: 'fadeIn 0.1s ease-out',
  };

  return (
    <Portal>
      <div ref={dropdownRef} style={styles}>
        {children}
      </div>
    </Portal>
  );
};

// ==================== FLOATING PORTAL ====================

interface FloatingPortalProps {
  anchor: { x: number; y: number } | React.RefObject<HTMLElement>;
  isVisible: boolean;
  children: React.ReactNode;
  offset?: { x: number; y: number };
}

export const FloatingPortal: React.FC<FloatingPortalProps> = ({
  anchor,
  isVisible,
  children,
  offset = { x: 0, y: 0 },
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      let x: number;
      let y: number;

      if ('current' in anchor) {
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect) return;
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else {
        x = anchor.x;
        y = anchor.y;
      }

      const content = contentRef.current;
      if (!content) {
        setPosition({ top: y + offset.y, left: x + offset.x });
        return;
      }

      const rect = content.getBoundingClientRect();
      let left = x + offset.x;
      let top = y + offset.y;

      // Keep within viewport
      const padding = 8;
      left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding));

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, anchor, offset]);

  if (!isVisible) return null;

  const styles: React.CSSProperties = {
    position: 'fixed',
    top: position.top,
    left: position.left,
    zIndex: 9999,
  };

  return (
    <Portal>
      <div ref={contentRef} style={styles}>
        {children}
      </div>
    </Portal>
  );
};

// ==================== NOTIFICATION PORTAL ====================

interface NotificationPortalProps {
  children: React.ReactNode;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
}

export const NotificationPortal: React.FC<NotificationPortalProps> = ({
  children,
  position = 'top-right',
}) => {
  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 16,
      maxHeight: '100vh',
      overflow: 'auto',
    };

    switch (position) {
      case 'top-left':
        return { ...base, top: 0, left: 0 };
      case 'top-right':
        return { ...base, top: 0, right: 0 };
      case 'bottom-left':
        return { ...base, bottom: 0, left: 0, flexDirection: 'column-reverse' };
      case 'bottom-right':
        return { ...base, bottom: 0, right: 0, flexDirection: 'column-reverse' };
      case 'top-center':
        return { ...base, top: 0, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-center':
        return { ...base, bottom: 0, left: '50%', transform: 'translateX(-50%)', flexDirection: 'column-reverse' };
      default:
        return base;
    }
  };

  return (
    <Portal>
      <div style={getPositionStyles() as any}>
        {children}
      </div>
    </Portal>
  );
};

// ==================== USE PORTAL HOOK ====================

export const usePortal = (id: string = 'portal-root') => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let container = document.getElementById(id) as HTMLDivElement;

    if (!container) {
      container = document.createElement('div');
      container.id = id;
      document.body.appendChild(container);
    }

    rootRef.current = container;

    return () => {
      if (container && container.childNodes.length === 0) {
        container.remove();
      }
    };
  }, [id]);

  return rootRef.current;
};

export default Portal;
