/**
 * VIDEO - macOS TV Style Video Player
 * Clean video player with library
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Video {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  description: string;
  date: Date;
  category: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  play: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  pause: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
    </svg>
  ),
  fullscreen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
    </svg>
  ),
  volume: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
    </svg>
  ),
  back: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  ),
  forward: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
    </svg>
  ),
  backward: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="10" width="7" height="11" rx="1"/>
    </svg>
  ),
  recent: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  ),
  download: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA - Load from system
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { id: 'all', name: 'All Videos', icon: 'library' },
  { id: 'recent', name: 'Recently Watched', icon: 'recent' },
  { id: 'tutorials', name: 'Tutorials', icon: 'library' },
  { id: 'meetings', name: 'Meetings', icon: 'library' },
  { id: 'downloads', name: 'Downloaded', icon: 'download' },
];

// Load videos from system
const loadVideos = async (): Promise<Video[]> => {
  try {
    const electron = window.electron as Record<string, { getMediaFiles?: (type: string) => Promise<{ path?: string; name?: string; extension?: string; size?: number; modified?: string }[]> }>;
    if (electron?.media?.getMediaFiles) {
      const files = await electron.media.getMediaFiles('videos');
      if (files && files.length > 0) {
        return files.map((f, i: number) => ({
          id: f.path || String(i),
          title: f.name?.replace(/\.[^/.]+$/, '') || 'Video',
          duration: 0,
          thumbnail: '',
          description: '',
          date: new Date(f.modified || Date.now()),
          category: 'other',
        }));
      }
    }
  } catch { /* video scan failed */ }
  return [];
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const VideoApp: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('video');

  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(80);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

  // Sync play state to video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.play().catch(() => setIsPlaying(false));
    } else {
      v.pause();
    }
  }, [isPlaying]);

  // Sync volume
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100;
  }, [volume]);

  // Load videos on mount
  React.useEffect(() => {
    let mounted = true;
    loadVideos().then(v => { if (mounted) setVideos(v); });
    return () => { mounted = false; };
  }, []);

  const filteredVideos = useMemo(() => videos.filter(video => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'recent') return true; // Would filter by recently watched
    return video.category === selectedCategory;
  }), [videos, selectedCategory]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getThumbnailColor = (id: string): string => {
    const colors = ['#ff375f', '#ff9f0a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6'];
    return colors[parseInt(id) % colors.length];
  };

  const playVideo = (video: Video) => {
    setSelectedVideo(video);
    setIsPlaying(false);
    setProgress(0);
    setVideoCurrentTime(0);
    setVideoDuration(0);
  };

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    setVideoCurrentTime(v.currentTime);
    setVideoDuration(v.duration);
    setProgress((v.currentTime / v.duration) * 100);
  }, []);

  const handleSeek = useCallback((pct: number) => {
    setProgress(pct);
    if (videoRef.current && isFinite(videoRef.current.duration)) {
      videoRef.current.currentTime = (pct / 100) * videoRef.current.duration;
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = playerContainerRef.current || videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'library': return Icons.library;
      case 'recent': return Icons.recent;
      case 'download': return Icons.download;
      default: return Icons.library;
    }
  };

  // Player View
  if (selectedVideo) {
    // Build video src - the id is the file path from IPC
    const videoSrc = selectedVideo.id.startsWith('http') || selectedVideo.id.startsWith('file://') || selectedVideo.id.startsWith('blob:')
      ? selectedVideo.id
      : `file://${selectedVideo.id}`;

    return (
      <div style={styles.playerContainer} ref={playerContainerRef}>
        {/* Player Header */}
        <div style={styles.playerHeader}>
          <button style={styles.backBtn} onClick={() => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; } setSelectedVideo(null); }} aria-label="Back to library">
            {Icons.back}
            <span>Library</span>
          </button>
          <span style={styles.playerTitle}>{selectedVideo.title}</span>
        </div>

        {/* Video Player */}
        <div style={styles.videoPlayer}>
          <div style={styles.videoScreen} onClick={() => setIsPlaying(!isPlaying)}>
            <video
              ref={videoRef}
              src={videoSrc}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current && isFinite(videoRef.current.duration)) {
                  setVideoDuration(videoRef.current.duration);
                }
              }}
              onEnded={() => setIsPlaying(false)}
              onError={() => setIsPlaying(false)}
              playsInline
            />
            {!isPlaying && (
              <button
                style={{...styles.bigPlayBtn, position: 'absolute'}}
                onClick={(e) => { e.stopPropagation(); setIsPlaying(true); }}
                aria-label="Play"
              >
                {Icons.play}
              </button>
            )}
          </div>

          {/* Controls */}
          <div style={styles.playerControls}>
            <div style={styles.progressSection}>
              <span style={styles.timeLabel}>{formatDuration(Math.floor(videoCurrentTime))}</span>
              <div style={styles.progressBar}>
                <div style={{...styles.progressFill, width: `${progress}%`}} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => handleSeek(parseInt(e.target.value))}
                  style={styles.progressInput}
                />
              </div>
              <span style={styles.timeLabel}>{formatDuration(Math.floor(videoDuration))}</span>
            </div>

            <div style={styles.controlsRow}>
              <div style={styles.controlsLeft}>
                <button style={styles.controlBtn} aria-label="Rewind" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); } }}>{Icons.backward}</button>
                <button
                  style={styles.playPauseBtn}
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? Icons.pause : Icons.play}
                </button>
                <button style={styles.controlBtn} aria-label="Fast forward" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10); } }}>{Icons.forward}</button>
              </div>

              <div style={styles.controlsRight}>
                <div style={styles.volumeControl}>
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
                      aria-label="Volume"
                    />
                  </div>
                </div>
                <button style={styles.controlBtn} aria-label="Fullscreen" onClick={handleFullscreen}>{Icons.fullscreen}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Info */}
        <div style={styles.videoInfo}>
          <h2 style={styles.videoTitle}>{selectedVideo.title}</h2>
          <p style={styles.videoDescription}>{selectedVideo.description}</p>
          <span style={styles.videoMeta}>{formatDate(selectedVideo.date)} • {formatDuration(selectedVideo.duration)}</span>
        </div>
      </div>
    );
  }

  // Library View
  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>TV</span>
        </div>
        
        <div style={styles.categoryList}>
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              style={{
                ...styles.categoryItem,
                background: selectedCategory === category.id ? 'var(--color-accent-muted)' : 'transparent',
                color: selectedCategory === category.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              onClick={() => setSelectedCategory(category.id)}
              aria-label={category.name}
            >
              {getCategoryIcon(category.icon)}
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            {CATEGORIES.find(c => c.id === selectedCategory)?.name}
          </h1>
          <span style={styles.videoCount}>{filteredVideos.length} videos</span>
        </div>

        <div style={styles.videoGrid}>
          {filteredVideos.map(video => (
            <div
              key={video.id}
              style={styles.videoCard}
              onClick={() => playVideo(video)}
            >
              <div style={{...styles.thumbnail, background: getThumbnailColor(video.id)}}>
                <div style={styles.playOverlay}>
                  {Icons.play}
                </div>
                <span style={styles.duration}>{formatDuration(video.duration)}</span>
              </div>
              <div style={styles.cardInfo}>
                <h3 style={styles.cardTitle}>{video.title}</h3>
                <p style={styles.cardDescription}>{video.description}</p>
                <span style={styles.cardDate}>{formatDate(video.date)}</span>
              </div>
            </div>
          ))}
        </div>
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
  categoryList: {
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  categoryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  
  // Main
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  videoCount: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  
  // Video Grid
  videoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
  },
  videoCard: {
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'var(--color-bg-elevated)',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  thumbnail: {
    aspectRatio: '16/9',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-overlay)',
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  duration: {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'var(--color-bg-overlay)',
    fontSize: '12px',
  },
  cardInfo: {
    padding: '16px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  cardDescription: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    lineHeight: 1.4,
  },
  cardDate: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  
  // Player
  playerContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  playerHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 16px',
    background: 'var(--color-bg-base)',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  playerTitle: {
    fontSize: '14px',
    fontWeight: 500,
  },
  videoPlayer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  videoScreen: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPlayBtn: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerControls: {
    padding: '16px 24px',
    background: 'var(--color-bg-base)',
  },
  progressSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  timeLabel: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    width: '60px',
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
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  controlsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  playPauseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-base)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  volumeControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-text-secondary)',
  },
  volumeBar: {
    width: '80px',
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
  videoInfo: {
    padding: '20px 24px',
    background: 'var(--color-bg-base)',
    borderTop: '1px solid var(--color-border)',
  },
  videoTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  videoDescription: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    lineHeight: 1.5,
  },
  videoMeta: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
};

VideoApp.displayName = 'VideoApp';
export default memo(VideoApp);

