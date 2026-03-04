/**
 * DEX Skeleton Components
 * Loading placeholders and skeleton screens
 */

import React from 'react';

// ==================== TYPES ====================

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  animation?: 'pulse' | 'wave' | 'none';
  style?: React.CSSProperties;
}

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  spacing?: number;
  lastLineWidth?: string;
  animation?: 'pulse' | 'wave' | 'none';
}

interface SkeletonAvatarProps {
  size?: number | 'sm' | 'md' | 'lg';
  animation?: 'pulse' | 'wave' | 'none';
}

interface SkeletonCardProps {
  hasImage?: boolean;
  imageHeight?: number;
  lines?: number;
  hasAction?: boolean;
  animation?: 'pulse' | 'wave' | 'none';
}

interface SkeletonListProps {
  items?: number;
  hasAvatar?: boolean;
  lines?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  hasHeader?: boolean;
  animation?: 'pulse' | 'wave' | 'none';
}

// ==================== KEYFRAMES ====================

const keyframes = `
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  
  @keyframes skeleton-wave {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

// ==================== SKELETON ====================

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  variant = 'text',
  animation = 'pulse',
  style,
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'circular':
        return {
          borderRadius: '50%',
          width: typeof width === 'number' ? width : height,
          height: typeof height === 'number' ? height : width,
        };
      case 'rectangular':
        return { borderRadius: 0 };
      case 'rounded':
        return { borderRadius: 8 };
      case 'text':
      default:
        return { borderRadius: 4 };
    }
  };

  const getAnimationStyles = (): React.CSSProperties => {
    switch (animation) {
      case 'pulse':
        return { animation: 'skeleton-pulse 1.5s ease-in-out infinite' };
      case 'wave':
        return { position: 'relative', overflow: 'hidden' };
      default:
        return {};
    }
  };

  const styles: React.CSSProperties = {
    display: 'block',
    background: 'var(--color-bg-tertiary)',
    width,
    height,
    ...getVariantStyles(),
    ...getAnimationStyles(),
    ...style,
  };

  return (
    <>
      <style>{keyframes}</style>
      <span style={styles}>
        {animation === 'wave' && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
              animation: 'skeleton-wave 1.5s ease-in-out infinite',
            }}
          />
        )}
      </span>
    </>
  );
};

// ==================== SKELETON TEXT ====================

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lineHeight = 16,
  spacing = 8,
  lastLineWidth = '60%',
  animation = 'pulse',
}) => {
  const styles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing,
  };

  return (
    <div style={styles}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          animation={animation}
        />
      ))}
    </div>
  );
};

// ==================== SKELETON AVATAR ====================

export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({
  size = 'md',
  animation = 'pulse',
}) => {
  const sizeMap = {
    sm: 32,
    md: 40,
    lg: 56,
  };

  const pixelSize = typeof size === 'number' ? size : sizeMap[size];

  return (
    <Skeleton
      variant="circular"
      width={pixelSize}
      height={pixelSize}
      animation={animation}
    />
  );
};

// ==================== SKELETON CARD ====================

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  hasImage = true,
  imageHeight = 160,
  lines = 3,
  hasAction = true,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    card: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--color-border)',
    },
    content: {
      padding: 16,
    },
    title: {
      marginBottom: 12,
    },
    actions: {
      display: 'flex',
      gap: 8,
      marginTop: 16,
    },
  };

  return (
    <div style={styles.card}>
      {hasImage && (
        <Skeleton
          height={imageHeight}
          variant="rectangular"
          animation={animation}
        />
      )}
      <div style={styles.content}>
        <div style={styles.title}>
          <Skeleton height={24} width="70%" animation={animation} />
        </div>
        <SkeletonText lines={lines} animation={animation} />
        {hasAction && (
          <div style={styles.actions}>
            <Skeleton
              height={36}
              width={100}
              variant="rounded"
              animation={animation}
            />
            <Skeleton
              height={36}
              width={80}
              variant="rounded"
              animation={animation}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== SKELETON LIST ====================

export const SkeletonList: React.FC<SkeletonListProps> = ({
  items = 5,
  hasAvatar = true,
  lines = 2,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
    },
    item: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid var(--color-border)',
    },
    content: {
      flex: 1,
    },
  };

  return (
    <div style={styles.container}>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} style={styles.item}>
          {hasAvatar && <SkeletonAvatar animation={animation} />}
          <div style={styles.content}>
            <Skeleton
              height={18}
              width="40%"
              animation={animation}
              style={{ marginBottom: 8 }}
            />
            <SkeletonText
              lines={lines}
              lineHeight={14}
              spacing={6}
              animation={animation}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== SKELETON TABLE ====================

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  hasHeader = true,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: '100%',
    },
    row: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 16,
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border)',
    },
    headerRow: {
      background: 'var(--color-bg-secondary)',
    },
  };

  return (
    <div style={styles.container}>
      {hasHeader && (
        <div style={{ ...styles.row, ...styles.headerRow }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={`header-${index}`}
              height={16}
              width={`${60 + Math.random() * 30}%`}
              animation={animation}
            />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} style={styles.row}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              height={14}
              width={`${40 + Math.random() * 50}%`}
              animation={animation}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// ==================== SKELETON PROFILE ====================

interface SkeletonProfileProps {
  showCover?: boolean;
  showStats?: boolean;
  animation?: 'pulse' | 'wave' | 'none';
}

export const SkeletonProfile: React.FC<SkeletonProfileProps> = ({
  showCover = true,
  showStats = true,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--color-border)',
    },
    cover: {
      height: 120,
    },
    profile: {
      padding: 16,
      marginTop: -40,
    },
    avatar: {
      border: '4px solid var(--color-bg-secondary)',
      borderRadius: '50%',
      marginBottom: 12,
    },
    info: {
      marginTop: 12,
    },
    stats: {
      display: 'flex',
      gap: 24,
      marginTop: 16,
      paddingTop: 16,
      borderTop: '1px solid var(--color-border)',
    },
    stat: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
  };

  return (
    <div style={styles.container}>
      {showCover && (
        <Skeleton
          height={120}
          variant="rectangular"
          animation={animation}
        />
      )}
      <div style={styles.profile}>
        <div style={styles.avatar}>
          <SkeletonAvatar size={80} animation={animation} />
        </div>
        <div style={styles.info}>
          <Skeleton height={24} width="40%" animation={animation} />
          <Skeleton
            height={14}
            width="25%"
            animation={animation}
            style={{ marginTop: 8 }}
          />
          <Skeleton
            height={14}
            width="60%"
            animation={animation}
            style={{ marginTop: 12 }}
          />
        </div>
        {showStats && (
          <div style={styles.stats}>
            {[1, 2, 3].map(i => (
              <div key={i} style={styles.stat}>
                <Skeleton height={20} width={40} animation={animation} />
                <Skeleton height={12} width={60} animation={animation} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== SKELETON ARTICLE ====================

interface SkeletonArticleProps {
  hasImage?: boolean;
  paragraphs?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const SkeletonArticle: React.FC<SkeletonArticleProps> = ({
  hasImage = true,
  paragraphs = 3,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: 720,
    },
    header: {
      marginBottom: 24,
    },
    image: {
      marginBottom: 24,
    },
    paragraph: {
      marginBottom: 20,
    },
  };

  return (
    <article style={styles.container}>
      <div style={styles.header}>
        <Skeleton height={36} width="80%" animation={animation} />
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <SkeletonAvatar size="sm" animation={animation} />
          <div style={{ flex: 1 }}>
            <Skeleton height={14} width={120} animation={animation} />
            <Skeleton
              height={12}
              width={80}
              animation={animation}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      </div>

      {hasImage && (
        <div style={styles.image}>
          <Skeleton height={400} variant="rounded" animation={animation} />
        </div>
      )}

      {Array.from({ length: paragraphs }).map((_, index) => (
        <div key={index} style={styles.paragraph}>
          <SkeletonText
            lines={4 + Math.floor(Math.random() * 3)}
            animation={animation}
          />
        </div>
      ))}
    </article>
  );
};

// ==================== SKELETON SIDEBAR ====================

interface SkeletonSidebarProps {
  sections?: number;
  itemsPerSection?: number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const SkeletonSidebar: React.FC<SkeletonSidebarProps> = ({
  sections = 3,
  itemsPerSection = 4,
  animation = 'pulse',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: 240,
      padding: 16,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      marginBottom: 12,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Skeleton
          variant="circular"
          width={36}
          height={36}
          animation={animation}
        />
        <Skeleton height={18} width={120} animation={animation} />
      </div>

      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <div key={sectionIndex} style={styles.section}>
          <div style={styles.sectionTitle}>
            <Skeleton height={12} width={80} animation={animation} />
          </div>
          {Array.from({ length: itemsPerSection }).map((_, itemIndex) => (
            <div key={itemIndex} style={styles.item}>
              <Skeleton
                variant="rounded"
                width={20}
                height={20}
                animation={animation}
              />
              <Skeleton
                height={14}
                width={`${50 + Math.random() * 40}%`}
                animation={animation}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
