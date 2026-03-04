/**
 * DEX Status Components
 * Status indicators and health displays
 */

import React, { useState, useEffect } from 'react';

// ==================== TYPES ====================

type StatusType = 'online' | 'offline' | 'busy' | 'away' | 'dnd' | 'invisible';
type HealthStatus = 'healthy' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

interface Service {
  id: string;
  name: string;
  description?: string;
  status: HealthStatus;
  uptime?: number;
  lastChecked?: Date;
  responseTime?: number;
  message?: string;
}

interface StatusIndicatorProps {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  pulse?: boolean;
}

interface ServiceStatusProps {
  services: Service[];
  onServiceClick?: (service: Service) => void;
  showUptime?: boolean;
  showResponseTime?: boolean;
}

interface StatusPageProps {
  title?: string;
  services: Service[];
  incidents?: Incident[];
  maintenance?: MaintenanceWindow[];
}

interface Incident {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  createdAt: Date;
  updatedAt: Date;
  updates: {
    message: string;
    timestamp: Date;
    status: string;
  }[];
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  status: 'scheduled' | 'in_progress' | 'completed';
}

// ==================== STATUS INDICATOR ====================

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'md',
  showLabel = false,
  pulse = true,
}) => {
  const getColor = (s: StatusType): string => {
    switch (s) {
      case 'online': return '#4caf50';
      case 'offline': return '#9e9e9e';
      case 'busy': return '#f44336';
      case 'away': return '#ff9800';
      case 'dnd': return '#f44336';
      case 'invisible': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  };

  const getLabel = (s: StatusType): string => {
    switch (s) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'busy': return 'Busy';
      case 'away': return 'Away';
      case 'dnd': return 'Do Not Disturb';
      case 'invisible': return 'Invisible';
      default: return 'Unknown';
    }
  };

  const sizes = {
    sm: 8,
    md: 12,
    lg: 16,
  };

  const dotSize = sizes[size];
  const color = getColor(status);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: dotSize,
      height: dotSize,
      borderRadius: '50%',
      background: color,
      animation: pulse && status === 'online' ? 'statusPulse 2s infinite' : undefined,
    },
    label: {
      fontSize: size === 'sm' ? 11 : size === 'lg' ? 14 : 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <span style={styles.container}>
      <span style={styles.dot} />
      {showLabel && <span style={styles.label}>{getLabel(status)}</span>}
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </span>
  );
};

// ==================== HEALTH STATUS BADGE ====================

interface HealthStatusBadgeProps {
  status: HealthStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const HealthStatusBadge: React.FC<HealthStatusBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const getConfig = (s: HealthStatus) => {
    switch (s) {
      case 'healthy':
        return { color: '#4caf50', bg: '#4caf5020', label: 'Operational' };
      case 'degraded':
        return { color: '#ff9800', bg: '#ff980020', label: 'Degraded' };
      case 'outage':
        return { color: '#f44336', bg: '#f4433620', label: 'Outage' };
      case 'maintenance':
        return { color: '#2196f3', bg: '#2196f320', label: 'Maintenance' };
      default:
        return { color: '#9e9e9e', bg: '#9e9e9e20', label: 'Unknown' };
    }
  };

  const config = getConfig(status);
  const padding = size === 'sm' ? '2px 8px' : size === 'lg' ? '6px 14px' : '4px 10px';
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 14 : 12;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding,
        borderRadius: 12,
        background: config.bg,
        color: config.color,
        fontSize,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: config.color,
        }}
      />
      {config.label}
    </span>
  );
};

// ==================== SERVICE STATUS ====================

export const ServiceStatus: React.FC<ServiceStatusProps> = ({
  services,
  onServiceClick,
  showUptime = true,
  showResponseTime = false,
}) => {
  const getStatusColor = (status: HealthStatus): string => {
    switch (status) {
      case 'healthy': return '#4caf50';
      case 'degraded': return '#ff9800';
      case 'outage': return '#f44336';
      case 'maintenance': return '#2196f3';
      default: return '#9e9e9e';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    service: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      cursor: onServiceClick ? 'pointer' : 'default',
      transition: 'background 0.15s ease',
    },
    left: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      width: 10,
      height: 10,
      borderRadius: '50%',
    },
    name: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    metric: {
      textAlign: 'right',
    },
    metricValue: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    metricLabel: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container as any}>
      {services.map((service) => (
        <div
          key={service.id}
          style={styles.service}
          onClick={() => onServiceClick?.(service)}
        >
          <div style={styles.left}>
            <span
              style={{
                ...styles.icon,
                background: getStatusColor(service.status),
              }}
            />
            <div>
              <div style={styles.name}>{service.name}</div>
              {service.description && (
                <div style={styles.description}>{service.description}</div>
              )}
            </div>
          </div>
          <div style={styles.right}>
            {showResponseTime && service.responseTime !== undefined && (
              <div style={styles.metric as any}>
                <div style={styles.metricValue}>{service.responseTime}ms</div>
                <div style={styles.metricLabel}>Response</div>
              </div>
            )}
            {showUptime && service.uptime !== undefined && (
              <div style={styles.metric as any}>
                <div style={styles.metricValue}>{service.uptime.toFixed(2)}%</div>
                <div style={styles.metricLabel}>Uptime</div>
              </div>
            )}
            <HealthStatusBadge status={service.status} size="sm" />
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== UPTIME BAR ====================

interface UptimeBarProps {
  days: { date: Date; status: HealthStatus; uptime?: number }[];
  showLabels?: boolean;
}

export const UptimeBar: React.FC<UptimeBarProps> = ({
  days,
  showLabels = true,
}) => {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const getColor = (status: HealthStatus): string => {
    switch (status) {
      case 'healthy': return '#4caf50';
      case 'degraded': return '#ff9800';
      case 'outage': return '#f44336';
      case 'maintenance': return '#2196f3';
      default: return '#e0e0e0';
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    bar: {
      display: 'flex',
      gap: 2,
    },
    day: {
      flex: 1,
      height: 24,
      borderRadius: 2,
      cursor: 'pointer',
      position: 'relative',
    },
    tooltip: {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '6px 10px',
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      whiteSpace: 'nowrap',
      fontSize: 12,
      zIndex: 10,
      marginBottom: 4,
    },
    labels: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.bar}>
        {days.map((day, index) => (
          <div
            key={index}
            style={{
              ...styles.day as any,
              background: getColor(day.status),
            }}
            onMouseEnter={() => setHoveredDay(index)}
            onMouseLeave={() => setHoveredDay(null)}
          >
            {hoveredDay === index && (
              <div style={styles.tooltip as any}>
                <div>{formatDate(day.date)}</div>
                {day.uptime !== undefined && (
                  <div style={{ fontWeight: 500 }}>{day.uptime.toFixed(2)}% uptime</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {showLabels && (
        <div style={styles.labels}>
          <span>{days.length} days ago</span>
          <span>Today</span>
        </div>
      )}
    </div>
  );
};

// ==================== INCIDENT TIMELINE ====================

interface IncidentTimelineProps {
  incident: Incident;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  incident,
}) => {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'investigating': return '#f44336';
      case 'identified': return '#ff9800';
      case 'monitoring': return '#2196f3';
      case 'resolved': return '#4caf50';
      default: return '#9e9e9e';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return '#f44336';
      case 'major': return '#ff9800';
      case 'minor': return '#ffc107';
      default: return '#9e9e9e';
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      padding: 16,
      borderLeft: `4px solid ${getSeverityColor(incident.severity)}`,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    badge: {
      padding: '4px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 500,
      textTransform: 'capitalize',
    },
    timeline: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      paddingLeft: 16,
      borderLeft: '2px solid var(--color-border)',
    },
    update: {
      position: 'relative',
    },
    updateDot: {
      position: 'absolute',
      left: -21,
      top: 4,
      width: 10,
      height: 10,
      borderRadius: '50%',
    },
    updateStatus: {
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    updateMessage: {
      fontSize: 14,
      color: 'var(--color-text)',
      marginBottom: 4,
    },
    updateTime: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{incident.title}</h3>
        <span
          style={{
            ...styles.badge,
            background: `${getStatusColor(incident.status)}20`,
            color: getStatusColor(incident.status),
          }}
        >
          {incident.status}
        </span>
      </div>
      <div style={styles.timeline as any}>
        {incident.updates.map((update, index) => (
          <div key={index} style={styles.update as any}>
            <span
              style={{
                ...styles.updateDot as any,
                background: getStatusColor(update.status),
              }}
            />
            <div
              style={{
                ...styles.updateStatus,
                color: getStatusColor(update.status),
              }}
            >
              {update.status}
            </div>
            <div style={styles.updateMessage}>{update.message}</div>
            <div style={styles.updateTime}>{formatTime(update.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== STATUS PAGE ====================

export const StatusPage: React.FC<StatusPageProps> = ({
  title = 'System Status',
  services,
  incidents = [],
  maintenance = [],
}) => {
  const [refreshTime, setRefreshTime] = useState(new Date());

  const overallStatus = (): HealthStatus => {
    if (services.some((s) => s.status === 'outage')) return 'outage';
    if (services.some((s) => s.status === 'degraded')) return 'degraded';
    if (services.some((s) => s.status === 'maintenance')) return 'maintenance';
    return 'healthy';
  };

  const getOverallMessage = (status: HealthStatus): string => {
    switch (status) {
      case 'healthy': return 'All Systems Operational';
      case 'degraded': return 'Partial System Outage';
      case 'outage': return 'Major System Outage';
      case 'maintenance': return 'Scheduled Maintenance';
      default: return 'Status Unknown';
    }
  };

  const status = overallStatus();
  const statusColors: Record<HealthStatus, string> = {
    healthy: '#4caf50',
    degraded: '#ff9800',
    outage: '#f44336',
    maintenance: '#2196f3',
    unknown: '#9e9e9e',
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: 800,
      margin: '0 auto',
      padding: 24,
    },
    header: {
      marginBottom: 32,
    },
    title: {
      fontSize: 24,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    overallStatus: {
      padding: 24,
      borderRadius: 12,
      textAlign: 'center',
      marginBottom: 24,
    },
    overallText: {
      fontSize: 20,
      fontWeight: 600,
      color: 'white',
      margin: 0,
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 16,
    },
    refreshInfo: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      textAlign: 'right',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        <div
          style={{
            ...styles.overallStatus as any,
            background: statusColors[status],
          }}
        >
          <p style={styles.overallText}>{getOverallMessage(status)}</p>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Services</h2>
        <ServiceStatus services={services} showUptime showResponseTime />
      </div>

      {incidents.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Active Incidents</h2>
          {incidents.map((incident) => (
            <IncidentTimeline key={incident.id} incident={incident} />
          ))}
        </div>
      )}

      {maintenance.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Scheduled Maintenance</h2>
          {maintenance.map((m) => (
            <div
              key={m.id}
              style={{
                padding: 16,
                background: 'var(--color-bg-secondary)',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {m.scheduledStart.toLocaleString()} - {m.scheduledEnd.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.refreshInfo as any}>
        Last updated: {refreshTime.toLocaleTimeString()}
      </div>
    </div>
  );
};

export default StatusIndicator;
