// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * One standard path for "operation result" feedback.
 *
 * Across the apps, success/error feedback is fired ad hoc as
 * `window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }))`.
 * That contract stays (DexToastContainer consumes it), but these helpers remove
 * the boilerplate and give one consistent place for "copied", "sent to Notes",
 * "saved", "failed" toasts — including a wrapper that reports the outcome of an
 * async action automatically.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

/** Fire the canonical dex-toast event. Never throws. */
export function fireToast(type: ToastKind, message: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* UI feedback must never throw */
  }
}

export const reportOk = (message: string): void => fireToast('success', message);
export const reportError = (message: string): void => fireToast('error', message);
export const reportWarn = (message: string): void => fireToast('warning', message);
export const reportInfo = (message: string): void => fireToast('info', message);

/** Report success or failure from a boolean outcome. */
export function toastResult(ok: boolean, okMessage: string, errMessage = 'Something went wrong'): void {
  fireToast(ok ? 'success' : 'error', ok ? okMessage : errMessage);
}

/** Copy text to the clipboard and toast the standard "copied" result. */
export async function copyWithToast(text: string, label = 'Copied to clipboard'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    reportOk(label);
    return true;
  } catch {
    reportError('Could not copy to clipboard');
    return false;
  }
}

/**
 * Run an async action and report its outcome with a single standard toast.
 * Returns the resolved value, or null if it threw (the error toast already fired).
 */
export async function withToast<T>(
  action: () => Promise<T>,
  okMessage: string,
  errMessage = 'Action failed',
): Promise<T | null> {
  try {
    const result = await action();
    reportOk(okMessage);
    return result;
  } catch {
    reportError(errMessage);
    return null;
  }
}
