/**
 * AUDIO - macOS Music Style Audio Player
 * Clean audio player with playlist
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  pause: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
    </svg>
  ),
  skipBack: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
    </svg>
  ),
  skipForward: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
    </svg>
  ),
  shuffle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
    </svg>
  ),
  repeat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 014-4h14"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  ),
  volume: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
    </svg>
  ),
  music: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  list: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  heart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ),
  heartFilled: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ff375f">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA - Load from system
// ===============================================================================

const DEFAULT_PLAYLISTS: Playlist[] = [
  { id: 'all', name: 'All Songs', tracks: 0 },
  { id: 'favorites', name: 'Favorites', tracks: 0 },
  { id: 'recent', name: 'Recently Added', tracks: 0 },
];

// Load tracks from real file system with timeout
const loadTracks = async (): Promise<Track[]> => {
  try {
    if (window.electron?.invoke) {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const filesPromise = window.electron?.invoke('media:getMediaFiles', 'music');
      const files = await Promise.race([filesPromise, timeoutPromise]);
      
      if (files && Array.isArray(files) && files.length > 0) {
        return files.slice(0, 100).map((f: { path?: string; name?: string; extension?: string; size?: number; modified?: string }, i: number) => ({
          id: f.path || String(i),
          title: f.name?.replace(/\.[^/.]+$/, '') || 'Unknown',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          artwork: '',
        }));
      }
    }
  } catch (err) {
    console.warn('Failed to load audio files from system:', err);
  }
  return [];
};

// Load/save favorites - persist to backend
const loadFavorites = async (): Promise<string[]> => {
  try {
    if (window.electron?.invoke) {
      const result = await window.electron?.invoke('capability:storage:get', 'dex-audio-favorites');
      if (result) return JSON.parse(result);
    }
  } catch { /* storage unavailable */ }
  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('dex-audio-favorites');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

const saveFavorites = async (favs: string[]) => {
  const data = JSON.stringify(favs);
  localStorage.setItem('dex-audio-favorites', data);
  try {
    await window.electron?.invoke?.('capability:storage:set', 'dex-audio-favorites', data);
  } catch { /* backend save failed silently */ }
};

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Audio: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('audio');

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(75);
  const [selectedPlaylist, setSelectedPlaylist] = useState('all');
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem('dex-audio-playlists');
      if (saved) return [...DEFAULT_PLAYLISTS, ...JSON.parse(saved)];
    } catch { /* ignore */ }
    return [...DEFAULT_PLAYLISTS];
  });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persist custom playlists
  useEffect(() => {
    const custom = playlists.filter(p => !DEFAULT_PLAYLISTS.some(d => d.id === p.id));
    localStorage.setItem('dex-audio-playlists', JSON.stringify(custom));
  }, [playlists]);

  const createPlaylist = useCallback(() => {
    const name = window.prompt('Playlist name:');
    if (!name?.trim()) return;
    const newPlaylist: Playlist = {
      id: `playlist-${Date.now()}`,
      name: name.trim(),
      tracks: 0,
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    setSelectedPlaylist(newPlaylist.id);
  }, []);

  // Create audio element once
  useEffect(() => {
    const audio = new window.Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      // Only reset UI -- repeat/shuffle/next handled by separate effect
    };
    const onError = () => {
      console.warn('[Audio] Playback error');
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Computed filtered tracks (must be before callbacks that reference it)
  const filteredTracks = useMemo(() => tracks.filter(track => {
    if (selectedPlaylist === 'favorites') {
      return favorites.includes(track.id);
    }
    return true;
  }), [tracks, selectedPlaylist, favorites]);

  // Handle ended arrow-right next track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => {
      if (repeat) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        setProgress(0);
        skipToNext();
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [repeat, shuffle, currentTrack, filteredTracks]);

  // Load tracks and favorites on mount - fast with timeout
  React.useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      // Quick load - don't block UI
      try {
        const loadedFavs = await loadFavorites();
        if (mounted) setFavorites(loadedFavs);
      } catch { /* favorites load failed */ }
      
      // Load tracks in background with timeout
      setIsLoading(true);
      try {
        const loadedTracks = await loadTracks();
        if (mounted) {
          setTracks(loadedTracks);
          if (loadedTracks.length > 0) setCurrentTrack(loadedTracks[0]);
        }
      } catch { /* tracks load failed */ }
      if (mounted) setIsLoading(false);
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  // Save favorites
  React.useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const playTrack = useCallback((track: Track) => {
    setCurrentTrack(track);
    setProgress(0);
    setCurrentTime(0);
    if (audioRef.current && track.id) {
      // track.id is the file path from IPC
      const src = track.id.startsWith('http') || track.id.startsWith('file://') || track.id.startsWith('blob:')
        ? track.id
        : `file://${track.id}`;
      audioRef.current.src = src;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // File might not be accessible, still show as selected
        setIsPlaying(false);
      });
    } else {
      setIsPlaying(true);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, currentTrack]);

  const seekTo = useCallback((pct: number) => {
    setProgress(pct);
    if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
      audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
    }
  }, []);

  const skipToNext = useCallback(() => {
    if (filteredTracks.length === 0) return;
    const idx = currentTrack ? filteredTracks.findIndex(t => t.id === currentTrack.id) : -1;
    let nextIdx: number;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * filteredTracks.length);
    } else {
      nextIdx = idx < filteredTracks.length - 1 ? idx + 1 : 0;
    }
    playTrack(filteredTracks[nextIdx]);
  }, [currentTrack, filteredTracks, shuffle, playTrack]);

  const skipToPrev = useCallback(() => {
    if (filteredTracks.length === 0) return;
    // If >3s in, restart current track
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const idx = currentTrack ? filteredTracks.findIndex(t => t.id === currentTrack.id) : 0;
    const prevIdx = idx > 0 ? idx - 1 : filteredTracks.length - 1;
    playTrack(filteredTracks[prevIdx]);
  }, [currentTrack, filteredTracks, playTrack]);

  const getArtworkColor = (id: string): string => {
    const colors = ['#ff375f', '#ff9f0a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff453a'];
    return colors[parseInt(id) % colors.length];
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Music</span>
        </div>
        
        <div style={styles.playlistList}>
          <div style={styles.sectionLabel}>Library</div>
          {playlists.slice(0, 3).map(playlist => (
            <button
              key={playlist.id}
              style={{
                ...styles.playlistItem,
                background: selectedPlaylist === playlist.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedPlaylist === playlist.id ? '#0a84ff' : 'rgba(255,255,255,0.85)',
              }}
              onClick={() => setSelectedPlaylist(playlist.id)}
              aria-label={playlist.name}
            >
              {playlist.id === 'favorites' ? Icons.heartFilled : Icons.music}
              <span style={{ flex: 1 }}>{playlist.name}</span>
              <span style={styles.playlistCount}>{playlist.tracks}</span>
            </button>
          ))}
          
          <div style={styles.sectionLabel}>Playlists</div>
          {playlists.slice(3).map(playlist => (
            <button
              key={playlist.id}
              style={{
                ...styles.playlistItem,
                background: selectedPlaylist === playlist.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedPlaylist === playlist.id ? '#0a84ff' : 'rgba(255,255,255,0.85)',
              }}
              onClick={() => setSelectedPlaylist(playlist.id)}
              aria-label={playlist.name}
            >
              {Icons.list}
              <span style={{ flex: 1 }}>{playlist.name}</span>
              <span style={styles.playlistCount}>{playlist.tracks}</span>
            </button>
          ))}
          
          <button style={styles.newPlaylistBtn} onClick={createPlaylist} aria-label="New Playlist">
            {Icons.plus}
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Track List */}
        <div style={styles.trackList}>
          <div style={styles.trackListHeader}>
            <h2 style={styles.playlistTitle}>
              {playlists.find(p => p.id === selectedPlaylist)?.name ?? 'All Songs'}
            </h2>
            <span style={styles.trackCount}>{filteredTracks.length} songs</span>
          </div>
          
          <div style={styles.tracks}>
            {isLoading ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>{Icons.music}</div>
                <div style={styles.emptyTitle}>Loading music...</div>
              </div>
            ) : filteredTracks.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>{Icons.music}</div>
                <div style={styles.emptyTitle}>No music found</div>
                <div style={styles.emptySubtitle}>
                  {selectedPlaylist === 'favorites' 
                    ? 'Add songs to favorites to see them here'
                    : 'Add audio files to your Music folder'}
                </div>
              </div>
            ) : filteredTracks.map((track, index) => (
              <div
                key={track.id}
                style={{
                  ...styles.trackItem,
                  background: currentTrack?.id === track.id ? 'rgba(10, 132, 255, 0.1)' : 'transparent',
                }}
                onClick={() => playTrack(track)}
              >
                <span style={styles.trackNumber}>{index + 1}</span>
                <div style={{...styles.trackArtwork, background: getArtworkColor(track.id)}}>
                  {currentTrack?.id === track.id && isPlaying && (
                    <span style={styles.nowPlayingIcon}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </span>
                  )}
                </div>
                <div style={styles.trackInfo}>
                  <span style={{
                    ...styles.trackTitle,
                    color: currentTrack?.id === track.id ? '#0a84ff' : 'rgba(255,255,255,0.95)',
                  }}>
                    {track.title}
                  </span>
                  <span style={styles.trackArtist}>{track.artist}</span>
                </div>
                <span style={styles.trackAlbum}>{track.album}</span>
                <button
                  style={styles.favBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(track.id);
                  }}
                  aria-label={favorites.includes(track.id) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {favorites.includes(track.id) ? Icons.heartFilled : Icons.heart}
                </button>
                <span style={styles.trackDuration}>{formatTime(track.duration)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Now Playing Bar */}
        {currentTrack && (
        <div style={styles.nowPlaying}>
          <div style={styles.nowPlayingLeft}>
            <div style={{...styles.nowPlayingArtwork, background: getArtworkColor(currentTrack.id)}} />
            <div style={styles.nowPlayingInfo}>
              <span style={styles.nowPlayingTitle}>{currentTrack.title}</span>
              <span style={styles.nowPlayingArtist}>{currentTrack.artist}</span>
            </div>
            <button
              style={{...styles.controlBtn, color: favorites.includes(currentTrack.id) ? '#ff375f' : 'rgba(255,255,255,0.5)'}}
              onClick={() => toggleFavorite(currentTrack.id)}
              aria-label={favorites.includes(currentTrack.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorites.includes(currentTrack.id) ? Icons.heartFilled : Icons.heart}
            </button>
          </div>
          
          <div style={styles.nowPlayingCenter}>
            <div style={styles.controls}>
              <button
                style={{...styles.controlBtn, color: shuffle ? '#0a84ff' : 'rgba(255,255,255,0.5)'}}
                onClick={() => setShuffle(!shuffle)}
                aria-label="Shuffle"
              >
                {Icons.shuffle}
              </button>
              <button style={styles.controlBtn} onClick={skipToPrev} aria-label="Previous track">{Icons.skipBack}</button>
              <button
                style={styles.playBtn}
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? Icons.pause : Icons.play}
              </button>
              <button style={styles.controlBtn} onClick={skipToNext} aria-label="Next track">{Icons.skipForward}</button>
              <button
                style={{...styles.controlBtn, color: repeat ? '#0a84ff' : 'rgba(255,255,255,0.5)'}}
                onClick={() => setRepeat(!repeat)}
                aria-label="Repeat"
              >
                {Icons.repeat}
              </button>
            </div>
            
            <div style={styles.progressSection}>
              <span style={styles.progressTime}>{formatTime(Math.floor(currentTime))}</span>
              <div style={styles.progressBar}>
                <div style={{...styles.progressFill, width: `${progress}%`}} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => seekTo(parseInt(e.target.value))}
                  style={styles.progressInput}
                />
              </div>
              <span style={styles.progressTime}>{formatTime(Math.floor(duration || currentTrack.duration))}</span>
            </div>
          </div>
          
          <div style={styles.nowPlayingRight}>
            {Icons.volume}
            <div style={styles.volumeBar}>
              <div style={{...styles.volumeFill, width: `${volume}%`}} />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                style={styles.volumeInput}
              />
            </div>
          </div>
        </div>
        )}
      </div>
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
    width: '220px',
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
  playlistList: {
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
  playlistItem: {
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
  playlistCount: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  newPlaylistBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    marginTop: '8px',
    transition: 'all 0.15s ease',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  
  // Track List
  trackList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  trackListHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  playlistTitle: {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  trackCount: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  tracks: {
    flex: 1,
    overflow: 'auto',
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
  trackItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 24px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
    transition: 'all 0.15s ease',
  },
  trackNumber: {
    width: '24px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  trackArtwork: {
    width: '40px',
    height: '40px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingIcon: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '2px',
  },
  trackArtist: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  trackAlbum: {
    width: '180px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  favBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  },
  trackDuration: {
    width: '50px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'right',
  },
  
  // Now Playing
  nowPlaying: {
    height: '90px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '20px',
    background: 'var(--color-bg-secondary)',
    borderTop: '1px solid var(--color-border)',
  },
  nowPlayingLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '250px',
  },
  nowPlayingArtwork: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
  },
  nowPlayingInfo: {
    flex: 1,
    minWidth: 0,
  },
  nowPlayingTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '2px',
  },
  nowPlayingArtist: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  nowPlayingCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  playBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-base)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  progressSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    maxWidth: '500px',
  },
  progressTime: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    width: '40px',
  },
  progressBar: {
    flex: 1,
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-text-primary)',
    borderRadius: '2px',
  },
  progressInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
  nowPlayingRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '150px',
    color: 'var(--color-text-muted)',
  },
  volumeBar: {
    flex: 1,
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    position: 'relative',
  },
  volumeFill: {
    height: '100%',
    background: 'var(--color-text-secondary)',
    borderRadius: '2px',
  },
  volumeInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
};

Audio.displayName = 'Audio';
export default memo(Audio);

