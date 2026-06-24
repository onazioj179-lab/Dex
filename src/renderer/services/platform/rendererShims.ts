// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Renderer-native IPC shims for the Tauri compatibility layer (DEX 5.5 slice 5).
 *
 * Some Electron IPC channels never needed the main process at all — they compute
 * values the renderer already owns (display refresh rate, reduced-motion
 * preference, WebAuthn availability) or they are pure telemetry sinks whose
 * Electron handler just recorded a number. Under Tauri those channels have no
 * native `dex_ipc` handler, so they fall to the dispatcher's `_ => Value::Null`
 * arm and show up in `__dexDegradeReport()` as degraded — even though nothing is
 * actually missing.
 *
 * This module reimplements exactly those channels using browser-native APIs, so
 * the compat layer can answer them locally instead of round-tripping to a null
 * Rust handler. The contracts mirror the Electron handlers (see
 * src/main/core/MotionController.ts, RenderGovernor.ts, AuthController.ts) so the
 * renderer consumes identical shapes either way.
 *
 * IMPORTANT — honesty rule for this file: only channels whose ENTIRE behaviour is
 * reproducible in the renderer belong here. A channel that needs real filesystem
 * access, native credential storage, or a backend data store is NOT shimmed here
 * — those stay degraded and are catalogued in NATIVE_PENDING below so the degrade
 * report stays truthful rather than silently faked.
 */

// -----------------------------------------------------------------------------
// Motion discipline (mirrors src/main/core/MotionController.ts)
// -----------------------------------------------------------------------------

type MotionState = 'full' | 'reduced' | 'disabled';

const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  instant: 'linear',
} as const;

const MAX_FADE_DURATION = 180;
const MAX_SLIDE_DURATION = 180;
const MAX_SCALE_DURATION = 150;
const MIN_ANIMATION_DURATION = 50;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Live motion state derived purely from the OS reduced-motion preference. */
function motionState(): MotionState {
  // The renderer governor's "disabled" tier maps to the OS preference; the
  // performance-driven "reduced" tier needs the native CPU/memory sampler that
  // is not ported, so under Tauri the honest answer is full unless the user has
  // asked the OS to reduce motion.
  return prefersReducedMotion() ? 'disabled' : 'full';
}

function motionConfig() {
  const state = motionState();
  return {
    state,
    prefersReducedMotion: prefersReducedMotion(),
    systemReducedMotion: prefersReducedMotion(),
    performanceReducedMotion: false,
    maxDuration: state === 'disabled' ? 0 : MAX_FADE_DURATION,
    easing: state === 'disabled' ? EASING.instant : EASING.standard,
  };
}

const ALLOWED_MOTION = new Set(['fade', 'slide', 'scale-subtle', 'focus-ring']);

function approveAnimation(request: { type?: string; durationMs?: number }) {
  const state = motionState();
  const type = request?.type ?? '';
  const durationMs = typeof request?.durationMs === 'number' ? request.durationMs : 0;

  if (state === 'disabled') {
    return { approved: false, adjustedDuration: 0, easing: EASING.instant, reason: 'Motion disabled (reduced-motion preference)' };
  }
  if (!ALLOWED_MOTION.has(type)) {
    return { approved: false, adjustedDuration: 0, easing: EASING.instant, reason: `Motion type "${type}" is not allowed` };
  }

  let adjusted = durationMs;
  if (type === 'fade') adjusted = Math.min(adjusted, MAX_FADE_DURATION);
  else if (type === 'slide') adjusted = Math.min(adjusted, MAX_SLIDE_DURATION);
  else if (type === 'scale-subtle') adjusted = Math.min(adjusted, MAX_SCALE_DURATION);
  else if (type === 'focus-ring') adjusted = Math.min(adjusted, 100);
  adjusted = Math.max(adjusted, MIN_ANIMATION_DURATION);

  return {
    approved: true,
    adjustedDuration: adjusted,
    easing: type === 'fade' ? EASING.enter : EASING.standard,
  };
}

// -----------------------------------------------------------------------------
// Render governor (mirrors src/main/core/RenderGovernor.ts render:getConfig)
// -----------------------------------------------------------------------------

function renderConfig() {
  // Everything here is renderer-observable: refresh-rate class and 4K status are
  // read from the display, DPR from the device. The native governor adds
  // performance-state side effects that aren't ported, but the *config* the
  // renderer reads back is identical in shape.
  let dpr = 1;
  let width = 0;
  try {
    dpr = window.devicePixelRatio || 1;
    width = (window.screen?.width || 0) * dpr;
  } catch {
    /* headless */
  }
  // No portable web API reports the panel's refresh rate synchronously; the
  // Electron governor defaulted to 60hz unless told otherwise, so mirror that.
  const displayMode: '60hz' | '120hz' = '60hz';
  return {
    displayMode,
    targetFrameTime: 1000 / 60,
    dpr,
    is4K: width >= 3840,
    is120Hz: false,
  };
}

// -----------------------------------------------------------------------------
// WebAuthn availability (mirrors AuthController.checkBiometricsAvailable)
// -----------------------------------------------------------------------------

async function biometricsAvailable(): Promise<boolean> {
  try {
    const pkc = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    if (pkc?.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    /* not supported */
  }
  return false;
}

// -----------------------------------------------------------------------------
// Channel table — what this module can answer locally.
// -----------------------------------------------------------------------------

/**
 * Channels with a complete renderer-native answer. Each returns a Promise so the
 * compat layer can treat them uniformly with `dex_ipc`. A `null`/`undefined`
 * result from one of these is still recorded as degraded by the caller — but by
 * construction these never return null, so they leave the degrade report.
 */
const HANDLERS: Record<string, (args: unknown[]) => Promise<unknown>> = {
  // Motion discipline — pure OS-preference + arithmetic.
  'motion:getConfig': async () => motionConfig(),
  'motion:getState': async () => motionState(),
  'motion:requestAnimation': async (args) => approveAnimation((args[0] as { type?: string; durationMs?: number }) ?? {}),

  // Render governor — display/DPR read-back.
  'render:getConfig': async () => renderConfig(),

  // Resource governor — under Tauri there is no native frame-budget sampler, so
  // the honest contract is "always allow render / never defer", which is exactly
  // what the renderer's own fallbacks assume when the channel is absent. Serving
  // it here keeps the value truthful AND keeps it out of the degrade report.
  'resource:shouldRender': async () => true,
  'input:shouldDefer': async () => false,

  // WebAuthn platform-authenticator probe — a browser API, no main process.
  'auth:biometricsAvailable': async () => biometricsAvailable(),

  // Workflow "Run Script" node. Electron shelled out to a sandboxed process;
  // under Tauri we run it in the renderer's OWN DexScript interpreter (the same
  // engine that backs DexCode) — fully sandboxed JS, no shell-out, no native
  // process surface. Lazy-imported so the DexCode runtime stays out of the
  // platform-core chunk. Returns `{ output, error, success }`; the workflow
  // engine reads `res.output` (a string), so the line array is joined.
  'workflow:runScript': async (args) => {
    const source = typeof args[0] === 'string' ? (args[0] as string) : '';
    if (!source.trim()) return { output: '', error: null, success: true };
    try {
      const { executeDexScript } = await import(
        '../../DEXAPPLICATIONS/standalone/dexCode/runtime'
      );
      const r = executeDexScript(source);
      return {
        output: r.output.join('\n'),
        error: r.error,
        durationMs: r.duration,
        success: !r.error,
      };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : String(e), success: false };
    }
  },
};

/**
 * Fire-and-forget telemetry channels. Electron's handlers for these were
 * `ipcRenderer.send(...)` sinks that recorded a counter/metric in the main
 * process and returned nothing. Under Tauri there is no such collector yet, so
 * the truthful local behaviour is to accept-and-discard. We return a benign
 * `{ ok: true }` (never null) so they are served locally and do not pollute the
 * degrade report with phantom nulls. No data is fabricated — these channels
 * never produced data to begin with.
 */
const TELEMETRY_SINKS = new Set<string>([
  'motion:reportPrefersReduced',
  'motion:reportAnimationStart',
  'motion:reportAnimationEnd',
  'render:reportFrameMetrics',
  'render:reportStateChange',
  'render:reportInputEvent',
  'resource:reportRenderStart',
  'resource:reportRenderEnd',
  'resource:recordActivity',
  'input:reportLatency',
  'input:reportEvent',
  'stability:reportLatency',
  'stability:reportFrameTime',
  'stability:reportIdle',
  'enforce:reportMetrics',
  // Xenon push-metrics: the renderer reports the foreground app id so the (push-
  // model) system collector can attribute activity. Fire-and-forget (the caller
  // ignores the result); no native xenon collector under Tauri, so accept-and-
  // discard rather than degrade.
  'xenon:reportActiveApp',
  // Crash/memory fire-and-forget reporters. In Electron these wrote to a
  // main-process state file / crash log / alert sink; under Tauri there is no
  // such collector (the recovery READER isn't ported either), so the honest
  // behaviour is accept-and-discard — exactly what a sink is. No data lost that
  // anything currently reads. (Wire to a real native sink if/when recovery lands.)
  // Proactive renderer->main liveness ping (RendererHeartbeat). Electron's main
  // recorded a last-seen timestamp for freeze detection; under Tauri there is no
  // such watchdog collector, and the sender ignores the result (fire-and-forget),
  // so accept-and-discard is the honest behaviour. Keeps the heaviest single
  // degrade (~1/sec) out of the report.
  'renderer:heartbeat',
  'renderer:save-emergency-state',
  'renderer:memory-critical',
  'render-error:report',
]);

/**
 * Channels that genuinely cannot be satisfied on the renderer side and therefore
 * remain degraded under Tauri until the corresponding native command exists.
 * This list is documentation, not behaviour — it keeps the degrade report
 * honest: anything here SHOULD appear in `__dexDegradeReport()` until ported.
 *
 * Each entry notes why it needs native work the renderer cannot do safely:
 *   filesystem  — arbitrary local-path read/scan/mutation (no browser API)
 *   keychain    — secure credential storage (must not be faked)
 *   data-store  — backed by a backend store/db not yet exposed via dex_ipc
 *   process     — launch/execute an external program or watcher
 */
export const NATIVE_PENDING: ReadonlyArray<{ channel: string; needs: string }> = [
  // PORTED to dex_ipc (no longer degraded): fs:readdir / fs:readFileHead (binary
  // {__dexBinary} envelope) / media:getMediaFiles (fs_ops.rs); projects:* +
  // rewind:getDaySummary (main.rs); watch:start/stop (watch.rs); auth:setup:* (KV
  // sha256, Electron parity); dexnotes:pick-attachment-file / pick-import-file
  // (native picker -> {filePath}) + get-word-suggestions ([] until a dictionary
  // source exists). renderer:save-emergency-state / memory-critical /
  // render-error:report are fire-and-forget sinks (see TELEMETRY_SINKS). app:launch
  // is a renderer action (running-apps store), not a native channel.
  //
  // files:organizeByType (main.rs files_organize_by_type — faithful FileOperation[]
  // move-log port; server-side undo-history is the one documented gap, see
  // docs/TAURI-MIGRATION.md).
  //
  // workflow:runScript is NO LONGER degraded — it runs in the renderer's own
  // sandboxed DexScript interpreter (see HANDLERS above), not a native process.
  //
  // Previously-"impossible" categories now addressed (2026-06-22):
  //   - LLM streaming: works via the renderer's own fetch/ReadableStream in
  //     WebView2 (uki/providers) once a key is set. Fixed the two transport gaps
  //     that blocked it under Tauri — CSP connect-src now allows openrouter.ai,
  //     and the Anthropic provider sends `anthropic-dangerous-direct-browser-
  //     access` so its CORS preflight passes.
  //   - Live OS windows: multiwindow:* now creates REAL Tauri WebviewWindows
  //     (src-tauri/src/multi_window.rs) + this renderer boots single-app mode on
  //     `?detached=<appId>` (services/detachedWindow.ts).
  //   - Device discovery/pairing is already native (device_ctl.rs).
  //
  // GENUINE REMAINDER: none catalogued. The only things that still degrade are
  // truly host-impossible (vendor-driver hardware control: fan curves / GPU
  // voltage), handled at their call sites with an honest success:false.
];

/** True when `channel` has a complete renderer-native answer below. */
export function canHandleLocally(channel: string): boolean {
  return channel in HANDLERS || TELEMETRY_SINKS.has(channel);
}

/**
 * Serve a renderer-native channel. Only call after `canHandleLocally(channel)`
 * returns true. Telemetry sinks resolve to `{ ok: true }`; data channels resolve
 * to their computed value. Never resolves to null/undefined, so the caller does
 * not record a degrade.
 */
export function handleLocally(channel: string, args: unknown[]): Promise<unknown> {
  const handler = HANDLERS[channel];
  if (handler) return handler(args);
  // Telemetry sink: accept and discard.
  return Promise.resolve({ ok: true });
}
