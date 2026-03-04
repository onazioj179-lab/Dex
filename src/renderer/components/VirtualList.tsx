    /**
 * VIRTUAL LIST - Efficient rendering for large lists
 * Only renders visible items for smooth scrolling
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// ======================================================================
// TYPES
// ======================================================================

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  onScroll?: (scrollTop: number) => void;
  emptyMessage?: string;
}

// ======================================================================
// COMPONENT
// ======================================================================

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 3,
  className,
  style,
  onScroll,
  emptyMessage = 'No items',
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);
  }, [onScroll]);

  // Calculate visible range
  const { startIndex, endIndex, visibleItems, offsetY } = useMemo(() => {
    const totalHeight = items.length * itemHeight;
    
    // Calculate which items are visible
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const end = Math.min(items.length - 1, start + visibleCount);
    
    // Get visible items
    const visible = items.slice(start, end + 1);
    
    // Calculate offset for positioning
    const offset = start * itemHeight;
    
    return {
      startIndex: start,
      endIndex: end,
      visibleItems: visible,
      offsetY: offset,
      totalHeight,
    };
  }, [items, itemHeight, scrollTop, containerHeight, overscan]);

  // Total scrollable height
  const totalHeight = items.length * itemHeight;

  if (items.length === 0) {
    return (
      <div 
        style={{ 
          ...defaultStyles.container, 
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '14px',
        }} 
        className={className}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ ...defaultStyles.container, ...style }}
      className={className}
    >
      {/* Spacer for total scroll height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Positioned container for visible items */}
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ======================================================================
// STYLES
// ======================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    overflow: 'auto',
    height: '100%',
    width: '100%',
  },
};

// ======================================================================
// HOOK VERSION - For custom implementations
// ======================================================================

interface UseVirtualListOptions<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  scrollTop: number;
  overscan?: number;
}

interface UseVirtualListResult<T> {
  visibleItems: T[];
  totalHeight: number;
  offsetY: number;
  startIndex: number;
  endIndex: number;
}

export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  scrollTop,
  overscan = 3,
}: UseVirtualListOptions<T>): UseVirtualListResult<T> {
  return useMemo(() => {
    const totalHeight = items.length * itemHeight;
    
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const end = Math.min(items.length - 1, start + visibleCount);
    
    const visible = items.slice(start, end + 1);
    const offset = start * itemHeight;
    
    return {
      visibleItems: visible,
      totalHeight,
      offsetY: offset,
      startIndex: start,
      endIndex: end,
    };
  }, [items, itemHeight, scrollTop, containerHeight, overscan]);
}

export default VirtualList;
