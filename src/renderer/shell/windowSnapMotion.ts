// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { isSameWindowBounds, type WindowBounds } from '../../shared/shell/windowLayout';
import { prefersReducedMotion, subscribeToReducedMotion } from '../utils/useReducedMotion';

const pending = new WeakMap<HTMLElement, { from: WindowBounds; duration: number }>();
const running = new WeakMap<HTMLElement, { target: WindowBounds; animation: Animation; stopListening: () => void }>();

function frame(bounds: WindowBounds) {
  return { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.w}px`, height: `${bounds.h}px` };
}

export function cancelWindowSnap(element: HTMLElement) {
  pending.delete(element);
  const current = running.get(element);
  if (!current) return;
  running.delete(element);
  current.stopListening();
  current.animation.cancel();
}

export function queueWindowSnap(element: HTMLElement, from: WindowBounds, duration: number) {
  cancelWindowSnap(element);
  pending.set(element, { from, duration });
}

export function playWindowSnap(element: HTMLElement, target: WindowBounds, reduce: boolean) {
  const transition = pending.get(element);
  if (!transition) {
    const current = running.get(element);
    if (current && (reduce || !isSameWindowBounds(current.target, target))) cancelWindowSnap(element);
    return;
  }
  pending.delete(element);
  element.style.transform = '';
  if (reduce || prefersReducedMotion() || transition.duration <= 1 || isSameWindowBounds(transition.from, target) ||
    typeof element.animate !== 'function') return;

  const ease = getComputedStyle(element).getPropertyValue('--dex-ease-move').trim() || 'cubic-bezier(0.65, 0, 0.35, 1)';
  const animation = element.animate([frame(transition.from), frame(target)], { duration: transition.duration, easing: ease });
  const stopListening = subscribeToReducedMotion(() => {
    if (prefersReducedMotion()) cancelWindowSnap(element);
  });
  running.set(element, { target, animation, stopListening });
  const finish = () => {
    if (running.get(element)?.animation !== animation) return;
    running.delete(element);
    stopListening();
  };
  animation.addEventListener('finish', finish, { once: true });
  animation.addEventListener('cancel', finish, { once: true });
}

export function interruptWindowSnap(element: HTMLElement, target: WindowBounds): WindowBounds | null {
  const scheduled = pending.get(element);
  if (!scheduled && !running.has(element)) return null;
  const computed = getComputedStyle(element);
  const pixels = (value: string, fallback: number) => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const position = scheduled?.from ?? {
    x: pixels(computed.left, target.x),
    y: pixels(computed.top, target.y),
    w: pixels(computed.width, target.w),
    h: pixels(computed.height, target.h),
  };
  cancelWindowSnap(element);
  element.style.transform = '';
  Object.assign(element.style, frame(position));
  return position;
}
