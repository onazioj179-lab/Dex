// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Renderer Bridge
// Connects renderer IPC events to ukiStore + handles TTS/ASR in renderer
// ===========================================================================

import { useUkiStore } from '../store/ukiStore';
import type { UkiUIState } from '../store/ukiStore';
import { checkPermissionAccess, usePermissionStore } from '../store/permissionStore';

let initialized = false;
let recognition: any = null;
let shouldKeepListening = false;
let knowledgeUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let pendingKnowledgeNodes: Array<{
  id: string;
  label: string;
  weight: number;
  color: string;
  category: string;
  timestamp: number;
}> | null = null;

function createSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    console.warn('[UKI] Speech Recognition API not available in this browser/environment');
    return null;
  }
  try {
    return new SpeechRecognitionCtor();
  } catch (e) {
    console.warn('[UKI] Failed to create SpeechRecognition instance:', e);
    return null;
  }
}

function startSpeechRecognition(ipc: any, dex: any): void {
  const store = useUkiStore;
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

  if (!checkPermissionAccess('microphone', 'uki')) {
    store.getState().setError('Microphone is off. Turn on the mic permission pill, then try voice again.');
    store.getState().stopListening();
    shouldKeepListening = false;
    recognition = null;
    return;
  }

  if (!getUserMedia) {
    store.getState().setError('Microphone access is not available in this environment');
    shouldKeepListening = false;
    recognition = null;
    return;
  }

  // Request microphone permission first (triggers browser permission prompt)
  getUserMedia({ audio: true }).then((stream) => {
    // Permission granted — stop the stream (SpeechRecognition manages its own)
    stream.getTracks().forEach(t => t.stop());

    const sr = createSpeechRecognition();
    if (!sr) {
      store.getState().setError('Speech recognition not available in this environment');
      shouldKeepListening = false;
      recognition = null;
      return;
    }

    recognition = sr;
    shouldKeepListening = true;

    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = 'en-US';
    sr.maxAlternatives = 1;

    sr.onresult = (event: any) => {
      let finalText = '';
      let partialText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result?.[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) {
          finalText += (finalText ? ' ' : '') + text;
        } else {
          partialText += (partialText ? ' ' : '') + text;
        }
      }

      if (partialText) {
        store.getState().setPartialTranscript(partialText);
      }

      if (finalText) {
        store.getState().setTranscript(finalText);
        store.getState().setPartialTranscript('');
        dex?.uki?.transcript?.(finalText);
        store.getState().setAudioLevel(0.85);
        setTimeout(() => store.getState().setAudioLevel(0.2), 120);
      }
    };

    sr.onstart = () => {
      store.getState().setError(null);
      store.getState().setAudioLevel(0.2);
    };

    sr.onerror = (event: any) => {
      const err = String(event?.error || 'speech recognition error');
      if (err !== 'no-speech') {
        store.getState().setError(`Microphone error: ${err}`);
      }
    };

    sr.onend = () => {
      store.getState().setAudioLevel(0);
      if (shouldKeepListening) {
        try {
          sr.start();
        } catch {
          setTimeout(() => {
            if (shouldKeepListening) {
              try {
                sr.start();
              } catch {
                store.getState().setError('Unable to restart microphone listening');
              }
            }
          }, 250);
        }
      }
    };

    try {
      sr.start();
    } catch {
      store.getState().setError('Unable to access microphone speech recognition');
      shouldKeepListening = false;
      recognition = null;
    }
  }).catch((err: any) => {
    usePermissionStore.getState().setPermission('microphone', false);
    store.getState().setError(`Microphone permission denied: ${err?.message || err}`);
    shouldKeepListening = false;
    recognition = null;
  });
}

function stopSpeechRecognition(): void {
  shouldKeepListening = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // no-op
    }
  }
  recognition = null;
  const store = useUkiStore;
  store.getState().setAudioLevel(0);
  store.getState().setPartialTranscript('');
}

/**
 * Call once from App.tsx or main.tsx to wire UKI IPC listeners.
 */
export function initUkiRendererBridge(): void {
  if (initialized) return;
  initialized = true;

  const dex = (window as any).dex;
  const ipc = (window as any).electron?.ipcRenderer || (window as any).ipcRenderer;
  if (!ipc) return;

  const store = useUkiStore;

  // State sync from main process
  ipc.on?.('uki:stateChanged', (_e: any, data: any) => {
    const state = typeof data === 'object' ? data?.state : data;
    const validStates: UkiUIState[] = ['dormant', 'idle', 'listening', 'processing', 'thinking', 'speaking', 'error'];
    if (typeof state === 'string' && validStates.includes(state as UkiUIState)) {
      store.getState().setState(state as UkiUIState);
    }
  });

  // Init status from main — report partial/missing modules
  ipc.on?.('uki:initStatus', (_e: any, data: any) => {
    if (!data || typeof data !== 'object') return;
    const { ready, partial, missing } = data as { ready?: boolean; partial?: boolean; missing?: string[] };
    if (partial && Array.isArray(missing) && missing.length > 0) {
      console.warn('[UKI] Partial init — missing modules:', missing.join(', '));
    }
    if (!ready) {
      store.getState().setError('UKI failed to initialize');
    }
  });

  // Response from main
  ipc.on?.('uki:response', (_e: any, data: any) => {
    const response = typeof data === 'object' ? data?.text : (typeof data === 'string' ? data : '');
    if (typeof response === 'string' && response.length < 10000) {
      store.getState().setResponse(response);
    }
  });

  // TTS speak request from main
  ipc.on?.('uki:tts:speak', (_e: any, text: unknown) => {
    if (typeof text !== 'string' || text.length > 5000) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      utterance.onend = () => {
        ipc.send?.('uki:tts:ended');
      };
      utterance.onerror = () => {
        ipc.send?.('uki:tts:ended');
      };
      window.speechSynthesis.speak(utterance);
    }
  });

  ipc.on?.('uki:tts:stop', () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  });

  // Start/stop renderer microphone capture for UKI ASR.
  ipc.on?.('uki:listeningStarted', () => {
    store.getState().startListening();
    startSpeechRecognition(ipc, dex);
  });

  ipc.on?.('uki:listeningStopped', () => {
    stopSpeechRecognition();
    store.getState().stopListening();
  });

  ipc.on?.('uki:transcript', (_e: any, payload: any) => {
    const text = typeof payload === 'object' ? payload?.text : payload;
    if (typeof text === 'string' && text.trim()) {
      store.getState().setTranscript(text.trim());
      store.getState().setPartialTranscript('');
    }
  });

  // Navigation commands from UKI
  ipc.on?.('uki:navigate', (_e: any, pageId: unknown) => {
    if (typeof pageId !== 'string' || pageId.length > 100) return;
    if (dex?.navigate) {
      dex.navigate(pageId);
    }
  });

  ipc.on?.('uki:navigate-back', () => {
    if (dex?.navigateBack) {
      dex.navigateBack();
    }
  });

  // App launch/close from UKI
  ipc.on?.('uki:launchApp', (_e: any, appId: unknown) => {
    if (typeof appId !== 'string' || appId.length > 100) return;
    if (dex?.launchApp) {
      dex.launchApp(appId);
    }
  });

  ipc.on?.('uki:closeApp', (_e: any, appId: unknown) => {
    if (typeof appId !== 'string' || appId.length > 100) return;
    if (dex?.closeApp) {
      dex.closeApp(appId);
    }
  });

  ipc.on?.('uki:closeAllApps', () => {
    if (dex?.closeAllApps) {
      dex.closeAllApps();
    }
  });

  // Media commands from UKI
  ipc.on?.('uki:media', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    if (dex?.media) {
      dex.media(c.action, c);
    }
  });

  // File commands from UKI
  ipc.on?.('uki:files', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; query?: string; name?: string; target?: string; from?: string; to?: string; source?: string; dest?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    const electron = (window as any).electron;
    const notify = (msg: string) => { try { dex?.toast?.error?.(msg); } catch { /* toast unavailable */ } };
    switch (c.action) {
      case 'search':
        if (typeof c.query === 'string' && c.query.length <= 200) {
          dex?.files?.search?.({ query: c.query }).catch(() => notify('File search failed'));
        }
        dex?.navigate?.('files');
        break;
      case 'create-folder':
        // Navigate to files so user can see result
        dex?.navigate?.('files');
        break;
      case 'delete':
        if (typeof c.target === 'string' && c.target.length <= 500) {
          dex?.files?.delete?.(c.target).catch(() => notify('File delete failed'));
        }
        break;
      case 'rename':
        if (typeof c.from === 'string' && typeof c.to === 'string') {
          dex?.files?.rename?.(c.from, c.to).catch(() => notify('File rename failed'));
        }
        break;
      case 'move':
        if (typeof c.source === 'string' && typeof c.dest === 'string') {
          dex?.files?.move?.(c.source, c.dest).catch(() => notify('File move failed'));
        }
        break;
      case 'sort-recent':
        dex?.navigate?.('files');
        break;
      default:
        dex?.navigate?.('files');
        break;
    }
  });

  // Creative commands from UKI
  ipc.on?.('uki:creative', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; app?: string; effect?: string; format?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;

    // Launch the target app if specified
    if (c.app && typeof c.app === 'string') {
      dex?.launchApp?.(c.app);
    }

    // Dispatch a custom DOM event that creative apps can listen for
    window.dispatchEvent(new CustomEvent('uki:creative-command', {
      detail: { action: c.action, app: c.app, effect: c.effect, format: c.format },
    }));

    // Also handle common keyboard-shortcut-style actions directly
    switch (c.action) {
      case 'new-project':
        if (typeof c.app === 'string') dex?.launchApp?.(c.app);
        break;
      case 'undo':
        document.execCommand('undo');
        break;
      case 'redo':
        document.execCommand('redo');
        break;
      case 'select-all': {
        const active = document.activeElement;
        if (active && 'select' in active && typeof (active as any).select === 'function') {
          (active as any).select();
        }
        break;
      }
      case 'save':
      case 'play':
      case 'stop':
      case 'export':
      case 'apply-effect':
      case 'zoom-in':
      case 'zoom-out':
        // Handled by creative apps via the uki:creative-command event
        break;
    }
  });

  // Knowledge/analytics commands from UKI
  ipc.on?.('uki:knowledge', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; period?: any; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    // Knowledge queries are informational -- UKI responds via TTS.
    // Navigate to relevant pages if helpful.
    switch (c.action) {
      case 'activity-query':
      case 'usage-stats':
        dex?.navigate?.('settings');
        break;
      case 'task-count':
        dex?.navigate?.('tasks');
        break;
      case 'favorite-app':
        // Informational -- response handled by TTS
        break;
    }
  });

  // Cross-app intelligence commands from UKI
  ipc.on?.('uki:cross-app', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { 
      action?: string; 
      appId?: string; 
      toolId?: string; 
      toolAction?: string;
      params?: Record<string, unknown>;
      apps?: string[];
      project?: string;
      file?: string;
      source?: string;
      target?: string;
      formats?: string[];
      [k: string]: any 
    };
    if (typeof c.action !== 'string' || c.action.length > 50) return;

    // Dispatch cross-app command event for apps to listen
    window.dispatchEvent(new CustomEvent('uki:cross-app-command', { detail: c }));

    switch (c.action) {
      case 'execute-tool':
        // Launch app and send tool command
        if (c.appId && typeof c.appId === 'string') {
          dex?.launchApp?.(c.appId);
          // Give app time to mount, then dispatch tool command
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('uki:tool-execute', {
              detail: { appId: c.appId, toolId: c.toolId, toolAction: c.toolAction, params: c.params },
            }));
          }, 300);
        }
        break;
      
      case 'suggest-workflow':
        // Display workflow suggestion UI
        if (c.apps && Array.isArray(c.apps)) {
          window.dispatchEvent(new CustomEvent('uki:workflow-suggestion', {
            detail: { apps: c.apps, project: c.project },
          }));
        }
        break;
      
      case 'open-file':
        // Open file in specified app
        if (c.appId && typeof c.appId === 'string') {
          dex?.launchApp?.(c.appId);
          if (c.file && typeof c.file === 'string') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('uki:open-file', {
                detail: { appId: c.appId, file: c.file },
              }));
            }, 300);
          }
        }
        break;
      
      case 'create-workflow':
        // Show workflow connection between apps
        window.dispatchEvent(new CustomEvent('uki:workflow-create', {
          detail: { source: c.source, target: c.target, formats: c.formats },
        }));
        break;
    }
  });

  // Automation commands from UKI
  ipc.on?.('uki:automation', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; name?: string; when?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    switch (c.action) {
      case 'run-workflow':
        dex?.navigate?.('workflows');
        break;
      case 'schedule':
        dex?.navigate?.('workflows');
        break;
    }
  });

  // System commands from UKI
  ipc.on?.('uki:system', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    const electron = (window as any).electron;
    switch (c.action) {
      case 'minimize':
        electron?.window?.minimize?.();
        break;
      case 'maximize':
        electron?.window?.maximize?.();
        break;
      case 'battery':
        // Informational -- response via TTS
        break;
      case 'screenshot':
      case 'lock':
        // Handled by main process directly
        break;
    }
  });

  // Settings commands from UKI
  ipc.on?.('uki:settings', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { action?: string; value?: string; [k: string]: any };
    if (typeof c.action !== 'string' || c.action.length > 50) return;
    switch (c.action) {
      case 'toggle-dark':
      case 'toggle-dock':
      case 'wallpaper':
        dex?.navigate?.('settings');
        break;
    }
  });

  // Create commands from UKI (notes, tasks, reminders, workflows)
  ipc.on?.('uki:create', (_e: any, cmd: unknown) => {
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
    const c = cmd as { type?: string; title?: string; text?: string; name?: string; [k: string]: any };
    if (typeof c.type !== 'string' || c.type.length > 50) return;
    switch (c.type) {
      case 'note':
        dex?.launchApp?.('notes');
        break;
      case 'task':
        dex?.navigate?.('tasks');
        break;
      case 'reminder':
        dex?.navigate?.('tasks');
        break;
      case 'workflow':
        dex?.navigate?.('workflows');
        break;
    }
  });

  // Conversation turn from main -- adds to conversation history for overlay display
  ipc.on?.('uki:turn', (_e: any, data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const d = data as { id?: string; userText?: string; response?: string; intent?: string; success?: boolean; timestamp?: number; data?: unknown };
    if (typeof d.id !== 'string' || typeof d.userText !== 'string' || typeof d.response !== 'string') return;
    store.getState().addConversationTurn({
      id: d.id,
      userText: d.userText.slice(0, 2000),
      response: d.response.slice(0, 5000),
      intent: typeof d.intent === 'string' ? d.intent : 'unknown',
      success: typeof d.success === 'boolean' ? d.success : true,
      timestamp: typeof d.timestamp === 'number' ? d.timestamp : Date.now(),
      data: d.data,
    });
  });

  // Live knowledge graph nodes from UKI for Nexus visualization
  ipc.on?.('uki:knowledge-update', (_e: any, data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const d = data as { nodes?: unknown[] };
    if (!Array.isArray(d.nodes)) return;
    const nodes = d.nodes.filter((n: any) =>
      n && typeof n.id === 'string' && typeof n.label === 'string' &&
      typeof n.weight === 'number' && typeof n.color === 'string'
    ).slice(0, 50).map((n: any) => ({
      id: String(n.id),
      label: String(n.label).slice(0, 60),
      weight: Number(n.weight),
      color: String(n.color),
      category: typeof n.category === 'string' ? n.category : 'unknown',
      timestamp: typeof n.timestamp === 'number' ? n.timestamp : Date.now(),
    }));
    pendingKnowledgeNodes = nodes;
    if (knowledgeUpdateTimer) clearTimeout(knowledgeUpdateTimer);
    knowledgeUpdateTimer = setTimeout(() => {
      knowledgeUpdateTimer = null;
      if (!pendingKnowledgeNodes) return;
      store.getState().setKnowledgeNodes(pendingKnowledgeNodes);
      pendingKnowledgeNodes = null;
    }, 80);
  });

  // Cleanup on window close — stop mic/speech before the page unloads
  window.addEventListener('beforeunload', () => {
    stopSpeechRecognition();
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
    if (knowledgeUpdateTimer) clearTimeout(knowledgeUpdateTimer);
    knowledgeUpdateTimer = null;
    pendingKnowledgeNodes = null;
    store.getState().reset();
  });
}
