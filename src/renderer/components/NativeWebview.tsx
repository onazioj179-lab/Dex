// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// A drop-in for Electron's <webview> under Tauri. WebView2 has no <webview>
// tag, so the Browser rendered blank. This renders a placeholder <div>, asks
// the native side (src-tauri/src/browser_view.rs) for a real child webview over
// it, and gives the <div> the subset of the <webview> API the Browser uses
// (loadURL, reload, executeJavaScript, setZoomFactor, findInPage, events).
//
// Native views always paint above the DOM, so the view is hidden whenever the
// placeholder is not actually visible: tab inactive, window hidden, scrolled
// away, or covered by another DEX window or menu (hit-tested with
// elementFromPoint, which only sees the DOM, i.e. the placeholder).
//
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

type Invoke = (channel: string, ...args: unknown[]) => Promise<any>;
const invoke: Invoke = (channel, ...args) =>
  (window as any).dex?.invoke?.(channel, ...args) ?? Promise.resolve(null);

export interface ViewRect { x: number; y: number; w: number; h: number }

/** Points to hit-test: centre plus four points inset from the corners, clipped to the viewport. */
export function probePoints(r: DOMRectReadOnly | ViewRect, vw: number, vh: number): Array<[number, number]> {
  const x = 'left' in r ? r.left : r.x;
  const y = 'top' in r ? r.top : r.y;
  const w = 'width' in r ? r.width : r.w;
  const h = 'height' in r ? r.height : r.h;
  const inset = Math.min(12, w / 4, h / 4);
  const pts: Array<[number, number]> = [
    [x + w / 2, y + h / 2],
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + h - inset],
    [x + w - inset, y + h - inset],
  ];
  return pts.filter(([px, py]) => px >= 0 && py >= 0 && px < vw && py < vh);
}

/** True when the expression parses on its own (so its value can be returned). */
export function isExpression(js: string): boolean {
  try {
    // Parse only; never called. DEX's own renderer has no CSP that forbids this.
    // eslint-disable-next-line no-new-func
    new Function(`return (${js}\n);`);
    return true;
  } catch {
    return false;
  }
}

// --- One event subscription and one stale-view sweep per page load ----------

type Host = HTMLDivElement & { __dexEmit?: (type: string, data?: Record<string, unknown>) => void };
const hosts = new Map<string, Host>();
let subscribed = false;
let sweep: Promise<unknown> | null = null;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  (window as any).dex?.on?.('browser-view', (p: { id?: string; type?: string; state?: string; url?: string; title?: string }) => {
    const host = p?.id ? hosts.get(p.id) : undefined;
    if (!host?.__dexEmit) return;
    if (p.type === 'load' && p.state === 'started') {
      host.__dexEmit('did-start-loading', { url: p.url });
    } else if (p.type === 'load' && p.state === 'finished') {
      host.__dexEmit('did-navigate', { url: p.url });
      host.__dexEmit('dom-ready');
      host.__dexEmit('did-finish-load');
      host.__dexEmit('did-stop-loading');
    } else if (p.type === 'title') {
      host.__dexEmit('page-title-updated', { title: p.title });
    } else if (p.type === 'new-window') {
      host.__dexEmit('new-window', { url: p.url });
    }
  });
}

/** Close views left over from before a reload of this window (they outlive it). */
function sweepStale(): Promise<unknown> {
  if (!sweep) sweep = invoke('browserView:closeAll').catch(() => null);
  return sweep;
}

interface Props {
  tabId: string;
  src: string;
  /** False for background tabs and while an error overlay covers the page. */
  active: boolean;
  style?: React.CSSProperties;
}

export const NativeWebview = forwardRef<HTMLDivElement, Props>(function NativeWebview({ tabId, src, active, style }, ref) {
  const elRef = useRef<Host | null>(null);
  const created = useRef(false);
  const lastSrc = useRef<string>('');
  const shown = useRef(false);
  const lastRect = useRef('');
  const state = useRef({ url: '', title: '', loading: false, userZoom: 1, appliedZoom: 1 });
  const activeRef = useRef(active);
  activeRef.current = active;

  useImperativeHandle(ref, () => elRef.current as HTMLDivElement, []);

  // Measure, hit-test and push bounds/visibility to the native view.
  const sync = useCallback(() => {
    const el = elRef.current;
    if (!el || !created.current) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let visible = activeRef.current && !document.hidden && r.width > 2 && r.height > 2
      && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
    if (visible) {
      for (const [px, py] of probePoints(r, vw, vh)) {
        const hit = document.elementFromPoint(px, py);
        if (!hit || (hit !== el && !el.contains(hit))) { visible = false; break; }
      }
    }
    if (visible) {
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key !== lastRect.current) {
        lastRect.current = key;
        void invoke('browserView:setBounds', tabId, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      }
      // Follow the spatial desktop's zoom so the page scales with its window.
      const worldScale = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
      const zoom = Math.round(state.current.userZoom * worldScale * 100) / 100;
      if (Math.abs(zoom - state.current.appliedZoom) > 0.01) {
        state.current.appliedZoom = zoom;
        void invoke('browserView:zoom', tabId, zoom);
      }
    }
    if (visible !== shown.current) {
      shown.current = visible;
      void invoke(visible ? 'browserView:show' : 'browserView:hide', tabId);
    }
  }, [tabId]);

  // Expose the <webview> subset on the element and create the native view.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    ensureSubscribed();
    hosts.set(tabId, el);
    const s = state.current;

    el.__dexEmit = (type, data) => {
      if (type === 'did-start-loading') { s.loading = true; if (typeof data?.url === 'string') s.url = data.url; }
      if (type === 'did-navigate' && typeof data?.url === 'string') s.url = data.url;
      if (type === 'did-stop-loading') s.loading = false;
      if (type === 'page-title-updated' && typeof data?.title === 'string') s.title = data.title;
      el.dispatchEvent(Object.assign(new Event(type), data ?? {}));
    };
    const api = {
      loadURL: (url: string) => { lastSrc.current = url; return invoke('browserView:navigate', tabId, url); },
      reload: () => invoke('browserView:reload', tabId),
      goBack: () => invoke('browserView:back', tabId),
      goForward: () => invoke('browserView:forward', tabId),
      stop: () => invoke('browserView:stop', tabId),
      // Native history depth is not exposed; the Browser keeps its own nav stack.
      canGoBack: () => true,
      canGoForward: () => true,
      isLoading: () => s.loading,
      getURL: () => s.url,
      getTitle: () => s.title,
      setZoomFactor: (f: number) => {
        s.userZoom = f;
        s.appliedZoom = -1; // force sync to re-apply with the world scale
        sync();
      },
      executeJavaScript: async (js: string) => {
        if (!isExpression(js)) {
          await invoke('browserView:eval', tabId, js);
          return undefined;
        }
        const res = await invoke('browserView:evalResult', tabId, js);
        if (!res?.success) throw new Error(res?.error || 'script failed');
        const value = typeof res.result === 'string' ? JSON.parse(res.result) : null;
        if (value && typeof value === 'object' && '__dexEvalError' in value) throw new Error(String(value.__dexEvalError));
        return value;
      },
      findInPage: async (text: string, opts?: { forward?: boolean }) => {
        const q = JSON.stringify(String(text));
        const back = opts?.forward === false;
        const res = await api.executeJavaScript(`(function(){var q=${q};var t=(document.body&&document.body.innerText||'').toLowerCase();var n=0,i=0,l=q.toLowerCase();if(l){while((i=t.indexOf(l,i))!==-1){n++;i+=l.length;}}window.find(q,false,${back},true);return {matches:n,activeMatchOrdinal:n?1:0};})()`);
        return res;
      },
      stopFindInPage: () => invoke('browserView:eval', tabId, 'window.getSelection&&window.getSelection().removeAllRanges()'),
      focusView: () => invoke('browserView:focus', tabId),
    };
    Object.assign(el, api);

    let cancelled = false;
    const r = el.getBoundingClientRect();
    const initial = src || 'about:blank';
    lastSrc.current = initial;
    if (/^https?:/i.test(initial)) {
      void sweepStale().then(() => {
        if (cancelled) return;
        return invoke('browserView:create', tabId, initial, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) || 1, h: Math.round(r.height) || 1 }, false);
      }).then((res: any) => {
        if (cancelled) return;
        if (res?.success) { created.current = true; shown.current = false; lastRect.current = ''; sync(); }
        else el.__dexEmit?.('did-fail-load', { errorCode: -1, errorDescription: res?.error || 'Could not open the page' });
      });
    }

    return () => {
      cancelled = true;
      hosts.delete(tabId);
      if (created.current) void invoke('browserView:close', tabId);
      created.current = false;
    };
    // The view is created once per tab; later src changes navigate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // New URL from the Browser (typed address, bookmark) -> navigate or create.
  useEffect(() => {
    const el = elRef.current as any;
    if (!el || !src || src === lastSrc.current) return;
    lastSrc.current = src;
    if (created.current) { void invoke('browserView:navigate', tabId, src); return; }
    if (!/^https?:/i.test(src)) return;
    const r = el.getBoundingClientRect();
    void sweepStale()
      .then(() => invoke('browserView:create', tabId, src, { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) || 1, h: Math.round(r.height) || 1 }, false))
      .then((res: any) => { if (res?.success) { created.current = true; shown.current = false; lastRect.current = ''; sync(); } });
  }, [src, tabId, sync]);

  // Keep the native view glued to the placeholder. Cheap checks on a slow
  // timer; every frame only while a pointer is down (window drags, resizes).
  useEffect(() => {
    sync();
    const el = elRef.current;
    let raf = 0;
    let dragging = false;
    const frame = () => { sync(); if (dragging) raf = requestAnimationFrame(frame); };
    const down = () => { if (!dragging) { dragging = true; raf = requestAnimationFrame(frame); } };
    const up = () => { dragging = false; cancelAnimationFrame(raf); sync(); };
    const timer = window.setInterval(sync, 250);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [sync]);

  useEffect(() => { sync(); }, [active, sync]);

  return (
    <div
      ref={elRef}
      data-native-webview={tabId}
      style={{ background: 'var(--color-bg-base)', ...style }}
    />
  );
});

export default NativeWebview;
