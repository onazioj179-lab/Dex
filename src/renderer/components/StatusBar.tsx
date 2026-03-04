/**
 * DEX Status Bar Component
 * System-wide status display with performance metrics, notifications, and controls
 */

import React, { memo, useState, useEffect, useCallback } from 'react';

// ==================== TYPES ====================
export interface StatusBarItem {
  id: string;
  content: React.ReactNode;
  position: 'left' | 'center' | 'right';
  priority?: number;
  tooltip?: string;
  onClick?: () => void;
}

export interface SystemStatus {
  cpu: number;
  memory: number;
  fps: number;
  network: 'online' | 'offline' | 'slow';
}

// ==================== PERFORMANCE MONITOR HOOK ====================
export const usePerformanceMetrics = () => {
  const [metrics, setMetrics] = useState<SystemStatus>({
    cpu: 0,
    memory: 0,
    fps: 60,
    network: 'online',
  });

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        // Get memory info if available
        const memory = (performance as any).memory
          ? Math.round(((performance as any).memory.usedJSHeapSize / (performance as any).memory.jsHeapSizeLimit) * 100)
          : 0;

        setMetrics(prev => ({
          ...prev,
          fps: Math.min(fps, 120),
          memory,
          network: navigator.onLine ? 'online' : 'offline',
        }));

        frameCount = 0;
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(measureFPS);
    };

    animationId = requestAnimationFrame(measureFPS);

    // Network status listener
    const handleOnline = () => setMetrics(prev => ({ ...prev, network: 'online' }));
    const handleOffline = () => setMetrics(prev => ({ ...prev, network: 'offline' }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return metrics;
};

// ==================== CLOCK COMPONENT ====================
const Clock: React.FC = memo(() => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span style={itemStyles.clock}>
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
});

Clock.displayName = 'Clock';

// ==================== PERFORMANCE INDICATOR ====================
interface PerformanceIndicatorProps {
  metrics: SystemStatus;
}

const PerformanceIndicator: React.FC<PerformanceIndicatorProps> = memo(({ metrics }) => {
  const getFPSColor = (fps: number): string => {
    if (fps >= 55) return '#34c759';
    if (fps >= 30) return '#ff9f0a';
    return '#ff3b30';
  };

  const getMemoryColor = (memory: number): string => {
    if (memory < 60) return '#34c759';
    if (memory < 80) return '#ff9f0a';
    return '#ff3b30';
  };

  return (
    <div style={itemStyles.performance}>
      <span style={itemStyles.performanceItem} title={`${metrics.fps} FPS`}>
        <span style={{ ...itemStyles.dot, background: getFPSColor(metrics.fps) }} />
        <span>{metrics.fps}</span>
      </span>
      {metrics.memory > 0 && (
        <span style={itemStyles.performanceItem} title={`Memory: ${metrics.memory}%`}>
          <span style={{ ...itemStyles.dot, background: getMemoryColor(metrics.memory) }} />
          <span>{metrics.memory}%</span>
        </span>
      )}
    </div>
  );
});

PerformanceIndicator.displayName = 'PerformanceIndicator';

// ==================== NETWORK STATUS ====================
interface NetworkStatusProps {
  status: 'online' | 'offline' | 'slow';
}

const NetworkStatus: React.FC<NetworkStatusProps> = memo(({ status }) => {
  const getIcon = () => {
    switch (status) {
      case 'online':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12.55a11 11 0 0 1 14 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1"/>
          </svg>
        );
      case 'offline':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1"/>
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1"/>
          </svg>
        );
    }
  };

  const getColor = () => {
    switch (status) {
      case 'online': return '#34c759';
      case 'offline': return '#ff3b30';
      case 'slow': return '#ff9f0a';
    }
  };

  return (
    <span 
      style={{ ...itemStyles.network, color: getColor() }} 
      title={`Network: ${status}`}
    >
      {getIcon()}
    </span>
  );
});

NetworkStatus.displayName = 'NetworkStatus';

// ==================== ZOOM CONTROL ====================
interface ZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const ZoomControl: React.FC<ZoomControlProps> = memo(({
  zoom,
  onZoomChange,
  min = 25,
  max = 400,
  step = 25,
}) => {
  const handleZoomIn = () => onZoomChange(Math.min(zoom + step, max));
  const handleZoomOut = () => onZoomChange(Math.max(zoom - step, min));
  const handleReset = () => onZoomChange(100);

  return (
    <div style={itemStyles.zoomControl}>
      <button 
        onClick={handleZoomOut} 
        style={itemStyles.zoomBtn}
        disabled={zoom <= min}
        title="Zoom Out"
      >
        -
      </button>
      <span 
        style={itemStyles.zoomValue}
        onClick={handleReset}
        title="Reset to 100%"
      >
        {zoom}%
      </span>
      <button 
        onClick={handleZoomIn} 
        style={itemStyles.zoomBtn}
        disabled={zoom >= max}
        title="Zoom In"
      >
        +
      </button>
    </div>
  );
});

ZoomControl.displayName = 'ZoomControl';

// ==================== MAIN STATUS BAR COMPONENT ====================
interface StatusBarProps {
  items?: StatusBarItem[];
  showClock?: boolean;
  showPerformance?: boolean;
  showNetwork?: boolean;
  leftContent?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  style?: React.CSSProperties;
}

export const StatusBar: React.FC<StatusBarProps> = memo(({
  items = [],
  showClock = true,
  showPerformance = true,
  showNetwork = true,
  leftContent,
  centerContent,
  rightContent,
  style,
}) => {
  const metrics = usePerformanceMetrics();

  const leftItems = items.filter(i => i.position === 'left').sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const centerItems = items.filter(i => i.position === 'center').sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const rightItems = items.filter(i => i.position === 'right').sort((a, b) => (a.priority || 0) - (b.priority || 0));

  return (
    <div style={{ ...styles.container, ...style }}>
      {/* Left Section */}
      <div style={styles.section}>
        {leftContent}
        {leftItems.map(item => (
          <span
            key={item.id}
            onClick={item.onClick}
            title={item.tooltip}
            style={item.onClick ? styles.clickable : undefined}
          >
            {item.content}
          </span>
        ))}
      </div>

      {/* Center Section */}
      <div style={{ ...styles.section, justifyContent: 'center' }}>
        {centerContent}
        {centerItems.map(item => (
          <span
            key={item.id}
            onClick={item.onClick}
            title={item.tooltip}
            style={item.onClick ? styles.clickable : undefined}
          >
            {item.content}
          </span>
        ))}
      </div>

      {/* Right Section */}
      <div style={{ ...styles.section, justifyContent: 'flex-end' }}>
        {rightContent}
        {rightItems.map(item => (
          <span
            key={item.id}
            onClick={item.onClick}
            title={item.tooltip}
            style={item.onClick ? styles.clickable : undefined}
          >
            {item.content}
          </span>
        ))}
        {showPerformance && <PerformanceIndicator metrics={metrics} />}
        {showNetwork && <NetworkStatus status={metrics.network} />}
        {showClock && <Clock />}
      </div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';

// ==================== STYLES ====================
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
    padding: '0 12px',
    background: 'var(--color-bg-tertiary, #1a1a1a)',
    borderTop: '1px solid var(--color-border, rgba(255,255,255,0.08))',
    fontSize: 11,
    color: 'var(--color-text-secondary, #888)',
    userSelect: 'none',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  clickable: {
    cursor: 'pointer',
  },
};

const itemStyles: Record<string, React.CSSProperties> = {
  clock: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--color-text-secondary, #888)',
  },
  performance: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  performanceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--color-text-tertiary, #666)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#34c759',
  },
  network: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.8,
  },
  zoomControl: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  zoomBtn: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-elevated, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: 3,
    color: 'var(--color-text-secondary, #888)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  zoomValue: {
    minWidth: 40,
    textAlign: 'center',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 10,
    cursor: 'pointer',
  },
};

export default StatusBar;
