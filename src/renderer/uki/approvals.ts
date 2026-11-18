// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The approval queue behind UKI's in-app approval sheet (UkiApprovalHost).
// One request is shown at a time; the rest wait in order. When no host is
// mounted (tests, a page without the shell) requests fall back to the
// browser's confirm(), and with no confirm at all they are denied.

import type { XackClass, XackRemember } from './xack';

export interface ApprovalRequest {
  /** "UKI wants to …" headline, e.g. "run a command". */
  title: string;
  /** The exact thing that will happen (a command, an action description). */
  subject: string;
  /** Monospace subject (commands). */
  code?: boolean;
  /** Labelled facts shown under the subject (Folder, App, Arguments …). */
  facts?: { label: string; value: string }[];
  /** Xack's class for the request. */
  cls?: XackClass | null;
  /** Why it asks, in plain words. */
  reason?: string;
  /** Session-remember choices this request supports. */
  remember?: Exclude<XackRemember, 'once'>[];
}

export interface ApprovalAnswer {
  allow: boolean;
  remember: XackRemember;
}

type Pending = { req: ApprovalRequest; resolve: (a: ApprovalAnswer) => void };

const queue: Pending[] = [];
const listeners = new Set<() => void>();
let hosts = 0;

function emit(): void {
  for (const l of listeners) {
    try { l(); } catch { /* listener errors never block approvals */ }
  }
}

/** The request on screen now (first in the queue), if any. */
export function currentApproval(): ApprovalRequest | null {
  return queue[0]?.req ?? null;
}

export function pendingApprovalCount(): number {
  return queue.length;
}

export function subscribeApprovals(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The host announces itself so requests use the sheet instead of confirm(). */
export function registerApprovalHost(): () => void {
  hosts += 1;
  return () => {
    hosts = Math.max(0, hosts - 1);
    // Nothing can answer what is still queued: deny it rather than hang.
    if (hosts === 0) while (queue.length) queue.shift()!.resolve({ allow: false, remember: 'once' });
    emit();
  };
}

/** Answer the request on screen. */
export function answerApproval(answer: ApprovalAnswer): void {
  const p = queue.shift();
  if (p) p.resolve(answer);
  emit();
}

function fallbackConfirm(req: ApprovalRequest): ApprovalAnswer {
  try {
    const facts = (req.facts ?? []).map((f) => `${f.label}: ${f.value}`).join('\n');
    const ok = window.confirm(`UKI wants to ${req.title}.\n\n${req.subject}${facts ? `\n\n${facts}` : ''}${req.reason ? `\n\n(${req.reason})` : ''}\n\nAllow?`);
    return { allow: !!ok, remember: 'once' };
  } catch {
    return { allow: false, remember: 'once' };
  }
}

/** Ask the user. Resolves when they answer (or deny when nothing can ask). */
export function requestApproval(req: ApprovalRequest): Promise<ApprovalAnswer> {
  if (hosts === 0) return Promise.resolve(fallbackConfirm(req));
  return new Promise<ApprovalAnswer>((resolve) => {
    queue.push({ req, resolve });
    emit();
  });
}
