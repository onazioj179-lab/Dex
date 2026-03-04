/**
 * DEX Audio Recorder Component
 * Recording audio with visualization
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PlayIcon, PauseIcon } from '../utils/icons';

// ==================== TYPES ====================

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, url: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  maxDuration?: number; // in seconds
  showVisualization?: boolean;
  showTimer?: boolean;
  audioConstraints?: MediaTrackConstraints;
}

interface AudioRecording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  createdAt: Date;
  name: string;
}

interface AudioRecordingsListProps {
  recordings: AudioRecording[];
  onDelete?: (id: string) => void;
  onPlay?: (recording: AudioRecording) => void;
  onDownload?: (recording: AudioRecording) => void;
  currentlyPlaying?: string | null;
}

interface VoiceNoteProps {
  onRecordingComplete: (blob: Blob, url: string) => void;
  maxDuration?: number;
  placeholder?: string;
}

// ==================== AUDIO RECORDER ====================

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  maxDuration = 300,
  showVisualization = true,
  showTimer = true,
  audioConstraints = {},
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startVisualization = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setAudioLevel(0);
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...audioConstraints,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        onRecordingComplete(blob, url);
        onRecordingStop?.();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      onRecordingStart?.();

      if (showVisualization) {
        startVisualization(stream);
      }

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access microphone');
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    stopVisualization();
    setIsRecording(false);
    setIsPaused(false);
  }, [stopVisualization]);

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      stopVisualization();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      if (showVisualization && streamRef.current) {
        startVisualization(streamRef.current);
      }
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const progressPercent = (duration / maxDuration) * 100;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: 24,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
    },
    visualization: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: 60,
      width: 200,
    },
    bar: {
      width: 4,
      background: 'var(--color-accent)',
      borderRadius: 2,
      transition: 'height 0.1s ease',
    },
    timer: {
      fontSize: 32,
      fontWeight: 600,
      fontFamily: 'monospace',
      color: isRecording && !isPaused ? 'var(--color-accent)' : 'var(--color-text)',
    },
    progressContainer: {
      width: '100%',
      height: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 2,
      overflow: 'hidden',
    },
    progress: {
      height: '100%',
      background: progressPercent > 90 ? '#ef4444' : 'var(--color-accent)',
      width: `${progressPercent}%`,
      transition: 'width 1s linear, background 0.3s',
    },
    controls: {
      display: 'flex',
      gap: 12,
    },
    button: {
      width: 60,
      height: 60,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      transition: 'all 0.15s',
    },
    recordButton: {
      background: isRecording ? '#ef4444' : 'var(--color-accent)',
      color: '#fff',
    },
    controlButton: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text)',
    },
    error: {
      color: '#ef4444',
      fontSize: 13,
      textAlign: 'center',
    },
    status: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  // Generate visualization bars
  const bars = Array.from({ length: 20 }, (_, i) => {
    const baseHeight = 10;
    const variance = Math.sin((i / 20) * Math.PI) * 40;
    const height = baseHeight + (audioLevel * variance);
    return (
      <div
        key={i}
        style={{
          ...styles.bar,
          height: isRecording && !isPaused ? height : baseHeight,
        }}
      />
    );
  });

  return (
    <div style={styles.container}>
      {showVisualization && (
        <div style={styles.visualization}>
          {bars}
        </div>
      )}

      {showTimer && (
        <div style={styles.timer}>
          {formatDuration(duration)}
        </div>
      )}

      <div style={styles.progressContainer}>
        <div style={styles.progress} />
      </div>

      <div style={styles.controls}>
        {isRecording ? (
          <>
            <button
              style={{ ...styles.button, ...styles.controlButton }}
              onClick={isPaused ? resumeRecording : pauseRecording}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button
              style={{ ...styles.button, ...styles.recordButton }}
              onClick={stopRecording}
              title="Stop"
            >
              ■
            </button>
          </>
        ) : (
          <button
            style={{ ...styles.button, ...styles.recordButton }}
            onClick={startRecording}
            title="Start Recording"
          >
            ●
          </button>
        )}
      </div>

      <span style={styles.status}>
        {isRecording
          ? isPaused
            ? 'Paused'
            : 'Recording...'
          : 'Click to start recording'}
      </span>

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
};

// ==================== RECORDINGS LIST ====================

export const AudioRecordingsList: React.FC<AudioRecordingsListProps> = ({
  recordings,
  onDelete,
  onPlay,
  onDownload,
  currentlyPlaying,
}) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: 'var(--color-text-muted)',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
    },
    itemPlaying: {
      borderColor: 'var(--color-accent)',
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    playButton: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      flexShrink: 0,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    meta: {
      display: 'flex',
      gap: 12,
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 2,
    },
    actions: {
      display: 'flex',
      gap: 8,
    },
    actionButton: {
      padding: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
      borderRadius: 4,
      transition: 'color 0.15s',
    },
  };

  if (recordings.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No recordings yet</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {recordings.map(recording => (
        <div
          key={recording.id}
          style={{
            ...styles.item,
            ...(currentlyPlaying === recording.id ? styles.itemPlaying : {}),
          }}
        >
          <button
            style={styles.playButton}
            onClick={() => onPlay?.(recording)}
          >
            {currentlyPlaying === recording.id ? <PauseIcon /> : <PlayIcon />}
          </button>

          <div style={styles.info}>
            <p style={styles.name}>{recording.name}</p>
            <div style={styles.meta}>
              <span>{formatDuration(recording.duration)}</span>
              <span>{formatSize(recording.blob.size)}</span>
              <span>{formatDate(recording.createdAt)}</span>
            </div>
          </div>

          <div style={styles.actions}>
            {onDownload && (
              <button
                style={styles.actionButton}
                onClick={() => onDownload(recording)}
                title="Download"
              >
                arrow-down
              </button>
            )}
            {onDelete && (
              <button
                style={styles.actionButton}
                onClick={() => onDelete(recording.id)}
                title="Delete"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== VOICE NOTE ====================

export const VoiceNote: React.FC<VoiceNoteProps> = ({
  onRecordingComplete,
  maxDuration = 60,
  placeholder = 'Hold to record',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        onRecordingComplete(blob, url);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
    setDuration(0);
  };

  const handleMouseDown = () => startRecording();
  const handleMouseUp = () => stopRecording();
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    startRecording();
  };
  const handleTouchEnd = () => stopRecording();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    button: {
      width: 48,
      height: 48,
      borderRadius: '50%',
      background: isRecording ? '#ef4444' : 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      transition: 'all 0.15s',
      transform: isRecording ? 'scale(1.1)' : 'scale(1)',
    },
    indicator: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      color: isRecording ? '#ef4444' : 'var(--color-text-muted)',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#ef4444',
      animation: 'pulse 1s ease-in-out infinite',
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={styles.button}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        mic
      </button>
      <div style={styles.indicator}>
        {isRecording ? (
          <>
            <div style={styles.dot} />
            <span>
              {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}
            </span>
          </>
        ) : (
          placeholder
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

// ==================== USE AUDIO RECORDER HOOK ====================

export const useAudioRecorder = (options: {
  onRecordingComplete?: (blob: Blob, url: string) => void;
  maxDuration?: number;
} = {}) => {
  const { onRecordingComplete, maxDuration = 300 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        onRecordingComplete?.(blob, url);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isPaused,
    duration,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
};

export default AudioRecorder;
