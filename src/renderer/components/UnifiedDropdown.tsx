// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UnifiedDropdown - Consistent dropdown component for all DEX UI
 * 
 * Features:
 * - Viewport edge detection (auto-flip direction)
 * - mousedown outside close (instant response)
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Spring animation (navigation preset)
 * - Focus trap for accessibility
 * - z-index from token system
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { SPRING_PRESETS, isReduceMotion } from '../utils/MotionController';
import { zIndex as zIndexTokens, radius, colors, transition } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DropdownPlacement = 
  | 'bottom-start' | 'bottom' | 'bottom-end'
  | 'top-start' | 'top' | 'top-end'
  | 'left-start' | 'left' | 'left-end'
  | 'right-start' | 'right' | 'right-end';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  children?: DropdownItem[];
}

export interface UnifiedDropdownProps {
  /** Trigger element ref or element */
  triggerRef: React.RefObject<HTMLElement>;
  /** Whether dropdown is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Placement preference (will auto-flip if needed) */
  placement?: DropdownPlacement;
  /** Dropdown content */
  children?: React.ReactNode;
  /** Menu items (alternative to children) */
  items?: DropdownItem[];
  /** Callback when item is selected */
  onSelect?: (item: DropdownItem) => void;
  /** Additional offset from trigger in pixels */
  offset?: number;
  /** Custom width (default: auto, min 180px) */
  width?: number | 'auto' | 'match-trigger';
  /** Max height before scroll */
  maxHeight?: number;
  /** Show backdrop (dims background) */
  backdrop?: boolean;
  /** Custom z-index */
  zIndex?: number;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** Close on item select (default: true) */
  closeOnSelect?: boolean;
  /** Aria label for menu */
  ariaLabel?: string;
}

export interface DropdownRef {
  focus: () => void;
  close: () => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: zIndexTokens.modal - 1,
    background: 'rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(2px)',
  },
  container: {
    position: 'fixed' as const,
    zIndex: zIndexTokens.popover,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 180,
    maxWidth: 320,
    background: 'rgba(28, 28, 32, 0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.lg,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
    outline: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: 4,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: colors.text.primary,
    background: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: `background ${transition.fast}, color ${transition.fast}`,
    outline: 'none',
    textAlign: 'left' as const,
    width: '100%',
    whiteSpace: 'nowrap' as const,
  },
  itemHover: {
    background: colors.bg.hover,
  },
  itemFocused: {
    background: colors.accent.soft,
    outline: `2px solid ${colors.accent.default}`,
    outlineOffset: -2,
  },
  itemDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  itemDanger: {
    color: colors.semantic.error,
  },
  itemIcon: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemShortcut: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: colors.border.subtle,
    margin: '4px 8px',
  },
};

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

function getInitialTransform(placement: DropdownPlacement): string {
  if (placement.startsWith('top')) return 'translateY(8px) scale(0.96)';
  if (placement.startsWith('bottom')) return 'translateY(-8px) scale(0.96)';
  if (placement.startsWith('left')) return 'translateX(8px) scale(0.96)';
  if (placement.startsWith('right')) return 'translateX(-8px) scale(0.96)';
  return 'scale(0.96)';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UnifiedDropdown = forwardRef<DropdownRef, UnifiedDropdownProps>(
  (
    {
      triggerRef,
      open,
      onClose,
      placement = 'bottom-start',
      children,
      items,
      onSelect,
      offset = 4,
      width = 'auto',
      maxHeight = 320,
      backdrop = false,
      zIndex,
      className,
      style,
      closeOnSelect = true,
      ariaLabel,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [actualPlacement, setActualPlacement] = useState(placement);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [animState, setAnimState] = useState<'entering' | 'visible' | 'exiting'>('entering');
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      focus: () => containerRef.current?.focus(),
      close: onClose,
    }));

    // Get flattened selectable items (skip dividers)
    const selectableItems = items?.filter(item => !item.divider && !item.disabled) || [];

    // Calculate position with viewport edge detection
    useLayoutEffect(() => {
      if (!open || !triggerRef.current) return;

      const trigger = triggerRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      // Estimate dropdown size (will be adjusted after render)
      const dropdownWidth = width === 'match-trigger' 
        ? trigger.width 
        : width === 'auto' 
          ? 200 
          : width;
      const dropdownHeight = Math.min(
        (items?.length || 5) * 36 + 8,
        maxHeight
      );

      let x = 0;
      let y = 0;
      let finalPlacement = placement;

      // Calculate initial position based on placement
      const calcPosition = (p: DropdownPlacement) => {
        switch (p) {
          case 'bottom-start':
            return { x: trigger.left, y: trigger.bottom + offset };
          case 'bottom':
            return { x: trigger.left + trigger.width / 2 - dropdownWidth / 2, y: trigger.bottom + offset };
          case 'bottom-end':
            return { x: trigger.right - dropdownWidth, y: trigger.bottom + offset };
          case 'top-start':
            return { x: trigger.left, y: trigger.top - dropdownHeight - offset };
          case 'top':
            return { x: trigger.left + trigger.width / 2 - dropdownWidth / 2, y: trigger.top - dropdownHeight - offset };
          case 'top-end':
            return { x: trigger.right - dropdownWidth, y: trigger.top - dropdownHeight - offset };
          case 'left-start':
            return { x: trigger.left - dropdownWidth - offset, y: trigger.top };
          case 'left':
            return { x: trigger.left - dropdownWidth - offset, y: trigger.top + trigger.height / 2 - dropdownHeight / 2 };
          case 'left-end':
            return { x: trigger.left - dropdownWidth - offset, y: trigger.bottom - dropdownHeight };
          case 'right-start':
            return { x: trigger.right + offset, y: trigger.top };
          case 'right':
            return { x: trigger.right + offset, y: trigger.top + trigger.height / 2 - dropdownHeight / 2 };
          case 'right-end':
            return { x: trigger.right + offset, y: trigger.bottom - dropdownHeight };
          default:
            return { x: trigger.left, y: trigger.bottom + offset };
        }
      };

      ({ x, y } = calcPosition(placement));

      // Check if needs flip
      const needsFlipY = 
        (placement.startsWith('bottom') && y + dropdownHeight > viewport.height - 8) ||
        (placement.startsWith('top') && y < 8);
      const needsFlipX =
        (placement.startsWith('right') && x + dropdownWidth > viewport.width - 8) ||
        (placement.startsWith('left') && x < 8);

      if (needsFlipY && placement.startsWith('bottom')) {
        finalPlacement = placement.replace('bottom', 'top') as DropdownPlacement;
        ({ x, y } = calcPosition(finalPlacement));
      } else if (needsFlipY && placement.startsWith('top')) {
        finalPlacement = placement.replace('top', 'bottom') as DropdownPlacement;
        ({ x, y } = calcPosition(finalPlacement));
      }

      if (needsFlipX && placement.startsWith('right')) {
        finalPlacement = finalPlacement.replace('right', 'left') as DropdownPlacement;
        ({ x, y } = calcPosition(finalPlacement));
      } else if (needsFlipX && placement.startsWith('left')) {
        finalPlacement = finalPlacement.replace('left', 'right') as DropdownPlacement;
        ({ x, y } = calcPosition(finalPlacement));
      }

      // Clamp to viewport
      x = Math.max(8, Math.min(x, viewport.width - dropdownWidth - 8));
      y = Math.max(8, Math.min(y, viewport.height - dropdownHeight - 8));

      setPosition({ x, y });
      setActualPlacement(finalPlacement);
    }, [open, triggerRef, placement, offset, width, maxHeight, items?.length]);

    // Animation state management
    useEffect(() => {
      if (open) {
        setAnimState('entering');
        const timeout = setTimeout(() => setAnimState('visible'), 20);
        return () => clearTimeout(timeout);
      } else {
        setAnimState('exiting');
      }
    }, [open]);

    // Close on outside mousedown (instant)
    useEffect(() => {
      if (!open) return;

      // Small delay to prevent the click that opened it from closing it
      const timeoutId = setTimeout(() => {
        const handleMouseDown = (e: MouseEvent) => {
          const target = e.target as Node;
          if (
            containerRef.current && 
            !containerRef.current.contains(target) &&
            triggerRef.current &&
            !triggerRef.current.contains(target)
          ) {
            onClose();
          }
        };

        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
      }, 50);

      return () => clearTimeout(timeoutId);
    }, [open, onClose, triggerRef]);

    // Keyboard navigation
    useEffect(() => {
      if (!open) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            onClose();
            triggerRef.current?.focus();
            break;
          case 'ArrowDown':
            e.preventDefault();
            setFocusedIndex(prev => {
              const next = prev < selectableItems.length - 1 ? prev + 1 : 0;
              itemRefs.current[next]?.focus();
              return next;
            });
            break;
          case 'ArrowUp':
            e.preventDefault();
            setFocusedIndex(prev => {
              const next = prev > 0 ? prev - 1 : selectableItems.length - 1;
              itemRefs.current[next]?.focus();
              return next;
            });
            break;
          case 'Home':
            e.preventDefault();
            setFocusedIndex(0);
            itemRefs.current[0]?.focus();
            break;
          case 'End':
            e.preventDefault();
            setFocusedIndex(selectableItems.length - 1);
            itemRefs.current[selectableItems.length - 1]?.focus();
            break;
          case 'Enter':
          case ' ':
            if (focusedIndex >= 0 && selectableItems[focusedIndex]) {
              e.preventDefault();
              handleItemSelect(selectableItems[focusedIndex]);
            }
            break;
          case 'Tab':
            // Close on tab out
            onClose();
            break;
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, focusedIndex, selectableItems, triggerRef]);

    // Focus first item on open
    useEffect(() => {
      if (open && containerRef.current) {
        // Focus container first, then first item if exists
        containerRef.current.focus();
        if (selectableItems.length > 0) {
          setFocusedIndex(0);
          setTimeout(() => itemRefs.current[0]?.focus(), 50);
        }
      } else {
        setFocusedIndex(-1);
      }
    }, [open, selectableItems.length]);

    const handleItemSelect = useCallback((item: DropdownItem) => {
      if (item.disabled) return;
      onSelect?.(item);
      if (closeOnSelect) {
        onClose();
      }
    }, [onSelect, closeOnSelect, onClose]);

    if (!open) return null;

    const reducedMotion = isReduceMotion();
    const animationStyle: React.CSSProperties = reducedMotion
      ? { opacity: animState === 'visible' ? 1 : 0 }
      : {
          opacity: animState === 'visible' ? 1 : 0,
          transform: animState === 'visible' ? 'translateY(0) scale(1)' : getInitialTransform(actualPlacement),
          transition: `opacity 150ms ease-out, transform 150ms ease-out`,
        };

    const containerStyle: React.CSSProperties = {
      ...styles.container,
      ...animationStyle,
      left: position.x,
      top: position.y,
      width: width === 'match-trigger' 
        ? triggerRef.current?.offsetWidth 
        : width === 'auto' 
          ? 'auto' 
          : width,
      zIndex: zIndex || zIndexTokens.popover,
      ...style,
    };

    const contentStyle: React.CSSProperties = {
      ...styles.content,
      maxHeight,
    };

    const renderItems = () => {
      if (!items) return children;

      let selectableIndex = 0;
      return items.map((item, index) => {
        if (item.divider) {
          return <div key={`divider-${index}`} style={styles.divider} role="separator" />;
        }

        const currentSelectableIndex = selectableIndex;
        if (!item.disabled) selectableIndex++;

        const isFocused = focusedIndex === currentSelectableIndex;
        const itemStyle: React.CSSProperties = {
          ...styles.item,
          ...(isFocused ? styles.itemFocused : {}),
          ...(item.disabled ? styles.itemDisabled : {}),
          ...(item.danger ? styles.itemDanger : {}),
        };

        return (
          <button
            key={item.id}
            ref={el => { itemRefs.current[currentSelectableIndex] = el; }}
            role="menuitem"
            tabIndex={isFocused ? 0 : -1}
            disabled={item.disabled}
            aria-disabled={item.disabled}
            style={itemStyle}
            onClick={() => handleItemSelect(item)}
            onMouseEnter={() => !item.disabled && setFocusedIndex(currentSelectableIndex)}
          >
            {item.icon && <span style={styles.itemIcon}>{item.icon}</span>}
            <span style={styles.itemLabel}>{item.label}</span>
            {item.shortcut && <span style={styles.itemShortcut}>{item.shortcut}</span>}
          </button>
        );
      });
    };

    const content = (
      <>
        {backdrop && <div style={styles.backdrop} onClick={onClose} />}
        <div
          ref={containerRef}
          role="menu"
          tabIndex={-1}
          aria-label={ariaLabel || 'Dropdown menu'}
          className={className}
          style={containerStyle}
        >
          <div style={contentStyle}>
            {renderItems()}
          </div>
        </div>
      </>
    );

    // Render in portal for proper stacking
    return createPortal(content, document.body);
  }
);

UnifiedDropdown.displayName = 'UnifiedDropdown';

// ---------------------------------------------------------------------------
// Convenience wrapper with trigger button
// ---------------------------------------------------------------------------

export interface DropdownButtonProps extends Omit<UnifiedDropdownProps, 'triggerRef' | 'open' | 'onClose'> {
  /** Button content */
  trigger: React.ReactNode;
  /** Button style */
  buttonStyle?: React.CSSProperties;
  /** Button class name */
  buttonClassName?: string;
  /** Disabled state */
  disabled?: boolean;
}

export const DropdownButton: React.FC<DropdownButtonProps> = ({
  trigger,
  buttonStyle,
  buttonClassName,
  disabled,
  ...dropdownProps
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleOpen = useCallback(() => {
    if (!disabled) setOpen(prev => !prev);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const defaultButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: colors.text.primary,
    background: colors.bg.hover,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.sm,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: `background ${transition.fast}`,
    outline: 'none',
    ...buttonStyle,
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={buttonClassName}
        style={defaultButtonStyle}
      >
        {trigger}
      </button>
      <UnifiedDropdown
        {...dropdownProps}
        triggerRef={buttonRef}
        open={open}
        onClose={handleClose}
      />
    </>
  );
};

export default UnifiedDropdown;
