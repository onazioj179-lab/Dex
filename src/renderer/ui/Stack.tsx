// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX UI -- Stack (HStack / VStack)
// Flex container with token-driven gap, alignment helpers, and wrap.
// ===========================================================================
import React, { forwardRef } from 'react';
import { space } from '../styles/tokens';

export type StackGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
  inline?: boolean;
}

const GAP: Record<StackGap, number> = {
  none: 0,
  xs: space[1],
  sm: space[2],
  md: space[3],
  lg: space[4],
  xl: space[6],
};

const ALIGN: Record<StackAlign, React.CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY: Record<StackJustify, React.CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

export const Stack = forwardRef<HTMLDivElement, StackProps>(({
  direction = 'column',
  gap = 'md',
  align,
  justify,
  wrap = false,
  inline = false,
  style,
  ...rest
}, ref) => (
  <div
    ref={ref}
    style={{
      display: inline ? 'inline-flex' : 'flex',
      flexDirection: direction,
      gap: GAP[gap],
      alignItems: align ? ALIGN[align] : direction === 'row' ? 'center' : 'stretch',
      justifyContent: justify ? JUSTIFY[justify] : 'flex-start',
      flexWrap: wrap ? 'wrap' : 'nowrap',
      ...style,
    }}
    {...rest}
  />
));
Stack.displayName = 'Stack';

export const HStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>((props, ref) =>
  <Stack ref={ref} direction="row" {...props} />,
);
HStack.displayName = 'HStack';

export const VStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>((props, ref) =>
  <Stack ref={ref} direction="column" {...props} />,
);
VStack.displayName = 'VStack';

// Spacer fills remaining space inside a Stack.
export const Spacer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...rest }) => (
  <div style={{ flex: 1, ...style }} {...rest} />
);
