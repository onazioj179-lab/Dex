// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX -- CSS Containment Injection
 * Applies CSS containment rules to prevent cross-app layout recalculation.
 * Injected once at renderer startup.
 */

const CONTAINMENT_CSS = `
/* App root containers -- changes inside cannot affect outside */
[data-app-container],
.dex-app-root {
  contain: layout style paint;
}

/* Virtualized list items -- fully isolated */
[data-virtual-item],
.virtual-list-item {
  contain: strict;
  content-visibility: auto;
}

/* Canvas containers -- fully isolated */
canvas,
[data-canvas-container] {
  contain: strict;
}

/* Absolutely positioned overlays */
[data-overlay],
.dex-overlay,
.dex-modal-overlay,
.dex-lightbox-overlay {
  contain: layout;
}

/* Sidebar and navigation -- isolated from content */
[data-dex-sidebar],
[data-dex-dock] {
  contain: layout style paint;
}

/* Individual app panels within the content area */
[data-dex-panel] {
  contain: layout style paint;
  content-visibility: auto;
}

/* Scroll containers -- prevent layout propagation */
[data-scroll-container] {
  contain: layout paint;
}

/* Timeline clips -- isolate each clip from siblings during drag */
.clip {
  contain: layout style;
}

/* Trim handles -- isolate from clip contents */
.trim-handle {
  contain: layout style paint;
}

/* Heavy app containers -- full isolation for VINX, Forge, Prism, AXL */
[data-heavy-app] {
  contain: strict;
  content-visibility: auto;
  contain-intrinsic-size: 100vw 100vh;
}

/* Image gallery tiles -- lazy rendering optimization */
[data-gallery-tile],
.gallery-tile {
  contain: strict;
  content-visibility: auto;
  contain-intrinsic-size: 200px 200px;
}

/* File list items -- isolated for smooth scrolling */
[data-file-item],
.file-list-item {
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: 100% 48px;
}

/* Notes list items -- isolated rendering */
[data-note-item],
.note-list-item {
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: 100% 80px;
}

/* Off-screen app panels -- skip rendering entirely */
[data-app-hidden="true"] {
  content-visibility: hidden;
  contain: strict;
}

/* Toolbar buttons -- isolated from siblings */
[data-toolbar-button] {
  contain: layout style paint;
}

/* Widget containers -- isolated rendering */
[data-widget-container] {
  contain: strict;
  content-visibility: auto;
}

/* Code editor lines -- virtualized rendering */
[data-code-line] {
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: 100% 20px;
}
`;

let injected = false;

/**
 * Inject containment CSS rules into the document head.
 * Safe to call multiple times -- only injects once.
 */
export function injectContainmentCSS(): void {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.setAttribute('data-dex-containment', 'true');
  style.textContent = CONTAINMENT_CSS;
  document.head.appendChild(style);
}
