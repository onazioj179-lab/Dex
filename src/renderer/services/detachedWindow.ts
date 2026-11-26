/**
 * ===========================================================================
 * DEX -- Detached-window boot (Tauri multi-window)
 * ===========================================================================
 *
 * When the native multi-window manager (`multiwindow:detach`) spawns a real OS
 * window, it loads this same renderer bundle with `?detached=<appId>`. This
 * module detects that, puts the shell into "single-app" mode for that window,
 * and auto-opens the requested app maximized.
 *
 * Design: the detached window still boots the FULL `<App />` shell (so every
 * store / provider / app component works exactly as it does in the main window
 * -- no risky standalone-render path). We simply (a) suppress the desktop chrome
 * that doesn't belong in a single-app window (the floating launcher, dock, and
 * launchpad) via a scoped stylesheet, and (b) dispatch the existing
 * `dex-open-app` event so AppManager brings that app to the foreground. The
 * dispatch is retried a few times because AppManager registers its listener in
 * a mount effect that may run after this module.
 *
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    DEX Software License Agreement v1.0 (proprietary)
 * ===========================================================================
 */

/** The appId this window was detached for, or null in the normal main window. */
export function detachedAppId(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('detached');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/** True when this renderer is running inside a detached single-app window. */
export function isDetachedWindow(): boolean {
  return detachedAppId() !== null;
}

/**
 * Initialise detached-window mode. No-op in the normal main window. Safe to call
 * unconditionally at boot (before React mounts).
 */
export function initDetachedWindow(): void {
  const appId = detachedAppId();
  if (!appId) return;

  const root = document.documentElement;
  root.setAttribute('data-detached-app', appId);

  // Hide desktop chrome that has no place in a single-app window. Scoped to the
  // detached attribute so the main window is untouched. Uses the same stable
  // markers AppManager already relies on (FloatingLauncher `data-dex-nook`,
  // `.dex-dock`, `.dex-launchpad`/`[data-dex-launchpad]`).
  const style = document.createElement('style');
  style.id = 'dex-detached-chrome';
  style.textContent = `
    html[data-detached-app] [data-dex-nook],
    html[data-detached-app] .dex-dock,
    html[data-detached-app] .dex-launchpad,
    html[data-detached-app] [data-dex-launchpad] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  // Bring the target app to the foreground once the shell is listening. Retried
  // across the first few seconds since AppManager binds `dex-open-app` in a
  // mount effect; re-dispatching the same id is idempotent (AppManager debounces
  // and re-selecting an already-open app is a no-op).
  const open = () => {
    try {
      // AppManager's `dex-open-app` handler requires an OBJECT detail
      // (resolveRequestedAppId rejects bare strings), so pass `{ id }`.
      window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { id: appId } }));
    } catch {
      /* CustomEvent unavailable -- non-fatal */
    }
  };
  const delays = [0, 300, 800, 1500, 2500];
  const fire = () => delays.forEach((d) => window.setTimeout(open, d));
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fire();
  } else {
    window.addEventListener('DOMContentLoaded', fire, { once: true });
  }
}
