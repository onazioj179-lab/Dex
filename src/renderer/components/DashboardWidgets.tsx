/**
 * DEX Dashboard Widgets
 * Dashboard cards and widget components
 */

import React, { useState, useEffect } from 'react';

// ==================== TYPES ====================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
    period?: string;
  };
  icon?: string;
  color?: string;
  onClick?: () => void;
}

interface ChartWidgetProps {
  title: string;
  data: { label: string; value: number }[];
  type?: 'bar' | 'line' | 'donut';
  height?: number;
  color?: string;
}

interface ProgressWidgetProps {
  title: string;
  items: {
    label: string;
    value: number;
    max: number;
    color?: string;
  }[];
}

interface QuickActionsWidgetProps {
  title?: string;
  actions: {
    id: string;
    label: string;
    icon: string;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'danger';
  }[];
  columns?: number;
}

interface RecentItemsWidgetProps {
  title: string;
  items: {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    time?: Date;
    onClick?: () => void;
  }[];
  onViewAll?: () => void;
}

// ==================== STAT CARD ====================

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  color = 'var(--color-accent)',
  onClick,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      fontWeight: 500,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      background: `${color}20`,
    },
    value: {
      fontSize: 32,
      fontWeight: 700,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    change: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 13,
    },
  };

  return (
    <div
      style={styles.container}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        {icon && <span style={styles.icon}>{icon}</span>}
      </div>
      <div style={styles.value}>{value}</div>
      {change && (
        <div
          style={{
            ...styles.change,
            color: change.type === 'increase' ? '#4caf50' : '#f44336',
          }}
        >
          <span>{change.type === 'increase' ? 'arrow-up' : 'arrow-down'}</span>
          <span>{Math.abs(change.value)}%</span>
          {change.period && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              vs {change.period}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== MINI BAR CHART ====================

export const MiniBarChart: React.FC<ChartWidgetProps> = ({
  title,
  data,
  height = 200,
  color = 'var(--color-accent)',
}) => {
  const maxValue = Math.max(...data.map((d) => d.value));

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    chart: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8,
      height,
    },
    barContainer: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    },
    bar: {
      width: '100%',
      borderRadius: 4,
      background: color,
      transition: 'height 0.3s ease',
    },
    label: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '100%',
    },
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{title}</h3>
      <div style={styles.chart}>
        {data.map((item, index) => (
          <div key={index} style={styles.barContainer as any}>
            <div
              style={{
                ...styles.bar,
                height: `${(item.value / maxValue) * 100}%`,
                minHeight: 4,
              }}
              title={`${item.label}: ${item.value}`}
            />
            <span style={styles.label as any}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== DONUT CHART ====================

export const DonutChart: React.FC<ChartWidgetProps> = ({
  title,
  data,
  height = 200,
}) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0', '#00bcd4'];

  // Calculate segments
  let currentAngle = 0;
  const segments = data.map((item, index) => {
    const angle = (item.value / total) * 360;
    const segment = {
      ...item,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: colors[index % colors.length],
    };
    currentAngle += angle;
    return segment;
  });

  const createArcPath = (
    startAngle: number,
    endAngle: number,
    innerRadius: number,
    outerRadius: number
  ): string => {
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = Math.cos(startRad) * outerRadius;
    const y1 = Math.sin(startRad) * outerRadius;
    const x2 = Math.cos(endRad) * outerRadius;
    const y2 = Math.sin(endRad) * outerRadius;
    const x3 = Math.cos(endRad) * innerRadius;
    const y3 = Math.sin(endRad) * innerRadius;
    const x4 = Math.cos(startRad) * innerRadius;
    const y4 = Math.sin(startRad) * innerRadius;

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return `
      M ${x1} ${y1}
      A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
      Z
    `;
  };

  const size = height;
  const outerRadius = size / 2 - 10;
  const innerRadius = outerRadius * 0.6;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    chartContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
    },
    legend: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    legendItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: '50%',
    },
    legendLabel: {
      color: 'var(--color-text)',
    },
    legendValue: {
      color: 'var(--color-text-muted)',
      marginLeft: 'auto',
    },
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{title}</h3>
      <div style={styles.chartContainer}>
        <svg width={size} height={size} viewBox={`-${size/2} -${size/2} ${size} ${size}`}>
          {segments.map((segment, index) => (
            <path
              key={index}
              d={createArcPath(segment.startAngle, segment.endAngle, innerRadius, outerRadius)}
              fill={segment.color}
            />
          ))}
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: 24,
              fontWeight: 700,
              fill: 'var(--color-text)',
            }}
          >
            {total}
          </text>
        </svg>
        <div style={styles.legend as any}>
          {segments.map((segment, index) => (
            <div key={index} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: segment.color }} />
              <span style={styles.legendLabel}>{segment.label}</span>
              <span style={styles.legendValue}>{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==================== PROGRESS WIDGET ====================

export const ProgressWidget: React.FC<ProgressWidgetProps> = ({
  title,
  items,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    items: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    item: {
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
      color: 'var(--color-text)',
    },
    value: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
    track: {
      height: 6,
      borderRadius: 3,
      background: 'var(--color-bg-tertiary)',
      overflow: 'hidden',
    },
    progress: {
      height: '100%',
      borderRadius: 3,
      transition: 'width 0.3s ease',
    },
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{title}</h3>
      <div style={styles.items as any}>
        {items.map((item, index) => {
          const percentage = Math.min((item.value / item.max) * 100, 100);
          return (
            <div key={index} style={styles.item as any}>
              <div style={styles.header}>
                <span style={styles.label}>{item.label}</span>
                <span style={styles.value}>
                  {item.value} / {item.max}
                </span>
              </div>
              <div style={styles.track}>
                <div
                  style={{
                    ...styles.progress,
                    width: `${percentage}%`,
                    background: item.color || 'var(--color-accent)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== QUICK ACTIONS WIDGET ====================

export const QuickActionsWidget: React.FC<QuickActionsWidgetProps> = ({
  title = 'Quick Actions',
  actions,
  columns = 4,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 12,
    },
    action: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: 16,
      borderRadius: 8,
      border: 'none',
      cursor: 'pointer',
      transition: 'transform 0.15s ease, background 0.15s ease',
    },
    icon: {
      fontSize: 24,
    },
    label: {
      fontSize: 12,
      textAlign: 'center',
    },
  };

  const getVariantStyles = (variant: string = 'default'): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--color-accent)',
          color: 'white',
        };
      case 'danger':
        return {
          background: '#f4433620',
          color: '#f44336',
        };
      default:
        return {
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
        };
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{title}</h3>
      <div style={styles.grid}>
        {actions.map((action) => (
          <button
            key={action.id}
            style={{
              ...styles.action as any,
              ...getVariantStyles(action.variant),
            }}
            onClick={action.onClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span style={styles.icon as any}>{action.icon}</span>
            <span style={styles.label as any}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== RECENT ITEMS WIDGET ====================

export const RecentItemsWidget: React.FC<RecentItemsWidgetProps> = ({
  title,
  items,
  onViewAll,
}) => {
  const formatTime = (date?: Date): string => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
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
    },
    viewAll: {
      background: 'none',
      border: 'none',
      color: 'var(--color-accent)',
      cursor: 'pointer',
      fontSize: 13,
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      background: 'var(--color-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    itemTitle: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    subtitle: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    time: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        {onViewAll && (
          <button style={styles.viewAll} onClick={onViewAll}>
            View All
          </button>
        )}
      </div>
      <div style={styles.list as any}>
        {items.map((item) => (
          <div
            key={item.id}
            style={styles.item}
            onClick={item.onClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={styles.icon}>{item.icon || 'file'}</div>
            <div style={styles.content}>
              <div style={styles.itemTitle}>{item.title}</div>
              {item.subtitle && (
                <div style={styles.subtitle}>{item.subtitle}</div>
              )}
            </div>
            {item.time && <span style={styles.time}>{formatTime(item.time)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== WEATHER WIDGET ====================

interface WeatherWidgetProps {
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy';
  location: string;
  humidity?: number;
  wind?: number;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  temperature,
  condition,
  location,
  humidity,
  wind,
}) => {
  const getIcon = (cond: string): string => {
    switch (cond) {
      case 'sunny': return 'sun';
      case 'cloudy': return 'cloud';
      case 'rainy': return 'cloud-rain';
      case 'snowy': return 'snowflake';
      case 'stormy': return 'cloud-rain';
      default: return 'sun';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 20,
    },
    location: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginBottom: 12,
    },
    main: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 16,
    },
    icon: {
      fontSize: 48,
    },
    temp: {
      fontSize: 40,
      fontWeight: 700,
      color: 'var(--color-text)',
    },
    details: {
      display: 'flex',
      gap: 16,
    },
    detail: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.location}>map-pin {location}</div>
      <div style={styles.main}>
        <span style={styles.icon}>{getIcon(condition)}</span>
        <span style={styles.temp}>{temperature}°</span>
      </div>
      <div style={styles.details}>
        {humidity !== undefined && (
          <span style={styles.detail}>droplet {humidity}%</span>
        )}
        {wind !== undefined && (
          <span style={styles.detail}>wind {wind} km/h</span>
        )}
      </div>
    </div>
  );
};

// ==================== CLOCK WIDGET ====================

export const ClockWidget: React.FC<{ timezone?: string }> = ({
  timezone,
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timezone,
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      padding: 24,
      textAlign: 'center',
    },
    time: {
      fontSize: 48,
      fontWeight: 700,
      color: 'var(--color-text)',
      fontFamily: 'monospace',
    },
    date: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginTop: 8,
    },
    timezone: {
      fontSize: 12,
      color: 'var(--color-accent)',
      marginTop: 4,
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.time}>{formatTime(time)}</div>
      <div style={styles.date}>{formatDate(time)}</div>
      {timezone && <div style={styles.timezone}>{timezone}</div>}
    </div>
  );
};

export default StatCard;
