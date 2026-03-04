/**
 * DEX Resizable Panels System
 * Flexible panel layouts with drag-to-resize and collapse
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================
export interface PanelConfig {
  id: string;
  minSize?: number;
  maxSize?: number;
  defaultSize?: number;
  collapsible?: boolean;
  collapsed?: boolean;
  header?: React.ReactNode;
  content: React.ReactNode;
}

export interface PanelState {
  size: number;
  collapsed: boolean;
}

// ==================== RESIZER COMPONENT ====================
interface ResizerProps {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
  onDoubleClick?: () => void;
}

const Resizer: React.FC<ResizerProps> = memo(({ direction, onDrag, onDoubleClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    
    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, onDrag]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      style={{
        ...resizerStyles.base,
        width: isHorizontal ? 6 : '100%',
        height: isHorizontal ? '100%' : 6,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        ...(isDragging ? resizerStyles.active : {}),
      }}
    >
      <div 
        style={{
          ...resizerStyles.handle,
          width: isHorizontal ? 2 : 32,
          height: isHorizontal ? 32 : 2,
        }} 
      />
    </div>
  );
});

Resizer.displayName = 'Resizer';

// ==================== PANEL HEADER ====================
interface PanelHeaderProps {
  title: React.ReactNode;
  collapsed: boolean;
  collapsible: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}

const PanelHeader: React.FC<PanelHeaderProps> = memo(({
  title,
  collapsed,
  collapsible,
  onToggle,
  actions,
}) => (
  <div style={headerStyles.container}>
    <div style={headerStyles.left}>
      {collapsible && (
        <button onClick={onToggle} style={headerStyles.collapseBtn}>
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 12 12" 
            fill="currentColor"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <path d="M3 4l3 4 3-4H3z" />
          </svg>
        </button>
      )}
      <span style={headerStyles.title}>{title}</span>
    </div>
    {actions && <div style={headerStyles.actions}>{actions}</div>}
  </div>
));

PanelHeader.displayName = 'PanelHeader';

// ==================== SINGLE PANEL ====================
interface PanelProps {
  config: PanelConfig;
  size: number;
  collapsed: boolean;
  direction: 'horizontal' | 'vertical';
  showResizer: boolean;
  onResize: (delta: number) => void;
  onCollapse: () => void;
}

const Panel: React.FC<PanelProps> = memo(({
  config,
  size,
  collapsed,
  direction,
  showResizer,
  onResize,
  onCollapse,
}) => {
  const isHorizontal = direction === 'horizontal';
  const collapsedSize = 32; // Header height when collapsed

  const panelStyle: React.CSSProperties = {
    ...panelStyles.container,
    [isHorizontal ? 'width' : 'height']: collapsed ? collapsedSize : size,
    [isHorizontal ? 'minWidth' : 'minHeight']: collapsed ? collapsedSize : (config.minSize || 100),
    flexDirection: isHorizontal ? 'row' : 'column',
    overflow: collapsed ? 'hidden' : 'auto',
  };

  return (
    <>
      <div style={panelStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {config.header && (
            <PanelHeader
              title={config.header}
              collapsed={collapsed}
              collapsible={config.collapsible || false}
              onToggle={onCollapse}
            />
          )}
          {!collapsed && (
            <div style={panelStyles.content}>
              {config.content}
            </div>
          )}
        </div>
      </div>
      {showResizer && !collapsed && (
        <Resizer 
          direction={direction} 
          onDrag={onResize}
          onDoubleClick={config.collapsible ? onCollapse : undefined}
        />
      )}
    </>
  );
});

Panel.displayName = 'Panel';

// ==================== PANEL GROUP ====================
interface PanelGroupProps {
  panels: PanelConfig[];
  direction?: 'horizontal' | 'vertical';
  onLayoutChange?: (layout: Record<string, PanelState>) => void;
  style?: React.CSSProperties;
}

export const PanelGroup: React.FC<PanelGroupProps> = memo(({
  panels,
  direction = 'horizontal',
  onLayoutChange,
  style,
}) => {
  // Initialize panel states
  const [panelStates, setPanelStates] = useState<Record<string, PanelState>>(() => {
    const states: Record<string, PanelState> = {};
    panels.forEach(p => {
      states[p.id] = {
        size: p.defaultSize || 200,
        collapsed: p.collapsed || false,
      };
    });
    return states;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resize
  const handleResize = useCallback((panelId: string, delta: number) => {
    setPanelStates(prev => {
      const panel = panels.find(p => p.id === panelId);
      if (!panel) return prev;

      const currentSize = prev[panelId].size;
      const minSize = panel.minSize || 100;
      const maxSize = panel.maxSize || 800;
      const newSize = Math.max(minSize, Math.min(maxSize, currentSize + delta));

      const newStates = {
        ...prev,
        [panelId]: { ...prev[panelId], size: newSize },
      };

      onLayoutChange?.(newStates);
      return newStates;
    });
  }, [panels, onLayoutChange]);

  // Handle collapse
  const handleCollapse = useCallback((panelId: string) => {
    setPanelStates(prev => {
      const newStates = {
        ...prev,
        [panelId]: { ...prev[panelId], collapsed: !prev[panelId].collapsed },
      };
      onLayoutChange?.(newStates);
      return newStates;
    });
  }, [onLayoutChange]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      style={{
        ...groupStyles.container,
        flexDirection: isHorizontal ? 'row' : 'column',
        ...style,
      }}
    >
      {panels.map((panel, index) => (
        <Panel
          key={panel.id}
          config={panel}
          size={panelStates[panel.id]?.size || 200}
          collapsed={panelStates[panel.id]?.collapsed || false}
          direction={direction}
          showResizer={index < panels.length - 1}
          onResize={(delta) => handleResize(panel.id, delta)}
          onCollapse={() => handleCollapse(panel.id)}
        />
      ))}
    </div>
  );
});

PanelGroup.displayName = 'PanelGroup';

// ==================== SPLIT PANEL ====================
interface SplitPanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  defaultSplit?: number; // Percentage 0-100
  minLeft?: number;
  minRight?: number;
  onSplitChange?: (split: number) => void;
  style?: React.CSSProperties;
}

export const SplitPanel: React.FC<SplitPanelProps> = memo(({
  left,
  right,
  direction = 'horizontal',
  defaultSplit = 50,
  minLeft = 100,
  minRight = 100,
  onSplitChange,
  style,
}) => {
  const [split, setSplit] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((delta: number) => {
    if (!containerRef.current) return;

    const isHorizontal = direction === 'horizontal';
    const containerSize = isHorizontal 
      ? containerRef.current.offsetWidth 
      : containerRef.current.offsetHeight;

    const deltaPercent = (delta / containerSize) * 100;
    const newSplit = Math.max(
      (minLeft / containerSize) * 100,
      Math.min(100 - (minRight / containerSize) * 100, split + deltaPercent)
    );

    setSplit(newSplit);
    onSplitChange?.(newSplit);
  }, [direction, split, minLeft, minRight, onSplitChange]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      style={{
        ...splitStyles.container,
        flexDirection: isHorizontal ? 'row' : 'column',
        ...style,
      }}
    >
      <div style={{ [isHorizontal ? 'width' : 'height']: `${split}%`, overflow: 'auto' }}>
        {left}
      </div>
      <Resizer direction={direction} onDrag={handleDrag} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {right}
      </div>
    </div>
  );
});

SplitPanel.displayName = 'SplitPanel';

// ==================== COLLAPSIBLE PANEL ====================
interface CollapsiblePanelProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = memo(({
  title,
  defaultOpen = true,
  children,
  actions,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={{ ...collapsibleStyles.container, ...style }}>
      <div 
        style={collapsibleStyles.header}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="currentColor"
          style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}
        >
          <path d="M3 4l3 4 3-4H3z" />
        </svg>
        <span style={collapsibleStyles.title}>{title}</span>
        {actions && (
          <div style={collapsibleStyles.actions} onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {isOpen && (
        <div style={collapsibleStyles.content}>
          {children}
        </div>
      )}
    </div>
  );
});

CollapsiblePanel.displayName = 'CollapsiblePanel';

// ==================== STYLES ====================
const resizerStyles: Record<string, React.CSSProperties> = {
  base: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    transition: 'background 0.15s',
    zIndex: 10,
  },
  active: {
    background: 'var(--color-accent, #007aff)',
  },
  handle: {
    background: 'var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 1,
    opacity: 0.5,
    transition: 'opacity 0.15s',
  },
};

const headerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--color-bg-tertiary, #1a1a1a)',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    userSelect: 'none',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-tertiary, #666)',
    cursor: 'pointer',
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary, #888)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
};

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    background: 'var(--color-bg-secondary, #1e1e1e)',
    overflow: 'hidden',
    transition: 'width 0.2s, height 0.2s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
};

const groupStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
};

const splitStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
};

const collapsibleStyles: Record<string, React.CSSProperties> = {
  container: {
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-primary, #fff)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  content: {
    padding: 12,
  },
};

export default {
  PanelGroup,
  SplitPanel,
  CollapsiblePanel,
};
