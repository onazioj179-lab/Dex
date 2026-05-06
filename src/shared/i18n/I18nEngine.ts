// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Localization / Internationalization System
// Multi-language support with RTL, pluralization, and formatting
// =============================================================================

import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export interface Locale {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  timeFormat: string;
  numberFormat: NumberFormatConfig;
  pluralRules: PluralRules;
}

export interface NumberFormatConfig {
  decimal: string;
  thousands: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
}

export interface PluralRules {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export interface Translation {
  [key: string]: string | Translation;
}

export interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  supportedLocales: string[];
  loadPath: string;
  namespaces: string[];
  defaultNamespace: string;
  interpolation: InterpolationConfig;
  detection: DetectionConfig;
}

export interface InterpolationConfig {
  prefix: string;
  suffix: string;
  escapeValue: boolean;
  formatSeparator: string;
}

export interface DetectionConfig {
  order: DetectionMethod[];
  caches: CacheMethod[];
  lookupQuerystring: string;
  lookupCookie: string;
  lookupLocalStorage: string;
}

export type DetectionMethod = 'querystring' | 'cookie' | 'localStorage' | 'navigator' | 'htmlTag';
export type CacheMethod = 'cookie' | 'localStorage';

// =============================================================================
// BUILT-IN LOCALES
// =============================================================================

export const LOCALES: Record<string, Locale> = {
  'en-US': {
    code: 'en-US',
    name: 'English (US)',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: 'h:mm A',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'USD',
      currencySymbol: '$',
      currencyPosition: 'before'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'en-GB': {
    code: 'en-GB',
    name: 'English (UK)',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'GBP',
      currencySymbol: '£',
      currencyPosition: 'before'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'de-DE': {
    code: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: '.',
      currency: 'EUR',
      currencySymbol: '€',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'fr-FR': {
    code: 'fr-FR',
    name: 'French',
    nativeName: 'Francais',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: ' ',
      currency: 'EUR',
      currencySymbol: '€',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'es-ES': {
    code: 'es-ES',
    name: 'Spanish',
    nativeName: 'Espanol',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: '.',
      currency: 'EUR',
      currencySymbol: '€',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'it-IT': {
    code: 'it-IT',
    name: 'Italian',
    nativeName: 'Italiano',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: '.',
      currency: 'EUR',
      currencySymbol: '€',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Portugues',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: '.',
      currency: 'BRL',
      currencySymbol: 'R$',
      currencyPosition: 'before'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'ja-JP': {
    code: 'ja-JP',
    name: 'Japanese',
    nativeName: 'Nihongo',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'JPY',
      currencySymbol: '¥',
      currencyPosition: 'before'
    },
    pluralRules: { other: 'other' }
  },
  'ko-KR': {
    code: 'ko-KR',
    name: 'Korean',
    nativeName: 'Hangugeo',
    direction: 'ltr',
    dateFormat: 'YYYY.MM.DD',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'KRW',
      currencySymbol: '₩',
      currencyPosition: 'before'
    },
    pluralRules: { other: 'other' }
  },
  'zh-CN': {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: 'Zhongwen',
    direction: 'ltr',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'CNY',
      currencySymbol: '¥',
      currencyPosition: 'before'
    },
    pluralRules: { other: 'other' }
  },
  'zh-TW': {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: 'Zhongwen',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'TWD',
      currencySymbol: 'NT$',
      currencyPosition: 'before'
    },
    pluralRules: { other: 'other' }
  },
  'ar-SA': {
    code: 'ar-SA',
    name: 'Arabic',
    nativeName: 'Al-Arabiyyah',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'SAR',
      currencySymbol: '﷼',
      currencyPosition: 'after'
    },
    pluralRules: { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' }
  },
  'he-IL': {
    code: 'he-IL',
    name: 'Hebrew',
    nativeName: 'Ivrit',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'ILS',
      currencySymbol: '₪',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', two: 'two', other: 'other' }
  },
  'hi-IN': {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'Hindi',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'h:mm A',
    numberFormat: {
      decimal: '.',
      thousands: ',',
      currency: 'INR',
      currencySymbol: '₹',
      currencyPosition: 'before'
    },
    pluralRules: { one: 'one', other: 'other' }
  },
  'ru-RU': {
    code: 'ru-RU',
    name: 'Russian',
    nativeName: 'Russkiy',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: 'HH:mm',
    numberFormat: {
      decimal: ',',
      thousands: ' ',
      currency: 'RUB',
      currencySymbol: '₽',
      currencyPosition: 'after'
    },
    pluralRules: { one: 'one', few: 'few', many: 'many', other: 'other' }
  }
};

// =============================================================================
// DEFAULT TRANSLATIONS
// =============================================================================

export const DEFAULT_TRANSLATIONS: Record<string, Translation> = {
  'en-US': {
    common: {
      ok: 'OK',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      open: 'Open',
      new: 'New',
      search: 'Search',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      yes: 'Yes',
      no: 'No',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      done: 'Done',
      retry: 'Retry',
      refresh: 'Refresh',
      settings: 'Settings',
      help: 'Help',
      about: 'About'
    },
    app: {
      name: 'DEX',
      tagline: 'Personal Control Hub',
      version: 'Version {{version}}',
      copyright: 'Copyright {{year}} Onazi Treasure OJ'
    },
    menu: {
      file: 'File',
      edit: 'Edit',
      view: 'View',
      window: 'Window',
      help: 'Help',
      newFile: 'New File',
      openFile: 'Open File',
      saveFile: 'Save File',
      saveAs: 'Save As...',
      export: 'Export',
      import: 'Import',
      print: 'Print',
      quit: 'Quit',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      selectAll: 'Select All',
      preferences: 'Preferences'
    },
    apps: {
      prism: 'PRISM Image Editor',
      vinx: 'VINX Video Editor',
      imosion: 'IMOSION Audio',
      flux: 'FLUX Animation',
      axl: 'AXL CAD',
      forge: 'FORGE Web Dev',
      notes: 'Notes',
      browser: 'Browser',
      files: 'Files',
      system: 'System'
    },
    time: {
      now: 'Just now',
      minute: '{{count}} minute ago',
      minute_plural: '{{count}} minutes ago',
      hour: '{{count}} hour ago',
      hour_plural: '{{count}} hours ago',
      day: '{{count}} day ago',
      day_plural: '{{count}} days ago',
      week: '{{count}} week ago',
      week_plural: '{{count}} weeks ago'
    },
    errors: {
      generic: 'Something went wrong',
      network: 'Network error',
      notFound: 'Not found',
      unauthorized: 'Unauthorized',
      forbidden: 'Access denied',
      validation: 'Validation error',
      timeout: 'Request timed out'
    }
  },
  'de-DE': {
    common: {
      ok: 'OK',
      cancel: 'Abbrechen',
      save: 'Speichern',
      delete: 'Loschen',
      edit: 'Bearbeiten',
      close: 'Schliessen',
      open: 'Offnen',
      new: 'Neu',
      search: 'Suchen',
      loading: 'Laden...',
      error: 'Fehler',
      success: 'Erfolg',
      warning: 'Warnung',
      info: 'Info',
      yes: 'Ja',
      no: 'Nein',
      confirm: 'Bestatigen',
      back: 'Zuruck',
      next: 'Weiter',
      done: 'Fertig',
      settings: 'Einstellungen',
      help: 'Hilfe',
      about: 'Uber'
    },
    app: {
      name: 'DEX',
      tagline: 'Personliche Steuerungszentrale',
      version: 'Version {{version}}',
      copyright: 'Copyright {{year}} Onazi Treasure OJ'
    }
  },
  'fr-FR': {
    common: {
      ok: 'OK',
      cancel: 'Annuler',
      save: 'Enregistrer',
      delete: 'Supprimer',
      edit: 'Modifier',
      close: 'Fermer',
      open: 'Ouvrir',
      new: 'Nouveau',
      search: 'Rechercher',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succes',
      warning: 'Attention',
      info: 'Info',
      yes: 'Oui',
      no: 'Non',
      confirm: 'Confirmer',
      back: 'Retour',
      next: 'Suivant',
      done: 'Termine',
      settings: 'Parametres',
      help: 'Aide',
      about: 'A propos'
    },
    app: {
      name: 'DEX',
      tagline: 'Hub de controle personnel',
      version: 'Version {{version}}',
      copyright: 'Copyright {{year}} Onazi Treasure OJ'
    }
  },
  'ja-JP': {
    common: {
      ok: 'OK',
      cancel: 'Kyanseru',
      save: 'Hozon',
      delete: 'Sakujo',
      edit: 'Henshu',
      close: 'Tojiru',
      open: 'Hiraku',
      new: 'Shinki',
      search: 'Kensaku',
      loading: 'Yomikomi-chu...',
      error: 'Era',
      success: 'Seiko',
      warning: 'Keikoku',
      info: 'Joho',
      yes: 'Hai',
      no: 'Iie',
      settings: 'Settei',
      help: 'Herupu',
      about: 'Kono apuri ni tsuite'
    },
    app: {
      name: 'DEX',
      tagline: 'Pasonal Control Hub',
      version: 'Bajon {{version}}'
    }
  },
  'zh-CN': {
    common: {
      ok: 'Queding',
      cancel: 'Quxiao',
      save: 'Baocun',
      delete: 'Shanchu',
      edit: 'Bianji',
      close: 'Guanbi',
      open: 'Dakai',
      new: 'Xinjiang',
      search: 'Sousuo',
      loading: 'Jiazai zhong...',
      error: 'Cuowu',
      success: 'Chenggong',
      warning: 'Jinggao',
      info: 'Xinxi',
      yes: 'Shi',
      no: 'Fou',
      settings: 'Shezhi',
      help: 'Bangzhu',
      about: 'Guanyu'
    },
    app: {
      name: 'DEX',
      tagline: 'Geren kongzhi zhongxin',
      version: 'Banben {{version}}'
    }
  },
  'ar-SA': {
    common: {
      ok: 'Hasanan',
      cancel: 'Ilgha',
      save: 'Hifz',
      delete: 'Hadhdh',
      edit: 'Tahrir',
      close: 'Ighlaq',
      open: 'Fath',
      new: 'Jadid',
      search: 'Bahth',
      loading: 'Jari al-tahmil...',
      error: 'Khata',
      success: 'Najah',
      warning: 'Tahdhir',
      info: 'Ma\'lumat',
      yes: 'Na\'am',
      no: 'La',
      settings: 'Al-i\'dadat',
      help: 'Musa\'ada',
      about: 'Hawl'
    },
    app: {
      name: 'DEX',
      tagline: 'Markaz al-tahakkum al-shakhsi',
      version: 'Al-isdar {{version}}'
    }
  }
};

// =============================================================================
// I18N ENGINE
// =============================================================================

export class I18nEngine extends EventEmitter {
  private config: I18nConfig;
  private currentLocale: string;
  private translations: Map<string, Translation> = new Map();
  private locales: Map<string, Locale> = new Map();
  
  constructor(config?: Partial<I18nConfig>) {
    super();
    
    this.config = {
      defaultLocale: 'en-US',
      fallbackLocale: 'en-US',
      supportedLocales: Object.keys(LOCALES),
      loadPath: './locales/{{locale}}/{{namespace}}.json',
      namespaces: ['common', 'app', 'menu', 'apps', 'time', 'errors'],
      defaultNamespace: 'common',
      interpolation: {
        prefix: '{{',
        suffix: '}}',
        escapeValue: true,
        formatSeparator: ','
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupQuerystring: 'lang',
        lookupCookie: 'i18n_lang',
        lookupLocalStorage: 'i18n_lang'
      },
      ...config
    };
    
    this.currentLocale = this.config.defaultLocale;
    
    // Initialize locales
    for (const [code, locale] of Object.entries(LOCALES)) {
      this.locales.set(code, locale);
    }
    
    // Initialize default translations
    for (const [code, translation] of Object.entries(DEFAULT_TRANSLATIONS)) {
      this.translations.set(code, translation);
    }
  }
  
  // ==========================================================================
  // LOCALE MANAGEMENT
  // ==========================================================================
  
  async setLocale(localeCode: string): Promise<void> {
    if (!this.locales.has(localeCode)) {
      throw new Error(`Locale ${localeCode} is not supported`);
    }
    
    // Load translations if not already loaded
    if (!this.translations.has(localeCode)) {
      await this.loadTranslations(localeCode);
    }
    
    const previousLocale = this.currentLocale;
    this.currentLocale = localeCode;
    
    // Cache preference
    this.cacheLocale(localeCode);
    
    this.emit('locale-changed', { 
      previous: previousLocale, 
      current: localeCode,
      locale: this.getLocale()
    });
  }
  
  getLocale(): Locale {
    return this.locales.get(this.currentLocale) || this.locales.get(this.config.defaultLocale)!;
  }
  
  getLocaleCode(): string {
    return this.currentLocale;
  }
  
  getSupportedLocales(): Locale[] {
    return Array.from(this.locales.values())
      .filter(l => this.config.supportedLocales.includes(l.code));
  }
  
  isRTL(): boolean {
    return this.getLocale().direction === 'rtl';
  }
  
  private async loadTranslations(localeCode: string): Promise<void> {
    // In production, load from files
    // For now, use defaults if available
    if (DEFAULT_TRANSLATIONS[localeCode]) {
      this.translations.set(localeCode, DEFAULT_TRANSLATIONS[localeCode]);
    }
  }
  
  private cacheLocale(localeCode: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.config.detection.lookupLocalStorage, localeCode);
      }
    } catch {
      // Ignore storage errors
    }
  }
  
  // ==========================================================================
  // TRANSLATION
  // ==========================================================================
  
  t(key: string, options?: Record<string, unknown>): string {
    const namespace = options?.ns as string || this.config.defaultNamespace;
    const fullKey = key.includes('.') ? key : `${namespace}.${key}`;
    
    let translation = this.getTranslation(fullKey, this.currentLocale);
    
    // Fallback to default locale
    if (!translation && this.currentLocale !== this.config.fallbackLocale) {
      translation = this.getTranslation(fullKey, this.config.fallbackLocale);
    }
    
    // Return key if no translation found
    if (!translation) {
      return key;
    }
    
    // Handle pluralization
    if (options?.count !== undefined) {
      translation = this.pluralize(translation, options.count as number, fullKey);
    }
    
    // Interpolate values
    if (options) {
      translation = this.interpolate(translation, options);
    }
    
    return translation;
  }
  
  private getTranslation(key: string, localeCode: string): string | undefined {
    const translations = this.translations.get(localeCode);
    if (!translations) return undefined;
    
    const keys = key.split('.');
    let result: unknown = translations;
    
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    
    return typeof result === 'string' ? result : undefined;
  }
  
  private pluralize(translation: string, count: number, key: string): string {
    const locale = this.getLocale();
    const pluralForm = this.getPluralForm(count, locale.pluralRules);
    
    const pluralKey = `${key}_${pluralForm}`;
    const pluralTranslation = this.getTranslation(pluralKey, this.currentLocale);
    
    return pluralTranslation || translation;
  }
  
  private getPluralForm(count: number, rules: PluralRules): string {
    if (count === 0 && rules.zero) return 'zero';
    if (count === 1 && rules.one) return 'one';
    if (count === 2 && rules.two) return 'two';
    if (count >= 3 && count <= 10 && rules.few) return 'few';
    if (count >= 11 && rules.many) return 'many';
    return 'other';
  }
  
  private interpolate(text: string, values: Record<string, unknown>): string {
    const { prefix, suffix } = this.config.interpolation;
    
    return text.replace(
      new RegExp(`${this.escapeRegex(prefix)}(\\w+)${this.escapeRegex(suffix)}`, 'g'),
      (_, key) => {
        const value = values[key];
        return value !== undefined ? String(value) : `${prefix}${key}${suffix}`;
      }
    );
  }
  
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // ==========================================================================
  // FORMATTING
  // ==========================================================================
  
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.currentLocale, options).format(value);
  }
  
  formatCurrency(value: number, currency?: string): string {
    const locale = this.getLocale();
    return new Intl.NumberFormat(this.currentLocale, {
      style: 'currency',
      currency: currency || locale.numberFormat.currency
    }).format(value);
  }
  
  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.currentLocale, options).format(date);
  }
  
  formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    
    if (seconds < 60) return this.t('time.now');
    if (minutes < 60) return this.t('time.minute', { count: minutes });
    if (hours < 24) return this.t('time.hour', { count: hours });
    if (days < 7) return this.t('time.day', { count: days });
    return this.t('time.week', { count: weeks });
  }
  
  formatList(items: string[], options?: Intl.ListFormatOptions): string {
    return new Intl.ListFormat(this.currentLocale, options).format(items);
  }
  
  // ==========================================================================
  // TRANSLATION MANAGEMENT
  // ==========================================================================
  
  addTranslations(localeCode: string, translations: Translation): void {
    const existing = this.translations.get(localeCode) || {};
    this.translations.set(localeCode, this.deepMerge(existing, translations));
    this.emit('translations-added', { locale: localeCode });
  }
  
  hasTranslation(key: string): boolean {
    return this.getTranslation(key, this.currentLocale) !== undefined;
  }
  
  getMissingKeys(localeCode: string): string[] {
    const fallback = this.translations.get(this.config.fallbackLocale);
    const target = this.translations.get(localeCode);
    
    if (!fallback || !target) return [];
    
    const missing: string[] = [];
    this.findMissingKeys(fallback, target, '', missing);
    return missing;
  }
  
  private findMissingKeys(
    source: Translation,
    target: Translation,
    prefix: string,
    missing: string[]
  ): void {
    for (const key of Object.keys(source)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (typeof sourceValue === 'object' && sourceValue !== null) {
        if (!targetValue || typeof targetValue !== 'object') {
          missing.push(fullKey);
        } else {
          this.findMissingKeys(
            sourceValue as Translation,
            targetValue as Translation,
            fullKey,
            missing
          );
        }
      } else if (targetValue === undefined) {
        missing.push(fullKey);
      }
    }
  }
  
  private deepMerge(target: Translation, source: Translation): Translation {
    const result = { ...target };
    
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (typeof sourceValue === 'object' && sourceValue !== null && 
          typeof targetValue === 'object' && targetValue !== null) {
        result[key] = this.deepMerge(
          targetValue as Translation,
          sourceValue as Translation
        );
      } else {
        result[key] = sourceValue;
      }
    }
    
    return result;
  }
  
  // ==========================================================================
  // DETECTION
  // ==========================================================================
  
  detectLocale(): string {
    for (const method of this.config.detection.order) {
      const detected = this.detectByMethod(method);
      if (detected && this.config.supportedLocales.includes(detected)) {
        return detected;
      }
    }
    return this.config.defaultLocale;
  }
  
  private detectByMethod(method: DetectionMethod): string | null {
    switch (method) {
      case 'localStorage':
        try {
          if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(this.config.detection.lookupLocalStorage);
          }
        } catch {}
        return null;
        
      case 'navigator':
        if (typeof navigator !== 'undefined') {
          const lang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;
          return lang || null;
        }
        return null;
        
      case 'htmlTag':
        if (typeof document !== 'undefined') {
          return document.documentElement.lang || null;
        }
        return null;
        
      default:
        return null;
    }
  }
}

// =============================================================================
// REACT HOOK (for renderer)
// =============================================================================

export interface UseTranslationResult {
  t: (key: string, options?: Record<string, unknown>) => string;
  i18n: I18nEngine;
  locale: Locale;
}

// Hook would be implemented in React context
// export function useTranslation(): UseTranslationResult { ... }

// =============================================================================
// EXPORTS
// =============================================================================

export const createI18nEngine = (config?: Partial<I18nConfig>) => new I18nEngine(config);

export default { I18nEngine, createI18nEngine, LOCALES, DEFAULT_TRANSLATIONS };
