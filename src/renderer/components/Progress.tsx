/**
 * DEX Progress Indicators
 * Progress bars, spinners, and loading indicators
 */

import React, { useState, useEffect } from 'react';

// ==================== TYPES ====================

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'outside' | 'top';
  animated?: boolean;
  striped?: boolean;
  indeterminate?: boolean;
}

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  showLabel?: boolean;
  children?: React.ReactNode;
}

interface SpinnerProps {
  size?: number;
  color?: string;
  thickness?: number;
}

interface StepProgressProps {
  steps: string[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
}

// ==================== PROGRESS BAR ====================

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  size = 'medium',
  color = 'var(--color-accent)',
  showLabel = false,
  labelPosition = 'outside',
  animated = true,
  striped = false,
  indeterminate = false,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizeHeights = {
    small: 4,
    medium: 8,
    large: 14,
  };

  const height = sizeHeights[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
    },
    wrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    topLabel: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'var(--color-text-secondary)',
    },
    track: {
      width: '100%',
      height,
      background: 'var(--color-bg-tertiary)',
      borderRadius: height / 2,
      overflow: 'hidden',
      position: 'relative',
    },
    fill: {
      height: '100%',
      width: indeterminate ? '30%' : `${percentage}%`,
      background: striped
        ? `repeating-linear-gradient(45deg, ${color}, ${color} 10px, ${color}dd 10px, ${color}dd 20px)`
        : color,
      borderRadius: height / 2,
      transition: animated && !indeterminate ? 'width 0.3s ease' : 'none',
      animation: indeterminate ? 'indeterminate 1.5s infinite ease-in-out' : 'none',
    },
    insideLabel: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
    },
    outsideLabel: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
      minWidth: 40,
      textAlign: 'right',
    },
  };

  return (
    <>
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
      <div style={styles.container}>
        <div style={styles.wrapper}>
          {showLabel && labelPosition === 'top' && (
            <div style={styles.topLabel}>
              <span>Progress</span>
              <span>{Math.round(percentage)}%</span>
            </div>
          )}
          <div style={styles.track}>
            <div style={styles.fill}>
              {showLabel && labelPosition === 'inside' && size === 'large' && (
                <span style={styles.insideLabel}>{Math.round(percentage)}%</span>
              )}
            </div>
          </div>
        </div>
        {showLabel && labelPosition === 'outside' && (
          <span style={styles.outsideLabel}>{Math.round(percentage)}%</span>
        )}
      </div>
    </>
  );
};

// ==================== CIRCULAR PROGRESS ====================

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max = 100,
  size = 60,
  strokeWidth = 6,
  color = 'var(--color-accent)',
  showLabel = true,
  children,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: size,
      height: size,
    },
    svg: {
      transform: 'rotate(-90deg)',
    },
    trackCircle: {
      fill: 'none',
      stroke: 'var(--color-bg-tertiary)',
      strokeWidth,
    },
    progressCircle: {
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeDasharray: circumference,
      strokeDashoffset: offset,
      transition: 'stroke-dashoffset 0.3s ease',
    },
    content: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    },
    label: {
      fontSize: size * 0.25,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
  };

  return (
    <div style={styles.container}>
      <svg width={size} height={size} style={styles.svg}>
        <circle
          style={styles.trackCircle}
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          style={styles.progressCircle}
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
      </svg>
      <div style={styles.content}>
        {children || (showLabel && (
          <span style={styles.label}>{Math.round(percentage)}%</span>
        ))}
      </div>
    </div>
  );
};

// ==================== SPINNER ====================

export const Spinner: React.FC<SpinnerProps> = ({
  size = 24,
  color = 'var(--color-accent)',
  thickness = 3,
}) => {
  const styles: React.CSSProperties = {
    width: size,
    height: size,
    border: `${thickness}px solid var(--color-bg-tertiary)`,
    borderTopColor: color,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={styles} />
    </>
  );
};

// ==================== DOTS LOADER ====================

export const DotsLoader: React.FC<{ size?: number; color?: string }> = ({
  size = 8,
  color = 'var(--color-accent)',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: size * 0.6,
    },
    dot: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
    },
  };

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
      <div style={styles.container}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              ...styles.dot,
              animation: `bounce 1.4s infinite ease-in-out`,
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
    </>
  );
};

// ==================== PULSE LOADER ====================

export const PulseLoader: React.FC<{ size?: number; color?: string }> = ({
  size = 40,
  color = 'var(--color-accent)',
}) => {
  const styles: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    animation: 'pulse 1.5s ease-in-out infinite',
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
      <div style={{ position: 'relative', width: size, height: size }}>
        <div style={styles} />
        <div style={{ ...styles, position: 'absolute', top: 0, left: 0, animationDelay: '0.5s' }} />
      </div>
    </>
  );
};

// ==================== STEP PROGRESS ====================

export const StepProgress: React.FC<StepProgressProps> = ({
  steps,
  currentStep,
  orientation = 'horizontal',
}) => {
  const isHorizontal = orientation === 'horizontal';

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      alignItems: isHorizontal ? 'flex-start' : 'stretch',
      gap: 0,
    },
    step: {
      display: 'flex',
      flexDirection: isHorizontal ? 'column' : 'row',
      alignItems: 'center',
      flex: 1,
      position: 'relative',
    },
    connector: {
      position: 'absolute',
      background: 'var(--color-bg-tertiary)',
      ...(isHorizontal ? {
        top: 14,
        left: '50%',
        right: '-50%',
        height: 2,
      } : {
        left: 14,
        top: 32,
        bottom: 0,
        width: 2,
      }),
    },
    connectorFill: {
      background: 'var(--color-accent)',
      transition: 'all 0.3s ease',
    },
    circle: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 600,
      zIndex: 1,
      transition: 'all 0.3s ease',
    },
    circleCompleted: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    circleCurrent: {
      background: 'var(--color-accent)',
      color: '#fff',
      boxShadow: '0 0 0 4px var(--color-accent)30',
    },
    circleUpcoming: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-muted)',
    },
    label: {
      marginTop: isHorizontal ? 8 : 0,
      marginLeft: isHorizontal ? 0 : 12,
      fontSize: 13,
      textAlign: isHorizontal ? 'center' : 'left',
    },
    labelCompleted: {
      color: 'var(--color-accent)',
    },
    labelCurrent: {
      color: 'var(--color-text-primary)',
      fontWeight: 500,
    },
    labelUpcoming: {
      color: 'var(--color-text-muted)',
    },
  };

  const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  return (
    <div style={styles.container}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={index} style={styles.step}>
            {/* Connector */}
            {index < steps.length - 1 && (
              <div style={styles.connector}>
                <div
                  style={{
                    ...styles.connector,
                    ...styles.connectorFill,
                    position: 'relative',
                    ...(isHorizontal ? {
                      width: isCompleted ? '100%' : '0%',
                    } : {
                      height: isCompleted ? '100%' : '0%',
                    }),
                  }}
                />
              </div>
            )}
            
            {/* Circle */}
            <div
              style={{
                ...styles.circle,
                ...(isCompleted ? styles.circleCompleted : isCurrent ? styles.circleCurrent : styles.circleUpcoming),
              }}
            >
              {isCompleted ? <CheckIcon /> : index + 1}
            </div>
            
            {/* Label */}
            <span
              style={{
                ...styles.label,
                ...(isCompleted ? styles.labelCompleted : isCurrent ? styles.labelCurrent : styles.labelUpcoming),
              }}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ==================== FILE UPLOAD PROGRESS ====================

interface FileUploadProgressProps {
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error' | 'paused';
  size?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

export const FileUploadProgress: React.FC<FileUploadProgressProps> = ({
  fileName,
  progress,
  status,
  size,
  onCancel,
  onRetry,
}) => {
  const statusColors = {
    uploading: 'var(--color-accent)',
    completed: '#34c759',
    error: '#ff3b30',
    paused: '#ff9500',
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 10,
    },
    icon: {
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      color: 'var(--color-text-secondary)',
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    fileName: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text-primary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: 'var(--color-text-secondary)',
      marginTop: 4,
    },
    progressTrack: {
      height: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 2,
      marginTop: 8,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      background: statusColors[status],
      borderRadius: 2,
      transition: 'width 0.3s ease',
    },
    actionBtn: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
  };

  const FileIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  const RetryIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );

  const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  return (
    <div style={styles.container}>
      <div style={styles.icon}>
        <FileIcon />
      </div>
      <div style={styles.info}>
        <div style={styles.fileName}>{fileName}</div>
        <div style={styles.meta}>
          {size && <span>{size}</span>}
          {status === 'uploading' && <span>{progress}%</span>}
          {status === 'completed' && <span style={{ color: '#34c759' }}>Completed</span>}
          {status === 'error' && <span style={{ color: '#ff3b30' }}>Failed</span>}
          {status === 'paused' && <span style={{ color: '#ff9500' }}>Paused</span>}
        </div>
        {status === 'uploading' && (
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
        )}
      </div>
      {status === 'completed' && <CheckIcon />}
      {status === 'error' && onRetry && (
        <button style={styles.actionBtn} onClick={onRetry}>
          <RetryIcon />
        </button>
      )}
      {(status === 'uploading' || status === 'paused') && onCancel && (
        <button style={styles.actionBtn} onClick={onCancel}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
};

export default ProgressBar;
