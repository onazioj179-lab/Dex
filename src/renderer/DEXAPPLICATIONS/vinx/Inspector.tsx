// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Inspector
 * 4 tabs: Video, Audio, Effects, Color
 * Transform controls, keyframe diamonds, color wheels, curves, scopes.
 */

import React, { useCallback, useState, useRef, useEffect, memo, useMemo } from 'react';
import { useVinxStore } from './VinxStore';
import type { Clip, ClipEffect, ClipTransform, ColorGradeSettings, ScopeType, EffectDefinition, EffectParameterDef, CurvePoint, ClipColorGrading } from './VinxTypes';
import { EFFECT_DEFINITIONS, AUDIO_EFFECTS, DEFAULT_COLOR_GRADE, DEFAULT_CLIP_COLOR_GRADING, formatTimecode } from './VinxTypes';
import { ColorWheel as PrimaryColorWheel, type ColorWheelValue } from './ColorWheel';
import { ScopesPanel, type ScopeMode } from './ScopesPanel';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0,
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex', height: 28, flexShrink: 0, borderBottom: '1px solid var(--color-bg-hover)',
  background: 'var(--color-bg-base)', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: '1 0 44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase',
  color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', cursor: 'pointer', userSelect: 'none',
  borderBottom: active ? '1px solid #4A9EFF' : '1px solid transparent',
  whiteSpace: 'nowrap',
});

const sectionHeaderStyle: React.CSSProperties = {
  padding: '8px 8px 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const propertyRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', minHeight: 24, minWidth: 0,
};

const propertyLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-text-tertiary)', width: 60, flexShrink: 0,
};

const numberInputStyle: React.CSSProperties = {
  flex: 1, height: 20, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)',
  borderRadius: 3, padding: '0 4px', fontSize: 11, color: 'var(--color-text-primary)', outline: 'none',
  textAlign: 'right', fontFamily: '"SF Mono", "Cascadia Code", "JetBrains Mono", monospace',
  fontVariantNumeric: 'tabular-nums slashed-zero',
  minWidth: 0,
};

const sliderContainerStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4,
};

const keyframeDiamondStyle = (active: boolean): React.CSSProperties => ({
  width: 8, height: 8, transform: 'rotate(45deg)',
  background: active ? 'var(--color-accent)' : 'var(--color-border)',
  cursor: 'pointer', flexShrink: 0,
});

const emptyStateStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-tertiary)', fontSize: 11, textAlign: 'center', padding: 16,
};

// ---------------------------------------------------------------------------
// SLIDER
// ---------------------------------------------------------------------------

const Slider: React.FC<{
  value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void;
}> = memo(({ value, min, max, step = 0.01, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const progress = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

  const valueFromEvent = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!trackRef.current) return min;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    return Math.round(raw / step) * step;
  }, [min, max, step]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onChange(valueFromEvent(e));
  }, [valueFromEvent, onChange]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    onChange(valueFromEvent(e));
  }, [valueFromEvent, onChange]);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      ref={trackRef}
      style={{ flex: 1, minWidth: 36, height: 4, background: 'var(--color-bg-hover)', borderRadius: 2, position: 'relative', cursor: 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: 'var(--color-accent)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: 4, background: 'var(--color-text-primary)' }} />
    </div>
  );
});

Slider.displayName = 'Slider';

// ---------------------------------------------------------------------------
// PROPERTY ROW WITH KEYFRAME
// ---------------------------------------------------------------------------

const PropertyRow: React.FC<{
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; hasKeyframe?: boolean; onKeyframe?: () => void;
}> = memo(({ label, value, min, max, step = 0.01, onChange, hasKeyframe = false, onKeyframe }) => {
  return (
    <div style={propertyRowStyle}>
      <span style={propertyLabelStyle}>{label}</span>
      <div style={sliderContainerStyle}>
        <Slider value={value} min={min} max={max} step={step} onChange={onChange} />
        <input
          type="number"
          style={{ ...numberInputStyle, width: 48, flex: '0 0 48px' }}
          value={Math.round(value * 100) / 100}
          onChange={e => onChange(Number(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
        />
      </div>
      {onKeyframe && (
        <div style={keyframeDiamondStyle(hasKeyframe)} onClick={onKeyframe} title="Toggle keyframe" />
      )}
    </div>
  );
});

PropertyRow.displayName = 'PropertyRow';

// ---------------------------------------------------------------------------
// VIDEO TAB
// ---------------------------------------------------------------------------

const VideoTab: React.FC<{ clip: Clip }> = memo(({ clip }) => {
  const _updateClip = useVinxStore(s => s._updateClip);
  const frameRate = useVinxStore(s => s.project.frameRate);
  const currentFrame = useVinxStore(s => s.currentFrame);
  const _addKeyframe = useVinxStore(s => s._addKeyframe);

  const transform = clip.transform;

  const updateTransform = useCallback((updates: Partial<ClipTransform>) => {
    _updateClip(clip.id, { transform: { ...transform, ...updates } });
  }, [clip.id, transform, _updateClip]);

  const hasKeyframeAt = useCallback((property: string) => {
    const relFrame = currentFrame - clip.startFrame;
    const track = clip.keyframes.find(kt => kt.property === property);
    return track ? track.keyframes.some(k => k.frame === relFrame) : false;
  }, [clip, currentFrame]);

  const toggleKeyframe = useCallback((property: string, value: number) => {
    const relFrame = currentFrame - clip.startFrame;
    _addKeyframe(clip.id, property, { frame: relFrame, value, easing: 'linear' });
  }, [clip.id, clip.startFrame, currentFrame, _addKeyframe]);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={sectionHeaderStyle}>Position</div>
      <PropertyRow label="X" value={transform.positionX} min={-1920} max={3840} step={1}
        onChange={v => updateTransform({ positionX: v })}
        hasKeyframe={hasKeyframeAt('positionX')}
        onKeyframe={() => toggleKeyframe('positionX', transform.positionX)} />
      <PropertyRow label="Y" value={transform.positionY} min={-1080} max={2160} step={1}
        onChange={v => updateTransform({ positionY: v })}
        hasKeyframe={hasKeyframeAt('positionY')}
        onKeyframe={() => toggleKeyframe('positionY', transform.positionY)} />

      <div style={sectionHeaderStyle}>Scale</div>
      <PropertyRow label="Scale X" value={transform.scaleX * 100} min={0} max={400} step={1}
        onChange={v => updateTransform({ scaleX: v / 100 })}
        hasKeyframe={hasKeyframeAt('scaleX')}
        onKeyframe={() => toggleKeyframe('scaleX', transform.scaleX)} />
      <PropertyRow label="Scale Y" value={transform.scaleY * 100} min={0} max={400} step={1}
        onChange={v => updateTransform({ scaleY: v / 100 })}
        hasKeyframe={hasKeyframeAt('scaleY')}
        onKeyframe={() => toggleKeyframe('scaleY', transform.scaleY)} />

      <div style={sectionHeaderStyle}>Rotation</div>
      <PropertyRow label="Angle" value={transform.rotation} min={-360} max={360} step={0.1}
        onChange={v => updateTransform({ rotation: v })}
        hasKeyframe={hasKeyframeAt('rotation')}
        onKeyframe={() => toggleKeyframe('rotation', transform.rotation)} />

      <div style={sectionHeaderStyle}>Opacity</div>
      <PropertyRow label="Opacity" value={clip.opacity * 100} min={0} max={100} step={1}
        onChange={v => _updateClip(clip.id, { opacity: v / 100 })}
        hasKeyframe={hasKeyframeAt('opacity')}
        onKeyframe={() => toggleKeyframe('opacity', clip.opacity)} />

      <div style={sectionHeaderStyle}>Anchor Point</div>
      <PropertyRow label="Anchor X" value={transform.anchorX * 100} min={0} max={100} step={1}
        onChange={v => updateTransform({ anchorX: v / 100 })} />
      <PropertyRow label="Anchor Y" value={transform.anchorY * 100} min={0} max={100} step={1}
        onChange={v => updateTransform({ anchorY: v / 100 })} />

      <div style={sectionHeaderStyle}>Clip Info</div>
      <div style={{ ...propertyRowStyle, color: 'var(--color-text-secondary)', fontSize: 10, fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        <span style={propertyLabelStyle}>Start</span>
        <span>{formatTimecode(clip.startFrame, frameRate)}</span>
      </div>
      <div style={{ ...propertyRowStyle, color: 'var(--color-text-secondary)', fontSize: 10, fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        <span style={propertyLabelStyle}>End</span>
        <span>{formatTimecode(clip.endFrame, frameRate)}</span>
      </div>
      <div style={{ ...propertyRowStyle, color: 'var(--color-text-secondary)', fontSize: 10, fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        <span style={propertyLabelStyle}>Duration</span>
        <span>{formatTimecode(clip.endFrame - clip.startFrame, frameRate)}</span>
      </div>
      <PropertyRow label="Speed" value={clip.speed * 100} min={10} max={800} step={1}
        onChange={v => _updateClip(clip.id, { speed: v / 100 })} />
    </div>
  );
});

VideoTab.displayName = 'VideoTab';

// ---------------------------------------------------------------------------
// AUDIO TAB
// ---------------------------------------------------------------------------

const AudioTab: React.FC<{ clip: Clip }> = memo(({ clip }) => {
  const _updateClip = useVinxStore(s => s._updateClip);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={sectionHeaderStyle}>Volume</div>
      <PropertyRow label="Level" value={clip.volume * 100} min={0} max={200} step={1}
        onChange={v => _updateClip(clip.id, { volume: v / 100 })} />

      <div style={sectionHeaderStyle}>Pan</div>
      <PropertyRow label="Pan" value={clip.pan} min={-1} max={1} step={0.01}
        onChange={v => _updateClip(clip.id, { pan: v })} />

      <div style={sectionHeaderStyle}>Audio</div>
      <div style={propertyRowStyle}>
        <span style={propertyLabelStyle}>Muted</span>
        <button
          aria-label={clip.muted ? 'Unmute clip' : 'Mute clip'}
          style={{
            padding: '2px 8px', fontSize: 10, border: '1px solid var(--color-border)',
            borderRadius: 3, background: clip.muted ? 'rgba(255,80,80,0.2)' : 'var(--color-border-subtle)',
            color: clip.muted ? '#FF6B6B' : 'var(--color-text-secondary)', cursor: 'pointer',
          }}
          onClick={() => _updateClip(clip.id, { muted: !clip.muted })}
        >
          {clip.muted ? 'Muted' : 'Active'}
        </button>
      </div>
    </div>
  );
});

AudioTab.displayName = 'AudioTab';

// ---------------------------------------------------------------------------
// EFFECTS TAB
// ---------------------------------------------------------------------------

const EffectsTab: React.FC<{ clip: Clip }> = memo(({ clip }) => {
  const _removeEffect = useVinxStore(s => s._removeEffect);
  const _updateEffectParam = useVinxStore(s => s._updateEffectParam);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {clip.effects.length === 0 && (
        <div style={emptyStateStyle}>
          Drag effects from the Media Browser
        </div>
      )}
      {clip.effects.map(effect => (
        <EffectSection
          key={effect.id}
          clipId={clip.id}
          effect={effect}
          onRemove={() => _removeEffect(clip.id, effect.id)}
          onUpdateParam={(paramId, value) => _updateEffectParam(clip.id, effect.id, paramId, value)}
        />
      ))}
    </div>
  );
});

EffectsTab.displayName = 'EffectsTab';

const EffectSection: React.FC<{
  clipId: string; effect: ClipEffect;
  onRemove: () => void;
  onUpdateParam: (paramId: string, value: number | string | boolean) => void;
}> = memo(({ clipId, effect, onRemove, onUpdateParam }) => {
  const def = useMemo(() =>
    [...EFFECT_DEFINITIONS, ...AUDIO_EFFECTS].find(d => d.id === effect.definitionId),
    [effect.definitionId]
  );

  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 6,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: 3,
          background: effect.enabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          cursor: 'pointer', flexShrink: 0,
        }} onClick={() => onUpdateParam('__enabled', !effect.enabled)} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{effect.name}</span>
        <button
          aria-label={`Remove ${effect.name} effect`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-text-tertiary)', padding: '0 4px' }}
          onClick={onRemove}
        >
          X
        </button>
      </div>
      {def && 'parameters' in def && (def as EffectDefinition).parameters.map((param: EffectParameterDef) => {
        const val = effect.parameters[param.id];
        if (param.type === 'number') {
          return (
            <PropertyRow
              key={param.id}
              label={param.name}
              value={typeof val === 'number' ? val : param.defaultValue as number}
              min={param.min ?? 0}
              max={param.max ?? 100}
              step={param.step ?? 0.01}
              onChange={v => onUpdateParam(param.id, v)}
            />
          );
        }
        if (param.type === 'boolean') {
          return (
            <div key={param.id} style={propertyRowStyle}>
              <span style={propertyLabelStyle}>{param.name}</span>
              <button
                aria-label={`Toggle ${param.name} ${val ? 'off' : 'on'}`}
                style={{
                  padding: '2px 8px', fontSize: 10, border: '1px solid var(--color-border)',
                  borderRadius: 3, background: val ? 'rgba(74,158,255,0.2)' : 'var(--color-border-subtle)',
                  color: val ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0,
                }}
                onClick={() => onUpdateParam(param.id, !val)}
              >
                {val ? 'On' : 'Off'}
              </button>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
});

EffectSection.displayName = 'EffectSection';

// ---------------------------------------------------------------------------
// COLOR TAB
// ---------------------------------------------------------------------------

const ColorWheel: React.FC<{
  label: string;
  r: number; g: number; b: number;
  onChange: (r: number, g: number, b: number) => void;
}> = memo(({ label, r, g, b, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const size = 80;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 4;

    ctx.clearRect(0, 0, size, size);

    // Draw color wheel
    for (let angle = 0; angle < 360; angle++) {
      const rad = (angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, rad, rad + Math.PI / 180 + 0.01);
      ctx.fillStyle = `hsl(${angle}, 70%, 50%)`;
      ctx.fill();
    }

    // Inner circle (dark)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--color-bg-base)';
    ctx.fill();

    // Indicator
    const offsetX = (r - 1) * radius * 0.6;
    const offsetY = (g - 1) * radius * 0.6;
    ctx.beginPath();
    ctx.arc(cx + offsetX, cy - offsetY, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--color-text-primary)';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [r, g, b, size]);

  const handlePointer = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 4;
    const px = e.clientX - rect.left - cx;
    const py = -(e.clientY - rect.top - cy);
    const dist = Math.sqrt(px * px + py * py);
    if (dist > radius) return;
    const nr = 1 + (px / (radius * 0.6));
    const ng = 1 + (py / (radius * 0.6));
    onChange(
      Math.max(0, Math.min(2, nr)),
      Math.max(0, Math.min(2, ng)),
      b
    );
  }, [b, onChange, size]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ cursor: 'crosshair', borderRadius: '50%', touchAction: 'none' }}
        onPointerDown={e => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); handlePointer(e); }}
        onPointerMove={e => { if (dragging.current) handlePointer(e); }}
        onPointerUp={() => { dragging.current = false; }}
      />
      <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
});

ColorWheel.displayName = 'ColorWheel';

const ColorTab: React.FC<{ clip: Clip }> = memo(({ clip }) => {
  const colorGrade = useVinxStore(s => s.colorGrade);
  const setColorGrade = useVinxStore(s => s.setColorGrade);
  const showScopes = useVinxStore(s => s.showScopes);
  const toggleScopes = useVinxStore(s => s.toggleScopes);
  const scopeType = useVinxStore(s => s.scopeType);
  const setScopeType = useVinxStore(s => s.setScopeType);
  const updateClipColorGrading = useVinxStore(s => s.updateClipColorGrading);

  const grading: ClipColorGrading = clip.colorGrading ?? DEFAULT_CLIP_COLOR_GRADING;
  const wheels = grading.primary.wheels;

  const updateWheel = useCallback((which: 'lift' | 'gamma' | 'gain', v: ColorWheelValue) => {
    updateClipColorGrading(clip.id, {
      primary: {
        wheels: { ...wheels, [which]: v },
      },
    });
  }, [clip.id, wheels, updateClipColorGrading]);

  const [liveScopeMode, setLiveScopeMode] = useState<ScopeMode>('waveform');
  const [previewVideo, setPreviewVideo] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    // Resolve video element via DOM (preview tagged with data-vinx-preview)
    const find = () => document.querySelector<HTMLVideoElement>('video[data-vinx-preview]');
    setPreviewVideo(find());
    const id = window.setInterval(() => {
      const v = find();
      setPreviewVideo(prev => (prev === v ? prev : v));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Three-way color wheels (per-clip primary correction) */}
      <div style={sectionHeaderStyle}>Primary (Lift / Gamma / Gain)</div>
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', padding: '4px 4px 8px', gap: 4, flexWrap: 'wrap' }}>
        <PrimaryColorWheel label="Lift" value={wheels.lift} onChange={v => updateWheel('lift', v)} size={100} />
        <PrimaryColorWheel label="Gamma" value={wheels.gamma} onChange={v => updateWheel('gamma', v)} size={100} />
        <PrimaryColorWheel label="Gain" value={wheels.gain} onChange={v => updateWheel('gain', v)} size={100} />
      </div>

      {/* Live scopes panel sampling preview video */}
      <div style={sectionHeaderStyle}>Live Scopes</div>
      <div style={{ padding: '0 8px 8px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {(['waveform', 'vectorscope', 'histogram'] as ScopeMode[]).map(m => (
            <button
              key={m}
              onClick={() => setLiveScopeMode(m)}
              aria-label={`Live ${m} scope`}
              style={{
                padding: '2px 8px', fontSize: 9, border: '1px solid var(--color-border)',
                borderRadius: 3, background: liveScopeMode === m ? 'rgba(74,158,255,0.15)' : 'transparent',
                color: liveScopeMode === m ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <ScopesPanel videoEl={previewVideo} mode={liveScopeMode} height={160} />
      </div>

      {/* Legacy global wheels (sequence-wide grade) */}
      <div style={sectionHeaderStyle}>Global Wheels</div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 4px 8px' }}>
        <ColorWheel label="Lift" r={colorGrade.liftR} g={colorGrade.liftG} b={colorGrade.liftB}
          onChange={(r, g, b) => setColorGrade({ liftR: r, liftG: g, liftB: b })} />
        <ColorWheel label="Gamma" r={colorGrade.gammaR} g={colorGrade.gammaG} b={colorGrade.gammaB}
          onChange={(r, g, b) => setColorGrade({ gammaR: r, gammaG: g, gammaB: b })} />
        <ColorWheel label="Gain" r={colorGrade.gainR} g={colorGrade.gainG} b={colorGrade.gainB}
          onChange={(r, g, b) => setColorGrade({ gainR: r, gainG: g, gainB: b })} />
      </div>

      {/* Basic adjustments */}
      <div style={sectionHeaderStyle}>Basic</div>
      <PropertyRow label="Exposure" value={colorGrade.exposure} min={-3} max={3} step={0.01}
        onChange={v => setColorGrade({ exposure: v })} />
      <PropertyRow label="Contrast" value={colorGrade.contrast} min={-1} max={1} step={0.01}
        onChange={v => setColorGrade({ contrast: v })} />
      <PropertyRow label="Saturation" value={colorGrade.saturation} min={0} max={3} step={0.01}
        onChange={v => setColorGrade({ saturation: v })} />
      <PropertyRow label="Temp" value={colorGrade.temperature} min={-100} max={100} step={1}
        onChange={v => setColorGrade({ temperature: v })} />
      <PropertyRow label="Tint" value={colorGrade.tint} min={-100} max={100} step={1}
        onChange={v => setColorGrade({ tint: v })} />
      <PropertyRow label="Highlights" value={colorGrade.highlights} min={-100} max={100} step={1}
        onChange={v => setColorGrade({ highlights: v })} />
      <PropertyRow label="Shadows" value={colorGrade.shadows} min={-100} max={100} step={1}
        onChange={v => setColorGrade({ shadows: v })} />

      {/* Curves */}
      <CurvesEditor colorGrade={colorGrade} setColorGrade={setColorGrade} />

      {/* Scopes */}
      <div style={{
        ...sectionHeaderStyle,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Scopes</span>
        <button
          aria-label={showScopes ? 'Hide scopes' : 'Show scopes'}
          style={{
            padding: '1px 6px', fontSize: 9, border: '1px solid var(--color-border)',
            borderRadius: 3, background: showScopes ? 'rgba(74,158,255,0.15)' : 'transparent',
            color: showScopes ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer',
          }}
          onClick={toggleScopes}
        >
          {showScopes ? 'Hide' : 'Show'}
        </button>
      </div>
      {showScopes && (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
            {(['waveform', 'vectorscope', 'histogram', 'parade'] as ScopeType[]).map(type => (
              <button
                key={type}
                aria-label={`Select ${type} scope`}
                style={{
                  padding: '2px 6px', fontSize: 9, border: '1px solid var(--color-border)',
                  borderRadius: 3, background: scopeType === type ? 'rgba(74,158,255,0.15)' : 'transparent',
                  color: scopeType === type ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer',
                  textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}
                onClick={() => setScopeType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <ScopeDisplay type={scopeType} />
        </div>
      )}

      {/* Reset */}
      <div style={{ padding: '8px' }}>
        <button
          aria-label="Reset color grade"
          style={{
            width: '100%', padding: '4px 0', fontSize: 10, border: '1px solid var(--color-border-subtle)',
            borderRadius: 4, background: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
          onClick={() => setColorGrade({ ...DEFAULT_COLOR_GRADE })}
        >
          Reset Color Grade
        </button>
      </div>
    </div>
  );
});

ColorTab.displayName = 'ColorTab';

// ---------------------------------------------------------------------------
// CURVES EDITOR
// ---------------------------------------------------------------------------

const CURVE_CHANNELS = [
  { key: 'master' as const, label: 'Master', color: '#E0E0E0' },
  { key: 'r' as const, label: 'R', color: '#FF6B6B' },
  { key: 'g' as const, label: 'G', color: '#6BCB77' },
  { key: 'b' as const, label: 'B', color: 'var(--color-accent)' },
];

type CurveChannel = 'master' | 'r' | 'g' | 'b';

function curveKey(ch: CurveChannel): keyof ColorGradeSettings {
  if (ch === 'master') return 'curvesMaster';
  if (ch === 'r') return 'curvesR';
  if (ch === 'g') return 'curvesG';
  return 'curvesB';
}

/** Interpolate Y at a given X using monotone cubic through sorted points */
function evaluateCurve(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      const t = (x - p0.x) / (p1.x - p0.x);
      return p0.y + t * (p1.y - p0.y);
    }
  }
  return x;
}

/** Build SVG path for a set of curve points with smooth cubic interpolation */
function buildCurvePath(points: CurvePoint[], w: number, h: number): string {
  if (points.length < 2) return '';
  const pts = points.map(p => ({ x: p.x * w, y: (1 - p.y) * h }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  return d;
}

const CurvesEditor: React.FC<{
  colorGrade: ColorGradeSettings;
  setColorGrade: (patch: Partial<ColorGradeSettings>) => void;
}> = memo(({ colorGrade, setColorGrade }) => {
  const [activeChannel, setActiveChannel] = useState<CurveChannel>('master');
  const [dragging, setDragging] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 224;
  const H = 140;

  const key = curveKey(activeChannel);
  const points = (colorGrade[key] as CurvePoint[]) || [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const channelColor = CURVE_CHANNELS.find(c => c.key === activeChannel)?.color || '#E0E0E0';

  const toSVG = useCallback((p: CurvePoint) => ({ x: p.x * W, y: (1 - p.y) * H }), []);

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    // Check if clicking near an existing point
    const nearIdx = points.findIndex(p => Math.abs(p.x - nx) < 0.05 && Math.abs(p.y - ny) < 0.08);
    if (nearIdx >= 0) {
      setDragging(nearIdx);
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      return;
    }
    // Add a new point
    const newPts = [...points, { x: nx, y: ny }].sort((a, b) => a.x - b.x);
    setColorGrade({ [key]: newPts });
    const insertedIdx = newPts.findIndex(p => p.x === nx && p.y === ny);
    setDragging(insertedIdx >= 0 ? insertedIdx : null);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [points, key, setColorGrade]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    const newPts = [...points];
    newPts[dragging] = { x: nx, y: ny };
    newPts.sort((a, b) => a.x - b.x);
    setColorGrade({ [key]: newPts });
    const movedIdx = newPts.findIndex(p => p.x === nx && p.y === ny);
    if (movedIdx >= 0 && movedIdx !== dragging) setDragging(movedIdx);
  }, [dragging, points, key, setColorGrade]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1 - (e.clientY - rect.top) / rect.height;
    const nearIdx = points.findIndex(p => Math.abs(p.x - nx) < 0.05 && Math.abs(p.y - ny) < 0.08);
    if (nearIdx > 0 && nearIdx < points.length - 1) {
      const newPts = points.filter((_, i) => i !== nearIdx);
      setColorGrade({ [key]: newPts });
    }
  }, [points, key, setColorGrade]);

  const resetCurve = useCallback(() => {
    setColorGrade({ [key]: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  }, [key, setColorGrade]);

  return (
    <div>
      <div style={{ ...sectionHeaderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Curves</span>
        <button
          style={{ padding: '1px 6px', fontSize: 9, border: '1px solid var(--color-border)', borderRadius: 3, background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
          onClick={resetCurve}
          aria-label="Reset curve"
        >
          Reset
        </button>
      </div>
      <div style={{ padding: '2px 8px 4px' }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
          {CURVE_CHANNELS.map(ch => (
            <button
              key={ch.key}
              aria-label={`Curve channel: ${ch.label}`}
              aria-pressed={activeChannel === ch.key}
              style={{
                padding: '2px 8px', fontSize: 9, fontWeight: 600,
                border: '1px solid var(--color-border)', borderRadius: 3,
                background: activeChannel === ch.key ? `${ch.color}20` : 'transparent',
                color: activeChannel === ch.key ? ch.color : 'var(--color-text-tertiary)',
                cursor: 'pointer', flexShrink: 0,
              }}
              onClick={() => setActiveChannel(ch.key)}
            >
              {ch.label}
            </button>
          ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: '100%', height: H, background: 'var(--color-bg-base)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', cursor: dragging !== null ? 'grabbing' : 'crosshair', touchAction: 'none', display: 'block' }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          {/* Grid */}
          {[0.25, 0.5, 0.75].map(v => (
            <React.Fragment key={v}>
              <line x1={v * W} y1={0} x2={v * W} y2={H} stroke="#1A1A1A" strokeWidth={0.5} />
              <line x1={0} y1={v * H} x2={W} y2={v * H} stroke="#1A1A1A" strokeWidth={0.5} />
            </React.Fragment>
          ))}
          {/* Diagonal reference */}
          <line x1={0} y1={H} x2={W} y2={0} stroke="#2A2A2A" strokeWidth={0.5} strokeDasharray="3,3" />
          {/* Inactive channel curves (faded) */}
          {CURVE_CHANNELS.filter(ch => ch.key !== activeChannel).map(ch => {
            const chPts = (colorGrade[curveKey(ch.key)] as CurvePoint[]) || [{ x: 0, y: 0 }, { x: 1, y: 1 }];
            const isDefault = chPts.length === 2 && chPts[0].x === 0 && chPts[0].y === 0 && chPts[1].x === 1 && chPts[1].y === 1;
            if (isDefault) return null;
            return <path key={ch.key} d={buildCurvePath(chPts, W, H)} fill="none" stroke={ch.color} strokeWidth={0.8} opacity={0.25} />;
          })}
          {/* Active curve */}
          <path d={buildCurvePath(points, W, H)} fill="none" stroke={channelColor} strokeWidth={1.5} />
          {/* Points */}
          {points.map((p, i) => {
            const sv = toSVG(p);
            return <circle key={i} cx={sv.x} cy={sv.y} r={dragging === i ? 5 : 3.5} fill={channelColor} stroke="#000" strokeWidth={1} style={{ cursor: 'grab' }} />;
          })}
        </svg>
        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2, textAlign: 'center' }}>
          Click to add · Drag to adjust · Double-click to remove
        </div>
      </div>
    </div>
  );
});

CurvesEditor.displayName = 'CurvesEditor';

// ---------------------------------------------------------------------------
// SCOPE DISPLAY
// ---------------------------------------------------------------------------

const ScopeDisplay: React.FC<{ type: ScopeType }> = memo(({ type }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorGrade = useVinxStore(s => s.colorGrade);
  const width = 240;
  const height = 120;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, height * i / 4); ctx.lineTo(width, height * i / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(width * i / 4, 0); ctx.lineTo(width * i / 4, height); ctx.stroke();
    }

    // Derive visual params from color grade
    const exp = colorGrade.exposure;
    const con = colorGrade.contrast;
    const sat = colorGrade.saturation;
    const temp = colorGrade.temperature;
    const tint = colorGrade.tint;
    const hi = colorGrade.highlights;
    const sh = colorGrade.shadows;

    /** Pseudo-random seeded by index */
    const prng = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    if (type === 'waveform') {
      // Simulated luma waveform influenced by exposure/contrast/highlights/shadows
      ctx.globalAlpha = 0.6;
      for (let col = 0; col < width; col++) {
        const n = 18 + Math.floor(prng(col) * 8);
        for (let j = 0; j < n; j++) {
          const base = prng(col * 100 + j);
          let luma = base * 0.6 + 0.2; // baseline mid-range
          luma += exp * 0.12;
          luma += (luma > 0.5 ? hi : sh) * 0.001;
          const contrast_factor = 1 + con * 0.5;
          luma = 0.5 + (luma - 0.5) * contrast_factor;
          luma = Math.max(0, Math.min(1, luma));
          const y = (1 - luma) * height;
          const intensity = 0.3 + prng(col + j * 300) * 0.5;
          ctx.fillStyle = `rgba(200, 220, 200, ${intensity})`;
          ctx.fillRect(col, y, 1.2, 1.2);
        }
      }
      ctx.globalAlpha = 1;
    } else if (type === 'vectorscope') {
      // Vectorscope: dot cloud around center influenced by saturation/temp/tint
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) / 2 - 6;
      ctx.strokeStyle = '#1A1A1A';
      ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, maxR * 0.5, 0, Math.PI * 2); ctx.stroke();
      // Skin tone line
      ctx.strokeStyle = '#3A2A1A';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + maxR * 0.7, cy - maxR * 0.4); ctx.stroke();
      ctx.globalAlpha = 0.5;
      const satMul = Math.max(0.1, sat);
      const tempOff = temp * 0.005;
      const tintOff = tint * 0.003;
      for (let i = 0; i < 400; i++) {
        const angle = prng(i) * Math.PI * 2 + tempOff;
        const dist = prng(i * 3 + 7) * maxR * 0.5 * satMul;
        const x = cx + Math.cos(angle) * dist + tintOff * maxR;
        const y = cy + Math.sin(angle) * dist;
        const r = Math.floor(128 + Math.cos(angle) * 60);
        const g = Math.floor(128 + Math.cos(angle + 2.1) * 60);
        const b = Math.floor(128 + Math.cos(angle + 4.2) * 60);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    } else if (type === 'histogram') {
      // RGB histograms
      const bins = 64;
      const rBins = new Float32Array(bins);
      const gBins = new Float32Array(bins);
      const bBins = new Float32Array(bins);
      for (let i = 0; i < 600; i++) {
        let rv = prng(i * 2) + exp * 0.1 + temp * 0.002;
        let gv = prng(i * 2 + 1) + exp * 0.1 - temp * 0.001 + tint * 0.001;
        let bv = prng(i * 2 + 2) + exp * 0.1 - temp * 0.002;
        rv = Math.max(0, Math.min(1, rv)); gv = Math.max(0, Math.min(1, gv)); bv = Math.max(0, Math.min(1, bv));
        rBins[Math.floor(rv * (bins - 1))] += 1;
        gBins[Math.floor(gv * (bins - 1))] += 1;
        bBins[Math.floor(bv * (bins - 1))] += 1;
      }
      const maxVal = Math.max(1, ...(Array.from(rBins) as number[]), ...(Array.from(gBins) as number[]), ...(Array.from(bBins) as number[]));
      const bw = width / bins;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < bins; i++) {
        const x = i * bw;
        const rh = (rBins[i] / maxVal) * height * 0.9;
        const gh = (gBins[i] / maxVal) * height * 0.9;
        const bh = (bBins[i] / maxVal) * height * 0.9;
        ctx.fillStyle = '#FF6B6B'; ctx.fillRect(x, height - rh, bw - 0.5, rh);
        ctx.fillStyle = '#6BCB77'; ctx.fillRect(x, height - gh, bw - 0.5, gh);
        ctx.fillStyle = 'var(--color-accent)'; ctx.fillRect(x, height - bh, bw - 0.5, bh);
      }
      ctx.globalAlpha = 1;
    } else if (type === 'parade') {
      // RGB Parade — 3 side-by-side waveforms
      const third = Math.floor(width / 3);
      const channels = [
        { color: 'rgba(255,100,100,', offset: 0, tempBias: temp * 0.003 },
        { color: 'rgba(100,200,120,', offset: third, tempBias: -temp * 0.001 + tint * 0.001 },
        { color: 'rgba(74,158,255,', offset: third * 2, tempBias: -temp * 0.003 },
      ];
      ctx.globalAlpha = 0.6;
      for (const ch of channels) {
        for (let col = 0; col < third; col++) {
          const n = 12 + Math.floor(prng(col + ch.offset) * 6);
          for (let j = 0; j < n; j++) {
            let v = prng(col * 50 + j + ch.offset * 17);
            v += exp * 0.12 + ch.tempBias;
            v = Math.max(0, Math.min(1, v));
            const y = (1 - v) * height;
            const alpha = 0.3 + prng(col + j * 200 + ch.offset) * 0.4;
            ctx.fillStyle = `${ch.color}${alpha})`;
            ctx.fillRect(ch.offset + col, y, 1.2, 1.2);
          }
        }
      }
      ctx.globalAlpha = 1;
      // Divider lines
      ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(third, 0); ctx.lineTo(third, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(third * 2, 0); ctx.lineTo(third * 2, height); ctx.stroke();
    }

    // Label
    ctx.fillStyle = 'var(--color-text-tertiary)';
    ctx.font = '9px system-ui';
    ctx.fillText(type.charAt(0).toUpperCase() + type.slice(1), 4, 12);
  }, [type, width, height, colorGrade]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', maxWidth: '100%', height: 120, borderRadius: 4, border: '1px solid var(--color-border-subtle)', display: 'block' }}
    />
  );
});

ScopeDisplay.displayName = 'ScopeDisplay';

// ---------------------------------------------------------------------------
// INSPECTOR (MAIN EXPORT)
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'video' as const, label: 'Video' },
  { key: 'audio' as const, label: 'Audio' },
  { key: 'effects' as const, label: 'FX' },
  { key: 'color' as const, label: 'Color' },
];

export const Inspector: React.FC = memo(() => {
  const activeTab = useVinxStore(s => s.inspectorTab);
  const setTab = useVinxStore(s => s.setInspectorTab);
  const selectedClipIds = useVinxStore(s => s.selectedClipIds);
  const getClipById = useVinxStore(s => s.getClipById);

  const clip = selectedClipIds.length === 1 ? getClipById(selectedClipIds[0]) : null;

  return (
    <div style={panelStyle}>
      {/* Tab bar */}
      <div style={tabBarStyle}>
        {TABS.map(tab => (
          <div
            key={tab.key}
            style={tabStyle(activeTab === tab.key)}
            onClick={() => setTab(tab.key)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!clip ? (
          <div style={emptyStateStyle}>
            Select a clip to inspect
          </div>
        ) : (
          <>
            {/* Clip name header */}
            <div style={{
              padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)',
              borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {clip.name}
            </div>
            {activeTab === 'video' && <VideoTab clip={clip} />}
            {activeTab === 'audio' && <AudioTab clip={clip} />}
            {activeTab === 'effects' && <EffectsTab clip={clip} />}
            {activeTab === 'color' && <ColorTab clip={clip} />}
          </>
        )}
      </div>
    </div>
  );
});

Inspector.displayName = 'Inspector';
