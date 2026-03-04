/**
 * FILES - Smart File Browser with Advanced Search
 * Real file system access with Electron IPC
 * Auto-categorization, fast search by name/date/type/time
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useAppTracking, useFileTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACCESS LOCATIONS
// ═══════════════════════════════════════════════════════════════════════════

const QUICK_ACCESS: QuickAccessItem[] = [
  { id: 'desktop', name: 'Desktop', path: 'desktop', icon: 'desktop' },
  { id: 'documents', name: 'Documents', path: 'documents', icon: 'folder' },
  { id: 'downloads', name: 'Downloads', path: 'downloads', icon: 'download' },
  { id: 'pictures', name: 'Pictures', path: 'pictures', icon: 'image' },
  { id: 'music', name: 'Music', path: 'music', icon: 'music' },
  { id: 'videos', name: 'Videos', path: 'videos', icon: 'video' },
];

// ═══════════════════════════════════════════════════════════════════════════
// SMART COLLECTIONS - Auto-categorize by file type
// ═══════════════════════════════════════════════════════════════════════════

const SMART_COLLECTIONS: SmartCollection[] = [
  { id: 'documents', name: 'Documents', icon: 'document', color: '#0a84ff', 
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx'] },
  { id: 'images', name: 'Images', icon: 'image', color: '#ff9f0a', 
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff'] },
  { id: 'videos', name: 'Videos', icon: 'video', color: '#bf5af2', 
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'] },
  { id: 'audio', name: 'Audio', icon: 'music', color: '#ff375f', 
    extensions: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.wma'] },
  { id: 'code', name: 'Code', icon: 'code', color: '#30d158', 
    extensions: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.json', '.xml'] },
  { id: 'archives', name: 'Archives', icon: 'archive', color: '#5e5ce6', 
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'] },
];

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const Files: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('files');
  const { trackFileOpen } = useFileTracking('files');

  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]); // For smart collections
  const [selectedLocation, setSelectedLocation] = useState('documents');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  
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
        // Fallback mock data for development
        setFiles([
          { name: 'Documents', path: '/Documents', isDirectory: true, size: 0, modified: new Date(), extension: '', category: '' },
          { name: 'Projects', path: '/Projects', isDirectory: true, size: 0, modified: new Date(), extension: '', category: '' },
          { name: 'Downloads', path: '/Downloads', isDirectory: true, size: 0, modified: new Date(), extension: '', category: '' },
          { name: 'report.pdf', path: '/report.pdf', isDirectory: false, size: 2400000, modified: new Date(), extension: '.pdf', category: 'documents' },
          { name: 'notes.txt', path: '/notes.txt', isDirectory: false, size: 1200, modified: new Date(), extension: '.txt', category: 'documents' },
          { name: 'main.tsx', path: '/main.tsx', isDirectory: false, size: 8500, modified: new Date(), extension: '.tsx', category: 'code' },
          { name: 'photo.jpg', path: '/photo.jpg', isDirectory: false, size: 3500000, modified: new Date(), extension: '.jpg', category: 'images' },
        ]);
        setCurrentPath(`/${location}`);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    }
    setLoading(false);
  }, [getFileCategory]);

  useEffect(() => {
    loadFiles(selectedLocation);
  }, [selectedLocation, loadFiles]);

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
      // Track file open for pattern learning
      trackFileOpen(file.path);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'filesOpened', amount: 1 } }));
      if (window.electron?.invoke) {
        await window.electron.invoke('shell:openPath', file.path);
      }
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

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Icons.folder size={20} />;
    const ext = file.extension.toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return <Icons.image size={20} />;
    if (['.mp3', '.wav', '.m4a', '.flac'].includes(ext)) return <Icons.music size={20} />;
    if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return <Icons.video size={20} />;
    if (['.js', '.ts', '.tsx', '.jsx', '.py', '.java'].includes(ext)) return <Icons.code size={20} />;
    if (ext === '.pdf') return <Icons.pdf size={20} />;
    return <Icons.file size={20} />;
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
  }, [files, filters, activeCollection, recentFiles]);

  // Clear collection view
  const clearCollection = () => {
    setActiveCollection(null);
  };

  return (
    <div style={styles.container}>
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
                  background: isActive ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                  color: isActive ? '#0a84ff' : 'rgba(255,255,255,0.85)',
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
              background: activeCollection === 'recent' ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
              color: activeCollection === 'recent' ? '#0a84ff' : 'rgba(255,255,255,0.85)',
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
                  background: isActive ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                  color: isActive ? collection.color : 'rgba(255,255,255,0.85)',
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
                <span style={{ color: SMART_COLLECTIONS.find(c => c.id === activeCollection)?.color || '#0a84ff' }}>
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
                color: showFilters ? '#0a84ff' : 'var(--color-text-secondary)',
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
            
            <div style={styles.viewToggle}>
              <button
                style={{...styles.viewBtn, background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent'}}
                onClick={() => setViewMode('list')}
                aria-label="Toggle list view"
              >
                <Icons.list size={14} />
              </button>
              <button
                style={{...styles.viewBtn, background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent'}}
                onClick={() => setViewMode('grid')}
                aria-label="Toggle grid view"
              >
                <Icons.grid size={14} />
              </button>
            </div>
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
                    background: filters.dateRange === range ? 'rgba(10, 132, 255, 0.3)' : 'rgba(255,255,255,0.05)',
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
                    background: filters.sizeRange === size ? 'rgba(10, 132, 255, 0.3)' : 'rgba(255,255,255,0.05)',
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
                    background: filters.sortBy === sort ? 'rgba(10, 132, 255, 0.3)' : 'rgba(255,255,255,0.05)',
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

        {/* File List */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : viewMode === 'list' ? (
            <div style={styles.listContainer}>
              {/* Header */}
              <div style={styles.listHeader}>
                <span style={{ flex: 1 }}>Name</span>
                <span style={{ width: 100 }}>Date Modified</span>
                <span style={{ width: 80, textAlign: 'right' }}>Size</span>
              </div>
              
              {/* Files */}
              {filteredFiles.map((file, idx) => (
                <div
                  key={file.path}
                  style={{
                    ...styles.listRow,
                    background: selectedFile === file.path 
                      ? 'rgba(10, 132, 255, 0.3)' 
                      : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                  onClick={() => handleItemClick(file)}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                >
                  <div style={styles.fileName}>
                    {getFileIcon(file)}
                    <span>{file.name}</span>
                  </div>
                  <span style={styles.fileMeta}>{formatDate(file.modified)}</span>
                  <span style={{...styles.fileMeta, width: 80, textAlign: 'right'}}>{formatSize(file.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.gridContainer}>
              {filteredFiles.map(file => (
                <div
                  key={file.path}
                  style={{
                    ...styles.gridItem,
                    background: selectedFile === file.path ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                  }}
                  onClick={() => handleItemClick(file)}
                  onDoubleClick={() => handleItemDoubleClick(file)}
                >
                  <div style={styles.gridIcon}>
                    {file.isDirectory ? <Icons.folder size={48} /> : getFileIcon(file)}
                  </div>
                  <span style={styles.gridLabel}>{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span>{filteredFiles.length} items</span>
        </div>
      </div>

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
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setPreviewFile(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              cursor: 'pointer',
              color: 'white',
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
                src={`file://${previewFile.path}`}
                alt={previewFile.name}
                style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }}
              />
            )}
            {/* Video Preview */}
            {['.mp4', '.mov', '.webm'].includes(previewFile.extension.toLowerCase()) && (
              <video
                src={`file://${previewFile.path}`}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8 }}
              />
            )}
            {/* Audio Preview */}
            {['.mp3', '.wav', '.m4a', '.ogg'].includes(previewFile.extension.toLowerCase()) && (
              <div style={{ background: 'var(--color-bg-elevated)', padding: 32, borderRadius: 12 }}>
                <Icons.music size={64} />
                <div style={{ marginTop: 16, marginBottom: 16, color: 'white', fontSize: 16 }}>{previewFile.name}</div>
                <audio src={`file://${previewFile.path}`} controls autoPlay style={{ width: 300 }} />
              </div>
            )}
            {/* File Name */}
            <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              {previewFile.name} - {formatSize(previewFile.size)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '200px',
    background: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sidebarSection: {
    padding: '8px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    padding: '8px 8px 4px',
    letterSpacing: '0.5px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
  },
  
  // Toolbar
  toolbar: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: '12px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
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
    color: 'var(--color-text-muted)',
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
    borderRadius: '6px',
    padding: '5px 10px',
    width: '180px',
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
    background: 'var(--color-bg-glass)',
    borderRadius: '6px',
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
    padding: '0',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
    position: 'sticky',
    top: 0,
    background: 'var(--color-bg-base)',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'background 0.1s',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '16px',
    padding: '20px',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.1s',
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
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
  },

  // Smart Collections badge
  badge: {
    marginLeft: 'auto',
    background: 'rgba(255,255,255,0.1)',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },

  // Filter bar
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
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
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};

Files.displayName = 'Files';
export default memo(Files);