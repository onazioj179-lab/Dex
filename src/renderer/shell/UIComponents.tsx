// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UI Micro-Interactions
 * Hooks and components for form elements, lists, tables,
 * progress bars, and loading states with spring physics.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { isReduceMotion, SpringAnimator, SPRING_PRESETS } from '../utils/MotionController';
import { playToggle } from './SpatialAudio';

// =========================================================================
// FORM ELEMENTS
// =========================================================================

// ---------------------------------------------------------------------------
// TOGGLE SWITCH
// ---------------------------------------------------------------------------

export const DexToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
}> = ({ checked, onChange, disabled = false, size = 'medium' }) => {
  const w = size === 'small' ? 36 : 44;
  const h = size === 'small' ? 20 : 24;
  const circleSize = h - 4;
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (disabled) return;
    onChange(!checked);
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      playToggle(rect.left + rect.width / 2);
    }
  }, [checked, onChange, disabled]);

  const circleX = checked ? w - circleSize - 2 : 2;

  return (
    <button
      ref={ref}
      onClick={handleClick}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        background: checked ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        border: checked ? 'none' : '1px solid var(--color-border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        padding: 0,
        opacity: disabled ? 0.5 : 1,
        transition: isReduceMotion() ? 'none' : 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        left: circleX,
        width: circleSize,
        height: circleSize,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: isReduceMotion() ? 'none' : 'left 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </button>
  );
};

// ---------------------------------------------------------------------------
// DEX CHECKBOX
// ---------------------------------------------------------------------------

export const DexCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ checked, onChange, disabled = false, label }) => {
  const [pressed, setPressed] = useState(false);

  const scale = pressed ? 0.9 : checked ? 1.0 : 1.0;

  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      userSelect: 'none',
    }}>
      <button
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: checked ? 'none' : '2px solid var(--color-border)',
          background: checked ? 'var(--color-accent)' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
          transform: `scale(${scale})`,
          transition: isReduceMotion() ? 'none' : 'transform 0.1s ease, background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,5.5 4,7.5 8,3" style={{
              strokeDasharray: 12,
              strokeDashoffset: 0,
              animation: isReduceMotion() ? 'none' : 'checkDraw 0.1s ease-out',
            }} />
          </svg>
        )}
      </button>
      {label && <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{label}</span>}
    </label>
  );
};

// ---------------------------------------------------------------------------
// DEX SLIDER
// ---------------------------------------------------------------------------

export const DexSlider: React.FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ value, min = 0, max = 100, step = 1, onChange, disabled = false }) => {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const percent = ((value - min) / (max - min)) * 100;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e.clientX);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    updateValue(e.clientX);
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const updateValue = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, stepped)));
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        height: 20,
        display: 'flex',
        alignItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'none',
      }}
    >
      {/* Track background */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        height: 4,
        borderRadius: 2,
        background: 'var(--color-border)',
      }} />
      {/* Filled portion */}
      <div style={{
        position: 'absolute',
        left: 0,
        width: `${percent}%`,
        height: 4,
        borderRadius: 2,
        background: 'var(--color-accent)',
      }} />
      {/* Thumb */}
      <div style={{
        position: 'absolute',
        left: `${percent}%`,
        transform: 'translateX(-50%)',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        transition: isReduceMotion() ? 'none' : 'transform 0.08s ease',
        scale: (hovered || dragging) ? '1.2' : '1',
      }}>
        {/* Value tooltip while dragging */}
        {dragging && (
          <div style={{
            position: 'absolute',
            bottom: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DEX INPUT with focus border animation + validation shake
// ---------------------------------------------------------------------------

export const DexInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}> = ({ value, onChange, placeholder, type = 'text', error = false, disabled = false, style: customStyle }) => {
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && !shaking) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 300);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div style={{ position: 'relative', ...customStyle }}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 13,
          fontFamily: 'var(--font-family)',
          color: 'var(--color-text-primary)',
          background: focused ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)',
          border: '1px solid',
          borderColor: error ? 'var(--color-error)' : focused ? 'var(--color-accent)' : 'var(--color-border-subtle)',
          borderRadius: 8,
          outline: 'none',
          transition: isReduceMotion() ? 'none' : 'background 0.12s ease, border-color 0.12s ease',
          opacity: disabled ? 0.5 : 1,
          animation: shaking && !isReduceMotion() ? 'inputShake 0.3s ease' : 'none',
        }}
      />
      {/* Focus border indicator */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: error ? 'var(--color-error)' : 'var(--color-accent)',
        borderRadius: '0 0 8px 8px',
        transform: `scaleX(${focused ? 1 : 0})`,
        transformOrigin: 'center bottom',
        transition: isReduceMotion() ? 'none' : `transform ${focused ? '0.12s' : '0.1s'} ease`,
      }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// BUTTON with press state
// ---------------------------------------------------------------------------

export const DexButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: React.CSSProperties;
}> = ({ children, onClick, variant = 'secondary', disabled = false, style: customStyle }) => {
  const [pressed, setPressed] = useState(false);

  const bg = (() => {
    switch (variant) {
      case 'primary': return 'var(--color-accent)';
      case 'danger': return 'rgba(255,69,58,0.9)';
      case 'ghost': return 'transparent';
      default: return 'var(--color-bg-hover)';
    }
  })();

  const color = variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--color-text-primary)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: variant === 'ghost' ? '1px solid var(--color-border-subtle)' : 'none',
        background: bg,
        color,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: isReduceMotion() ? 'none' : 'transform 0.06s ease, opacity 0.1s ease',
        fontFamily: 'var(--font-family)',
        letterSpacing: '-0.01em',
        ...customStyle,
      }}
    >
      {children}
    </button>
  );
};

// =========================================================================
// LIST & TABLE INTERACTIONS
// =========================================================================

// ---------------------------------------------------------------------------
// LIST ITEM with hover + selection indicator
// ---------------------------------------------------------------------------

export const DexListItem: React.FC<{
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ selected = false, onClick, children, style: customStyle }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 6,
        cursor: 'pointer',
        position: 'relative',
        background: selected
          ? 'rgba(74,158,255,0.08)'
          : hovered
            ? 'var(--color-border-subtle)'
            : 'transparent',
        transition: isReduceMotion() ? 'none' : `background ${hovered ? '0.06s' : '0.08s'} ease`,
        ...customStyle,
      }}
    >
      {/* Selection indicator */}
      {selected && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 2,
          height: '60%',
          borderRadius: 1,
          background: 'var(--color-accent)',
        }} />
      )}
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// LETTER INDEX SCRUBBER for long lists
// ---------------------------------------------------------------------------

export const LetterScrubber: React.FC<{
  letters: string[];
  onSelect: (letter: string) => void;
}> = ({ letters, onSelect }) => {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const getLetterFromY = (clientY: number): string | null => {
    if (!scrubberRef.current) return null;
    const rect = scrubberRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const index = Math.floor((y / rect.height) * letters.length);
    return letters[Math.max(0, Math.min(letters.length - 1, index))] ?? null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const letter = getLetterFromY(e.clientY);
    if (letter) { setActiveLetter(letter); onSelect(letter); }
  }, [letters, onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const letter = getLetterFromY(e.clientY);
    if (letter && letter !== activeLetter) { setActiveLetter(letter); onSelect(letter); }
  }, [dragging, activeLetter, letters, onSelect]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setTimeout(() => setActiveLetter(null), 300);
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Floating large letter indicator */}
      {activeLetter && (
        <div style={{
          position: 'absolute',
          right: 24,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(0,0,0,0.80)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          pointerEvents: 'none',
        }}>
          {activeLetter}
        </div>
      )}

      <div
        ref={scrubberRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {letters.map(letter => (
          <div
            key={letter}
            style={{
              height: 14,
              fontSize: 9,
              fontWeight: 600,
              color: activeLetter === letter ? 'var(--color-accent)' : 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.1s ease',
            }}
          >
            {letter}
          </div>
        ))}
      </div>
    </div>
  );
};

// =========================================================================
// PROGRESS & LOADING
// =========================================================================

// ---------------------------------------------------------------------------
// PROGRESS BAR with shimmer and spring overshoot
// ---------------------------------------------------------------------------

export const DexProgressBar: React.FC<{
  value: number; // 0..100
  color?: string;
  height?: number;
  showShimmer?: boolean;
}> = ({ value, color = 'var(--color-accent)', height = 4, showShimmer = true }) => {
  return (
    <div style={{
      width: '100%',
      height,
      borderRadius: height / 2,
      background: 'var(--color-border)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, value))}%`,
        height: '100%',
        borderRadius: height / 2,
        background: color,
        transition: isReduceMotion() ? 'width 0s' : 'width 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Shimmer */}
        {showShimmer && value > 0 && value < 100 && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-40px',
            width: 40,
            height: '100%',
            background: 'linear-gradient(90deg, transparent, var(--color-text-tertiary), transparent)',
            animation: isReduceMotion() ? 'none' : 'shimmerSlide 1.5s linear infinite',
          }} />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SKELETON LOADER with sine wave pulse
// ---------------------------------------------------------------------------

export const DexSkeleton: React.FC<{
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = 16, borderRadius = 6, style: customStyle }) => {
  return (
    <div style={{
      width,
      height,
      borderRadius,
      background: 'var(--color-bg-secondary)',
      animation: isReduceMotion() ? 'none' : 'skeletonPulse 1.5s ease-in-out infinite',
      ...customStyle,
    }} />
  );
};

// ---------------------------------------------------------------------------
// STAGGER CONTENT after load
// ---------------------------------------------------------------------------

export const StaggeredContent: React.FC<{
  children: React.ReactNode[];
  /** Delay between each item in ms */
  stagger?: number;
  /** Max items to stagger (rest appear simultaneously) */
  maxStagger?: number;
}> = ({ children, stagger = 20, maxStagger = 10 }) => {
  if (isReduceMotion()) {
    return <>{children}</>;
  }

  return (
    <>
      {React.Children.map(children, (child, i) => {
        const delay = i < maxStagger ? i * stagger : maxStagger * stagger;
        return (
          <div style={{
            animation: `contentFadeIn 0.12s ease-out ${delay}ms both`,
          }}>
            {child}
          </div>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// TEXT SELECTION TOOLBAR
// ---------------------------------------------------------------------------

export const SelectionToolbar: React.FC<{
  visible: boolean;
  x: number;
  y: number;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}> = ({ visible, x, y, onCut, onCopy, onPaste }) => {
  if (!visible) return null;

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 4,
    transition: 'background 0.1s ease',
  };

  return (
    <div style={{
      position: 'fixed',
      left: x,
      top: y - 40,
      transform: 'translateX(-50%)',
      zIndex: 'var(--z-max)',
      display: 'flex',
      gap: 2,
      padding: 4,
      borderRadius: 8,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-subtle)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      animation: isReduceMotion() ? 'none' : 'toolbarIn 0.1s ease-out',
    }}>
      {onCut && (
        <button
          onClick={onCut}
          style={btnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >Cut</button>
      )}
      {onCopy && (
        <button
          onClick={onCopy}
          style={btnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >Copy</button>
      )}
      {onPaste && (
        <button
          onClick={onPaste}
          style={btnStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >Paste</button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// EMPTY STATE
// ---------------------------------------------------------------------------

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon, title, subtitle, action }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '40px 24px', textAlign: 'center',
    color: 'var(--color-text-tertiary)',
  }}>
    {icon && (
      <div style={{ opacity: 0.4, marginBottom: 4 }}>
        {icon}
      </div>
    )}
    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
      {title}
    </div>
    {subtitle && (
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', maxWidth: 260, lineHeight: 1.5 }}>
        {subtitle}
      </div>
    )}
    {action && (
      <button
        onClick={action.onClick}
        style={{
          marginTop: 8, padding: '6px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
      >
        {action.label}
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// SECTION HEADER
// ---------------------------------------------------------------------------

export const SectionHeader: React.FC<{
  label: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, action, style }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, ...style,
  }}>
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
      textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
    }}>
      {label}
    </span>
    {action && <div>{action}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// LOADING STATE
// ---------------------------------------------------------------------------

export const LoadingState: React.FC<{
  message?: string;
  size?: 'sm' | 'md';
}> = ({ message, size = 'md' }) => {
  const dim = size === 'sm' ? 18 : 28;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: size === 'sm' ? '20px 16px' : '40px 24px',
    }}>
      <div style={{
        width: dim, height: dim, borderRadius: '50%',
        border: `2px solid var(--color-border-subtle)`,
        borderTopColor: 'var(--color-accent)',
        animation: isReduceMotion() ? 'none' : 'spin 0.7s linear infinite',
      }} />
      {message && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {message}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// APP TOOLBAR — standardised 40px toolbar for DEX apps
// ---------------------------------------------------------------------------

export const AppToolbar: React.FC<{
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ left, center, right, style }) => (
  <div style={{
    height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px', flexShrink: 0,
    background: 'var(--color-bg-elevated)',
    borderBottom: '1px solid var(--color-border-subtle)',
    position: 'relative', zIndex: 100,
    ...style,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>{left}</div>
    {center && (
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {center}
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>{right}</div>
  </div>
);
