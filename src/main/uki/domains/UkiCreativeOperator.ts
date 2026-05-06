// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UKI Creative Operator (Track A3)
// ---------------------------------------------------------------------------
// Maps UkiCopilot SuggestedAction objects to per-app IPC channels and
// dispatches them with a confidence gate, a per-app whitelist of action
// types, and an audit trail for undo. No filesystem / IPC at module load
// time -- the dispatcher is a pure function that takes an `invoker`.
// ===========================================================================

export type CreativeAppId = 'imosion' | 'vinx' | 'prism' | 'flux' | 'forge' | 'axl';

export type CreativeActionType =
  | 'apply-effect'
  | 'transform'
  | 'generate'
  | 'edit-code'
  | 'create-file'
  | 'refactor'
  | 'navigate'
  | 'run-command';

export interface CreativeAction {
  appId: CreativeAppId;
  type: CreativeActionType;
  /** Confidence the originating model has in this action 0..1. */
  confidence: number;
  /** Free-form payload, sent verbatim to the IPC handler. */
  payload: Record<string, unknown>;
  /** Optional human-readable label for UI / undo. */
  label?: string;
}

export interface OperatorOptions {
  /** Required confidence floor. Default 0.65. */
  minConfidence?: number;
  /** Override the default per-app whitelist. */
  whitelist?: Record<CreativeAppId, Partial<Record<CreativeActionType, string>>>;
  /** Override the audit log size. Default 100. */
  auditSize?: number;
}

export interface DispatchResult {
  ok: boolean;
  /** Generated id used to look up audit/undo. */
  actionId: string;
  /** When ok=false, why we declined. */
  reason?: string;
  /** When ok=true, the IPC channel actually invoked. */
  channel?: string;
}

export interface AuditEntry extends DispatchResult {
  action: CreativeAction;
  timestamp: number;
}

export type Invoker = (channel: string, payload: Record<string, unknown>) => Promise<unknown> | unknown;

// ---------------------------------------------------------------------------
// Default per-app whitelist. Each entry maps an action type to the IPC channel
// that should service it. Anything not in this table is rejected.
// ---------------------------------------------------------------------------

const DEFAULT_WHITELIST: Record<CreativeAppId, Partial<Record<CreativeActionType, string>>> = {
  imosion: {
    'apply-effect': 'imosion:applyEffect',
    'generate': 'imosion:generateMidi',
    'transform': 'imosion:transformAudio',
  },
  vinx: {
    'apply-effect': 'vinx:applyEdit',
    'transform': 'vinx:transformClip',
    'generate': 'vinx:generateScene',
  },
  prism: {
    'apply-effect': 'prism:applyPreset',
    'transform': 'prism:transformImage',
    'generate': 'prism:generateImage',
  },
  flux: {
    'transform': 'flux:transform',
    'apply-effect': 'flux:applyEffect',
  },
  forge: {
    'generate': 'forge:generate',
    'transform': 'forge:transform',
  },
  axl: {
    'generate': 'axl:generatePart',
    'transform': 'axl:transformPart',
  },
};

export class UkiCreativeOperator {
  private minConfidence: number;
  private whitelist: Record<CreativeAppId, Partial<Record<CreativeActionType, string>>>;
  private audit: AuditEntry[] = [];
  private auditSize: number;
  private counter = 0;

  constructor(options: OperatorOptions = {}) {
    this.minConfidence = options.minConfidence ?? 0.65;
    this.whitelist = options.whitelist ?? DEFAULT_WHITELIST;
    this.auditSize = options.auditSize ?? 100;
  }

  /**
   * Validate and dispatch a creative action. The `invoker` is the actual
   * IPC bridge (e.g. `ipcMain.emit` wrapper, or a direct function in tests).
   */
  async dispatch(action: CreativeAction, invoker: Invoker): Promise<DispatchResult> {
    const actionId = `act-${Date.now()}-${this.counter++}`;
    const reject = (reason: string): DispatchResult => {
      const res: DispatchResult = { ok: false, actionId, reason };
      this.recordAudit(action, res);
      return res;
    };

    if (!action || typeof action !== 'object') return reject('invalid-action');
    if (!isCreativeAppId(action.appId)) return reject(`unsupported-app:${action.appId}`);
    if (!isCreativeActionType(action.type)) return reject(`unsupported-type:${action.type}`);
    if (typeof action.confidence !== 'number' || action.confidence < this.minConfidence) {
      return reject(`low-confidence:${action.confidence}`);
    }
    if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
      return reject('invalid-payload');
    }

    const channel = this.whitelist[action.appId]?.[action.type];
    if (!channel) return reject('not-whitelisted');

    try {
      await Promise.resolve(invoker(channel, action.payload));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'invoker-error';
      return reject(`invoker-failed:${reason}`);
    }

    const res: DispatchResult = { ok: true, actionId, channel };
    this.recordAudit(action, res);
    return res;
  }

  /** Recent audit entries, newest first. */
  getAudit(limit = 20): AuditEntry[] {
    return this.audit.slice(-limit).reverse();
  }

  /** Locate an audit entry by id (for undo lookups). */
  findAudit(actionId: string): AuditEntry | undefined {
    return this.audit.find(a => a.actionId === actionId);
  }

  // ---- Internals --------------------------------------------------------

  private recordAudit(action: CreativeAction, result: DispatchResult): void {
    this.audit.push({ ...result, action, timestamp: Date.now() });
    if (this.audit.length > this.auditSize) {
      this.audit.splice(0, this.audit.length - this.auditSize);
    }
  }
}

function isCreativeAppId(v: unknown): v is CreativeAppId {
  return v === 'imosion' || v === 'vinx' || v === 'prism' || v === 'flux' || v === 'forge' || v === 'axl';
}

function isCreativeActionType(v: unknown): v is CreativeActionType {
  return v === 'apply-effect' || v === 'transform' || v === 'generate'
    || v === 'edit-code' || v === 'create-file' || v === 'refactor'
    || v === 'navigate' || v === 'run-command';
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: UkiCreativeOperator | null = null;

export function getUkiCreativeOperator(): UkiCreativeOperator {
  if (!_instance) _instance = new UkiCreativeOperator();
  return _instance;
}

export function _resetUkiCreativeOperator(): void {
  _instance = null;
}
