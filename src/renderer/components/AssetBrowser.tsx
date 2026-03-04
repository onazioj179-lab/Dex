/**
 * DEX Asset Browser
 * Unified asset management for all creative apps
 */
import React, { useState, useCallback, useMemo, memo } from 'react';

// ==================== TYPES ====================
export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;
  size: number;
  duration?: number;
  thumbnail?: string;
  tags: string[];
  favorite: boolean;
  dateAdded: number;
  lastUsed?: number;
}

export type AssetType = 
  | 'audio' 
  | 'video' 
  | 'image' 
  | 'midi' 
  | 'preset' 
  | 'effect' 
  | 'sample' 
  | 'font'
  | 'project'
  | 'folder';

export interface AssetCategory {
  id: string;
  name: string;
  types: AssetType[];
  icon: React.ReactNode;
}

export interface AssetFilter {
  types: AssetType[];
  tags: string[];
  favorites: boolean;
  search: string;
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
}

// ==================== CATEGORIES ====================
export const ASSET_CATEGORIES: AssetCategory[] = [
  { 
    id: 'all', 
    name: 'All Assets', 
    types: [], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
  },
  { 
    id: 'audio', 
    name: 'Audio', 
    types: ['audio', 'sample'], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  },
  { 
    id: 'video', 
    name: 'Video', 
    types: ['video'], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
  },
  { 
    id: 'images', 
    name: 'Images', 
    types: ['image'], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  },
  { 
    id: 'midi', 
    name: 'MIDI', 
    types: ['midi'], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
  },
  { 
    id: 'presets', 
    name: 'Presets', 
    types: ['preset', 'effect'], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  },
  { 
    id: 'favorites', 
    name: 'Favorites', 
    types: [], 
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  },
];

// ==================== FILE TYPE ICONS ====================
export const getAssetIcon = (type: AssetType): React.ReactNode => {
  switch (type) {
    case 'audio':
    case 'sample':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
    case 'video':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
    case 'image':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    case 'midi':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>;
    case 'preset':
    case 'effect':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v10"/></svg>;
    case 'folder':
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    default:
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>;
  }
};

// ==================== UTILITIES ====================
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number): string => {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const filterAssets = (assets: Asset[], filter: AssetFilter): Asset[] => {
  let result = [...assets];
  
  // Filter by type
  if (filter.types.length > 0) {
    result = result.filter(a => filter.types.includes(a.type));
  }
  
  // Filter by tags
  if (filter.tags.length > 0) {
    result = result.filter(a => filter.tags.some(t => a.tags.includes(t)));
  }
  
  // Filter favorites
  if (filter.favorites) {
    result = result.filter(a => a.favorite);
  }
  
  // Search
  if (filter.search) {
    const search = filter.search.toLowerCase();
    result = result.filter(a => 
      a.name.toLowerCase().includes(search) ||
      a.tags.some(t => t.toLowerCase().includes(search))
    );
  }
  
  // Sort
  result.sort((a, b) => {
    let cmp = 0;
    switch (filter.sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'date':
        cmp = a.dateAdded - b.dateAdded;
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'type':
        cmp = a.type.localeCompare(b.type);
        break;
    }
    return filter.sortOrder === 'asc' ? cmp : -cmp;
  });
  
  return result;
};

// ==================== HOOKS ====================
export const useAssetBrowser = (initialAssets: Asset[] = []) => {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [filter, setFilter] = useState<AssetFilter>({
    types: [],
    tags: [],
    favorites: false,
    search: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const filteredAssets = useMemo(
    () => filterAssets(assets, filter),
    [assets, filter]
  );
  
  const setSearch = useCallback((search: string) => {
    setFilter(f => ({ ...f, search }));
  }, []);
  
  const setCategory = useCallback((categoryId: string) => {
    const category = ASSET_CATEGORIES.find(c => c.id === categoryId);
    setFilter(f => ({
      ...f,
      types: category?.types || [],
      favorites: categoryId === 'favorites',
    }));
  }, []);
  
  const toggleFavorite = useCallback((assetId: string) => {
    setAssets(prev => prev.map(a =>
      a.id === assetId ? { ...a, favorite: !a.favorite } : a
    ));
  }, []);
  
  const selectAsset = useCallback((assetId: string, multi = false) => {
    setSelectedIds(prev => {
      const next = new Set(multi ? prev : []);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);
  
  const addTag = useCallback((assetId: string, tag: string) => {
    setAssets(prev => prev.map(a =>
      a.id === assetId && !a.tags.includes(tag)
        ? { ...a, tags: [...a.tags, tag] }
        : a
    ));
  }, []);
  
  return {
    assets: filteredAssets,
    allAssets: assets,
    filter,
    selectedIds,
    setAssets,
    setFilter,
    setSearch,
    setCategory,
    toggleFavorite,
    selectAsset,
    addTag,
  };
};

// ==================== COMPONENTS ====================
interface AssetBrowserProps {
  assets: Asset[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi?: boolean) => void;
  onDoubleClick?: (asset: Asset) => void;
  onFavorite?: (id: string) => void;
  viewMode?: 'grid' | 'list';
}

export const AssetBrowser: React.FC<AssetBrowserProps> = memo(({
  assets,
  selectedIds,
  onSelect,
  onDoubleClick,
  onFavorite,
  viewMode = 'grid',
}) => {
  return (
    <div style={viewMode === 'grid' ? styles.grid : styles.list}>
      {assets.map(asset => (
        <AssetItem
          key={asset.id}
          asset={asset}
          isSelected={selectedIds.has(asset.id)}
          onClick={(e) => onSelect(asset.id, e.ctrlKey || e.metaKey)}
          onDoubleClick={() => onDoubleClick?.(asset)}
          onFavorite={() => onFavorite?.(asset.id)}
          viewMode={viewMode}
        />
      ))}
      {assets.length === 0 && (
        <div style={styles.empty}>No assets found</div>
      )}
    </div>
  );
});

AssetBrowser.displayName = 'AssetBrowser';

interface AssetItemProps {
  asset: Asset;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onFavorite?: () => void;
  viewMode: 'grid' | 'list';
}

const AssetItem: React.FC<AssetItemProps> = memo(({
  asset,
  isSelected,
  onClick,
  onDoubleClick,
  onFavorite,
  viewMode,
}) => {
  const containerStyle = viewMode === 'grid'
    ? { ...styles.gridItem, ...(isSelected ? styles.selected : {}) }
    : { ...styles.listItem, ...(isSelected ? styles.selected : {}) };
  
  return (
    <div
      style={containerStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div style={styles.icon}>
        {getAssetIcon(asset.type)}
      </div>
      <div style={styles.info}>
        <span style={styles.name}>{asset.name}</span>
        {viewMode === 'list' && (
          <>
            <span style={styles.meta}>{formatFileSize(asset.size)}</span>
            {asset.duration && (
              <span style={styles.meta}>{formatDuration(asset.duration)}</span>
            )}
          </>
        )}
      </div>
      {onFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
          style={styles.favoriteBtn}
        >
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill={asset.favorite ? 'currentColor' : 'none'} 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      )}
    </div>
  );
});

AssetItem.displayName = 'AssetItem';

interface CategorySidebarProps {
  activeCategory: string;
  onSelect: (categoryId: string) => void;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = memo(({
  activeCategory,
  onSelect,
}) => {
  return (
    <div style={styles.sidebar}>
      {ASSET_CATEGORIES.map(category => (
        <button
          key={category.id}
          onClick={() => onSelect(category.id)}
          style={{
            ...styles.categoryBtn,
            background: activeCategory === category.id 
              ? 'var(--color-accent, #007aff)' 
              : 'transparent',
          }}
        >
          {category.icon}
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
});

CategorySidebar.displayName = 'CategorySidebar';

// ==================== STYLES ====================
const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 8,
    padding: 8,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 8,
  },
  gridItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: 12,
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.05))',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  selected: {
    background: 'var(--color-accent, #007aff)',
    color: '#fff',
  },
  icon: {
    opacity: 0.8,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
  },
  name: {
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    fontSize: 10,
    opacity: 0.6,
  },
  favoriteBtn: {
    padding: 4,
    background: 'none',
    border: 'none',
    color: '#f59e0b',
    cursor: 'pointer',
    opacity: 0.6,
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 8,
    borderRight: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
  categoryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
  },
  empty: {
    gridColumn: '1 / -1',
    padding: 40,
    textAlign: 'center',
    opacity: 0.5,
    fontSize: 13,
  },
};

export default AssetBrowser;
