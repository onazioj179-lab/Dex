// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React, { useEffect, useState } from 'react';
import { APP_DEFINITIONS } from '../store/runningApps';
import {
  APP_MOTION, APP_PREFERENCES, UKI_CONTEXT, UKI_CONTEXT_APPS, WINDOW_OPEN_MODE, WINDOW_SIZE, WINDOW_THEME,
  loadAppPreferences, parseWindowSize, resetAppPreferences, saveAppPreference, useAppPreferences,
} from '../store/appPreferences';

const applications = Object.entries(APP_DEFINITIONS)
  .sort(([, a], [, b]) => a.name.localeCompare(b.name));

function WindowSizeEditor({ value, onSave }: { value: unknown; onSave: (value: string) => void }) {
  const saved = parseWindowSize(value);
  const [width, setWidth] = useState(saved ? String(saved.w) : '');
  const [height, setHeight] = useState(saved ? String(saved.h) : '');
  const candidate = `${width}x${height}`;
  const valid = parseWindowSize(candidate);
  useEffect(() => {
    const persisted = parseWindowSize(value);
    setWidth(persisted ? String(persisted.w) : '');
    setHeight(persisted ? String(persisted.h) : '');
  }, [value]);

  return (
    <form
      aria-label={WINDOW_SIZE.label}
      style={{ display: 'grid', gap: 8 }}
      onSubmit={event => {
        event.preventDefault();
        if (valid && candidate !== value) onSave(candidate);
      }}
    >
      <span>{WINDOW_SIZE.label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <label>
          Width (px) <input type="number" value={width} {...WINDOW_SIZE.width} step={1} required
            onChange={event => setWidth(event.target.value)} style={{ width: '6rem' }} />
        </label>
        <label>
          Height (px) <input type="number" value={height} {...WINDOW_SIZE.height} step={1} required
            onChange={event => setHeight(event.target.value)} style={{ width: '6rem' }} />
        </label>
        <button type="submit" disabled={!valid || candidate === value}>Apply size</button>
        {saved && <button type="button" onClick={() => onSave(WINDOW_SIZE.default)}>Use app size</button>}
      </div>
      <small style={{ color: 'var(--color-text-secondary)' }}>
        New and restored windows respect app minimum sizes and the available workspace.
      </small>
    </form>
  );
}

export function ApplicationPreferences({ initialApp = 'browser' }: { initialApp?: string }) {
  const [appId, setAppId] = useState(() => Object.hasOwn(APP_DEFINITIONS, initialApp) ? initialApp : 'browser');
  const [busy, setBusy] = useState(false);
  const { apps, loaded, error } = useAppPreferences();
  const fields = appId === 'home'
    ? undefined
    : {
      windowOpenMode: WINDOW_OPEN_MODE,
      windowTheme: WINDOW_THEME,
      appMotion: APP_MOTION,
      ...APP_PREFERENCES[appId],
      ...(UKI_CONTEXT_APPS.has(appId) ? { ukiContext: UKI_CONTEXT } : {}),
    };

  useEffect(() => { void loadAppPreferences(true); }, []);

  const change = async (operation: () => Promise<boolean>) => {
    setBusy(true);
    try { await operation(); } finally { setBusy(false); }
  };

  return (
    <section aria-label="Application preferences" style={{ display: 'grid', gap: 16, maxWidth: '44rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        Application
        <select value={appId} onChange={e => setAppId(e.target.value)}>
          {applications.map(([id, app]) => <option key={id} value={id}>{app.name}</option>)}
        </select>
      </label>
      {error && (
        <div role="status">
          {error} <button onClick={() => void change(() => loadAppPreferences(true))} disabled={busy}>Retry</button>
        </div>
      )}
      {!loaded && <p role="status">Loading preferences…</p>}
      {loaded && fields && (
        <fieldset disabled={busy || Boolean(error)} style={{ display: 'grid', gap: 12, padding: 14 }}>
          <legend>{APP_DEFINITIONS[appId].name}</legend>
          {Object.entries(fields).map(([key, field]) => {
            const value = apps[appId]?.[key] ?? field.default;
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {field.label}
                {field.options
                  ? <select value={String(value)} onChange={e => void change(() => saveAppPreference(appId, key, e.target.value))}>
                    {Object.entries(field.options).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
                  </select>
                  : <input type="checkbox" checked={value === true} onChange={e => void change(() => saveAppPreference(appId, key, e.target.checked))} />}
              </label>
            );
          })}
          <WindowSizeEditor key={appId}
            value={apps[appId]?.windowSize}
            onSave={value => void change(() => saveAppPreference(appId, 'windowSize', value))} />
          {UKI_CONTEXT_APPS.has(appId) && (
            <small style={{ color: 'var(--color-text-secondary)' }}>
              UKI uses the foreground app and requires its Read screen permission.
            </small>
          )}
          <button style={{ justifySelf: 'start' }} onClick={() => void change(() => resetAppPreferences(appId))}>
            Reset {APP_DEFINITIONS[appId].name} preferences
          </button>
        </fieldset>
      )}
      {loaded && !fields && <p>{APP_DEFINITIONS[appId].name} uses system defaults.</p>}
    </section>
  );
}
