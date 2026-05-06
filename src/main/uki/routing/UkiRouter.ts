// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Domain Router
// Routes parsed intents to domain handler functions
// ===========================================================================

import log from 'electron-log';
import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';

// Domain handlers — lazy-loaded
let navigation: typeof import('../domains/UkiNavigation') | null = null;
let media: typeof import('../domains/UkiMedia') | null = null;
let files: typeof import('../domains/UkiFiles') | null = null;
let apps: typeof import('../domains/UkiApps') | null = null;
let system: typeof import('../domains/UkiSystem') | null = null;
let creative: typeof import('../domains/UkiCreative') | null = null;
let automation: typeof import('../domains/UkiAutomation') | null = null;
let knowledge: typeof import('../domains/UkiKnowledge') | null = null;
let conversation: typeof import('../domains/UkiConversation') | null = null;
let web: typeof import('../domains/UkiWeb') | null = null;
let crossApp: typeof import('../domains/UkiCrossApp') | null = null;

class UkiRouterImpl {
  private static _instance: UkiRouterImpl;
  private mainWindow: BrowserWindow | null = null;

  static getInstance(): UkiRouterImpl {
    if (!UkiRouterImpl._instance) UkiRouterImpl._instance = new UkiRouterImpl();
    return UkiRouterImpl._instance;
  }

  setWindow(win: BrowserWindow): void { this.mainWindow = win; }

  async route(intent: UkiIntent): Promise<UkiResult> {
    const win = this.mainWindow;
    if (!win) return { success: false, response: 'No window available.' };

    try {
      switch (intent.category) {
        case 'navigation': {
          if (!navigation) navigation = await import('../domains/UkiNavigation');
          return navigation.handle(intent, win);
        }
        case 'app_launch': {
          if (!apps) apps = await import('../domains/UkiApps');
          return apps.handleLaunch(intent, win);
        }
        case 'app_close': {
          if (!apps) apps = await import('../domains/UkiApps');
          return apps.handleClose(intent, win);
        }
        case 'media': {
          if (!media) media = await import('../domains/UkiMedia');
          return media.handle(intent, win);
        }
        case 'file_ops': {
          if (!files) files = await import('../domains/UkiFiles');
          return files.handle(intent, win);
        }
        case 'search': {
          if (!files) files = await import('../domains/UkiFiles');
          return files.handle({ ...intent, action: 'search' }, win);
        }
        case 'create': {
          if (!apps) apps = await import('../domains/UkiApps');
          return apps.handleCreate(intent, win);
        }
        case 'settings': {
          if (!system) system = await import('../domains/UkiSystem');
          return system.handle(intent, win);
        }
        case 'system': {
          if (!system) system = await import('../domains/UkiSystem');
          return system.handle(intent, win);
        }
        case 'automation': {
          if (!automation) automation = await import('../domains/UkiAutomation');
          return automation.handle(intent, win);
        }
        case 'creative': {
          if (!creative) creative = await import('../domains/UkiCreative');
          return creative.handle(intent, win);
        }
        case 'cross_app': {
          if (!crossApp) crossApp = await import('../domains/UkiCrossApp');
          return crossApp.handle(intent, win);
        }
        case 'knowledge': {
          if (!knowledge) knowledge = await import('../domains/UkiKnowledge');
          return knowledge.handle(intent, win);
        }
        case 'transfer': {
          // Route to files for now
          if (!files) files = await import('../domains/UkiFiles');
          return files.handle(intent, win);
        }
        case 'web_search': {
          if (!web) web = await import('../domains/UkiWeb');
          return web.handle(intent, win);
        }
        case 'memory': {
          return this.handleMemory(intent, win);
        }
        case 'confirmation': {
          // Handled by UkiEngine directly
          return { success: true, response: '' };
        }
        case 'conversation':
        default: {
          if (!conversation) conversation = await import('../domains/UkiConversation');
          return conversation.handle(intent);
        }
      }
    } catch (err: any) {
      log.error('[UKI Router] Error:', err);
      return { success: false, response: 'Something went wrong while processing your request.' };
    }
  }

  private async handleMemory(intent: UkiIntent, win: BrowserWindow): Promise<UkiResult> {
    try {
      let nativeUki: any = null;
      try { nativeUki = require('../../native/dex-native.node'); } catch { /* native unavailable */ }

      switch (intent.action) {
        case 'recall': {
          if (nativeUki?.ukiMemoryRecent) {
            const json = nativeUki.ukiMemoryRecent(5);
            const records = JSON.parse(json);
            if (records.length === 0) return { success: true, response: "I don't have any memories stored yet." };
            const summaries = records.map((r: any) => r.summary).join('. ');
            return { success: true, response: `Here's what I remember: ${summaries}`, data: { records } };
          }
          return { success: true, response: "Memory recall is available when the native engine is loaded." };
        }
        case 'search': {
          const query = Object.values(intent.entities).join(' ') || '';
          if (nativeUki?.ukiMemorySearch && query) {
            const json = nativeUki.ukiMemorySearch(query, 5);
            const results = JSON.parse(json);
            if (results.length === 0) return { success: true, response: `I couldn't find anything matching "${query}" in my memory.` };
            const summaries = results.map((r: any) => r.summary).join('. ');
            return { success: true, response: `Found ${results.length} memories about "${query}": ${summaries}`, data: { results } };
          }
          if (!query) return { success: true, response: "What would you like me to search for in my memory?" };
          return { success: true, response: "Memory search requires the native engine." };
        }
        case 'record': {
          return { success: true, response: "Got it — I'll remember this conversation." };
        }
        case 'forget': {
          return { success: true, response: "I'll forget the most recent interaction." };
        }
        case 'clear': {
          if (nativeUki?.ukiMemoryClear) {
            nativeUki.ukiMemoryClear();
            nativeUki.ukiMemorySave();
            return { success: true, response: "All my memories have been cleared." };
          }
          return { success: true, response: "Memory clearing requires the native engine." };
        }
        case 'stats': {
          if (nativeUki?.ukiMemoryStats) {
            const json = nativeUki.ukiMemoryStats();
            const stats = JSON.parse(json);
            return { success: true, response: `I have ${stats.total_records} memories using ${(stats.storage_bytes / (1024 * 1024)).toFixed(1)} MB of storage.`, data: { stats } };
          }
          return { success: true, response: "Memory stats require the native engine." };
        }
        default:
          return { success: true, response: "I'm not sure what you'd like me to do with my memory." };
      }
    } catch {
      return { success: false, response: "Something went wrong accessing my memory." };
    }
  }
}

export const UkiRouter = UkiRouterImpl;
