/**
 * DEX Slider & Range Components
 * Sliders, range inputs, and value pickers
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ==================== TYPES ====================

interface SliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  showValue?: boolean;
  showTicks?: boolean;
  tickCount?: number;
  label?: string;
  formatValue?: (value: number) => string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  orientation?: 'horizontal' | 'vertical';
}

interface RangeSliderProps {
  values?: [number, number];
  defaultValues?: [number, number];
  min?: number;
  max?: number;
  step?: number;
  minRange?: number;
  onChange?: (values: [number, number]) => void;
  onChangeEnd?: (values: [number, number]) => void;
  disabled?: boolean;
  showValues?: boolean;
  label?: string;
  formatValue?: (value: number) => string;
}

interface ColorSliderProps {
  value?: string;
  onChange?: (color: string) => void;
  type?: 'hue' | 'saturation' | 'lightness' | 'alpha';
  baseColor?: string;
}

interface VolumeSliderProps {
  value?: number;
  onChange?: (value: number) => void;
  muted?: boolean;
  onMuteToggle?: (muted: boolean) => void;
  showIcon?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

// ==================== SLIDER ====================

export const Slider: React.FC<SliderProps> = ({
  value: controlledValue,
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChangeEnd,
  disabled = false,
  showValue = true,
  showTicks = false,
  tickCount = 5,
  label,
  formatValue = v => String(v),
  size = 'md',
  color = 'var(--color-accent)',
  orientation = 'horizontal',
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const value = controlledValue ?? internalValue;
  const isHorizontal = orientation === 'horizontal';

  const sizeConfig = {
    sm: { track: 4, thumb: 12, fontSize: 11 },
    md: { track: 6, thumb: 16, fontSize: 13 },
    lg: { track: 8, thumb: 20, fontSize: 14 },
  };

  const config = sizeConfig[size];
  const percentage = ((value - min) / (max - min)) * 100;

  const updateValue = useCallback((clientX: number, clientY: number) => {
    if (!trackRef.current || disabled) return;

    const rect = trackRef.current.getBoundingClientRect();
    let newPercentage: number;

    if (isHorizontal) {
      newPercentage = ((clientX - rect.left) / rect.width) * 100;
    } else {
      newPercentage = 100 - ((clientY - rect.top) / rect.height) * 100;
    }

    newPercentage = Math.max(0, Math.min(100, newPercentage));
    const rawValue = (newPercentage / 100) * (max - min) + min;
    const steppedValue = Math.round(rawValue / step) * step;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));

    setInternalValue(clampedValue);
    onChange?.(clampedValue);
  }, [disabled, isHorizontal, max, min, step, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    setIsDragging(true);
    updateValue(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onChangeEnd?.(value);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateValue, onChangeEnd, value]);

  const ticks = showTicks
    ? Array.from({ length: tickCount }, (_, i) => {
        const tickValue = min + (i / (tickCount - 1)) * (max - min);
        return {
          value: tickValue,
          percentage: (i / (tickCount - 1)) * 100,
        };
      })
    : [];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: isHorizontal ? '100%' : 'auto',
      height: isHorizontal ? 'auto' : 200,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: config.fontSize,
      color: 'var(--color-text-secondary)',
      margin: 0,
    },
    valueDisplay: {
      fontSize: config.fontSize,
      fontWeight: 500,
      color: 'var(--color-text)',
      fontFamily: 'monospace',
    },
    trackWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isHorizontal ? `${config.thumb / 2}px 0` : `0 ${config.thumb / 2}px`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      width: isHorizontal ? '100%' : config.track + config.thumb,
      height: isHorizontal ? config.track + config.thumb : '100%',
    },
    track: {
      position: 'relative',
      background: 'var(--color-bg-tertiary)',
      borderRadius: config.track / 2,
      width: isHorizontal ? '100%' : config.track,
      height: isHorizontal ? config.track : '100%',
    },
    fill: {
      position: 'absolute',
      background: disabled ? 'var(--color-text-muted)' : color,
      borderRadius: config.track / 2,
      ...(isHorizontal
        ? { left: 0, top: 0, bottom: 0, width: `${percentage}%` }
        : { left: 0, right: 0, bottom: 0, height: `${percentage}%` }),
    },
    thumb: {
      position: 'absolute',
      width: config.thumb,
      height: config.thumb,
      background: '#fff',
      border: `2px solid ${disabled ? 'var(--color-text-muted)' : color}`,
      borderRadius: '50%',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      transform: 'translate(-50%, -50%)',
      cursor: disabled ? 'not-allowed' : 'grab',
      zIndex: 2,
      ...(isHorizontal
        ? { left: `${percentage}%`, top: '50%' }
        : { bottom: `${percentage}%`, left: '50%', transform: 'translate(-50%, 50%)' }),
    },
    ticks: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    tick: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      {(label || showValue) && (
        <div style={styles.header}>
          {label && <span style={styles.label}>{label}</span>}
          {showValue && (
            <span style={styles.valueDisplay}>{formatValue(value)}</span>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        style={styles.trackWrapper}
        onMouseDown={handleMouseDown}
      >
        <div style={styles.track}>
          <div style={styles.fill} />
          <div style={styles.thumb} />
        </div>
      </div>

      {showTicks && isHorizontal && (
        <div style={styles.ticks}>
          {ticks.map(tick => (
            <span key={tick.value} style={styles.tick}>
              {formatValue(tick.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== RANGE SLIDER ====================

export const RangeSlider: React.FC<RangeSliderProps> = ({
  values: controlledValues,
  defaultValues = [25, 75],
  min = 0,
  max = 100,
  step = 1,
  minRange = 0,
  onChange,
  onChangeEnd,
  disabled = false,
  showValues = true,
  label,
  formatValue = v => String(v),
}) => {
  const [internalValues, setInternalValues] = useState(defaultValues);
  const [activeThumb, setActiveThumb] = useState<0 | 1 | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const values = controlledValues ?? internalValues;
  const [minVal, maxVal] = values;
  const minPercentage = ((minVal - min) / (max - min)) * 100;
  const maxPercentage = ((maxVal - min) / (max - min)) * 100;

  const updateValue = useCallback((clientX: number, thumb: 0 | 1) => {
    if (!trackRef.current || disabled) return;

    const rect = trackRef.current.getBoundingClientRect();
    const percentage = ((clientX - rect.left) / rect.width) * 100;
    const rawValue = (percentage / 100) * (max - min) + min;
    const steppedValue = Math.round(rawValue / step) * step;

    setInternalValues(prev => {
      const newValues: [number, number] = [...prev];

      if (thumb === 0) {
        newValues[0] = Math.max(min, Math.min(steppedValue, newValues[1] - minRange));
      } else {
        newValues[1] = Math.max(newValues[0] + minRange, Math.min(steppedValue, max));
      }

      onChange?.(newValues);
      return newValues;
    });
  }, [disabled, max, min, step, minRange, onChange]);

  useEffect(() => {
    if (activeThumb === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX, activeThumb);
    };

    const handleMouseUp = () => {
      setActiveThumb(null);
      onChangeEnd?.(values);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeThumb, updateValue, onChangeEnd, values]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
    },
    values: {
      display: 'flex',
      gap: 8,
      fontSize: 13,
      fontWeight: 500,
      fontFamily: 'monospace',
      color: 'var(--color-text)',
    },
    trackWrapper: {
      position: 'relative',
      height: 24,
      cursor: disabled ? 'not-allowed' : 'pointer',
    },
    track: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      height: 6,
      transform: 'translateY(-50%)',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 3,
    },
    fill: {
      position: 'absolute',
      top: '50%',
      height: 6,
      transform: 'translateY(-50%)',
      background: disabled ? 'var(--color-text-muted)' : 'var(--color-accent)',
      borderRadius: 3,
      left: `${minPercentage}%`,
      right: `${100 - maxPercentage}%`,
    },
    thumb: {
      position: 'absolute',
      top: '50%',
      width: 16,
      height: 16,
      background: '#fff',
      border: `2px solid ${disabled ? 'var(--color-text-muted)' : 'var(--color-accent)'}`,
      borderRadius: '50%',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      transform: 'translate(-50%, -50%)',
      cursor: disabled ? 'not-allowed' : 'grab',
      zIndex: 2,
    },
  };

  return (
    <div style={styles.container}>
      {(label || showValues) && (
        <div style={styles.header}>
          {label && <span style={styles.label}>{label}</span>}
          {showValues && (
            <div style={styles.values}>
              <span>{formatValue(minVal)}</span>
              <span>-</span>
              <span>{formatValue(maxVal)}</span>
            </div>
          )}
        </div>
      )}

      <div ref={trackRef} style={styles.trackWrapper}>
        <div style={styles.track} />
        <div style={styles.fill} />
        <div
          style={{ ...styles.thumb, left: `${minPercentage}%` }}
          onMouseDown={() => !disabled && setActiveThumb(0)}
        />
        <div
          style={{ ...styles.thumb, left: `${maxPercentage}%` }}
          onMouseDown={() => !disabled && setActiveThumb(1)}
        />
      </div>
    </div>
  );
};

// ==================== COLOR SLIDER ====================

export const ColorSlider: React.FC<ColorSliderProps> = ({
  value,
  onChange,
  type = 'hue',
  baseColor = '#ff0000',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const getGradient = (): string => {
    switch (type) {
      case 'hue':
        return 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
      case 'saturation':
        return `linear-gradient(to right, #808080, ${baseColor})`;
      case 'lightness':
        return `linear-gradient(to right, #000000, ${baseColor}, #ffffff)`;
      case 'alpha':
        return `linear-gradient(to right, transparent, ${baseColor})`;
      default:
        return 'linear-gradient(to right, #000, #fff)';
    }
  };

  const getPosition = (): number => {
    if (!value) return 0;
    // Simplified - in real app, parse the color value
    return 50;
  };

  const updateValue = useCallback((clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

    // Simplified - in real app, calculate actual color
    if (type === 'hue') {
      const hue = Math.round((percentage / 100) * 360);
      onChange?.(`hsl(${hue}, 100%, 50%)`);
    }
  }, [type, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateValue(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updateValue(e.clientX);
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateValue]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      height: 16,
      borderRadius: 8,
      background: type === 'alpha'
        ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px'
        : 'none',
      cursor: 'pointer',
    },
    track: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 8,
      background: getGradient(),
    },
    thumb: {
      position: 'absolute',
      top: '50%',
      left: `${getPosition()}%`,
      width: 18,
      height: 18,
      background: '#fff',
      border: '2px solid #fff',
      borderRadius: '50%',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
      transform: 'translate(-50%, -50%)',
      cursor: 'grab',
    },
  };

  return (
    <div
      ref={trackRef}
      style={styles.container}
      onMouseDown={handleMouseDown}
    >
      <div style={styles.track} />
      <div style={styles.thumb} />
    </div>
  );
};

// ==================== VOLUME SLIDER ====================

export const VolumeSlider: React.FC<VolumeSliderProps> = ({
  value = 50,
  onChange,
  muted = false,
  onMuteToggle,
  showIcon = true,
  orientation = 'horizontal',
}) => {
  const isHorizontal = orientation === 'horizontal';

  const getVolumeIcon = (): string => {
    if (muted || value === 0) return 'volume-x';
    if (value < 33) return 'volume';
    if (value < 66) return 'volume-1';
    return 'volume-2';
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      alignItems: 'center',
      gap: 8,
    },
    icon: {
      fontSize: 18,
      cursor: 'pointer',
      userSelect: 'none',
    },
    sliderWrapper: {
      width: isHorizontal ? 100 : 'auto',
      height: isHorizontal ? 'auto' : 100,
    },
  };

  return (
    <div style={styles.container}>
      {showIcon && (
        <span
          style={styles.icon}
          onClick={() => onMuteToggle?.(!muted)}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {getVolumeIcon()}
        </span>
      )}
      <div style={styles.sliderWrapper}>
        <Slider
          value={muted ? 0 : value}
          min={0}
          max={100}
          onChange={v => {
            if (muted && v > 0) onMuteToggle?.(false);
            onChange?.(v);
          }}
          showValue={false}
          size="sm"
          orientation={orientation}
        />
      </div>
    </div>
  );
};

// ==================== STAR RATING ====================

interface StarRatingProps {
  value?: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  allowHalf?: boolean;
  color?: string;
  emptyColor?: string;
}

export const StarRating: React.FC<StarRatingProps> = ({
  value = 0,
  max = 5,
  onChange,
  size = 'md',
  readonly = false,
  allowHalf = false,
  color = '#f59e0b',
  emptyColor = 'var(--color-bg-tertiary)',
}) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const sizeConfig = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const starSize = sizeConfig[size];
  const displayValue = hoverValue ?? value;

  const handleClick = (index: number, isHalf: boolean) => {
    if (readonly) return;
    const newValue = allowHalf && isHalf ? index + 0.5 : index + 1;
    onChange?.(newValue);
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isHalf = (e.clientX - rect.left) < rect.width / 2;
    setHoverValue(allowHalf && isHalf ? index + 0.5 : index + 1);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 2,
    },
    star: {
      position: 'relative',
      width: starSize,
      height: starSize,
      cursor: readonly ? 'default' : 'pointer',
    },
    starBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      fontSize: starSize,
      color: emptyColor,
      lineHeight: 1,
    },
    starFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      fontSize: starSize,
      color: color,
      lineHeight: 1,
      overflow: 'hidden',
    },
  };

  return (
    <div style={styles.container}>
      {Array.from({ length: max }).map((_, index) => {
        const fillPercentage = Math.max(0, Math.min(1, displayValue - index)) * 100;

        return (
          <div
            key={index}
            style={styles.star}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const isHalf = (e.clientX - rect.left) < rect.width / 2;
              handleClick(index, isHalf);
            }}
            onMouseMove={(e) => handleMouseMove(e, index)}
            onMouseLeave={() => !readonly && setHoverValue(null)}
          >
            <span style={styles.starBackground}>star</span>
            <span style={{ ...styles.starFill, width: `${fillPercentage}%` }}>
              star
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default Slider;
