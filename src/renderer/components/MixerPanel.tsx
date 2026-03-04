/**
 * DEX Mixer Panel
 * Universal mixer component for audio/video applications
 */
import React, { useState, useCallback, memo, useRef, useEffect } from 'react';

// ==================== TYPES ====================
export interface MixerChannel {
  id: string;
  name: string;
  type: 'audio' | 'video' | 'bus' | 'master';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  meter: { left: number; right: number };
  sends: SendLevel[];
}

export interface SendLevel {
  targetId: string;
  level: number;
  preFader: boolean;
}

export interface MixerState {
  channels: MixerChannel[];
  masterVolume: number;
  soloMode: boolean;
}

// ==================== CONSTANTS ====================
export const DEFAULT_CHANNEL: Omit<MixerChannel, 'id' | 'name'> = {
  type: 'audio',
  color: '#6366f1',
  volume: 0.8,
  pan: 0,
  mute: false,
  solo: false,
  armed: false,
  meter: { left: 0, right: 0 },
  sends: [],
};

export const CHANNEL_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#22c55e', // Green
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#0ea5e9', // Sky
];

// ==================== UTILITIES ====================
export const dbToLinear = (db: number): number => {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
};

export const linearToDb = (linear: number): number => {
  if (linear <= 0) return -60;
  return 20 * Math.log10(linear);
};

export const formatDb = (db: number): string => {
  if (db <= -60) return '-inf';
  return db.toFixed(1);
};

export const panToString = (pan: number): string => {
  if (pan === 0) return 'C';
  if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`;
  return `R${Math.round(pan * 100)}`;
};

// ==================== HOOKS ====================
export const useMixer = (initialChannels: MixerChannel[] = []) => {
  const [channels, setChannels] = useState<MixerChannel[]>(initialChannels);
  const [masterVolume, setMasterVolume] = useState(1);
  
  const updateChannel = useCallback((id: string, updates: Partial<MixerChannel>) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, ...updates } : ch
    ));
  }, []);
  
  const setVolume = useCallback((id: string, volume: number) => {
    updateChannel(id, { volume: Math.max(0, Math.min(1, volume)) });
  }, [updateChannel]);
  
  const setPan = useCallback((id: string, pan: number) => {
    updateChannel(id, { pan: Math.max(-1, Math.min(1, pan)) });
  }, [updateChannel]);
  
  const toggleMute = useCallback((id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, mute: !ch.mute } : ch
    ));
  }, []);
  
  const toggleSolo = useCallback((id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, solo: !ch.solo } : ch
    ));
  }, []);
  
  const toggleArm = useCallback((id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, armed: !ch.armed } : ch
    ));
  }, []);
  
  const addChannel = useCallback((name: string, type: MixerChannel['type'] = 'audio') => {
    const newChannel: MixerChannel = {
      ...DEFAULT_CHANNEL,
      id: `ch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length],
    };
    setChannels(prev => [...prev, newChannel]);
    return newChannel;
  }, [channels.length]);
  
  const removeChannel = useCallback((id: string) => {
    setChannels(prev => prev.filter(ch => ch.id !== id));
  }, []);
  
  const soloMode = channels.some(ch => ch.solo);
  
  return {
    channels,
    masterVolume,
    soloMode,
    setChannels,
    setMasterVolume,
    updateChannel,
    setVolume,
    setPan,
    toggleMute,
    toggleSolo,
    toggleArm,
    addChannel,
    removeChannel,
  };
};

// ==================== COMPONENTS ====================

// Meter display
interface MeterProps {
  level: number;
  peak?: number;
  height?: number;
}

const Meter: React.FC<MeterProps> = memo(({ level, peak = 0, height = 120 }) => {
  const clampedLevel = Math.max(0, Math.min(1, level));
  const clampedPeak = Math.max(0, Math.min(1, peak));
  
  return (
    <div style={{ ...meterStyles.container, height }}>
      <div style={{ ...meterStyles.fill, height: `${clampedLevel * 100}%` }} />
      {clampedPeak > 0 && (
        <div style={{ ...meterStyles.peak, bottom: `${clampedPeak * 100}%` }} />
      )}
      <div style={meterStyles.scale}>
        <span>0</span>
        <span>-6</span>
        <span>-12</span>
        <span>-24</span>
      </div>
    </div>
  );
});

Meter.displayName = 'Meter';

const meterStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: 8,
    background: 'var(--color-bg-tertiary, #1a1a1a)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, #22c55e 0%, #f59e0b 70%, #ef4444 100%)',
    transition: 'height 0.05s',
  },
  peak: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    background: '#ef4444',
  },
  scale: {
    position: 'absolute',
    right: -16,
    top: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    fontSize: 8,
    opacity: 0.4,
  },
};

// Fader control
interface FaderProps {
  value: number;
  onChange: (value: number) => void;
  height?: number;
}

const Fader: React.FC<FaderProps> = memo(({ value, onChange, height = 100 }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e);
  };
  
  const updateValue = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newValue = 1 - Math.max(0, Math.min(1, y / rect.height));
    onChange(newValue);
  }, [onChange]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => updateValue(e);
    const handleMouseUp = () => setIsDragging(false);
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateValue]);
  
  return (
    <div
      ref={trackRef}
      style={{ ...faderStyles.track, height }}
      onMouseDown={handleMouseDown}
    >
      <div style={{ ...faderStyles.fill, height: `${value * 100}%` }} />
      <div style={{ ...faderStyles.thumb, bottom: `calc(${value * 100}% - 8px)` }} />
    </div>
  );
});

Fader.displayName = 'Fader';

const faderStyles: Record<string, React.CSSProperties> = {
  track: {
    position: 'relative',
    width: 24,
    background: 'var(--color-bg-tertiary, #1a1a1a)',
    borderRadius: 4,
    cursor: 'pointer',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'var(--color-accent, #6366f1)',
    borderRadius: 4,
    opacity: 0.4,
  },
  thumb: {
    position: 'absolute',
    left: -2,
    right: -2,
    height: 16,
    background: 'var(--color-text-primary, #fff)',
    borderRadius: 3,
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
};

// Pan knob
interface PanKnobProps {
  value: number;
  onChange: (value: number) => void;
}

const PanKnob: React.FC<PanKnobProps> = memo(({ value, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
  };
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = (startY.current - e.clientY) / 100;
      const newValue = Math.max(-1, Math.min(1, startValue.current + delta));
      onChange(newValue);
    };
    
    const handleMouseUp = () => setIsDragging(false);
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]);
  
  const rotation = value * 135; // -135 to 135 degrees
  
  return (
    <div
      style={knobStyles.container}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onChange(0)}
      title={panToString(value)}
    >
      <div style={{ ...knobStyles.knob, transform: `rotate(${rotation}deg)` }}>
        <div style={knobStyles.indicator} />
      </div>
    </div>
  );
});

PanKnob.displayName = 'PanKnob';

const knobStyles: Record<string, React.CSSProperties> = {
  container: {
    width: 24,
    height: 24,
    cursor: 'pointer',
  },
  knob: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: 'var(--color-bg-tertiary, #2a2a2a)',
    border: '2px solid var(--color-border, rgba(255,255,255,0.2))',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    left: '50%',
    width: 2,
    height: 6,
    marginLeft: -1,
    background: 'var(--color-accent, #6366f1)',
    borderRadius: 1,
  },
};

// Channel strip
interface ChannelStripProps {
  channel: MixerChannel;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmToggle: () => void;
  soloMode: boolean;
}

export const ChannelStrip: React.FC<ChannelStripProps> = memo(({
  channel,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  soloMode,
}) => {
  const isMuted = channel.mute || (soloMode && !channel.solo);
  
  return (
    <div style={{ ...channelStyles.strip, borderTopColor: channel.color }}>
      {/* Channel name */}
      <div style={channelStyles.name}>{channel.name}</div>
      
      {/* Pan knob */}
      <PanKnob value={channel.pan} onChange={onPanChange} />
      
      {/* Meter + Fader */}
      <div style={channelStyles.meterFader}>
        <Meter level={channel.meter.left} />
        <Fader value={channel.volume} onChange={onVolumeChange} />
        <Meter level={channel.meter.right} />
      </div>
      
      {/* Volume display */}
      <div style={channelStyles.volumeDisplay}>
        {formatDb(linearToDb(channel.volume))}
      </div>
      
      {/* Buttons */}
      <div style={channelStyles.buttons}>
        <button
          onClick={onMuteToggle}
          style={{
            ...channelStyles.btn,
            background: channel.mute ? '#ef4444' : 'transparent',
          }}
        >
          M
        </button>
        <button
          onClick={onSoloToggle}
          style={{
            ...channelStyles.btn,
            background: channel.solo ? '#f59e0b' : 'transparent',
          }}
        >
          S
        </button>
        {channel.type === 'audio' && (
          <button
            onClick={onArmToggle}
            style={{
              ...channelStyles.btn,
              background: channel.armed ? '#ef4444' : 'transparent',
            }}
          >
            R
          </button>
        )}
      </div>
    </div>
  );
});

ChannelStrip.displayName = 'ChannelStrip';

const channelStyles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '8px 6px',
    width: 60,
    background: 'var(--color-bg-secondary, #1a1a1a)',
    borderRadius: 6,
    borderTop: '3px solid transparent',
  },
  name: {
    fontSize: 10,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    textAlign: 'center',
  },
  meterFader: {
    display: 'flex',
    gap: 4,
    alignItems: 'stretch',
    height: 100,
  },
  volumeDisplay: {
    fontSize: 9,
    fontFamily: 'monospace',
    opacity: 0.7,
  },
  buttons: {
    display: 'flex',
    gap: 4,
  },
  btn: {
    width: 18,
    height: 18,
    border: '1px solid var(--color-border, rgba(255,255,255,0.2))',
    borderRadius: 3,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 9,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

// Main mixer component
interface MixerPanelProps {
  channels: MixerChannel[];
  masterVolume: number;
  soloMode: boolean;
  onVolumeChange: (id: string, volume: number) => void;
  onPanChange: (id: string, pan: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onArmToggle: (id: string) => void;
  onMasterVolumeChange: (volume: number) => void;
}

export const MixerPanel: React.FC<MixerPanelProps> = memo(({
  channels,
  masterVolume,
  soloMode,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  onMasterVolumeChange,
}) => {
  return (
    <div style={mixerStyles.container}>
      <div style={mixerStyles.channels}>
        {channels.map(channel => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            onVolumeChange={(v) => onVolumeChange(channel.id, v)}
            onPanChange={(p) => onPanChange(channel.id, p)}
            onMuteToggle={() => onMuteToggle(channel.id)}
            onSoloToggle={() => onSoloToggle(channel.id)}
            onArmToggle={() => onArmToggle(channel.id)}
            soloMode={soloMode}
          />
        ))}
      </div>
      
      {/* Master section */}
      <div style={mixerStyles.master}>
        <div style={channelStyles.name}>Master</div>
        <Fader value={masterVolume} onChange={onMasterVolumeChange} height={100} />
        <div style={channelStyles.volumeDisplay}>
          {formatDb(linearToDb(masterVolume))}
        </div>
      </div>
    </div>
  );
});

MixerPanel.displayName = 'MixerPanel';

const mixerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: 4,
    padding: 8,
    background: 'var(--color-bg-primary, #111)',
    borderRadius: 8,
    overflow: 'auto',
  },
  channels: {
    display: 'flex',
    gap: 4,
    flex: 1,
    overflowX: 'auto',
  },
  master: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--color-bg-secondary, #1a1a1a)',
    borderRadius: 6,
    borderLeft: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
};

export default MixerPanel;
