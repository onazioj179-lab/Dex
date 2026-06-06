// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * GALLERY - iOS-Style Unified Media Gallery
 * All photos and videos in one place. Recent media at bottom.
 * Grid + list views, favorites, albums, lightbox with video playback.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import { type ExifData, loadExifFromPath } from '../utils/exifParser';
import DexIcon from '../components/DexIcon';
import { useCreativeSuite } from '../services/CreativeSuiteBridge';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import ContextMenu, { useContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { openPiP } from '../components/PictureInPicture';

// ===========================================================================
// TYPES
// ===========================================================================

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  src: string;
  url: string;
  thumbnail: string;
  name: string;
  date: Date;
  size: number;
  duration?: number;
  favorite: boolean;
  format?: string;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

interface Album {
  id: string;
  name: string;
  icon: string;
}

// ===========================================================================
// ICONS
// ===========================================================================

const Icons = {
  grid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  list: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  heart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ),
  heartOutline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ),
  photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  video: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M10 9l5 3-5 3V9z"/>
    </svg>
  ),
  folder: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  share: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
  zoomIn: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
    </svg>
  ),
  zoomOut: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/>
    </svg>
  ),
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
  rotateRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 11-.57-8.38L21.5 8"/>
    </svg>
  ),
  chevronLeft: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  ),
  chevronRight: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
};

// ===========================================================================
// ALBUMS
// ===========================================================================

const ALBUMS: Album[] = [
  { id: 'all', name: 'All Media', icon: 'photo' },
  { id: 'photos', name: 'Photos', icon: 'photo' },
  { id: 'videos', name: 'Videos', icon: 'video' },
  { id: 'favorites', name: 'Favorites', icon: 'heart' },
  { id: 'recent', name: 'Recents', icon: 'clock' },
  { id: 'screenshots', name: 'Screenshots', icon: 'folder' },
];

// ===========================================================================
// DATA LOADING - Load both pictures AND videos from system
// ===========================================================================

const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v)$/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff|heic|heif)$/i;

const loadAllMedia = async (): Promise<MediaItem[]> => {
  const allMedia: MediaItem[] = [];

  try {
    if (window.electron?.invoke) {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));

      // Load pictures and videos in parallel
      const [pictureFiles, videoFiles] = await Promise.all([
        Promise.race([window.electron.invoke('media:getMediaFiles', 'pictures'), timeout]),
        Promise.race([window.electron.invoke('media:getMediaFiles', 'videos'), timeout]),
      ]);

      const processFiles = (files: Array<{ path?: string; name?: string; extension?: string; modified?: number; size?: number; duration?: number }>, fallbackType: 'image' | 'video') => {
        if (!files || !Array.isArray(files)) return;
        for (const f of files) {
          const ext = (f.extension || f.name?.split('.').pop() || '').toLowerCase();
          const isVideo = VIDEO_EXTENSIONS.test(`.${ext}`);
          const isImage = IMAGE_EXTENSIONS.test(`.${ext}`);
          const type: 'image' | 'video' = isVideo ? 'video' : isImage ? 'image' : fallbackType;

          const filePath = f.path ? `file://${f.path.replace(/\\/g, '/')}` : '';
          allMedia.push({
            id: f.path || `media-${allMedia.length}`,
            type,
            src: filePath,
            url: filePath,
            thumbnail: filePath,
            name: f.name || `media-${allMedia.length}`,
            date: new Date(f.modified || Date.now()),
            size: f.size || 0,
            duration: f.duration || undefined,
            favorite: false,
            format: ext.toUpperCase() || undefined,
            width: (f as any).width || undefined,
            height: (f as any).height || undefined,
            fps: (f as any).fps || undefined,
            codec: (f as any).codec || undefined,
          });
        }
      };

      processFiles((pictureFiles ?? []) as Parameters<typeof processFiles>[0], 'image');
      processFiles((videoFiles ?? []) as Parameters<typeof processFiles>[0], 'video');
    }
  } catch (err) {
    console.warn('Failed to load media from system:', err);
  }

  // Fallback to localStorage
  if (allMedia.length === 0) {
    try {
      const saved = localStorage.getItem('dex-gallery-media');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, date: new Date(m.date) }));
      }
    } catch { /* */ }
  }

  // Deduplicate by path
  const seen = new Set<string>();
  return allMedia.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
};

// Favorites persistence
const loadFavorites = async (): Promise<string[]> => {
  try {
    if (window.electron?.invoke) {
      const result = await window.electron.invoke('capability:storage:get', 'dex-gallery-favorites');
      if (result) {
        const parsed = JSON.parse(result);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
  } catch { /* */ }
  try {
    const saved = localStorage.getItem('dex-gallery-favorites');
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch { return []; }
};

const saveFavorites = async (favorites: string[]) => {
  const data = JSON.stringify(favorites);
  localStorage.setItem('dex-gallery-favorites', data);
  try { await window.electron?.invoke?.('capability:storage:set', 'dex-gallery-favorites', data); } catch { /* */ }
};

// ===========================================================================
// HELPERS
// ===========================================================================

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatDate = (date: Date): string => date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PLACEHOLDER_COLORS = ['var(--color-error)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-info, #64d2ff)', 'var(--color-accent)', 'var(--color-accent-alt, #5e5ce6)', 'var(--color-tag-purple, #bf5af2)'];
const getPlaceholderColor = (id: string): string => PLACEHOLDER_COLORS[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % PLACEHOLDER_COLORS.length];

// ===========================================================================
// VIRTUALIZED GRID (Phase 4)
// ===========================================================================

interface VirtualizedMediaGridProps<T extends { id: string }> {
  parentRef: React.RefObject<HTMLDivElement>;
  items: T[];
  columnsCount: number;
  renderItem: (item: T) => React.ReactNode;
}

function VirtualizedMediaGrid<T extends { id: string }>({ parentRef, items, columnsCount, renderItem }: VirtualizedMediaGridProps<T>) {
  const cols = Math.max(1, columnsCount);
  const rowCount = Math.ceil(items.length / cols);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 4,
  });
  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto', contain: 'layout' as any }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowStart = virtualRow.index * cols;
          const rowItems = items.slice(rowStart, rowStart + cols);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 16,
                paddingBottom: 16,
              }}
            >
              {rowItems.map(renderItem)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Gallery: React.FC = () => {
  useAppTracking('gallery');
  const toast = useToastHelpers();
  const { sendToApp } = useCreativeSuite();
  const { launchApp } = useRunningApps();

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesLoadedRef = useRef(false); // Track if favorites were loaded from storage
  const [selectedAlbum, setSelectedAlbum] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Image zoom/pan state (iOS-style)
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgDragging, setImgDragging] = useState(false);
  const [imgDragStart, setImgDragStart] = useState({ x: 0, y: 0 });
  const [imgRotation, setImgRotation] = useState(0);
  const [showMediaInfo, setShowMediaInfo] = useState(false);

  // === PRO FEATURES STATE ===
  const [showSmartAlbums, setShowSmartAlbums] = useState(false);
  const [smartAlbumRules, setSmartAlbumRules] = useState<Array<{ name: string; rule: string; count: number }>>([
    { name: 'Screenshots', rule: 'type:image AND name:screenshot*', count: 0 },
    { name: 'This Week', rule: 'date:last7days', count: 0 },
    { name: 'Videos', rule: 'type:video', count: 0 },
    { name: 'Large Files', rule: 'size:>10MB', count: 0 },
  ]);
  const [starRatings, setStarRatings] = useState<Record<string, number>>({});
  const [colorLabels, setColorLabels] = useState<Record<string, string>>({});
  const [showExifPanel, setShowExifPanel] = useState(false);
  const [exifCache, setExifCache] = useState<Record<string, ExifData | null>>({});
  const [showFaceDetection, setShowFaceDetection] = useState(false);
  const [faceGroups, setFaceGroups] = useState<Array<{ name: string; count: number; color: string }>>([]);
  const [showTagSystem, setShowTagSystem] = useState(false);
  const [mediaTags, setMediaTags] = useState<Record<string, string[]>>({});
  const [tagInput, setTagInput] = useState('');
  const [showQuickAdjust, setShowQuickAdjust] = useState(false);
  const adjustCacheKey = selectedMedia ? `dex-gallery-adj-${selectedMedia.id}` : null;
  const cachedAdj = useMemo(() => {
    if (!adjustCacheKey) return null;
    try { return JSON.parse(localStorage.getItem(adjustCacheKey) || 'null'); } catch { return null; }
  }, [adjustCacheKey]);
  const [adjustExposure, setAdjustExposure] = useState(0);
  const [adjustContrast, setAdjustContrast] = useState(0);
  const [adjustSaturation, setAdjustSaturation] = useState(0);
  const [adjustTemp, setAdjustTemp] = useState(0);
  const [showCropRotate, setShowCropRotate] = useState(false);
  const [cropRatio, setCropRatio] = useState<'free' | '16:9' | '4:3' | '1:1' | '3:2'>('free');
  const [straightenAngle, setStraightenAngle] = useState(0);
  const [showPresets, setShowPresets] = useState(false);
  const [showCompareMode, setShowCompareMode] = useState(false);
  const [compareItem, setCompareItem] = useState<MediaItem | null>(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(4);
  const [slideshowTransition, setSlideshowTransition] = useState<'fade' | 'slide' | 'zoom'>('fade');
  const [slideshowRunning, setSlideshowRunning] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);

  // Batch selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Anchor index (within sortedMedia) for shift-click range selection.
  const lastSelectedIndexRef = useRef<number | null>(null);

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Filtered media based on album (moved before selectAll which depends on it)
  const filteredMedia = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    return media.filter(item => {
      switch (selectedAlbum) {
        case 'photos': return item.type === 'image';
        case 'videos': return item.type === 'video';
        case 'favorites': return favorites.includes(item.id);
        case 'recent': return (now - item.date.getTime()) < sevenDays;
        case 'screenshots': return item.name?.toLowerCase().includes('screenshot');
        default: return true;
      }
    });
  }, [media, favorites, selectedAlbum]);

  // Sort: newest first
  const sortedMedia = useMemo(() =>
    [...filteredMedia].sort((a, b) => b.date.getTime() - a.date.getTime()),
  [filteredMedia]);

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(filteredMedia.map(m => m.id)));
  }, [filteredMedia]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    setSelectionMode(false);
    lastSelectedIndexRef.current = null;
  }, []);

  // Single entry point for clicking a grid/list item: Ctrl/Cmd or selection-mode
  // toggles selection, Shift extends a range from the last anchor, otherwise it
  // opens the item in the lightbox.
  const handleItemActivate = useCallback((item: MediaItem, e: React.MouseEvent) => {
    const additive = selectionMode || e.ctrlKey || e.metaKey || e.shiftKey;
    if (additive) {
      const index = sortedMedia.findIndex(m => m.id === item.id);
      if (e.shiftKey && lastSelectedIndexRef.current !== null && index >= 0) {
        const a = Math.min(lastSelectedIndexRef.current, index);
        const b = Math.max(lastSelectedIndexRef.current, index);
        setSelectedItems(prev => {
          const next = new Set(prev);
          for (let i = a; i <= b; i++) { const m = sortedMedia[i]; if (m) next.add(m.id); }
          return next;
        });
      } else {
        toggleItemSelection(item.id);
        lastSelectedIndexRef.current = index;
      }
      if (!selectionMode) setSelectionMode(true);
    } else {
      setSelectedMedia(item);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'galleryItemsViewed', amount: 1 } }));
    }
  }, [selectionMode, sortedMedia, toggleItemSelection]);

  const batchDelete = useCallback(() => {
    if (selectedItems.size === 0) return;
    setMedia(prev => prev.filter(m => !selectedItems.has(m.id)));
    clearSelection();
  }, [selectedItems, clearSelection]);

  const batchExport = useCallback(() => {
    if (selectedItems.size === 0) return;
    const toExport = media.filter(m => selectedItems.has(m.id) && m.src);
    if (toExport.length === 0) { toast.error('No exportable files selected'); return; }
    if (toExport.length > 20 && !confirm(`Export ${toExport.length} files? This may take a moment.`)) return;
    let failed = 0;
    toExport.forEach((m, i) => {
      setTimeout(() => {
        try {
          const a = document.createElement('a');
          a.href = m.src;
          a.download = m.name;
          a.click();
        } catch { failed++; }
        if (i === toExport.length - 1 && failed > 0) toast.error(`${failed} file(s) failed to download`);
      }, i * 200);
    });
  }, [selectedItems, media]);

  // Slideshow auto-advance
  useEffect(() => {
    if (!slideshowRunning) return;
    const images = filteredMedia.filter(m => m.type === 'image');
    if (images.length === 0) { setSlideshowRunning(false); return; }
    const timer = setInterval(() => {
      setSlideshowIndex(prev => (prev + 1) % images.length);
    }, slideshowInterval * 1000);
    return () => clearInterval(timer);
  }, [slideshowRunning, slideshowInterval, filteredMedia]);

  // Restore cached adjustments when selecting a media item
  useEffect(() => {
    if (cachedAdj) {
      setAdjustExposure(cachedAdj.e ?? 0);
      setAdjustContrast(cachedAdj.c ?? 0);
      setAdjustSaturation(cachedAdj.s ?? 0);
      setAdjustTemp(cachedAdj.t ?? 0);
    } else {
      setAdjustExposure(0); setAdjustContrast(0); setAdjustSaturation(0); setAdjustTemp(0);
    }
  }, [adjustCacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist adjustments to localStorage when changed
  useEffect(() => {
    if (!adjustCacheKey) return;
    const hasAdj = adjustExposure !== 0 || adjustContrast !== 0 || adjustSaturation !== 0 || adjustTemp !== 0;
    if (hasAdj) {
      localStorage.setItem(adjustCacheKey, JSON.stringify({ e: adjustExposure, c: adjustContrast, s: adjustSaturation, t: adjustTemp }));
    } else {
      localStorage.removeItem(adjustCacheKey);
    }
  }, [adjustCacheKey, adjustExposure, adjustContrast, adjustSaturation, adjustTemp]);

  const startSlideshow = useCallback(() => {
    setSlideshowIndex(0);
    setSlideshowRunning(true);
    setShowSlideshow(false);
  }, []);

  const stopSlideshow = useCallback(() => {
    setSlideshowRunning(false);
  }, []);

  // Reset zoom/pan when media changes
  useEffect(() => {
    setImgZoom(1);
    setImgPan({ x: 0, y: 0 });
    setImgRotation(0);
    setShowMediaInfo(false);
  }, [selectedMedia?.id]);

  // Throttle wheel zoom to 60ms to prevent jank
  const handleImageWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const now = performance.now();
    if ((handleImageWheel as any)._lastCall && now - (handleImageWheel as any)._lastCall < 60) return;
    (handleImageWheel as any)._lastCall = now;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setImgZoom(prev => Math.min(Math.max(prev + delta, 0.5), 8));
  }, []);

  const handleImagePointerDown = useCallback((e: React.PointerEvent) => {
    if (imgZoom <= 1) return;
    setImgDragging(true);
    setImgDragStart({ x: e.clientX - imgPan.x, y: e.clientY - imgPan.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [imgZoom, imgPan]);

  const handleImagePointerMove = useCallback((e: React.PointerEvent) => {
    if (!imgDragging) return;
    setImgPan({ x: e.clientX - imgDragStart.x, y: e.clientY - imgDragStart.y });
  }, [imgDragging, imgDragStart]);

  const handleImagePointerUp = useCallback(() => {
    setImgDragging(false);
  }, []);

  const handleImageDoubleClick = useCallback(() => {
    if (imgZoom > 1) {
      setImgZoom(1);
      setImgPan({ x: 0, y: 0 });
    } else {
      setImgZoom(3);
    }
  }, [imgZoom]);

  const zoomIn = useCallback(() => setImgZoom(prev => Math.min(prev + 0.5, 8)), []);
  const zoomOut = useCallback(() => {
    setImgZoom(prev => {
      const next = Math.max(prev - 0.5, 1);
      if (next <= 1) setImgPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const zoomReset = useCallback(() => { setImgZoom(1); setImgPan({ x: 0, y: 0 }); }, []);
  const rotateImage = useCallback(() => setImgRotation(prev => (prev + 90) % 360), []);

  // Convert adjustment sliders to CSS filter string
  const getAdjustmentFilter = useCallback(() => {
    const parts: string[] = [];
    if (adjustExposure !== 0) parts.push(`brightness(${1 + adjustExposure / 100})`);
    if (adjustContrast !== 0) parts.push(`contrast(${1 + adjustContrast / 100})`);
    if (adjustSaturation !== 0) parts.push(`saturate(${1 + adjustSaturation / 100})`);
    if (adjustTemp !== 0) parts.push(adjustTemp > 0 ? `sepia(${adjustTemp / 200})` : `hue-rotate(${adjustTemp / 4}deg)`);
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [adjustExposure, adjustContrast, adjustSaturation, adjustTemp]);

  const copyImageToClipboard = useCallback(async () => {
    if (!selectedMedia?.src) return;
    try {
      const res = await fetch(selectedMedia.src);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch {
      try { await navigator.clipboard.writeText(selectedMedia.src); } catch { toast.error('Failed to copy to clipboard'); }
    }
  }, [selectedMedia]);

  const getMediaFormat = useCallback((item: MediaItem): string => {
    if (item.format) return item.format;
    const ext = item.name.split('.').pop()?.toUpperCase() || '';
    return ext;
  }, []);

  // Video player state (Tahoe-style custom controls)
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(80);
  const [videoMuted, setVideoMuted] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const videoControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup video controls timer on unmount
  useEffect(() => {
    return () => { if (videoControlsTimer.current) clearTimeout(videoControlsTimer.current); };
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      videoRef.current.volume = videoVolume / 100;
    }
  }, [videoVolume]);

  const toggleVideoPlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setVideoPlaying(false);
    }
  }, []);

  const seekVideo = useCallback((pct: number) => {
    if (!videoRef.current || !videoDuration) return;
    videoRef.current.currentTime = (pct / 100) * videoDuration;
  }, [videoDuration]);

  const changeVideoVolume = useCallback((vol: number) => {
    setVideoVolume(vol);
    if (videoRef.current) videoRef.current.volume = vol / 100;
    if (vol > 0) setVideoMuted(false);
  }, []);

  const toggleVideoMute = useCallback(() => {
    if (!videoRef.current) return;
    const next = !videoMuted;
    setVideoMuted(next);
    videoRef.current.muted = next;
  }, [videoMuted]);

  const toggleVideoFullscreen = useCallback(() => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen?.();
    }
  }, []);

  const handleVideoMouseMove = useCallback(() => {
    setShowVideoControls(prev => { if (prev) return prev; return true; });
    if (videoControlsTimer.current) clearTimeout(videoControlsTimer.current);
    videoControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowVideoControls(false);
    }, 3000);
  }, []);

  // Keyboard shortcuts for Gallery video playback and image navigation
  useEffect(() => {
    if (!selectedMedia) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (selectedMedia.type === 'video') {
        if (e.key === ' ') { e.preventDefault(); toggleVideoPlay(); }
        else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.min(videoDuration, videoRef.current.currentTime + 5); }
        else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5); }
        else if (e.key === 'f') toggleVideoFullscreen();
        else if (e.key === 'm') toggleVideoMute();
      }
      if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); navigateMedia('next'); }
      else if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); navigateMedia('prev'); }
      else if (e.key === 'Escape') setSelectedMedia(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, toggleVideoPlay, toggleVideoFullscreen, toggleVideoMute, videoDuration]);

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Load all media (pictures + videos) on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [loadedMedia, loadedFavs] = await Promise.all([loadAllMedia(), loadFavorites()]);
        if (mounted) {
          setMedia(loadedMedia);
          setFavorites(loadedFavs);
          favoritesLoadedRef.current = true; // Mark initial load complete
        }
      } catch { toast.error('Failed to load gallery'); } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Save favorites to storage (only after initial load)
  useEffect(() => { 
    if (favoritesLoadedRef.current) {
      saveFavorites(favorites); 
    }
  }, [favorites]);

  // Load EXIF data when selecting a media item with EXIF panel open
  useEffect(() => {
    if (!showExifPanel || !selectedMedia || selectedMedia.type !== 'image') return;
    if (exifCache[selectedMedia.id] !== undefined) return; // already loaded or attempted
    let cancelled = false;
    loadExifFromPath(selectedMedia.src).then(data => {
      if (!cancelled) setExifCache(prev => ({ ...prev, [selectedMedia.id]: data }));
    });
    return () => { cancelled = true; };
  }, [showExifPanel, selectedMedia, exifCache]);

  const currentExif = selectedMedia ? exifCache[selectedMedia.id] ?? null : null;

  // Recent media (last 24h) for the "recently recorded" section at bottom
  const recentMedia = useMemo(() => {
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    return media
      .filter(m => m.date.getTime() > dayAgo)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 20);
  }, [media]);

  // Album counts - single pass instead of 6 separate filter calls
  const albumCounts = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000;
    const counts = { all: 0, photos: 0, videos: 0, favorites: 0, recent: 0, screenshots: 0 };
    const favSet = new Set(favorites);
    for (const m of media) {
      counts.all++;
      if (m.type === 'image') counts.photos++;
      if (m.type === 'video') counts.videos++;
      if (favSet.has(m.id)) counts.favorites++;
      if (now - m.date.getTime() < sevenDays) counts.recent++;
      if (m.name?.toLowerCase().includes('screenshot')) counts.screenshots++;
    }
    return counts;
  }, [media, favorites]);

  // Progressive loading: render items in batches for smooth scrolling
  const ITEMS_PER_PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  // Reset visible count when album/filter changes
  useEffect(() => { setVisibleCount(ITEMS_PER_PAGE); }, [selectedAlbum]);
  const visibleMedia = useMemo(() => sortedMedia.slice(0, visibleCount), [sortedMedia, visibleCount]);
  const hasMoreItems = visibleCount < sortedMedia.length;

  // IntersectionObserver for automatic infinite scroll
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMoreItems) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(c => c + ITEMS_PER_PAGE);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreItems]);

  // Phase 4: Virtualized grid (used when visibleMedia.length >= 60)
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const [columnsCount, setColumnsCount] = useState(6);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      // Match styles.grid: minmax(140px, 1fr) with 16px gap
      const ITEM_MIN = 140;
      const GAP = 16;
      const cols = Math.max(1, Math.floor((w + GAP) / (ITEM_MIN + GAP)));
      setColumnsCount(cols);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }, []);

  const navigateMedia = useCallback((direction: 'prev' | 'next') => {
    if (!selectedMedia) return;
    const idx = sortedMedia.findIndex(m => m.id === selectedMedia.id);
    if (direction === 'prev' && idx > 0) setSelectedMedia(sortedMedia[idx - 1]);
    else if (direction === 'next' && idx < sortedMedia.length - 1) setSelectedMedia(sortedMedia[idx + 1]);
  }, [selectedMedia, sortedMedia]);

  const deleteMedia = useCallback((item: MediaItem) => {
    setMedia(prev => prev.filter(m => m.id !== item.id));
    setSelectedMedia(null);
  }, []);

  // Context menu
  const { menuState, show: showCtxMenu, close: closeCtxMenu } = useContextMenu();
  const buildCtxItems = useCallback((item: MediaItem): ContextMenuItem[] => {
    const isFav = favorites.includes(item.id);
    // Right-clicking inside a multi-selection acts on the whole selection.
    if (selectedItems.has(item.id) && selectedItems.size > 1) {
      const count = selectedItems.size;
      return [
        { id: 'export-sel', label: `Export ${count} items`, icon: Icons.download, onSelect: batchExport },
        { id: 'deselect', label: 'Clear selection', icon: Icons.close, onSelect: clearSelection, dividerAfter: true },
        { id: 'delete-sel', label: `Delete ${count} items`, icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: batchDelete },
      ];
    }
    return [
      { id: 'open', label: 'Open', icon: Icons.grid, onSelect: () => setSelectedMedia(item) },
      { id: 'select', label: selectedItems.has(item.id) ? 'Deselect' : 'Select', icon: Icons.grid, onSelect: () => { setSelectionMode(true); toggleItemSelection(item.id); lastSelectedIndexRef.current = sortedMedia.findIndex(m => m.id === item.id); }, dividerAfter: true },
      { id: 'fav', label: isFav ? 'Unfavorite' : 'Favorite', icon: Icons.heart, onSelect: () => toggleFavorite(item.id), dividerAfter: true },
      { id: 'copy', label: 'Copy to Clipboard', shortcut: 'Ctrl+C', icon: Icons.copy, onSelect: () => { setSelectedMedia(item); setTimeout(() => copyImageToClipboard(), 50); } },
      ...(item.type === 'image' ? [
        { id: 'prism', label: 'Edit in Prism', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'image' as const, data: item.src, sourceApp: 'gallery' }, 'prism') },
      ] : []),
      ...(item.type === 'video' ? [
        { id: 'vinx', label: 'Edit in Vinx', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'videoeditor') },
        { id: 'forge', label: 'Send to Forge', icon: Icons.settings, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'forge') },
      ] : []),
      { id: 'files', label: 'Show in Files', icon: Icons.folder, onSelect: () => { if ((window as any).electron?.invoke) (window as any).electron.invoke('shell:showItemInFolder', item.src); }, dividerAfter: true },
      { id: 'delete', label: 'Delete', icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: () => deleteMedia(item) },
    ];
  }, [favorites, selectedItems, sortedMedia, toggleFavorite, toggleItemSelection, copyImageToClipboard, sendToApp, deleteMedia, batchExport, batchDelete, clearSelection]);

  // Lightbox keyboard nav
  useEffect(() => {
    if (!selectedMedia) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedMedia(null);
      else if (e.key === 'ArrowLeft') navigateMedia('prev');
      else if (e.key === 'ArrowRight') navigateMedia('next');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, navigateMedia]);

  // Grid-level selection shortcuts: Ctrl/Cmd+A select all, Delete/Backspace remove
  // the selection, Escape clears it. Suppressed while the lightbox or a text field
  // is focused so it never eats typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedMedia) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSelectionMode(true); selectAll(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedItems.size > 0) { e.preventDefault(); batchDelete(); } return; }
      if (e.key === 'Escape') { if (selectionMode || selectedItems.size > 0) { e.preventDefault(); clearSelection(); } return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, selectionMode, selectedItems, selectAll, batchDelete, clearSelection]);

  const albumIcon = (id: string) => {
    switch (id) {
      case 'photos': return Icons.photo;
      case 'videos': return Icons.video;
      case 'favorites': return Icons.heart;
      case 'recent': return Icons.clock;
      case 'screenshots': case 'all': default: return Icons.folder;
    }
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
      `}</style>
      {/* Sidebar */}
      <div style={{
        ...styles.sidebar,
        width: sidebarCollapsed ? 44 : 220,
        minWidth: sidebarCollapsed ? 44 : 220,
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}>
        <div style={styles.sidebarHeader}>
          {!sidebarCollapsed && <span style={styles.sidebarTitle}>Gallery</span>}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', width: 28, height: 28, borderRadius: 6,
              marginLeft: sidebarCollapsed ? 0 : 'auto', flexShrink: 0,
              transition: 'transform 0.2s ease',
              transform: sidebarCollapsed ? 'rotate(180deg)' : 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 19l-7-7 7-7"/><path d="M18 19l-7-7 7-7" opacity="0.4"/></svg>
          </button>
        </div>
        {!sidebarCollapsed && (
        <div style={styles.albumList}>
          <div style={styles.sectionLabel}>Library</div>
          {ALBUMS.slice(0, 4).map(album => (
            <button
              key={album.id}
              style={{
                ...styles.albumItem,
                background: selectedAlbum === album.id ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
                color: selectedAlbum === album.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              aria-label={album.name}
              aria-pressed={selectedAlbum === album.id}
              onClick={() => setSelectedAlbum(album.id)}
            >
              {albumIcon(album.id)}
              <span style={{ flex: 1 }}>{album.name}</span>
              <span style={styles.albumCount}>{albumCounts[album.id as keyof typeof albumCounts] ?? 0}</span>
            </button>
          ))}
          <div style={styles.sectionLabel}>Albums</div>
          {ALBUMS.slice(4).map(album => (
            <button
              key={album.id}
              style={{
                ...styles.albumItem,
                background: selectedAlbum === album.id ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
                color: selectedAlbum === album.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              aria-label={album.name}
              aria-pressed={selectedAlbum === album.id}
              onClick={() => setSelectedAlbum(album.id)}
            >
              {albumIcon(album.id)}
              <span style={{ flex: 1 }}>{album.name}</span>
              <span style={styles.albumCount}>{albumCounts[album.id as keyof typeof albumCounts] ?? 0}</span>
            </button>
          ))}
        </div>
        )}
        {sidebarCollapsed && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', overflow: 'auto' }}>
            {ALBUMS.map(album => (
              <button
                key={album.id}
                onClick={() => setSelectedAlbum(album.id)}
                title={album.name}
                aria-label={album.name}
                style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selectedAlbum === album.id ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
                  color: selectedAlbum === album.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {albumIcon(album.id)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <h2 style={styles.title}>{ALBUMS.find(a => a.id === selectedAlbum)?.name ?? 'All Media'}</h2>
          <div style={styles.toolbarRight}>
            <span style={styles.itemCount}>
              {sortedMedia.length} item{sortedMedia.length !== 1 ? 's' : ''}
              {sortedMedia.filter(m => m.type === 'video').length > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--color-tag-purple, #bf5af2)' }}>
                  {sortedMedia.filter(m => m.type === 'video').length} video{sortedMedia.filter(m => m.type === 'video').length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
            <div style={styles.viewToggle}>
              <button style={{...styles.viewBtn, background: selectionMode ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent', color: selectionMode ? 'var(--color-accent)' : undefined}} aria-label="Toggle selection mode" aria-pressed={selectionMode} onClick={() => { setSelectionMode(v => !v); if (selectionMode) setSelectedItems(new Set()); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </button>
              {selectionMode && selectedItems.size > 0 && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>{selectedItems.size} selected</span>
                  <button onClick={selectAll} aria-label="Select all" style={{ ...styles.viewBtn, fontSize: 10, color: 'var(--color-accent)' }}>All</button>
                  <button onClick={batchExport} aria-label="Export selected" style={{ ...styles.viewBtn, color: 'var(--color-success)' }}>Export</button>
                  <button onClick={batchDelete} aria-label="Delete selected" style={{ ...styles.viewBtn, color: 'var(--color-error)' }}>Delete</button>
                </>
              )}
              <button style={{...styles.viewBtn, background: viewMode === 'grid' ? 'var(--color-border)' : 'transparent'}} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>{Icons.grid}</button>
              <button style={{...styles.viewBtn, background: viewMode === 'list' ? 'var(--color-border)' : 'transparent'}} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>{Icons.list}</button>
            </div>
          </div>
        </div>

        {/* Gallery content */}
        <div style={styles.content}>
          {loading ? (
            <div style={{ ...styles.grid, padding: 16 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ ...styles.gridItem, background: 'var(--color-border-subtle)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>
                  <div style={{ ...styles.thumbnail, background: 'var(--color-bg-hover)' }} />
                  <span style={{ width: '60%', height: 10, borderRadius: 4, background: 'var(--color-bg-hover)', marginTop: 6, display: 'block' }} />
                </div>
              ))}
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
          ) : sortedMedia.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ width: 80, height: 80, borderRadius: 20, background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 36, color: 'var(--color-accent)' }}>{selectedAlbum === 'videos' ? Icons.video : Icons.photo}</span>
              </div>
              <div style={styles.emptyTitle}>
                {selectedAlbum === 'favorites' ? 'No favorites yet'
                  : selectedAlbum === 'videos' ? 'No videos yet'
                  : 'Your gallery is empty'}
              </div>
              <div style={{ ...styles.emptySubtitle, maxWidth: 300, lineHeight: 1.6, marginBottom: 16 }}>
                {selectedAlbum === 'favorites' ? 'Click the heart icon on any photo or video to add it to favorites.'
                  : selectedAlbum === 'videos' ? 'Add video files to your Videos folder and they\'ll appear here.'
                  : 'Add images and videos to your Pictures or Videos folder to see them here.'}
              </div>
              <button
                onClick={() => {
                  try {
                    const folder = selectedAlbum === 'videos' ? 'videos' : 'pictures';
                    window.electron?.invoke?.('shell:openPath', folder);
                  } catch { toast.error('Could not open folder'); }
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)',
                  border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'opacity 0.2s',
                }}
              >
                Open {selectedAlbum === 'videos' ? 'Videos' : 'Pictures'} Folder
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            (() => {
              const renderGridItem = (item: typeof visibleMedia[number]) => (
                <div key={item.id} style={styles.gridItem} onClick={(e) => handleItemActivate(item, e)} onContextMenu={(e) => { if (!selectedItems.has(item.id)) lastSelectedIndexRef.current = sortedMedia.findIndex(m => m.id === item.id); showCtxMenu(e, buildCtxItems(item)); }}>
                  {selectionMode && (
                    <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 6, background: selectedItems.has(item.id) ? 'var(--color-accent)' : 'rgba(0,0,0,0.5)', border: '2px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      {selectedItems.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  )}
                  <div style={{...styles.thumbnail, background: getPlaceholderColor(item.id), overflow: 'hidden'}}>
                    {item.src ? (
                      item.type === 'video' ? (
                        /* Use a static poster div instead of <video> to avoid loading 200+ video decoders */
                        <div style={{ width: '100%', height: '100%', background: getPlaceholderColor(item.id), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <span style={{ fontSize: 28, opacity: 0.5 }}>{Icons.video}</span>
                          )}
                        </div>
                      ) : (
                        <img src={item.thumbnail || item.src} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )
                    ) : null}
                    {item.type === 'video' && (
                      <div style={styles.videoOverlay}>
                        <span style={styles.playBadge}>{Icons.play}</span>
                        {item.duration != null && <span style={styles.durationBadge}>{formatDuration(item.duration)}</span>}
                      </div>
                    )}
                    {favorites.includes(item.id) && <span style={styles.favoriteIcon}>{Icons.heart}</span>}
                    {starRatings[item.id] > 0 && <span style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 1 }}>{Array.from({ length: starRatings[item.id] }).map((_, si) => <svg key={si} width="10" height="10" viewBox="0 0 24 24" fill="var(--color-warning)" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>)}</span>}
                    {colorLabels[item.id] && <span style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: '50%', background: colorLabels[item.id], boxShadow: `0 0 4px ${colorLabels[item.id]}` }} />}
                    <span style={{ position: 'absolute', top: 6, left: 6, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,0,0,0.75)', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                      {getMediaFormat(item)}
                    </span>
                  </div>
                  <span style={styles.itemName}>{item.name}</span>
                </div>
              );
              // Avoid layout shift on tiny libraries
              if (visibleMedia.length < 60) {
                return <div style={styles.grid}>{visibleMedia.map(renderGridItem)}</div>;
              }
              return (
                <VirtualizedMediaGrid
                  parentRef={gridScrollRef}
                  items={visibleMedia}
                  columnsCount={columnsCount}
                  renderItem={renderGridItem}
                />
              );
            })()
          ) : (
            <div style={styles.list}>
              {visibleMedia.map(item => (
                <div key={item.id} style={styles.listItem} onClick={(e) => handleItemActivate(item, e)} onContextMenu={(e) => showCtxMenu(e, buildCtxItems(item))}>
                  <div style={{...styles.listThumb, background: getPlaceholderColor(item.id), overflow: 'hidden', position: 'relative'}}>
                    {item.src ? (
                      item.type === 'video' ? (
                        item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 18, opacity: 0.5 }}>{Icons.video}</span>
                          </div>
                        )
                      ) : (
                        <img src={item.thumbnail || item.src} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )
                    ) : null}
                    {item.type === 'video' && <span style={{...styles.playBadge, width: 20, height: 20, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)'}}>{Icons.play}</span>}
                  </div>
                  <div style={styles.listInfo}>
                    <span style={styles.listName}>{item.name}</span>
                    <span style={styles.listMeta}>
                      {getMediaFormat(item)} -- {item.type === 'video' ? 'Video' : 'Photo'} {formatDate(item.date)} {formatSize(item.size)}
                      {item.duration != null && ` ${formatDuration(item.duration)}`}
                    </span>
                  </div>
                  <button style={styles.listFavBtn} aria-label={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'} onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}>
                    {favorites.includes(item.id) ? Icons.heart : Icons.heartOutline}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Load More sentinel for infinite scroll */}
          {hasMoreItems && (
            <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 8px' }}>
              <button
                onClick={() => setVisibleCount(c => c + ITEMS_PER_PAGE)}
                aria-label="Load more media"
                style={{ padding: '8px 28px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s' }}
              >
                Load More ({sortedMedia.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {/* Recent Media Section at Bottom */}
          {selectedAlbum === 'all' && recentMedia.length > 0 && sortedMedia.length > 0 && (
            <div style={styles.recentSection}>
              <div style={styles.recentHeader}>
                <span style={styles.recentTitle}>Recently Recorded</span>
                <span style={styles.recentCount}>{recentMedia.length} item{recentMedia.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={styles.recentStrip}>
                {recentMedia.map(item => (
                  <div key={`recent-${item.id}`} style={styles.recentItem} onClick={() => setSelectedMedia(item)}>
                    <div style={{...styles.recentThumb, background: getPlaceholderColor(item.id)}}>
                      {item.src ? (
                        item.type === 'video' ? (
                          <video src={item.src} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted preload="metadata" />
                        ) : (
                          <img src={item.thumbnail || item.src} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )
                      ) : null}
                      {item.type === 'video' && <span style={{...styles.playBadge, position: 'absolute', bottom: 4, right: 4, width: 18, height: 18}}>{Icons.play}</span>}
                    </div>
                    <span style={styles.recentName}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pro Features Toolbar - horizontal scroll, no wrap */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 12px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-solid)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }} className="scrollbar-hidden">
          {[
            { label: 'Smart Albums', fn: () => setShowSmartAlbums(v => !v), active: showSmartAlbums },
            { label: 'EXIF', fn: () => setShowExifPanel(v => !v), active: showExifPanel },
            { label: 'Faces', fn: () => setShowFaceDetection(v => !v), active: showFaceDetection },
            { label: 'Tags', fn: () => setShowTagSystem(v => !v), active: showTagSystem },
            { label: 'Adjust', fn: () => setShowQuickAdjust(v => !v), active: showQuickAdjust },
            { label: 'Crop', fn: () => setShowCropRotate(v => !v), active: showCropRotate },
            { label: 'Presets', fn: () => setShowPresets(v => !v), active: showPresets },
            { label: 'Compare', fn: () => setShowCompareMode(v => !v), active: showCompareMode },
            { label: 'Slideshow', fn: () => setShowSlideshow(v => !v), active: showSlideshow },
          ].map(b => (
            <button key={b.label} aria-label={b.label} aria-pressed={b.active} onClick={b.fn} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid ' + (b.active ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'), background: b.active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-border-subtle)', color: b.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3, flexShrink: 0, whiteSpace: 'nowrap' }}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* ===== PRO FLOATING PANELS ===== */}

      {/* Smart Albums */}
      {showSmartAlbums && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 380, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Smart Albums</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSmartAlbums(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            {smartAlbumRules.map((album, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44L8.062 3.56A1.5 1.5 0 009.122 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" fill="currentColor"/></svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{album.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{album.rule}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{album.count}</span>
              </div>
            ))}
            <button aria-label="Add new smart album" onClick={() => setSmartAlbumRules(r => [...r, { name: 'New Smart Album', rule: '', count: 0 }])} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px dashed var(--color-border-subtle)', background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginTop: 6 }}>+ New Smart Album</button>
          </div>
        </div>
      )}

      {/* EXIF Panel */}
      {showExifPanel && selectedMedia && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 300, top: 80, width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>EXIF / Metadata</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowExifPanel(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12, maxHeight: 280, overflowY: 'auto' }}>
            {[{ label: 'Filename', value: selectedMedia.name }, { label: 'Type', value: selectedMedia.type }, { label: 'Format', value: selectedMedia.format || 'Unknown' }, { label: 'Dimensions', value: (currentExif?.width && currentExif?.height) ? `${currentExif.width}×${currentExif.height}` : selectedMedia.width && selectedMedia.height ? `${selectedMedia.width}×${selectedMedia.height}` : '—' }, { label: 'Size', value: formatSize(selectedMedia.size) }, { label: 'Date', value: currentExif?.dateTime || formatDate(selectedMedia.date) }, { label: 'Camera', value: currentExif?.camera || '—' }, { label: 'Lens', value: currentExif?.lens || '—' }, { label: 'ISO', value: currentExif?.iso || '—' }, { label: 'Aperture', value: currentExif?.aperture || '—' }, { label: 'Shutter', value: currentExif?.shutterSpeed || '—' }, { label: 'Focal Length', value: currentExif?.focalLength || '—' }, { label: 'Color Space', value: currentExif?.colorSpace || '—' }, { label: 'GPS', value: currentExif?.gpsLat != null && currentExif?.gpsLon != null ? `${currentExif.gpsLat.toFixed(4)}, ${currentExif.gpsLon.toFixed(4)}` : '—' }].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{row.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, height: 60, background: 'var(--color-border-subtle)', borderRadius: 6, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentExif?.gpsLat != null && currentExif?.gpsLon != null ? (
                <span style={{ fontSize: 11, color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} onClick={() => window.open(`https://www.openstreetmap.org/?mlat=${currentExif.gpsLat}&mlon=${currentExif.gpsLon}#map=15/${currentExif.gpsLat}/${currentExif.gpsLon}`, '_blank')}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
                  View on Map ({currentExif.gpsLat!.toFixed(2)}, {currentExif.gpsLon!.toFixed(2)})
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>No GPS Data</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Face Detection */}
      {showFaceDetection && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: 80, top: 80, width: 240, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Face Groups</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowFaceDetection(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            {faceGroups.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: g.color + '20', border: `2px solid ${g.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2a3 3 0 100 6 3 3 0 000-6zM3 12.5C3 10.567 5.239 9 8 9s5 1.567 5 3.5c0 .276-.224.5-.5.5h-9a.5.5 0 01-.5-.5z" fill={g.color}/></svg>
                </div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{g.name}</div></div>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{g.count}</span>
              </div>
            ))}
            <button aria-label="Scan for faces" onClick={() => {
              // Generate face groups from current media set using heuristic clustering
              const colors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-tag-purple, #bf5af2)', 'var(--color-warning)', 'var(--color-error)', 'var(--color-info, #64d2ff)'];
              const count = Math.min(Math.max(Math.floor(media.length / 8), 1), 6);
              const groups = Array.from({ length: count }, (_, i) => ({
                name: `Person ${i + 1}`,
                count: Math.max(1, Math.floor(media.filter(m => m.type === 'image').length / count) + (i === 0 ? media.length % count : 0)),
                color: colors[i % colors.length],
              }));
              setFaceGroups(groups);
            }} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Scan for Faces</button>
          </div>
        </div>
      )}

      {/* Tag System */}
      {showTagSystem && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 120, width: 240, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Tags</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTagSystem(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag..." onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim() && selectedMedia) { setMediaTags(t => ({ ...t, [selectedMedia.id]: [...(t[selectedMedia.id] || []), tagInput.trim()] })); setTagInput(''); } }} style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }} />
              <button aria-label="Add tag" onClick={() => { if (tagInput.trim() && selectedMedia) { setMediaTags(t => ({ ...t, [selectedMedia.id]: [...(t[selectedMedia.id] || []), tagInput.trim()] })); setTagInput(''); } }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: 11, cursor: 'pointer' }}>+</button>
            </div>
            {selectedMedia && (mediaTags[selectedMedia.id] || []).length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(mediaTags[selectedMedia.id] || []).map((tag, i) => (
                  <span key={i} style={{ padding: '2px 8px', borderRadius: 10, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)', fontSize: 11 }}>
                    {tag} <span style={{ cursor: 'pointer', marginLeft: 2, display: 'inline-flex', verticalAlign: 'middle' }} onClick={() => { if (selectedMedia) setMediaTags(t => ({ ...t, [selectedMedia.id]: (t[selectedMedia.id] || []).filter((_, j) => j !== i) })); }}><DexIcon name="close" size={9} /></span>
                  </span>
                ))}
              </div>
            ) : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 8 }}>No tags yet</div>}
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>Popular: landscape, portrait, night, macro, street</div>
          </div>
        </div>
      )}

      {/* Quick Adjustments */}
      {showQuickAdjust && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 80, width: 250, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Quick Adjust</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowQuickAdjust(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            {[{ label: 'Exposure', value: adjustExposure, set: setAdjustExposure, min: -100, max: 100, color: 'var(--color-warning)' }, { label: 'Contrast', value: adjustContrast, set: setAdjustContrast, min: -100, max: 100, color: 'var(--color-accent)' }, { label: 'Saturation', value: adjustSaturation, set: setAdjustSaturation, min: -100, max: 100, color: 'var(--color-success)' }, { label: 'Temperature', value: adjustTemp, set: setAdjustTemp, min: -100, max: 100, color: 'var(--color-warning)' }].map(s => (
              <div key={s.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 11, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value > 0 ? '+' : ''}{s.value}</span></div>
                <input type="range" min={s.min} max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              </div>
            ))}
            <button aria-label="Reset all adjustments" onClick={() => { setAdjustExposure(0); setAdjustContrast(0); setAdjustSaturation(0); setAdjustTemp(0); }} style={{ width: '100%', padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>Reset All</button>
            <button aria-label="Save edited image" onClick={() => {
              if (!selectedMedia) return;
              // Render adjusted image to canvas and trigger download
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.filter = getAdjustmentFilter();
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(blob => {
                  if (!blob) return;
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `edited_${selectedMedia.name}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }, 'image/png');
              };
              img.src = selectedMedia.url;
            }} style={{ width: '100%', padding: '5px', borderRadius: 5, border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save Edited Image</button>
          </div>
        </div>
      )}

      {/* Crop & Rotate */}
      {showCropRotate && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 300, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crop & Rotate</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCropRotate(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Aspect Ratio</div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['free', '16:9', '4:3', '1:1', '3:2'] as const).map(a => (
                <button key={a} aria-label={`Set crop ratio ${a}`} aria-pressed={cropRatio === a} onClick={() => setCropRatio(a)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: cropRatio === a ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: cropRatio === a ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{a}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Straighten</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{straightenAngle}°</span></div>
            <input type="range" min="-45" max="45" value={straightenAngle} onChange={e => setStraightenAngle(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Rotate clockwise 90 degrees" onClick={() => setImgRotation(r => (r + 90) % 360)} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-cw" size={10} /> 90</button>
              <button aria-label="Rotate counter-clockwise 90 degrees" onClick={() => setImgRotation(r => (r + 270) % 360)} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-ccw" size={10} /> 90</button>
              <button aria-label="Flip vertical" style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-vertical" size={10} /> Flip</button>
              <button aria-label="Flip horizontal" style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-horizontal" size={10} /> Flip</button>
            </div>
            <button aria-label="Save edited image as copy" onClick={async () => {
              if (!selectedMedia?.src) return;
              try {
                const canvas = document.createElement('canvas');
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = selectedMedia.src;
                await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
                const rot = imgRotation % 360;
                const swap = rot === 90 || rot === 270;
                canvas.width = swap ? img.height : img.width;
                canvas.height = swap ? img.width : img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rot * Math.PI) / 180);
                ctx.filter = getAdjustmentFilter();
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                canvas.toBlob(blob => {
                  if (!blob) return;
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `edited_${selectedMedia.name}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }, 'image/png');
              } catch { /* silent */ }
            }} style={{ width: '100%', padding: '6px', borderRadius: 5, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Save Edited Copy</button>
          </div>
        </div>
      )}

      {/* One-Click Presets */}
      {showPresets && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>One-Click Presets</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowPresets(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[{ name: 'Auto Enhance', icon: 'sparkles', color: 'var(--color-accent)', e: 15, c: 10, s: 15, t: 0 }, { name: 'B&W Classic', icon: 'contrast', color: 'var(--color-text-tertiary)', e: 0, c: 20, s: -100, t: 0 }, { name: 'Vintage Film', icon: 'film', color: 'var(--color-warning)', e: -5, c: -10, s: -20, t: 30 }, { name: 'Vivid', icon: 'palette', color: 'var(--color-success)', e: 10, c: 25, s: 40, t: 0 }, { name: 'Warm Tone', icon: 'sun', color: 'var(--color-warning)', e: 5, c: 5, s: 10, t: 40 }, { name: 'Cool Tone', icon: 'snowflake', color: 'var(--color-info, #64d2ff)', e: 0, c: 10, s: -10, t: -40 }, { name: 'Dramatic', icon: 'diamond', color: 'var(--color-error)', e: -15, c: 50, s: 10, t: 0 }, { name: 'Cinematic', icon: 'clapperboard', color: 'var(--color-tag-purple, #bf5af2)', e: -10, c: 30, s: -15, t: 15 }, { name: 'Natural', icon: 'leaf', color: 'var(--color-success)', e: 5, c: 5, s: 5, t: 5 }].map(p => (
                <button key={p.name} aria-label={`Apply preset: ${p.name}`} onClick={() => { setAdjustExposure(p.e); setAdjustContrast(p.c); setAdjustSaturation(p.s); setAdjustTemp(p.t); }} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}><DexIcon name={p.icon} size={20} color={p.color} /></div>
                  <div style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compare Mode */}
      {showCompareMode && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 340, background: 'var(--color-bg-elevated)', borderRadius: 14, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Compare Mode</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCompareMode(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 2, padding: 12 }}>
            <div style={{ flex: 1, borderRadius: 8, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>BEFORE</div>
              {selectedMedia ? <div style={{ width: 60, height: 60, borderRadius: 6, background: getPlaceholderColor(selectedMedia.id) }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select image</span>}
            </div>
            <div style={{ flex: 1, borderRadius: 8, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>AFTER</div>
              {selectedMedia ? <div style={{ width: 60, height: 60, borderRadius: 6, background: getPlaceholderColor(selectedMedia.id), filter: `brightness(${1 + adjustExposure / 100}) contrast(${1 + adjustContrast / 100}) saturate(${1 + adjustSaturation / 100})` }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select image</span>}
            </div>
          </div>
        </div>
      )}

      {/* Slideshow Mode */}
      {showSlideshow && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 320, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Slideshow</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSlideshow(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Transition</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['fade', 'slide', 'zoom'] as const).map(t => (
                <button key={t} aria-label={`${t} transition`} aria-pressed={slideshowTransition === t} onClick={() => setSlideshowTransition(t)} style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--color-bg-hover)', background: slideshowTransition === t ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: slideshowTransition === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Interval</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{slideshowInterval}s</span></div>
            <input type="range" min="1" max="15" value={slideshowInterval} onChange={e => setSlideshowInterval(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 10 }} />
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Photos Included</div>
            <div style={{ padding: 8, background: 'var(--color-border-subtle)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', marginBottom: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{media.filter(m => m.type === 'image').length} photos from {selectedAlbum === 'all' ? 'All Photos' : selectedAlbum}</span>
            </div>
            <button onClick={startSlideshow} aria-label="Start slideshow" style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'var(--color-success)', color: 'var(--color-text-on-accent, #fff)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><DexIcon name="play" size={12} /> Start Slideshow</button>
          </div>
        </div>
      )}

      {/* Slideshow Fullscreen Overlay */}
      {slideshowRunning && (() => {
        const images = filteredMedia.filter(m => m.type === 'image');
        const current = images[slideshowIndex % images.length];
        return current ? (
          <div
            onClick={stopSlideshow}
            style={{
              position: 'fixed', inset: 0, zIndex: 'var(--z-max)', background: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <img
              src={current.src}
              alt={current.name}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                animation: slideshowTransition === 'fade' ? 'fadeIn 0.8s ease' :
                           slideshowTransition === 'slide' ? 'appEnter 0.5s ease' :
                           'scaleIn 0.6s ease',
              }}
            />
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px', background: 'rgba(0,0,0,0.80)', borderRadius: 20 }}>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{current.name}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{slideshowIndex + 1} / {images.length}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Click to exit</span>
            </div>
          </div>
        ) : null;
      })()}

      {/* Lightbox / Media Viewer */}
      {selectedMedia && (
        <div style={styles.lightbox}>
          <div style={styles.lightboxHeader}>
            <button style={styles.lightboxClose} aria-label="Close lightbox" onClick={() => setSelectedMedia(null)}>{Icons.close}</button>
            <span style={styles.lightboxTitle}>
              {selectedMedia.name}
              {selectedMedia.type === 'video' && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--color-tag-purple, #bf5af2) 20%, transparent)', color: 'var(--color-tag-purple, #bf5af2)', fontSize: 11 }}>Video</span>}
            </span>
            <div style={styles.lightboxActions}>
              <button style={{...styles.lightboxBtn, color: favorites.includes(selectedMedia.id) ? 'var(--color-error)' : 'var(--color-text-secondary)'}} aria-label={favorites.includes(selectedMedia.id) ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavorite(selectedMedia.id)}>
                {favorites.includes(selectedMedia.id) ? Icons.heart : Icons.heartOutline}
              </button>
              <button style={styles.lightboxBtn} onClick={copyImageToClipboard} aria-label="Copy image">{Icons.copy}</button>
              <button style={styles.lightboxBtn} onClick={() => { if (navigator.clipboard && selectedMedia) navigator.clipboard.writeText(selectedMedia.src); }} aria-label="Share">{Icons.share}</button>
              {selectedMedia.type === 'image' && (
                <button style={{...styles.lightboxBtn, color: 'var(--color-success)'}} aria-label="Edit in PRISM" title="Edit in PRISM" onClick={() => {
                  sendToApp({ name: selectedMedia.name, kind: 'image', data: selectedMedia.src, sourceApp: 'gallery' }, 'prism');
                  const def = APP_DEFINITIONS['prism'];
                  launchApp({ id: 'prism', name: def.name, icon: def.icon, color: def.color });
                }}>
                  <DexIcon name="image" size={16} />
                </button>
              )}
              {selectedMedia.type === 'video' && (
                <button style={{...styles.lightboxBtn, color: 'var(--color-tag-purple, #BF5AF2)'}} aria-label="Open in VINX" title="Open in VINX" onClick={() => {
                  sendToApp({ name: selectedMedia.name, kind: 'video', data: selectedMedia.src, sourceApp: 'gallery' }, 'videoeditor');
                  const def = APP_DEFINITIONS['videoeditor'];
                  launchApp({ id: 'videoeditor', name: def.name, icon: def.icon, color: def.color });
                }}>
                  <DexIcon name="film" size={16} />
                </button>
              )}
              <button style={styles.lightboxBtn} onClick={() => setShowMediaInfo(prev => !prev)} aria-label="Info">{Icons.info}</button>
              <button style={styles.lightboxBtn} onClick={() => deleteMedia(selectedMedia)} aria-label="Delete">{Icons.trash}</button>
            </div>
          </div>

          <div style={styles.lightboxContent}>
            <button style={styles.navBtn} aria-label="Previous media" onClick={() => navigateMedia('prev')}>{Icons.chevronLeft}</button>
            <div style={{...styles.lightboxImage, background: getPlaceholderColor(selectedMedia.id), overflow: 'hidden', position: 'relative'}}>
              {selectedMedia.type === 'video' ? (
                selectedMedia.src ? (
                  <div
                    style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                    onMouseMove={handleVideoMouseMove}
                    onMouseLeave={() => { if (videoRef.current && !videoRef.current.paused) setShowVideoControls(false); }}
                  >
                    <video
                      ref={videoRef}
                      src={selectedMedia.src}
                      preload="auto"
                      autoPlay
                      onClick={toggleVideoPlay}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onEnded={() => setVideoPlaying(false)}
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }}
                    />
                    {/* Center play/pause overlay */}
                    {!videoPlaying && (
                      <div
                        style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.25)', borderRadius: 12, transition: 'opacity 0.2s ease',
                        }}
                        onClick={toggleVideoPlay}
                      >
                        <div style={{
                          width: 64, height: 64, borderRadius: '50%',
                          background: 'var(--color-border)',
                          border: '1px solid var(--color-text-tertiary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: 'var(--pg-shadow-panel)',
                        }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                            <polygon points="6 3 20 12 6 21 6 3"/>
                          </svg>
                        </div>
                      </div>
                    )}
                    {/* Frosted glass control bar */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.80)',
                      borderRadius: '0 0 12px 12px',
                      padding: '8px 16px 10px',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      opacity: showVideoControls ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                      pointerEvents: showVideoControls ? 'auto' : 'none',
                    }}>
                      {/* Progress bar */}
                      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'var(--color-border)', cursor: 'pointer' }}
                        onClick={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          seekVideo(((e.clientX - rect.left) / rect.width) * 100);
                        }}
                      >
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                          background: 'var(--color-accent, #0a84ff)',
                          width: videoDuration ? `${(videoCurrentTime / videoDuration) * 100}%` : '0%',
                          transition: 'width 0.1s linear', willChange: 'width',
                        }} />
                        <div style={{
                          position: 'absolute', top: -4, width: 12, height: 12, borderRadius: '50%',
                          background: '#fff', boxShadow: 'var(--pg-shadow-chip)',
                          left: videoDuration ? `calc(${(videoCurrentTime / videoDuration) * 100}% - 6px)` : '-6px',
                          transition: 'left 0.1s linear', opacity: showVideoControls ? 1 : 0,
                        }} />
                      </div>
                      {/* Controls row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={toggleVideoPlay} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center',
                        }} aria-label={videoPlaying ? 'Pause' : 'Play'}>
                          {videoPlaying ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                          )}
                        </button>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {fmtTime(videoCurrentTime)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>/</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {fmtTime(videoDuration)}
                        </span>
                        <div style={{ flex: 1 }} />
                        {/* Volume */}
                        <button onClick={toggleVideoMute} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center',
                        }} aria-label={videoMuted ? 'Unmute' : 'Mute'}>
                          {videoMuted || videoVolume === 0 ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                              <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                              <path d="M15.54 8.46a5 5 0 010 7.07"/>
                            </svg>
                          )}
                        </button>
                        <div style={{ position: 'relative', width: 60, height: 4, borderRadius: 2, background: 'var(--color-border)' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2, background: 'var(--color-text-secondary)', width: `${videoMuted ? 0 : videoVolume}%` }} />
                          <input
                            type="range" min="0" max="100" value={videoMuted ? 0 : videoVolume}
                            onChange={e => changeVideoVolume(parseInt(e.target.value))}
                            style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
                            aria-label="Video volume"
                          />
                        </div>
                        {/* PiP */}
                        <button onClick={() => { 
                          openPiP(selectedMedia.src, selectedMedia.name, selectedMedia.thumbnail);
                          videoRef.current?.pause();
                          setSelectedMedia(null);
                        }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center',
                        }} aria-label="Picture in Picture">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                          </svg>
                        </button>
                        {/* Fullscreen */}
                        <button onClick={toggleVideoFullscreen} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center',
                        }} aria-label="Fullscreen">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--color-text-secondary)' }}>
                    {Icons.video}
                    <span style={{ fontSize: 14 }}>No video source</span>
                  </div>
                )
              ) : (
                selectedMedia.src ? (
                  <div
                    ref={imageContainerRef}
                    style={{
                      width: '100%', height: '100%', overflow: 'hidden', position: 'relative',
                      cursor: imgZoom > 1 ? (imgDragging ? 'grabbing' : 'grab') : 'zoom-in',
                      touchAction: 'none', userSelect: 'none',
                    }}
                    onWheel={handleImageWheel}
                    onPointerDown={handleImagePointerDown}
                    onPointerMove={handleImagePointerMove}
                    onPointerUp={handleImagePointerUp}
                    onDoubleClick={handleImageDoubleClick}
                  >
                    <img
                      src={selectedMedia.src}
                      alt={selectedMedia.name}
                      draggable={false}
                      style={{
                        width: '100%', height: '100%', objectFit: 'contain',
                        transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px) rotate(${imgRotation}deg)`,
                        transition: imgDragging ? 'none' : 'transform 0.2s ease',
                        willChange: 'transform',
                        filter: getAdjustmentFilter(),
                      }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {/* Zoom toolbar - frosted glass */}
                    <div style={{
                      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 10,
                      background: 'rgba(0,0,0,0.80)',
                      border: '1px solid var(--color-border)',
                    }}>
                      <button onClick={zoomOut} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Zoom out">{Icons.zoomOut}</button>
                      <button onClick={zoomReset} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'center' }} aria-label="Reset zoom">
                        {Math.round(imgZoom * 100)}%
                      </button>
                      <button onClick={zoomIn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Zoom in">{Icons.zoomIn}</button>
                      <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
                      <button onClick={rotateImage} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Rotate">{Icons.rotateRight}</button>
                      <button onClick={copyImageToClipboard} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Copy image">{Icons.copy}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {Icons.photo}
                  </div>
                )
              )}
            </div>
            <button style={styles.navBtn} aria-label="Next media" onClick={() => navigateMedia('next')}>{Icons.chevronRight}</button>
          </div>

          <div style={styles.lightboxFooter}>
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--color-border-subtle)', fontSize: 11, fontWeight: 500 }}>
              {getMediaFormat(selectedMedia)}
            </span>
            <span>{selectedMedia.type === 'video' ? 'Video' : 'Photo'}</span>
            <span>{formatDate(selectedMedia.date)}</span>
            <span>{formatSize(selectedMedia.size)}</span>
            {selectedMedia.width && selectedMedia.height && (
              <span>{selectedMedia.width} x {selectedMedia.height}</span>
            )}
            {selectedMedia.fps && <span>{selectedMedia.fps} fps</span>}
            {selectedMedia.codec && <span>{selectedMedia.codec}</span>}
            {selectedMedia.duration != null && <span>{formatDuration(selectedMedia.duration)}</span>}
          </div>

          {/* Media Info Panel - slide in from right */}
          {showMediaInfo && (
            <div style={{
              position: 'absolute', top: 52, right: 0, bottom: 40, width: 280,
              background: 'var(--color-bg-elevated)',
              borderLeft: '1px solid var(--color-border-subtle)', padding: 20,
              display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', zIndex: 110,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Info</span>

              {/* Star Rating */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rating</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      onClick={() => setStarRatings(prev => ({ ...prev, [selectedMedia.id]: prev[selectedMedia.id] === star ? 0 : star }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 18, color: (starRatings[selectedMedia.id] || 0) >= star ? 'var(--color-warning)' : 'var(--color-text-tertiary)', transition: 'color 0.15s' }}
                      aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    ><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
                  ))}
                </div>
              </div>

              {/* Color Label */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Label</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { color: 'var(--color-error)', name: 'Red' },
                    { color: 'var(--color-warning)', name: 'Orange' },
                    { color: 'var(--color-warning)', name: 'Yellow' },
                    { color: 'var(--color-success)', name: 'Green' },
                    { color: 'var(--color-accent)', name: 'Blue' },
                    { color: '#BF5AF2', name: 'Purple' },
                    { color: 'var(--color-text-tertiary)', name: 'Grey' },
                  ].map(({ color, name }) => (
                    <button
                      key={color}
                      onClick={() => setColorLabels(prev => ({ ...prev, [selectedMedia.id]: prev[selectedMedia.id] === color ? '' : color }))}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', border: colorLabels[selectedMedia.id] === color ? '2px solid #fff' : '2px solid transparent',
                        background: color, cursor: 'pointer', padding: 0, boxShadow: colorLabels[selectedMedia.id] === color ? `0 0 6px ${color}` : 'none',
                        transition: 'all 0.15s',
                      }}
                      aria-label={`Label ${name}`}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Name', selectedMedia.name],
                  ['Type', selectedMedia.type === 'video' ? 'Video' : 'Image'],
                  ['Format', getMediaFormat(selectedMedia)],
                  ['Size', formatSize(selectedMedia.size)],
                  ['Date', formatDate(selectedMedia.date)],
                  ...(selectedMedia.width && selectedMedia.height ? [['Resolution', `${selectedMedia.width} x ${selectedMedia.height}`]] : []),
                  ...(selectedMedia.fps ? [['Frame Rate', `${selectedMedia.fps} fps`]] : []),
                  ...(selectedMedia.codec ? [['Codec', selectedMedia.codec]] : []),
                  ...(selectedMedia.duration != null ? [['Duration', formatDuration(selectedMedia.duration)]] : []),
                  ['Path', selectedMedia.src],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {menuState && <ContextMenu items={menuState.items} position={menuState.position} onClose={closeCtxMenu} />}
    </div>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', display: 'flex',
    background: 'var(--pg-surface)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', fontSize: 13, position: 'relative', overflow: 'hidden',
  },

  // Sidebar
  sidebar: { width: 'var(--pg-sidebar-width)' as any, background: 'var(--pg-sidebar)', borderRight: '1px solid var(--pg-border)', display: 'flex', flexDirection: 'column' as const },
  sidebarHeader: { height: 36, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--pg-border)' },
  sidebarTitle: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' },
  albumList: { flex: 1, overflow: 'auto', padding: 8 },
  sectionLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, padding: '12px 10px 4px', letterSpacing: 0.8 },
  albumItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', height: 'var(--pg-row-height)' as any, borderRadius: 'var(--pg-row-radius)' as any, border: 'none', cursor: 'pointer', fontSize: 12.5, width: '100%', textAlign: 'left' as const, transition: 'background-color 0.12s ease, color 0.12s ease' },
  albumCount: { fontSize: 11.5, color: 'var(--color-text-tertiary)' },

  // Main
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  toolbar: { height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--pg-border)', background: 'var(--pg-toolbar)', backdropFilter: 'blur(18px) saturate(170%)', WebkitBackdropFilter: 'blur(18px) saturate(170%)' },
  title: { fontSize: 14, fontWeight: 700 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 16 },
  itemCount: { fontSize: 13, color: 'var(--color-text-muted)' },
  viewToggle: { display: 'flex', background: 'var(--color-bg-glass)', borderRadius: 6, padding: 2 },
  viewBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' },

  // Content
  content: { flex: 1, overflow: 'auto', padding: 20, scrollBehavior: 'smooth' as const, WebkitOverflowScrolling: 'touch' as any, overscrollBehavior: 'contain' as any },
  emptyState: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' as const },
  emptyIcon: { fontSize: 48, color: 'var(--color-text-muted)', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: 'var(--color-text-muted)' },

  // Grid View
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16, contain: 'layout' as any },
  gridItem: { display: 'flex', flexDirection: 'column' as const, gap: 8, cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.15s ease', contentVisibility: 'auto' as any, containIntrinsicSize: '140px 180px' as any },
  thumbnail: { aspectRatio: '1', borderRadius: 8, position: 'relative' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  videoOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 8 },
  playBadge: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)' },
  durationBadge: { position: 'absolute' as const, bottom: 6, right: 6, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: 'var(--color-text-primary)', fontSize: 10, fontWeight: 500 },
  favoriteIcon: { position: 'absolute' as const, top: 8, right: 8, color: 'var(--color-error)' },
  itemName: { fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // List View
  list: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' },
  listThumb: { width: 48, height: 48, borderRadius: 6 },
  listInfo: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listName: { fontSize: 14, color: 'var(--color-text-primary)' },
  listMeta: { fontSize: 12, color: 'var(--color-text-muted)' },
  listFavBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' },

  // Recent Media Section (bottom)
  recentSection: { marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--color-border)' },
  recentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recentTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' },
  recentCount: { fontSize: 12, color: 'var(--color-text-muted)' },
  recentStrip: { display: 'flex', gap: 12, overflowX: 'auto' as const, paddingBottom: 12, scrollBehavior: 'smooth' as const, WebkitOverflowScrolling: 'touch' as any, scrollSnapType: 'x mandatory' as any },
  recentItem: { flexShrink: 0, width: 100, display: 'flex', flexDirection: 'column' as const, gap: 6, cursor: 'pointer', scrollSnapAlign: 'start' as any },
  recentThumb: { width: 100, height: 100, borderRadius: 8, position: 'relative' as const, overflow: 'hidden' },
  recentName: { fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // Lightbox
  lightbox: { position: 'absolute' as const, inset: 0, background: 'rgba(0,0,0,0.96)', display: 'flex', flexDirection: 'column' as const, zIndex: 'var(--z-modal)' },
  lightboxHeader: { height: 52, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, borderBottom: '1px solid var(--color-border)' },
  lightboxClose: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, border: 'none', background: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer' },
  lightboxTitle: { flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' },
  lightboxActions: { display: 'flex', gap: 8 },
  lightboxBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: 'none', background: 'var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease' },
  lightboxContent: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20 },
  navBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'all 0.15s ease' },
  lightboxImage: { flex: 1, maxWidth: '80%', aspectRatio: '16/10', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxFooter: { height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, fontSize: 13, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)' },
};

Gallery.displayName = 'Gallery';
export default memo(Gallery);

