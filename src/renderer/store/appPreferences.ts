// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { create } from 'zustand';
import schema from '../../shared/appPreferences.json';
import { invokePlatformIpc, subscribePlatformIpc } from '../services/platform/ipc';

type PreferenceValue = boolean | string;
type Preferences = Record<string, Record<string, PreferenceValue>>;
type Schema = typeof schema.applications;
interface PreferenceResult {
  success: boolean;
  error?: string;
  preferences?: { version: number; apps: Preferences };
}

interface PreferenceField {
  label: string;
  default: PreferenceValue;
  options?: Record<string, string>;
}

export const APP_PREFERENCES: Record<string, Record<string, PreferenceField>> = schema.applications;
export const WINDOW_OPEN_MODE = schema.windowOpenMode;
export const WINDOW_SIZE = schema.windowSize;
export const WINDOW_THEME = schema.windowTheme;
export const APP_MOTION = schema.appMotion;
export const UKI_CONTEXT = schema.ukiContext;
export const UKI_CONTEXT_APPS = new Set(schema.ukiContextApps);

export const useAppPreferences = create<{ apps: Preferences; loaded: boolean; error: string }>(() => ({
  apps: {}, loaded: false, error: '',
}));

let queue = Promise.resolve(true);

function run(operation: string, ...args: PreferenceValue[]): Promise<boolean> {
  const request = queue.then(async () => {
    const result = await invokePlatformIpc<PreferenceResult>('app-preferences:' + operation, ...args);
    if (!result?.success || result.preferences?.version !== 1) {
      useAppPreferences.setState({ loaded: true, error: result?.error ?? 'App preferences are unavailable.' });
      return false;
    }
    useAppPreferences.setState({ apps: result.preferences.apps, loaded: true, error: '' });
    return true;
  });
  queue = request;
  return request;
}

let initialLoad: Promise<boolean> | undefined;
export function loadAppPreferences(retry = false) {
  if (retry || !initialLoad) initialLoad = run('get');
  return initialLoad;
}

export function observeAppPreferences() {
  const stop = subscribePlatformIpc('dex-app-preferences-changed', () => { void loadAppPreferences(true); });
  void loadAppPreferences();
  return stop;
}

export function saveAppPreference(app: string, key: string, value: PreferenceValue) {
  return run('update', app, key, value);
}

export function resetAppPreferences(app: string) {
  return run('reset', app);
}

export function shouldOpenMaximized(app: string) {
  return useAppPreferences.getState().apps[app]?.windowOpenMode === 'maximized';
}

export function parseWindowSize(value: unknown): { w: number; h: number } | null {
  const match = typeof value === 'string' && /^([1-9]\d{2,3})x([1-9]\d{2,3})$/.exec(value);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  return w >= WINDOW_SIZE.width.min && w <= WINDOW_SIZE.width.max &&
    h >= WINDOW_SIZE.height.min && h <= WINDOW_SIZE.height.max ? { w, h } : null;
}

export function preferredWindowSize(app: string) {
  return parseWindowSize(useAppPreferences.getState().apps[app]?.windowSize);
}

export function appReducesMotion(app: string) {
  return useAppPreferences.getState().apps[app]?.appMotion === 'reduced';
}

export function useAppPreference<App extends keyof Schema, Key extends keyof Schema[App] & string>(
  app: App, key: Key,
) {
  const field = APP_PREFERENCES[app][key];
  return useAppPreferences(state => {
    const value = state.apps[app]?.[key];
    if (typeof field.default === 'boolean') return typeof value === 'boolean' ? value : field.default;
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(field.options, value) ? value : field.default;
  });
}
