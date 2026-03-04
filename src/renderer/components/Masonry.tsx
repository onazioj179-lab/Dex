/**
 * DEX Masonry Layout Component
 * Pinterest-style masonry grid
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface MasonryProps {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  columnWidth?: number;
}

interface MasonryItemProps {
  children: React.ReactNode;
  span?: number;
}

interface WaterfallProps {
  items: WaterfallItem[];
  columns?: number;
  gap?: number;
  renderItem: (item: WaterfallItem, index: number) => React.ReactNode;
  loadMore?: () => void;
  hasMore?: boolean;
}

interface WaterfallItem {
  id: string;
  height?: number;
  [key: string]: unknown;
}

interface ResponsiveMasonryProps {
  children: React.ReactNode;
  breakpoints?: Record<number, number>; // { 640: 1, 768: 2, 1024: 3, 1280: 4 }
  gap?: number;
}

interface ImageMasonryProps {
  images: {
    src: string;
    alt?: string;
    width: number;
    height: number;
  }[];
  columns?: number;
  gap?: number;
  onImageClick?: (index: number) => void;
}

// ==================== MASONRY ====================

export const Masonry: React.FC<MasonryProps> = ({
  children,
  columns = 3,
  gap = 16,
  columnWidth,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(columns);

  useEffect(() => {
    if (!columnWidth || !containerRef.current) {
      setColumnCount(columns);
      return;
    }

    const updateColumns = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const newColumnCount = Math.max(1, Math.floor(containerWidth / columnWidth));
        setColumnCount(newColumnCount);
      }
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(updateColumns);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [columns, columnWidth]);

  // Distribute children into columns
  const columnArrays = useMemo(() => {
    const cols: React.ReactNode[][] = Array.from({ length: columnCount }, () => []);
    const childArray = React.Children.toArray(children);

    childArray.forEach((child, index) => {
      cols[index % columnCount].push(child);
    });

    return cols;
  }, [children, columnCount]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap,
    },
    column: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap,
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {columnArrays.map((columnItems, columnIndex) => (
        <div key={columnIndex} style={styles.column as any}>
          {columnItems}
        </div>
      ))}
    </div>
  );
};

// ==================== MASONRY ITEM ====================

export const MasonryItem: React.FC<MasonryItemProps> = ({
  children,
  span = 1,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    item: {
      gridColumn: `span ${span}`,
    },
  };

  return <div style={styles.item}>{children}</div>;
};

// ==================== WATERFALL ====================

export const Waterfall: React.FC<WaterfallProps> = ({
  items,
  columns = 3,
  gap = 16,
  renderItem,
  loadMore,
  hasMore = false,
}) => {
  const [columnHeights, setColumnHeights] = useState<number[]>(
    Array(columns).fill(0)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    // Reset column heights when columns change
    setColumnHeights(Array(columns).fill(0));
  }, [columns]);

  const getShortestColumn = (): number => {
    return columnHeights.indexOf(Math.min(...columnHeights));
  };

  const getItemPosition = useCallback((index: number) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { column, row };
  }, [columns]);

  // Handle infinite scroll
  useEffect(() => {
    if (!loadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById('waterfall-sentinel');
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  // Distribute items into columns
  const columnItems = useMemo(() => {
    const cols: typeof items[] = Array.from({ length: columns }, () => []);

    items.forEach((item, index) => {
      cols[index % columns].push(item);
    });

    return cols;
  }, [items, columns]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap,
    },
    column: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap,
    },
    item: {
      width: '100%',
    },
    sentinel: {
      height: 1,
      width: '100%',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {columnItems.map((colItems, colIndex) => (
        <div key={colIndex} style={styles.column as any}>
          {colItems.map((item, index) => (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
              }}
              style={styles.item}
            >
              {renderItem(item, colIndex * columnItems[0].length + index)}
            </div>
          ))}
        </div>
      ))}

      {hasMore && <div id="waterfall-sentinel" style={styles.sentinel} />}
    </div>
  );
};

// ==================== RESPONSIVE MASONRY ====================

export const ResponsiveMasonry: React.FC<ResponsiveMasonryProps> = ({
  children,
  breakpoints = { 640: 1, 768: 2, 1024: 3, 1280: 4 },
  gap = 16,
}) => {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      const sortedBreakpoints = Object.entries(breakpoints)
        .map(([bp, cols]) => ({ bp: Number(bp), cols }))
        .sort((a, b) => b.bp - a.bp);

      for (const { bp, cols } of sortedBreakpoints) {
        if (width >= bp) {
          setColumns(cols);
          return;
        }
      }

      setColumns(1);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [breakpoints]);

  return (
    <Masonry columns={columns} gap={gap}>
      {children}
    </Masonry>
  );
};

// ==================== IMAGE MASONRY ====================

export const ImageMasonry: React.FC<ImageMasonryProps> = ({
  images,
  columns = 3,
  gap = 16,
  onImageClick,
}) => {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set(prev).add(index));
  };

  // Distribute images into columns based on aspect ratio
  const columnItems = useMemo(() => {
    const cols: (typeof images[0] & { index: number })[][] = Array.from(
      { length: columns },
      () => []
    );
    const heights = Array(columns).fill(0);

    images.forEach((image, index) => {
      const aspectRatio = image.height / image.width;
      const shortestCol = heights.indexOf(Math.min(...heights));

      cols[shortestCol].push({ ...image, index });
      heights[shortestCol] += aspectRatio;
    });

    return cols;
  }, [images, columns]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap,
    },
    column: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap,
    },
    imageWrapper: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 8,
      cursor: onImageClick ? 'pointer' : 'default',
    },
    image: {
      width: '100%',
      height: 'auto',
      display: 'block',
      transition: 'transform 0.3s, opacity 0.3s',
    },
    imagePending: {
      opacity: 0,
    },
    imageLoaded: {
      opacity: 1,
    },
    skeleton: {
      position: 'absolute',
      inset: 0,
      background: 'var(--color-bg-tertiary)',
      animation: 'pulse 1.5s infinite',
    },
  };

  return (
    <div style={styles.container}>
      {columnItems.map((colImages, colIndex) => (
        <div key={colIndex} style={styles.column as any}>
          {colImages.map((image) => {
            const isLoaded = loadedImages.has(image.index);
            const aspectRatio = (image.height / image.width) * 100;

            return (
              <div
                key={image.index}
                style={{
                  ...styles.imageWrapper,
                  paddingBottom: `${aspectRatio}%`,
                }}
                onClick={() => onImageClick?.(image.index)}
              >
                {!isLoaded && <div style={styles.skeleton} />}
                <img
                  src={image.src}
                  alt={image.alt || ''}
                  style={{
                    ...styles.image,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    ...(isLoaded ? styles.imageLoaded : styles.imagePending),
                  }}
                  onLoad={() => handleImageLoad(image.index)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ==================== CSS GRID MASONRY ====================

interface GridMasonryProps {
  children: React.ReactNode;
  columnWidth?: number;
  gap?: number;
}

export const GridMasonry: React.FC<GridMasonryProps> = ({
  children,
  columnWidth = 250,
  gap = 16,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${columnWidth}px, 1fr))`,
      gap,
      gridAutoRows: gap,
    },
  };

  return (
    <div style={styles.container}>
      {React.Children.map(children, (child, index) => (
        <div
          key={index}
          style={{
            gridRowEnd: 'span 10', // Approximate, would need JS for exact height
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

// ==================== CARD MASONRY ====================

interface CardMasonryProps {
  cards: {
    id: string;
    title: string;
    description?: string;
    image?: string;
    tags?: string[];
    meta?: string;
    onClick?: () => void;
  }[];
  columns?: number;
  gap?: number;
}

export const CardMasonry: React.FC<CardMasonryProps> = ({
  cards,
  columns = 3,
  gap = 16,
}) => {
  const columnItems = useMemo(() => {
    const cols: typeof cards[] = Array.from({ length: columns }, () => []);

    cards.forEach((card, index) => {
      cols[index % columns].push(card);
    });

    return cols;
  }, [cards, columns]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap,
    },
    column: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap,
    },
    card: {
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
    },
    cardImage: {
      width: '100%',
      height: 'auto',
      display: 'block',
    },
    cardContent: {
      padding: 16,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    cardDescription: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      lineHeight: 1.5,
      marginBottom: 12,
    },
    cardTags: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    cardTag: {
      padding: '2px 8px',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 4,
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    cardMeta: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {columnItems.map((colCards, colIndex) => (
        <div key={colIndex} style={styles.column as any}>
          {colCards.map((card) => (
            <div
              key={card.id}
              style={styles.card}
              onClick={card.onClick}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'none';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              {card.image && (
                <img src={card.image} alt={card.title} style={styles.cardImage} />
              )}
              <div style={styles.cardContent}>
                <div style={styles.cardTitle}>{card.title}</div>
                {card.description && (
                  <div style={styles.cardDescription}>{card.description}</div>
                )}
                {card.tags && card.tags.length > 0 && (
                  <div style={styles.cardTags}>
                    {card.tags.map((tag, i) => (
                      <span key={i} style={styles.cardTag}>{tag}</span>
                    ))}
                  </div>
                )}
                {card.meta && <div style={styles.cardMeta}>{card.meta}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Masonry;
