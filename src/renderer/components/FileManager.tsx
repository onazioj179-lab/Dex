/**
 * DEX File Manager Components
 * File browser and management
 */

import React, { useState, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  extension?: string;
  path: string;
  modifiedAt?: Date;
  createdAt?: Date;
  icon?: string;
  children?: FileItem[];
}

interface FileBrowserProps {
  files: FileItem[];
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onFileClick?: (file: FileItem) => void;
  onFileDoubleClick?: (file: FileItem) => void;
  onFileSelect?: (files: FileItem[]) => void;
  onContextMenu?: (file: FileItem, event: React.MouseEvent) => void;
  view?: 'list' | 'grid' | 'tiles';
  sortBy?: 'name' | 'size' | 'date' | 'type';
  sortOrder?: 'asc' | 'desc';
  showHidden?: boolean;
  multiSelect?: boolean;
}

interface BreadcrumbPath {
  name: string;
  path: string;
}

// ==================== HELPERS ====================

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getFileIcon = (file: FileItem): string => {
  if (file.icon) return file.icon;
  if (file.type === 'folder') return 'folder';

  const ext = file.extension?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'book';
    case 'doc':
    case 'docx': return 'book';
    case 'xls':
    case 'xlsx': return 'book';
    case 'ppt':
    case 'pptx': return 'book';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp': return 'image';
    case 'mp3':
    case 'wav':
    case 'ogg': return 'music';
    case 'mp4':
    case 'avi':
    case 'mkv':
    case 'mov': return 'film';
    case 'zip':
    case 'rar':
    case '7z': return 'archive';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx': return 'scroll';
    case 'html':
    case 'css': return 'globe';
    case 'json':
    case 'yaml':
    case 'yml': return 'settings';
    case 'md': return 'file-text';
    case 'txt': return 'file';
    default: return 'file';
  }
};

const parsePath = (path: string): BreadcrumbPath[] => {
  const parts = path.split('/').filter(Boolean);
  const result: BreadcrumbPath[] = [{ name: 'Home', path: '/' }];
  let currentPath = '';

  for (const part of parts) {
    currentPath += `/${part}`;
    result.push({ name: part, path: currentPath });
  }

  return result;
};

// ==================== FILE BREADCRUMB ====================

interface FileBreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

export const FileBreadcrumb: React.FC<FileBreadcrumbProps> = ({
  path,
  onNavigate,
}) => {
  const parts = parsePath(path);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      borderRadius: 6,
      overflow: 'auto',
    },
    part: {
      background: 'none',
      border: 'none',
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      padding: '4px 8px',
      borderRadius: 4,
      fontSize: 13,
      whiteSpace: 'nowrap',
    },
    activePart: {
      color: 'var(--color-text)',
      fontWeight: 500,
    },
    separator: {
      color: 'var(--color-text-muted)',
      fontSize: 12,
    },
  };

  return (
    <div style={styles.container}>
      {parts.map((part, index) => (
        <React.Fragment key={part.path}>
          <button
            style={{
              ...styles.part,
              ...(index === parts.length - 1 ? styles.activePart : {}),
            }}
            onClick={() => onNavigate(part.path)}
          >
            {part.name}
          </button>
          {index < parts.length - 1 && (
            <span style={styles.separator}>/</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ==================== FILE LIST VIEW ====================

type SortColumn = 'name' | 'size' | 'date' | 'type';

interface FileListViewProps {
  files: FileItem[];
  selectedIds: string[];
  onSelect: (file: FileItem, event: React.MouseEvent) => void;
  onDoubleClick?: (file: FileItem) => void;
  onContextMenu?: (file: FileItem, event: React.MouseEvent) => void;
  sortBy: string;
  onSort: (column: SortColumn) => void;
}

const FileListView: React.FC<FileListViewProps> = ({
  files,
  selectedIds,
  onSelect,
  onDoubleClick,
  onContextMenu,
  sortBy,
  onSort,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    th: {
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      borderBottom: '1px solid var(--color-border)',
      cursor: 'pointer',
      userSelect: 'none',
    },
    td: {
      padding: '10px 12px',
      fontSize: 13,
      color: 'var(--color-text)',
      borderBottom: '1px solid var(--color-border)',
    },
    row: {
      cursor: 'pointer',
      transition: 'background 0.1s ease',
    },
    fileName: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    icon: {
      fontSize: 18,
    },
    size: {
      color: 'var(--color-text-muted)',
    },
    date: {
      color: 'var(--color-text-muted)',
    },
  };

  const formatDate = (date?: Date): string => {
    if (!date) return '-';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th
            style={{
              ...styles.th,
              fontWeight: sortBy === 'name' ? 700 : 600,
            }}
            onClick={() => onSort('name')}
          >
            Name
          </th>
          <th
            style={{
              ...styles.th,
              width: 100,
              fontWeight: sortBy === 'size' ? 700 : 600,
            }}
            onClick={() => onSort('size')}
          >
            Size
          </th>
          <th
            style={{
              ...styles.th,
              width: 150,
              fontWeight: sortBy === 'date' ? 700 : 600,
            }}
            onClick={() => onSort('date')}
          >
            Modified
          </th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <tr
            key={file.id}
            style={{
              ...styles.row,
              background: selectedIds.includes(file.id)
                ? 'var(--color-accent-light)'
                : 'transparent',
            }}
            onClick={(e) => onSelect(file, e)}
            onDoubleClick={() => onDoubleClick?.(file)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu?.(file, e);
            }}
          >
            <td style={styles.td}>
              <div style={styles.fileName}>
                <span style={styles.icon}>{getFileIcon(file)}</span>
                {file.name}
              </div>
            </td>
            <td style={{ ...styles.td, ...styles.size }}>
              {file.type === 'folder' ? '-' : formatFileSize(file.size)}
            </td>
            <td style={{ ...styles.td, ...styles.date }}>
              {formatDate(file.modifiedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ==================== FILE GRID VIEW ====================

interface FileGridViewProps {
  files: FileItem[];
  selectedIds: string[];
  onSelect: (file: FileItem, event: React.MouseEvent) => void;
  onDoubleClick?: (file: FileItem) => void;
  onContextMenu?: (file: FileItem, event: React.MouseEvent) => void;
  tileSize?: 'small' | 'medium' | 'large';
}

const FileGridView: React.FC<FileGridViewProps> = ({
  files,
  selectedIds,
  onSelect,
  onDoubleClick,
  onContextMenu,
  tileSize = 'medium',
}) => {
  const sizes = {
    small: { tile: 80, icon: 32 },
    medium: { tile: 100, icon: 48 },
    large: { tile: 140, icon: 64 },
  };

  const size = sizes[tileSize];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${size.tile}px, 1fr))`,
      gap: 12,
      padding: 12,
    },
    tile: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'background 0.1s ease',
    },
    icon: {
      fontSize: size.icon,
      marginBottom: 8,
    },
    name: {
      fontSize: 12,
      textAlign: 'center',
      wordBreak: 'break-word',
      color: 'var(--color-text)',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    },
  };

  return (
    <div style={styles.container}>
      {files.map((file) => (
        <div
          key={file.id}
          style={{
            ...styles.tile as any,
            background: selectedIds.includes(file.id)
              ? 'var(--color-accent-light)'
              : 'transparent',
          }}
          onClick={(e) => onSelect(file, e)}
          onDoubleClick={() => onDoubleClick?.(file)}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu?.(file, e);
          }}
        >
          <span style={styles.icon as any}>{getFileIcon(file)}</span>
          <span style={styles.name as any}>{file.name}</span>
        </div>
      ))}
    </div>
  );
};

// ==================== FILE BROWSER ====================

export const FileBrowser: React.FC<FileBrowserProps> = ({
  files,
  currentPath = '/',
  onNavigate,
  onFileClick,
  onFileDoubleClick,
  onFileSelect,
  onContextMenu,
  view = 'list',
  sortBy = 'name',
  sortOrder = 'asc',
  showHidden = false,
  multiSelect = true,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentSort, setCurrentSort] = useState({ by: sortBy, order: sortOrder });

  const sortedFiles = useMemo(() => {
    let filtered = showHidden
      ? files
      : files.filter((f) => !f.name.startsWith('.'));

    // Sort folders first, then by the selected criteria
    return [...filtered].sort((a, b) => {
      // Folders first
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }

      const modifier = currentSort.order === 'asc' ? 1 : -1;

      switch (currentSort.by) {
        case 'name':
          return a.name.localeCompare(b.name) * modifier;
        case 'size':
          return ((a.size || 0) - (b.size || 0)) * modifier;
        case 'date':
          return (
            ((a.modifiedAt?.getTime() || 0) - (b.modifiedAt?.getTime() || 0)) *
            modifier
          );
        case 'type':
          return (a.extension || '').localeCompare(b.extension || '') * modifier;
        default:
          return 0;
      }
    });
  }, [files, showHidden, currentSort]);

  const handleSelect = useCallback(
    (file: FileItem, event: React.MouseEvent) => {
      onFileClick?.(file);

      if (multiSelect && (event.ctrlKey || event.metaKey)) {
        setSelectedIds((prev) =>
          prev.includes(file.id)
            ? prev.filter((id) => id !== file.id)
            : [...prev, file.id]
        );
      } else if (multiSelect && event.shiftKey && selectedIds.length > 0) {
        const lastSelectedIndex = sortedFiles.findIndex(
          (f) => f.id === selectedIds[selectedIds.length - 1]
        );
        const currentIndex = sortedFiles.findIndex((f) => f.id === file.id);
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const newSelection = sortedFiles.slice(start, end + 1).map((f) => f.id);
        setSelectedIds(newSelection);
      } else {
        setSelectedIds([file.id]);
      }
    },
    [multiSelect, selectedIds, sortedFiles, onFileClick]
  );

  const handleDoubleClick = useCallback(
    (file: FileItem) => {
      if (file.type === 'folder') {
        onNavigate?.(file.path);
      } else {
        onFileDoubleClick?.(file);
      }
    },
    [onNavigate, onFileDoubleClick]
  );

  const handleSort = useCallback((column: 'name' | 'size' | 'date' | 'type') => {
    setCurrentSort((prev) => ({
      by: column,
      order: prev.by === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // Notify parent of selection changes
  React.useEffect(() => {
    const selectedFiles = files.filter((f) => selectedIds.includes(f.id));
    onFileSelect?.(selectedFiles);
  }, [selectedIds, files, onFileSelect]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg)',
    },
    header: {
      padding: 12,
      borderBottom: '1px solid var(--color-border)',
    },
    content: {
      flex: 1,
      overflow: 'auto',
    },
    empty: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      color: 'var(--color-text-muted)',
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
  };

  return (
    <div style={styles.container as any}>
      {onNavigate && (
        <div style={styles.header}>
          <FileBreadcrumb path={currentPath} onNavigate={onNavigate} />
        </div>
      )}
      <div style={styles.content}>
        {sortedFiles.length === 0 ? (
          <div style={styles.empty as any}>
            <div style={styles.emptyIcon}>folder-open</div>
            <p>This folder is empty</p>
          </div>
        ) : view === 'list' ? (
          <FileListView
            files={sortedFiles}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={onContextMenu}
            sortBy={currentSort.by}
            onSort={handleSort}
          />
        ) : (
          <FileGridView
            files={sortedFiles}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onDoubleClick={handleDoubleClick}
            onContextMenu={onContextMenu}
            tileSize={view === 'tiles' ? 'large' : 'medium'}
          />
        )}
      </div>
    </div>
  );
};

// ==================== FILE INFO PANEL ====================

interface FileInfoPanelProps {
  file: FileItem | null;
  onClose?: () => void;
}

export const FileInfoPanel: React.FC<FileInfoPanelProps> = ({
  file,
  onClose,
}) => {
  if (!file) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: 20,
      background: 'var(--color-bg)',
      borderLeft: '1px solid var(--color-border)',
      height: '100%',
      width: 280,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 18,
      color: 'var(--color-text-muted)',
    },
    preview: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      marginBottom: 20,
    },
    icon: {
      fontSize: 72,
    },
    name: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      wordBreak: 'break-word',
      marginBottom: 20,
    },
    section: {
      marginBottom: 16,
    },
    label: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginBottom: 4,
    },
    value: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
  };

  const formatDate = (date?: Date): string => {
    if (!date) return '-';
    return date.toLocaleString();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>File Info</span>
        {onClose && (
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <div style={styles.preview}>
        <span style={styles.icon}>{getFileIcon(file)}</span>
      </div>
      <div style={styles.name}>{file.name}</div>
      <div style={styles.section}>
        <div style={styles.label}>Type</div>
        <div style={styles.value}>
          {file.type === 'folder'
            ? 'Folder'
            : file.extension?.toUpperCase() || 'File'}
        </div>
      </div>
      {file.type === 'file' && (
        <div style={styles.section}>
          <div style={styles.label}>Size</div>
          <div style={styles.value}>{formatFileSize(file.size)}</div>
        </div>
      )}
      <div style={styles.section}>
        <div style={styles.label}>Path</div>
        <div style={styles.value}>{file.path}</div>
      </div>
      <div style={styles.section}>
        <div style={styles.label}>Modified</div>
        <div style={styles.value}>{formatDate(file.modifiedAt)}</div>
      </div>
      <div style={styles.section}>
        <div style={styles.label}>Created</div>
        <div style={styles.value}>{formatDate(file.createdAt)}</div>
      </div>
    </div>
  );
};

// ==================== FILE TOOLBAR ====================

interface FileToolbarProps {
  selectedCount: number;
  view: 'list' | 'grid' | 'tiles';
  onViewChange: (view: 'list' | 'grid' | 'tiles') => void;
  onNewFolder?: () => void;
  onUpload?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
}

export const FileToolbar: React.FC<FileToolbarProps> = ({
  selectedCount,
  view,
  onViewChange,
  onNewFolder,
  onUpload,
  onDelete,
  onRefresh,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-bg)',
    },
    left: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      border: 'none',
      borderRadius: 6,
      background: 'var(--color-bg-secondary)',
      color: 'var(--color-text)',
      cursor: 'pointer',
      fontSize: 13,
    },
    viewBtn: {
      padding: '6px 10px',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 16,
    },
    selected: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.left}>
        {onNewFolder && (
          <button style={styles.button} onClick={onNewFolder}>
            folder New Folder
          </button>
        )}
        {onUpload && (
          <button style={styles.button} onClick={onUpload}>
            upload Upload
          </button>
        )}
        {selectedCount > 0 && onDelete && (
          <button
            style={{ ...styles.button, color: '#f44336' }}
            onClick={onDelete}
          >
            trash Delete ({selectedCount})
          </button>
        )}
        {selectedCount > 0 && (
          <span style={styles.selected}>
            {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
          </span>
        )}
      </div>
      <div style={styles.right}>
        {onRefresh && (
          <button
            style={styles.viewBtn}
            onClick={onRefresh}
            title="Refresh"
          >
            refresh-cw
          </button>
        )}
        <button
          style={{
            ...styles.viewBtn,
            background:
              view === 'list'
                ? 'var(--color-accent)'
                : 'var(--color-bg-secondary)',
            color: view === 'list' ? 'white' : 'var(--color-text)',
          }}
          onClick={() => onViewChange('list')}
          title="List View"
        >
          ≡
        </button>
        <button
          style={{
            ...styles.viewBtn,
            background:
              view === 'grid'
                ? 'var(--color-accent)'
                : 'var(--color-bg-secondary)',
            color: view === 'grid' ? 'white' : 'var(--color-text)',
          }}
          onClick={() => onViewChange('grid')}
          title="Grid View"
        >
          ⊞
        </button>
        <button
          style={{
            ...styles.viewBtn,
            background:
              view === 'tiles'
                ? 'var(--color-accent)'
                : 'var(--color-bg-secondary)',
            color: view === 'tiles' ? 'white' : 'var(--color-text)',
          }}
          onClick={() => onViewChange('tiles')}
          title="Tiles View"
        >
          ⊟
        </button>
      </div>
    </div>
  );
};

export default FileBrowser;
