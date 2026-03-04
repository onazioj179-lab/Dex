/**
 * DEX Toolbar Component
 * Unified toolbar system for all creative apps
 */

import React, { memo, useCallback, useState } from 'react';

// ==================== TYPES ====================
export interface ToolbarItem {
  id: string;
  type: 'button' | 'toggle' | 'separator' | 'dropdown' | 'slider' | 'input' | 'group';
  icon?: React.ReactNode;
  label?: string;
  tooltip?: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  value?: any;
  options?: { value: any; label: string; icon?: React.ReactNode }[];
  children?: ToolbarItem[];
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: any) => void;
  onClick?: () => void;
}

export interface ToolbarGroup {
  id: string;
  label?: string;
  items: ToolbarItem[];
}

// ==================== TOOLBAR BUTTON ====================
interface ToolbarButtonProps {
  item: ToolbarItem;
  size?: 'small' | 'medium' | 'large';
}

const ToolbarButton: React.FC<ToolbarButtonProps> = memo(({ item, size = 'medium' }) => {
  const handleClick = useCallback(() => {
    if (!item.disabled) {
      item.onClick?.();
      if (item.type === 'toggle') {
        item.onChange?.(!item.active);
      }
    }
  }, [item]);

  const sizeStyles = {
    small: { width: 24, height: 24, fontSize: 12 },
    medium: { width: 32, height: 32, fontSize: 14 },
    large: { width: 40, height: 40, fontSize: 16 },
  };

  return (
    <button
      onClick={handleClick}
      disabled={item.disabled}
      title={item.tooltip || item.label}
      style={{
        ...buttonStyles.base,
        ...sizeStyles[size],
        ...(item.active ? buttonStyles.active : {}),
        ...(item.disabled ? buttonStyles.disabled : {}),
      }}
    >
      {item.icon && <span style={buttonStyles.icon}>{item.icon}</span>}
      {item.label && !item.icon && <span>{item.label}</span>}
    </button>
  );
});

ToolbarButton.displayName = 'ToolbarButton';

// ==================== TOOLBAR DROPDOWN ====================
interface ToolbarDropdownProps {
  item: ToolbarItem;
  size?: 'small' | 'medium' | 'large';
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = memo(({ item, size = 'medium' }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback((value: any) => {
    item.onChange?.(value);
    setIsOpen(false);
  }, [item]);

  const selectedOption = item.options?.find(o => o.value === item.value);

  return (
    <div style={dropdownStyles.container}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={item.disabled}
        title={item.tooltip}
        style={{
          ...buttonStyles.base,
          ...dropdownStyles.button,
          ...(item.disabled ? buttonStyles.disabled : {}),
        }}
      >
        {item.icon || selectedOption?.icon}
        <span style={dropdownStyles.label}>{selectedOption?.label || item.label}</span>
        <span style={dropdownStyles.arrow}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M4 6L1 2h6L4 6z" />
          </svg>
        </span>
      </button>
      
      {isOpen && (
        <>
          <div style={dropdownStyles.backdrop} onClick={() => setIsOpen(false)} />
          <div style={dropdownStyles.menu}>
            {item.options?.map(option => (
              <button
                key={String(option.value)}
                onClick={() => handleSelect(option.value)}
                style={{
                  ...dropdownStyles.menuItem,
                  ...(option.value === item.value ? dropdownStyles.menuItemActive : {}),
                }}
              >
                {option.icon && <span style={dropdownStyles.menuIcon}>{option.icon}</span>}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

ToolbarDropdown.displayName = 'ToolbarDropdown';

// ==================== TOOLBAR SLIDER ====================
interface ToolbarSliderProps {
  item: ToolbarItem;
}

const ToolbarSlider: React.FC<ToolbarSliderProps> = memo(({ item }) => {
  return (
    <div style={sliderStyles.container} title={item.tooltip}>
      {item.label && <span style={sliderStyles.label}>{item.label}</span>}
      <input
        type="range"
        min={item.min || 0}
        max={item.max || 100}
        step={item.step || 1}
        value={item.value || 0}
        onChange={e => item.onChange?.(parseFloat(e.target.value))}
        disabled={item.disabled}
        style={sliderStyles.input}
      />
      <span style={sliderStyles.value}>{item.value}</span>
    </div>
  );
});

ToolbarSlider.displayName = 'ToolbarSlider';

// ==================== TOOLBAR INPUT ====================
interface ToolbarInputProps {
  item: ToolbarItem;
}

const ToolbarInput: React.FC<ToolbarInputProps> = memo(({ item }) => {
  const [localValue, setLocalValue] = useState(String(item.value || ''));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    item.onChange?.(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      item.onChange?.(localValue);
    }
  };

  return (
    <div style={inputStyles.container} title={item.tooltip}>
      {item.label && <span style={inputStyles.label}>{item.label}</span>}
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={item.disabled}
        style={inputStyles.input}
      />
    </div>
  );
});

ToolbarInput.displayName = 'ToolbarInput';

// ==================== TOOLBAR SEPARATOR ====================
const ToolbarSeparator: React.FC = memo(() => (
  <div style={separatorStyles} />
));

ToolbarSeparator.displayName = 'ToolbarSeparator';

// ==================== TOOLBAR ITEM RENDERER ====================
interface ToolbarItemRendererProps {
  item: ToolbarItem;
  size?: 'small' | 'medium' | 'large';
}

const ToolbarItemRenderer: React.FC<ToolbarItemRendererProps> = ({ item, size }) => {
  switch (item.type) {
    case 'button':
    case 'toggle':
      return <ToolbarButton item={item} size={size} />;
    case 'dropdown':
      return <ToolbarDropdown item={item} size={size} />;
    case 'slider':
      return <ToolbarSlider item={item} />;
    case 'input':
      return <ToolbarInput item={item} />;
    case 'separator':
      return <ToolbarSeparator />;
    case 'group':
      return (
        <div style={groupStyles.container}>
          {item.children?.map(child => (
            <ToolbarItemRenderer key={child.id} item={child} size={size} />
          ))}
        </div>
      );
    default:
      return null;
  }
};

// ==================== MAIN TOOLBAR COMPONENT ====================
interface ToolbarProps {
  items?: ToolbarItem[];
  groups?: ToolbarGroup[];
  position?: 'top' | 'left' | 'right' | 'bottom';
  size?: 'small' | 'medium' | 'large';
  compact?: boolean;
  style?: React.CSSProperties;
}

export const Toolbar: React.FC<ToolbarProps> = memo(({
  items = [],
  groups = [],
  position = 'top',
  size = 'medium',
  compact = false,
  style,
}) => {
  const isVertical = position === 'left' || position === 'right';

  const containerStyle: React.CSSProperties = {
    ...toolbarStyles.container,
    flexDirection: isVertical ? 'column' : 'row',
    ...(isVertical ? { width: compact ? 40 : 48, height: '100%' } : { height: compact ? 36 : 44 }),
    ...(position === 'bottom' && { borderTop: '1px solid var(--color-border)' }),
    ...(position === 'right' && { borderLeft: '1px solid var(--color-border)' }),
    ...style,
  };

  return (
    <div style={containerStyle}>
      {/* Render groups */}
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          {groupIndex > 0 && <ToolbarSeparator />}
          <div style={groupStyles.wrapper}>
            {group.label && <span style={groupStyles.label}>{group.label}</span>}
            <div style={{ ...groupStyles.items, flexDirection: isVertical ? 'column' : 'row' }}>
              {group.items.map(item => (
                <ToolbarItemRenderer key={item.id} item={item} size={size} />
              ))}
            </div>
          </div>
        </React.Fragment>
      ))}

      {/* Render standalone items */}
      {items.map(item => (
        <ToolbarItemRenderer key={item.id} item={item} size={size} />
      ))}
    </div>
  );
});

Toolbar.displayName = 'Toolbar';

// ==================== FLOATING TOOLBAR ====================
interface FloatingToolbarProps extends ToolbarProps {
  x: number;
  y: number;
  visible: boolean;
  onClose?: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = memo(({
  x,
  y,
  visible,
  onClose,
  ...props
}) => {
  if (!visible) return null;

  return (
    <>
      {onClose && <div style={floatingStyles.backdrop} onClick={onClose} />}
      <div style={{ ...floatingStyles.container, left: x, top: y }}>
        <Toolbar {...props} style={{ ...props.style, ...floatingStyles.toolbar }} />
      </div>
    </>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';

// ==================== STYLES ====================
const toolbarStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    background: 'var(--color-bg-secondary, #1e1e1e)',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
};

const buttonStyles: Record<string, React.CSSProperties> = {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-secondary, #888)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  active: {
    background: 'var(--color-accent, #007aff)',
    color: '#fff',
  },
  disabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

const dropdownStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    height: 28,
    width: 'auto',
  },
  label: {
    fontSize: 12,
  },
  arrow: {
    opacity: 0.5,
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    padding: 4,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 1000,
    minWidth: 120,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
  },
  menuItemActive: {
    background: 'var(--color-accent, #007aff)',
  },
  menuIcon: {
    display: 'flex',
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
};

const sliderStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 8px',
  },
  label: {
    fontSize: 11,
    color: 'var(--color-text-tertiary, #666)',
    whiteSpace: 'nowrap',
  },
  input: {
    width: 80,
    height: 4,
    appearance: 'none',
    background: 'var(--color-bg-tertiary, #333)',
    borderRadius: 2,
    cursor: 'pointer',
  },
  value: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'var(--color-text-secondary, #888)',
    minWidth: 30,
    textAlign: 'right',
  },
};

const inputStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 8px',
  },
  label: {
    fontSize: 11,
    color: 'var(--color-text-tertiary, #666)',
  },
  input: {
    width: 60,
    padding: '4px 8px',
    background: 'var(--color-bg-tertiary, #333)',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
};

const separatorStyles: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--color-border, rgba(255,255,255,0.1))',
  margin: '0 4px',
};

const groupStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.05))',
    borderRadius: 6,
    padding: 2,
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: 9,
    color: 'var(--color-text-muted, #555)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '0 4px',
  },
  items: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
};

const floatingStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
  },
  container: {
    position: 'fixed',
    zIndex: 1000,
  },
  toolbar: {
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    border: '1px solid var(--color-border)',
  },
};

export default Toolbar;
