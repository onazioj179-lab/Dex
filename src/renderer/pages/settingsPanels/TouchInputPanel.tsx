// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings > Touch & Pen. Reports what the hardware actually says it supports,
// gives a test pad that shows every live contact (the way to verify five- and
// ten-point touch on a real screen: a mouse can only ever produce one), and the
// haptics switch.
//

import React, { useEffect, useRef, useState } from 'react';
import { ContactTracker, touchCapabilities, MAX_CONTACTS, type Contact } from '../../shell/input/touchContacts';
import { hapticSupport, hapticsEnabled, setHapticsEnabled, subscribeHaptics, haptic } from '../../shell/input/haptics';

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' };
const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' };
const desc: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 };
const value: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

const Switch: React.FC<{ on: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }> = ({ on, label: aria, disabled, onChange }) => (
  <button role="switch" aria-checked={on} aria-label={aria} disabled={disabled} onClick={() => onChange(!on)} style={{
    width: 44, height: 24, borderRadius: 9999, border: on ? 'none' : '1px solid var(--color-border-control)', padding: 0,
    background: on ? 'var(--color-accent)' : 'var(--color-bg-hover)', position: 'relative', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
    opacity: disabled ? 0.5 : 1, transition: 'background var(--duration-normal, 150ms) ease',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: 9999, background: 'var(--color-accent-text)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left var(--duration-normal, 150ms) ease',
    }} />
  </button>
);

const TouchTestPad: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const tracker = useRef(new ContactTracker());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [peak, setPeak] = useState(0);
  const [kinds, setKinds] = useState<string>('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = tracker.current;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const sync = () => { setContacts(t.list().map((c) => ({ ...c }))); setPeak(t.peakCount); };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      const p = local(e);
      if (!t.down({ pointerId: e.pointerId, pointerType: e.pointerType, clientX: p.x, clientY: p.y, isPrimary: e.isPrimary, pressure: e.pressure })) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      setKinds((k) => (k.includes(e.pointerType) ? k : [k, e.pointerType].filter(Boolean).join(', ')));
      sync();
    };
    const move = (e: PointerEvent) => {
      if (!t.has(e.pointerId)) return;
      const p = local(e);
      t.move({ pointerId: e.pointerId, pointerType: e.pointerType, clientX: p.x, clientY: p.y, pressure: e.pressure });
      sync();
    };
    const up = (e: PointerEvent) => { if (t.up(e.pointerId)) sync(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
  }, []);

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div>
          <div style={label}>Touch test</div>
          <div style={desc}>Put fingers on the pad. Each contact is drawn with its own ID.</div>
        </div>
        <button onClick={() => { tracker.current.resetPeak(); setPeak(tracker.current.count); setKinds(''); }}
          style={{ height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' }}>
          Reset
        </button>
      </div>
      <div ref={ref} data-touch-surface="" role="img"
        aria-label={`Touch test pad: ${contacts.length} contacts now, most at once ${peak}`}
        style={{
          position: 'relative', height: 220, borderRadius: 'var(--radius-md, 10px)', border: '1px solid var(--color-border)',
          background: 'var(--color-bg-inset)', touchAction: 'none', overflow: 'hidden', userSelect: 'none',
        }}>
        {contacts.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Touch here
          </div>
        )}
        {contacts.map((c) => (
          <div key={c.id} aria-hidden="true" style={{
            position: 'absolute', left: c.x - 22, top: c.y - 22, width: 44, height: 44, borderRadius: 9999,
            border: '2px solid var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)',
            pointerEvents: 'none',
          }}>{c.id}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, ...value }}>
        <span>Now: {contacts.length}</span>
        <span>Most at once: {peak}</span>
        {kinds && <span>Input: {kinds}</span>}
      </div>
    </div>
  );
};

export const TouchInputPanel: React.FC = () => {
  const [caps, setCaps] = useState(touchCapabilities);
  const [hapticsOn, setHapticsOn] = useState(hapticsEnabled);
  const support = hapticSupport();

  useEffect(() => subscribeHaptics(setHapticsOn), []);
  useEffect(() => {
    // A touch screen can be attached or detached while DEX runs.
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(any-pointer: coarse)') : null;
    const update = () => setCaps(touchCapabilities());
    mq?.addEventListener?.('change', update);
    return () => mq?.removeEventListener?.('change', update);
  }, []);

  const touchLine = caps.maxTouchPoints === 0
    ? 'No touch screen reported'
    : `${caps.maxTouchPoints} simultaneous contact${caps.maxTouchPoints === 1 ? '' : 's'}${caps.maxTouchPoints > MAX_CONTACTS ? ` (DEX tracks ${MAX_CONTACTS})` : ''}`;

  return (
    <div>
      <div style={row}>
        <div>
          <div style={label}>Touch screen</div>
          <div style={desc}>What the hardware reports. DEX tracks up to {MAX_CONTACTS} fingers at once where the screen supports it.</div>
        </div>
        <span style={value}>{touchLine}</span>
      </div>
      <div style={row}>
        <div>
          <div style={label}>Pointer</div>
          <div style={desc}>{caps.coarsePrimary ? 'Touch is the main input.' : caps.anyCoarse ? 'Mouse or trackpad, with a touch screen as well.' : 'Mouse or trackpad.'}</div>
        </div>
        <span style={value}>{caps.hover ? 'Hover available' : 'No hover'}</span>
      </div>
      {caps.maxTouchPoints > 0 && <TouchTestPad />}
      <div style={row}>
        <div>
          <div style={label}>Haptic feedback</div>
          <div style={desc}>
            {support === 'available'
              ? 'A short pulse when a window snaps or a gesture reaches its end. Never on every touch.'
              : 'This device has no vibration motor DEX can use, so there is nothing to turn on. Visual feedback is always shown.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {support === 'available' && hapticsOn && (
            <button onClick={() => haptic('confirm')} style={{ height: 28, padding: '0 10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' }}>
              Test
            </button>
          )}
          <Switch on={support === 'available' && hapticsOn} disabled={support !== 'available'} label="Haptic feedback" onChange={setHapticsEnabled} />
        </div>
      </div>
    </div>
  );
};
