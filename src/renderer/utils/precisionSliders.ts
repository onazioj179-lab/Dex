// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Precision slider helper -- attaches global behavior to every
 * input[type="range"] in the DEX renderer:
 *
 *   - Wheel adjusts value by step (or step * 0.1 with Shift for fine-grained).
 *   - ArrowUp / ArrowDown handled identically to ArrowRight / ArrowLeft so
 *     keyboard precision feels consistent regardless of orientation.
 *   - Double-click resets to the slider's data-default-value when present.
 *
 * Sliders may opt out by setting data-skip-precision on the element.
 */

let installed = false;

function dispatchInputAndChange(target: HTMLInputElement): void {
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

function getStep(slider: HTMLInputElement, fine: boolean): number {
  const baseStep = parseFloat(slider.step || '1');
  const safeStep = Number.isFinite(baseStep) && baseStep > 0 ? baseStep : 1;
  return fine ? safeStep / 10 : safeStep;
}

import { clamp } from '../../shared/math/num';

function nudge(slider: HTMLInputElement, deltaSteps: number, fine: boolean): void {
  if (slider.disabled) return;
  const min = parseFloat(slider.min || '0');
  const max = parseFloat(slider.max || '100');
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 100;
  const current = parseFloat(slider.value);
  if (!Number.isFinite(current)) return;
  const step = getStep(slider, fine);
  const next = clamp(current + deltaSteps * step, safeMin, safeMax);
  // Snap to step grid to avoid drift accumulation
  const baseStep = parseFloat(slider.step || '1');
  if (Number.isFinite(baseStep) && baseStep > 0 && !fine) {
    const snapped = Math.round((next - safeMin) / baseStep) * baseStep + safeMin;
    slider.value = String(clamp(snapped, safeMin, safeMax));
  } else {
    // Limit precision to avoid floating point noise
    const decimals = String(step).split('.')[1]?.length ?? 0;
    slider.value = next.toFixed(Math.min(decimals + 1, 6));
  }
  dispatchInputAndChange(slider);
}

function isRangeInput(target: EventTarget | null): target is HTMLInputElement {
  return !!target && target instanceof HTMLInputElement && target.type === 'range';
}

export function installPrecisionSliders(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Wheel: scroll wheel nudges the slider, Shift switches to fine step.
  window.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      const target = event.target;
      if (!isRangeInput(target)) return;
      if (target.dataset.skipPrecision === 'true') return;
      // Only intervene when the slider is the wheel target (focused or hovered).
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      nudge(target, direction, event.shiftKey);
    },
    { passive: false, capture: true },
  );

  // Double-click resets to data-default-value when present.
  window.addEventListener(
    'dblclick',
    (event: MouseEvent) => {
      const target = event.target;
      if (!isRangeInput(target)) return;
      const fallback = target.dataset.defaultValue;
      if (fallback === undefined) return;
      const parsed = parseFloat(fallback);
      if (!Number.isFinite(parsed)) return;
      target.value = String(parsed);
      dispatchInputAndChange(target);
    },
    true,
  );
}
