// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Motion Hooks Extended Library
 * Additional utility hooks for the DEX platform.
 * These are loaded separately to keep the main bundle lean.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo, useLayoutEffect } from 'react';
import { frameStep, decay } from './frameTime';
import { useMediaQuery } from './motionHooks';
import { notificationsAllowed } from './notificationsAllowed';

// ---------------------------------------------------------------------------
// useScrollDeceleration -- scroll deceleration curve presets
// ---------------------------------------------------------------------------
export type ScrollCurve = "linear" | "easeOut" | "friction" | "bounce";
export interface ScrollDecelerationConfig { curve: ScrollCurve; friction?: number; bounce?: number; }
export function useScrollDeceleration(config: ScrollDecelerationConfig = { curve: "easeOut" }) {
  const { curve, friction = 0.92, bounce = 0.1 } = config;
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const decelerate = useCallback((el: HTMLElement, initialVelocity: number) => {
    velocityRef.current = initialVelocity;
    let last: number | null = null;
    const tick = (now: number) => {
      const step = frameStep(last, now); last = now; // refresh-rate independent
      const v = velocityRef.current;
      if (Math.abs(v) < 0.5) { velocityRef.current = 0; return; }
      el.scrollTop += v * step;
      switch (curve) {
        case "linear": velocityRef.current *= decay(0.95, step); break;
        case "easeOut": velocityRef.current *= decay(0.88, step); break;
        case "friction": velocityRef.current *= decay(friction, step); break;
        case "bounce":
          if (el.scrollTop <= 0 || el.scrollTop >= el.scrollHeight - el.clientHeight) { velocityRef.current *= -bounce; }
          else { velocityRef.current *= decay(0.9, step); }
          break;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [curve, friction, bounce]);
  const stop = useCallback(() => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } velocityRef.current = 0; }, []);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  return { decelerate, stop, getVelocity: () => velocityRef.current };
}

// ---------------------------------------------------------------------------
// useScrollToTop -- scroll to top with double-tap/click
// ---------------------------------------------------------------------------
export function useScrollToTop(scrollRef: React.RefObject<HTMLElement>, options: { doubleClickDelay?: number; smooth?: boolean } = {}) {
  const { doubleClickDelay = 300, smooth = true } = options;
  const lastClick = useRef(0);
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) { scrollRef.current.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }); }
  }, [scrollRef, smooth]);
  const handleDoubleClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClick.current < doubleClickDelay) { scrollToTop(); }
    lastClick.current = now;
  }, [doubleClickDelay, scrollToTop]);
  return { scrollToTop, handleDoubleClick };
}

// ---------------------------------------------------------------------------
// useHoverGlow -- button/element hover glow effect
// ---------------------------------------------------------------------------
export function useHoverGlow(options: { color?: string; intensity?: number; spread?: number } = {}) {
  const { color = "var(--color-accent)", intensity = 0.4, spread = 20 } = options;
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const ref = useRef<HTMLElement>(null);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  }, []);
  const glowStyle: React.CSSProperties = isHovered ? { boxShadow: "0 0 " + spread + "px " + (spread/2) + "px " + color.replace(")", ", " + intensity + ")").replace("var(", "rgba("), background: "radial-gradient(circle at " + mousePos.x + "% " + mousePos.y + "%, " + color.replace(")", ", 0.15)").replace("var(", "rgba(") + ", transparent 70%)" } : {};
  return { ref, glowStyle, onMouseEnter: () => setIsHovered(true), onMouseLeave: () => setIsHovered(false), onMouseMove, isHovered };
}

// ---------------------------------------------------------------------------
// useLoadingState -- button loading state with spinner
// ---------------------------------------------------------------------------
export function useLoadingState(initialLoading = false) {
  const [isLoading, setLoading] = useState(initialLoading);
  const [progress, setProgress] = useState(0);
  const startLoading = useCallback(() => { setLoading(true); setProgress(0); }, []);
  const stopLoading = useCallback(() => { setLoading(false); setProgress(100); }, []);
  const updateProgress = useCallback((p: number) => setProgress(Math.min(100, Math.max(0, p))), []);
  const loadingProps = { "data-loading": isLoading, style: { pointerEvents: isLoading ? "none" as const : "auto" as const, opacity: isLoading ? 0.7 : 1 } };
  return { isLoading, progress, startLoading, stopLoading, updateProgress, loadingProps };
}

// ---------------------------------------------------------------------------
// useSuccessAnimation -- success checkmark animation
// ---------------------------------------------------------------------------
export function useSuccessAnimation(duration = 2000) {
  const [showSuccess, setShowSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useCallback(() => {
    setShowSuccess(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowSuccess(false), duration);
  }, [duration]);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  const successStyle: React.CSSProperties = showSuccess ? { animation: "successPop 0.3s ease-out" } : {};
  return { showSuccess, trigger, successStyle };
}

// ---------------------------------------------------------------------------
// useErrorShake -- error shake animation
// ---------------------------------------------------------------------------
export function useErrorShake(duration = 500) {
  const [isShaking, setIsShaking] = useState(false);
  const trigger = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
  }, [duration]);
  const shakeStyle: React.CSSProperties = isShaking ? { animation: "shake " + duration + "ms ease-in-out" } : {};
  const shakeKeyframes = "@keyframes shake { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-4px)} 20%,40%,60%,80%{transform:translateX(4px)} }";
  return { isShaking, trigger, shakeStyle, shakeKeyframes };
}

// ---------------------------------------------------------------------------
// useCardHover -- card hover lift/sink effects
// ---------------------------------------------------------------------------
export function useCardHover(options: { liftAmount?: number; sinkAmount?: number; shadow?: boolean } = {}) {
  const { liftAmount = 4, sinkAmount = 2, shadow = true } = options;
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const transform = isPressed ? "translateY(" + sinkAmount + "px)" : isHovered ? "translateY(-" + liftAmount + "px)" : "translateY(0)";
  const boxShadow = shadow ? (isHovered && !isPressed ? "0 " + (liftAmount * 2) + "px " + (liftAmount * 4) + "px rgba(0,0,0,0.15)" : "0 2px 4px rgba(0,0,0,0.1)") : undefined;
  const cardStyle: React.CSSProperties = { transform, boxShadow, transition: "transform 0.2s ease, box-shadow 0.2s ease" };
  return { cardStyle, onMouseEnter: () => setIsHovered(true), onMouseLeave: () => { setIsHovered(false); setIsPressed(false); }, onMouseDown: () => setIsPressed(true), onMouseUp: () => setIsPressed(false), isHovered, isPressed };
}

// ---------------------------------------------------------------------------
// usePulse -- pulsing animation for badges/dots
// ---------------------------------------------------------------------------
export function usePulse(options: { interval?: number; scale?: number; duration?: number } = {}) {
  const { interval = 2000, scale = 1.2, duration = 600 } = options;
  const [isPulsing, setIsPulsing] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { setIsPulsing(true); setTimeout(() => setIsPulsing(false), duration); }, interval);
    return () => clearInterval(id);
  }, [interval, duration]);
  const pulseStyle: React.CSSProperties = isPulsing ? { transform: "scale(" + scale + ")", transition: "transform " + (duration/2) + "ms ease-out" } : { transform: "scale(1)", transition: "transform " + (duration/2) + "ms ease-in" };
  return { isPulsing, pulseStyle };
}

// ---------------------------------------------------------------------------
// useNavIndicator -- animated navigation indicator
// ---------------------------------------------------------------------------
export function useNavIndicator<T extends string>(items: T[], initial?: T) {
  const [active, setActive] = useState<T>(initial ?? items[0]);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const itemRefs = useRef<Map<T, HTMLElement>>(new Map());
  const containerRef = useRef<HTMLElement>(null);
  const updateIndicator = useCallback(() => {
    const el = itemRefs.current.get(active);
    const container = containerRef.current;
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      setIndicatorStyle({ left: elRect.left - contRect.left, width: elRect.width, transition: "left 0.2s ease, width 0.2s ease" });
    }
  }, [active]);
  useEffect(() => { updateIndicator(); }, [active, updateIndicator]);
  const registerItem = useCallback((key: T, el: HTMLElement | null) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); }, []);
  return { active, setActive, indicatorStyle, containerRef, registerItem };
}

// ---------------------------------------------------------------------------
// useTypewriter -- typewriter text effect
// ---------------------------------------------------------------------------
export function useTypewriter(text: string, options: { speed?: number; delay?: number; loop?: boolean } = {}) {
  const { speed = 50, delay = 0, loop = false } = options;
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  useEffect(() => {
    setDisplayed(""); setIsComplete(false);
    const startTimeout = setTimeout(() => {
      setIsTyping(true);
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
        else { clearInterval(interval); setIsTyping(false); setIsComplete(true); if (loop) { setTimeout(() => setDisplayed(""), 1000); } }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(startTimeout);
  }, [text, speed, delay, loop]);
  return { displayed, isTyping, isComplete, cursor: isTyping ? "|" : "" };
}

// ---------------------------------------------------------------------------
// useCountUp -- animated number counter
// ---------------------------------------------------------------------------
export function useCountUp(target: number, options: { duration?: number; decimals?: number; easing?: boolean } = {}) {
  const { duration = 1000, decimals = 0, easing = true } = options;
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing ? 1 - Math.pow(1 - progress, 3) : progress;
      setValue(Number((easedProgress * target).toFixed(decimals)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration, decimals, easing]);
  return value;
}

// ---------------------------------------------------------------------------
// useScrollLinked -- scroll-linked animations
// ---------------------------------------------------------------------------
export function useScrollLinked<T>(scrollRef: React.RefObject<HTMLElement>, mapFn: (progress: number) => T) {
  const [value, setValue] = useState<T>(mapFn(0));
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      const progress = max > 0 ? el.scrollTop / max : 0;
      setValue(mapFn(progress));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, mapFn]);
  return value;
}

// ---------------------------------------------------------------------------
// useScrollController -- configurable scroll with friction
// ---------------------------------------------------------------------------
export interface ScrollControllerConfig { friction?: number; velocityThreshold?: number; maxVelocity?: number; }
export function useScrollController(config: ScrollControllerConfig = {}) {
  const { friction = 0.92, velocityThreshold = 0.5, maxVelocity = 50 } = config;
  const velocityRef = useRef(0);
  const lastScrollRef = useRef(0);
  const lastTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const trackVelocity = useCallback((scrollTop: number) => {
    const now = performance.now();
    const dt = now - lastTimeRef.current;
    if (dt > 0) { velocityRef.current = Math.min(maxVelocity, Math.max(-maxVelocity, (scrollTop - lastScrollRef.current) / dt * 16)); }
    lastScrollRef.current = scrollTop;
    lastTimeRef.current = now;
  }, [maxVelocity]);
  const applyMomentum = useCallback((el: HTMLElement, onComplete?: () => void) => {
    let last: number | null = null;
    const tick = (now: number) => {
      const step = frameStep(last, now); last = now; // refresh-rate independent
      if (Math.abs(velocityRef.current) < velocityThreshold) { velocityRef.current = 0; onComplete?.(); return; }
      el.scrollTop += velocityRef.current * step;
      velocityRef.current *= decay(friction, step);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [friction, velocityThreshold]);
  const stop = useCallback(() => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } velocityRef.current = 0; }, []);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  return { trackVelocity, applyMomentum, stop, getVelocity: () => velocityRef.current };
}

// ---------------------------------------------------------------------------
// useScrollSnap -- scroll snap for galleries/timelines
// ---------------------------------------------------------------------------
export interface ScrollSnapConfig { itemSelector: string; axis?: "x" | "y"; mode?: "mandatory" | "proximity"; threshold?: number; }
export function useScrollSnap(ref: React.RefObject<HTMLElement>, config: ScrollSnapConfig) {
  const { itemSelector, axis = "y", mode = "mandatory", threshold = 50 } = config;
  const [activeIndex, setActiveIndex] = useState(0);
  const snapToIndex = useCallback((index: number) => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll(itemSelector);
    if (items[index]) {
      const item = items[index] as HTMLElement;
      const pos = axis === "x" ? item.offsetLeft : item.offsetTop;
      el.scrollTo({ [axis === "x" ? "left" : "top"]: pos, behavior: "smooth" });
      setActiveIndex(index);
    }
  }, [ref, itemSelector, axis]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const items = el.querySelectorAll(itemSelector);
        const scroll = axis === "x" ? el.scrollLeft : el.scrollTop;
        let closest = 0, minDist = Infinity;
        items.forEach((item, i) => {
          const pos = axis === "x" ? (item as HTMLElement).offsetLeft : (item as HTMLElement).offsetTop;
          const dist = Math.abs(pos - scroll);
          if (dist < minDist) { minDist = dist; closest = i; }
        });
        if (mode === "mandatory" || minDist < threshold) { snapToIndex(closest); }
      }, 100);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); clearTimeout(timeout); };
  }, [ref, itemSelector, axis, mode, threshold, snapToIndex]);
  return { activeIndex, snapToIndex, next: () => snapToIndex(activeIndex + 1), prev: () => snapToIndex(activeIndex - 1) };
}

// ---------------------------------------------------------------------------
// useScrollLock -- lock/unlock page scroll
// ---------------------------------------------------------------------------
export function useScrollLock(initialLocked = false) {
  const [isLocked, setIsLocked] = useState(initialLocked);
  const scrollPosRef = useRef(0);
  useEffect(() => {
    if (isLocked) {
      scrollPosRef.current = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = "-" + scrollPosRef.current + "px";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollPosRef.current);
    }
  }, [isLocked]);
  return { isLocked, lock: () => setIsLocked(true), unlock: () => setIsLocked(false), toggle: () => setIsLocked(l => !l) };
}

// ---------------------------------------------------------------------------
// useSmoothAnchor -- smooth anchor scrolling
// ---------------------------------------------------------------------------
export function useSmoothAnchor(options: { offset?: number; duration?: number } = {}) {
  const { offset = 0, duration = 500 } = options;
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const targetY = el.getBoundingClientRect().top + window.scrollY - offset;
    const startY = window.scrollY;
    const diff = targetY - startY;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, startY + diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [offset, duration]);
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute("href");
    if (href?.startsWith("#")) { e.preventDefault(); scrollTo(href.slice(1)); }
  }, [scrollTo]);
  return { scrollTo, handleClick };
}

// ---------------------------------------------------------------------------
// usePinchZoom -- pinch-to-zoom with anchor point
// ---------------------------------------------------------------------------
export function usePinchZoom(options: { minScale?: number; maxScale?: number; initialScale?: number } = {}) {
  const { minScale = 0.5, maxScale = 4, initialScale = 1 } = options;
  const [scale, setScale] = useState(initialScale);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const initialDistRef = useRef(0);
  const initialScaleRef = useRef(initialScale);
  const getDistance = (touches: TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const getCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
  };
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) { initialDistRef.current = getDistance(e.touches as unknown as TouchList); initialScaleRef.current = scale; setOrigin(getCenter(e.touches)); }
  }, [scale]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistRef.current > 0) {
      const dist = getDistance(e.touches as unknown as TouchList);
      const newScale = Math.min(maxScale, Math.max(minScale, initialScaleRef.current * (dist / initialDistRef.current)));
      setScale(newScale);
      setOrigin(getCenter(e.touches));
    }
  }, [minScale, maxScale]);
  const onTouchEnd = useCallback(() => { initialDistRef.current = 0; }, []);
  const reset = useCallback(() => { setScale(initialScale); setOrigin({ x: 0, y: 0 }); }, [initialScale]);
  const zoomStyle: React.CSSProperties = { transform: "scale(" + scale + ")", transformOrigin: origin.x + "px " + origin.y + "px", transition: initialDistRef.current > 0 ? "none" : "transform 0.2s ease" };
  return { scale, origin, zoomStyle, onTouchStart, onTouchMove, onTouchEnd, reset, setScale };
}

// ---------------------------------------------------------------------------
// useSwipeGesture -- swipe detection with velocity
// ---------------------------------------------------------------------------
export type SwipeDirection = "left" | "right" | "up" | "down";
export interface SwipeConfig { threshold?: number; velocityThreshold?: number; }
export function useSwipeGesture(onSwipe: (dir: SwipeDirection, velocity: number) => void, config: SwipeConfig = {}) {
  const { threshold = 50, velocityThreshold = 0.3 } = config;
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const dx = e.changedTouches[0].clientX - startRef.current.x;
    const dy = e.changedTouches[0].clientY - startRef.current.y;
    const dt = Date.now() - startRef.current.time;
    const vx = Math.abs(dx) / dt;
    const vy = Math.abs(dy) / dt;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX > threshold || absY > threshold || vx > velocityThreshold || vy > velocityThreshold) {
      if (absX > absY) { onSwipe(dx > 0 ? "right" : "left", vx); }
      else { onSwipe(dy > 0 ? "down" : "up", vy); }
    }
    startRef.current = null;
  }, [onSwipe, threshold, velocityThreshold]);
  return { onTouchStart, onTouchEnd };
}




// ---------------------------------------------------------------------------
// useDoubleTap -- double tap detection
// ---------------------------------------------------------------------------
export function useDoubleTap(onDoubleTap: () => void, options: { delay?: number; onSingleTap?: () => void } = {}) {
  const { delay = 300, onSingleTap } = options;
  const lastTapRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < delay) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      if (onSingleTap) {
        timeoutRef.current = setTimeout(() => { onSingleTap(); lastTapRef.current = 0; }, delay);
      }
    }
  }, [onDoubleTap, onSingleTap, delay]);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  return { onClick: onTap, onTouchEnd: onTap };
}

// ---------------------------------------------------------------------------
// useKeyboardShortcut -- keyboard shortcut handler
// ---------------------------------------------------------------------------
export interface ShortcutConfig { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; preventDefault?: boolean; }
export function useKeyboardShortcut(shortcut: ShortcutConfig | ShortcutConfig[], callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
    const handler = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = s.alt ? e.altKey : !e.altKey;
        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (s.preventDefault !== false) e.preventDefault();
          callback();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcut, callback, enabled]);
}

// ---------------------------------------------------------------------------
// useArrowNavigation -- arrow key list navigation
// ---------------------------------------------------------------------------
export function useArrowNavigation<T>(items: T[], options: { loop?: boolean; onSelect?: (item: T, index: number) => void; initialIndex?: number } = {}) {
  const { loop = true, onSelect, initialIndex = 0 } = options;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setActiveIndex(i => {
        const next = i + 1;
        return next >= items.length ? (loop ? 0 : i) : next;
      });
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveIndex(i => {
        const prev = i - 1;
        return prev < 0 ? (loop ? items.length - 1 : i) : prev;
      });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (items[activeIndex]) onSelect?.(items[activeIndex], activeIndex);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(items.length - 1);
    }
  }, [items, loop, activeIndex, onSelect]);
  return { activeIndex, setActiveIndex, onKeyDown, activeItem: items[activeIndex] };
}

// ---------------------------------------------------------------------------
// useFocusTrap -- trap focus within container
// ---------------------------------------------------------------------------
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active = true) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    const focusable = ref.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])");
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previousFocusRef.current?.focus();
    };
  }, [ref, active]);
}

// ---------------------------------------------------------------------------
// useUndo -- undo/redo state management
// ---------------------------------------------------------------------------
export function useUndo<T>(initialState: T, maxHistory = 50) {
  const [state, setState] = useState(initialState);
  const historyRef = useRef<T[]>([initialState]);
  const indexRef = useRef(0);
  const set = useCallback((newState: T | ((prev: T) => T)) => {
    const next = typeof newState === "function" ? (newState as (prev: T) => T)(state) : newState;
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(next);
    if (historyRef.current.length > maxHistory) historyRef.current.shift();
    else indexRef.current++;
    setState(next);
  }, [state, maxHistory]);
  const undo = useCallback(() => {
    if (indexRef.current > 0) { indexRef.current--; setState(historyRef.current[indexRef.current]); }
  }, []);
  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) { indexRef.current++; setState(historyRef.current[indexRef.current]); }
  }, []);
  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;
  return { state, set, undo, redo, canUndo, canRedo, reset: () => { historyRef.current = [initialState]; indexRef.current = 0; setState(initialState); } };
}

// ---------------------------------------------------------------------------
// useClipboard -- clipboard copy/paste
// ---------------------------------------------------------------------------
export function useClipboard(options: { timeout?: number } = {}) {
  const { timeout = 2000 } = options;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), timeout);
    } catch (e) { setError(e as Error); setCopied(false); }
  }, [timeout]);
  const paste = useCallback(async () => {
    try { return await navigator.clipboard.readText(); } catch (e) { setError(e as Error); return ""; }
  }, []);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  return { copy, paste, copied, error };
}

// ---------------------------------------------------------------------------
// useMousePosition -- track mouse position
// ---------------------------------------------------------------------------
export function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return position;
}

// ---------------------------------------------------------------------------
// useElementSize -- track element dimensions
// ---------------------------------------------------------------------------
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useOrientation -- track device orientation
// ---------------------------------------------------------------------------
export function useOrientation() {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
  useEffect(() => {
    const handler = () => setOrientation(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return orientation;
}

// ---------------------------------------------------------------------------
// useIdle -- detect user idle state
// ---------------------------------------------------------------------------
export function useIdle(timeout: number = 30000) {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reset = () => { setIdle(false); if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setIdle(true), timeout); };
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    events.forEach(e => document.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { events.forEach(e => document.removeEventListener(e, reset)); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timeout]);
  return idle;
}

// ---------------------------------------------------------------------------
// useNetworkStatus -- track online/offline state
// ---------------------------------------------------------------------------
export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  return { online };
}
// useMediaQuery -- CSS media query hook

// ---------------------------------------------------------------------------
// usePrefersDarkMode -- detect dark mode preference
// ---------------------------------------------------------------------------
export function usePrefersDarkMode() {
  return useMediaQuery("(prefers-color-scheme: dark)");
}

// ---------------------------------------------------------------------------
// usePrefersReducedMotion -- detect reduced motion preference
// ---------------------------------------------------------------------------
export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
// useScrollDirection -- detect scroll direction

// ---------------------------------------------------------------------------
// useScrollProgress -- track page scroll progress
// ---------------------------------------------------------------------------
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handler = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? window.scrollY / scrollable : 0);
    };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return progress;
}

// ---------------------------------------------------------------------------
// useHoverIntent -- delayed hover with intent detection
// ---------------------------------------------------------------------------
export function useHoverIntent(delay: number = 200) {
  const [hovering, setHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEnter = useCallback(() => { timerRef.current = setTimeout(() => setHovering(true), delay); }, [delay]);
  const onLeave = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); setHovering(false); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return { hovering, onMouseEnter: onEnter, onMouseLeave: onLeave };
}

// ---------------------------------------------------------------------------
// useDebounce -- debounced value

// ---------------------------------------------------------------------------
// useThrottle -- throttled value

// ---------------------------------------------------------------------------
// useClickOutside -- detect clicks outside element

// ---------------------------------------------------------------------------
// useEventListener -- typed event listener hook
// ---------------------------------------------------------------------------
export function useEventListener<K extends keyof WindowEventMap>(eventName: K, handler: (event: WindowEventMap[K]) => void, element?: Window | HTMLElement | null) {
  const savedHandler = useRef(handler);
  useEffect(() => { savedHandler.current = handler; }, [handler]);
  useEffect(() => {
    const targetElement = element ?? window;
    if (!targetElement?.addEventListener) return;
    const eventListener = (event: Event) => savedHandler.current(event as WindowEventMap[K]);
    targetElement.addEventListener(eventName, eventListener);
    return () => targetElement.removeEventListener(eventName, eventListener);
  }, [eventName, element]);
}

// ---------------------------------------------------------------------------
// useLocalStorage -- synced localStorage state

// ---------------------------------------------------------------------------
// useSessionStorage -- synced sessionStorage state
// ---------------------------------------------------------------------------
export function useSessionStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });
  const setValue = (value: T | ((val: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    try { window.sessionStorage.setItem(key, JSON.stringify(valueToStore)); } catch { /* intentional: sessionStorage may be disabled (private mode, quota); persistence is best-effort */ }
  };
  return [storedValue, setValue];
}

// ---------------------------------------------------------------------------
// usePrevious -- previous value of a state

// ---------------------------------------------------------------------------
// useToggle -- boolean toggle state
// ---------------------------------------------------------------------------
export function useToggle(initialValue: boolean = false): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle, setValue];
}

// ---------------------------------------------------------------------------
// useInterval -- setInterval hook
// ---------------------------------------------------------------------------
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ---------------------------------------------------------------------------
// useTimeout -- setTimeout hook
// ---------------------------------------------------------------------------
export function useTimeout(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setTimeout(() => savedCallback.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
}

// ---------------------------------------------------------------------------
// useIntersectionObserver -- intersection observer hook
// ---------------------------------------------------------------------------
export function useIntersectionObserver<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setEntry(entry), options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.root, options?.rootMargin, options?.threshold]);
  return { ref, entry, isIntersecting: entry?.isIntersecting ?? false };
}

// ---------------------------------------------------------------------------
// useMutationObserver -- DOM mutation observer hook
// ---------------------------------------------------------------------------
export function useMutationObserver<T extends HTMLElement>(callback: MutationCallback, options?: MutationObserverInit) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new MutationObserver(callback);
    observer.observe(el, options || { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [callback, options]);
  return ref;
}

// ---------------------------------------------------------------------------
// useFullscreen -- fullscreen API hook
// ---------------------------------------------------------------------------
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const enter = useCallback(async () => { if (ref.current) { await ref.current.requestFullscreen(); setIsFullscreen(true); } }, []);
  const exit = useCallback(async () => { await document.exitFullscreen(); setIsFullscreen(false); }, []);
  const toggle = useCallback(() => isFullscreen ? exit() : enter(), [isFullscreen, enter, exit]);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  return { ref, isFullscreen, enter, exit, toggle };
}

// ---------------------------------------------------------------------------
// usePageVisibility -- page visibility API hook
// ---------------------------------------------------------------------------
export function usePageVisibility() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}

// ---------------------------------------------------------------------------
// useBattery -- battery status API hook
// ---------------------------------------------------------------------------
export function useBattery() {
  const [battery, setBattery] = useState<{ charging: boolean; level: number; chargingTime: number; dischargingTime: number } | null>(null);
  useEffect(() => {
    let bm: any;
    const update = (b: any) => setBattery({ charging: b.charging, level: b.level, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime });
    (navigator as any).getBattery?.().then((b: any) => { bm = b; update(b); b.addEventListener("chargingchange", () => update(b)); b.addEventListener("levelchange", () => update(b)); });
    return () => { if (bm) { bm.removeEventListener("chargingchange", () => {}); bm.removeEventListener("levelchange", () => {}); } };
  }, []);
  return battery;
}

// ---------------------------------------------------------------------------
// useGeolocation -- geolocation API hook
// ---------------------------------------------------------------------------
export function useGeolocation(options?: PositionOptions) {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) { setError({ code: 0, message: "Geolocation not supported" } as any); setLoading(false); return; }
    const id = navigator.geolocation.watchPosition(pos => { setPosition(pos); setError(null); setLoading(false); }, err => { setError(err); setLoading(false); }, options);
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { position, error, loading };
}

// ---------------------------------------------------------------------------
// useDocumentTitle -- set document title
// ---------------------------------------------------------------------------
export function useDocumentTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}

// ---------------------------------------------------------------------------
// useFavicon -- change favicon dynamically
// ---------------------------------------------------------------------------
export function useFavicon(href: string) {
  useEffect(() => {
    const link = document.querySelector("link[rel~=icon]") as HTMLLinkElement || document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
  }, [href]);
}

// ---------------------------------------------------------------------------
// useScript -- load external script
// ---------------------------------------------------------------------------
export function useScript(src: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [src]);
  return status;
}

// ---------------------------------------------------------------------------
// useStylesheet -- load external stylesheet
// ---------------------------------------------------------------------------
export function useStylesheet(href: string) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => setLoaded(true);
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [href]);
  return loaded;
}

// ---------------------------------------------------------------------------
// useCopyToClipboard -- clipboard copy utility
// ---------------------------------------------------------------------------
export function useCopyToClipboard(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }, []);
  return [copied, copy];
}

// ---------------------------------------------------------------------------
// useCounter -- counter with increment/decrement
// ---------------------------------------------------------------------------
export function useCounter(initialValue: number = 0, options?: { min?: number; max?: number; step?: number }) {
  const { min = -Infinity, max = Infinity, step = 1 } = options || {};
  const [count, setCount] = useState(initialValue);
  const increment = useCallback(() => setCount(c => Math.min(max, c + step)), [max, step]);
  const decrement = useCallback(() => setCount(c => Math.max(min, c - step)), [min, step]);
  const reset = useCallback(() => setCount(initialValue), [initialValue]);
  const set = useCallback((v: number) => setCount(Math.max(min, Math.min(max, v))), [min, max]);
  return { count, increment, decrement, reset, set };
}

// ---------------------------------------------------------------------------
// useList -- list state management
// ---------------------------------------------------------------------------
export function useList<T>(initialList: T[] = []) {
  const [list, setList] = useState(initialList);
  const push = useCallback((item: T) => setList(l => [...l, item]), []);
  const removeAt = useCallback((index: number) => setList(l => l.filter((_, i) => i !== index)), []);
  const insertAt = useCallback((index: number, item: T) => setList(l => [...l.slice(0, index), item, ...l.slice(index)]), []);
  const updateAt = useCallback((index: number, item: T) => setList(l => l.map((v, i) => i === index ? item : v)), []);
  const clear = useCallback(() => setList([]), []);
  const filter = useCallback((fn: (item: T) => boolean) => setList(l => l.filter(fn)), []);
  return { list, setList, push, removeAt, insertAt, updateAt, clear, filter };
}

// ---------------------------------------------------------------------------
// useMap -- map state management
// ---------------------------------------------------------------------------
export function useMap<K, V>(initialMap?: Map<K, V> | [K, V][]) {
  const [map, setMap] = useState(() => new Map(initialMap));
  const set = useCallback((key: K, value: V) => setMap(m => new Map(m).set(key, value)), []);
  const remove = useCallback((key: K) => setMap(m => { const nm = new Map(m); nm.delete(key); return nm; }), []);
  const clear = useCallback(() => setMap(new Map()), []);
  const has = useCallback((key: K) => map.has(key), [map]);
  const get = useCallback((key: K) => map.get(key), [map]);
  return { map, set, remove, clear, has, get };
}

// ---------------------------------------------------------------------------
// useSet -- set state management
// ---------------------------------------------------------------------------
export function useSet<T>(initialSet?: Set<T> | T[]) {
  const [set, setSet] = useState(() => new Set(initialSet));
  const add = useCallback((value: T) => setSet(s => new Set(s).add(value)), []);
  const remove = useCallback((value: T) => setSet(s => { const ns = new Set(s); ns.delete(value); return ns; }), []);
  const toggle = useCallback((value: T) => setSet(s => { const ns = new Set(s); if (ns.has(value)) ns.delete(value); else ns.add(value); return ns; }), []);
  const clear = useCallback(() => setSet(new Set()), []);
  const has = useCallback((value: T) => set.has(value), [set]);
  return { set, add, remove, toggle, clear, has };
}

// ---------------------------------------------------------------------------
// useQueue -- FIFO queue
// ---------------------------------------------------------------------------
export function useQueue<T>(initialQueue: T[] = []) {
  const [queue, setQueue] = useState(initialQueue);
  const enqueue = useCallback((item: T) => setQueue(q => [...q, item]), []);
  const dequeue = useCallback(() => { let first: T | undefined; setQueue(q => { first = q[0]; return q.slice(1); }); return first; }, []);
  const peek = useCallback(() => queue[0], [queue]);
  const clear = useCallback(() => setQueue([]), []);
  return { queue, enqueue, dequeue, peek, clear, size: queue.length, isEmpty: queue.length === 0 };
}

// ---------------------------------------------------------------------------
// useStack -- LIFO stack
// ---------------------------------------------------------------------------
export function useStack<T>(initialStack: T[] = []) {
  const [stack, setStack] = useState(initialStack);
  const push = useCallback((item: T) => setStack(s => [...s, item]), []);
  const pop = useCallback(() => { let last: T | undefined; setStack(s => { last = s[s.length - 1]; return s.slice(0, -1); }); return last; }, []);
  const peek = useCallback(() => stack[stack.length - 1], [stack]);
  const clear = useCallback(() => setStack([]), []);
  return { stack, push, pop, peek, clear, size: stack.length, isEmpty: stack.length === 0 };
}

// ---------------------------------------------------------------------------
// useAsync -- async function wrapper
// ---------------------------------------------------------------------------
export function useAsync<T>(asyncFn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: Error | null }>({ loading: true, data: null, error: null });
  useEffect(() => {
    setState({ loading: true, data: null, error: null });
    asyncFn().then(data => setState({ loading: false, data, error: null })).catch(error => setState({ loading: false, data: null, error }));
  }, deps);
  return state;
}

// ---------------------------------------------------------------------------
// useFetch -- fetch data with state
// ---------------------------------------------------------------------------
export function useFetch<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    setLoading(true);
    fetch(url, options).then(r => r.json()).then(setData).catch(setError).finally(() => setLoading(false));
  }, [url]);
  return { data, loading, error, refetch: () => { setLoading(true); fetch(url, options).then(r => r.json()).then(setData).catch(setError).finally(() => setLoading(false)); } };
}

// ---------------------------------------------------------------------------
// useForm -- form state management
// ---------------------------------------------------------------------------
export function useForm<T extends Record<string, any>>(initialValues: T, validate?: (values: T) => Partial<Record<keyof T, string>>) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const handleChange = (name: keyof T) => (e: React.ChangeEvent<HTMLInputElement>) => { setValues(v => ({ ...v, [name]: e.target.value })); };
  const handleBlur = (name: keyof T) => () => { setTouched(t => ({ ...t, [name]: true })); if (validate) setErrors(validate(values)); };
  const setValue = (name: keyof T, value: any) => setValues(v => ({ ...v, [name]: value }));
  const reset = () => { setValues(initialValues); setErrors({}); setTouched({}); };
  const isValid = Object.keys(errors).length === 0;
  return { values, errors, touched, handleChange, handleBlur, setValue, reset, isValid, setValues };
}

// ---------------------------------------------------------------------------
// useFieldArray -- dynamic form array fields
// ---------------------------------------------------------------------------
export function useFieldArray<T>(initialFields: T[] = []) {
  const [fields, setFields] = useState(initialFields.map((v, i) => ({ id: i, value: v })));
  const [nextId, setNextId] = useState(initialFields.length);
  const append = useCallback((value: T) => { setFields(f => [...f, { id: nextId, value }]); setNextId(n => n + 1); }, [nextId]);
  const remove = useCallback((index: number) => setFields(f => f.filter((_, i) => i !== index)), []);
  const insert = useCallback((index: number, value: T) => { setFields(f => [...f.slice(0, index), { id: nextId, value }, ...f.slice(index)]); setNextId(n => n + 1); }, [nextId]);
  const move = useCallback((from: number, to: number) => setFields(f => { const nf = [...f]; const [item] = nf.splice(from, 1); nf.splice(to, 0, item); return nf; }), []);
  const update = useCallback((index: number, value: T) => setFields(f => f.map((item, i) => i === index ? { ...item, value } : item)), []);
  return { fields, append, remove, insert, move, update, replace: setFields };
}

// ---------------------------------------------------------------------------
// useSearchParams -- URL search params
// ---------------------------------------------------------------------------
export function useSearchParams() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const get = useCallback((key: string) => params.get(key), [params]);
  const set = useCallback((key: string, value: string) => { const np = new URLSearchParams(params); np.set(key, value); window.history.replaceState({}, "", "?" + np.toString()); setParams(np); }, [params]);
  const remove = useCallback((key: string) => { const np = new URLSearchParams(params); np.delete(key); window.history.replaceState({}, "", "?" + np.toString()); setParams(np); }, [params]);
  return { params, get, set, remove };
}

// ---------------------------------------------------------------------------
// useHash -- URL hash state
// ---------------------------------------------------------------------------
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const updateHash = useCallback((newHash: string) => { window.location.hash = newHash; setHash(newHash); }, []);
  return [hash, updateHash] as const;
}

// ---------------------------------------------------------------------------
// useOnlineStatus -- online/offline detection
// ---------------------------------------------------------------------------
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);
  return online;
}

// ---------------------------------------------------------------------------
// usePermission -- browser permission status
// ---------------------------------------------------------------------------
export function usePermission(name: PermissionName) {
  const [state, setState] = useState<PermissionState | null>(null);
  useEffect(() => {
    navigator.permissions.query({ name }).then(status => {
      setState(status.state);
      status.onchange = () => setState(status.state);
    }).catch(() => setState(null));
  }, [name]);
  return state;
}

// ---------------------------------------------------------------------------
// useShare -- Web Share API
// ---------------------------------------------------------------------------
export function useShare() {
  const [shared, setShared] = useState(false);
  const canShare = typeof navigator.share === "function";
  const share = useCallback(async (data: ShareData) => {
    if (!canShare) return false;
    try { await navigator.share(data); setShared(true); setTimeout(() => setShared(false), 2000); return true; }
    catch { return false; }
  }, [canShare]);
  return { canShare, share, shared };
}

// ---------------------------------------------------------------------------
// useVibrate -- device vibration
// ---------------------------------------------------------------------------
export function useVibrate() {
  const canVibrate = typeof navigator.vibrate === "function";
  const vibrate = useCallback((pattern: number | number[]) => { if (canVibrate) navigator.vibrate(pattern); }, [canVibrate]);
  const stop = useCallback(() => { if (canVibrate) navigator.vibrate(0); }, [canVibrate]);
  return { canVibrate, vibrate, stop };
}

// ---------------------------------------------------------------------------
// useNotification -- browser notifications
// ---------------------------------------------------------------------------
export function useNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() => "Notification" in window ? Notification.permission : "denied");
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "denied";
    const perm = await Notification.requestPermission();
    setPermission(perm);
    return perm;
  }, []);
  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (permission === "granted" && notificationsAllowed()) return new Notification(title, options);
    return null;
  }, [permission]);
  return { permission, requestPermission, notify };
}

// ---------------------------------------------------------------------------
// useWebSocket -- WebSocket connection
// ---------------------------------------------------------------------------
export function useWebSocket(url: string) {
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setReadyState(WebSocket.OPEN);
    ws.onclose = () => setReadyState(WebSocket.CLOSED);
    ws.onmessage = (msg) => setLastMessage(msg);
    return () => ws.close();
  }, [url]);
  const send = useCallback((data: string | ArrayBufferLike | Blob) => wsRef.current?.send(data), []);
  return { lastMessage, readyState, send };
}

// ---------------------------------------------------------------------------
// useEventSource -- Server-Sent Events
// ---------------------------------------------------------------------------
export function useEventSource(url: string) {
  const [lastEvent, setLastEvent] = useState<MessageEvent | null>(null);
  const [readyState, setReadyState] = useState<number>(0);
  useEffect(() => {
    const es = new EventSource(url);
    es.onopen = () => setReadyState(es.readyState);
    es.onmessage = (e) => setLastEvent(e);
    es.onerror = () => setReadyState(es.readyState);
    return () => es.close();
  }, [url]);
  return { lastEvent, readyState };
}

// ---------------------------------------------------------------------------
// useWorker -- Web Worker management
// ---------------------------------------------------------------------------
export function useWorker<T, R>(workerFn: (data: T) => R) {
  const [result, setResult] = useState<R | null>(null);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const postMessage = useCallback((data: T) => {
    setLoading(true);
    const blob = new Blob(["self.onmessage = function(e) { self.postMessage((" + workerFn.toString() + ")(e.data)); }"], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;
    worker.onmessage = (e) => { setResult(e.data); setLoading(false); worker.terminate(); };
    worker.postMessage(data);
  }, [workerFn]);
  useEffect(() => () => workerRef.current?.terminate(), []);
  return { result, loading, postMessage };
}

// ---------------------------------------------------------------------------
// useBroadcastChannel -- cross-tab communication
// ---------------------------------------------------------------------------
export function useBroadcastChannel<T>(channelName: string) {
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;
    channel.onmessage = (e) => setLastMessage(e.data);
    return () => channel.close();
  }, [channelName]);
  const postMessage = useCallback((data: T) => channelRef.current?.postMessage(data), []);
  return { lastMessage, postMessage };
}

// ---------------------------------------------------------------------------
// useSpeechRecognition -- speech to text
// ---------------------------------------------------------------------------
export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const start = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e: any) => { const t = Array.from(e.results).map((r: any) => r[0].transcript).join(""); setTranscript(t); };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  }, []);
  const stop = useCallback(() => { recognitionRef.current?.stop(); setListening(false); }, []);
  return { transcript, listening, start, stop };
}

// ---------------------------------------------------------------------------
// useSpeechSynthesis -- text to speech
// ---------------------------------------------------------------------------
export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const loadVoices = () => setVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);
  const speak = useCallback((text: string, options?: { voice?: SpeechSynthesisVoice; rate?: number; pitch?: number }) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (options?.voice) utterance.voice = options.voice;
    if (options?.rate) utterance.rate = options.rate;
    if (options?.pitch) utterance.pitch = options.pitch;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  }, []);
  const cancel = useCallback(() => { speechSynthesis.cancel(); setSpeaking(false); }, []);
  return { speaking, voices, speak, cancel };
}

// ---------------------------------------------------------------------------
// useClipboardRead -- read from clipboard
// ---------------------------------------------------------------------------
export function useClipboardRead() {
  const [text, setText] = useState<string | null>(null);
  const read = useCallback(async () => {
    try { const t = await navigator.clipboard.readText(); setText(t); return t; }
    catch { setText(null); return null; }
  }, []);
  return { text, read };
}

// ---------------------------------------------------------------------------
// useIndexedDB -- IndexedDB storage
// ---------------------------------------------------------------------------
export function useIndexedDB<T>(dbName: string, storeName: string) {
  const dbRef = useRef<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => { const db = (e.target as IDBOpenDBRequest).result; if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "id" }); };
    request.onsuccess = (e) => { dbRef.current = (e.target as IDBOpenDBRequest).result; setReady(true); };
  }, [dbName, storeName]);
  const put = useCallback(async (id: string, value: T) => {
    if (!dbRef.current) return;
    const tx = dbRef.current.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put({ id, value });
  }, [storeName]);
  const get = useCallback(async (id: string): Promise<T | null> => {
    if (!dbRef.current) return null;
    return new Promise(resolve => {
      const tx = dbRef.current!.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result?.value ?? null);
    });
  }, [storeName]);
  const remove = useCallback(async (id: string) => {
    if (!dbRef.current) return;
    const tx = dbRef.current.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
  }, [storeName]);
  return { ready, put, get, remove };
}

// ---------------------------------------------------------------------------
// useCamera -- camera access
// ---------------------------------------------------------------------------
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const start = useCallback(async (constraints?: MediaStreamConstraints) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, ...constraints });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActive(true);
    } catch { setActive(false); }
  }, []);
  const stop = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); setActive(false); }, []);
  const capture = useCallback(() => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL("image/png");
  }, []);
  return { videoRef, active, start, stop, capture };
}

// ---------------------------------------------------------------------------
// useMicrophone -- microphone access
// ---------------------------------------------------------------------------
export function useMicrophone() {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: "audio/webm" })));
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch { setRecording(false); }
  }, []);
  const stop = useCallback(() => { recorderRef.current?.stop(); streamRef.current?.getTracks().forEach(t => t.stop()); setRecording(false); }, []);
  return { recording, audioUrl, start, stop };
}

// ---------------------------------------------------------------------------
// useScreenShare -- screen sharing
// ---------------------------------------------------------------------------
export function useScreenShare() {
  const streamRef = useRef<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => setSharing(false);
      setSharing(true);
      return stream;
    } catch { setSharing(false); return null; }
  }, []);
  const stop = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); setSharing(false); }, []);
  return { sharing, stream: streamRef.current, start, stop };
}

// ---------------------------------------------------------------------------
// useDropzone -- file drop zone
// ---------------------------------------------------------------------------
export function useDropzone(onDrop: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files); onDrop(files); }, [onDrop]);
  return { isDragging, handlers: { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop } };
}

// ---------------------------------------------------------------------------
// useImageLoad -- image loading state
// ---------------------------------------------------------------------------
export function useImageLoad(src: string) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setLoaded(false); setError(false);
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setError(true);
    img.src = src;
  }, [src]);
  return { loaded, error };
}

// ---------------------------------------------------------------------------
// useAudio -- audio playback
// ---------------------------------------------------------------------------
export function useAudio(src: string) {
  const audioRef = useRef(new Audio(src));
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    const audio = audioRef.current;
    audio.src = src;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => setPlaying(false);
    return () => { audio.pause(); };
  }, [src]);
  const play = useCallback(() => { audioRef.current.play(); setPlaying(true); }, []);
  const pause = useCallback(() => { audioRef.current.pause(); setPlaying(false); }, []);
  const seek = useCallback((time: number) => { audioRef.current.currentTime = time; }, []);
  const setVolume = useCallback((vol: number) => { audioRef.current.volume = Math.max(0, Math.min(1, vol)); }, []);
  return { playing, duration, currentTime, play, pause, seek, setVolume };
}

// ---------------------------------------------------------------------------
// useKeyPress -- single key press detection
// ---------------------------------------------------------------------------
export function useKeyPress(targetKey: string) {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === targetKey) setPressed(true); };
    const up = (e: KeyboardEvent) => { if (e.key === targetKey) setPressed(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [targetKey]);
  return pressed;
}

// ---------------------------------------------------------------------------
// useKeyCombo -- key combination detection
// ---------------------------------------------------------------------------
export function useKeyCombo(keys: string[], callback: () => void) {
  const pressedKeys = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      pressedKeys.current.add(e.key.toLowerCase());
      if (keys.every(k => pressedKeys.current.has(k.toLowerCase()))) callback();
    };
    const up = (e: KeyboardEvent) => pressedKeys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [keys, callback]);
}

// ---------------------------------------------------------------------------
// usePointerLock -- pointer lock API
// ---------------------------------------------------------------------------
export function usePointerLock() {
  const elementRef = useRef<HTMLElement | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const handleChange = () => setLocked(document.pointerLockElement === elementRef.current);
    document.addEventListener("pointerlockchange", handleChange);
    return () => document.removeEventListener("pointerlockchange", handleChange);
  }, []);
  const lock = useCallback(() => elementRef.current?.requestPointerLock(), []);
  const unlock = useCallback(() => document.exitPointerLock(), []);
  return { elementRef, locked, lock, unlock };
}

// ---------------------------------------------------------------------------
// useWakeLock -- screen wake lock
// ---------------------------------------------------------------------------
export function useWakeLock() {
  const wakeLockRef = useRef<any>(null);
  const [active, setActive] = useState(false);
  const request = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setActive(true);
        wakeLockRef.current.addEventListener("release", () => setActive(false));
      }
    } catch { setActive(false); }
  }, []);
  const release = useCallback(() => { wakeLockRef.current?.release(); setActive(false); }, []);
  return { active, request, release };
}

// ---------------------------------------------------------------------------
// useGamepad -- gamepad input. Polls only while at least one gamepad is
// connected and the document is visible; idle cost is zero.
// ---------------------------------------------------------------------------
export function useGamepad() {
  const [gamepads, setGamepads] = useState<(Gamepad | null)[]>([]);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setGamepads(Array.from(navigator.getGamepads()));
    };
    const start = () => { if (interval === null) interval = setInterval(update, 100); };
    const stop = () => { if (interval !== null) { clearInterval(interval); interval = null; } };
    const connect = () => { update(); start(); };
    const disconnect = () => {
      update();
      const any = (navigator.getGamepads?.() || []).some(Boolean);
      if (!any) stop();
    };
    window.addEventListener("gamepadconnected", connect);
    window.addEventListener("gamepaddisconnected", disconnect);
    if ((navigator.getGamepads?.() || []).some(Boolean)) { update(); start(); }
    return () => {
      window.removeEventListener("gamepadconnected", connect);
      window.removeEventListener("gamepaddisconnected", disconnect);
      stop();
    };
  }, []);
  return gamepads;
}

// ---------------------------------------------------------------------------
// useColorScheme -- system color scheme
// ---------------------------------------------------------------------------
export function useColorScheme() {
  const [scheme, setScheme] = useState<"light" | "dark">(() => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setScheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return scheme;
}

// ---------------------------------------------------------------------------
// useContrastMode -- high contrast preference
// ---------------------------------------------------------------------------
export function useContrastMode() {
  const [highContrast, setHighContrast] = useState(() => window.matchMedia("(prefers-contrast: more)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-contrast: more)");
    const handler = (e: MediaQueryListEvent) => setHighContrast(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return highContrast;
}

// ---------------------------------------------------------------------------
// usePrint -- print functionality
// ---------------------------------------------------------------------------
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  const print = useCallback(() => window.print(), []);
  return { printing, print };
}

// ---------------------------------------------------------------------------
// useSelection -- text selection
// ---------------------------------------------------------------------------
export function useSelection() {
  const [selection, setSelection] = useState<string>("");
  useEffect(() => {
    const handler = () => setSelection(window.getSelection()?.toString() || "");
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);
  return selection;
}

// ---------------------------------------------------------------------------
// useStorageQuota -- storage estimate
// ---------------------------------------------------------------------------
export function useStorageQuota() {
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => setQuota({ usage: est.usage || 0, quota: est.quota || 0 }));
    }
  }, []);
  return quota;
}


// ---------------------------------------------------------------------------
// useDeviceMemory -- device memory info
// ---------------------------------------------------------------------------
export function useDeviceMemory() {
  const memory = (navigator as any).deviceMemory || null;
  return memory;
}

// ---------------------------------------------------------------------------
// useHardwareConcurrency -- CPU cores count
// ---------------------------------------------------------------------------
export function useHardwareConcurrency() {
  return navigator.hardwareConcurrency || 1;
}

// ---------------------------------------------------------------------------
// useConnectionType -- network connection type
// ---------------------------------------------------------------------------
export function useConnectionType() {
  const [type, setType] = useState<string | null>(() => (navigator as any).connection?.effectiveType || null);
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;
    const handler = () => setType(conn.effectiveType);
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);
  return type;
}

// ---------------------------------------------------------------------------
// useSaveData -- data saver mode
// ---------------------------------------------------------------------------
export function useSaveData() {
  const [saveData, setSaveData] = useState<boolean>(() => (navigator as any).connection?.saveData || false);
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;
    const handler = () => setSaveData(conn.saveData);
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);
  return saveData;
}

// ---------------------------------------------------------------------------
// useDownlink -- network downlink speed
// ---------------------------------------------------------------------------
export function useDownlink() {
  const [downlink, setDownlink] = useState<number | null>(() => (navigator as any).connection?.downlink || null);
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;
    const handler = () => setDownlink(conn.downlink);
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);
  return downlink;
}

// ---------------------------------------------------------------------------
// useRTT -- network round trip time
// ---------------------------------------------------------------------------
export function useRTT() {
  const [rtt, setRTT] = useState<number | null>(() => (navigator as any).connection?.rtt || null);
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;
    const handler = () => setRTT(conn.rtt);
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);
  return rtt;
}

// ---------------------------------------------------------------------------
// useLongPressRelease -- long press with release detection
// ---------------------------------------------------------------------------
export function useLongPressRelease(callback: () => void, duration: number = 500) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onPressStart = useCallback(() => {
    setPressing(true);
    timerRef.current = setTimeout(callback, duration);
  }, [callback, duration]);
  const onPressEnd = useCallback(() => {
    setPressing(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  return { pressing, handlers: { onMouseDown: onPressStart, onMouseUp: onPressEnd, onMouseLeave: onPressEnd, onTouchStart: onPressStart, onTouchEnd: onPressEnd } };
}

// ---------------------------------------------------------------------------
// useMultiTouch -- multi-touch gestures
// ---------------------------------------------------------------------------
export function useMultiTouch() {
  const [touches, setTouches] = useState<Touch[]>([]);
  const handlers = {
    onTouchStart: (e: React.TouchEvent) => setTouches(Array.from(e.touches as unknown as TouchList) as Touch[]),
    onTouchMove: (e: React.TouchEvent) => setTouches(Array.from(e.touches as unknown as TouchList) as Touch[]),
    onTouchEnd: (e: React.TouchEvent) => setTouches(Array.from(e.touches as unknown as TouchList) as Touch[]),
  };
  return { touches, handlers, count: touches.length };
}

// ---------------------------------------------------------------------------
// useTripleClick -- triple click detection
// ---------------------------------------------------------------------------
export function useTripleClick(callback: () => void, delay: number = 300) {
  const clickCount = useRef(0);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const handleClick = useCallback(() => {
    clickCount.current++;
    if (timer.current) clearTimeout(timer.current);
    if (clickCount.current === 3) { callback(); clickCount.current = 0; }
    else timer.current = setTimeout(() => { clickCount.current = 0; }, delay);
  }, [callback, delay]);
  return handleClick;
}

// ---------------------------------------------------------------------------
// useElementBounds -- element bounding rect
// ---------------------------------------------------------------------------
export function useElementBounds<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  useEffect(() => {
    const update = () => { if (ref.current) setBounds(ref.current.getBoundingClientRect()); };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update); };
  }, []);
  return { ref, bounds };
}


// ---------------------------------------------------------------------------
// useScrollEnd -- scroll end detection
// ---------------------------------------------------------------------------
export function useScrollEnd(callback: () => void, delay: number = 150) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(callback, delay);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => { window.removeEventListener("scroll", handler); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [callback, delay]);
}

// ---------------------------------------------------------------------------
// useElementScroll -- element scroll position
// ---------------------------------------------------------------------------
export function useElementScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => setScroll({ x: el.scrollLeft, y: el.scrollTop });
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);
  return { ref, scroll };
}

// ---------------------------------------------------------------------------
// useScrollToElement -- scroll element into view
// ---------------------------------------------------------------------------
export function useScrollToElement() {
  const scrollTo = useCallback((element: HTMLElement | string, options?: ScrollIntoViewOptions) => {
    const el = typeof element === "string" ? document.querySelector(element) : element;
    el?.scrollIntoView({ behavior: "smooth", block: "center", ...options });
  }, []);
  return scrollTo;
}


// ---------------------------------------------------------------------------
// useSticky -- sticky element detection
// ---------------------------------------------------------------------------
export function useSticky(threshold: number = 0) {
  const ref = useRef<HTMLElement | null>(null);
  const [sticky, setSticky] = useState(false);
  useEffect(() => {
    const handler = () => { if (ref.current) setSticky(ref.current.getBoundingClientRect().top <= threshold); };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);
  return { ref, sticky };
}


// ---------------------------------------------------------------------------
// useSmoothScroll -- smooth scroll navigation
// ---------------------------------------------------------------------------
export function useSmoothScroll() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);
  const scrollTo = useCallback((y: number) => window.scrollTo({ top: y, behavior: "smooth" }), []);
  return scrollTo;
}


// ---------------------------------------------------------------------------
// useDragSelect -- drag selection box
// ---------------------------------------------------------------------------
export function useDragSelect<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    startPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelecting(true);
  }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selecting || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(startPos.current.x, e.clientX - rect.left);
    const y = Math.min(startPos.current.y, e.clientY - rect.top);
    const width = Math.abs(e.clientX - rect.left - startPos.current.x);
    const height = Math.abs(e.clientY - rect.top - startPos.current.y);
    setSelection({ x, y, width, height });
  }, [selecting]);
  const handleMouseUp = useCallback(() => { setSelecting(false); setSelection(null); }, []);
  return { ref, selection, selecting, handlers: { onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp } };
}

// ---------------------------------------------------------------------------
// usePanZoom -- pan and zoom controls
// ---------------------------------------------------------------------------
export function usePanZoom(options?: { minZoom?: number; maxZoom?: number; zoomStep?: number }) {
  const { minZoom = 0.1, maxZoom = 5, zoomStep = 0.1 } = options || {};
  const [transform, setTransform] = useState({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const startPan = useCallback((e: React.MouseEvent) => { setPanning(true); lastPos.current = { x: e.clientX, y: e.clientY }; }, []);
  const pan = useCallback((e: React.MouseEvent) => { if (!panning) return; setTransform(t => ({ ...t, x: t.x + e.clientX - lastPos.current.x, y: t.y + e.clientY - lastPos.current.y })); lastPos.current = { x: e.clientX, y: e.clientY }; }, [panning]);
  const endPan = useCallback(() => setPanning(false), []);
  const zoomIn = useCallback(() => setTransform(t => ({ ...t, zoom: Math.min(maxZoom, t.zoom + zoomStep) })), [maxZoom, zoomStep]);
  const zoomOut = useCallback(() => setTransform(t => ({ ...t, zoom: Math.max(minZoom, t.zoom - zoomStep) })), [minZoom, zoomStep]);
  const reset = useCallback(() => setTransform({ x: 0, y: 0, zoom: 1 }), []);
  return { transform, panning, handlers: { onMouseDown: startPan, onMouseMove: pan, onMouseUp: endPan, onMouseLeave: endPan }, zoomIn, zoomOut, reset, setTransform };
}

// ---------------------------------------------------------------------------
// useTransformable -- transform (move/resize/rotate)
// ---------------------------------------------------------------------------
export function useTransformable(initial?: { x: number; y: number; width: number; height: number; rotation: number }) {
  const [transform, setTransform] = useState(initial || { x: 0, y: 0, width: 100, height: 100, rotation: 0 });
  const move = useCallback((dx: number, dy: number) => setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy })), []);
  const resize = useCallback((dw: number, dh: number) => setTransform(t => ({ ...t, width: Math.max(10, t.width + dw), height: Math.max(10, t.height + dh) })), []);
  const rotate = useCallback((angle: number) => setTransform(t => ({ ...t, rotation: t.rotation + angle })), []);
  const setPosition = useCallback((x: number, y: number) => setTransform(t => ({ ...t, x, y })), []);
  const setSize = useCallback((width: number, height: number) => setTransform(t => ({ ...t, width, height })), []);
  return { transform, move, resize, rotate, setPosition, setSize, setTransform };
}

// ---------------------------------------------------------------------------
// useResizeHandle -- resize handle functionality
// ---------------------------------------------------------------------------
export function useResizeHandle(onResize: (width: number, height: number) => void) {
  const [resizing, setResizing] = useState(false);
  const startSize = useRef({ width: 0, height: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startResize = useCallback((e: React.MouseEvent, currentWidth: number, currentHeight: number) => {
    e.preventDefault();
    setResizing(true);
    startSize.current = { width: currentWidth, height: currentHeight };
    startPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  useEffect(() => {
    if (!resizing) return;
    const move = (e: MouseEvent) => { const w = startSize.current.width + e.clientX - startPos.current.x; const h = startSize.current.height + e.clientY - startPos.current.y; onResize(Math.max(10, w), Math.max(10, h)); };
    const up = () => setResizing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [resizing, onResize]);
  return { resizing, startResize };
}

// ---------------------------------------------------------------------------
// useDraggableList -- reorderable list
// ---------------------------------------------------------------------------
export function useDraggableList<T>(initialItems: T[]) {
  const [items, setItems] = useState(initialItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const onDragStart = useCallback((index: number) => setDragIndex(index), []);
  const onDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setItems(items => { const newItems = [...items]; const [removed] = newItems.splice(dragIndex, 1); newItems.splice(index, 0, removed); return newItems; });
    setDragIndex(index);
  }, [dragIndex]);
  const onDragEnd = useCallback(() => setDragIndex(null), []);
  return { items, setItems, dragIndex, onDragStart, onDragOver, onDragEnd };
}

// ---------------------------------------------------------------------------
// useClampedValue -- clamped numeric value
// ---------------------------------------------------------------------------
export function useClampedValue(initial: number, min: number, max: number) {
  const [value, setValue] = useState(Math.max(min, Math.min(max, initial)));
  const set = useCallback((v: number) => setValue(Math.max(min, Math.min(max, v))), [min, max]);
  const increment = useCallback((step: number = 1) => set(value + step), [value, set]);
  const decrement = useCallback((step: number = 1) => set(value - step), [value, set]);
  return { value, set, increment, decrement };
}
// ---------------------------------------------------------------------------
// useMouseDelta -- track mouse movement delta
// ---------------------------------------------------------------------------
export function useMouseDelta() {
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const prevPos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setDelta({ x: e.clientX - prevPos.current.x, y: e.clientY - prevPos.current.y });
      prevPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);
  return delta;
}

// ---------------------------------------------------------------------------
// useAccelerometer -- device accelerometer data
// ---------------------------------------------------------------------------
export function useAccelerometer() {
  const [acceleration, setAcceleration] = useState({ x: 0, y: 0, z: 0 });
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) setAcceleration({ x: e.accelerationIncludingGravity.x || 0, y: e.accelerationIncludingGravity.y || 0, z: e.accelerationIncludingGravity.z || 0 });
    };
    window.addEventListener("devicemotion", handler as EventListener);
    return () => window.removeEventListener("devicemotion", handler as EventListener);
  }, []);
  return acceleration;
}

// ---------------------------------------------------------------------------
// useGyroscope -- device rotation rate
// ---------------------------------------------------------------------------
export function useGyroscope() {
  const [rotation, setRotation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      setRotation({ alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 });
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);
  return rotation;
}

// ---------------------------------------------------------------------------
// useProximity -- proximity sensor
// ---------------------------------------------------------------------------
export function useProximity() {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if ("onuserproximity" in window) {
      const handler = (e: any) => setNear(e.near);
      window.addEventListener("userproximity", handler);
      return () => window.removeEventListener("userproximity", handler);
    }
  }, []);
  return near;
}

// ---------------------------------------------------------------------------
// useAmbientLight -- ambient light sensor
// ---------------------------------------------------------------------------
export function useAmbientLight() {
  const [illuminance, setIlluminance] = useState<number | null>(null);
  useEffect(() => {
    if ("ondevicelight" in window) {
      const handler = (e: any) => setIlluminance(e.value);
      window.addEventListener("devicelight", handler);
      return () => window.removeEventListener("devicelight", handler);
    }
  }, []);
  return illuminance;
}


// ---------------------------------------------------------------------------
// useNetworkInformation -- detailed network info
// ---------------------------------------------------------------------------
export function useNetworkInformation() {
  const conn = (navigator as any).connection;
  const [info, setInfo] = useState({ effectiveType: conn?.effectiveType || "unknown", downlink: conn?.downlink || 0, rtt: conn?.rtt || 0, saveData: conn?.saveData || false });
  useEffect(() => {
    if (!conn) return;
    const update = () => setInfo({ effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData });
    conn.addEventListener("change", update);
    return () => conn.removeEventListener("change", update);
  }, []);
  return info;
}

// ---------------------------------------------------------------------------
// useIdleCallback -- request idle callback
// ---------------------------------------------------------------------------
export function useIdleCallback(callback: () => void, options?: { timeout?: number }) {
  useEffect(() => {
    if (!("requestIdleCallback" in window)) { callback(); return; }
    const id = (window as any).requestIdleCallback(callback, options);
    return () => (window as any).cancelIdleCallback(id);
  }, [callback, options]);
}
// ---------------------------------------------------------------------------
// useAnimationFrame -- requestAnimationFrame hook
// ---------------------------------------------------------------------------
export function useAnimationFrame(callback: (delta: number) => void, active = true) {
  const prevTime = useRef(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const loop = (time: number) => { callback(time - prevTime.current); prevTime.current = time; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [callback, active]);
}

// ---------------------------------------------------------------------------
// useTween -- tween value animation
// ---------------------------------------------------------------------------
export function useTween(target: number, duration = 300, easing = (t: number) => t) {
  const [value, setValue] = useState(target);
  const start = useRef(value);
  const startTime = useRef(0);
  useEffect(() => {
    start.current = value;
    startTime.current = performance.now();
    const loop = () => {
      const elapsed = performance.now() - startTime.current;
      const progress = Math.min(1, elapsed / duration);
      setValue(start.current + (target - start.current) * easing(progress));
      if (progress < 1) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, [target, duration]);
  return value;
}


// ---------------------------------------------------------------------------
// useGesture -- combined gesture handler
// ---------------------------------------------------------------------------
export function useGesture(handlers: { onDrag?: (state: { offset: { x: number; y: number } }) => void; onPinch?: (state: { scale: number }) => void; onWheel?: (state: { delta: { x: number; y: number } }) => void }) {
  const ref = useRef<HTMLElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMouseDown = (e: MouseEvent) => { dragStart.current = { x: e.clientX, y: e.clientY }; const move = (me: MouseEvent) => handlers.onDrag?.({ offset: { x: me.clientX - dragStart.current.x, y: me.clientY - dragStart.current.y } }); const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); handlers.onWheel?.({ delta: { x: e.deltaX, y: e.deltaY } }); };
    el.addEventListener("mousedown", onMouseDown); el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("mousedown", onMouseDown); el.removeEventListener("wheel", onWheel); };
  }, [handlers]);
  return ref;
}

// ---------------------------------------------------------------------------
// useInertia -- momentum-based movement
// ---------------------------------------------------------------------------
export function useInertia(friction = 0.95) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const push = useCallback((vx: number, vy: number) => { velocity.current = { x: vx, y: vy }; }, []);
  useEffect(() => {
    let raf: number;
    const step = () => {
      velocity.current = { x: velocity.current.x * friction, y: velocity.current.y * friction };
      setPosition(p => ({ x: p.x + velocity.current.x, y: p.y + velocity.current.y }));
      if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [friction]);
  return { position, push };
}

// ---------------------------------------------------------------------------
// useScroll -- window scroll state
// ---------------------------------------------------------------------------
export function useScroll() {
  const [scroll, setScroll] = useState({ x: 0, y: 0, direction: "none" as "up" | "down" | "none" });
  const prevY = useRef(0);
  useEffect(() => {
    const handler = () => {
      const y = window.scrollY;
      setScroll({ x: window.scrollX, y, direction: y > prevY.current ? "down" : y < prevY.current ? "up" : "none" });
      prevY.current = y;
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return scroll;
}


// ---------------------------------------------------------------------------
// useMouseLeave -- track mouse leave window
// ---------------------------------------------------------------------------
export function useMouseLeave(callback: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!e.relatedTarget && !(e as unknown as { toElement?: Element }).toElement) callback(); };
    document.addEventListener("mouseout", handler as EventListener);
    return () => document.removeEventListener("mouseout", handler as EventListener);
  }, [callback]);
}
// ---------------------------------------------------------------------------
// useTouchStart -- touch start handler
// ---------------------------------------------------------------------------
export function useTouchStart(callback: (e: TouchEvent) => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.addEventListener("touchstart", callback, { passive: true });
    return () => el.removeEventListener("touchstart", callback);
  }, [callback]);
  return ref;
}

// ---------------------------------------------------------------------------
// useTouchMove -- touch move handler
// ---------------------------------------------------------------------------
export function useTouchMove(callback: (e: TouchEvent) => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.addEventListener("touchmove", callback, { passive: true });
    return () => el.removeEventListener("touchmove", callback);
  }, [callback]);
  return ref;
}

// ---------------------------------------------------------------------------
// useTouchEnd -- touch end handler
// ---------------------------------------------------------------------------
export function useTouchEnd(callback: (e: TouchEvent) => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.addEventListener("touchend", callback);
    return () => el.removeEventListener("touchend", callback);
  }, [callback]);
  return ref;
}


// ---------------------------------------------------------------------------
// useRotateGesture -- two-finger rotation
// ---------------------------------------------------------------------------
export function useRotateGesture(onChange: (angle: number) => void) {
  const ref = useRef<HTMLElement>(null);
  const initialAngle = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const getAngle = (t: TouchList) => Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180 / Math.PI;
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) initialAngle.current = getAngle(e.touches); };
    const onMove = (e: TouchEvent) => { if (e.touches.length === 2) { onChange(getAngle(e.touches) - initialAngle.current); } };
    el.addEventListener("touchstart", onStart, { passive: true }); el.addEventListener("touchmove", onMove, { passive: true });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); };
  }, [onChange]);
  return ref;
}

// ---------------------------------------------------------------------------
// useSwipeDirection -- detect swipe direction
// ---------------------------------------------------------------------------
export function useSwipeDirection(callback: (dir: "up" | "down" | "left" | "right") => void, threshold = 50) {
  const ref = useRef<HTMLElement>(null);
  const start = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onStart = (e: TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        if (Math.abs(dx) > Math.abs(dy)) callback(dx > 0 ? "right" : "left");
        else callback(dy > 0 ? "down" : "up");
      }
    };
    el.addEventListener("touchstart", onStart); el.addEventListener("touchend", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchend", onEnd); };
  }, [callback, threshold]);
  return ref;
}


// ---------------------------------------------------------------------------
// useTapHold -- tap and hold detection
// ---------------------------------------------------------------------------
export function useTapHold(callback: (pos: { x: number; y: number }) => void, duration = 500) {
  const ref = useRef<HTMLElement>(null);
  const timer = useRef<NodeJS.Timeout>();
  const pos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const start = (e: TouchEvent) => { pos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; timer.current = setTimeout(() => callback(pos.current), duration); };
    const end = () => clearTimeout(timer.current);
    el.addEventListener("touchstart", start, { passive: true }); el.addEventListener("touchend", end); el.addEventListener("touchmove", end, { passive: true });
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchend", end); el.removeEventListener("touchmove", end); };
  }, [callback, duration]);
  return ref;
}
// ---------------------------------------------------------------------------
// useDragDrop -- HTML5 drag and drop
// ---------------------------------------------------------------------------
export function useDragDrop<T>(options: { onDragStart?: (e: DragEvent) => void; onDrag?: (e: DragEvent) => void; onDragEnd?: (e: DragEvent) => void; onDrop?: (e: DragEvent, data: T) => void; data?: T }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.draggable = true;
    const dragStart = (e: DragEvent) => { e.dataTransfer?.setData("text/plain", JSON.stringify(options.data)); options.onDragStart?.(e); };
    const drag = (e: DragEvent) => options.onDrag?.(e);
    const dragEnd = (e: DragEvent) => options.onDragEnd?.(e);
    const dragOver = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => { e.preventDefault(); let data: T | null = null; try { data = JSON.parse(e.dataTransfer?.getData("text/plain") || "null"); } catch { data = null; } options.onDrop?.(e, data as T); };
    el.addEventListener("dragstart", dragStart); el.addEventListener("drag", drag); el.addEventListener("dragend", dragEnd); el.addEventListener("dragover", dragOver); el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragstart", dragStart); el.removeEventListener("drag", drag); el.removeEventListener("dragend", dragEnd); el.removeEventListener("dragover", dragOver); el.removeEventListener("drop", drop); };
  }, [options]);
  return ref;
}

// ---------------------------------------------------------------------------
// useDropTarget -- drop zone handler
// ---------------------------------------------------------------------------
export function useDropTarget<T>(onDrop: (data: T, pos: { x: number; y: number }) => void, options?: { accept?: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const [isOver, setIsOver] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const dragOver = (e: DragEvent) => { e.preventDefault(); setIsOver(true); };
    const dragLeave = () => setIsOver(false);
    const drop = (e: DragEvent) => { e.preventDefault(); setIsOver(false); let data: T | null = null; try { data = JSON.parse(e.dataTransfer?.getData("text/plain") || "null"); } catch { data = null; } onDrop(data as T, { x: e.clientX, y: e.clientY }); };
    el.addEventListener("dragover", dragOver); el.addEventListener("dragleave", dragLeave); el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragover", dragOver); el.removeEventListener("dragleave", dragLeave); el.removeEventListener("drop", drop); };
  }, [onDrop]);
  return { ref, isOver };
}

// ---------------------------------------------------------------------------
// useSortable -- sortable list item
// ---------------------------------------------------------------------------
export function useSortable<T>(item: T, onReorder: (from: T, to: T) => void) {
  const ref = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.draggable = true;
    const dragStart = (e: DragEvent) => { setIsDragging(true); e.dataTransfer?.setData("text/plain", JSON.stringify(item)); };
    const dragEnd = () => setIsDragging(false);
    const dragOver = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => { e.preventDefault(); let from: T | null = null; try { from = JSON.parse(e.dataTransfer?.getData("text/plain") || "null"); } catch { from = null; } if (from !== null) onReorder(from, item); };
    el.addEventListener("dragstart", dragStart); el.addEventListener("dragend", dragEnd); el.addEventListener("dragover", dragOver); el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragstart", dragStart); el.removeEventListener("dragend", dragEnd); el.removeEventListener("dragover", dragOver); el.removeEventListener("drop", drop); };
  }, [item, onReorder]);
  return { ref, isDragging };
}

// ---------------------------------------------------------------------------
// useResizable -- resizable element
// ---------------------------------------------------------------------------
export function useResizable(options?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
    const observer = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const resize = useCallback((width: number, height: number) => {
    const w = Math.max(options?.minWidth || 0, Math.min(width, options?.maxWidth || Infinity));
    const h = Math.max(options?.minHeight || 0, Math.min(height, options?.maxHeight || Infinity));
    if (ref.current) { ref.current.style.width = w + "px"; ref.current.style.height = h + "px"; }
  }, [options]);
  return { ref, size, resize };
}

// ---------------------------------------------------------------------------
// useMovable -- movable element with constraints
// ---------------------------------------------------------------------------
export function useMovable(options?: { bounds?: { left: number; top: number; right: number; bottom: number } }) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const move = useCallback((x: number, y: number) => {
    let nx = x, ny = y;
    if (options?.bounds) { nx = Math.max(options.bounds.left, Math.min(x, options.bounds.right)); ny = Math.max(options.bounds.top, Math.min(y, options.bounds.bottom)); }
    setPosition({ x: nx, y: ny });
    if (ref.current) { ref.current.style.transform = `translate(${nx}px, ${ny}px)`; }
  }, [options]);
  return { ref, position, move };
}

// ---------------------------------------------------------------------------
// useHotspots -- define interactive regions
// ---------------------------------------------------------------------------
export function useHotspots(hotspots: Array<{ id: string; x: number; y: number; width: number; height: number; onClick?: () => void }>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      for (const h of hotspots) { if (x >= h.x && x <= h.x + h.width && y >= h.y && y <= h.y + h.height) { h.onClick?.(); break; } }
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [hotspots]);
  return ref;
}

// ---------------------------------------------------------------------------
// useConnectedPoints -- track connected point positions
// ---------------------------------------------------------------------------
export function useConnectedPoints<T extends string>(points: T[]) {
  const [positions, setPositions] = useState<Record<T, { x: number; y: number }>>({} as Record<T, { x: number; y: number }>);
  const refs = useRef<Record<T, HTMLElement | null>>({} as Record<T, HTMLElement | null>);
  const update = useCallback(() => {
    const newPos: Record<string, { x: number; y: number }> = {};
    for (const p of points) { const el = refs.current[p]; if (el) { const rect = el.getBoundingClientRect(); newPos[p] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; } }
    setPositions(newPos as Record<T, { x: number; y: number }>);
  }, [points]);
  const getRef = useCallback((id: T) => (el: HTMLElement | null) => { refs.current[id] = el; update(); }, [update]);
  return { positions, getRef };
}

// ---------------------------------------------------------------------------
// useCanvasDrawing -- canvas drawing state
// ---------------------------------------------------------------------------
export function useCanvasDrawing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    ctx.current = canvas.getContext("2d");
    const start = (e: MouseEvent) => { setIsDrawing(true); ctx.current?.beginPath(); ctx.current?.moveTo(e.offsetX, e.offsetY); };
    const draw = (e: MouseEvent) => { if (isDrawing && ctx.current) { ctx.current.lineTo(e.offsetX, e.offsetY); ctx.current.stroke(); } };
    const stop = () => setIsDrawing(false);
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", draw); canvas.addEventListener("mouseup", stop); canvas.addEventListener("mouseleave", stop);
    return () => { canvas.removeEventListener("mousedown", start); canvas.removeEventListener("mousemove", draw); canvas.removeEventListener("mouseup", stop); canvas.removeEventListener("mouseleave", stop); };
  }, [isDrawing]);
  const clear = useCallback(() => { const canvas = canvasRef.current; if (canvas && ctx.current) ctx.current.clearRect(0, 0, canvas.width, canvas.height); }, []);
  return { canvasRef, isDrawing, clear };
}
// ---------------------------------------------------------------------------
// useImagePreload -- preload images
// ---------------------------------------------------------------------------
export function useImagePreload(urls: string[]) {
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    urls.forEach(url => {
      const img = new Image();
      img.onload = () => setLoaded(l => ({ ...l, [url]: true }));
      img.onerror = () => setLoaded(l => ({ ...l, [url]: false }));
      img.src = url;
    });
  }, [urls]);
  return { loaded, allLoaded: urls.every(u => loaded[u]) };
}

// ---------------------------------------------------------------------------
// useVideoPlayer -- video player controls
// ---------------------------------------------------------------------------
export function useVideoPlayer() {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState({ playing: false, currentTime: 0, duration: 0, volume: 1, muted: false });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => setState(s => ({ ...s, currentTime: el.currentTime, duration: el.duration || 0 }));
    el.addEventListener("timeupdate", update); el.addEventListener("loadedmetadata", update);
    return () => { el.removeEventListener("timeupdate", update); el.removeEventListener("loadedmetadata", update); };
  }, []);
  const play = () => { ref.current?.play(); setState(s => ({ ...s, playing: true })); };
  const pause = () => { ref.current?.pause(); setState(s => ({ ...s, playing: false })); };
  const seek = (time: number) => { if (ref.current) ref.current.currentTime = time; };
  const setVolume = (vol: number) => { if (ref.current) ref.current.volume = vol; setState(s => ({ ...s, volume: vol })); };
  const toggleMute = () => { if (ref.current) { ref.current.muted = !ref.current.muted; setState(s => ({ ...s, muted: !s.muted })); } };
  return { ref, ...state, play, pause, seek, setVolume, toggleMute };
}

// ---------------------------------------------------------------------------
// useAudioPlayer -- audio player controls
// ---------------------------------------------------------------------------
export function useAudioPlayer(src?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState({ playing: false, currentTime: 0, duration: 0 });
  useEffect(() => {
    if (!src) return;
    const audio = new Audio(src); audioRef.current = audio;
    const update = () => setState(s => ({ ...s, currentTime: audio.currentTime, duration: audio.duration || 0 }));
    audio.addEventListener("timeupdate", update); audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("play", () => setState(s => ({ ...s, playing: true })));
    audio.addEventListener("pause", () => setState(s => ({ ...s, playing: false })));
    return () => { audio.pause(); audio.src = ""; };
  }, [src]);
  const play = () => audioRef.current?.play();
  const pause = () => audioRef.current?.pause();
  const seek = (time: number) => { if (audioRef.current) audioRef.current.currentTime = time; };
  return { ...state, play, pause, seek };
}

// ---------------------------------------------------------------------------
// useFileReader -- read file contents
// ---------------------------------------------------------------------------
export function useFileReader() {
  const [state, setState] = useState<{ data: string | ArrayBuffer | null; loading: boolean; error: Error | null }>({ data: null, loading: false, error: null });
  const readFile = useCallback((file: File, as: "text" | "dataUrl" | "arrayBuffer" = "text") => {
    setState({ data: null, loading: true, error: null });
    const reader = new FileReader();
    reader.onload = () => setState({ data: reader.result, loading: false, error: null });
    reader.onerror = () => setState({ data: null, loading: false, error: reader.error });
    if (as === "text") reader.readAsText(file);
    else if (as === "dataUrl") reader.readAsDataURL(file);
    else reader.readAsArrayBuffer(file);
  }, []);
  return { ...state, readFile };
}



// ---------------------------------------------------------------------------
// useFocusWithin -- focus within element
// ---------------------------------------------------------------------------
export function useFocusWithin() {
  const ref = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const focusIn = () => setFocused(true);
    const focusOut = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node)) setFocused(false); };
    el.addEventListener("focusin", focusIn); el.addEventListener("focusout", focusOut);
    return () => { el.removeEventListener("focusin", focusIn); el.removeEventListener("focusout", focusOut); };
  }, []);
  return { ref, focused };
}

// ---------------------------------------------------------------------------
// useActiveElement -- track active element
// ---------------------------------------------------------------------------
export function useActiveElement() {
  const [active, setActive] = useState<Element | null>(document.activeElement);
  useEffect(() => {
    const handler = () => setActive(document.activeElement);
    document.addEventListener("focusin", handler);
    document.addEventListener("focusout", handler);
    return () => { document.removeEventListener("focusin", handler); document.removeEventListener("focusout", handler); };
  }, []);
  return active;
}
// ---------------------------------------------------------------------------
// useDocumentEvent -- document event listener
// ---------------------------------------------------------------------------
export function useDocumentEvent<K extends keyof DocumentEventMap>(type: K, handler: (e: DocumentEventMap[K]) => void) {
  useEffect(() => {
    document.addEventListener(type, handler);
    return () => document.removeEventListener(type, handler);
  }, [type, handler]);
}

// ---------------------------------------------------------------------------
// useWindowEvent -- window event listener
// ---------------------------------------------------------------------------
export function useWindowEvent<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void) {
  useEffect(() => {
    window.addEventListener(type, handler);
    return () => window.removeEventListener(type, handler);
  }, [type, handler]);
}

// ---------------------------------------------------------------------------
// useMediaSession -- Media Session API
// ---------------------------------------------------------------------------
export function useMediaSession(handlers: { play?: () => void; pause?: () => void; seekbackward?: () => void; seekforward?: () => void; previoustrack?: () => void; nexttrack?: () => void }, metadata?: { title?: string; artist?: string; album?: string; artwork?: Array<{ src: string; sizes?: string; type?: string }> }) {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    Object.entries(handlers).forEach(([action, handler]) => {
      navigator.mediaSession.setActionHandler(action as any, handler || null);
    });
    if (metadata) navigator.mediaSession.metadata = new MediaMetadata(metadata);
    return () => { Object.keys(handlers).forEach(action => navigator.mediaSession.setActionHandler(action as any, null)); };
  }, [handlers, metadata]);
}

// ---------------------------------------------------------------------------
// usePictureInPicture -- Picture-in-Picture mode
// ---------------------------------------------------------------------------
export function usePictureInPicture() {
  const ref = useRef<HTMLVideoElement>(null);
  const [isPip, setIsPip] = useState(false);
  const enter = useCallback(async () => {
    if (ref.current && document.pictureInPictureEnabled) {
      await ref.current.requestPictureInPicture();
      setIsPip(true);
    }
  }, []);
  const exit = useCallback(async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      setIsPip(false);
    }
  }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const enterHandler = () => setIsPip(true);
    const leaveHandler = () => setIsPip(false);
    el.addEventListener("enterpictureinpicture", enterHandler);
    el.addEventListener("leavepictureinpicture", leaveHandler);
    return () => { el.removeEventListener("enterpictureinpicture", enterHandler); el.removeEventListener("leavepictureinpicture", leaveHandler); };
  }, []);
  return { ref, isPip, enter, exit };
}


// ---------------------------------------------------------------------------
// useIntersection -- intersection observer state
// ---------------------------------------------------------------------------
export function useIntersection(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLElement>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const observer = new IntersectionObserver(([e]) => setEntry(e), options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);
  return { ref, entry, isIntersecting: entry?.isIntersecting ?? false };
}


// ---------------------------------------------------------------------------
// usePerformanceObserver -- performance metrics
// ---------------------------------------------------------------------------
export function usePerformanceObserver(types: string[], callback: (entries: PerformanceEntry[]) => void) {
  useEffect(() => {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    types.forEach(type => { try { observer.observe({ type, buffered: true }); } catch { /* intentional: not every PerformanceObserver entry type is supported on every browser/electron version */ } });
    return () => observer.disconnect();
  }, [types, callback]);
}
// ---------------------------------------------------------------------------
// useReportingObserver -- browser reporting observer
// ---------------------------------------------------------------------------
export function useReportingObserver(callback: (reports: any[]) => void) {
  useEffect(() => {
    if (!("ReportingObserver" in window)) return;
    const observer = new (window as any).ReportingObserver((reports: any[]) => callback(reports), { buffered: true });
    observer.observe();
    return () => observer.disconnect();
  }, [callback]);
}

// ---------------------------------------------------------------------------
// useErrorBoundary -- error boundary hook
// ---------------------------------------------------------------------------
export function useErrorBoundary() {
  const [error, setError] = useState<Error | null>(null);
  const resetError = useCallback(() => setError(null), []);
  const handleError = useCallback((err: Error) => setError(err), []);
  useEffect(() => {
    const handler = (e: ErrorEvent) => setError(e.error);
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);
  return { error, resetError, handleError };
}

// ---------------------------------------------------------------------------
// usePromise -- promise state tracker
// ---------------------------------------------------------------------------
export function usePromise<T>(promiseFn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    promiseFn().then(data => { if (!cancelled) setState({ data, loading: false, error: null }); }).catch(error => { if (!cancelled) setState({ data: null, loading: false, error }); });
    return () => { cancelled = true; };
  }, deps);
  return state;
}

// ---------------------------------------------------------------------------
// useAbortController -- abort controller for fetch
// ---------------------------------------------------------------------------
export function useAbortController() {
  const controllerRef = useRef<AbortController | null>(null);
  const getSignal = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current.signal;
  }, []);
  const abort = useCallback(() => controllerRef.current?.abort(), []);
  useEffect(() => () => controllerRef.current?.abort(), []);
  return { getSignal, abort };
}

// ---------------------------------------------------------------------------
// useRetry -- retry failed operations
// ---------------------------------------------------------------------------
export function useRetry<T>(fn: () => Promise<T>, options?: { maxRetries?: number; delay?: number }) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null; retries: number }>({ data: null, loading: false, error: null, retries: 0 });
  const maxRetries = options?.maxRetries || 3;
  const delay = options?.delay || 1000;
  const execute = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    let attempt = 0;
    while (attempt < maxRetries) {
      try { const data = await fn(); setState({ data, loading: false, error: null, retries: attempt }); return data; }
      catch (err) { attempt++; setState(s => ({ ...s, retries: attempt })); if (attempt < maxRetries) await new Promise(r => setTimeout(r, delay * attempt)); else setState({ data: null, loading: false, error: err as Error, retries: attempt }); }
    }
    return null;
  }, [fn, maxRetries, delay]);
  return { ...state, execute };
}

// ---------------------------------------------------------------------------
// useDebounceCallback -- debounced callback
// ---------------------------------------------------------------------------
export function useDebounceCallback<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const timer = useRef<NodeJS.Timeout>();
  return useCallback((...args: Parameters<T>) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]) as T;
}

// ---------------------------------------------------------------------------
// useThrottleCallback -- throttled callback
// ---------------------------------------------------------------------------
export function useThrottleCallback<T extends (...args: any[]) => any>(callback: T, limit: number): T {
  const lastRan = useRef(0);
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRan.current >= limit) { lastRan.current = now; callback(...args); }
  }, [callback, limit]) as T;
}

// ---------------------------------------------------------------------------
// useRafCallback -- requestAnimationFrame callback
// ---------------------------------------------------------------------------
export function useRafCallback<T extends (...args: any[]) => any>(callback: T): T {
  const rafId = useRef<number>();
  return useCallback((...args: Parameters<T>) => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => callback(...args));
  }, [callback]) as T;
}

// ---------------------------------------------------------------------------
// useLatest -- latest value ref
// ---------------------------------------------------------------------------
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// ---------------------------------------------------------------------------
// useUnmount -- unmount callback
// ---------------------------------------------------------------------------
export function useUnmount(fn: () => void) {
  const fnRef = useLatest(fn);
  useEffect(() => () => fnRef.current(), []);
}

// ---------------------------------------------------------------------------
// useMount -- mount callback
// ---------------------------------------------------------------------------
export function useMount(fn: () => void) {
  useEffect(() => { fn(); }, []);
}

// ---------------------------------------------------------------------------
// useIsFirstRender -- first render detection
// ---------------------------------------------------------------------------
export function useIsFirstRender(): boolean {
  const isFirst = useRef(true);
  if (isFirst.current) { isFirst.current = false; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// useUpdateEffect -- effect that skips first render
// ---------------------------------------------------------------------------
export function useUpdateEffect(effect: React.EffectCallback, deps?: React.DependencyList) {
  const isFirst = useIsFirstRender();
  useEffect(() => { if (!isFirst) return effect(); }, deps);
}

// ---------------------------------------------------------------------------
// useForceUpdate -- force component update
// ---------------------------------------------------------------------------
export function useForceUpdate() {
  const [, setState] = useState({});
  return useCallback(() => setState({}), []);
}

// ---------------------------------------------------------------------------
// useConstant -- constant value that never changes
// ---------------------------------------------------------------------------
export function useConstant<T>(fn: () => T): T {
  const ref = useRef<{ v: T }>();
  if (!ref.current) ref.current = { v: fn() };
  return ref.current.v;
}
// ---------------------------------------------------------------------------
// useSafeState -- state that only updates if mounted
// ---------------------------------------------------------------------------
export function useSafeState<T>(initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const mounted = useRef(true);
  const [state, setState] = useState(initialValue);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const safeSetState = useCallback((value: T | ((prev: T) => T)) => { if (mounted.current) setState(value); }, []);
  return [state, safeSetState];
}

// ---------------------------------------------------------------------------
// useRenderCount -- count component renders
// ---------------------------------------------------------------------------
export function useRenderCount(): number {
  const count = useRef(0);
  count.current++;
  return count.current;
}

// ---------------------------------------------------------------------------
// useWhyDidYouUpdate -- debug prop changes
// ---------------------------------------------------------------------------
export function useWhyDidYouUpdate<T extends Record<string, any>>(name: string, props: T) {
  const prev = useRef<T>();
  useEffect(() => {
    if (prev.current) {
      const allKeys = Object.keys({ ...prev.current, ...props });
      const changes: Record<string, { from: any; to: any }> = {};
      allKeys.forEach(key => { if (prev.current![key] !== props[key]) changes[key] = { from: prev.current![key], to: props[key] }; });
      if (Object.keys(changes).length) console.log("[why-update]", name, changes);
    }
    prev.current = props;
  });
}

// ---------------------------------------------------------------------------
// useEffectOnce -- run effect only once
// ---------------------------------------------------------------------------
export function useEffectOnce(effect: React.EffectCallback) {
  useEffect(effect, []);
}

// ---------------------------------------------------------------------------
// useLayoutEffectOnce -- run layout effect once
// ---------------------------------------------------------------------------
export function useLayoutEffectOnce(effect: React.EffectCallback) {
  useLayoutEffect(effect, []);
}

// ---------------------------------------------------------------------------
// useEvent -- stable event handler
// ---------------------------------------------------------------------------
export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => { handlerRef.current = handler; });
  return useCallback((...args: Parameters<T>) => handlerRef.current(...args), []) as T;
}

// ---------------------------------------------------------------------------
// useIsMounted -- check if component is mounted
// ---------------------------------------------------------------------------
export function useIsMounted(): () => boolean {
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useCallback(() => mounted.current, []);
}

// ---------------------------------------------------------------------------
// useFirstMountState -- first mount state
// ---------------------------------------------------------------------------
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);
  if (isFirst.current) { isFirst.current = false; return true; }
  return isFirst.current;
}
// ---------------------------------------------------------------------------
// useDeepCompareEffect -- effect with deep comparison
// ---------------------------------------------------------------------------
export function useDeepCompareEffect(effect: React.EffectCallback, deps: React.DependencyList) {
  const ref = useRef<React.DependencyList>();
  const signalRef = useRef(0);
  if (!ref.current || JSON.stringify(ref.current) !== JSON.stringify(deps)) {
    ref.current = deps;
    signalRef.current++;
  }
  useEffect(effect, [signalRef.current]);
}

// ---------------------------------------------------------------------------
// useShallowCompareEffect -- effect with shallow comparison
// ---------------------------------------------------------------------------
export function useShallowCompareEffect(effect: React.EffectCallback, deps: Record<string, any>) {
  const ref = useRef<Record<string, any>>();
  const signalRef = useRef(0);
  const changed = !ref.current || Object.keys(deps).some(k => ref.current![k] !== deps[k]);
  if (changed) { ref.current = { ...deps }; signalRef.current++; }
  useEffect(effect, [signalRef.current]);
}

// ---------------------------------------------------------------------------
// useAsyncEffect -- async effect handler
// ---------------------------------------------------------------------------
export function useAsyncEffect(effect: () => Promise<void | (() => void)>, deps?: React.DependencyList) {
  useEffect(() => {
    let cleanup: void | (() => void);
    let mounted = true;
    effect().then(c => { if (mounted) cleanup = c; });
    return () => { mounted = false; cleanup?.(); };
  }, deps);
}

// ---------------------------------------------------------------------------
// useConditionalEffect -- effect only runs if condition true
// ---------------------------------------------------------------------------
export function useConditionalEffect(condition: boolean, effect: React.EffectCallback, deps?: React.DependencyList) {
  useEffect(() => { if (condition) return effect(); }, [condition, ...(deps || [])]);
}



// ---------------------------------------------------------------------------
// useDebouncedCallback -- debounced callback
// ---------------------------------------------------------------------------
export function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useCallback((...args: Parameters<T>) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => callback(...args), delay); }, [callback, delay]) as T;
}

// ---------------------------------------------------------------------------
// useThrottledCallback -- throttled callback
// ---------------------------------------------------------------------------
export function useThrottledCallback<T extends (...args: any[]) => any>(callback: T, interval: number): T {
  const lastCalled = useRef(0);
  return useCallback((...args: Parameters<T>) => { const now = Date.now(); if (now - lastCalled.current >= interval) { lastCalled.current = now; callback(...args); } }, [callback, interval]) as T;
}




// ---------------------------------------------------------------------------
// useStateList -- cycle through list of states
// ---------------------------------------------------------------------------
export function useStateList<T>(stateSet: T[]): { state: T; index: number; setIndex: (i: number) => void; next: () => void; prev: () => void; isFirst: boolean; isLast: boolean } {
  const [index, setIndex] = useState(0);
  const next = useCallback(() => setIndex(i => (i + 1) % stateSet.length), [stateSet.length]);
  const prev = useCallback(() => setIndex(i => (i - 1 + stateSet.length) % stateSet.length), [stateSet.length]);
  return { state: stateSet[index], index, setIndex, next, prev, isFirst: index === 0, isLast: index === stateSet.length - 1 };
}

// ---------------------------------------------------------------------------
// useHistoryState -- state with undo/redo
// ---------------------------------------------------------------------------
export function useHistoryState<T>(initialValue: T): { value: T; set: (v: T) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; history: T[] } {
  const [history, setHistory] = useState<T[]>([initialValue]);
  const [index, setIndex] = useState(0);
  const set = useCallback((v: T) => { setHistory(h => [...h.slice(0, index + 1), v]); setIndex(i => i + 1); }, [index]);
  const undo = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const redo = useCallback(() => setIndex(i => Math.min(history.length - 1, i + 1)), [history.length]);
  return { value: history[index], set, undo, redo, canUndo: index > 0, canRedo: index < history.length - 1, history };
}

// ---------------------------------------------------------------------------
// useDefault -- state with default fallback
// ---------------------------------------------------------------------------
export function useDefault<T>(initialValue: T, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T | undefined>>] {
  const [value, setValue] = useState<T | undefined>(initialValue);
  return [value ?? defaultValue, setValue];
}

// ---------------------------------------------------------------------------
// useResetState -- state with reset
// ---------------------------------------------------------------------------
export function useResetState<T>(initialValue: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState(initialValue);
  const reset = useCallback(() => setValue(initialValue), [initialValue]);
  return [value, setValue, reset];
}
// ---------------------------------------------------------------------------
// useLocalStorageState -- persist state in localStorage
// ---------------------------------------------------------------------------
export function useLocalStorageState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => { try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : initialValue; } catch { return initialValue; } });
  const set = useCallback((v: T | ((prev: T) => T)) => { setValue(prev => { const newVal = typeof v === "function" ? (v as Function)(prev) : v; localStorage.setItem(key, JSON.stringify(newVal)); return newVal; }); }, [key]);
  const remove = useCallback(() => { localStorage.removeItem(key); setValue(initialValue); }, [key, initialValue]);
  return [value, set, remove];
}

// ---------------------------------------------------------------------------
// useSessionStorageState -- persist state in sessionStorage
// ---------------------------------------------------------------------------
export function useSessionStorageState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => { try { const item = sessionStorage.getItem(key); return item ? JSON.parse(item) : initialValue; } catch { return initialValue; } });
  const set = useCallback((v: T | ((prev: T) => T)) => { setValue(prev => { const newVal = typeof v === "function" ? (v as Function)(prev) : v; sessionStorage.setItem(key, JSON.stringify(newVal)); return newVal; }); }, [key]);
  const remove = useCallback(() => { sessionStorage.removeItem(key); setValue(initialValue); }, [key, initialValue]);
  return [value, set, remove];
}

// ---------------------------------------------------------------------------
// useCookie -- read/write cookies
// ---------------------------------------------------------------------------
export function useCookie(name: string): [string | null, (value: string, days?: number) => void, () => void] {
  const getCookie = useCallback(() => { const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)")); return match ? decodeURIComponent(match[2]) : null; }, [name]);
  const [value, setValue] = useState(getCookie);
  const set = useCallback((v: string, days = 365) => { const date = new Date(); date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000); document.cookie = `${name}=${encodeURIComponent(v)};expires=${date.toUTCString()};path=/`; setValue(v); }, [name]);
  const remove = useCallback(() => { document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`; setValue(null); }, [name]);
  return [value, set, remove];
}



// ---------------------------------------------------------------------------
// useBreakpoint -- Tailwind breakpoints
// ---------------------------------------------------------------------------
export function useBreakpoint(): "xs" | "sm" | "md" | "lg" | "xl" | "2xl" {
  const [bp, setBp] = useState<"xs" | "sm" | "md" | "lg" | "xl" | "2xl">("xs");
  useEffect(() => {
    const check = () => { const w = window.innerWidth; setBp(w >= 1536 ? "2xl" : w >= 1280 ? "xl" : w >= 1024 ? "lg" : w >= 768 ? "md" : w >= 640 ? "sm" : "xs"); };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return bp;
}

// ---------------------------------------------------------------------------
// useIsMobile -- detect mobile device
// ---------------------------------------------------------------------------
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}

// ---------------------------------------------------------------------------
// useIsTablet -- detect tablet device
// ---------------------------------------------------------------------------
export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
}
// ---------------------------------------------------------------------------
// useIsDesktop -- detect desktop device
// ---------------------------------------------------------------------------
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1025px)");
}



// ---------------------------------------------------------------------------
// usePrefersContrast -- detect contrast preference
// ---------------------------------------------------------------------------
export function usePrefersContrast(): "more" | "less" | "no-preference" {
  const more = useMediaQuery("(prefers-contrast: more)");
  const less = useMediaQuery("(prefers-contrast: less)");
  return more ? "more" : less ? "less" : "no-preference";
}


// ---------------------------------------------------------------------------
// useOnline -- network online status
// ---------------------------------------------------------------------------
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  return online;
}
