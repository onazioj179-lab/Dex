/**
 * DEX Audio Equalizer
 * 10-band graphic equalizer with presets
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

// ==================== TYPES ====================

interface EQBand {
  frequency: string;
  hz: number;
  gain: number; // -12 to +12 dB
}

interface EQPreset {
  name: string;
  bands: number[];
}

interface EqualizerProps {
  audioContext?: AudioContext;
  sourceNode?: AudioNode;
  onPresetChange?: (preset: string) => void;
  onBandsChange?: (bands: EQBand[]) => void;
}

// ==================== CONSTANTS ====================

const DEFAULT_BANDS: EQBand[] = [
  { frequency: '32', hz: 32, gain: 0 },
  { frequency: '64', hz: 64, gain: 0 },
  { frequency: '125', hz: 125, gain: 0 },
  { frequency: '250', hz: 250, gain: 0 },
  { frequency: '500', hz: 500, gain: 0 },
  { frequency: '1K', hz: 1000, gain: 0 },
  { frequency: '2K', hz: 2000, gain: 0 },
  { frequency: '4K', hz: 4000, gain: 0 },
  { frequency: '8K', hz: 8000, gain: 0 },
  { frequency: '16K', hz: 16000, gain: 0 },
];

const PRESETS: EQPreset[] = [
  { name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', bands: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { name: 'Vocal', bands: [-2, -2, 0, 3, 5, 5, 3, 0, -2, -2] },
  { name: 'Rock', bands: [5, 4, 3, 1, -1, -1, 2, 3, 4, 5] },
  { name: 'Pop', bands: [-1, 1, 3, 4, 4, 3, 1, 0, -1, -2] },
  { name: 'Jazz', bands: [3, 2, 1, 2, -2, -2, 0, 2, 3, 4] },
  { name: 'Classical', bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: 'Electronic', bands: [5, 4, 2, 0, -2, 0, 2, 3, 4, 5] },
  { name: 'Hip Hop', bands: [5, 5, 3, 0, -1, 0, 1, 2, 3, 3] },
  { name: 'Acoustic', bands: [3, 3, 2, 1, 0, 0, 0, 2, 3, 3] },
  { name: 'Loudness', bands: [4, 3, 0, 0, -1, -1, 0, 0, 3, 4] },
];

const STORAGE_KEY = 'dex-audio-eq';

// ==================== ICONS ====================

const Icons = {
  eq: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V8m0 0V5m0 3h4m-4 0H2m18 13v-8m0 0V3m0 5h-4m4 0h2m-10 13V7m0 0V3m0 4h4m-4 0H8"/></svg>,
  power: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
  reset: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
};

// ==================== COMPONENT ====================

export const Equalizer: React.FC<EqualizerProps> = ({
  audioContext,
  sourceNode,
  onPresetChange,
  onBandsChange,
}) => {
  const [bands, setBands] = useState<EQBand[]>(DEFAULT_BANDS);
  const [activePreset, setActivePreset] = useState<string>('Flat');
  const [isEnabled, setIsEnabled] = useState(true);
  const [isDragging, setIsDragging] = useState<number | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);

  // Load saved settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.bands) setBands(data.bands);
        if (data.preset) setActivePreset(data.preset);
        if (typeof data.enabled === 'boolean') setIsEnabled(data.enabled);
      }
    } catch { /* storage unavailable */ }
  }, []);

  // Save settings
  const saveSettings = useCallback((newBands: EQBand[], preset: string, enabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        bands: newBands,
        preset,
        enabled,
      }));
    } catch { /* storage unavailable */ }
  }, []);

  // Initialize audio filters
  useEffect(() => {
    if (!audioContext || !sourceNode) return;

    // Create biquad filters for each band
    const filters = bands.map((band, index) => {
      const filter = audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.hz;
      filter.Q.value = 1.4; // Standard Q for 10-band EQ
      filter.gain.value = isEnabled ? band.gain : 0;

      // Connect filters in chain
      if (index === 0) {
        sourceNode.connect(filter);
      } else {
        filters[index - 1].connect(filter);
      }

      return filter;
    });

    // Connect last filter to destination
    if (filters.length > 0) {
      filters[filters.length - 1].connect(audioContext.destination);
    }

    filtersRef.current = filters;

    // Cleanup
    return () => {
      filters.forEach(filter => filter.disconnect());
    };
  }, [audioContext, sourceNode, isEnabled]);

  // Update filter gains when bands change
  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      if (filter && bands[index]) {
        filter.gain.value = isEnabled ? bands[index].gain : 0;
      }
    });
    onBandsChange?.(bands);
  }, [bands, isEnabled, onBandsChange]);

  // Apply preset
  const applyPreset = useCallback((preset: EQPreset) => {
    const newBands = bands.map((band, index) => ({
      ...band,
      gain: preset.bands[index] || 0,
    }));
    setBands(newBands);
    setActivePreset(preset.name);
    saveSettings(newBands, preset.name, isEnabled);
    onPresetChange?.(preset.name);
  }, [bands, isEnabled, saveSettings, onPresetChange]);

  // Update single band
  const updateBand = useCallback((index: number, gain: number) => {
    const clampedGain = Math.max(-12, Math.min(12, gain));
    const newBands = bands.map((band, i) => 
      i === index ? { ...band, gain: clampedGain } : band
    );
    setBands(newBands);
    setActivePreset('Custom');
    saveSettings(newBands, 'Custom', isEnabled);
  }, [bands, isEnabled, saveSettings]);

  // Reset to flat
  const resetEQ = useCallback(() => {
    const flat = PRESETS.find(p => p.name === 'Flat');
    if (flat) applyPreset(flat);
  }, [applyPreset]);

  // Toggle EQ
  const toggleEnabled = useCallback(() => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    saveSettings(bands, activePreset, newEnabled);
  }, [isEnabled, bands, activePreset, saveSettings]);

  // Handle slider drag
  const handleSliderMouseDown = (index: number) => {
    setIsDragging(index);
  };

  const handleSliderMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging === null) return;
    
    const slider = document.querySelector(`[data-eq-slider="${isDragging}"]`);
    if (!slider) return;

    const rect = slider.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = 1 - (y / rect.height);
    const gain = (percentage * 24) - 12; // -12 to +12
    updateBand(isDragging, gain);
  }, [isDragging, updateBand]);

  const handleSliderMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging !== null) {
      window.addEventListener('mousemove', handleSliderMouseMove);
      window.addEventListener('mouseup', handleSliderMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleSliderMouseMove);
        window.removeEventListener('mouseup', handleSliderMouseUp);
      };
    }
  }, [isDragging, handleSliderMouseMove, handleSliderMouseUp]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: '12px',
      padding: '16px',
      userSelect: 'none',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '16px',
    },
    headerIcon: {
      color: isEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)',
    },
    title: {
      flex: 1,
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    presetName: {
      fontSize: '12px',
      color: 'var(--color-text-muted)',
      background: 'var(--color-bg-glass)',
      padding: '4px 8px',
      borderRadius: '4px',
    },
    headerBtn: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    sliders: {
      display: 'flex',
      gap: '8px',
      height: '160px',
      marginBottom: '16px',
      padding: '0 8px',
      opacity: isEnabled ? 1 : 0.5,
      transition: 'opacity 0.2s',
    },
    sliderColumn: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    },
    sliderTrack: {
      flex: 1,
      width: '100%',
      maxWidth: '24px',
      background: 'var(--color-bg-glass)',
      borderRadius: '12px',
      position: 'relative',
      cursor: 'pointer',
      overflow: 'hidden',
    },
    sliderFill: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: '50%',
      background: 'var(--color-accent)',
      borderRadius: '12px',
      transition: isDragging !== null ? 'none' : 'height 0.15s',
    },
    sliderThumb: {
      position: 'absolute',
      left: '50%',
      transform: 'translate(-50%, 50%)',
      width: '16px',
      height: '8px',
      background: '#fff',
      borderRadius: '4px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      transition: isDragging !== null ? 'none' : 'bottom 0.15s',
    },
    sliderLabel: {
      fontSize: '10px',
      color: 'var(--color-text-muted)',
      fontWeight: 500,
    },
    centerLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      height: '1px',
      background: 'var(--color-border)',
    },
    presets: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
    },
    presetBtn: {
      padding: '6px 12px',
      fontSize: '11px',
      fontWeight: 500,
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: 'var(--color-text-secondary)',
      transition: 'background 0.15s, color 0.15s',
    },
    presetBtnActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    gainScale: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 8px',
      marginBottom: '8px',
      fontSize: '9px',
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>{Icons.eq}</span>
        <span style={styles.title}>Equalizer</span>
        <span style={styles.presetName}>{activePreset}</span>
        <button 
          style={styles.headerBtn} 
          onClick={resetEQ}
          title="Reset to Flat"
        >
          {Icons.reset}
        </button>
        <button 
          style={{
            ...styles.headerBtn,
            color: isEnabled ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }} 
          onClick={toggleEnabled}
          title={isEnabled ? 'Disable EQ' : 'Enable EQ'}
        >
          {Icons.power}
        </button>
      </div>

      <div style={styles.gainScale}>
        <span>+12 dB</span>
        <span>0 dB</span>
        <span>-12 dB</span>
      </div>

      <div style={styles.sliders}>
        {bands.map((band, index) => {
          const percentage = ((band.gain + 12) / 24) * 100;
          const fillHeight = Math.abs(band.gain / 12) * 50;
          const isPositive = band.gain >= 0;
          
          return (
            <div key={band.frequency} style={styles.sliderColumn}>
              <div 
                style={styles.sliderTrack}
                data-eq-slider={index}
                onMouseDown={() => handleSliderMouseDown(index)}
              >
                <div style={styles.centerLine} />
                <div style={{
                  ...styles.sliderFill,
                  bottom: isPositive ? '50%' : `${50 - fillHeight}%`,
                  top: isPositive ? `${50 - fillHeight}%` : '50%',
                }} />
                <div style={{
                  ...styles.sliderThumb,
                  bottom: `${percentage}%`,
                }} />
              </div>
              <span style={styles.sliderLabel}>{band.frequency}</span>
            </div>
          );
        })}
      </div>

      <div style={styles.presets}>
        {PRESETS.map(preset => (
          <button
            key={preset.name}
            style={{
              ...styles.presetBtn,
              ...(activePreset === preset.name ? styles.presetBtnActive : {}),
            }}
            onClick={() => applyPreset(preset)}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== MINI EQUALIZER ====================

interface MiniEqualizerProps {
  onExpand?: () => void;
}

export const MiniEqualizer: React.FC<MiniEqualizerProps> = ({ onExpand }) => {
  const [bands] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return data.bands?.map((b: EQBand) => b.gain) || Array(10).fill(0);
      }
    } catch { /* storage unavailable */ }
    return Array(10).fill(0);
  });

  const miniStyles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '2px',
      height: '24px',
      padding: '4px 8px',
      background: 'var(--color-bg-glass)',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    bar: {
      width: '4px',
      background: 'var(--color-accent)',
      borderRadius: '2px',
      transition: 'height 0.2s',
    },
  };

  return (
    <div style={miniStyles.container} onClick={onExpand} title="Equalizer">
      {bands.map((gain, index) => (
        <div
          key={index}
          style={{
            ...miniStyles.bar,
            height: `${Math.max(4, ((gain + 12) / 24) * 20)}px`,
          }}
        />
      ))}
    </div>
  );
};

export default Equalizer;
