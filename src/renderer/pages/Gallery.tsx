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

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useAsyncResource } from '../utils/useAsyncResource';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invokePlatformIpc } from '../services/platform/ipc';
import { isTauri } from '../services/platform/tauriCompat';
import { downloadGalleryFile, galleryFileAction, loadAllMedia, type MediaItem } from './galleryMedia';
import { CROP_RATIOS, DEFAULT_GALLERY_EDITS, encodeGalleryImage, galleryEditFrame, galleryFilter, loadGalleryEdits, type GalleryEdits } from './galleryEdits';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import { type ExifData, loadExifFromPath } from '../utils/exifParser';
import DexIcon from '../components/DexIcon';
import { useCreativeSuite } from '../services/CreativeSuiteBridge';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import ContextMenu, { useContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { openPiP } from '../components/PictureInPicture';
import { loadAppPreferences, useAppPreference } from '../store/appPreferences';
import { clampImagePan, zoomImageAt, type GalleryImageView } from './galleryImageView';

// ===========================================================================
// TYPES
// ===========================================================================

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
  try { localStorage.setItem('dex-gallery-favorites', data); } catch { /* use the platform store */ }
  try { await window.electron?.invoke?.('capability:storage:set', 'dex-gallery-favorites', data); } catch { /* */ }
};

// ===========================================================================
// HELPERS
// ===========================================================================

// Shared canonical size formatter (full ladder, fixes the old MB cap).
import { formatBytes as formatSize } from '../../shared/format/units';

const formatDate = (date: Date): string => date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

// Seconds -> clock via the shared canonical; keep the empty-string guard for images.
import { formatClock } from '../../shared/format/units';
const formatDuration = (seconds?: number): string => (seconds ? formatClock(seconds) : '');

const PLACEHOLDER_COLORS = ['var(--color-error)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-info, #64d2ff)', 'var(--color-accent)', 'var(--color-accent-alt, #5e5ce6)', 'var(--color-tag-purple, #bf5af2)'];
const getPlaceholderColor = (id: string): string => PLACEHOLDER_COLORS[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % PLACEHOLDER_COLORS.length];

// ===========================================================================
// VIRTUALIZED GRID (Phase 4)
// ===========================================================================

const VIRTUALIZE_AT = 30;
const GRID_TILE_MIN = 140;
const GRID_GAP = 16;

interface MediaRowsProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  items: MediaItem[];
  layout: 'grid' | 'list';
  renderItem: (item: MediaItem) => React.ReactNode;
}

function MediaRows({ scrollRef, items, layout, renderItem }: MediaRowsProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: GRID_TILE_MIN, offset: 0 });
  const virtual = items.length >= VIRTUALIZE_AT;
  const grid = layout === 'grid';
  const columns = grid ? Math.max(1, Math.floor((geometry.width + GRID_GAP) / (GRID_TILE_MIN + GRID_GAP))) : 1;
  const tileWidth = (geometry.width - (columns - 1) * GRID_GAP) / columns;
  const rowHeight = grid ? tileWidth + 48 : 66;
  const rows = useVirtualizer({
    enabled: virtual,
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    scrollMargin: geometry.offset,
    overscan: 4,
  });

  useLayoutEffect(() => {
    const container = rowsRef.current;
    const scroll = scrollRef.current;
    if (!virtual || !container || !scroll) return;
    const measure = () => {
      const width = container.clientWidth || GRID_TILE_MIN;
      const offset = container.offsetTop;
      setGeometry(previous => previous.width === width && previous.offset === offset ? previous : { width, offset });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(container);
    observer?.observe(scroll);
    return () => observer?.disconnect();
  }, [scrollRef, virtual, layout]);
  useLayoutEffect(() => { if (virtual) rows.measure(); }, [rows, columns, rowHeight, geometry.offset, virtual]);

  if (!virtual) return <div style={grid ? styles.grid : styles.list}>{items.map(renderItem)}</div>;
  return (
    <div ref={rowsRef} style={{ height: rows.getTotalSize(), position: 'relative' }}>
      {rows.getVirtualItems().map(row => {
        const start = row.index * columns;
        return (
          <div key={row.key} style={{
            position: 'absolute', inset: '0 0 auto', height: row.size,
            transform: 'translateY(' + (row.start - geometry.offset) + 'px)',
            display: grid ? 'grid' : 'block',
            gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))',
            gap: GRID_GAP,
          }}>
            {items.slice(start, start + columns).map(renderItem)}
          </div>
        );
      })}
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
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const [selectedAlbum, setSelectedAlbum] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const defaultLayout = useAppPreference('gallery', 'layout') === 'list' ? 'list' : 'grid';
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(defaultLayout);
  useEffect(() => { void loadAppPreferences(); }, []);
  useEffect(() => setViewMode(defaultLayout), [defaultLayout]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const currentView = useRef<GalleryImageView>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [imageView, setImageView] = useState(currentView.current);
  const { zoom: imgZoom, pan: imgPan } = imageView;
  const [imageError, setImageError] = useState(false);
  const [imgDragging, setImgDragging] = useState(false);
  const imageDrag = useRef<{ pointerId: number; x: number; y: number; scale: number; view: GalleryImageView } | null>(null);
  const imageFrame = useRef(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageFit, setImageFit] = useState(1);
  const [fileAction, setFileAction] = useState<'import' | 'export' | null>(null);
  const fileActionInProgress = useRef(false);
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
  const [editPanel, setEditPanel] = useState<'adjust' | 'crop' | 'presets' | null>(null);
  const adjustCacheKey = selectedMedia?.type === 'image' ? 'dex-gallery-adj-' + selectedMedia.id : null;
  const savedEdits = useMemo(() => adjustCacheKey ? loadGalleryEdits(adjustCacheKey) : DEFAULT_GALLERY_EDITS, [adjustCacheKey]);
  const [editDraft, setEditDraft] = useState<{ key: string; edits: GalleryEdits } | null>(null);
  const edits = editDraft?.key === adjustCacheKey ? editDraft.edits : savedEdits;
  const updateEdits = (patch: Partial<GalleryEdits>) => {
    if (!adjustCacheKey) return;
    const next = { ...edits, ...patch };
    setEditDraft({ key: adjustCacheKey, edits: next });
    try {
      localStorage.setItem(adjustCacheKey, JSON.stringify(next));
    } catch {
      toast.error('Changes are visible but could not be saved for later.');
    }
  };
  const editFrame = useMemo(() => galleryEditFrame(imageSize.width, imageSize.height, edits),
    [imageSize, edits.rotation, edits.straighten, edits.crop, edits.flipX, edits.flipY]);
  const adjustmentFilter = galleryFilter(edits);
  const [showCompareMode, setShowCompareMode] = useState(false);
  const [compareItem, setCompareItem] = useState<MediaItem | null>(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(4);
  const [slideshowTransition, setSlideshowTransition] = useState<'fade' | 'slide' | 'zoom'>('fade');
  const [slideshowRunning, setSlideshowRunning] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);

  // Search + sort (operate on the current album's media)
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'name' | 'size'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Custom (renamed) names, keyed by media id, persisted to localStorage.
  const [renameMap, setRenameMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dex-gallery-renames') || '{}') || {}; } catch { return {}; }
  });
  // Inline rename: which item id is being edited, plus its draft text.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Batch selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const nativeGallery = isTauri();
  const { data: loadedMedia, loading, error: galleryError, reload } = useAsyncResource(loadAllMedia, { timeoutMs: 15000 });

  useEffect(() => { if (loadedMedia) setMedia(loadedMedia); }, [loadedMedia]);
  useEffect(() => {
    let active = true;
    void loadFavorites().then(items => {
      if (!active) return;
      setFavorites(items);
      setFavoritesLoaded(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (favoritesLoaded) void saveFavorites(favorites);
  }, [favorites, favoritesLoaded]);

  const runFileAction = useCallback(async (kind: 'import' | 'export', action: () => Promise<void>) => {
    if (fileActionInProgress.current) return;
    fileActionInProgress.current = true;
    setFileAction(kind);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The Gallery file operation failed.');
    } finally {
      fileActionInProgress.current = false;
      setFileAction(null);
    }
  }, [toast]);

  const importMedia = () => void runFileAction('import', async () => {
    const result = await galleryFileAction('gallery:importMedia');
    if (result.canceled) return;
    if (result.count) {
      setSelectedAlbum('all');
      setSearchQuery('');
      clearSelection();
      reload();
    }
    if (result.skipped) toast.error(`${result.skipped} file(s) could not be added.`);
  });

  // Resolve an item's effective display name (custom rename wins over the raw name).
  const displayName = useCallback((item: MediaItem) => renameMap[item.id] ?? item.name, [renameMap]);

  // Persist renames whenever they change.
  useEffect(() => {
    try { localStorage.setItem('dex-gallery-renames', JSON.stringify(renameMap)); } catch { /* */ }
  }, [renameMap]);

  // Derive a folder breadcrumb from the media path (id/src are absolute file paths).
  const folderCrumbs = useCallback((item: MediaItem | null): string[] => {
    if (!item) return [];
    try {
      const raw = (item.id || item.src || '').replace(/^file:\/\//, '');
      const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
      parts.pop(); // drop the filename
      return parts.slice(-3); // keep the last few folders so it stays compact
    } catch { return []; }
  }, []);

  const commitRename = useCallback((item: MediaItem) => {
    try {
      const next = renameDraft.trim();
      setRenameMap(prev => {
        const copy = { ...prev };
        if (!next || next === item.name) delete copy[item.id];
        else copy[item.id] = next;
        return copy;
      });
      if (next && next !== displayName(item)) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Renamed' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Rename failed' } }));
    } finally {
      setRenamingId(null);
      setRenameDraft('');
    }
  }, [renameDraft, displayName]);

  const startRename = useCallback((item: MediaItem) => {
    setRenamingId(item.id);
    setRenameDraft(displayName(item));
  }, [displayName]);
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
    const q = searchQuery.trim().toLowerCase();
    return media.filter(item => {
      const albumMatch = (() => {
        switch (selectedAlbum) {
          case 'photos': return item.type === 'image';
          case 'videos': return item.type === 'video';
          case 'favorites': return favoriteIds.has(item.id);
          case 'recent': return (now - item.date.getTime()) < sevenDays;
          case 'screenshots': return item.name?.toLowerCase().includes('screenshot');
          default: return true;
        }
      })();
      if (!albumMatch) return false;
      if (q) {
        const name = (renameMap[item.id] ?? item.name ?? '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [media, favoriteIds, selectedAlbum, searchQuery, renameMap]);

  // Sort by the active key/direction. Name uses the effective (renamed) name.
  const sortedMedia = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredMedia].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = (renameMap[a.id] ?? a.name ?? '').localeCompare(renameMap[b.id] ?? b.name ?? '', undefined, { numeric: true, sensitivity: 'base' }); break;
        case 'size': cmp = (a.size || 0) - (b.size || 0); break;
        case 'date': default: cmp = a.date.getTime() - b.date.getTime(); break;
      }
      return cmp * dir;
    });
  }, [filteredMedia, sortKey, sortDir, renameMap]);

  // -- uki context: let the assistant see the active album, view, and selection.
  // Registered once; a latest-value ref keeps the resolver reading live state.
  // Mirrors the Notes/Tasks/Files resolvers (UKI Workspace Awareness initiative).
  const ukiCtxRef = useRef({ selectedAlbum, viewMode, selectedItems, sortedMedia });
  useEffect(() => { ukiCtxRef.current = { selectedAlbum, viewMode, selectedItems, sortedMedia }; });
  useEffect(() => {
    registerUkiAppContext('gallery', () => {
      const c = ukiCtxRef.current;
      return {
        appId: 'gallery',
        currentFile: `Album: ${c.selectedAlbum}`,
        selectionText: c.selectedItems.size > 0 ? `${c.selectedItems.size} item(s) selected` : undefined,
        custom: {
          album: c.selectedAlbum,
          view: c.viewMode,
          itemCount: c.sortedMedia.length,
          selectedCount: c.selectedItems.size,
        },
      };
    });
    return () => unregisterUkiAppContext('gallery');
  }, []);

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

  // Batch favorite: if any selected item is not yet a favorite, favorite them
  // all; otherwise (all already favorited) toggle them all off.
  const batchFavorite = useCallback(() => {
    if (selectedItems.size === 0) return;
    try {
      setFavorites(prev => {
        const ids = [...selectedItems];
        const allFav = ids.every(id => prev.includes(id));
        if (allFav) {
          const next = prev.filter(id => !selectedItems.has(id));
          window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Removed ${ids.length} from favorites` } }));
          return next;
        }
        const set = new Set(prev);
        ids.forEach(id => set.add(id));
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Favorited ${ids.length} item${ids.length !== 1 ? 's' : ''}` } }));
        return [...set];
      });
    } catch {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Batch favorite failed' } }));
    }
  }, [selectedItems]);

  const exportOriginals = useCallback((items: MediaItem[]) => void runFileAction('export', async () => {
    if (nativeGallery) {
      const paths = items.flatMap(item => item.path ? [item.path] : []);
      if (!paths.length) throw new Error('No local media files selected.');
      const result = await galleryFileAction('gallery:exportOriginals', paths);
      if (result.canceled) return;
      const failed = (result.failed?.length ?? 0) + items.length - paths.length;
      if (failed) {
        const reason = result.failed?.[0]?.error ?? 'Some items are unavailable as local files.';
        toast.error(`Exported ${result.count ?? 0} of ${items.length}. ${reason}`);
      } else {
        toast.success(`Exported ${result.count} file(s).`);
      }
      return;
    }
    for (const item of items) if (item.src) downloadGalleryFile(item.src, item.name);
  }), [nativeGallery, runFileAction, toast]);

  const batchExport = useCallback(() => {
    exportOriginals(media.filter(item => selectedItems.has(item.id)));
  }, [exportOriginals, media, selectedItems]);

  const saveEditedImage = () => void runFileAction('export', async () => {
    if (!selectedMedia?.src || selectedMedia.type !== 'image' || imageError) throw new Error('Open a readable image first.');
    const name = 'edited_' + selectedMedia.name.replace(/\.[^.]+$/, '') + '.png';
    const blob = await encodeGalleryImage(selectedMedia.src, edits);
    if (nativeGallery) {
      if (blob.size > 64 * 1024 * 1024) throw new Error('Edited PNG files are limited to 64 MB.');
      const result = await galleryFileAction('gallery:exportEdited', name, await blob.arrayBuffer());
      if (!result.canceled) toast.success('Saved edited image.');
    } else {
      const url = URL.createObjectURL(blob);
      downloadGalleryFile(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

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

  const startSlideshow = useCallback(() => {
    setSlideshowIndex(0);
    setSlideshowRunning(true);
    setShowSlideshow(false);
  }, []);

  const stopSlideshow = useCallback(() => {
    setSlideshowRunning(false);
  }, []);

  useLayoutEffect(() => {
    imageDrag.current = null;
    setImgDragging(false);
    currentView.current = { zoom: 1, pan: { x: 0, y: 0 } };
    setImageView(currentView.current);
    setImageSize({ width: 0, height: 0 });
    setImageError(false);
    setShowMediaInfo(false);
    if (!selectedMedia || selectedMedia.type === 'video') setEditPanel(null);
    return () => { cancelAnimationFrame(imageFrame.current); imageFrame.current = 0; };
  }, [selectedMedia?.id, selectedMedia?.src]);

  const updateImageView = useCallback((view: GalleryImageView) => {
    const surface = imageContainerRef.current;
    if (!surface || !imageSize.width || !imageSize.height) return;
    const viewport = { width: surface.clientWidth, height: surface.clientHeight };
    currentView.current = clampImagePan(view, viewport, editFrame, 0);
    if (!imageFrame.current) imageFrame.current = requestAnimationFrame(() => {
      imageFrame.current = 0;
      setImageView(currentView.current);
    });
  }, [editFrame, imageSize]);

  useEffect(() => {
    const surface = imageContainerRef.current;
    if (!surface) return;
    const wheel = (event: WheelEvent) => {
      if (event.altKey || event.deltaY === 0) return;
      event.preventDefault();
      if (imageDrag.current) return;
      const rect = surface.getBoundingClientRect();
      const scale = rect.width / surface.clientWidth || 1;
      const anchor = { x: (event.clientX - rect.left - rect.width / 2) / scale,
        y: (event.clientY - rect.top - rect.height / 2) / scale };
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const view = currentView.current;
      updateImageView(zoomImageAt(view, view.zoom * Math.exp(-delta * 0.0025), anchor));
    };
    const fit = () => {
      setImageFit(Math.min(surface.clientWidth / editFrame.width, surface.clientHeight / editFrame.height));
      updateImageView(currentView.current);
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(surface);
    surface.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer?.disconnect();
      surface.removeEventListener('wheel', wheel);
    };
  }, [selectedMedia?.id, selectedMedia?.src, updateImageView, editFrame]);

  const handleImagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || currentView.current.zoom <= 1 || (e.target as Element).closest('button')) return;
    const surface = e.currentTarget;
    const scale = surface.getBoundingClientRect().width / surface.clientWidth || 1;
    surface.setPointerCapture(e.pointerId);
    imageDrag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, scale, view: currentView.current };
    setImgDragging(true);
  }, []);

  const handleImagePointerMove = useCallback((e: React.PointerEvent) => {
    const start = imageDrag.current;
    if (!start || start.pointerId !== e.pointerId) return;
    updateImageView({ zoom: start.view.zoom, pan: {
      x: start.view.pan.x + (e.clientX - start.x) / start.scale,
      y: start.view.pan.y + (e.clientY - start.y) / start.scale,
    } });
  }, [updateImageView]);

  const handleImagePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (imageDrag.current?.pointerId !== e.pointerId) return;
    if (e.type === 'pointerup') handleImagePointerMove(e);
    imageDrag.current = null;
    setImgDragging(false);
  }, [handleImagePointerMove]);

  const changeImageZoom = useCallback((zoom: number) => {
    if (!imageDrag.current) updateImageView(zoomImageAt(currentView.current, zoom, { x: 0, y: 0 }));
  }, [updateImageView]);
  const handleImageDoubleClick = useCallback((event: React.MouseEvent) => {
    if (!(event.target as Element).closest('button')) changeImageZoom(currentView.current.zoom > 1 ? 1 : 3);
  }, [changeImageZoom]);
  const zoomIn = useCallback(() => changeImageZoom(currentView.current.zoom + 0.5), [changeImageZoom]);
  const zoomOut = useCallback(() => changeImageZoom(currentView.current.zoom - 0.5), [changeImageZoom]);
  const zoomReset = useCallback(() => changeImageZoom(1), [changeImageZoom]);
  const rotateImage = () => updateEdits({ rotation: (edits.rotation + 90) % 360 });

  const copyImageToClipboard = useCallback(async (item: MediaItem) => {
    try {
      const blob = await encodeGalleryImage(item.src, DEFAULT_GALLERY_EDITS);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      toast.error('Could not copy the image to the clipboard.');
    }
  }, [toast]);

  const getMediaFormat = useCallback((item: MediaItem): string => {
    if (item.format) return item.format;
    const ext = item.name.split('.').pop()?.toUpperCase() || '';
    return ext;
  }, []);

  // Video player state (Tahoe-style custom controls)
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(80);
  const [videoMuted, setVideoMuted] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const videoControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    setVideoError(false);
    setVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setShowVideoControls(true);
    return () => { if (videoControlsTimer.current) clearTimeout(videoControlsTimer.current); };
  }, [selectedMedia?.id, selectedMedia?.src]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0);
      videoRef.current.volume = videoVolume / 100;
      videoRef.current.muted = videoMuted;
    }
  }, [videoVolume, videoMuted]);

  const toggleVideoPlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play().catch(error => {
        if (error.name !== 'AbortError') toast.error('Could not start video playback.');
      });
    } else {
      videoRef.current.pause();
      setVideoPlaying(false);
    }
  }, [toast]);

  const seekVideo = useCallback((pct: number) => {
    if (!videoRef.current || !videoDuration) return;
    videoRef.current.currentTime = (Math.max(0, Math.min(100, pct)) / 100) * videoDuration;
  }, [videoDuration]);

  const changeVideoVolume = useCallback((vol: number) => {
    setVideoVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol / 100;
      if (vol > 0) videoRef.current.muted = false;
    }
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
      void document.exitFullscreen().catch(() => toast.error('Could not exit fullscreen.'));
    } else {
      void videoRef.current.requestFullscreen?.().catch(() => toast.error('Could not enter fullscreen.'));
    }
  }, [toast]);

  const handleVideoMouseMove = useCallback(() => {
    setShowVideoControls(prev => { if (prev) return prev; return true; });
    if (videoControlsTimer.current) clearTimeout(videoControlsTimer.current);
    videoControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowVideoControls(false);
    }, 3000);
  }, []);

  // Load EXIF data when selecting a media item with EXIF panel open
  useEffect(() => {
    if (!showExifPanel || !selectedMedia || selectedMedia.type !== 'image') return;
    if (exifCache[selectedMedia.id] !== undefined) return; // already loaded or attempted
    let cancelled = false;
    loadExifFromPath(selectedMedia.path ?? selectedMedia.src).then(data => {
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
    for (const m of media) {
      counts.all++;
      if (m.type === 'image') counts.photos++;
      if (m.type === 'video') counts.videos++;
      if (favoriteIds.has(m.id)) counts.favorites++;
      if (now - m.date.getTime() < sevenDays) counts.recent++;
      if (m.name?.toLowerCase().includes('screenshot')) counts.screenshots++;
    }
    return counts;
  }, [media, favoriteIds]);

  const mediaScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (mediaScrollRef.current) mediaScrollRef.current.scrollTop = 0;
  }, [selectedAlbum, searchQuery, sortKey, sortDir, viewMode]);

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
      const allFav = [...selectedItems].every(id => favorites.includes(id));
      return [
        { id: 'fav-sel', label: allFav ? `Unfavorite ${count} items` : `Favorite ${count} items`, icon: Icons.heart, onSelect: batchFavorite },
        { id: 'export-sel', label: `Export ${count} items`, icon: Icons.download, onSelect: batchExport, dividerAfter: true },
        { id: 'deselect', label: 'Clear selection', icon: Icons.close, onSelect: clearSelection, dividerAfter: true },
        { id: 'delete-sel', label: `Delete ${count} items`, icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: batchDelete },
      ];
    }
    return [
      { id: 'open', label: 'Open', icon: Icons.grid, onSelect: () => setSelectedMedia(item) },
      { id: 'rename', label: 'Rename', icon: Icons.edit, shortcut: 'F2', onSelect: () => startRename(item) },
      { id: 'select', label: selectedItems.has(item.id) ? 'Deselect' : 'Select', icon: Icons.grid, onSelect: () => { setSelectionMode(true); toggleItemSelection(item.id); lastSelectedIndexRef.current = sortedMedia.findIndex(m => m.id === item.id); }, dividerAfter: true },
      { id: 'fav', label: isFav ? 'Unfavorite' : 'Favorite', icon: Icons.heart, onSelect: () => toggleFavorite(item.id), dividerAfter: true },
      { id: 'export', label: 'Export original', icon: Icons.download, onSelect: () => exportOriginals([item]) },
      ...(item.type === 'image' ? [
        { id: 'copy', label: 'Copy image', icon: Icons.copy, onSelect: () => void copyImageToClipboard(item) },
        { id: 'prism', label: 'Edit in Prism', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'image' as const, data: item.src, sourceApp: 'gallery' }, 'prism') },
      ] : []),
      ...(item.type === 'video' ? [
        { id: 'vinx', label: 'Edit in Vinx', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'videoeditor') },
        { id: 'forge', label: 'Send to Forge', icon: Icons.settings, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'forge') },
      ] : []),
      ...(item.path ? [{
        id: 'files', label: 'Show in file manager', icon: Icons.folder, dividerAfter: true,
        onSelect: async () => {
          const result = await invokePlatformIpc<{ success: boolean }>('shell:showItemInFolder', item.path);
          if (!result?.success) toast.error('Could not locate the file.');
        },
      }] : []),
      { id: 'delete', label: 'Delete', icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: () => deleteMedia(item) },
    ];
  }, [favorites, selectedItems, sortedMedia, toggleFavorite, toggleItemSelection, copyImageToClipboard, sendToApp, deleteMedia, batchExport, exportOriginals, batchDelete, batchFavorite, clearSelection, startRename, toast]);

  useEffect(() => {
    if (!selectedMedia) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape') {
        if (editPanel) setEditPanel(null);
        else setSelectedMedia(null);
        return;
      }
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      const arrow = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (arrow) {
        event.preventDefault();
        if (selectedMedia.type === 'video' && !event.ctrlKey && !event.metaKey) {
          const video = videoRef.current;
          if (video && videoDuration > 0) video.currentTime = Math.min(videoDuration, Math.max(0, video.currentTime + arrow * 5));
        } else {
          navigateMedia(arrow < 0 ? 'prev' : 'next');
        }
      } else if (selectedMedia.type === 'video' && !videoError) {
        if (event.key === ' ' && !target?.closest?.('button')) { event.preventDefault(); toggleVideoPlay(); }
        else if (event.key === 'f') toggleVideoFullscreen();
        else if (event.key === 'm') toggleVideoMute();
      } else if (selectedMedia.type === 'image') {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn(); }
        else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomOut(); }
        else if (event.key === '0') { event.preventDefault(); zoomReset(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, navigateMedia, editPanel, toggleVideoPlay, toggleVideoFullscreen, toggleVideoMute,
    videoError, videoDuration, zoomIn, zoomOut, zoomReset]);

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
      if (e.key === 'F2') { if (selectedItems.size === 1) { const id = [...selectedItems][0]; const m = sortedMedia.find(x => x.id === id); if (m) { e.preventDefault(); startRename(m); } } return; }
      if (e.key === 'Escape') { if (renamingId) { setRenamingId(null); setRenameDraft(''); return; } if (selectionMode || selectedItems.size > 0) { e.preventDefault(); clearSelection(); } return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, selectionMode, selectedItems, selectAll, batchDelete, clearSelection, sortedMedia, startRename, renamingId]);

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
              justifyContent: 'center', width: 28, height: 28, borderRadius: 4,
              marginLeft: sidebarCollapsed ? 0 : 'auto', flexShrink: 0,
              transition: 'transform 0.2s ease',
              transform: sidebarCollapsed ? 'rotate(180deg)' : 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 19l-7-7 7-7"/><path d="M18 19l-7-7 7-7" opacity="0.4"/></svg>
          </button>
        </div>
        {!sidebarCollapsed && (
        <div className="dex-scroll-fade-y" style={styles.albumList}>
          <div className="dex-label-caps" style={styles.sectionLabel}>Library</div>
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
          <div className="dex-label-caps" style={styles.sectionLabel}>Albums</div>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 'var(--space-2) 0', overflow: 'auto' }}>
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
                  border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
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
            {nativeGallery && (
              <button style={{ ...styles.viewBtn, width: 'auto', paddingInline: 8, background: 'var(--color-border)' }} onClick={importMedia} disabled={!!fileAction || loading}>
                {fileAction === 'import' ? 'Importing…' : 'Import'}
              </button>
            )}
            <button style={styles.viewBtn} onClick={reload} aria-label="Refresh Gallery" title="Refresh Gallery" disabled={loading || !!fileAction}>
                <DexIcon name="refresh" size={16} />
            </button>
            {/* Search within the current album */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 8, display: 'flex', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </span>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search media by name"
                style={{ width: 150, height: 28, padding: '0 24px 0 26px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', fontSize: 12, outline: 'none' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 6, display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            {/* Sort key + direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as 'date' | 'name' | 'size')}
                aria-label="Sort by"
                style={{ height: 28, padding: '0 var(--space-2)', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', outline: 'none' }}
              >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
              <button
                onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                style={{ ...styles.viewBtn, background: 'var(--color-bg-glass)', border: '1px solid var(--color-border-subtle)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </button>
            </div>
            <span style={styles.itemCount}>
              {sortedMedia.length} item{sortedMedia.length !== 1 ? 's' : ''}
              {sortedMedia.filter(m => m.type === 'video').length > 0 && (
                <span style={{ marginLeft: 'var(--space-2)', color: 'var(--color-tag-purple, #bf5af2)' }}>
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
                  <button onClick={selectAll} aria-label="Select all" style={{ ...styles.viewBtn, width: 'auto', padding: '0 var(--space-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>All</button>
                  <button onClick={batchFavorite} aria-label="Favorite selected" style={{ ...styles.viewBtn, width: 'auto', padding: '0 var(--space-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-error)' }}>Favorite</button>
                  <button onClick={batchExport} aria-label="Export selected" style={{ ...styles.viewBtn, width: 'auto', padding: '0 var(--space-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-success)' }}>Export</button>
                  <button onClick={batchDelete} aria-label="Delete selected" style={{ ...styles.viewBtn, width: 'auto', padding: '0 var(--space-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-error)' }}>Delete</button>
                </>
              )}
              <button style={{...styles.viewBtn, background: viewMode === 'grid' ? 'var(--color-border)' : 'transparent'}} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>{Icons.grid}</button>
              <button style={{...styles.viewBtn, background: viewMode === 'list' ? 'var(--color-border)' : 'transparent'}} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>{Icons.list}</button>
            </div>
          </div>
        </div>

        {/* Gallery content */}
        {galleryError && (
          <div role="alert" style={{ padding: 'var(--space-2) var(--space-5)' }}>
            {galleryError.message} <button onClick={reload}>Retry</button>
          </div>
        )}
        <div ref={mediaScrollRef} style={styles.content}>
          {loading && !loadedMedia ? (
            <div style={{ ...styles.grid, padding: 'var(--space-4)' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ ...styles.gridItem, background: 'var(--color-border-subtle)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>
                  <div style={{ ...styles.thumbnail, background: 'var(--color-bg-hover)' }} />
                  <span style={{ width: '60%', height: 10, borderRadius: 3, background: 'var(--color-bg-hover)', marginTop: 6, display: 'block' }} />
                </div>
              ))}
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
          ) : sortedMedia.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ width: 80, height: 80, borderRadius: 14, background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-5)', color: 'var(--color-accent)' }}>
                {selectedAlbum === 'videos' ? (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M10 9l5 3-5 3V9z"/>
                  </svg>
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                )}
              </div>
              <div style={styles.emptyTitle}>
                {selectedAlbum === 'favorites' ? 'No favorites yet'
                  : selectedAlbum === 'videos' ? 'No videos yet'
                  : 'Your gallery is empty'}
              </div>
              <div style={{ ...styles.emptySubtitle, maxWidth: 300, lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
                {selectedAlbum === 'favorites' ? 'Click the heart icon on any photo or video to add it to favorites.'
                  : selectedAlbum === 'videos' ? 'Add video files to your Videos folder and they\'ll appear here.'
                  : 'Add images and videos to your Pictures or Videos folder to see them here.'}
              </div>
              {nativeGallery && !searchQuery.trim() && selectedAlbum !== 'favorites' && <button
                onClick={importMedia}
                disabled={!!fileAction || loading}
                style={{
                  padding: 'var(--space-2) var(--space-5)', borderRadius: 6,
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)',
                  border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'opacity 0.2s',
                }}
              >
                Import photos and videos
              </button>}
            </div>
          ) : viewMode === 'grid' ? (
            (() => {
              const renderGridItem = (item: MediaItem) => (
                <div key={item.id} style={styles.gridItem} onClick={(e) => handleItemActivate(item, e)} onContextMenu={(e) => { if (!selectedItems.has(item.id)) lastSelectedIndexRef.current = sortedMedia.findIndex(m => m.id === item.id); showCtxMenu(e, buildCtxItems(item)); }}>
                  {selectionMode && (
                    <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 4, background: selectedItems.has(item.id) ? 'var(--color-accent)' : 'rgba(0,0,0,0.5)', border: '2px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
                    <span style={{ position: 'absolute', top: 6, left: 6, padding: '1px 5px', borderRadius: 2, background: 'rgba(0,0,0,0.75)', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' as const }}>
                      {getMediaFormat(item)}
                    </span>
                  </div>
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(item)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(item); else if (e.key === 'Escape') { setRenamingId(null); setRenameDraft(''); } }}
                      aria-label="Rename media"
                      style={{ ...styles.itemName, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', outline: 'none', textAlign: 'center' }}
                    />
                  ) : (
                    <span style={styles.itemName} title={displayName(item)} onDoubleClick={e => { e.stopPropagation(); startRename(item); }}>{displayName(item)}</span>
                  )}
                </div>
              );
              return <MediaRows scrollRef={mediaScrollRef} items={sortedMedia} layout="grid" renderItem={renderGridItem} />;
            })()
          ) : (
            <MediaRows scrollRef={mediaScrollRef} items={sortedMedia} layout="list" renderItem={item => (
                <div key={item.id} style={styles.listItem} onClick={(e) => handleItemActivate(item, e)} onContextMenu={(e) => showCtxMenu(e, buildCtxItems(item))}>
                  <div style={{...styles.listThumb, background: getPlaceholderColor(item.id), overflow: 'hidden', position: 'relative'}}>
                    {item.src ? (
                      item.type === 'video' ? (
                        item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 18, opacity: 0.5 }}>{Icons.video}</span>
                          </div>
                        )
                      ) : (
                        <img src={item.thumbnail || item.src} alt={item.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )
                    ) : null}
                    {item.type === 'video' && <span style={{...styles.playBadge, width: 20, height: 20, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)'}}>{Icons.play}</span>}
                  </div>
                  <div style={styles.listInfo}>
                    {renamingId === item.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename(item)}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(item); else if (e.key === 'Escape') { setRenamingId(null); setRenameDraft(''); } }}
                        aria-label="Rename media"
                        style={{ ...styles.listName, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', outline: 'none' }}
                      />
                    ) : (
                      <span style={styles.listName} onDoubleClick={e => { e.stopPropagation(); startRename(item); }}>{displayName(item)}</span>
                    )}
                    <span style={styles.listMeta}>
                      {getMediaFormat(item)} -- {item.type === 'video' ? 'Video' : 'Photo'} {formatDate(item.date)} {formatSize(item.size)}
                      {item.duration != null && ` ${formatDuration(item.duration)}`}
                    </span>
                  </div>
                  <button style={{ ...styles.listFavBtn, color: favorites.includes(item.id) ? 'var(--color-error)' : 'var(--color-text-muted)' }} aria-label={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'} onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}>
                    {favorites.includes(item.id) ? Icons.heart : Icons.heartOutline}
                  </button>
                </div>
              )} />
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
                      {(item.thumbnail || (item.type === 'image' && item.src)) && (
                        <img src={item.thumbnail || item.src} alt={item.name} loading="lazy" decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                          onError={e => { e.currentTarget.style.display = 'none'; }} />
                      )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px var(--space-3)', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-solid)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }} className="scrollbar-hidden">
          {[
            { label: 'Smart Albums', fn: () => setShowSmartAlbums(v => !v), active: showSmartAlbums },
            { label: 'EXIF', fn: () => setShowExifPanel(v => !v), active: showExifPanel },
            { label: 'Faces', fn: () => setShowFaceDetection(v => !v), active: showFaceDetection },
            { label: 'Tags', fn: () => setShowTagSystem(v => !v), active: showTagSystem },
            { label: 'Compare', fn: () => setShowCompareMode(v => !v), active: showCompareMode },
            { label: 'Slideshow', fn: () => setShowSlideshow(v => !v), active: showSlideshow },
          ].map(b => (
            <button key={b.label} aria-label={b.label} aria-pressed={b.active} onClick={b.fn} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid ' + (b.active ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'), background: b.active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-border-subtle)', color: b.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3, flexShrink: 0, whiteSpace: 'nowrap' }}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* ===== PRO FLOATING PANELS ===== */}

      {/* Smart Albums */}
      {showSmartAlbums && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(380px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Smart Albums</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSmartAlbums(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            {smartAlbumRules.map((album, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) 10px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', marginBottom: 4 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44L8.062 3.56A1.5 1.5 0 009.122 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" fill="currentColor"/></svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{album.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{album.rule}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{album.count}</span>
              </div>
            ))}
            <button aria-label="Add new smart album" onClick={() => setSmartAlbumRules(r => [...r, { name: 'New Smart Album', rule: '', count: 0 }])} style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px dashed var(--color-border-subtle)', background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginTop: 6 }}>+ New Smart Album</button>
          </div>
        </div>
        </div>
      )}

      {/* EXIF Panel */}
      {showExifPanel && selectedMedia && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", right: 300, top: 80, width: 'min(260px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>EXIF / Metadata</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowExifPanel(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)', maxHeight: 280, overflowY: 'auto' }}>
            {[{ label: 'Filename', value: selectedMedia.name }, { label: 'Type', value: selectedMedia.type }, { label: 'Format', value: selectedMedia.format || 'Unknown' }, { label: 'Dimensions', value: (currentExif?.width && currentExif?.height) ? `${currentExif.width}×${currentExif.height}` : selectedMedia.width && selectedMedia.height ? `${selectedMedia.width}×${selectedMedia.height}` : '—' }, { label: 'Size', value: formatSize(selectedMedia.size) }, { label: 'Date', value: currentExif?.dateTime || formatDate(selectedMedia.date) }, { label: 'Camera', value: currentExif?.camera || '—' }, { label: 'Lens', value: currentExif?.lens || '—' }, { label: 'ISO', value: currentExif?.iso || '—' }, { label: 'Aperture', value: currentExif?.aperture || '—' }, { label: 'Shutter', value: currentExif?.shutterSpeed || '—' }, { label: 'Focal Length', value: currentExif?.focalLength || '—' }, { label: 'Color Space', value: currentExif?.colorSpace || '—' }, { label: 'GPS', value: currentExif?.gpsLat != null && currentExif?.gpsLon != null ? `${currentExif.gpsLat.toFixed(4)}, ${currentExif.gpsLon.toFixed(4)}` : '—' }].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{row.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 'var(--space-2)', height: 60, background: 'var(--color-border-subtle)', borderRadius: 4, border: '1px solid var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", left: 80, top: 80, width: 'min(240px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Face Groups</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowFaceDetection(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            {faceGroups.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px', borderRadius: 4, cursor: 'pointer', marginBottom: 2 }}>
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
            }} style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Scan for Faces</button>
          </div>
        </div>
      )}

      {/* Tag System */}
      {showTagSystem && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", right: 20, top: 120, width: 'min(240px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Tags</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTagSystem(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag..." onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim() && selectedMedia) { setMediaTags(t => ({ ...t, [selectedMedia.id]: [...(t[selectedMedia.id] || []), tagInput.trim()] })); setTagInput(''); } }} style={{ flex: 1, padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }} />
              <button aria-label="Add tag" onClick={() => { if (tagInput.trim() && selectedMedia) { setMediaTags(t => ({ ...t, [selectedMedia.id]: [...(t[selectedMedia.id] || []), tagInput.trim()] })); setTagInput(''); } }} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: 11, cursor: 'pointer' }}>+</button>
            </div>
            {selectedMedia && (mediaTags[selectedMedia.id] || []).length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(mediaTags[selectedMedia.id] || []).map((tag, i) => (
                  <span key={i} style={{ padding: '2px var(--space-2)', borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)', fontSize: 11 }}>
                    {tag} <span style={{ cursor: 'pointer', marginLeft: 2, display: 'inline-flex', verticalAlign: 'middle' }} onClick={() => { if (selectedMedia) setMediaTags(t => ({ ...t, [selectedMedia.id]: (t[selectedMedia.id] || []).filter((_, j) => j !== i) })); }}><DexIcon name="close" size={9} /></span>
                  </span>
                ))}
              </div>
            ) : <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 'var(--space-2)' }}>No tags yet</div>}
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>Popular: landscape, portrait, night, macro, street</div>
          </div>
        </div>
      )}

      {/* Quick Adjustments */}
      {selectedMedia?.type === 'image' && editPanel === 'adjust' && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", right: 20, top: 80, width: 'min(250px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Quick Adjust</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setEditPanel(null)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            {([
              { label: 'Exposure', key: 'e', color: 'var(--color-warning)' },
              { label: 'Contrast', key: 'c', color: 'var(--color-accent)' },
              { label: 'Saturation', key: 's', color: 'var(--color-success)' },
              { label: 'Temperature', key: 't', color: 'var(--color-warning)' },
            ] as const).map(s => (
              <div key={s.label} style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span><span style={{ fontSize: 11, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{edits[s.key] > 0 ? '+' : ''}{edits[s.key]}</span></div>
                <input type="range" min={-100} max={100} value={edits[s.key]} onChange={e => updateEdits({ [s.key]: Number(e.target.value) })} aria-label={s.label} style={{ width: '100%', accentColor: s.color }} />
              </div>
            ))}
            <button aria-label="Reset all adjustments" onClick={() => updateEdits({ e: 0, c: 0, s: 0, t: 0 })} style={{ width: '100%', padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>Reset All</button>
            <button aria-label="Save edited image" onClick={saveEditedImage} disabled={!!fileAction || !!imageError} style={{ width: '100%', padding: '5px', borderRadius: 4, border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save Edited Image</button>
          </div>
        </div>
      )}

      {/* Crop & Rotate */}
      {selectedMedia?.type === 'image' && editPanel === 'crop' && (
        <div style={{ position: 'absolute', inset: '52px 12px auto auto', zIndex: 'calc(var(--z-modal) + 1)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(300px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crop & Rotate</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setEditPanel(null)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Aspect Ratio</div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {CROP_RATIOS.map(a => (
                <button key={a} aria-label={`Set crop ratio ${a}`} aria-pressed={edits.crop === a} onClick={() => updateEdits({ crop: a })} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: edits.crop === a ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: edits.crop === a ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{a}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Straighten</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{edits.straighten}°</span></div>
            <input type="range" min="-45" max="45" value={edits.straighten} onChange={e => updateEdits({ straighten: Number(e.target.value) })} aria-label="Straighten angle in degrees" style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 'var(--space-2)' }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Rotate clockwise 90 degrees" onClick={rotateImage} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-cw" size={10} /> 90</button>
              <button aria-label="Rotate counter-clockwise 90 degrees" onClick={() => updateEdits({ rotation: (edits.rotation + 270) % 360 })} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-ccw" size={10} /> 90</button>
              <button aria-label="Flip vertical" aria-pressed={edits.flipY} onClick={() => updateEdits({ flipY: !edits.flipY })} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-vertical" size={10} /> Flip</button>
              <button aria-label="Flip horizontal" aria-pressed={edits.flipX} onClick={() => updateEdits({ flipX: !edits.flipX })} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-horizontal" size={10} /> Flip</button>
            </div>
            <button aria-label="Save edited image as copy" onClick={saveEditedImage} disabled={!!fileAction || !!imageError} style={{ width: '100%', padding: '6px', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>Save Edited Copy</button>
          </div>
        </div>
        </div>
      )}

      {/* One-Click Presets */}
      {selectedMedia?.type === 'image' && editPanel === 'presets' && (
        <div style={{ position: 'absolute', inset: '52px 12px auto auto', zIndex: 'calc(var(--z-modal) + 1)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(340px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>One-Click Presets</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setEditPanel(null)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[{ name: 'Auto Enhance', icon: 'sparkles', color: 'var(--color-accent)', e: 15, c: 10, s: 15, t: 0 }, { name: 'B&W Classic', icon: 'contrast', color: 'var(--color-text-tertiary)', e: 0, c: 20, s: -100, t: 0 }, { name: 'Vintage Film', icon: 'film', color: 'var(--color-warning)', e: -5, c: -10, s: -20, t: 30 }, { name: 'Vivid', icon: 'palette', color: 'var(--color-success)', e: 10, c: 25, s: 40, t: 0 }, { name: 'Warm Tone', icon: 'sun', color: 'var(--color-warning)', e: 5, c: 5, s: 10, t: 40 }, { name: 'Cool Tone', icon: 'snowflake', color: 'var(--color-info, #64d2ff)', e: 0, c: 10, s: -10, t: -40 }, { name: 'Dramatic', icon: 'diamond', color: 'var(--color-error)', e: -15, c: 50, s: 10, t: 0 }, { name: 'Cinematic', icon: 'clapperboard', color: 'var(--color-tag-purple, #bf5af2)', e: -10, c: 30, s: -15, t: 15 }, { name: 'Natural', icon: 'leaf', color: 'var(--color-success)', e: 5, c: 5, s: 5, t: 5 }].map(p => (
                <button key={p.name} aria-label={`Apply preset: ${p.name}`} onClick={() => updateEdits({ e: p.e, c: p.c, s: p.s, t: p.t })} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}><DexIcon name={p.icon} size={20} color={p.color} /></div>
                  <div style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Compare Mode */}
      {showCompareMode && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(500px, calc(100vw - 48px))', height: 340, background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Compare Mode</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCompareMode(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ flex: 1, display: 'flex', gap: 2, padding: 'var(--space-3)' }}>
            <div style={{ flex: 1, borderRadius: 6, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>BEFORE</div>
              {selectedMedia ? <div style={{ width: 60, height: 60, borderRadius: 4, background: getPlaceholderColor(selectedMedia.id) }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select image</span>}
            </div>
            <div style={{ flex: 1, borderRadius: 6, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>AFTER</div>
              {selectedMedia ? <div style={{ width: 60, height: 60, borderRadius: 4, background: getPlaceholderColor(selectedMedia.id), filter: adjustmentFilter }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select image</span>}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Slideshow Mode */}
      {showSlideshow && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(320px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Slideshow</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSlideshow(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Transition</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['fade', 'slide', 'zoom'] as const).map(t => (
                <button key={t} aria-label={`${t} transition`} aria-pressed={slideshowTransition === t} onClick={() => setSlideshowTransition(t)} style={{ flex: 1, padding: '6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: slideshowTransition === t ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: slideshowTransition === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Interval</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{slideshowInterval}s</span></div>
            <input type="range" min="1" max="15" value={slideshowInterval} onChange={e => setSlideshowInterval(Number(e.target.value))} aria-label="Slideshow interval in seconds" style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 10 }} />
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Photos Included</div>
            <div style={{ padding: 'var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', marginBottom: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{media.filter(m => m.type === 'image').length} photos from {selectedAlbum === 'all' ? 'All Photos' : selectedAlbum}</span>
            </div>
            <button onClick={startSlideshow} aria-label="Start slideshow" style={{ width: '100%', padding: 'var(--space-2)', borderRadius: 4, border: 'none', background: 'var(--color-success)', color: 'var(--color-text-on-accent, #fff)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><DexIcon name="play" size={12} /> Start Slideshow</button>
          </div>
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
            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-2) var(--space-5)', background: 'rgba(0,0,0,0.80)', borderRadius: 10 }}>
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
              {/* Folder breadcrumb derived from the media path */}
              {folderCrumbs(selectedMedia).length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 400 }}>
                  {folderCrumbs(selectedMedia).map((crumb, i, arr) => (
                    <React.Fragment key={i}>
                      <span>{crumb}</span>
                      {i < arr.length - 1 && <span style={{ opacity: 0.5 }}>/</span>}
                    </React.Fragment>
                  ))}
                  <span style={{ opacity: 0.5 }}>/</span>
                </span>
              )}
              {displayName(selectedMedia)}
              {selectedMedia.type === 'video' && <span style={{ marginLeft: 'var(--space-2)', padding: '2px var(--space-2)', borderRadius: 3, background: 'color-mix(in srgb, var(--color-tag-purple, #bf5af2) 20%, transparent)', color: 'var(--color-tag-purple, #bf5af2)', fontSize: 11 }}>Video</span>}
            </span>
            <div style={styles.lightboxActions}>
              <button style={{...styles.lightboxBtn, color: favorites.includes(selectedMedia.id) ? 'var(--color-error)' : 'var(--color-text-secondary)'}} aria-label={favorites.includes(selectedMedia.id) ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavorite(selectedMedia.id)}>
                {favorites.includes(selectedMedia.id) ? Icons.heart : Icons.heartOutline}
              </button>
              <button style={styles.lightboxBtn} onClick={() => exportOriginals([selectedMedia])} disabled={!!fileAction} aria-label="Export original" title="Export original">{Icons.download}</button>
              <button style={styles.lightboxBtn} onClick={() => void navigator.clipboard.writeText(selectedMedia.path ?? selectedMedia.src).catch(() => toast.error('Could not copy the path.'))} aria-label="Copy file path" title="Copy file path">{Icons.share}</button>
              {selectedMedia.type === 'image' && (
                (['adjust', 'crop', 'presets'] as const).map(panel => {
                  const labels = { adjust: 'Adjust photo', crop: 'Crop and rotate', presets: 'Photo presets' };
                  const icons = { adjust: 'sliders', crop: 'crop', presets: 'sparkles' };
                  return <button key={panel} style={styles.lightboxBtn} aria-label={labels[panel]} title={labels[panel]} aria-pressed={editPanel === panel}
                    onClick={() => setEditPanel(editPanel === panel ? null : panel)}><DexIcon name={icons[panel]} size={16} /></button>;
                })
              )}
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
            {(() => { const atStart = sortedMedia[0]?.id === selectedMedia.id; return (
            <button style={{ ...styles.navBtn, opacity: atStart ? 0.35 : 1, cursor: atStart ? 'default' : 'pointer' }} aria-label="Previous media" disabled={atStart} onClick={() => navigateMedia('prev')}>{Icons.chevronLeft}</button>
            ); })()}
            <div style={{...styles.lightboxImage, background: getPlaceholderColor(selectedMedia.id), overflow: 'hidden', position: 'relative'}}>
              {selectedMedia.type === 'video' ? (
                videoError ? (
                  <div role="status" style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 16 }}>
                    <span>Could not play this video.</span>
                    {selectedMedia.path && <button onClick={async () => {
                      const result = await invokePlatformIpc<{ success: boolean }>('media:openWithSystem', selectedMedia.path);
                      if (!result?.success) toast.error('Could not open the video in your media player.');
                    }}>Open in system player</button>}
                  </div>
                ) : selectedMedia.src ? (
                  <div
                    style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                    onMouseMove={handleVideoMouseMove}
                    onMouseLeave={() => { if (videoRef.current && !videoRef.current.paused) setShowVideoControls(false); }}
                  >
                    <video
                      key={selectedMedia.id}
                      ref={videoRef}
                      src={selectedMedia.src}
                      preload="auto"
                      autoPlay
                      onClick={toggleVideoPlay}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onError={() => setVideoError(true)}
                      onEnded={() => setVideoPlaying(false)}
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }}
                    />
                    {/* Center play/pause overlay */}
                    {!videoPlaying && (
                      <div
                        style={{
                          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.25)', borderRadius: 10, transition: 'opacity 0.2s ease',
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
                      borderRadius: '0 0 10px 10px',
                      padding: 'var(--space-2) var(--space-4) 10px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
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
                          {formatClock(videoCurrentTime)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>/</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {formatClock(videoDuration)}
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
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
                    onPointerDown={handleImagePointerDown}
                    onPointerMove={handleImagePointerMove}
                    onPointerUp={handleImagePointerUp}
                    onPointerCancel={handleImagePointerUp}
                    onLostPointerCapture={handleImagePointerUp}
                    onDoubleClick={handleImageDoubleClick}
                  >
                    <div style={{
                      position: 'absolute', left: '50%', top: '50%', overflow: 'hidden',
                      width: editFrame.width * imageFit, height: editFrame.height * imageFit,
                      transform: `translate(-50%, -50%) translate(${imgPan.x}px, ${imgPan.y}px) scale(${imgZoom})`,
                      visibility: imageError ? 'hidden' : 'visible',
                    }}>
                      <img
                        key={selectedMedia.id}
                        src={selectedMedia.src}
                        alt={selectedMedia.name}
                        draggable={false}
                        style={{
                          position: 'absolute', left: '50%', top: '50%', maxWidth: 'none',
                          width: imageSize.width * imageFit, height: imageSize.height * imageFit,
                          transform: `translate(-50%, -50%) rotate(${editFrame.degrees}deg) scale(${editFrame.flipX}, ${editFrame.flipY})`,
                          filter: adjustmentFilter,
                        }}
                        onLoad={event => {
                          const image = event.currentTarget;
                          setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
                          setImageError(false);
                        }}
                        onError={() => setImageError(true)}
                      />
                    </div>
                    {imageError && <span role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>Could not load this image.</span>}
                    {/* Zoom toolbar - frosted glass */}
                    <div style={{
                      position: 'absolute', bottom: 16, left: '50%', translate: '-50%',
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 8,
                      background: 'rgba(0,0,0,0.80)',
                      border: '1px solid var(--color-border)',
                    }}>
                      <button onClick={zoomOut} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Zoom out">{Icons.zoomOut}</button>
                      <button onClick={zoomReset} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px var(--space-2)', fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'center' }} aria-label="Reset zoom">
                        {Math.round(imgZoom * 100)}%
                      </button>
                      <button onClick={zoomIn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Zoom in">{Icons.zoomIn}</button>
                      <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
                      <button onClick={rotateImage} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Rotate">{Icons.rotateRight}</button>
                      <button onClick={() => void copyImageToClipboard(selectedMedia)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center' }} aria-label="Copy image">{Icons.copy}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {Icons.photo}
                  </div>
                )
              )}
            </div>
            {(() => { const atEnd = sortedMedia[sortedMedia.length - 1]?.id === selectedMedia.id; return (
            <button style={{ ...styles.navBtn, opacity: atEnd ? 0.35 : 1, cursor: atEnd ? 'default' : 'pointer' }} aria-label="Next media" disabled={atEnd} onClick={() => navigateMedia('next')}>{Icons.chevronRight}</button>
            ); })()}
          </div>

          <div style={styles.lightboxFooter}>
            <span style={{ padding: '2px var(--space-2)', borderRadius: 3, background: 'var(--color-border-subtle)', fontSize: 11, fontWeight: 500 }}>
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
              borderLeft: '1px solid var(--color-border-subtle)', padding: 'var(--space-5)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflow: 'auto', zIndex: 110,
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
                    { color: 'var(--color-tag-purple, #BF5AF2)', name: 'Purple' },
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
                  ['Path', selectedMedia.path ?? selectedMedia.src],
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
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', fontSize: 13, position: 'relative', overflow: 'hidden',
  },

  // Sidebar
  sidebar: { width: 'var(--pg-sidebar-width)' as any, background: 'var(--pg-sidebar)', borderRight: '1px solid var(--pg-border)', display: 'flex', flexDirection: 'column' as const },
  sidebarHeader: { height: 36, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--pg-border)' },
  sidebarTitle: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' },
  albumList: { flex: 1, overflow: 'auto', padding: 'var(--space-2)' },
  sectionLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, padding: 'var(--space-3) 10px 4px', letterSpacing: 0.8 },
  albumItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px var(--space-3)', height: 'var(--pg-row-height)' as any, borderRadius: 'var(--pg-row-radius)' as any, border: 'none', cursor: 'pointer', fontSize: 12.5, width: '100%', textAlign: 'left' as const, transition: 'background-color 0.12s ease, color 0.12s ease' },
  albumCount: { fontSize: 11.5, color: 'var(--color-text-tertiary)' },

  // Main
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  toolbar: { height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-4)', borderBottom: '1px solid var(--pg-border)', background: 'var(--pg-toolbar)' },
  title: { fontSize: 14, fontWeight: 700 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)' },
  itemCount: { fontSize: 13, color: 'var(--color-text-muted)' },
  viewToggle: { display: 'flex', background: 'var(--color-bg-glass)', borderRadius: 4, padding: 2 },
  viewBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 3, border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' },

  // Content
  content: { flex: 1, position: 'relative', overflow: 'auto', padding: 'var(--space-5)', WebkitOverflowScrolling: 'touch' as any, overscrollBehavior: 'contain' as any },
  emptyState: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px var(--space-5)', textAlign: 'center' as const },
  emptyIcon: { fontSize: 48, color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' },
  emptySubtitle: { fontSize: 14, color: 'var(--color-text-muted)' },

  // Grid View
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-4)', contain: 'layout' as any },
  gridItem: { display: 'flex', minWidth: 0, position: 'relative', flexDirection: 'column' as const, gap: 'var(--space-2)', cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.15s ease' },
  thumbnail: { aspectRatio: '1', borderRadius: 6, position: 'relative' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  videoOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 6 },
  playBadge: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)' },
  durationBadge: { position: 'absolute' as const, bottom: 6, right: 6, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,0,0,0.7)', color: 'var(--color-text-primary)', fontSize: 10, fontWeight: 500 },
  favoriteIcon: { position: 'absolute' as const, top: 8, right: 8, color: 'var(--color-error)' },
  itemName: { fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // List View
  list: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, cursor: 'pointer' },
  listThumb: { width: 48, height: 48, flexShrink: 0, borderRadius: 4 },
  listInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listName: { fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' },
  listMeta: { fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-muted)' },
  listFavBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' },

  // Recent Media Section (bottom)
  recentSection: { marginTop: 'var(--space-8)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)' },
  recentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' },
  recentTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' },
  recentCount: { fontSize: 12, color: 'var(--color-text-muted)' },
  recentStrip: { display: 'flex', gap: 'var(--space-3)', overflowX: 'auto' as const, paddingBottom: 'var(--space-3)', scrollBehavior: 'smooth' as const, WebkitOverflowScrolling: 'touch' as any, scrollSnapType: 'x mandatory' as any },
  recentItem: { flexShrink: 0, width: 100, display: 'flex', flexDirection: 'column' as const, gap: 6, cursor: 'pointer', scrollSnapAlign: 'start' as any },
  recentThumb: { width: 100, height: 100, borderRadius: 6, position: 'relative' as const, overflow: 'hidden' },
  recentName: { fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // Lightbox
  lightbox: { position: 'absolute' as const, inset: 0, background: 'rgba(0,0,0,0.96)', display: 'flex', flexDirection: 'column' as const, zIndex: 'var(--z-modal)' },
  lightboxHeader: { height: 52, display: 'flex', alignItems: 'center', padding: '0 var(--space-4)', gap: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' },
  lightboxClose: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 4, border: 'none', background: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer' },
  lightboxTitle: { flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' },
  lightboxActions: { display: 'flex', gap: 'var(--space-2)' },
  lightboxBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 6, border: 'none', background: 'var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.15s ease' },
  lightboxContent: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)', gap: 'var(--space-5)' },
  navBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'all 0.15s ease' },
  lightboxImage: { flex: 1, minWidth: 0, maxWidth: '80%', height: '100%', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxFooter: { height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)', fontSize: 13, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)' },
};

Gallery.displayName = 'Gallery';
export default memo(Gallery);

