/**
 * DEX Grid Layout Component
 * Responsive grid and layout system
 */

import React from 'react';

// ==================== TYPES ====================

interface GridProps {
  children: React.ReactNode;
  columns?: number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
  gap?: number | string;
  rowGap?: number | string;
  columnGap?: number | string;
  alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justifyItems?: 'start' | 'center' | 'end' | 'stretch';
  style?: React.CSSProperties;
}

interface GridItemProps {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  colStart?: number;
  rowStart?: number;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  justifySelf?: 'start' | 'center' | 'end' | 'stretch';
  style?: React.CSSProperties;
}

interface StackProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  gap?: number | string;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  wrap?: boolean;
  divider?: React.ReactNode;
  style?: React.CSSProperties;
}

interface FlexProps {
  children: React.ReactNode;
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: number | string;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  style?: React.CSSProperties;
}

interface ContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | number;
  padding?: number | string;
  center?: boolean;
  style?: React.CSSProperties;
}

interface SpacerProps {
  size?: number | string;
  flex?: boolean;
}

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  thickness?: number;
  margin?: number | string;
  label?: string;
}

// ==================== GRID ====================

export const Grid: React.FC<GridProps> = ({
  children,
  columns = 12,
  gap = 16,
  rowGap,
  columnGap,
  alignItems = 'stretch',
  justifyItems = 'stretch',
  style,
}) => {
  const getGridTemplateColumns = (): string => {
    if (typeof columns === 'number') {
      return `repeat(${columns}, minmax(0, 1fr))`;
    }
    // For responsive columns, use the largest defined
    const maxCols = Math.max(
      columns.xl || 0,
      columns.lg || 0,
      columns.md || 0,
      columns.sm || 0,
      columns.xs || 12
    );
    return `repeat(${maxCols}, minmax(0, 1fr))`;
  };

  const styles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: getGridTemplateColumns(),
    gap: gap,
    rowGap: rowGap ?? gap,
    columnGap: columnGap ?? gap,
    alignItems,
    justifyItems,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== GRID ITEM ====================

export const GridItem: React.FC<GridItemProps> = ({
  children,
  colSpan = 1,
  rowSpan = 1,
  colStart,
  rowStart,
  alignSelf,
  justifySelf,
  style,
}) => {
  const styles: React.CSSProperties = {
    gridColumn: colStart ? `${colStart} / span ${colSpan}` : `span ${colSpan}`,
    gridRow: rowStart ? `${rowStart} / span ${rowSpan}` : `span ${rowSpan}`,
    alignSelf,
    justifySelf,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== STACK ====================

export const Stack: React.FC<StackProps> = ({
  children,
  direction = 'vertical',
  gap = 16,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  divider,
  style,
}) => {
  const alignMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };

  const justifyMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
    'space-evenly': 'space-evenly',
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    alignItems: alignMap[align] || align,
    justifyContent: justifyMap[justify] || justify,
    gap: divider ? 0 : gap,
    flexWrap: wrap ? 'wrap' : 'nowrap',
    ...style,
  };

  const childArray = React.Children.toArray(children).filter(Boolean);

  if (divider) {
    return (
      <div style={styles}>
        {childArray.map((child, index) => (
          <React.Fragment key={index}>
            {child}
            {index < childArray.length - 1 && (
              <div
                style={{
                  padding: direction === 'horizontal' ? `0 ${gap}px` : `${gap}px 0`,
                }}
              >
                {divider}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <div style={styles}>{children}</div>;
};

export const HStack: React.FC<Omit<StackProps, 'direction'>> = props => (
  <Stack {...props} direction="horizontal" />
);

export const VStack: React.FC<Omit<StackProps, 'direction'>> = props => (
  <Stack {...props} direction="vertical" />
);

// ==================== FLEX ====================

export const Flex: React.FC<FlexProps> = ({
  children,
  direction = 'row',
  wrap = 'nowrap',
  gap,
  alignItems = 'stretch',
  justifyContent = 'flex-start',
  style,
}) => {
  const styles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    flexWrap: wrap,
    gap,
    alignItems,
    justifyContent,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== FLEX ITEM ====================

interface FlexItemProps {
  children: React.ReactNode;
  flex?: string | number;
  grow?: number;
  shrink?: number;
  basis?: string | number;
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  order?: number;
  style?: React.CSSProperties;
}

export const FlexItem: React.FC<FlexItemProps> = ({
  children,
  flex,
  grow,
  shrink,
  basis,
  alignSelf,
  order,
  style,
}) => {
  const styles: React.CSSProperties = {
    flex,
    flexGrow: grow,
    flexShrink: shrink,
    flexBasis: basis,
    alignSelf,
    order,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== CONTAINER ====================

export const Container: React.FC<ContainerProps> = ({
  children,
  maxWidth = 'lg',
  padding = 16,
  center = true,
  style,
}) => {
  const maxWidthMap: Record<string, number> = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
    full: 999999,
  };

  const computedMaxWidth =
    typeof maxWidth === 'number' ? maxWidth : maxWidthMap[maxWidth] || 1024;

  const styles: React.CSSProperties = {
    width: '100%',
    maxWidth: computedMaxWidth,
    padding: typeof padding === 'number' ? `0 ${padding}px` : padding,
    margin: center ? '0 auto' : undefined,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== SPACER ====================

export const Spacer: React.FC<SpacerProps> = ({ size = 16, flex = false }) => {
  const styles: React.CSSProperties = flex
    ? { flex: 1 }
    : {
        width: typeof size === 'number' ? size : size,
        height: typeof size === 'number' ? size : size,
        flexShrink: 0,
      };

  return <div style={styles} />;
};

// ==================== DIVIDER ====================

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  variant = 'solid',
  color = 'var(--color-border)',
  thickness = 1,
  margin = 16,
  label,
}) => {
  const isHorizontal = orientation === 'horizontal';

  const lineStyle: React.CSSProperties = {
    flex: 1,
    height: isHorizontal ? thickness : '100%',
    width: isHorizontal ? '100%' : thickness,
    background: variant === 'solid' ? color : 'transparent',
    borderTop: isHorizontal && variant !== 'solid' ? `${thickness}px ${variant} ${color}` : 'none',
    borderLeft: !isHorizontal && variant !== 'solid' ? `${thickness}px ${variant} ${color}` : 'none',
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    margin: isHorizontal
      ? `${margin}px 0`
      : `0 ${margin}px`,
    height: isHorizontal ? 'auto' : '100%',
  };

  if (!label) {
    return <div style={lineStyle} />;
  }

  return (
    <div style={containerStyle}>
      <div style={lineStyle} />
      <span
        style={{
          padding: isHorizontal ? '0 12px' : '12px 0',
          fontSize: 12,
          color: 'var(--color-text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={lineStyle} />
    </div>
  );
};

// ==================== BOX ====================

interface BoxProps {
  children?: React.ReactNode;
  padding?: number | string;
  margin?: number | string;
  background?: string;
  border?: string;
  borderRadius?: number | string;
  shadow?: 'sm' | 'md' | 'lg' | 'xl' | 'none' | string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  display?: 'block' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'none';
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  style?: React.CSSProperties;
}

export const Box: React.FC<BoxProps> = ({
  children,
  padding,
  margin,
  background,
  border,
  borderRadius,
  shadow,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  overflow,
  display = 'block',
  position,
  style,
}) => {
  const shadowMap: Record<string, string> = {
    sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
    none: 'none',
  };

  const styles: React.CSSProperties = {
    padding,
    margin,
    background,
    border,
    borderRadius,
    boxShadow: shadow ? (shadowMap[shadow] || shadow) : undefined,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    overflow,
    display,
    position,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== CENTER ====================

interface CenterProps {
  children: React.ReactNode;
  inline?: boolean;
  style?: React.CSSProperties;
}

export const Center: React.FC<CenterProps> = ({ children, inline = false, style }) => {
  const styles: React.CSSProperties = {
    display: inline ? 'inline-flex' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== ASPECT RATIO ====================

interface AspectRatioProps {
  children: React.ReactNode;
  ratio: number;
  style?: React.CSSProperties;
}

export const AspectRatio: React.FC<AspectRatioProps> = ({ children, ratio, style }) => {
  const styles: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    paddingBottom: `${(1 / ratio) * 100}%`,
    ...style,
  };

  const innerStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };

  return (
    <div style={styles}>
      <div style={innerStyles}>{children}</div>
    </div>
  );
};

// ==================== WRAP ====================

interface WrapProps {
  children: React.ReactNode;
  spacing?: number | string;
  spacingX?: number | string;
  spacingY?: number | string;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  style?: React.CSSProperties;
}

export const Wrap: React.FC<WrapProps> = ({
  children,
  spacing = 8,
  spacingX,
  spacingY,
  align = 'flex-start',
  justify = 'flex-start',
  style,
}) => {
  const styles: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: align,
    justifyContent: justify,
    gap: `${spacingY ?? spacing}px ${spacingX ?? spacing}px`,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== SIMPLE GRID ====================

interface SimpleGridProps {
  children: React.ReactNode;
  columns: number;
  spacing?: number | string;
  spacingX?: number | string;
  spacingY?: number | string;
  minChildWidth?: number | string;
  style?: React.CSSProperties;
}

export const SimpleGrid: React.FC<SimpleGridProps> = ({
  children,
  columns,
  spacing = 16,
  spacingX,
  spacingY,
  minChildWidth,
  style,
}) => {
  const styles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: minChildWidth
      ? `repeat(auto-fit, minmax(${typeof minChildWidth === 'number' ? `${minChildWidth}px` : minChildWidth}, 1fr))`
      : `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${spacingY ?? spacing}px ${spacingX ?? spacing}px`,
    ...style,
  };

  return <div style={styles}>{children}</div>;
};

export default Grid;
