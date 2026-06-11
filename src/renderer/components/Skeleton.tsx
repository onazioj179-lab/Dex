// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Skeleton Components
// Phase C: Optimistic UI (Items 136-150)
// Show something immediately - skeleton placeholders matching content layout
// =============================================================================

import React, { CSSProperties, useMemo } from 'react';

// ---------------------------------------------------------------------------
// 136-140. Skeleton Base
// ---------------------------------------------------------------------------

interface SkeletonBaseProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  animate?: boolean;
  style?: CSSProperties;
  className?: string;
}

const shimmerKeyframes = `
@keyframes dex-skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

// Inject shimmer styles once
if (typeof document !== 'undefined' && !document.getElementById('dex-skeleton-styles')) {
  const style = document.createElement('style');
  style.id = 'dex-skeleton-styles';
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
}

export const SkeletonBase: React.FC<SkeletonBaseProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  animate = true,
  style,
  className,
}) => {
  const baseStyle: CSSProperties = useMemo(() => ({
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    background: animate
      ? 'linear-gradient(90deg, var(--color-bg-tertiary, #2a2a2a) 25%, var(--color-bg-secondary, #3a3a3a) 50%, var(--color-bg-tertiary, #2a2a2a) 75%)'
      : 'var(--color-bg-tertiary, #2a2a2a)',
    backgroundSize: animate ? '200% 100%' : undefined,
    animation: animate ? 'dex-skeleton-shimmer 1.5s ease-in-out infinite' : undefined,
    ...style,
  }), [width, height, borderRadius, animate, style]);

  return <div className={className} style={baseStyle} />;
};

// ---------------------------------------------------------------------------
// 141-142. Text Skeleton
// ---------------------------------------------------------------------------

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: string;
  animate?: boolean;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  lastLineWidth = '60%',
  animate = true,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          animate={animate}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 143. Image/Avatar Skeleton
// ---------------------------------------------------------------------------

interface SkeletonImageProps {
  width?: number;
  height?: number;
  circle?: boolean;
  animate?: boolean;
}

export const SkeletonImage: React.FC<SkeletonImageProps> = ({
  width = 100,
  height = 100,
  circle = false,
  animate = true,
}) => {
  return (
    <SkeletonBase
      width={width}
      height={height}
      borderRadius={circle ? '50%' : 8}
      animate={animate}
    />
  );
};

export const SkeletonAvatar: React.FC<{ size?: number; animate?: boolean }> = ({
  size = 40,
  animate = true,
}) => <SkeletonImage width={size} height={size} circle animate={animate} />;

// ---------------------------------------------------------------------------
// 144. Icon Skeleton
// ---------------------------------------------------------------------------

export const SkeletonIcon: React.FC<{ size?: number; animate?: boolean }> = ({
  size = 24,
  animate = true,
}) => (
  <SkeletonBase
    width={size}
    height={size}
    borderRadius={4}
    animate={animate}
  />
);

// ---------------------------------------------------------------------------
// 145-146. Card Skeleton
// ---------------------------------------------------------------------------

interface SkeletonCardProps {
  imageHeight?: number;
  titleLines?: number;
  descriptionLines?: number;
  showImage?: boolean;
  showAvatar?: boolean;
  animate?: boolean;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  imageHeight = 180,
  titleLines = 1,
  descriptionLines = 2,
  showImage = true,
  showAvatar = false,
  animate = true,
}) => {
  return (
    <div style={{
      background: 'var(--color-bg-secondary, #1a1a1a)',
      borderRadius: 10,
      overflow: 'hidden',
      padding: showImage ? 0 : 16,
    }}>
      {showImage && (
        <SkeletonBase
          width="100%"
          height={imageHeight}
          borderRadius={0}
          animate={animate}
        />
      )}
      <div style={{ padding: 16 }}>
        {showAvatar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <SkeletonAvatar size={36} animate={animate} />
            <SkeletonBase width={120} height={12} animate={animate} />
          </div>
        )}
        <SkeletonText lines={titleLines} lineHeight={18} gap={4} animate={animate} />
        <div style={{ marginTop: 12 }}>
          <SkeletonText lines={descriptionLines} lineHeight={12} gap={6} animate={animate} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 147. List Item Skeleton
// ---------------------------------------------------------------------------

interface SkeletonListItemProps {
  showAvatar?: boolean;
  avatarSize?: number;
  titleWidth?: string;
  subtitleWidth?: string;
  showAction?: boolean;
  animate?: boolean;
}

export const SkeletonListItem: React.FC<SkeletonListItemProps> = ({
  showAvatar = true,
  avatarSize = 40,
  titleWidth = '70%',
  subtitleWidth = '50%',
  showAction = false,
  animate = true,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
    }}>
      {showAvatar && <SkeletonAvatar size={avatarSize} animate={animate} />}
      <div style={{ flex: 1 }}>
        <SkeletonBase width={titleWidth} height={14} animate={animate} />
        <div style={{ marginTop: 6 }}>
          <SkeletonBase width={subtitleWidth} height={11} animate={animate} />
        </div>
      </div>
      {showAction && <SkeletonIcon size={20} animate={animate} />}
    </div>
  );
};

export const SkeletonList: React.FC<{ count?: number; animate?: boolean }> = ({
  count = 5,
  animate = true,
}) => (
  <div>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonListItem key={i} animate={animate} />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// 148. Grid Skeleton
// ---------------------------------------------------------------------------

interface SkeletonGridProps {
  columns?: number;
  count?: number;
  gap?: number;
  itemHeight?: number;
  animate?: boolean;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  columns = 3,
  count = 6,
  gap = 16,
  itemHeight = 120,
  animate = true,
}) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBase
          key={i}
          height={itemHeight}
          borderRadius={8}
          animate={animate}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 149. Table Skeleton
// ---------------------------------------------------------------------------

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  animate?: boolean;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  showHeader = true,
  animate = true,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      {showHeader && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 12,
          padding: '12px 16px',
          background: 'var(--color-bg-secondary, #1a1a1a)',
          borderRadius: '6px 6px 0 0',
        }}>
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonBase key={i} height={12} animate={animate} />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 12,
            padding: '12px 16px',
            background: 'var(--color-bg-primary, #0a0a0a)',
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonBase
              key={colIndex}
              height={14}
              width={colIndex === 0 ? '80%' : '60%'}
              animate={animate}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 150. Composite Page Skeletons
// ---------------------------------------------------------------------------

export const SkeletonPage: React.FC<{ variant?: 'list' | 'grid' | 'detail'; animate?: boolean }> = ({
  variant = 'list',
  animate = true,
}) => {
  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <SkeletonBase width={200} height={28} animate={animate} />
        <div style={{ marginTop: 8 }}>
          <SkeletonBase width={300} height={14} animate={animate} />
        </div>
      </div>

      {/* Content */}
      {variant === 'list' && <SkeletonList count={8} animate={animate} />}
      {variant === 'grid' && <SkeletonGrid columns={4} count={8} animate={animate} />}
      {variant === 'detail' && (
        <div style={{ display: 'flex', gap: 24 }}>
          <SkeletonImage width={300} height={300} animate={animate} />
          <div style={{ flex: 1 }}>
            <SkeletonBase width="60%" height={32} animate={animate} />
            <div style={{ marginTop: 16 }}>
              <SkeletonText lines={5} animate={animate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Files app skeleton
export const SkeletonFilesGrid: React.FC<{ count?: number }> = ({ count = 12 }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 16,
    padding: 16,
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <SkeletonBase width={64} height={64} borderRadius={8} />
        <SkeletonBase width={80} height={12} />
      </div>
    ))}
  </div>
);

// Browser tab skeleton
export const SkeletonBrowserTab: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
    <SkeletonIcon size={16} />
    <SkeletonBase width={100} height={12} />
  </div>
);

// Notes skeleton
export const SkeletonNote: React.FC = () => (
  <div style={{ padding: 24 }}>
    <SkeletonBase width="40%" height={24} style={{ marginBottom: 16 }} />
    <SkeletonText lines={8} lineHeight={16} gap={12} />
  </div>
);

// ---------------------------------------------------------------------------
// Export all
// ---------------------------------------------------------------------------

export {
  SkeletonBase as Skeleton,
};

export default SkeletonBase;
