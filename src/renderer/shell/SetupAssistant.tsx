// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Setup Assistant -- the first-run walkthrough, in the spirit of macOS setup:
// Hello -> Appearance -> Apps -> UKI & privacy -> Ready. Every choice writes a
// real setting (theme, installed apps, UKI on/off, notifications), nothing is
// cloud-bound and every step can be skipped. It shows ONCE, on a fresh
// profile only: an existing profile is marked done silently, so updates never
// put a wizard in front of someone who already uses DEX.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { writeDexSetting, readDexSetting } from '../hooks/useDexSetting';
import { applyTheme } from '../utils/theme';
import { useInstalledAppsStore, RECOMMENDED_APP_IDS } from '../store/installedAppsStore';
import { APP_DEFINITIONS } from '../store/runningApps';
import { isReduceMotion } from '../utils/MotionController';

export const SETUP_DONE_KEY = 'dex-setup-done';

/** Keys only an existing profile has. Any of them = not a first run. */
const EXISTING_PROFILE_KEYS = ['dex-settings', 'dex-dock-pins', 'dex-floating-launcher-v2', 'dex-engagement-state', 'darkMode'];

/** Should the assistant show? Marks existing profiles done so it never does. */
export function shouldShowSetup(storage: Storage = localStorage): boolean {
  try {
    // Automated browsers (e2e, CDP smoke runs) never get a wizard in the way.
    if (typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver) return false;
    if (storage.getItem(SETUP_DONE_KEY)) return false;
    if (EXISTING_PROFILE_KEYS.some((k) => storage.getItem(k) !== null)) {
      storage.setItem(SETUP_DONE_KEY, 'existing');
      return false;
    }
    return true;
  } catch { return false; }
}

type Step = 'hello' | 'look' | 'apps' | 'uki' | 'ready';
const STEPS: Step[] = ['hello', 'look', 'apps', 'uki', 'ready'];

const pill = (primary: boolean): React.CSSProperties => ({
  height: 36, padding: '0 22px', borderRadius: 9999, border: 'none', cursor: 'pointer',
  fontSize: 14, fontWeight: 600,
  background: primary ? 'var(--color-accent, #0A84FF)' : 'rgba(255,255,255,0.10)',
  color: primary ? '#fff' : 'var(--color-text-primary)',
  boxShadow: primary ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 10px rgba(10,132,255,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
});

const Choice: React.FC<{ on: boolean; title: string; desc: string; onPick: () => void; children?: React.ReactNode }> = ({ on, title, desc, onPick, children }) => (
  <button
    type="button"
    role="radio"
    aria-checked={on}
    onClick={onPick}
    style={{
      flex: 1, minWidth: 0, textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer',
      background: on ? 'rgba(10,132,255,0.14)' : 'rgba(255,255,255,0.05)',
      border: `1.5px solid ${on ? 'var(--color-accent, #0A84FF)' : 'rgba(255,255,255,0.08)'}`,
      color: 'var(--color-text-primary)', transition: 'background 0.15s ease, border-color 0.15s ease',
    }}
  >
    {children}
    <div style={{ fontSize: 14, fontWeight: 600, marginTop: children ? 10 : 0 }}>{title}</div>
    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
  </button>
);

export const SetupAssistant: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const [open, setOpen] = useState(() => shouldShowSetup());
  const [step, setStep] = useState<Step>('hello');
  const [dark, setDark] = useState<boolean>(() => document.documentElement.getAttribute('data-theme') !== 'light');
  const [apps, setApps] = useState<'essentials' | 'everything'>('everything');
  const [uki, setUki] = useState<boolean>(() => readDexSetting('ukiEnabled', true));
  const [notify, setNotify] = useState<boolean>(() => readDexSetting('enableNotifications', true));
  const idx = STEPS.indexOf(step);
  const reduce = isReduceMotion();

  const allIds = useMemo(() => Object.keys(APP_DEFINITIONS), []);
  const essentialsCount = useMemo(() => allIds.filter((id) => RECOMMENDED_APP_IDS.has(id)).length, [allIds]);

  // Appearance applies live, so the choice is seen, not imagined.
  useEffect(() => {
    if (!open) return;
    applyTheme(dark ? 'dark' : 'light');
  }, [dark, open]);

  const finish = useCallback((applyChoices: boolean) => {
    if (applyChoices) {
      writeDexSetting('darkMode', dark);
      try { localStorage.setItem('darkMode', String(dark)); localStorage.setItem('dex-theme-source', 'user'); } catch { /* storage blocked */ }
      if (apps === 'essentials') useInstalledAppsStore.getState().applyEssentials(allIds);
      writeDexSetting('ukiEnabled', uki);
      writeDexSetting('enableNotifications', notify);
    }
    try { localStorage.setItem(SETUP_DONE_KEY, applyChoices ? 'done' : 'skipped'); } catch { /* storage blocked */ }
    setOpen(false);
    onDone?.();
  }, [dark, apps, uki, notify, allIds, onDone]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (step === 'ready') finish(true); else setStep(STEPS[idx + 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, idx, finish]);

  if (!open) return null;

  const title: Record<Step, string> = {
    hello: 'Hello', look: 'Choose your look', apps: 'Your apps', uki: 'UKI and privacy', ready: 'You are all set',
  };
  const sub: Record<Step, string> = {
    hello: 'Welcome to DEX. A few quick choices and your desktop is ready. Everything here can be changed later in Settings.',
    look: 'Pick a look. You can switch any time in Settings > Appearance.',
    apps: 'Start with everything, or keep the essentials and add more from the Store later.',
    uki: 'UKI is the DEX assistant. It runs on this computer and only reaches the internet when you connect a provider.',
    ready: 'Open apps from the Dock, search with the search icon, and press Escape to fold the Dock away.',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set up DEX"
      style={{
        position: 'fixed', inset: 0, zIndex: 99990, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      }}
    >
      <div
        key={step}
        className="dex-liquid-glass dex-glass-specular"
        style={{
          width: 'min(560px, calc(100vw - 32px))', padding: '36px 36px 28px', borderRadius: 24, position: 'relative',
          animation: reduce ? 'none' : 'dexNotifIn 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
          color: 'var(--color-text-primary)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 26 }} aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= idx ? 'var(--color-accent, #0A84FF)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s ease' }} />
          ))}
        </div>
        <h1 style={{ margin: 0, fontSize: step === 'hello' ? 44 : 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{title[step]}</h1>
        <p style={{ margin: '10px 0 22px', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-secondary)', maxWidth: 460 }}>{sub[step]}</p>

        {step === 'look' && (
          <div role="radiogroup" aria-label="Appearance" style={{ display: 'flex', gap: 12 }}>
            {([true, false] as const).map((d) => (
              <Choice key={String(d)} on={dark === d} title={d ? 'Dark' : 'Light'} desc={d ? 'Easy on the eyes, made for the wallpaper.' : 'Bright and crisp.'} onPick={() => setDark(d)}>
                <div style={{ height: 64, borderRadius: 10, background: d ? 'linear-gradient(#1c1c1e, #0b0b0d)' : 'linear-gradient(#f5f5f7, #e5e5ea)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 6 }}>
                  <span style={{ width: 54, height: 10, borderRadius: 9999, background: d ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }} />
                </div>
              </Choice>
            ))}
          </div>
        )}

        {step === 'apps' && (
          <div role="radiogroup" aria-label="Apps to start with" style={{ display: 'flex', gap: 12 }}>
            <Choice on={apps === 'everything'} title={`Everything (${allIds.length - 1})`} desc="Every DEX app ready on day one." onPick={() => setApps('everything')} />
            <Choice on={apps === 'essentials'} title={`Essentials (${essentialsCount})`} desc="A lighter start. Add the rest from the Store any time." onPick={() => setApps('essentials')} />
          </div>
        )}

        {step === 'uki' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['UKI assistant', 'Ask, search and act across your apps.', uki, setUki],
              ['Notifications', 'Banners from apps and the system.', notify, setNotify],
            ] as const).map(([t, d, on, set]) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{t}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{d}</span>
                </span>
                <input type="checkbox" checked={on} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} aria-label={t} />
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 30 }}>
          {step !== 'ready'
            ? <button type="button" onClick={() => finish(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 13, cursor: 'pointer', padding: 0 }}>Skip setup</button>
            : <span />}
          <span style={{ flex: 1 }} />
          {idx > 0 && step !== 'ready' && <button type="button" style={pill(false)} onClick={() => setStep(STEPS[idx - 1])}>Back</button>}
          <button type="button" autoFocus style={pill(true)} onClick={() => (step === 'ready' ? finish(true) : setStep(STEPS[idx + 1]))}>
            {step === 'hello' ? 'Get started' : step === 'ready' ? 'Start using DEX' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupAssistant;
