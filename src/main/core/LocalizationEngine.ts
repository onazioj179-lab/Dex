// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Localization Engine
// Infrastructure for multi-language support. Ships with English only.
// t(key) function available globally. Falls back to English.
// Adding a new language requires only a new strings file.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export type SupportedLanguage = 'en';

export interface StringsMap {
  [key: string]: string;
}

const ENGLISH_STRINGS: StringsMap = {
  // Global
  'app.name': 'DEX',
  'app.tagline': 'Personal Control Hub',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.open': 'Open',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.sort': 'Sort',
  'common.name': 'Name',
  'common.date': 'Date',
  'common.size': 'Size',
  'common.type': 'Type',
  'common.status': 'Status',
  'common.actions': 'Actions',
  'common.settings': 'Settings',
  'common.help': 'Help',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.done': 'Done',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
  'common.warning': 'Warning',
  'common.info': 'Info',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.retry': 'Retry',
  'common.undo': 'Undo',
  'common.redo': 'Redo',
  'common.selectAll': 'Select All',
  'common.deselectAll': 'Deselect All',
  'common.noResults': 'No results found',
  'common.showMore': 'Show more',
  'common.showLess': 'Show less',
  'common.clear': 'Clear',
  'common.clearAll': 'Clear All',
  'common.restore': 'Restore',
  'common.remove': 'Remove',
  'common.export': 'Export',
  'common.import': 'Import',
  'common.copy': 'Copy',
  'common.paste': 'Paste',
  'common.cut': 'Cut',

  // Header
  'header.notifications': 'Notifications',
  'header.markAllRead': 'Mark all read',
  'header.clearAllNotifications': 'Clear all',
  'header.noNotifications': 'No notifications',
  'header.layouts': 'Layouts',
  'header.detach': 'Open in new window',

  // Notification Center
  'notifications.title': 'Notification Center',
  'notifications.unread': 'unread',
  'notifications.markRead': 'Mark as read',
  'notifications.confirmClear': 'Are you sure you want to clear all notifications?',
  'notifications.dndActive': 'Do Not Disturb is active',
  'notifications.dndSummary': '{count} notifications arrived while Do Not Disturb was active.',
  'notifications.preferences': 'Notification Preferences',
  'notifications.enabled': 'Notifications enabled',
  'notifications.delivery.all': 'Desktop popup and bell',
  'notifications.delivery.bell': 'Bell only',
  'notifications.delivery.silent': 'Silent (store only)',

  // Global Search
  'search.global': 'Search everything in DEX',
  'search.placeholder': 'Type to search across all apps...',
  'search.noResults': 'No results found for your search',
  'search.showMore': 'Show more results',

  // Media Library
  'mediaLibrary.title': 'Media Library',
  'mediaLibrary.all': 'All',
  'mediaLibrary.video': 'Video',
  'mediaLibrary.audio': 'Audio',
  'mediaLibrary.image': 'Images',
  'mediaLibrary.document': 'Documents',
  'mediaLibrary.sortByName': 'Sort by name',
  'mediaLibrary.sortByDate': 'Sort by date imported',
  'mediaLibrary.sortByLastUsed': 'Sort by last used',
  'mediaLibrary.sortByMostUsed': 'Sort by most used',
  'mediaLibrary.removeFromLibrary': 'Remove from library',
  'mediaLibrary.empty': 'No media files in library',
  'mediaLibrary.usedBy': 'Used by: {apps}',

  // Version History
  'versionHistory.title': 'Version History',
  'versionHistory.autoSave': 'Auto-saved',
  'versionHistory.manualSave': 'Manual save',
  'versionHistory.restore': 'Restore this version',
  'versionHistory.confirmRestore': 'Restore to this version? Your current state will be saved as a backup first.',
  'versionHistory.empty': 'No version history for this project',

  // Task Queue
  'taskQueue.title': 'Background Tasks',
  'taskQueue.cancel': 'Cancel',
  'taskQueue.retry': 'Retry',
  'taskQueue.failed': 'Failed',
  'taskQueue.completed': 'Completed',
  'taskQueue.running': 'Running',
  'taskQueue.queued': 'Queued',

  // Recycle Bin
  'recycleBin.title': 'Recycle Bin',
  'recycleBin.empty': 'Recycle bin is empty',
  'recycleBin.restore': 'Restore',
  'recycleBin.deletePermanently': 'Delete permanently',
  'recycleBin.emptyBin': 'Empty recycle bin',
  'recycleBin.confirmEmpty': 'Permanently delete all items? This cannot be undone.',
  'recycleBin.confirmEmptyStep2': 'Are you absolutely sure? All items will be permanently deleted.',
  'recycleBin.expiresIn': 'Expires in {days} days',

  // Workspace Layouts
  'layouts.title': 'Workspace Layouts',
  'layouts.save': 'Save current layout',
  'layouts.apply': 'Apply layout',
  'layouts.delete': 'Delete layout',
  'layouts.builtIn': 'Built-in',
  'layouts.custom': 'Custom',
  'layouts.enterName': 'Enter layout name',
  'layouts.focus': 'Focus',
  'layouts.split': 'Split',
  'layouts.default': 'Default',

  // Deep Links
  'deeplink.notFound': 'The linked item was not found. It may have been deleted or moved.',
  'deeplink.invalidLink': 'This link is not valid.',

  // Scratchpad
  'scratchpad.title': 'Quick Scratchpad',
  'scratchpad.placeholder': 'Type quick notes here...',
  'scratchpad.sendToNotes': 'Send to Notes',
  'scratchpad.clear': 'Clear',
  'scratchpad.confirmClear': 'Clear scratchpad content?',

  // Feedback
  'feedback.title': 'Send Feedback',
  'feedback.bugReport': 'Bug Report',
  'feedback.featureRequest': 'Feature Request',
  'feedback.generalFeedback': 'General Feedback',
  'feedback.description': 'Describe your issue or idea...',
  'feedback.includeSystemInfo': 'Include system information with report',
  'feedback.showIncluded': 'Show what is included',
  'feedback.submit': 'Submit',
  'feedback.saved': 'Report saved to: {path}',
  'feedback.sendInstructions': 'You can send this file to the DEX support channel.',

  // Settings
  'settings.general': 'General',
  'settings.appearance': 'Appearance',
  'settings.notifications': 'Notifications',
  'settings.localization': 'Localization',
  'settings.language': 'Language',
  'settings.languageNote': 'More languages coming in a future update.',
  'settings.about': 'About',

  // Sidebar
  'sidebar.home': 'Home',
  'sidebar.files': 'Files',
  'sidebar.browser': 'Browser',
  'sidebar.settings': 'Settings',
  'sidebar.mediaLibrary': 'Media Library',
  'sidebar.recycleBin': 'Recycle Bin',
  'sidebar.feedback': 'Send Feedback',
  'sidebar.help': 'Help',

  // Batch Operations
  'batch.selected': '{count} selected',
  'batch.deleteAll': 'Delete all selected',
  'batch.exportAll': 'Export all selected',
  'batch.moveAll': 'Move all selected',
  'batch.confirmDelete': 'Delete {count} selected items?',
  'batch.markComplete': 'Mark all complete',
  'batch.changeDueDate': 'Change due date',
  'batch.addToTimeline': 'Add to timeline',
  'batch.removeFromProject': 'Remove from project',
  'batch.exportClips': 'Export clips individually',

  // Multi Window
  'multiWindow.detach': 'Open in new window',
  'multiWindow.reattach': 'Return to main window',

  // Apps
  'app.home': 'Home',
  'app.files': 'Files',
  'app.browser': 'Browser',
  'app.settings': 'Settings',
  'app.transfers': 'Transfers',
  'app.dashboard': 'Dashboard',
  'app.notes': 'Notes',
  'app.tasks': 'Tasks',
  'app.power': 'Power',
  'app.workflows': 'Workflows',
  'app.gallery': 'Gallery',
  'app.audio': 'Audio',
  'app.video': 'Video',
  'app.videoeditor': 'Vinx',
  'app.imosion': 'Imosion',
  'app.prism': 'Prism',
  'app.flux': 'Flux',
  'app.forge': 'Forge',
  'app.calculator': 'Calculator',
  'app.calendar': 'Calendar',
  'app.passwordgenerator': 'Password Generator',
  'app.rewind': 'Rewind',
  'app.kanban': 'Kanban',
  'app.achievements': 'Achievements',

  // Errors
  'error.generic': 'Something went wrong. Please try again.',
  'error.network': 'Network error. Check your connection.',
  'error.notFound': 'The requested item was not found.',
  'error.permission': 'You do not have permission to perform this action.',
  'error.fileNotFound': 'File not found.',
  'error.saveFailed': 'Failed to save. Please try again.',
  'error.loadFailed': 'Failed to load data.',

  // Empty States
  'empty.notes': 'No notes yet. Create your first note.',
  'empty.tasks': 'No tasks yet. Add your first task.',
  'empty.files': 'No files in this directory.',
  'empty.gallery': 'No images in gallery.',
  'empty.workflows': 'No workflows created yet.',
};

const ALL_LANGUAGES: Record<SupportedLanguage, StringsMap> = {
  en: ENGLISH_STRINGS,
};

class LocalizationEngine {
  private currentLanguage: SupportedLanguage = 'en';
  private strings: StringsMap = ENGLISH_STRINGS;
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.loadLanguagePreference();
    this.registerIPC();
    log.info(`[Localization] Initialized with language: ${this.currentLanguage}`);
  }

  private loadLanguagePreference(): void {
    const saved = databaseManager.getSetting('language', 'en');
    if (saved in ALL_LANGUAGES) {
      this.currentLanguage = saved as SupportedLanguage;
    } else {
      this.currentLanguage = 'en';
    }
    this.strings = ALL_LANGUAGES[this.currentLanguage];
  }

  t(key: string, params?: Record<string, string | number>): string {
    let value = this.strings[key];
    if (value === undefined) {
      value = ENGLISH_STRINGS[key];
    }
    if (value === undefined) {
      return key;
    }
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(`{${paramKey}}`, String(paramValue));
      }
    }
    return value;
  }

  setLanguage(lang: SupportedLanguage): void {
    if (!(lang in ALL_LANGUAGES)) return;
    this.currentLanguage = lang;
    this.strings = ALL_LANGUAGES[lang];
    databaseManager.setSetting('language', lang);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('localization:changed', lang);
    }
    log.info(`[Localization] Language changed to: ${lang}`);
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  getAvailableLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'en', name: 'English' },
    ];
  }

  getAllStrings(): StringsMap {
    return { ...this.strings };
  }

  private registerIPC(): void {
    ipcMain.handle('localization:t', (_event, key: string, params?: Record<string, string | number>) => {
      return this.t(key, params);
    });

    ipcMain.handle('localization:setLanguage', (_event, lang: SupportedLanguage) => {
      this.setLanguage(lang);
      return true;
    });

    ipcMain.handle('localization:getLanguage', () => {
      return this.currentLanguage;
    });

    ipcMain.handle('localization:getAvailable', () => {
      return this.getAvailableLanguages();
    });

    ipcMain.handle('localization:getAllStrings', () => {
      return this.getAllStrings();
    });
  }

  shutdown(): void {
    log.info('[Localization] Shutdown');
  }
}

export const localizationEngine = new LocalizationEngine();

export function initializeLocalization(mainWindow: BrowserWindow): void {
  localizationEngine.initialize(mainWindow);
}

export function shutdownLocalization(): void {
  localizationEngine.shutdown();
}
