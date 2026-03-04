/**
 * DEX Loading Skeletons & Empty States
 * Consistent loading and empty state components
 */

import React from 'react';

// ==================== SKELETON BASE ====================

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  style,
}) => {
  const baseStyles: React.CSSProperties = {
    width,
    height,
    borderRadius,
    background: 'linear-gradient(90deg, var(--color-bg-glass) 25%, var(--color-bg-secondary) 50%, var(--color-bg-glass) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    ...style,
  };

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div style={baseStyles} />
    </>
  );
};

// ==================== SKELETON PRESETS ====================

interface SkeletonTextProps {
  lines?: number;
  lastLineWidth?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = '60%',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          height={14}
        />
      ))}
    </div>
  );
};

interface SkeletonAvatarProps {
  size?: number;
}

export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({ size = 40 }) => {
  return <Skeleton width={size} height={size} borderRadius="50%" />;
};

interface SkeletonCardProps {
  hasImage?: boolean;
  lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  hasImage = false,
  lines = 3,
}) => {
  const styles: React.CSSProperties = {
    padding: 16,
    background: 'var(--color-bg-secondary)',
    borderRadius: 12,
    border: '1px solid var(--color-border)',
  };

  return (
    <div style={styles}>
      {hasImage && (
        <Skeleton height={120} borderRadius={8} style={{ marginBottom: 12 }} />
      )}
      <Skeleton width="70%" height={18} style={{ marginBottom: 12 }} />
      <SkeletonText lines={lines} />
    </div>
  );
};

interface SkeletonListProps {
  count?: number;
  hasAvatar?: boolean;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 5,
  hasAvatar = true,
}) => {
  const itemStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={itemStyles}>
          {hasAvatar && <SkeletonAvatar size={36} />}
          <div style={{ flex: 1 }}>
            <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={12} />
          </div>
          <Skeleton width={60} height={24} borderRadius={6} />
        </div>
      ))}
    </div>
  );
};

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
}) => {
  const headerStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 16,
    padding: '12px 16px',
    background: 'var(--color-bg-secondary)',
    borderRadius: '8px 8px 0 0',
  };

  const rowStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 16,
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      <div style={headerStyles}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} width="60%" height={12} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={rowStyles}>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} width={j === 0 ? '80%' : '50%'} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
};

interface SkeletonGridProps {
  count?: number;
  columns?: number;
  hasImage?: boolean;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
  count = 6,
  columns = 3,
  hasImage = true,
}) => {
  const gridStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 16,
  };

  return (
    <div style={gridStyles}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} hasImage={hasImage} lines={2} />
      ))}
    </div>
  );
};

// ==================== APP-SPECIFIC SKELETONS ====================

export const SkeletonFileList: React.FC = () => {
  const itemStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={itemStyles}>
          <Skeleton width={32} height={32} borderRadius={6} />
          <div style={{ flex: 1 }}>
            <Skeleton width={`${60 + Math.random() * 30}%`} height={14} />
          </div>
          <Skeleton width={60} height={12} />
          <Skeleton width={80} height={12} />
        </div>
      ))}
    </div>
  );
};

export const SkeletonNoteList: React.FC = () => {
  const itemStyles: React.CSSProperties = {
    padding: 12,
    borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={itemStyles}>
          <Skeleton width="70%" height={16} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={12} style={{ marginBottom: 4 }} />
          <Skeleton width="80%" height={12} style={{ marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width={60} height={18} borderRadius={4} />
            <Skeleton width={80} height={18} borderRadius={4} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const SkeletonTaskList: React.FC = () => {
  const itemStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border)',
  };

  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={itemStyles}>
          <Skeleton width={20} height={20} borderRadius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width={`${50 + Math.random() * 40}%`} height={14} style={{ marginBottom: 6 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Skeleton width={50} height={16} borderRadius={4} />
              <Skeleton width={70} height={16} borderRadius={4} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const SkeletonGallery: React.FC = () => {
  const gridStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 8,
  };

  return (
    <div style={gridStyles}>
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton 
          key={i} 
          height={150} 
          borderRadius={8}
          style={{ aspectRatio: '1' }}
        />
      ))}
    </div>
  );
};

export const SkeletonMusicList: React.FC = () => {
  const itemStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    borderRadius: 8,
  };

  return (
    <div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={itemStyles}>
          <Skeleton width={24} height={14} />
          <Skeleton width={44} height={44} borderRadius={6} />
          <div style={{ flex: 1 }}>
            <Skeleton width="50%" height={14} style={{ marginBottom: 4 }} />
            <Skeleton width="30%" height={12} />
          </div>
          <Skeleton width={40} height={12} />
        </div>
      ))}
    </div>
  );
};

// ==================== EMPTY STATES ====================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const defaultIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" />
  </svg>
);

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = defaultIcon,
  title,
  description,
  action,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
    },
    icon: {
      width: 64,
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      borderRadius: '50%',
      marginBottom: 16,
      color: 'var(--color-text-muted)',
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
      marginBottom: 8,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      maxWidth: 280,
      lineHeight: 1.5,
      marginBottom: action ? 20 : 0,
    },
    button: {
      padding: '10px 20px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
      transition: 'transform 0.15s, opacity 0.15s',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>{icon}</div>
      <h3 style={styles.title}>{title}</h3>
      {description && <p style={styles.description}>{description}</p>}
      {action && (
        <button 
          style={styles.button} 
          onClick={action.onClick}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// ==================== PRESET EMPTY STATES ====================

const EmptyIcons = {
  files: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  tasks: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  gallery: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  music: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  video: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  search: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  error: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

interface PresetEmptyStateProps {
  onAction?: () => void;
}

export const EmptyFiles: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: 'var(--color-text-muted)' }}>{EmptyIcons.files}</span>}
    title="No files yet"
    description="Add files to get started. You can drag and drop files or use the upload button."
    action={onAction ? { label: 'Add Files', onClick: onAction } : undefined}
  />
);

export const EmptyNotes: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: '#ff9500' }}>{EmptyIcons.notes}</span>}
    title="No notes yet"
    description="Create your first note to start organizing your thoughts and ideas."
    action={onAction ? { label: 'Create Note', onClick: onAction } : undefined}
  />
);

export const EmptyTasks: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: '#34c759' }}>{EmptyIcons.tasks}</span>}
    title="All caught up!"
    description="You have no tasks. Add a new task to stay organized and productive."
    action={onAction ? { label: 'Add Task', onClick: onAction } : undefined}
  />
);

export const EmptyGallery: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: '#af52de' }}>{EmptyIcons.gallery}</span>}
    title="No photos or videos"
    description="Import your media files to view them here."
    action={onAction ? { label: 'Import Media', onClick: onAction } : undefined}
  />
);

export const EmptyMusic: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: '#ff2d55' }}>{EmptyIcons.music}</span>}
    title="No music found"
    description="Add music files to your library to start listening."
    action={onAction ? { label: 'Add Music', onClick: onAction } : undefined}
  />
);

export const EmptyVideo: React.FC<PresetEmptyStateProps> = ({ onAction }) => (
  <EmptyState
    icon={<span style={{ color: '#5ac8fa' }}>{EmptyIcons.video}</span>}
    title="No videos"
    description="Add video files to your library to start watching."
    action={onAction ? { label: 'Add Videos', onClick: onAction } : undefined}
  />
);

export const EmptySearch: React.FC<{ query?: string }> = ({ query }) => (
  <EmptyState
    icon={<span style={{ color: 'var(--color-text-muted)' }}>{EmptyIcons.search}</span>}
    title="No results found"
    description={query ? `No results for "${query}". Try a different search term.` : 'Try searching for something.'}
  />
);

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({ 
  message = 'Something went wrong', 
  onRetry 
}) => (
  <EmptyState
    icon={<span style={{ color: '#ff3b30' }}>{EmptyIcons.error}</span>}
    title="Oops!"
    description={message}
    action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
  />
);

export default Skeleton;
