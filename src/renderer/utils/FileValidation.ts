// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Platform - File Validation & I/O Guards
 * Provides safe file handling with type, size, and path validation
 */

// ==================== CONSTANTS ====================
export const FILE_SIZE_LIMITS: Record<string, number> = {
  video: 10 * 1024 * 1024 * 1024, // 10 GB
  audio: 2 * 1024 * 1024 * 1024,  // 2 GB
  image: 500 * 1024 * 1024,       // 500 MB
  document: 100 * 1024 * 1024,    // 100 MB
  preset: 10 * 1024 * 1024,       // 10 MB
  project: 500 * 1024 * 1024,     // 500 MB
  lut: 50 * 1024 * 1024,          // 50 MB
  effect: 50 * 1024 * 1024,       // 50 MB
  unknown: 1 * 1024 * 1024 * 1024, // 1 GB
  default: 1 * 1024 * 1024 * 1024, // 1 GB
};

export const ALLOWED_EXTENSIONS = {
  video: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.mpeg', '.mpg', '.3gp'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.aiff', '.alac', '.opus', '.webm'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif', '.avif'],
  project: ['.dex', '.dexproj', '.json'],
  preset: ['.dexpreset', '.json', '.xml'],
  lut: ['.cube', '.3dl', '.csp', '.look'],
  effect: ['.xml', '.prfpset', '.ffx', '.json'],
};

export const MIME_TYPES = {
  video: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/x-m4v'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/webm'],
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'],
};

// ==================== TYPES ====================
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: FileValidationErrorCode;
  file?: File;
  metadata?: FileMetadata;
}

export interface FileMetadata {
  name: string;
  size: number;
  sizeFormatted: string;
  extension: string;
  type: FileType;
  mimeType: string;
  lastModified: Date;
}

export type FileType = 'video' | 'audio' | 'image' | 'project' | 'preset' | 'lut' | 'effect' | 'unknown';

export type FileValidationErrorCode = 
  | 'FILE_TOO_LARGE'
  | 'INVALID_EXTENSION'
  | 'INVALID_MIME_TYPE'
  | 'INVALID_PATH'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'CORRUPTED_FILE'
  | 'UNKNOWN_ERROR';

// ==================== UTILITIES ====================

/**
 * Format bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file extension (lowercase, with dot)
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Determine file type from extension
 */
export function getFileType(filename: string): FileType {
  const ext = getFileExtension(filename);
  if (ALLOWED_EXTENSIONS.video.includes(ext)) return 'video';
  if (ALLOWED_EXTENSIONS.audio.includes(ext)) return 'audio';
  if (ALLOWED_EXTENSIONS.image.includes(ext)) return 'image';
  if (ALLOWED_EXTENSIONS.project.includes(ext)) return 'project';
  if (ALLOWED_EXTENSIONS.preset.includes(ext)) return 'preset';
  if (ALLOWED_EXTENSIONS.lut.includes(ext)) return 'lut';
  if (ALLOWED_EXTENSIONS.effect.includes(ext)) return 'effect';
  return 'unknown';
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal patterns
  let sanitized = filename
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Control characters
    .replace(/[<>:"|?*]/g, '') // Windows reserved characters
    .trim();
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = getFileExtension(sanitized);
    sanitized = sanitized.slice(0, 255 - ext.length) + ext;
  }
  
  // Ensure it's not empty
  if (!sanitized) {
    sanitized = 'untitled';
  }
  
  return sanitized;
}

/**
 * Check if path is safe (no traversal)
 */
export function isPathSafe(filepath: string): boolean {
  // Check for path traversal attempts
  const normalized = filepath.replace(/\\/g, '/');
  if (normalized.includes('..')) return false;
  if (normalized.startsWith('/') && !normalized.startsWith('//')) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return true; // Windows absolute path
  return true;
}

// ==================== VALIDATION FUNCTIONS ====================

/**
 * Validate a single file
 */
export function validateFile(
  file: File,
  options: {
    allowedTypes?: FileType[];
    maxSize?: number;
    validateMime?: boolean;
  } = {}
): FileValidationResult {
  const { allowedTypes, maxSize, validateMime = true } = options;
  
  // Get file metadata
  const extension = getFileExtension(file.name);
  const fileType = getFileType(file.name);
  
  // Check extension
  if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(fileType) && fileType !== 'unknown') {
    return {
      valid: false,
      error: `File type "${extension}" is not allowed. Accepted types: ${allowedTypes.join(', ')}`,
      errorCode: 'INVALID_EXTENSION',
    };
  }
  
  // Check all allowed extensions if no specific types
  if (!allowedTypes || allowedTypes.length === 0) {
    const allAllowed = Object.values(ALLOWED_EXTENSIONS).flat();
    if (extension && !allAllowed.includes(extension)) {
      return {
        valid: false,
        error: `File type "${extension}" is not supported.`,
        errorCode: 'INVALID_EXTENSION',
      };
    }
  }
  
  // Check size
  const sizeLimit = maxSize || FILE_SIZE_LIMITS[fileType] || FILE_SIZE_LIMITS.default;
  if (file.size > sizeLimit) {
    return {
      valid: false,
      error: `File is too large (${formatFileSize(file.size)}). Maximum allowed: ${formatFileSize(sizeLimit)}`,
      errorCode: 'FILE_TOO_LARGE',
    };
  }
  
  // Validate MIME type if enabled
  if (validateMime && file.type) {
    const expectedMimes = MIME_TYPES[fileType as keyof typeof MIME_TYPES];
    if (expectedMimes && !expectedMimes.some(m => file.type.startsWith(m.split('/')[0]))) {
      // Warn but don't block - MIME types can be unreliable
      console.warn(`MIME type mismatch: expected ${fileType}, got ${file.type}`);
    }
  }
  
  // Build metadata
  const metadata: FileMetadata = {
    name: sanitizeFilename(file.name),
    size: file.size,
    sizeFormatted: formatFileSize(file.size),
    extension,
    type: fileType,
    mimeType: file.type,
    lastModified: new Date(file.lastModified),
  };
  
  return {
    valid: true,
    file,
    metadata,
  };
}

/**
 * Validate multiple files
 */
export function validateFiles(
  files: FileList | File[],
  options: {
    allowedTypes?: FileType[];
    maxSize?: number;
    maxFiles?: number;
    validateMime?: boolean;
  } = {}
): { valid: FileValidationResult[]; invalid: FileValidationResult[]; totalSize: number } {
  const { maxFiles = 100 } = options;
  const fileArray = Array.from(files);
  
  if (fileArray.length > maxFiles) {
    return {
      valid: [],
      invalid: [{
        valid: false,
        error: `Too many files selected (${fileArray.length}). Maximum allowed: ${maxFiles}`,
        errorCode: 'UNKNOWN_ERROR',
      }],
      totalSize: 0,
    };
  }
  
  const results = fileArray.map(f => validateFile(f, options));
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  const totalSize = valid.reduce((sum, r) => sum + (r.metadata?.size || 0), 0);
  
  return { valid, invalid, totalSize };
}

// ==================== DRAG & DROP HELPERS ====================

/**
 * Check if drag event contains valid files
 */
export function isValidDragEvent(event: DragEvent, allowedTypes?: FileType[]): boolean {
  if (!event.dataTransfer) return false;
  
  const items = event.dataTransfer.items;
  if (!items || items.length === 0) return false;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file') {
      // Can't fully validate until drop, but check if it's a file
      return true;
    }
  }
  
  return false;
}

/**
 * Extract and validate files from drop event
 */
export function handleFileDrop(
  event: DragEvent,
  options: {
    allowedTypes?: FileType[];
    maxSize?: number;
    maxFiles?: number;
  } = {}
): { valid: FileValidationResult[]; invalid: FileValidationResult[] } {
  event.preventDefault();
  event.stopPropagation();
  
  if (!event.dataTransfer?.files) {
    return { valid: [], invalid: [] };
  }
  
  const { valid, invalid } = validateFiles(event.dataTransfer.files, options);
  return { valid, invalid };
}

// ==================== TOAST NOTIFICATIONS ====================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let toastCounter = 0;

export function createToast(
  type: ToastType,
  title: string,
  message?: string,
  duration = 4000
): ToastMessage {
  return {
    id: `toast-${++toastCounter}-${Date.now()}`,
    type,
    title,
    message,
    duration,
  };
}

// ==================== FILE INPUT ACCEPT STRING GENERATORS ====================

export function getAcceptString(types: FileType[]): string {
  const extensions: string[] = [];
  types.forEach(type => {
    const exts = ALLOWED_EXTENSIONS[type as keyof typeof ALLOWED_EXTENSIONS];
    if (exts) extensions.push(...exts);
  });
  return extensions.join(',');
}

export const ACCEPT_STRINGS = {
  media: getAcceptString(['video', 'audio', 'image']),
  video: getAcceptString(['video']),
  audio: getAcceptString(['audio']),
  image: getAcceptString(['image']),
  project: getAcceptString(['project']),
  all: '*/*',
};

// ==================== PROGRESS TRACKING ====================

export interface ProgressState {
  current: number;
  total: number;
  percentage: number;
  status: 'idle' | 'processing' | 'complete' | 'error';
  currentFile?: string;
  message?: string;
}

export function createProgressState(): ProgressState {
  return {
    current: 0,
    total: 0,
    percentage: 0,
    status: 'idle',
  };
}

export function updateProgress(
  state: ProgressState,
  current: number,
  total: number,
  currentFile?: string
): ProgressState {
  return {
    ...state,
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
    status: current >= total ? 'complete' : 'processing',
    currentFile,
  };
}
