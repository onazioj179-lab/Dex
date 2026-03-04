/**
 * DEX Internationalization (i18n) Foundation
 * Lightweight localization system for DEX
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

// ============================================================================
// TYPES
// ============================================================================

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'pt' | 'ko' | 'ar' | 'hi';

export interface TranslationMap {
  [key: string]: string;
}

export interface LocaleConfig {
  code: Locale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: { decimal: string; thousands: string };
}

// ============================================================================
// LOCALE DEFINITIONS
// ============================================================================

export const LOCALES: Record<Locale, LocaleConfig> = {
  en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', dateFormat: 'MM/DD/YYYY', numberFormat: { decimal: '.', thousands: ',' } },
  es: { code: 'es', name: 'Spanish', nativeName: 'Espanol', direction: 'ltr', dateFormat: 'DD/MM/YYYY', numberFormat: { decimal: ',', thousands: '.' } },
  fr: { code: 'fr', name: 'French', nativeName: 'Francais', direction: 'ltr', dateFormat: 'DD/MM/YYYY', numberFormat: { decimal: ',', thousands: ' ' } },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', dateFormat: 'DD.MM.YYYY', numberFormat: { decimal: ',', thousands: '.' } },
  ja: { code: 'ja', name: 'Japanese', nativeName: '\u65E5\u672C\u8A9E', direction: 'ltr', dateFormat: 'YYYY/MM/DD', numberFormat: { decimal: '.', thousands: ',' } },
  zh: { code: 'zh', name: 'Chinese', nativeName: '\u4E2D\u6587', direction: 'ltr', dateFormat: 'YYYY-MM-DD', numberFormat: { decimal: '.', thousands: ',' } },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Portugues', direction: 'ltr', dateFormat: 'DD/MM/YYYY', numberFormat: { decimal: ',', thousands: '.' } },
  ko: { code: 'ko', name: 'Korean', nativeName: '\uD55C\uAD6D\uC5B4', direction: 'ltr', dateFormat: 'YYYY.MM.DD', numberFormat: { decimal: '.', thousands: ',' } },
  ar: { code: 'ar', name: 'Arabic', nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', direction: 'rtl', dateFormat: 'DD/MM/YYYY', numberFormat: { decimal: '.', thousands: ',' } },
  hi: { code: 'hi', name: 'Hindi', nativeName: '\u0939\u093F\u0928\u094D\u0926\u0940', direction: 'ltr', dateFormat: 'DD/MM/YYYY', numberFormat: { decimal: '.', thousands: ',' } },
};

// ============================================================================
// ENGLISH TRANSLATIONS (base)
// ============================================================================

const EN_TRANSLATIONS: TranslationMap = {
  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.open': 'Open',
  'common.search': 'Search',
  'common.settings': 'Settings',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.done': 'Done',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.create': 'Create',
  'common.update': 'Update',
  'common.remove': 'Remove',
  'common.add': 'Add',
  'common.select': 'Select',
  'common.none': 'None',
  'common.all': 'All',
  
  // App
  'app.name': 'DEX',
  'app.tagline': 'Your Digital Workspace',
  'app.version': 'Version',
  
  // Navigation
  'nav.home': 'Home',
  'nav.files': 'Files',
  'nav.browser': 'Browser',
  'nav.notes': 'Notes',
  'nav.tasks': 'Tasks',
  'nav.calendar': 'Calendar',
  'nav.settings': 'Settings',
  'nav.gallery': 'Gallery',
  'nav.music': 'Music',
  'nav.video': 'Video',
  'nav.kanban': 'Kanban',
  'nav.calculator': 'Calculator',
  'nav.passwords': 'Passwords',
  'nav.workflows': 'Workflows',
  'nav.transfers': 'Transfers',
  
  // Home
  'home.welcome': 'Welcome back',
  'home.quickStats': 'Quick Stats',
  'home.pinnedApps': 'Pinned Apps',
  'home.runningApps': 'Running',
  'home.recentFiles': 'Recent Files',
  'home.achievements': 'Achievements',
  'home.tipOfDay': 'Tip of the Day',
  'home.streak': 'day streak',
  
  // Dock
  'dock.launchpad': 'Launchpad',
  'dock.search': 'Search',
  'dock.minimize': 'Minimize',
  'dock.close': 'Close',
  'dock.closeAll': 'Close All Apps',
  
  // Settings
  'settings.general': 'General',
  'settings.appearance': 'Appearance',
  'settings.security': 'Security & Privacy',
  'settings.about': 'About',
  'settings.darkMode': 'Dark Mode',
  'settings.lightMode': 'Light Mode',
  'settings.language': 'Language',
  'settings.notifications': 'Notifications',
  'settings.shortcuts': 'Keyboard Shortcuts',
  
  // Focus Mode
  'focus.title': 'Focus Mode',
  'focus.enabled': 'Focus Mode is active',
  'focus.disabled': 'Focus Mode is off',
  'focus.start': 'Start Focus',
  'focus.stop': 'End Focus',
  
  // Offline
  'offline.title': 'You are offline',
  'offline.subtitle': 'DEX is running in offline mode. Changes are saved locally.',
  'offline.slow': 'Slow connection detected',
  
  // Errors
  'error.generic': 'Something went wrong',
  'error.notFound': 'Not found',
  'error.appCrash': 'This app encountered an error',
  'error.restart': 'Restart App',
  'error.report': 'Report Issue',
  
  // Time
  'time.now': 'Just now',
  'time.minuteAgo': '1 minute ago',
  'time.minutesAgo': '{0} minutes ago',
  'time.hourAgo': '1 hour ago',
  'time.hoursAgo': '{0} hours ago',
  'time.today': 'Today',
  'time.yesterday': 'Yesterday',
  'time.daysAgo': '{0} days ago',
};

// ============================================================================
// TRANSLATION ENGINE
// ============================================================================

let currentLocale: Locale = 'en';
const translations: Map<Locale, TranslationMap> = new Map();
translations.set('en', EN_TRANSLATIONS);

const STORAGE_KEY = 'dex-locale';

export function initializeI18n(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LOCALES) {
      currentLocale = saved as Locale;
    }
  } catch {}
  // Set document direction for RTL
  if (typeof document !== 'undefined') {
    document.documentElement.dir = LOCALES[currentLocale].direction;
    document.documentElement.lang = currentLocale;
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (!(locale in LOCALES)) return;
  currentLocale = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.dir = LOCALES[locale].direction;
    document.documentElement.lang = locale;
  }
}

export function addTranslations(locale: Locale, map: TranslationMap): void {
  const existing = translations.get(locale) || {};
  translations.set(locale, { ...existing, ...map });
}

/**
 * Translate a key, with optional parameter interpolation.
 * Falls back to English, then to the key itself.
 */
export function t(key: string, ...params: (string | number)[]): string {
  const localeMap = translations.get(currentLocale);
  let text = localeMap?.[key] || EN_TRANSLATIONS[key] || key;
  // Interpolate {0}, {1}, etc.
  params.forEach((param, i) => {
    text = text.replace(`{${i}}`, String(param));
  });
  return text;
}

/**
 * Format a number according to locale
 */
export function formatNumber(n: number): string {
  const config = LOCALES[currentLocale];
  const parts = n.toFixed(0).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.numberFormat.thousands);
  return parts.length > 1 ? `${intPart}${config.numberFormat.decimal}${parts[1]}` : intPart;
}

/**
 * Format a date according to locale
 */
export function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear().toString();
  const fmt = LOCALES[currentLocale].dateFormat;
  return fmt.replace('DD', d).replace('MM', m).replace('YYYY', y);
}

/**
 * Relative time formatting
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t('time.now');
  if (minutes === 1) return t('time.minuteAgo');
  if (minutes < 60) return t('time.minutesAgo', minutes);
  if (hours === 1) return t('time.hourAgo');
  if (hours < 24) return t('time.hoursAgo', hours);
  if (days === 1) return t('time.yesterday');
  return t('time.daysAgo', days);
}

export default { t, initializeI18n, getLocale, setLocale, addTranslations, formatNumber, formatDate, formatRelativeTime, LOCALES };
