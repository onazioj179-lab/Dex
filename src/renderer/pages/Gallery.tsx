/**
 * GALLERY - macOS Photos Style Media Gallery
 * Clean grid layout for images and media
 */

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  src: string;
  thumbnail: string;
  name: string;
  date: Date;
  size: number;
  favorite: boolean;
}

interface Album {
  id: string;
  name: string;
  count: number;
  cover: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  grid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
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
  album: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"/>
      <path d="M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
      <path d="M21 15l-5-5L5 21"/>
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
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12"/>
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
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA - Load from system
// ═══════════════════════════════════════════════════════════════════════════

const ALBUMS: Album[] = [
  { id: 'all', name: 'All Photos', count: 0, cover: '' },
  { id: 'favorites', name: 'Favorites', count: 0, cover: '' },
  { id: 'recent', name: 'Recent', count: 0, cover: '' },
  { id: 'screenshots', name: 'Screenshots', count: 0, cover: '' },
  { id: 'videos', name: 'Videos', count: 0, cover: '' },
];

// Load media from real file system with timeout
const loadMedia = async (): Promise<MediaItem[]> => {
  try {
    if (window.electron?.invoke) {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const filesPromise = window.electron?.invoke('media:getMediaFiles', 'pictures');
      const files = await Promise.race([filesPromise, timeoutPromise]);
      
      if (files && Array.isArray(files) && files.length > 0) {
        return files.slice(0, 100).map((f: { path?: string; name?: string; extension?: string; size?: number; modified?: string }, i: number) => ({
          id: f.path || String(i),
          type: (f.extension?.match(/mp4|mov|avi|mkv/i) ? 'video' : 'image') as 'video' | 'image',
          src: f.path || '',
          thumbnail: f.path || '',
          name: f.name || `media-${i}`,
          date: new Date(f.modified || Date.now()),
          size: f.size || 0,
          favorite: false as const,
        }));
      }
    }
  } catch (err) {
    console.warn('Failed to load images from system:', err);
  }
  
  // Load from localStorage as fallback
  try {
    const saved = localStorage.getItem('dex-gallery-media');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((m: Omit<MediaItem, 'date'> & { date: string }) => ({ ...m, date: new Date(m.date) }));
    }
  } catch { /* localStorage unavailable */ }
  return [];
};

// Load/save favorites with backend persistence
const loadFavorites = async (): Promise<string[]> => {
  try {
    if (window.electron?.invoke) {
      const result = await window.electron?.invoke('capability:storage:get', 'dex-gallery-favorites');
      if (result) return JSON.parse(result);
    }
  } catch { /* storage unavailable */ }
  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('dex-gallery-favorites');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

const saveFavorites = async (favorites: string[]) => {
  const data = JSON.stringify(favorites);
  localStorage.setItem('dex-gallery-favorites', data);
  try {
    await window.electron?.invoke?.('capability:storage:set', 'dex-gallery-favorites', data);
  } catch { /* backend save failed */ }
};

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Gallery: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('gallery');

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(false);

  // Load media and favorites on mount - fast with timeout
  React.useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      // Quick load favorites - don't block UI
      try {
        const loadedFavs = await loadFavorites();
        if (mounted) setFavorites(loadedFavs);
      } catch { /* favorites load failed */ }
      
      // Load media in background with timeout
      setLoading(true);
      try {
        const loadedMedia = await loadMedia();
        if (mounted) setMedia(loadedMedia);
      } catch { /* media load failed */ }
      if (mounted) setLoading(false);
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  // Save favorites
  React.useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const filteredMedia = useMemo(() => media.filter(item => {
    const isFav = favorites.includes(item.id);
    switch (selectedAlbum) {
      case 'favorites':
        return isFav;
      case 'videos':
        return item.type === 'video';
      default:
        return true;
    }
  }), [media, favorites, selectedAlbum]);

  const albumCounts = useMemo(() => ({
    all: media.length,
    favorites: favorites.length,
    recent: media.filter(m => Date.now() - m.date.getTime() < 7 * 24 * 3600 * 1000).length,
    screenshots: media.filter(m => m.name?.toLowerCase().includes('screenshot')).length,
    videos: media.filter(m => m.type === 'video').length,
  }), [media, favorites]);

  const toggleFavorite = (id: string) => {
    if (favorites.includes(id)) {
      setFavorites(favorites.filter(f => f !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getPlaceholderColor = (id: string): string => {
    const colors = ['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2'];
    return colors[parseInt(id) % colors.length];
  };

  const navigateMedia = useCallback((direction: 'prev' | 'next') => {
    if (!selectedMedia) return;
    const currentIndex = filteredMedia.findIndex(m => m.id === selectedMedia.id);
    if (direction === 'prev' && currentIndex > 0) {
      setSelectedMedia(filteredMedia[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < filteredMedia.length - 1) {
      setSelectedMedia(filteredMedia[currentIndex + 1]);
    }
  }, [selectedMedia, filteredMedia]);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!selectedMedia) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedMedia(null);
      else if (e.key === 'ArrowLeft') navigateMedia('prev');
      else if (e.key === 'ArrowRight') navigateMedia('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMedia, navigateMedia]);

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Photos</span>
        </div>
        
        <div style={styles.albumList}>
          <div style={styles.sectionLabel}>Library</div>
          {ALBUMS.slice(0, 3).map(album => (
            <button
              key={album.id}
              style={{
                ...styles.albumItem,
                background: selectedAlbum === album.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedAlbum === album.id ? '#0a84ff' : 'rgba(255,255,255,0.85)',
              }}
              onClick={() => setSelectedAlbum(album.id)}
              aria-label={album.name}
            >
              {album.id === 'favorites' ? Icons.heart : Icons.photo}
              <span style={{ flex: 1 }}>{album.name}</span>
              <span style={styles.albumCount}>{albumCounts[album.id as keyof typeof albumCounts] ?? 0}</span>
            </button>
          ))}
          
          <div style={styles.sectionLabel}>Albums</div>
          {ALBUMS.slice(3).map(album => (
            <button
              key={album.id}
              style={{
                ...styles.albumItem,
                background: selectedAlbum === album.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedAlbum === album.id ? '#0a84ff' : 'rgba(255,255,255,0.85)',
              }}
              onClick={() => setSelectedAlbum(album.id)}
              aria-label={album.name}
            >
              {Icons.folder}
              <span style={{ flex: 1 }}>{album.name}</span>
              <span style={styles.albumCount}>{albumCounts[album.id as keyof typeof albumCounts] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <h2 style={styles.title}>
            {ALBUMS.find(a => a.id === selectedAlbum)?.name}
          </h2>
          <div style={styles.toolbarRight}>
            <span style={styles.itemCount}>{filteredMedia.length} items</span>
            <div style={styles.viewToggle}>
              <button
                style={{...styles.viewBtn, background: viewMode === 'grid' ? 'rgba(255,255,255,0.1)' : 'transparent'}}
                onClick={() => setViewMode('grid')}
                aria-label="Toggle grid view"
              >
                {Icons.grid}
              </button>
              <button
                style={{...styles.viewBtn, background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent'}}
                onClick={() => setViewMode('list')}
                aria-label="Toggle list view"
              >
                {Icons.list}
              </button>
            </div>
          </div>
        </div>

        {/* Gallery */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>{Icons.photo}</div>
              <div style={styles.emptyTitle}>Loading photos...</div>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>{Icons.photo}</div>
              <div style={styles.emptyTitle}>No photos found</div>
              <div style={styles.emptySubtitle}>
                {selectedAlbum === 'favorites' 
                  ? 'Add photos to favorites to see them here'
                  : 'Add images to your Pictures folder'}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div style={styles.grid}>
              {filteredMedia.map(item => (
                <div
                  key={item.id}
                  style={styles.gridItem}
                  onClick={() => setSelectedMedia(item)}
                >
                  <div style={{...styles.thumbnail, background: getPlaceholderColor(item.id), overflow: 'hidden'}}>
                    {(item.src || item.thumbnail) ? (
                      <img
                        src={item.thumbnail || item.src}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : null}
                    {item.type === 'video' && <span style={styles.videoIcon}>▶</span>}
                    {favorites.includes(item.id) && (
                      <span style={styles.favoriteIcon}>{Icons.heart}</span>
                    )}
                  </div>
                  <span style={styles.itemName}>{item.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.list}>
              {filteredMedia.map(item => (
                <div
                  key={item.id}
                  style={styles.listItem}
                  onClick={() => setSelectedMedia(item)}
                >
                  <div style={{...styles.listThumb, background: getPlaceholderColor(item.id), overflow: 'hidden'}}>
                  {(item.src || item.thumbnail) ? (
                    <img
                      src={item.thumbnail || item.src}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : null}
                </div>
                  <div style={styles.listInfo}>
                    <span style={styles.listName}>{item.name}</span>
                    <span style={styles.listMeta}>{formatDate(item.date)} • {formatSize(item.size)}</span>
                  </div>
                  <button
                    style={styles.listFavBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    aria-label={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.includes(item.id) ? Icons.heart : Icons.heartOutline}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {selectedMedia && (
        <div style={styles.lightbox}>
          <div style={styles.lightboxHeader}>
            <button style={styles.lightboxClose} onClick={() => setSelectedMedia(null)} aria-label="Close lightbox">
              {Icons.close}
            </button>
            <span style={styles.lightboxTitle}>{selectedMedia.name}</span>
            <div style={styles.lightboxActions}>
              <button
                style={{...styles.lightboxBtn, color: favorites.includes(selectedMedia.id) ? '#ff375f' : 'rgba(255,255,255,0.7)'}}
                onClick={() => toggleFavorite(selectedMedia.id)}
                aria-label={favorites.includes(selectedMedia.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favorites.includes(selectedMedia.id) ? Icons.heart : Icons.heartOutline}
              </button>
              <button style={styles.lightboxBtn} onClick={() => { if (navigator.clipboard && selectedMedia) navigator.clipboard.writeText(selectedMedia.src); }} title="Share" aria-label="Share photo">{Icons.share}</button>
              <button style={styles.lightboxBtn} onClick={() => { if (selectedMedia) { setMedia(prev => prev.filter(m => m.id !== selectedMedia.id)); setSelectedMedia(null); } }} title="Delete" aria-label="Delete photo">{Icons.trash}</button>
            </div>
          </div>
          
          <div style={styles.lightboxContent}>
            <button style={styles.navBtn} onClick={() => navigateMedia('prev')} aria-label="Previous photo">
              {Icons.chevronLeft}
            </button>
            <div style={{...styles.lightboxImage, background: getPlaceholderColor(selectedMedia.id), overflow: 'hidden', position: 'relative'}}>
              {(selectedMedia.src) ? (
                <img
                  src={selectedMedia.src}
                  alt={selectedMedia.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#bf5af2" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              )}
            </div>
            <button style={styles.navBtn} onClick={() => navigateMedia('next')} aria-label="Next photo">
              {Icons.chevronRight}
            </button>
          </div>
          
          <div style={styles.lightboxFooter}>
            <span>{formatDate(selectedMedia.date)}</span>
            <span>{formatSize(selectedMedia.size)}</span>
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
    position: 'relative',
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
  albumList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    padding: '12px 10px 6px',
    letterSpacing: '0.5px',
  },
  albumItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  albumCount: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  itemCount: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
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
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  
  // Content
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  emptySubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  
  // Grid View
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '16px',
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  thumbnail: {
    aspectRatio: '1',
    borderRadius: '8px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoIcon: {
    position: 'absolute',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'var(--color-bg-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  favoriteIcon: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    color: 'var(--color-error)',
  },
  itemName: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  
  // List View
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  listThumb: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
  },
  listInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listName: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  listMeta: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  listFavBtn: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  },
  
  // Lightbox
  lightbox: {
    position: 'absolute',
    inset: 0,
    background: 'var(--color-bg-overlay-strong)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    backdropFilter: 'blur(20px)',
  },
  lightboxHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  lightboxClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  lightboxTitle: {
    flex: 1,
    fontSize: '14px',
    fontWeight: 500,
  },
  lightboxActions: {
    display: 'flex',
    gap: '8px',
  },
  lightboxBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  lightboxContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    gap: '20px',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  lightboxImage: {
    flex: 1,
    maxWidth: '80%',
    aspectRatio: '16/10',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxFooter: {
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    borderTop: '1px solid var(--color-border)',
  },
};

Gallery.displayName = 'Gallery';
export default memo(Gallery);

