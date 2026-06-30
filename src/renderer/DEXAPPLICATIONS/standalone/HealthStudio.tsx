// =============================================================================
// DEX Platform - HEALTH STUDIO
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Health & bio-metrics workspace: body composition, energy expenditure,
// cardio training zones, and hydration targets. All maths are pure, offline,
// and client-side. First of the "future apps" built natively on the DEX
// standard (AppShell chrome, declarative menus, StatusBar, UKI awareness).
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { colors, radius, fontStack } from '../../styles/tokens';

// ---------------------------------------------------------------------------
// Domain — pure, unit-tested-in-spirit calculators
// ---------------------------------------------------------------------------

type Sex = 'male' | 'female';
type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
type Module = 'body' | 'energy' | 'cardio' | 'hydration';

interface Profile {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityKey;
}

const DEFAULT_PROFILE: Profile = { weightKg: 72, heightCm: 175, age: 30, sex: 'male', activity: 'moderate' };
const STORAGE_KEY = 'dex-health-profile-v1';

const ACTIVITY: Record<ActivityKey, { label: string; factor: number; hint: string }> = {
  sedentary: { label: 'Sedentary', factor: 1.2, hint: 'little or no exercise' },
  light: { label: 'Light', factor: 1.375, hint: '1–3 days/week' },
  moderate: { label: 'Moderate', factor: 1.55, hint: '3–5 days/week' },
  active: { label: 'Active', factor: 1.725, hint: '6–7 days/week' },
  athlete: { label: 'Athlete', factor: 1.9, hint: 'hard daily training' },
};

/** Body Mass Index (kg/m^2). */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return m > 0 ? weightKg / (m * m) : 0;
}

export function bmiCategory(b: number): { label: string; tone: 'low' | 'ok' | 'warn' | 'high' } {
  if (b < 18.5) return { label: 'Underweight', tone: 'low' };
  if (b < 25) return { label: 'Healthy', tone: 'ok' };
  if (b < 30) return { label: 'Overweight', tone: 'warn' };
  return { label: 'Obese', tone: 'high' };
}

/** Basal Metabolic Rate via Mifflin–St Jeor (kcal/day). */
export function bmr(p: Profile): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

/** Total Daily Energy Expenditure (kcal/day). */
export function tdee(p: Profile): number {
  return Math.round(bmr(p) * ACTIVITY[p.activity].factor);
}

/** Age-predicted max heart rate (Tanaka: 208 − 0.7·age, more accurate than 220−age). */
export function maxHeartRate(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export interface HrZone { name: string; lo: number; hi: number; focus: string; }
export function hrZones(age: number): HrZone[] {
  const m = maxHeartRate(age);
  const z = (lo: number, hi: number) => ({ lo: Math.round(m * lo), hi: Math.round(m * hi) });
  return [
    { name: 'Z1 · Recovery', ...z(0.5, 0.6), focus: 'warm-up, active recovery' },
    { name: 'Z2 · Endurance', ...z(0.6, 0.7), focus: 'fat burn, base building' },
    { name: 'Z3 · Tempo', ...z(0.7, 0.8), focus: 'aerobic capacity' },
    { name: 'Z4 · Threshold', ...z(0.8, 0.9), focus: 'lactate threshold' },
    { name: 'Z5 · Max', ...z(0.9, 1.0), focus: 'anaerobic, sprints' },
  ];
}

/** Daily hydration target (ml) — ~33 ml per kg, nudged up by activity. */
export function hydrationMl(p: Profile): number {
  const base = p.weightKg * 33;
  const bump = (ACTIVITY[p.activity].factor - 1.2) * 600; // up to ~+420 ml for athletes
  return Math.round(base + bump);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const MODULES: { id: Module; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'energy', label: 'Energy' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'hydration', label: 'Hydration' },
];

const toneColor: Record<'low' | 'ok' | 'warn' | 'high', string> = {
  low: colors.accent.default,
  ok: colors.semantic.success,
  warn: colors.semantic.warning,
  high: colors.semantic.error,
};

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_PROFILE;
}

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: radius.xl,
  padding: 16,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.text.tertiary,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  fontSize: 13,
  color: colors.text.primary,
  background: 'var(--color-bg-inset)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: radius.md,
  outline: 'none',
  fontFamily: fontStack.ui,
};

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; accent?: string }> = ({ label, value, sub, accent }) => (
  <div style={card}>
    <div style={fieldLabel}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: accent || colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{sub}</div>}
  </div>
);

const HealthStudio: React.FC = () => {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [module, setModule] = useState<Module>('body');

  // Persist profile.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
  }, [profile]);

  const b = useMemo(() => bmi(profile.weightKg, profile.heightCm), [profile.weightKg, profile.heightCm]);
  const cat = bmiCategory(b);
  const restEnergy = bmr(profile);
  const dayEnergy = tdee(profile);
  const zones = useMemo(() => hrZones(profile.age), [profile.age]);
  const water = hydrationMl(profile);

  // UKI awareness: snapshot + a read action.
  const ctxRef = useRef({ profile, b, cat, restEnergy, dayEnergy, water, module });
  ctxRef.current = { profile, b, cat, restEnergy, dayEnergy, water, module };
  useEffect(() => {
    registerUkiAppContext('health', () => {
      const c = ctxRef.current;
      return {
        appId: 'health',
        custom: {
          module: c.module,
          bmi: c.b.toFixed(1),
          category: c.cat.label,
          tdeeKcal: c.dayEnergy,
          hydrationMl: c.water,
        },
      };
    });
    registerUkiAppAction('health', {
      id: 'health.summary',
      description: 'summarize the current health profile: BMI, category, BMR/TDEE calories and hydration target.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ctxRef.current;
      return `BMI ${c.b.toFixed(1)} (${c.cat.label}); BMR ${c.restEnergy} kcal, TDEE ${c.dayEnergy} kcal/day; hydration target ${(c.water / 1000).toFixed(1)} L/day.`;
    });
    return () => {
      unregisterUkiAppContext('health');
      unregisterUkiAppAction('health.summary');
    };
  }, []);

  const num = (v: string) => Math.max(0, Number(v) || 0);
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  const menus: MenuGroup[] = [
    {
      id: 'view', label: 'View',
      sections: [{
        id: 'modules', label: 'Modules',
        items: MODULES.map((m) => ({ id: `view.${m.id}`, label: m.label, checked: module === m.id, run: () => setModule(m.id) })),
      }],
    },
    {
      id: 'profile', label: 'Profile',
      sections: [{
        id: 'sex', label: 'Biological sex (for BMR)',
        items: [
          { id: 'profile.male', label: 'Male', checked: profile.sex === 'male', run: () => set({ sex: 'male' }) },
          { id: 'profile.female', label: 'Female', checked: profile.sex === 'female', run: () => set({ sex: 'female' }) },
        ],
      }, {
        id: 'reset', items: [{ id: 'profile.reset', label: 'Reset to defaults', danger: true, run: () => setProfile(DEFAULT_PROFILE) }],
      }],
    },
  ];

  return (
    <AppShell
      appId="health"
      menus={menus}
      title="Health Studio"
      surface="plain"
      status={{
        left: <span>BMI {b.toFixed(1)} · <span style={{ color: toneColor[cat.tone] }}>{cat.label}</span></span>,
        right: <span>{dayEnergy} kcal/day · {(water / 1000).toFixed(1)} L water</span>,
      }}
    >
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {/* Vitals rail */}
        <div style={{ width: 220, flexShrink: 0, padding: 16, borderRight: '1px solid var(--color-border-subtle)', overflow: 'auto' }}>
          <div style={{ ...fieldLabel, marginBottom: 10, fontSize: 11 }}>Vitals</div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={fieldLabel}>Weight (kg)</div>
            <input style={inputStyle} type="number" value={profile.weightKg} onChange={(e) => set({ weightKg: num(e.target.value) })} />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={fieldLabel}>Height (cm)</div>
            <input style={inputStyle} type="number" value={profile.heightCm} onChange={(e) => set({ heightCm: num(e.target.value) })} />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={fieldLabel}>Age</div>
            <input style={inputStyle} type="number" value={profile.age} onChange={(e) => set({ age: num(e.target.value) })} />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={fieldLabel}>Activity</div>
            <select style={{ ...inputStyle, paddingRight: 4 }} value={profile.activity} onChange={(e) => set({ activity: e.target.value as ActivityKey })}>
              {(Object.keys(ACTIVITY) as ActivityKey[]).map((k) => (
                <option key={k} value={k}>{ACTIVITY[k].label} — {ACTIVITY[k].hint}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Module body */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20 }}>
          {/* Module switch */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => setModule(m.id)}
                style={{
                  height: 30, padding: '0 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  borderRadius: radius.md, border: '1px solid var(--color-border-subtle)',
                  background: module === m.id ? colors.accent.light : 'transparent',
                  color: module === m.id ? colors.accent.default : colors.text.secondary,
                }}
              >{m.label}</button>
            ))}
          </div>

          {module === 'body' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Body Mass Index" value={b.toFixed(1)} sub={cat.label} accent={toneColor[cat.tone]} />
              <Stat label="Healthy weight range" value={`${(18.5 * (profile.heightCm / 100) ** 2).toFixed(0)}–${(24.9 * (profile.heightCm / 100) ** 2).toFixed(0)} kg`} sub="for your height" />
              <Stat label="Resting energy (BMR)" value={`${restEnergy}`} sub="kcal/day at rest" />
            </div>
          )}

          {module === 'energy' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Maintenance (TDEE)" value={`${dayEnergy}`} sub={`kcal/day · ${ACTIVITY[profile.activity].label}`} accent={colors.accent.default} />
              <Stat label="Mild cut (−0.25 kg/wk)" value={`${dayEnergy - 275}`} sub="kcal/day" accent={colors.semantic.warning} />
              <Stat label="Lean bulk (+0.25 kg/wk)" value={`${dayEnergy + 275}`} sub="kcal/day" accent={colors.semantic.success} />
              <Stat label="Protein target" value={`${Math.round(profile.weightKg * 1.8)} g`} sub="1.8 g/kg bodyweight" />
            </div>
          )}

          {module === 'cardio' && (
            <div style={card}>
              <div style={{ ...fieldLabel, marginBottom: 10 }}>Heart-rate zones · max {maxHeartRate(profile.age)} bpm</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zones.map((z) => (
                  <div key={z.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 120, fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{z.name}</div>
                    <div style={{ width: 96, fontSize: 13, color: colors.accent.default, fontVariantNumeric: 'tabular-nums' }}>{z.lo}–{z.hi} bpm</div>
                    <div style={{ fontSize: 12, color: colors.text.secondary }}>{z.focus}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {module === 'hydration' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Stat label="Daily water target" value={`${(water / 1000).toFixed(1)} L`} sub={`${water} ml · ~33 ml/kg`} accent={colors.accent.default} />
              <Stat label="Per waking hour" value={`${Math.round(water / 16)} ml`} sub="over ~16 hours" />
              <Stat label="Glasses (250 ml)" value={`${Math.round(water / 250)}`} sub="cups/day" />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default HealthStudio;
