/**
 * DEX File Upload Component
 * File upload with drag and drop
 */

import React, { useState, useRef, useCallback } from 'react';

// ==================== TYPES ====================

interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  preview?: string;
}

interface FileUploadProps {
  onUpload?: (files: File[]) => void;
  onFileSelect?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  maxFiles?: number;
  disabled?: boolean;
  showPreview?: boolean;
  showProgress?: boolean;
}

interface DropzoneProps {
  onDrop: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

interface FileListProps {
  files: FileItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  showPreview?: boolean;
}

interface UploadProgressProps {
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  fileName: string;
}

// ==================== UTILITIES ====================

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (type: string): string => {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'film';
  if (type.startsWith('audio/')) return 'music';
  if (type.includes('pdf')) return 'book';
  if (type.includes('word') || type.includes('document')) return 'file';
  if (type.includes('sheet') || type.includes('excel')) return 'bar-chart';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'film';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'package';
  if (type.includes('text') || type.includes('json') || type.includes('javascript')) return 'file-text';
  return 'paperclip';
};

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

// ==================== FILE UPLOAD ====================

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  onFileSelect,
  accept,
  multiple = true,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 10,
  disabled = false,
  showPreview = true,
  showProgress = true,
}) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles: FileItem[] = [];

    for (const file of newFiles) {
      if (files.length + validFiles.length >= maxFiles) {
        break;
      }

      if (file.size > maxSize) {
        continue;
      }

      const fileItem: FileItem = {
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
      };

      // Create preview for images
      if (showPreview && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFiles(prev =>
            prev.map(f =>
              f.id === fileItem.id
                ? { ...f, preview: e.target?.result as string }
                : f
            )
          );
        };
        reader.readAsDataURL(file);
      }

      validFiles.push(fileItem);
    }

    setFiles(prev => [...prev, ...validFiles]);
    onFileSelect?.(validFiles.map(f => f.file));
  }, [files.length, maxFiles, maxSize, showPreview, onFileSelect]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
    e.target.value = '';
  };

  const handleRemove = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');

    for (const fileItem of pendingFiles) {
      setFiles(prev =>
        prev.map(f =>
          f.id === fileItem.id ? { ...f, status: 'uploading' } : f
        )
      );

      // Simulate upload progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setFiles(prev =>
          prev.map(f =>
            f.id === fileItem.id ? { ...f, progress } : f
          )
        );
      }

      setFiles(prev =>
        prev.map(f =>
          f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
        )
      );
    }

    onUpload?.(pendingFiles.map(f => f.file));
  };

  const hasFiles = files.length > 0;
  const canUpload = files.some(f => f.status === 'pending');

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    dropzone: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
      background: isDragOver
        ? 'rgba(var(--color-accent-rgb), 0.1)'
        : 'var(--color-bg-secondary)',
      border: `2px dashed ${isDragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    },
    icon: {
      fontSize: 48,
    },
    text: {
      fontSize: 14,
      color: 'var(--color-text)',
      textAlign: 'center',
    },
    subtext: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    browseButton: {
      padding: '8px 16px',
      background: 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
    },
    fileList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    uploadButton: {
      alignSelf: 'flex-end',
      padding: '10px 24px',
      background: 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: canUpload ? 'pointer' : 'not-allowed',
      opacity: canUpload ? 1 : 0.5,
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.dropzone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <span style={styles.icon}>folder</span>
        <p style={styles.text}>
          Drag and drop files here, or click to browse
        </p>
        <span style={styles.subtext}>
          Max {formatFileSize(maxSize)} per file • Up to {maxFiles} files
        </span>
        <button style={styles.browseButton}>Browse Files</button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {hasFiles && (
        <div style={styles.fileList}>
          {files.map(file => (
            <FileListItem
              key={file.id}
              file={file}
              onRemove={() => handleRemove(file.id)}
              showPreview={showPreview}
              showProgress={showProgress}
            />
          ))}
        </div>
      )}

      {hasFiles && (
        <button
          style={styles.uploadButton}
          onClick={handleUpload}
          disabled={!canUpload}
        >
          Upload Files
        </button>
      )}
    </div>
  );
};

// ==================== FILE LIST ITEM ====================

interface FileListItemProps {
  file: FileItem;
  onRemove?: () => void;
  showPreview?: boolean;
  showProgress?: boolean;
}

const FileListItem: React.FC<FileListItemProps> = ({
  file,
  onRemove,
  showPreview = true,
  showProgress = true,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    },
    preview: {
      width: 48,
      height: 48,
      borderRadius: 6,
      objectFit: 'cover',
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    meta: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 2,
    },
    progress: {
      height: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 2,
      marginTop: 8,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      background: file.status === 'error' ? '#ef4444' : 'var(--color-accent)',
      transition: 'width 0.3s',
    },
    status: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    statusIcon: {
      fontSize: 16,
    },
    removeButton: {
      padding: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 16,
    },
  };

  const getStatusIcon = () => {
    switch (file.status) {
      case 'uploading': return 'Uploading...';
      case 'success': return 'check-circle';
      case 'error': return 'x-circle';
      default: return null;
    }
  };

  return (
    <div style={styles.item}>
      {showPreview && (
        <div style={styles.preview}>
          {file.preview ? (
            <img
              src={file.preview}
              alt={file.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
            />
          ) : (
            getFileIcon(file.type)
          )}
        </div>
      )}

      <div style={styles.info}>
        <p style={styles.name}>{file.name}</p>
        <div style={styles.meta}>
          {formatFileSize(file.size)} • {file.type || 'Unknown type'}
        </div>

        {showProgress && file.status === 'uploading' && (
          <div style={styles.progress}>
            <div
              style={{
                ...styles.progressBar,
                width: `${file.progress}%`,
              }}
            />
          </div>
        )}
      </div>

      <div style={styles.status}>
        {getStatusIcon() && (
          <span style={styles.statusIcon}>{getStatusIcon()}</span>
        )}
        {onRemove && (
          <button style={styles.removeButton} onClick={onRemove}>
            ×
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== DROPZONE ====================

export const Dropzone: React.FC<DropzoneProps> = ({
  onDrop,
  accept,
  multiple = true,
  disabled = false,
  children,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    onDrop(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onDrop(files);
    e.target.value = '';
  };

  const styles: Record<string, React.CSSProperties> = {
    dropzone: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      background: isDragOver
        ? 'rgba(var(--color-accent-rgb), 0.1)'
        : 'var(--color-bg-secondary)',
      border: `2px dashed ${isDragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.2s',
    },
  };

  return (
    <div
      style={styles.dropzone}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      {children || (
        <>
          <span style={{ fontSize: 40, marginBottom: 12 }}>folder</span>
          <p style={{ color: 'var(--color-text)', margin: 0 }}>
            Drop files here or click to browse
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

// ==================== AVATAR UPLOAD ====================

interface AvatarUploadProps {
  value?: string;
  onChange?: (url: string) => void;
  size?: number;
  disabled?: boolean;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  value,
  onChange,
  size = 100,
  disabled = false,
}) => {
  const [preview, setPreview] = useState<string | null>(value || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPreview(url);
      onChange?.(url);
    };
    reader.readAsDataURL(file);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: size,
      height: size,
      borderRadius: '50%',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      objectFit: 'cover',
      background: 'var(--color-bg-tertiary)',
      border: '2px solid var(--color-border)',
    },
    placeholder: {
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      background: 'var(--color-bg-tertiary)',
      border: '2px dashed var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.4,
    },
    overlay: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0,
      transition: 'opacity 0.2s',
    },
    overlayVisible: {
      opacity: 1,
    },
    icon: {
      color: '#fff',
      fontSize: size * 0.25,
    },
  };

  return (
    <div
      style={styles.container}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      {preview ? (
        <img src={preview} alt="Avatar" style={styles.avatar} />
      ) : (
        <div style={styles.placeholder}>user</div>
      )}
      <div
        style={{
          ...styles.overlay,
          ...(disabled ? {} : { ':hover': styles.overlayVisible }),
        }}
        onMouseEnter={(e) => {
          if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '0';
        }}
      >
        <span style={styles.icon}>camera</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

// ==================== USE FILE UPLOAD HOOK ====================

export const useFileUpload = (options: {
  maxSize?: number;
  maxFiles?: number;
  accept?: string[];
} = {}) => {
  const { maxSize = 10 * 1024 * 1024, maxFiles = 10, accept } = options;
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles: FileItem[] = [];

    for (const file of newFiles) {
      if (files.length + validFiles.length >= maxFiles) break;
      if (file.size > maxSize) continue;
      if (accept && !accept.some(type => file.type.includes(type))) continue;

      validFiles.push({
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
      });
    }

    setFiles(prev => [...prev, ...validFiles]);
  }, [files.length, maxFiles, maxSize, accept]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const uploadFile = async (id: string, uploadFn: (file: File) => Promise<void>) => {
    const fileItem = files.find(f => f.id === id);
    if (!fileItem) return;

    setFiles(prev =>
      prev.map(f => (f.id === id ? { ...f, status: 'uploading' } : f))
    );

    try {
      await uploadFn(fileItem.file);
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, status: 'success', progress: 100 } : f))
      );
    } catch (error) {
      setFiles(prev =>
        prev.map(f =>
          f.id === id
            ? { ...f, status: 'error', error: (error as Error).message }
            : f
        )
      );
    }
  };

  return {
    files,
    isDragging,
    setIsDragging,
    addFiles,
    removeFile,
    clearFiles,
    uploadFile,
  };
};

export default FileUpload;
