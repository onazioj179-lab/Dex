// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - File Intelligence Store
// Phase 38: Renderer-side state management for file intelligence
// ===========================================================================

import { create } from 'zustand';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface FileMetadata {
  id: string;
  path: string;
  name: string;
  extension: string;
  size: number;
  created: Date;
  modified: Date;
  type: FileType;
  category: FileCategory;
  mimeType: string;
  isHidden: boolean;
  thumbnail?: string;
}

export type FileType = 
  | 'document' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'archive' 
  | 'code' 
  | 'data' 
  | 'executable' 
  | 'font' 
  | 'other';

export type FileCategory = 
  | 'work' 
  | 'personal' 
  | 'media' 
  | 'development' 
  | 'system' 
  | 'temp' 
  | 'download' 
  | 'unknown';

export interface FileGroup {
  id: string;
  name: string;
  type: 'type' | 'date' | 'project' | 'size' | 'custom';
  files: string[];
  count: number;
  totalSize: number;
}

export interface OrganizationSuggestion {
  id: string;
  type: 'move' | 'rename' | 'group' | 'archive' | 'cleanup';
  description: string;
  files: string[];
  targetPath?: string;
  confidence: number;
  approved: boolean;
  applied: boolean;
}

export interface FileStatistics {
  totalFiles: number;
  totalSize: number;
  totalSizeFormatted: string;
  byType: Record<string, { count: number; size: number }>;
  byCategory: Record<string, { count: number; size: number }>;
  watchedDirectories: number;
  authorizedPaths: number;
  pendingSuggestions: number;
}

export type ViewMode = 'grid' | 'list' | 'groups';
export type SortBy = 'name' | 'date' | 'size' | 'type';
export type GroupBy = 'none' | 'type' | 'date' | 'category';

// Maximum number of file entries to keep in memory (LRU eviction)
const MAX_FILE_CACHE_SIZE = 10_000;

// -----------------------------------------------------------------------------
// Store State
// -----------------------------------------------------------------------------

interface FileIntelligenceState {
  // Data
  files: FileMetadata[];
  authorizedPaths: string[];
  groups: FileGroup[];
  suggestions: OrganizationSuggestion[];
  statistics: FileStatistics | null;
  
  // UI State
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDesc: boolean;
  groupBy: GroupBy;
  searchQuery: string;
  selectedFiles: Set<string>;
  currentPath: string | null;
  
  // Loading States
  isScanning: boolean;
  isLoading: boolean;
  scanProgress: { path: string; status: string } | null;
  
  // Filters
  typeFilter: FileType | null;
  categoryFilter: FileCategory | null;
  showHidden: boolean;
}

interface FileIntelligenceActions {
  // Data Actions
  setFiles: (files: FileMetadata[]) => void;
  addFile: (file: FileMetadata) => void;
  removeFile: (id: string) => void;
  setAuthorizedPaths: (paths: string[]) => void;
  setGroups: (groups: FileGroup[]) => void;
  setSuggestions: (suggestions: OrganizationSuggestion[]) => void;
  setStatistics: (stats: FileStatistics) => void;
  
  // UI Actions
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (sort: SortBy) => void;
  toggleSortOrder: () => void;
  setGroupBy: (group: GroupBy) => void;
  setSearchQuery: (query: string) => void;
  setCurrentPath: (path: string | null) => void;
  
  // Selection
  selectFile: (id: string) => void;
  deselectFile: (id: string) => void;
  toggleFileSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  
  // Loading
  setScanning: (scanning: boolean) => void;
  setLoading: (loading: boolean) => void;
  setScanProgress: (progress: { path: string; status: string } | null) => void;
  
  // Filters
  setTypeFilter: (type: FileType | null) => void;
  setCategoryFilter: (category: FileCategory | null) => void;
  setShowHidden: (show: boolean) => void;
  
  // Computed
  getFilteredFiles: () => FileMetadata[];
  getSortedFiles: () => FileMetadata[];
}

// -----------------------------------------------------------------------------
// Store Implementation
// -----------------------------------------------------------------------------

export const useFileIntelligenceStore = create<FileIntelligenceState & FileIntelligenceActions>((set, get) => ({
  // Initial State
  files: [],
  authorizedPaths: [],
  groups: [],
  suggestions: [],
  statistics: null,
  
  viewMode: 'grid',
  sortBy: 'date',
  sortDesc: true,
  groupBy: 'none',
  searchQuery: '',
  selectedFiles: new Set(),
  currentPath: null,
  
  isScanning: false,
  isLoading: false,
  scanProgress: null,
  
  typeFilter: null,
  categoryFilter: null,
  showHidden: false,
  
  // Data Actions
  setFiles: (files) => set({ files: files.slice(-MAX_FILE_CACHE_SIZE) }),
  addFile: (file) => set((state) => {
    const updated = [...state.files.filter(f => f.id !== file.id), file];
    return { files: updated.length > MAX_FILE_CACHE_SIZE ? updated.slice(-MAX_FILE_CACHE_SIZE) : updated };
  }),
  removeFile: (id) => set((state) => ({ 
    files: state.files.filter(f => f.id !== id) 
  })),
  setAuthorizedPaths: (paths) => set({ authorizedPaths: paths }),
  setGroups: (groups) => set({ groups }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setStatistics: (stats) => set({ statistics: stats }),
  
  // UI Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleSortOrder: () => set((state) => ({ sortDesc: !state.sortDesc })),
  setGroupBy: (group) => set({ groupBy: group }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setCurrentPath: (path) => set({ currentPath: path }),
  
  // Selection
  selectFile: (id) => set((state) => {
    const newSelection = new Set(state.selectedFiles);
    newSelection.add(id);
    return { selectedFiles: newSelection };
  }),
  deselectFile: (id) => set((state) => {
    const newSelection = new Set(state.selectedFiles);
    newSelection.delete(id);
    return { selectedFiles: newSelection };
  }),
  toggleFileSelection: (id) => set((state) => {
    const newSelection = new Set(state.selectedFiles);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    return { selectedFiles: newSelection };
  }),
  selectAll: () => set((state) => ({
    selectedFiles: new Set(state.files.map(f => f.id))
  })),
  clearSelection: () => set({ selectedFiles: new Set() }),
  
  // Loading
  setScanning: (scanning) => set({ isScanning: scanning }),
  setLoading: (loading) => set({ isLoading: loading }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  
  // Filters
  setTypeFilter: (type) => set({ typeFilter: type }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setShowHidden: (show) => set({ showHidden: show }),
  
  // Computed
  getFilteredFiles: () => {
    const state = get();
    let filtered = [...state.files];
    
    // Search filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(query) ||
        f.path.toLowerCase().includes(query)
      );
    }
    
    // Type filter
    if (state.typeFilter) {
      filtered = filtered.filter(f => f.type === state.typeFilter);
    }
    
    // Category filter
    if (state.categoryFilter) {
      filtered = filtered.filter(f => f.category === state.categoryFilter);
    }
    
    // Hidden filter
    if (!state.showHidden) {
      filtered = filtered.filter(f => !f.isHidden);
    }
    
    return filtered;
  },
  
  getSortedFiles: () => {
    const state = get();
    const filtered = state.getFilteredFiles();
    
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (state.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = new Date(a.modified).getTime() - new Date(b.modified).getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return state.sortDesc ? -comparison : comparison;
    });
    
    return sorted;
  },
}));

// -----------------------------------------------------------------------------
// API Hooks
// -----------------------------------------------------------------------------

export const useFileIntelligenceAPI = () => {
  const store = useFileIntelligenceStore();
  
  const authorizePath = async (path?: string) => {
    if (!window.dex?.fileIntel) throw new Error('File Intelligence API not available');
    const result = await window.dex.fileIntel.authorizePath(path);
    if (result.success) {
      const paths = await window.dex.fileIntel.getAuthorizedPaths();
      store.setAuthorizedPaths(paths);
    }
    return result;
  };
  
  const revokePath = async (path: string) => {
    if (!window.dex?.fileIntel) return;
    await window.dex.fileIntel.revokePath(path);
    const paths = await window.dex.fileIntel.getAuthorizedPaths();
    store.setAuthorizedPaths(paths);
  };
  
  const scanDirectory = async (path: string, options?: { recursive?: boolean }) => {
    if (!window.dex?.fileIntel) return { success: false, files: [] };
    store.setScanning(true);
    store.setScanProgress({ path, status: 'scanning' });
    
    try {
      const result = await window.dex.fileIntel.scanDirectory(path, options);
      if (result.success) {
        store.setFiles(result.files);
      }
      return result;
    } finally {
      store.setScanning(false);
      store.setScanProgress(null);
    }
  };
  
  const loadAllFiles = async () => {
    if (!window.dex?.fileIntel) return;
    store.setLoading(true);
    try {
      const files = await window.dex.fileIntel.getAllFiles();
      store.setFiles(files);
    } finally {
      store.setLoading(false);
    }
  };
  
  const loadStatistics = async () => {
    if (!window.dex?.fileIntel) return;
    const stats = await window.dex.fileIntel.getStatistics();
    store.setStatistics(stats);
  };
  
  const loadGroups = async (groupBy: GroupBy) => {
    if (!window.dex?.fileIntel) return;
    let groups: FileGroup[] = [];
    
    switch (groupBy) {
      case 'type':
        groups = await window.dex.fileIntel.groupByType();
        break;
      case 'date':
        groups = await window.dex.fileIntel.groupByDate('month');
        break;
      default:
        groups = [];
    }
    
    store.setGroups(groups);
  };
  
  const loadSuggestions = async () => {
    if (!window.dex?.fileIntel) return;
    const suggestions = await window.dex.fileIntel.getSuggestions();
    store.setSuggestions(suggestions);
  };
  
  const openFile = async (path: string) => {
    if (!window.dex?.fileIntel) return;
    return await window.dex.fileIntel.openFile(path);
  };
  
  const revealInExplorer = async (path: string) => {
    if (!window.dex?.fileIntel) return;
    return await window.dex.fileIntel.revealInExplorer(path);
  };
  
  const searchFiles = async (query: string) => {
    if (!window.dex?.fileIntel) return [];
    const results = await window.dex.fileIntel.searchFiles(query);
    return results;
  };
  
  return {
    authorizePath,
    revokePath,
    scanDirectory,
    loadAllFiles,
    loadStatistics,
    loadGroups,
    loadSuggestions,
    openFile,
    revealInExplorer,
    searchFiles,
  };
};

export default useFileIntelligenceStore;
