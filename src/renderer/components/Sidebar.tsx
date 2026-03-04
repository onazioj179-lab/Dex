/**
 * DEX Sidebar Component
 * Collapsible navigation sidebar with sections
 */

import React, { useState, createContext, useContext, useCallback } from 'react';

// ==================== TYPES ====================

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activeItem: string | null;
  setActiveItem: (id: string | null) => void;
  expandedSections: string[];
  toggleSection: (id: string) => void;
}

interface SidebarProps {
  children: React.ReactNode;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  width?: number;
  collapsedWidth?: number;
  position?: 'left' | 'right';
  showToggle?: boolean;
}

interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface SidebarSectionProps {
  id?: string;
  title?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

interface SidebarItemProps extends SidebarItem {
  indent?: number;
  children?: React.ReactNode;
}

// ==================== CONTEXT ====================

const SidebarContext = createContext<SidebarContextType | null>(null);

const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('Sidebar components must be used within a Sidebar');
  }
  return context;
};

// ==================== SIDEBAR ====================

export const Sidebar: React.FC<SidebarProps> = ({
  children,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  width = 240,
  collapsedWidth = 60,
  position = 'left',
  showToggle = true,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const collapsed = controlledCollapsed ?? internalCollapsed;

  const setCollapsed = useCallback((value: boolean) => {
    setInternalCollapsed(value);
    onCollapsedChange?.(value);
  }, [onCollapsedChange]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    sidebar: {
      width: collapsed ? collapsedWidth : width,
      height: '100%',
      background: 'var(--color-bg-secondary)',
      borderRight: position === 'left' ? '1px solid var(--color-border)' : 'none',
      borderLeft: position === 'right' ? '1px solid var(--color-border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: collapsed ? 8 : 12,
    },
    toggle: {
      position: 'absolute',
      top: 12,
      right: position === 'left' ? -12 : undefined,
      left: position === 'right' ? -12 : undefined,
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: 12,
      color: 'var(--color-text-muted)',
      zIndex: 10,
      transition: 'transform 0.15s',
    },
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        activeItem,
        setActiveItem,
        expandedSections,
        toggleSection,
      }}
    >
      <aside style={styles.sidebar}>
        <div style={styles.content}>{children}</div>

        {showToggle && (
          <button
            style={{
              ...styles.toggle,
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {position === 'left' ? '◀' : '▶'}
          </button>
        )}
      </aside>
    </SidebarContext.Provider>
  );
};

// ==================== SIDEBAR HEADER ====================

interface SidebarHeaderProps {
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  logo,
  title,
  subtitle,
  action,
}) => {
  const { collapsed } = useSidebar();

  const styles: Record<string, React.CSSProperties> = {
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: collapsed ? '12px 0' : 12,
      marginBottom: 8,
      justifyContent: collapsed ? 'center' : 'flex-start',
    },
    logo: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    content: {
      flex: 1,
      minWidth: 0,
      display: collapsed ? 'none' : 'block',
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    subtitle: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
    action: {
      display: collapsed ? 'none' : 'flex',
      alignItems: 'center',
    },
  };

  return (
    <div style={styles.header}>
      {logo && <div style={styles.logo}>{logo}</div>}
      <div style={styles.content}>
        {title && <h2 style={styles.title}>{title}</h2>}
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div style={styles.action}>{action}</div>}
    </div>
  );
};

// ==================== SIDEBAR SECTION ====================

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  id,
  title,
  children,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const { collapsed: sidebarCollapsed, expandedSections, toggleSection } = useSidebar();
  const sectionId = id || title || '';
  const isExpanded = expandedSections.includes(sectionId) || defaultExpanded && !expandedSections.includes(`${sectionId}-closed`);

  const handleToggle = () => {
    if (collapsible && title) {
      if (isExpanded) {
        toggleSection(`${sectionId}-closed`);
      } else {
        toggleSection(sectionId);
      }
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    section: {
      marginBottom: 16,
    },
    header: {
      display: sidebarCollapsed ? 'none' : 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 8px',
      marginBottom: 4,
      cursor: collapsible && title ? 'pointer' : 'default',
    },
    title: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: 0,
    },
    chevron: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
      transition: 'transform 0.15s',
      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
    },
    content: {
      display: isExpanded || sidebarCollapsed ? 'flex' : 'none',
      flexDirection: 'column',
      gap: 2,
    },
  };

  return (
    <div style={styles.section}>
      {title && (
        <div style={styles.header} onClick={handleToggle}>
          <span style={styles.title}>{title}</span>
          {collapsible && <span style={styles.chevron}>▼</span>}
        </div>
      )}
      <div style={styles.content}>{children}</div>
    </div>
  );
};

// ==================== SIDEBAR ITEM ====================

export const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  label,
  icon,
  badge,
  href,
  onClick,
  disabled = false,
  active = false,
  indent = 0,
  children,
}) => {
  const { collapsed, activeItem, setActiveItem } = useSidebar();
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasChildren = React.Children.count(children) > 0;
  const isActive = active || activeItem === id;

  const handleClick = () => {
    if (disabled) return;

    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      setActiveItem(id);
      onClick?.();
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      display: 'flex',
      flexDirection: 'column',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: collapsed ? '10px 0' : '8px 10px',
      paddingLeft: collapsed ? 0 : 10 + indent * 16,
      borderRadius: 6,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: isActive
        ? 'var(--color-accent-alpha)'
        : hovered
        ? 'var(--color-bg-hover)'
        : 'transparent',
      color: disabled
        ? 'var(--color-text-muted)'
        : isActive
        ? 'var(--color-accent)'
        : 'var(--color-text)',
      textDecoration: 'none',
      transition: 'background 0.15s, color 0.15s',
      justifyContent: collapsed ? 'center' : 'flex-start',
      opacity: disabled ? 0.5 : 1,
      position: 'relative',
    },
    icon: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 16,
      flexShrink: 0,
    },
    label: {
      flex: 1,
      fontSize: 13,
      fontWeight: isActive ? 500 : 400,
      display: collapsed ? 'none' : 'block',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    badge: {
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 6px',
      borderRadius: 10,
      background: isActive ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
      color: isActive ? '#fff' : 'var(--color-text-muted)',
      display: collapsed ? 'none' : 'flex',
    },
    chevron: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
      display: collapsed || !hasChildren ? 'none' : 'flex',
      transition: 'transform 0.15s',
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
    },
    children: {
      display: expanded && !collapsed ? 'flex' : 'none',
      flexDirection: 'column',
      gap: 2,
      marginTop: 2,
    },
    tooltip: {
      position: 'absolute',
      left: '100%',
      marginLeft: 8,
      padding: '6px 10px',
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      fontSize: 12,
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      display: collapsed && hovered ? 'block' : 'none',
    },
  };

  const itemContent = (
    <>
      {icon && <span style={styles.icon}>{icon}</span>}
      <span style={styles.label}>{label}</span>
      {badge !== undefined && <span style={styles.badge}>{badge}</span>}
      <span style={styles.chevron}>▶</span>
      <div style={styles.tooltip}>{label}</div>
    </>
  );

  return (
    <div style={styles.wrapper}>
      {href && !disabled ? (
        <a
          href={href}
          style={styles.item}
          onClick={e => {
            e.preventDefault();
            handleClick();
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {itemContent}
        </a>
      ) : (
        <div
          style={styles.item}
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {itemContent}
        </div>
      )}
      <div style={styles.children}>{children}</div>
    </div>
  );
};

// ==================== SIDEBAR DIVIDER ====================

export const SidebarDivider: React.FC = () => {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--color-border)',
        margin: '8px 0',
      }}
    />
  );
};

// ==================== SIDEBAR FOOTER ====================

interface SidebarFooterProps {
  children: React.ReactNode;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({ children }) => {
  const { collapsed } = useSidebar();

  return (
    <div
      style={{
        marginTop: 'auto',
        padding: collapsed ? 8 : 12,
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {children}
    </div>
  );
};

// ==================== SIDEBAR USER ====================

interface SidebarUserProps {
  name: string;
  email?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'busy' | 'away';
  onClick?: () => void;
  actions?: React.ReactNode;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
  name,
  email,
  avatar,
  status,
  onClick,
  actions,
}) => {
  const { collapsed } = useSidebar();
  const [hovered, setHovered] = useState(false);

  const statusColors = {
    online: '#10b981',
    offline: '#6b7280',
    busy: '#ef4444',
    away: '#f59e0b',
  };

  const getInitials = (name: string): string => {
    const parts = name.split(' ');
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.substring(0, 2);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: collapsed ? 8 : 10,
      borderRadius: 6,
      cursor: onClick ? 'pointer' : 'default',
      background: hovered && onClick ? 'var(--color-bg-hover)' : 'transparent',
      justifyContent: collapsed ? 'center' : 'flex-start',
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      position: 'relative',
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    avatarInitials: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
    },
    status: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: '50%',
      border: '2px solid var(--color-bg-secondary)',
    },
    info: {
      flex: 1,
      minWidth: 0,
      display: collapsed ? 'none' : 'block',
    },
    name: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    email: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    actions: {
      display: collapsed ? 'none' : 'flex',
      alignItems: 'center',
    },
  };

  return (
    <div
      style={styles.container}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.avatar}>
        {avatar ? (
          <img src={avatar} alt={name} style={styles.avatarImage} />
        ) : (
          <span style={styles.avatarInitials}>{getInitials(name)}</span>
        )}
        {status && (
          <div
            style={{
              ...styles.status,
              background: statusColors[status],
            }}
          />
        )}
      </div>

      <div style={styles.info}>
        <p style={styles.name}>{name}</p>
        {email && <p style={styles.email}>{email}</p>}
      </div>

      {actions && <div style={styles.actions}>{actions}</div>}
    </div>
  );
};

export default Sidebar;
