/**
 * DEX Video Recorder Component
 * Recording video with camera preview
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PlayIcon, PauseIcon } from '../utils/icons';

// ==================== TYPES ====================

interface VideoRecorderProps {
  onRecordingComplete: (blob: Blob, url: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  maxDuration?: number; // in seconds
  showTimer?: boolean;
  showPreview?: boolean;
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  muted?: boolean;
}

interface VideoPreviewProps {
  url: string;
  width?: number | string;
  height?: number | string;
  autoPlay?: boolean;
  controls?: boolean;
  onEnded?: () => void;
}

interface CameraSelectProps {
  selectedDeviceId?: string;
  onSelect: (deviceId: string) => void;
}

interface ScreenRecorderProps {
  onRecordingComplete: (blob: Blob, url: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  maxDuration?: number;
  includeAudio?: boolean;
}

// ==================== VIDEO RECORDER ====================

export const VideoRecorder: React.FC<VideoRecorderProps> = ({
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  maxDuration = 300,
  showTimer = true,
  showPreview = true,
  facingMode = 'user',
  width = 640,
  height = 480,
  muted = true,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: true,
      });

      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setHasPermission(false);
      setError(err instanceof Error ? err.message : 'Failed to access camera');
    }
  }, [facingMode, width, height]);

  useEffect(() => {
    initializeCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [initializeCamera]);

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      onRecordingComplete(blob, url);
      onRecordingStop?.();
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100);
    setIsRecording(true);
    setDuration(0);
    onRecordingStart?.();

    timerRef.current = setInterval(() => {
      setDuration(prev => {
        if (prev >= maxDuration) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
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
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Failed to switch camera');
    }
  };

  const progressPercent = (duration / maxDuration) * 100;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: 16,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
    },
    videoContainer: {
      position: 'relative',
      width: '100%',
      maxWidth: width,
      borderRadius: 8,
      overflow: 'hidden',
      background: '#000',
    },
    video: {
      width: '100%',
      height: 'auto',
      display: 'block',
      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      padding: 12,
      pointerEvents: 'none',
    },
    timer: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      background: 'rgba(0, 0, 0, 0.6)',
      borderRadius: 20,
      color: '#fff',
      fontSize: 14,
      fontFamily: 'monospace',
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#ef4444',
      animation: 'pulse 1s ease-in-out infinite',
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
      transition: 'width 1s linear',
    },
    controls: {
      display: 'flex',
      gap: 16,
      alignItems: 'center',
    },
    button: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      transition: 'all 0.15s',
    },
    recordButton: {
      background: isRecording ? '#ef4444' : 'var(--color-accent)',
      color: '#fff',
    },
    controlButton: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text)',
      width: 44,
      height: 44,
      fontSize: 16,
    },
    error: {
      color: '#ef4444',
      fontSize: 13,
      textAlign: 'center',
    },
    noCamera: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: height,
      gap: 12,
      color: 'var(--color-text-muted)',
    },
  };

  if (hasPermission === false) {
    return (
      <div style={styles.container}>
        <div style={styles.noCamera}>
          <span style={{ fontSize: 40 }}>camera</span>
          <p>Camera access denied</p>
          <button
            style={{ ...styles.button, ...styles.controlButton }}
            onClick={initializeCamera}
          >
            Retry
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.videoContainer}>
        {showPreview && (
          <video
            ref={videoRef}
            style={styles.video}
            autoPlay
            playsInline
            muted={muted}
          />
        )}

        {isRecording && showTimer && (
          <div style={styles.overlay}>
            <div style={styles.timer}>
              {!isPaused && <div style={styles.recordingDot} />}
              {formatDuration(duration)}
            </div>
          </div>
        )}
      </div>

      {isRecording && (
        <div style={styles.progressContainer}>
          <div style={styles.progress} />
        </div>
      )}

      <div style={styles.controls}>
        <button
          style={{ ...styles.button, ...styles.controlButton }}
          onClick={switchCamera}
          title="Switch Camera"
        >
          refresh-cw
        </button>

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

      {error && <p style={styles.error}>{error}</p>}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

// ==================== VIDEO PREVIEW ====================

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  url,
  width = '100%',
  height = 'auto',
  autoPlay = false,
  controls = true,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#000',
    },
    video: {
      width,
      height,
      display: 'block',
    },
  };

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        src={url}
        style={styles.video}
        autoPlay={autoPlay}
        controls={controls}
        onEnded={onEnded}
      />
    </div>
  );
};

// ==================== CAMERA SELECT ====================

export const CameraSelect: React.FC<CameraSelectProps> = ({
  selectedDeviceId,
  onSelect,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ video: true });

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
      } catch (err) {
        console.error('Failed to load devices:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDevices();
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    select: {
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      color: 'var(--color-text)',
      fontSize: 14,
      cursor: 'pointer',
      minWidth: 200,
    },
  };

  if (loading) {
    return <span>Loading cameras...</span>;
  }

  if (devices.length === 0) {
    return <span>No cameras found</span>;
  }

  return (
    <select
      style={styles.select}
      value={selectedDeviceId || ''}
      onChange={(e) => onSelect(e.target.value)}
    >
      {devices.map((device, index) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label || `Camera ${index + 1}`}
        </option>
      ))}
    </select>
  );
};

// ==================== SCREEN RECORDER ====================

export const ScreenRecorder: React.FC<ScreenRecorderProps> = ({
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  maxDuration = 1800,
  includeAudio = true,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      setError(null);

      // Get screen stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: includeAudio,
      });

      let finalStream = screenStream;

      // Add microphone if requested
      if (includeAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

          const tracks = [
            ...screenStream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ];
          finalStream = new MediaStream(tracks);
        } catch {
          // Continue without microphone
        }
      }

      streamRef.current = finalStream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType: 'video/webm',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        onRecordingComplete(blob, url);
        onRecordingStop?.();
      };

      // Handle stream ending (user stops sharing)
      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      onRecordingStart?.();

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
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Screen sharing was cancelled');
      } else {
        setError('Failed to start screen recording');
      }
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
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

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
    icon: {
      fontSize: 48,
      marginBottom: 8,
    },
    timer: {
      fontSize: 32,
      fontWeight: 600,
      fontFamily: 'monospace',
      color: isRecording ? '#ef4444' : 'var(--color-text)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    recordingDot: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: '#ef4444',
      animation: 'pulse 1s ease-in-out infinite',
    },
    button: {
      padding: '12px 24px',
      background: isRecording ? '#ef4444' : 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'all 0.15s',
    },
    status: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
    error: {
      color: '#ef4444',
      fontSize: 13,
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.icon}>monitor</span>

      <div style={styles.timer}>
        {isRecording && <div style={styles.recordingDot} />}
        {formatDuration(duration)}
      </div>

      <button style={styles.button} onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? (
          <>■ Stop Recording</>
        ) : (
          <>● Start Screen Recording</>
        )}
      </button>

      <span style={styles.status}>
        {isRecording
          ? 'Recording screen...'
          : 'Click to select screen or window to record'}
      </span>

      {error && <p style={styles.error}>{error}</p>}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

// ==================== USE VIDEO RECORDER HOOK ====================

export const useVideoRecorder = (options: {
  onRecordingComplete?: (blob: Blob, url: string) => void;
  maxDuration?: number;
} = {}) => {
  const { onRecordingComplete, maxDuration = 300 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const initializeCamera = async (constraints?: MediaStreamConstraints) => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints || { video: true, audio: true }
      );
      setStream(mediaStream);
      return mediaStream;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      return null;
    }
  };

  const startRecording = useCallback(() => {
    if (!stream) return;

    chunksRef.current = [];

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
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
  }, [stream, maxDuration, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
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

  const cleanup = useCallback(() => {
    stopRecording();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream, stopRecording]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    stream,
    isRecording,
    isPaused,
    duration,
    error,
    initializeCamera,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cleanup,
  };
};

export default VideoRecorder;
