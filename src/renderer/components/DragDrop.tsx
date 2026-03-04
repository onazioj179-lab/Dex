/**
 * DEX Drag and Drop
 * File drop zone and drag-and-drop utilities
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ==================== TYPES ====================

interface DroppedFile {
  file: File;
  preview?: string;
}

interface DropZoneProps {
  onDrop: (files: DroppedFile[]) => void;
  accept?: string[];
  maxFiles?: number;
  maxSize?: number; // in bytes
  multiple?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showPreview?: boolean;
  variant?: 'default' | 'minimal' | 'bordered';
}

interface DraggableItemProps {
  children: React.ReactNode;
  data: any;
  type: string;
  onDragStart?: (data: any) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
}

interface DropTargetProps {
  children: React.ReactNode;
  acceptTypes: string[];
  onDrop: (data: any, type: string) => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  disabled?: boolean;
}

// ==================== ICONS ====================

const Icons = {
  upload: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  file: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  ),
  image: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  video: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  ),
  audio: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

// ==================== UTILITIES ====================

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Icons.image;
  if (type.startsWith('video/')) return Icons.video;
  if (type.startsWith('audio/')) return Icons.audio;
  return Icons.file;
};

const isFileTypeAccepted = (file: File, accept?: string[]): boolean => {
  if (!accept || accept.length === 0) return true;
  
  return accept.some(pattern => {
    if (pattern.startsWith('.')) {
      return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    }
    if (pattern.endsWith('/*')) {
      return file.type.startsWith(pattern.replace('/*', '/'));
    }
    return file.type === pattern;
  });
};

// ==================== DROP ZONE COMPONENT ====================

export const DropZone: React.FC<DropZoneProps> = ({
  onDrop,
  accept,
  maxFiles = Infinity,
  maxSize = Infinity,
  multiple = true,
  disabled = false,
  children,
  style,
  showPreview = true,
  variant = 'default',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    setError(null);
    const newFiles: DroppedFile[] = [];
    const filesArray = Array.from(fileList);

    for (const file of filesArray) {
      // Check file count
      if (files.length + newFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} file(s) allowed`);
        break;
      }

      // Check file type
      if (!isFileTypeAccepted(file, accept)) {
        setError(`File type ${file.type || 'unknown'} not accepted`);
        continue;
      }

      // Check file size
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        continue;
      }

      // Create preview for images
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      newFiles.push({ file, preview });
    }

    if (newFiles.length > 0) {
      const updatedFiles = multiple ? [...files, ...newFiles] : newFiles;
      setFiles(updatedFiles);
      onDrop(updatedFiles);
    }
  }, [files, maxFiles, maxSize, accept, multiple, onDrop]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounterRef.current = 0;
    setIsDragging(false);
    
    if (disabled) return;
    
    const { files: droppedFiles } = e.dataTransfer;
    if (droppedFiles && droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onDrop(updatedFiles);
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'minimal':
        return {
          background: 'transparent',
          border: 'none',
        };
      case 'bordered':
        return {
          background: 'transparent',
          border: `2px dashed ${isDragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
        };
      default:
        return {
          background: isDragging ? 'var(--color-accent)10' : 'var(--color-bg-secondary)',
          border: `2px dashed ${isDragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      ...getVariantStyles(),
      borderRadius: 12,
      padding: 32,
      textAlign: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      opacity: disabled ? 0.6 : 1,
      ...style,
    },
    input: {
      display: 'none',
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      color: isDragging ? 'var(--color-accent)' : 'var(--color-text-muted)',
      transition: 'color 0.2s',
    },
    title: {
      fontSize: 16,
      fontWeight: 500,
      color: 'var(--color-text-primary)',
    },
    subtitle: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
    },
    hint: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 8,
    },
    error: {
      fontSize: 12,
      color: '#ff3b30',
      marginTop: 8,
    },
    previewContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
      gap: 12,
      marginTop: 16,
      width: '100%',
    },
    previewItem: {
      position: 'relative',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    },
    previewImage: {
      width: 80,
      height: 80,
      objectFit: 'cover',
      borderRadius: 6,
    },
    previewIcon: {
      width: 80,
      height: 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-text-muted)',
    },
    previewName: {
      fontSize: 11,
      color: 'var(--color-text-secondary)',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    previewSize: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
    },
    removeBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      background: 'rgba(0, 0, 0, 0.5)',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
    },
  };

  return (
    <div
      style={styles.container}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        style={styles.input}
        accept={accept?.join(',')}
        multiple={multiple}
        onChange={handleInputChange}
        disabled={disabled}
      />
      
      {children || (
        <div style={styles.content}>
          <div style={styles.icon}>{Icons.upload}</div>
          <div style={styles.title}>
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </div>
          <div style={styles.subtitle}>
            or click to browse
          </div>
          {(accept || maxSize < Infinity) && (
            <div style={styles.hint}>
              {accept && `Accepts: ${accept.join(', ')}`}
              {accept && maxSize < Infinity && ' • '}
              {maxSize < Infinity && `Max: ${formatFileSize(maxSize)}`}
            </div>
          )}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {showPreview && files.length > 0 && (
        <div style={styles.previewContainer} onClick={e => e.stopPropagation()}>
          {files.map((item, index) => (
            <div key={index} style={styles.previewItem}>
              {item.preview ? (
                <img src={item.preview} alt={item.file.name} style={styles.previewImage} />
              ) : (
                <div style={styles.previewIcon}>
                  {getFileIcon(item.file.type)}
                </div>
              )}
              <span style={styles.previewName}>{item.file.name}</span>
              <span style={styles.previewSize}>{formatFileSize(item.file.size)}</span>
              <button
                style={styles.removeBtn}
                onClick={() => removeFile(index)}
              >
                {Icons.close}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== DRAGGABLE ITEM COMPONENT ====================

export const DraggableItem: React.FC<DraggableItemProps> = ({
  children,
  data,
  type,
  onDragStart,
  onDragEnd,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('application/json', JSON.stringify({ data, type }));
    e.dataTransfer.effectAllowed = 'move';
    
    setIsDragging(true);
    onDragStart?.(data);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        cursor: disabled ? 'default' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {children}
    </div>
  );
};

// ==================== DROP TARGET COMPONENT ====================

export const DropTarget: React.FC<DropTargetProps> = ({
  children,
  acceptTypes,
  onDrop,
  onDragOver,
  onDragLeave,
  disabled = false,
}) => {
  const [isOver, setIsOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    setCanDrop(false);
    onDragLeave?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;

    try {
      // Check if we can accept this drop
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const { type } = JSON.parse(jsonData);
        setCanDrop(acceptTypes.includes(type));
      }
    } catch {
      setCanDrop(false);
    }

    onDragOver?.();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    setCanDrop(false);

    if (disabled) return;

    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const { data, type } = JSON.parse(jsonData);
        if (acceptTypes.includes(type)) {
          onDrop(data, type);
        }
      }
    } catch (error) {
      console.error('Failed to parse drop data:', error);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        background: isOver && canDrop ? 'var(--color-accent)10' : 'transparent',
        border: isOver ? `2px dashed ${canDrop ? 'var(--color-accent)' : '#ff3b30'}` : '2px dashed transparent',
        borderRadius: 8,
        transition: 'all 0.2s',
      }}
    >
      {children}
    </div>
  );
};

// ==================== SORTABLE LIST ====================

interface SortableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  onReorder: (items: T[]) => void;
  direction?: 'horizontal' | 'vertical';
  gap?: number;
}

export function SortableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  direction = 'vertical',
  gap = 8,
}: SortableListProps<T>) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
    setOverIndex(index);
  };

  const handleDragEnd = () => {
    if (draggingIndex !== null && overIndex !== null && draggingIndex !== overIndex) {
      const newItems = [...items];
      const [removed] = newItems.splice(draggingIndex, 1);
      newItems.splice(overIndex, 0, removed);
      onReorder(newItems);
    }
    setDraggingIndex(null);
    setOverIndex(null);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: direction === 'horizontal' ? 'row' : 'column',
      gap,
    },
    item: {
      transition: 'transform 0.2s, opacity 0.2s',
    },
  };

  return (
    <div style={styles.container}>
      {items.map((item, index) => {
        const isDragging = draggingIndex === index;
        const isOver = overIndex === index;

        return (
          <div
            key={keyExtractor(item)}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDragEnd={handleDragEnd}
            style={{
              ...styles.item,
              opacity: isDragging ? 0.5 : 1,
              transform: isOver ? 'scale(1.02)' : 'scale(1)',
              cursor: 'grab',
            }}
          >
            {renderItem(item, index, isDragging)}
          </div>
        );
      })}
    </div>
  );
}

// ==================== HOOK: useDropZone ====================

export const useDropZone = (options: {
  onDrop: (files: File[]) => void;
  accept?: string[];
  disabled?: boolean;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (options.disabled) return;
      
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      
      if (options.disabled) return;
      
      const files = Array.from(e.dataTransfer?.files || []);
      const filteredFiles = options.accept
        ? files.filter(file => isFileTypeAccepted(file, options.accept))
        : files;
      
      if (filteredFiles.length > 0) {
        options.onDrop(filteredFiles);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [options]);

  return { isDragging };
};

export default DropZone;
