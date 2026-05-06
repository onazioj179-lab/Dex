// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * CollapsibleToolGroup - Toolbar group that collapses to dropdown when compact
 * 
 * Features:
 * - Inline tools when expanded (large screens)
 * - Dropdown menu when collapsed (small screens)
 * - Smooth transition between states
 * - Keyboard accessible
 * - Consistent with DEX design system
 */

import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { UnifiedDropdown, DropdownItem } from './UnifiedDropdown';
import { radius, colors, transition } from '../styles/tokens';
import DexIcon from './DexIcon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Icon name from DexIcon */
  icon?: string;
  /** Custom icon element (overrides icon prop) */
  iconElement?: React.ReactNode;
  /** Tooltip text */
  tooltip?: string;
  /** Keyboard shortcut display */
  shortcut?: string;
  /** Whether tool is currently active/selected */
  active?: boolean;
  /** Whether tool is disabled */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Danger style (red) */
  danger?: boolean;
}

export interface CollapsibleToolGroupProps {
  /** Group label (shown when collapsed) */
  label: string;
  /** Group icon (shown when collapsed) */
  icon?: string;
  /** Custom icon element */
  iconElement?: React.ReactNode;
  /** Tools in this group */
  tools: ToolItem[];
  /** Whether group is collapsed (use dropdown) */
  collapsed?: boolean;
  /** Visual divider after this group */
  dividerAfter?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** Button size (default: 28) */
  buttonSize?: number;
  /** Show labels inline (only when not collapsed) */
  showLabels?: boolean;
  /** Orientation (default: horizontal) */
  orientation?: 'horizontal' | 'vertical';
  /** Gap between items (default: 2) */
  gap?: number;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (size: number) => ({
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  groupVertical: {
    flexDirection: 'column' as const,
    alignItems: 'stretch',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    padding: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors.text.secondary,
    background: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: `background ${transition.fast}, color ${transition.fast}, transform 80ms ease`,
    outline: 'none',
    flexShrink: 0,
  },
  buttonHover: {
    background: colors.bg.hover,
    color: colors.text.primary,
  },
  buttonActive: {
    background: colors.accent.soft,
    color: colors.accent.default,
  },
  buttonDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  buttonDanger: {
    color: colors.semantic.error,
  },
  buttonWithLabel: {
    width: 'auto',
    padding: '0 10px',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  divider: {
    width: 1,
    height: size - 8,
    background: colors.border.subtle,
    margin: '0 4px',
    flexShrink: 0,
  },
  dividerVertical: {
    width: 'auto',
    height: 1,
    margin: '4px 0',
  },
  dropdownTrigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: size,
    padding: '0 8px',
    fontSize: 12,
    fontWeight: 500,
    color: colors.text.secondary,
    background: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: `background ${transition.fast}, color ${transition.fast}`,
    outline: 'none',
  },
  dropdownTriggerActive: {
    background: colors.bg.hover,
    color: colors.text.primary,
  },
  chevron: {
    marginLeft: 2,
    transition: `transform ${transition.fast}`,
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
});

// ---------------------------------------------------------------------------
// Tool Button Component
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  tool: ToolItem;
  size: number;
  showLabel?: boolean;
  style?: React.CSSProperties;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool, size, showLabel, style }) => {
  const [hovered, setHovered] = useState(false);
  const styles = useMemo(() => createStyles(size), [size]);

  const buttonStyle: React.CSSProperties = {
    ...styles.button,
    ...(hovered && !tool.disabled ? styles.buttonHover : {}),
    ...(tool.active ? styles.buttonActive : {}),
    ...(tool.disabled ? styles.buttonDisabled : {}),
    ...(tool.danger ? styles.buttonDanger : {}),
    ...(showLabel ? styles.buttonWithLabel : {}),
    ...style,
  };

  const handleClick = useCallback(() => {
    if (!tool.disabled && tool.onClick) {
      tool.onClick();
    }
  }, [tool]);

  const iconContent = tool.iconElement || (tool.icon && <DexIcon name={tool.icon} size={size - 10} />);

  return (
    <button
      type="button"
      title={tool.tooltip || tool.label}
      aria-label={tool.label}
      aria-pressed={tool.active}
      disabled={tool.disabled}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={buttonStyle}
    >
      {iconContent}
      {showLabel && <span style={styles.label}>{tool.label}</span>}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CollapsibleToolGroup = forwardRef<HTMLDivElement, CollapsibleToolGroupProps>(
  (
    {
      label,
      icon,
      iconElement,
      tools,
      collapsed = false,
      dividerAfter = false,
      className,
      style,
      buttonSize = 28,
      showLabels = false,
      orientation = 'horizontal',
      gap = 2,
    },
    ref
  ) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const styles = useMemo(() => createStyles(buttonSize), [buttonSize]);

    // Convert tools to dropdown items
    const dropdownItems: DropdownItem[] = useMemo(() => 
      tools.map(tool => ({
        id: tool.id,
        label: tool.label,
        icon: tool.iconElement || (tool.icon && <DexIcon name={tool.icon} size={16} />),
        shortcut: tool.shortcut,
        disabled: tool.disabled,
        danger: tool.danger,
      })),
    [tools]);

    const handleDropdownSelect = useCallback((item: DropdownItem) => {
      const tool = tools.find(t => t.id === item.id);
      if (tool?.onClick) {
        tool.onClick();
      }
    }, [tools]);

    const hasActiveTool = tools.some(t => t.active);

    // Dropdown trigger style
    const triggerStyle: React.CSSProperties = {
      ...styles.dropdownTrigger,
      ...(dropdownOpen || hasActiveTool ? styles.dropdownTriggerActive : {}),
    };

    // Group container style
    const groupStyle: React.CSSProperties = {
      ...styles.group,
      ...(orientation === 'vertical' ? styles.groupVertical : {}),
      gap,
      ...style,
    };

    // Divider style
    const dividerStyle: React.CSSProperties = {
      ...styles.divider,
      ...(orientation === 'vertical' ? styles.dividerVertical : {}),
    };

    // Icon element for trigger
    const triggerIcon = iconElement || (icon && <DexIcon name={icon} size={14} />);

    if (collapsed) {
      // Render as dropdown
      return (
        <>
          <div ref={ref} className={className} style={groupStyle}>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setDropdownOpen(prev => !prev)}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              aria-label={label}
              style={triggerStyle}
            >
              {triggerIcon}
              <span>{label}</span>
              <svg 
                width="10" 
                height="10" 
                viewBox="0 0 10 10" 
                fill="currentColor"
                style={{
                  ...styles.chevron,
                  ...(dropdownOpen ? styles.chevronOpen : {}),
                }}
              >
                <path d="M2 4L5 7L8 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          
          <UnifiedDropdown
            triggerRef={triggerRef}
            open={dropdownOpen}
            onClose={() => setDropdownOpen(false)}
            items={dropdownItems}
            onSelect={handleDropdownSelect}
            placement="bottom-start"
            ariaLabel={`${label} tools`}
          />
          
          {dividerAfter && <div style={dividerStyle} role="separator" />}
        </>
      );
    }

    // Render inline tools
    return (
      <>
        <div ref={ref} className={className} style={groupStyle} role="group" aria-label={label}>
          {tools.map(tool => (
            <ToolButton
              key={tool.id}
              tool={tool}
              size={buttonSize}
              showLabel={showLabels}
            />
          ))}
        </div>
        {dividerAfter && <div style={dividerStyle} role="separator" />}
      </>
    );
  }
);

CollapsibleToolGroup.displayName = 'CollapsibleToolGroup';

// ---------------------------------------------------------------------------
// Toolbar Container Component
// ---------------------------------------------------------------------------

export interface AdaptiveToolbarProps {
  /** Tool groups to render */
  groups: CollapsibleToolGroupProps[];
  /** Whether all groups should be collapsed */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Background style */
  background?: 'solid' | 'glass' | 'transparent';
}

export const AdaptiveToolbar: React.FC<AdaptiveToolbarProps> = ({
  groups,
  compact = false,
  className,
  style,
  orientation = 'horizontal',
  background = 'solid',
}) => {
  const bgStyles: Record<string, React.CSSProperties> = {
    solid: {
      background: colors.bg.surface,
      borderBottom: `1px solid ${colors.border.subtle}`,
    },
    glass: {
      background: 'rgba(22, 22, 26, 0.85)',
      backdropFilter: 'blur(12px) saturate(150%)',
      borderBottom: `1px solid ${colors.border.default}`,
    },
    transparent: {
      background: 'transparent',
    },
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    minHeight: 38,
    flexWrap: 'wrap' as const,
    ...(orientation === 'vertical' ? {
      flexDirection: 'column' as const,
      alignItems: 'stretch',
      padding: '12px 6px',
      minHeight: 'auto',
      minWidth: 44,
    } : {}),
    ...bgStyles[background],
    ...style,
  };

  return (
    <div className={className} style={containerStyle} role="toolbar" aria-label="Tools">
      {groups.map((group, index) => (
        <CollapsibleToolGroup
          key={group.label}
          {...group}
          collapsed={compact || group.collapsed}
          orientation={orientation}
          dividerAfter={group.dividerAfter ?? (index < groups.length - 1)}
        />
      ))}
    </div>
  );
};

export default CollapsibleToolGroup;
