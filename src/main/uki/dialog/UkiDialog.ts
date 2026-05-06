// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Dialog Manager
// Multi-turn dialog state, confirmations, clarifications
// ===========================================================================

import type { UkiIntent, UkiSession } from '../UkiEngine';

type DialogActionType = 'proceed' | 'clarify' | 'confirm';

interface DialogAction {
  type: DialogActionType;
  message: string;
}

// Actions that require confirmation before execution
const DESTRUCTIVE_ACTIONS = new Set([
  'file_ops:delete',
  'app_close:close-all',
  'system:restart',
  'system:lock',
]);

const MODERATE_ACTIONS = new Set([
  'file_ops:rename',
  'file_ops:move',
  'automation:run-workflow',
]);

class UkiDialogManager {
  private static _instance: UkiDialogManager;
  private pendingConfirmation: UkiIntent | null = null;
  private confirmDestructive = true;
  private lastContext: { category: string; action: string; entities: Record<string, unknown> } | null = null;

  static getInstance(): UkiDialogManager {
    if (!UkiDialogManager._instance) UkiDialogManager._instance = new UkiDialogManager();
    return UkiDialogManager._instance;
  }

  setConfirmDestructive(v: boolean): void { this.confirmDestructive = v; }

  evaluate(intent: UkiIntent, _session: UkiSession): DialogAction {
    const key = `${intent.category}:${intent.action}`;

    // Destructive actions always need confirmation
    if (this.confirmDestructive && DESTRUCTIVE_ACTIONS.has(key)) {
      const desc = this.describeAction(intent);
      return { type: 'confirm', message: `Are you sure you want to ${desc}?` };
    }

    // Moderate actions get confirmation only on first use
    if (this.confirmDestructive && MODERATE_ACTIONS.has(key)) {
      // If same action was just confirmed, skip re-confirming
      if (this.lastContext && this.lastContext.category === intent.category && this.lastContext.action === intent.action) {
        this.lastContext = { category: intent.category, action: intent.action, entities: intent.entities };
        return { type: 'proceed', message: '' };
      }
      this.lastContext = { category: intent.category, action: intent.action, entities: intent.entities };
    }

    // Handle web search prompts (no query provided)
    if (intent.category === 'web_search' && intent.action === 'web-search-prompt' && intent.entities.needsQuery) {
      return { type: 'clarify', message: 'What would you like me to search for?' };
    }

    // Low confidence → smart clarify with suggestions
    if (intent.confidence < 0.5) {
      // Try common corrections first
      const raw = intent.raw.toLowerCase();
      if (raw.includes('search') || raw.includes('look up') || raw.includes('find')) {
        return { type: 'clarify', message: 'What would you like me to search for? Try saying "search for [topic]" or "look up [query]".' };
      }
      if (raw.includes('open') || raw.includes('launch') || raw.includes('start')) {
        return { type: 'clarify', message: 'Which app would you like me to open? I can open Files, Browser, Notes, Settings, and more.' };
      }
      // Check session history for potential matches
      const turns = _session.turns || [];
      if (turns.length > 0) {
        const lastTurn = turns[turns.length - 1];
        const lastCat = lastTurn.intent?.split(':')[0];
        if (lastCat && lastCat !== 'conversation') {
          return { type: 'clarify', message: `Did you want to do something with ${lastCat}? You said "${intent.raw}".` };
        }
      }
      return { type: 'clarify', message: `I didn't catch that. Could you try again? You said "${intent.raw}".` };
    }

    // Track context for follow-ups
    this.lastContext = { category: intent.category, action: intent.action, entities: intent.entities };

    return { type: 'proceed', message: '' };
  }

  setPendingConfirmation(intent: UkiIntent): void {
    this.pendingConfirmation = intent;
  }

  getPendingConfirmation(): UkiIntent | null {
    return this.pendingConfirmation;
  }

  clearPendingConfirmation(): void {
    this.pendingConfirmation = null;
  }

  private describeAction(intent: UkiIntent): string {
    switch (`${intent.category}:${intent.action}`) {
      case 'file_ops:delete': return `delete ${intent.entities.target || 'that item'}`;
      case 'app_close:close-all': return 'close all running apps';
      case 'system:restart': return 'restart DEX';
      case 'system:lock': return 'lock the screen';
      case 'file_ops:rename': return `rename ${intent.entities.from || 'that file'}`;
      case 'file_ops:move': return `${intent.entities.op || 'move'} the file`;
      case 'automation:run-workflow': return `run the workflow "${intent.entities.name || ''}"`;
      default: return intent.raw;
    }
  }
}

export const UkiDialog = UkiDialogManager;
