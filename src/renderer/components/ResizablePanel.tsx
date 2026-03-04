/**
 * DEX Resizable Panel Component
 * Resizable panels and split views
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ==================== TYPES ====================

interface ResizablePanelProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  minSize?: number;
  maxSize?: number;
  defaultSize?: number | string;
  onResize?: (size: number) => void;
  onResizeEnd?: (size: number) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  handlePosition?: 'start' | 'end';
}

interface ResizableGroupProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  sizes?: number[];
  minSizes?: number[];
  onSizesChange?: (sizes: number[]) => void;
  handleSize?: number;
}

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftSize?: number | string;
  minLeftSize?: number;
  minRightSize?: number;
  onResize?: (leftSize: number) => void;
  allowCollapse?: boolean;
  collapseThreshold?: number;
}

// ==================== RESIZABLE PANEL ====================

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  direction = 'horizontal',
  minSize = 100,
  maxSize,
  defaultSize = 300,
  onResize,
  onResizeEnd,
  collapsible = false,
  collapsed: controlledCollapsed,
  onCollapse,
  handlePosition = 'end',
}) => {
  const [size, setSize] = useState<number>(
    typeof defaultSize === 'number' ? defaultSize : 300
  );
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(controlledCollapsed ?? false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<number>(0);
  const startSize = useRef<number>(0);

  const isHorizontal = direction === 'horizontal';

  useEffect(() => {
    if (controlledCollapsed !== undefined) {
      setIsCollapsed(controlledCollapsed);
    }
  }, [controlledCollapsed]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = isHorizontal ? e.clientX : e.clientY;
    startSize.current = size;
    setIsResizing(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const currentPos = isHorizontal ? e.clientX : e.clientY;
    const delta = handlePosition === 'end'
      ? currentPos - startPos.current
      : startPos.current - currentPos;

    let newSize = startSize.current + delta;
    newSize = Math.max(minSize, newSize);
    if (maxSize) newSize = Math.min(maxSize, newSize);

    setSize(newSize);
    onResize?.(newSize);
  }, [isResizing, isHorizontal, handlePosition, minSize, maxSize, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    onResizeEnd?.(size);
  }, [size, onResizeEnd]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp, isHorizontal]);

  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapse?.(newCollapsed);
  };

  const displaySize = isCollapsed ? 0 : size;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      position: 'relative',
    },
    panel: {
      [isHorizontal ? 'width' : 'height']: displaySize,
      flexShrink: 0,
      overflow: 'hidden',
      transition: isResizing ? 'none' : 'width 0.2s, height 0.2s',
    },
    handle: {
      position: 'relative',
      [isHorizontal ? 'width' : 'height']: 6,
      background: 'var(--color-border)',
      cursor: isHorizontal ? 'col-resize' : 'row-resize',
      flexShrink: 0,
      transition: 'background 0.15s',
    },
    handleActive: {
      background: 'var(--color-accent)',
    },
    handleHover: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      [isHorizontal ? 'top' : 'left']: '50%',
      transform: isHorizontal ? 'translateY(-50%)' : 'translateX(-50%)',
      [isHorizontal ? 'left' : 'top']: 0,
      [isHorizontal ? 'right' : 'bottom']: 0,
      height: isHorizontal ? 40 : 6,
      width: isHorizontal ? 6 : 40,
    },
    collapseButton: {
      position: 'absolute',
      [isHorizontal ? 'top' : 'left']: '50%',
      [isHorizontal ? 'left' : 'top']: '50%',
      transform: 'translate(-50%, -50%)',
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 10,
      color: 'var(--color-text-muted)',
      zIndex: 1,
    },
    content: {
      flex: 1,
      overflow: 'auto',
    },
  };

  const renderHandle = () => (
    <div
      style={{
        ...styles.handle,
        ...(isResizing ? styles.handleActive : {}),
      }}
      onMouseDown={handleMouseDown}
    >
      {collapsible && (
        <button style={styles.collapseButton} onClick={toggleCollapse}>
          {isCollapsed ? (isHorizontal ? 'arrow-right' : 'arrow-down') : (isHorizontal ? 'arrow-left' : 'arrow-up')}
        </button>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      {handlePosition === 'start' && renderHandle()}
      <div ref={panelRef} style={styles.panel}>
        {children}
      </div>
      {handlePosition === 'end' && renderHandle()}
    </div>
  );
};

// ==================== RESIZABLE GROUP ====================

export const ResizableGroup: React.FC<ResizableGroupProps> = ({
  children,
  direction = 'horizontal',
  sizes: controlledSizes,
  minSizes = [],
  onSizesChange,
  handleSize = 6,
}) => {
  const childArray = React.Children.toArray(children);
  const defaultSizes = childArray.map(() => 100 / childArray.length);
  const [sizes, setSizes] = useState<number[]>(controlledSizes || defaultSizes);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<number>(0);
  const startSizes = useRef<number[]>([]);

  const isHorizontal = direction === 'horizontal';

  useEffect(() => {
    if (controlledSizes) {
      setSizes(controlledSizes);
    }
  }, [controlledSizes]);

  const handleMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = isHorizontal ? e.clientX : e.clientY;
    startSizes.current = [...sizes];
    setResizingIndex(index);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizingIndex === null || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerSize = isHorizontal ? containerRect.width : containerRect.height;
    const currentPos = isHorizontal ? e.clientX : e.clientY;
    const delta = currentPos - startPos.current;
    const deltaPercent = (delta / containerSize) * 100;

    const newSizes = [...startSizes.current];
    const minSize = minSizes[resizingIndex] || 10;
    const nextMinSize = minSizes[resizingIndex + 1] || 10;

    // Adjust sizes
    let leftNewSize = newSizes[resizingIndex] + deltaPercent;
    let rightNewSize = newSizes[resizingIndex + 1] - deltaPercent;

    // Apply minimum constraints
    if (leftNewSize < minSize) {
      leftNewSize = minSize;
      rightNewSize = newSizes[resizingIndex + 1] + (newSizes[resizingIndex] - minSize);
    }
    if (rightNewSize < nextMinSize) {
      rightNewSize = nextMinSize;
      leftNewSize = newSizes[resizingIndex] + (newSizes[resizingIndex + 1] - nextMinSize);
    }

    newSizes[resizingIndex] = leftNewSize;
    newSizes[resizingIndex + 1] = rightNewSize;

    setSizes(newSizes);
    onSizesChange?.(newSizes);
  }, [resizingIndex, isHorizontal, minSizes, onSizesChange]);

  const handleMouseUp = useCallback(() => {
    setResizingIndex(null);
  }, []);

  useEffect(() => {
    if (resizingIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingIndex, handleMouseMove, handleMouseUp, isHorizontal]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      height: '100%',
      width: '100%',
    },
    panel: {
      overflow: 'auto',
    },
    handle: {
      [isHorizontal ? 'width' : 'height']: handleSize,
      background: 'var(--color-border)',
      cursor: isHorizontal ? 'col-resize' : 'row-resize',
      flexShrink: 0,
      transition: 'background 0.15s',
    },
    handleActive: {
      background: 'var(--color-accent)',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {childArray.map((child, index) => (
        <React.Fragment key={index}>
          <div
            style={{
              ...styles.panel,
              [isHorizontal ? 'width' : 'height']: `${sizes[index]}%`,
            }}
          >
            {child}
          </div>
          {index < childArray.length - 1 && (
            <div
              style={{
                ...styles.handle,
                ...(resizingIndex === index ? styles.handleActive : {}),
              }}
              onMouseDown={handleMouseDown(index)}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ==================== SPLIT PANE ====================

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  defaultLeftSize = '50%',
  minLeftSize = 100,
  minRightSize = 100,
  onResize,
  allowCollapse = false,
  collapseThreshold = 50,
}) => {
  const [leftSize, setLeftSize] = useState<number | string>(defaultLeftSize);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<number>(0);
  const startSize = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    startPos.current = e.clientX;
    startSize.current = typeof leftSize === 'number' 
      ? leftSize 
      : (parseFloat(leftSize) / 100) * rect.width;
    setIsResizing(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const delta = e.clientX - startPos.current;
    let newSize = startSize.current + delta;

    // Apply constraints
    newSize = Math.max(minLeftSize, newSize);
    newSize = Math.min(rect.width - minRightSize - 6, newSize);

    // Check for collapse
    if (allowCollapse) {
      if (newSize < collapseThreshold) {
        setCollapsed('left');
        newSize = 0;
      } else if (rect.width - newSize < collapseThreshold) {
        setCollapsed('right');
        newSize = rect.width - 6;
      } else {
        setCollapsed(null);
      }
    }

    setLeftSize(newSize);
    onResize?.(newSize);
  }, [isResizing, minLeftSize, minRightSize, allowCollapse, collapseThreshold, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const getLeftWidth = () => {
    if (collapsed === 'left') return 0;
    if (collapsed === 'right') return 'calc(100% - 6px)';
    return typeof leftSize === 'number' ? leftSize : leftSize;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
    },
    left: {
      width: getLeftWidth(),
      flexShrink: 0,
      overflow: 'auto',
      transition: isResizing ? 'none' : 'width 0.2s',
    },
    handle: {
      width: 6,
      background: 'var(--color-border)',
      cursor: 'col-resize',
      flexShrink: 0,
      position: 'relative',
      transition: 'background 0.15s',
    },
    handleActive: {
      background: 'var(--color-accent)',
    },
    right: {
      flex: 1,
      overflow: 'auto',
      minWidth: 0,
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.left}>{left}</div>
      <div
        style={{
          ...styles.handle,
          ...(isResizing ? styles.handleActive : {}),
        }}
        onMouseDown={handleMouseDown}
      />
      <div style={styles.right}>{right}</div>
    </div>
  );
};

// ==================== USE RESIZABLE HOOK ====================

export const useResizable = (
  options: {
    direction?: 'horizontal' | 'vertical';
    minSize?: number;
    maxSize?: number;
    defaultSize?: number;
  } = {}
) => {
  const {
    direction = 'horizontal',
    minSize = 100,
    maxSize,
    defaultSize = 300,
  } = options;

  const [size, setSize] = useState(defaultSize);
  const [isResizing, setIsResizing] = useState(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const isHorizontal = direction === 'horizontal';

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = isHorizontal ? e.clientX : e.clientY;
    startSize.current = size;
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      const currentPos = isHorizontal ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      let newSize = startSize.current + delta;
      newSize = Math.max(minSize, newSize);
      if (maxSize) newSize = Math.min(maxSize, newSize);
      setSize(newSize);
    };

    const handleUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, isHorizontal, minSize, maxSize]);

  return {
    size,
    isResizing,
    startResize,
    setSize,
  };
};

export default ResizablePanel;
