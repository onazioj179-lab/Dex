// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * FILES - Smart File Browser with Advanced Search
 * Real file system access with Electron IPC
 * Auto-categorization, fast search by name/date/type/time
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useAppTracking, useFileTracking } from '../services/usePatternLearning';
import DexIcon from '../components/DexIcon';
import { useToastHelpers } from '../components/Toast';
import { getAppsForFile } from '../services/FileTypeRegistry';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useRecentFiles } from '../store/useRecentFiles';
import { useColorLabelsStore } from '../store/featureSuiteStore';

// ===========================================================================
// TYPES
// ===========================================================================

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  extension: string;
  category?: string;
}

interface QuickAccessItem {
  id: string;
  name: string;
  path: string;
  icon: string;
}

interface SmartCollection {
  id: string;
  name: string;
  icon: string;
  color: string;
  extensions: string[];
  count?: number;
}

interface SearchFilters {
  query: string;
  category: string;
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  sizeRange: 'all' | 'small' | 'medium' | 'large' | 'huge';
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortDir: 'asc' | 'desc';
}

// Color tags system (macOS Finder-style)
type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

// Smart Folders (saved search queries that auto-update)
interface SmartFolder {
  id: string;
  name: string;
  query: string;
  category: string;
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  sizeRange: 'all' | 'small' | 'medium' | 'large' | 'huge';
}

const TAG_COLORS: Record<TagColor, string> = {
  red: 'var(--color-error)', orange: 'var(--color-warning)', yellow: 'var(--color-tag-yellow, #ffcc00)',
  green: 'var(--color-success)', blue: 'var(--color-accent)', purple: 'var(--color-tag-purple, #af52de)', gray: 'var(--color-text-tertiary)',
};

const TAG_NAMES: Record<TagColor, string> = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple', gray: 'Gray',
};

// ===========================================================================
// QUICK ACCESS LOCATIONS
// ===========================================================================

const QUICK_ACCESS: QuickAccessItem[] = [
  { id: 'desktop', name: 'Desktop', path: 'desktop', icon: 'desktop' },
  { id: 'documents', name: 'Documents', path: 'documents', icon: 'folder' },
  { id: 'downloads', name: 'Downloads', path: 'downloads', icon: 'download' },
  { id: 'pictures', name: 'Pictures', path: 'pictures', icon: 'image' },
  { id: 'music', name: 'Music', path: 'music', icon: 'music' },
  { id: 'videos', name: 'Videos', path: 'videos', icon: 'video' },
];

// ===========================================================================
// SMART COLLECTIONS - Auto-categorize by file type
// ===========================================================================

const SMART_COLLECTIONS: SmartCollection[] = [
  { id: 'documents', name: 'Documents', icon: 'document', color: 'var(--color-accent)', 
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx'] },
  { id: 'images', name: 'Images', icon: 'image', color: 'var(--color-warning)', 
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff'] },
  { id: 'videos', name: 'Videos', icon: 'video', color: '#bf5af2', 
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'] },
  { id: 'audio', name: 'Audio', icon: 'music', color: '#ff375f', 
    extensions: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.wma'] },
  { id: 'code', name: 'Code', icon: 'code', color: 'var(--color-success)', 
    extensions: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml'] },
  { id: 'archives', name: 'Archives', icon: 'archive', color: '#5e5ce6', 
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'] },
];

// ===========================================================================
// ICONS
// ===========================================================================

const Icons: Record<string, React.FC<{ size?: number }>> = {
  folder: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#64d2ff">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  ),
  file: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6"/>
    </svg>
  ),
  desktop: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  download: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  ),
  image: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  music: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  video: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="20" height="20" rx="2.18"/>
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>
    </svg>
  ),
  back: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  ),
  forward: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  ),
  grid: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  list: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  search: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  code: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#bf5af2" strokeWidth="1.5">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
    </svg>
  ),
  pdf: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ff453a">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
      <path d="M14 2v6h6" fill="none" stroke="#ff453a" strokeWidth="1.5"/>
    </svg>
  ),
  document: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  archive: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
    </svg>
  ),
  filter: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
    </svg>
  ),
  calendar: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  sort: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 5h10M11 9h7M11 13h4M3 17l4 4 4-4M7 21V3"/>
    </svg>
  ),
  collection: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
    </svg>
  ),
  recent: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  ),
  close: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
};

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Files: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('files');
  const { trackFileOpen } = useFileTracking('files');
  const { launchApp } = useRunningApps();
  const addRecent = useRecentFiles(s => s.addRecent);
  const toast = useToastHelpers();

  // Progressive loading for large directories
  const ITEMS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]); // For smart collections
  const [selectedLocation, setSelectedLocation] = useState('documents');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'column'>('list');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [columnPath, setColumnPath] = useState<string[]>(['']); // For column view breadcrumb navigation
  
  // Smart Search & Filter state
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: 'all',
    dateRange: 'all',
    sizeRange: 'all',
    sortBy: 'name',
    sortDir: 'asc',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({});

  // Color tags (persisted in localStorage)
  const [fileTags, setFileTags] = useState<Record<string, TagColor>>(() => {
    try { return JSON.parse(localStorage.getItem('dex-file-tags') || '{}'); } catch { return {}; }
  });
  const [activeTagFilter, setActiveTagFilter] = useState<TagColor | null>(null);
  const [showTagPicker, setShowTagPicker] = useState<{ x: number; y: number; path: string } | null>(null);

  // Drag state for file move
  const [dragFile, setDragFile] = useState<FileItem | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  // Smart Folders (saved searches, persisted in localStorage)
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>(() => {
    try { return JSON.parse(localStorage.getItem('dex-smart-folders') || '[]'); } catch { return []; }
  });
  const [activeSmartFolder, setActiveSmartFolder] = useState<string | null>(null);

  const saveSmartFolder = useCallback(() => {
    if (!filters.query && filters.category === 'all' && filters.dateRange === 'all' && filters.sizeRange === 'all') return;
    const name = filters.query || `${filters.category} ${filters.dateRange}`.trim();
    const folder: SmartFolder = {
      id: Date.now().toString(36),
      name: name.slice(0, 40),
      query: filters.query,
      category: filters.category,
      dateRange: filters.dateRange,
      sizeRange: filters.sizeRange,
    };
    setSmartFolders(prev => {
      const next = [...prev, folder];
      localStorage.setItem('dex-smart-folders', JSON.stringify(next));
      return next;
    });
  }, [filters]);

  const deleteSmartFolder = useCallback((id: string) => {
    setSmartFolders(prev => {
      const next = prev.filter(f => f.id !== id);
      localStorage.setItem('dex-smart-folders', JSON.stringify(next));
      return next;
    });
    if (activeSmartFolder === id) setActiveSmartFolder(null);
  }, [activeSmartFolder]);

  const activateSmartFolder = useCallback((folder: SmartFolder) => {
    setActiveSmartFolder(folder.id);
    setFilters(prev => ({
      ...prev,
      query: folder.query,
      category: folder.category,
      dateRange: folder.dateRange,
      sizeRange: folder.sizeRange,
    }));
  }, []);

  const colorLabels = useColorLabelsStore();

  const setFileTag = useCallback((path: string, color: TagColor | null) => {
    setFileTags(prev => {
      const next = { ...prev };
      if (color === null) { delete next[path]; } else { next[path] = color; }
      localStorage.setItem('dex-file-tags', JSON.stringify(next));
      return next;
    });
    // Persist to backend ColorLabelManager
    if (color) {
      const name = path.split(/[\\/]/).pop() || path;
      colorLabels.setLabel('files', 'file', path, name, TAG_COLORS[color] ?? color);
    } else {
      colorLabels.removeLabel('files', 'file', path);
    }
    setShowTagPicker(null);
  }, [colorLabels]);

  const handleDragStart = useCallback((e: React.DragEvent, file: FileItem) => {
    setDragFile(file);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.path);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, file: FileItem) => {
    if (file.isDirectory && dragFile && dragFile.path !== file.path) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverPath(file.path);
    }
  }, [dragFile]);

  // Get file category
  const getFileCategory = useCallback((ext: string): string => {
    const extLower = ext.toLowerCase();
    for (const collection of SMART_COLLECTIONS) {
      if (collection.extensions.includes(extLower)) {
        return collection.id;
      }
    }
    return 'other';
  }, []);

  // Load files from the system
  const loadFiles = useCallback(async (location: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      if (window.electron?.invoke) {
        const result = await window.electron.invoke('files:list', location);
        if (result.success) {
          const filesWithCategory = result.files.map((f: Omit<FileItem, 'modified' | 'category'> & { modified: string }) => ({
            ...f,
            modified: new Date(f.modified),
            category: getFileCategory(f.extension || ''),
          }));
          setFiles(filesWithCategory);
          setAllFiles(filesWithCategory);
          setCurrentPath(result.path);
          
          // Update collection counts
          const counts: Record<string, number> = {};
          filesWithCategory.forEach((f: FileItem) => {
            if (!f.isDirectory && f.category) {
              counts[f.category] = (counts[f.category] || 0) + 1;
            }
          });
          setCollectionCounts(counts);
          
          // Track recent files (non-directories, sorted by modified date)
          const recent = filesWithCategory
            .filter((f: FileItem) => !f.isDirectory)
            .sort((a: FileItem, b: FileItem) => b.modified.getTime() - a.modified.getTime())
            .slice(0, 20);
          setRecentFiles(recent);
        }
      } else {
        // No files available - show empty state
        setFiles([]);
        setCurrentPath(`/${location}`);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      setLoadError('Unable to load files. Check folder permissions or try again.');
      toast.error('Failed to load files');
    }
    setLoading(false);
  }, [getFileCategory]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetDir: FileItem) => {
    e.preventDefault();
    setDragOverPath(null);
    if (!dragFile || !targetDir.isDirectory) return;
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('files:move', dragFile.path, targetDir.path);
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Move failed:', err);
      toast.error('Failed to move file');
    }
  }, [dragFile, currentPath, loadFiles]);

  useEffect(() => {
    loadFiles(selectedLocation);
  }, [selectedLocation, loadFiles]);

  // Quick Look – spacebar preview (macOS style)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' && !quickLookFile && selectedFile) {
        e.preventDefault();
        const file = files.find(f => f.path === selectedFile);
        if (file && !file.isDirectory) setQuickLookFile(file);
      } else if (e.key === ' ' && quickLookFile) {
        e.preventDefault();
        setQuickLookFile(null);
      } else if (e.key === 'Escape' && quickLookFile) {
        setQuickLookFile(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickLookFile, selectedFile, files]);

  const navigateTo = (path: string) => {
    const newHistory = [...history.slice(0, historyIndex + 1), path];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    loadFiles(path);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      loadFiles(history[historyIndex - 1]);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      loadFiles(history[historyIndex + 1]);
    }
  };

  const handleItemClick = (file: FileItem) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else {
      setSelectedFile(file.path);
      // Preview media files inline
      const ext = file.extension.toLowerCase();
      const previewable = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.webm', '.mp3', '.wav', '.m4a', '.ogg', '.pdf'];
      if (previewable.includes(ext)) {
        setPreviewFile(file);
      }
    }
  };

  const handleItemDoubleClick = async (file: FileItem) => {
    if (!file.isDirectory) {
      trackFileOpen(file.path);
      addRecent({ path: file.path, name: file.name, appId: 'files' });
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'filesOpened', amount: 1 } }));
      if (window.electron?.invoke) {
        await window.electron.invoke('shell:openPath', file.path);
      }
    }
  };

  // ===== FILE OPERATIONS =====
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);
  const [clipboard, setClipboard] = useState<{ file: FileItem; mode: 'copy' | 'cut' } | null>(null);

  const handleFileContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 200, menuH = 280;
    const x = Math.min(e.clientX, window.innerWidth - menuW);
    const y = Math.min(e.clientY, window.innerHeight - menuH);
    setContextMenu({ x, y, file });
  };

  const handleCopyFile = (file: FileItem) => {
    setClipboard({ file, mode: 'copy' });
    setContextMenu(null);
  };

  const handleCutFile = (file: FileItem) => {
    setClipboard({ file, mode: 'cut' });
    setContextMenu(null);
  };

  const handlePasteFile = async () => {
    if (!clipboard) return;
    try {
      if (window.electron?.invoke) {
        const dest = currentPath;
        if (clipboard.mode === 'copy') {
          await window.electron.invoke('files:copy', clipboard.file.path, dest);
        } else {
          await window.electron.invoke('files:move', clipboard.file.path, dest);
          setClipboard(null);
        }
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Paste failed:', err);
      toast.error('Paste operation failed');
    }
  };

  const handleCreateFolder = async () => {
    const name = window.prompt('New folder name:');
    if (!name?.trim()) return;
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('files:mkdir', `${currentPath}/${name.trim()}`);
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Create folder failed:', err);
      toast.error('Failed to create folder');
    }
  };

  // Keyboard shortcuts for file operations
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        handlePasteFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleCreateFolder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, handlePasteFile, handleCreateFolder]);

  const handleDeleteFile = async (file: FileItem) => {
    setContextMenu(null);
    const confirmed = window.confirm(`Move "${file.name}" to Trash?`);
    if (!confirmed) return;
    try {
      // Send to recycle bin first
      if ((window as any).dex?.invoke) {
        await (window as any).dex.invoke('recycle-bin:delete', 'files', file.isDirectory ? 'folder' : 'file', file.name, JSON.stringify({ path: file.path, size: file.size }), currentPath);
      }
      if (window.electron?.invoke) {
        await window.electron.invoke('files:delete', file.path);
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete file');
    }
  };

  const handleSelectFile = useCallback((path: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
    } else {
      setSelectedFiles(new Set());
      setSelectedFile(path);
    }
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    const confirmed = window.confirm(`Delete ${selectedFiles.size} selected items?`);
    if (!confirmed) return;
    for (const path of selectedFiles) {
      try {
        if (window.electron?.invoke) await window.electron.invoke('files:delete', path);
      } catch { toast.error(`Failed to delete ${path}`); }
    }
    setSelectedFiles(new Set());
    loadFiles(currentPath);
    toast.success(`Deleted ${selectedFiles.size} items`);
  }, [selectedFiles, currentPath, loadFiles, toast]);

  const handleRenameFile = async (file: FileItem) => {
    setContextMenu(null);
    const newName = window.prompt('Rename to:', file.name);
    if (!newName?.trim() || newName === file.name) return;
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('files:rename', file.path, newName.trim());
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Rename failed:', err);
      toast.error('Failed to rename file');
    }
  };

  const handleShowInExplorer = async (file: FileItem) => {
    setContextMenu(null);
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('shell:showItemInFolder', file.path);
      }
    } catch (err) {
      console.error('Show in explorer failed:', err);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const getFileIcon = (file: FileItem, size = 20) => {
    if (file.isDirectory) {
      const tagColor = fileTags[file.path] ? TAG_COLORS[fileTags[file.path]] : '#64d2ff';
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={tagColor}>
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
      );
    }
    const ext = file.extension.toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return <Icons.image size={size} />;
    if (['.mp3', '.wav', '.m4a', '.flac'].includes(ext)) return <Icons.music size={size} />;
    if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return <Icons.video size={size} />;
    if (['.js', '.ts', '.tsx', '.jsx', '.py', '.java'].includes(ext)) return <Icons.code size={size} />;
    if (ext === '.pdf') return <Icons.pdf size={size} />;
    return <Icons.file size={size} />;
  };

  // Smart filtering with multiple criteria
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // If viewing a smart collection, filter by category
    if (activeCollection) {
      if (activeCollection === 'recent') {
        return recentFiles;
      }
      result = result.filter(f => f.category === activeCollection);
    }

    // Color tag filter
    if (activeTagFilter) {
      result = result.filter(f => fileTags[f.path] === activeTagFilter);
    }

    // Text search (name, extension)
    if (filters.query) {
      const query = filters.query.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(query) ||
        f.extension.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      result = result.filter(f => f.category === filters.category);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      switch (filters.dateRange) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          cutoff.setFullYear(now.getFullYear() - 1);
          break;
      }
      result = result.filter(f => f.modified >= cutoff);
    }

    // Size range filter
    if (filters.sizeRange !== 'all') {
      switch (filters.sizeRange) {
        case 'small': // < 100KB
          result = result.filter(f => f.size < 100 * 1024);
          break;
        case 'medium': // 100KB - 10MB
          result = result.filter(f => f.size >= 100 * 1024 && f.size < 10 * 1024 * 1024);
          break;
        case 'large': // 10MB - 1GB
          result = result.filter(f => f.size >= 10 * 1024 * 1024 && f.size < 1024 * 1024 * 1024);
          break;
        case 'huge': // > 1GB
          result = result.filter(f => f.size >= 1024 * 1024 * 1024);
          break;
      }
    }

    // Sorting
    result.sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      
      let comparison = 0;
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = a.modified.getTime() - b.modified.getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.extension.localeCompare(b.extension);
          break;
      }
      return filters.sortDir === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [files, filters, activeCollection, recentFiles, activeTagFilter, fileTags]);

  // Progressive loading: only render visible subset
  const visibleFiles = useMemo(() => filteredFiles.slice(0, visibleCount), [filteredFiles, visibleCount]);
  const hasMoreFiles = visibleCount < filteredFiles.length;

  // Reset visible count when directory or filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [currentPath, filters, activeCollection, activeTagFilter]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreFiles) {
          setVisibleCount(c => c + ITEMS_PER_PAGE);
        }
      },
      { rootMargin: '200px' }
    );
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => observer.disconnect();
  }, [hasMoreFiles]);

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.path)));
  }, [filteredFiles]);

  const workspaceMetrics = useMemo(() => {
    const visibleDirectories = filteredFiles.filter(file => file.isDirectory).length;
    const visibleDocuments = filteredFiles.filter(file => !file.isDirectory).length;
    const visibleSizeBytes = filteredFiles.reduce((total, file) => total + (file.isDirectory ? 0 : file.size), 0);
    const taggedItems = Object.keys(fileTags).length;

    return {
      visibleDirectories,
      visibleDocuments,
      visibleSize: formatSize(visibleSizeBytes),
      taggedItems,
    };
  }, [filteredFiles, fileTags]);

  // Clear collection view
  const clearCollection = () => {
    setActiveCollection(null);
  };

  return (
    <div style={styles.container}>
      <style>{`
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input:focus { outline: none; }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Files</span>
        </div>
        
        <div style={styles.sidebarSection}>
          <div style={styles.sectionLabel}>Favorites</div>
          {QUICK_ACCESS.map(item => {
            const Icon = Icons[item.icon] || Icons.folder;
            const isActive = selectedLocation === item.path && !activeCollection;
            return (
              <button
                key={item.id}
                style={{
                  ...styles.sidebarItem,
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                }}
                onClick={() => {
                  setSelectedLocation(item.path);
                  setSelectedFile(null);
                  setActiveCollection(null);
                }}
                aria-label={item.name}
              >
                <Icon size={16} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        {/* Smart Collections */}
        <div style={styles.sidebarSection}>
          <div style={styles.sectionLabel}>Smart Collections</div>
          <button
            style={{
              ...styles.sidebarItem,
              background: activeCollection === 'recent' ? 'var(--color-accent-soft)' : 'transparent',
              color: activeCollection === 'recent' ? 'var(--color-accent)' : 'var(--color-text-primary)',
            }}
            onClick={() => setActiveCollection('recent')}
            aria-label="Recent files"
          >
            <Icons.recent size={16} />
            <span>Recent</span>
            {recentFiles.length > 0 && (
              <span style={styles.badge}>{recentFiles.length}</span>
            )}
          </button>
          {SMART_COLLECTIONS.map(collection => {
            const Icon = Icons[collection.icon] || Icons.folder;
            const isActive = activeCollection === collection.id;
            const count = collectionCounts[collection.id] || 0;
            return (
              <button
                key={collection.id}
                style={{
                  ...styles.sidebarItem,
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? collection.color : 'var(--color-text-primary)',
                }}
                onClick={() => setActiveCollection(collection.id)}
                aria-label={collection.name}
              >
                <div style={{ color: collection.color }}><Icon size={16} /></div>
                <span>{collection.name}</span>
                {count > 0 && <span style={styles.badge}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Color Tags */}
        <div style={styles.sidebarSection}>
          <div style={styles.sectionLabel}>Tags</div>
          {(Object.entries(TAG_COLORS) as [TagColor, string][]).map(([tag, color]) => {
            const count = Object.values(fileTags).filter(t => t === tag).length;
            const isActive = activeTagFilter === tag;
            return (
              <button
                key={tag}
                style={{
                  ...styles.sidebarItem,
                  background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                  color: isActive ? color : 'var(--color-text-primary)',
                }}
                onClick={() => setActiveTagFilter(isActive ? null : tag)}
                aria-label={`Filter by ${TAG_NAMES[tag]} tag`}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span>{TAG_NAMES[tag]}</span>
                {count > 0 && <span style={styles.badge}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Smart Folders */}
        <div style={styles.sidebarSection}>
          <div style={{ ...styles.sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Smart Folders</span>
            <button
              onClick={saveSmartFolder}
              title="Save current search as Smart Folder"
              aria-label="Save current search as smart folder"
              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
            >+</button>
          </div>
          {smartFolders.map(sf => (
            <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                style={{
                  ...styles.sidebarItem,
                  flex: 1,
                  background: activeSmartFolder === sf.id ? 'var(--color-accent-soft)' : 'transparent',
                  color: activeSmartFolder === sf.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
                }}
                onClick={() => activateSmartFolder(sf)}
                aria-label={`Open smart folder ${sf.name}`}
              >
                <DexIcon name="search" size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.name}</span>
              </button>
              <button
                onClick={() => deleteSmartFolder(sf.id)}
                aria-label={`Delete smart folder ${sf.name}`}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', flexShrink: 0 }}
              ><DexIcon name="close" size={11} /></button>
            </div>
          ))}
          {smartFolders.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 12px' }}>
              Set filters and click + to save
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.navButtons}>
            <button 
              style={{...styles.navBtn, opacity: historyIndex <= 0 ? 0.3 : 1}} 
              onClick={goBack}
              disabled={historyIndex <= 0}
              aria-label="Navigate back"
            >
              <Icons.back size={16} />
            </button>
            <button 
              style={{...styles.navBtn, opacity: historyIndex >= history.length - 1 ? 0.3 : 1}} 
              onClick={goForward}
              disabled={historyIndex >= history.length - 1}
              aria-label="Navigate forward"
            >
              <Icons.forward size={16} />
            </button>
          </div>
          
          <div style={styles.pathBar}>
            {activeCollection ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: SMART_COLLECTIONS.find(c => c.id === activeCollection)?.color || 'var(--color-accent)' }}>
                  {activeCollection === 'recent' ? 'Recent Files' : SMART_COLLECTIONS.find(c => c.id === activeCollection)?.name || activeCollection}
                </span>
                <button 
                  onClick={clearCollection}
                  style={{ ...styles.navBtn, padding: 4 }}
                  title="Clear filter"
                  aria-label="Clear filter"
                >
                  <Icons.close size={12} />
                </button>
              </div>
            ) : (
              <span style={styles.pathText}>{currentPath || `/${selectedLocation}`}</span>
            )}
          </div>
          
          <div style={styles.toolbarRight}>
            {/* Smart Search */}
            <div style={styles.searchBox}>
              <Icons.search size={14} />
              <input
                type="text"
                placeholder="Search by name, type..."
                value={filters.query}
                onChange={(e) => setFilters(f => ({ ...f, query: e.target.value }))}
                style={styles.searchInput}
              />
              {filters.query && (
                <button
                  onClick={() => setFilters(f => ({ ...f, query: '' }))}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0 }}
                  aria-label="Clear search"
                >
                  <Icons.close size={12} />
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <button
              style={{
                ...styles.navBtn,
                background: showFilters ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: showFilters ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle filters"
              aria-label="Toggle filters"
            >
              <Icons.filter size={14} />
            </button>
            
            {/* Sort */}
            <button
              style={styles.navBtn}
              onClick={() => setFilters(f => ({ ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }))}
              title={`Sort ${filters.sortDir === 'asc' ? 'descending' : 'ascending'}`}
              aria-label={`Sort ${filters.sortDir === 'asc' ? 'descending' : 'ascending'}`}
            >
              <Icons.sort size={14} />
            </button>
            
            {/* New Folder */}
            <button
              style={styles.navBtn}
              onClick={handleCreateFolder}
              title="New Folder (Ctrl+Shift+N)"
              aria-label="Create new folder"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </button>

            {/* Organize by Type */}
            <button
              style={styles.navBtn}
              onClick={async () => {
                if (!currentPath) return;
                const ok = confirm('Organize files in this folder into Audio, Video, Images, Documents, Archives, and Other subfolders?');
                if (!ok) return;
                try {
                  if (window.electron?.invoke) {
                    await window.electron.invoke('files:organizeByType', currentPath);
                    loadFiles(currentPath);
                  }
                } catch (e) { console.warn('[Files] organizeByType failed:', e); }
              }}
              title="Organize files by type (Audio, Video, Images...)"
              aria-label="Organize files by type"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>

            {/* Paste */}
            {clipboard && (
              <button
                style={{ ...styles.navBtn, color: 'var(--color-accent)' }}
                onClick={handlePasteFile}
                title={`Paste "${clipboard.file.name}" (Ctrl+V)`}
                aria-label="Paste file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              </button>
            )}
            
            <div style={styles.viewToggle}>
              <button
                style={{...styles.viewBtn, background: viewMode === 'list' ? 'var(--color-border)' : 'transparent'}}
                onClick={() => setViewMode('list')}
                aria-label="Toggle list view"
              >
                <Icons.list size={14} />
              </button>
              <button
                style={{...styles.viewBtn, background: viewMode === 'grid' ? 'var(--color-border)' : 'transparent'}}
                onClick={() => setViewMode('grid')}
                aria-label="Toggle grid view"
              >
                <Icons.grid size={14} />
              </button>
              <button
                style={{...styles.viewBtn, background: viewMode === 'column' ? 'var(--color-border)' : 'transparent'}}
                onClick={() => { setViewMode('column'); setColumnPath([currentPath || '']); }}
                aria-label="Toggle column view"
                title="Column view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="3" width="6" height="18" rx="1"/><rect x="16" y="3" width="6" height="18" rx="1"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div style={styles.summaryStrip}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Path</span>
            <span style={styles.summaryValue}>{activeCollection ? (activeCollection === 'recent' ? 'Recent files' : SMART_COLLECTIONS.find(collection => collection.id === activeCollection)?.name || activeCollection) : (currentPath || `/${selectedLocation}`)}</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Folders</span>
            <span style={styles.summaryValue}>{workspaceMetrics.visibleDirectories}</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Files</span>
            <span style={styles.summaryValue}>{workspaceMetrics.visibleDocuments}</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Visible Size</span>
            <span style={styles.summaryValue}>{workspaceMetrics.visibleSize}</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Tagged</span>
            <span style={styles.summaryValue}>{workspaceMetrics.taggedItems}</span>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div style={styles.filterBar}>
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Date:</span>
              {(['all', 'today', 'week', 'month', 'year'] as const).map(range => (
                <button
                  key={range}
                  style={{
                    ...styles.filterBtn,
                    background: filters.dateRange === range ? 'var(--color-accent-soft)' : 'var(--color-bg-hover)',
                  }}
                  onClick={() => setFilters(f => ({ ...f, dateRange: range }))}
                  aria-label={`Filter by date: ${range === 'all' ? 'All' : range}`}
                >
                  {range === 'all' ? 'All' : range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Size:</span>
              {(['all', 'small', 'medium', 'large', 'huge'] as const).map(size => (
                <button
                  key={size}
                  style={{
                    ...styles.filterBtn,
                    background: filters.sizeRange === size ? 'var(--color-accent-soft)' : 'var(--color-bg-hover)',
                  }}
                  onClick={() => setFilters(f => ({ ...f, sizeRange: size }))}
                  aria-label={`Filter by size: ${size}`}
                >
                  {size === 'all' ? 'All' : size === 'small' ? '<100KB' : size === 'medium' ? '100KB-10MB' : size === 'large' ? '10MB-1GB' : '>1GB'}
                </button>
              ))}
            </div>
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Sort by:</span>
              {(['name', 'date', 'size', 'type'] as const).map(sort => (
                <button
                  key={sort}
                  style={{
                    ...styles.filterBtn,
                    background: filters.sortBy === sort ? 'var(--color-accent-soft)' : 'var(--color-bg-hover)',
                  }}
                  onClick={() => setFilters(f => ({ ...f, sortBy: sort }))}
                  aria-label={`Sort by ${sort}`}
                >
                  {sort.charAt(0).toUpperCase() + sort.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Batch Action Bar */}
        {selectedFiles.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--color-bg-surface-solid)', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600 }}>{selectedFiles.size} selected</span>
            <button onClick={handleBatchDelete} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--color-error-muted)', border: '1px solid rgba(255,69,58,0.35)', color: 'var(--color-error)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            <button onClick={() => { selectedFiles.forEach(p => navigator.clipboard.writeText(p)); toast.success('Paths copied'); }} style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--color-border-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Copy Paths</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => handleSelectAll()} style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Select All</button>
            <button onClick={() => setSelectedFiles(new Set())} style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Clear</button>
          </div>
        )}

        {/* File List */}
        <div style={styles.content}>
          {loadError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: '8px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--color-error-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>Failed to load files</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #8a8a8a)', textAlign: 'center', maxWidth: 280 }}>{loadError}</span>
              <button onClick={() => loadFiles(currentPath || selectedLocation)} style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, background: 'var(--color-accent, #0a84ff)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
            </div>
          ) : loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--color-border-subtle)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.06}s` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 12, borderRadius: 4, background: 'var(--color-bg-hover)' }} />
                  <div style={{ width: 60, height: 10, borderRadius: 4, background: 'var(--color-border-subtle)' }} />
                </div>
              ))}
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
          ) : viewMode === 'list' ? (
            <div style={styles.listContainer}>
              {/* Header */}
              <div style={styles.listHeader}>
                <span style={{ flex: 1 }}>Name</span>
                <span style={{ width: 60 }}>Type</span>
                <span style={{ width: 100 }}>Date Modified</span>
                <span style={{ width: 80, textAlign: 'right' }}>Size</span>
              </div>
              
              {/* Files */}
              {filteredFiles.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: '8px' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(10,132,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>This folder is empty</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #8a8a8a)' }}>Drop files here or navigate to another folder</span>
                  <button onClick={() => { (window as any).electron?.invoke?.('dialog:open', { properties: ['openFile', 'multiSelections'] }); }} style={{ marginTop: 8, padding: '6px 16px', borderRadius: 8, background: 'var(--color-accent, #0a84ff)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add Files</button>
                </div>
              ) : visibleFiles.map((file, idx) => (
                <div
                  key={file.path}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file)}
                  onDragOver={(e) => handleDragOver(e, file)}
                  onDragLeave={() => setDragOverPath(null)}
                  onDrop={(e) => handleDrop(e, file)}
                  onDragEnd={() => { setDragFile(null); setDragOverPath(null); }}
                  style={{
                    ...styles.listRow,
                    background: dragOverPath === file.path
                      ? 'var(--color-accent-soft)'
                      : selectedFile === file.path 
                        ? 'var(--color-bg-active)' 
                        : 'var(--color-bg-surface-solid)',
                    outline: dragOverPath === file.path ? '2px solid var(--color-accent)' : 'none',
                    borderRadius: dragOverPath === file.path ? 6 : 0,
                  }}
                  onClick={() => handleItemClick(file)}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div style={styles.fileName}>
                    {getFileIcon(file)}
                    <span>{file.name}</span>
                    {fileTags[file.path] && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAG_COLORS[fileTags[file.path]], flexShrink: 0 }} />
                    )}
                  </div>
                  <span style={{...styles.fileMeta, width: 60}}>{file.isDirectory ? 'Folder' : file.extension.replace('.', '').toUpperCase()}</span>
                  <span style={styles.fileMeta}>{formatDate(file.modified)}</span>
                  <span style={{...styles.fileMeta, width: 80, textAlign: 'right'}}>{file.isDirectory ? '--' : formatSize(file.size)}</span>
                </div>
              ))}
            </div>
          ) : viewMode === 'column' ? (
            <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
              {columnPath.map((colPath, colIdx) => {
                const colFiles = colIdx === 0 ? filteredFiles : files.filter(() => true);
                return (
                  <div key={colIdx} style={{
                    minWidth: 200, maxWidth: 260, borderRight: '1px solid var(--color-border, var(--color-border-subtle))',
                    flexShrink: 0, overflow: 'auto', background: colIdx % 2 === 0 ? 'var(--color-bg-surface-solid)' : 'var(--color-bg-secondary)',
                  }}>
                    {(colIdx === 0 ? filteredFiles : []).map(file => (
                      <div
                        key={file.path}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                          background: selectedFile === file.path ? 'var(--color-bg-active)' : 'transparent',
                        }}
                        onClick={() => {
                          handleItemClick(file);
                          if (file.isDirectory) {
                            setColumnPath(prev => [...prev.slice(0, colIdx + 1), file.path]);
                          }
                        }}
                        onDoubleClick={() => handleItemDoubleClick(file)}
                      >
                        {getFileIcon(file)}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{file.name}</span>
                        {file.isDirectory && <span style={{ opacity: 0.4, display: 'inline-flex' }}><DexIcon name="chevron-right" size={10} /></span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.gridContainer}>
              {filteredFiles.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: '8px', gridColumn: '1 / -1' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(10,132,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>This folder is empty</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #8a8a8a)' }}>Drop files here to get started</span>
                  <button onClick={() => { (window as any).electron?.invoke?.('dialog:open', { properties: ['openFile', 'multiSelections'] }); }} style={{ marginTop: 4, padding: '6px 16px', borderRadius: 8, background: 'var(--color-accent, #0a84ff)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add Files</button>
                </div>
              ) : visibleFiles.map(file => (
                <div
                  key={file.path}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file)}
                  onDragOver={(e) => handleDragOver(e, file)}
                  onDragLeave={() => setDragOverPath(null)}
                  onDrop={(e) => handleDrop(e, file)}
                  onDragEnd={() => { setDragFile(null); setDragOverPath(null); }}
                  style={{
                    ...styles.gridItem,
                    background: dragOverPath === file.path
                      ? 'var(--color-accent-soft)'
                      : selectedFile === file.path ? 'var(--color-bg-active)' : 'var(--color-bg-surface-solid)',
                    outline: dragOverPath === file.path ? '2px solid var(--color-accent)' : 'none',
                  }}
                  onClick={() => handleItemClick(file)}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div style={styles.gridIcon}>
                    {file.isDirectory ? getFileIcon(file, 48) : getFileIcon(file)}
                  </div>
                  <span style={styles.gridLabel}>{file.name}</span>
                  {!file.isDirectory && (
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary, #666)', marginTop: -2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%' }}>
                      {file.extension.replace('.', '').toUpperCase()}{file.size > 0 ? ` · ${formatSize(file.size)}` : ''}
                    </span>
                  )}
                  {fileTags[file.path] && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAG_COLORS[fileTags[file.path]] }} />
                  )}
                </div>
              ))}
              {/* Load more trigger for infinite scroll */}
              {hasMoreFiles && (
                <div
                  ref={loadMoreRef}
                  style={{
                    gridColumn: '1 / -1',
                    padding: '16px',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: 12,
                  }}
                >
                  Loading more ({filteredFiles.length - visibleCount} remaining)...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span>{filteredFiles.length} items{workspaceMetrics.visibleDocuments > 0 ? ` · ${workspaceMetrics.visibleSize}` : ''}</span>
        </div>
      </div>

      {/* Quick Look Overlay (Spacebar) */}
      {quickLookFile && (
        <div
          onClick={() => setQuickLookFile(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(8, 8, 10, 0.86)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-bg-elevated, #2c2c2e)', borderRadius: 12,
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)', overflow: 'hidden', maxWidth: '80vw', maxHeight: '80vh',
          }}>
            {/* Quick Look header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--color-border, var(--color-border-subtle))' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{quickLookFile.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{formatSize(quickLookFile.size)}</span>
                <button onClick={() => setQuickLookFile(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16 }} aria-label="Close Quick Look"><DexIcon name="close" size={14} /></button>
              </div>
            </div>
            {/* Quick Look content */}
            <div style={{ padding: 16, textAlign: 'center' }}>
              {['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(quickLookFile.extension.toLowerCase()) && (
                <img src={`file://${quickLookFile.path.replace(/\\/g, '/')}`} alt={quickLookFile.name} style={{ maxWidth: '70vw', maxHeight: '65vh', objectFit: 'contain', borderRadius: 4 }} />
              )}
              {['.mp4', '.mov', '.webm'].includes(quickLookFile.extension.toLowerCase()) && (
                <video src={`file://${quickLookFile.path.replace(/\\/g, '/')}`} controls autoPlay style={{ maxWidth: '70vw', maxHeight: '65vh', borderRadius: 4 }} />
              )}
              {['.mp3', '.wav', '.m4a', '.ogg'].includes(quickLookFile.extension.toLowerCase()) && (
                <div style={{ padding: 32 }}>
                  <div style={{ marginBottom: 16 }}><DexIcon name="music" size={48} /></div>
                  <div style={{ marginBottom: 16, color: 'var(--color-text-primary)' }}>{quickLookFile.name}</div>
                  <audio src={`file://${quickLookFile.path.replace(/\\/g, '/')}`} controls autoPlay style={{ width: 320 }} />
                </div>
              )}
              {['.txt', '.md', '.json', '.js', '.ts', '.css', '.html'].includes(quickLookFile.extension.toLowerCase()) && (
                <div style={{ textAlign: 'left', padding: 16, background: 'var(--color-bg-primary)', borderRadius: 8, maxHeight: '60vh', overflow: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' as const, color: 'var(--color-text-primary)' }}>
                  {/* Text file preview - content loaded on demand */}
                  <span style={{ opacity: 0.5 }}>Text preview for {quickLookFile.name}</span>
                </div>
              )}
              {['.pdf'].includes(quickLookFile.extension.toLowerCase()) && (
                <iframe src={`file://${quickLookFile.path.replace(/\\/g, '/')}`} style={{ width: '70vw', height: '65vh', border: 'none', borderRadius: 4 }} title={quickLookFile.name} />
              )}
            </div>
            {/* Quick Look footer */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 12px', gap: 12, borderTop: '1px solid var(--color-border, var(--color-border-subtle))' }}>
              <button
                onClick={() => { handleItemDoubleClick(quickLookFile); setQuickLookFile(null); }}
                style={{ padding: '5px 16px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
              >Open</button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div 
          onClick={() => setPreviewFile(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(8, 8, 10, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setPreviewFile(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'var(--color-border)',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close preview"
          >
            <Icons.close size={20} />
          </button>
          <div style={{ textAlign: 'center', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            {/* Image Preview */}
            {['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(previewFile.extension.toLowerCase()) && (
              <img
                src={`file://${previewFile.path.replace(/\\/g, '/')}`}
                alt={previewFile.name}
                style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
              />
            )}
            {/* Video Preview */}
            {['.mp4', '.mov', '.webm'].includes(previewFile.extension.toLowerCase()) && (
              <video
                src={`file://${previewFile.path.replace(/\\/g, '/')}`}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }}
              />
            )}
            {/* Audio Preview */}
            {['.mp3', '.wav', '.m4a', '.ogg'].includes(previewFile.extension.toLowerCase()) && (
              <div style={{ background: 'var(--color-bg-elevated)', padding: 32, borderRadius: 12 }}>
                <Icons.music size={64} />
                <div style={{ marginTop: 16, marginBottom: 16, color: 'var(--color-text-primary)', fontSize: 16 }}>{previewFile.name}</div>
                <audio src={`file://${previewFile.path.replace(/\\/g, '/')}`} controls autoPlay style={{ width: 300 }} />
              </div>
            )}
            {/* File Name */}
            <div style={{ marginTop: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
              {previewFile.name} - {formatSize(previewFile.size)}
            </div>
          </div>
        </div>
      )}

      {/* File Context Menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-max)' }} onMouseDown={() => setContextMenu(null)}>
          <div style={{
            position: 'absolute', left: contextMenu.x, top: contextMenu.y,
            background: 'var(--color-bg-elevated, #1c1c1e)', border: '1px solid var(--color-border, var(--color-border))',
            borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: '180px',
          }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => handleItemDoubleClick(contextMenu.file)} aria-label={`Open ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Open
            </button>
            {!contextMenu.file.isDirectory && (() => {
              const apps = getAppsForFile(contextMenu.file.name);
              return apps.length > 0 ? (
                <>
                  <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>Open With</div>
                  {apps.map(appId => {
                    const def = APP_DEFINITIONS[appId];
                    if (!def) return null;
                    return (
                      <button
                        key={appId}
                        onClick={() => {
                          launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
                          setContextMenu(null);
                        }}
                        style={{ display: 'block', width: '100%', padding: '6px 16px 6px 28px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}
                      >
                        {def.name}
                      </button>
                    );
                  })}
                  <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
                </>
              ) : null;
            })()}
            <button onClick={() => handleShowInExplorer(contextMenu.file)} aria-label={`Show ${contextMenu.file.name} in Explorer`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Show in Explorer
            </button>
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <button onClick={() => handleCopyFile(contextMenu.file)} aria-label={`Copy ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Copy
            </button>
            <button onClick={() => handleCutFile(contextMenu.file)} aria-label={`Cut ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Cut
            </button>
            {clipboard && (
              <button onClick={() => { handlePasteFile(); setContextMenu(null); }} aria-label="Paste file" style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
                Paste "{clipboard.file.name}"
              </button>
            )}
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>Tags</div>
            <div style={{ display: 'flex', gap: 4, padding: '2px 16px 6px' }}>
              {(Object.entries(TAG_COLORS) as [TagColor, string][]).map(([tag, color]) => (
                <button
                  key={tag}
                  onClick={() => setFileTag(contextMenu.file.path, fileTags[contextMenu.file.path] === tag ? null : tag)}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', background: color, border: fileTags[contextMenu.file.path] === tag ? '2px solid #fff' : '1px solid var(--color-text-tertiary)',
                    cursor: 'pointer', padding: 0,
                  }}
                  aria-label={`Tag ${TAG_NAMES[tag]}`}
                />
              ))}
            </div>
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <button onClick={() => handleRenameFile(contextMenu.file)} aria-label={`Rename ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Rename
            </button>
            <button onClick={() => handleDeleteFile(contextMenu.file)} aria-label={`Delete ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--color-error)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    background: 'var(--pg-surface)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    overflow: 'hidden',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: 'var(--pg-sidebar-width)',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--pg-sidebar)',
    borderRight: '1px solid var(--pg-border)',
  },
  sidebarHeader: {
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    borderBottom: '1px solid var(--pg-border)',
  },
  sidebarTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  sidebarSection: {
    padding: '8px',
  },
  sectionLabel: {
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    padding: '12px 10px 4px',
    letterSpacing: '0.8px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 12px',
    height: 'var(--pg-row-height)',
    borderRadius: 'var(--pg-row-radius)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12.5px',
    width: '100%',
    textAlign: 'left',
    transition: 'background-color 0.12s ease, color 0.12s ease',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary)',
  },
  
  // Toolbar
  toolbar: {
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    gap: '8px',
    borderBottom: '1px solid var(--pg-border)',
    background: 'var(--pg-toolbar)',
    backdropFilter: 'blur(18px) saturate(170%)',
    WebkitBackdropFilter: 'blur(18px) saturate(170%)',
  },
  navButtons: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  pathBar: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  pathText: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    padding: '8px 12px',
    width: '240px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    padding: '2px',
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Content
  content: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--color-bg-secondary)',
  },
  summaryStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    padding: '14px 16px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
  },
  summaryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: 'var(--color-bg-surface-solid)',
    border: '1px solid var(--color-border)',
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  summaryValue: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--color-text-muted)',
  },
  
  // List view
  listContainer: {
    padding: '12px 14px 16px',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    background: 'var(--color-bg-surface-solid)',
    borderRadius: '12px 12px 0 0',
    zIndex: 1,
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    borderBottom: '1px solid var(--color-border-subtle)',
    // Performance: skip rendering for offscreen items
    contentVisibility: 'auto' as any,
    containIntrinsicSize: '0 48px' as any,
    contain: 'layout style' as any,
  },
  fileName: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  fileMeta: {
    width: 100,
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  
  // Grid view
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '14px',
    padding: '16px',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '18px 12px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.1s',
    border: '1px solid var(--color-border)',
    // Performance: skip rendering for offscreen items
    contentVisibility: 'auto' as any,
    containIntrinsicSize: '140px 120px' as any,
    contain: 'layout style' as any,
  },
  gridIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: '11px',
    textAlign: 'center',
    color: 'var(--color-text-primary)',
    wordBreak: 'break-word',
    maxWidth: '100%',
  },
  
  // Status bar
  statusBar: {
    minHeight: '32px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface-solid)',
  },

  // Smart Collections badge
  badge: {
    marginLeft: 'auto',
    background: 'var(--color-bg-hover)',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    color: 'var(--color-text-secondary)',
  },

  // Filter bar
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface-solid)',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterLabel: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginRight: '4px',
  },
  filterBtn: {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

Files.displayName = 'Files';
export default memo(Files);
