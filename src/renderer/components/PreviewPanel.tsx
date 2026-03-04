/**
 * DEX Preview Panel
 * Universal preview component for video/image/audio
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';

// ==================== TYPES ====================
export interface PreviewState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  loop: boolean;
  zoom: number;
}

export interface PreviewSettings {
  showTimecode: boolean;
  showSafeAreas: boolean;
  showGrid: boolean;
  showRulers: boolean;
  fitMode: 'fit' | 'fill' | 'actual';
  backgroundColor: string;
}

// ==================== CONSTANTS ====================
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const DEFAULT_PREVIEW_STATE: PreviewState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  loop: false,
  zoom: 1,
};

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  showTimecode: true,
  showSafeAreas: false,
  showGrid: false,
  showRulers: false,
  fitMode: 'fit',
  backgroundColor: '#000000',
};

// ==================== UTILITIES ====================
export const formatTimecode = (seconds: number, fps: number = 30): string => {
  if (!seconds || !isFinite(seconds)) return '00:00:00:00';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);
  
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
    f.toString().padStart(2, '0'),
  ].join(':');
};

export const parseTimecode = (timecode: string, fps: number = 30): number => {
  const parts = timecode.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts;
  return h * 3600 + m * 60 + s + f / fps;
};

// ==================== HOOKS ====================
export const usePreview = () => {
  const [state, setState] = useState<PreviewState>(DEFAULT_PREVIEW_STATE);
  const [settings, setSettings] = useState<PreviewSettings>(DEFAULT_PREVIEW_SETTINGS);
  
  const play = useCallback(() => {
    setState(s => ({ ...s, isPlaying: true }));
  }, []);
  
  const pause = useCallback(() => {
    setState(s => ({ ...s, isPlaying: false }));
  }, []);
  
  const togglePlay = useCallback(() => {
    setState(s => ({ ...s, isPlaying: !s.isPlaying }));
  }, []);
  
  const seek = useCallback((time: number) => {
    setState(s => ({ 
      ...s, 
      currentTime: Math.max(0, Math.min(time, s.duration)) 
    }));
  }, []);
  
  const setVolume = useCallback((volume: number) => {
    setState(s => ({ ...s, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);
  
  const toggleMute = useCallback(() => {
    setState(s => ({ ...s, isMuted: !s.isMuted }));
  }, []);
  
  const setPlaybackRate = useCallback((rate: number) => {
    setState(s => ({ ...s, playbackRate: rate }));
  }, []);
  
  const toggleLoop = useCallback(() => {
    setState(s => ({ ...s, loop: !s.loop }));
  }, []);
  
  const setZoom = useCallback((zoom: number) => {
    setState(s => ({ ...s, zoom: Math.max(0.1, Math.min(4, zoom)) }));
  }, []);
  
  const setDuration = useCallback((duration: number) => {
    setState(s => ({ ...s, duration }));
  }, []);
  
  const updateTime = useCallback((currentTime: number) => {
    setState(s => ({ ...s, currentTime }));
  }, []);
  
  return {
    state,
    settings,
    setState,
    setSettings,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleLoop,
    setZoom,
    setDuration,
    updateTime,
  };
};

// ==================== COMPONENTS ====================

// Icons
const Icons = {
  play: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  skipBack: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>,
  skipForward: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  frameBack: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>,
  frameForward: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>,
  volume: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  volumeMuted: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  loop: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  maximize: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
  grid: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
};

// Transport controls
interface TransportControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onFrameBack: () => void;
  onFrameForward: () => void;
}

export const TransportControls: React.FC<TransportControlsProps> = memo(({
  isPlaying,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onFrameBack,
  onFrameForward,
}) => {
  return (
    <div style={transportStyles.container}>
      <button onClick={onSkipBack} style={transportStyles.btn} title="Skip to start">
        {Icons.skipBack}
      </button>
      <button onClick={onFrameBack} style={transportStyles.btn} title="Previous frame">
        {Icons.frameBack}
      </button>
      <button 
        onClick={onPlayPause} 
        style={{ ...transportStyles.btn, ...transportStyles.playBtn }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? Icons.pause : Icons.play}
      </button>
      <button onClick={onFrameForward} style={transportStyles.btn} title="Next frame">
        {Icons.frameForward}
      </button>
      <button onClick={onSkipForward} style={transportStyles.btn} title="Skip to end">
        {Icons.skipForward}
      </button>
    </div>
  );
});

TransportControls.displayName = 'TransportControls';

const transportStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    cursor: 'pointer',
  },
  playBtn: {
    width: 36,
    height: 36,
    background: 'var(--color-accent, #007aff)',
    borderRadius: '50%',
  },
};

// Timecode display
interface TimecodeDisplayProps {
  currentTime: number;
  duration: number;
  fps?: number;
}

export const TimecodeDisplay: React.FC<TimecodeDisplayProps> = memo(({
  currentTime,
  duration,
  fps = 30,
}) => {
  return (
    <div style={timecodeStyles.container}>
      <span style={timecodeStyles.current}>{formatTimecode(currentTime, fps)}</span>
      <span style={timecodeStyles.separator}>/</span>
      <span style={timecodeStyles.duration}>{formatTimecode(duration, fps)}</span>
    </div>
  );
});

TimecodeDisplay.displayName = 'TimecodeDisplay';

const timecodeStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  current: {
    color: 'var(--color-text-primary, #fff)',
  },
  separator: {
    opacity: 0.4,
  },
  duration: {
    opacity: 0.6,
  },
};

// Seek bar
interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export const SeekBar: React.FC<SeekBarProps> = memo(({
  currentTime,
  duration,
  onSeek,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  
  const handleClick = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    onSeek(percent * duration);
  };
  
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div
      ref={trackRef}
      style={seekStyles.track}
      onClick={handleClick}
    >
      <div style={{ ...seekStyles.progress, width: `${progress}%` }} />
      <div style={{ ...seekStyles.thumb, left: `${progress}%` }} />
    </div>
  );
});

SeekBar.displayName = 'SeekBar';

const seekStyles: Record<string, React.CSSProperties> = {
  track: {
    position: 'relative',
    height: 4,
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.2))',
    borderRadius: 2,
    cursor: 'pointer',
  },
  progress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: 'var(--color-accent, #007aff)',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: 12,
    height: 12,
    marginTop: -6,
    marginLeft: -6,
    background: 'var(--color-text-primary, #fff)',
    borderRadius: '50%',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
};

// Volume control
interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = memo(({
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      style={volumeStyles.container}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <button onClick={onMuteToggle} style={transportStyles.btn}>
        {isMuted ? Icons.volumeMuted : Icons.volume}
      </button>
      {isExpanded && (
        <div style={volumeStyles.slider}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            style={volumeStyles.input}
          />
        </div>
      )}
    </div>
  );
});

VolumeControl.displayName = 'VolumeControl';

const volumeStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  slider: {
    width: 80,
  },
  input: {
    width: '100%',
    cursor: 'pointer',
  },
};

// Playback rate selector
interface PlaybackRateSelectorProps {
  rate: number;
  onRateChange: (rate: number) => void;
}

export const PlaybackRateSelector: React.FC<PlaybackRateSelectorProps> = memo(({
  rate,
  onRateChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div style={rateStyles.container}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        style={rateStyles.btn}
      >
        {rate}x
      </button>
      {isOpen && (
        <div style={rateStyles.dropdown}>
          {PLAYBACK_RATES.map(r => (
            <button
              key={r}
              onClick={() => { onRateChange(r); setIsOpen(false); }}
              style={{
                ...rateStyles.option,
                background: r === rate ? 'var(--color-accent, #007aff)' : 'transparent',
              }}
            >
              {r}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

PlaybackRateSelector.displayName = 'PlaybackRateSelector';

const rateStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
  },
  btn: {
    padding: '4px 8px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    cursor: 'pointer',
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 4,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    borderRadius: 6,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    zIndex: 100,
  },
  option: {
    display: 'block',
    width: '100%',
    padding: '6px 16px',
    border: 'none',
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    textAlign: 'center',
    cursor: 'pointer',
  },
};

// Main preview panel
interface PreviewPanelProps {
  children?: React.ReactNode;
  state: PreviewState;
  settings: PreviewSettings;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onLoopToggle: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = memo(({
  children,
  state,
  settings,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onPlaybackRateChange,
  onLoopToggle,
}) => {
  const fps = 30;
  
  return (
    <div style={panelStyles.container}>
      {/* Preview area */}
      <div style={{ ...panelStyles.preview, background: settings.backgroundColor }}>
        {children}
        {settings.showGrid && <div style={panelStyles.grid} />}
        {settings.showSafeAreas && <div style={panelStyles.safeArea} />}
      </div>
      
      {/* Controls */}
      <div style={panelStyles.controls}>
        {/* Seek bar */}
        <SeekBar
          currentTime={state.currentTime}
          duration={state.duration}
          onSeek={onSeek}
        />
        
        {/* Bottom row */}
        <div style={panelStyles.bottomRow}>
          {/* Left: Timecode */}
          <TimecodeDisplay
            currentTime={state.currentTime}
            duration={state.duration}
            fps={fps}
          />
          
          {/* Center: Transport */}
          <TransportControls
            isPlaying={state.isPlaying}
            onPlayPause={onPlayPause}
            onSkipBack={() => onSeek(0)}
            onSkipForward={() => onSeek(state.duration)}
            onFrameBack={() => onSeek(state.currentTime - 1/fps)}
            onFrameForward={() => onSeek(state.currentTime + 1/fps)}
          />
          
          {/* Right: Volume, Rate, Loop */}
          <div style={panelStyles.rightControls}>
            <VolumeControl
              volume={state.volume}
              isMuted={state.isMuted}
              onVolumeChange={onVolumeChange}
              onMuteToggle={onMuteToggle}
            />
            <PlaybackRateSelector
              rate={state.playbackRate}
              onRateChange={onPlaybackRateChange}
            />
            <button
              onClick={onLoopToggle}
              style={{
                ...transportStyles.btn,
                background: state.loop ? 'var(--color-accent, #007aff)' : 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
              }}
              title="Loop"
            >
              {Icons.loop}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

PreviewPanel.displayName = 'PreviewPanel';

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary, #1a1a1a)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  preview: {
    position: 'relative',
    aspectRatio: '16 / 9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.1) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255,255,255,0.1) 20px)',
    pointerEvents: 'none',
  },
  safeArea: {
    position: 'absolute',
    inset: '10%',
    border: '1px dashed rgba(255,255,255,0.3)',
    pointerEvents: 'none',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  rightControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
};

export default PreviewPanel;
