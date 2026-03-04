/**
 * DEX Context Menu
 * Custom right-click context menus
 */

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface MenuDivider {
  type: 'divider';
}

interface MenuItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  submenu?: ContextMenuItem[];
}

type ContextMenuItem = MenuItem | MenuDivider;

interface MenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  isOpen: boolean;
  position: MenuPosition;
  items: ContextMenuItem[];
}

interface ContextMenuContextType {
  showMenu: (event: React.MouseEvent | MouseEvent, items: ContextMenuItem[]) => void;
  hideMenu: () => void;
}

// ==================== ICONS ====================

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ==================== CONTEXT ====================

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenu = () => {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
};

// ==================== SUBMENU COMPONENT ====================

interface SubmenuProps {
  items: ContextMenuItem[];
  parentRef: React.RefObject<HTMLDivElement>;
  onItemClick: (item: MenuItem) => void;
  depth?: number;
}

const Submenu: React.FC<SubmenuProps> = ({ items, parentRef, onItemClick, depth = 1 }) => {
  const [position, setPosition] = useState<'right' | 'left'>('right');
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submenuRef.current && parentRef.current) {
      const submenuRect = submenuRef.current.getBoundingClientRect();
      const parentRect = parentRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Check if submenu would overflow right side
      if (parentRect.right + submenuRect.width > viewportWidth) {
        setPosition('left');
      }
    }
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    submenu: {
      position: 'absolute',
      top: -4,
      [position]: position === 'right' ? '100%' : 'auto',
      [position === 'left' ? 'right' : 'left']: position === 'left' ? '100%' : 'auto',
      marginLeft: position === 'right' ? 4 : 0,
      marginRight: position === 'left' ? 4 : 0,
      minWidth: 180,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      padding: 4,
      zIndex: 100000 + depth,
    },
  };

  return (
    <div ref={submenuRef} style={styles.submenu}>
      {items.map((item, index) => (
        <MenuItemComponent
          key={item.type === 'divider' ? `divider-${index}` : (item as MenuItem).id}
          item={item}
          onItemClick={onItemClick}
          depth={depth}
        />
      ))}
    </div>
  );
};

// ==================== MENU ITEM COMPONENT ====================

interface MenuItemComponentProps {
  item: ContextMenuItem;
  onItemClick: (item: MenuItem) => void;
  depth?: number;
}

const MenuItemComponent: React.FC<MenuItemComponentProps> = ({ item, onItemClick, depth = 0 }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (item.type === 'divider') {
    return (
      <div
        style={{
          height: 1,
          background: 'var(--color-border)',
          margin: '4px 8px',
        }}
      />
    );
  }

  const menuItem = item as MenuItem;
  const hasSubmenu = menuItem.submenu && menuItem.submenu.length > 0;

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (hasSubmenu) {
      if (submenuTimeoutRef.current) clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = setTimeout(() => setShowSubmenu(true), 150);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (hasSubmenu) {
      if (submenuTimeoutRef.current) clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = setTimeout(() => setShowSubmenu(false), 150);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuItem.disabled || hasSubmenu) return;
    onItemClick(menuItem);
  };

  const styles: Record<string, React.CSSProperties> = {
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      cursor: menuItem.disabled ? 'not-allowed' : 'pointer',
      background: isHovered && !menuItem.disabled ? 'var(--color-bg-tertiary)' : 'transparent',
      opacity: menuItem.disabled ? 0.5 : 1,
      position: 'relative',
      transition: 'background 0.1s',
    },
    icon: {
      width: 16,
      height: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: menuItem.danger ? '#ff3b30' : 'var(--color-text-secondary)',
      flexShrink: 0,
    },
    label: {
      flex: 1,
      fontSize: 13,
      color: menuItem.danger ? '#ff3b30' : 'var(--color-text-primary)',
      whiteSpace: 'nowrap',
    },
    shortcut: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      marginLeft: 20,
    },
    arrow: {
      width: 14,
      height: 14,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div
      ref={itemRef}
      style={styles.item}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {menuItem.icon && <span style={styles.icon}>{menuItem.icon}</span>}
      <span style={styles.label}>{menuItem.label}</span>
      {menuItem.shortcut && <span style={styles.shortcut}>{menuItem.shortcut}</span>}
      {hasSubmenu && (
        <span style={styles.arrow}>
          <ChevronRight />
        </span>
      )}
      {showSubmenu && hasSubmenu && (
        <Submenu
          items={menuItem.submenu!}
          parentRef={itemRef}
          onItemClick={onItemClick}
          depth={depth + 1}
        />
      )}
    </div>
  );
};

// ==================== CONTEXT MENU COMPONENT ====================

interface ContextMenuComponentProps {
  state: ContextMenuState;
  onClose: () => void;
}

const ContextMenuComponent: React.FC<ContextMenuComponentProps> = ({ state, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<MenuPosition>(state.position);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current && state.isOpen) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let x = state.position.x;
      let y = state.position.y;

      // Check right overflow
      if (x + rect.width > viewportWidth - 10) {
        x = viewportWidth - rect.width - 10;
      }

      // Check bottom overflow
      if (y + rect.height > viewportHeight - 10) {
        y = viewportHeight - rect.height - 10;
      }

      // Ensure not negative
      x = Math.max(10, x);
      y = Math.max(10, y);

      setAdjustedPosition({ x, y });
    }
  }, [state.isOpen, state.position]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (state.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [state.isOpen, onClose]);

  if (!state.isOpen) return null;

  const handleItemClick = (item: MenuItem) => {
    if (item.onClick) {
      item.onClick();
    }
    onClose();
  };

  const styles: Record<string, React.CSSProperties> = {
    menu: {
      position: 'fixed',
      top: adjustedPosition.y,
      left: adjustedPosition.x,
      minWidth: 200,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
      padding: 4,
      zIndex: 99999,
      animation: 'menuFadeIn 0.15s ease-out',
    },
  };

  return (
    <>
      <style>{`
        @keyframes menuFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <div ref={menuRef} style={styles.menu}>
        {state.items.map((item, index) => (
          <MenuItemComponent
            key={item.type === 'divider' ? `divider-${index}` : (item as MenuItem).id}
            item={item}
            onItemClick={handleItemClick}
          />
        ))}
      </div>
    </>
  );
};

// ==================== CONTEXT MENU PROVIDER ====================

interface ContextMenuProviderProps {
  children: React.ReactNode;
}

export const ContextMenuProvider: React.FC<ContextMenuProviderProps> = ({ children }) => {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
  });

  const showMenu = useCallback((event: React.MouseEvent | MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    
    setMenuState({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, []);

  const hideMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      {children}
      <ContextMenuComponent state={menuState} onClose={hideMenu} />
    </ContextMenuContext.Provider>
  );
};

// ==================== CONTEXT MENU TRIGGER ====================

interface ContextMenuTriggerProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
  disabled?: boolean;
}

export const ContextMenuTrigger: React.FC<ContextMenuTriggerProps> = ({
  children,
  items,
  disabled = false,
}) => {
  const { showMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    if (disabled) return;
    showMenu(e, items);
  };

  return (
    <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
      {children}
    </div>
  );
};

// ==================== PRESET MENU ITEMS ====================

export const createMenuItem = (
  id: string,
  label: string,
  onClick?: () => void,
  options?: Partial<MenuItem>
): MenuItem => ({
  type: 'item',
  id,
  label,
  onClick,
  ...options,
});

export const createDivider = (): MenuDivider => ({
  type: 'divider',
});

// Common menu item icons
export const MenuIcons = {
  copy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  cut: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  paste: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  delete: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  rename: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  share: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  open: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  folder: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  info: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
};

// ==================== PRESET MENUS ====================

export const FileContextMenu = (
  onOpen: () => void,
  onCopy: () => void,
  onCut: () => void,
  onRename: () => void,
  onDelete: () => void,
  onInfo: () => void,
): ContextMenuItem[] => [
  createMenuItem('open', 'Open', onOpen, { icon: MenuIcons.open }),
  createDivider(),
  createMenuItem('copy', 'Copy', onCopy, { icon: MenuIcons.copy, shortcut: 'Ctrl+C' }),
  createMenuItem('cut', 'Cut', onCut, { icon: MenuIcons.cut, shortcut: 'Ctrl+X' }),
  createDivider(),
  createMenuItem('rename', 'Rename', onRename, { icon: MenuIcons.rename, shortcut: 'F2' }),
  createMenuItem('delete', 'Delete', onDelete, { icon: MenuIcons.delete, danger: true, shortcut: 'Del' }),
  createDivider(),
  createMenuItem('info', 'Properties', onInfo, { icon: MenuIcons.info }),
];

export const TextContextMenu = (
  onCut: () => void,
  onCopy: () => void,
  onPaste: () => void,
  onSelectAll: () => void,
): ContextMenuItem[] => [
  createMenuItem('cut', 'Cut', onCut, { icon: MenuIcons.cut, shortcut: 'Ctrl+X' }),
  createMenuItem('copy', 'Copy', onCopy, { icon: MenuIcons.copy, shortcut: 'Ctrl+C' }),
  createMenuItem('paste', 'Paste', onPaste, { icon: MenuIcons.paste, shortcut: 'Ctrl+V' }),
  createDivider(),
  createMenuItem('selectAll', 'Select All', onSelectAll, { shortcut: 'Ctrl+A' }),
];

export default ContextMenuProvider;
