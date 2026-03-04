/**
 * DEX Activity Feed Components
 * Activity streams and timelines
 */

import React, { useState, useMemo } from 'react';

// ==================== TYPES ====================

interface ActivityUser {
  id: string;
  name: string;
  avatar?: string;
}

interface Activity {
  id: string;
  type: 'create' | 'update' | 'delete' | 'comment' | 'assign' | 'complete' | 'share' | 'mention' | 'upload' | 'custom';
  user: ActivityUser;
  action: string;
  target?: {
    type: string;
    name: string;
    link?: string;
  };
  metadata?: Record<string, any>;
  timestamp: Date;
  icon?: string;
  color?: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  onActivityClick?: (activity: Activity) => void;
  onUserClick?: (user: ActivityUser) => void;
  groupByDate?: boolean;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  emptyMessage?: string;
}

interface ActivityItemProps {
  activity: Activity;
  onActivityClick?: (activity: Activity) => void;
  onUserClick?: (user: ActivityUser) => void;
  compact?: boolean;
}

// ==================== ACTIVITY ICON ====================

const getActivityIcon = (type: Activity['type'], customIcon?: string): string => {
  if (customIcon) return customIcon;

  switch (type) {
    case 'create': return 'plus';
    case 'update': return 'edit';
    case 'delete': return 'trash';
    case 'comment': return 'message-circle';
    case 'assign': return 'user';
    case 'complete': return 'check-circle';
    case 'share': return 'link';
    case 'mention': return '@';
    case 'upload': return 'paperclip';
    default: return 'pin';
  }
};

const getActivityColor = (type: Activity['type'], customColor?: string): string => {
  if (customColor) return customColor;

  switch (type) {
    case 'create': return '#4caf50';
    case 'update': return '#2196f3';
    case 'delete': return '#f44336';
    case 'comment': return '#9c27b0';
    case 'assign': return '#ff9800';
    case 'complete': return '#4caf50';
    case 'share': return '#00bcd4';
    case 'mention': return '#e91e63';
    case 'upload': return '#607d8b';
    default: return 'var(--color-accent)';
  }
};

// ==================== ACTIVITY ITEM ====================

export const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  onActivityClick,
  onUserClick,
  compact = false,
}) => {
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: compact ? 8 : 12,
      padding: compact ? '8px 0' : '12px 0',
    },
    iconWrapper: {
      width: compact ? 28 : 36,
      height: compact ? 28 : 36,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: compact ? 12 : 14,
      flexShrink: 0,
      background: `${getActivityColor(activity.type, activity.color)}20`,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    text: {
      fontSize: compact ? 13 : 14,
      color: 'var(--color-text)',
      lineHeight: 1.5,
    },
    userLink: {
      fontWeight: 600,
      color: 'var(--color-text)',
      cursor: 'pointer',
    },
    targetLink: {
      color: 'var(--color-accent)',
      cursor: 'pointer',
    },
    time: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 2,
    },
    metadata: {
      marginTop: 8,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 6,
      fontSize: 13,
    },
  };

  return (
    <div
      style={styles.container}
      onClick={() => onActivityClick?.(activity)}
    >
      <div style={styles.iconWrapper}>
        {getActivityIcon(activity.type, activity.icon)}
      </div>
      <div style={styles.content}>
        <div style={styles.text}>
          <span
            style={styles.userLink}
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.(activity.user);
            }}
          >
            {activity.user.name}
          </span>{' '}
          {activity.action}
          {activity.target && (
            <>
              {' '}
              <span
                style={styles.targetLink}
                onClick={(e) => e.stopPropagation()}
              >
                {activity.target.name}
              </span>
            </>
          )}
        </div>
        <div style={styles.time}>{formatTime(activity.timestamp)}</div>
        {activity.metadata?.preview && (
          <div style={styles.metadata}>{activity.metadata.preview}</div>
        )}
      </div>
    </div>
  );
};

// ==================== ACTIVITY FEED ====================

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  onActivityClick,
  onUserClick,
  groupByDate = true,
  showLoadMore = false,
  onLoadMore,
  loading = false,
  emptyMessage = 'No activity yet',
}) => {
  const groupedActivities = useMemo(() => {
    if (!groupByDate) return { All: activities };

    const groups: Record<string, Activity[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    activities.forEach((activity) => {
      const date = new Date(activity.timestamp);
      date.setHours(0, 0, 0, 0);

      let groupKey: string;
      if (date.getTime() === today.getTime()) {
        groupKey = 'Today';
      } else if (date.getTime() === yesterday.getTime()) {
        groupKey = 'Yesterday';
      } else if (date >= thisWeek) {
        groupKey = 'This Week';
      } else {
        groupKey = date.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(activity);
    });

    return groups;
  }, [activities, groupByDate]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
    },
    group: {
      marginBottom: 24,
    },
    groupTitle: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
    },
    divider: {
      height: 1,
      background: 'var(--color-border)',
      margin: '4px 0 4px 48px',
    },
    empty: {
      padding: 40,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
    loadMore: {
      padding: '12px 24px',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'transparent',
      color: 'var(--color-text)',
      cursor: 'pointer',
      fontSize: 14,
      margin: '16px auto 0',
      display: 'block',
    },
  };

  if (activities.length === 0) {
    return (
      <div style={styles.empty as any}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>inbox</div>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div style={styles.container as any}>
      {Object.entries(groupedActivities).map(([group, items]) => (
        <div key={group} style={styles.group}>
          {groupByDate && (
            <div style={styles.groupTitle}>{group}</div>
          )}
          <div style={styles.list as any}>
            {items.map((activity, index) => (
              <React.Fragment key={activity.id}>
                <ActivityItem
                  activity={activity}
                  onActivityClick={onActivityClick}
                  onUserClick={onUserClick}
                />
                {index < items.length - 1 && <div style={styles.divider} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
      {showLoadMore && onLoadMore && (
        <button
          style={styles.loadMore}
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
};

// ==================== COMPACT ACTIVITY FEED ====================

interface CompactActivityFeedProps {
  activities: Activity[];
  limit?: number;
  onViewAll?: () => void;
}

export const CompactActivityFeed: React.FC<CompactActivityFeedProps> = ({
  activities,
  limit = 5,
  onViewAll,
}) => {
  const displayedActivities = activities.slice(0, limit);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      padding: 16,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
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
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>Recent Activity</h4>
        {onViewAll && activities.length > limit && (
          <button style={styles.viewAll} onClick={onViewAll}>
            View All
          </button>
        )}
      </div>
      <div style={styles.list as any}>
        {displayedActivities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            compact
          />
        ))}
      </div>
    </div>
  );
};

// ==================== ACTIVITY TIMELINE ====================

interface ActivityTimelineProps {
  activities: Activity[];
  orientation?: 'vertical' | 'horizontal';
  onActivityClick?: (activity: Activity) => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  orientation = 'vertical',
  onActivityClick,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: orientation === 'vertical' ? 'column' : 'row',
      position: 'relative',
    },
    line: orientation === 'vertical' ? {
      position: 'absolute',
      left: 17,
      top: 0,
      bottom: 0,
      width: 2,
      background: 'var(--color-border)',
    } : {
      position: 'absolute',
      top: 17,
      left: 0,
      right: 0,
      height: 2,
      background: 'var(--color-border)',
    },
    item: orientation === 'vertical' ? {
      display: 'flex',
      gap: 16,
      paddingBottom: 24,
      position: 'relative',
    } : {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      paddingRight: 32,
      position: 'relative',
    },
    dot: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      flexShrink: 0,
      background: 'var(--color-bg)',
      border: '3px solid var(--color-border)',
      zIndex: 1,
    },
    content: orientation === 'vertical' ? {
      flex: 1,
      paddingTop: 6,
    } : {
      textAlign: 'center',
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginTop: 4,
    },
    time: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginTop: 4,
    },
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.line as any} />
      {activities.map((activity) => (
        <div
          key={activity.id}
          style={styles.item as any}
          onClick={() => onActivityClick?.(activity)}
        >
          <div
            style={{
              ...styles.dot,
              borderColor: getActivityColor(activity.type, activity.color),
            }}
          >
            {getActivityIcon(activity.type, activity.icon)}
          </div>
          <div style={styles.content as any}>
            <h5 style={styles.title}>{activity.action}</h5>
            {activity.target && (
              <div style={styles.description}>{activity.target.name}</div>
            )}
            <div style={styles.time}>{formatDate(activity.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== ACTIVITY FILTERS ====================

interface ActivityFiltersProps {
  types: { value: Activity['type']; label: string }[];
  selectedTypes: Activity['type'][];
  onTypeChange: (types: Activity['type'][]) => void;
  users?: ActivityUser[];
  selectedUsers?: string[];
  onUserChange?: (userIds: string[]) => void;
  dateRange?: { start: Date; end: Date };
  onDateRangeChange?: (range: { start: Date; end: Date }) => void;
}

export const ActivityFilters: React.FC<ActivityFiltersProps> = ({
  types,
  selectedTypes,
  onTypeChange,
  users,
  selectedUsers,
  onUserChange,
}) => {
  const toggleType = (type: Activity['type']) => {
    if (selectedTypes.includes(type)) {
      onTypeChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypeChange([...selectedTypes, type]);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 16,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      flexWrap: 'wrap',
    },
    group: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    label: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginRight: 4,
    },
    chip: {
      padding: '4px 10px',
      borderRadius: 12,
      border: 'none',
      cursor: 'pointer',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.group}>
        <span style={styles.label}>Type:</span>
        {types.map((type) => (
          <button
            key={type.value}
            style={{
              ...styles.chip,
              background: selectedTypes.includes(type.value)
                ? getActivityColor(type.value)
                : 'var(--color-bg-tertiary)',
              color: selectedTypes.includes(type.value)
                ? 'white'
                : 'var(--color-text)',
            }}
            onClick={() => toggleType(type.value)}
          >
            {getActivityIcon(type.value)} {type.label}
          </button>
        ))}
      </div>
      {users && users.length > 0 && (
        <div style={styles.group}>
          <span style={styles.label}>By:</span>
          <select
            value={selectedUsers?.[0] || ''}
            onChange={(e) => onUserChange?.(e.target.value ? [e.target.value] : [])}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 12,
            }}
          >
            <option value="">All Users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
