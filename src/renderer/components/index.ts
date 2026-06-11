// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Component Library Index
 * 
 * Central export for all reusable UI components.
 * Import from '@/components' or '../components'
 */

// ---------------------------------------------------------------------------
// Layout & Panels
// ---------------------------------------------------------------------------

export {
  CollapsiblePanel,
  PanelToggleButton,
  type CollapsiblePanelProps,
} from './CollapsiblePanel';

// ---------------------------------------------------------------------------
// Navigation & Transitions
// ---------------------------------------------------------------------------

export {
  PageTransition,
  FadeIn,
  Stagger,
  type PageTransitionProps,
} from './PageTransition';

// ---------------------------------------------------------------------------
// Scroll & Containers
// ---------------------------------------------------------------------------

export {
  ScrollContainer,
  MomentumScroll,
  useStickyHeader,
  type ScrollContainerProps,
} from './ScrollEnhancements';

// ---------------------------------------------------------------------------
// Zoom & Pan
// ---------------------------------------------------------------------------

export {
  SmoothZoomProvider,
  ZoomContainer,
  ZoomControls,
  useSmoothZoom,
  useZoomKeyboard,
  type Transform,
  type ZoomBounds,
  type SmoothZoomProviderProps,
  type ZoomContainerProps,
  type ZoomControlsProps,
} from './SmoothZoom';

// ---------------------------------------------------------------------------
// Controls & Inputs
// ---------------------------------------------------------------------------

export {
  EnhancedKnob,
  EnhancedSlider,
  type EnhancedKnobProps,
  type EnhancedSliderProps,
} from './EnhancedKnob';

export {
  NumberInput,
  CoordinateInput,
  SizeInput,
  type NumberInputProps,
  type CoordinateInputProps,
  type SizeInputProps,
} from './NumberInput';

export {
  ColorPicker,
  useRecentColors,
  type ColorPickerProps,
  type HSLColor,
  type RGBColor,
} from './ColorPicker';

// ---------------------------------------------------------------------------
// Resizable Panels
// ---------------------------------------------------------------------------

export {
  ResizablePanel,
  useResizablePanel,
  type ResizablePanelProps,
  type ResizeDirection,
} from './ResizablePanel';

// ---------------------------------------------------------------------------
// Text Editing
// ---------------------------------------------------------------------------

export {
  RichTextInput,
  useFindReplace,
  type RichTextInputProps,
  type RichTextInputRef,
  type TextStats,
  type Selection,
  type FindReplaceState,
} from './RichTextInput';

// ---------------------------------------------------------------------------
// Help & Onboarding
// ---------------------------------------------------------------------------

export {
  HelpOverlay,
  HelpTooltip,
  useHelp,
} from './HelpOverlay';
