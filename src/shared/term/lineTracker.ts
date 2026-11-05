// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Best-effort tracker of the line the user is typing into a real terminal.
 *
 * With a pseudoterminal the shell owns line editing (PSReadLine, readline), so
 * the renderer never knows the line for certain. This tracker follows the raw
 * keystrokes xterm.js emits and stays "reliable" only while every key since the
 * last Enter was a printable character or Backspace. Arrow keys, Tab completion,
 * history recall and other escape sequences make it unreliable until the next
 * Enter / Ctrl+C, and callers must then forward the line to the shell untouched.
 *
 * Used for two things: intercepting `dex <cmd>` lines (DEX's own command layer)
 * and naming terminal tabs after the command that was run.
 */

export interface LineTrackerState {
  line: string;
  reliable: boolean;
}

export type TrackResult =
  /** Keystroke(s) recorded; forward them to the shell as-is. */
  | { kind: 'forward' }
  /** Enter pressed. `line` is null when the tracker could not follow the edit. */
  | { kind: 'enter'; line: string | null };

export function createLineTracker(): LineTrackerState {
  return { line: '', reliable: true };
}

function isPrintable(s: string): boolean {
  // No C0 controls and no DEL. (A paste of plain text is printable too.)
  // eslint-disable-next-line no-control-regex
  return s.length > 0 && !/[\x00-\x1f\x7f]/.test(s);
}

/**
 * Feed one xterm.js `onData` payload. Mutates `state` and says what happened.
 * Pastes that contain a newline are treated as "unreliable + enter" so a pasted
 * multi-line script always goes to the shell.
 */
export function trackInput(state: LineTrackerState, data: string): TrackResult {
  if (data === '\r' || data === '\n') {
    const line = state.reliable ? state.line : null;
    state.line = '';
    state.reliable = true;
    return { kind: 'enter', line };
  }
  if (data === '\x03') {
    // Ctrl+C: the shell discards the line.
    state.line = '';
    state.reliable = true;
    return { kind: 'forward' };
  }
  if (data === '\x7f' || data === '\b') {
    if (state.line.length === 0) {
      // Backspace on what may be a line we never saw (e.g. recalled history).
      return { kind: 'forward' };
    }
    state.line = Array.from(state.line).slice(0, -1).join('');
    return { kind: 'forward' };
  }
  if (isPrintable(data)) {
    state.line += data;
    return { kind: 'forward' };
  }
  // Anything else (arrows, Tab, Home/End, Alt combos, multi-line paste…).
  state.reliable = false;
  return { kind: 'forward' };
}

/** True when `line` is a DEX command (`dex`, `dex list`, `dex open notes` …). */
export function isDexCommandLine(line: string | null): boolean {
  return line !== null && /^\s*dex(\s|$)/i.test(line);
}

/**
 * The keystroke that discards the shell's current input line so a `dex …` line
 * the user typed never reaches the shell: Escape (RevertLine in PSReadLine, and
 * cmd.exe's line clear) on Windows, Ctrl+U (unix-line-discard) elsewhere.
 */
export function discardLineSequence(isWindows: boolean): string {
  return isWindows ? '\x1b' : '\x15';
}
