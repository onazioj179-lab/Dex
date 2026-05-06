// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Controller
// IPC registration + lifecycle for UKI voice assistant
// ===========================================================================

import log from 'electron-log';
import { ipcMain, globalShortcut, BrowserWindow, app } from 'electron';
import { ukiEngine } from '../uki/UkiEngine';
import { ukiConfig } from '../uki/UkiConfig';
import { IPCCrypto } from '../security/IPCCrypto';
import { getUkiCopilot, CopilotConfig, WorkContext } from '../uki/UkiCopilot';
import {
  generateBlueprint,
  tweakBlueprint,
  type Blueprint,
  type BlueprintKind,
  type TweakRequest,
} from '../uki/UkiBlueprintGenerator';
import {
  getUkiCreativeOperator,
  type CreativeAction,
} from '../uki/domains/UkiCreativeOperator';
import {
  configureUkiRewindMemory,
  getUkiRewindMemory,
  makeKnowledgeAdapter,
  makeNativeMemoryAdapter,
  makeRewindAdapter,
  type RecallOptions,
} from '../uki/knowledge/UkiRewindMemory';
import { UkiKnowledgeGraph } from '../uki/knowledge/UkiKnowledgeGraph';
import { rewindEngine } from '../core/RewindEngine';

// Get copilot instance
const ukiCopilot = getUkiCopilot();

// ---------------------------------------------------------------------------
// Native Rust bridge for memory operations (optional)
// ---------------------------------------------------------------------------
let nativeMemory: {
  ukiMemoryRecord: (recordType: string, summary: string, appId: string | null, pageId: string | null, category: string | null, action: string | null, success: boolean) => void;
  ukiMemorySave: () => void;
  ukiMemorySearch: (query: string, limit: number) => string;
  ukiMemoryRecent: (limit: number) => string;
  ukiMemoryStats: () => string;
  ukiMemoryCleanup: () => number;
  ukiMemoryClear: () => void;
} | null = null;

try {
  const native = require('../../native/dex-native.node');
  if (typeof native.ukiMemoryRecord === 'function') {
    nativeMemory = native;
  }
} catch { /* native not available */ }

class UkiController {
  private static instance: UkiController;
  private initialized = false;
  private shortcutRegistered = false;

  private constructor() {}

  static getInstance(): UkiController {
    if (!UkiController.instance) {
      UkiController.instance = new UkiController();
    }
    return UkiController.instance;
  }

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    if (this.initialized) return;

    // Initialize UKI engine
    await ukiEngine.initialize(mainWindow);

    // Register IPC handlers
    this.setupIPC();

    // Wire UKI recall surface to live subsystems.
    try {
      configureUkiRewindMemory({
        knowledge: makeKnowledgeAdapter(UkiKnowledgeGraph.getInstance()),
        native: nativeMemory ? makeNativeMemoryAdapter(nativeMemory) : null,
        rewind: makeRewindAdapter(rewindEngine),
      });
    } catch (err) {
      log.warn('[UkiController] UkiRewindMemory wiring failed:', err);
    }

    // Register global shortcut
    const config = ukiConfig.get();
    if (config.enabled) {
      this.registerShortcut(config.shortcut);
    }

    // Wave 1: UKI AutoPilot scheduler (cron + idle + system events)
    try {
      const { initUkiScheduler } = await import('../uki/Scheduler');
      await initUkiScheduler();
    } catch (err) {
      log.warn('[UkiController] AutoPilot scheduler init failed:', err);
    }

    this.initialized = true;
    if (!app.isPackaged) log.info('[UkiController] Initialized');
  }

  private setupIPC(): void {
    // --- Status & Config ---
    ipcMain.handle('uki:getStatus', () => ukiEngine.getStatus());
    ipcMain.handle('uki:getConfig', () => ukiConfig.get());
    ipcMain.handle('uki:updateConfig', (_e, partial: unknown) => {
      if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return ukiConfig.get();
      const p = partial as Record<string, unknown>;
      const updated = ukiConfig.update(partial as Partial<import('../uki/UkiConfig').UkiConfigData>);
      // Re-register shortcut if changed
      if (p.shortcut) {
        this.unregisterShortcut();
        if (updated.enabled) this.registerShortcut(updated.shortcut);
      }
      if (p.enabled !== undefined) {
        if (p.enabled) {
          this.registerShortcut(updated.shortcut);
        } else {
          this.unregisterShortcut();
          ukiEngine.stopListening();
        }
      }
      return updated;
    });
    ipcMain.handle('uki:resetConfig', () => ukiConfig.reset());

    // --- Listening control ---
    ipcMain.handle('uki:startListening', () => ukiEngine.startListening());
    ipcMain.handle('uki:stopListening', () => {
      ukiEngine.stopListening();
      return true;
    });
    ipcMain.handle('uki:toggle', () => {
      if (ukiEngine.state === 'listening') {
        ukiEngine.stopListening();
      } else {
        ukiEngine.startListening();
      }
      return ukiEngine.state;
    });

    // --- Process transcript from renderer ASR ---
    ipcMain.handle('uki:transcript', async (_e, sealed: unknown) => {
      const text = IPCCrypto.tryOpen(sealed);
      if (typeof text !== 'string') return false;
      const sanitized = text.trim().slice(0, 2000);
      if (!sanitized) return false;
      await ukiEngine.processTranscript(sanitized);
      return true;
    });

    // --- Text query (typed) ---
    ipcMain.handle('uki:query', async (_e, sealed: unknown) => {
      const text = IPCCrypto.tryOpen(sealed);
      if (typeof text !== 'string') return { success: false, response: 'Invalid input.' };
      const sanitized = text.trim().slice(0, 2000);
      if (!sanitized) return { success: false, response: 'Empty query.' };
      return ukiEngine.query(sanitized);
    });

    // --- Confirmation response ---
    ipcMain.handle('uki:confirm', async (_e, confirmed: unknown) => {
      if (typeof confirmed !== 'boolean') return false;
      await ukiEngine.handleConfirmation(confirmed);
      return true;
    });

    // --- TTS ended notification from renderer ---
    ipcMain.on('uki:tts:ended', () => {
      // Emit 'ended' on the TTS engine so processTranscript's once('ended') handler fires
      try {
        (ukiEngine as any).ttsEngine?.emit?.('ended');
      } catch { /* non-critical */ }
    });

    // --- Context updates from renderer ---
    ipcMain.on('uki:setContext', (_e, page: unknown, appId: unknown) => {
      const safePage = typeof page === 'string' ? page.slice(0, 100) : null;
      const safeApp = typeof appId === 'string' ? appId.slice(0, 100) : null;
      ukiEngine.setContext(safePage, safeApp);
    });

    // --- Memory operations (Rust native) ---
    ipcMain.handle('uki:memoryRecord', (_e, entry: unknown) => {
      if (!nativeMemory || !entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const e = entry as Record<string, unknown>;
      const recordType = typeof e.type === 'string' ? e.type.slice(0, 50) : 'activity';
      const summary = typeof e.summary === 'string' ? e.summary.slice(0, 2000) : '';
      if (!summary) return false;
      const appId = typeof e.appId === 'string' ? e.appId.slice(0, 100) : null;
      const pageId = typeof e.pageId === 'string' ? e.pageId.slice(0, 100) : null;
      const category = typeof e.category === 'string' ? e.category.slice(0, 100) : null;
      const action = typeof e.action === 'string' ? e.action.slice(0, 100) : null;
      const success = typeof e.success === 'boolean' ? e.success : true;
      try {
        nativeMemory.ukiMemoryRecord(recordType, summary, appId, pageId, category, action, success);
        nativeMemory.ukiMemorySave();
        return true;
      } catch { return false; }
    });

    ipcMain.handle('uki:memorySearch', (_e, query: unknown, limit: unknown) => {
      if (!nativeMemory || typeof query !== 'string') return [];
      const safeQuery = query.trim().slice(0, 500);
      const safeLimit = typeof limit === 'number' ? Math.max(1, Math.min(100, limit)) : 20;
      if (!safeQuery) return [];
      try {
        return JSON.parse(nativeMemory.ukiMemorySearch(safeQuery, safeLimit));
      } catch { return []; }
    });

    ipcMain.handle('uki:memoryRecent', (_e, limit: unknown) => {
      if (!nativeMemory) return [];
      const safeLimit = typeof limit === 'number' ? Math.max(1, Math.min(100, limit)) : 10;
      try {
        return JSON.parse(nativeMemory.ukiMemoryRecent(safeLimit));
      } catch { return []; }
    });

    ipcMain.handle('uki:memoryStats', () => {
      if (!nativeMemory) return { available: false, totalRecords: 0, totalEver: 0 };
      try {
        return JSON.parse(nativeMemory.ukiMemoryStats());
      } catch { return { available: false, totalRecords: 0, totalEver: 0 }; }
    });

    ipcMain.handle('uki:memoryCleanup', () => {
      if (!nativeMemory) return 0;
      try {
        const removed = nativeMemory.ukiMemoryCleanup();
        nativeMemory.ukiMemorySave();
        return removed;
      } catch { return 0; }
    });

    ipcMain.handle('uki:memoryClear', () => {
      if (!nativeMemory) return false;
      try {
        nativeMemory.ukiMemoryClear();
        nativeMemory.ukiMemorySave();
        return true;
      } catch { return false; }
    });

    // --- UKI Copilot IPC Handlers ---
    ipcMain.handle('uki:copilot:getConfig', () => ukiCopilot.getConfig());
    
    ipcMain.handle('uki:copilot:updateConfig', (_e, config: unknown) => {
      if (!config || typeof config !== 'object') return ukiCopilot.getConfig();
      return ukiCopilot.updateConfig(config as Partial<CopilotConfig>);
    });

    ipcMain.handle('uki:copilot:setContext', (_e, context: unknown) => {
      if (!context || typeof context !== 'object') return false;
      ukiCopilot.setContext(context as WorkContext);
      return true;
    });

    ipcMain.handle('uki:copilot:sendMessage', async (_e, sealed: unknown) => {
      const content = IPCCrypto.tryOpen(sealed);
      if (typeof content !== 'string') return null;
      const sanitized = content.trim().slice(0, 10000);
      if (!sanitized) return null;
      return ukiCopilot.sendMessage(sanitized);
    });

    ipcMain.handle('uki:copilot:getConversation', () => ukiCopilot.getConversation());
    
    ipcMain.handle('uki:copilot:clearConversation', () => {
      ukiCopilot.clearConversation();
      return true;
    });

    ipcMain.handle('uki:copilot:getSuggestions', () => ukiCopilot.getProactiveSuggestions());
    
    ipcMain.handle('uki:copilot:executeAction', async (_e, actionId: unknown) => {
      if (typeof actionId !== 'string') return { success: false };
      return ukiCopilot.executeAction(actionId);
    });

    ipcMain.handle('uki:copilot:isThinking', () => ukiCopilot.getThinkingState());

    // --- UKI Blueprint Generator (AXL / generic scaffolds) ---
    const blueprintCache = new Map<string, Blueprint>();
    ipcMain.handle('uki:blueprint:generate', async (_e, sealedPrompt: unknown, kind: unknown) => {
      const prompt = IPCCrypto.tryOpen(sealedPrompt);
      if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, error: 'invalid-prompt' };
      try {
        const bp = generateBlueprint(prompt.slice(0, 4000), {
          kind: typeof kind === 'string' ? kind as BlueprintKind : undefined,
        });
        blueprintCache.set(bp.id, bp);
        if (blueprintCache.size > 32) {
          const oldest = blueprintCache.keys().next().value;
          if (oldest) blueprintCache.delete(oldest);
        }
        return { ok: true, blueprint: bp };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'generate-failed' };
      }
    });
    ipcMain.handle('uki:blueprint:tweak', (_e, blueprintId: unknown, change: unknown) => {
      if (typeof blueprintId !== 'string') return { ok: false, error: 'invalid-id' };
      const bp = blueprintCache.get(blueprintId);
      if (!bp) return { ok: false, error: 'not-found' };
      if (!change || typeof change !== 'object') return { ok: false, error: 'invalid-change' };
      try {
        const next = tweakBlueprint(bp, change as TweakRequest);
        blueprintCache.set(next.id, next);
        return { ok: true, blueprint: next };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'tweak-failed' };
      }
    });

    // --- UKI Rewind/Knowledge recall ---
    ipcMain.handle('uki:recall', async (_e, sealedQuery: unknown, options: unknown) => {
      const query = IPCCrypto.tryOpen(sealedQuery);
      if (typeof query !== 'string' || !query.trim()) return { ok: false, error: 'invalid-query' };
      try {
        const memory = getUkiRewindMemory();
        const opts = (options && typeof options === 'object') ? options as RecallOptions : undefined;
        const result = await memory.recallContext(query.slice(0, 1000), opts);
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'recall-failed' };
      }
    });

    // --- UKI Creative Operator (per-app action dispatch) ---
    ipcMain.handle('uki:operator:dispatch', async (_e, action: unknown) => {
      if (!action || typeof action !== 'object') return { ok: false, reason: 'invalid-action' };
      const op = getUkiCreativeOperator();
      // Invoker simply forwards to webContents via IPC channel name. Without a
      // mainWindow ref here we just return the channel for the renderer to
      // self-invoke, which keeps this main-process side a pure router.
      const result = await op.dispatch(action as CreativeAction, async () => undefined);
      return result;
    });
    ipcMain.handle('uki:operator:audit', (_e, limit: unknown) => {
      const op = getUkiCreativeOperator();
      const n = typeof limit === 'number' && limit > 0 && limit < 200 ? limit : 20;
      return op.getAudit(n);
    });
  }

  private registerShortcut(shortcut: string): void {
    if (this.shortcutRegistered) {
      this.unregisterShortcut();
    }
    try {
      const ok = globalShortcut.register(shortcut, () => {
        if (ukiEngine.state === 'listening') {
          ukiEngine.stopListening();
        } else {
          ukiEngine.startListening();
        }
      });
      if (ok) {
        this.shortcutRegistered = true;
      } else {
        log.warn('[UkiController] Failed to register shortcut:', shortcut);
      }
    } catch (err) {
      log.error('[UkiController] Shortcut error:', err);
    }
  }

  private unregisterShortcut(): void {
    if (this.shortcutRegistered) {
      try {
        const config = ukiConfig.get();
        globalShortcut.unregister(config.shortcut);
      } catch { /* ignore */ }
      this.shortcutRegistered = false;
    }
  }

  shutdown(): void {
    this.unregisterShortcut();
    ukiEngine.shutdown();
    this.initialized = false;
  }
}

export const ukiController = UkiController.getInstance();
export { UkiController };
