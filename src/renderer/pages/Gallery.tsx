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

import { VideoEnhance } from '../components/media/VideoEnhance';
import { useCreativeInput } from '../services/creativeIntake';
import { toMediaUrl } from '../utils/mediaUrl';
import { usePlayableMedia } from '../services/media/playableMedia';
import { MediaScrubber, PlayableMediaStatus } from '../components/media/MediaScrubber';
import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useAsyncResource } from '../utils/useAsyncResource';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import { type ExifData, fileUrlToPath, loadExifFromPath } from '../utils/exifParser';
import DexIcon from '../components/DexIcon';
import { useCreativeSuite } from '../services/CreativeSuiteBridge';
import { sendCreativeInput } from '../services/creativeIntake';
import { duplicateImageKey, galleryBreadcrumbs, galleryFolder, loadGalleryTags, moveAlbumItems, smallImageQrData, TAGS_KEY, tagMedia } from './galleryOrganize';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../uki/appActionRegistry';
import ContextMenu, { useContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { openPiP } from '../components/PictureInPicture';
import { NEUTRAL, ADJUSTMENT_KEYS, isNeutral, normalizeAdjustments, EditHistory, type Adjustments } from './galleryAdjust';
import { AdjustedPreview, renderEditedBlob } from './galleryPreview';
import { dexPrompt, dexConfirm } from '../components/dexConfirm';
import { loadAlbums, addToAlbum, removeFromAlbum, pruneAlbums, ALBUMS_KEY, USER_ALBUM_PREFIX, type UserAlbum } from './galleryAlbums';
import { hasNativeFiles, pickSavePath, writeBinaryFile } from '../services/nativeFiles';
import { openWithShell } from '../utils/openWithShell';
import { persistOrWarn } from '../utils/persistOrWarn';

// ===========================================================================
// TYPES
// ===========================================================================

const editBtn = (disabled: boolean): React.CSSProperties => ({
  flex: 1, padding: '5px 6px', borderRadius: 10, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)',
  color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', fontSize: 11, cursor: disabled ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.6 : 1,
});

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

// Every common video type: the ones WebView2 cannot decode are prepared for playback (media_compat.rs).
const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|mpg|mpeg|ts|mts|m2ts|3gp|ogv|vob|divx|asf|f4v)$/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff|heic|heif)$/i;
const IMPORT_FILTERS = [
  { name: 'Photos and videos', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'vob', 'asf'] },
];

interface ImportedMedia {
  path: string;
  filename: string;
  extension: string;
  modifiedAt: number;
  size: number;
  width?: number;
  height?: number;
}

const loadAllMedia = async (): Promise<MediaItem[]> => {
  const allMedia: MediaItem[] = [];

  if (window.dex?.invoke) {
    // The shared resource controls the timeout and exposes retry.
    const [pictureFiles, videoFiles, imported] = await Promise.all([
      window.dex.invoke('media:getMediaFiles', 'pictures'),
      window.dex.invoke('media:getMediaFiles', 'videos'),
      window.dex.invoke('gallery:getImportedMedia'),
    ]);

    const processFiles = (files: Array<{ path?: string; name?: string; extension?: string; modified?: number; size?: number; duration?: number }>, fallbackType: 'image' | 'video') => {
      if (!files || !Array.isArray(files)) return;
      for (const f of files) {
        const ext = (f.extension || f.name?.split('.').pop() || '').toLowerCase();
        const isVideo = VIDEO_EXTENSIONS.test(`.${ext}`);
        const isImage = IMAGE_EXTENSIONS.test(`.${ext}`);
        const type: 'image' | 'video' = isVideo ? 'video' : isImage ? 'image' : fallbackType;

        // dexmedia in the desktop app (file:// is blocked there); see utils/mediaUrl.
        const filePath = f.path ? toMediaUrl(f.path) : '';
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
    if (Array.isArray(imported)) {
      for (const item of imported as ImportedMedia[]) {
        if (!item.path || !item.filename || typeof item.extension !== 'string') continue;
        const extension = item.extension.replace(/^\./, '');
        processFiles([{ ...item, name: item.filename, extension, modified: item.modifiedAt }],
          extension === 'ogv' ? 'video' : 'image');
      }
    }
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
    if (window.dex?.invoke) {
      const result = await window.dex.invoke('capability:storage:get', 'dex-gallery-favorites');
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
  // Native copy first (it is the one loaded at start). The local write used to
  // come first without a guard, so a full store threw and skipped the native copy.
  let nativeOk = false;
  try {
    const r = await window.dex?.invoke?.('capability:storage:set', 'dex-gallery-favorites', data);
    nativeOk = r !== undefined && !(r && typeof r === 'object' && (r as { success?: unknown }).success === false);
  } catch { /* reported below if the local copy fails too */ }
  if (nativeOk) { try { localStorage.setItem('dex-gallery-favorites', data); } catch { /* native copy kept */ } }
  else persistOrWarn('dex-gallery-favorites', data, 'your Gallery favorites');
};

// ===========================================================================
// HELPERS
// ===========================================================================

// Shared canonical size formatter (full ladder, fixes the old MB cap).
import { formatBytes as formatSize } from '../../shared/format/units';

const formatDate = (date: Date): string => date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

// Seconds -> clock via the shared canonical; keep the empty-string guard for images.
import { formatClock } from '../../shared/format/units';
import { keyEventForApp } from '../shell/input/appKeyScope';
import { toLocalDateInput } from '../utils/localDate';
import { usePinchZoom } from '../hooks/usePinchZoom';
const formatDuration = (seconds?: number): string => (seconds ? formatClock(seconds) : '');

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
                gap: 'var(--space-4)',
                paddingBottom: 'var(--space-4)',
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
  // User albums: named lists by media id (the file path); never move files.
  const [userAlbums, setUserAlbums] = useState<UserAlbum[]>(() => loadAlbums());
  useEffect(() => { try { localStorage.setItem(ALBUMS_KEY, JSON.stringify(userAlbums)); } catch { /* storage full */ } }, [userAlbums]);
  const activeUserAlbum = selectedAlbum.startsWith(USER_ALBUM_PREFIX) ? userAlbums.find(a => USER_ALBUM_PREFIX + a.id === selectedAlbum) ?? null : null;
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Real-time upscaling of small videos to the screen's resolution (remembered).
  const [enhanceVideo, setEnhanceVideo] = useState<boolean>(() => { try { return localStorage.getItem('dex-gallery-enhance') !== '0'; } catch { return true; } });
  const [enhanceActive, setEnhanceActive] = useState(false);
  useEffect(() => { try { localStorage.setItem('dex-gallery-enhance', enhanceVideo ? '1' : '0'); } catch { /* storage blocked */ } }, [enhanceVideo]);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Image zoom/pan state (iOS-style)
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const [imgDragging, setImgDragging] = useState(false);
  const [imgDragStart, setImgDragStart] = useState({ x: 0, y: 0 });
  // rAF batching for image pan (see handleImagePointerMove).
  const panRafRef = useRef(0);
  const panTargetRef = useRef<{ x: number; y: number } | null>(null);
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
  const [showTagSystem, setShowTagSystem] = useState(false);
  const [mediaTags, setMediaTags] = useState(loadGalleryTags);
  const [folderFilter, setFolderFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [duplicateFilter, setDuplicateFilter] = useState(false);
  const [folderTree, setFolderTree] = useState(false);
  useEffect(() => {
    persistOrWarn(TAGS_KEY, JSON.stringify(mediaTags), 'your Gallery tags');
  }, [mediaTags]);
  const addMediaTag = (ids: string[], name: string) => {
    if (!name.trim() || !ids.length) return;
    setMediaTags(previous => tagMedia(previous, ids, name));
    setTagInput('');
  };
  const knownFolders = useMemo(() => [...new Set(media.map(item => galleryFolder(item.id)).filter(Boolean))].sort(), [media]);
  const knownTags = useMemo(() => [...new Set(media.flatMap(item => (mediaTags[item.id] ?? []).map(tag => tag.toLowerCase())))].sort(), [media, mediaTags]);
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of media) {
      const key = duplicateImageKey(item);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  }, [media]);
  const [sendingImage, setSendingImage] = useState(false);
  const sendingImageRef = useRef(false);
  const sendImage = useCallback(async (item: MediaItem, target: 'pixelart' | 'qrcode') => {
    if (item.type !== 'image' || !item.src || sendingImageRef.current) return;
    sendingImageRef.current = true;
    setSendingImage(true);
    try {
      const response = await fetch(item.src);
      if (!response.ok) throw new Error('Image could not be read.');
      const blob = await response.blob();
      if (blob.size > 25_000_000) throw new Error('Choose an image under 25 MB.');
      if (target === 'pixelart') sendCreativeInput('pixelart', new File([blob], item.name, { type: blob.type }));
      else sendCreativeInput('qrcode', await smallImageQrData(blob));
      setSelectedMedia(current => current?.id === item.id ? null : current);
    } catch { toast.error('Could not send image', 'Choose a readable image under 25 MB. QR codes use a small preview.'); }
    finally { sendingImageRef.current = false; setSendingImage(false); }
  }, [toast]);
  const [tagInput, setTagInput] = useState('');
  const [showQuickAdjust, setShowQuickAdjust] = useState(false);
  const adjustCacheKey = selectedMedia?.type === 'image' ? `dex-gallery-adj-${selectedMedia.id}` : null;
  const savedAdj = useMemo(() => {
    if (!adjustCacheKey) return NEUTRAL;
    try { return normalizeAdjustments(JSON.parse(localStorage.getItem(adjustCacheKey) || 'null')); }
    catch { return NEUTRAL; }
  }, [adjustCacheKey]);
  // Non-destructive edits: parameters per photo, applied by the same pixel
  // pipeline for the live preview and the saved copy (galleryAdjust.ts).
  const [editDraft, setEditDraft] = useState<{ key: string; value: Adjustments } | null>(null);
  const adj = editDraft?.key === adjustCacheKey ? editDraft.value : savedAdj;
  const setAdj = useCallback((update: React.SetStateAction<Adjustments>) => {
    if (!adjustCacheKey) return;
    setEditDraft(previous => ({
      key: adjustCacheKey,
      value: typeof update === 'function'
        ? update(previous?.key === adjustCacheKey ? previous.value : savedAdj)
        : update,
    }));
  }, [adjustCacheKey, savedAdj]);
  const setAdjKey = useCallback((k: keyof Adjustments, v: number) => setAdj((a) => ({ ...a, [k]: v })), [setAdj]);
  const adjustExposure = adj.exposure, adjustContrast = adj.contrast, adjustSaturation = adj.saturation, adjustTemp = adj.temperature;
  const setAdjustExposure = useCallback((v: number) => setAdjKey('exposure', v), [setAdjKey]);
  const setAdjustContrast = useCallback((v: number) => setAdjKey('contrast', v), [setAdjKey]);
  const setAdjustSaturation = useCallback((v: number) => setAdjKey('saturation', v), [setAdjKey]);
  const setAdjustTemp = useCallback((v: number) => setAdjKey('temperature', v), [setAdjKey]);
  const historyRef = useRef(new EditHistory<Adjustments>(NEUTRAL));
  const applyingHistory = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCropRotate, setShowCropRotate] = useState(false);
  const [cropRatio, setCropRatio] = useState<'free' | '16:9' | '4:3' | '1:1' | '3:2'>('free');
  const [straightenAngle, setStraightenAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showCompareMode, setShowCompareMode] = useState(false);
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

  // Resolve an item's effective display name (custom rename wins over the raw name).
  const displayName = useCallback((item: MediaItem) => renameMap[item.id] ?? item.name, [renameMap]);

  // Persist renames whenever they change.
  useEffect(() => {
    try { persistOrWarn('dex-gallery-renames', JSON.stringify(renameMap), 'your Gallery renames'); } catch { /* unserialisable */ }
  }, [renameMap]);

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
          case 'favorites': return favorites.includes(item.id);
          case 'recent': return (now - item.date.getTime()) < sevenDays;
          case 'screenshots': return item.name?.toLowerCase().includes('screenshot');
          default:
            if (selectedAlbum.startsWith(USER_ALBUM_PREFIX)) return !!activeUserAlbum?.itemIds.includes(item.id);
            return true;
        }
      })();
      if (!albumMatch) return false;
      const folder = galleryFolder(item.id);
      if (folderFilter && folder !== folderFilter && !folder.startsWith(folderFilter + '/')) return false;
      if (tagFilter && !mediaTags[item.id]?.some(tag => tag.toLowerCase() === tagFilter)) return false;
      if (duplicateFilter && !duplicateKeys.has(duplicateImageKey(item) ?? '')) return false;
      if (q) {
        const name = (renameMap[item.id] ?? item.name ?? '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [media, favorites, selectedAlbum, searchQuery, renameMap, activeUserAlbum, folderFilter, tagFilter, mediaTags, duplicateFilter, duplicateKeys]);

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
    // Let UKI list the media in the current album as a callable action (read-only).
    registerUkiAppAction('gallery', {
      id: 'gallery.listMedia',
      description: 'list the media items shown in the current Gallery album.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      if (!c.sortedMedia.length) return `No media in album "${c.selectedAlbum}".`;
      const names = c.sortedMedia.slice(0, 100).map((m) => m.name).join(', ');
      return `${c.sortedMedia.length} items in "${c.selectedAlbum}": ${names}`.slice(0, 4000);
    });
    registerUkiAppAction('gallery', {
      id: 'gallery.findMedia',
      description: 'find photos and videos in the current album by name text, date range (YYYY-MM-DD), type (image/video), format or favourite; uses only metadata Gallery has.',
      args: [
        { name: 'text', type: 'string', optional: true },
        { name: 'from', type: 'string', optional: true },
        { name: 'to', type: 'string', optional: true },
        { name: 'type', type: 'string', optional: true },
        { name: 'format', type: 'string', optional: true },
        { name: 'favorite', type: 'string', optional: true },
      ],
      example: '{"text": "beach", "from": "2026-06-01"}',
      mutates: false,
    }, (args) => {
      const c = ukiCtxRef.current;
      const text = String(args.text ?? '').trim().toLowerCase();
      const parse = (v: unknown, end: boolean) => { const s = String(v ?? '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const d = new Date(`${s}T${end ? '23:59:59' : '00:00:00'}`); return Number.isNaN(d.getTime()) ? null : d.getTime(); };
      const from = parse(args.from, false), to = parse(args.to, true);
      if ((args.from && from === null) || (args.to && to === null)) return 'Dates must be YYYY-MM-DD.';
      const type = String(args.type ?? '').trim().toLowerCase();
      const format = String(args.format ?? '').trim().toLowerCase().replace(/^\./, '');
      const fav = String(args.favorite ?? '').trim().toLowerCase();
      const hits = c.sortedMedia.filter((m) => {
        const t = m.date instanceof Date ? m.date.getTime() : NaN;
        if (text && !m.name.toLowerCase().includes(text)) return false;
        if (from !== null && !(t >= from)) return false;
        if (to !== null && !(t <= to)) return false;
        if (type && m.type !== type) return false;
        if (format && (m.format ?? m.name.split('.').pop() ?? '').toLowerCase() !== format) return false;
        if ((fav === 'true' || fav === 'yes') && !m.favorite) return false;
        return true;
      });
      if (!hits.length) return `No items in "${c.selectedAlbum}" match.`;
      return `${hits.length} match in "${c.selectedAlbum}":\n` + hits.slice(0, 80).map((m) => `${m.name} · ${m.type}${m.width && m.height ? ` · ${m.width}×${m.height}` : ''} · ${m.date instanceof Date && !Number.isNaN(m.date.getTime()) ? toLocalDateInput(m.date) : 'no date'}${m.favorite ? ' · favourite' : ''}`).join('\n');
    });
    registerUkiAppAction('gallery', {
      id: 'gallery.getSelection',
      description: 'list the photos and videos the user has selected in Gallery.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      const picked = c.sortedMedia.filter((m) => c.selectedItems.has(m.id));
      if (!picked.length) return 'Nothing is selected in Gallery.';
      return picked.slice(0, 100).map((m) => `${m.name} · ${m.type} · ${m.src}`).join('\n').slice(0, 6000);
    });
    return () => {
      unregisterUkiAppContext('gallery');
      unregisterUkiAppAction('gallery.listMedia');
      unregisterUkiAppAction('gallery.findMedia');
      unregisterUkiAppAction('gallery.getSelection');
    };
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

  // "Delete" used to only hide items from this view; the files stayed on disk
  // and came back on the next scan. Local files now go to the Recycle Bin (the
  // user can restore them there); items without a file on disk are removed
  // from Gallery only, and the message says which happened.
  const trashMedia = useCallback(async (items: MediaItem[]) => {
    if (!items.length) return;
    const invoke = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<any> } }).dex?.invoke;
    const moved: string[] = [], viewOnly: string[] = [], failed: string[] = [];
    for (const it of items) {
      const path = fileUrlToPath(it.src);
      const onDisk = /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\');
      if (!invoke || !onDisk) { viewOnly.push(it.id); continue; }
      const r = await invoke('files:trash', path).catch(() => null);
      if (r?.success) moved.push(it.id); else failed.push(it.name);
    }
    const gone = new Set([...moved, ...viewOnly]);
    setMedia(prev => prev.filter(m => !gone.has(m.id)));
    if (moved.length) toast.success(`Moved ${moved.length} item${moved.length > 1 ? 's' : ''} to the Recycle Bin`, 'Restore from the Recycle Bin if you change your mind.');
    if (viewOnly.length) toast.info(`Removed ${viewOnly.length} item${viewOnly.length > 1 ? 's' : ''} from Gallery`, 'Not files on this PC, so nothing was deleted from disk.');
    if (failed.length) toast.error(`Could not move ${failed.length} item${failed.length > 1 ? 's' : ''} to the Recycle Bin`, failed.slice(0, 3).join(', '));
  }, [toast]);

  const batchDelete = useCallback(() => {
    if (selectedItems.size === 0) return;
    void trashMedia(media.filter(m => selectedItems.has(m.id)));
    clearSelection();
  }, [selectedItems, clearSelection, trashMedia, media]);

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

  const batchExport = useCallback(async () => {
    if (selectedItems.size === 0) return;
    const toExport = media.filter(m => selectedItems.has(m.id) && m.src);
    if (toExport.length === 0) { toast.error('No exportable files selected'); return; }
    if (toExport.length > 20 && !(await dexConfirm({ title: `Export ${toExport.length} files?`, message: 'This may take a moment.', confirmLabel: 'Export' }))) return;
    let failed = 0;
    toExport.forEach((m, i) => {
      setTimeout(async () => {
        try {
          // Download through a blob: `download` is ignored for a cross-origin
          // href (dexmedia), and the click would navigate DEX itself away.
          const blob = await (await fetch(m.src)).blob();
          const href = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = href;
          a.download = m.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(href), 10_000);
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
    applyingHistory.current = true;
    setEditDraft(null);
    historyRef.current.reset(savedAdj);
    setHistoryTick((t) => t + 1);
    setShowOriginal(false);
  }, [adjustCacheKey, savedAdj]);

  // Undo history: one step per pause in editing (a slider drag is one step).
  useEffect(() => {
    if (applyingHistory.current) { applyingHistory.current = false; return; }
    const t = setTimeout(() => { historyRef.current.push(adj); setHistoryTick((n) => n + 1); }, 350);
    return () => clearTimeout(t);
  }, [adjustCacheKey, adj]);
  const undoEdit = useCallback(() => {
    const prev = historyRef.current.undo();
    if (prev) { applyingHistory.current = true; setAdj(prev); setHistoryTick((n) => n + 1); }
  }, [setAdj]);
  const redoEdit = useCallback(() => {
    const next = historyRef.current.redo();
    if (next) { applyingHistory.current = true; setAdj(next); setHistoryTick((n) => n + 1); }
  }, [setAdj]);
  void historyTick; // re-render so Undo/Redo enablement follows the history

  // Persist adjustments to localStorage when changed
  useEffect(() => {
    if (!adjustCacheKey || editDraft?.key !== adjustCacheKey) return;
    if (!isNeutral(adj)) {
      persistOrWarn(adjustCacheKey, JSON.stringify(adj), 'your photo adjustments');
    } else {
      try { localStorage.removeItem(adjustCacheKey); } catch { /* nothing stored */ }
    }
  }, [adjustCacheKey, adj, editDraft]);

  /** Save an edited COPY (the original is never changed) through the native Save dialog. */
  const saveEditedCopy = useCallback(async (withGeometry: boolean) => {
    if (!selectedMedia?.src || savingEdit) return;
    setSavingEdit(true);
    try {
      const blob = await renderEditedBlob(selectedMedia.src, withGeometry
        ? { rotation: imgRotation, straighten: straightenAngle, flipH, flipV, ratio: cropRatio }
        : { rotation: 0, straighten: 0, flipH: false, flipV: false, ratio: 'free' }, adj);
      const base = selectedMedia.name.replace(/\.[^.]+$/, '');
      if (hasNativeFiles()) {
        const path = await pickSavePath(`${base}-edited.png`, [{ name: 'PNG image', extensions: ['png'] }], 'Save edited copy');
        if (!path) return;
        await writeBinaryFile(path, blob);
        toast.success(`Saved ${path.split(/[\\/]/).pop()}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${base}-edited.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      toast.error(`Could not save the edited copy: ${(e as Error)?.message || 'error'}`);
    } finally {
      setSavingEdit(false);
    }
  }, [selectedMedia, savingEdit, imgRotation, straightenAngle, flipH, flipV, cropRatio, adj, toast]);

  // Editing keys while the Adjust panel is open: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y,
  // and hold \ to see the original.
  useEffect(() => {
    if (!showQuickAdjust) return undefined;
    const down = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'gallery')) return; // a key meant for another app
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoEdit(); else undoEdit(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoEdit(); }
      else if (e.key === '\\') { setShowOriginal(true); }
    };
    const up = (e: KeyboardEvent) => { if (!keyEventForApp(e, 'gallery')) return; if (e.key === '\\') setShowOriginal(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [showQuickAdjust, undoEdit, redoEdit]);

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
    setCropRatio('free');
    setStraightenAngle(0);
    setFlipH(false);
    setFlipV(false);
    setShowMediaInfo(false);
  }, [selectedMedia?.id]);

  // Throttle wheel zoom to 60ms to prevent jank
  // Smooth pinch / Ctrl+wheel / wheel / two-finger touch zoom on the photo
  // (was a 60 ms-throttled fixed step on a passive React wheel handler).
  const imgZoomRef = useRef(imgZoom);
  imgZoomRef.current = imgZoom;
  usePinchZoom(imageContainerRef, {
    min: 0.5, max: 8, get: () => imgZoomRef.current, set: setImgZoom,
    enabled: !!selectedMedia?.src && selectedMedia?.type !== 'video',
    key: selectedMedia?.src,
  });

  const handleImagePointerDown = useCallback((e: React.PointerEvent) => {
    if (imgZoom <= 1) return;
    setImgDragging(true);
    setImgDragStart({ x: e.clientX - imgPan.x, y: e.clientY - imgPan.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [imgZoom, imgPan]);

  const handleImagePointerMove = useCallback((e: React.PointerEvent) => {
    if (!imgDragging) return;
    // Coalesce pan updates to one setState per frame: pointermove fires far
    // faster than the display refreshes, so per-event setImgPan just thrashes
    // the lightbox render. Keep the latest target and flush it on the frame.
    panTargetRef.current = { x: e.clientX - imgDragStart.x, y: e.clientY - imgDragStart.y };
    if (panRafRef.current) return;
    panRafRef.current = requestAnimationFrame(() => {
      panRafRef.current = 0;
      if (panTargetRef.current) setImgPan(panTargetRef.current);
    });
  }, [imgDragging, imgDragStart]);

  const handleImagePointerUp = useCallback(() => {
    if (panRafRef.current) { cancelAnimationFrame(panRafRef.current); panRafRef.current = 0; }
    if (panTargetRef.current) { setImgPan(panTargetRef.current); panTargetRef.current = null; }
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


  const copyImageToClipboard = useCallback(async () => {
    if (!selectedMedia?.src) return;
    try {
      const res = await fetch(selectedMedia.src);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch {
      try { await navigator.clipboard.writeText(fileUrlToPath(selectedMedia.src)); } catch { toast.error('Failed to copy to clipboard'); }
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
  // Furthest buffered point and playback speed (0.5x-2x, like a desktop player).
  const [videoBuffered, setVideoBuffered] = useState(0);
  const [videoRate, setVideoRate] = useState(1);
  // Any format: files WebView2 cannot play are prepared natively (media_compat.rs).
  const playable = usePlayableMedia(selectedMedia?.type === 'video' ? selectedMedia.src : null);
  const readBuffered = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.buffered.length) return;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) { setVideoBuffered(v.buffered.end(i)); return; }
    }
  }, []);
  const cycleVideoRate = useCallback(() => {
    const steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
    setVideoRate((r) => {
      const next = steps[(steps.indexOf(r) + 1) % steps.length] ?? 1;
      if (videoRef.current) videoRef.current.playbackRate = next;
      return next;
    });
  }, []);
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
      if (!keyEventForApp(e, 'gallery')) return; // key meant for another app
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
  // Initial gallery load via the shared useAsyncResource (owns the mounted-guard,
  // timeout, AbortController, and set-after-unmount safety that this used to
  // hand-roll). The loader pulls media + favorites together; the apply effects
  // fan the result into the existing state.
  const { data: loadedGallery, loading: galleryLoading, error: galleryError, reload } = useAsyncResource(
    async (signal) => {
      const [media, favorites] = await Promise.all([loadAllMedia(), loadFavorites()]);
      return signal.aborted ? null : { media, favorites };
    },
    { timeoutMs: 8000 },
  );
  const galleryHandoff = useRef<string | null>(null);
  useEffect(() => { setLoading(galleryLoading); }, [galleryLoading]);
  useEffect(() => {
    if (!loadedGallery) return;
    setMedia(loadedGallery.media);
    if (galleryHandoff.current) {
      const incoming = loadedGallery.media.find(item => item.id === galleryHandoff.current);
      if (incoming) {
        galleryHandoff.current = null;
        setSelectedMedia(incoming);
      }
    }
    if (!favoritesLoadedRef.current) setFavorites(loadedGallery.favorites);
    favoritesLoadedRef.current = true; // Mark initial load complete
  }, [loadedGallery]);
  useEffect(() => { if (galleryError) toast.error('Failed to load gallery'); }, [galleryError]);

  const importingRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const importMedia = async () => {
    const bridge = window.dex;
    if (!bridge?.invoke || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    try {
      const picked = await bridge.invoke('dialog:showOpenDialog', {
        filters: IMPORT_FILTERS, properties: ['openFile', 'multiSelections'],
      });
      if (picked?.canceled) return;
      if (!Array.isArray(picked?.filePaths)) throw new Error('Could not open the file picker.');
      let importedCount = 0;
      for (const path of new Set<string>(picked.filePaths)) {
        const extension = path.split('.').pop()?.toLowerCase() ?? '';
        if (!IMPORT_FILTERS[0].extensions.includes(extension)) continue;
        const item = await bridge.invoke('gallery:loadImage', path).catch(() => null);
        if (item?.path) importedCount++;
      }
      if (!importedCount) throw new Error('No supported files could be imported.');
      if (importedCount < picked.filePaths.length) toast.info('Some files could not be imported.');
      setSelectedAlbum('all');
      setSearchQuery('');
      setFolderFilter('');
      setTagFilter('');
      setDuplicateFilter(false);
      reload();
    } catch (error) {
      toast.error('Import failed', error instanceof Error ? error.message : undefined);
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const galleryHandoffRequest = useRef(0);
  useCreativeInput('gallery', async path => {
    const request = ++galleryHandoffRequest.current;
    galleryHandoff.current = null;
    const existing = media.find(item => item.id === path);
    if (existing) {
      setSelectedMedia(existing);
      return;
    }
    const entry = await window.dex?.invoke?.('gallery:loadImage', path).catch(() => null);
    if (request !== galleryHandoffRequest.current) return;
    if (!entry?.path) {
      toast.error('Gallery could not open this file');
      return;
    }
    galleryHandoff.current = entry.path;
    setSelectedAlbum('all');
    setSearchQuery('');
    setFolderFilter('');
    setTagFilter('');
    setDuplicateFilter(false);
    reload();
  });

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

  // Privacy: save a copy with camera/date/location metadata removed
  // (native fs:stripMetadata — lossless, the original is never touched).
  const [stripState, setStripState] = useState<{ busy: boolean; message?: string; error?: boolean }>({ busy: false });
  useEffect(() => { setStripState({ busy: false }); }, [selectedMedia?.id]);
  const canStripMetadata = !!(window as any).dex?.invoke && !!selectedMedia && selectedMedia.type === 'image'
    && /\.(jpe?g|png)$/i.test(selectedMedia.src);
  const stripSelectedMetadata = useCallback(async () => {
    const dex = (window as any).dex;
    if (!dex?.invoke || !selectedMedia) return;
    setStripState({ busy: true });
    try {
      const r = await dex.invoke('fs:stripMetadata', fileUrlToPath(selectedMedia.src));
      if (!r || r.ok === false) {
        setStripState({ busy: false, error: true, message: r?.error || 'Could not remove the metadata.' });
      } else if (!r.outPath) {
        setStripState({ busy: false, message: r.message || 'Nothing to remove.' });
      } else {
        const name = String(r.outPath).split(/[\\/]/).pop();
        setStripState({ busy: false, message: `Saved ${name}. Removed: ${(r.removed as string[]).join(', ')}.` });
      }
    } catch (e) {
      setStripState({ busy: false, error: true, message: e instanceof Error ? e.message : 'Could not remove the metadata.' });
    }
  }, [selectedMedia]);

  // Recent media (last 24h) for the "recently recorded" section at bottom
  const recentMedia = useMemo(() => {
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    return media
      .filter(m => m.date.getTime() > dayAgo)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 20);
  }, [media]);

  // Album counts - single pass instead of 6 separate filter calls
  useEffect(() => {
    if (!media.length) return;
    setUserAlbums(prev => pruneAlbums(prev, new Set(media.map(m => m.id))));
  }, [media]);

  const addItemsToAlbum = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const names = userAlbums.map(a => a.name).join(', ');
    const name = await dexPrompt({ title: `Add ${ids.length} item${ids.length > 1 ? 's' : ''} to an album`, label: names ? `Album name (existing: ${names})` : 'New album name', confirmLabel: 'Add' });
    if (!name?.trim()) return;
    const r = addToAlbum(userAlbums, name, ids);
    setUserAlbums(r.albums);
    toast.success(`${r.added ? `Added ${r.added}` : 'Already there'} · "${r.album.name}"`, 'Albums list photos; the files stay where they are.');
  }, [userAlbums, toast]);

  const batchTag = async () => {
    const ids = [...selectedItems];
    const label = await dexPrompt({ title: 'Tag ' + ids.length + ' selected items', label: 'Tag name', confirmLabel: 'Apply tag' });
    if (label) addMediaTag(ids, label);
  };
  const batchMove = async () => {
    if (!activeUserAlbum) return;
    const ids = [...selectedItems];
    const name = await dexPrompt({ title: 'Move between albums', label: 'Destination album name', confirmLabel: 'Move to album' });
    if (!name?.trim() || name.trim().toLowerCase() === activeUserAlbum.name.toLowerCase()) return;
    setUserAlbums(previous => moveAlbumItems(previous, activeUserAlbum, name, ids));
    clearSelection();
  };

  const deleteUserAlbum = useCallback(async (album: UserAlbum) => {
    if (!(await dexConfirm({ title: `Delete album "${album.name}"?`, message: 'Only the album goes; the photos and videos stay in your library.', confirmLabel: 'Delete album', tone: 'destructive' }))) return;
    setUserAlbums(prev => prev.filter(a => a.id !== album.id));
    if (selectedAlbum === USER_ALBUM_PREFIX + album.id) setSelectedAlbum('all');
  }, [selectedAlbum]);

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
  // Switch the grid to the windowed renderer once a library passes this size.
  // Lower than ITEMS_PER_PAGE so medium libraries (30-60) also window their rows
  // instead of mounting every thumbnail at once; tiny libraries stay plain to
  // avoid the virtualizer's measure pass causing a one-frame layout shift.
  const GRID_VIRTUALIZE_THRESHOLD = 30;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  // Reset visible count when album/search/sort changes
  useEffect(() => { setVisibleCount(ITEMS_PER_PAGE); }, [selectedAlbum, searchQuery, sortKey, sortDir]);
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

  // Phase 4: Virtualized grid (used when visibleMedia.length >= GRID_VIRTUALIZE_THRESHOLD)
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
    void trashMedia([item]);
    setSelectedMedia(null);
  }, [trashMedia]);

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
        { id: 'export-sel', label: `Export ${count} items`, icon: Icons.download, onSelect: batchExport },
        { id: 'album-sel', label: `Add ${count} items to album…`, icon: Icons.folder, onSelect: () => { void addItemsToAlbum([...selectedItems]); }, dividerAfter: !activeUserAlbum },
        ...(activeUserAlbum ? [{ id: 'unalbum-sel', label: `Remove ${count} from "${activeUserAlbum.name}"`, icon: Icons.close, onSelect: () => setUserAlbums(prev => removeFromAlbum(prev, activeUserAlbum.id, [...selectedItems])), dividerAfter: true }] : []),
        { id: 'deselect', label: 'Clear selection', icon: Icons.close, onSelect: clearSelection, dividerAfter: true },
        { id: 'delete-sel', label: `Move ${count} items to Recycle Bin`, icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: batchDelete },
      ];
    }
    return [
      { id: 'open', label: 'Open', icon: Icons.grid, onSelect: () => setSelectedMedia(item) },
      { id: 'rename', label: 'Rename', icon: Icons.edit, shortcut: 'F2', onSelect: () => startRename(item) },
      { id: 'select', label: selectedItems.has(item.id) ? 'Deselect' : 'Select', icon: Icons.grid, onSelect: () => { setSelectionMode(true); toggleItemSelection(item.id); lastSelectedIndexRef.current = sortedMedia.findIndex(m => m.id === item.id); }, dividerAfter: true },
      { id: 'fav', label: isFav ? 'Unfavorite' : 'Favorite', icon: Icons.heart, onSelect: () => toggleFavorite(item.id), dividerAfter: true },
      { id: 'copy', label: 'Copy to Clipboard', shortcut: 'Ctrl+C', icon: Icons.copy, onSelect: () => { setSelectedMedia(item); setTimeout(() => copyImageToClipboard(), 50); } },
      ...(item.type === 'image' ? [
        { id: 'pixel-art', label: 'Open in Pixel Art', icon: Icons.grid, onSelect: () => { void sendImage(item, 'pixelart'); } },
        { id: 'image-qr', label: 'Encode preview as QR', icon: Icons.share, onSelect: () => { void sendImage(item, 'qrcode'); } },
        { id: 'prism', label: 'Edit in Prism', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'image' as const, data: item.src, sourceApp: 'gallery' }, 'prism') },
      ] : []),
      ...(item.type === 'video' ? [
        { id: 'vinx', label: 'Edit in Vinx', icon: Icons.edit, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'videoeditor') },
        { id: 'forge', label: 'Send to Forge', icon: Icons.settings, onSelect: () => sendToApp({ name: item.name, kind: 'video' as const, data: item.src, sourceApp: 'gallery' }, 'forge') },
      ] : []),
      { id: 'album', label: 'Add to album…', icon: Icons.folder, onSelect: () => { void addItemsToAlbum([item.id]); } },
      ...(activeUserAlbum ? [{ id: 'unalbum', label: `Remove from "${activeUserAlbum.name}"`, icon: Icons.close, onSelect: () => setUserAlbums(prev => removeFromAlbum(prev, activeUserAlbum.id, [item.id])) }] : []),
      { id: 'files', label: 'Show in Files', icon: Icons.folder, onSelect: () => { void openWithShell('reveal', item.src, item.name); }, dividerAfter: true },
      { id: 'delete', label: 'Move to Recycle Bin', icon: Icons.trash, danger: true, shortcut: 'Del', onSelect: () => deleteMedia(item) },
    ];
  }, [favorites, selectedItems, sortedMedia, toggleFavorite, toggleItemSelection, copyImageToClipboard, sendToApp, deleteMedia, batchExport, batchDelete, batchFavorite, clearSelection, startRename, addItemsToAlbum, activeUserAlbum, sendImage]);

  // Lightbox keyboard nav + zoom. '+'/'=' zoom in, '-' zoom out, '0' fits.
  useEffect(() => {
    if (!selectedMedia) return;
    const handler = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'gallery')) return; // key meant for another app
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') setSelectedMedia(null);
      else if (e.key === 'ArrowLeft') navigateMedia('prev');
      else if (e.key === 'ArrowRight') navigateMedia('next');
      else if (selectedMedia.type === 'image' && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomIn(); }
      else if (selectedMedia.type === 'image' && (e.key === '-' || e.key === '_')) { e.preventDefault(); zoomOut(); }
      else if (selectedMedia.type === 'image' && e.key === '0') { e.preventDefault(); zoomReset(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedMedia, navigateMedia, zoomIn, zoomOut, zoomReset]);

  // Grid-level selection shortcuts: Ctrl/Cmd+A select all, Delete/Backspace remove
  // the selection, Escape clears it. Suppressed while the lightbox or a text field
  // is focused so it never eats typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'gallery')) return; // key meant for another app
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
    <div className="dex-gallery-root" style={styles.container}>
      <style>{`
        :where(.dex-gallery-root) button { font-family: inherit; transition: all 0.12s ease; }
        :where(.dex-gallery-root) button:active { transform: scale(0.97); }
        :where(.dex-gallery-root), :where(.dex-gallery-root) * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        :where(.dex-gallery-root) ::-webkit-scrollbar { width: 6px; height: 6px; }
        :where(.dex-gallery-root) ::-webkit-scrollbar-track { background: transparent; }
        :where(.dex-gallery-root) ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        :where(.dex-gallery-root) ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
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
                background: selectedAlbum === album.id ? 'var(--color-accent-light)' : 'transparent',
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
                background: selectedAlbum === album.id ? 'var(--color-accent-light)' : 'transparent',
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
          {userAlbums.map(album => (
            <div key={album.id} style={{ display: 'flex', alignItems: 'center' }} className="dex-gallery-user-album">
              <button
                style={{
                  ...styles.albumItem, flex: 1,
                  background: selectedAlbum === USER_ALBUM_PREFIX + album.id ? 'var(--color-accent-light)' : 'transparent',
                  color: selectedAlbum === USER_ALBUM_PREFIX + album.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
                }}
                aria-label={`Album ${album.name}`}
                aria-pressed={selectedAlbum === USER_ALBUM_PREFIX + album.id}
                onClick={() => setSelectedAlbum(USER_ALBUM_PREFIX + album.id)}
                data-testid="gallery-user-album"
              >
                {albumIcon('screenshots')}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.name}</span>
                <span style={styles.albumCount}>{album.itemIds.length}</span>
              </button>
              <button type="button" onClick={() => { void deleteUserAlbum(album); }} aria-label={`Delete album ${album.name}`} title="Delete album (photos stay)"
                style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4 }}>
                <DexIcon name="close" size={12} />
              </button>
            </div>
          ))}
          <button type="button" style={{ ...styles.albumItem, color: 'var(--color-text-tertiary)' }} data-testid="gallery-new-album"
            onClick={async () => {
              const name = await dexPrompt({ title: 'New album', label: 'Name', confirmLabel: 'Create' });
              if (!name?.trim()) return;
              const r = addToAlbum(userAlbums, name, [...selectedItems]);
              setUserAlbums(r.albums);
              setSelectedAlbum(USER_ALBUM_PREFIX + r.album.id);
            }}>
            <DexIcon name="plus" size={14} />
            <span style={{ flex: 1 }}>New album{selectedItems.size ? ` from ${selectedItems.size} selected` : ''}</span>
          </button>
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
                  background: selectedAlbum === album.id ? 'var(--color-accent-light)' : 'transparent',
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
          <h2 style={styles.title}>{activeUserAlbum?.name ?? ALBUMS.find(a => a.id === selectedAlbum)?.name ?? 'All Media'}</h2>
          <div style={styles.toolbarRight}>
            {hasNativeFiles() && <button type="button" style={{ ...styles.viewBtn, width: 'auto' }}
              disabled={importing} onClick={() => void importMedia()}>{importing ? 'Importing…' : 'Import'}</button>}
            {galleryError && <button type="button" style={{ ...styles.viewBtn, width: 'auto' }}
              onClick={reload}>Retry</button>}
            <button type="button" style={{ ...styles.viewBtn, width: 'auto' }} aria-expanded={folderTree}
              onClick={() => setFolderTree(value => !value)}>Filters</button>
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
              <button style={{...styles.viewBtn, background: selectionMode ? 'var(--color-accent-light)' : 'transparent', color: selectionMode ? 'var(--color-accent)' : undefined}} aria-label="Toggle selection mode" aria-pressed={selectionMode} onClick={() => { setSelectionMode(v => !v); if (selectionMode) setSelectedItems(new Set()); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </button>
              {selectionMode && selectedItems.size > 0 && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{selectedItems.size} selected</span>
                  <button onClick={selectAll} aria-label="Select all" style={{ ...styles.viewBtn, width: 'auto', padding: '0 var(--space-2)', fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>All</button>
                  <button type="button" style={{ ...styles.viewBtn, width: 'auto' }} onClick={() => void batchTag()}>Tag selected</button>
                  {activeUserAlbum && <button type="button" style={{ ...styles.viewBtn, width: 'auto' }} onClick={() => void batchMove()}>Move to album</button>}
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

        {(folderTree || folderFilter || tagFilter || duplicateFilter) && (
          <div role="group" aria-label="Gallery filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '6px 12px' }}>
            <label>Folder <select aria-label="Gallery folder" value={folderFilter} onChange={event => { setFolderFilter(event.target.value); clearSelection(); }}>
              <option value="">All folders</option>
              {folderFilter && !knownFolders.includes(folderFilter) && <option value={folderFilter}>{folderFilter}</option>}
              {knownFolders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
            </select></label>
            <label>Tag <select aria-label="Gallery tag" value={tagFilter} onChange={event => { setTagFilter(event.target.value); clearSelection(); }}>
              <option value="">All tags</option>
              {knownTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select></label>
            <label title="Matches image file size and similar filenames"><input type="checkbox" checked={duplicateFilter}
              onChange={event => { setDuplicateFilter(event.target.checked); clearSelection(); }} /> Possible duplicates</label>
            <button type="button" style={{ ...styles.viewBtn, width: 'auto' }}
              onClick={() => { setFolderFilter(''); setTagFilter(''); setDuplicateFilter(false); clearSelection(); }}>Clear filters</button>
          </div>
        )}

        {/* Gallery content */}
        <div style={styles.content}>
          {loading ? (
            <div style={{ ...styles.grid, padding: 'var(--space-4)' }}>
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
              <div style={{ width: 80, height: 80, borderRadius: 14, background: 'var(--color-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-5)', color: 'var(--color-accent)' }}>
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
              <button
                onClick={() => {
                  const folder = selectedAlbum === 'videos' ? 'videos' : 'pictures';
                  void openWithShell('path', folder, folder === 'videos' ? 'Videos' : 'Pictures');
                }}
                style={{
                  padding: 'var(--space-2) var(--space-5)', borderRadius: 6,
                  background: 'var(--color-accent-fill)', color: 'var(--color-text-on-accent, #fff)',
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
                    <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 4, background: selectedItems.has(item.id) ? 'var(--color-accent-fill)' : 'rgba(0,0,0,0.5)', border: '2px solid var(--color-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
                    <span style={{ position: 'absolute', top: 6, left: 6, padding: '1px 5px', borderRadius: 2, background: 'rgba(0,0,0,0.75)', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'none' as const }}>
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
              // Avoid layout shift on tiny libraries
              if (visibleMedia.length < GRID_VIRTUALIZE_THRESHOLD) {
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
              ))}
            </div>
          )}

          {/* Load More sentinel for infinite scroll */}
          {hasMoreItems && (
            <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-5) 0 var(--space-2)' }}>
              <button
                onClick={() => setVisibleCount(c => c + ITEMS_PER_PAGE)}
                aria-label="Load more media"
                style={{ padding: 'var(--space-2) 28px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s' }}
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
                          <video src={item.src} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} muted preload="metadata" />
                        ) : (
                          <img src={item.thumbnail || item.src} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px var(--space-3)', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-solid)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }} className="scrollbar-hidden">
          {[
            { label: 'Smart Albums', fn: () => setShowSmartAlbums(v => !v), active: showSmartAlbums },
            { label: 'EXIF', fn: () => setShowExifPanel(v => !v), active: showExifPanel },
            { label: 'Tags', fn: () => setShowTagSystem(v => !v), active: showTagSystem },
            { label: 'Adjust', fn: () => setShowQuickAdjust(v => !v), active: showQuickAdjust },
            { label: 'Crop', fn: () => setShowCropRotate(v => !v), active: showCropRotate },
            { label: 'Presets', fn: () => setShowPresets(v => !v), active: showPresets },
            { label: 'Compare', fn: () => setShowCompareMode(v => !v), active: showCompareMode },
            { label: 'Slideshow', fn: () => setShowSlideshow(v => !v), active: showSlideshow },
          ].map(b => (
            <button key={b.label} aria-label={b.label} aria-pressed={b.active} onClick={b.fn} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid ' + (b.active ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'), background: b.active ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', color: b.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3, flexShrink: 0, whiteSpace: 'nowrap' }}>{b.label}</button>
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
            {canStripMetadata && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <button
                  onClick={stripSelectedMetadata}
                  disabled={stripState.busy}
                  style={{ width: '100%', minHeight: 28, padding: '6px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600, cursor: stripState.busy ? 'progress' : 'pointer' }}
                >{stripState.busy ? 'Removing…' : 'Save a copy without metadata'}</button>
                <div role="status" aria-live="polite" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 4, color: stripState.error ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}>
                  {stripState.message ?? 'Removes camera, date and location details. The original stays as it is.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Face grouping was removed: it invented "Person 1..N" groups from the
          media count with no face detection (DEX_REMAINING_WORK #208). */}

      {/* Tag System */}
      {showTagSystem && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", right: 20, top: 120, width: 'min(240px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Tags</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowTagSystem(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag..." onKeyDown={e => { if (e.key === 'Enter' && selectedMedia) addMediaTag([selectedMedia.id], tagInput); }} maxLength={40} aria-label="Media tag"  style={{ flex: 1, padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', fontSize: 11 }} />
              <button aria-label="Add tag" onClick={() => { if (selectedMedia) addMediaTag([selectedMedia.id], tagInput); }} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontSize: 11, cursor: 'pointer' }}>+</button>
            </div>
            {selectedMedia && (mediaTags[selectedMedia.id] || []).length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(mediaTags[selectedMedia.id] || []).map((tag, i) => (
                  <span key={i} style={{ padding: '2px var(--space-2)', borderRadius: 10, background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontSize: 11 }}>
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
      {showQuickAdjust && (
        <div style={{ position: 'fixed', animation: "dex-panel-in 180ms ease-out", right: 20, top: 80, width: 'min(250px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Quick Adjust</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowQuickAdjust(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            {([
              ['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['highlights', 'Highlights'],
              ['shadows', 'Shadows'], ['saturation', 'Saturation'], ['temperature', 'Temperature'], ['tint', 'Tint'],
            ] as [keyof Adjustments, string][]).map(([key, label]) => (
              <div key={key} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</span>
                  <span style={{ fontSize: 11, color: adj[key] ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{adj[key] > 0 ? '+' : ''}{adj[key]}</span>
                </div>
                <input type="range" min={-100} max={100} value={adj[key]} onChange={e => setAdjKey(key, Number(e.target.value))} onDoubleClick={() => setAdjKey(key, 0)} aria-label={label} title="Double-click to reset" style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, margin: '6px 0' }}>
              <button type="button" aria-label="Undo adjustment" title="Undo (Ctrl+Z)" disabled={!historyRef.current.canUndo} onClick={undoEdit} style={editBtn(!historyRef.current.canUndo)}><DexIcon name="undo" size={12} /> Undo</button>
              <button type="button" aria-label="Redo adjustment" title="Redo (Ctrl+Shift+Z)" disabled={!historyRef.current.canRedo} onClick={redoEdit} style={editBtn(!historyRef.current.canRedo)}><DexIcon name="redo" size={12} /> Redo</button>
              <button type="button" aria-label="Hold to see the original" title="Hold (or hold the \ key) to see the original" aria-pressed={showOriginal}
                onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)}
                style={editBtn(false)}>Original</button>
            </div>
            <button aria-label="Reset all adjustments" disabled={isNeutral(adj)} onClick={() => setAdj(NEUTRAL)} style={{ ...editBtn(isNeutral(adj)), width: '100%', marginBottom: 4 }}>Reset All</button>
            <button aria-label="Save edited copy" disabled={savingEdit || isNeutral(adj)} onClick={() => { void saveEditedCopy(false); }} style={{ width: '100%', padding: '6px', borderRadius: 10, border: 'none', background: 'var(--color-accent-fill)', color: 'var(--color-text-on-accent, #fff)', fontSize: 11, fontWeight: 600, cursor: savingEdit ? 'progress' : 'pointer', opacity: isNeutral(adj) ? 0.5 : 1 }}>{savingEdit ? 'Saving…' : 'Save Edited Copy'}</button>
            <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.4 }}>Edits are kept with this photo; the original file is never changed.</div>
          </div>
        </div>
      )}

      {/* Crop & Rotate */}
      {showCropRotate && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(300px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crop & Rotate</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCropRotate(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Aspect Ratio</div>
            <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['free', '16:9', '4:3', '1:1', '3:2'] as const).map(a => (
                <button key={a} aria-label={`Set crop ratio ${a}`} aria-pressed={cropRatio === a} onClick={() => setCropRatio(a)} style={{ padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: cropRatio === a ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', color: cropRatio === a ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{a}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Straighten</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{straightenAngle}°</span></div>
            <input type="range" min="-45" max="45" value={straightenAngle} onChange={e => setStraightenAngle(Number(e.target.value))} aria-label="Straighten angle in degrees" style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 'var(--space-2)' }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button aria-label="Rotate clockwise 90 degrees" onClick={() => setImgRotation(r => (r + 90) % 360)} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-cw" size={10} /> 90</button>
              <button aria-label="Rotate counter-clockwise 90 degrees" onClick={() => setImgRotation(r => (r + 270) % 360)} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="rotate-ccw" size={10} /> 90</button>
              <button aria-label="Flip vertical" aria-pressed={flipV} onClick={() => setFlipV(v => !v)} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-vertical" size={10} /> Flip</button>
              <button aria-label="Flip horizontal" aria-pressed={flipH} onClick={() => setFlipH(v => !v)} style={{ flex: 1, padding: '5px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><DexIcon name="flip-horizontal" size={10} /> Flip</button>
            </div>
            <button aria-label="Save edited image as copy" disabled={savingEdit} onClick={() => { void saveEditedCopy(true); }} style={{ width: '100%', padding: '6px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>{savingEdit ? 'Saving…' : 'Save Edited Copy'}</button>
          </div>
        </div>
        </div>
      )}

      {/* One-Click Presets */}
      {showPresets && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)', pointerEvents: 'none' }}>
        <div style={{ animation: "dex-panel-in 180ms ease-out", width: 'min(340px, calc(100vw - 48px))', background: 'var(--color-bg-elevated)', borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', pointerEvents: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>One-Click Presets</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowPresets(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[{ name: 'Auto Enhance', icon: 'sparkles', color: 'var(--color-accent)', e: 15, c: 10, s: 15, t: 0 }, { name: 'B&W Classic', icon: 'contrast', color: 'var(--color-text-tertiary)', e: 0, c: 20, s: -100, t: 0 }, { name: 'Vintage Film', icon: 'film', color: 'var(--color-warning)', e: -5, c: -10, s: -20, t: 30 }, { name: 'Vivid', icon: 'palette', color: 'var(--color-success)', e: 10, c: 25, s: 40, t: 0 }, { name: 'Warm Tone', icon: 'sun', color: 'var(--color-warning)', e: 5, c: 5, s: 10, t: 40 }, { name: 'Cool Tone', icon: 'snowflake', color: 'var(--color-info, #64d2ff)', e: 0, c: 10, s: -10, t: -40 }, { name: 'Dramatic', icon: 'diamond', color: 'var(--color-error)', e: -15, c: 50, s: 10, t: 0 }, { name: 'Cinematic', icon: 'clapperboard', color: 'var(--color-tag-purple, #bf5af2)', e: -10, c: 30, s: -15, t: 15 }, { name: 'Natural', icon: 'leaf', color: 'var(--color-success)', e: 5, c: 5, s: 5, t: 5 }].map(p => (
                <button key={p.name} aria-label={`Apply preset: ${p.name}`} onClick={() => { setAdjustExposure(p.e); setAdjustContrast(p.c); setAdjustSaturation(p.s); setAdjustTemp(p.t); }} style={{ padding: 10, borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: 'var(--color-border-subtle)', cursor: 'pointer', textAlign: 'center' }}>
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
              {selectedMedia?.type === 'image' ? <img src={selectedMedia.src} alt="Original" style={{ maxWidth: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 6 }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select a photo</span>}
            </div>
            <div style={{ flex: 1, borderRadius: 6, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>AFTER</div>
              {selectedMedia?.type === 'image' ? <AdjustedPreview src={selectedMedia.src} adj={adj} label="Edited" style={{ maxWidth: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 6 }} /> : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select a photo</span>}
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
                <button key={t} aria-label={`${t} transition`} aria-pressed={slideshowTransition === t} onClick={() => setSlideshowTransition(t)} style={{ flex: 1, padding: '6px', borderRadius: 4, border: '1px solid var(--color-bg-hover)', background: slideshowTransition === t ? 'var(--color-accent-light)' : 'var(--color-border-subtle)', color: slideshowTransition === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
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
            {selectedMedia.type === 'image' && <>
              <button type="button" style={styles.lightboxBtn} disabled={sendingImage} onClick={() => void sendImage(selectedMedia, 'pixelart')} aria-label="Open in Pixel Art"><DexIcon name="grid" size={16} /></button>
              <button type="button" style={styles.lightboxBtn} disabled={sendingImage} onClick={() => void sendImage(selectedMedia, 'qrcode')} aria-label="Encode preview as QR"><DexIcon name="qrcode" size={16} /></button>
            </>}
            <span style={styles.lightboxTitle}>
              {/* Folder breadcrumb derived from the media path */}
              {galleryBreadcrumbs(selectedMedia.id).length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 'var(--space-2)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 400 }}>
                  {galleryBreadcrumbs(selectedMedia.id).map((crumb, i, arr) => (
                    <React.Fragment key={i}>
                      <button type="button" style={{ ...styles.viewBtn, width: 'auto' }} title={crumb.path} onClick={() => {
                        setSelectedAlbum('all'); setFolderFilter(crumb.path); setTagFilter(''); setDuplicateFilter(false);
                        setSearchQuery(''); clearSelection(); setSelectedMedia(null);
                      }}>{crumb.label}</button>
                      {i < arr.length - 1 && <span style={{ opacity: 0.5 }}>/</span>}
                    </React.Fragment>
                  ))}
                  <span style={{ opacity: 0.5 }}>/</span>
                </span>
              )}
              {renamingId === selectedMedia.id ? <input aria-label="Rename media" autoFocus value={renameDraft}
                onChange={event => setRenameDraft(event.target.value)} onBlur={() => commitRename(selectedMedia)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') { event.stopPropagation(); setRenamingId(null); }
                }} /> : <>
                  {displayName(selectedMedia)}
                  <button type="button" style={styles.lightboxBtn} onClick={() => startRename(selectedMedia)} aria-label="Rename media">{Icons.edit}</button>
                </>}
              {duplicateKeys.has(duplicateImageKey(selectedMedia) ?? '') && <span title="Matches image file size and similar filenames"> · Possible duplicate</span>}
              {selectedMedia.type === 'video' && <span style={{ marginLeft: 'var(--space-2)', padding: '2px var(--space-2)', borderRadius: 4, background: 'color-mix(in srgb, var(--color-tag-purple, #bf5af2) 20%, transparent)', color: 'var(--color-tag-purple, #bf5af2)', fontSize: 11 }}>Video</span>}
            </span>
            <div style={styles.lightboxActions}>
              <button style={{...styles.lightboxBtn, color: favorites.includes(selectedMedia.id) ? 'var(--color-error)' : 'var(--color-text-secondary)'}} aria-label={favorites.includes(selectedMedia.id) ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavorite(selectedMedia.id)}>
                {favorites.includes(selectedMedia.id) ? Icons.heart : Icons.heartOutline}
              </button>
              <button style={styles.lightboxBtn} onClick={copyImageToClipboard} aria-label="Copy image">{Icons.copy}</button>
              <button style={styles.lightboxBtn} onClick={() => { if (navigator.clipboard && selectedMedia) navigator.clipboard.writeText(fileUrlToPath(selectedMedia.src)); }} aria-label="Share">{Icons.share}</button>
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
                <button style={{...styles.lightboxBtn, color: 'var(--color-text-primary)'}} aria-label="Open in VINX" title="Open in VINX" onClick={() => {
                  sendToApp({ name: selectedMedia.name, kind: 'video', data: selectedMedia.src, sourceApp: 'gallery' }, 'videoeditor');
                  const def = APP_DEFINITIONS['videoeditor'];
                  launchApp({ id: 'videoeditor', name: def.name, icon: def.icon, color: def.color });
                }}>
                  <DexIcon name="film" size={16} />
                </button>
              )}
              {selectedMedia.type === 'video' && (
                <button
                  style={{ ...styles.lightboxBtn, width: 'auto', padding: '0 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, background: enhanceVideo ? 'var(--color-accent-fill)' : (styles.lightboxBtn as React.CSSProperties).background, color: enhanceVideo ? 'var(--color-accent-text)' : undefined }}
                  onClick={() => setEnhanceVideo(v => !v)}
                  aria-pressed={enhanceVideo}
                  aria-label={enhanceVideo ? (enhanceActive ? 'Enhance video: upscaling to screen resolution' : 'Enhance video: on (not needed at this size)') : 'Enhance video: off'}
                >Enhance</button>
              )}
              <button style={styles.lightboxBtn} onClick={() => setShowMediaInfo(prev => !prev)} aria-label="Info">{Icons.info}</button>
              <button style={styles.lightboxBtn} onClick={() => deleteMedia(selectedMedia)} aria-label="Move to Recycle Bin">{Icons.trash}</button>
            </div>
          </div>

          <div style={styles.lightboxContent}>
            {(() => { const atStart = sortedMedia[0]?.id === selectedMedia.id; return (
            <button style={{ ...styles.navBtn, opacity: atStart ? 0.35 : 1, cursor: atStart ? 'default' : 'pointer' }} aria-label="Previous media" disabled={atStart} onClick={() => navigateMedia('prev')}>{Icons.chevronLeft}</button>
            ); })()}
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
                      src={playable.src}
                      preload="auto"
                      autoPlay
                      onClick={toggleVideoPlay}
                      onTimeUpdate={() => { handleVideoTimeUpdate(); readBuffered(); }}
                      onProgress={readBuffered}
                      onError={playable.onMediaError}
                      onLoadedMetadata={(e) => { handleVideoLoadedMetadata(); e.currentTarget.playbackRate = videoRate; }}
                      onEnded={() => setVideoPlaying(false)}
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }}
                    />
                    <PlayableMediaStatus status={playable.status} percent={playable.percent} error={playable.error} />
                    <VideoEnhance video={videoRef} enabled={enhanceVideo} onActiveChange={setEnhanceActive} />
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
                      {/* Scrubber: drag to seek, hover for the time, arrows/Home/End */}
                      <MediaScrubber
                        tone="overlay"
                        label="Seek video"
                        current={videoCurrentTime}
                        duration={videoDuration}
                        buffered={videoBuffered}
                        onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; setVideoCurrentTime(t); }}
                      />
                      {/* Controls row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <button onClick={toggleVideoPlay} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: '#fff', display: 'flex', alignItems: 'center',
                        }} aria-label={videoPlaying ? 'Pause' : 'Play'}>
                          {videoPlaying ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                          )}
                        </button>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {fmtTime(videoCurrentTime)}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>/</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                          {fmtTime(videoDuration)}
                        </span>
                        <div style={{ flex: 1 }} />
                        {/* Playback speed */}
                        <button onClick={cycleVideoRate} aria-label={`Playback speed ${videoRate}x`} style={{
                          height: 22, minWidth: 38, padding: '0 8px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                          background: videoRate === 1 ? 'rgba(255,255,255,0.12)' : 'var(--color-accent)', color: '#fff',
                          fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        }}>{videoRate}x</button>
                        {/* Volume */}
                        <button onClick={toggleVideoMute} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'rgba(255,255,255,0.82)', display: 'flex', alignItems: 'center',
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
                        <div style={{ position: 'relative', width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.28)' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2, background: '#fff', width: `${videoMuted ? 0 : videoVolume}%` }} />
                          <input
                            type="range" min="0" max="100" value={videoMuted ? 0 : videoVolume}
                            onChange={e => changeVideoVolume(parseInt(e.target.value))}
                            style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
                            aria-label="Video volume"
                          />
                        </div>
                        {/* PiP */}
                        <button onClick={() => { 
                          openPiP(playable.src ?? selectedMedia.src, selectedMedia.name, selectedMedia.thumbnail);
                          videoRef.current?.pause();
                          setSelectedMedia(null);
                        }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'rgba(255,255,255,0.82)', display: 'flex', alignItems: 'center',
                        }} aria-label="Picture in Picture">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                          </svg>
                        </button>
                        {/* Fullscreen */}
                        <button onClick={toggleVideoFullscreen} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: 'rgba(255,255,255,0.82)', display: 'flex', alignItems: 'center',
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
                    onDoubleClick={handleImageDoubleClick}
                  >
                    {!isNeutral(adj) && !showOriginal ? (
                      <AdjustedPreview
                        src={selectedMedia.src}
                        adj={adj}
                        label={`${selectedMedia.name} (edited)`}
                        style={{
                          width: '100%', height: '100%', objectFit: 'contain',
                          transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px) rotate(${imgRotation + straightenAngle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                          transition: imgDragging ? 'none' : 'transform 0.2s ease',
                          willChange: 'transform',
                        }}
                      />
                    ) : (
                    <img
                      src={selectedMedia.src}
                      alt={selectedMedia.name}
                      draggable={false}
                      style={{
                        width: '100%', height: '100%', objectFit: 'contain',
                        transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px) rotate(${imgRotation + straightenAngle}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                        transition: imgDragging ? 'none' : 'transform 0.2s ease',
                        willChange: 'transform',
                      }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    )}
                    {showOriginal && !isNeutral(adj) && (
                      <span style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '3px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 600 }}>Original</span>
                    )}
                    {/* Zoom toolbar - frosted glass */}
                    <div style={{
                      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 10,
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
            {(() => { const atEnd = sortedMedia[sortedMedia.length - 1]?.id === selectedMedia.id; return (
            <button style={{ ...styles.navBtn, opacity: atEnd ? 0.35 : 1, cursor: atEnd ? 'default' : 'pointer' }} aria-label="Next media" disabled={atEnd} onClick={() => navigateMedia('next')}>{Icons.chevronRight}</button>
            ); })()}
          </div>

          <div style={styles.lightboxFooter}>
            <span style={{ padding: '2px var(--space-2)', borderRadius: 4, background: 'var(--color-border-subtle)', fontSize: 11, fontWeight: 500 }}>
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
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0.5 }}>Rating</span>
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
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0.5 }}>Label</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { color: 'var(--color-error)', name: 'Red' },
                    { color: 'var(--color-warning)', name: 'Orange' },
                    { color: 'var(--color-tag-yellow, #FFD60A)', name: 'Yellow' },
                    { color: 'var(--color-success)', name: 'Green' },
                    { color: 'var(--color-accent)', name: 'Blue' },
                    { color: 'var(--color-tag-purple, #BF5AF2)', name: 'Purple' },
                    { color: 'var(--color-text-tertiary)', name: 'Gray' },
                  ].map(({ color, name }) => (
                    <button
                      key={color}
                      onClick={() => setColorLabels(prev => ({ ...prev, [selectedMedia.id]: prev[selectedMedia.id] === color ? '' : color }))}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', border: colorLabels[selectedMedia.id] === color ? '2px solid #fff' : '2px solid transparent',
                        background: color, cursor: 'pointer', padding: 0, boxShadow: colorLabels[selectedMedia.id] === color ? `0 0 4px ${color}` : 'none',
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
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0.5 }}>{label}</span>
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
  sectionLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none' as const, padding: 'var(--space-3) 10px 4px', letterSpacing: 0.8 },
  albumItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px var(--space-3)', height: 'var(--pg-row-height)' as any, borderRadius: 'var(--pg-row-radius)' as any, border: 'none', cursor: 'pointer', fontSize: 12.5, width: '100%', textAlign: 'left' as const, transition: 'background-color 0.12s ease, color 0.12s ease' },
  albumCount: { fontSize: 11.5, color: 'var(--color-text-tertiary)' },

  // Main
  main: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  toolbar: { height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-4)', borderBottom: '1px solid var(--pg-border)', background: 'var(--pg-toolbar)' },
  title: { fontSize: 14, fontWeight: 700 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)' },
  itemCount: { fontSize: 13, color: 'var(--color-text-muted)' },
  viewToggle: { display: 'flex', background: 'var(--color-bg-glass)', borderRadius: 4, padding: 2 },
  viewBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' },

  // Content
  content: { flex: 1, overflow: 'auto', padding: 'var(--space-5)', scrollBehavior: 'smooth' as const, WebkitOverflowScrolling: 'touch' as any, overscrollBehavior: 'contain' as any },
  emptyState: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px var(--space-5)', textAlign: 'center' as const },
  emptyIcon: { fontSize: 48, color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' },
  emptySubtitle: { fontSize: 14, color: 'var(--color-text-muted)' },

  // Grid View
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-4)', contain: 'layout' as any },
  gridItem: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-2)', cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.15s ease', contentVisibility: 'auto' as any, containIntrinsicSize: '140px 180px' as any },
  thumbnail: { aspectRatio: '1', borderRadius: 6, position: 'relative' as const, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  videoOverlay: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 6 },
  playBadge: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)' },
  durationBadge: { position: 'absolute' as const, bottom: 6, right: 6, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.7)', color: 'var(--color-text-primary)', fontSize: 10, fontWeight: 500 },
  favoriteIcon: { position: 'absolute' as const, top: 8, right: 8, color: 'var(--color-error)' },
  itemName: { fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

  // List View
  list: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, cursor: 'pointer' },
  listThumb: { width: 48, height: 48, borderRadius: 4 },
  listInfo: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  listName: { fontSize: 14, color: 'var(--color-text-primary)' },
  listMeta: { fontSize: 12, color: 'var(--color-text-muted)' },
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
  lightboxContent: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)', gap: 'var(--space-5)' },
  navBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'var(--color-border)', color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'all 0.15s ease' },
  lightboxImage: { flex: 1, maxWidth: '80%', aspectRatio: '16/10', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxFooter: { height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)', fontSize: 13, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)' },
};

Gallery.displayName = 'Gallery';
export default memo(Gallery);

