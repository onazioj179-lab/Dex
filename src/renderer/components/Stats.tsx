/**
 * DEX Stats & Analytics Components
 * Statistics, KPIs, and data visualization cards
 */

import React, { useMemo } from 'react';

// ==================== TYPES ====================

interface StatCardProps {
  label: string;
  value: string | number;
  previousValue?: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

interface StatsGridProps {
  stats: StatCardProps[];
  columns?: number;
  gap?: number;
}

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  showDots?: boolean;
  animated?: boolean;
}

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  label?: string;
  sublabel?: string;
  animated?: boolean;
}

interface MetricCardProps {
  title: string;
  metrics: {
    label: string;
    value: string | number;
    color?: string;
    percentage?: number;
  }[];
  total?: string | number;
}

// ==================== STAT CARD ====================

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  previousValue,
  change,
  changeLabel,
  icon,
  trend,
  size = 'md',
  color = 'var(--color-accent)',
}) => {
  const sizeConfig = {
    sm: { valueFontSize: 20, labelFontSize: 11, padding: 12, changeFontSize: 10 },
    md: { valueFontSize: 28, labelFontSize: 12, padding: 16, changeFontSize: 12 },
    lg: { valueFontSize: 36, labelFontSize: 14, padding: 24, changeFontSize: 13 },
  };

  const config = sizeConfig[size];

  const trendColor = useMemo(() => {
    if (trend === 'up') return '#10b981';
    if (trend === 'down') return '#ef4444';
    return 'var(--color-text-muted)';
  }, [trend]);

  const trendIcon = useMemo(() => {
    if (trend === 'up') return 'arrow-up';
    if (trend === 'down') return 'arrow-down';
    return 'arrow-right';
  }, [trend]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      padding: config.padding,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    label: {
      fontSize: config.labelFontSize,
      color: 'var(--color-text-secondary)',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: 0,
    },
    icon: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${color}15`,
      borderRadius: 8,
      fontSize: 18,
      color: color,
    },
    value: {
      fontSize: config.valueFontSize,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
      fontFamily: 'system-ui',
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    change: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: config.changeFontSize,
      fontWeight: 500,
      color: trendColor,
    },
    changeLabel: {
      fontSize: config.changeFontSize,
      color: 'var(--color-text-muted)',
    },
    previousValue: {
      fontSize: config.changeFontSize,
      color: 'var(--color-text-muted)',
    },
  };

  const formatChange = (val: number): string => {
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val}%`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={styles.label}>{label}</p>
        {icon && <div style={styles.icon}>{icon}</div>}
      </div>
      
      <p style={styles.value}>{value}</p>
      
      <div style={styles.footer}>
        {change !== undefined && (
          <span style={styles.change}>
            {trendIcon} {formatChange(change)}
          </span>
        )}
        {changeLabel && (
          <span style={styles.changeLabel}>{changeLabel}</span>
        )}
        {previousValue !== undefined && !change && (
          <span style={styles.previousValue}>vs {previousValue}</span>
        )}
      </div>
    </div>
  );
};

// ==================== STATS GRID ====================

export const StatsGrid: React.FC<StatsGridProps> = ({
  stats,
  columns = 4,
  gap = 16,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap,
    },
  };

  return (
    <div style={styles.container}>
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} />
      ))}
    </div>
  );
};

// ==================== SPARKLINE ====================

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 32,
  color = 'var(--color-accent)',
  fillOpacity = 0.1,
  showDots = false,
  animated = true,
}) => {
  const padding = 2;
  const effectiveWidth = width - padding * 2;
  const effectiveHeight = height - padding * 2;

  const points = useMemo(() => {
    if (data.length === 0) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data
      .map((value, i) => {
        const x = padding + (i / (data.length - 1)) * effectiveWidth;
        const y = padding + effectiveHeight - ((value - min) / range) * effectiveHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, effectiveWidth, effectiveHeight, padding]);

  const areaPath = useMemo(() => {
    if (data.length === 0) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pathPoints = data.map((value, i) => {
      const x = padding + (i / (data.length - 1)) * effectiveWidth;
      const y = padding + effectiveHeight - ((value - min) / range) * effectiveHeight;
      return { x, y };
    });

    const d = pathPoints.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    const firstX = pathPoints[0]?.x ?? padding;
    const lastX = pathPoints[pathPoints.length - 1]?.x ?? effectiveWidth;
    const bottomY = height - padding;

    return `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [data, effectiveWidth, effectiveHeight, height, padding]);

  const dots = useMemo(() => {
    if (!showDots || data.length === 0) return [];

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data.map((value, i) => ({
      x: padding + (i / (data.length - 1)) * effectiveWidth,
      y: padding + effectiveHeight - ((value - min) / range) * effectiveHeight,
    }));
  }, [data, showDots, effectiveWidth, effectiveHeight, padding]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-block',
      verticalAlign: 'middle',
    },
  };

  return (
    <div style={styles.container}>
      <svg width={width} height={height}>
        {/* Area fill */}
        <path
          d={areaPath}
          fill={color}
          fillOpacity={fillOpacity}
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: animated ? 1000 : 0,
            strokeDashoffset: animated ? 1000 : 0,
            animation: animated ? 'sparkline-draw 1s ease forwards' : 'none',
          }}
        />
        
        {/* Dots */}
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={3}
            fill={color}
          />
        ))}
        
        <style>{`
          @keyframes sparkline-draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      </svg>
    </div>
  );
};

// ==================== PROGRESS RING ====================

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  size = 120,
  strokeWidth = 10,
  color = 'var(--color-accent)',
  backgroundColor = 'var(--color-bg-tertiary)',
  label,
  sublabel,
  animated = true,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    svg: {
      transform: 'rotate(-90deg)',
    },
    background: {
      fill: 'none',
      stroke: backgroundColor,
      strokeWidth,
    },
    progress: {
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeDasharray: circumference,
      strokeDashoffset: animated ? circumference : offset,
      transition: animated ? 'stroke-dashoffset 1s ease' : 'none',
    },
    content: {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: size * 0.22,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
    },
    sublabel: {
      fontSize: size * 0.1,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
  };

  // Trigger animation on mount
  React.useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        const circle = document.querySelector(`#ring-${size}-progress`) as SVGCircleElement;
        if (circle) {
          circle.style.strokeDashoffset = String(offset);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [animated, offset, size]);

  return (
    <div style={styles.container}>
      <svg width={size} height={size} style={styles.svg}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          style={styles.background}
        />
        <circle
          id={`ring-${size}-progress`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          style={styles.progress}
        />
      </svg>
      <div style={styles.content}>
        <p style={styles.label}>{label ?? `${Math.round(percentage)}%`}</p>
        {sublabel && <p style={styles.sublabel}>{sublabel}</p>}
      </div>
    </div>
  );
};

// ==================== METRIC CARD ====================

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  metrics,
  total,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: 20,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    total: {
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--color-text)',
    },
    metrics: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    metric: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    metricHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    metricLabel: {
      fontSize: 12,
      color: 'var(--color-text-secondary)',
    },
    metricValue: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    barContainer: {
      height: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 2,
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      borderRadius: 2,
      transition: 'width 0.5s ease',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        {total && <span style={styles.total}>{total}</span>}
      </div>
      
      <div style={styles.metrics}>
        {metrics.map((metric, index) => (
          <div key={index} style={styles.metric}>
            <div style={styles.metricHeader}>
              <span style={styles.metricLabel}>{metric.label}</span>
              <span style={styles.metricValue}>{metric.value}</span>
            </div>
            {metric.percentage !== undefined && (
              <div style={styles.barContainer}>
                <div
                  style={{
                    ...styles.bar,
                    width: `${metric.percentage}%`,
                    background: metric.color || 'var(--color-accent)',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== COMPARISON CARD ====================

interface ComparisonCardProps {
  title: string;
  current: { label: string; value: number };
  previous: { label: string; value: number };
  unit?: string;
  formatValue?: (value: number) => string;
}

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  title,
  current,
  previous,
  unit = '',
  formatValue = v => String(v),
}) => {
  const change = previous.value !== 0
    ? ((current.value - previous.value) / previous.value) * 100
    : 0;

  const isPositive = change > 0;
  const isNegative = change < 0;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      padding: 20,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
    },
    title: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      margin: 0,
      marginBottom: 16,
    },
    values: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    valueGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    label: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    currentValue: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--color-text)',
      margin: 0,
    },
    previousValue: {
      fontSize: 18,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
      margin: 0,
    },
    change: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginTop: 12,
      fontSize: 13,
      fontWeight: 600,
      color: isPositive ? '#10b981' : isNegative ? '#ef4444' : 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <p style={styles.title}>{title}</p>
      <div style={styles.values}>
        <div style={styles.valueGroup}>
          <span style={styles.label}>{current.label}</span>
          <p style={styles.currentValue}>
            {formatValue(current.value)}{unit}
          </p>
        </div>
        <div style={styles.valueGroup}>
          <span style={styles.label}>{previous.label}</span>
          <p style={styles.previousValue}>
            {formatValue(previous.value)}{unit}
          </p>
        </div>
      </div>
      <div style={styles.change}>
        <span>{isPositive ? 'arrow-up' : isNegative ? 'arrow-down' : 'arrow-right'}</span>
        <span>{Math.abs(change).toFixed(1)}% from {previous.label}</span>
      </div>
    </div>
  );
};

// ==================== TREND INDICATOR ====================

interface TrendIndicatorProps {
  value: number;
  previousValue: number;
  showPercentage?: boolean;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  value,
  previousValue,
  showPercentage = true,
  showValue = false,
  size = 'md',
}) => {
  const change = previousValue !== 0
    ? ((value - previousValue) / previousValue) * 100
    : 0;

  const isPositive = change > 0;
  const isNegative = change < 0;

  const sizeConfig = {
    sm: { fontSize: 11, iconSize: 10, padding: '2px 6px' },
    md: { fontSize: 13, iconSize: 12, padding: '4px 8px' },
    lg: { fontSize: 15, iconSize: 14, padding: '6px 10px' },
  };

  const config = sizeConfig[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: config.padding,
      borderRadius: 4,
      fontSize: config.fontSize,
      fontWeight: 600,
      background: isPositive
        ? 'rgba(16, 185, 129, 0.1)'
        : isNegative
        ? 'rgba(239, 68, 68, 0.1)'
        : 'var(--color-bg-tertiary)',
      color: isPositive
        ? '#10b981'
        : isNegative
        ? '#ef4444'
        : 'var(--color-text-muted)',
    },
    icon: {
      fontSize: config.iconSize,
    },
  };

  return (
    <span style={styles.container}>
      <span style={styles.icon}>
        {isPositive ? 'arrow-up' : isNegative ? 'arrow-down' : 'arrow-right'}
      </span>
      {showPercentage && <span>{Math.abs(change).toFixed(1)}%</span>}
      {showValue && <span>({value - previousValue > 0 ? '+' : ''}{value - previousValue})</span>}
    </span>
  );
};

export default StatCard;
