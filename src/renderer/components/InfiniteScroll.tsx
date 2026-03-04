/**
 * DEX Infinite Scroll Component
 * Infinite scrolling with lazy loading
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

interface InfiniteScrollProps {
  loadMore: () => Promise<void>;
  hasMore: boolean;
  loading?: boolean;
  threshold?: number;
  useWindow?: boolean;
  loader?: React.ReactNode;
  endMessage?: React.ReactNode;
  children: React.ReactNode;
  reverse?: boolean;
  scrollableTarget?: string;
  pullToRefresh?: boolean;
  onRefresh?: () => Promise<void>;
}

interface VirtualScrollProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  height?: number | string;
  overscan?: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
}

interface LazyLoadProps {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  onVisible?: () => void;
}

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  pullIndicator?: React.ReactNode;
  refreshingIndicator?: React.ReactNode;
}

// ==================== INFINITE SCROLL ====================

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  loadMore,
  hasMore,
  loading = false,
  threshold = 200,
  useWindow = false,
  loader,
  endMessage,
  children,
  reverse = false,
  scrollableTarget,
  pullToRefresh = false,
  onRefresh,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);

  const handleLoadMore = useCallback(async () => {
    if (isLoading || loading || !hasMore) return;

    setIsLoading(true);
    try {
      await loadMore();
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, loading, hasMore, loadMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoading && !loading) {
          handleLoadMore();
        }
      },
      {
        root: useWindow ? null : containerRef.current,
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, isLoading, loading, threshold, useWindow, handleLoadMore]);

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!pullToRefresh || !onRefresh) return;
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pullToRefresh || !onRefresh) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0 && window.scrollY === 0) {
      setIsPulling(true);
      setPullDistance(Math.min(diff, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (!pullToRefresh || !onRefresh || !isPulling) return;

    if (pullDistance > 60) {
      setIsLoading(true);
      try {
        await onRefresh();
      } finally {
        setIsLoading(false);
      }
    }

    setIsPulling(false);
    setPullDistance(0);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    pullIndicator: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: pullDistance,
      overflow: 'hidden',
      transition: isPulling ? 'none' : 'height 0.2s',
    },
    loader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    spinner: {
      width: 20,
      height: 20,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    endMessage: {
      textAlign: 'center',
      padding: 20,
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    sentinel: {
      height: 1,
    },
  };

  const defaultLoader = (
    <div style={styles.loader}>
      <div style={styles.spinner} />
      <span>Loading...</span>
    </div>
  );

  const defaultEndMessage = (
    <div style={styles.endMessage}>
      No more items to load
    </div>
  );

  const content = (
    <>
      {reverse && !hasMore && (endMessage || defaultEndMessage)}
      {reverse && (isLoading || loading) && (loader || defaultLoader)}
      {reverse && <div ref={sentinelRef} style={styles.sentinel} />}

      {pullToRefresh && isPulling && (
        <div style={styles.pullIndicator}>
          {pullDistance > 60 ? '↻ Release to refresh' : 'arrow-down Pull to refresh'}
        </div>
      )}

      {children}

      {!reverse && <div ref={sentinelRef} style={styles.sentinel} />}
      {!reverse && (isLoading || loading) && (loader || defaultLoader)}
      {!reverse && !hasMore && (endMessage || defaultEndMessage)}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {content}
    </div>
  );
};

// ==================== VIRTUAL SCROLL ====================

export function VirtualScroll<T>({
  items,
  itemHeight,
  renderItem,
  height = 400,
  overscan = 5,
  onLoadMore,
  hasMore = false,
  loading = false,
}: VirtualScrollProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const totalHeight = items.length * itemHeight;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setContainerHeight(container.clientHeight);

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);

    // Check if we need to load more
    if (onLoadMore && hasMore && !loading) {
      const distanceFromEnd = totalHeight - (target.scrollTop + target.clientHeight);
      if (distanceFromEnd < 200) {
        onLoadMore();
      }
    }
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    visibleItems.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        }}
      >
        {renderItem(items[i], i)}
      </div>
    );
  }

  const styles: Record<string, React.CSSProperties> = {
    container: {
      height,
      overflow: 'auto',
    },
    content: {
      height: totalHeight,
      position: 'relative',
    },
    loader: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div ref={containerRef} style={styles.container} onScroll={handleScroll}>
      <div style={styles.content}>
        {visibleItems}
        {loading && (
          <div style={styles.loader}>Loading more...</div>
        )}
      </div>
    </div>
  );
}

// ==================== LAZY LOAD ====================

export const LazyLoad: React.FC<LazyLoadProps> = ({
  threshold = 0,
  rootMargin = '100px',
  triggerOnce = true,
  children,
  placeholder,
  onVisible,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible?.();

          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce, onVisible]);

  const defaultPlaceholder = (
    <div
      style={{
        background: 'var(--color-bg-tertiary)',
        minHeight: 100,
      }}
    />
  );

  return (
    <div ref={ref}>
      {isVisible ? children : (placeholder || defaultPlaceholder)}
    </div>
  );
};

// ==================== PULL TO REFRESH ====================

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  threshold = 80,
  pullIndicator,
  refreshingIndicator,
}) => {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY > 0 || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      e.preventDefault();
      setIsPulling(true);
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setIsPulling(false);
    setPullDistance(0);
  };

  const progress = Math.min(pullDistance / threshold, 1);

  const defaultPullIndicator = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 14,
      }}
    >
      {progress >= 1 ? '↻ Release to refresh' : 'arrow-down Pull to refresh'}
    </div>
  );

  const defaultRefreshingIndicator = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--color-text-muted)',
        fontSize: 14,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      Refreshing...
    </div>
  );

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      touchAction: isPulling ? 'none' : 'auto',
    },
    indicator: {
      height: pullDistance,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: isPulling || isRefreshing ? 'none' : 'height 0.2s ease',
    },
    content: {
      transform: `translateY(0)`,
    },
  };

  return (
    <div
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div style={styles.indicator}>
        {isRefreshing
          ? (refreshingIndicator || defaultRefreshingIndicator)
          : (pullIndicator || defaultPullIndicator)}
      </div>
      <div style={styles.content}>{children}</div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ==================== USE INFINITE SCROLL HOOK ====================

export const useInfiniteScroll = (
  loadMore: () => Promise<void>,
  options: {
    threshold?: number;
    initialLoading?: boolean;
  } = {}
) => {
  const { threshold = 200, initialLoading = false } = options;
  const [loading, setLoading] = useState(initialLoading);
  const [hasMore, setHasMore] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(async () => {
    const element = ref.current;
    if (!element || loading || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromEnd = scrollHeight - scrollTop - clientHeight;

    if (distanceFromEnd < threshold) {
      setLoading(true);
      try {
        await loadMore();
      } finally {
        setLoading(false);
      }
    }
  }, [loading, hasMore, threshold, loadMore]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    ref,
    loading,
    hasMore,
    setHasMore,
    setLoading,
  };
};

// ==================== USE INTERSECTION OBSERVER HOOK ====================

export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsIntersecting(entry.isIntersecting);
        setEntry(entry);
      },
      options
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [options]);

  return { ref, isIntersecting, entry };
};

export default InfiniteScroll;
