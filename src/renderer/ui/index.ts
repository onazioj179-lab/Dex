// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Public primitive surface
// One import path for every shared, tokenized control.
// New code should consume `from '../ui'` rather than reaching into shell/
// or components/ directly.
// ===========================================================================

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from './Button';

export { Card, CardHeader, CardBody, CardFooter } from './Card';
export type { CardProps, CardVariant, CardPadding } from './Card';

export { Stack, HStack, VStack, Spacer } from './Stack';
export type { StackProps, StackGap, StackAlign, StackJustify } from './Stack';

export { Field } from './Field';
export { WorkspacePanel } from './WorkspacePanel';
export type { FieldProps } from './Field';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, BadgeSize } from './Badge';

export { TextInput, Textarea } from './TextInput';
export type { TextInputProps, TextareaProps, InputSize } from './TextInput';

export { AppShell, Toolbar } from './AppShell';
export type { AppShellProps, ToolbarProps } from './AppShell';

export { Modal } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

// Sharp micro-controls -- precision inputs with full keyboard support.
export { RangeSlider } from './RangeSlider';
export type { RangeSliderProps } from './RangeSlider';

export { NumberStepper, clampStepper } from './NumberStepper';
export type { NumberStepperProps, NumberStepperSize } from './NumberStepper';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption, SegmentedSize } from './SegmentedControl';

// Pure, DOM-free value math shared by the micro-controls (also unit-tested).
export {
  clamp,
  snapToStep,
  valueToPercent,
  ratioToValue,
  roundToStepPrecision,
  stepDecimals,
} from './controlMath';

// Re-export the existing pre-tokenized controls so consumers have a single
// import surface. These already use the design tokens internally.
export { DexToggle as Toggle, DexCheckbox as Checkbox, DexSlider as Slider, DexRadioGroup as RadioGroup, DexTabs as Tabs } from '../shell/UIComponents';
export type { DexRadioOption as RadioOption, DexTab as TabItem } from '../shell/UIComponents';
