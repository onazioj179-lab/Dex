// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Component Library Index
 *
 * Central export for reusable UI components. The 2026-06-16 code-health pass
 * removed nine never-imported library modules (PageTransition, ScrollEnhancements,
 * SmoothZoom, CollapsiblePanel, EnhancedKnob, NumberInput, ColorPicker,
 * RichTextInput, HelpOverlay); ResizablePanel is the live survivor.
 */

// ---------------------------------------------------------------------------
// Resizable Panels
// ---------------------------------------------------------------------------

export {
  ResizablePanel,
  useResizablePanel,
  type ResizablePanelProps,
  type ResizeDirection,
} from './ResizablePanel';
