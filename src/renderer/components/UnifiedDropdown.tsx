// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
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
import { AIM_GRACE_MS, isAimingAtRect, type Pt } from '../utils/safeTriangle';
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
  /** Non-interactive caps micro-label heading a section. */
  header?: boolean;
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
  /** Internal: closes the entire menu tree (threaded down to nested submenus). */
  closeRoot?: () => void;
}

export interface DropdownRef {
  focus: () => void;
  close: () => void;
  /** The open menu surface's rect (null while closed). */
  getRect: () => DOMRect | null;
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
  },
  container: {
    position: 'fixed' as const,
    zIndex: zIndexTokens.popover,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 180,
    maxWidth: 'min(320px, calc(100vw - 48px))',
    borderRadius: 14,
    boxShadow: 'var(--pg-shadow-popover)',
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
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 13,
    fontWeight: 500,
    color: colors.text.primary,
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: `background ${transition.fast}, color ${transition.fast}`,
    outline: 'none',
    textAlign: 'left' as const,
    width: '100%',
    whiteSpace: 'nowrap' as const,
  },
  itemFocused: {
    background: colors.accent.light,
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
  submenuChevron: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    color: colors.text.tertiary,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: colors.border.subtle,
    margin: '4px var(--space-2)',
  },
  sectionHeader: {
    padding: '6px var(--space-3) 2px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.01em',
    textTransform: 'none' as const,
    color: colors.text.tertiary,
    userSelect: 'none' as const,
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
// Submenu row — renders a nested UnifiedDropdown for items with children.
// Opens on hover (with a close grace period so the pointer can travel into the
// flyout) and on click/Enter; leaf selection inside closes the whole tree via
// closeRoot.
// ---------------------------------------------------------------------------

interface SubmenuController {
  setOpen: (open: boolean) => void;
  /** The flyout's on-screen rect, or null while it is closed. */
  getRect: () => DOMRect | null;
}

interface DropdownSubmenuItemProps {
  item: DropdownItem;
  itemStyle: React.CSSProperties;
  isFocused: boolean;
  registerRef: (el: HTMLButtonElement | null) => void;
  registerController: (ctl: SubmenuController | null) => void;
  /** Hover intent on this row; the parent decides (safe triangle) whether it wins. */
  onHover: () => void;
  /** Pointer moved over this row (keeps the safe-triangle apex current). */
  onRowPointer: (pt: Pt) => void;
  onToggle: () => void;
  onSelect?: (item: DropdownItem) => void;
  closeOnSelect: boolean;
  closeRoot: () => void;
}

const DropdownSubmenuItem: React.FC<DropdownSubmenuItemProps> = ({
  item,
  itemStyle,
  isFocused,
  registerRef,
  registerController,
  onHover,
  onRowPointer,
  onToggle,
  onSelect,
  closeOnSelect,
  closeRoot,
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const flyoutRef = useRef<DropdownRef | null>(null);

  // The parent menu owns open/close (one submenu at a time, safe-triangle
  // aware). The row used to close itself 180 ms after the pointer left it,
  // which also closed the flyout the pointer was moving into.
  useEffect(() => {
    registerController({ setOpen, getRect: () => flyoutRef.current?.getRect() ?? null });
    return () => registerController(null);
  }, [registerController]);

  return (
    <>
      <button
        ref={(el) => { btnRef.current = el; registerRef(el); }}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={isFocused ? 0 : -1}
        style={itemStyle}
        onClick={onToggle}
        onMouseEnter={onHover}
        onMouseMove={(e) => onRowPointer({ x: e.clientX, y: e.clientY })}
        onMouseLeave={(e) => onRowPointer({ x: e.clientX, y: e.clientY })}
      >
        {item.icon && <span style={styles.itemIcon}>{item.icon}</span>}
        <span style={styles.itemLabel}>{item.label}</span>
        <span style={styles.submenuChevron} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M4 2.5L6.5 5L4 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <UnifiedDropdown
        ref={flyoutRef}
        triggerRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        items={item.children}
        onSelect={onSelect}
        closeOnSelect={closeOnSelect}
        closeRoot={closeRoot}
        placement="right-start"
      />
    </>
  );
};

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
      closeRoot,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [actualPlacement, setActualPlacement] = useState(placement);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [animState, setAnimState] = useState<'entering' | 'visible' | 'exiting'>('entering');
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const submenus = useRef<Map<string, SubmenuController>>(new Map());
    // Safe-triangle state: which submenu is open, where the pointer left its
    // row (apex), the latest pointer, and a hover deferred while aiming.
    const openSubId = useRef<string | null>(null);
    const aimApex = useRef<Pt | null>(null);
    const pointer = useRef<Pt | null>(null);
    const pendingHover = useRef<{ index: number; subId: string | null } | null>(null);
    const aimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      focus: () => containerRef.current?.focus(),
      close: onClose,
      getRect: () => containerRef.current?.getBoundingClientRect() ?? null,
    }));

    const clearAimTimer = () => {
      if (aimTimer.current) {
        clearTimeout(aimTimer.current);
        aimTimer.current = null;
      }
    };
    useEffect(() => clearAimTimer, []);

    /** Open exactly one submenu (or none). */
    const showSubmenu = useCallback((subId: string | null) => {
      if (openSubId.current && openSubId.current !== subId) {
        submenus.current.get(openSubId.current)?.setOpen(false);
      }
      openSubId.current = subId;
      if (subId) {
        aimApex.current = pointer.current;
        submenus.current.get(subId)?.setOpen(true);
      }
    }, []);

    const applyHover = useCallback((index: number, subId: string | null) => {
      clearAimTimer();
      pendingHover.current = null;
      setFocusedIndex(index);
      showSubmenu(subId);
    }, [showSubmenu]);

    /**
     * Hover on a row. If another submenu is open and the pointer is still
     * travelling toward its flyout (inside the safe triangle), the hover waits;
     * it wins once the pointer leaves the triangle or rests for AIM_GRACE_MS.
     */
    const requestHover = useCallback((index: number, subId: string | null) => {
      const open = openSubId.current;
      if (open && open !== subId && aimApex.current && pointer.current) {
        const rect = submenus.current.get(open)?.getRect();
        if (rect && isAimingAtRect(aimApex.current, pointer.current, rect)) {
          pendingHover.current = { index, subId };
          clearAimTimer();
          aimTimer.current = setTimeout(() => {
            const p = pendingHover.current;
            if (p) applyHover(p.index, p.subId);
          }, AIM_GRACE_MS);
          return;
        }
      }
      applyHover(index, subId);
    }, [applyHover]);

    const onMenuPointerMove = (e: React.MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const p = pendingHover.current;
      if (p) requestHover(p.index, p.subId);
    };

    // A closed menu forgets its submenu state.
    useEffect(() => {
      if (!open) {
        clearAimTimer();
        openSubId.current = null;
        pendingHover.current = null;
        aimApex.current = null;
      }
    }, [open]);

    // Get flattened selectable items (skip dividers)
    const selectableItems = items?.filter(item => !item.divider && !item.disabled && !item.header) || [];

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
      let removeMouseDown: (() => void) | null = null;

      // Small delay to prevent the click that opened it from closing it
      const timeoutId = setTimeout(() => {
        const handleMouseDown = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (
            containerRef.current &&
            !containerRef.current.contains(target) &&
            triggerRef.current &&
            !triggerRef.current.contains(target) &&
            // A nested submenu is portaled outside this container; treat clicks
            // inside ANY dropdown surface as "inside" so a parent menu does not
            // close out from under its own open submenu.
            !target.closest?.('[data-dex-dropdown]')
          ) {
            onClose();
          }
        };

        document.addEventListener('mousedown', handleMouseDown);
        removeMouseDown = () => document.removeEventListener('mousedown', handleMouseDown);
      }, 50);

      return () => {
        clearTimeout(timeoutId);
        removeMouseDown?.();
      };
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
          case 'ArrowRight': {
            const it = selectableItems[focusedIndex];
            if (it?.children?.length) {
              e.preventDefault();
              showSubmenu(it.id);
            }
            break;
          }
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
    }, [open, onClose, focusedIndex, selectableItems, triggerRef, showSubmenu]);

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

    const rootClose = useCallback(() => {
      (closeRoot ?? onClose)();
    }, [closeRoot, onClose]);

    const handleItemSelect = useCallback((item: DropdownItem) => {
      if (item.disabled) return;
      if (item.children && item.children.length > 0) {
        showSubmenu(item.id);
        return;
      }
      onSelect?.(item);
      if (closeOnSelect) {
        rootClose();
      }
    }, [onSelect, closeOnSelect, rootClose, showSubmenu]);

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

        if (item.header) {
          return (
            <div key={item.id} style={styles.sectionHeader} role="presentation">
              {item.label}
            </div>
          );
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

        if (!item.disabled && item.children && item.children.length > 0) {
          return (
            <DropdownSubmenuItem
              key={item.id}
              item={item}
              itemStyle={itemStyle}
              isFocused={isFocused}
              registerRef={(el) => { itemRefs.current[currentSelectableIndex] = el; }}
              registerController={(ctl) => {
                if (ctl) submenus.current.set(item.id, ctl);
                else submenus.current.delete(item.id);
              }}
              onHover={() => requestHover(currentSelectableIndex, item.id)}
              onRowPointer={(pt) => {
                pointer.current = pt;
                if (openSubId.current === item.id) aimApex.current = pt;
              }}
              onToggle={() => {
                // Ask the flyout itself: it may have closed on its own (Escape).
                const isOpen = openSubId.current === item.id && submenus.current.get(item.id)?.getRect() != null;
                showSubmenu(isOpen ? null : item.id);
              }}
              onSelect={onSelect}
              closeOnSelect={closeOnSelect}
              closeRoot={rootClose}
            />
          );
        }

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
            onMouseEnter={() => !item.disabled && requestHover(currentSelectableIndex, null)}
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
          data-dex-dropdown=""
          aria-label={ariaLabel || 'Dropdown menu'}
          className={`dex-liquid-glass${className ? ` ${className}` : ''}`}
          style={containerStyle}
          onMouseMove={onMenuPointerMove}
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
    padding: '6px var(--space-3)',
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
