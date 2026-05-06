// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
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
export type { FieldProps } from './Field';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, BadgeSize } from './Badge';

export { TextInput, Textarea } from './TextInput';
export type { TextInputProps, TextareaProps, InputSize } from './TextInput';

// Re-export the existing pre-tokenized controls so consumers have a single
// import surface. These already use the design tokens internally.
export { DexToggle as Toggle, DexCheckbox as Checkbox, DexSlider as Slider } from '../shell/UIComponents';
