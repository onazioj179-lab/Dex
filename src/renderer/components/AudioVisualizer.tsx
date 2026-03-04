/**
 * DEX Audio Visualizer
 * Real-time audio visualization components
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';


// ==================== TYPES ====================

interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement | null;
  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  type?: 'bars' | 'wave' | 'circle' | 'spectrum';
  width?: number;
  height?: number;
  barCount?: number;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  color?: string;
  gradientColors?: string[];
  smoothing?: number;
  mirror?: boolean;
  responsive?: boolean;
}

interface WaveformProps {
  audioBuffer?: AudioBuffer;
  progress?: number;
  width?: number;
  height?: number;
  color?: string;
  progressColor?: string;
  onClick?: (progress: number) => void;
}

// ==================== AUDIO VISUALIZER ====================

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioElement,
  audioContext: externalContext,
  analyser: externalAnalyser,
  type = 'bars',
  width = 300,
  height = 100,
  barCount = 32,
  barWidth = 4,
  barGap = 2,
  barRadius = 2,
  color = 'var(--color-accent)',
  gradientColors,
  smoothing = 0.8,
  mirror = false,
  responsive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [dimensions, setDimensions] = useState({ width, height });

  // Setup audio analysis
  useEffect(() => {
    if (externalAnalyser) {
      analyserRef.current = externalAnalyser;
      return;
    }

    if (!audioElement) return;

    try {
      const context = externalContext || new AudioContext();
      audioContextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = smoothing;
      analyserRef.current = analyser;

      // Only create source if not already connected
      if (!sourceRef.current) {
        const source = context.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(context.destination);
        sourceRef.current = source;
      }
    } catch (error) {
      console.error('Failed to setup audio visualizer:', error);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement, externalContext, externalAnalyser, smoothing]);

  // Handle responsive sizing
  useEffect(() => {
    if (!responsive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height || height,
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [responsive, height]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Create gradient if specified
      let fillStyle: string | CanvasGradient = color;
      if (gradientColors && gradientColors.length >= 2) {
        const gradient = ctx.createLinearGradient(0, dimensions.height, 0, 0);
        gradientColors.forEach((c, i) => {
          gradient.addColorStop(i / (gradientColors.length - 1), c);
        });
        fillStyle = gradient;
      }
      ctx.fillStyle = fillStyle;

      switch (type) {
        case 'bars':
          drawBars(ctx, dataArray, bufferLength);
          break;
        case 'wave':
          drawWave(ctx, dataArray, bufferLength);
          break;
        case 'circle':
          drawCircle(ctx, dataArray, bufferLength);
          break;
        case 'spectrum':
          drawSpectrum(ctx, dataArray, bufferLength);
          break;
      }
    };

    const drawBars = (ctx: CanvasRenderingContext2D, data: Uint8Array, length: number) => {
      const step = Math.floor(length / barCount);
      const totalBarWidth = barWidth + barGap;
      const startX = (dimensions.width - barCount * totalBarWidth + barGap) / 2;

      for (let i = 0; i < barCount; i++) {
        const value = data[i * step] / 255;
        const barHeight = value * dimensions.height * 0.9;
        const x = startX + i * totalBarWidth;
        const y = mirror ? (dimensions.height - barHeight) / 2 : dimensions.height - barHeight;
        const h = mirror ? barHeight * 2 : barHeight;

        if (barRadius > 0) {
          roundRect(ctx, x, y, barWidth, h, barRadius);
        } else {
          ctx.fillRect(x, y, barWidth, h);
        }
      }
    };

    const drawWave = (ctx: CanvasRenderingContext2D, data: Uint8Array, length: number) => {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;

      const sliceWidth = dimensions.width / length;
      let x = 0;

      for (let i = 0; i < length; i++) {
        const value = data[i] / 255;
        const y = (1 - value) * dimensions.height * 0.5 + dimensions.height * 0.25;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
    };

    const drawCircle = (ctx: CanvasRenderingContext2D, data: Uint8Array, length: number) => {
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      const radius = Math.min(centerX, centerY) * 0.6;

      for (let i = 0; i < barCount; i++) {
        const value = data[Math.floor(i * length / barCount)] / 255;
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const barHeight = value * radius * 0.8;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.beginPath();
        ctx.lineWidth = barWidth;
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };

    const drawSpectrum = (ctx: CanvasRenderingContext2D, data: Uint8Array, length: number) => {
      const gradient = ctx.createLinearGradient(0, 0, dimensions.width, 0);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(0.17, '#ff8000');
      gradient.addColorStop(0.33, '#ffff00');
      gradient.addColorStop(0.5, '#00ff00');
      gradient.addColorStop(0.67, '#00ffff');
      gradient.addColorStop(0.83, '#0000ff');
      gradient.addColorStop(1, '#8000ff');

      ctx.fillStyle = gradient;

      const sliceWidth = dimensions.width / length;

      for (let i = 0; i < length; i++) {
        const value = data[i] / 255;
        const barHeight = value * dimensions.height;
        const x = i * sliceWidth;
        const y = dimensions.height - barHeight;

        ctx.fillRect(x, y, sliceWidth - 1, barHeight);
      }
    };

    const roundRect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [dimensions, type, barCount, barWidth, barGap, barRadius, color, gradientColors, mirror]);

  const styles: React.CSSProperties = {
    width: responsive ? '100%' : dimensions.width,
    height: responsive ? '100%' : dimensions.height,
    display: 'block',
  };

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      style={styles}
    />
  );
};

// ==================== WAVEFORM ====================

export const Waveform: React.FC<WaveformProps> = ({
  audioBuffer,
  progress = 0,
  width = 400,
  height = 80,
  color = 'var(--color-text-muted)',
  progressColor = 'var(--color-accent)',
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amplitude = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw background waveform
    ctx.fillStyle = color;
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const barHeight = Math.max(2, (max - min) * amplitude);
      const y = (1 + min) * amplitude;

      ctx.fillRect(i, y, 1, barHeight);
    }

    // Draw progress overlay
    if (progress > 0) {
      const progressWidth = width * progress;
      ctx.fillStyle = progressColor;

      for (let i = 0; i < progressWidth; i++) {
        let min = 1.0;
        let max = -1.0;

        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }

        const barHeight = Math.max(2, (max - min) * amplitude);
        const y = (1 + min) * amplitude;

        ctx.fillRect(i, y, 1, barHeight);
      }
    }
  }, [audioBuffer, width, height, progress, color, progressColor]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newProgress = x / width;
    onClick(newProgress);
  };

  const styles: React.CSSProperties = {
    cursor: onClick ? 'pointer' : 'default',
    display: 'block',
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={styles}
      onClick={handleClick}
    />
  );
};

// ==================== SIMPLE BARS (No Audio API) ====================

interface SimpleVisualizerProps {
  values?: number[];
  barCount?: number;
  width?: number;
  height?: number;
  color?: string;
  animated?: boolean;
}

export const SimpleVisualizer: React.FC<SimpleVisualizerProps> = ({
  values,
  barCount = 20,
  width = 200,
  height = 60,
  color = 'var(--color-accent)',
  animated = true,
}) => {
  const [internalValues, setInternalValues] = useState<number[]>(
    Array(barCount).fill(0).map(() => Math.random())
  );

  useEffect(() => {
    if (values) {
      setInternalValues(values);
      return;
    }

    if (!animated) return;

    const interval = setInterval(() => {
      setInternalValues(prev =>
        prev.map(v => {
          const delta = (Math.random() - 0.5) * 0.3;
          return Math.max(0.1, Math.min(1, v + delta));
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, [values, animated, barCount]);

  const barWidth = (width - (barCount - 1) * 2) / barCount;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 2,
      height,
      width,
    },
    bar: {
      width: barWidth,
      background: color,
      borderRadius: 2,
      transition: animated ? 'height 0.1s ease' : 'none',
    },
  };

  return (
    <div style={styles.container}>
      {internalValues.slice(0, barCount).map((value, i) => (
        <div
          key={i}
          style={{
            ...styles.bar,
            height: `${Math.max(4, value * height)}px`,
          }}
        />
      ))}
    </div>
  );
};

// ==================== HOOK: useAudioAnalyser ====================

export const useAudioAnalyser = (audioElement: HTMLAudioElement | null) => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (!audioElement) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);

    return () => {
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('pause', handlePause);
    };
  }, [audioElement]);

  const initializeAnalyser = useCallback(() => {
    if (!audioElement || sourceRef.current) return;

    try {
      const context = new AudioContext();
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8;

      const source = context.createMediaElementSource(audioElement);
      source.connect(analyserNode);
      analyserNode.connect(context.destination);

      sourceRef.current = source;
      setAudioContext(context);
      setAnalyser(analyserNode);
    } catch (error) {
      console.error('Failed to initialize audio analyser:', error);
    }
  }, [audioElement]);

  const getFrequencyData = useCallback(() => {
    if (!analyser) return new Uint8Array(0);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }, [analyser]);

  const getTimeDomainData = useCallback(() => {
    if (!analyser) return new Uint8Array(0);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    return data;
  }, [analyser]);

  return {
    audioContext,
    analyser,
    isPlaying,
    initializeAnalyser,
    getFrequencyData,
    getTimeDomainData,
  };
};

export default AudioVisualizer;
