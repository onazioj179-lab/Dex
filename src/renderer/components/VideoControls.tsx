/**
 * DEX Video Controls
 * Custom video player controls and utilities
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayIcon, PauseIcon } from '../utils/icons';

// ==================== TYPES ====================

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate?: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
  onPlayPause?: (playing: boolean) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  showTimestamps?: boolean;
  showVolume?: boolean;
  showPlaybackSpeed?: boolean;
  showFullscreen?: boolean;
  showPictureInPicture?: boolean;
  compact?: boolean;
}

interface TimelineProps {
  currentTime: number;
  duration: number;
  buffered?: TimeRanges;
  chapters?: VideoChapter[];
  onSeek: (time: number) => void;
  onPreview?: (time: number | null) => void;
}

interface VideoChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
}

// ==================== VIDEO CONTROLS ====================

export const VideoControls: React.FC<VideoControlsProps> = ({
  videoRef,
  onTimeUpdate,
  onVolumeChange,
  onPlayPause,
  onFullscreenChange,
  showTimestamps = true,
  showVolume = true,
  showPlaybackSpeed = true,
  showFullscreen = true,
  showPictureInPicture = true,
  compact = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [buffered, setBuffered] = useState<TimeRanges | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const video = videoRef.current;

  // Video event listeners
  useEffect(() => {
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setBuffered(video.buffered);
      onTimeUpdate?.(video.currentTime);
    };

    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => {
      setIsPlaying(true);
      onPlayPause?.(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPlayPause?.(false);
    };
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
      onVolumeChange?.(video.volume);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [video, onTimeUpdate, onVolumeChange, onPlayPause]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      onFullscreenChange?.(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [onFullscreenChange]);

  const togglePlay = useCallback(() => {
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, [video]);

  const seek = useCallback((time: number) => {
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
  }, [video, duration]);

  const skipBack = useCallback(() => seek(currentTime - 10), [currentTime, seek]);
  const skipForward = useCallback(() => seek(currentTime + 10), [currentTime, seek]);

  const handleVolumeSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    video.muted = newVolume === 0;
  }, [video]);

  const toggleMute = useCallback(() => {
    if (!video) return;
    video.muted = !video.muted;
  }, [video]);

  const handleSpeedChange = useCallback((speed: number) => {
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, [video]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current?.parentElement;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }, [video]);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 4 : 8,
      padding: compact ? '8px 12px' : '12px 16px',
      background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
      borderRadius: compact ? 6 : 8,
    },
    timeline: {
      width: '100%',
      height: compact ? 4 : 6,
      background: 'rgba(255,255,255,0.2)',
      borderRadius: 3,
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
    },
    buffered: {
      position: 'absolute',
      height: '100%',
      background: 'rgba(255,255,255,0.3)',
      borderRadius: 3,
    },
    progress: {
      position: 'absolute',
      height: '100%',
      background: 'var(--color-accent)',
      borderRadius: 3,
      transition: 'width 0.1s linear',
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 8 : 12,
    },
    leftControls: {
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 4 : 8,
    },
    rightControls: {
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 4 : 8,
      marginLeft: 'auto',
    },
    button: {
      background: 'transparent',
      border: 'none',
      color: 'white',
      cursor: 'pointer',
      padding: compact ? 4 : 8,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.15s',
    },
    time: {
      color: 'white',
      fontSize: compact ? 11 : 13,
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    },
    volumeContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    volumeSlider: {
      width: 60,
      height: 4,
      appearance: 'none' as const,
      background: 'rgba(255,255,255,0.3)',
      borderRadius: 2,
      cursor: 'pointer',
    },
    speedMenu: {
      position: 'absolute',
      bottom: '100%',
      right: 0,
      marginBottom: 8,
      background: 'rgba(0,0,0,0.9)',
      borderRadius: 6,
      padding: 4,
      display: showSpeedMenu ? 'block' : 'none',
      zIndex: 10,
    },
    speedOption: {
      display: 'block',
      width: '100%',
      padding: '6px 16px',
      background: 'transparent',
      border: 'none',
      color: 'white',
      fontSize: 13,
      cursor: 'pointer',
      textAlign: 'left' as const,
      borderRadius: 4,
    },
    speedWrapper: {
      position: 'relative' as const,
    },
  };

  const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
    const icons: Record<string, React.ReactNode> = {
      play: <PlayIcon size={size} />,
      pause: <PauseIcon size={size} />,
      skipBack: 'rewind',
      skipForward: 'fast-forward',
      volumeHigh: 'volume-2',
      volumeLow: 'volume-1',
      volumeMute: 'volume-x',
      fullscreen: 'maximize',
      exitFullscreen: 'maximize',
      pip: '⧉',
      speed: 'zap',
    };
    return <span style={{ fontSize: size }}>{icons[name] || '?'}</span>;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getBufferedPercent = () => {
    if (!buffered || buffered.length === 0) return 0;
    const end = buffered.end(buffered.length - 1);
    return (end / duration) * 100;
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Timeline */}
      <div style={styles.timeline} onClick={handleTimelineClick}>
        <div style={{ ...styles.buffered, width: `${getBufferedPercent()}%` }} />
        <div style={{ ...styles.progress, width: `${progressPercent}%` }} />
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.leftControls}>
          <button
            style={styles.button}
            onClick={skipBack}
            title="Skip back 10s"
          >
            <Icon name="skipBack" />
          </button>

          <button
            style={styles.button}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={24} />
          </button>

          <button
            style={styles.button}
            onClick={skipForward}
            title="Skip forward 10s"
          >
            <Icon name="skipForward" />
          </button>

          {showTimestamps && (
            <span style={styles.time}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
        </div>

        <div style={styles.rightControls}>
          {showVolume && (
            <div style={styles.volumeContainer}>
              <button style={styles.button} onClick={toggleMute}>
                <Icon name={isMuted || volume === 0 ? 'volumeMute' : volume < 0.5 ? 'volumeLow' : 'volumeHigh'} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeSlider}
                style={styles.volumeSlider}
              />
            </div>
          )}

          {showPlaybackSpeed && (
            <div style={styles.speedWrapper}>
              <button
                style={styles.button}
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                title="Playback speed"
              >
                {playbackSpeed}x
              </button>
              <div style={styles.speedMenu}>
                {playbackSpeeds.map(speed => (
                  <button
                    key={speed}
                    style={{
                      ...styles.speedOption,
                      background: speed === playbackSpeed ? 'rgba(255,255,255,0.1)' : 'transparent',
                    }}
                    onClick={() => handleSpeedChange(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {showPictureInPicture && (
            <button
              style={styles.button}
              onClick={togglePictureInPicture}
              title="Picture in Picture"
            >
              <Icon name="pip" />
            </button>
          )}

          {showFullscreen && (
            <button
              style={styles.button}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Icon name={isFullscreen ? 'exitFullscreen' : 'fullscreen'} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== VIDEO TIMELINE WITH CHAPTERS ====================

export const VideoTimeline: React.FC<TimelineProps> = ({
  currentTime,
  duration,
  buffered,
  chapters = [],
  onSeek,
  onPreview,
}) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    setHoverTime(time);
    setHoverPosition(e.clientX - rect.left);
    onPreview?.(time);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    onPreview?.(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getChapterAt = (time: number): VideoChapter | undefined => {
    return chapters.find(c => time >= c.startTime && time < c.endTime);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
      padding: '16px 0',
    },
    timeline: {
      position: 'relative',
      height: 8,
      background: 'rgba(255,255,255,0.2)',
      borderRadius: 4,
      cursor: 'pointer',
      overflow: 'visible',
    },
    buffered: {
      position: 'absolute',
      height: '100%',
      background: 'rgba(255,255,255,0.3)',
      borderRadius: 4,
    },
    progress: {
      position: 'absolute',
      height: '100%',
      background: 'var(--color-accent)',
      borderRadius: 4,
    },
    handle: {
      position: 'absolute',
      top: '50%',
      width: 16,
      height: 16,
      background: 'white',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    },
    preview: {
      position: 'absolute',
      bottom: '100%',
      marginBottom: 8,
      background: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '4px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontFamily: 'monospace',
      transform: 'translateX(-50%)',
      whiteSpace: 'nowrap',
    },
    chapters: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '100%',
      pointerEvents: 'none',
    },
    chapterMark: {
      position: 'absolute',
      top: 0,
      width: 2,
      height: '100%',
      background: 'rgba(255,255,255,0.5)',
    },
  };

  const getBufferedPercent = () => {
    if (!buffered || buffered.length === 0) return 0;
    const end = buffered.end(buffered.length - 1);
    return (end / duration) * 100;
  };

  const hoverChapter = hoverTime !== null ? getChapterAt(hoverTime) : null;

  return (
    <div style={styles.container}>
      <div
        ref={timelineRef}
        style={styles.timeline}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Buffered */}
        <div style={{ ...styles.buffered, width: `${getBufferedPercent()}%` }} />

        {/* Progress */}
        <div style={{ ...styles.progress, width: `${progressPercent}%` }} />

        {/* Chapter marks */}
        {chapters.length > 0 && (
          <div style={styles.chapters}>
            {chapters.map(chapter => (
              <div
                key={chapter.id}
                style={{
                  ...styles.chapterMark,
                  left: `${(chapter.startTime / duration) * 100}%`,
                }}
                title={chapter.title}
              />
            ))}
          </div>
        )}

        {/* Handle */}
        <div style={{ ...styles.handle, left: `${progressPercent}%` }} />

        {/* Preview tooltip */}
        {hoverTime !== null && (
          <div style={{ ...styles.preview, left: hoverPosition }}>
            {formatTime(hoverTime)}
            {hoverChapter && ` - ${hoverChapter.title}`}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== HOOK: useVideoPlayer ====================

export const useVideoPlayer = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const [state, setState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackSpeed: 1,
    isFullscreen: false,
    isLoading: true,
    hasError: false,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlers = {
      play: () => setState(s => ({ ...s, isPlaying: true })),
      pause: () => setState(s => ({ ...s, isPlaying: false })),
      timeupdate: () => setState(s => ({ ...s, currentTime: video.currentTime })),
      durationchange: () => setState(s => ({ ...s, duration: video.duration })),
      volumechange: () => setState(s => ({ ...s, volume: video.volume, isMuted: video.muted })),
      ratechange: () => setState(s => ({ ...s, playbackSpeed: video.playbackRate })),
      loadstart: () => setState(s => ({ ...s, isLoading: true })),
      canplay: () => setState(s => ({ ...s, isLoading: false })),
      error: () => setState(s => ({ ...s, hasError: true, isLoading: false })),
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      video.addEventListener(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        video.removeEventListener(event, handler);
      });
    };
  }, [videoRef]);

  const play = useCallback(() => videoRef.current?.play(), [videoRef]);
  const pause = useCallback(() => videoRef.current?.pause(), [videoRef]);
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, [videoRef]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = time;
  }, [videoRef]);

  const setVolume = useCallback((vol: number) => {
    const video = videoRef.current;
    if (video) video.volume = Math.max(0, Math.min(1, vol));
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, [videoRef]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [videoRef]);

  return {
    ...state,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackSpeed,
  };
};

export default VideoControls;
