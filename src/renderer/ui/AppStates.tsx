/**
 * AppStates — empty / error / loading primitives that match the design tokens
 * defined in `design-system.css` (--state-* family + .app-state-* classes).
 *
 * Use these inside <AppShell> so every app speaks the same language for
 * "nothing here yet", "something broke", and "still loading".
 */
import React from 'react';
import DexIcon from '../components/DexIcon';

interface BaseProps {
  title?: string;
  description?: string;
  icon?: string;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export const AppEmptyState: React.FC<BaseProps> = ({
  title = 'Nothing here yet',
  description,
  icon = 'inbox',
  action,
  className,
  style,
  'data-testid': testId,
}) => (
  <div
    data-app-state="empty"
    data-testid={testId ?? 'app-empty-state'}
    className={className}
    style={style}
    role="status"
  >
    <DexIcon name={icon} size={32} />
    <div className="app-state-title">{title}</div>
    {description && <div>{description}</div>}
    {action}
  </div>
);

export const AppErrorState: React.FC<BaseProps & { onRetry?: () => void }> = ({
  title = 'Something went wrong',
  description,
  icon = 'alert-triangle',
  action,
  onRetry,
  className,
  style,
  'data-testid': testId,
}) => (
  <div
    data-app-state="error"
    data-testid={testId ?? 'app-error-state'}
    className={className}
    style={style}
    role="alert"
  >
    <DexIcon name={icon} size={32} />
    <div className="app-state-title" style={{ color: 'var(--state-error-fg)' }}>{title}</div>
    {description && <div>{description}</div>}
    {action}
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 6,
          height: 'var(--ctl-h-sm, 28px)',
          padding: '0 14px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    )}
  </div>
);

interface LoadingProps {
  /** Number of skeleton rows to render. */
  rows?: number;
  /** Pixel height per skeleton row. */
  rowHeight?: number;
  /** Optional label rendered above the skeleton stack (screen-reader friendly). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export const AppLoadingState: React.FC<LoadingProps> = ({
  rows = 4,
  rowHeight = 16,
  label = 'Loading',
  className,
  style,
  'data-testid': testId,
}) => (
  <div
    data-testid={testId ?? 'app-loading-state'}
    className={className}
    style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20, ...style }}
    role="status"
    aria-busy="true"
    aria-label={label}
  >
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        data-app-state="loading"
        style={{
          height: rowHeight,
          width: i === rows - 1 ? '70%' : '100%',
        }}
      />
    ))}
  </div>
);

export default { AppEmptyState, AppErrorState, AppLoadingState };
