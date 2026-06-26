// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Media Browser
 * 5 tabs: Media, Effects, Transitions, Titles, Audio
 * Grid/list view, search, bins, hover scrub preview.
 */

import React, { useCallback, useEffect, useRef, useState, memo, useMemo } from 'react';
import { clampEventToViewport } from '../../utils/menuPosition';
import { useVinxStore } from './VinxStore';
import type { MediaItem, MediaBin } from './VinxTypes';
import {
  generateId, formatTimecode, EFFECT_DEFINITIONS, AUDIO_EFFECTS,
  VIDEO_TRANSITIONS, AUDIO_TRANSITIONS, TITLE_PRESETS,
} from './VinxTypes';
import { Z_DROPDOWN_MAX } from '../../../shared/zIndex';
import { EmptyState } from '../../components/EmptyState';
import { DexSearchInput } from '../../styles/components';
import { buildClipFromMedia, resolveDropTrack, appendFrameForTrack } from './mediaClip';
import { createAddClipCommand } from './VinxCommands';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex', height: 28, flexShrink: 0, borderBottom: '1px solid var(--color-bg-hover)',
  background: 'var(--color-bg-base)',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase',
  color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', cursor: 'pointer', userSelect: 'none',
  borderBottom: active ? '1px solid var(--color-accent, #4A9EFF)' : '1px solid transparent',
  background: 'transparent',
});

const searchBarStyle: React.CSSProperties = {
  height: 28, display: 'flex', alignItems: 'center', padding: '0 var(--space-2)',
  borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
};

const listItemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px var(--space-2)', cursor: 'pointer',
  background: selected ? 'var(--color-accent-soft, rgba(74,158,255,0.12))' : 'transparent',
  borderBottom: '1px solid var(--color-border-subtle)',
});

const gridItemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4, cursor: 'pointer',
  background: selected ? 'var(--color-accent-soft, rgba(74,158,255,0.12))' : 'transparent',
  borderRadius: 3, width: 80,
});

const thumbnailStyle: React.CSSProperties = {
  width: 64, height: 36, borderRadius: 2, background: 'var(--color-bg-base, #1A1A1A)', overflow: 'hidden',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

const effectItemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-2)', cursor: 'pointer',
  background: selected ? 'var(--color-accent-soft, rgba(74,158,255,0.12))' : 'transparent',
  borderBottom: '1px solid var(--color-border-subtle)',
  fontSize: 11, color: 'var(--color-text-primary)',
});

const categoryHeaderStyle: React.CSSProperties = {
  padding: '6px var(--space-2)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid var(--color-border-subtle)',
};

// ---------------------------------------------------------------------------
// ICONS (inline SVG, 16x16)
// ---------------------------------------------------------------------------

const ImportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.2">
    <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
  </svg>
);

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M4 4h10M4 8h10M4 12h10M2 4h0M2 8h0M2 12h0" />
  </svg>
);

const BinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.2">
    <path d="M2 4h12l-1 10H3L2 4zM6 1h4v3H6z" />
  </svg>
);

const FolderIcon = ({ expanded }: { expanded: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#909090" strokeWidth="1.2">
    {expanded
      ? <path d="M2 4h5l2 2h5v8H2V4z" />
      : <path d="M2 3h5l2 2h5v9H2V3z" />
    }
  </svg>
);

// ---------------------------------------------------------------------------
// MEDIA TAB
// ---------------------------------------------------------------------------

const MediaTab: React.FC = memo(() => {
  const mediaBin = useVinxStore(s => s.project.mediaBin);
  const bins = useVinxStore(s => s.project.bins);
  const selectedMediaId = useVinxStore(s => s.selectedMediaId);
  const setSelectedMedia = useVinxStore(s => s.setSelectedMedia);
  const addMedia = useVinxStore(s => s.addMedia);
  const removeMedia = useVinxStore(s => s.removeMedia);
  const viewMode = useVinxStore(s => s.mediaViewMode);
  const setMediaViewMode = useVinxStore(s => s.setMediaViewMode);
  const search = useVinxStore(s => s.mediaBrowserSearch);
  const setSearch = useVinxStore(s => s.setMediaBrowserSearch);
  const addBin = useVinxStore(s => s.addBin);
  const toggleBin = useVinxStore(s => s.toggleBin);

  const filtered = useMemo(() => {
    if (!search) return mediaBin;
    const lower = search.toLowerCase();
    return mediaBin.filter(m => m.name.toLowerCase().includes(lower));
  }, [mediaBin, search]);

  // Double-click a media item to insert it at the end of a compatible track
  // (mirrors the drag-to-timeline path, but appends rather than placing at a
  // dropped frame). Undoable via the command pipeline.
  const insertMedia = useCallback((mediaId: string) => {
    const state = useVinxStore.getState();
    const media = state.project.mediaBin.find(m => m.id === mediaId);
    if (!media) return;
    const seq = state.getActiveSequence();
    const target = resolveDropTrack(seq, media, null);
    if (!target) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: `No ${media.type === 'audio' ? 'audio' : 'video'} track available — add one first` } }));
      return;
    }
    const clip = buildClipFromMedia(media, target.id, appendFrameForTrack(target), state.project.frameRate);
    state.executeCommand(createAddClipCommand(useVinxStore.getState, clip));
    state.selectClip(clip.id, false);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Inserted "${media.name}" at end of timeline` } }));
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = () => {
      if (!input.files) return;
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const isImage = file.type.startsWith('image/');
        const objectUrl = URL.createObjectURL(file);

        // Probe real metadata before adding to bin
        const addItem = (meta: { duration: number; width: number; height: number; frameRate: number; sampleRate: number; channels: number }) => {
          const item: MediaItem = {
            id: generateId('media'),
            name: file.name,
            type: isVideo ? 'video' : isAudio ? 'audio' : isImage ? 'image' : 'video',
            path: objectUrl,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            frameRate: meta.frameRate,
            sampleRate: meta.sampleRate,
            audioChannels: meta.channels,
            fileSize: file.size,
            addedAt: Date.now(),
            thumbnailUrl: null,
            proxyPath: null,
            proxyProgress: 0,
            waveformData: null,
            binId: null,
          };
          addMedia(item);
        };

        if (isVideo) {
          const vid = document.createElement('video');
          vid.preload = 'auto';
          vid.muted = true;
          vid.playsInline = true;
          vid.onloadeddata = () => {
            // Seek to 1 second (or 10% of duration) for a representative frame
            const seekTo = Math.min(1, (vid.duration || 0) * 0.1);
            vid.currentTime = seekTo;
          };
          vid.onseeked = () => {
            // Capture thumbnail frame
            let thumbUrl: string | null = null;
            try {
              const c = document.createElement('canvas');
              const w = Math.min(vid.videoWidth, 192);
              const h = Math.round(w * (vid.videoHeight / vid.videoWidth));
              c.width = w; c.height = h;
              const cx = c.getContext('2d');
              if (cx) {
                cx.drawImage(vid, 0, 0, w, h);
                thumbUrl = c.toDataURL('image/jpeg', 0.7);
              }
            } catch (e) { console.warn('[Vinx] Thumbnail capture failed:', e); }
            const item: MediaItem = {
              id: generateId('media'),
              name: file.name,
              type: 'video',
              path: objectUrl,
              duration: vid.duration || 0,
              width: vid.videoWidth || 1920,
              height: vid.videoHeight || 1080,
              frameRate: 30,
              sampleRate: 48000,
              audioChannels: 2,
              fileSize: file.size,
              addedAt: Date.now(),
              thumbnailUrl: thumbUrl,
              proxyPath: null,
              proxyProgress: 0,
              waveformData: null,
              binId: null,
            };
            addMedia(item);
            vid.src = '';
          };
          vid.onerror = () => addItem({ duration: 0, width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, channels: 2 });
          vid.src = objectUrl;
        } else if (isAudio) {
          const aud = document.createElement('audio');
          aud.preload = 'metadata';
          aud.onloadedmetadata = () => {
            addItem({
              duration: aud.duration || 0,
              width: 0,
              height: 0,
              frameRate: 0,
              sampleRate: 48000,
              channels: 2,
            });
            aud.src = '';
          };
          aud.onerror = () => addItem({ duration: 0, width: 0, height: 0, frameRate: 0, sampleRate: 48000, channels: 2 });
          aud.src = objectUrl;
        } else if (isImage) {
          const img = new Image();
          img.onload = () => {
            addItem({
              duration: 0,
              width: img.naturalWidth || 1920,
              height: img.naturalHeight || 1080,
              frameRate: 0,
              sampleRate: 0,
              channels: 0,
            });
          };
          img.onerror = () => addItem({ duration: 0, width: 1920, height: 1080, frameRate: 0, sampleRate: 0, channels: 0 });
          img.src = objectUrl;
        } else {
          addItem({ duration: 0, width: 0, height: 0, frameRate: 0, sampleRate: 0, channels: 0 });
        }
      }
    };
    input.click();
  }, [addMedia]);

  const handleDelete = useCallback((id?: string) => {
    const target = id ?? selectedMediaId;
    if (target) removeMedia(target);
  }, [selectedMediaId, removeMedia]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; mediaId: string } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, mediaId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedMedia(mediaId);
    const p = clampEventToViewport(e);
    setCtxMenu({ x: p.left, y: p.top, mediaId });
  }, [setSelectedMedia]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  }, [ctxMenu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMediaId) {
        e.preventDefault();
        removeMedia(selectedMediaId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMediaId, removeMedia]);

  return (
    <div style={panelStyle}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', height: 28, alignItems: 'center', gap: 4, padding: '0 6px',
        borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
      }}>
        <button aria-label="Import media" onClick={handleImport} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22, width: 22, borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
          <ImportIcon />
        </button>
        <button aria-label="Create new bin" onClick={() => addBin(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22, width: 22, borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
          <BinIcon />
        </button>
        <div style={{ flex: 1 }} />
        <button aria-label={`Switch to ${viewMode === 'list' ? 'grid' : 'list'} view`} onClick={() => setMediaViewMode(viewMode === 'list' ? 'grid' : 'list')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22, width: 22, borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
          {viewMode === 'list' ? <GridIcon /> : <ListIcon />}
        </button>
      </div>

      {/* Search */}
      <div style={searchBarStyle}>
        <DexSearchInput
          size="sm"
          fullWidth
          placeholder="Search media..."
          aria-label="Search media library"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      {/* Bins */}
      {bins.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--color-border-subtle)' }}>
          {bins.filter(b => !b.parentId).map(bin => (
            <div key={bin.id} style={{ padding: '2px var(--space-2)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-secondary)' }}
              onClick={() => toggleBin(bin.id)}>
              <FolderIcon expanded={bin.expanded} />
              <span>{bin.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Media List/Grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: viewMode === 'grid' ? 4 : 0 }}>
        {viewMode === 'grid' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {filtered.map(item => (
              <MediaGridItem
                key={item.id}
                item={item}
                selected={item.id === selectedMediaId}
                onClick={() => setSelectedMedia(item.id)}
                onInsert={() => insertMedia(item.id)}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
              />
            ))}
          </div>
        ) : (
          filtered.map(item => (
            <MediaListItem
              key={item.id}
              item={item}
              selected={item.id === selectedMediaId}
              onClick={() => setSelectedMedia(item.id)}
              onInsert={() => insertMedia(item.id)}
              onContextMenu={(e) => handleContextMenu(e, item.id)}
            />
          ))
        )}
        {filtered.length === 0 && (
          search ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
              No results for "{search}"
            </div>
          ) : (
            <EmptyState
              compact
              title="No media yet"
              description="Import video, audio, or images to start building your timeline."
              icon={<ImportIcon />}
              actions={[{ label: 'Import media', onClick: handleImport }]}
            />
          )
        )}
      </div>
      {ctxMenu && (
        <div
          role="menu"
          aria-label="Media item actions"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: Z_DROPDOWN_MAX,
            minWidth: 160, padding: '4px 0',
            background: 'var(--color-bg-elevated, #1a1a1e)',
            border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
            borderRadius: 6,
            boxShadow: 'var(--pg-shadow-context)',
            fontSize: 12, color: 'var(--color-text-primary)',
          }}
        >
          <button
            role="menuitem"
            onClick={() => { handleDelete(ctxMenu.mediaId); setCtxMenu(null); }}
            aria-label="Delete media item"
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', padding: 'var(--space-2) 14px',
              color: 'var(--color-error, #ff5f57)', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >Delete</button>
        </div>
      )}
    </div>
  );
});

MediaTab.displayName = 'MediaTab';

// ---------------------------------------------------------------------------
// MEDIA ITEMS
// ---------------------------------------------------------------------------

const MediaListItem: React.FC<{ item: MediaItem; selected: boolean; onClick: () => void; onInsert?: () => void; onContextMenu?: (e: React.MouseEvent) => void }> = memo(({ item, selected, onClick, onInsert, onContextMenu }) => {
  const typeIcon = item.type === 'video' ? 'V' : item.type === 'audio' ? 'A' : 'I';
  const typeColor = item.type === 'video' ? 'var(--color-accent)' : item.type === 'audio' ? '#3DAF72' : '#D4853A';

  return (
    <div
      style={listItemStyle(selected)}
      onClick={onClick}
      onDoubleClick={onInsert ?? onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('vinx/media', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
    >
      <div style={thumbnailStyle}>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: typeColor }}>{typeIcon}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {item.duration > 0 ? formatTimecode(Math.round(item.duration * 30), 30) : item.type}
          {item.width > 0 && ` / ${item.width}x${item.height}`}
        </div>
      </div>
    </div>
  );
});

MediaListItem.displayName = 'MediaListItem';

const MediaGridItem: React.FC<{ item: MediaItem; selected: boolean; onClick: () => void; onInsert?: () => void; onContextMenu?: (e: React.MouseEvent) => void }> = memo(({ item, selected, onClick, onInsert, onContextMenu }) => {
  const typeIcon = item.type === 'video' ? 'V' : item.type === 'audio' ? 'A' : 'I';
  const typeColor = item.type === 'video' ? 'var(--color-accent)' : item.type === 'audio' ? '#3DAF72' : '#D4853A';

  return (
    <div
      style={gridItemStyle(selected)}
      onClick={onClick}
      onDoubleClick={onInsert ?? onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('vinx/media', item.id); e.dataTransfer.effectAllowed = 'copy'; }}
    >
      <div style={{ ...thumbnailStyle, width: 72, height: 40 }}>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <span style={{ fontSize: 16, fontWeight: 700, color: typeColor }}>{typeIcon}</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72, marginTop: 2 }}>
        {item.name}
      </div>
    </div>
  );
});

MediaGridItem.displayName = 'MediaGridItem';

// ---------------------------------------------------------------------------
// EFFECTS TAB
// ---------------------------------------------------------------------------

const EffectsTab: React.FC = memo(() => {
  const search = useVinxStore(s => s.effectsSearch);
  const setSearch = useVinxStore(s => s.setEffectsSearch);
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);

  const allEffects = useMemo(() => [...EFFECT_DEFINITIONS, ...AUDIO_EFFECTS], []);

  const filtered = useMemo(() => {
    if (!search) return allEffects;
    const lower = search.toLowerCase();
    return allEffects.filter(e => e.name.toLowerCase().includes(lower) || e.category.toLowerCase().includes(lower));
  }, [allEffects, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const list = map.get(e.category) || [];
      list.push(e);
      map.set(e.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div style={panelStyle}>
      <div style={searchBarStyle}>
        <DexSearchInput size="sm" fullWidth placeholder="Search" aria-label="Search effects" value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch('')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {Array.from(grouped.entries()).map(([category, effects]) => (
          <div key={category}>
            <div style={categoryHeaderStyle}>{category}</div>
            {effects.map(effect => (
              <div
                key={effect.id}
                style={effectItemStyle(effect.id === selectedEffect)}
                onClick={() => setSelectedEffect(effect.id)}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('vinx/effect', effect.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--color-accent)', flexShrink: 0 }} />
                <span>{effect.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

EffectsTab.displayName = 'EffectsTab';

// ---------------------------------------------------------------------------
// TRANSITIONS TAB
// ---------------------------------------------------------------------------

const TransitionsTab: React.FC = memo(() => {
  const [search, setSearch] = useState('');
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);

  const allTransitions = useMemo(() => [
    ...VIDEO_TRANSITIONS.map(t => ({ ...t, group: 'Video' })),
    ...AUDIO_TRANSITIONS.map(t => ({ ...t, group: 'Audio' })),
  ], []);

  const filtered = useMemo(() => {
    if (!search) return allTransitions;
    const lower = search.toLowerCase();
    return allTransitions.filter(t => t.name.toLowerCase().includes(lower));
  }, [allTransitions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const list = map.get(t.group) || [];
      list.push(t);
      map.set(t.group, list);
    }
    return map;
  }, [filtered]);

  return (
    <div style={panelStyle}>
      <div style={searchBarStyle}>
        <DexSearchInput size="sm" fullWidth placeholder="Search" aria-label="Search transitions" value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch('')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {Array.from(grouped.entries()).map(([group, transitions]) => (
          <div key={group}>
            <div style={categoryHeaderStyle}>{group}</div>
            {transitions.map(t => (
              <div
                key={t.id}
                style={effectItemStyle(t.id === selectedTransition)}
                onClick={() => setSelectedTransition(t.id)}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('vinx/transition', JSON.stringify({ type: t.type, defaultDuration: t.defaultDuration }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#D4853A', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{t.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{t.defaultDuration}f</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

TransitionsTab.displayName = 'TransitionsTab';

// ---------------------------------------------------------------------------
// TITLES TAB
// ---------------------------------------------------------------------------

const TitlesTab: React.FC = memo(() => {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={panelStyle}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {TITLE_PRESETS.map(preset => (
          <div
            key={preset.id}
            style={effectItemStyle(preset.id === selected)}
            onClick={() => setSelected(preset.id)}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('vinx/title', JSON.stringify(preset));
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <div style={{
              width: 48, height: 28, borderRadius: 2, background: '#1A1A1A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: preset.data.fontSize > 48 ? 10 : 8,
              color: preset.data.color,
              fontWeight: preset.data.fontWeight,
              flexShrink: 0,
            }}>
              {preset.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{preset.name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{preset.category}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

TitlesTab.displayName = 'TitlesTab';

// ---------------------------------------------------------------------------
// AUDIO TAB
// ---------------------------------------------------------------------------

const AudioTab: React.FC = memo(() => {
  const mediaBin = useVinxStore(s => s.project.mediaBin);
  const selectedMediaId = useVinxStore(s => s.selectedMediaId);
  const setSelectedMedia = useVinxStore(s => s.setSelectedMedia);

  const audioItems = useMemo(() => mediaBin.filter(m => m.type === 'audio'), [mediaBin]);

  return (
    <div style={panelStyle}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {audioItems.length === 0 && (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
            No audio files imported
          </div>
        )}
        {audioItems.map(item => (
          <div
            key={item.id}
            style={effectItemStyle(item.id === selectedMediaId)}
            onClick={() => setSelectedMedia(item.id)}
          >
            <span style={{ width: 4, height: 4, borderRadius: 2, background: '#3DAF72', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                {item.duration > 0 ? `${Math.round(item.duration)}s` : 'Audio'}
                {item.sampleRate > 0 && ` / ${item.sampleRate / 1000}kHz`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

AudioTab.displayName = 'AudioTab';

// ---------------------------------------------------------------------------
// MEDIA BROWSER (MAIN EXPORT)
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'media' as const, label: 'Media' },
  { key: 'effects' as const, label: 'Effects' },
  { key: 'transitions' as const, label: 'Trans' },
  { key: 'titles' as const, label: 'Titles' },
  { key: 'audio' as const, label: 'Audio' },
];

export const MediaBrowser: React.FC = memo(() => {
  const activeTab = useVinxStore(s => s.mediaBrowserTab);
  const setTab = useVinxStore(s => s.setMediaBrowserTab);

  return (
    <div style={panelStyle}>
      {/* Tab bar */}
      <div style={tabBarStyle}>
        {TABS.map(tab => (
          <div
            key={tab.key}
            style={tabStyle(activeTab === tab.key)}
            onClick={() => setTab(tab.key)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'media' && <MediaTab />}
        {activeTab === 'effects' && <EffectsTab />}
        {activeTab === 'transitions' && <TransitionsTab />}
        {activeTab === 'titles' && <TitlesTab />}
        {activeTab === 'audio' && <AudioTab />}
      </div>
    </div>
  );
});

MediaBrowser.displayName = 'MediaBrowser';
