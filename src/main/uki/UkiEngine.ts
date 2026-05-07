// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Voice Assistant Engine
// Central orchestrator: Mic -> ASR -> NLU -> Router -> Dialog -> TTS
// Delegates hot-path NLU + KnowledgeGraph to native Rust kernel when available
// ===========================================================================

import log from 'electron-log';
import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Native Rust bridge (optional -- graceful fallback to JS)
// ---------------------------------------------------------------------------

let nativeUki: {
  ukiInit: () => string;
  ukiParseIntent: (transcript: string) => string;
  ukiKnowledgeRecord: (category: string, action: string, appId: string | null, pageId: string | null) => void;
  ukiKnowledgeSave: () => void;
  ukiKnowledgeLoad: () => string;
  ukiKnowledgeTopNodes: (n: number) => string;
  ukiKnowledgeSnapshot: () => string;
  ukiStats: () => string;
  // Memory archive functions
  ukiMemoryRecord: (recordType: string, summary: string, appId: string | null, pageId: string | null, category: string | null, action: string | null, success: boolean) => void;
  ukiMemorySave: () => void;
  ukiMemorySearch: (query: string, limit: number) => string;
  ukiMemoryRecent: (limit: number) => string;
  ukiMemoryStats: () => string;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const native = require('../../native/dex-native.node');
  if (typeof native.ukiInit === 'function') {
    nativeUki = native;
    const msg = nativeUki!.ukiInit();
    log.info('[UKI] Native Rust engine loaded:', msg);
  }
} catch {
  log.info('[UKI] Native engine not available, using JS fallback');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UkiState = 'dormant' | 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking' | 'error';

export interface UkiTurn {
  id: string;
  timestamp: number;
  userText: string;
  intent: string | null;
  entities: Record<string, unknown>;
  response: string;
  success: boolean;
}

export interface UkiSession {
  id: string;
  startedAt: number;
  turns: UkiTurn[];
  activeApp: string | null;
  activePage: string | null;
}

export interface UkiIntent {
  category: string;
  action: string;
  confidence: number;
  entities: Record<string, unknown>;
  params?: Record<string, unknown>;
  raw: string;
}

export interface UkiResult {
  success: boolean;
  response: string;
  data?: unknown;
  followUp?: string;
  openApp?: string;
}

// ---------------------------------------------------------------------------
// UKI Engine
// ---------------------------------------------------------------------------

class UkiEngine extends EventEmitter {
  private static instance: UkiEngine;
  private _state: UkiState = 'dormant';
  private session: UkiSession | null = null;
  private speechToken = 0;
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  // Sub-system references (set during init)
  private asrEngine: any = null;
  private nluPipeline: any = null;
  private router: any = null;
  private dialog: any = null;
  private ttsEngine: any = null;
  private knowledgeGraph: any = null;
  private knowledgePushTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    super();
    this.setMaxListeners(20);
  }

  static getInstance(): UkiEngine {
    if (!UkiEngine.instance) {
      UkiEngine.instance = new UkiEngine();
    }
    return UkiEngine.instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    this.mainWindow = mainWindow;

    // Import sub-systems lazily to avoid circular deps — wrap each in try/catch
    // so a single failing module doesn't break the entire engine
    try {
      const { UkiASR } = await import('./asr/UkiASR');
      this.asrEngine = UkiASR.getInstance();
    } catch (e) { log.warn('[UKI] ASR module failed to load:', e); }

    try {
      const { UkiNLU } = await import('./nlu/UkiNLU');
      this.nluPipeline = UkiNLU.getInstance();
    } catch (e) { log.warn('[UKI] NLU module failed to load:', e); }

    try {
      const { UkiRouter } = await import('./routing/UkiRouter');
      this.router = UkiRouter.getInstance();
    } catch (e) { log.warn('[UKI] Router module failed to load:', e); }

    try {
      const { UkiDialog } = await import('./dialog/UkiDialog');
      this.dialog = UkiDialog.getInstance();
    } catch (e) { log.warn('[UKI] Dialog module failed to load:', e); }

    try {
      const { UkiTTS } = await import('./tts/UkiTTS');
      this.ttsEngine = UkiTTS.getInstance();
      this.ttsEngine.setWindow?.(mainWindow);
    } catch (e) { log.warn('[UKI] TTS module failed to load:', e); }

    try {
      const { UkiKnowledgeGraph } = await import('./knowledge/UkiKnowledgeGraph');
      this.knowledgeGraph = UkiKnowledgeGraph.getInstance();
      await this.knowledgeGraph.initialize();
    } catch (e) { log.warn('[UKI] Knowledge Graph module failed to load:', e); }

    if (this.router) this.router.setWindow(mainWindow);

    // Report init status to renderer so UI can show ready/error state
    const missing = [
      !this.asrEngine && 'ASR',
      !this.nluPipeline && 'NLU',
      !this.router && 'Router',
      !this.dialog && 'Dialog',
      !this.ttsEngine && 'TTS',
      !this.knowledgeGraph && 'Knowledge',
    ].filter(Boolean);
    if (missing.length > 0) {
      log.warn(`[UKI] Partial init — missing modules: ${missing.join(', ')}`);
      mainWindow.webContents.send('uki:initStatus', { ready: true, partial: true, missing });
    } else {
      mainWindow.webContents.send('uki:initStatus', { ready: true, partial: false, missing: [] });
    }

    this.setState('idle');
    this.initialized = true;
    log.info('[UKI] Engine initialized');
  }

  shutdown(): void {
    this.stopListening();
    if (this.ttsEngine) this.ttsEngine.stop();
    this.session = null;
    this.setState('dormant');
    this.initialized = false;
    log.info('[UKI] Engine shut down');
  }

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  get state(): UkiState { return this._state; }

  private setState(s: UkiState): void {
    const prev = this._state;
    this._state = s;
    this.emit('stateChanged', s, prev);
    this.sendToRenderer('uki:stateChanged', { state: s, prev });
  }

  private speakResponse(response: string, payload: Record<string, unknown> = {}): void {
    const token = ++this.speechToken;
    this.setState('speaking');
    this.sendToRenderer('uki:response', { text: response, ...payload });
    this.ttsEngine.once('ended', () => {
      if (token === this.speechToken && this._state === 'speaking') {
        this.setState('idle');
      }
    });
    this.ttsEngine.speak(response);
  }

  // -----------------------------------------------------------------------
  // Pipeline: Mic → ASR → NLU → Router → Dialog → TTS
  // -----------------------------------------------------------------------

  /** Start listening for voice input. Called from dock mic click or Ctrl+Space. */
  async startListening(): Promise<void> {
    if (!this.initialized) return;
    if (this._state === 'listening') {
      this.stopListening();
      return;
    }
    if (this._state === 'speaking') {
      this.ttsEngine.stop();
    }

    this.ensureSession();

    this.setState('listening');
    this.sendToRenderer('uki:listeningStarted', {});
  }

  /** Stop listening. */
  stopListening(): void {
    if (this._state !== 'listening') return;
    this.setState('idle');
    this.sendToRenderer('uki:listeningStopped', {});
  }

  /** Process final ASR transcript -- the main pipeline. */
  async processTranscript(text: string): Promise<void> {
    if (!this.initialized || !text.trim()) return;
    this.ensureSession();
    // Enforce max input length to prevent abuse
    const safeText = text.trim().slice(0, 2000);

    this.setState('processing');
    this.sendToRenderer('uki:transcript', { text: safeText, isFinal: true });

    try {
      // NLU: parse intent + entities (Rust native or JS fallback)
      this.setState('thinking');

      // Hybrid recall: inject recent memory context before NLU (last 10 interactions)
      let memoryHint = '';
      if (nativeUki && typeof nativeUki.ukiMemoryRecent === 'function') {
        try {
          const recentJson = nativeUki.ukiMemoryRecent(10);
          const recent = JSON.parse(recentJson) as Array<{ summary: string }>;
          if (recent.length > 0) {
            memoryHint = recent.map(r => r.summary).join('; ');
          }
        } catch { /* non-critical */ }
      }

      let intent: UkiIntent;
      if (nativeUki) {
        const json = nativeUki.ukiParseIntent(safeText);
        intent = JSON.parse(json) as UkiIntent;
      } else {
        intent = this.nluPipeline.parse(safeText, this.getContext());
      }

      // --- Multi-turn context enrichment ---
      // If NLU returned low confidence or generic category, try to resolve
      // from recent conversation context (makes UKI feel smarter like Siri)
      if (intent.confidence < 0.6 && this.session && this.session.turns.length > 0) {
        const lastTurn = this.session.turns[this.session.turns.length - 1];
        // Carry forward app context for follow-up commands
        if (lastTurn.entities.appId && !intent.entities.appId) {
          intent.entities.appId = lastTurn.entities.appId;
        }
        // Boost confidence when context makes the intent clearer
        if (lastTurn.intent && intent.category === 'conversation' && intent.action === 'unknown') {
          // "do it again" / "one more time" patterns
          if (/^(?:again|one\s+more|do\s+(?:it|that)\s+again|repeat|same\s+thing)/i.test(safeText)) {
            const parts = lastTurn.intent.split(':');
            if (parts.length === 2) {
              intent.category = parts[0];
              intent.action = parts[1];
              intent.entities = { ...lastTurn.entities };
              intent.confidence = 0.85;
            }
          }
        }
      }

      // Dialog: check if we need clarification or confirmation
      const dialogAction = this.dialog.evaluate(intent, this.session!);
      if (dialogAction.type === 'clarify') {
        const response = dialogAction.message;
        this.speakResponse(response);
        this.addTurn(text, intent.category + ':' + intent.action, intent.entities, response, true);
        return;
      }
      if (dialogAction.type === 'confirm') {
        this.dialog.setPendingConfirmation(intent);
        const response = dialogAction.message;
        this.speakResponse(response);
        this.addTurn(text, 'confirm-pending', intent.entities, response, true);
        return;
      }

      // Router: dispatch to domain handler
      const result: UkiResult = await this.router.route(intent);

      // Knowledge: record interaction (Rust native or JS fallback)
      if (nativeUki) {
        try {
          nativeUki.ukiKnowledgeRecord(
            intent.category,
            intent.action,
            (intent.entities.appId as string) || null,
            (intent.entities.pageId as string) || null
          );
          nativeUki.ukiKnowledgeSave();
        } catch { /* non-critical */ }
      } else {
        this.knowledgeGraph.recordInteraction(intent, result);
      }

      // Memory archive: persist conversation turn for long-term recall
      if (nativeUki && typeof nativeUki.ukiMemoryRecord === 'function') {
        try {
          const summary = `User: ${safeText.slice(0, 200)} → ${result.response.slice(0, 300)}`;
          nativeUki.ukiMemoryRecord(
            'conversation',
            summary,
            (intent.entities.appId as string) || this.session?.activeApp || null,
            (intent.entities.pageId as string) || this.session?.activePage || null,
            intent.category || null,
            intent.action || null,
            result.success,
          );
          nativeUki.ukiMemorySave();
        } catch { /* non-critical */ }
      }

      // --- Send full conversation turn to renderer for history display ---
      const turnData = {
        id: `turn-${Date.now()}`,
        userText: safeText,
        response: result.response,
        intent: intent.category + ':' + intent.action,
        success: result.success,
        timestamp: Date.now(),
        data: result.data,
      };
      this.sendToRenderer('uki:turn', turnData);

      // Response
      const response = result.response;
      this.speakResponse(response, { success: result.success, data: result.data });

      this.addTurn(text, intent.category + ':' + intent.action, intent.entities, response, result.success);
      this.pushKnowledgeToNexus();
    } catch (err: any) {
      log.error('[UKI] Pipeline error:', err);
      const errMsg = 'Sorry, something went wrong. Please try again.';
      this.speakResponse(errMsg, { success: false });
      this.addTurn(text, 'error', {}, errMsg, false);
    }
  }

  /** Handle confirmation response (yes/no). */
  async handleConfirmation(confirmed: boolean): Promise<void> {
    const pending = this.dialog.getPendingConfirmation();
    if (!pending) return;

    this.dialog.clearPendingConfirmation();

    if (confirmed) {
      const result = await this.router.route(pending);
      if (nativeUki) {
        try {
          nativeUki.ukiKnowledgeRecord(
            pending.category,
            pending.action,
            (pending.entities.appId as string) || null,
            (pending.entities.pageId as string) || null
          );
          nativeUki.ukiKnowledgeSave();
        } catch { /* non-critical */ }
      } else {
        this.knowledgeGraph.recordInteraction(pending, result);
      }
      this.speakResponse(result.response, { success: result.success });
    } else {
      const msg = 'Okay, cancelled.';
      this.speakResponse(msg);
    }
  }

  /** Text-based query (typed in dock search or command palette). */
  async query(text: string): Promise<UkiResult> {
    if (!this.initialized) return { success: false, response: 'UKI is not ready yet.' };
    await this.processTranscript(text);
    const lastTurn = this.session?.turns[this.session.turns.length - 1];
    return { success: lastTurn?.success ?? false, response: lastTurn?.response ?? '' };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private addTurn(userText: string, intent: string | null, entities: Record<string, unknown>, response: string, success: boolean): void {
    this.ensureSession();
    if (!this.session) return;
    this.session.turns.push({
      id: `turn-${this.session.turns.length}`,
      timestamp: Date.now(),
      userText,
      intent,
      entities,
      response,
      success,
    });
    // Keep last 20 turns
    if (this.session.turns.length > 20) {
      this.session.turns = this.session.turns.slice(-20);
    }
  }

  private getContext(): { turns: UkiTurn[]; activeApp: string | null; activePage: string | null } {
    return {
      turns: this.session?.turns ?? [],
      activeApp: this.session?.activeApp ?? null,
      activePage: this.session?.activePage ?? null,
    };
  }

  private sendToRenderer(channel: string, data: unknown): void {
    try {
      this.mainWindow?.webContents?.send(channel, data);
    } catch { /* window may be closed */ }
  }

  private ensureSession(): void {
    if (this.session) return;
    this.session = {
      id: `uki-${Date.now()}`,
      startedAt: Date.now(),
      turns: [],
      activeApp: null,
      activePage: null,
    };
  }

  /** Update active page/app context from renderer. */
  setContext(page: string | null, app: string | null): void {
    if (this.session) {
      this.session.activePage = page;
      this.session.activeApp = app;
    }
  }

  /** Push knowledge graph data to Nexus renderer for live visualization. */
  private pushKnowledgeToNexus(): void {
    if (this.knowledgePushTimer) clearTimeout(this.knowledgePushTimer);
    this.knowledgePushTimer = setTimeout(() => {
      this.knowledgePushTimer = null;
      try {
        const turns = this.session?.turns.slice(-15) || [];
        const knowledgeNodes = turns.map((t, i) => {
          const categoryColors: Record<string, string> = {
            navigation: '#0A84FF', app_launch: '#30d158', media: '#ff9f0a',
            file_ops: '#ff375f', creative: '#bf5af2', system: '#ff453a',
            knowledge: '#4DD0E1', conversation: '#8E8E93', web_search: '#64d2ff',
            automation: '#ffd60a', search: '#5e5ce6',
          };
          const cat = t.intent?.split(':')[0] || 'conversation';
          return {
            id: `uki-turn-${t.id}`,
            label: t.userText.slice(0, 40),
            weight: t.success ? 0.8 + (i / Math.max(turns.length, 1)) * 0.2 : 0.3,
            color: categoryColors[cat] || '#8E8E93',
            category: cat,
            timestamp: t.timestamp,
          };
        });

        this.sendToRenderer('uki:knowledge-update', { nodes: knowledgeNodes });
      } catch { /* non-critical */ }
    }, 120);
  }

  getStatus(): { state: UkiState; initialized: boolean; sessionTurns: number } {
    return {
      state: this._state,
      initialized: this.initialized,
      sessionTurns: this.session?.turns.length ?? 0,
    };
  }

  // -----------------------------------------------------------------------
  // Proactive Suggestions — idle nudges based on knowledge graph patterns
  // -----------------------------------------------------------------------

  /** Generate a context-aware suggestion based on recent activity patterns. */
  async getSuggestion(): Promise<string | null> {
    if (!this.initialized) return null;

    try {
      // Try native knowledge graph for top patterns
      if (nativeUki && typeof nativeUki.ukiKnowledgeTopNodes === 'function') {
        const topJson = nativeUki.ukiKnowledgeTopNodes(5);
        const top = JSON.parse(topJson) as Array<{ category: string; action: string; count: number }>;
        if (top.length > 0) {
          const most = top[0];
          if (most.category === 'creative' && most.count >= 3) {
            return `You've been working on ${most.action} a lot. Would you like me to open your last project?`;
          }
          if (most.category === 'file_ops') {
            return `You frequently work with files. Need me to organize your recent downloads?`;
          }
        }
      }

      // Fallback: check session context
      const recentTurns = this.session?.turns.slice(-5) || [];
      const recentApps = [...new Set(recentTurns.map(t => t.entities?.appId).filter(Boolean))];
      if (recentApps.length > 0) {
        return `I noticed you were working in ${recentApps[0]}. Want me to resume where you left off?`;
      }
    } catch {
      // Non-critical — suggestions are optional
    }

    return null;
  }
}

export const ukiEngine = UkiEngine.getInstance();
export { UkiEngine };
