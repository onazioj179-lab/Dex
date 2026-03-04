/**
 * DEX Menu Component
 * Dropdown menus, context menus, and action menus
 */

import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
  type?: 'item' | 'separator' | 'header';
  checked?: boolean;
  description?: string;
}

interface MenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right' | 'left';
  width?: number | 'auto' | 'trigger';
  closeOnSelect?: boolean;
  disabled?: boolean;
}

interface DropdownMenuProps extends MenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ActionMenuProps {
  items: MenuItem[];
  onSelect?: (item: MenuItem) => void;
}

// ==================== CONTEXT ====================

interface MenuContextType {
  closeMenu: () => void;
  activeSubmenu: string | null;
  setActiveSubmenu: (id: string | null) => void;
}

const MenuContext = createContext<MenuContextType | null>(null);

// ==================== DROPDOWN MENU ====================

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  placement = 'bottom-start',
  width = 200,
  closeOnSelect = true,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = controlledOpen ?? internalOpen;

  const setOpen = useCallback((value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
    if (!value) setActiveSubmenu(null);
  }, [onOpenChange]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, setOpen]);

  const getMenuStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      minWidth: width === 'auto' ? 'auto' : width === 'trigger' ? '100%' : width,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      padding: 4,
      zIndex: 1000,
    };

    switch (placement) {
      case 'bottom-start':
        return { ...base, top: '100%', left: 0, marginTop: 4 };
      case 'bottom-end':
        return { ...base, top: '100%', right: 0, marginTop: 4 };
      case 'top-start':
        return { ...base, bottom: '100%', left: 0, marginBottom: 4 };
      case 'top-end':
        return { ...base, bottom: '100%', right: 0, marginBottom: 4 };
      case 'right':
        return { ...base, left: '100%', top: 0, marginLeft: 4 };
      case 'left':
        return { ...base, right: '100%', top: 0, marginRight: 4 };
      default:
        return base;
    }
  };

  return (
    <MenuContext.Provider value={{ closeMenu, activeSubmenu, setActiveSubmenu }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div
          ref={triggerRef}
          onClick={() => !disabled && setOpen(!open)}
          style={{
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {trigger}
        </div>

        {open && (
          <div ref={menuRef} style={getMenuStyle()}>
            {items.map((item, index) => (
              <MenuItemComponent
                key={item.id || index}
                item={item}
                closeOnSelect={closeOnSelect}
              />
            ))}
          </div>
        )}
      </div>
    </MenuContext.Provider>
  );
};

// ==================== MENU ITEM ====================

interface MenuItemComponentProps {
  item: MenuItem;
  closeOnSelect: boolean;
}

const MenuItemComponent: React.FC<MenuItemComponentProps> = ({
  item,
  closeOnSelect,
}) => {
  const context = useContext(MenuContext);
  const [hovered, setHovered] = useState(false);
  const hasSubmenu = item.children && item.children.length > 0;
  const isSubmenuOpen = context?.activeSubmenu === item.id;

  if (item.type === 'separator') {
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

  if (item.type === 'header') {
    return (
      <div
        style={{
          padding: '8px 12px 4px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {item.label}
      </div>
    );
  }

  const handleClick = () => {
    if (item.disabled) return;
    if (hasSubmenu) return;

    item.onClick?.();
    if (closeOnSelect) {
      context?.closeMenu();
    }
  };

  const handleMouseEnter = () => {
    setHovered(true);
    if (hasSubmenu) {
      context?.setActiveSubmenu(item.id);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 4,
      cursor: item.disabled ? 'not-allowed' : 'pointer',
      background: hovered && !item.disabled ? 'var(--color-bg-hover)' : 'transparent',
      color: item.disabled
        ? 'var(--color-text-muted)'
        : item.danger
        ? '#ef4444'
        : 'var(--color-text)',
      opacity: item.disabled ? 0.5 : 1,
      position: 'relative',
      transition: 'background 0.1s',
    },
    icon: {
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      flexShrink: 0,
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    label: {
      fontSize: 13,
      fontWeight: 400,
    },
    description: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    shortcut: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      marginLeft: 'auto',
    },
    check: {
      width: 16,
      height: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
    },
    chevron: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
    },
    submenu: {
      position: 'absolute',
      left: '100%',
      top: -4,
      marginLeft: 4,
      minWidth: 180,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      padding: 4,
      zIndex: 1001,
    },
  };

  return (
    <div
      style={styles.item}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {item.checked !== undefined && (
        <span style={styles.check}>{item.checked ? 'check' : ''}</span>
      )}
      
      {item.icon && <span style={styles.icon}>{item.icon}</span>}
      
      <div style={styles.content}>
        <span style={styles.label}>{item.label}</span>
        {item.description && (
          <span style={styles.description}>{item.description}</span>
        )}
      </div>
      
      {item.shortcut && !hasSubmenu && (
        <span style={styles.shortcut}>{item.shortcut}</span>
      )}
      
      {hasSubmenu && <span style={styles.chevron}>▶</span>}

      {hasSubmenu && isSubmenuOpen && (
        <div style={styles.submenu}>
          {item.children!.map((child, index) => (
            <MenuItemComponent
              key={child.id || index}
              item={child}
              closeOnSelect={closeOnSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== ACTION MENU ====================

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, onSelect }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: 4,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 6,
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    icon: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 16,
    },
    content: {
      flex: 1,
    },
    label: {
      fontSize: 14,
      fontWeight: 500,
      margin: 0,
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      margin: '2px 0 0 0',
    },
  };

  return (
    <div style={styles.container}>
      {items.map(item => {
        if (item.type === 'separator') {
          return (
            <div
              key={item.id}
              style={{
                height: 1,
                background: 'var(--color-border)',
                margin: '4px 0',
              }}
            />
          );
        }

        const isHovered = hoveredId === item.id;

        return (
          <div
            key={item.id}
            style={{
              ...styles.item,
              background: isHovered ? 'var(--color-bg-hover)' : 'transparent',
              color: item.danger ? '#ef4444' : 'var(--color-text)',
              opacity: item.disabled ? 0.5 : 1,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onSelect?.(item);
              }
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {item.icon && <span style={styles.icon}>{item.icon}</span>}
            <div style={styles.content}>
              <p style={styles.label}>{item.label}</p>
              {item.description && (
                <p style={styles.description}>{item.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ==================== MENU BAR ====================

interface MenuBarItem {
  id: string;
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  items: MenuBarItem[];
}

export const MenuBar: React.FC<MenuBarProps> = ({ items }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      height: 32,
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 8px',
      gap: 2,
    },
    item: {
      position: 'relative',
    },
    button: {
      padding: '4px 10px',
      fontSize: 13,
      color: 'var(--color-text)',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
    menu: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 2,
      minWidth: 180,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      padding: 4,
      zIndex: 1000,
    },
  };

  return (
    <div style={styles.container}>
      {items.map(item => (
        <div
          key={item.id}
          style={styles.item}
          onMouseEnter={() => activeMenu && setActiveMenu(item.id)}
        >
          <button
            style={{
              ...styles.button,
              background: activeMenu === item.id ? 'var(--color-bg-hover)' : 'transparent',
            }}
            onClick={() => setActiveMenu(activeMenu === item.id ? null : item.id)}
          >
            {item.label}
          </button>

          {activeMenu === item.id && (
            <MenuContext.Provider
              value={{
                closeMenu: () => setActiveMenu(null),
                activeSubmenu,
                setActiveSubmenu: (id: string | null) => setActiveSubmenu(id),
              }}
            >
              <div style={styles.menu}>
                {item.items.map((menuItem, index) => (
                  <MenuItemComponent
                    key={menuItem.id || index}
                    item={menuItem}
                    closeOnSelect={true}
                  />
                ))}
              </div>
            </MenuContext.Provider>
          )}
        </div>
      ))}
    </div>
  );
};

// ==================== SELECT MENU ====================

interface SelectMenuItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  description?: string;
}

interface SelectMenuProps {
  value?: string;
  options: SelectMenuItem[];
  placeholder?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  width?: number | string;
  searchable?: boolean;
}

export const SelectMenu: React.FC<SelectMenuProps> = ({
  value,
  options,
  placeholder = 'Select...',
  onChange,
  disabled = false,
  width = 200,
  searchable = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, searchable]);

  const handleSelect = (option: SelectMenuItem) => {
    if (option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    setSearch('');
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width,
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'border-color 0.15s',
    },
    triggerOpen: {
      borderColor: 'var(--color-accent)',
    },
    icon: {
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      fontSize: 13,
      color: selectedOption ? 'var(--color-text)' : 'var(--color-text-muted)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    chevron: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
      transition: 'transform 0.15s',
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      overflow: 'hidden',
      zIndex: 100,
    },
    search: {
      padding: 8,
      borderBottom: '1px solid var(--color-border)',
    },
    searchInput: {
      width: '100%',
      padding: '6px 10px',
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      fontSize: 13,
      color: 'var(--color-text)',
      outline: 'none',
    },
    options: {
      maxHeight: 240,
      overflowY: 'auto',
      padding: 4,
    },
    option: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    optionContent: {
      flex: 1,
    },
    optionLabel: {
      fontSize: 13,
      margin: 0,
    },
    optionDescription: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      margin: '2px 0 0 0',
    },
    check: {
      fontSize: 12,
      color: 'var(--color-accent)',
    },
    empty: {
      padding: 16,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      fontSize: 13,
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        style={{
          ...styles.trigger,
          ...(open ? styles.triggerOpen : {}),
        }}
        onClick={() => !disabled && setOpen(!open)}
      >
        {selectedOption?.icon && (
          <span style={styles.icon}>{selectedOption.icon}</span>
        )}
        <span style={styles.label}>
          {selectedOption?.label || placeholder}
        </span>
        <span
          style={{
            ...styles.chevron,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </div>

      {open && (
        <div style={styles.dropdown}>
          {searchable && (
            <div style={styles.search}>
              <input
                ref={searchRef}
                style={styles.searchInput}
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          <div style={styles.options}>
            {filteredOptions.length === 0 ? (
              <div style={styles.empty}>No options found</div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.value}
                  style={{
                    ...styles.option,
                    background: hoveredIndex === index
                      ? 'var(--color-bg-hover)'
                      : 'transparent',
                    opacity: option.disabled ? 0.5 : 1,
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                >
                  {option.icon && (
                    <span style={styles.icon}>{option.icon}</span>
                  )}
                  <div style={styles.optionContent}>
                    <p style={styles.optionLabel}>{option.label}</p>
                    {option.description && (
                      <p style={styles.optionDescription}>{option.description}</p>
                    )}
                  </div>
                  {option.value === value && (
                    <span style={styles.check}>check</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;
