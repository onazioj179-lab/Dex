/**
 * DEX Navbar Component
 * Navigation bar with actions
 */

import React, { useState, useRef, useEffect } from 'react';

// ==================== TYPES ====================

interface NavbarProps {
  logo?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  transparent?: boolean;
  height?: number;
}

interface NavItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon?: React.ReactNode;
  badge?: number | string;
}

interface NavGroupProps {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

interface NavSearchProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
}

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// ==================== NAVBAR ====================

export const Navbar: React.FC<NavbarProps> = ({
  logo,
  title,
  children,
  actions,
  sticky = true,
  transparent = false,
  height = 64,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!transparent) return;

    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [transparent]);

  const styles: Record<string, React.CSSProperties> = {
    navbar: {
      position: sticky ? 'sticky' : 'relative',
      top: 0,
      left: 0,
      right: 0,
      height,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      background: transparent && !scrolled
        ? 'transparent'
        : 'var(--color-bg-secondary)',
      borderBottom: transparent && !scrolled
        ? 'none'
        : '1px solid var(--color-border)',
      zIndex: 100,
      transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
      boxShadow: scrolled ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none',
    },
    left: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      fontSize: 24,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    center: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    mobileMenuButton: {
      display: 'none',
      padding: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text)',
      fontSize: 20,
    },
  };

  return (
    <>
      <nav style={styles.navbar}>
        <div style={styles.left}>
          {logo && <div style={styles.logo}>{logo}</div>}
          {title && <span style={styles.title}>{title}</span>}
        </div>

        <div style={styles.center}>{children}</div>

        <div style={styles.right}>
          {actions}
          <button
            style={styles.mobileMenuButton}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? 'x' : 'menu'}
          </button>
        </div>
      </nav>

      <MobileNav isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        {children}
      </MobileNav>
    </>
  );
};

// ==================== NAV ITEM ====================

export const NavItem: React.FC<NavItemProps> = ({
  label,
  href,
  onClick,
  active = false,
  icon,
  badge,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    item: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: active ? 'rgba(var(--color-accent-rgb), 0.1)' : 'transparent',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: active ? 500 : 400,
      color: active ? 'var(--color-accent)' : 'var(--color-text)',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'all 0.15s',
    },
    icon: {
      fontSize: 16,
    },
    badge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 18,
      height: 18,
      padding: '0 6px',
      background: 'var(--color-accent)',
      borderRadius: 9,
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  const Component = href ? 'a' : 'button';

  return (
    <Component
      style={styles.item}
      href={href}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      }}
    >
      {icon && <span style={styles.icon}>{icon}</span>}
      {label}
      {badge !== undefined && <span style={styles.badge}>{badge}</span>}
    </Component>
  );
};

// ==================== NAV GROUP ====================

export const NavGroup: React.FC<NavGroupProps> = ({
  label,
  children,
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: 'none',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    arrow: {
      fontSize: 10,
      transition: 'transform 0.2s',
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
    },
    menu: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      padding: 8,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      minWidth: 180,
      zIndex: 1000,
    },
  };

  return (
    <div ref={menuRef} style={styles.container}>
      <button
        style={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {icon && <span>{icon}</span>}
        {label}
        <span style={styles.arrow}>▼</span>
      </button>

      {isOpen && <div style={styles.menu}>{children}</div>}
    </div>
  );
};

// ==================== NAV SEARCH ====================

export const NavSearch: React.FC<NavSearchProps> = ({
  placeholder = 'Search...',
  value: controlledValue,
  onChange,
  onSearch,
}) => {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const currentValue = controlledValue !== undefined ? controlledValue : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch?.(currentValue);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: isFocused ? 280 : 200,
      transition: 'width 0.2s',
    },
    input: {
      width: '100%',
      padding: '8px 12px 8px 36px',
      background: 'var(--color-bg-tertiary)',
      border: `1px solid ${isFocused ? 'var(--color-accent)' : 'transparent'}`,
      borderRadius: 8,
      fontSize: 13,
      color: 'var(--color-text)',
      outline: 'none',
      transition: 'all 0.2s',
    },
    icon: {
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 14,
      color: 'var(--color-text-muted)',
    },
    clear: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      padding: 4,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 12,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>search</span>
      <input
        type="text"
        style={styles.input}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
      />
      {currentValue && (
        <button
          style={styles.clear}
          onClick={() => {
            setValue('');
            onChange?.('');
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

// ==================== MOBILE NAV ====================

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      zIndex: 1000,
    },
    menu: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '80%',
      maxWidth: 320,
      background: 'var(--color-bg-secondary)',
      boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: 16,
      borderBottom: '1px solid var(--color-border)',
    },
    closeButton: {
      padding: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 20,
      color: 'var(--color-text)',
    },
    content: {
      flex: 1,
      padding: 16,
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
  };

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.menu}>
        <div style={styles.header}>
          <button style={styles.closeButton} onClick={onClose}>
            x
          </button>
        </div>
        <div style={styles.content as any}>{children}</div>
      </div>
    </>
  );
};

// ==================== BREADCRUMB NAV ====================

interface BreadcrumbNavProps {
  items: {
    label: string;
    href?: string;
    onClick?: () => void;
  }[];
  separator?: React.ReactNode;
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  items,
  separator = '/',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    link: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'color 0.15s',
    },
    current: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    separator: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <nav style={styles.container}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={index} style={styles.item}>
            {isLast ? (
              <span style={styles.current}>{item.label}</span>
            ) : (
              <>
                <a
                  href={item.href}
                  onClick={item.onClick}
                  style={styles.link}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-accent)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
                  }}
                >
                  {item.label}
                </a>
                <span style={styles.separator}>{separator}</span>
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
};

// ==================== TAB NAV ====================

interface TabNavProps {
  tabs: {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: number;
  }[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
}

export const TabNav: React.FC<TabNavProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
}) => {
  const [active, setActive] = useState(activeTab || tabs[0]?.id);

  const currentActive = activeTab !== undefined ? activeTab : active;

  const handleTabClick = (tabId: string) => {
    setActive(tabId);
    onChange?.(tabId);
  };

  const getTabStyle = (isActive: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: 'none',
      border: 'none',
      fontSize: 14,
      cursor: 'pointer',
      transition: 'all 0.15s',
    };

    switch (variant) {
      case 'pills':
        return {
          ...base,
          borderRadius: 20,
          background: isActive ? 'var(--color-accent)' : 'transparent',
          color: isActive ? '#fff' : 'var(--color-text-muted)',
        };
      case 'underline':
        return {
          ...base,
          borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
          paddingBottom: 10,
        };
      default:
        return {
          ...base,
          borderRadius: 8,
          background: isActive ? 'rgba(var(--color-accent-rgb), 0.1)' : 'transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: variant === 'underline' ? 0 : 4,
      borderBottom: variant === 'underline' ? '1px solid var(--color-border)' : 'none',
    },
    badge: {
      minWidth: 16,
      height: 16,
      padding: '0 4px',
      background: 'var(--color-accent)',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  return (
    <nav style={styles.container}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          style={getTabStyle(currentActive === tab.id)}
          onClick={() => handleTabClick(tab.id)}
        >
          {tab.icon && <span>{tab.icon}</span>}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span style={styles.badge}>{tab.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
};

export default Navbar;
