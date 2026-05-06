// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * MenuAnimator - Unified spring-physics menu animation system.
 * Handles entry/exit transitions, sliding selection indicators,
 * and diagonal submenu tolerance for all DEX menus.
 */

import { SpringAnimator, SPRING_PRESETS, isReduceMotion, type SpringConfig } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const ENTRY_CONFIG: SpringConfig = { stiffness: 850, damping: 55, mass: 0.3 };
const EXIT_CONFIG: SpringConfig = { stiffness: 1000, damping: 65, mass: 0.25 };
const SELECTION_CONFIG: SpringConfig = { stiffness: 900, damping: 60, mass: 0.2 };
const STAGGER_DELAY_MS = 8;
const SUBMENU_SAFE_ZONE_ANGLE = 45; // degrees from diagonal toward submenu

// ---------------------------------------------------------------------------
// MENU ENTRY / EXIT
// ---------------------------------------------------------------------------

export interface MenuAnimationOptions {
  element: HTMLElement;
  origin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  onComplete?: () => void;
}

function getOriginCSS(origin: MenuAnimationOptions['origin']): string {
  switch (origin) {
    case 'top-left': return '0% 0%';
    case 'top-right': return '100% 0%';
    case 'bottom-left': return '0% 100%';
    case 'bottom-right': return '100% 100%';
    case 'center': return '50% 50%';
    default: return '0% 0%';
  }
}

export function animateMenuEntry(opts: MenuAnimationOptions): SpringAnimator {
  const { element, origin = 'top-left', onComplete } = opts;
  element.style.transformOrigin = getOriginCSS(origin);
  element.style.willChange = 'transform, opacity';

  if (isReduceMotion()) {
    element.style.transform = 'scale(1)';
    element.style.opacity = '1';
    onComplete?.();
    return new SpringAnimator(ENTRY_CONFIG, 1);
  }

  element.style.transform = 'scale(0.94)';
  element.style.opacity = '0';

  const spring = new SpringAnimator(ENTRY_CONFIG, 0);
  spring.onUpdate(v => {
    const scale = 0.94 + v * 0.06;
    element.style.transform = `scale(${scale})`;
    element.style.opacity = `${Math.min(1, v * 1.4)}`;
  });
  spring.onComplete(() => {
    element.style.willChange = '';
    onComplete?.();
  });
  spring.setTarget(1);
  return spring;
}

export function animateMenuExit(opts: MenuAnimationOptions): SpringAnimator {
  const { element, origin = 'top-left', onComplete } = opts;
  element.style.transformOrigin = getOriginCSS(origin);
  element.style.willChange = 'transform, opacity';

  if (isReduceMotion()) {
    element.style.transform = 'scale(0.94)';
    element.style.opacity = '0';
    onComplete?.();
    return new SpringAnimator(EXIT_CONFIG, 0);
  }

  const spring = new SpringAnimator(EXIT_CONFIG, 1);
  spring.onUpdate(v => {
    const scale = 0.94 + v * 0.06;
    element.style.transform = `scale(${scale})`;
    element.style.opacity = `${v}`;
  });
  spring.onComplete(() => {
    element.style.willChange = '';
    onComplete?.();
  });
  spring.setTarget(0);
  return spring;
}

// ---------------------------------------------------------------------------
// STAGGERED ITEM ENTRY
// ---------------------------------------------------------------------------

export function animateMenuItems(
  container: HTMLElement,
  selector = '[data-menu-item]',
): SpringAnimator[] {
  const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const springs: SpringAnimator[] = [];

  if (isReduceMotion()) {
    items.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    return springs;
  }

  items.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(4px)';
    el.style.willChange = 'transform, opacity';

    const spring = new SpringAnimator(ENTRY_CONFIG, 0);
    spring.onUpdate(v => {
      el.style.opacity = `${Math.min(1, v * 1.4)}`;
      el.style.transform = `translateY(${(1 - v) * 4}px)`;
    });
    spring.onComplete(() => {
      el.style.willChange = '';
    });

    setTimeout(() => spring.setTarget(1), i * STAGGER_DELAY_MS);
    springs.push(spring);
  });

  return springs;
}

// ---------------------------------------------------------------------------
// SLIDING SELECTION INDICATOR
// ---------------------------------------------------------------------------

export class SelectionIndicator {
  private _spring: SpringAnimator;
  private _element: HTMLElement | null = null;
  private _currentY = 0;

  constructor() {
    this._spring = new SpringAnimator(SELECTION_CONFIG, 0);
    this._spring.onUpdate(y => {
      if (this._element) {
        this._element.style.transform = `translateY(${y}px)`;
      }
    });
  }

  attach(indicator: HTMLElement): void {
    this._element = indicator;
    indicator.style.willChange = 'transform';
    indicator.style.position = 'absolute';
    indicator.style.left = '0';
    indicator.style.right = '0';
    indicator.style.pointerEvents = 'none';
    indicator.style.transition = 'none';
  }

  moveTo(y: number, height: number): void {
    if (this._element) {
      this._element.style.height = `${height}px`;
    }
    if (isReduceMotion()) {
      this._currentY = y;
      if (this._element) {
        this._element.style.transform = `translateY(${y}px)`;
      }
      return;
    }
    this._currentY = y;
    this._spring.setValue(this._spring.value);
    this._spring.setTarget(y);
  }

  hide(): void {
    if (this._element) {
      this._element.style.opacity = '0';
    }
  }

  show(): void {
    if (this._element) {
      this._element.style.opacity = '1';
    }
  }

  destroy(): void {
    this._spring.destroy();
    this._element = null;
  }
}

// ---------------------------------------------------------------------------
// DIAGONAL SUBMENU TOLERANCE
// ---------------------------------------------------------------------------

export interface SubmenuZone {
  parentRect: DOMRect;
  submenuRect: DOMRect;
  direction: 'left' | 'right';
}

export function isInSubmenuSafeZone(
  mouseX: number,
  mouseY: number,
  lastX: number,
  lastY: number,
  zone: SubmenuZone,
): boolean {
  const { parentRect, submenuRect, direction } = zone;

  // If mouse is inside the submenu, always allow
  if (
    mouseX >= submenuRect.left && mouseX <= submenuRect.right &&
    mouseY >= submenuRect.top && mouseY <= submenuRect.bottom
  ) {
    return true;
  }

  // Calculate angle from last position toward current mouse
  const dx = mouseX - lastX;
  const dy = mouseY - lastY;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return true;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Target angle: toward the submenu center
  const submenuCenterX = (submenuRect.left + submenuRect.right) / 2;
  const submenuCenterY = (submenuRect.top + submenuRect.bottom) / 2;
  const targetAngle = Math.atan2(submenuCenterY - lastY, submenuCenterX - lastX) * (180 / Math.PI);

  // Check if mouse movement is within the safe zone angle of the target direction
  let angleDiff = Math.abs(angle - targetAngle);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;

  return angleDiff < SUBMENU_SAFE_ZONE_ANGLE;
}

// ---------------------------------------------------------------------------
// UTILITY: SPRING PRESETS FOR MENUS
// ---------------------------------------------------------------------------

export const MENU_SPRING = {
  entry: ENTRY_CONFIG,
  exit: EXIT_CONFIG,
  selection: SELECTION_CONFIG,
  itemStagger: STAGGER_DELAY_MS,
} as const;
