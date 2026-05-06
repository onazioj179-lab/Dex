// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX UKI Action Handlers
 * -----------------------------------------------------------------------------
 * Registers the first batch of ActionBus handlers covering everyday system
 * control + utilities. Each handler is small, browser-API based, and either
 * fully reversible or surfaces 'destructive' so the approval gate kicks in.
 *
 * Wave 1 batch (15 actions):
 *   clipboard.copy           safe         payload: { text }
 *   clipboard.read           safe         returns: string
 *   notification.show        safe         payload: { title, body }
 *   timer.start              safe         payload: { ms, label }
 *   timer.stop               safe         payload: { id }
 *   ui.openLink              reversible   payload: { url }
 *   text.summarize           safe         payload: { text }   -> first sentence + length stat (local heuristic)
 *   text.wordCount           safe         payload: { text }
 *   text.translate           safe         payload: { text, to } -> stub: tags target lang
 *   shell.toast              safe         payload: { message, severity? }
 *   media.muteToggle         safe         (best-effort via Web Audio focus)
 *   focus.toggle             safe         (toggles document.body.classList 'dex-focus')
 *   screenshot.capture       reversible   uses preload bridge if available
 *   workspace.snapshot       reversible   collects ContextBus replay state
 *   ambient.dismiss          safe         emits ContextBus 'ambient:hint' clear
 */

// DEX v3.8.0 - UKI Action Handlers

import ActionBus from './ActionBus';
import ContextBus from './ContextBus';

interface DexBridge {
  clipboard?: { writeText?: (t: string) => Promise<void> | void; readText?: () => Promise<string> | string };
  notifications?: { show?: (title: string, body: string) => Promise<void> | void };
  shell?: { openExternal?: (url: string) => Promise<void> | void };
  screenshot?: { capture?: () => Promise<string | null> };
}

function bridge(): DexBridge {
  if (typeof window === 'undefined') return {};
  const w = window as unknown as { dex?: DexBridge; dexBridge?: DexBridge };
  return w.dex || w.dexBridge || {};
}

const activeTimers = new Map<string, { handle: ReturnType<typeof setTimeout>; label: string }>();

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

let registered = false;

export function registerUkiActionHandlers(): () => void {
  if (registered) return () => undefined;
  registered = true;
  const offs: Array<() => void> = [];

  offs.push(ActionBus.register('clipboard.copy', async (p) => {
    const text = asString(p?.text);
    const b = bridge();
    if (b.clipboard?.writeText) await b.clipboard.writeText(text);
    else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('clipboard unavailable');
    ContextBus.emit('clipboard:updated', { kind: 'text', size: text.length });
    return { length: text.length };
  }));

  offs.push(ActionBus.register('clipboard.read', async () => {
    const b = bridge();
    if (b.clipboard?.readText) return await b.clipboard.readText();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) return await navigator.clipboard.readText();
    throw new Error('clipboard unavailable');
  }));

  offs.push(ActionBus.register('notification.show', async (p) => {
    const title = asString(p?.title, 'DEX');
    const body = asString(p?.body);
    const b = bridge();
    if (b.notifications?.show) { await b.notifications.show(title, body); return { delivered: 'bridge' }; }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      // eslint-disable-next-line no-new
      new Notification(title, { body });
      return { delivered: 'web' };
    }
    return { delivered: 'fallback' };
  }));

  offs.push(ActionBus.register('timer.start', (p) => {
    const ms = Math.max(100, asNumber(p?.ms, 60_000));
    const label = asString(p?.label, 'Timer');
    const id = genId();
    const handle = setTimeout(() => {
      activeTimers.delete(id);
      ContextBus.emit('ambient:hint', { id: `timer:${id}`, text: `${label} done`, severity: 'info' });
    }, ms);
    activeTimers.set(id, { handle, label });
    return { id, ms, label };
  }));

  offs.push(ActionBus.register('timer.stop', (p) => {
    const id = asString(p?.id);
    const t = activeTimers.get(id);
    if (!t) return { stopped: false };
    clearTimeout(t.handle);
    activeTimers.delete(id);
    return { stopped: true };
  }));

  offs.push(ActionBus.register('ui.openLink', async (p) => {
    const url = asString(p?.url);
    if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) urls allowed');
    const b = bridge();
    if (b.shell?.openExternal) { await b.shell.openExternal(url); return { opened: 'shell' }; }
    if (typeof window !== 'undefined') { window.open(url, '_blank', 'noopener'); return { opened: 'window' }; }
    throw new Error('no shell available');
  }));

  offs.push(ActionBus.register('text.summarize', (p) => {
    const text = asString(p?.text).trim();
    if (!text) return { summary: '', wordCount: 0 };
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => s.length > 0) || text.slice(0, 140);
    const words = text.split(/\s+/).filter(Boolean);
    return { summary: sentence.trim(), wordCount: words.length, charCount: text.length };
  }));

  offs.push(ActionBus.register('text.wordCount', (p) => {
    const text = asString(p?.text);
    const words = text.split(/\s+/).filter(Boolean);
    const lines = text.split(/\r?\n/);
    return { words: words.length, chars: text.length, lines: lines.length };
  }));

  offs.push(ActionBus.register('text.translate', (p) => {
    const text = asString(p?.text);
    const to = asString(p?.to, 'en');
    return { translated: text, sourceLang: 'auto', targetLang: to, note: 'INTENTIONAL STUB: local translation model not bundled; passthrough.' };
  }));

  offs.push(ActionBus.register('shell.toast', (p) => {
    const message = asString(p?.message);
    const severity = (asString(p?.severity, 'info') as 'info' | 'warn');
    ContextBus.emit('ambient:hint', { id: `toast:${genId()}`, text: message, severity });
    return { shown: true };
  }));

  offs.push(ActionBus.register('focus.toggle', () => {
    if (typeof document === 'undefined') return { active: false };
    const cls = 'dex-focus';
    const active = document.body.classList.toggle(cls);
    return { active };
  }));

  offs.push(ActionBus.register('media.muteToggle', () => {
    if (typeof document === 'undefined') return { muted: false };
    const elements = Array.from(document.querySelectorAll('audio, video')) as Array<HTMLMediaElement>;
    if (elements.length === 0) return { muted: false, count: 0 };
    const willMute = elements.some((el) => !el.muted);
    elements.forEach((el) => { el.muted = willMute; });
    return { muted: willMute, count: elements.length };
  }));

  offs.push(ActionBus.register('screenshot.capture', async () => {
    const b = bridge();
    if (b.screenshot?.capture) {
      const path = await b.screenshot.capture();
      return { path: path || null };
    }
    return { path: null, note: 'INTENTIONAL FALLBACK: no screenshot bridge in this build' };
  }));

  offs.push(ActionBus.register('workspace.snapshot', () => {
    const events = ContextBus.replay();
    return { events: events.length, takenAt: Date.now() };
  }));

  offs.push(ActionBus.register('ambient.dismiss', (p) => {
    const id = asString(p?.id);
    ContextBus.emit('ambient:hint', { id, text: '', severity: 'info' });
    return { dismissed: id };
  }));

  return () => {
    registered = false;
    offs.forEach((off) => off());
    activeTimers.forEach((t) => clearTimeout(t.handle));
    activeTimers.clear();
  };
}

export const _ukiHandlersInternals = { activeTimers };
