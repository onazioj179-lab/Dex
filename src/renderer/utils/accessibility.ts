// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 31: Accessibility Utilities
// Core utilities for keyboard navigation, focus management, and ARIA
// ===========================================================================

// -----------------------------------------------------------------------------
// FOCUS MANAGEMENT
// -----------------------------------------------------------------------------

/**
 * Focusable element selectors
 */
export const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
  return Array.from(elements).filter((el) => {
    // Filter out hidden elements
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/**
 * Get the first focusable element in a container
 */
export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[0] || null;
}

/**
 * Get the last focusable element in a container
 */
export function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const elements = getFocusableElements(container);
  return elements[elements.length - 1] || null;
}

/**
 * Focus an element safely (won't throw if element doesn't exist)
 */
export function focusSafely(element: HTMLElement | null | undefined): void {
  if (element && typeof element.focus === 'function') {
    // Use requestAnimationFrame for reliable focus after render
    requestAnimationFrame(() => {
      element.focus({ preventScroll: false });
    });
  }
}

/**
 * Store for focus history (for returning focus)
 */
const focusHistory: HTMLElement[] = [];
const MAX_FOCUS_HISTORY = 10;

/**
 * Save current focus to history
 */
export function saveFocus(): void {
  const activeElement = document.activeElement as HTMLElement;
  if (activeElement && activeElement !== document.body) {
    focusHistory.push(activeElement);
    if (focusHistory.length > MAX_FOCUS_HISTORY) {
      focusHistory.shift();
    }
  }
}

/**
 * Restore focus from history
 */
export function restoreFocus(): void {
  const element = focusHistory.pop();
  if (element && document.contains(element)) {
    focusSafely(element);
  }
}

/**
 * Get the current active element
 */
export function getActiveElement(): HTMLElement | null {
  return document.activeElement as HTMLElement;
}

// -----------------------------------------------------------------------------
// FOCUS TRAP
// -----------------------------------------------------------------------------

interface FocusTrapOptions {
  onEscape?: () => void;
  initialFocus?: HTMLElement | 'first' | 'last' | null;
  returnFocusOnDeactivate?: boolean;
}

interface FocusTrap {
  activate: () => void;
  deactivate: () => void;
  isActive: () => boolean;
}

/**
 * Create a focus trap within a container
 * Keeps focus cycling within the container
 */
export function createFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {}
): FocusTrap {
  const {
    onEscape,
    initialFocus = 'first',
    returnFocusOnDeactivate = true,
  } = options;

  let active = false;
  let previouslyFocused: HTMLElement | null = null;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!active) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }

    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: go backwards
        if (activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: go forwards
        if (activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  const handleFocusOut = (event: FocusEvent) => {
    if (!active) return;

    // If focus is leaving the container, bring it back
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget && !container.contains(relatedTarget)) {
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  };

  return {
    activate() {
      if (active) return;
      active = true;

      // Save current focus
      previouslyFocused = document.activeElement as HTMLElement;

      // Add event listeners
      container.addEventListener('keydown', handleKeyDown);
      container.addEventListener('focusout', handleFocusOut);

      // Set initial focus
      requestAnimationFrame(() => {
        if (initialFocus === 'first') {
          const first = getFirstFocusable(container);
          first?.focus();
        } else if (initialFocus === 'last') {
          const last = getLastFocusable(container);
          last?.focus();
        } else if (initialFocus instanceof HTMLElement) {
          initialFocus.focus();
        }
      });
    },

    deactivate() {
      if (!active) return;
      active = false;

      // Remove event listeners
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('focusout', handleFocusOut);

      // Return focus
      if (returnFocusOnDeactivate && previouslyFocused) {
        focusSafely(previouslyFocused);
      }
    },

    isActive() {
      return active;
    },
  };
}

// -----------------------------------------------------------------------------
// ROVING TABINDEX
// -----------------------------------------------------------------------------

interface RovingTabindexOptions {
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (element: HTMLElement, index: number) => void;
}

/**
 * Create a roving tabindex manager for a group of elements
 * Only one element is tabbable at a time, arrow keys navigate
 */
export function createRovingTabindex(
  container: HTMLElement,
  selector: string,
  options: RovingTabindexOptions = {}
): {
  init: () => void;
  destroy: () => void;
  setActiveIndex: (index: number) => void;
  getActiveIndex: () => number;
} {
  const { orientation = 'vertical', loop = true, onSelect } = options;

  let activeIndex = 0;

  const getElements = (): HTMLElement[] => {
    return Array.from(container.querySelectorAll<HTMLElement>(selector));
  };

  const updateTabindex = () => {
    const elements = getElements();
    elements.forEach((el, index) => {
      el.setAttribute('tabindex', index === activeIndex ? '0' : '-1');
    });
  };

  const focusElement = (index: number) => {
    const elements = getElements();
    if (elements[index]) {
      elements[index].focus();
      onSelect?.(elements[index], index);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const elements = getElements();
    if (elements.length === 0) return;

    let nextIndex = activeIndex;
    const isHorizontal = orientation === 'horizontal' || orientation === 'both';
    const isVertical = orientation === 'vertical' || orientation === 'both';

    switch (event.key) {
      case 'ArrowDown':
        if (isVertical) {
          event.preventDefault();
          nextIndex = activeIndex + 1;
        }
        break;
      case 'ArrowUp':
        if (isVertical) {
          event.preventDefault();
          nextIndex = activeIndex - 1;
        }
        break;
      case 'ArrowRight':
        if (isHorizontal) {
          event.preventDefault();
          nextIndex = activeIndex + 1;
        }
        break;
      case 'ArrowLeft':
        if (isHorizontal) {
          event.preventDefault();
          nextIndex = activeIndex - 1;
        }
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = elements.length - 1;
        break;
      default:
        return;
    }

    // Handle looping
    if (loop) {
      if (nextIndex < 0) nextIndex = elements.length - 1;
      if (nextIndex >= elements.length) nextIndex = 0;
    } else {
      nextIndex = Math.max(0, Math.min(nextIndex, elements.length - 1));
    }

    if (nextIndex !== activeIndex) {
      activeIndex = nextIndex;
      updateTabindex();
      focusElement(activeIndex);
    }
  };

  return {
    init() {
      updateTabindex();
      container.addEventListener('keydown', handleKeyDown);
    },

    destroy() {
      container.removeEventListener('keydown', handleKeyDown);
    },

    setActiveIndex(index: number) {
      const elements = getElements();
      if (index >= 0 && index < elements.length) {
        activeIndex = index;
        updateTabindex();
      }
    },

    getActiveIndex() {
      return activeIndex;
    },
  };
}

// -----------------------------------------------------------------------------
// SCREEN READER ANNOUNCEMENTS
// -----------------------------------------------------------------------------

let announcer: HTMLElement | null = null;

/**
 * Initialize the screen reader announcer element
 */
function ensureAnnouncer(): HTMLElement {
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    // Visually hidden but accessible
    Object.assign(announcer.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    document.body.appendChild(announcer);
  }
  return announcer;
}

/**
 * Announce a message to screen readers
 */
export function announce(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const el = ensureAnnouncer();
  el.setAttribute('aria-live', priority);
  
  // Clear and set to trigger announcement
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/**
 * Announce an error message (assertive)
 */
export function announceError(message: string): void {
  announce(message, 'assertive');
}

/**
 * Announce a status update (polite)
 */
export function announceStatus(message: string): void {
  announce(message, 'polite');
}

// -----------------------------------------------------------------------------
// ARIA HELPERS
// -----------------------------------------------------------------------------

/**
 * Generate a unique ID for ARIA relationships
 */
let idCounter = 0;
export function generateId(prefix = 'dex'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Set up ARIA label relationship
 */
export function labelledBy(
  element: HTMLElement,
  labelElement: HTMLElement
): void {
  let id = labelElement.id;
  if (!id) {
    id = generateId('label');
    labelElement.id = id;
  }
  element.setAttribute('aria-labelledby', id);
}

/**
 * Set up ARIA description relationship
 */
export function describedBy(
  element: HTMLElement,
  descriptionElement: HTMLElement
): void {
  let id = descriptionElement.id;
  if (!id) {
    id = generateId('desc');
    descriptionElement.id = id;
  }
  element.setAttribute('aria-describedby', id);
}

/**
 * Set expanded state
 */
export function setExpanded(element: HTMLElement, expanded: boolean): void {
  element.setAttribute('aria-expanded', String(expanded));
}

/**
 * Set selected state
 */
export function setSelected(element: HTMLElement, selected: boolean): void {
  element.setAttribute('aria-selected', String(selected));
}

/**
 * Set pressed state (toggle buttons)
 */
export function setPressed(element: HTMLElement, pressed: boolean): void {
  element.setAttribute('aria-pressed', String(pressed));
}

/**
 * Set disabled state
 */
export function setDisabled(element: HTMLElement, disabled: boolean): void {
  element.setAttribute('aria-disabled', String(disabled));
  if (disabled) {
    element.setAttribute('tabindex', '-1');
  }
}

/**
 * Set current state (navigation)
 */
export function setCurrent(
  element: HTMLElement,
  current: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false'
): void {
  element.setAttribute('aria-current', current);
}

// -----------------------------------------------------------------------------
// KEYBOARD DETECTION
// -----------------------------------------------------------------------------

let isKeyboardUser = false;

/**
 * Initialize keyboard detection
 * Adds .keyboard-user class to body when keyboard is used
 */
export function initKeyboardDetection(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      isKeyboardUser = true;
      document.body.classList.add('keyboard-user');
    }
  };

  const handleMouseDown = () => {
    isKeyboardUser = false;
    document.body.classList.remove('keyboard-user');
  };

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('mousedown', handleMouseDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('mousedown', handleMouseDown);
  };
}

/**
 * Check if user is navigating with keyboard
 */
export function isUsingKeyboard(): boolean {
  return isKeyboardUser;
}

// -----------------------------------------------------------------------------
// SKIP LINKS
// -----------------------------------------------------------------------------

/**
 * Create a skip link element
 */
export function createSkipLink(
  targetId: string,
  text: string
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `#${targetId}`;
  link.className = 'skip-link';
  link.textContent = text;
  
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  return link;
}

// -----------------------------------------------------------------------------
// REDUCED MOTION
// -----------------------------------------------------------------------------

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Listen for reduced motion preference changes
 */
export function onReducedMotionChange(
  callback: (prefersReduced: boolean) => void
): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  const handler = (event: MediaQueryListEvent) => {
    callback(event.matches);
  };

  mediaQuery.addEventListener('change', handler);
  
  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}

// -----------------------------------------------------------------------------
// HIGH CONTRAST
// -----------------------------------------------------------------------------

/**
 * Check if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  return window.matchMedia('(prefers-contrast: more)').matches;
}

/**
 * Listen for high contrast preference changes
 */
export function onHighContrastChange(
  callback: (prefersHighContrast: boolean) => void
): () => void {
  const mediaQuery = window.matchMedia('(prefers-contrast: more)');
  
  const handler = (event: MediaQueryListEvent) => {
    callback(event.matches);
  };

  mediaQuery.addEventListener('change', handler);
  
  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}

// -----------------------------------------------------------------------------
// ICON BUTTON ARIA LABELS
// Predefined labels for common icon-only buttons
// -----------------------------------------------------------------------------

export const ICON_BUTTON_LABELS = {
  // Window controls
  close: 'Close',
  minimize: 'Minimize window',
  maximize: 'Maximize window',
  restore: 'Restore window',
  fullscreen: 'Enter fullscreen',
  exitFullscreen: 'Exit fullscreen',
  
  // Navigation
  back: 'Go back',
  forward: 'Go forward',
  home: 'Go home',
  refresh: 'Refresh',
  menu: 'Open menu',
  sidebar: 'Toggle sidebar',
  
  // Common actions
  add: 'Add new',
  remove: 'Remove',
  delete: 'Delete',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  search: 'Search',
  filter: 'Filter',
  sort: 'Sort',
  copy: 'Copy',
  paste: 'Paste',
  cut: 'Cut',
  undo: 'Undo',
  redo: 'Redo',
  duplicate: 'Duplicate',
  rename: 'Rename',
  share: 'Share',
  download: 'Download',
  upload: 'Upload',
  export: 'Export',
  import: 'Import',
  print: 'Print',
  
  // Media controls
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  record: 'Record',
  mute: 'Mute',
  unmute: 'Unmute',
  volumeUp: 'Increase volume',
  volumeDown: 'Decrease volume',
  skipForward: 'Skip forward',
  skipBack: 'Skip back',
  fastForward: 'Fast forward',
  loop: 'Toggle loop',
  shuffle: 'Toggle shuffle',
  
  // View controls
  gridView: 'Grid view',
  listView: 'List view',
  galleryView: 'Gallery view',
  columnView: 'Column view',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  expand: 'Expand',
  collapse: 'Collapse',
  showMore: 'Show more',
  showLess: 'Show less',
  
  // State toggles
  favorite: 'Add to favorites',
  unfavorite: 'Remove from favorites',
  pin: 'Pin',
  unpin: 'Unpin',
  lock: 'Lock',
  unlock: 'Unlock',
  star: 'Star',
  unstar: 'Remove star',
  bookmark: 'Bookmark',
  archive: 'Archive',
  
  // Settings & system
  settings: 'Settings',
  preferences: 'Preferences',
  help: 'Help',
  info: 'Information',
  about: 'About',
  notifications: 'Notifications',
  profile: 'Profile',
  logout: 'Log out',
  
  // Creative tools (VINX, Imosion, PRISM, FLUX, FORGE, AXL)
  brush: 'Brush tool',
  pencil: 'Pencil tool',
  eraser: 'Eraser tool',
  eyedropper: 'Color picker',
  fill: 'Fill tool',
  gradient: 'Gradient tool',
  text: 'Text tool',
  shape: 'Shape tool',
  select: 'Selection tool',
  move: 'Move tool',
  crop: 'Crop',
  rotate: 'Rotate',
  flip: 'Flip',
  flipHorizontal: 'Flip horizontal',
  flipVertical: 'Flip vertical',
  layers: 'Layers panel',
  effects: 'Effects panel',
  filters: 'Filters',
  adjustments: 'Adjustments',
  
  // Timeline/Animation
  timeline: 'Timeline',
  keyframe: 'Add keyframe',
  removeKeyframe: 'Remove keyframe',
  playhead: 'Move playhead',
  trimStart: 'Trim start',
  trimEnd: 'Trim end',
  split: 'Split clip',
  merge: 'Merge clips',
  
  // Audio (AXL/VINX)
  waveform: 'Toggle waveform',
  spectrum: 'Spectrum analyzer',
  mixer: 'Mixer panel',
  eq: 'Equalizer',
  compressor: 'Compressor',
  reverb: 'Reverb effect',
  
  // 3D (FORGE)
  orbit: 'Orbit view',
  pan: 'Pan view',
  dolly: 'Dolly view',
  wireframe: 'Toggle wireframe',
  shading: 'Toggle shading',
  material: 'Material panel',
  lighting: 'Lighting panel',
  render: 'Render',
  
  // File browser
  newFolder: 'New folder',
  newFile: 'New file',
  openFolder: 'Open folder',
  openFile: 'Open file',
  parentFolder: 'Go to parent folder',
  
  // Misc
  more: 'More options',
  overflow: 'More actions',
  drag: 'Drag handle',
  resize: 'Resize',
  attach: 'Attach file',
  link: 'Insert link',
  emoji: 'Insert emoji',
  code: 'Insert code',
  table: 'Insert table',
  image: 'Insert image',
  send: 'Send',
  clear: 'Clear',
  reset: 'Reset',
} as const;

export type IconButtonLabelKey = keyof typeof ICON_BUTTON_LABELS;

/**
 * Get aria-label for an icon button
 */
export function getIconButtonLabel(key: IconButtonLabelKey): string {
  return ICON_BUTTON_LABELS[key];
}

/**
 * Create accessible props for icon-only buttons
 */
export function iconButtonProps(
  key: IconButtonLabelKey,
  options?: {
    pressed?: boolean;
    expanded?: boolean;
    disabled?: boolean;
    controls?: string;
  }
): Record<string, string | boolean | undefined> {
  const label = ICON_BUTTON_LABELS[key];
  return {
    'aria-label': label,
    title: label,
    ...(options?.pressed !== undefined && { 'aria-pressed': options.pressed }),
    ...(options?.expanded !== undefined && { 'aria-expanded': options.expanded }),
    ...(options?.disabled && { 'aria-disabled': true }),
    ...(options?.controls && { 'aria-controls': options.controls }),
  };
}

/**
 * Create accessible props for toggle icon buttons
 */
export function toggleIconProps(
  label: string,
  pressed: boolean
): Record<string, string | boolean> {
  return {
    'aria-label': label,
    'aria-pressed': pressed,
    title: `${label} (${pressed ? 'on' : 'off'})`,
  };
}
