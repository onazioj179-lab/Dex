/**
 * DEX Split View
 * Resizable multi-pane layouts
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

type SplitDirection = 'horizontal' | 'vertical';

interface SplitViewProps {
  direction?: SplitDirection;
  initialSplit?: number; // Percentage 0-100
  minSize?: number; // Minimum size in pixels
  maxSize?: number; // Maximum size in pixels
  children: [React.ReactNode, React.ReactNode];
  onSplitChange?: (split: number) => void;
  storageKey?: string;
}

interface ResizeHandleProps {
  direction: SplitDirection;
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

// ==================== RESIZE HANDLE ====================

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onMouseDown, isResizing }) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    handle: {
      position: 'relative',
      flexShrink: 0,
      background: 'transparent',
      cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
      ...(direction === 'horizontal' 
        ? { width: 8, height: '100%' }
        : { width: '100%', height: 8 }
      ),
      zIndex: 10,
    },
    line: {
      position: 'absolute',
      background: isHovered || isResizing 
        ? 'var(--color-accent)' 
        : 'var(--color-border)',
      borderRadius: 1,
      transition: 'background 0.15s, transform 0.15s',
      ...(direction === 'horizontal' 
        ? { 
            left: '50%', 
            top: 8, 
            bottom: 8, 
            width: 2,
            transform: `translateX(-50%)${isHovered || isResizing ? ' scaleX(2)' : ''}`,
          }
        : { 
            top: '50%', 
            left: 8, 
            right: 8, 
            height: 2,
            transform: `translateY(-50%)${isHovered || isResizing ? ' scaleY(2)' : ''}`,
          }
      ),
    },
    dots: {
      position: 'absolute',
      display: 'flex',
      gap: 2,
      ...(direction === 'horizontal'
        ? { flexDirection: 'column', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
        : { flexDirection: 'row', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
      ),
      opacity: isHovered || isResizing ? 1 : 0,
      transition: 'opacity 0.15s',
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: '50%',
      background: 'var(--color-accent)',
    },
  };

  return (
    <div
      style={styles.handle}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.line} />
      <div style={styles.dots}>
        <div style={styles.dot} />
        <div style={styles.dot} />
        <div style={styles.dot} />
      </div>
    </div>
  );
};

// ==================== SPLIT VIEW ====================

export const SplitView: React.FC<SplitViewProps> = ({
  direction = 'horizontal',
  initialSplit = 50,
  minSize = 100,
  maxSize,
  children,
  onSplitChange,
  storageKey,
}) => {
  const [split, setSplit] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`dex-split-${storageKey}`);
      if (saved) return parseFloat(saved);
    }
    return initialSplit;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Save split position
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`dex-split-${storageKey}`, split.toString());
    }
    onSplitChange?.(split);
  }, [split, storageKey, onSplitChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const isHorizontal = direction === 'horizontal';
    const containerSize = isHorizontal ? rect.width : rect.height;
    const mousePos = isHorizontal 
      ? e.clientX - rect.left 
      : e.clientY - rect.top;

    let newSplit = (mousePos / containerSize) * 100;

    // Apply min/max constraints
    if (minSize) {
      const minPercent = (minSize / containerSize) * 100;
      newSplit = Math.max(minPercent, newSplit);
      newSplit = Math.min(100 - minPercent, newSplit);
    }
    if (maxSize) {
      const maxPercent = (maxSize / containerSize) * 100;
      newSplit = Math.min(maxPercent, newSplit);
    }

    // Clamp between 10% and 90%
    newSplit = Math.max(10, Math.min(90, newSplit));

    setSplit(newSplit);
  }, [isResizing, direction, minSize, maxSize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp, direction]);

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  };

  const paneStyles: (index: number) => React.CSSProperties = (index) => ({
    overflow: 'auto',
    ...(direction === 'horizontal'
      ? { width: index === 0 ? `${split}%` : `${100 - split}%`, height: '100%' }
      : { height: index === 0 ? `${split}%` : `${100 - split}%`, width: '100%' }
    ),
    transition: isResizing ? 'none' : 'width 0.1s, height 0.1s',
  });

  return (
    <div ref={containerRef} style={containerStyles}>
      <div style={paneStyles(0)}>{children[0]}</div>
      <ResizeHandle
        direction={direction}
        onMouseDown={handleMouseDown}
        isResizing={isResizing}
      />
      <div style={paneStyles(1)}>{children[1]}</div>
    </div>
  );
};

// ==================== TRIPLE SPLIT VIEW ====================

interface TripleSplitViewProps {
  direction?: SplitDirection;
  initialSplits?: [number, number]; // [first split, second split] as percentages
  minSize?: number;
  children: [React.ReactNode, React.ReactNode, React.ReactNode];
  storageKey?: string;
}

export const TripleSplitView: React.FC<TripleSplitViewProps> = ({
  direction = 'horizontal',
  initialSplits = [33, 66],
  minSize = 100,
  children,
  storageKey,
}) => {
  const [splits, setSplits] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`dex-triple-split-${storageKey}`);
      if (saved) return JSON.parse(saved) as [number, number];
    }
    return initialSplits;
  });
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`dex-triple-split-${storageKey}`, JSON.stringify(splits));
    }
  }, [splits, storageKey]);

  const handleMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingIndex(index);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizingIndex === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const isHorizontal = direction === 'horizontal';
    const containerSize = isHorizontal ? rect.width : rect.height;
    const mousePos = isHorizontal 
      ? e.clientX - rect.left 
      : e.clientY - rect.top;

    let newPercent = (mousePos / containerSize) * 100;
    const minPercent = (minSize / containerSize) * 100;

    setSplits(prev => {
      const newSplits: [number, number] = [...prev];
      
      if (resizingIndex === 0) {
        newSplits[0] = Math.max(minPercent, Math.min(prev[1] - minPercent, newPercent));
      } else {
        newSplits[1] = Math.max(prev[0] + minPercent, Math.min(100 - minPercent, newPercent));
      }

      return newSplits;
    });
  }, [resizingIndex, direction, minSize]);

  const handleMouseUp = useCallback(() => {
    setResizingIndex(null);
  }, []);

  useEffect(() => {
    if (resizingIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [resizingIndex, handleMouseMove, handleMouseUp, direction]);

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  };

  const getPaneSize = (index: number): string => {
    if (index === 0) return `${splits[0]}%`;
    if (index === 1) return `${splits[1] - splits[0]}%`;
    return `${100 - splits[1]}%`;
  };

  const paneStyles: (index: number) => React.CSSProperties = (index) => ({
    overflow: 'auto',
    ...(direction === 'horizontal'
      ? { width: getPaneSize(index), height: '100%' }
      : { height: getPaneSize(index), width: '100%' }
    ),
    transition: resizingIndex !== null ? 'none' : 'width 0.1s, height 0.1s',
  });

  return (
    <div ref={containerRef} style={containerStyles}>
      <div style={paneStyles(0)}>{children[0]}</div>
      <ResizeHandle
        direction={direction}
        onMouseDown={handleMouseDown(0)}
        isResizing={resizingIndex === 0}
      />
      <div style={paneStyles(1)}>{children[1]}</div>
      <ResizeHandle
        direction={direction}
        onMouseDown={handleMouseDown(1)}
        isResizing={resizingIndex === 1}
      />
      <div style={paneStyles(2)}>{children[2]}</div>
    </div>
  );
};

// ==================== COLLAPSIBLE PANEL ====================

interface CollapsiblePanelProps {
  position: 'left' | 'right' | 'top' | 'bottom';
  defaultWidth?: number;
  defaultHeight?: number;
  minSize?: number;
  maxSize?: number;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
  storageKey?: string;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  position,
  defaultWidth = 280,
  defaultHeight = 200,
  minSize = 200,
  maxSize = 600,
  isCollapsed: externalCollapsed,
  onCollapsedChange,
  children,
  storageKey,
}) => {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`dex-panel-${storageKey}`);
      if (saved) {
        const data = JSON.parse(saved);
        return data.size || (position === 'left' || position === 'right' ? defaultWidth : defaultHeight);
      }
    }
    return position === 'left' || position === 'right' ? defaultWidth : defaultHeight;
  });
  
  const [collapsed, setCollapsed] = useState(() => {
    if (externalCollapsed !== undefined) return externalCollapsed;
    if (storageKey) {
      const saved = localStorage.getItem(`dex-panel-${storageKey}`);
      if (saved) {
        const data = JSON.parse(saved);
        return data.collapsed || false;
      }
    }
    return false;
  });

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalCollapsed !== undefined) {
      setCollapsed(externalCollapsed);
    }
  }, [externalCollapsed]);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`dex-panel-${storageKey}`, JSON.stringify({ size, collapsed }));
    }
    onCollapsedChange?.(collapsed);
  }, [size, collapsed, storageKey, onCollapsedChange]);

  const isHorizontal = position === 'left' || position === 'right';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !panelRef.current) return;

    const rect = panelRef.current.parentElement?.getBoundingClientRect();
    if (!rect) return;

    let newSize: number;
    if (position === 'left') {
      newSize = e.clientX - rect.left;
    } else if (position === 'right') {
      newSize = rect.right - e.clientX;
    } else if (position === 'top') {
      newSize = e.clientY - rect.top;
    } else {
      newSize = rect.bottom - e.clientY;
    }

    setSize(Math.max(minSize, Math.min(maxSize, newSize)));
  }, [isResizing, position, minSize, maxSize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp, isHorizontal]);

  const toggleCollapse = useCallback(() => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onCollapsedChange?.(newCollapsed);
  }, [collapsed, onCollapsedChange]);

  const panelStyles: React.CSSProperties = {
    position: 'relative',
    background: 'var(--color-bg-secondary)',
    borderColor: 'var(--color-border)',
    overflow: 'hidden',
    transition: isResizing ? 'none' : 'width 0.2s, height 0.2s',
    ...(isHorizontal
      ? { 
          width: collapsed ? 0 : size, 
          height: '100%',
          borderRightWidth: position === 'left' ? 1 : 0,
          borderLeftWidth: position === 'right' ? 1 : 0,
          borderStyle: 'solid',
        }
      : { 
          height: collapsed ? 0 : size, 
          width: '100%',
          borderBottomWidth: position === 'top' ? 1 : 0,
          borderTopWidth: position === 'bottom' ? 1 : 0,
          borderStyle: 'solid',
        }
    ),
  };

  const handlePosition = isHorizontal
    ? { 
        [position === 'left' ? 'right' : 'left']: 0, 
        top: 0, 
        bottom: 0, 
        width: 8 
      }
    : { 
        [position === 'top' ? 'bottom' : 'top']: 0, 
        left: 0, 
        right: 0, 
        height: 8 
      };

  return (
    <div ref={panelRef} style={panelStyles}>
      {!collapsed && (
        <>
          {children}
          <div
            style={{
              position: 'absolute',
              ...handlePosition,
              cursor: isHorizontal ? 'col-resize' : 'row-resize',
              zIndex: 10,
            }}
            onMouseDown={handleMouseDown}
          />
        </>
      )}
    </div>
  );
};

export default SplitView;
