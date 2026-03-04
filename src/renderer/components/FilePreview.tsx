/**
 * DEX File Preview
 * Preview files of various types inline
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ==================== TYPES ====================

type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'markdown' | 'unknown';

interface FilePreviewProps {
  file?: File;
  src?: string;
  fileName?: string;
  fileType?: FileType;
  width?: number | string;
  height?: number | string;
  maxWidth?: number;
  maxHeight?: number;
  showControls?: boolean;
  showInfo?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

interface ImagePreviewProps {
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  maxWidth?: number;
  maxHeight?: number;
  zoomable?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

interface CodePreviewProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: number;
  wrap?: boolean;
}

// ==================== FILE PREVIEW ====================

export const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  src,
  fileName,
  fileType: explicitType,
  width = '100%',
  height = 'auto',
  maxWidth = 800,
  maxHeight = 600,
  showControls = true,
  showInfo = true,
  onLoad,
  onError,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(src || null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = fileName || file?.name || 'Unknown file';
  const fileType = explicitType || detectFileType(name);

  // Create object URL for file
  useEffect(() => {
    if (file && !src) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, src]);

  // Load text content for text-based files
  useEffect(() => {
    if (!file || !['text', 'code', 'markdown'].includes(fileType)) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = () => {
      setTextContent(reader.result as string);
      setLoading(false);
      onLoad?.();
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setLoading(false);
      onError?.(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  }, [file, fileType, onLoad, onError]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      width,
      maxWidth,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    preview: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
      maxHeight,
      overflow: 'auto',
      background: 'var(--color-bg-tertiary)',
    },
    info: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
    },
    icon: {
      fontSize: 24,
    },
    details: {
      flex: 1,
    },
    fileName: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      wordBreak: 'break-word',
    },
    fileSize: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 40,
      color: 'var(--color-text-muted)',
    },
    error: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: 40,
      color: 'var(--color-error)',
    },
    unknown: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: 40,
      color: 'var(--color-text-muted)',
    },
  };

  const fileIcons: Record<FileType, string> = {
    image: 'image',
    video: 'film',
    audio: 'music',
    pdf: 'file',
    text: 'file-text',
    code: 'laptop',
    markdown: 'bookmark',
    unknown: 'folder',
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <span>Loading preview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <span>alert-triangle</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const renderPreview = () => {
    switch (fileType) {
      case 'image':
        return previewUrl ? (
          <ImagePreview
            src={previewUrl}
            alt={name}
            maxWidth={maxWidth}
            maxHeight={maxHeight}
            zoomable
            onLoad={onLoad}
          />
        ) : null;

      case 'video':
        return previewUrl ? (
          <video
            src={previewUrl}
            controls={showControls}
            style={{ maxWidth: '100%', maxHeight }}
            onLoadedData={onLoad}
          />
        ) : null;

      case 'audio':
        return previewUrl ? (
          <div style={{ padding: 20, width: '100%' }}>
            <audio src={previewUrl} controls style={{ width: '100%' }} onLoadedData={onLoad} />
          </div>
        ) : null;

      case 'code':
        return textContent ? (
          <CodePreview
            code={textContent}
            language={getLanguageFromFileName(name)}
            showLineNumbers
            maxHeight={maxHeight}
          />
        ) : null;

      case 'text':
      case 'markdown':
        return textContent ? (
          <div
            style={{
              padding: 16,
              width: '100%',
              maxHeight,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: 13,
              color: 'var(--color-text)',
            }}
          >
            {textContent}
          </div>
        ) : null;

      default:
        return (
          <div style={styles.unknown}>
            <span style={{ fontSize: 48 }}>{fileIcons[fileType]}</span>
            <span>No preview available</span>
          </div>
        );
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.preview}>{renderPreview()}</div>
      {showInfo && (
        <div style={styles.info}>
          <span style={styles.icon}>{fileIcons[fileType]}</span>
          <div style={styles.details}>
            <div style={styles.fileName}>{name}</div>
            {file && (
              <div style={styles.fileSize}>{formatFileSize(file.size)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== IMAGE PREVIEW ====================

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  alt = 'Image preview',
  width = '100%',
  height = 'auto',
  maxWidth,
  maxHeight,
  zoomable = false,
  onLoad,
  onError,
}) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!zoomable) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
  }, [zoomable]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!zoomable || zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [zoomable, zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width,
      height,
      maxWidth,
      maxHeight,
      overflow: 'hidden',
      cursor: zoomable ? (isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'zoom-in') : 'default',
    },
    image: {
      display: 'block',
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
      transition: isDragging ? 'none' : 'transform 0.2s ease',
    },
    zoomControls: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      display: 'flex',
      gap: 4,
      background: 'rgba(0,0,0,0.6)',
      borderRadius: 4,
      padding: 4,
    },
    zoomButton: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      color: 'white',
      cursor: 'pointer',
      borderRadius: 4,
      fontSize: 14,
    },
    zoomLevel: {
      padding: '0 8px',
      color: 'white',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
    },
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img
        src={src}
        alt={alt}
        style={styles.image}
        onLoad={onLoad}
        onError={onError}
        draggable={false}
      />
      {zoomable && zoom !== 1 && (
        <div style={styles.zoomControls}>
          <button
            style={styles.zoomButton}
            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
          >
            −
          </button>
          <span style={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
          <button
            style={styles.zoomButton}
            onClick={() => setZoom(prev => Math.min(5, prev + 0.25))}
          >
            +
          </button>
          <button style={styles.zoomButton} onClick={resetZoom}>
            ⟲
          </button>
        </div>
      )}
    </div>
  );
};

// ==================== CODE PREVIEW ====================

export const CodePreview: React.FC<CodePreviewProps> = ({
  code,
  language = 'plaintext',
  showLineNumbers = true,
  maxHeight = 400,
  wrap = false,
}) => {
  const lines = code.split('\n');

  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: '100%',
      maxHeight,
      overflow: 'auto',
      background: 'var(--color-bg-tertiary)',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.5,
    },
    lineNumber: {
      width: 50,
      padding: '0 12px',
      textAlign: 'right',
      color: 'var(--color-text-muted)',
      userSelect: 'none',
      background: 'var(--color-bg-secondary)',
      borderRight: '1px solid var(--color-border)',
    },
    codeLine: {
      padding: '0 12px',
      color: 'var(--color-text)',
      whiteSpace: wrap ? 'pre-wrap' : 'pre',
      wordBreak: wrap ? 'break-word' : 'normal',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>{language}</span>
        <span>{lines.length} lines</span>
      </div>
      <table style={styles.table}>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              {showLineNumbers && (
                <td style={styles.lineNumber}>{index + 1}</td>
              )}
              <td style={styles.codeLine}>{line || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ==================== THUMBNAIL GALLERY ====================

interface ThumbnailGalleryProps {
  files: Array<{ src: string; name: string; type?: FileType }>;
  selected?: number;
  onSelect?: (index: number) => void;
  thumbnailSize?: number;
  gap?: number;
  maxItems?: number;
}

export const ThumbnailGallery: React.FC<ThumbnailGalleryProps> = ({
  files,
  selected,
  onSelect,
  thumbnailSize = 80,
  gap = 8,
  maxItems,
}) => {
  const displayFiles = maxItems ? files.slice(0, maxItems) : files;
  const remaining = maxItems && files.length > maxItems ? files.length - maxItems : 0;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexWrap: 'wrap',
      gap,
    },
    thumbnail: {
      width: thumbnailSize,
      height: thumbnailSize,
      borderRadius: 6,
      overflow: 'hidden',
      cursor: 'pointer',
      border: '2px solid transparent',
      transition: 'border-color 0.15s',
    },
    thumbnailSelected: {
      borderColor: 'var(--color-accent)',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    placeholder: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      fontSize: 24,
    },
    remaining: {
      width: thumbnailSize,
      height: thumbnailSize,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
    },
  };

  const fileIcons: Record<FileType, string> = {
    image: 'image',
    video: 'film',
    audio: 'music',
    pdf: 'file',
    text: 'file-text',
    code: 'laptop',
    markdown: 'bookmark',
    unknown: 'folder',
  };

  return (
    <div style={styles.container}>
      {displayFiles.map((file, index) => {
        const fileType = file.type || detectFileType(file.name);
        const isImage = fileType === 'image';

        return (
          <div
            key={index}
            style={{
              ...styles.thumbnail,
              ...(selected === index ? styles.thumbnailSelected : {}),
            }}
            onClick={() => onSelect?.(index)}
          >
            {isImage ? (
              <img src={file.src} alt={file.name} style={styles.image} />
            ) : (
              <div style={styles.placeholder}>{fileIcons[fileType]}</div>
            )}
          </div>
        );
      })}
      {remaining > 0 && (
        <div style={styles.remaining}>+{remaining}</div>
      )}
    </div>
  );
};

// ==================== UTILITIES ====================

function detectFileType(fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql'];
  const textExts = ['txt', 'log', 'csv'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md') return 'markdown';
  if (codeExts.includes(ext)) return 'code';
  if (textExts.includes(ext)) return 'text';

  return 'unknown';
}

function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    md: 'markdown',
  };

  return langMap[ext] || 'plaintext';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ==================== HOOK: useFilePreview ====================

export const useFilePreview = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectFile = useCallback((newFile: File) => {
    setFile(newFile);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
  }, []);

  return {
    file,
    previewUrl,
    fileType: file ? detectFileType(file.name) : null,
    selectFile,
    clearFile,
  };
};

export default FilePreview;
