// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

/** Observe only the captured pointer. Losing the window or its handle cancels the gesture. */
export function observeWindowPointer(
  handle: HTMLElement,
  pointerId: number,
  onMove: (event: PointerEvent) => void,
  onFinish: (event: PointerEvent | null) => void,
) {
  let active = true;
  const move = (event: PointerEvent) => {
    if (event.pointerId === pointerId) onMove(event);
  };
  const end = (event: PointerEvent) => {
    if (event.pointerId === pointerId) finish(event.type === 'pointerup' && handle.isConnected ? event : null);
  };
  const blur = () => finish(null);
  const finish = (event: PointerEvent | null) => {
    if (!active) return;
    active = false;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('lostpointercapture', end);
    window.removeEventListener('lostpointercapture', end, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    window.removeEventListener('blur', blur);
    if (handle.hasPointerCapture(pointerId)) {
      try { handle.releasePointerCapture(pointerId); } catch { /* The pointer may already have ended. */ }
    }
    onFinish(event);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', end);
  window.addEventListener('lostpointercapture', end, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('blur', blur);
}
