// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * FILES - Smart File Browser with Advanced Search
 * Real file system access with Electron IPC
 * Auto-categorization, fast search by name/date/type/time
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { clampEventToViewport } from '../utils/menuPosition';
import { formatBytes } from '../../shared/format/units';
import { naturalCompare } from '../../shared/format/naturalSort';
import { useAppTracking, useFileTracking } from '../services/usePatternLearning';
import DexIcon from '../components/DexIcon';
import { DexSearchInput } from '../styles/components';
import { useToastHelpers } from '../components/Toast';
import { getAppsForFile, inferCategoryFromFilename } from '../services/FileTypeRegistry';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useRecentFiles } from '../store/useRecentFiles';
import { useLiveActivityStore } from '../store/liveActivityStore';
import { useColorLabelsStore } from '../store/featureSuiteStore';
import { useConfirm } from '../components/ConfirmDialog';
import { usePinRegistry } from '../store/pinRegistry';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../uki/appActionRegistry';
import { useDexSetting, readDexSetting } from '../hooks/useDexSetting';

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
  /** Dotfile or Windows HIDDEN/SYSTEM attribute (from files:list). */
  hidden?: boolean;
}

/** Settings > Files > Thumbnail Size -> grid tile width. */
const THUMB_TILE: Record<string, number> = { small: 110, medium: 140, large: 190 };

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
// BREADCRUMB - Clickable path segments for ancestor navigation
// ===========================================================================

interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

const Breadcrumb: React.FC<BreadcrumbProps> = memo(({ path, onNavigate }) => {
  // Detect the separator actually used by the resolved OS path so reconstructed
  // ancestor paths round-trip cleanly back through files:list.
  const sep = path.includes('\\') ? '\\' : '/';
  const isWindowsDrive = /^[a-zA-Z]:[\\/]?/.test(path);
  const leadingSlash = !isWindowsDrive && path.startsWith('/');

  const rawSegments = path.split(/[\\/]+/).filter(Boolean);

  // Build cumulative ancestor paths for each visible segment.
  const crumbs = rawSegments.map((segment, idx) => {
    const upto = rawSegments.slice(0, idx + 1);
    let full: string;
    if (isWindowsDrive && idx === 0) {
      // First crumb on Windows is the drive (e.g. "C:") -> "C:\"
      full = `${segment}${sep}`;
    } else if (isWindowsDrive) {
      full = upto.join(sep);
    } else {
      full = `${leadingSlash ? sep : ''}${upto.join(sep)}`;
    }
    return { label: segment, full };
  });

  if (crumbs.length === 0) {
    return <span style={styles.pathText}>{path}</span>;
  }

  return (
    <div style={styles.breadcrumb}>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.full}>
            <button
              type="button"
              className="dex-crumb"
              style={{
                ...styles.breadcrumbSegment,
                color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontWeight: isLast ? 600 : 500,
                cursor: isLast ? 'default' : 'pointer',
              }}
              onClick={() => { if (!isLast) onNavigate(crumb.full); }}
              disabled={isLast}
              title={crumb.full}
              aria-label={`Navigate to ${crumb.label}`}
            >
              {crumb.label}
            </button>
            {!isLast && <span style={styles.breadcrumbSep} aria-hidden="true">/</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
});
Breadcrumb.displayName = 'Breadcrumb';

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Files: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm();
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
  const [columnPath, setColumnPath] = useState<string[]>(['']); // For column view breadcrumb navigation
  // Column view (Miller columns): per-path entry cache + in-flight set so each
  // pushed column loads its own directory listing via the same files:list API.
  const [columnData, setColumnData] = useState<Record<string, FileItem[]>>({});
  const [columnLoading, setColumnLoading] = useState<Set<string>>(new Set());

  // Inline rename state (v2): when set, the matching row renders an <input>
  // instead of the static filename span. Replaces the legacy window.prompt UX.
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');

  // Inline new-folder input state — replaces window.prompt
  const [folderNameDraft, setFolderNameDraft] = useState<string | null>(null);

  // Pin Registry (v2): unified cross-shell pinning. Used here for folder pinning
  // from the Quick Actions row. Live list is read for the "Pinned" indicator.
  const pinFolder = usePinRegistry(s => s.pinFolder);
  const unpinRegistry = usePinRegistry(s => s.unpin);
  const pinnedFolders = usePinRegistry(s => s.listByKind('folder'));
  
  // Smart Search & Filter state. Sort preference (by/direction) is persisted in
  // localStorage so the chosen ordering survives reloads, consistent with the
  // page's other dex-* prefs (tags, smart folders).
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const settingSort = readDexSetting<string>('sortBy', 'name');
    let sortBy: SearchFilters['sortBy'] = (['name', 'date', 'size', 'type'] as const).includes(settingSort as SearchFilters['sortBy'])
      ? settingSort as SearchFilters['sortBy'] : 'name';
    let sortDir: SearchFilters['sortDir'] = 'asc';
    try {
      const saved = JSON.parse(localStorage.getItem('dex-files-sort') || '{}');
      if (saved && (['name', 'date', 'size', 'type'] as const).includes(saved.sortBy)) sortBy = saved.sortBy;
      if (saved && (['asc', 'desc'] as const).includes(saved.sortDir)) sortDir = saved.sortDir;
    } catch { /* fall back to defaults */ }
    return {
      query: '',
      category: 'all',
      dateRange: 'all',
      sizeRange: 'all',
      sortBy,
      sortDir,
    };
  });

  // Settings > Files. Read live so changing them in Settings applies at once.
  const showHiddenFiles = useDexSetting<boolean>('showHiddenFiles', false);
  const confirmDeleteSetting = useDexSetting<boolean>('confirmDelete', true);
  const thumbnailSize = useDexSetting<string>('thumbnailSize', 'medium');
  const settingSortBy = useDexSetting<string>('sortBy', 'name');
  const firstSortSync = useRef(true);
  useEffect(() => {
    // Changing "Sort By" in Settings re-sorts Files; the initial value is
    // already applied above (without overriding a sort picked in Files).
    if (firstSortSync.current) { firstSortSync.current = false; return; }
    if ((['name', 'date', 'size', 'type'] as const).includes(settingSortBy as SearchFilters['sortBy'])) {
      setFilters(f => ({ ...f, sortBy: settingSortBy as SearchFilters['sortBy'] }));
    }
  }, [settingSortBy]);

  // Persist sort preference whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem('dex-files-sort', JSON.stringify({ sortBy: filters.sortBy, sortDir: filters.sortDir }));
    } catch { /* localStorage unavailable */ }
  }, [filters.sortBy, filters.sortDir]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({});

  // Recently-visited FOLDERS (distinct from the "Recent files" smart collection).
  // Persisted to localStorage so the trail of browsed directories survives reloads.
  const RECENT_FOLDERS_KEY = 'dex-files-recent-folders';
  const RECENT_FOLDERS_MAX = 12;
  const [recentFolders, setRecentFolders] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
    } catch { return []; }
  });

  const recordRecentFolder = useCallback((path: string) => {
    if (!path) return;
    setRecentFolders(prev => {
      const next = [path, ...prev.filter(p => p !== path)].slice(0, RECENT_FOLDERS_MAX);
      try { localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(next)); } catch { /* localStorage unavailable */ }
      return next;
    });
  }, []);

  // Local mirror of pinned folders (task requirement: persist pins to localStorage).
  // The PinRegistry remains the canonical cross-shell source; this mirror keeps a
  // resilient localStorage copy and guarantees a sidebar list even if the registry
  // is empty on first paint. UI reads the union of both, de-duplicated by path.
  const PINNED_FOLDERS_KEY = 'dex-files-pinned-folders';
  const [localPins, setLocalPins] = useState<{ path: string; name: string }[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PINNED_FOLDERS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(p => p && typeof p.path === 'string') : [];
    } catch { return []; }
  });

  // Properties panel (file/folder metadata from already-loaded FileItem data).
  const [propertiesFile, setPropertiesFile] = useState<FileItem | null>(null);

  // Multi-item clipboard for batch copy/cut, paired with the existing single
  // `clipboard`. Batch paste fans out over the existing files:copy/files:move.
  const [batchClipboard, setBatchClipboard] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null);

  // Anchor index (into the live filteredFiles order) for Shift+click range
  // selection. A ref so updating it never forces a re-render; range math reads
  // the latest filteredFiles via the same memoized order the rows render in.
  const selectionAnchorRef = useRef<number | null>(null);
  // Latest filteredFiles paths in render order, kept in a ref so the selection
  // handler (declared before the filteredFiles memo) can resolve a Shift+click
  // range without a temporal-dead-zone reference. Refreshed each render below.
  const orderedPathsRef = useRef<string[]>([]);

  // Progress/result for a copy-or-move-to-destination transfer. Drives the
  // inline transfer banner; null when no transfer is running or being reported.
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

  // -- uki context: let the assistant see the current folder + file selection.
  // Registered once; a latest-value ref (refreshed every render) keeps the
  // resolver reading live state. Mirrors the Notes/Tasks resolvers.
  const ukiCtxRef = useRef({ currentPath, selectedFile, selectedFiles, files, selectedLocation, activeCollection });
  useEffect(() => { ukiCtxRef.current = { currentPath, selectedFile, selectedFiles, files, selectedLocation, activeCollection }; });
  useEffect(() => {
    registerUkiAppContext('files', () => {
      const c = ukiCtxRef.current;
      const sel = c.selectedFile ? c.files.find(f => f.path === c.selectedFile) : undefined;
      return {
        appId: 'files',
        currentFile: c.currentPath || c.selectedLocation,
        focusedItemId: sel?.path,
        selectionText: c.selectedFiles.size > 1 ? `${c.selectedFiles.size} files selected` : sel?.name,
        custom: {
          folder: c.currentPath || c.selectedLocation,
          itemCount: c.files.length,
          selectedCount: c.selectedFiles.size,
          collection: c.activeCollection || undefined,
        },
      };
    });
    // Let UKI LIST the current folder's entries as a callable action (read-only).
    registerUkiAppAction('files', {
      id: 'files.listCurrentFolder',
      description: 'list the files and folders shown in the current Files location.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      if (!c.files.length) return `No items in ${c.currentPath || c.selectedLocation || 'this location'}.`;
      const names = c.files.slice(0, 200).map((f) => f.name).join(', ');
      return `${c.files.length} items in ${c.currentPath || c.selectedLocation}: ${names}`.slice(0, 4000);
    });
    return () => {
      unregisterUkiAppContext('files');
      unregisterUkiAppAction('files.listCurrentFolder');
    };
  }, []);

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
  const getFileCategory = useCallback((ext: string, filename = ''): string => {
    // Filename conventions first (screenshot_/invoice_/recording_ ...), mapped onto
    // the smart collections, then fall back to extension matching.
    const nameHint = filename ? inferCategoryFromFilename(filename) : null;
    if (nameHint) {
      const hit = SMART_COLLECTIONS.find(c => c.id === nameHint || c.id === `${nameHint}s`);
      if (hit) return hit.id;
    }
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
    // Invalidate the per-column listing cache so deeper Miller columns re-fetch
    // after a refresh or any filesystem mutation (all mutation handlers funnel
    // through loadFiles on success). Column 0 renders from the live
    // filteredFiles list and is unaffected; the column load effect re-fetches
    // any currently-visible column paths once the cache is cleared.
    setColumnData({});
    setColumnLoading(new Set());
    try {
      if (window.electron?.invoke) {
        const result = await window.electron.invoke('files:list', location);
        if (result.success) {
          const filesWithCategory = result.files.map((f: Omit<FileItem, 'modified' | 'category'> & { modified: string }) => ({
            ...f,
            modified: new Date(f.modified),
            category: getFileCategory(f.extension || '', f.name),
          }));
          setFiles(filesWithCategory);
          setAllFiles(filesWithCategory);
          setCurrentPath(result.path);
          recordRecentFolder(result.path);
          
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
  }, [getFileCategory, recordRecentFolder]);

  // Load a single column's directory listing (column view). Reuses the same
  // files:list bridge as the main view, caching results per path so each pushed
  // Miller column populates instead of rendering blank.
  const loadColumn = useCallback(async (location: string) => {
    if (!window.electron?.invoke) return;
    setColumnLoading(prev => { const next = new Set(prev); next.add(location); return next; });
    try {
      const result = await window.electron.invoke('files:list', location);
      if (result?.success) {
        const filesWithCategory: FileItem[] = result.files.map((f: Omit<FileItem, 'modified' | 'category'> & { modified: string }) => ({
          ...f,
          modified: new Date(f.modified),
          category: getFileCategory(f.extension || '', f.name),
        }));
        setColumnData(prev => ({ ...prev, [location]: filesWithCategory }));
      } else {
        setColumnData(prev => ({ ...prev, [location]: [] }));
      }
    } catch (error) {
      console.error('Failed to load column:', error);
      setColumnData(prev => ({ ...prev, [location]: [] }));
    } finally {
      setColumnLoading(prev => { const next = new Set(prev); next.delete(location); return next; });
    }
  }, [getFileCategory]);

  // Fetch listings for any non-root column path not yet cached or in flight.
  // Column 0 (the root '') always renders from the live filteredFiles list.
  useEffect(() => {
    if (viewMode !== 'column') return;
    columnPath.forEach((path, idx) => {
      if (idx === 0 || !path) return;
      if (columnData[path] === undefined && !columnLoading.has(path)) {
        loadColumn(path);
      }
    });
  }, [viewMode, columnPath, columnData, columnLoading, loadColumn]);

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
      const target = e.target as HTMLElement | null;
      // Don't hijack typing in inputs (rename, search, etc.)
      const inEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      // Quick Look (Space): hand off to the global QuickLookHost, which reads
      // real file content (text via files:read, media/pdf via file URL) and owns
      // its own Space/Escape dismiss. Skip if it's already open so Space closes it.
      const quickLookOpen = !!document.querySelector('[aria-labelledby="quicklook-title"]');
      if (e.key === ' ' && selectedFile && !inEditable && !quickLookOpen) {
        e.preventDefault();
        const file = files.find(f => f.path === selectedFile);
        if (file && !file.isDirectory) {
          window.dispatchEvent(new CustomEvent('dex-quicklook', { detail: { path: file.path, name: file.name, isDirectory: file.isDirectory } }));
        }
      } else if (e.key === 'Escape' && !inEditable && !quickLookOpen) {
        // No Quick Look open: Escape clears the current multi-selection.
        clearSelection();
      } else if (!inEditable && (e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      } else if (!inEditable && e.key === 'Backspace' && historyIndex > 0) {
        // Mac/Windows Explorer parity: Backspace navigates up one level.
        e.preventDefault();
        goBack();
      } else if (e.key === 'F5') {
        e.preventDefault();
        loadFiles(currentPath);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedFile, files, historyIndex, currentPath]);

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
        const res = await window.electron.invoke('shell:openPath', file.path);
        if (res && res.success === false) {
          toast.error(res.error ? `Can't open ${file.name}: ${res.error}` : `Can't open ${file.name}`);
        }
      }
    }
  };

  // ===== FILE OPERATIONS =====
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);
  const [clipboard, setClipboard] = useState<{ file: FileItem; mode: 'copy' | 'cut' } | null>(null);

  const handleFileContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const { left, top } = clampEventToViewport(e, { width: 200, height: 280 });
    setContextMenu({ x: left, y: top, file });
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

  const handleCreateFolder = () => {
    setFolderNameDraft('');
  };

  const submitFolderCreate = async () => {
    const name = folderNameDraft?.trim();
    setFolderNameDraft(null);
    if (!name) return;
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('files:mkdir', `${currentPath}/${name}`);
        loadFiles(currentPath);
      }
    } catch (err) {
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
    const confirmed = !confirmDeleteSetting || await confirm({
      title: 'Move to Trash?',
      message: `"${file.name}" will be moved to the recycle bin.`,
      confirmLabel: 'Move to Trash',
      tone: 'destructive',
    });
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

  // Multi-select click handler. `index` is the row's position in the live
  // filteredFiles order so Shift+click can resolve a contiguous range.
  //  - Ctrl/Cmd+click: toggle this item, move the range anchor here.
  //  - Shift+click: select the inclusive range from the anchor to here
  //    (falls back to a single add when no anchor is set yet).
  //  - plain click via this path is handled by handleItemClick; this function
  //    is only invoked for modifier clicks.
  const handleSelectFile = useCallback((path: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const ordered = orderedPathsRef.current;
      const anchor = selectionAnchorRef.current ?? index;
      const lo = Math.min(anchor, index);
      const hi = Math.max(anchor, index);
      const range = ordered.slice(lo, hi + 1);
      setSelectedFiles(prev => {
        const next = new Set(prev);
        range.forEach(p => next.add(p));
        return next;
      });
      setSelectedFile(path);
      return;
    }
    // Ctrl/Cmd toggle.
    selectionAnchorRef.current = index;
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
    setSelectedFile(path);
  }, []);

  // Clear the whole multi-selection (Deselect action / Escape / empty click).
  const clearSelection = useCallback(() => {
    selectionAnchorRef.current = null;
    setSelectedFiles(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    const count = selectedFiles.size;
    const confirmed = !confirmDeleteSetting || await confirm({
      title: 'Move selected to Trash?',
      message: `${count} item${count === 1 ? '' : 's'} will be moved to the recycle bin.`,
      confirmLabel: 'Move to Trash',
      tone: 'destructive',
    });
    if (!confirmed) return;
    const paths = [...selectedFiles];
    let done = 0;
    let failed = 0;
    for (const path of paths) {
      const item = files.find(f => f.path === path);
      try {
        // Record in the recycle bin first (best-effort), mirroring single delete.
        if ((window as any).dex?.invoke && item) {
          await (window as any).dex.invoke('recycle-bin:delete', 'files', item.isDirectory ? 'folder' : 'file', item.name, JSON.stringify({ path: item.path, size: item.size }), currentPath);
        }
        if (window.electron?.invoke) {
          await window.electron.invoke('files:delete', path);
          done++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    clearSelection();
    loadFiles(currentPath);
    if (done > 0) toast.success(`Deleted ${done} item${done === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`${failed} item${failed === 1 ? '' : 's'} could not be deleted`);
  }, [selectedFiles, files, currentPath, loadFiles, clearSelection, toast, confirm, confirmDeleteSetting]);

  const handleRenameFile = async (file: FileItem) => {
    setContextMenu(null);
    // v2: enter inline rename mode instead of using window.prompt.
    setRenamingPath(file.path);
    setRenameDraft(file.name);
  };

  const commitInlineRename = useCallback(async (file: FileItem) => {
    const next = renameDraft.trim();
    setRenamingPath(null);
    if (!next || next === file.name) return;
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('files:rename', file.path, next);
        loadFiles(currentPath);
      }
    } catch (err) {
      console.error('Rename failed:', err);
      toast.error('Failed to rename file');
    }
  }, [renameDraft, currentPath, loadFiles, toast]);

  const cancelInlineRename = useCallback(() => {
    setRenamingPath(null);
    setRenameDraft('');
  }, []);

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

  // Copy a file's absolute path to the clipboard.
  const handleCopyPath = useCallback(async (file: FileItem) => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(file.path);
      toast.success('Path copied');
    } catch (err) {
      console.error('Copy path failed:', err);
      toast.error('Failed to copy path');
    }
  }, [toast]);

  // Copy a file's path relative to the current folder (just the name when the file
  // lives directly inside currentPath; otherwise the suffix after the folder root).
  const handleCopyRelativePath = useCallback(async (file: FileItem) => {
    setContextMenu(null);
    try {
      let rel = file.name;
      if (currentPath && file.path.startsWith(currentPath)) {
        rel = file.path.slice(currentPath.length).replace(/^[\\/]+/, '') || file.name;
      }
      await navigator.clipboard.writeText(rel);
      toast.success('Relative path copied');
    } catch (err) {
      console.error('Copy relative path failed:', err);
      toast.error('Failed to copy relative path');
    }
  }, [currentPath, toast]);

  const handleShowProperties = useCallback((file: FileItem) => {
    setContextMenu(null);
    setPropertiesFile(file);
  }, []);

  // Pin / unpin the CURRENT folder. Writes the canonical PinRegistry AND the
  // localStorage mirror so the sidebar list is consistent and durable.
  const isFolderPinned = useCallback((path: string): boolean => {
    if (!path) return false;
    if (localPins.some(p => p.path === path)) return true;
    return pinnedFolders.some(p => (p as any).path === path);
  }, [localPins, pinnedFolders]);

  const togglePinFolder = useCallback((path: string, name: string) => {
    if (!path) return;
    const pinned = isFolderPinned(path);
    try {
      if (pinned) {
        const reg = pinnedFolders.find(p => (p as any).path === path);
        if (reg) unpinRegistry(reg.id);
        setLocalPins(prev => {
          const next = prev.filter(p => p.path !== path);
          try { localStorage.setItem(PINNED_FOLDERS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      } else {
        pinFolder(path, name);
        setLocalPins(prev => {
          if (prev.some(p => p.path === path)) return prev;
          const next = [...prev, { path, name }];
          try { localStorage.setItem(PINNED_FOLDERS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
    } catch (err) {
      console.error('Pin toggle failed:', err);
      toast.error('Failed to update pin');
    }
  }, [isFolderPinned, pinnedFolders, unpinRegistry, pinFolder, toast]);

  // De-duplicated union of registry + local-mirror pins for the sidebar.
  const sidebarPins = useMemo(() => {
    const seen = new Set<string>();
    const out: { path: string; name: string }[] = [];
    for (const p of pinnedFolders) {
      const path = (p as any).path as string | undefined;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ path, name: (p as any).label || (p as any).name || (path.split(/[\\/]/).filter(Boolean).pop() || path) });
    }
    for (const p of localPins) {
      if (!p.path || seen.has(p.path)) continue;
      seen.add(p.path);
      out.push(p);
    }
    return out;
  }, [pinnedFolders, localPins]);

  // ----- Batch copy / cut / paste over the existing files:copy / files:move -----
  const handleBatchCopy = useCallback(() => {
    if (selectedFiles.size === 0) return;
    setBatchClipboard({ paths: [...selectedFiles], mode: 'copy' });
    toast.info(`Copied ${selectedFiles.size} item${selectedFiles.size === 1 ? '' : 's'}`);
  }, [selectedFiles, toast]);

  const handleBatchCut = useCallback(() => {
    if (selectedFiles.size === 0) return;
    setBatchClipboard({ paths: [...selectedFiles], mode: 'cut' });
    toast.info(`Cut ${selectedFiles.size} item${selectedFiles.size === 1 ? '' : 's'}`);
  }, [selectedFiles, toast]);

  const handleBatchPaste = useCallback(async () => {
    if (!batchClipboard || !currentPath) return;
    const { paths, mode } = batchClipboard;
    let ok = 0;
    for (const src of paths) {
      try {
        if (window.electron?.invoke) {
          if (mode === 'copy') await window.electron.invoke('files:copy', src, currentPath);
          else await window.electron.invoke('files:move', src, currentPath);
          ok++;
        }
      } catch (err) {
        console.error('Batch paste failed for', src, err);
      }
    }
    if (mode === 'cut') setBatchClipboard(null);
    setSelectedFiles(new Set());
    loadFiles(currentPath);
    if (ok > 0) toast.success(`${mode === 'copy' ? 'Copied' : 'Moved'} ${ok} item${ok === 1 ? '' : 's'}`);
    else toast.error('Paste operation failed');
  }, [batchClipboard, currentPath, loadFiles, toast]);

  // Prompt for a destination folder via the native open dialog (directory mode).
  // Mirrors the picker pattern used elsewhere (Home / PDFViewer): try
  // files:openDialog, fall back to dialog:showOpenDialog, read filePaths[0].
  // Returns the chosen directory path, or null when canceled / unavailable.
  const pickDestinationFolder = useCallback(async (): Promise<string | null> => {
    const opts = { properties: ['openDirectory'] as string[], defaultPath: currentPath || undefined };
    try {
      let result = await window.electron?.invoke<{ canceled?: boolean; filePaths?: string[] }>('files:openDialog', opts);
      if (!result || (!result.filePaths && !result.canceled)) {
        result = await window.electron?.invoke<{ canceled?: boolean; filePaths?: string[] }>('dialog:showOpenDialog', opts);
      }
      const dest = result?.filePaths?.[0];
      return dest || null;
    } catch (err) {
      console.error('Destination picker failed:', err);
      toast.error('Could not open folder picker');
      return null;
    }
  }, [currentPath, toast]);

  // Copy or MOVE every selected item into a destination folder chosen via the
  // native picker. Streams server-side through the existing files:copy /
  // files:move handlers (so large files transfer without renderer work) and
  // reports live progress through transferState. On move, the source folder is
  // refreshed; on copy, the listing is left as-is unless dest === currentPath.
  const handleTransferSelected = useCallback(async (mode: 'copy' | 'move') => {
    if (selectedFiles.size === 0) return;
    const paths = [...selectedFiles];
    const dest = await pickDestinationFolder();
    if (!dest) return;
    const destName = dest.split(/[\\/]/).filter(Boolean).pop() || dest;
    // Drive the system-wide live-activity glass card with real count-based progress.
    const la = useLiveActivityStore.getState();
    const verb = mode === 'copy' ? 'Copying' : 'Moving';
    const activityId = la.start({
      title: `${verb} to ${destName}`,
      subtitle: `0 of ${paths.length} items`,
      icon: 'files',
      badge: 'FILES',
      progress: 0,
    });
    let done = 0;
    let failed = 0;
    for (const src of paths) {
      try {
        if (window.electron?.invoke) {
          await window.electron.invoke(mode === 'copy' ? 'files:copy' : 'files:move', src, dest);
          done++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`Failed to ${mode}`, src, '->', dest, err);
        failed++;
      }
      useLiveActivityStore.getState().update(activityId, {
        subtitle: `${done + failed} of ${paths.length} items`,
        progress: (done + failed) / paths.length,
      });
    }
    useLiveActivityStore.getState().complete(activityId, {
      status: failed > 0 ? 'error' : 'success',
      title: `${mode === 'copy' ? 'Copied' : 'Moved'} to ${destName}`,
      subtitle: failed > 0 ? `${done} done · ${failed} failed` : `${done} item${done === 1 ? '' : 's'}`,
    });
    clearSelection();
    // A move always mutates the current folder; a copy only does when the
    // destination is the folder being viewed. Refresh in either of those cases.
    if (mode === 'move' || dest === currentPath) loadFiles(currentPath);
  }, [selectedFiles, pickDestinationFolder, clearSelection, currentPath, loadFiles]);

  // Keyboard shortcuts for the multi-selection. Declared after the batch
  // handlers so every reference is in scope. Delete removes the selection;
  // Ctrl/Cmd+C and Ctrl/Cmd+X stage a copy/cut; Ctrl/Cmd+V drops the staged
  // batch into the current folder. All guarded so typing in inputs is never
  // hijacked, and gated on there being a selection (or a staged batch).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inEditable = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (inEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Del') && selectedFiles.size > 0) {
        e.preventDefault();
        handleBatchDelete();
      } else if (mod && (e.key === 'c' || e.key === 'C') && selectedFiles.size > 0) {
        e.preventDefault();
        handleBatchCopy();
      } else if (mod && (e.key === 'x' || e.key === 'X') && selectedFiles.size > 0) {
        e.preventDefault();
        handleBatchCut();
      } else if (mod && (e.key === 'v' || e.key === 'V') && batchClipboard) {
        e.preventDefault();
        handleBatchPaste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedFiles, batchClipboard, handleBatchDelete, handleBatchCopy, handleBatchCut, handleBatchPaste]);

  // Keep the '--' placeholder for empty/zero rows; otherwise use the shared canonical.
  const formatSize = (bytes: number): string => (bytes > 0 ? formatBytes(bytes) : '--');

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
      const tagColor = (fileTags[file.path] && TAG_COLORS[fileTags[file.path]]) || '#64d2ff';
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
    let result = showHiddenFiles ? [...files] : files.filter(f => !f.hidden && !f.name.startsWith('.'));

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
          // Natural order so "file2" sorts before "file10" (not lexical).
          comparison = naturalCompare(a.name, b.name);
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
  }, [files, filters, activeCollection, recentFiles, activeTagFilter, fileTags, showHiddenFiles]);

  // Keep the render-order path list current for Shift+click range selection.
  useEffect(() => { orderedPathsRef.current = filteredFiles.map(f => f.path); }, [filteredFiles]);

  // Whether the current empty result is caused by an active search/filter
  // (vs. a genuinely empty folder). Drives the "no matches" empty state.
  const hasActiveFilter = useMemo(() => (
    filters.query.trim() !== '' ||
    filters.category !== 'all' ||
    filters.dateRange !== 'all' ||
    filters.sizeRange !== 'all' ||
    activeTagFilter !== null
  ), [filters.query, filters.category, filters.dateRange, filters.sizeRange, activeTagFilter]);

  const clearFilters = useCallback(() => {
    setFilters(f => ({ ...f, query: '', category: 'all', dateRange: 'all', sizeRange: 'all' }));
    setActiveTagFilter(null);
  }, []);

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
  }, [hasMoreFiles, viewMode]);

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
        .dex-crumb:not(:disabled):hover { background: var(--color-bg-hover); color: var(--color-text-primary) !important; }
        .dex-toolbtn:not(:disabled):hover { background: var(--color-bg-hover); }
        @keyframes dex-files-spin { to { transform: rotate(360deg); } }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Files</span>
        </div>
        
        <div style={styles.sidebarSection}>
          <div className="dex-label-caps" style={styles.sectionLabel}>Favorites</div>
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

        {/* Pinned Folders (persisted to localStorage + PinRegistry) */}
        {sidebarPins.length > 0 && (
          <div style={styles.sidebarSection}>
            <div className="dex-label-caps" style={styles.sectionLabel}>Pinned</div>
            {sidebarPins.map(pin => {
              const isActive = currentPath === pin.path && !activeCollection;
              return (
                <div key={pin.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    style={{
                      ...styles.sidebarItem,
                      flex: 1,
                      background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    }}
                    onClick={() => { setActiveCollection(null); setSelectedFile(null); navigateTo(pin.path); }}
                    title={pin.path}
                    aria-label={`Open pinned folder ${pin.name}`}
                  >
                    <Icons.folder size={16} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pin.name}</span>
                  </button>
                  <button
                    onClick={() => togglePinFolder(pin.path, pin.name)}
                    aria-label={`Unpin folder ${pin.name}`}
                    title="Unpin"
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '2px 4px', flexShrink: 0, display: 'inline-flex' }}
                  ><DexIcon name="close" size={11} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recently visited folders (persisted to localStorage) */}
        {recentFolders.length > 0 && (
          <div style={styles.sidebarSection}>
            <div className="dex-label-caps" style={styles.sectionLabel}>Recent Folders</div>
            {recentFolders.slice(0, 8).map(folderPath => {
              const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
              const isActive = currentPath === folderPath && !activeCollection;
              return (
                <button
                  key={folderPath}
                  style={{
                    ...styles.sidebarItem,
                    background: isActive ? 'var(--color-accent-soft)' : 'transparent',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  }}
                  onClick={() => { setActiveCollection(null); setSelectedFile(null); navigateTo(folderPath); }}
                  title={folderPath}
                  aria-label={`Open recent folder ${folderName}`}
                >
                  <Icons.recent size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderName}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Smart Collections */}
        <div style={styles.sidebarSection}>
          <div className="dex-label-caps" style={styles.sectionLabel}>Smart Collections</div>
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
          <div className="dex-label-caps" style={styles.sectionLabel}>Tags</div>
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
          <div className="dex-label-caps" style={{ ...styles.sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px var(--space-3)' }}>
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
              className="dex-toolbtn"
              style={{...styles.navBtn, opacity: historyIndex <= 0 ? 0.3 : 1}}
              onClick={goBack}
              disabled={historyIndex <= 0}
              aria-label="Navigate back"
            >
              <Icons.back size={16} />
            </button>
            <button
              className="dex-toolbtn"
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ color: SMART_COLLECTIONS.find(c => c.id === activeCollection)?.color || 'var(--color-accent)' }}>
                  {activeCollection === 'recent' ? 'Recent Files' : SMART_COLLECTIONS.find(c => c.id === activeCollection)?.name || activeCollection}
                </span>
                <button
                  className="dex-toolbtn"
                  onClick={clearCollection}
                  style={{ ...styles.navBtn, padding: 4 }}
                  title="Clear filter"
                  aria-label="Clear filter"
                >
                  <Icons.close size={12} />
                </button>
              </div>
            ) : (
              <Breadcrumb path={currentPath || `/${selectedLocation}`} onNavigate={navigateTo} />
            )}
          </div>
          
          <div style={styles.toolbarRight}>
            {/* Smart Search */}
            <DexSearchInput
              size="sm"
              placeholder="Search"
              value={filters.query}
              onChange={(e) => setFilters(f => ({ ...f, query: e.target.value }))}
              onClear={() => setFilters(f => ({ ...f, query: '' }))}
              style={{ width: 240 }}
            />

            {/* Filter Toggle */}
            <button
              className="dex-toolbtn"
              style={{
                ...styles.navBtn,
                background: showFilters ? 'var(--color-accent-soft, rgba(10, 132, 255, 0.2))' : 'transparent',
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
              className="dex-toolbtn"
              style={styles.navBtn}
              onClick={() => setFilters(f => ({ ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }))}
              title={`Sort ${filters.sortDir === 'asc' ? 'descending' : 'ascending'}`}
              aria-label={`Sort ${filters.sortDir === 'asc' ? 'descending' : 'ascending'}`}
            >
              <Icons.sort size={14} />
            </button>
            
            {/* New Folder */}
            {folderNameDraft !== null ? (
              <input
                autoFocus
                value={folderNameDraft}
                onChange={e => setFolderNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitFolderCreate(); if (e.key === 'Escape') setFolderNameDraft(null); }}
                onBlur={submitFolderCreate}
                placeholder="Folder name"
                aria-label="New folder name"
                style={{ height: 26, padding: '0 var(--space-2)', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', width: 120 }}
              />
            ) : (
              <button
                className="dex-toolbtn"
                style={styles.navBtn}
                onClick={handleCreateFolder}
                title="New Folder (Ctrl+Shift+N)"
                aria-label="Create new folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              </button>
            )}

            {/* Organize by Type */}
            <button
              className="dex-toolbtn"
              style={styles.navBtn}
              onClick={async () => {
                if (!currentPath) return;
                const ok = await confirm({ title: 'Organize folder?', message: 'Organize files in this folder into Audio, Video, Images, Documents, Archives, and Other subfolders?', confirmLabel: 'Organize' });
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
                className="dex-toolbtn"
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

        {/* Quick Actions row (v2): Pin current folder + new folder + paste, always visible. */}
        {currentPath && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px var(--space-4)', background: 'var(--pg-toolbar, var(--color-bg-secondary))', borderBottom: '1px solid var(--pg-border, var(--color-border-subtle))', fontSize: 11 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600, marginRight: 4 }}>Quick Actions</span>
            {(() => {
              const folderName = currentPath.split(/[\\/]/).filter(Boolean).pop() || currentPath;
              const matchingPin = pinnedFolders.find(p => (p as any).path === currentPath);
              const isPinned = !!matchingPin;
              return (
                <button
                  onClick={() => {
                    if (isPinned && matchingPin) {
                      unpinRegistry(matchingPin.id);
                    } else {
                      pinFolder(currentPath, folderName);
                    }
                  }}
                  aria-label={isPinned ? `Unpin folder ${folderName}` : `Pin folder ${folderName}`}
                  style={{ padding: '3px 10px', borderRadius: 4, background: isPinned ? 'var(--color-accent-soft)' : 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: isPinned ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}
                >
                  {isPinned ? 'Unpin folder' : 'Pin folder'}
                </button>
              );
            })()}
            <button
              onClick={() => handleCreateFolder()}
              style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}
              aria-label="New folder"
            >
              New folder
            </button>
            {clipboard && (
              <button
                onClick={() => handlePasteFile()}
                style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}
                aria-label={`Paste ${clipboard.file.name}`}
              >
                Paste "{clipboard.file.name}"
              </button>
            )}
            {batchClipboard && (
              <button
                onClick={() => handleBatchPaste()}
                style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-accent-soft)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-accent)', fontSize: 11, cursor: 'pointer' }}
                aria-label={`Paste ${batchClipboard.paths.length} items here`}
              >
                Paste {batchClipboard.paths.length} item{batchClipboard.paths.length === 1 ? '' : 's'} ({batchClipboard.mode === 'cut' ? 'move' : 'copy'})
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{filteredFiles.length} item{filteredFiles.length === 1 ? '' : 's'}</span>
          </div>
        )}

        {/* Batch Action Bar — appears whenever one or more items are selected.
            Copy/Move open a destination picker and stream through files:copy /
            files:move; Delete batch-removes; Deselect clears. The in-place
            Copy here / Cut staging and Copy Paths remain as secondary tools. */}
        {selectedFiles.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px var(--space-4)', background: 'var(--color-bg-surface-solid)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600 }}>{selectedFiles.size} selected</span>
            <button onClick={() => handleTransferSelected('copy')} title="Copy selected to a chosen folder" style={{ padding: '5px var(--space-3)', borderRadius: 6, background: 'var(--color-accent-soft)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Copy to...</button>
            <button onClick={() => handleTransferSelected('move')} title="Move selected to a chosen folder" style={{ padding: '5px var(--space-3)', borderRadius: 6, background: 'var(--color-accent-soft)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Move to...</button>
            <button onClick={handleBatchDelete} title="Delete selected (Del)" style={{ padding: '5px var(--space-3)', borderRadius: 6, background: 'var(--color-error-muted)', border: '1px solid var(--color-error-border, rgba(255,69,58,0.35))', color: 'var(--color-error)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
            <button onClick={handleBatchCopy} title="Copy here, paste into another folder (Ctrl+C)" style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Copy</button>
            <button onClick={handleBatchCut} title="Cut, paste into another folder (Ctrl+X)" style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Cut</button>
            <button onClick={() => { selectedFiles.forEach(p => { void navigator.clipboard.writeText(p); }); toast.success('Paths copied'); }} style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-border-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Copy Paths</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => handleSelectAll()} style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Select All</button>
            <button onClick={clearSelection} style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Deselect</button>
          </div>
        )}

        {/* Transfer progress now shows in the system-wide live-activity glass card
            (components/LiveActivityHost), driven by handleTransferSelected. */}

        {/* File List */}
        <div
          style={styles.content}
          onClick={(e) => { if (e.target === e.currentTarget && selectedFiles.size > 0) clearSelection(); }}
        >
          {loadError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)', gap: 'var(--space-2)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--color-error-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-error, #ff453a)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>Failed to load files</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #8a8a8a)', textAlign: 'center', maxWidth: 280 }}>{loadError}</span>
              <button onClick={() => loadFiles(currentPath || selectedLocation)} style={{ marginTop: 'var(--space-2)', padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent-fill)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
            </div>
          ) : loading ? (
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--space-2) var(--space-3)', borderRadius: 6, background: 'var(--color-border-subtle)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.06}s` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 12, borderRadius: 4, background: 'var(--color-bg-hover)' }} />
                  <div style={{ width: 60, height: 10, borderRadius: 4, background: 'var(--color-border-subtle)' }} />
                </div>
              ))}
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
          ) : viewMode === 'list' ? (
            <div style={styles.listContainer} onClick={(e) => { if (e.target === e.currentTarget && selectedFiles.size > 0) clearSelection(); }}>
              {/* Header */}
              <div style={styles.listHeader}>
                <span style={{ flex: 1 }}>Name</span>
                <span style={{ width: 60 }}>Type</span>
                <span style={{ width: 100 }}>Date Modified</span>
                <span style={{ width: 80, textAlign: 'right' }}>Size</span>
              </div>
              
              {/* Files */}
              {filteredFiles.length === 0 ? (
                hasActiveFilter ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)', gap: 'var(--space-2)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #0a84ff)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>No matches</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #8a8a8a)', textAlign: 'center', maxWidth: 280 }}>{filters.query ? `No files match "${filters.query}" in this folder.` : 'No files match the current filters.'}</span>
                    <button onClick={clearFilters} style={{ marginTop: 'var(--space-2)', padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent-fill)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear filters</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)', gap: 'var(--space-2)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #0a84ff)" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>This folder is empty</span>
                    <button onClick={() => { (window as any).electron?.invoke?.('dialog:open', { properties: ['openFile', 'multiSelections'] }); }} style={{ marginTop: 'var(--space-2)', padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent-fill)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add Files</button>
                  </div>
                )
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
                      : selectedFiles.has(file.path)
                        ? 'var(--color-accent-soft)'
                        : selectedFile === file.path
                          ? 'var(--color-bg-active)'
                          : 'var(--color-bg-surface-solid)',
                    outline: dragOverPath === file.path ? '2px solid var(--color-accent)' : 'none',
                    borderRadius: dragOverPath === file.path ? 6 : 0,
                    boxShadow: selectedFiles.has(file.path) ? 'inset 3px 0 0 var(--color-accent)' : 'none',
                  }}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) { handleSelectFile(file.path, idx, e); return; }
                    if (selectedFiles.size > 0) clearSelection();
                    handleItemClick(file);
                  }}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div style={styles.fileName}>
                    {getFileIcon(file)}
                    {renamingPath === file.path ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onBlur={() => commitInlineRename(file)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitInlineRename(file); }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelInlineRename(); }
                        }}
                        aria-label={`Rename ${file.name}`}
                        style={{ flex: 1, minWidth: 60, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-surface-solid)', color: 'var(--color-text-primary)', fontSize: 12 }}
                      />
                    ) : (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={file.name}>{file.name}</span>
                    )}
                    {fileTags[file.path] && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TAG_COLORS[fileTags[file.path]], flexShrink: 0 }} />
                    )}
                  </div>
                  <span style={{...styles.fileMeta, width: 60}}>{file.isDirectory ? 'Folder' : file.extension.replace('.', '').toUpperCase()}</span>
                  <span style={styles.fileMeta}>{formatDate(file.modified)}</span>
                  <span style={{...styles.fileMeta, width: 80, textAlign: 'right'}}>{file.isDirectory ? '--' : formatSize(file.size)}</span>
                </div>
              ))}
              {/* Load more trigger for infinite scroll (matches grid view) */}
              {filteredFiles.length > 0 && hasMoreFiles && (
                <div
                  ref={loadMoreRef}
                  style={{
                    padding: 'var(--space-4)',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: 12,
                  }}
                >
                  Loading more ({filteredFiles.length - visibleCount} remaining)...
                </div>
              )}
            </div>
          ) : viewMode === 'column' ? (
            <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
              {columnPath.map((colPath, colIdx) => {
                // Column 0 mirrors the live (filtered) main list; deeper columns
                // render the cached listing for their own path.
                const colEntries = colIdx === 0 ? filteredFiles : (columnData[colPath] ?? []);
                const isColLoading = colIdx !== 0 && columnData[colPath] === undefined && columnLoading.has(colPath);
                const isColEmpty = colIdx !== 0 && !isColLoading && columnData[colPath] !== undefined && colEntries.length === 0;
                return (
                  <div key={colIdx} style={{
                    minWidth: 200, maxWidth: 260, borderRight: '1px solid var(--color-border, var(--color-border-subtle))',
                    flexShrink: 0, overflow: 'auto', background: colIdx % 2 === 0 ? 'var(--color-bg-surface-solid)' : 'var(--color-bg-secondary)',
                  }}>
                    {isColLoading ? (
                      <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--color-text-secondary)' }}>Loading...</div>
                    ) : isColEmpty ? (
                      <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--color-text-secondary)' }}>Empty folder</div>
                    ) : colEntries.map(file => (
                      <div
                        key={file.path}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                          background: selectedFile === file.path ? 'var(--color-bg-active)' : 'transparent',
                        }}
                        onClick={() => {
                          if (file.isDirectory) {
                            // Push (or replace) the next column for this folder.
                            // Avoid navigateTo here so existing columns stay visible.
                            setSelectedFile(file.path);
                            setColumnPath(prev => [...prev.slice(0, colIdx + 1), file.path]);
                          } else {
                            handleItemClick(file);
                            // Trim any deeper columns when selecting a leaf file.
                            setColumnPath(prev => prev.slice(0, colIdx + 1));
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
            <div style={{ ...styles.gridContainer, gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_TILE[thumbnailSize] ?? 140}px, 1fr))` }} onClick={(e) => { if (e.target === e.currentTarget && selectedFiles.size > 0) clearSelection(); }}>
              {filteredFiles.length === 0 ? (
                hasActiveFilter ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)', gap: 'var(--space-2)', gridColumn: '1 / -1' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #0a84ff)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>No matches</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #8a8a8a)', textAlign: 'center', maxWidth: 240 }}>{filters.query ? `No files match "${filters.query}".` : 'No files match the current filters.'}</span>
                    <button onClick={clearFilters} style={{ marginTop: 4, padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent-fill)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear filters</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)', gap: 'var(--space-2)', gridColumn: '1 / -1' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--color-accent-soft, rgba(10,132,255,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #0a84ff)" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>This folder is empty</span>
                    <button onClick={() => { (window as any).electron?.invoke?.('dialog:open', { properties: ['openFile', 'multiSelections'] }); }} style={{ marginTop: 4, padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent-fill)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add Files</button>
                  </div>
                )
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
                    ...styles.gridItem,
                    background: dragOverPath === file.path
                      ? 'var(--color-accent-soft)'
                      : selectedFiles.has(file.path)
                        ? 'var(--color-accent-soft)'
                        : selectedFile === file.path ? 'var(--color-bg-active)' : 'var(--color-bg-surface-solid)',
                    outline: dragOverPath === file.path
                      ? '2px solid var(--color-accent)'
                      : selectedFiles.has(file.path) ? '1.5px solid var(--color-accent)' : 'none',
                  }}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) { handleSelectFile(file.path, idx, e); return; }
                    if (selectedFiles.size > 0) clearSelection();
                    handleItemClick(file);
                  }}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                >
                  <div style={styles.gridIcon}>
                    {file.isDirectory ? getFileIcon(file, 48) : getFileIcon(file)}
                  </div>
                  {renamingPath === file.path ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={() => commitInlineRename(file)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitInlineRename(file); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelInlineRename(); }
                      }}
                      aria-label={`Rename ${file.name}`}
                      style={{ width: '90%', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-surface-solid)', color: 'var(--color-text-primary)', fontSize: 11, textAlign: 'center' }}
                    />
                  ) : (
                    <span style={styles.gridLabel}>{file.name}</span>
                  )}
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
                    padding: 'var(--space-4)',
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

      {/* Quick Look (Spacebar) is now handled by the global QuickLookHost, which
          reads real file content and is shared across every surface. */}

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
                style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 6 }}
              />
            )}
            {/* Video Preview */}
            {['.mp4', '.mov', '.webm'].includes(previewFile.extension.toLowerCase()) && (
              <video
                src={`file://${previewFile.path.replace(/\\/g, '/')}`}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 6 }}
              />
            )}
            {/* Audio Preview */}
            {['.mp3', '.wav', '.m4a', '.ogg'].includes(previewFile.extension.toLowerCase()) && (
              <div style={{ background: 'var(--color-bg-elevated)', padding: 'var(--space-8)', borderRadius: 10 }}>
                <Icons.music size={64} />
                <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)', color: 'var(--color-text-primary)', fontSize: 16 }}>{previewFile.name}</div>
                <audio src={`file://${previewFile.path.replace(/\\/g, '/')}`} controls autoPlay style={{ width: 300 }} />
              </div>
            )}
            {/* File Name */}
            <div style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-secondary)', fontSize: 13 }}>
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
            borderRadius: '6px', boxShadow: 'var(--pg-shadow-popover)', padding: '4px 0', minWidth: '180px',
          }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => handleItemDoubleClick(contextMenu.file)} aria-label={`Open ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Open
            </button>
            {!contextMenu.file.isDirectory && (() => {
              const apps = getAppsForFile(contextMenu.file.name);
              return apps.length > 0 ? (
                <>
                  <div style={{ padding: '4px var(--space-4)', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>Open With</div>
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
                        style={{ display: 'block', width: '100%', padding: '6px var(--space-4) 6px 28px', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}
                      >
                        {def.name}
                      </button>
                    );
                  })}
                  <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
                </>
              ) : null;
            })()}
            <button onClick={() => handleShowInExplorer(contextMenu.file)} aria-label={`Show ${contextMenu.file.name} in Explorer`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Show in Explorer
            </button>
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <button onClick={() => handleCopyFile(contextMenu.file)} aria-label={`Copy ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Copy
            </button>
            <button onClick={() => handleCutFile(contextMenu.file)} aria-label={`Cut ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Cut
            </button>
            {clipboard && (
              <button onClick={() => { handlePasteFile(); setContextMenu(null); }} aria-label="Paste file" style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
                Paste "{clipboard.file.name}"
              </button>
            )}
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <button onClick={() => handleCopyPath(contextMenu.file)} aria-label={`Copy path of ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Copy Path
            </button>
            <button onClick={() => handleCopyRelativePath(contextMenu.file)} aria-label={`Copy relative path of ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Copy Relative Path
            </button>
            <button onClick={() => handleShowProperties(contextMenu.file)} aria-label={`Properties of ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Properties
            </button>
            <div style={{ height: '1px', background: 'var(--color-border, var(--color-border-subtle))', margin: '4px 0' }} />
            <div style={{ padding: '4px var(--space-4)', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>Tags</div>
            <div style={{ display: 'flex', gap: 4, padding: '2px var(--space-4) 6px' }}>
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
            <button onClick={() => handleRenameFile(contextMenu.file)} aria-label={`Rename ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-text, #e4e4e7)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Rename
            </button>
            <button onClick={() => handleDeleteFile(contextMenu.file)} aria-label={`Delete ${contextMenu.file.name}`} style={{ display: 'block', width: '100%', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: 'var(--color-error)', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              Delete
            </button>
          </div>
        </div>
      )}
      {/* Properties Panel (derived entirely from already-loaded FileItem data) */}
      {propertiesFile && (
        <div
          onClick={() => setPropertiesFile(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8, 8, 10, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 340, maxWidth: '90vw', background: 'var(--color-bg-elevated, #1c1c1e)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: 'var(--pg-shadow-modal)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
              {getFileIcon(propertiesFile, 24)}
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{propertiesFile.name}</span>
              <button onClick={() => setPropertiesFile(null)} aria-label="Close properties" style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'inline-flex' }}><Icons.close size={16} /></button>
            </div>
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              {([
                ['Kind', propertiesFile.isDirectory ? 'Folder' : (propertiesFile.extension ? `${propertiesFile.extension.replace('.', '').toUpperCase()} file` : 'File')],
                ['Category', propertiesFile.category && propertiesFile.category !== 'other' ? (SMART_COLLECTIONS.find(c => c.id === propertiesFile.category)?.name || propertiesFile.category) : '--'],
                ['Size', propertiesFile.isDirectory ? '--' : formatSize(propertiesFile.size)],
                ['Modified', propertiesFile.modified instanceof Date && !isNaN(propertiesFile.modified.getTime()) ? propertiesFile.modified.toLocaleString() : '--'],
                ['Location', propertiesFile.path],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline' }}>
                  <span style={{ width: 80, flexShrink: 0, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{label}</span>
                  <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4) var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <button onClick={() => handleCopyPath(propertiesFile)} style={{ padding: '5px var(--space-3)', borderRadius: 4, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Copy Path</button>
              <button onClick={() => setPropertiesFile(null)} style={{ padding: '5px var(--space-4)', borderRadius: 4, background: 'var(--color-accent-fill)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmHost />
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
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  sidebarSection: {
    padding: 'var(--space-2)',
  },
  sectionLabel: {
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    padding: 'var(--space-3) 10px 4px',
    letterSpacing: '0.8px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px var(--space-3)',
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
    padding: '10px var(--space-4)',
    gap: 'var(--space-2)',
    borderBottom: '1px solid var(--pg-border)',
    background: 'var(--pg-toolbar)',
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
    borderRadius: '4px',
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
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  breadcrumbSegment: {
    background: 'none',
    border: 'none',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: '13px',
    fontFamily: 'inherit',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  breadcrumbSep: {
    color: 'var(--color-text-tertiary)',
    fontSize: '12px',
    userSelect: 'none',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
    padding: 'var(--space-2) var(--space-3)',
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
    borderRadius: '4px',
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
    gap: 'var(--space-3)',
    padding: '14px var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
  },
  summaryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: 'var(--space-3) 14px',
    borderRadius: '10px',
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
    padding: 'var(--space-3) 14px var(--space-4)',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    background: 'var(--color-bg-surface-solid)',
    borderRadius: '10px 10px 0 0',
    zIndex: 1,
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-3) var(--space-4)',
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
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  fileMeta: {
    width: 100,
    flexShrink: 0,
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  
  // Grid view
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '14px',
    padding: 'var(--space-4)',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4) var(--space-3)',
    borderRadius: '10px',
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
    padding: '0 var(--space-4)',
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
    gap: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
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
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

Files.displayName = 'Files';
export default memo(Files);
