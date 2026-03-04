/**
 * DEX Media Player Components
 * Advanced audio/video player controls
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon } from '../utils/icons';

// ==================== TYPES ====================

interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration: number;
  src: string;
  cover?: string;
}

interface MediaPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  type?: 'audio' | 'video';
}

interface AudioPlayerProps {
  tracks: Track[];
  autoPlay?: boolean;
  onTrackChange?: (track: Track) => void;
}

interface PlaylistProps {
  tracks: Track[];
  currentTrackId?: string;
  onSelect: (track: Track) => void;
  onRemove?: (trackId: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

// ==================== MEDIA PLAYER ====================

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  src,
  poster,
  autoPlay = false,
  loop = false,
  muted = false,
  onEnded,
  onTimeUpdate,
  type = 'video',
}) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleTimeUpdate = () => {
      setCurrentTime(media.currentTime);
      onTimeUpdate?.(media.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(media.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('ended', handleEnded);

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onEnded]);

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = time;
  }, []);

  const handleVolumeChange = useCallback((value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = value;
    setVolume(value);
    setIsMuted(value === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
      background: '#000',
      borderRadius: 8,
      overflow: 'hidden',
    },
    media: {
      width: '100%',
      display: 'block',
    },
    controls: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
      opacity: showControls ? 1 : 0,
      transition: 'opacity 0.3s ease',
    },
    progressBar: {
      width: '100%',
      height: 4,
      background: 'rgba(255,255,255,0.3)',
      borderRadius: 2,
      cursor: 'pointer',
      marginBottom: 12,
    },
    progressFill: {
      height: '100%',
      background: 'var(--color-accent)',
      borderRadius: 2,
      transition: 'width 0.1s linear',
    },
    controlRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    leftControls: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    rightControls: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    button: {
      background: 'none',
      border: 'none',
      color: 'white',
      cursor: 'pointer',
      padding: 4,
      fontSize: 20,
    },
    time: {
      color: 'white',
      fontSize: 13,
    },
    volumeSlider: {
      width: 80,
      height: 4,
      background: 'rgba(255,255,255,0.3)',
      borderRadius: 2,
      cursor: 'pointer',
    },
    speedMenu: {
      position: 'relative',
    },
  };

  const MediaElement = type === 'video' ? 'video' : 'audio';

  return (
    <div
      ref={containerRef}
      style={styles.container as any}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <MediaElement
        ref={mediaRef as any}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        style={styles.media}
        onClick={togglePlay}
      />
      <div style={styles.controls as any}>
        <div
          style={styles.progressBar}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            seek(percent * duration);
          }}
        >
          <div
            style={{
              ...styles.progressFill,
              width: `${(currentTime / duration) * 100}%`,
            }}
          />
        </div>
        <div style={styles.controlRow}>
          <div style={styles.leftControls}>
            <button style={styles.button} onClick={togglePlay}>
              {isPlaying ? 'pause' : <PlayIcon size={16} />}
            </button>
            <button style={styles.button} onClick={() => seek(currentTime - 10)}>
              rewind
            </button>
            <button style={styles.button} onClick={() => seek(currentTime + 10)}>
              fast-forward
            </button>
            <span style={styles.time}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div style={styles.rightControls}>
            <button style={styles.button} onClick={toggleMute}>
              {isMuted ? 'volume-x' : volume > 0.5 ? 'volume-2' : 'volume-1'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              style={{ width: 80 }}
            />
            <select
              value={playbackRate}
              onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
              style={{
                background: 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            {type === 'video' && (
              <button style={styles.button} onClick={toggleFullscreen}>
                {isFullscreen ? '⊙' : 'maximize'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== AUDIO PLAYER ====================

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  tracks,
  autoPlay = false,
  onTrackChange,
}) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'none' | 'one' | 'all'>('none');
  const audioRef = useRef<HTMLAudioElement>(null);

  const currentTrack = tracks[currentTrackIndex];

  useEffect(() => {
    if (currentTrack) {
      onTrackChange?.(currentTrack);
    }
  }, [currentTrackIndex, currentTrack, onTrackChange]);

  const playTrack = useCallback((index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
    setTimeout(() => {
      audioRef.current?.play();
    }, 0);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const nextTrack = useCallback(() => {
    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      playTrack(randomIndex);
    } else if (currentTrackIndex < tracks.length - 1) {
      playTrack(currentTrackIndex + 1);
    } else if (repeat === 'all') {
      playTrack(0);
    }
  }, [shuffle, currentTrackIndex, tracks.length, repeat, playTrack]);

  const prevTrack = useCallback(() => {
    if (currentTime > 3) {
      audioRef.current!.currentTime = 0;
    } else if (currentTrackIndex > 0) {
      playTrack(currentTrackIndex - 1);
    } else if (repeat === 'all') {
      playTrack(tracks.length - 1);
    }
  }, [currentTime, currentTrackIndex, tracks.length, repeat, playTrack]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      audioRef.current!.currentTime = 0;
      audioRef.current!.play();
    } else {
      nextTrack();
    }
  }, [repeat, nextTrack]);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 400,
    },
    cover: {
      width: '100%',
      aspectRatio: '1',
      borderRadius: 8,
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 64,
      marginBottom: 24,
      overflow: 'hidden',
    },
    info: {
      textAlign: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    artist: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginTop: 4,
    },
    progressContainer: {
      marginBottom: 16,
    },
    progressBar: {
      width: '100%',
      height: 4,
      background: 'var(--color-border)',
      borderRadius: 2,
      cursor: 'pointer',
      marginBottom: 8,
    },
    progressFill: {
      height: '100%',
      background: 'var(--color-accent)',
      borderRadius: 2,
    },
    timeRow: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    controlButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 8,
      fontSize: 24,
      color: 'var(--color-text)',
    },
    playButton: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      color: 'white',
    },
    secondaryControls: {
      display: 'flex',
      justifyContent: 'center',
      gap: 24,
      marginTop: 16,
    },
  };

  if (!currentTrack) {
    return <div>No tracks available</div>;
  }

  return (
    <div style={styles.container}>
      <audio
        ref={audioRef}
        src={currentTrack.src}
        autoPlay={autoPlay}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleEnded}
      />
      <div style={styles.cover as any}>
        {currentTrack.cover ? (
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          'music'
        )}
      </div>
      <div style={styles.info as any}>
        <h3 style={styles.title}>{currentTrack.title}</h3>
        {currentTrack.artist && <p style={styles.artist}>{currentTrack.artist}</p>}
      </div>
      <div style={styles.progressContainer}>
        <div
          style={styles.progressBar}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) {
              audioRef.current.currentTime = percent * duration;
            }
          }}
        >
          <div
            style={{
              ...styles.progressFill,
              width: `${(currentTime / duration) * 100}%`,
            }}
          />
        </div>
        <div style={styles.timeRow}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div style={styles.controls}>
        <button style={styles.controlButton} onClick={prevTrack}>
          skip-back
        </button>
        <button style={styles.playButton} onClick={togglePlay}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button style={styles.controlButton} onClick={nextTrack}>
          skip-forward
        </button>
      </div>
      <div style={styles.secondaryControls}>
        <button
          style={{
            ...styles.controlButton,
            fontSize: 18,
            color: shuffle ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
          onClick={() => setShuffle(!shuffle)}
        >
          shuffle
        </button>
        <button
          style={{
            ...styles.controlButton,
            fontSize: 18,
            color: repeat !== 'none' ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
          onClick={() => {
            const modes: ('none' | 'one' | 'all')[] = ['none', 'all', 'one'];
            const currentIndex = modes.indexOf(repeat);
            setRepeat(modes[(currentIndex + 1) % modes.length]);
          }}
        >
          {repeat === 'one' ? 'repeat' : 'repeat'}
        </button>
      </div>
    </div>
  );
};

// ==================== PLAYLIST ====================

export const Playlist: React.FC<PlaylistProps> = ({
  tracks,
  currentTrackId,
  onSelect,
  onRemove,
  onReorder,
}) => {
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      overflow: 'hidden',
    },
    header: {
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border)',
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    list: {
      maxHeight: 400,
      overflow: 'auto',
    },
    track: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      gap: 12,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    },
    cover: {
      width: 48,
      height: 48,
      borderRadius: 4,
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    artist: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    duration: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
    removeBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      padding: 4,
      opacity: 0,
      transition: 'opacity 0.15s ease',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Playlist ({tracks.length} tracks)
      </div>
      <div style={styles.list}>
        {tracks.map((track, index) => (
          <div
            key={track.id}
            style={{
              ...styles.track,
              background: track.id === currentTrackId
                ? 'var(--color-accent-light)'
                : 'transparent',
            }}
            onClick={() => onSelect(track)}
          >
            <div style={styles.cover}>
              {track.cover ? (
                <img
                  src={track.cover}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                />
              ) : (
                'music'
              )}
            </div>
            <div style={styles.info}>
              <div style={{
                ...styles.title,
                color: track.id === currentTrackId ? 'var(--color-accent)' : 'var(--color-text)',
              }}>
                {track.id === currentTrackId && <><PlayIcon size={12} /> </>}
                {track.title}
              </div>
              {track.artist && <div style={styles.artist}>{track.artist}</div>}
            </div>
            <div style={styles.duration}>{formatDuration(track.duration)}</div>
            {onRemove && (
              <button
                style={styles.removeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(track.id);
                }}
              >
                trash
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== MINI PLAYER ====================

interface MiniPlayerProps {
  track?: Track;
  isPlaying: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onExpand?: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  currentTime,
  onPlayPause,
  onNext,
  onPrev,
  onExpand,
}) => {
  if (!track) return null;

  const progress = track.duration > 0 ? (currentTime / track.duration) * 100 : 0;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      background: 'var(--color-bg-secondary)',
      borderTop: '1px solid var(--color-border)',
    },
    cover: {
      width: 40,
      height: 40,
      borderRadius: 4,
      background: 'var(--color-bg-tertiary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    progress: {
      width: '100%',
      height: 2,
      background: 'var(--color-border)',
      borderRadius: 1,
      marginTop: 4,
    },
    progressFill: {
      height: '100%',
      background: 'var(--color-accent)',
      borderRadius: 1,
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    button: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      fontSize: 18,
      color: 'var(--color-text)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.cover} onClick={onExpand}>
        {track.cover ? (
          <img src={track.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          'music'
        )}
      </div>
      <div style={styles.info}>
        <div style={styles.title}>{track.title}</div>
        <div style={styles.progress}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      </div>
      <div style={styles.controls}>
        {onPrev && (
          <button style={styles.button} onClick={onPrev}><SkipBackIcon size={16} /></button>
        )}
        <button style={styles.button} onClick={onPlayPause}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        {onNext && (
          <button style={styles.button} onClick={onNext}><SkipForwardIcon size={16} /></button>
        )}
      </div>
    </div>
  );
};

export default MediaPlayer;
