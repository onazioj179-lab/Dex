/**
 * DEX Popover Component
 * Floating content and popovers
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

interface PopoverProps {
  content: React.ReactNode;
  children: React.ReactNode;
  trigger?: 'click' | 'hover';
  placement?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
  showArrow?: boolean;
  closeOnClickOutside?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  disabled?: boolean;
}

interface HoverCardProps {
  content: React.ReactNode;
  children: React.ReactNode;
  openDelay?: number;
  closeDelay?: number;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  placement?: 'bottom-start' | 'bottom-end' | 'bottom';
  disabled?: boolean;
}

interface DropdownItem {
  type?: 'item' | 'separator' | 'label';
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ConfirmPopoverProps {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  danger?: boolean;
}

// ==================== POPOVER ====================

export const Popover: React.FC<PopoverProps> = ({
  content,
  children,
  trigger = 'click',
  placement = 'bottom',
  offset = 8,
  showArrow = true,
  closeOnClickOutside = true,
  isOpen: controlledIsOpen,
  onOpenChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const open = controlledIsOpen !== undefined ? controlledIsOpen : isOpen;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = triggerRect.top - contentRect.height - offset;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.left - contentRect.width - offset;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.right + offset;
        break;
    }

    // Keep within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < 8) left = 8;
    if (left + contentRect.width > viewportWidth - 8) {
      left = viewportWidth - contentRect.width - 8;
    }
    if (top < 8) top = 8;
    if (top + contentRect.height > viewportHeight - 8) {
      top = viewportHeight - contentRect.height - 8;
    }

    setPosition({ top, left });
  }, [placement, offset]);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition);
    }

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || !closeOnClickOutside) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, closeOnClickOutside, onOpenChange]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    onOpenChange?.(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !open;
    setIsOpen(newValue);
    onOpenChange?.(newValue);
  };

  const getArrowStyle = (): React.CSSProperties => {
    const arrowSize = 8;
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    };

    switch (placement) {
      case 'top':
        return {
          ...base,
          bottom: -arrowSize,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `${arrowSize}px ${arrowSize}px 0`,
          borderColor: 'var(--color-bg-secondary) transparent transparent',
        };
      case 'bottom':
        return {
          ...base,
          top: -arrowSize,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: `0 ${arrowSize}px ${arrowSize}px`,
          borderColor: 'transparent transparent var(--color-bg-secondary)',
        };
      case 'left':
        return {
          ...base,
          right: -arrowSize,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${arrowSize}px 0 ${arrowSize}px ${arrowSize}px`,
          borderColor: 'transparent transparent transparent var(--color-bg-secondary)',
        };
      case 'right':
        return {
          ...base,
          left: -arrowSize,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: `${arrowSize}px ${arrowSize}px ${arrowSize}px 0`,
          borderColor: 'transparent var(--color-bg-secondary) transparent transparent',
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      display: 'inline-block',
    },
    content: {
      position: 'fixed',
      top: position.top,
      left: position.left,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
      animation: 'popoverFadeIn 0.15s ease-out',
    },
  };

  return (
    <>
      <div
        ref={triggerRef}
        style={styles.trigger}
        onClick={trigger === 'click' ? handleToggle : undefined}
        onMouseEnter={trigger === 'hover' ? handleOpen : undefined}
        onMouseLeave={trigger === 'hover' ? handleClose : undefined}
      >
        {children}
      </div>

      {open && (
        <div
          ref={contentRef}
          style={styles.content}
          onMouseEnter={trigger === 'hover' ? handleOpen : undefined}
          onMouseLeave={trigger === 'hover' ? handleClose : undefined}
        >
          {showArrow && <div style={getArrowStyle()} />}
          {content}
        </div>
      )}
    </>
  );
};

// ==================== HOVER CARD ====================

export const HoverCard: React.FC<HoverCardProps> = ({
  content,
  children,
  openDelay = 200,
  closeDelay = 100,
  placement = 'bottom',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = triggerRect.top - contentRect.height - 8;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.left - contentRect.width - 8;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
        left = triggerRect.right + 8;
        break;
    }

    setPosition({ top, left });
  }, [placement]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    openTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, openDelay);
  };

  const handleMouseLeave = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, closeDelay);
  };

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      display: 'inline-block',
    },
    card: {
      position: 'fixed',
      top: position.top,
      left: position.left,
      padding: 16,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
      zIndex: 1000,
      maxWidth: 320,
    },
  };

  return (
    <>
      <div
        ref={triggerRef}
        style={styles.trigger}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {isOpen && (
        <div
          ref={contentRef}
          style={styles.card}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {content}
        </div>
      )}
    </>
  );
};

// ==================== DROPDOWN MENU ====================

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  placement = 'bottom-start',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();

    let top = triggerRect.bottom + 4;
    let left = triggerRect.left;

    if (placement === 'bottom-end') {
      left = triggerRect.right;
    } else if (placement === 'bottom') {
      left = triggerRect.left + triggerRect.width / 2;
    }

    setPosition({ top, left });
  }, [isOpen, placement]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick?.();
    setIsOpen(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    trigger: {
      display: 'inline-block',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    menu: {
      position: 'fixed',
      top: position.top,
      left: placement === 'bottom-end' ? 'auto' : position.left,
      right: placement === 'bottom-end' ? window.innerWidth - position.left : 'auto',
      transform: placement === 'bottom' ? 'translateX(-50%)' : undefined,
      minWidth: 180,
      padding: 4,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    itemHover: {
      background: 'var(--color-bg-tertiary)',
    },
    itemDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    itemDanger: {
      color: '#ef4444',
    },
    icon: {
      width: 16,
      fontSize: 14,
      textAlign: 'center',
    },
    label: {
      flex: 1,
    },
    shortcut: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      marginLeft: 'auto',
    },
    separator: {
      height: 1,
      margin: '4px 0',
      background: 'var(--color-border)',
    },
    groupLabel: {
      padding: '8px 12px 4px',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
    },
  };

  return (
    <>
      <div
        ref={triggerRef}
        style={styles.trigger}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {trigger}
      </div>

      {isOpen && (
        <div ref={menuRef} style={styles.menu}>
          {items.map((item, index) => {
            if (item.type === 'separator') {
              return <div key={index} style={styles.separator} />;
            }

            if (item.type === 'label') {
              return (
                <div key={index} style={styles.groupLabel}>
                  {item.label}
                </div>
              );
            }

            return (
              <div
                key={index}
                style={{
                  ...styles.item,
                  ...(item.disabled ? styles.itemDisabled : {}),
                  ...(item.danger ? styles.itemDanger : {}),
                }}
                onClick={() => handleItemClick(item)}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {item.icon && <span style={styles.icon as any}>{item.icon}</span>}
                <span style={styles.label}>{item.label}</span>
                {item.shortcut && (
                  <span style={styles.shortcut}>{item.shortcut}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// ==================== CONFIRM POPOVER ====================

export const ConfirmPopover: React.FC<ConfirmPopoverProps> = ({
  trigger,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    onConfirm?.();
    setIsOpen(false);
  };

  const handleCancel = () => {
    onCancel?.();
    setIsOpen(false);
  };

  const content = (
    <div style={{ maxWidth: 280 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text)',
          marginBottom: description ? 8 : 16,
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-muted)',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={handleCancel}
          style={{
            padding: '6px 12px',
            background: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          {cancelText}
        </button>
        <button
          onClick={handleConfirm}
          style={{
            padding: '6px 12px',
            background: danger ? '#ef4444' : 'var(--color-accent)',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {confirmText}
        </button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="bottom"
      showArrow
    >
      {trigger}
    </Popover>
  );
};

// ==================== CONTEXT MENU (RIGHT CLICK) ====================

interface ContextMenuProviderProps {
  children: React.ReactNode;
  items: DropdownItem[];
}

export const ContextMenuProvider: React.FC<ContextMenuProviderProps> = ({
  children,
  items,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = () => setIsOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick?.();
    setIsOpen(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    menu: {
      position: 'fixed',
      top: position.y,
      left: position.x,
      minWidth: 180,
      padding: 4,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    separator: {
      height: 1,
      margin: '4px 0',
      background: 'var(--color-border)',
    },
  };

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>

      {isOpen && (
        <div style={styles.menu}>
          {items.map((item, index) => {
            if (item.type === 'separator') {
              return <div key={index} style={styles.separator} />;
            }

            return (
              <div
                key={index}
                style={{
                  ...styles.item,
                  opacity: item.disabled ? 0.5 : 1,
                  color: item.danger ? '#ef4444' : 'var(--color-text)',
                }}
                onClick={() => handleItemClick(item)}
              >
                {item.icon && <span>{item.icon}</span>}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {item.shortcut}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Popover;
