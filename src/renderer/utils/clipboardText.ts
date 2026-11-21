// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
export interface TextPasteTarget {
  element: HTMLElement;
  range?: Range;
  start?: number;
  end?: number;
}

export function captureTextPasteTarget(): TextPasteTarget | null {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return null;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    if (element.selectionStart === null || element.disabled || element.readOnly) return null;
    return { element, start: element.selectionStart, end: element.selectionEnd ?? element.selectionStart };
  }
  if (!element.isContentEditable) return null;
  const selection = document.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.getRangeAt(0).commonAncestorContainer)) return null;
  return { element, range: selection.getRangeAt(0).cloneRange() };
}

export function insertPlainText(target: TextPasteTarget | null, text: string): boolean {
  if (!target?.element.isConnected) return false;
  const { element, range } = target;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    if (element.readOnly || element.disabled || element.selectionStart === null) return false;
    const start = target.start ?? element.selectionStart;
    const end = target.end ?? element.selectionEnd ?? start;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;
    element.focus();
    setter.call(element, element.value.slice(0, start) + text + element.value.slice(end));
    const cursor = start + text.length;
    element.setSelectionRange(cursor, cursor);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }
  if (!range || !element.contains(range.commonAncestorContainer) || !element.isContentEditable) return false;
  const selection = document.getSelection();
  if (!selection) return false;
  element.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  return document.execCommand?.('insertText', false, text) === true;
}

export type TextTransform = 'trim' | 'uppercase' | 'lowercase' | 'slug';
export function transformClipboardText(text: string, transform: TextTransform): string {
  switch (transform) {
    case 'trim': return text.trim();
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'slug': return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  }
}
