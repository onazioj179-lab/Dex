/**
 * DEX List Components
 * Various list display styles
 */

import React, { useState } from 'react';

// ==================== TYPES ====================

interface ListItemProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: React.ReactNode;
  avatar?: { src?: string; name: string };
  actions?: React.ReactNode;
  badge?: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

interface ListProps {
  children: React.ReactNode;
  variant?: 'default' | 'divided' | 'cards';
  size?: 'sm' | 'md' | 'lg';
  selectable?: boolean;
}

interface SortableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder?: (items: T[]) => void;
}

interface DescriptionListProps {
  items: Array<{
    term: string;
    description: React.ReactNode;
    icon?: React.ReactNode;
  }>;
  layout?: 'horizontal' | 'vertical';
  columns?: number;
}

// ==================== LIST ITEM ====================

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  description,
  icon,
  avatar,
  actions,
  badge,
  meta,
  selected = false,
  disabled = false,
  onClick,
  children,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 16px',
      background: selected
        ? 'var(--color-accent-light, rgba(59, 130, 246, 0.1))'
        : isHovered && onClick
          ? 'var(--color-bg-tertiary)'
          : 'transparent',
      borderRadius: 8,
      cursor: onClick ? 'pointer' : 'default',
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      transition: 'background 0.15s',
    },
    iconWrapper: {
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      fontSize: 18,
      flexShrink: 0,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: '#fff',
      overflow: 'hidden',
      flexShrink: 0,
    },
    avatarImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: subtitle || description ? 4 : 0,
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: selected ? 'var(--color-accent)' : 'var(--color-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    badge: {
      padding: '2px 6px',
      background: 'var(--color-accent)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 600,
      borderRadius: 4,
    },
    subtitle: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginBottom: description ? 4 : 0,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      lineHeight: 1.5,
    },
    right: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 4,
      flexShrink: 0,
    },
    meta: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    actions: {
      display: 'flex',
      gap: 8,
    },
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div
      style={styles.container}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon && <div style={styles.iconWrapper}>{icon}</div>}

      {avatar && (
        <div style={styles.avatar}>
          {avatar.src ? (
            <img src={avatar.src} alt={avatar.name} style={styles.avatarImg} />
          ) : (
            getInitials(avatar.name)
          )}
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
          {badge && <span style={styles.badge}>{badge}</span>}
        </div>
        {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
        {description && <div style={styles.description}>{description}</div>}
        {children}
      </div>

      <div style={styles.right as any}>
        {meta && <span style={styles.meta}>{meta}</span>}
        {actions && <div style={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
};

// ==================== LIST ====================

export const List: React.FC<ListProps> = ({
  children,
  variant = 'default',
  size = 'md',
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'divided':
        return {
          display: 'flex',
          flexDirection: 'column',
        };
      case 'cards':
        return {
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        };
      default:
        return {
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        };
    }
  };

  const styles: React.CSSProperties = {
    ...getVariantStyles(),
  };

  if (variant === 'divided') {
    const items = React.Children.toArray(children);
    return (
      <div style={styles as any}>
        {items.map((child, index) => (
          <React.Fragment key={index}>
            {child}
            {index < items.length - 1 && (
              <div
                style={{
                  height: 1,
                  background: 'var(--color-border)',
                  margin: '0 16px',
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div style={styles as any}>
        {React.Children.map(children, (child, index) => (
          <div
            key={index}
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
            }}
          >
            {child}
          </div>
        ))}
      </div>
    );
  }

  return <div style={styles as any}>{children}</div>;
};

// ==================== SORTABLE LIST ====================

export function SortableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
}: SortableListProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null) return;

    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, removed);

    onReorder?.(newItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const styles: Record<string, React.CSSProperties> = {
    item: {
      position: 'relative',
      cursor: 'grab',
    },
    dragging: {
      opacity: 0.5,
    },
    dropIndicator: {
      height: 2,
      background: 'var(--color-accent)',
      marginBottom: 4,
    },
  };

  return (
    <div>
      {items.map((item, index) => (
        <div
          key={keyExtractor(item)}
          style={{
            ...styles.item,
            ...(draggedIndex === index ? styles.dragging : {}),
          } as any}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={() => handleDrop(index)}
        >
          {dragOverIndex === index && <div style={styles.dropIndicator} />}
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}

// ==================== DESCRIPTION LIST ====================

export const DescriptionList: React.FC<DescriptionListProps> = ({
  items,
  layout = 'horizontal',
  columns = 2,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: layout === 'horizontal'
        ? `repeat(${columns}, 1fr)`
        : '1fr',
      gap: layout === 'horizontal' ? 24 : 16,
    },
    item: {
      display: 'flex',
      flexDirection: layout === 'horizontal' ? 'column' : 'row',
      gap: layout === 'horizontal' ? 4 : 16,
      alignItems: layout === 'horizontal' ? 'flex-start' : 'flex-start',
    },
    termWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: layout === 'horizontal' ? 'auto' : 150,
      flexShrink: 0,
    },
    icon: {
      fontSize: 16,
      color: 'var(--color-text-muted)',
    },
    term: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    description: {
      fontSize: 14,
      color: 'var(--color-text)',
      flex: 1,
    },
  };

  return (
    <dl style={styles.container}>
      {items.map((item, index) => (
        <div key={index} style={styles.item as any}>
          <div style={styles.termWrapper}>
            {item.icon && <span style={styles.icon}>{item.icon}</span>}
            <dt style={styles.term}>{item.term}</dt>
          </div>
          <dd style={{ ...styles.description, margin: 0 }}>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
};

// ==================== ACTION LIST ====================

interface ActionListItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick?: () => void;
}

interface ActionListProps {
  items: ActionListItem[];
  title?: string;
}

export const ActionList: React.FC<ActionListProps> = ({
  items,
  title,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    title: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: '8px 12px',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      background: 'none',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      textAlign: 'left',
      width: '100%',
      transition: 'background 0.15s',
    },
    icon: {
      fontSize: 18,
      width: 24,
      textAlign: 'center',
      flexShrink: 0,
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    label: {
      fontSize: 14,
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    shortcut: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      background: 'var(--color-bg-tertiary)',
      padding: '2px 6px',
      borderRadius: 4,
      fontFamily: 'monospace',
    },
  };

  return (
    <div style={styles.container as any}>
      {title && <div style={styles.title}>{title}</div>}
      {items.map(item => (
        <button
          key={item.id}
          style={{
            ...styles.item,
            opacity: item.disabled ? 0.5 : 1,
            color: item.destructive ? '#ef4444' : 'var(--color-text)',
          } as any}
          onClick={item.onClick}
          disabled={item.disabled}
          onMouseEnter={(e) => {
            if (!item.disabled) {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
        >
          {item.icon && <span style={styles.icon as any}>{item.icon}</span>}
          <div style={styles.content as any}>
            <span style={styles.label}>{item.label}</span>
            {item.description && (
              <span style={styles.description}>{item.description}</span>
            )}
          </div>
          {item.shortcut && (
            <span style={styles.shortcut}>{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
};

// ==================== BULLET LIST ====================

interface BulletListProps {
  items: string[];
  type?: 'disc' | 'circle' | 'check' | 'number' | 'arrow';
  color?: string;
}

export const BulletList: React.FC<BulletListProps> = ({
  items,
  type = 'disc',
  color = 'var(--color-accent)',
}) => {
  const getBullet = (index: number) => {
    switch (type) {
      case 'circle':
        return '○';
      case 'check':
        return 'check';
      case 'number':
        return `${index + 1}.`;
      case 'arrow':
        return 'arrow-right';
      default:
        return '•';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      listStyle: 'none',
      margin: 0,
      padding: 0,
    },
    item: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    },
    bullet: {
      color,
      fontWeight: 600,
      minWidth: 20,
      flexShrink: 0,
    },
    text: {
      fontSize: 14,
      color: 'var(--color-text)',
      lineHeight: 1.5,
    },
  };

  return (
    <ul style={styles.list as any}>
      {items.map((item, index) => (
        <li key={index} style={styles.item}>
          <span style={styles.bullet}>{getBullet(index)}</span>
          <span style={styles.text}>{item}</span>
        </li>
      ))}
    </ul>
  );
};

export default List;
