/**
 * DEX Chart Component
 * Data visualization charts
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';

// ==================== TYPES ====================

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  showLabels?: boolean;
  strokeWidth?: number;
  areaFill?: boolean;
  animated?: boolean;
}

interface BarChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  horizontal?: boolean;
  showLabels?: boolean;
  showValues?: boolean;
  barRadius?: number;
  gap?: number;
  animated?: boolean;
}

interface PieChartProps {
  data: DataPoint[];
  size?: number;
  innerRadius?: number; // For donut chart
  showLabels?: boolean;
  showLegend?: boolean;
  animated?: boolean;
}

interface AreaChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  gradientId?: string;
}

interface RadarChartProps {
  data: DataPoint[];
  size?: number;
  levels?: number;
  showLabels?: boolean;
  fillOpacity?: number;
}

// ==================== UTILITIES ====================

const defaultColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

const getColor = (index: number, customColor?: string): string => {
  return customColor || defaultColors[index % defaultColors.length];
};

// ==================== LINE CHART ====================

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 400,
  height = 200,
  showGrid = true,
  showDots = true,
  showLabels = true,
  strokeWidth = 2,
  areaFill = false,
  animated = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  useEffect(() => {
    if (animated) {
      setMounted(true);
    }
  }, [animated]);

  const { minValue, maxValue, points, pathD, areaD } = useMemo(() => {
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = data.map((d, i) => ({
      x: (i / (data.length - 1)) * chartWidth + padding.left,
      y: chartHeight - ((d.value - min) / range) * chartHeight + padding.top,
      ...d,
    }));

    const path = pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    const area = path + 
      ` L ${pts[pts.length - 1]?.x || 0} ${chartHeight + padding.top}` +
      ` L ${pts[0]?.x || 0} ${chartHeight + padding.top} Z`;

    return { minValue: min, maxValue: max, points: pts, pathD: path, areaD: area };
  }, [data, chartWidth, chartHeight, padding]);

  const gridLines = useMemo(() => {
    const lines = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + (i / steps) * chartHeight;
      const value = maxValue - (i / steps) * (maxValue - minValue);
      lines.push({ y, value });
    }
    return lines;
  }, [minValue, maxValue, chartHeight, padding]);

  const styles = {
    line: {
      fill: 'none',
      stroke: 'var(--color-accent)',
      strokeWidth,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      strokeDasharray: animated && !mounted ? 1000 : 0,
      strokeDashoffset: animated && !mounted ? 1000 : 0,
      transition: animated ? 'stroke-dashoffset 1s ease' : undefined,
    },
    area: {
      fill: 'url(#areaGradient)',
      opacity: 0.3,
    },
    grid: {
      stroke: 'var(--color-border)',
      strokeWidth: 1,
      strokeDasharray: '4,4',
    },
    dot: {
      fill: 'var(--color-accent)',
      r: 4,
    },
    label: {
      fontSize: 10,
      fill: 'var(--color-text-muted)',
      textAnchor: 'middle' as const,
    },
  };

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {showGrid && gridLines.map((line, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={line.y}
            x2={width - padding.right}
            y2={line.y}
            style={styles.grid}
          />
          <text
            x={padding.left - 8}
            y={line.y + 4}
            style={{ ...styles.label, textAnchor: 'end' }}
          >
            {line.value.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      {areaFill && <path d={areaD} style={styles.area} />}

      {/* Line */}
      <path d={pathD} style={styles.line} />

      {/* Dots */}
      {showDots && points.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={styles.dot.r}
          fill={styles.dot.fill}
        />
      ))}

      {/* Labels */}
      {showLabels && points.map((point, i) => (
        <text
          key={i}
          x={point.x}
          y={height - 8}
          style={styles.label}
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
};

// ==================== BAR CHART ====================

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 400,
  height = 200,
  horizontal = false,
  showLabels = true,
  showValues = true,
  barRadius = 4,
  gap = 8,
  animated = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const padding = { top: 20, right: 20, bottom: 30, left: horizontal ? 80 : 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  useEffect(() => {
    if (animated) {
      setTimeout(() => setMounted(true), 50);
    } else {
      setMounted(true);
    }
  }, [animated]);

  const { maxValue, bars } = useMemo(() => {
    const max = Math.max(...data.map(d => d.value));
    const barSize = horizontal
      ? (chartHeight - gap * (data.length - 1)) / data.length
      : (chartWidth - gap * (data.length - 1)) / data.length;

    const items = data.map((d, i) => {
      const barLength = (d.value / max) * (horizontal ? chartWidth : chartHeight);

      return {
        ...d,
        x: horizontal ? padding.left : padding.left + i * (barSize + gap),
        y: horizontal
          ? padding.top + i * (barSize + gap)
          : padding.top + chartHeight - (mounted ? barLength : 0),
        width: horizontal ? (mounted ? barLength : 0) : barSize,
        height: horizontal ? barSize : (mounted ? barLength : 0),
        color: getColor(i, d.color),
      };
    });

    return { maxValue: max, bars: items };
  }, [data, chartWidth, chartHeight, gap, horizontal, mounted, padding]);

  const styles: Record<string, React.CSSProperties> = {
    label: {
      fontSize: 10,
      fill: 'var(--color-text-muted)',
      textAnchor: horizontal ? 'end' : 'middle',
    },
    value: {
      fontSize: 11,
      fill: 'var(--color-text)',
      fontWeight: 500,
    },
  };

  return (
    <svg width={width} height={height}>
      {bars.map((bar, i) => (
        <g key={i}>
          <rect
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={barRadius}
            fill={bar.color}
            style={{
              transition: animated ? 'all 0.5s ease' : undefined,
            }}
          />

          {showLabels && (
            <text
              x={horizontal ? padding.left - 8 : bar.x + bar.width / 2}
              y={horizontal ? bar.y + bar.height / 2 + 4 : height - 8}
              style={styles.label}
            >
              {bar.label}
            </text>
          )}

          {showValues && mounted && (
            <text
              x={horizontal ? bar.x + bar.width + 8 : bar.x + bar.width / 2}
              y={horizontal ? bar.y + bar.height / 2 + 4 : bar.y - 8}
              style={{
                ...styles.value,
                textAnchor: horizontal ? 'start' : 'middle',
              }}
            >
              {bar.value}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

// ==================== PIE CHART ====================

export const PieChart: React.FC<PieChartProps> = ({
  data,
  size = 200,
  innerRadius = 0,
  showLabels = true,
  showLegend = true,
  animated = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const center = size / 2;
  const radius = size / 2 - 10;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  useEffect(() => {
    if (animated) {
      setTimeout(() => setMounted(true), 50);
    } else {
      setMounted(true);
    }
  }, [animated]);

  const slices = useMemo(() => {
    let currentAngle = -90;

    return data.map((d, i) => {
      const percentage = d.value / total;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + (mounted ? angle : 0);
      currentAngle += angle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const innerX1 = center + innerRadius * Math.cos(startRad);
      const innerY1 = center + innerRadius * Math.sin(startRad);
      const innerX2 = center + innerRadius * Math.cos(endRad);
      const innerY2 = center + innerRadius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      let path;
      if (innerRadius > 0) {
        path = [
          `M ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
          `L ${innerX2} ${innerY2}`,
          `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX1} ${innerY1}`,
          'Z',
        ].join(' ');
      } else {
        path = [
          `M ${center} ${center}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
          'Z',
        ].join(' ');
      }

      // Label position
      const midAngle = (startAngle + angle / 2) * Math.PI / 180;
      const labelRadius = radius * 0.7;
      const labelX = center + labelRadius * Math.cos(midAngle);
      const labelY = center + labelRadius * Math.sin(midAngle);

      return {
        ...d,
        path,
        color: getColor(i, d.color),
        percentage,
        labelX,
        labelY,
      };
    });
  }, [data, total, center, radius, innerRadius, mounted]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
    },
    slice: {
      transition: animated ? 'all 0.5s ease' : undefined,
      cursor: 'pointer',
    },
    label: {
      fontSize: 11,
      fontWeight: 600,
      fill: '#fff',
      textAnchor: 'middle',
      pointerEvents: 'none',
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
      fontSize: 12,
    },
    legendColor: {
      width: 12,
      height: 12,
      borderRadius: 3,
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
      <svg width={size} height={size}>
        {slices.map((slice, i) => (
          <g key={i}>
            <path
              d={slice.path}
              fill={slice.color}
              style={styles.slice}
            />
            {showLabels && slice.percentage > 0.05 && mounted && (
              <text
                x={slice.labelX}
                y={slice.labelY}
                dy="0.35em"
                style={styles.label}
              >
                {Math.round(slice.percentage * 100)}%
              </text>
            )}
          </g>
        ))}
      </svg>

      {showLegend && (
        <div style={styles.legend as any}>
          {data.map((item, i) => (
            <div key={i} style={styles.legendItem as any}>
              <div style={{ ...styles.legendColor, background: getColor(i, item.color) }} />
              <span style={styles.legendLabel}>{item.label}</span>
              <span style={styles.legendValue}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== AREA CHART ====================

export const AreaChart: React.FC<AreaChartProps> = ({
  data,
  width = 400,
  height = 200,
  showGrid = true,
  showDots = true,
  gradientId = 'areaGradient',
}) => {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { points, pathD, areaD } = useMemo(() => {
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = data.map((d, i) => ({
      x: (i / (data.length - 1)) * chartWidth + padding.left,
      y: chartHeight - ((d.value - min) / range) * chartHeight + padding.top,
      ...d,
    }));

    const path = pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    const area = path + 
      ` L ${pts[pts.length - 1]?.x || 0} ${chartHeight + padding.top}` +
      ` L ${pts[0]?.x || 0} ${chartHeight + padding.top} Z`;

    return { points: pts, pathD: path, areaD: area };
  }, [data, chartWidth, chartHeight, padding]);

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {showGrid && (
        <g>
          {[0.25, 0.5, 0.75, 1].map((fraction, i) => (
            <line
              key={i}
              x1={padding.left}
              y1={padding.top + chartHeight * fraction}
              x2={width - padding.right}
              y2={padding.top + chartHeight * fraction}
              stroke="var(--color-border)"
              strokeDasharray="4,4"
            />
          ))}
        </g>
      )}

      {/* Area */}
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots && points.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={4}
          fill="var(--color-accent)"
        />
      ))}

      {/* Labels */}
      {points.map((point, i) => (
        <text
          key={i}
          x={point.x}
          y={height - 8}
          fontSize={10}
          fill="var(--color-text-muted)"
          textAnchor="middle"
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
};

// ==================== RADAR CHART ====================

export const RadarChart: React.FC<RadarChartProps> = ({
  data,
  size = 300,
  levels = 5,
  showLabels = true,
  fillOpacity = 0.3,
}) => {
  const center = size / 2;
  const radius = size / 2 - 40;

  const maxValue = Math.max(...data.map(d => d.value));
  const angleSlice = (2 * Math.PI) / data.length;

  const points = data.map((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const r = (d.value / maxValue) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      labelX: center + (radius + 20) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
      ...d,
    };
  });

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z';

  // Grid levels
  const gridLevels = Array.from({ length: levels }, (_, i) => {
    const levelRadius = (radius * (i + 1)) / levels;
    return data.map((_, j) => {
      const angle = angleSlice * j - Math.PI / 2;
      return {
        x: center + levelRadius * Math.cos(angle),
        y: center + levelRadius * Math.sin(angle),
      };
    });
  });

  const styles: Record<string, React.CSSProperties> = {
    axis: {
      stroke: 'var(--color-border)',
      strokeWidth: 1,
    },
    grid: {
      fill: 'none',
      stroke: 'var(--color-border)',
      strokeWidth: 1,
    },
    area: {
      fill: 'var(--color-accent)',
      stroke: 'var(--color-accent)',
      strokeWidth: 2,
      opacity: fillOpacity,
    },
    dot: {
      fill: 'var(--color-accent)',
    },
    label: {
      fontSize: 11,
      fill: 'var(--color-text)',
      textAnchor: 'middle',
    },
  };

  return (
    <svg width={size} height={size}>
      {/* Grid levels */}
      {gridLevels.map((level, i) => (
        <polygon
          key={i}
          points={level.map(p => `${p.x},${p.y}`).join(' ')}
          style={styles.grid}
        />
      ))}

      {/* Axes */}
      {data.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(angle)}
            y2={center + radius * Math.sin(angle)}
            style={styles.axis}
          />
        );
      })}

      {/* Data area */}
      <path d={pathD} style={styles.area} />

      {/* Data points */}
      {points.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={4}
          style={styles.dot}
        />
      ))}

      {/* Labels */}
      {showLabels && points.map((point, i) => (
        <text
          key={i}
          x={point.labelX}
          y={point.labelY}
          dy="0.35em"
          style={styles.label}
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
};

export default LineChart;
