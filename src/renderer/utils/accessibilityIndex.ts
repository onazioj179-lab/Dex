// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 31: Accessibility Index
// Central export for all accessibility utilities
// ═══════════════════════════════════════════════════════════════════════════

// Core accessibility utilities
export {
  // Focus management
  FOCUSABLE_SELECTORS,
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  focusSafely,
  saveFocus,
  restoreFocus,
  
  // Focus trap
  createFocusTrap,
  
  // Roving tabindex
  createRovingTabindex,
  
  // Screen reader announcements
  announce,
  announceError,
  announceStatus,
  
  // ARIA helpers
  generateId,
  labelledBy,
  describedBy,
  setExpanded,
  setSelected,
  setPressed,
  setDisabled,
  setCurrent,
  
  // Keyboard detection
  initKeyboardDetection,
  isUsingKeyboard,
  
  // Skip links
  createSkipLink,
  
  // System preferences
  prefersReducedMotion,
  onReducedMotionChange,
  prefersHighContrast,
  onHighContrastChange,
} from './accessibility';

// React hooks for accessibility
export {
  // Focus trap hook
  useFocusTrap,
  
  // Roving tabindex hook
  useRovingTabindex,
  
  // Focus return (save/restore)
  useFocusReturn,
  
  // Auto focus hooks
  useAutoFocus,
  useFocusFirst,
  
  // Keyboard handlers
  useKeyboardHandlers,
  useEscapeKey,
  
  // Announcements
  useAnnounce,
  useAnnounceOnChange,
  
  // System preferences
  useReducedMotion,
  useHighContrast,
  useIsKeyboardUser,
  
  // ARIA live region
  useLiveRegion,
  
  // Focus visibility
  useFocusVisible,
  
  // Arrow navigation
  useArrowNavigation,
} from './accessibilityHooks';

// Keyboard navigation
export {
  // Shortcut registration
  registerShortcut,
  unregisterShortcut,
  getAllShortcuts,
  getShortcutsByCategory,
  setShortcutsEnabled,
  
  // Default shortcuts
  DEFAULT_SHORTCUTS,
  
  // Formatting
  formatShortcut,
  
  // Global handler
  initKeyboardNavigation,
  
  // React hooks
  useKeyboardShortcut,
  useKeyboardShortcuts,
  useKeyboardNavigation,
  
  // Focus zones
  registerFocusZone,
  focusZone,
  getCurrentFocusZone,
  setCurrentFocusZone,
  useFocusZone,
  
  // Types
  type KeyboardShortcut,
  type FocusZone,
} from './keyboardNavigation';

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

import { initKeyboardDetection } from './accessibility';
import { initKeyboardNavigation } from './keyboardNavigation';

let initialized = false;

/**
 * Initialize all accessibility systems
 */
export function initAccessibilitySystems(): () => void {
  if (initialized) {
    return () => {};
  }

  const cleanups: Array<() => void> = [];

  // Initialize keyboard detection
  cleanups.push(initKeyboardDetection());

  // Initialize keyboard navigation
  cleanups.push(initKeyboardNavigation());

  // Add skip links
  addSkipLinks();

  // Set up focus management
  setupFocusManagement();

  initialized = true;

  return () => {
    cleanups.forEach(cleanup => cleanup());
    initialized = false;
  };
}

/**
 * Add skip links to the document
 */
function addSkipLinks(): void {
  // Check if skip links already exist
  if (document.getElementById('skip-links')) return;

  const skipLinksContainer = document.createElement('div');
  skipLinksContainer.id = 'skip-links';
  skipLinksContainer.className = 'skip-links';
  
  const links = [
    { target: 'main-content', label: 'Skip to main content' },
    { target: 'sidebar', label: 'Skip to sidebar' },
    { target: 'search', label: 'Skip to search' },
  ];

  links.forEach(({ target, label }) => {
    const link = document.createElement('a');
    link.href = `#${target}`;
    link.className = 'skip-link';
    link.textContent = label;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const element = document.getElementById(target);
      if (element) {
        element.focus();
        element.scrollIntoView({ behavior: 'smooth' });
      }
    });
    skipLinksContainer.appendChild(link);
  });

  document.body.insertBefore(skipLinksContainer, document.body.firstChild);
}

/**
 * Set up global focus management
 */
function setupFocusManagement(): void {
  // Track focus changes for debugging
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    
    // Prevent focus from being lost to body
    if (target === document.body) {
      // Try to find a reasonable element to focus
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        const firstFocusable = mainContent.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as HTMLElement;
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    }
  });

  // Handle tab key at document edges
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      )
    ) as HTMLElement[];

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    // Shift+Tab from first element
    if (e.shiftKey && activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
    // Tab from last element
    else if (!e.shiftKey && activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  });
}
