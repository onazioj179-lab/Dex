import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { keyEventForApp, isTypingTarget, __setLastAppForTests } from '../../src/renderer/shell/input/appKeyScope';
import { useRunningApps } from '../../src/renderer/store/runningApps';

const key = (target: EventTarget, init: KeyboardEventInit = { key: ' ' }) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, ...init });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

describe('appKeyScope: background apps do not take other apps\' keys', () => {
  let flux: HTMLElement, notes: HTMLElement, editor: HTMLElement, fluxCanvas: HTMLElement;
  beforeEach(() => {
    __setLastAppForTests(null);
    flux = document.createElement('div'); flux.setAttribute('data-app-id', 'flux');
    fluxCanvas = document.createElement('div'); flux.appendChild(fluxCanvas);
    notes = document.createElement('div'); notes.setAttribute('data-floating-window', 'notes');
    editor = document.createElement('div'); editor.setAttribute('contenteditable', 'true'); notes.appendChild(editor);
    document.body.append(flux, notes);
  });
  afterEach(() => { flux.remove(); notes.remove(); });

  it('a key typed in another app\'s editor is not FLUX\'s', () => {
    expect(keyEventForApp(key(editor), 'flux')).toBe(false);
    expect(keyEventForApp(key(editor), 'notes')).toBe(true);
    expect(isTypingTarget(editor)).toBe(true);
  });

  it('focus on the page goes to the app clicked last', () => {
    fluxCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(keyEventForApp(key(document.body), 'flux')).toBe(true);
    expect(keyEventForApp(key(document.body), 'notes')).toBe(false);
    editor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(keyEventForApp(key(document.body), 'flux')).toBe(false);
  });

  it('with no click on record, the shell\'s current app decides', () => {
    useRunningApps.setState({ currentAppId: 'flux' });
    expect(keyEventForApp(key(document.body), 'flux')).toBe(true);
    useRunningApps.setState({ currentAppId: 'notes' });
    expect(keyEventForApp(key(document.body), 'flux')).toBe(false);
  });

  it('an app mounted outside the shell (tests, standalone) keeps its keys', () => {
    expect(keyEventForApp(key(document.body), 'not-in-shell')).toBe(true);
  });

  it('isTypingTarget covers inputs, textareas, selects and rich editors only', () => {
    for (const tag of ['input', 'textarea', 'select']) expect(isTypingTarget(document.createElement(tag))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
