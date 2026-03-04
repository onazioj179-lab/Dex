/**
 * DEX Timeline Component
 * Unified timeline for video, audio, and animation editing
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================
export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'title' | 'effect' | 'animation';
  color: string;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  solo: boolean;
  height: number;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  color?: string;
  thumbnail?: string;
  selected?: boolean;
  waveform?: number[];
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
  type: 'marker' | 'chapter' | 'comment';
}

export interface TimelineState {
  currentTime: number;
  duration: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  selectedClipIds: string[];
  selectedTrackId: string | null;
  inPoint: number | null;
  outPoint: number | null;
  loop: boolean;
  snap: boolean;
  ripple: boolean;
}

// ==================== RULER COMPONENT ====================
interface TimelineRulerProps {
  duration: number;
  zoom: number;
  scrollX: number;
  currentTime: number;
  onSeek: (time: number) => void;
  width: number;
  fps?: number;
}

const TimelineRuler: React.FC<TimelineRulerProps> = memo(({
  duration,
  zoom,
  scrollX,
  currentTime,
  onSeek,
  width,
  fps = 30,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsPerSecond = zoom * 20;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = 32 * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = 'var(--color-bg-tertiary, #1a1a1a)';
    ctx.fillRect(0, 0, width, 32);

    // Draw ticks and labels
    ctx.fillStyle = '#888';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const startTime = scrollX / pixelsPerSecond;
    const endTime = (scrollX + width) / pixelsPerSecond;
    const interval = getTickInterval(zoom);

    for (let t = Math.floor(startTime / interval) * interval; t <= endTime; t += interval) {
      const x = (t * pixelsPerSecond) - scrollX;
      
      // Major tick
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x, 20, 1, 12);
      
      // Label
      ctx.fillStyle = '#888';
      ctx.fillText(formatTimecode(t, fps), x, 14);
      
      // Minor ticks
      const minorInterval = interval / 4;
      for (let m = 1; m < 4; m++) {
        const mx = x + (m * minorInterval * pixelsPerSecond);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(mx, 26, 1, 6);
      }
    }

    // Draw playhead position
    const playheadX = (currentTime * pixelsPerSecond) - scrollX;
    ctx.fillStyle = '#007aff';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 32);
    ctx.lineTo(playheadX + 6, 32);
    ctx.lineTo(playheadX, 24);
    ctx.closePath();
    ctx.fill();
  }, [duration, zoom, scrollX, currentTime, width, pixelsPerSecond, fps]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + scrollX;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(duration, time)));
  }, [scrollX, pixelsPerSecond, duration, onSeek]);

  return (
    <canvas
      ref={canvasRef}
      style={rulerStyles.canvas}
      onClick={handleClick}
    />
  );
});

TimelineRuler.displayName = 'TimelineRuler';

// ==================== TRACK HEADER ====================
interface TrackHeaderProps {
  track: TimelineTrack;
  onMute: () => void;
  onSolo: () => void;
  onLock: () => void;
  onVisibility: () => void;
  selected: boolean;
  onSelect: () => void;
}

const TrackHeader: React.FC<TrackHeaderProps> = memo(({
  track,
  onMute,
  onSolo,
  onLock,
  onVisibility,
  selected,
  onSelect,
}) => (
  <div 
    style={{
      ...trackHeaderStyles.container,
      height: track.height,
      ...(selected ? trackHeaderStyles.selected : {}),
    }}
    onClick={onSelect}
  >
    <div style={trackHeaderStyles.color} >
      <div style={{ ...trackHeaderStyles.colorBar, background: track.color }} />
    </div>
    <span style={trackHeaderStyles.name}>{track.name}</span>
    <div style={trackHeaderStyles.controls}>
      <button 
        onClick={e => { e.stopPropagation(); onMute(); }}
        style={{ ...trackHeaderStyles.btn, ...(track.muted ? trackHeaderStyles.btnActive : {}) }}
        title="Mute"
      >
        M
      </button>
      <button 
        onClick={e => { e.stopPropagation(); onSolo(); }}
        style={{ ...trackHeaderStyles.btn, ...(track.solo ? { ...trackHeaderStyles.btnActive, color: '#ff9f0a' } : {}) }}
        title="Solo"
      >
        S
      </button>
      <button 
        onClick={e => { e.stopPropagation(); onLock(); }}
        style={{ ...trackHeaderStyles.btn, ...(track.locked ? trackHeaderStyles.btnActive : {}) }}
        title="Lock"
      >
        L
      </button>
    </div>
  </div>
));

TrackHeader.displayName = 'TrackHeader';

// ==================== CLIP COMPONENT ====================
interface ClipProps {
  clip: TimelineClip;
  zoom: number;
  trackHeight: number;
  trackColor: string;
  selected: boolean;
  onSelect: () => void;
  onDrag?: (delta: number) => void;
  onResize?: (edge: 'left' | 'right', delta: number) => void;
}

const Clip: React.FC<ClipProps> = memo(({
  clip,
  zoom,
  trackHeight,
  trackColor,
  selected,
  onSelect,
  onDrag,
  onResize,
}) => {
  const pixelsPerSecond = zoom * 20;
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();

    const startX = e.clientX;
    const edge = getEdge(e);

    const handleMouseMove = (e: MouseEvent) => {
      const delta = (e.clientX - startX) / pixelsPerSecond;
      if (edge === 'left' || edge === 'right') {
        onResize?.(edge, delta);
      } else {
        onDrag?.(delta);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onSelect, onDrag, onResize, pixelsPerSecond]);

  const getEdge = (e: React.MouseEvent): 'left' | 'right' | 'center' => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 8) return 'left';
    if (x > rect.width - 8) return 'right';
    return 'center';
  };

  return (
    <div
      style={{
        ...clipStyles.container,
        left,
        width: Math.max(width, 20),
        height: trackHeight - 4,
        background: clip.color || trackColor,
        ...(selected ? clipStyles.selected : {}),
      }}
      onMouseDown={handleMouseDown}
    >
      <div style={clipStyles.handleLeft} />
      <div style={clipStyles.content}>
        <span style={clipStyles.name}>{clip.name}</span>
        {clip.waveform && (
          <WaveformDisplay waveform={clip.waveform} height={trackHeight - 20} />
        )}
      </div>
      <div style={clipStyles.handleRight} />
    </div>
  );
});

Clip.displayName = 'Clip';

// ==================== WAVEFORM DISPLAY ====================
interface WaveformDisplayProps {
  waveform: number[];
  height: number;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = memo(({ waveform, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';

    const barWidth = width / waveform.length;
    const centerY = height / 2;

    waveform.forEach((value, i) => {
      const barHeight = value * height * 0.8;
      ctx.fillRect(
        i * barWidth,
        centerY - barHeight / 2,
        Math.max(barWidth - 1, 1),
        barHeight
      );
    });
  }, [waveform, height]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={height}
      style={waveformStyles.canvas}
    />
  );
});

WaveformDisplay.displayName = 'WaveformDisplay';

// ==================== PLAYHEAD COMPONENT ====================
interface PlayheadProps {
  currentTime: number;
  zoom: number;
  scrollX: number;
  height: number;
}

const Playhead: React.FC<PlayheadProps> = memo(({ currentTime, zoom, scrollX, height }) => {
  const pixelsPerSecond = zoom * 20;
  const left = (currentTime * pixelsPerSecond) - scrollX;

  if (left < 0) return null;

  return (
    <div style={{ ...playheadStyles.container, left, height }}>
      <div style={playheadStyles.head} />
      <div style={playheadStyles.line} />
    </div>
  );
});

Playhead.displayName = 'Playhead';

// ==================== MAIN TIMELINE COMPONENT ====================
interface TimelineProps {
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
  state: TimelineState;
  onStateChange: (state: Partial<TimelineState>) => void;
  onTrackChange: (trackId: string, changes: Partial<TimelineTrack>) => void;
  onClipChange: (clipId: string, changes: Partial<TimelineClip>) => void;
  onSeek: (time: number) => void;
  style?: React.CSSProperties;
}

export const Timeline: React.FC<TimelineProps> = memo(({
  tracks,
  markers = [],
  state,
  onStateChange,
  onTrackChange,
  onClipChange,
  onSeek,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 180); // Subtract track header width
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleZoom = useCallback((delta: number) => {
    const newZoom = Math.max(0.25, Math.min(10, state.zoom + delta));
    onStateChange({ zoom: newZoom });
  }, [state.zoom, onStateChange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    onStateChange({ scrollX: target.scrollLeft, scrollY: target.scrollTop });
  }, [onStateChange]);

  const totalHeight = tracks.reduce((sum, t) => sum + t.height, 0);
  const pixelsPerSecond = state.zoom * 20;
  const totalWidth = state.duration * pixelsPerSecond;

  return (
    <div ref={containerRef} style={{ ...timelineStyles.container, ...style }}>
      {/* Toolbar */}
      <div style={timelineStyles.toolbar}>
        <div style={timelineStyles.toolbarLeft}>
          <button 
            onClick={() => handleZoom(-0.25)} 
            style={timelineStyles.toolbarBtn}
            title="Zoom Out"
          >
            -
          </button>
          <span style={timelineStyles.zoomLabel}>{Math.round(state.zoom * 100)}%</span>
          <button 
            onClick={() => handleZoom(0.25)} 
            style={timelineStyles.toolbarBtn}
            title="Zoom In"
          >
            +
          </button>
        </div>
        <div style={timelineStyles.toolbarCenter}>
          <span style={timelineStyles.timecode}>
            {formatTimecode(state.currentTime, 30)}
          </span>
        </div>
        <div style={timelineStyles.toolbarRight}>
          <button 
            onClick={() => onStateChange({ snap: !state.snap })}
            style={{ ...timelineStyles.toolbarBtn, ...(state.snap ? timelineStyles.toolbarBtnActive : {}) }}
            title="Snap"
          >
            Snap
          </button>
          <button 
            onClick={() => onStateChange({ ripple: !state.ripple })}
            style={{ ...timelineStyles.toolbarBtn, ...(state.ripple ? timelineStyles.toolbarBtnActive : {}) }}
            title="Ripple Edit"
          >
            Ripple
          </button>
        </div>
      </div>

      {/* Main timeline area */}
      <div style={timelineStyles.main}>
        {/* Track headers */}
        <div style={timelineStyles.trackHeaders}>
          <div style={{ height: 32 }} /> {/* Spacer for ruler */}
          {tracks.map(track => (
            <TrackHeader
              key={track.id}
              track={track}
              selected={state.selectedTrackId === track.id}
              onSelect={() => onStateChange({ selectedTrackId: track.id })}
              onMute={() => onTrackChange(track.id, { muted: !track.muted })}
              onSolo={() => onTrackChange(track.id, { solo: !track.solo })}
              onLock={() => onTrackChange(track.id, { locked: !track.locked })}
              onVisibility={() => onTrackChange(track.id, { visible: !track.visible })}
            />
          ))}
        </div>

        {/* Timeline content */}
        <div style={timelineStyles.content} onScroll={handleScroll}>
          {/* Ruler */}
          <TimelineRuler
            duration={state.duration}
            zoom={state.zoom}
            scrollX={state.scrollX}
            currentTime={state.currentTime}
            onSeek={onSeek}
            width={containerWidth}
          />

          {/* Tracks */}
          <div style={{ ...timelineStyles.tracks, width: totalWidth, height: totalHeight }}>
            {tracks.map(track => (
              <div
                key={track.id}
                style={{ ...timelineStyles.track, height: track.height }}
              >
                {track.clips.map(clip => (
                  <Clip
                    key={clip.id}
                    clip={clip}
                    zoom={state.zoom}
                    trackHeight={track.height}
                    trackColor={track.color}
                    selected={state.selectedClipIds.includes(clip.id)}
                    onSelect={() => onStateChange({ selectedClipIds: [clip.id] })}
                    onDrag={(delta) => onClipChange(clip.id, { startTime: clip.startTime + delta })}
                    onResize={(edge, delta) => {
                      if (edge === 'left') {
                        onClipChange(clip.id, { 
                          startTime: clip.startTime + delta,
                          duration: clip.duration - delta,
                          inPoint: clip.inPoint + delta,
                        });
                      } else {
                        onClipChange(clip.id, { 
                          duration: clip.duration + delta,
                          outPoint: clip.outPoint + delta,
                        });
                      }
                    }}
                  />
                ))}
              </div>
            ))}

            {/* Playhead */}
            <Playhead
              currentTime={state.currentTime}
              zoom={state.zoom}
              scrollX={state.scrollX}
              height={totalHeight}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';

// ==================== UTILITY FUNCTIONS ====================
const getTickInterval = (zoom: number): number => {
  if (zoom >= 4) return 0.5;
  if (zoom >= 2) return 1;
  if (zoom >= 1) return 2;
  if (zoom >= 0.5) return 5;
  return 10;
};

const formatTimecode = (seconds: number, fps: number = 30): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

// ==================== STYLES ====================
const timelineStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary, #1e1e1e)',
    borderTop: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    padding: '0 12px',
    background: 'var(--color-bg-tertiary, #1a1a1a)',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  toolbarBtn: {
    padding: '4px 8px',
    background: 'var(--color-bg-elevated, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-secondary, #888)',
    fontSize: 11,
    cursor: 'pointer',
  },
  toolbarBtnActive: {
    background: 'var(--color-accent, #007aff)',
    color: '#fff',
  },
  zoomLabel: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--color-text-tertiary, #666)',
    fontFamily: 'monospace',
  },
  timecode: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: 'var(--color-text-primary, #fff)',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  trackHeaders: {
    width: 180,
    flexShrink: 0,
    borderRight: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  tracks: {
    position: 'relative',
  },
  track: {
    position: 'relative',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
  },
};

const rulerStyles: Record<string, React.CSSProperties> = {
  canvas: {
    display: 'block',
    width: '100%',
    height: 32,
    cursor: 'pointer',
  },
};

const trackHeaderStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 8px',
    background: 'var(--color-bg-secondary, #1e1e1e)',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.05))',
    cursor: 'pointer',
  },
  selected: {
    background: 'var(--color-bg-tertiary, #252525)',
  },
  color: {
    width: 4,
    height: '60%',
  },
  colorBar: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
  },
  name: {
    flex: 1,
    fontSize: 11,
    color: 'var(--color-text-primary, #fff)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  controls: {
    display: 'flex',
    gap: 2,
  },
  btn: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    color: 'var(--color-text-tertiary, #666)',
    fontSize: 9,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnActive: {
    background: 'rgba(255,255,255,0.1)',
    color: 'var(--color-accent, #007aff)',
  },
};

const clipStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 2,
    borderRadius: 4,
    overflow: 'hidden',
    cursor: 'move',
    display: 'flex',
    alignItems: 'stretch',
  },
  selected: {
    boxShadow: '0 0 0 2px var(--color-accent, #007aff)',
  },
  handleLeft: {
    width: 8,
    cursor: 'ew-resize',
    background: 'rgba(0,0,0,0.2)',
  },
  handleRight: {
    width: 8,
    cursor: 'ew-resize',
    background: 'rgba(0,0,0,0.2)',
  },
  content: {
    flex: 1,
    padding: '2px 4px',
    overflow: 'hidden',
  },
  name: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

const waveformStyles: Record<string, React.CSSProperties> = {
  canvas: {
    width: '100%',
    display: 'block',
  },
};

const playheadStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    width: 1,
    pointerEvents: 'none',
    zIndex: 100,
  },
  head: {
    width: 12,
    height: 12,
    marginLeft: -6,
    background: '#007aff',
    borderRadius: '50% 50% 50% 50%',
  },
  line: {
    width: 1,
    height: '100%',
    background: '#007aff',
  },
};

export default Timeline;
