import React from 'react';

/**
 * AutosaveIndicator - tiny pill that surfaces autosave state to the user.
 * Used by creative apps (Vinx, Imosion, Polish, Forge, Canvas, PresentationBuilder, PixelArt).
 *
 * Visual states are styled by .dex-autosave / [data-state] in design-system.css.
 */

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveIndicatorProps {
  state: AutosaveState;
  /** ms since last successful save - rendered as a relative timestamp when in 'saved' state */
  lastSavedAt?: number | null;
  /** Optional override label for fully custom copy */
  label?: string;
  className?: string;
}

const formatRelative = (timestamp: number): string => {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
};

const labelFor = (state: AutosaveState, lastSavedAt: number | null | undefined, override?: string): string => {
  if (override) return override;
  switch (state) {
    case 'saving': return 'Saving...';
    case 'saved': return lastSavedAt ? `Saved ${formatRelative(lastSavedAt)}` : 'Saved';
    case 'error': return 'Save failed';
    case 'idle':
    default: return 'Up to date';
  }
};

export const AutosaveIndicator: React.FC<AutosaveIndicatorProps> = ({ state, lastSavedAt, label, className }) => {
  const computedLabel = labelFor(state, lastSavedAt, label);
  return (
    <span
      className={`dex-autosave ${className || ''}`}
      data-state={state}
      role="status"
      aria-live="polite"
      aria-label={computedLabel}
      title={computedLabel}
    >
      <span className="dex-autosave-dot" aria-hidden="true" />
      {computedLabel}
    </span>
  );
};

export default AutosaveIndicator;
