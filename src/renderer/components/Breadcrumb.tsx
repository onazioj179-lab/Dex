/**
 * DEX Breadcrumb Component
 * Navigation trail showing current location in hierarchy
 */

import React, { useState } from 'react';

// ==================== TYPES ====================

interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  maxItems?: number;
  collapsedLabel?: string;
  showHomeIcon?: boolean;
  onNavigate?: (item: BreadcrumbItem, index: number) => void;
}

interface PathBreadcrumbProps {
  path: string;
  separator?: '/' | '\\' | '>';
  rootLabel?: string;
  onNavigate?: (path: string) => void;
}

// ==================== BREADCRUMB ====================

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  separator = '/',
  maxItems = 0,
  collapsedLabel = '...',
  showHomeIcon = false,
  onNavigate,
}) => {
  const [expanded, setExpanded] = useState(false);

  const shouldCollapse = maxItems > 0 && items.length > maxItems && !expanded;
  
  const getDisplayItems = (): (BreadcrumbItem | 'collapsed')[] => {
    if (!shouldCollapse) return items;
    
    const firstItem = items[0];
    const lastItems = items.slice(-(maxItems - 1));
    return [firstItem, 'collapsed', ...lastItems];
  };

  const displayItems = getDisplayItems();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      fontSize: 13,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      color: 'var(--color-text-secondary)',
      textDecoration: 'none',
      padding: '4px 6px',
      borderRadius: 4,
      transition: 'color 0.15s, background 0.15s',
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      font: 'inherit',
    },
    linkHover: {
      color: 'var(--color-text)',
      background: 'var(--color-bg-hover)',
    },
    current: {
      color: 'var(--color-text)',
      fontWeight: 500,
      cursor: 'default',
    },
    separator: {
      color: 'var(--color-text-muted)',
      display: 'flex',
      alignItems: 'center',
      userSelect: 'none',
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      fontSize: 14,
    },
    collapsed: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      color: 'var(--color-text-muted)',
      padding: '4px 6px',
      borderRadius: 4,
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      font: 'inherit',
    },
    homeIcon: {
      fontSize: 14,
    },
  };

  const handleClick = (item: BreadcrumbItem, index: number) => {
    if (item.onClick) {
      item.onClick();
    } else if (onNavigate) {
      onNavigate(item, index);
    }
  };

  return (
    <nav style={styles.container} aria-label="Breadcrumb">
      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1;
        const isCollapsed = item === 'collapsed';
        const realIndex = isCollapsed
          ? -1
          : items.findIndex(i => i === item);

        if (isCollapsed) {
          return (
            <React.Fragment key="collapsed">
              <button
                style={styles.collapsed}
                onClick={() => setExpanded(true)}
                title="Show all items"
              >
                {collapsedLabel}
              </button>
              <span style={styles.separator}>{separator}</span>
            </React.Fragment>
          );
        }

        const breadcrumbItem = item as BreadcrumbItem;
        const isFirst = index === 0;

        return (
          <React.Fragment key={breadcrumbItem.id}>
            <div style={styles.item}>
              {isLast ? (
                <span style={{ ...styles.link, ...styles.current }}>
                  {isFirst && showHomeIcon && (
                    <span style={styles.homeIcon}>home</span>
                  )}
                  {breadcrumbItem.icon && (
                    <span style={styles.icon}>{breadcrumbItem.icon}</span>
                  )}
                  {breadcrumbItem.label}
                </span>
              ) : (
                <BreadcrumbLink
                  item={breadcrumbItem}
                  onClick={() => handleClick(breadcrumbItem, realIndex)}
                  showHomeIcon={isFirst && showHomeIcon}
                />
              )}
            </div>
            {!isLast && <span style={styles.separator}>{separator}</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

// ==================== BREADCRUMB LINK ====================

interface BreadcrumbLinkProps {
  item: BreadcrumbItem;
  onClick: () => void;
  showHomeIcon?: boolean;
}

const BreadcrumbLink: React.FC<BreadcrumbLinkProps> = ({
  item,
  onClick,
  showHomeIcon,
}) => {
  const [hovered, setHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      color: hovered ? 'var(--color-text)' : 'var(--color-text-secondary)',
      textDecoration: 'none',
      padding: '4px 6px',
      borderRadius: 4,
      transition: 'color 0.15s, background 0.15s',
      cursor: 'pointer',
      background: hovered ? 'var(--color-bg-hover)' : 'transparent',
      border: 'none',
      font: 'inherit',
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      fontSize: 14,
    },
    homeIcon: {
      fontSize: 14,
    },
  };

  if (item.href) {
    return (
      <a
        href={item.href}
        style={styles.link}
        onClick={e => {
          e.preventDefault();
          onClick();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {showHomeIcon && <span style={styles.homeIcon}>home</span>}
        {item.icon && <span style={styles.icon}>{item.icon}</span>}
        {item.label}
      </a>
    );
  }

  return (
    <button
      style={styles.link}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showHomeIcon && <span style={styles.homeIcon}>home</span>}
      {item.icon && <span style={styles.icon}>{item.icon}</span>}
      {item.label}
    </button>
  );
};

// ==================== PATH BREADCRUMB ====================

export const PathBreadcrumb: React.FC<PathBreadcrumbProps> = ({
  path,
  separator = '/',
  rootLabel = 'Home',
  onNavigate,
}) => {
  const parts = path.split(/[/\\]/).filter(Boolean);

  const items: BreadcrumbItem[] = [
    { id: 'root', label: rootLabel },
    ...parts.map((part, index) => ({
      id: `path-${index}`,
      label: part,
    })),
  ];

  const handleNavigate = (_item: BreadcrumbItem, index: number) => {
    if (index === 0) {
      onNavigate?.('/');
    } else {
      const newPath = separator + parts.slice(0, index).join(separator);
      onNavigate?.(newPath);
    }
  };

  return (
    <Breadcrumb
      items={items}
      separator={separator === '\\' ? '\\' : '>'}
      onNavigate={handleNavigate}
      showHomeIcon
    />
  );
};

// ==================== BREADCRUMB DROPDOWN ====================

interface BreadcrumbDropdownItem extends BreadcrumbItem {
  children?: BreadcrumbDropdownItem[];
}

interface BreadcrumbDropdownProps {
  items: BreadcrumbDropdownItem[];
  separator?: React.ReactNode;
  onNavigate?: (item: BreadcrumbDropdownItem) => void;
}

export const BreadcrumbDropdown: React.FC<BreadcrumbDropdownProps> = ({
  items,
  separator = '/',
  onNavigate,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 13,
    },
    itemWrapper: {
      position: 'relative',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      color: 'var(--color-text-secondary)',
      padding: '4px 8px',
      borderRadius: 4,
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      font: 'inherit',
      transition: 'color 0.15s, background 0.15s',
    },
    itemActive: {
      color: 'var(--color-text)',
      background: 'var(--color-bg-hover)',
    },
    hasChildren: {
      paddingRight: 20,
    },
    chevron: {
      position: 'absolute',
      right: 6,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 10,
      color: 'var(--color-text-muted)',
    },
    separator: {
      color: 'var(--color-text-muted)',
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      minWidth: 160,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      padding: 4,
      zIndex: 100,
    },
    dropdownItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '8px 12px',
      color: 'var(--color-text)',
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 13,
      textAlign: 'left',
      transition: 'background 0.15s',
    },
  };

  return (
    <nav style={styles.container}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const hasChildren = item.children && item.children.length > 0;
        const isOpen = openIndex === index;

        return (
          <React.Fragment key={item.id}>
            <div
              style={styles.itemWrapper}
              onMouseEnter={() => hasChildren && setOpenIndex(index)}
              onMouseLeave={() => setOpenIndex(null)}
            >
              <button
                style={{
                  ...styles.item,
                  ...(hasChildren ? styles.hasChildren : {}),
                  ...(isLast ? { color: 'var(--color-text)', fontWeight: 500 } : {}),
                  ...(isOpen ? styles.itemActive : {}),
                }}
                onClick={() => onNavigate?.(item)}
              >
                {item.icon && <span>{item.icon}</span>}
                {item.label}
              </button>

              {hasChildren && <span style={styles.chevron}>▼</span>}

              {isOpen && hasChildren && (
                <div style={styles.dropdown}>
                  {item.children!.map(child => (
                    <button
                      key={child.id}
                      style={styles.dropdownItem}
                      onClick={() => {
                        onNavigate?.(child);
                        setOpenIndex(null);
                      }}
                    >
                      {child.icon && <span>{child.icon}</span>}
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isLast && <span style={styles.separator}>{separator}</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

// ==================== STEPPER BREADCRUMB ====================

interface StepItem {
  id: string;
  label: string;
  description?: string;
  status?: 'pending' | 'active' | 'completed' | 'error';
}

interface StepperProps {
  steps: StepItem[];
  currentStep?: number;
  variant?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  onStepClick?: (step: StepItem, index: number) => void;
  allowClickPrevious?: boolean;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep = 0,
  variant = 'horizontal',
  size = 'md',
  onStepClick,
  allowClickPrevious = true,
}) => {
  const sizeConfig = {
    sm: { indicator: 24, fontSize: 12, gap: 8 },
    md: { indicator: 32, fontSize: 13, gap: 12 },
    lg: { indicator: 40, fontSize: 14, gap: 16 },
  };

  const config = sizeConfig[size];

  const getStatus = (index: number): 'pending' | 'active' | 'completed' | 'error' => {
    if (steps[index].status) return steps[index].status!;
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'active';
    return 'pending';
  };

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    pending: {
      bg: 'transparent',
      color: 'var(--color-text-muted)',
      border: 'var(--color-border)',
    },
    active: {
      bg: 'var(--color-accent)',
      color: '#fff',
      border: 'var(--color-accent)',
    },
    completed: {
      bg: '#10b981',
      color: '#fff',
      border: '#10b981',
    },
    error: {
      bg: '#ef4444',
      color: '#fff',
      border: '#ef4444',
    },
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: variant === 'vertical' ? 'column' : 'row',
      gap: config.gap,
      alignItems: variant === 'vertical' ? 'flex-start' : 'center',
    },
    step: {
      display: 'flex',
      flexDirection: variant === 'vertical' ? 'row' : 'column',
      alignItems: 'center',
      gap: 8,
      flex: variant === 'horizontal' ? 1 : 'none',
      cursor: allowClickPrevious && onStepClick ? 'pointer' : 'default',
    },
    indicatorWrapper: {
      display: 'flex',
      alignItems: 'center',
      flex: 1,
    },
    indicator: {
      width: config.indicator,
      height: config.indicator,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: config.fontSize,
      fontWeight: 500,
      border: '2px solid',
      flexShrink: 0,
      transition: 'all 0.2s',
    },
    connector: {
      flex: 1,
      height: variant === 'vertical' ? 32 : 2,
      width: variant === 'vertical' ? 2 : undefined,
      background: 'var(--color-border)',
      margin: variant === 'vertical' ? '0 0 0 15px' : '0 8px',
    },
    connectorCompleted: {
      background: '#10b981',
    },
    content: {
      textAlign: variant === 'horizontal' ? 'center' : 'left',
    },
    label: {
      fontSize: config.fontSize,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    description: {
      fontSize: config.fontSize - 1,
      color: 'var(--color-text-muted)',
      margin: '2px 0 0 0',
    },
  };

  return (
    <div style={styles.container}>
      {steps.map((step, index) => {
        const status = getStatus(index);
        const colors = statusColors[status];
        const isLast = index === steps.length - 1;
        const canClick = allowClickPrevious && index <= currentStep;

        return (
          <React.Fragment key={step.id}>
            <div
              style={styles.step}
              onClick={() => canClick && onStepClick?.(step, index)}
            >
              <div
                style={{
                  ...styles.indicator,
                  background: colors.bg,
                  color: colors.color,
                  borderColor: colors.border,
                }}
              >
                {status === 'completed' ? 'check' : status === 'error' ? '!' : index + 1}
              </div>

              <div style={styles.content}>
                <p style={styles.label}>{step.label}</p>
                {step.description && (
                  <p style={styles.description}>{step.description}</p>
                )}
              </div>
            </div>

            {!isLast && variant === 'horizontal' && (
              <div
                style={{
                  ...styles.connector,
                  ...(index < currentStep ? styles.connectorCompleted : {}),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Breadcrumb;
