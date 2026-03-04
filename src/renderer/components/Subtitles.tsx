/**
 * DEX Subtitles Component
 * SRT/VTT subtitle parsing and display for Video
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';

// ==================== TYPES ====================

export interface SubtitleCue {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
  isActive: boolean;
}

interface SubtitlesProps {
  currentTime: number;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  onTrackChange: (trackId: string | null) => void;
  position?: 'bottom' | 'top';
  fontSize?: 'small' | 'medium' | 'large';
  backgroundColor?: 'transparent' | 'semi' | 'solid';
}

interface SubtitleDisplayProps {
  text: string;
  fontSize: 'small' | 'medium' | 'large';
  backgroundColor: 'transparent' | 'semi' | 'solid';
  position: 'bottom' | 'top';
}

interface SubtitleMenuProps {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  onTrackChange: (trackId: string | null) => void;
  fontSize: 'small' | 'medium' | 'large';
  backgroundColor: 'transparent' | 'semi' | 'solid';
  onFontSizeChange: (size: 'small' | 'medium' | 'large') => void;
  onBackgroundChange: (bg: 'transparent' | 'semi' | 'solid') => void;
}

// ==================== ICONS ====================

const Icons = {
  subtitles: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M7 15h4m6 0h-2m-4 0h-2m-3-4h2m4 0h6"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
};

// ==================== PARSERS ====================

/**
 * Parse SRT format subtitles
 */
export const parseSRT = (content: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    // Parse timing line (format: 00:00:00,000 --> 00:00:00,000)
    const timingLine = lines[1];
    const timeMatch = timingLine.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );

    if (!timeMatch) continue;

    const startTime =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const endTime =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join('\n').trim();

    cues.push({
      id: `cue-${cues.length}`,
      startTime,
      endTime,
      text,
    });
  }

  return cues;
};

/**
 * Parse VTT format subtitles
 */
export const parseVTT = (content: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  const lines = content.trim().split('\n');
  
  let i = 0;
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const timingLine = lines[i];
    const timeMatch = timingLine.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
    );

    if (!timeMatch) {
      // Try format without hours
      const shortMatch = timingLine.match(
        /(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/
      );
      
      if (shortMatch) {
        const startTime =
          parseInt(shortMatch[1]) * 60 +
          parseInt(shortMatch[2]) +
          parseInt(shortMatch[3]) / 1000;

        const endTime =
          parseInt(shortMatch[4]) * 60 +
          parseInt(shortMatch[5]) +
          parseInt(shortMatch[6]) / 1000;

        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i]);
          i++;
        }

        cues.push({
          id: `cue-${cues.length}`,
          startTime,
          endTime,
          text: textLines.join('\n').trim(),
        });
      }
      i++;
      continue;
    }

    const startTime =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const endTime =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
      textLines.push(lines[i]);
      i++;
    }

    cues.push({
      id: `cue-${cues.length}`,
      startTime,
      endTime,
      text: textLines.join('\n').trim(),
    });
  }

  return cues;
};

/**
 * Auto-detect and parse subtitle file
 */
export const parseSubtitles = (content: string, filename: string): SubtitleCue[] => {
  if (filename.endsWith('.vtt') || content.startsWith('WEBVTT')) {
    return parseVTT(content);
  }
  return parseSRT(content);
};

// ==================== SUBTITLE DISPLAY ====================

const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({
  text,
  fontSize,
  backgroundColor,
  position,
}) => {
  const fontSizeMap = {
    small: '16px',
    medium: '22px',
    large: '28px',
  };

  const bgMap = {
    transparent: 'transparent',
    semi: 'rgba(0, 0, 0, 0.6)',
    solid: 'rgba(0, 0, 0, 0.9)',
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      [position]: '40px',
      maxWidth: '80%',
      textAlign: 'center',
      pointerEvents: 'none',
    },
    text: {
      display: 'inline-block',
      padding: '8px 16px',
      background: bgMap[backgroundColor],
      borderRadius: '4px',
      fontSize: fontSizeMap[fontSize],
      fontWeight: 500,
      color: '#fff',
      textShadow: backgroundColor === 'transparent' 
        ? '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)'
        : 'none',
      whiteSpace: 'pre-wrap',
      lineHeight: 1.4,
    },
  };

  // Parse basic HTML tags in subtitles
  const renderText = (rawText: string) => {
    return rawText
      .replace(/<i>/g, '<em>')
      .replace(/<\/i>/g, '</em>')
      .replace(/<b>/g, '<strong>')
      .replace(/<\/b>/g, '</strong>')
      .replace(/<u>/g, '<span style="text-decoration:underline">')
      .replace(/<\/u>/g, '</span>');
  };

  return (
    <div style={styles.container}>
      <span 
        style={styles.text}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderText(text)) }}
      />
    </div>
  );
};

// ==================== SUBTITLE MENU ====================

export const SubtitleMenu: React.FC<SubtitleMenuProps> = ({
  tracks,
  activeTrackId,
  onTrackChange,
  fontSize,
  backgroundColor,
  onFontSizeChange,
  onBackgroundChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-elevated)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      minWidth: '200px',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      borderBottom: '1px solid var(--color-border)',
    },
    headerIcon: {
      color: 'var(--color-text-muted)',
    },
    headerTitle: {
      flex: 1,
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    settingsBtn: {
      width: '24px',
      height: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    list: {
      padding: '4px',
      maxHeight: '200px',
      overflow: 'auto',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      color: 'var(--color-text-secondary)',
      transition: 'background 0.15s',
    },
    itemActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    checkIcon: {
      width: '16px',
      display: 'flex',
      justifyContent: 'center',
    },
    settings: {
      padding: '12px',
      borderTop: '1px solid var(--color-border)',
    },
    settingRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px',
    },
    settingLabel: {
      fontSize: '12px',
      color: 'var(--color-text-muted)',
    },
    buttonGroup: {
      display: 'flex',
      gap: '4px',
    },
    optionBtn: {
      padding: '4px 8px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '4px',
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
    },
    optionBtnActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>{Icons.subtitles}</span>
        <span style={styles.headerTitle}>Subtitles</span>
        <button 
          style={styles.settingsBtn}
          onClick={() => setShowSettings(!showSettings)}
        >
          {Icons.settings}
        </button>
      </div>

      <div style={styles.list}>
        <div 
          style={{
            ...styles.item,
            ...(activeTrackId === null ? styles.itemActive : {}),
          }}
          onClick={() => onTrackChange(null)}
        >
          <span style={styles.checkIcon}>
            {activeTrackId === null && Icons.check}
          </span>
          <span>Off</span>
        </div>

        {tracks.map(track => (
          <div
            key={track.id}
            style={{
              ...styles.item,
              ...(activeTrackId === track.id ? styles.itemActive : {}),
            }}
            onClick={() => onTrackChange(track.id)}
          >
            <span style={styles.checkIcon}>
              {activeTrackId === track.id && Icons.check}
            </span>
            <span>{track.label} ({track.language})</span>
          </div>
        ))}
      </div>

      {showSettings && (
        <div style={styles.settings}>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Size</span>
            <div style={styles.buttonGroup}>
              {(['small', 'medium', 'large'] as const).map(size => (
                <button
                  key={size}
                  style={{
                    ...styles.optionBtn,
                    ...(fontSize === size ? styles.optionBtnActive : {}),
                  }}
                  onClick={() => onFontSizeChange(size)}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Background</span>
            <div style={styles.buttonGroup}>
              {(['transparent', 'semi', 'solid'] as const).map(bg => (
                <button
                  key={bg}
                  style={{
                    ...styles.optionBtn,
                    ...(backgroundColor === bg ? styles.optionBtnActive : {}),
                  }}
                  onClick={() => onBackgroundChange(bg)}
                >
                  {bg.charAt(0).toUpperCase() + bg.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================

export const Subtitles: React.FC<SubtitlesProps> = ({
  currentTime,
  tracks,
  activeTrackId,
  onTrackChange,
  position = 'bottom',
  fontSize = 'medium',
  backgroundColor = 'semi',
}) => {
  // Find active track
  const activeTrack = useMemo(
    () => tracks.find(t => t.id === activeTrackId),
    [tracks, activeTrackId]
  );

  // Find current cue
  const currentCue = useMemo(() => {
    if (!activeTrack) return null;
    
    return activeTrack.cues.find(
      cue => currentTime >= cue.startTime && currentTime <= cue.endTime
    );
  }, [activeTrack, currentTime]);

  if (!currentCue) return null;

  return (
    <SubtitleDisplay
      text={currentCue.text}
      fontSize={fontSize}
      backgroundColor={backgroundColor}
      position={position}
    />
  );
};

// ==================== HOOK: useSubtitles ====================

export const useSubtitles = () => {
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [backgroundColor, setBackgroundColor] = useState<'transparent' | 'semi' | 'solid'>('semi');

  // Load saved preferences
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-subtitle-prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.fontSize) setFontSize(prefs.fontSize);
        if (prefs.backgroundColor) setBackgroundColor(prefs.backgroundColor);
      }
    } catch { /* subtitle parse failed */ }
  }, []);

  // Save preferences
  const savePrefs = useCallback(() => {
    try {
      localStorage.setItem('dex-subtitle-prefs', JSON.stringify({
        fontSize,
        backgroundColor,
      }));
    } catch { /* subtitle parse failed */ }
  }, [fontSize, backgroundColor]);

  useEffect(() => {
    savePrefs();
  }, [savePrefs]);

  const loadSubtitleFile = useCallback(async (file: File): Promise<SubtitleTrack> => {
    const content = await file.text();
    const cues = parseSubtitles(content, file.name);
    
    // Extract language from filename if possible
    const langMatch = file.name.match(/\.([a-z]{2,3})\.(srt|vtt)$/i);
    const language = langMatch ? langMatch[1].toUpperCase() : 'Unknown';
    const label = file.name.replace(/\.(srt|vtt)$/i, '');

    const track: SubtitleTrack = {
      id: `track-${Date.now()}`,
      label,
      language,
      cues,
      isActive: false,
    };

    setTracks(prev => [...prev, track]);
    return track;
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
    if (activeTrackId === trackId) {
      setActiveTrackId(null);
    }
  }, [activeTrackId]);

  const changeTrack = useCallback((trackId: string | null) => {
    setActiveTrackId(trackId);
  }, []);

  return {
    tracks,
    activeTrackId,
    fontSize,
    backgroundColor,
    loadSubtitleFile,
    removeTrack,
    changeTrack,
    setFontSize,
    setBackgroundColor,
  };
};

export default Subtitles;
