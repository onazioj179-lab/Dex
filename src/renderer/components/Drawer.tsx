/**
 * DEX Drawer & Sheet Components
 * Slide-out panels and overlay sheets
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  position?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | number;
  showOverlay?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  title?: string;
  footer?: React.ReactNode;
  preserveScroll?: boolean;
}

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | number;
}

interface DrawerContextType {
  closeDrawer: () => void;
}

// ==================== CONTEXT ====================

const DrawerContext = createContext<DrawerContextType | null>(null);

export const useDrawer = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a Drawer');
  }
  return context;
};

// ==================== DRAWER ====================

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  children,
  position = 'right',
  size = 'md',
  showOverlay = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  title,
  footer,
  preserveScroll = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const sizeMap = {
    sm: 320,
    md: 400,
    lg: 520,
    xl: 700,
    full: '100%',
  };

  const drawerSize = typeof size === 'number' ? size : sizeMap[size];

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
      if (!preserveScroll) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, preserveScroll]);

  useEffect(() => {
    if (closeOnEscape && isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [closeOnEscape, isOpen, onClose]);

  if (!isVisible) return null;

  const isHorizontal = position === 'left' || position === 'right';

  const getTransform = (): string => {
    if (!isAnimating) {
      switch (position) {
        case 'left': return 'translateX(-100%)';
        case 'right': return 'translateX(100%)';
        case 'top': return 'translateY(-100%)';
        case 'bottom': return 'translateY(100%)';
      }
    }
    return 'translate(0)';
  };

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      opacity: isAnimating ? 1 : 0,
      transition: 'opacity 0.3s ease',
      zIndex: 999,
    },
    drawer: {
      position: 'fixed',
      background: 'var(--color-bg-primary)',
      boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      transition: 'transform 0.3s ease',
      transform: getTransform(),
      ...(position === 'left' && {
        top: 0,
        left: 0,
        bottom: 0,
        width: drawerSize,
      }),
      ...(position === 'right' && {
        top: 0,
        right: 0,
        bottom: 0,
        width: drawerSize,
      }),
      ...(position === 'top' && {
        top: 0,
        left: 0,
        right: 0,
        height: drawerSize,
      }),
      ...(position === 'bottom' && {
        bottom: 0,
        left: 0,
        right: 0,
        height: drawerSize,
      }),
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid var(--color-border)',
      flexShrink: 0,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    closeButton: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 18,
      transition: 'background 0.15s',
    },
    content: {
      flex: 1,
      overflow: 'auto',
      padding: 20,
    },
    footer: {
      padding: '16px 20px',
      borderTop: '1px solid var(--color-border)',
      flexShrink: 0,
    },
  };

  return (
    <DrawerContext.Provider value={{ closeDrawer: onClose }}>
      {showOverlay && (
        <div
          style={styles.overlay}
          onClick={closeOnOverlayClick ? onClose : undefined}
        />
      )}
      <div style={styles.drawer} role="dialog" aria-modal="true">
        {(title || showCloseButton) && (
          <div style={styles.header}>
            {title && <h2 style={styles.title}>{title}</h2>}
            {showCloseButton && (
              <button
                style={styles.closeButton}
                onClick={onClose}
                aria-label="Close drawer"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div style={styles.content}>{children}</div>
        {footer && <div style={styles.footer}>{footer}</div>}
      </div>
    </DrawerContext.Provider>
  );
};

// ==================== SHEET ====================

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  children,
  side = 'bottom',
  size = 'md',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const sizeMap = {
    sm: 240,
    md: 360,
    lg: 480,
    xl: 600,
    full: '100%',
  };

  const sheetSize = typeof size === 'number' ? size : sizeMap[size];

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isVisible) return null;

  const isVertical = side === 'top' || side === 'bottom';

  const getTransform = (): string => {
    if (!isAnimating) {
      switch (side) {
        case 'left': return 'translateX(-100%)';
        case 'right': return 'translateX(100%)';
        case 'top': return 'translateY(-100%)';
        case 'bottom': return 'translateY(100%)';
      }
    }
    return 'translate(0)';
  };

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      opacity: isAnimating ? 1 : 0,
      transition: 'opacity 0.3s ease',
      zIndex: 999,
    },
    sheet: {
      position: 'fixed',
      background: 'var(--color-bg-primary)',
      borderRadius: isVertical ? '16px 16px 0 0' : '0 16px 16px 0',
      boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
      transition: 'transform 0.3s ease',
      transform: getTransform(),
      overflow: 'hidden',
      ...(side === 'bottom' && {
        bottom: 0,
        left: 0,
        right: 0,
        height: sheetSize,
        maxHeight: '90vh',
        borderRadius: '16px 16px 0 0',
      }),
      ...(side === 'top' && {
        top: 0,
        left: 0,
        right: 0,
        height: sheetSize,
        maxHeight: '90vh',
        borderRadius: '0 0 16px 16px',
      }),
      ...(side === 'left' && {
        top: 0,
        left: 0,
        bottom: 0,
        width: sheetSize,
        maxWidth: '90vw',
        borderRadius: '0 16px 16px 0',
      }),
      ...(side === 'right' && {
        top: 0,
        right: 0,
        bottom: 0,
        width: sheetSize,
        maxWidth: '90vw',
        borderRadius: '16px 0 0 16px',
      }),
    },
    handle: {
      width: isVertical ? 36 : 4,
      height: isVertical ? 4 : 36,
      background: 'var(--color-border)',
      borderRadius: 2,
      margin: isVertical ? '12px auto' : 'auto 12px',
      cursor: 'grab',
    },
    content: {
      flex: 1,
      overflow: 'auto',
      padding: 20,
    },
  };

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.sheet}>
        {isVertical && <div style={styles.handle} />}
        <div style={styles.content}>{children}</div>
      </div>
    </>
  );
};

// ==================== PANEL ====================

interface PanelProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose?: () => void;
  position?: 'left' | 'right';
  width?: number | string;
  resizable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  showBorder?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  children,
  isOpen,
  onClose,
  position = 'right',
  width = 320,
  resizable = false,
  minWidth = 200,
  maxWidth = 600,
  showBorder = true,
}) => {
  const [panelWidth, setPanelWidth] = useState(typeof width === 'number' ? width : 320);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!resizable || !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = position === 'right'
        ? window.innerWidth - e.clientX
        : e.clientX;
      setPanelWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizable, isResizing, position, minWidth, maxWidth]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    panel: {
      width: typeof width === 'string' ? width : panelWidth,
      height: '100%',
      background: 'var(--color-bg-secondary)',
      borderLeft: position === 'right' && showBorder ? '1px solid var(--color-border)' : 'none',
      borderRight: position === 'left' && showBorder ? '1px solid var(--color-border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      flexShrink: 0,
    },
    resizer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 4,
      cursor: 'col-resize',
      background: isResizing ? 'var(--color-accent)' : 'transparent',
      transition: 'background 0.15s',
      ...(position === 'right' ? { left: 0 } : { right: 0 }),
    },
    content: {
      flex: 1,
      overflow: 'auto',
    },
  };

  return (
    <div style={styles.panel}>
      {resizable && (
        <div
          style={styles.resizer}
          onMouseDown={handleMouseDown}
        />
      )}
      <div style={styles.content}>{children}</div>
    </div>
  );
};

// ==================== SLIDE OVER ====================

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  width?: number | string;
  showBackdrop?: boolean;
}

export const SlideOver: React.FC<SlideOverProps> = ({
  isOpen,
  onClose,
  children,
  title,
  description,
  width = 500,
  showBackdrop = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => setIsAnimating(true));
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = '';
      }, 300);
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isVisible) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 1000,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      opacity: isAnimating ? 1 : 0,
      transition: 'opacity 0.3s ease',
    },
    panel: {
      position: 'relative',
      width,
      maxWidth: '100vw',
      height: '100%',
      background: 'var(--color-bg-primary)',
      boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      transform: isAnimating ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s ease',
    },
    header: {
      padding: '20px 24px',
      borderBottom: '1px solid var(--color-border)',
    },
    headerContent: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: '4px 0 0 0',
    },
    closeButton: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 20,
      marginLeft: 16,
    },
    content: {
      flex: 1,
      overflow: 'auto',
      padding: 24,
    },
  };

  return (
    <div style={styles.container}>
      {showBackdrop && <div style={styles.backdrop} onClick={onClose} />}
      <div style={styles.panel}>
        {(title || description) && (
          <div style={styles.header}>
            <div style={styles.headerContent}>
              <div>
                {title && <h2 style={styles.title}>{title}</h2>}
                {description && <p style={styles.description}>{description}</p>}
              </div>
              <button style={styles.closeButton} onClick={onClose}>
                ×
              </button>
            </div>
          </div>
        )}
        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
};

export default Drawer;
