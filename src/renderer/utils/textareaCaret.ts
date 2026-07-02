// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * textareaCaret — viewport caret coordinates for <textarea>/<input>.
 *
 * The word-suggestion engine (notes/WordSuggestions) positions its popup with
 * `getSelection().getRangeAt(0).getBoundingClientRect()`, which only works for a
 * contenteditable. Plain textareas/inputs expose no caret rect, so the popup
 * lands at 0,0. This computes the caret's real on-screen position with the
 * classic mirror-div technique (a hidden div that clones the field's box + text
 * metrics; a span at the caret index is measured), so assisted typing can go
 * cross-app (DexCode, creative text fields) without a mispositioned popup.
 *
 * Adapted from the MIT textarea-caret-position technique (component/…).
 */

const MIRROR_PROPS = [
  'direction', 'boxSizing',
  'width', 'height',
  'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
  'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize',
] as const;

export interface CaretRect {
  /** Viewport-relative top of the caret line. */
  top: number;
  /** Viewport-relative left of the caret. */
  left: number;
  /** Caret line height, for placing a popup just below it. */
  height: number;
}

/**
 * Returns the caret's viewport coordinates for the given field + character index.
 * Falls back to the field's bottom-left if measurement isn't possible.
 */
export function getTextareaCaretRect(
  field: HTMLTextAreaElement | HTMLInputElement,
  position: number,
): CaretRect {
  if (typeof document === 'undefined') return { top: 0, left: 0, height: 16 };
  const rect = field.getBoundingClientRect();
  try {
    const isInput = field.nodeName === 'INPUT';
    const computed = window.getComputedStyle(field);
    const div = document.createElement('div');
    const style = div.style;

    style.position = 'absolute';
    style.visibility = 'hidden';
    style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
    if (!isInput) style.wordWrap = 'break-word';
    for (const prop of MIRROR_PROPS) {
      (style as unknown as Record<string, string>)[prop] = computed.getPropertyValue(
        prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase()),
      );
    }
    // A textarea in a scroll container may have `height:auto` computed oddly; the
    // mirror must match the field's content box, so keep the copied width/height.
    document.body.appendChild(div);

    const before = field.value.substring(0, position);
    div.textContent = isInput ? before.replace(/\s/g, ' ') : before;

    const span = document.createElement('span');
    // A non-empty span so it has a measurable box even at end-of-text.
    span.textContent = field.value.substring(position) || '.';
    div.appendChild(span);

    const borderTop = parseInt(computed.borderTopWidth, 10) || 0;
    const borderLeft = parseInt(computed.borderLeftWidth, 10) || 0;
    const lineHeight = parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) || 16;

    const top = rect.top + borderTop + span.offsetTop - field.scrollTop;
    const left = rect.left + borderLeft + span.offsetLeft - field.scrollLeft;

    document.body.removeChild(div);
    return { top, left, height: lineHeight };
  } catch {
    // Safe fallback: anchor to the field's bottom-left corner.
    return { top: rect.bottom, left: rect.left, height: 16 };
  }
}
